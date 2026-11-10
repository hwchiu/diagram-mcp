/**
 * Authorization matrix: roles × (resource → action) grid with allow / deny /
 * conditional cells, footnoted conditions panel. Candidates: roles as rows or
 * transposed, wide matrices split into stacked column chunks — whichever lands
 * nearest 16:9.
 */
import { aspectPenalty } from "./grid.js";
import { measureText, wrapText, ellipsize } from "./text.js";
import { archTheme, type ArchTheme } from "./theme.js";
import { frameScene, sceneChromeH, SCENE_CHROME_W, type Scene, type SItem } from "./scene.js";
import type { DiagramProfile, LegendItem } from "./types.js";

export type Effect = "allow" | "deny" | "conditional" | "none";
export interface AuthzInput {
  title?: string;
  subtitle?: string;
  theme?: string;
  roles: Array<{ id: string; label: string; description?: string }>;
  resources: Array<{ id: string; label: string; actions: string[] }>;
  /** effect + condition footnote per role / resource / action */
  cell: (role: string, resource: string, action: string) => { effect: Effect; note?: number; implicit?: boolean };
  conditions: string[];
  orientation?: "auto" | "roles-rows" | "roles-columns";
}

const CELL_H = 38;
const LEAF_F = { font: "mono" as const, size: 12, weight: 500 };
const GROUP_F = { font: "mono" as const, size: 12, weight: 700 };
const ROW_F = { font: "mono" as const, size: 13, weight: 600 };
const SUB_F = { font: "mono" as const, size: 12 };
const NOTE_F = { font: "sans" as const, size: 12 };
const PALETTE: Array<keyof ArchTheme["roles"]> = ["client", "gateway", "data", "queue", "compute", "observability", "network", "storage"];

interface Axis {
  groups?: Array<{ label: string; span: number; color: string }>;
  leaves: Array<{ label: string; sub?: string; key: string }>;
}

function effColor(t: ArchTheme, e: Effect) {
  return e === "allow" ? t.roles.compute : e === "deny" ? t.alert : e === "conditional" ? t.badgeFill : t.muted;
}

/** One matrix block: row axis × column axis. */
function block(t: ArchTheme, rows: Axis, cols: Axis, cell: (r: number, c: number) => { effect: Effect; note?: number; implicit?: boolean }, colRange: [number, number], gid: string): { items: SItem[]; w: number; h: number } {
  const items: SItem[] = [];
  const c0 = colRange[0];
  const c1 = colRange[1];
  // column widths
  const cw: number[] = [];
  for (let c = c0; c < c1; c++) cw.push(Math.max(62, measureText(cols.leaves[c].label, LEAF_F) + 22));
  if (cols.groups) {
    let at = 0;
    for (const g of cols.groups) {
      const s = Math.max(at, c0);
      const e = Math.min(at + g.span, c1);
      if (s < e) {
        const need = measureText(g.label, GROUP_F) + 24;
        let have = 0;
        for (let c = s; c < e; c++) have += cw[c - c0];
        if (have < need) for (let c = s; c < e; c++) cw[c - c0] += (need - have) / (e - s);
      }
      at += g.span;
    }
  }
  // row header widths
  const leafW = Math.min(260, Math.max(110, ...rows.leaves.map((l) => Math.max(measureText(l.label, ROW_F), l.sub ? measureText(l.sub, SUB_F) : 0) + 28)));
  const groupW = rows.groups ? Math.min(220, Math.max(...rows.groups.map((g) => measureText(g.label, GROUP_F) + 28))) : 0;
  const rhW = Math.round(leafW + groupW);
  const headH = cols.groups ? 64 : 38;
  const rowH = (r: number) => (rows.leaves[r].sub ? 46 : CELL_H);
  const W = Math.round(rhW + cw.reduce((a, b) => a + b, 0));
  let H = headH;
  for (let r = 0; r < rows.leaves.length; r++) H += rowH(r);
  // frame
  items.push({ kind: "rect", x: 0, y: 0, w: W, h: H, rx: 8, fill: { color: t.cardBase }, stroke: { color: t.muted, alpha: 0.35 }, sw: 1 });
  items.push({ kind: "rect", x: 0, y: 0, w: W, h: headH, rx: 8, fill: { color: t.muted, alpha: 0.08 } });
  // column headers
  let x = rhW;
  if (cols.groups) {
    let at = 0;
    for (const g of cols.groups) {
      const s = Math.max(at, c0);
      const e = Math.min(at + g.span, c1);
      if (s < e) {
        let gw = 0;
        for (let c = s; c < e; c++) gw += cw[c - c0];
        const gx = x;
        items.push({ kind: "rect", x: gx + 3, y: 4, w: gw - 6, h: 26, rx: 5, fill: { color: g.color, alpha: 0.16 }, stroke: { color: g.color, alpha: 0.55 } });
        items.push({ kind: "text", x: gx + gw / 2, y: 21.5, text: ellipsize(g.label, GROUP_F, gw - 16).text, size: 12, weight: 700, color: g.color, anchor: "middle", maxW: gw - 12 });
        x += gw;
      }
      at += g.span;
    }
  }
  x = rhW;
  for (let c = c0; c < c1; c++) {
    const w = cw[c - c0];
    items.push({ kind: "text", x: x + w / 2, y: headH - 13, text: cols.leaves[c].label, size: 12, weight: 500, color: t.muted, anchor: "middle", maxW: w - 8 });
    x += w;
  }
  // row headers + cells
  let y = headH;
  let gi = 0;
  let gLeft = rows.groups ? rows.groups[0].span : 0;
  let gStart = y;
  for (let r = 0; r < rows.leaves.length; r++) {
    const h = rowH(r);
    if (r % 2 === 1) items.push({ kind: "rect", x: groupW, y, w: W - groupW, h, fill: { color: t.muted, alpha: 0.045 } });
    items.push({ kind: "line", points: [{ x: rows.groups && gLeft !== rows.groups[gi].span ? groupW : 0, y }, { x: W, y }], color: t.muted, sw: 1, opacity: 0.22 });
    const l = rows.leaves[r];
    if (l.sub) {
      items.push({ kind: "text", x: groupW + 14, y: y + 20, text: ellipsize(l.label, ROW_F, leafW - 22).text, size: 13, weight: 600, color: t.ink, maxW: leafW - 18 });
      items.push({ kind: "text", x: groupW + 14, y: y + 36, text: ellipsize(l.sub, SUB_F, leafW - 22).text, size: 12, color: t.dim, maxW: leafW - 18 });
    } else items.push({ kind: "text", x: groupW + 14, y: y + h / 2 + 4.5, text: ellipsize(l.label, ROW_F, leafW - 22).text, size: 13, weight: 600, color: t.ink, maxW: leafW - 18 });
    let cx = rhW;
    for (let c = c0; c < c1; c++) {
      const w = cw[c - c0];
      const v = cell(r, c);
      const col = effColor(t, v.effect);
      const mx = cx + w / 2;
      const my = y + h / 2;
      if (v.effect === "none") {
        items.push({ kind: "line", points: [{ x: mx - 5, y: my }, { x: mx + 5, y: my }], color: t.muted, sw: 1.4, opacity: 0.6 });
      } else {
        const bw = Math.min(w - 10, 46);
        const n0 = items.length;
        items.push({ kind: "rect", id: `${gid}-c${r}-${c}`, x: mx - bw / 2, y: y + 5, w: bw, h: h - 10, rx: 5, fill: { color: col, alpha: 0.15 }, stroke: { color: col, alpha: 0.5 } });
        const gx = v.note ? mx - 7 : mx;
        if (v.effect === "allow") items.push({ kind: "line", points: [{ x: gx - 5.5, y: my }, { x: gx - 1.5, y: my + 4 }, { x: gx + 6, y: my - 4.5 }], color: col, sw: 2.2 });
        else if (v.effect === "deny") {
          items.push({ kind: "line", points: [{ x: gx - 4.5, y: my - 4.5 }, { x: gx + 4.5, y: my + 4.5 }], color: col, sw: 2.2 });
          items.push({ kind: "line", points: [{ x: gx + 4.5, y: my - 4.5 }, { x: gx - 4.5, y: my + 4.5 }], color: col, sw: 2.2 });
        } else {
          items.push({ kind: "circle", cx: gx, cy: my, r: 5.5, stroke: { color: col }, sw: 1.7 });
          const half = Array.from({ length: 9 }, (_, k) => ({ x: gx + 5.5 * Math.sin((Math.PI * k) / 8), y: my - 5.5 * Math.cos((Math.PI * k) / 8) }));
          items.push({ kind: "poly", points: half, fill: { color: col } });
        }
        if (v.implicit) for (let k = n0; k < items.length; k++) items[k] = { ...items[k], opacity: 0.38 };
        if (v.note) items.push({ kind: "text", x: mx + 9, y: my + 4.5, text: String(v.note), size: 12, weight: 700, color: col, anchor: "middle" });
      }
      cx += w;
    }
    y += h;
    if (rows.groups) {
      gLeft--;
      if (gLeft === 0) {
        const g = rows.groups[gi];
        items.push({ kind: "rect", x: 4, y: gStart + 3, w: groupW - 8, h: y - gStart - 6, rx: 5, fill: { color: g.color, alpha: 0.13 }, stroke: { color: g.color, alpha: 0.5 } });
        const lines = wrapText(g.label, GROUP_F, groupW - 20).slice(0, Math.max(1, Math.floor((y - gStart - 8) / 16)));
        lines.forEach((ln, k) => items.push({ kind: "text", x: groupW / 2, y: (gStart + y) / 2 + 4.5 + (k - (lines.length - 1) / 2) * 16, text: ln, size: 12, weight: 700, color: g.color, anchor: "middle", maxW: groupW - 12 }));
        gi++;
        gStart = y;
        gLeft = rows.groups[gi]?.span ?? 0;
      }
    }
  }
  // grid separators
  x = rhW;
  items.push({ kind: "line", points: [{ x: rhW, y: 0 }, { x: rhW, y: H }], color: t.muted, sw: 1, opacity: 0.35 });
  if (cols.groups) {
    let at = 0;
    for (const g of cols.groups) {
      const s = Math.max(at, c0);
      const e = Math.min(at + g.span, c1);
      for (let c = s; c < e; c++) x += cw[c - c0];
      if (s < e && e < c1) items.push({ kind: "line", points: [{ x, y: 4 }, { x, y: H }], color: t.muted, sw: 1, opacity: 0.3 });
      at += g.span;
    }
  }
  return { items, w: W, h: H };
}

function conditionsPanel(t: ArchTheme, conds: string[], total: number, ncol = 1): { items: SItem[]; w: number; h: number } {
  const items: SItem[] = [];
  items.push({ kind: "text", x: 0, y: 12, text: "CONDITIONS", size: 11, weight: 600, color: t.dim, tracking: 0.16 });
  const per = Math.ceil(conds.length / ncol);
  const colW = (total - (ncol - 1) * 32) / ncol;
  let maxY = 28;
  for (let cI = 0; cI < ncol; cI++) {
    const sub = conditionsColumn(t, conds.slice(cI * per, (cI + 1) * per), colW, cI * per);
    items.push(...sub.items.map((it) => shiftXY(it, cI * (colW + 32), 28)));
    maxY = Math.max(maxY, 28 + sub.h);
  }
  return { items, w: total, h: maxY };
}

function conditionsColumn(t: ArchTheme, conds: string[], width: number, base: number): { items: SItem[]; h: number } {
  const items: SItem[] = [];
  let y = 0;
  conds.forEach((c, j) => {
    const i = base + j;
    const lines = wrapText(c, NOTE_F, width - 34).slice(0, 4);
    items.push({ kind: "circle", cx: 10, cy: y + 9, r: 10, fill: { color: t.badgeFill, alpha: 0.18 }, stroke: { color: t.badgeFill } });
    items.push({ kind: "text", x: 10, y: y + 13.2, text: String(i + 1), size: 12, weight: 700, color: t.badgeFill, anchor: "middle", solid: false });
    lines.forEach((ln, k) => items.push({ kind: "text", x: 30, y: y + 13.5 + k * 17, text: ln, size: 12, font: "sans", color: t.ink, maxW: width - 30 }));
    y += Math.max(26, lines.length * 17 + 10);
  });
  return { items, h: y };
}

export function layoutAuthz(input: AuthzInput, profile: DiagramProfile, legend: LegendItem[]): Scene {
  const t = archTheme(input.theme);
  const resCols: Axis = {
    groups: input.resources.map((r, i) => ({ label: r.label, span: r.actions.length, color: t.roles[PALETTE[i % PALETTE.length]] })),
    leaves: input.resources.flatMap((r) => r.actions.map((a) => ({ label: a, key: `${r.id}\u0000${a}` }))),
  };
  const roleAxis: Axis = { leaves: input.roles.map((r) => ({ label: r.label, sub: r.description, key: r.id })) };
  const keyOf = (k: string) => k.split("\u0000") as [string, string];
  const chromeH = sceneChromeH(1);
  type Cand = { score: number; build: () => { items: SItem[]; w: number; h: number } };
  const cands: Cand[] = [];
  const condW = 340;
  const assemble = (blocks: Array<{ items: SItem[]; w: number; h: number }>, side: "right" | "below" | "none", gap = 30) => {
    const items: SItem[] = [];
    let y = 0;
    let w = 0;
    for (const b of blocks) {
      items.push(...b.items.map((it) => shiftY(it, y)));
      y += b.h + gap;
      w = Math.max(w, b.w);
    }
    let h = y - gap;
    if (side !== "none") {
      const pw = condW;
      const p = side === "right" ? conditionsPanel(t, input.conditions, pw) : conditionsPanel(t, input.conditions, Math.max(w, 400), input.conditions.length > 3 && w > 900 ? (w > 1500 && input.conditions.length > 6 ? 3 : 2) : 1);
      if (side === "right") {
        items.push(...p.items.map((it) => shiftXY(it, w + 40, 0)));
        w += 40 + pw;
        h = Math.max(h, p.h);
      } else {
        items.push(...p.items.map((it) => shiftXY(it, 0, h + 28)));
        h += 28 + p.h;
      }
    }
    return { items, w, h };
  };
  const orient = input.orientation ?? "auto";
  const sides: Array<"right" | "below" | "none"> = input.conditions.length ? ["right", "below"] : ["none"];
  const nCols = resCols.leaves.length;
  // roles as rows, columns chunked at resource boundaries
  if (orient !== "roles-columns")
    for (let k = 1; k <= 3; k++) {
      const chunks = chunkGroups(resCols.groups!.map((g) => g.span), k);
      if (!chunks) continue;
      for (const side of sides) {
        const build = () => assemble(chunks.map(([a, b], i) => block(t, roleAxis, resCols, (r, c) => input.cell(roleAxis.leaves[r].key, ...keyOf(resCols.leaves[c].key)), [a, b], `b${i}`)), side);
        const m = build();
        const W = m.w + SCENE_CHROME_W;
        const H = m.h + chromeH;
        cands.push({ score: aspectPenalty(W / H) * 4 + (k - 1) * 0.6 + Math.max(0, W - 2600) / 1200, build: () => m });
      }
    }
  if (orient !== "roles-rows") {
    // transposed: resources (grouped) × actions as rows, roles as columns
    const rowsAxis: Axis = { groups: resCols.groups, leaves: resCols.leaves };
    const colsAxis: Axis = { leaves: input.roles.map((r) => ({ label: r.label, key: r.id })) };
    for (const side of sides) {
      const build = () => assemble([block(t, rowsAxis, colsAxis, (r, c) => input.cell(colsAxis.leaves[c].key, ...keyOf(rowsAxis.leaves[r].key)), [0, colsAxis.leaves.length], "t")], side);
      const m = build();
      const W = m.w + SCENE_CHROME_W;
      const H = m.h + chromeH;
      cands.push({ score: aspectPenalty(W / H) * 4 + 0.35 + Math.max(0, W - 2600) / 1200 + (nCols < 8 ? 0.5 : 0), build: () => m });
    }
  }
  cands.sort((a, b) => a.score - b.score);
  const best = cands[0].build();
  return frameScene({
    title: input.title,
    subtitle: input.subtitle,
    meta: `${input.roles.length} ROLES · ${input.resources.length} RESOURCES · ${nCols} PERMISSIONS`,
    profile,
    legend,
    innerW: best.w,
    innerH: best.h,
    items: best.items,
  });
}

/** Split group spans into k contiguous chunks of similar leaf count. */
function chunkGroups(spans: number[], k: number): Array<[number, number]> | null {
  if (k === 1) return [[0, spans.reduce((a, b) => a + b, 0)]];
  if (spans.length < k) return null;
  const total = spans.reduce((a, b) => a + b, 0);
  if (total < k * 4) return null;
  const out: Array<[number, number]> = [];
  let start = 0;
  let acc = 0;
  let gi = 0;
  for (let c = 1; c < k; c++) {
    const target = (total * c) / k;
    while (gi < spans.length && acc + spans[gi] / 2 < target) acc += spans[gi++];
    if (acc <= start) return null;
    out.push([start, acc]);
    start = acc;
  }
  out.push([start, total]);
  return out.every(([a, b]) => b > a) ? out : null;
}

function shiftY(it: SItem, dy: number): SItem {
  return shiftXY(it, 0, dy);
}
function shiftXY(it: SItem, dx: number, dy: number): SItem {
  switch (it.kind) {
    case "rect":
    case "text":
    case "icon":
      return { ...it, x: it.x + dx, y: it.y + dy };
    case "circle":
      return { ...it, cx: it.cx + dx, cy: it.cy + dy };
    default:
      return { ...it, points: it.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  }
}
