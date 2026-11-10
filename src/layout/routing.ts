import type { DiagramEdge } from "../types.js";
import type { PlacedNode, PlacedTier, Point, Rect, RoutedEdge, RoutingQuality } from "./types.js";

export const EDGE_CLEARANCE = 10;
export const TRACK_SPACING = 10;
const EPS = 1e-6;
const BEND_COST = 24;
const CROSSING_COST = 1000;
type Side = "left" | "right" | "top" | "bottom";
interface Segment { a: Point; b: Point }
interface Port { point: Point; escape: Point; side: Side }
interface Connection { edge: DiagramEdge; index: number; key: string; from: Port; to: Port }

export class RoutingCapacityError extends Error {}

export function inflateRect(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad };
}

export function rectanglesIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS &&
    a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;
}

/** Boundary contact is allowed; crossing any part of the interior is not. */
export function segmentHitsRect(a: Point, b: Point, r: Rect): boolean {
  if (Math.abs(a.y - b.y) < EPS) {
    return a.y > r.y + EPS && a.y < r.y + r.h - EPS &&
      Math.max(a.x, b.x) > r.x + EPS && Math.min(a.x, b.x) < r.x + r.w - EPS;
  }
  if (Math.abs(a.x - b.x) < EPS) {
    return a.x > r.x + EPS && a.x < r.x + r.w - EPS &&
      Math.max(a.y, b.y) > r.y + EPS && Math.min(a.y, b.y) < r.y + r.h - EPS;
  }
  throw new Error("Architecture routing requires orthogonal segments");
}

function segments(points: Point[]): Segment[] {
  return points.slice(1).map((b, i) => ({ a: points[i], b }));
}

function distance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function center(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function edgeKey(e: DiagramEdge): string {
  return JSON.stringify([e.from, e.to, e.kind ?? "sync", e.label ?? "", e.step ?? null]);
}

function sides(from: Rect, to: Rect, self: boolean): [Side, Side] {
  if (self) return ["right", "top"];
  const a = center(from);
  const b = center(to);
  if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
    return b.x >= a.x ? ["right", "left"] : ["left", "right"];
  }
  return b.y >= a.y ? ["bottom", "top"] : ["top", "bottom"];
}

function makePort(r: Rect, side: Side, slot: number, count: number): Port {
  const t = (slot + 1) / (count + 1);
  const point = side === "left" ? { x: r.x, y: r.y + r.h * t }
    : side === "right" ? { x: r.x + r.w, y: r.y + r.h * t }
    : side === "top" ? { x: r.x + r.w * t, y: r.y }
    : { x: r.x + r.w * t, y: r.y + r.h };
  const escape = {
    x: point.x + (side === "left" ? -EDGE_CLEARANCE : side === "right" ? EDGE_CLEARANCE : 0),
    y: point.y + (side === "top" ? -EDGE_CLEARANCE : side === "bottom" ? EDGE_CLEARANCE : 0),
  };
  return { point, escape, side };
}

function assignPorts(edges: DiagramEdge[], nodes: PlacedNode[], tiers: PlacedTier[]): Connection[] {
  const rects = new Map([...tiers, ...nodes].map((n) => [n.id, n.rect]));
  const requests = new Map<string, {
    index: number; end: "from" | "to"; rect: Rect; side: Side; order: number; key: string;
  }[]>();
  const ports: { from?: Port; to?: Port }[] = edges.map(() => ({}));
  edges.forEach((edge, index) => {
    const from = rects.get(edge.from);
    const to = rects.get(edge.to);
    if (!from || !to) throw new Error(`Cannot route edge "${edge.from}" -> "${edge.to}": endpoint is not placed`);
    const [fs, ts] = sides(from, to, edge.from === edge.to);
    for (const [end, id, rect, side, other] of [
      ["from", edge.from, from, fs, to],
      ["to", edge.to, to, ts, from],
    ] as const) {
      const key = JSON.stringify([id, side]);
      const list = requests.get(key) ?? [];
      const c = center(other);
      list.push({ index, end, rect, side, order: side === "left" || side === "right" ? c.y : c.x, key: edgeKey(edge) });
      requests.set(key, list);
    }
  });
  for (const list of requests.values()) {
    list.sort((a, b) => a.order - b.order || compareText(a.key, b.key) || compareText(a.end, b.end));
    list.forEach((r, slot) => {
      ports[r.index][r.end] = makePort(r.rect, r.side, slot, list.length);
    });
  }
  return edges.map((edge, index) => {
    const { from, to } = ports[index];
    if (!from || !to) throw new Error("Incomplete port assignment");
    return { edge, index, key: edgeKey(edge), from, to };
  });
}

function compact(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const p = { x: Math.round(point.x * 1e6) / 1e6, y: Math.round(point.y * 1e6) / 1e6 };
    if (out.length && distance(out[out.length - 1], p) === 0) continue;
    while (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      if ((a.x === b.x && b.x === p.x && (b.y - a.y) * (p.y - b.y) >= 0) ||
        (a.y === b.y && b.y === p.y && (b.x - a.x) * (p.x - b.x) >= 0)) out.pop();
      else break;
    }
    out.push(p);
  }
  return out;
}

function interaction(a: Segment, b: Segment): { overlap: number; crossing?: Point; close: number } {
  const ah = Math.abs(a.a.y - a.b.y) < EPS;
  const bh = Math.abs(b.a.y - b.b.y) < EPS;
  if (ah === bh) {
    const gap = Math.abs(ah ? a.a.y - b.a.y : a.a.x - b.a.x);
    const lo = Math.max(Math.min(ah ? a.a.x : a.a.y, ah ? a.b.x : a.b.y),
      Math.min(ah ? b.a.x : b.a.y, ah ? b.b.x : b.b.y));
    const hi = Math.min(Math.max(ah ? a.a.x : a.a.y, ah ? a.b.x : a.b.y),
      Math.max(ah ? b.a.x : b.a.y, ah ? b.b.x : b.b.y));
    const length = Math.max(0, hi - lo);
    return {
      overlap: gap < EPS ? length : 0,
      close: gap >= EPS && gap < TRACK_SPACING - EPS ? length * (1 - gap / TRACK_SPACING) : 0,
    };
  }
  const h = ah ? a : b;
  const v = ah ? b : a;
  const p = { x: v.a.x, y: h.a.y };
  const crossing = p.x >= Math.min(h.a.x, h.b.x) - EPS && p.x <= Math.max(h.a.x, h.b.x) + EPS &&
    p.y >= Math.min(v.a.y, v.b.y) - EPS && p.y <= Math.max(v.a.y, v.b.y) + EPS ? p : undefined;
  return { overlap: 0, crossing, close: 0 };
}

function interactionCost(a: Segment, b: Segment): number {
  const hit = interaction(a, b);
  return hit.overlap * 2000 + hit.close * 80 + (hit.crossing ? CROSSING_COST : 0);
}

export function measureRouting(edges: Pick<RoutedEdge, "points">[]): RoutingQuality {
  const result: RoutingQuality = { crossings: 0, overlapLength: 0, closeParallelLength: 0, length: 0, bends: 0 };
  const lines = edges.map((e) => segments(e.points));
  lines.forEach((line, i) => {
    result.bends += Math.max(0, line.length - 1);
    for (const s of line) result.length += distance(s.a, s.b);
    for (let j = 0; j < i; j++) {
      const crossings = new Set<string>();
      for (const a of line) for (const b of lines[j]) {
        const hit = interaction(a, b);
        result.overlapLength += hit.overlap;
        result.closeParallelLength += hit.close;
        if (hit.crossing) crossings.add(`${hit.crossing.x.toFixed(6)},${hit.crossing.y.toFixed(6)}`);
      }
      result.crossings += crossings.size;
    }
  });
  for (const key of ["length", "overlapLength", "closeParallelLength"] as const) {
    result[key] = Math.round(result[key] * 1e6) / 1e6;
  }
  return result;
}

function qualityCost(paths: Point[][]): number {
  const q = measureRouting(paths.map((points) => ({ points })));
  return q.length + q.bends * BEND_COST + q.crossings * CROSSING_COST + q.overlapLength * 2000 + q.closeParallelLength * 80;
}

interface QueueItem { state: number; cost: number; priority: number }
class MinHeap {
  private items: QueueItem[] = [];
  private less(a: QueueItem, b: QueueItem): boolean {
    return a.priority < b.priority || (a.priority === b.priority && a.state < b.state);
  }
  push(item: QueueItem): void {
    let i = this.items.length;
    this.items.push(item);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(item, this.items[p])) break;
      this.items[i] = this.items[p];
      i = p;
    }
    this.items[i] = item;
  }
  pop(): QueueItem | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (!this.items.length || !last) return first;
    let i = 0;
    while (2 * i + 1 < this.items.length) {
      let child = 2 * i + 1;
      if (child + 1 < this.items.length && this.less(this.items[child + 1], this.items[child])) child++;
      if (!this.less(this.items[child], last)) break;
      this.items[i] = this.items[child];
      i = child;
    }
    this.items[i] = last;
    return first;
  }
}

/** Compressed rectilinear visibility grid, including parallel tracks in free corridors. */
class VisibilityGrid {
  private xs: number[];
  private ys: number[];
  private links: Uint8Array;
  private nx: number;
  private count: number;
  constructor(obstacles: Rect[], connections: Connection[], bounds: Rect) {
    const coordinates = (axis: "x" | "y"): number[] => {
      const low = bounds[axis];
      const high = low + (axis === "x" ? bounds.w : bounds.h);
      const values = [low, high];
      for (const r of obstacles) {
        const a = r[axis];
        const b = a + (axis === "x" ? r.w : r.h);
        values.push(a, b);
        for (let i = 1; i <= 2; i++) values.push(a - i * TRACK_SPACING, b + i * TRACK_SPACING);
      }
      for (const c of connections) values.push(c.from.escape[axis], c.to.escape[axis]);
      const sorted = [...new Set(values.filter((v) => v >= low && v <= high))].sort((a, b) => a - b);
      // Fill wide channels without rasterizing the entire canvas.
      const extra: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1];
        const b = sorted[i];
        if (b - a > TRACK_SPACING * 2) extra.push(a + TRACK_SPACING, b - TRACK_SPACING, (a + b) / 2);
      }
      return [...new Set([...sorted, ...extra])].sort((a, b) => a - b);
    };
    this.xs = coordinates("x");
    this.ys = coordinates("y");
    this.nx = this.xs.length;
    this.count = this.nx * this.ys.length;
    this.links = new Uint8Array(this.count);
    for (let id = 0; id < this.count; id++) {
      const a = this.point(id);
      for (const [next, mask] of [[id % this.nx + 1 < this.nx ? id + 1 : -1, 1],
        [id + this.nx < this.count ? id + this.nx : -1, 2]]) {
        if (next >= 0 && !obstacles.some((r) => segmentHitsRect(a, this.point(next), r))) this.links[id] |= mask;
      }
    }
  }
  private point(id: number): Point {
    return { x: this.xs[id % this.nx], y: this.ys[Math.floor(id / this.nx)] };
  }
  route(c: Connection, occupied: Segment[]): Point[] {
    const idOf = (p: Point) => this.ys.indexOf(p.y) * this.nx + this.xs.indexOf(p.x);
    const start = idOf(c.from.escape);
    const goal = idOf(c.to.escape);
    const outward = (side: Side) => side === "right" ? 0 : side === "bottom" ? 1 : side === "left" ? 2 : 3;
    const endDirection = (outward(c.to.side) + 2) % 4;
    const startState = start * 4 + outward(c.from.side);
    const costs = new Float64Array(this.count * 4).fill(Infinity);
    const previous = new Int32Array(this.count * 4).fill(-1);
    const penalties = new Float64Array(this.count * 2).fill(-1);
    const heap = new MinHeap();
    costs[startState] = 0;
    heap.push({ state: startState, cost: 0, priority: distance(c.from.escape, c.to.escape) });
    let bestState = -1;
    let best = Infinity;
    while (true) {
      const item = heap.pop();
      if (!item || item.priority >= best) break;
      if (item.cost > costs[item.state] + EPS) continue;
      const id = Math.floor(item.state / 4);
      const oldDirection = item.state % 4;
      if (id === goal && oldDirection !== (endDirection + 2) % 4) {
        const total = item.cost + (oldDirection === endDirection ? 0 : BEND_COST);
        if (total < best) { best = total; bestState = item.state; }
        continue;
      }
      const a = this.point(id);
      const neighbors = [
        [id + 1, 0, id, 1], [id - 1, 2, id - 1, 1],
        [id + this.nx, 1, id, 2], [id - this.nx, 3, id - this.nx, 2],
      ];
      for (const [next, direction, link, mask] of neighbors) {
        if (direction === (oldDirection + 2) % 4) continue;
        if (link < 0 || next < 0 || next >= this.count || !(this.links[link] & mask)) continue;
        const newAxis = direction % 2;
        if (newAxis === 0 && Math.floor(next / this.nx) !== Math.floor(id / this.nx)) continue;
        const b = this.point(next);
        const penaltyId = link * 2 + newAxis;
        if (penalties[penaltyId] < 0) {
          penalties[penaltyId] = occupied.reduce((sum, s) => sum + interactionCost({ a, b }, s), 0);
        }
        const cost = item.cost + distance(a, b) + penalties[penaltyId] + (oldDirection === direction ? 0 : BEND_COST);
        const state = next * 4 + direction;
        if (cost < costs[state] - EPS) {
          costs[state] = cost;
          previous[state] = item.state;
          heap.push({ state, cost, priority: cost + distance(b, c.to.escape) });
        }
      }
    }
    if (bestState < 0) throw new RoutingCapacityError(`No clear orthogonal route for "${c.edge.from}" -> "${c.edge.to}"`);
    const path: Point[] = [];
    for (let state = bestState; state >= 0; state = previous[state]) path.push(this.point(Math.floor(state / 4)));
    return compact([c.from.point, ...path.reverse(), c.to.point]);
  }
}

export function edgeLabelSize(text: string): { w: number; h: number } {
  // Budget conservatively for capitals, wide Latin glyphs, CJK, and emoji.
  const width = [...text].reduce((sum, c) => sum + (
    c.codePointAt(0)! > 0xffff ? 16 : c.codePointAt(0)! > 0xff || /[MW@%]/.test(c) ? 12
      : /[mw]/.test(c) ? 10 : /[A-Z]/.test(c) ? 9.5 : 7.4
  ), 0);
  return { w: Math.max(36, width + 18), h: 22 };
}

function annotationRect(p: Point, w: number, h: number): Rect {
  return { x: p.x - w / 2, y: p.y - h / 2, w, h };
}

function within(r: Rect, bounds: Rect): boolean {
  return r.x >= bounds.x && r.y >= bounds.y && r.x + r.w <= bounds.x + bounds.w &&
    r.y + r.h <= bounds.y + bounds.h;
}

function placeAnnotations(
  edge: RoutedEdge, otherLines: Segment[], obstacles: Rect[], bounds: Rect, reserved: Rect[],
): Rect[] {
  const occupied = [...reserved];
  const placed: Rect[] = [];
  const line = segments(edge.points).sort((a, b) => distance(b.a, b.b) - distance(a.a, a.b));
  const place = (w: number, h: number, badge: boolean): Point => {
    const candidates: { p: Point; cost: number }[] = [];
    line.forEach((s, si) => {
      const horizontal = Math.abs(s.a.y - s.b.y) < EPS;
      const length = distance(s.a, s.b);
      const endInset = ((horizontal ? w : h) / 2 + 8) / length;
      const positions = [0.5, 0.25, 0.75, 0.125, 0.875, endInset, 1 - endInset].filter((t) => t > 0 && t < 1);
      for (const t of positions) {
        const x = s.a.x + (s.b.x - s.a.x) * t;
        const y = s.a.y + (s.b.y - s.a.y) * t;
        // A pill may sit on its own segment, but never hide another connection.
        const offsets = badge ? [-h / 2 - 6, h / 2 + 6, 0, -h / 2 - 18, h / 2 + 18]
          : [0, -h / 2 - 6, h / 2 + 6];
        for (const offset of offsets) {
          const shift = horizontal ? offset : offset === 0 ? 0 : Math.sign(offset) * (w / 2 + 6);
          const p = { x: x + (horizontal ? 0 : shift), y: y + (horizontal ? shift : 0) };
          const rect = annotationRect(p, w, h);
          const padded = inflateRect(rect, 4);
          if (!within(padded, bounds) || obstacles.some((o) => rectanglesIntersect(padded, o)) ||
            occupied.some((o) => rectanglesIntersect(padded, o)) ||
            otherLines.some((s) => segmentHitsRect(s.a, s.b, padded))) continue;
          // Avoid covering bends or another part of this edge.
          if (segments(edge.points).some((other) =>
            (other.a !== s.a || other.b !== s.b) && segmentHitsRect(other.a, other.b, padded))) continue;
          candidates.push({ p, cost: si * 8 + Math.abs(t - 0.5) * 20 + Math.abs(shift) +
            Math.max(0, (horizontal ? w : h) + 12 - length) * 2 });
        }
      }
    });
    candidates.sort((a, b) => a.cost - b.cost || a.p.y - b.p.y || a.p.x - b.p.x);
    if (!candidates.length) {
      throw new RoutingCapacityError(`No collision-free ${badge ? "step badge" : "label"} position for "${edge.from}" -> "${edge.to}"`);
    }
    const p = candidates[0].p;
    const rect = annotationRect(p, w, h);
    occupied.push(rect);
    placed.push(rect);
    return p;
  };
  if (edge.label) {
    const size = edgeLabelSize(edge.label);
    if (edge.step != null) {
      const p = place(size.w + 36, 28, false);
      edge.labelAt = { x: p.x + 18, y: p.y };
      edge.badgeAt = { x: p.x - size.w / 2 - 4, y: p.y };
    } else edge.labelAt = place(size.w, size.h, false);
  } else if (edge.step != null) edge.badgeAt = place(28, 28, true);
  return placed;
}

export function tierHeaderRect(tier: PlacedTier): Rect {
  return { x: tier.rect.x + 8, y: tier.rect.y + 4, w: tier.rect.w - 16, h: 24 };
}

export function routeArchitectureEdges(
  edges: DiagramEdge[], nodes: PlacedNode[], tiers: PlacedTier[], bounds: Rect,
): { edges: RoutedEdge[]; quality: RoutingQuality } {
  const connections = assignPorts(edges, nodes, tiers);
  const headers = tiers.map(tierHeaderRect);
  const obstacles = [...nodes.map((n) => inflateRect(n.rect, EDGE_CLEARANCE)), ...headers];
  for (const c of connections) {
    for (const [id, port] of [[c.edge.from, c.from], [c.edge.to, c.to]] as const) {
      if (!within(annotationRect(port.escape, 0, 0), bounds) ||
        nodes.some((n) => n.id !== id && segmentHitsRect(port.point, port.escape, inflateRect(n.rect, EDGE_CLEARANCE))) ||
        headers.some((r) => segmentHitsRect(port.point, port.escape, r))) {
        throw new RoutingCapacityError(`Blocked port on "${id}"`);
      }
    }
  }
  const order = [...connections].sort((a, b) =>
    (b.edge.label ? edgeLabelSize(b.edge.label).w : 0) - (a.edge.label ? edgeLabelSize(a.edge.label).w : 0) ||
    distance(b.from.escape, b.to.escape) - distance(a.from.escape, a.to.escape) || compareText(a.key, b.key));
  const paths: Point[][] = edges.map(() => []);
  const reservations: Rect[][] = edges.map(() => []);
  const routed: RoutedEdge[] = connections.map((c) => ({
    ...c.edge, kind: c.edge.kind ?? "sync", points: [], labelAt: c.from.escape,
  }));
  const route = (c: Connection): { edge: RoutedEdge; rects: Rect[] } => {
    const reserved = reservations.flatMap((r, i) => i === c.index ? [] : r);
    const graph = new VisibilityGrid([...obstacles, ...reserved.map((r) => inflateRect(r, 4))], connections, bounds);
    const occupied = paths.flatMap((p, i) => i === c.index ? [] : segments(p));
    const points = graph.route(c, occupied);
    const edge: RoutedEdge = { ...c.edge, kind: c.edge.kind ?? "sync", points, labelAt: c.from.escape };
    // Reserve all endpoint escape stubs, including connections not routed yet.
    const stubs = connections.flatMap((other) => other.index === c.index ? [] : [
      { a: other.from.point, b: other.from.escape }, { a: other.to.point, b: other.to.escape },
    ]);
    const rects = placeAnnotations(edge, [...occupied, ...stubs],
      [...nodes.map((n) => inflateRect(n.rect, 2)), ...headers], bounds, reserved);
    return { edge, rects };
  };
  for (const c of order) {
    const candidate = route(c);
    paths[c.index] = candidate.edge.points;
    reservations[c.index] = candidate.rects;
    routed[c.index] = candidate.edge;
  }
  // Coordinate descent accepts only global improvements, avoiding rerouting oscillation.
  let score = qualityCost(paths);
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    const conflicts = (c: Connection): number => {
      const own = segments(paths[c.index]);
      return paths.reduce((sum, p, i) => i === c.index ? sum :
        sum + own.reduce((s, a) => s + segments(p).reduce((v, b) => v + interactionCost(a, b), 0), 0), 0);
    };
    const ranked = order.map((c) => ({ c, cost: conflicts(c) }))
      .sort((a, b) => b.cost - a.cost || compareText(a.c.key, b.c.key));
    for (const { c, cost } of ranked) {
      if (cost < EPS) continue;
      const old = paths[c.index];
      let candidate: { edge: RoutedEdge; rects: Rect[] };
      try {
        candidate = route(c);
      } catch (error) {
        // A rejected optimization must not discard the existing valid route/annotations.
        if (error instanceof RoutingCapacityError) continue;
        throw error;
      }
      paths[c.index] = candidate.edge.points;
      const next = qualityCost(paths);
      if (next < score - EPS) {
        score = next;
        improved = true;
        routed[c.index] = candidate.edge;
        reservations[c.index] = candidate.rects;
      }
      else paths[c.index] = old;
    }
    if (!improved) break;
  }
  const quality = measureRouting(paths.map((points) => ({ points })));
  for (const c of connections) {
    const line = segments(paths[c.index]);
    for (let i = 0; i < line.length; i++) {
      for (let j = 0; j < i - 1; j++) {
        const hit = interaction(line[i], line[j]);
        if (hit.overlap > EPS || hit.crossing) {
          throw new RoutingCapacityError(`Self-intersecting route for "${c.edge.from}" -> "${c.edge.to}"`);
        }
      }
    }
  }
  if (quality.overlapLength > EPS) {
    throw new RoutingCapacityError(`Routing channels are congested (${quality.overlapLength.toFixed(1)}px of overlapping edges)`);
  }
  return { edges: routed, quality };
}
