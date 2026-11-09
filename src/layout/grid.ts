/**
 * Deterministic architecture grid layout + orthogonal edge routing.
 */
import type { DiagramEdge, DiagramGroup, DiagramNode, DiagramStep, EdgeKind } from "../types.js";
import { resolveMonoIcon } from "./icons.js";
import type {
  ArchitectureLayoutInput,
  LayoutResult,
  PlacedNode,
  PlacedTier,
  Point,
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

function measureTierInStack(
  stack: string[],
  groups: DiagramGroup[],
  nodes: DiagramNode[],
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
    const cw = external ? CHIP_W : CARD_W;
    const ch = external ? CHIP_H : CARD_H;
    const tierW = TIER_PAD * 2 + cols * cw + (cols - 1) * CARD_GAP_X;
    const tierH = TIER_PAD + TIER_LABEL_H + rows * ch + (rows - 1) * CARD_GAP_Y + 12;
    return { tierW, tierH, cols, rows, nCount: n, external };
  });
}

function centerOf(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function inflate(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function pointInRect(p: Point, r: Rect, pad = 0): boolean {
  return (
    p.x >= r.x - pad &&
    p.x <= r.x + r.w + pad &&
    p.y >= r.y - pad &&
    p.y <= r.y + r.h + pad
  );
}

function portOnSide(r: Rect, side: "left" | "right" | "top" | "bottom", slot: number, slots: number): Point {
  const t = (slot + 1) / (slots + 1);
  if (side === "left") return { x: r.x, y: r.y + r.h * t };
  if (side === "right") return { x: r.x + r.w, y: r.y + r.h * t };
  if (side === "top") return { x: r.x + r.w * t, y: r.y };
  return { x: r.x + r.w * t, y: r.y + r.h };
}

function pickSides(from: Rect, to: Rect): ["left" | "right" | "top" | "bottom", "left" | "right" | "top" | "bottom"] {
  const fc = centerOf(from);
  const tc = centerOf(to);
  const dx = tc.x - fc.x;
  const dy = tc.y - fc.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ["right", "left"] : ["left", "right"];
  }
  return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
}

/** Orthogonal route with rounded bends; avoids card rectangles. */
function routeOrthogonal(
  from: Point,
  to: Point,
  obstacles: Rect[],
  channelX?: number,
  channelY?: number,
): Point[] {
  const midX = channelX ?? (from.x + to.x) / 2;
  const midY = channelY ?? (from.y + to.y) / 2;

  const candidates: Point[][] = [
    [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to],
    [from, { x: from.x, y: midY }, { x: to.x, y: midY }, to],
    [from, { x: from.x, y: to.y }, to],
    [from, { x: to.x, y: from.y }, to],
  ];

  const score = (pts: Point[]): number => {
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      s += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      // sample segment for obstacle hits
      const steps = 8;
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        for (const o of obstacles) {
          if (pointInRect(p, o, -2)) s += 400;
        }
      }
    }
    s += (pts.length - 2) * 20;
    return s;
  };

  let best = candidates[0];
  let bestScore = Infinity;
  for (const c of candidates) {
    const sc = score(c);
    if (sc < bestScore) {
      bestScore = sc;
      best = c;
    }
  }
  // Deduplicate consecutive points
  const out: Point[] = [];
  for (const p of best) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.5 || Math.abs(last.y - p.y) > 0.5) out.push(p);
  }
  return out;
}

function longestSegmentMid(pts: Point[]): Point {
  let bestLen = -1;
  let mid: Point = pts[0] ?? { x: 0, y: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (len > bestLen) {
      bestLen = len;
      mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  return mid;
}

function resolveTargetRect(
  id: string,
  nodeMap: Map<string, PlacedNode>,
  tierMap: Map<string, PlacedTier>,
): Rect | undefined {
  return nodeMap.get(id)?.rect ?? tierMap.get(id)?.rect;
}

export function layoutArchitecture(input: ArchitectureLayoutInput): LayoutResult {
  const groups = input.groups ?? [];
  const nodes = input.nodes;
  const edges = input.edges ?? [];
  const steps = [...(input.steps ?? [])].sort((a, b) => a.n - b.n);
  const columns = input.columns?.length ? input.columns : defaultColumns(groups);

  // Measure each column
  const colMetrics = columns.map((stack) => {
    const metrics = measureTierInStack(stack, groups, nodes);
    const w = Math.max(...metrics.map((m) => m.tierW), CARD_W + TIER_PAD * 2);
    const h = metrics.reduce((s, m) => s + m.tierH, 0) + Math.max(0, metrics.length - 1) * ROW_GAP;
    return { stack, metrics, w, h };
  });

  const contentW = colMetrics.reduce((s, c) => s + c.w, 0) + Math.max(0, colMetrics.length - 1) * COL_GAP;
  const contentH = Math.max(...colMetrics.map((c) => c.h), CARD_H);

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

  let colX = contentX;
  for (let ci = 0; ci < colMetrics.length; ci++) {
    const { stack, metrics, w: colW } = colMetrics[ci];
    let y = contentY;
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
      const cw = m.external ? CHIP_W : CARD_W;
      const ch = m.external ? CHIP_H : CARD_H;
      const gridW = m.cols * cw + (m.cols - 1) * CARD_GAP_X;
      const startX = colX + (colW - gridW) / 2;
      const startY = y + TIER_LABEL_H + 8;

      leafNodes.forEach((n, i) => {
        const col = i % m.cols;
        const row = Math.floor(i / m.cols);
        const rect: Rect = {
          x: startX + col * (cw + CARD_GAP_X),
          y: startY + row * (ch + CARD_GAP_Y),
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

      y += m.tierH + ROW_GAP;
    }
    colX += colW + COL_GAP;
  }

  // Free (ungrouped) nodes — place in a thin strip under content if any
  const grouped = new Set(groups.map((g) => g.id));
  const free = nodes.filter((n) => !n.group || !grouped.has(n.group));
  if (free.length) {
    let fx = contentX;
    const fy = contentY + contentH + 16;
    for (const n of free) {
      const rect = { x: fx, y: fy, w: CARD_W, h: CARD_H };
      placedNodes.push({
        id: n.id,
        label: n.label,
        subtitle: n.subtitle,
        role: n.role,
        icon: resolveMonoIcon(n.icon, n.role, n.shape),
        rect,
      });
      fx += CARD_W + CARD_GAP_X;
    }
  }

  const nodeMap = new Map(placedNodes.map((n) => [n.id, n]));
  const tierMap = new Map(placedTiers.map((t) => [t.id, t]));
  const obstacles = placedNodes.map((n) => inflate(n.rect, 4));

  // Port slot counters per node/side
  const portUse = new Map<string, number>();
  const nextSlot = (key: string) => {
    const v = portUse.get(key) ?? 0;
    portUse.set(key, v + 1);
    return v;
  };

  const routed: RoutedEdge[] = [];
  edges.forEach((e, ei) => {
    const fr = resolveTargetRect(e.from, nodeMap, tierMap);
    const tr = resolveTargetRect(e.to, nodeMap, tierMap);
    if (!fr || !tr) return;
    const [fs, ts] = pickSides(fr, tr);
    const fSlot = nextSlot(`${e.from}:${fs}`);
    const tSlot = nextSlot(`${e.to}:${ts}`);
    const from = portOnSide(fr, fs, fSlot, 4);
    const to = portOnSide(tr, ts, tSlot, 4);

    // Channel through gutter between columns/rows
    const channelX =
      fs === "right" || ts === "left"
        ? (fs === "right" ? fr.x + fr.w : from.x) +
          ((ts === "left" ? tr.x : to.x) - (fs === "right" ? fr.x + fr.w : from.x)) * (0.35 + (ei % 3) * 0.12)
        : undefined;
    const channelY =
      fs === "bottom" || ts === "top"
        ? (fs === "bottom" ? fr.y + fr.h : from.y) +
          ((ts === "top" ? tr.y : to.y) - (fs === "bottom" ? fr.y + fr.h : from.y)) * (0.35 + (ei % 3) * 0.12)
        : undefined;

    const obs = obstacles.filter((o) => {
      // don't treat endpoints as obstacles for their own ports
      const fn = nodeMap.get(e.from);
      const tn = nodeMap.get(e.to);
      if (fn && intersects(o, inflate(fn.rect, 1))) return false;
      if (tn && intersects(o, inflate(tn.rect, 1))) return false;
      return true;
    });

    const points = routeOrthogonal(from, to, obs, channelX, channelY);
    let labelAt = longestSegmentMid(points);
    // Nudge label into clear gutter if it sits on a card
    for (const o of obstacles) {
      if (pointInRect(labelAt, o, 8)) {
        labelAt = { x: labelAt.x, y: o.y - 14 };
        if (pointInRect(labelAt, o, 8)) labelAt = { x: o.x + o.w + 14, y: labelAt.y };
        break;
      }
    }
    let badgeAt: Point | undefined;
    if (e.step != null) {
      // Place badge near the start of the route, offset into gutter (not on card)
      const p0 = points[0];
      const p1 = points[1] ?? points[0];
      const dx = Math.sign(p1.x - p0.x) || 0;
      const dy = Math.sign(p1.y - p0.y) || 0;
      badgeAt = { x: p0.x + dx * 28, y: p0.y + dy * 28 };
      // Prefer above horizontal segments
      if (dy === 0) badgeAt = { x: badgeAt.x, y: badgeAt.y - 18 };
      else badgeAt = { x: badgeAt.x + 18, y: badgeAt.y };
    }
    routed.push({
      from: e.from,
      to: e.to,
      kind: (e.kind ?? "sync") as EdgeKind,
      label: e.label,
      step: e.step,
      points,
      labelAt,
      badgeAt,
    });
  });

  const freeExtra = free.length ? CARD_H + 24 : 0;
  const finalContentH = Math.max(alignedH, contentH) + freeExtra;
  const width = sidebarX + SIDEBAR_W + MARGIN;
  const height = contentY + finalContentH + MARGIN;

  return {
    width,
    height,
    title: input.title,
    subtitle: input.subtitle,
    nodes: placedNodes,
    tiers: placedTiers,
    edges: routed,
    steps,
    legend: input.legend ?? [
      { label: "Sync / request", kind: "sync" },
      { label: "Async / event", kind: "async" },
      { label: "Data path", kind: "data" },
    ],
    content: { x: contentX, y: contentY, w: contentW, h: finalContentH },
    sidebar: { ...sidebar, h: finalContentH },
    titleRect,
  };
}

/** Test helpers */
export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return intersects(inflate(a, -gap / 2), inflate(b, -gap / 2));
}

export function edgeHitsCards(edge: RoutedEdge, cards: Rect[], pad = 2): boolean {
  for (let i = 0; i < edge.points.length - 1; i++) {
    const a = edge.points[i];
    const b = edge.points[i + 1];
    for (let k = 1; k < 10; k++) {
      const t = k / 10;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      for (const c of cards) {
        if (pointInRect(p, c, -pad)) return true;
      }
    }
  }
  return false;
}
