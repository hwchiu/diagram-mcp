/**
 * Sequence diagram layout: participants across the top, lifelines, numbered
 * sync / async / return messages, auto activations, alt / opt / loop / par
 * fragments with sections, notes and dividers. Long conversations wrap into
 * 2–3 side-by-side panels (participant headers repeated) to stay near 16:9.
 */
import type { MonoIcon } from "./icons.js";
import { aspectPenalty } from "./grid.js";
import { measureText, wrapText, ellipsize } from "./text.js";
import { archTheme, type ArchTheme } from "./theme.js";
import { frameScene, sceneCard, sceneChromeH, SCENE_CHROME_W, type Scene, type SItem } from "./scene.js";
import type { DiagramProfile, LegendItem } from "./types.js";

export interface SeqParticipant {
  id: string;
  label: string;
  type?: "actor" | "service" | "database" | "queue" | "external" | "browser" | "gateway" | "security" | "job";
  description?: string;
}
export interface SeqItem {
  type?: "message" | "note" | "divider";
  id?: string;
  from?: string;
  to?: string;
  label?: string;
  kind?: "sync" | "async" | "return" | "error";
  text?: string;
  over?: string[];
  position?: "over" | "left" | "right";
}
export interface SeqFragment {
  kind: "alt" | "opt" | "loop" | "par" | "critical" | "break" | "group";
  label?: string;
  start: string | number;
  end: string | number;
  sections?: Array<{ start: string | number; label?: string }>;
}
export interface SequenceInput {
  title?: string;
  subtitle?: string;
  theme?: string;
  participants: SeqParticipant[];
  items: SeqItem[];
  fragments?: SeqFragment[];
  autonumber?: boolean;
  activations?: "auto" | "none";
  /** force panel count (1–3) */
  panels?: number;
}

const PT: Record<string, { role: keyof ArchTheme["roles"]; icon: MonoIcon; noun: string }> = {
  actor: { role: "client", icon: "user", noun: "Actor" },
  service: { role: "compute", icon: "server", noun: "Service" },
  database: { role: "data", icon: "database", noun: "Database" },
  queue: { role: "queue", icon: "stream", noun: "Queue" },
  external: { role: "external", icon: "globe", noun: "External" },
  browser: { role: "client", icon: "browser", noun: "Client" },
  gateway: { role: "gateway", icon: "gateway", noun: "Gateway" },
  security: { role: "security", icon: "key", noun: "Identity" },
  job: { role: "observability", icon: "clock", noun: "Job" },
};

const HEAD_H = 58;
const LABEL_F = { font: "mono" as const, size: 12, weight: 500 };
const NOTE_F = { font: "sans" as const, size: 12 };
const PANEL_GAP = 64;
const BAR = 12;

interface Row {
  kind: "msg" | "self" | "note" | "divider" | "open" | "section" | "close";
  /** top y in global row space */
  y: number;
  h: number;
  item?: SeqItem;
  index?: number;
  frag?: number;
  section?: { label?: string };
  depth: number;
}

export function layoutSequence(input: SequenceInput, profile: DiagramProfile, legend: LegendItem[]): Scene {
  const t = archTheme(input.theme);
  const P = input.participants;
  const pIdx = new Map(P.map((p, i) => [p.id, i]));
  const items = input.items;
  const numbered = input.autonumber !== false;
  // ── header widths
  const pw = P.map((p) => {
    const lw = measureText(p.label, { font: "mono", size: 14, weight: 600 });
    const sw = measureText(p.description ?? PT[p.type ?? "service"].noun, { font: "mono", size: 12 });
    return Math.round(Math.min(250, Math.max(140, Math.max(lw, sw) + 68)));
  });
  // ── fragment index resolution
  const idOf = new Map<string, number>();
  items.forEach((it, i) => it.id && idOf.set(it.id, i));
  const at = (v: string | number, what: string) => {
    if (typeof v === "number") {
      if (v < 1 || v > items.length) throw new Error(`create_sequence_diagram: fragment ${what} ${v} is out of range (1…${items.length})`);
      return v - 1;
    }
    if (!idOf.has(v)) throw new Error(`create_sequence_diagram: fragment ${what} "${v}" does not match any item id`);
    return idOf.get(v)!;
  };
  const frags = (input.fragments ?? []).map((f) => ({ ...f, s: at(f.start, "start"), e: at(f.end, "end"), secs: (f.sections ?? []).map((x) => ({ at: at(x.start, "section start"), label: x.label })) }));
  for (const f of frags) if (f.e < f.s) throw new Error(`create_sequence_diagram: fragment "${f.label ?? f.kind}" ends before it starts`);
  const depthAt = (i: number) => frags.filter((f) => f.s <= i && i <= f.e).length;
  // ── column constraints
  const n = P.length;
  const gap: number[] = new Array(Math.max(0, n - 1)).fill(0).map((_, i) => (pw[i] + pw[i + 1]) / 2 + 40);
  let rightExtra = 0;
  let leftExtra = 0;
  const cons: Array<{ a: number; b: number; d: number }> = [];
  const msgLabel = (it: SeqItem, k: number) => (it.label ?? "") + (numbered ? "" : "");
  let num = 0;
  const numOf = new Map<number, number>();
  items.forEach((it, i) => {
    if ((it.type ?? "message") === "message") numOf.set(i, ++num);
  });
  items.forEach((it, i) => {
    const type = it.type ?? "message";
    if (type === "message") {
      const a = pIdx.get(it.from!)!;
      const b = pIdx.get(it.to!)!;
      const lw = measureText(msgLabel(it, i), LABEL_F) + (numbered ? 26 : 0);
      if (a === b) {
        if (a < n - 1) cons.push({ a, b: a + 1, d: 46 + lw + 24 });
        else rightExtra = Math.max(rightExtra, 46 + lw + 20 - pw[a] / 2);
      } else cons.push({ a: Math.min(a, b), b: Math.max(a, b), d: lw + 56 });
    } else if (type === "note") {
      const over = (it.over ?? []).map((x) => pIdx.get(x)!).sort((x, y) => x - y);
      const nw = Math.min(260, measureText(it.text ?? "", NOTE_F) + 28);
      const a = over[0];
      const b = over[over.length - 1];
      const pos = it.position ?? "over";
      if (pos === "right") {
        if (a < n - 1) cons.push({ a, b: a + 1, d: nw + 40 });
        else rightExtra = Math.max(rightExtra, nw + 24 - pw[a] / 2);
      } else if (pos === "left") {
        if (a > 0) cons.push({ a: a - 1, b: a, d: nw + 40 });
        else leftExtra = Math.max(leftExtra, nw + 24 - pw[a] / 2);
      } else if (a === b) {
        if (a > 0) cons.push({ a: a - 1, b: a, d: nw / 2 + 50 });
        if (a < n - 1) cons.push({ a, b: a + 1, d: nw / 2 + 50 });
      }
    }
  });
  cons.sort((p, q) => p.b - p.a - (q.b - q.a));
  for (const c of cons) {
    let cur = 0;
    for (let k = c.a; k < c.b; k++) cur += gap[k];
    if (cur < c.d) {
      const add = (c.d - cur) / (c.b - c.a);
      for (let k = c.a; k < c.b; k++) gap[k] += add;
    }
  }
  // fragments need side room for their tab + nesting
  const maxDepth = Math.max(0, ...items.map((_, i) => depthAt(i)));
  const side = 24 + maxDepth * 12;
  leftExtra = Math.max(leftExtra, side - pw[0] / 2 + 8);
  rightExtra = Math.max(rightExtra, side - pw[n - 1] / 2 + 8);
  let xs: number[] = [];
  const place = (stretch: number) => {
    const out: number[] = [];
    let x = Math.max(0, leftExtra) + pw[0] / 2;
    for (let i = 0; i < n; i++) {
      out.push(Math.round(x));
      if (i < n - 1) x += gap[i] * stretch;
    }
    return { xs: out, w: Math.round(out[n - 1] + pw[n - 1] / 2 + Math.max(0, rightExtra)) };
  };
  xs = place(1).xs;
  let panelW = place(1).w;
  const baseW = panelW;
  const gapSum = gap.reduce((a, b) => a + b, 0);

  // ── rows
  const rows: Row[] = [];
  let y = 0;
  const fragTop = new Map<number, number>();
  const fragBottom = new Map<number, number>();
  const noteLines = (it: SeqItem, w: number) => wrapText(it.text ?? "", NOTE_F, w - 20).slice(0, 6);
  items.forEach((it, i) => {
    // opens: outermost first
    const opens = frags.map((f, k) => ({ f, k })).filter(({ f }) => f.s === i).sort((a, b) => b.f.e - a.f.e);
    for (const { k } of opens) {
      rows.push({ kind: "open", y, h: 36, frag: k, depth: depthAt(i) });
      fragTop.set(k, y);
      y += 36;
    }
    for (const [k, f] of frags.entries())
      for (const sct of f.secs)
        if (sct.at === i && sct.at !== f.s) {
          rows.push({ kind: "section", y, h: 30, frag: k, section: { label: sct.label }, depth: depthAt(i) });
          y += 30;
        }
    const type = it.type ?? "message";
    if (type === "message") {
      const self = it.from === it.to;
      const h = self ? 62 : 42;
      rows.push({ kind: self ? "self" : "msg", y, h, item: it, index: i, depth: depthAt(i) });
      y += h;
    } else if (type === "note") {
      const over = (it.over ?? []).map((v) => pIdx.get(v)!).sort((a, b) => a - b);
      const span = it.position === "over" || !it.position ? xs[over[over.length - 1]] - xs[over[0]] : 0;
      const w = Math.max(Math.min(260, measureText(it.text ?? "", NOTE_F) + 28), span + 60);
      const h = noteLines(it, w).length * 16 + 18;
      rows.push({ kind: "note", y, h: h + 14, item: it, index: i, depth: depthAt(i) });
      y += h + 14;
    } else {
      rows.push({ kind: "divider", y, h: 40, item: it, index: i, depth: depthAt(i) });
      y += 40;
    }
    const closes = frags.map((f, k) => ({ f, k })).filter(({ f }) => f.e === i).sort((a, b) => b.f.s - a.f.s);
    for (const { k } of closes) {
      rows.push({ kind: "close", y, h: 16, frag: k, depth: depthAt(i) });
      fragBottom.set(k, y + 6);
      y += 16;
    }
  });
  const totalH = y;

  // ── panels: break between top-level items
  const legal: number[] = [];
  rows.forEach((r, k) => {
    if (k === 0) return;
    const prev = rows[k - 1];
    const idx = r.index ?? -1;
    if (r.kind === "open" || r.kind === "msg" || r.kind === "self" || r.kind === "note" || r.kind === "divider") {
      const i = r.index ?? frags[r.frag!]?.s ?? -1;
      const inside = frags.some((f) => f.s < i && i <= f.e) || (r.kind !== "open" && frags.some((f) => f.s <= i && i <= f.e && f.s !== i));
      if (!inside && prev.kind !== "open" && prev.kind !== "section") legal.push(k);
      void idx;
    }
  });
  const chromeH = sceneChromeH(2);
  const panelHead = HEAD_H + 26;
  const pick = (k: number): number[] => {
    if (k === 1) return [0];
    const cuts = [0];
    for (let c = 1; c < k; c++) {
      const target = (totalH * c) / k;
      let best = -1;
      let bd = Infinity;
      for (const l of legal) {
        if (l <= cuts[cuts.length - 1]) continue;
        const d = Math.abs(rows[l].y - target);
        if (d < bd) ((bd = d), (best = l));
      }
      if (best < 0) return [];
      cuts.push(best);
    }
    return cuts;
  };
  let bestK = 1;
  let bestCuts = [0];
  let bestScore = Infinity;
  let bestStretch = 1;
  for (let k = 1; k <= 3; k++) {
    if (input.panels && input.panels !== k) continue;
    const cuts = pick(k);
    if (!cuts.length) continue;
    let maxH = 0;
    for (let c = 0; c < cuts.length; c++) {
      const a = rows[cuts[c]].y;
      const b = c + 1 < cuts.length ? rows[cuts[c + 1]].y : totalH;
      maxH = Math.max(maxH, b - a);
    }
    const H = chromeH + panelHead + maxH + 20;
    // widen the columns (up to 1.5×) when the panel would be too tall
    let stretch = 1;
    const want = (1.36 * H - SCENE_CHROME_W - (k - 1) * PANEL_GAP) / k;
    if (want > baseW && gapSum > 0) stretch = Math.min(1.5, 1 + (want - baseW) / gapSum);
    const pwK = baseW + gapSum * (stretch - 1);
    const W = k * pwK + (k - 1) * PANEL_GAP + SCENE_CHROME_W;
    const score = aspectPenalty(W / H) * 4 + (k - 1) * 0.5 + Math.max(0, W - 2800) / 1500;
    if (score < bestScore) ((bestScore = score), (bestK = k), (bestCuts = cuts), (bestStretch = stretch));
  }
  if (input.panels && bestScore === Infinity) {
    bestK = 1;
    bestCuts = [0];
  }

  {
    const p = place(bestStretch);
    xs = p.xs;
    panelW = p.w;
  }
  const noteGeom = (it: SeqItem) => {
    const over = (it.over ?? []).map((v) => pIdx.get(v)!).sort((a, b) => a - b);
    const pos = it.position ?? "over";
    const span = pos === "over" ? xs[over[over.length - 1]] - xs[over[0]] : 0;
    const w = Math.max(Math.min(260, measureText(it.text ?? "", NOTE_F) + 28), span + 60);
    const cx = pos === "over" ? (xs[over[0]] + xs[over[over.length - 1]]) / 2 : pos === "right" ? xs[over[0]] + 14 + w / 2 : xs[over[0]] - 14 - w / 2;
    return { x: cx - w / 2, w };
  };
  // ── emit
  const out: SItem[] = [];
  const ranges = bestCuts.map((c, i) => ({ from: c, to: i + 1 < bestCuts.length ? bestCuts[i + 1] : rows.length }));
  let innerH = 0;
  const color = (k?: string) => (k === "async" ? t.edges.async : k === "return" ? t.muted : k === "error" ? t.edges.auth : t.edges.sync);
  // activation state over the whole conversation (global y)
  type Act = { p: number; y0: number; y1?: number; depth: number; implicit: boolean };
  const acts: Act[] = [];
  const stack = new Map<number, Act[]>();
  const st = (p: number) => stack.get(p) ?? stack.set(p, []).get(p)!;
  const edgeX = (p: number, toward: number) => {
    const s = st(p);
    if (!s.length) return xs[p];
    const d = s.length - 1;
    return xs[p] + d * 5 + (toward >= xs[p] ? BAR / 2 : -BAR / 2);
  };
  interface Msg {
    row: Row;
    x1: number;
    x2: number;
    yy: number;
    self?: { x0: number; x1: number; y0: number; y1: number };
  }
  const msgs: Msg[] = [];
  const auto = input.activations !== "none";
  for (const r of rows) {
    if (r.kind !== "msg" && r.kind !== "self") continue;
    const it = r.item!;
    const a = pIdx.get(it.from!)!;
    const b = pIdx.get(it.to!)!;
    const yy = r.y + 28;
    const kind = it.kind ?? "sync";
    if (r.kind === "self") {
      const y0 = r.y + 26;
      const y1 = y0 + 20;
      const sx = edgeX(a, xs[a] + 1);
      if (auto && kind === "sync") {
        const act: Act = { p: a, y0: y1 - 4, y1: y1 + 12, depth: st(a).length, implicit: false };
        acts.push(act);
      }
      const ex = xs[a] + (st(a).length ? (st(a).length - 1) * 5 + BAR / 2 : 0) + (auto && kind === "sync" ? 5 : 0);
      msgs.push({ row: r, x1: sx, x2: ex, yy: y0, self: { x0: sx, x1: xs[a] + 40 + st(a).length * 5, y0, y1 } });
      continue;
    }
    if (auto && kind === "sync") {
      if (!st(a).length) {
        const act: Act = { p: a, y0: yy - 8, depth: 0, implicit: true };
        st(a).push(act);
        acts.push(act);
      }
      const x1 = edgeX(a, xs[b]);
      const act: Act = { p: b, y0: yy, depth: st(b).length, implicit: false };
      st(b).push(act);
      acts.push(act);
      msgs.push({ row: r, x1, x2: edgeX(b, xs[a]), yy });
    } else if (auto && kind === "return") {
      const x1 = edgeX(a, xs[b]);
      const sa = st(a);
      if (sa.length && !sa[sa.length - 1].implicit) sa.pop()!.y1 = yy;
      const x2 = edgeX(b, xs[a]);
      msgs.push({ row: r, x1, x2, yy });
      const sb = st(b);
      if (sb.length === 1 && sb[0].implicit) {
        // caller done once nothing it called is still running
        const busy = [...stack.values()].some((s) => s.some((q) => !q.implicit));
        if (!busy) sb.pop()!.y1 = yy + 8;
      }
    } else {
      msgs.push({ row: r, x1: edgeX(a, xs[b]), x2: edgeX(b, xs[a]), yy });
    }
  }
  for (const s of stack.values()) for (const q of s) if (q.y1 == null) q.y1 = totalH - 6;

  ranges.forEach((rg, pi) => {
    const ox = pi * (panelW + PANEL_GAP);
    const ya = rows[rg.from].y;
    const yb = rg.to < rows.length ? rows[rg.to].y : totalH;
    const oy = panelHead - ya; // global → panel y
    const bottom = panelHead + (yb - ya) + 18;
    innerH = Math.max(innerH, bottom);
    // headers + lifelines
    P.forEach((p, i) => {
      const meta = PT[p.type ?? "service"];
      const c = t.roles[meta.role];
      const w = pw[i];
      const cx = ox + xs[i];
      out.push({ kind: "line", points: [{ x: cx, y: HEAD_H }, { x: cx, y: bottom }], color: c, sw: 1.1, dash: "5 5", opacity: 0.55 });
      out.push(...sceneCard({ id: `p-${p.id}-${pi}`, x: cx - w / 2, y: 0, w, h: HEAD_H, color: c, t, icon: meta.icon, label: ellipsize(p.label, { font: "mono", size: 14, weight: 600 }, w - 60).text, sub: ellipsize(p.description ?? meta.noun, { font: "mono", size: 12 }, w - 60).text, group: `p-${p.id}-${pi}` }));
    });
    // activations
    for (const a of acts) {
      const y0 = Math.max(a.y0, ya);
      const y1 = Math.min(a.y1!, yb);
      if (y1 - y0 < 4) continue;
      const c = t.roles[PT[P[a.p].type ?? "service"].role];
      out.push({ kind: "rect", x: ox + xs[a.p] - BAR / 2 + a.depth * 5, y: y0 + oy, w: BAR, h: y1 - y0, rx: 2, fill: { color: t.cardBase }, stroke: { color: c, alpha: 0.9 }, sw: 1.1 });
      out.push({ kind: "rect", x: ox + xs[a.p] - BAR / 2 + a.depth * 5, y: y0 + oy, w: BAR, h: y1 - y0, rx: 2, fill: { color: c, alpha: 0.28 } });
    }
    // fragments
    frags.forEach((f, k) => {
      if (f.s < (rows[rg.from].index ?? frags[rows[rg.from].frag!]?.s ?? 0)) return;
      const top = fragTop.get(k)!;
      if (top < ya || top >= yb) return;
      const inner = items.slice(f.s, f.e + 1);
      const ps = new Set<number>();
      let right = -Infinity;
      let leftN = Infinity;
      for (const it of inner) {
        for (const v of [it.from, it.to, ...(it.over ?? [])]) if (v && pIdx.has(v)) ps.add(pIdx.get(v)!);
        if (it.type === "note") {
          const g = noteGeom(it);
          right = Math.max(right, g.x + g.w + 10);
          leftN = Math.min(leftN, g.x - 10);
        }
        if ((it.type ?? "message") === "message" && it.from === it.to) right = Math.max(right, xs[pIdx.get(it.from!)!] + 46 + measureText(it.label ?? "", LABEL_F) + (numbered ? 26 : 0) + 10);
      }
      const d = frags.filter((g) => g.s <= f.s && g.e >= f.e && g !== f).length;
      const inset = (maxDepth - d) * 12;
      const lo = Math.min(leftN, Math.min(...[...ps].map((p) => xs[p])) - 24 - inset - 6);
      const hi = Math.max(right, Math.max(...[...ps].map((p) => xs[p])) + 24 + inset + 6);
      const tab = `${f.kind}`;
      const tabW = measureText(tab, { font: "mono", size: 12, weight: 700 }) + 22;
      const cond = f.label ? `[${f.label}]` : "";
      const condW = measureText(cond, { font: "mono", size: 12 });
      const L = Math.min(lo, ox + 0);
      void L;
      const fx = ox + lo;
      const fw = Math.max(hi - lo, tabW + condW + 40);
      const fy = top + oy + 4;
      const fh = fragBottom.get(k)! - top - 4;
      const fc = f.kind === "loop" ? t.edges.async : f.kind === "alt" || f.kind === "opt" ? t.badgeFill : f.kind === "critical" || f.kind === "break" ? t.alert : t.edges.data;
      out.push({ kind: "rect", x: fx, y: fy, w: fw, h: fh, rx: 6, fill: { color: fc, alpha: 0.035 }, stroke: { color: fc, alpha: 0.7 }, sw: 1.1 });
      out.push({ kind: "poly", points: [{ x: fx, y: fy + 6 }, { x: fx, y: fy + 20 }, { x: fx + tabW - 6, y: fy + 20 }, { x: fx + tabW, y: fy + 14 }, { x: fx + tabW, y: fy }, { x: fx + 6, y: fy }], fill: { color: fc, alpha: 0.22 }, stroke: { color: fc, alpha: 0.8 }, sw: 1, drawio: "tab" });
      out.push({ kind: "text", x: fx + tabW / 2, y: fy + 14.5, text: tab, size: 12, weight: 700, color: fc, anchor: "middle", group: `frag${k}` });
      if (cond) out.push({ kind: "text", x: fx + tabW + 10, y: fy + 15, text: cond, size: 12, color: t.ink, group: `frag${k}` });
      for (const r of rows) {
        if (r.kind !== "section" || r.frag !== k) continue;
        const sy = r.y + oy + 6;
        out.push({ kind: "line", points: [{ x: fx, y: sy }, { x: fx + fw, y: sy }], color: fc, sw: 1, dash: "6 4", opacity: 0.8 });
        if (r.section?.label) out.push({ kind: "text", x: fx + 12, y: sy + 17, text: `[${r.section.label}]`, size: 12, color: t.ink });
      }
    });
    // rows
    for (let ri = rg.from; ri < rg.to; ri++) {
      const r = rows[ri];
      if (r.kind === "note") {
        const it = r.item!;
        const g = noteGeom(it);
        const w = g.w;
        const lines = noteLines(it, w);
        const h = lines.length * 16 + 18;
        const nx = ox + g.x;
        const ny = r.y + oy + 4;
        const nc = t.badgeFill;
        out.push({ kind: "poly", points: [{ x: nx, y: ny }, { x: nx + w - 10, y: ny }, { x: nx + w, y: ny + 10 }, { x: nx + w, y: ny + h }, { x: nx, y: ny + h }], fill: { color: t.cardBase }, drawio: "note" });
        out.push({ kind: "poly", id: `note${ri}`, points: [{ x: nx, y: ny }, { x: nx + w - 10, y: ny }, { x: nx + w, y: ny + 10 }, { x: nx + w, y: ny + h }, { x: nx, y: ny + h }], fill: { color: nc, alpha: 0.1 }, stroke: { color: nc, alpha: 0.75 }, sw: 1.1, drawio: "note", card: true });
        lines.forEach((l, k) => out.push({ kind: "text", x: nx + 12, y: ny + 22 + k * 16, text: l, size: 12, font: "sans", color: t.id === "dark" ? "#fde68a" : "#92400e", maxW: w - 20 }));
      } else if (r.kind === "divider") {
        const yy = r.y + oy + 20;
        const lab = r.item!.label ?? r.item!.text ?? "";
        out.push({ kind: "line", points: [{ x: ox + 0, y: yy }, { x: ox + panelW, y: yy }], color: t.muted, sw: 1, dash: "2 4", opacity: 0.8 });
        if (lab) {
          const lw = measureText(lab, { font: "mono", size: 12, weight: 600 }) + 24;
          out.push({ kind: "rect", x: ox + panelW / 2 - lw / 2, y: yy - 11, w: lw, h: 22, rx: 11, fill: { color: t.pillFill }, stroke: { color: t.muted, alpha: 0.7 } });
          out.push({ kind: "text", x: ox + panelW / 2, y: yy + 4.2, text: lab, size: 12, weight: 600, color: t.ink, anchor: "middle" });
        }
      }
    }
    for (const m of msgs) {
      const ri = rows.indexOf(m.row);
      if (ri < rg.from || ri >= rg.to) continue;
      const it = m.row.item!;
      const kind = it.kind ?? "sync";
      const c = color(kind);
      const dash = kind === "return" ? "6 4" : kind === "error" ? "2 4" : undefined;
      const endMark = kind === "sync" || kind === "error" ? "arrow" : "open";
      const nb = numOf.get(m.row.index!)!;
      const lab = it.label ?? "";
      const lw = measureText(lab, LABEL_F);
      const g = `m${ri}`;
      if (m.self) {
        const s = m.self;
        out.push({ kind: "line", id: g, points: [{ x: ox + s.x0, y: s.y0 + oy }, { x: ox + s.x1, y: s.y0 + oy }, { x: ox + s.x1, y: s.y1 + oy }, { x: ox + m.x2, y: s.y1 + oy }], color: c, sw: 1.5, dash, end: endMark, radius: 4 });
        let lx = ox + s.x0 + 8;
        const ly = m.row.y + oy + 16;
        if (numbered) {
          out.push({ kind: "circle", cx: lx + 9, cy: ly - 4, r: 9, fill: { color: t.badgeFill }, stroke: { color: t.canvas }, sw: 1.5 });
          out.push({ kind: "text", x: lx + 9, y: ly, text: String(nb), size: nb > 9 ? 10 : 11, weight: 700, color: t.badgeInk, anchor: "middle", group: g, solid: false });
          lx += 24;
        }
        out.push({ kind: "rect", x: lx - 4, y: ly - 13, w: lw + 8, h: 18, rx: 4, fill: { color: t.canvas, alpha: 0.82 } });
        out.push({ kind: "text", x: lx, y: ly, text: lab, size: 12, weight: 500, color: t.ink, group: g });
        continue;
      }
      const yy = m.yy + oy;
      out.push({ kind: "line", id: g, points: [{ x: ox + m.x1, y: yy }, { x: ox + m.x2, y: yy }], color: c, sw: kind === "return" ? 1.3 : 1.6, dash, end: endMark, glow: kind !== "return" });
      const mid = ox + (m.x1 + m.x2) / 2;
      const total = lw + (numbered ? 24 : 0);
      let lx = mid - total / 2;
      const ly = yy - 9;
      if (numbered) {
        out.push({ kind: "circle", cx: lx + 9, cy: ly - 4, r: 9, fill: { color: t.badgeFill }, stroke: { color: t.canvas }, sw: 1.5 });
        out.push({ kind: "text", x: lx + 9, y: ly, text: String(nb), size: nb > 9 ? 10 : 11, weight: 700, color: t.badgeInk, anchor: "middle", group: g, solid: false });
        lx += 24;
      }
      if (lab) {
        out.push({ kind: "rect", x: lx - 4, y: ly - 13, w: lw + 8, h: 17, rx: 4, fill: { color: t.canvas, alpha: 0.82 } });
        out.push({ kind: "text", x: lx, y: ly, text: lab, size: 12, weight: 500, color: kind === "return" ? t.muted : t.ink, group: g, maxW: Math.abs(m.x2 - m.x1) - (numbered ? 24 : 0) - 8 });
      }
    }
    if (pi > 0) {
      const sx = ox - PANEL_GAP / 2;
      out.push({ kind: "line", points: [{ x: sx, y: 6 }, { x: sx, y: bottom }], color: t.muted, sw: 1, dash: "3 5", opacity: 0.6 });
      out.push({ kind: "text", x: sx, y: HEAD_H + 18, text: "CONT.", size: 10, weight: 600, color: t.dim, anchor: "middle", tracking: 0.1 });
    }
  });
  const innerW = bestK * panelW + (bestK - 1) * PANEL_GAP;
  const nMsg = items.filter((i) => (i.type ?? "message") === "message").length;
  return frameScene({
    title: input.title,
    subtitle: input.subtitle,
    meta: `${P.length} PARTICIPANTS · ${nMsg} MESSAGES${bestK > 1 ? ` · ${bestK} PANELS` : ""}`,
    profile,
    legend,
    innerW,
    innerH,
    items: out,
  });
}
