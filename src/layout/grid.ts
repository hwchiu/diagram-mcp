/**
 * Deterministic architecture layout: nested tier containers on a column grid,
 * uniform cards, docked walkthrough panel. Routing lives in ./router.ts.
 */
import type { NodeRole } from "../design/themes.js";
import type { DiagramGroup, DiagramNode, EdgeKind } from "../types.js";
import { resolveMonoIcon } from "./icons.js";
import { ellipsize, measureText, wrapText, type FontSpec } from "./text.js";
import { routeEdges } from "./router.js";
import type {
  ArchitectureLayoutInput,
  LayoutResult,
  LegendItem,
  PlacedNode,
  PlacedTier,
  Rect,
  StepCard,
  TextLine,
} from "./types.js";

// ── Design tokens (px) ────────────────────────────────────────────────────
export const CARD_H = 62;
export const CARD_MIN_W = 184;
export const CARD_MAX_W = 244;
export const ICON_BOX = 34;
export const CARD_PAD_X = 13;
export const CARD_TEXT_X = CARD_PAD_X + ICON_BOX + 12;
export const CARD_GAP_X = 48;
export const CARD_GAP_Y = 36;
export const FRAME_PAD = 24;
export const FRAME_HEADER = 40;
export const FRAME_HEADER_NESTED = 34;
export const CHILD_GAP = 24;
export const COL_GAP = 72;
export const ROW_GAP = 52;
export const MARGIN = 48;
export const TITLE_H = 84;
export const PANEL_PAD = 36;
export const SIDEBAR_W = 340;
export const SIDEBAR_GAP = 28;
export const FOOTER_H = 40;

export const FONTS = {
  title: { font: "mono", size: 26, weight: 700 } as FontSpec,
  subtitle: { font: "mono", size: 13, weight: 400 } as FontSpec,
  cardLabel: { font: "mono", size: 14, weight: 600 } as FontSpec,
  cardSub: { font: "mono", size: 11, weight: 400 } as FontSpec,
  tierLabel: { font: "mono", size: 11, weight: 600, tracking: 0.14 } as FontSpec,
  edgeLabel: { font: "mono", size: 10.5, weight: 500 } as FontSpec,
  stepTitle: { font: "mono", size: 12.5, weight: 600 } as FontSpec,
  stepBody: { font: "sans", size: 12, weight: 400 } as FontSpec,
  panelHead: { font: "mono", size: 11, weight: 600, tracking: 0.16 } as FontSpec,
  legend: { font: "mono", size: 11, weight: 400 } as FontSpec,
};

interface Box {
  id: string;
  group?: DiagramGroup;
  hidden: boolean;
  depth: number;
  nodes: DiagramNode[];
  children: Box[];
  cols: number;
  layout: "row" | "column";
  /** horizontal gap between cards (widened for labelled in-row edges) */
  gapX: number;
  /** natural size */
  w: number;
  h: number;
  blockW: number;
  blockH: number;
  header: number;
  pad: number;
}

function isExternalGroup(g: DiagramGroup): boolean {
  if (g.kind === "external") return true;
  const id = g.id.toLowerCase();
  const label = g.label.toLowerCase();
  return (
    id === "ext" ||
    id.includes("third") ||
    label.includes("third-party") ||
    label.includes("third party") ||
    (label.includes("external") && !label.includes("edge"))
  );
}

function autoCols(n: number, band: boolean): number {
  if (band) return Math.max(1, n);
  if (n <= 3) return 1;
  if (n <= 6) return 2;
  if (n <= 9) return 3;
  return 4;
}

export function tierLabelText(label: string, index: string): string {
  const up = label.toUpperCase();
  return index ? `${index} / ${up}` : up;
}

function dominantRole(nodes: DiagramNode[]): NodeRole {
  const count = new Map<NodeRole, number>();
  for (const n of nodes) count.set(n.role ?? "default", (count.get(n.role ?? "default") ?? 0) + 1);
  let best: NodeRole = "default";
  let bc = -1;
  for (const [r, c] of count) if (c > bc) ((best = r), (bc = c));
  return best;
}

export function layoutArchitecture(input: ArchitectureLayoutInput): LayoutResult {
  const groups = input.groups ?? [];
  const nodes = input.nodes;
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const steps = [...(input.steps ?? [])].sort((a, b) => a.n - b.n);

  // ── Card width: uniform across the diagram, sized to measured text ────────
  let textMax = 0;
  for (const n of nodes) {
    textMax = Math.max(
      textMax,
      measureText(n.label, FONTS.cardLabel),
      n.subtitle ? measureText(n.subtitle, FONTS.cardSub) : 0,
    );
  }
  const cardW = Math.round(Math.min(CARD_MAX_W, Math.max(CARD_MIN_W, CARD_TEXT_X + textMax + 16)));
  const textRoom = cardW - CARD_TEXT_X - 12;

  // ── Build container tree ──────────────────────────────────────────────────
  const bandIds = new Set(input.bottomRow ?? []);
  const buildBox = (g: DiagramGroup, depth: number, band: boolean): Box => {
    const own = nodes.filter((n) => n.group === g.id);
    const kids = groups.filter((c) => c.parent === g.id).map((c) => buildBox(c, depth + 1, false));
    const ext = isExternalGroup(g);
    return {
      id: g.id,
      group: g,
      hidden: false,
      depth,
      nodes: own,
      children: kids,
      cols: Math.max(1, Math.min(own.length || 1, g.cols ?? autoCols(own.length, band || ext))),
      layout: g.layout ?? "row",
      gapX: CARD_GAP_X,
      w: 0,
      h: 0,
      blockW: 0,
      blockH: 0,
      header: depth === 0 ? FRAME_HEADER : FRAME_HEADER_NESTED,
      pad: FRAME_PAD,
    };
  };
  const hiddenBox = (ns: DiagramNode[], id: string): Box => ({
    id,
    hidden: true,
    depth: 0,
    nodes: ns,
    children: [],
    cols: 1,
    layout: "column",
    gapX: CARD_GAP_X,
    w: 0,
    h: 0,
    blockW: 0,
    blockH: 0,
    header: 0,
    pad: 0,
  });

  const measure = (b: Box): void => {
    b.children.forEach(measure);
    const n = b.nodes.length;
    for (const e of input.edges ?? []) {
      if (!e.label) continue;
      const i = b.nodes.findIndex((x) => x.id === e.from);
      const j = b.nodes.findIndex((x) => x.id === e.to);
      if (i < 0 || j < 0 || Math.floor(i / b.cols) !== Math.floor(j / b.cols)) continue;
      b.gapX = Math.max(b.gapX, Math.ceil(measureText(e.label, FONTS.edgeLabel) + 18 + 34));
    }
    if (n) {
      const rows = Math.ceil(n / b.cols);
      b.blockW = b.cols * cardW + (b.cols - 1) * b.gapX;
      b.blockH = rows * CARD_H + (rows - 1) * CARD_GAP_Y;
    }
    const items: Array<{ w: number; h: number }> = [];
    if (n) items.push({ w: b.blockW, h: b.blockH });
    for (const c of b.children) items.push({ w: c.w, h: c.h });
    let iw = 0;
    let ih = 0;
    const gap = b.children.length ? CHILD_GAP + 8 : 0;
    if (b.layout === "row") {
      iw = items.reduce((s, it) => s + it.w, 0) + Math.max(0, items.length - 1) * gap;
      ih = Math.max(0, ...items.map((it) => it.h));
    } else {
      iw = Math.max(0, ...items.map((it) => it.w));
      ih = items.reduce((s, it) => s + it.h, 0) + Math.max(0, items.length - 1) * gap;
    }
    if (b.hidden) {
      b.w = iw;
      b.h = ih;
      return;
    }
    const labelW = measureText(tierLabelText(b.group!.label, "00"), FONTS.tierLabel) + 56;
    b.w = Math.max(iw + b.pad * 2, labelW);
    b.h = b.header + ih + b.pad;
  };

  // Column stacks (group ids or ungrouped node ids)
  const used = new Set<string>();
  const topBoxes = new Map<string, Box>();
  const boxFor = (id: string, band: boolean): Box | undefined => {
    if (topBoxes.has(id)) return topBoxes.get(id);
    const g = groupById.get(id);
    let b: Box | undefined;
    if (g) b = buildBox(g, 0, band);
    else if (nodeById.has(id)) b = hiddenBox([nodeById.get(id)!], `__free_${id}`);
    if (b) {
      topBoxes.set(id, b);
      used.add(id);
    }
    return b;
  };
  const rootGroups = groups.filter((g) => !g.parent || !groupById.has(g.parent));
  const grouped = new Set(groups.map((g) => g.id));
  const freeNodes = nodes.filter((n) => !n.group || !grouped.has(n.group));

  let columnSpec = input.columns?.length ? input.columns.map((c) => [...c]) : [];
  const bottomSpec = [...(input.bottomRow ?? [])];
  const mentioned = new Set([...columnSpec.flat(), ...bottomSpec]);
  if (!columnSpec.length) {
    columnSpec = rootGroups.filter((g) => !bandIds.has(g.id)).map((g) => [g.id]);
  } else {
    for (const g of rootGroups) if (!mentioned.has(g.id)) columnSpec.push([g.id]);
  }
  const unmentionedFree = freeNodes.filter((n) => !mentioned.has(n.id));

  const columns: Box[][] = [];
  if (unmentionedFree.length) {
    const b = hiddenBox(unmentionedFree, "__free");
    columns.push([b]);
  }
  for (const stack of columnSpec) {
    const col: Box[] = [];
    for (const id of stack) {
      const b = boxFor(id, false);
      if (b) col.push(b);
    }
    if (col.length) columns.push(col);
  }
  const band: Box[] = bottomSpec.map((id) => boxFor(id, true)).filter((b): b is Box => !!b);
  for (const col of columns) col.forEach(measure);
  band.forEach(measure);

  // ── Gutters: widen a column gap so labelled edges crossing it get a pill ──
  const colOf = new Map<string, number>();
  const mark = (b: Box, ci: number) => {
    colOf.set(b.id, ci);
    if (b.group) colOf.set(b.group.id, ci);
    for (const n of b.nodes) colOf.set(n.id, ci);
    b.children.forEach((c) => mark(c, ci));
  };
  columns.forEach((col, ci) => col.forEach((b) => mark(b, ci)));
  const gaps = columns.map(() => COL_GAP);
  for (const e of input.edges ?? []) {
    if (!e.label) continue;
    const a = colOf.get(e.from);
    const b = colOf.get(e.to);
    if (a == null || b == null || Math.abs(a - b) !== 1) continue;
    const need = measureText(e.label, FONTS.edgeLabel) + 18 + 56;
    const gi = Math.min(a, b);
    gaps[gi] = Math.max(gaps[gi], Math.min(180, Math.ceil(need)));
  }

  // ── Content geometry ──────────────────────────────────────────────────────
  const colW = columns.map((c) => Math.max(...c.map((b) => b.w)));
  const colH = columns.map((c) => c.reduce((s, b) => s + b.h, 0) + (c.length - 1) * ROW_GAP);
  let framesW = colW.reduce((s, w) => s + w, 0) + gaps.slice(0, Math.max(0, columns.length - 1)).reduce((s, g) => s + g, 0);
  const framesH = Math.max(0, ...colH);
  const bandW = band.reduce((s, b) => s + b.w, 0) + Math.max(0, band.length - 1) * COL_GAP;
  const bandH = band.length ? Math.max(...band.map((b) => b.h)) : 0;
  if (bandW > framesW && columns.length) {
    const extra = (bandW - framesW) / columns.length;
    for (let i = 0; i < colW.length; i++) colW[i] += extra;
    framesW = bandW;
  }
  const innerW = Math.max(framesW, bandW);
  const innerH = framesH + (band.length ? ROW_GAP + bandH : 0);
  const contentW = innerW + PANEL_PAD * 2;
  const contentH = innerH + PANEL_PAD * 2;

  // Title width can force a wider canvas
  const titleW = input.title ? measureText(input.title, FONTS.title) + 40 : 0;
  const subW = input.subtitle ? measureText(input.subtitle, FONTS.subtitle) + 40 : 0;

  // ── Steps panel: right vs bottom (closest to 16:10) ───────────────────────
  const stepBodyW = SIDEBAR_W - 72;
  const legend = deriveLegend(input, nodes);
  const legendRowsRight = legend.length;
  const rightStepsH = (): number => {
    let h = 52;
    for (const s of steps) {
      const lines = s.description ? wrapText(s.description, FONTS.stepBody, stepBodyW) : [];
      h += 20 + lines.length * 17 + 18;
    }
    h += 24 + 30 + legendRowsRight * 22 + 16;
    return h;
  };
  const bottomCardW = 300;
  const bottomLayout = (totalW = contentW) => {
    const maxCols = Math.max(1, Math.min(steps.length || 1, Math.floor((totalW + 20) / (bottomCardW + 20))));
    const rows = Math.ceil((steps.length || 1) / maxCols);
    const bottomCols = Math.ceil((steps.length || 1) / rows);
    const cw = (totalW - (bottomCols - 1) * 20) / bottomCols;
    const cards: Array<{ h: number; lines: string[] }> = steps.map((s) => {
      const lines = s.description ? wrapText(s.description, FONTS.stepBody, cw - 64) : [];
      return { h: 22 + 20 + lines.length * 17 + 18, lines };
    });
    let h = 0;
    for (let i = 0; i < cards.length; i += bottomCols) {
      h += Math.max(...cards.slice(i, i + bottomCols).map((c) => c.h)) + 20;
    }
    return { cw, cards, h: h + 40, cols: bottomCols };
  };

  let stepsPosition: LayoutResult["stepsPosition"] = steps.length ? "right" : "none";
  const want = input.stepsPosition ?? "auto";
  const baseW = Math.max(contentW, titleW, subW);
  if (steps.length) {
    if (want === "bottom") stepsPosition = "bottom";
    else if (want === "auto") {
      const rW = Math.max(contentW + SIDEBAR_GAP + SIDEBAR_W, titleW, subW);
      const rH = Math.max(contentH, rightStepsH());
      const bl = bottomLayout();
      const bW = baseW;
      const bH = contentH + SIDEBAR_GAP + bl.h + 34;
      const score = (w: number, h: number) => Math.abs(Math.log(w / h / 1.6));
      // Prefer right panel unless bottom is clearly better balanced
      stepsPosition = score(bW, bH) + 0.12 < score(rW, rH) ? "bottom" : "right";
    }
  }

  const contentX = MARGIN;
  const contentY = MARGIN + TITLE_H;
  let content: Rect = { x: contentX, y: contentY, w: contentW, h: contentH };
  let sidebar: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let stepCards: StepCard[] = [];
  let legendRect: Rect;

  {
    const side = stepsPosition === "right" ? SIDEBAR_GAP + SIDEBAR_W : 0;
    const need = Math.max(titleW, subW) - side;
    if (need > content.w) content = { ...content, w: Math.round(need) };
  }
  if (stepsPosition === "right") {
    const sh = rightStepsH();
    if (sh > content.h) content = { ...content, h: sh };
    sidebar = { x: contentX + contentW + SIDEBAR_GAP, y: contentY, w: SIDEBAR_W, h: content.h };
    let cy = sidebar.y + 52;
    for (const s of steps) {
      const lines = s.description ? wrapText(s.description, FONTS.stepBody, stepBodyW) : [];
      const h = 20 + lines.length * 17 + 18;
      stepCards.push({
        n: s.n,
        label: line(s.label, FONTS.stepTitle, stepBodyW),
        lines,
        rect: { x: sidebar.x + 16, y: cy - 16, w: sidebar.w - 32, h },
      });
      cy += h;
    }
    const lh = 30 + legend.length * 22 + 8;
    legendRect = { x: sidebar.x + 16, y: sidebar.y + sidebar.h - lh - 12, w: sidebar.w - 32, h: lh };
  } else if (stepsPosition === "bottom") {
    const bl = bottomLayout(content.w);
    const bottomCols = bl.cols;
    const legendH = 44;
    sidebar = { x: contentX, y: contentY + content.h + SIDEBAR_GAP, w: content.w, h: bl.h + legendH };
    let cy = sidebar.y + 40;
    for (let i = 0; i < steps.length; i += bottomCols) {
      const row = bl.cards.slice(i, i + bottomCols);
      const rh = Math.max(...row.map((c) => c.h));
      row.forEach((c, k) => {
        const s = steps[i + k];
        stepCards.push({
          n: s.n,
          label: line(s.label, FONTS.stepTitle, bl.cw - 64),
          lines: c.lines,
          rect: { x: sidebar.x + k * (bl.cw + 20), y: cy, w: bl.cw, h: rh },
        });
      });
      cy += rh + 20;
    }
    legendRect = { x: sidebar.x, y: sidebar.y + sidebar.h - legendH + 6, w: sidebar.w, h: legendH - 12 };
  } else {
    legendRect = { x: contentX, y: contentY + content.h + 18, w: content.w, h: 30 };
  }

  // Stretch content panel to the canvas width (title may be wider)
  const rightEdge = stepsPosition === "right" ? sidebar.x + sidebar.w : contentX + content.w;
  const width = Math.round(rightEdge + MARGIN);

  // ── Place frames ─────────────────────────────────────────────────────────
  const placedTiers: PlacedTier[] = [];
  const placedNodes: PlacedNode[] = [];
  let tierCounter = 0;
  const extraW = content.w - contentW; // grow frames if panel stretched
  const framesX = content.x + PANEL_PAD;
  const framesY = content.y + PANEL_PAD;
  const availH = content.h - PANEL_PAD * 2 - (band.length ? ROW_GAP + bandH : 0);
  const colExtra = columns.length ? extraW / columns.length : 0;

  const placeBox = (b: Box, r: Rect, parentId?: string): void => {
    let inner: Rect;
    if (!b.hidden) {
      const g = b.group!;
      const index = b.depth === 0 ? String(++tierCounter).padStart(2, "0") : "";
      const text = tierLabelText(g.label, index);
      const lw = measureText(text, FONTS.tierLabel);
      const labelRect = { x: r.x + 16, y: r.y + 12, w: lw + 18, h: 16 };
      const descendants = collectNodes(b);
      placedTiers.push({
        id: g.id,
        label: g.label,
        index,
        rect: r,
        labelRect,
        depth: b.depth,
        parentId,
        kind: g.kind,
        external: isExternalGroup(g),
        hidden: false,
        accentRole: dominantRole(descendants),
        nodeIds: descendants.map((n) => n.id),
      });
      inner = { x: r.x + b.pad, y: r.y + b.header, w: r.w - b.pad * 2, h: r.h - b.header - b.pad };
    } else {
      inner = r;
    }
    const items: Array<{ kind: "block" } | { kind: "box"; box: Box }> = [];
    if (b.nodes.length) items.push({ kind: "block" });
    for (const c of b.children) items.push({ kind: "box", box: c });
    const gap = b.children.length ? CHILD_GAP + 8 : 0;
    const natural = items.map((it) => (it.kind === "block" ? { w: b.blockW, h: b.blockH } : { w: it.box.w, h: it.box.h }));
    const nChildren = b.children.length;
    if (b.layout === "row") {
      const total = natural.reduce((s, n) => s + n.w, 0) + (items.length - 1) * gap;
      const extra = Math.max(0, inner.w - total);
      const perChild = nChildren ? extra / nChildren : 0;
      let x = inner.x + (nChildren ? 0 : extra / 2);
      items.forEach((it, i) => {
        const w = natural[i].w + (it.kind === "box" ? perChild : 0);
        const slot = { x, y: inner.y, w, h: inner.h };
        if (it.kind === "block") placeBlock(b, slot);
        else placeBox(it.box, slot, b.hidden ? parentId : b.id);
        x += w + gap;
      });
    } else {
      const total = natural.reduce((s, n) => s + n.h, 0) + (items.length - 1) * gap;
      const extra = Math.max(0, inner.h - total);
      const perChild = nChildren ? extra / nChildren : 0;
      let y = inner.y + (nChildren ? 0 : extra / 2);
      items.forEach((it, i) => {
        const h = natural[i].h + (it.kind === "box" ? perChild : 0);
        const slot = { x: inner.x, y, w: inner.w, h };
        if (it.kind === "block") placeBlock(b, slot);
        else placeBox(it.box, slot, b.hidden ? parentId : b.id);
        y += h + gap;
      });
    }
  };

  const placeBlock = (b: Box, slot: Rect): void => {
    const x0 = slot.x + (slot.w - b.blockW) / 2;
    const y0 = slot.y + (slot.h - b.blockH) / 2;
    const tierId = b.hidden ? undefined : b.id;
    b.nodes.forEach((n, i) => {
      const col = i % b.cols;
      const row = Math.floor(i / b.cols);
      // Center a short last row
      const lastRowCount = b.nodes.length - row * b.cols;
      const rowShift = lastRowCount < b.cols ? ((b.cols - lastRowCount) * (cardW + b.gapX)) / 2 : 0;
      const rect = {
        x: Math.round(x0 + rowShift + col * (cardW + b.gapX)),
        y: Math.round(y0 + row * (CARD_H + CARD_GAP_Y)),
        w: cardW,
        h: CARD_H,
      };
      const role = (n.role ?? "default") as NodeRole;
      placedNodes.push({
        id: n.id,
        label: line(n.label, FONTS.cardLabel, textRoom),
        subtitle: n.subtitle ? line(n.subtitle, FONTS.cardSub, textRoom) : undefined,
        rawLabel: n.label,
        rawSubtitle: n.subtitle,
        role,
        icon: resolveMonoIcon(n.icon, role, n.shape),
        rect,
        tierId,
      });
    });
  };

  let cx = framesX;
  columns.forEach((col, ci) => {
    const w = colW[ci] + colExtra;
    const natural = colH[ci];
    const extra = Math.max(0, availH - natural);
    const per = extra / col.length;
    let y = framesY;
    for (const b of col) {
      const h = b.h + per;
      placeBox(b, { x: Math.round(cx), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
      y += h + ROW_GAP;
    }
    cx += w + gaps[ci];
  });
  if (band.length) {
    const by = content.y + content.h - PANEL_PAD - bandH;
    const totalW = content.w - PANEL_PAD * 2;
    const natural = band.reduce((s, b) => s + b.w, 0) + (band.length - 1) * COL_GAP;
    const per = Math.max(0, totalW - natural) / band.length;
    let bx = framesX;
    for (const b of band) {
      const w = b.w + per;
      placeBox(b, { x: Math.round(bx), y: Math.round(by), w: Math.round(w), h: Math.round(bandH) });
      bx += w + COL_GAP;
    }
  }

  const footerY =
    (stepsPosition === "bottom" ? sidebar.y + sidebar.h : stepsPosition === "none" ? legendRect.y + legendRect.h : content.y + content.h) + 18;
  const height = Math.round(footerY + FOOTER_H - 12 + MARGIN / 2);

  avoidLabelCorridors(placedTiers, placedNodes, input.edges ?? []);

  const routed = routeEdges({
    nodes: placedNodes,
    tiers: placedTiers,
    edges: input.edges ?? [],
    area: content,
  });

  return {
    width,
    height,
    title: input.title,
    subtitle: input.subtitle,
    nodes: placedNodes,
    tiers: placedTiers,
    edges: routed.edges,
    steps,
    stepCards,
    stepsPosition,
    legend,
    legendRect,
    content,
    sidebar,
    titleRect: { x: MARGIN, y: MARGIN, w: width - MARGIN * 2, h: TITLE_H },
    footerY,
    routeNotes: routed.notes,
  };
}

/**
 * Straight vertical edges between column-aligned cards would have to dodge a
 * tier label sitting in their corridor. Move such labels to the frame's right
 * end (or the widest free stretch of the header) instead.
 */
function avoidLabelCorridors(tiers: PlacedTier[], nodes: PlacedNode[], edges: Array<{ from: string; to: string }>): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const corridors: Array<{ x: number; y1: number; y2: number }> = [];
  for (const e of edges) {
    const a = byId.get(e.from)?.rect ?? tierById.get(e.from)?.rect;
    const b = byId.get(e.to)?.rect ?? tierById.get(e.to)?.rect;
    if (!a || !b) continue;
    const lo = Math.max(a.x, b.x);
    const hi = Math.min(a.x + a.w, b.x + b.w);
    if (hi - lo < 40) continue; // not vertically stacked
    const ca = a.x + a.w / 2;
    const cb = b.x + b.w / 2;
    const x = Math.abs(ca - cb) < 1 ? ca : (lo + hi) / 2;
    corridors.push({ x, y1: Math.min(a.y, b.y), y2: Math.max(a.y + a.h, b.y + b.h) });
  }
  const blocked = (r: Rect) => corridors.some((c) => c.x > r.x - 24 && c.x < r.x + r.w + 24 && c.y1 < r.y + r.h && c.y2 > r.y);
  for (const t of tiers) {
    if (!blocked(t.labelRect)) continue;
    const w = t.labelRect.w;
    const candidates: number[] = [t.rect.x + t.rect.w - 16 - w];
    // free stretches between corridors inside the header
    const xs = corridors
      .filter((c) => c.y1 < t.labelRect.y + t.labelRect.h && c.y2 > t.labelRect.y && c.x > t.rect.x && c.x < t.rect.x + t.rect.w)
      .map((c) => c.x)
      .sort((p, q) => p - q);
    for (const x of xs) candidates.push(x + 28);
    for (const x of candidates) {
      const r = { ...t.labelRect, x };
      if (x < t.rect.x + 12 || x + w > t.rect.x + t.rect.w - 12) continue;
      if (blocked(r)) continue;
      if (nodes.some((n) => rectsOverlap(n.rect, r, 4))) continue;
      t.labelRect = r;
      break;
    }
  }
}

function collectNodes(b: Box): DiagramNode[] {
  return [...b.nodes, ...b.children.flatMap(collectNodes)];
}

function line(text: string, spec: FontSpec, max: number): TextLine {
  const r = ellipsize(text, spec, max);
  return { text: r.text, truncated: r.truncated, width: measureText(r.text, spec) };
}

const KIND_LABEL: Record<EdgeKind, string> = {
  sync: "Sync request",
  async: "Async event",
  data: "Data read / write",
  auth: "Auth / identity",
  default: "Dependency",
};

function deriveLegend(input: ArchitectureLayoutInput, _nodes: DiagramNode[]): LegendItem[] {
  if (input.legend?.length) return input.legend;
  const kinds: EdgeKind[] = [];
  for (const e of input.edges ?? []) {
    const k = (e.kind ?? "sync") as EdgeKind;
    if (!kinds.includes(k)) kinds.push(k);
  }
  const order: EdgeKind[] = ["sync", "async", "data", "auth", "default"];
  kinds.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return kinds.map((k) => ({ label: KIND_LABEL[k], kind: k }));
}

/** Test helpers */
export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}
