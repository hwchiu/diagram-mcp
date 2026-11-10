/**
 * Deterministic architecture grid layout + orthogonal edge routing.
 */
import type { DiagramGroup, DiagramNode } from "../types.js";
import { resolveMonoIcon } from "./icons.js";
import {
  EDGE_CLEARANCE, TRACK_SPACING, RoutingCapacityError, edgeLabelSize,
  inflateRect, rectanglesIntersect, routeArchitectureEdges, segmentHitsRect,
} from "./routing.js";
import type {
  ArchitectureLayoutInput,
  LayoutResult,
  PlacedNode,
  PlacedTier,
  Rect,
  RoutedEdge,
} from "./types.js";

export const CARD_W = 140;
export const CARD_H = 114;
export const CHIP_W = 156;
export const CHIP_H = 48;
export const CARD_GAP_X = 18;
export const CARD_GAP_Y = 16;
export const TIER_PAD = 24;
export const TIER_LABEL_H = 26;
export const COL_GAP = 32;
export const ROW_GAP = 24;
export const MARGIN = 36;
export const TITLE_H = 64;
export const SIDEBAR_W = 300;
export const SIDEBAR_GAP = 24;

function isExternal(g: DiagramGroup): boolean {
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

function nodesIn(nodes: DiagramNode[], groupId: string): DiagramNode[] {
  return nodes.filter((n) => n.group === groupId);
}

function rootGroups(groups: DiagramGroup[]): DiagramGroup[] {
  return groups.filter((g) => !g.parent);
}

function childGroups(groups: DiagramGroup[], parentId: string): DiagramGroup[] {
  return groups.filter((g) => g.parent === parentId);
}

/** Default columns: one per root group, left→right. */
function defaultColumns(groups: DiagramGroup[]): string[][] {
  return rootGroups(groups).map((g) => [g.id]);
}

interface GridSpacing {
  cardW: number;
  cardH: number;
  chipW: number;
  chipH: number;
  gapX: number;
  gapY: number;
  colGap: number;
  rowGap: number;
  outer: number;
}

function measureTierInStack(
  stack: string[],
  groups: DiagramGroup[],
  nodes: DiagramNode[],
  spacing: GridSpacing,
  degrees: Map<string, number>,
): { tierW: number; tierH: number; cols: number; rows: number; nCount: number; external: boolean }[] {
  return stack.map((gid) => {
    const g = groups.find((x) => x.id === gid)!;
    const kids = nodesIn(nodes, gid);
    const nested = childGroups(groups, gid);
    // Flatten: if nested groups exist, count their nodes for sizing the parent box
    let leaf = kids;
    if (nested.length) {
      leaf = nested.flatMap((ng) => nodesIn(nodes, ng.id));
      if (!leaf.length) leaf = kids;
    }
    const external = isExternal(g);
    const n = Math.max(leaf.length, 1);
    const cols = external ? Math.min(n, 4) : Math.min(Math.max(2, Math.ceil(Math.sqrt(n))), 4);
    const rows = Math.ceil(n / cols);
    const cw = external ? spacing.chipW : spacing.cardW;
    const ch = external ? spacing.chipH : spacing.cardH;
    const portSize = ((degrees.get(gid) ?? 0) + 1) * TRACK_SPACING + 24;
    const tierW = Math.max(portSize, TIER_PAD * 2 + cols * cw + (cols - 1) * spacing.gapX);
    const tierH = Math.max(portSize,
      TIER_LABEL_H + EDGE_CLEARANCE + 12 + rows * ch + (rows - 1) * spacing.gapY + TIER_PAD);
    return { tierW, tierH, cols, rows, nCount: n, external };
  });
}

export function layoutArchitecture(input: ArchitectureLayoutInput): LayoutResult {
  for (const scale of [1, 1.75, 3]) {
    try {
      return layoutWithCapacity(input, scale);
    } catch (error) {
      if (!(error instanceof RoutingCapacityError) || scale === 3) throw error;
    }
  }
  throw new Error("Architecture layout exhausted its routing attempts");
}

function layoutWithCapacity(input: ArchitectureLayoutInput, scale: number): LayoutResult {
  const groups = input.groups ?? [];
  const nodes = input.nodes;
  const edges = input.edges ?? [];
  const steps = [...(input.steps ?? [])].sort((a, b) => a.n - b.n);
  const columns = input.columns?.length ? input.columns : defaultColumns(groups);
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const portSize = (Math.max(0, ...nodes.map((n) => degree.get(n.id) ?? 0)) + 1) * TRACK_SPACING + 24;
  const gap = (EDGE_CLEARANCE * 2 + Math.max(3, Math.ceil(Math.sqrt(edges.length))) * TRACK_SPACING) * scale;
  const spacing: GridSpacing = {
    cardW: Math.max(CARD_W, portSize), cardH: Math.max(CARD_H, portSize),
    chipW: Math.max(CHIP_W, portSize), chipH: Math.max(CHIP_H, portSize),
    gapX: Math.max(CARD_GAP_X, gap), gapY: Math.max(CARD_GAP_Y, gap),
    colGap: Math.max(COL_GAP, gap, ...edges.map((e) => e.label ? edgeLabelSize(e.label).w + 16 : 0)),
    rowGap: Math.max(ROW_GAP, gap), outer: Math.max(48, gap),
  };

  // Measure each column
  const colMetrics = columns.map((stack) => {
    const metrics = measureTierInStack(stack, groups, nodes, spacing, degree);
    const w = Math.max(...metrics.map((m) => m.tierW), spacing.cardW + TIER_PAD * 2);
    const h = metrics.reduce((s, m) => s + m.tierH, 0) + Math.max(0, metrics.length - 1) * spacing.rowGap;
    return { stack, metrics, w, h };
  });

  const grouped = new Set(groups.map((g) => g.id));
  const free = nodes.filter((n) => !n.group || !grouped.has(n.group));
  const freeW = free.length * spacing.cardW + Math.max(0, free.length - 1) * spacing.gapX;
  const tierW = colMetrics.reduce((s, c) => s + c.w, 0) + Math.max(0, colMetrics.length - 1) * spacing.colGap;
  const tierH = Math.max(0, ...colMetrics.map((c) => c.h));
  const contentW = Math.max(tierW, freeW, spacing.cardW) + spacing.outer * 2;
  const contentH = tierH + (free.length ? (tierH ? spacing.rowGap : 0) + spacing.cardH : 0) + spacing.outer * 2;

  const titleRect: Rect = {
    x: MARGIN,
    y: MARGIN,
    w: contentW,
    h: TITLE_H,
  };

  const contentX = MARGIN;
  const contentY = MARGIN + TITLE_H + 12;
  const sidebarX = contentX + contentW + SIDEBAR_GAP;
  const stepsH = 48 + steps.length * 70 + 40 + 28 * 4;
  // Dock sidebar to content height (extend content or sidebar so they align)
  const alignedH = Math.max(contentH, stepsH);
  const sidebar: Rect = {
    x: sidebarX,
    y: contentY,
    w: SIDEBAR_W,
    h: alignedH,
  };

  const placedNodes: PlacedNode[] = [];
  const placedTiers: PlacedTier[] = [];
  let tierIndex = 0;

  let colX = contentX + spacing.outer;
  for (let ci = 0; ci < colMetrics.length; ci++) {
    const { stack, metrics, w: colW } = colMetrics[ci];
    let y = contentY + spacing.outer;
    for (let si = 0; si < stack.length; si++) {
      const gid = stack[si];
      const g = groups.find((x) => x.id === gid)!;
      const m = metrics[si];
      const tierRect: Rect = { x: colX, y, w: colW, h: m.tierH };
      const nested = childGroups(groups, gid);
      let leafNodes = nodesIn(nodes, gid);
      // If parent has nested groups, place nested as inner tiers conceptually — flatten leaves into parent for overview
      if (nested.length) {
        const nestedLeaves = nested.flatMap((ng) => nodesIn(nodes, ng.id));
        if (nestedLeaves.length) leafNodes = nestedLeaves;
      }

      const nodeIds: string[] = [];
      const cw = m.external ? spacing.chipW : spacing.cardW;
      const ch = m.external ? spacing.chipH : spacing.cardH;
      const gridW = m.cols * cw + (m.cols - 1) * spacing.gapX;
      const startX = colX + (colW - gridW) / 2;
      const startY = y + TIER_LABEL_H + EDGE_CLEARANCE + 12;

      leafNodes.forEach((n, i) => {
        const col = i % m.cols;
        const row = Math.floor(i / m.cols);
        const rect: Rect = {
          x: startX + col * (cw + spacing.gapX),
          y: startY + row * (ch + spacing.gapY),
          w: cw,
          h: ch,
        };
        placedNodes.push({
          id: n.id,
          label: n.label,
          subtitle: n.subtitle,
          role: n.role,
          icon: resolveMonoIcon(n.icon, n.role, n.shape),
          rect,
          tierId: gid,
          compact: m.external,
        });
        nodeIds.push(n.id);
      });

      // Ungrouped nodes referenced only as free — skip here
      placedTiers.push({
        id: gid,
        label: g.label,
        index: ++tierIndex,
        rect: tierRect,
        nodeIds,
        kind: g.kind,
        external: m.external,
      });

      y += m.tierH + spacing.rowGap;
    }
    colX += colW + spacing.colGap;
  }

  // Free (ungrouped) nodes — place in a thin strip under content if any
  if (free.length) {
    let fx = contentX + spacing.outer;
    const fy = contentY + spacing.outer + tierH + (tierH ? spacing.rowGap : 0);
    for (const n of free) {
      const rect = { x: fx, y: fy, w: spacing.cardW, h: spacing.cardH };
      placedNodes.push({
        id: n.id,
        label: n.label,
        subtitle: n.subtitle,
        role: n.role,
        icon: resolveMonoIcon(n.icon, n.role, n.shape),
        rect,
      });
      fx += spacing.cardW + spacing.gapX;
    }
  }

  const finalContentH = Math.max(alignedH, contentH);
  const content = { x: contentX, y: contentY, w: contentW, h: finalContentH };
  const routed = routeArchitectureEdges(edges, placedNodes, placedTiers, content);
  const width = sidebarX + SIDEBAR_W + MARGIN;
  const height = contentY + finalContentH + MARGIN;

  return {
    width,
    height,
    title: input.title,
    subtitle: input.subtitle,
    nodes: placedNodes,
    tiers: placedTiers,
    edges: routed.edges,
    routing: routed.quality,
    steps,
    legend: input.legend ?? [
      { label: "Sync / request", kind: "sync" },
      { label: "Async / event", kind: "async" },
      { label: "Data path", kind: "data" },
    ],
    content,
    sidebar: { ...sidebar, h: finalContentH },
    titleRect,
  };
}

/** Test helpers */
export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return rectanglesIntersect(inflateRect(a, gap / 2), inflateRect(b, gap / 2));
}

export function edgeHitsCards(edge: RoutedEdge, cards: Rect[], pad = 2): boolean {
  for (let i = 0; i < edge.points.length - 1; i++) {
    const a = edge.points[i];
    const b = edge.points[i + 1];
    if (cards.some((c) => segmentHitsRect(a, b, inflateRect(c, -pad)))) return true;
  }
  return false;
}
