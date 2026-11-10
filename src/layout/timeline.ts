/**
 * Timeline: horizontal axis with eras as bands, event cards alternating above
 * and below on stacked levels so labels never overlap (and stems never pass
 * through another card), snaking into 2–3 rows for long histories.
 */
import { aspectPenalty } from "./grid.js";
import { measureText, wrapBalanced } from "./text.js";
import { archTheme, type ArchTheme } from "./theme.js";
import { frameScene, sceneChromeH, SCENE_CHROME_W, type Scene, type SItem } from "./scene.js";
import type { DiagramProfile, LegendItem } from "./types.js";
import type { NodeRole } from "../design/themes.js";

export interface TlEvent {
  day: number;
  dateLabel: string;
  label: string;
  description?: string;
  role?: NodeRole;
  milestone?: boolean;
}
export interface TlEra {
  start: number;
  end: number;
  label: string;
  role?: NodeRole;
}
export interface TimelineInput {
  title?: string;
  subtitle?: string;
  theme?: string;
  events: TlEvent[];
  eras: TlEra[];
  scale?: "time" | "even";
  /** force row count */
  rows?: number;
}

const DAY = 86400000;
const BAND = 26;
const STEM = 26;
const LGAP = 12;
const TITLE_F = { font: "mono" as const, size: 13, weight: 700 };
const DATE_F = { font: "mono" as const, size: 12, weight: 600 };
const DESC_F = { font: "sans" as const, size: 12 };
const ERA_PALETTE: NodeRole[] = ["gateway", "compute", "data", "queue", "client", "observability"];

interface Card {
  ev: TlEvent;
  w: number;
  h: number;
  lines: string[];
}
interface Placed {
  card: Card;
  ex: number;
  x: number;
  side: 0 | 1;
  level: number;
}

function cardOf(ev: TlEvent): Card {
  const lw = Math.max(measureText(ev.label, TITLE_F), measureText(ev.dateLabel, DATE_F));
  const dw = ev.description ? measureText(ev.description, DESC_F) : 0;
  const w = Math.round(Math.min(230, Math.max(130, lw + 24, Math.min(dw, 200) + 24)));
  const titleLines = wrapBalanced(ev.label, TITLE_F, w - 24).slice(0, 2);
  const lines = ev.description ? wrapBalanced(ev.description, DESC_F, w - 24).slice(0, 3) : [];
  const h = 30 + titleLines.length * 17 + lines.length * 16 + (lines.length ? 6 : 0) + 6;
  return { ev, w, h, lines: [...titleLines.map((l) => "\u0001" + l), ...lines] };
}

interface RowPlan {
  a: number;
  b: number;
  placed: Placed[];
  levels: [number, number];
  slot: [number, number];
  blocked: number;
  h: number;
}

function planRow(cards: Card[], L: number, scale: "time" | "even"): RowPlan {
  const pad = Math.max(...cards.map((c) => c.w)) / 2 + 8;
  let a = Math.min(...cards.map((c) => c.ev.day));
  let b = Math.max(...cards.map((c) => c.ev.day));
  if (b === a) ((a -= 30), (b += 30));
  const X = (c: Card, i: number) => (scale === "even" ? (cards.length === 1 ? L / 2 : pad + (i * (L - 2 * pad)) / (cards.length - 1)) : pad + ((c.ev.day - a) / (b - a)) * (L - 2 * pad));
  const placed: Placed[] = [];
  let blocked = 0;
  const bySide: [Placed[], Placed[]] = [[], []];
  cards.forEach((c, i) => {
    const ex = X(c, i);
    const x = Math.max(0, Math.min(L - c.w, ex - c.w / 2));
    const tryside = (side: 0 | 1) => {
      const ps = bySide[side];
      for (let lv = 0; lv < 8; lv++) {
        const clash = ps.some((p) => p.level === lv && x < p.x + p.card.w + LGAP && p.x < x + c.w + LGAP);
        if (clash) continue;
        const block = ps.some((p) => p.level < lv && ex > p.x - 4 && ex < p.x + p.card.w + 4) || ps.some((p) => p.level > lv && p.ex > x - 4 && p.ex < x + c.w + 4);
        return { lv, block };
      }
      return { lv: 8, block: true };
    };
    const pref = (i % 2) as 0 | 1;
    const r0 = tryside(pref);
    const r1 = tryside((1 - pref) as 0 | 1);
    const cost = (r: { lv: number; block: boolean }, p: boolean) => (r.block ? 100 : 0) + r.lv * 3 + (p ? 0 : 1);
    const side = cost(r0, true) <= cost(r1, false) ? pref : ((1 - pref) as 0 | 1);
    const r = side === pref ? r0 : r1;
    if (r.block) blocked++;
    const p: Placed = { card: c, ex, x, side, level: r.lv };
    placed.push(p);
    bySide[side].push(p);
  });
  const levels: [number, number] = [0, 1].map((s) => (bySide[s].length ? Math.max(...bySide[s].map((p) => p.level)) + 1 : 0)) as [number, number];
  const slot: [number, number] = [0, 1].map((s) => (bySide[s].length ? Math.max(...bySide[s].map((p) => p.card.h)) : 0)) as [number, number];
  const sideH = (s: 0 | 1) => (levels[s] ? STEM + levels[s] * slot[s] + (levels[s] - 1) * LGAP : 0);
  const h = sideH(0) + BAND + sideH(1);
  return { a, b, placed, levels, slot, blocked, h };
}

export function layoutTimeline(input: TimelineInput, profile: DiagramProfile, legend: LegendItem[]): Scene {
  const t = archTheme(input.theme);
  const evs = [...input.events].sort((p, q) => p.day - q.day);
  const cards = evs.map(cardOf);
  const scale = input.scale ?? "time";
  const chromeH = sceneChromeH(1);
  let best: { score: number; L: number; rows: RowPlan[]; chunks: Card[][] } | null = null;
  const maxK = input.rows ?? Math.min(3, Math.max(1, Math.ceil(cards.length / 5)));
  for (let k = input.rows ?? 1; k <= maxK; k++) {
    const per = Math.ceil(cards.length / k);
    const chunks = Array.from({ length: k }, (_, i) => cards.slice(i * per, (i + 1) * per)).filter((c) => c.length);
    for (let L = 900; L <= 2700; L += 150) {
      const rows = chunks.map((c) => planRow(c, L, scale));
      const H = rows.reduce((s, r) => s + r.h, 0) + (rows.length - 1) * 30 + chromeH;
      const W = L + SCENE_CHROME_W;
      const lv = Math.max(...rows.flatMap((r) => r.levels));
      const score = aspectPenalty(W / H) * 4 + rows.reduce((s, r) => s + r.blocked, 0) * 6 + Math.max(0, lv - 2) * 1.2 + (chunks.length - 1) * 0.8 + L / 5000;
      if (!best || score < best.score) best = { score, L, rows, chunks };
    }
  }
  const { L, rows } = best!;
  const items: SItem[] = [];
  let y = 0;
  const eraColor = (e: TlEra, i: number) => t.roles[e.role ?? ERA_PALETTE[i % ERA_PALETTE.length]];
  rows.forEach((r, ri) => {
    const pad = Math.max(...best!.chunks[ri].map((c) => c.w)) / 2 + 8;
    const X = (d: number) => pad + ((d - r.a) / (r.b - r.a)) * (L - 2 * pad);
    const sideH = (s: 0 | 1) => (r.levels[s] ? STEM + r.levels[s] * r.slot[s] + (r.levels[s] - 1) * LGAP : 0);
    const axisY = y + sideH(0);
    // band + eras
    items.push({ kind: "rect", x: 0, y: axisY, w: L, h: BAND, rx: BAND / 2, fill: { color: t.muted, alpha: 0.08 }, stroke: { color: t.muted, alpha: 0.35 } });
    if (scale === "time")
      input.eras.forEach((e, i) => {
        const x1 = Math.max(4, X(e.start));
        const x2 = Math.min(L - 4, X(e.end));
        if (x2 - x1 < 6 || e.end < r.a || e.start > r.b) return;
        const c = eraColor(e, i);
        items.push({ kind: "rect", x: x1, y: axisY + 3, w: x2 - x1, h: BAND - 6, rx: (BAND - 6) / 2, fill: { color: c, alpha: 0.2 }, stroke: { color: c, alpha: 0.6 } });
      });
    // ticks (time scale): years or months under the band
    if (scale === "time") {
      const span = r.b - r.a;
      const y0 = new Date(r.a * DAY).getUTCFullYear();
      const y1 = new Date(r.b * DAY).getUTCFullYear();
      const marks: Array<{ d: number; l: string }> = [];
      if (span > 900) for (let yy = y0; yy <= y1 + 1; yy++) marks.push({ d: Date.UTC(yy, 0, 1) / DAY, l: String(yy) });
      else for (let yy = y0; yy <= y1; yy++) for (let m = 0; m < 12; m += span > 300 ? 3 : 1) marks.push({ d: Date.UTC(yy, m, 1) / DAY, l: m === 0 ? String(yy) : `${yy % 100 < 10 ? "0" : ""}${yy % 100}/${m + 1}` });
      const evX = r.placed.filter((p) => p.side === 1).map((p) => p.ex);
      const taken: Array<[number, number]> = [];
      const free = (a: number, b: number) => a >= 2 && b <= L - 2 && !taken.some(([p, q]) => a < q + 10 && p < b + 10) && !evX.some((e) => e > a - 6 && e < b + 6);
      // era names first: widest free stretch inside the era, under the band
      input.eras.forEach((e, i) => {
        const x1 = Math.max(4, X(e.start));
        const x2 = Math.min(L - 4, X(e.end));
        if (x2 - x1 < 6 || e.end < r.a || e.start > r.b) return;
        const lw = measureText(e.label, { font: "mono", size: 12, weight: 700 });
        const stops = [x1 + 4, ...evX.filter((x) => x > x1 && x < x2).sort((p, q) => p - q).flatMap((x) => [x - 8, x + 8]), x2 - 4];
        let best: number | null = null;
        for (let k = 0; k + 1 < stops.length; k += 2) if (stops[k + 1] - stops[k] >= lw + 4 && free(stops[k], stops[k] + lw)) { best = stops[k]; break; }
        if (best == null) return;
        taken.push([best, best + lw]);
        items.push({ kind: "text", x: best, y: axisY + BAND + 16, text: e.label, size: 12, weight: 700, color: eraColor(e, i), solid: false });
      });
      for (const mk of marks) {
        if (mk.d < r.a || mk.d > r.b) continue;
        const x = X(mk.d);
        const w = measureText(mk.l, { font: "mono", size: 12 });
        if (!free(x - w / 2, x + w / 2)) continue;
        items.push({ kind: "line", points: [{ x, y: axisY + BAND - 6 }, { x, y: axisY + BAND + 3 }], color: t.muted, sw: 1, opacity: 0.7 });
        items.push({ kind: "text", x, y: axisY + BAND + 16, text: mk.l, size: 12, color: t.dim, anchor: "middle", solid: false });
        taken.push([x - w / 2, x + w / 2]);
      }
    }
    // events
    for (const p of r.placed) {
      const c = t.roles[p.card.ev.role ?? "client"];
      const cy = axisY + BAND / 2;
      const top = p.side === 0 ? axisY - STEM - p.level * (r.slot[0] + LGAP) - p.card.h : axisY + BAND + STEM + p.level * (r.slot[1] + LGAP);
      const stemEnd = p.side === 0 ? top + p.card.h : top;
      items.push({ kind: "line", points: [{ x: p.ex, y: cy }, { x: p.ex, y: stemEnd }], color: c, sw: 1.2, opacity: 0.75 });
      items.push({ kind: "circle", cx: p.ex, cy, r: p.card.ev.milestone ? 8 : 6, fill: { color: p.card.ev.milestone ? c : t.cardBase }, stroke: { color: c }, sw: 2 });
      // card
      items.push({ kind: "rect", x: p.x, y: top, w: p.card.w, h: p.card.h, rx: 8, fill: { color: t.cardBase } });
      items.push({ kind: "rect", id: `ev${ri}-${r.placed.indexOf(p)}`, x: p.x, y: top, w: p.card.w, h: p.card.h, rx: 8, fill: { color: c, alpha: p.card.ev.milestone ? 0.16 : t.fillAlpha }, stroke: { color: c, alpha: p.card.ev.milestone ? 1 : 0.8 }, sw: p.card.ev.milestone ? 1.8 : 1.2, glow: !!p.card.ev.milestone, card: true });
      items.push({ kind: "rect", x: p.x, y: top + 8, w: 3, h: p.card.h - 16, rx: 1.5, fill: { color: c } });
      const g = `ev${ri}-${r.placed.indexOf(p)}`;
      items.push({ kind: "text", x: p.x + 14, y: top + 21, text: p.card.ev.dateLabel, size: 12, weight: 600, color: c, group: g, maxW: p.card.w - 24 });
      let ly = top + 21 + 19;
      for (const l of p.card.lines) {
        if (l.startsWith("\u0001")) {
          items.push({ kind: "text", x: p.x + 14, y: ly, text: l.slice(1), size: 13, weight: 700, color: t.ink, group: g, maxW: p.card.w - 22 });
          ly += 17;
        } else {
          if (!p.card.lines.some((q, k) => k < p.card.lines.indexOf(l) && !q.startsWith("\u0001"))) ly += 4;
          items.push({ kind: "text", x: p.x + 14, y: ly, text: l, size: 12, font: "sans", color: t.muted, group: g, maxW: p.card.w - 22 });
          ly += 16;
        }
      }
    }
    // row continuation arrow
    if (ri < rows.length - 1) items.push({ kind: "text", x: L - 6, y: axisY + BAND + 16, text: "→", size: 12, color: t.dim, anchor: "end", solid: false });
    y += r.h + 30;
  });
  const innerH = y - 30;
  const first = evs[0];
  const last = evs[evs.length - 1];
  return frameScene({
    title: input.title,
    subtitle: input.subtitle,
    meta: `${evs.length} EVENTS${input.eras.length ? ` · ${input.eras.length} ERAS` : ""} · ${first.dateLabel} → ${last.dateLabel}`,
    profile,
    legend,
    innerW: L,
    innerH,
    items,
  });
}
