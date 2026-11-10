/**
 * Swimlane layout: one horizontal lane per team / role, steps placed in time
 * columns by flow rank (longest path, cycles broken), handoffs cross lanes.
 * Long processes wrap into 2–3 stacked bands (lanes repeated) to stay near
 * 16:9. Routing, QA, SVG and draw.io are the shared engine's.
 */
import type { DiagramEdge, DiagramNode } from "../types.js";
import { CARD_H, CARD_MAX_W, CARD_MIN_W, CARD_TEXT_X, FONTS, FOOTER_H, MARGIN, PANEL_PAD, TITLE_H, aspectPenalty, placeNode } from "./grid.js";
import { routeEdges } from "./router.js";
import { cardMetrics, type CardMetrics } from "./shapes.js";
import { measureText, wrapText } from "./text.js";
import type { ArchitectureLayoutInput, LayoutResult, PlacedNode, PlacedTier, Rect } from "./types.js";

const LANE_PAD_Y = 30;
const SUBROW_GAP = 30;
const COL_GAP = 76;
const CARD_PAD_L = 28;
const BAND_GAP = 64;
const HEADER_MIN = 150;

export interface SwimlaneExtras {
  /** forced time column per step id */
  columnOf?: Record<string, number>;
}

/** Longest-path rank per node over the flow graph (back edges ignored). */
export function flowRanks(nodes: DiagramNode[], edges: DiagramEdge[], forced: Record<string, number> = {}): Map<string, number> {
  const ids = nodes.map((n) => n.id);
  const succ = new Map<string, string[]>(ids.map((i) => [i, []]));
  for (const e of edges) if (succ.has(e.from) && succ.has(e.to) && e.from !== e.to) succ.get(e.from)!.push(e.to);
  const state = new Map<string, number>();
  const dag = new Map<string, string[]>(ids.map((i) => [i, []]));
  const indeg = new Map(ids.map((i) => [i, 0]));
  for (const vs of succ.values()) for (const v of vs) indeg.set(v, indeg.get(v)! + 1);
  const visit = (u: string) => {
    state.set(u, 1);
    for (const v of succ.get(u)!) {
      const s = state.get(v) ?? 0;
      if (s === 1) continue;
      dag.get(u)!.push(v);
      if (s === 0) visit(v);
    }
    state.set(u, 2);
  };
  for (const u of ids) if (indeg.get(u) === 0 && !state.has(u)) visit(u);
  for (const u of ids) if (!state.has(u)) visit(u);
  const order: string[] = [];
  const seen = new Set<string>();
  const topo = (u: string) => {
    if (seen.has(u)) return;
    seen.add(u);
    for (const v of dag.get(u)!) topo(v);
    order.unshift(u);
  };
  for (const u of ids) topo(u);
  const rank = new Map<string, number>(ids.map((i) => [i, forced[i] ?? 0]));
  for (const u of order) for (const v of dag.get(u)!) if (forced[v] == null) rank.set(v, Math.max(rank.get(v)!, rank.get(u)! + 1));
  return rank;
}

/**
 * Compact ranks: a handoff to another lane may stay in the same time column
 * (drawn as a vertical handoff) when the lanes in between are free there.
 */
export function compactRanks(nodes: DiagramNode[], edges: DiagramEdge[], laneOrder: string[], forced: Record<string, number> = {}): Map<string, number> {
  const strict = flowRanks(nodes, edges, forced);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const li = (id: string) => laneOrder.indexOf(byId.get(id)?.group ?? "");
  const order = [...nodes].sort((a, b) => strict.get(a.id)! - strict.get(b.id)! || li(a.id) - li(b.id));
  const preds = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) if (byId.has(e.from) && byId.has(e.to) && strict.get(e.from)! < strict.get(e.to)!) preds.get(e.to)!.push(e.from);
  const rank = new Map<string, number>();
  const occ = new Set<string>();
  for (const n of order) {
    let r = forced[n.id] ?? 0;
    for (const p of preds.get(n.id)!) if (rank.has(p)) r = Math.max(r, rank.get(p)! + (li(p) === li(n.id) ? 1 : 0));
    const blocked = (rr: number) => {
      if (occ.has(`${li(n.id)}|${rr}`)) return true;
      for (const p of preds.get(n.id)!) {
        if (rank.get(p) !== rr) continue;
        const [a, b] = [Math.min(li(p), li(n.id)), Math.max(li(p), li(n.id))];
        for (let l = a + 1; l < b; l++) if (occ.has(`${l}|${rr}`)) return true;
      }
      // a later vertical handoff would cut through this cell: keep cells under a same-column chain free
      return false;
    };
    while (blocked(r)) r++;
    rank.set(n.id, r);
    occ.add(`${li(n.id)}|${r}`);
  }
  return rank;
}

export function layoutSwimlane(input: ArchitectureLayoutInput & { swimlane?: SwimlaneExtras }): LayoutResult {
  const lanes = (input.groups ?? []).filter((g) => !g.parent);
  const nodes = input.nodes;
  const edges = input.edges ?? [];
  // card width shared across the diagram
  let textMax = 0;
  for (const n of nodes) textMax = Math.max(textMax, Math.min(measureText(n.label, FONTS.cardLabel), 200));
  const cardW = Math.round(Math.min(CARD_MAX_W - 20, Math.max(CARD_MIN_W, CARD_TEXT_X + textMax + 16)));
  const metrics = new Map<string, CardMetrics>(nodes.map((n) => [n.id, cardMetrics(n, { cardW, cardH: CARD_H, iconTextX: CARD_TEXT_X })]));
  const laneOrder = lanes.map((l) => l.id);
  const strictRank = flowRanks(nodes, edges, input.swimlane?.columnOf);
  const compact = compactRanks(nodes, edges, laneOrder, input.swimlane?.columnOf);
  const a = planFor(strictRank);
  const b = planFor(compact);
  // strict (one column per step) reads best; compact wins when it fixes the aspect
  const rank = a.score <= b.score + 0.15 ? strictRank : compact;
  return buildSwimlane(input, rank, metrics, cardW);

  function planFor(rk: Map<string, number>) {
    return measureSwimlane(input, rk, metrics, cardW).best;
  }
}

function measureSwimlane(input: ArchitectureLayoutInput, rank: Map<string, number>, metrics: Map<string, CardMetrics>, cardW: number) {
  const lanes = (input.groups ?? []).filter((g) => !g.parent);
  const nodes = input.nodes;
  const edges = input.edges ?? [];
  const R = Math.max(0, ...rank.values()) + 1;
  const laneIdx = new Map(lanes.map((l, i) => [l.id, i]));
  // sub-rows when several steps share (lane, column)
  const slot = new Map<string, number>();
  const used = new Map<string, number>();
  for (const n of [...nodes].sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)) {
    const k = `${n.group}|${rank.get(n.id)}`;
    const i = used.get(k) ?? 0;
    used.set(k, i + 1);
    slot.set(n.id, i);
  }
  const laneRows = lanes.map((l) => Math.max(1, ...nodes.filter((n) => n.group === l.id).map((n) => slot.get(n.id)! + 1)));
  const laneCardH = lanes.map((l) => Math.max(CARD_H, ...nodes.filter((n) => n.group === l.id).map((n) => metrics.get(n.id)!.h)));
  const laneH = lanes.map((_, i) => LANE_PAD_Y * 2 + laneRows[i] * laneCardH[i] + (laneRows[i] - 1) * SUBROW_GAP);
  // lane header width from the wrapped lane names
  const headFont = { font: "mono" as const, size: 14, weight: 700 };
  const headerLines = lanes.map((l) => wrapText(l.label, headFont, 150).slice(0, 2));
  const HW = Math.max(HEADER_MIN, ...headerLines.flat().map((t) => measureText(t, headFont) + 36), ...lanes.map((l) => (l.tag ? measureText(l.tag, FONTS.cardSub) + 32 : 0)));
  // gutters wide enough for labelled flows between adjacent columns
  const gap = new Array(Math.max(1, R)).fill(COL_GAP);
  for (const e of edges) {
    if (!e.label) continue;
    const a = rank.get(e.from);
    const b = rank.get(e.to);
    if (a == null || b == null || Math.abs(a - b) !== 1) continue;
    gap[Math.min(a, b)] = Math.max(gap[Math.min(a, b)], Math.ceil(measureText(e.label, FONTS.edgeLabel) + 18 + 56));
  }
  const lanesH = laneH.reduce((s, h) => s + h, 0);
  const bandW = (from: number, to: number) => {
    let w = HW + CARD_PAD_L;
    for (let r = from; r < to; r++) w += cardW + (r < to - 1 ? gap[r] : 0);
    return w + CARD_PAD_L;
  };
  const legendH = 30;
  const chromeH = MARGIN + TITLE_H + PANEL_PAD * 2 + 18 + legendH + 18 + FOOTER_H - 12 + MARGIN / 2;
  const titleW = Math.max(input.title ? measureText(input.title, FONTS.title) + 40 : 0, input.subtitle ? measureText(input.subtitle, FONTS.subtitle) + 40 : 0);
  let best: { b: number; k: number; score: number } | null = null;
  for (let b = 1; b <= Math.min(4, R); b++) {
    const k = Math.ceil(R / b);
    if ((b - 1) * k >= R) continue;
    let w = 0;
    for (let s = 0; s < R; s += k) w = Math.max(w, bandW(s, Math.min(R, s + k)));
    const W = Math.max(w + PANEL_PAD * 2, titleW) + MARGIN * 2;
    const H = chromeH + b * lanesH + (b - 1) * BAND_GAP;
    const score = aspectPenalty(W / H) * 4 + (b - 1) * 0.6 + Math.max(0, W - 3400) / 1500;
    if (!best || score < best.score) best = { b, k, score };
  }
  return { best: best!, R, HW, gap, laneH, laneCardH, lanesH, slot, headerLines, bandW, legendH, titleW };
}

function buildSwimlane(input: ArchitectureLayoutInput, rank: Map<string, number>, metrics: Map<string, CardMetrics>, cardW: number): LayoutResult {
  const lanes = (input.groups ?? []).filter((g) => !g.parent);
  const nodes = input.nodes;
  const edges = input.edges ?? [];
  const M = measureSwimlane(input, rank, metrics, cardW);
  const { best, R, HW, gap, laneCardH, slot, headerLines, bandW, legendH, titleW } = M;
  let { laneH, lanesH } = M;
  const { b: bands, k } = best;
  let innerW = 0;
  for (let s = 0; s < R; s += k) innerW = Math.max(innerW, bandW(s, Math.min(R, s + k)));
  const contentW = Math.max(innerW + PANEL_PAD * 2, titleW);
  {
    // too wide a poster → taller lanes (cards stay centred in their lane)
    const chromeH = MARGIN + TITLE_H + PANEL_PAD * 2 + 18 + legendH + 18 + FOOTER_H - 12 + MARGIN / 2;
    const W = contentW + MARGIN * 2;
    const H = chromeH + bands * lanesH + (bands - 1) * BAND_GAP;
    if (W / H > 2.2) {
      const per = Math.min(90, Math.ceil((W / 2.1 - H) / (bands * laneH.length)));
      laneH = laneH.map((h) => h + per);
      lanesH = laneH.reduce((a, h) => a + h, 0);
    }
  }
  const contentH = PANEL_PAD * 2 + bands * lanesH + (bands - 1) * BAND_GAP;
  const content: Rect = { x: MARGIN, y: MARGIN + TITLE_H, w: contentW, h: contentH };
  const x0 = content.x + PANEL_PAD + (contentW - PANEL_PAD * 2 - innerW) / 2;

  const tiers: PlacedTier[] = [];
  const placed: PlacedNode[] = [];
  for (let band = 0; band < bands; band++) {
    const from = band * k;
    const to = Math.min(R, from + k);
    const colX: number[] = [];
    let cx = x0 + HW + CARD_PAD_L;
    for (let r = from; r < to; r++) {
      colX[r] = cx;
      cx += cardW + gap[r];
    }
    let y = content.y + PANEL_PAD + band * (lanesH + BAND_GAP);
    lanes.forEach((l, li) => {
      const tid = bands > 1 ? `${l.id}~${band + 1}` : l.id;
      const rect: Rect = { x: Math.round(x0), y: Math.round(y), w: Math.round(innerW), h: laneH[li] };
      const header: Rect = { x: rect.x, y: rect.y, w: HW, h: rect.h };
      const members = nodes.filter((n) => n.group === l.id && rank.get(n.id)! >= from && rank.get(n.id)! < to);
      const t: PlacedTier & { headerLines?: string[] } = {
        id: tid,
        label: l.label,
        index: String(li + 1).padStart(2, "0"),
        rect,
        labelRect: header,
        depth: 0,
        kind: "lane",
        external: false,
        hidden: false,
        accentRole: "gateway",
        nodeIds: members.map((n) => n.id),
        tag: l.tag,
        laneHeader: header,
        headerLines: headerLines[li],
      };
      tiers.push(t);
      for (const n of members) {
        const m = metrics.get(n.id)!;
        const s = slot.get(n.id)!;
        const rowTop = y + LANE_PAD_Y + (laneH[li] - M.laneH[li]) / 2 + s * (laneCardH[li] + SUBROW_GAP);
        const r = rank.get(n.id)!;
        const rr: Rect = { x: Math.round(colX[r] + (cardW - m.w) / 2), y: Math.round(rowTop + (laneCardH[li] - m.h) / 2), w: m.w, h: m.h };
        placed.push(placeNode(n, rr, tid, m));
      }
      y += laneH[li];
    });
  }
  const routed = routeEdges({ nodes: placed, tiers, edges, area: content });
  const legendRect: Rect = { x: content.x, y: content.y + content.h + 18, w: content.w, h: legendH };
  const footerY = legendRect.y + legendRect.h + 18;
  const width = Math.round(content.x + content.w + MARGIN);
  const height = Math.round(footerY + FOOTER_H - 12 + MARGIN / 2);
  return {
    width,
    height,
    title: input.title,
    subtitle: input.subtitle,
    nodes: placed,
    tiers,
    edges: routed.edges,
    junctions: routed.junctions,
    anchors: [],
    steps: [],
    stepCards: [],
    stepsPosition: "none",
    legend: input.legend ?? [],
    legendRect,
    content,
    sidebar: { x: 0, y: 0, w: 0, h: 0 },
    titleRect: { x: MARGIN, y: MARGIN, w: width - MARGIN * 2, h: TITLE_H },
    footerY,
    routeNotes: routed.notes,
    plan: { rows: [[lanes.map((l) => l.id)]], variant: bands, spacing: 1, score: best.score },
    view: input.view,
    profile: input.profile,
  };
}
