/**
 * Orthogonal edge router for the architecture grid.
 *
 * - Sparse orthogonal visibility grid built from card / frame / label boundaries
 *   (lanes keep CLEARANCE px from cards, FRAME_CLR px from frame lines).
 * - A* over (grid node × heading) with bend, overlap, crossing and
 *   "foreign tier" penalties → routes never enter a card and prefer gutters.
 * - Two passes: pass 1 picks port sides, pass 2 spreads ports per side
 *   (bundling edges of the same kind/direction onto one trunk), then two
 *   rip-up-and-reroute rounds.
 * - Labels go on pills on straight segments; step badges sit on the path near
 *   the source, both placed with collision checks.
 */
import type { DiagramEdge, EdgeKind } from "../types.js";
import { measureText, type FontSpec } from "./text.js";
import { BADGE_R, type Junction, type PlacedNode, type PlacedTier, type Point, type Rect, type RoutedEdge, type Side } from "./types.js";

export const CLEARANCE = 14;
const FRAME_CLR = 10;
const LABEL_CLR = 6;
const LANE_SPACING = 14;
const MAX_LANES = 6;
const BEND = 70;
const FOREIGN = 2.5;
const OVERLAP = 400;
const CROSS = 45;
/** Fraction of a segment's length refunded when it rides a trunk of its own bundle. */
const TRUNK_DISCOUNT = 0.7;
const EDGE_LABEL_FONT: FontSpec = { font: "mono", size: 12, weight: 500 };
export const PILL_H = 22;

export interface RouteInput {
  nodes: PlacedNode[];
  tiers: PlacedTier[];
  edges: DiagramEdge[];
  area: Rect;
}

interface Zone {
  r: Rect;
  owner: string;
}

interface Endpoint {
  id: string;
  rect: Rect;
  isTier: boolean;
  /** tier ids the route may travel inside */
  allowed: Set<string>;
  /** tier interior the route must not enter (tier endpoints) */
  block?: Rect;
}

interface Port {
  p: Point;
  side: Side;
  cost: number;
}

type Dir = 0 | 1 | 2 | 3; // E W S N
const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];
const OPP: Dir[] = [1, 0, 3, 2];
const OUT: Record<Side, Dir> = { right: 0, left: 1, bottom: 2, top: 3 };

interface Grid {
  xs: number[];
  ys: number[];
  nx: number;
  ny: number;
  valid: Uint8Array;
  hFree: Uint8Array;
  vFree: Uint8Array;
  tierAt: Int16Array;
}

interface EdgeState {
  idx: number;
  e: DiagramEdge;
  kind: EdgeKind;
  from: Endpoint;
  to: Endpoint;
  srcKey: string;
  dstKey: string;
  /** intentional bundling keys (shared target / source tier + kind) */
  trunks: string[];
  fromPort?: Port;
  toPort?: Port;
  nodes: number[];
  points: Point[];
}

const inside = (p: Point, r: Rect) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
const inflate = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });

function segHitsRect(a: Point, b: Point, r: Rect): boolean {
  if (a.y === b.y) {
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    return a.y > r.y && a.y < r.y + r.h && x1 < r.x + r.w && x2 > r.x;
  }
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y, b.y);
  return a.x > r.x && a.x < r.x + r.w && y1 < r.y + r.h && y2 > r.y;
}

function lowerBound(arr: number[], v: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] < v) lo = m + 1;
    else hi = m;
  }
  return lo;
}

function axisCoords(bounds: Array<{ pos: number; clr: number }>, extra: number[], lo: number, hi: number): number[] {
  const b = [...bounds].sort((p, q) => p.pos - q.pos);
  const out: number[] = [...extra];
  for (let i = 0; i < b.length - 1; i++) {
    const a = b[i].pos + b[i].clr;
    const z = b[i + 1].pos - b[i + 1].clr;
    if (z < a) continue;
    const width = z - a;
    const n = Math.min(MAX_LANES, Math.floor(width / LANE_SPACING) + 1);
    if (n === 1) out.push((a + z) / 2);
    else for (let k = 0; k < n; k++) out.push(a + (width * k) / (n - 1));
  }
  const exact = new Set(extra.map((v) => Math.round(v * 2) / 2));
  const sorted = out
    .filter((v) => v >= lo && v <= hi)
    .map((v) => Math.round(v * 2) / 2)
    .sort((p, q) => p - q);
  const dedup: number[] = [];
  for (const v of sorted) {
    const last = dedup[dedup.length - 1];
    if (last == null || v - last > 2) dedup.push(v);
    else if (exact.has(v) && !exact.has(last)) dedup[dedup.length - 1] = v; // ports win
    else if (exact.has(v) && exact.has(last) && v !== last) dedup.push(v);
  }
  return dedup;
}

function buildGrid(zones: Zone[], frames: PlacedTier[], area: Rect, extraX: number[], extraY: number[]): Grid {
  const bx: Array<{ pos: number; clr: number }> = [
    { pos: area.x, clr: 12 },
    { pos: area.x + area.w, clr: 12 },
  ];
  const by: Array<{ pos: number; clr: number }> = [
    { pos: area.y, clr: 12 },
    { pos: area.y + area.h, clr: 12 },
  ];
  for (const z of zones) {
    const clr = z.owner.startsWith("label:") ? LABEL_CLR : 1;
    bx.push({ pos: z.r.x, clr }, { pos: z.r.x + z.r.w, clr });
    by.push({ pos: z.r.y, clr }, { pos: z.r.y + z.r.h, clr });
  }
  for (const t of frames) {
    bx.push({ pos: t.rect.x, clr: FRAME_CLR }, { pos: t.rect.x + t.rect.w, clr: FRAME_CLR });
    by.push({ pos: t.rect.y, clr: FRAME_CLR }, { pos: t.rect.y + t.rect.h, clr: FRAME_CLR });
  }
  const xs = axisCoords(bx, extraX, area.x, area.x + area.w);
  const ys = axisCoords(by, extraY, area.y, area.y + area.h);
  const nx = xs.length;
  const ny = ys.length;
  const valid = new Uint8Array(nx * ny).fill(1);
  const hFree = new Uint8Array(nx * ny).fill(1);
  const vFree = new Uint8Array(nx * ny).fill(1);
  for (let i = 0; i < nx; i++) hFree[(ny - 1) * nx + i] = 1;
  for (const z of zones) {
    const r = z.r;
    const i0 = lowerBound(xs, r.x);
    const i1 = lowerBound(xs, r.x + r.w);
    const j0 = lowerBound(ys, r.y);
    const j1 = lowerBound(ys, r.y + r.h);
    // nodes strictly inside
    for (let j = j0; j < j1; j++) {
      if (!(ys[j] > r.y && ys[j] < r.y + r.h)) continue;
      for (let i = i0; i < i1; i++) if (xs[i] > r.x && xs[i] < r.x + r.w) valid[j * nx + i] = 0;
      // horizontal segments crossing the zone on this row
      for (let i = Math.max(0, i0 - 1); i < Math.min(nx - 1, i1 + 1); i++) {
        if (xs[i] < r.x + r.w && xs[i + 1] > r.x) hFree[j * nx + i] = 0;
      }
    }
    for (let i = i0; i < i1; i++) {
      if (!(xs[i] > r.x && xs[i] < r.x + r.w)) continue;
      for (let j = Math.max(0, j0 - 1); j < Math.min(ny - 1, j1 + 1); j++) {
        if (ys[j] < r.y + r.h && ys[j + 1] > r.y) vFree[j * nx + i] = 0;
      }
    }
  }
  const tierAt = new Int16Array(nx * ny).fill(-1);
  const order = frames.map((t, k) => ({ t, k })).sort((a, b) => a.t.depth - b.t.depth);
  for (const { t, k } of order) {
    const r = t.rect;
    for (let j = lowerBound(ys, r.y); j < ny && ys[j] < r.y + r.h; j++) {
      if (ys[j] <= r.y) continue;
      for (let i = lowerBound(xs, r.x); i < nx && xs[i] < r.x + r.w; i++) {
        if (xs[i] > r.x) tierAt[j * nx + i] = k;
      }
    }
  }
  return { xs, ys, nx, ny, valid, hFree, vFree, tierAt };
}

class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const k = this.k;
    const v = this.v;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const k = this.k;
    const v = this.v;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

interface Occupancy {
  h: Map<number, number[]>;
  v: Map<number, number[]>;
  nodeH: Map<number, number[]>;
  nodeV: Map<number, number[]>;
}

function addOcc(m: Map<number, number[]>, key: number, e: number) {
  const a = m.get(key);
  if (a) a.push(e);
  else m.set(key, [e]);
}
function delOcc(m: Map<number, number[]>, key: number, e: number) {
  const a = m.get(key);
  if (!a) return;
  const i = a.indexOf(e);
  if (i >= 0) a.splice(i, 1);
}

function forEachUnit(g: Grid, nodes: number[], fn: (seg: number, horiz: boolean, a: number, b: number) => void) {
  for (let k = 0; k < nodes.length - 1; k++) {
    const a = nodes[k];
    const b = nodes[k + 1];
    const ai = a % g.nx;
    const aj = (a / g.nx) | 0;
    const bi = b % g.nx;
    const bj = (b / g.nx) | 0;
    if (aj === bj) fn(aj * g.nx + Math.min(ai, bi), true, a, b);
    else fn(Math.min(aj, bj) * g.nx + ai, false, a, b);
  }
}

function registerOcc(g: Grid, occ: Occupancy, es: EdgeState, add: boolean) {
  const f = add ? addOcc : delOcc;
  forEachUnit(g, es.nodes, (seg, horiz, a, b) => {
    f(horiz ? occ.h : occ.v, seg, es.idx);
    f(horiz ? occ.nodeH : occ.nodeV, a, es.idx);
    f(horiz ? occ.nodeH : occ.nodeV, b, es.idx);
  });
}

function stubNode(g: Grid, port: Port, zones: Zone[], ownerId: string): number | null {
  const d = OUT[port.side];
  const p = port.p;
  if (d <= 1) {
    const j = lowerBound(g.ys, p.y - 0.25);
    if (j >= g.ny || Math.abs(g.ys[j] - p.y) > 0.5) return null;
    let i = d === 0 ? lowerBound(g.xs, p.x + 0.5) : lowerBound(g.xs, p.x - 0.5) - 1;
    for (let steps = 0; i >= 0 && i < g.nx && steps < 12; steps++, i += DX[d]) {
      const n = j * g.nx + i;
      const q = { x: g.xs[i], y: p.y };
      if (Math.abs(q.x - p.x) > 80) return null;
      const blocked = zones.some((z) => z.owner !== ownerId && segHitsRect(p, q, z.r));
      if (blocked) return null;
      if (g.valid[n]) return n;
    }
    return null;
  }
  const i = lowerBound(g.xs, p.x - 0.25);
  if (i >= g.nx || Math.abs(g.xs[i] - p.x) > 0.5) return null;
  let j = d === 2 ? lowerBound(g.ys, p.y + 0.5) : lowerBound(g.ys, p.y - 0.5) - 1;
  for (let steps = 0; j >= 0 && j < g.ny && steps < 12; steps++, j += DY[d]) {
    const n = j * g.nx + i;
    const q = { x: p.x, y: g.ys[j] };
    if (Math.abs(q.y - p.y) > 80) return null;
    const blocked = zones.some((z) => z.owner !== ownerId && segHitsRect(p, q, z.r));
    if (blocked) return null;
    if (g.valid[n]) return n;
  }
  return null;
}

interface SearchResult {
  nodes: number[];
  fromPort: Port;
  toPort: Port;
  cost: number;
}

function search(
  g: Grid,
  es: EdgeState,
  srcPorts: Port[],
  dstPorts: Port[],
  zones: Zone[],
  tierIndex: Map<string, number>,
  occ: Occupancy,
  all: EdgeState[],
): SearchResult | null {
  const N = g.nx * g.ny;
  const dist = new Float64Array(N * 4).fill(Infinity);
  const parent = new Int32Array(N * 4).fill(-1);
  const startPort = new Int16Array(N * 4).fill(-1);
  const heap = new Heap();

  const allowed = new Uint8Array(Math.max(1, tierIndex.size));
  for (const id of [...es.from.allowed, ...es.to.allowed]) {
    const k = tierIndex.get(id);
    if (k != null) allowed[k] = 1;
  }
  const blocks = [es.from.block, es.to.block].filter((b): b is Rect => !!b);
  const foreign = (n: number) => g.tierAt[n] >= 0 && !allowed[g.tierAt[n]];

  const goals = new Map<number, Array<{ k: number; dir: Dir; stub: number }>>();
  dstPorts.forEach((port, k) => {
    const n = stubNode(g, port, zones, es.to.id);
    if (n == null) return;
    const q = { x: g.xs[n % g.nx], y: g.ys[(n / g.nx) | 0] };
    const stub = Math.abs(q.x - port.p.x) + Math.abs(q.y - port.p.y);
    const list = goals.get(n) ?? [];
    list.push({ k, dir: OPP[OUT[port.side]], stub });
    goals.set(n, list);
  });
  if (!goals.size) return null;
  const goalPts = [...goals.keys()].map((n) => ({ x: g.xs[n % g.nx], y: g.ys[(n / g.nx) | 0] }));
  const h = (n: number) => {
    const x = g.xs[n % g.nx];
    const y = g.ys[(n / g.nx) | 0];
    let best = Infinity;
    for (const p of goalPts) best = Math.min(best, Math.abs(p.x - x) + Math.abs(p.y - y));
    return best;
  };

  srcPorts.forEach((port, k) => {
    const n = stubNode(g, port, zones, es.from.id);
    if (n == null) return;
    const q = { x: g.xs[n % g.nx], y: g.ys[(n / g.nx) | 0] };
    if (blocks.some((b) => segHitsRect(port.p, q, b))) return;
    const d = OUT[port.side];
    const c = port.cost + Math.abs(q.x - port.p.x) + Math.abs(q.y - port.p.y);
    const s = n * 4 + d;
    if (c < dist[s]) {
      dist[s] = c;
      startPort[s] = k;
      heap.push(c + h(n), s);
    }
  });

  const shares = (other: number) => {
    const o = all[other];
    return o.srcKey === es.srcKey || o.dstKey === es.dstKey || o.trunks.some((k) => es.trunks.includes(k));
  };

  let best: { cost: number; state: number; goalK: number } | null = null;
  let expansions = 0;
  while (heap.size) {
    const [f, s] = heap.pop();
    if (best && f >= best.cost) break;
    const gcost = dist[s];
    if (f - h((s / 4) | 0) > gcost + 1e-6) continue; // stale
    if (++expansions > 400000) break;
    const n = (s / 4) | 0;
    const d = (s % 4) as Dir;
    const gl = goals.get(n);
    if (gl) {
      for (const gg of gl) {
        if (gg.dir === OPP[d]) continue;
        const port = dstPorts[gg.k];
        const total = gcost + gg.stub + port.cost + (gg.dir === d ? 0 : BEND);
        if (!best || total < best.cost) best = { cost: total, state: s, goalK: gg.k };
      }
    }
    const i = n % g.nx;
    const j = (n / g.nx) | 0;
    for (let nd = 0 as Dir; nd < 4; nd = (nd + 1) as Dir) {
      if (nd === OPP[d]) continue;
      let m: number;
      let seg: number;
      const horiz = nd <= 1;
      if (nd === 0) {
        if (i + 1 >= g.nx) continue;
        seg = j * g.nx + i;
        if (!g.hFree[seg]) continue;
        m = n + 1;
      } else if (nd === 1) {
        if (i - 1 < 0) continue;
        seg = j * g.nx + i - 1;
        if (!g.hFree[seg]) continue;
        m = n - 1;
      } else if (nd === 2) {
        if (j + 1 >= g.ny) continue;
        seg = j * g.nx + i;
        if (!g.vFree[seg]) continue;
        m = n + g.nx;
      } else {
        if (j - 1 < 0) continue;
        seg = (j - 1) * g.nx + i;
        if (!g.vFree[seg]) continue;
        m = n - g.nx;
      }
      if (!g.valid[m]) continue;
      const a = { x: g.xs[i], y: g.ys[j] };
      const b = { x: g.xs[m % g.nx], y: g.ys[(m / g.nx) | 0] };
      if (blocks.length && blocks.some((r) => segHitsRect(a, b, r) || inside(b, r))) continue;
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      let c = len;
      if (nd !== d) c += BEND;
      if (foreign(n) || foreign(m)) c += len * FOREIGN;
      const o = (horiz ? occ.h : occ.v).get(seg);
      if (o && o.length) {
        let shared = false;
        let other = false;
        for (const e of o) {
          if (e === es.idx) continue;
          if (shares(e)) shared = true;
          else other = true;
        }
        if (other) c += OVERLAP + len * 4;
        else if (shared) c -= len * TRUNK_DISCOUNT;
      }
      const cross = (horiz ? occ.nodeV : occ.nodeH).get(m);
      if (cross && cross.some((e) => e !== es.idx && !shares(e))) c += CROSS;
      const ns = m * 4 + nd;
      const nc = gcost + c;
      if (nc < dist[ns]) {
        dist[ns] = nc;
        parent[ns] = s;
        startPort[ns] = startPort[s];
        heap.push(nc + h(m), ns);
      }
    }
  }
  if (!best) return null;
  const nodes: number[] = [];
  let s = best.state;
  const k0 = startPort[s];
  while (s >= 0) {
    nodes.push((s / 4) | 0);
    s = parent[s];
  }
  nodes.reverse();
  return { nodes, fromPort: srcPorts[k0], toPort: dstPorts[best.goalK], cost: best.cost };
}

function simplify(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push({ x: p.x, y: p.y });
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(out.length - 2, 1);
      else break;
    }
  }
  return out;
}

function center(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

const SIDES: Side[] = ["right", "left", "bottom", "top"];
const NORMAL: Record<Side, Point> = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, bottom: { x: 0, y: 1 }, top: { x: 0, y: -1 } };

function sidePoint(r: Rect, side: Side, along: number): Point {
  if (side === "left") return { x: r.x, y: along };
  if (side === "right") return { x: r.x + r.w, y: along };
  if (side === "top") return { x: along, y: r.y };
  return { x: along, y: r.y + r.h };
}

function sideRange(ep: Endpoint, side: Side, headerTop: number): [number, number] {
  const r = ep.rect;
  if (side === "left" || side === "right") {
    const lo = ep.isTier ? r.y + headerTop : r.y;
    return [lo, r.y + r.h];
  }
  return [r.x, r.x + r.w];
}

function candidatePorts(ep: Endpoint, peer: Endpoint): Port[] {
  const c = center(ep.rect);
  const pc = center(peer.rect);
  const vx = pc.x - c.x;
  const vy = pc.y - c.y;
  const len = Math.hypot(vx, vy) || 1;
  return SIDES.map((side) => {
    const nrm = NORMAL[side];
    const dot = (nrm.x * vx + nrm.y * vy) / len;
    const cost = (1 - dot) * 60;
    let along: number;
    if (ep.isTier) {
      const [lo, hi] = sideRange(ep, side, 44);
      const plo = side === "left" || side === "right" ? peer.rect.y : peer.rect.x;
      const phi = side === "left" || side === "right" ? peer.rect.y + peer.rect.h : peer.rect.x + peer.rect.w;
      const a = Math.max(lo + 20, plo + 12);
      const b = Math.min(hi - 20, phi - 12);
      if (a <= b) along = (a + b) / 2;
      else {
        const pcAxis = side === "left" || side === "right" ? pc.y : pc.x;
        along = Math.min(hi - 28, Math.max(lo + 28, pcAxis));
      }
    } else {
      along = side === "left" || side === "right" ? c.y : c.x;
    }
    return { p: sidePoint(ep.rect, side, Math.round(along)), side, cost };
  });
}

function portCoords(ports: Port[]): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of ports) {
    if (p.side === "left" || p.side === "right") ys.push(p.p.y);
    else xs.push(p.p.x);
  }
  return { xs, ys };
}

export function routeEdges(input: RouteInput): { edges: RoutedEdge[]; notes: string[]; junctions: Junction[] } {
  const notes: string[] = [];
  const { nodes, tiers, area } = input;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const tierMap = new Map(tiers.map((t) => [t.id, t]));
  const tierIndex = new Map(tiers.map((t, k) => [t.id, k]));
  const zones: Zone[] = [
    ...nodes.map((n) => ({ r: inflate(n.rect, CLEARANCE - 1), owner: n.id })),
    ...tiers.map((t) => ({ r: inflate(t.labelRect, LABEL_CLR - 1), owner: `label:${t.id}` })),
    ...tiers.filter((t) => t.tagRect).map((t) => ({ r: inflate(t.tagRect!, LABEL_CLR - 1), owner: `label:${t.id}` })),
  ];

  const chain = (tierId?: string): string[] => {
    const out: string[] = [];
    let cur = tierId;
    while (cur && tierMap.has(cur)) {
      out.push(cur);
      cur = tierMap.get(cur)!.parentId;
    }
    return out;
  };
  const trunkKeys = (e: DiagramEdge, from: Endpoint, to: Endpoint): string[] => {
    const kind = e.kind ?? "sync";
    const home = (ep: Endpoint) => (ep.isTier ? ep.id : nodeMap.get(ep.id)?.tierId ?? `free:${ep.id}`);
    const a = home(from);
    const b = home(to);
    if (a === b) return [];
    // a labelled edge keeps its own track so the pill is never ambiguous
    if (e.label) return [];
    // inside-out: edges never trunk with an edge that stays inside its own tier
    const keys: string[] = [`in:${b}:${kind}`, `out:${a}:${kind}`];
    return keys;
  };
  const endpoint = (id: string): Endpoint | undefined => {
    const n = nodeMap.get(id);
    if (n) return { id, rect: n.rect, isTier: false, allowed: new Set(chain(n.tierId)) };
    const t = tierMap.get(id);
    if (t) return { id, rect: t.rect, isTier: true, allowed: new Set(chain(t.parentId)), block: t.rect };
    return undefined;
  };

  const states: EdgeState[] = [];
  input.edges.forEach((e, k) => {
    const from = endpoint(e.from);
    const to = endpoint(e.to);
    if (!from || !to || e.from === e.to) {
      notes.push(`edge ${e.from}→${e.to} skipped (unknown endpoint or self-loop)`);
      return;
    }
    states.push({
      idx: states.length,
      e,
      kind: (e.kind ?? "sync") as EdgeKind,
      from,
      to,
      srcKey: `p1s:${k}`,
      dstKey: `p1d:${k}`,
      trunks: trunkKeys(e, from, to),
      nodes: [],
      points: [],
    });
    void k;
  });

  const dist = (s: EdgeState) => {
    const a = center(s.from.rect);
    const b = center(s.to.rect);
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  };
  const order = [...states].sort((a, b) => {
    const pa = a.from.isTier || a.to.isTier ? 0 : a.e.step != null ? 1 : 2;
    const pb = b.from.isTier || b.to.isTier ? 0 : b.e.step != null ? 1 : 2;
    return pa - pb || dist(a) - dist(b);
  });

  const emptyOcc = (): Occupancy => ({ h: new Map(), v: new Map(), nodeH: new Map(), nodeV: new Map() });

  // ── Pass 1: free side choice, centered ports ─────────────────────────────
  const cand = new Map<number, { src: Port[]; dst: Port[] }>();
  const ex: number[] = [];
  const ey: number[] = [];
  for (const s of states) {
    const src = candidatePorts(s.from, s.to);
    const dst = candidatePorts(s.to, s.from);
    cand.set(s.idx, { src, dst });
    const a = portCoords([...src, ...dst]);
    ex.push(...a.xs);
    ey.push(...a.ys);
  }
  let grid = buildGrid(zones, tiers, area, ex, ey);
  let occ = emptyOcc();
  for (const s of order) {
    const c = cand.get(s.idx)!;
    const r = search(grid, s, c.src, c.dst, zones, tierIndex, occ, states);
    if (!r) continue;
    s.fromPort = r.fromPort;
    s.toPort = r.toPort;
    s.nodes = r.nodes;
    registerOcc(grid, occ, s, true);
    s.points = simplify([r.fromPort.p, ...r.nodes.map((n) => ({ x: grid.xs[n % grid.nx], y: grid.ys[(n / grid.nx) | 0] })), r.toPort.p]);
  }

  // ── Port spreading + bundles ─────────────────────────────────────────────
  interface Use {
    s: EdgeState;
    role: "out" | "in";
    coord: number;
  }
  const uses = new Map<string, Use[]>();
  for (const s of states) {
    if (!s.fromPort || !s.toPort) continue;
    const pts = s.points;
    const axisOf = (side: Side, p: Point) => (side === "left" || side === "right" ? p.y : p.x);
    const fromProbe = pts.length >= 3 ? pts[2] : pts[pts.length - 1];
    const toProbe = pts.length >= 3 ? pts[pts.length - 3] : pts[0];
    const k1 = `${s.from.id}|${s.fromPort.side}`;
    const k2 = `${s.to.id}|${s.toPort.side}`;
    (uses.get(k1) ?? uses.set(k1, []).get(k1)!).push({ s, role: "out", coord: axisOf(s.fromPort.side, fromProbe) });
    (uses.get(k2) ?? uses.set(k2, []).get(k2)!).push({ s, role: "in", coord: axisOf(s.toPort.side, toProbe) });
  }
  const fixedFrom = new Map<number, Port>();
  const fixedTo = new Map<number, Port>();
  for (const [key, list] of uses) {
    const [id, sideStr] = key.split("|");
    const side = sideStr as Side;
    const bundles = new Map<string, Use[]>();
    for (const u of list) {
      const bk = u.s.e.label ? `${u.role}:${u.s.kind}:label:${u.s.idx}` : `${u.role}:${u.s.kind}`;
      (bundles.get(bk) ?? bundles.set(bk, []).get(bk)!).push(u);
    }
    const arr = [...bundles.entries()].map(([bk, us]) => ({
      bk,
      us,
      coord: us.reduce((t, u) => t + u.coord, 0) / us.length,
    }));
    arr.sort((a, b) => a.coord - b.coord);
    const sample = list[0];
    const ep = sample.role === "out" ? sample.s.from : sample.s.to;
    const [lo, hi] = sideRange(ep, side, 44);
    const n = arr.length;
    const span = hi - lo;
    let positions: number[];
    if (ep.isTier) {
      const firstPort = sample.role === "out" ? sample.s.fromPort! : sample.s.toPort!;
      const base = side === "left" || side === "right" ? firstPort.p.y : firstPort.p.x;
      const sp = 24;
      positions = arr.map((_, i) => base + (i - (n - 1) / 2) * sp);
      positions = positions.map((v) => Math.min(hi - 18, Math.max(lo + 18, v)));
    } else {
      const usable = span * (side === "left" || side === "right" ? 0.62 : 0.7);
      const sp = n > 1 ? Math.min(side === "left" || side === "right" ? 18 : 30, usable / (n - 1)) : 0;
      const mid = (lo + hi) / 2;
      positions = arr.map((_, i) => mid + (i - (n - 1) / 2) * sp);
    }
    arr.forEach((b, i) => {
      const p = sidePoint(ep.rect, side, Math.round(positions[i]));
      for (const u of b.us) {
        const port: Port = { p, side, cost: 0 };
        if (u.role === "out") {
          fixedFrom.set(u.s.idx, port);
          u.s.srcKey = `${id}|${side}|${b.bk}`;
        } else {
          fixedTo.set(u.s.idx, port);
          u.s.dstKey = `${id}|${side}|${b.bk}`;
        }
      }
    });
  }

  // ── Pass 2 + rip-up/reroute ──────────────────────────────────────────────
  const ports2 = [...fixedFrom.values(), ...fixedTo.values()];
  const pc = portCoords(ports2);
  grid = buildGrid(zones, tiers, area, pc.xs, pc.ys);
  occ = emptyOcc();
  const toPoints = (s: EdgeState) =>
    simplify([s.fromPort!.p, ...s.nodes.map((n) => ({ x: grid.xs[n % grid.nx], y: grid.ys[(n / grid.nx) | 0] })), s.toPort!.p]);
  const routeOne = (s: EdgeState): boolean => {
    const fp = fixedFrom.get(s.idx);
    const tp = fixedTo.get(s.idx);
    if (!fp || !tp) return false;
    let r = search(grid, s, [fp], [tp], zones, tierIndex, occ, states);
    if (!r) {
      // fall back to any side if the fixed port is boxed in
      const c = cand.get(s.idx)!;
      r = search(grid, s, [fp, ...c.src], [tp, ...c.dst], zones, tierIndex, occ, states);
    }
    if (!r) return false;
    s.fromPort = r.fromPort;
    s.toPort = r.toPort;
    s.nodes = r.nodes;
    registerOcc(grid, occ, s, true);
    s.points = toPoints(s);
    return true;
  };
  for (const s of states) s.nodes = [];
  for (const s of order) routeOne(s);
  for (let round = 0; round < 2; round++) {
    for (const s of order) {
      if (!s.nodes.length) continue;
      registerOcc(grid, occ, s, false);
      routeOne(s);
    }
  }

  // ── Snap small jogs: align a lone port with its peer so the edge runs straight
  const portUsers = (id: string, side: Side) =>
    states.filter(
      (o) => (o.from.id === id && o.fromPort?.side === side) || (o.to.id === id && o.toPort?.side === side),
    );
  for (const s of order) {
    if (!s.fromPort || !s.toPort || s.points.length < 4) continue;
    const segLen = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const tryMove = (which: "from" | "to", target: number): boolean => {
      const port = which === "from" ? s.fromPort! : s.toPort!;
      const ep = which === "from" ? s.from : s.to;
      const vertSide = port.side === "left" || port.side === "right";
      const users = portUsers(ep.id, port.side).filter((o) => o !== s);
      const key = which === "from" ? s.srcKey : s.dstKey;
      if (users.some((o) => o.srcKey === key || o.dstKey === key)) return false; // shared trunk
      const [lo, hi] = sideRange(ep, port.side, 44);
      if (target < lo + 10 || target > hi - 10) return false;
      for (const o of users) {
        const op = o.from.id === ep.id && o.fromPort?.side === port.side ? o.fromPort! : o.toPort!;
        const oc = vertSide ? op.p.y : op.p.x;
        if (Math.abs(oc - target) < 12) return false;
      }
      const np: Port = { p: sidePoint(ep.rect, port.side, target), side: port.side, cost: 0 };
      const prevFixed = which === "from" ? fixedFrom.get(s.idx) : fixedTo.get(s.idx);
      const prev = { nodes: s.nodes, points: s.points, fromPort: s.fromPort, toPort: s.toPort };
      registerOcc(grid, occ, s, false);
      if (which === "from") fixedFrom.set(s.idx, np);
      else fixedTo.set(s.idx, np);
      const routedOk = routeOne(s);
      const ok = routedOk && s.points.length < prev.points.length;
      if (!ok) {
        if (routedOk) registerOcc(grid, occ, s, false);
        Object.assign(s, prev);
        if (which === "from") fixedFrom.set(s.idx, prevFixed!);
        else fixedTo.set(s.idx, prevFixed!);
        registerOcc(grid, occ, s, true);
      }
      return ok;
    };
    for (let iter = 0; iter < 3; iter++) {
      const pts = s.points;
      const n = pts.length;
      if (n < 4) break;
      const axis = (side: Side, p: Point) => (side === "left" || side === "right" ? p.y : p.x);
      const moves: Array<["from" | "to", number]> = [];
      if (segLen(pts[1], pts[2]) < 24) moves.push(["from", axis(s.fromPort!.side, pts[2])]);
      if (segLen(pts[n - 3], pts[n - 2]) < 24) moves.push(["to", axis(s.toPort!.side, pts[n - 3])]);
      if (n === 4) {
        moves.push(["to", axis(s.toPort!.side, pts[0])]);
        moves.push(["from", axis(s.fromPort!.side, pts[3])]);
      }
      let moved = false;
      for (const [w, tgt] of moves) if (tryMove(w, tgt)) { moved = true; break; }
      if (!moved) break;
    }
  }

  const routed: RoutedEdge[] = [];
  for (const s of states) {
    if (!s.points.length || !s.fromPort || !s.toPort) {
      notes.push(`edge ${s.e.from}→${s.e.to} could not be routed`);
      continue;
    }
    routed.push({
      id: `e${s.idx}`,
      from: s.e.from,
      to: s.e.to,
      kind: s.kind,
      label: s.e.label,
      step: s.e.step,
      tags: s.e.tags,
      highlight: s.e.highlight,
      bidirectional: s.e.bidirectional,
      dim: s.e.dim,
      startMark: s.e.startMark,
      endMark: s.e.endMark,
      points: s.points,
      fromSide: s.fromPort.side,
      toSide: s.toPort.side,
      fromTier: s.from.isTier,
      toTier: s.to.isTier,
      bundle: s.srcKey,
      trunks: [...s.trunks, `port:${s.srcKey}`, `port:${s.dstKey}`],
    });
  }
  placeAnnotations(routed, nodes, tiers, notes);
  return { edges: routed, notes, junctions: computeJunctions(routed) };
}

/** Perpendicular crossings between edges that are not trunk mates (same rule as QA). */
export function countCrossings(edges: RoutedEdge[]): number {
  let n = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i];
      const b = edges[j];
      if ((a.kind === b.kind && sharesTrunk(a, b)) || a.from === b.from || a.to === b.to) continue;
      for (let p = 0; p < a.points.length - 1; p++) {
        for (let q = 0; q < b.points.length - 1; q++) {
          const a1 = a.points[p], a2 = a.points[p + 1], b1 = b.points[q], b2 = b.points[q + 1];
          const aH = a1.y === a2.y;
          if (aH === (b1.y === b2.y)) continue;
          const h1 = aH ? a1 : b1, h2 = aH ? a2 : b2, v1 = aH ? b1 : a1, v2 = aH ? b2 : a2;
          if (v1.x > Math.min(h1.x, h2.x) && v1.x < Math.max(h1.x, h2.x) && h1.y > Math.min(v1.y, v2.y) && h1.y < Math.max(v1.y, v2.y)) n++;
        }
      }
    }
  }
  return n;
}

/** Edges that may legitimately share track (same port bundle or trunk key). */
export function sharesTrunk(a: RoutedEdge, b: RoutedEdge): boolean {
  if (a.bundle === b.bundle) return true;
  for (const k of a.trunks) if (b.trunks.includes(k)) return true;
  return false;
}

interface Interval {
  lo: number;
  hi: number;
}

function overlapOn(a: Point, b: Point, c: Point, d: Point): Interval | null {
  const aH = a.y === b.y;
  const cH = c.y === d.y;
  if (aH !== cH) return null;
  if (aH ? Math.abs(a.y - c.y) > 0.5 : Math.abs(a.x - c.x) > 0.5) return null;
  const lo = aH ? Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) : Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
  const hi = aH ? Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) : Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
  return hi - lo > 0.5 ? { lo, hi } : null;
}

/**
 * Where an edge joins or leaves track it shares with its own trunk, emit a
 * junction dot so merges / splits read as deliberate.
 */
export function computeJunctions(edges: RoutedEdge[]): Junction[] {
  const out: Junction[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    const mates = edges.filter((o) => o !== e && o.kind === e.kind && sharesTrunk(e, o));
    if (!mates.length) continue;
    // walk the path, tracking covered (shared) pieces
    const pieces: Array<{ a: Point; b: Point; covered: boolean }> = [];
    for (let i = 0; i < e.points.length - 1; i++) {
      const a = e.points[i];
      const b = e.points[i + 1];
      const horiz = a.y === b.y;
      const ivs: Interval[] = [];
      for (const o of mates) {
        for (let j = 0; j < o.points.length - 1; j++) {
          const iv = overlapOn(a, b, o.points[j], o.points[j + 1]);
          if (iv) ivs.push(iv);
        }
      }
      ivs.sort((p, q) => p.lo - q.lo);
      const merged: Interval[] = [];
      for (const iv of ivs) {
        const last = merged[merged.length - 1];
        if (last && iv.lo <= last.hi + 0.5) last.hi = Math.max(last.hi, iv.hi);
        else merged.push({ ...iv });
      }
      const s0 = horiz ? a.x : a.y;
      const s1 = horiz ? b.x : b.y;
      const dir = s1 >= s0 ? 1 : -1;
      const at = (v: number): Point => (horiz ? { x: v, y: a.y } : { x: a.x, y: v });
      // convert to path order
      const cuts = merged
        .map((m) => (dir > 0 ? m : { lo: m.hi, hi: m.lo }))
        .sort((p, q) => (p.lo - q.lo) * dir);
      let cur = s0;
      for (const m of cuts) {
        if ((m.lo - cur) * dir > 0.5) pieces.push({ a: at(cur), b: at(m.lo), covered: false });
        pieces.push({ a: at(m.lo), b: at(m.hi), covered: true });
        cur = m.hi;
      }
      if ((s1 - cur) * dir > 0.5) pieces.push({ a: at(cur), b: at(s1), covered: false });
    }
    const first = e.points[0];
    const last = e.points[e.points.length - 1];
    const near = (p: Point, q: Point) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) < 2;
    for (let i = 1; i < pieces.length; i++) {
      if (pieces[i].covered === pieces[i - 1].covered) continue;
      const p = pieces[i].a;
      if (near(p, first) || near(p, last)) continue;
      const key = `${Math.round(p.x)}:${Math.round(p.y)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ at: { x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 }, kind: e.kind });
    }
  }
  return out;
}

// ── Labels & badges ─────────────────────────────────────────────────────────
function rectsHit(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function pathLength(pts: Point[]): number {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y);
  return L;
}

function pointAt(pts: Point[], d: number): { p: Point; seg: number; distToBend: number } {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const L = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (acc + L >= d) {
      const t = L ? (d - acc) / L : 0;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const db = Math.min(
        i === 0 ? Infinity : d - acc,
        i === pts.length - 2 ? Infinity : acc + L - d,
      );
      return { p, seg: i, distToBend: db };
    }
    acc += L;
  }
  return { p: pts[pts.length - 1], seg: pts.length - 2, distToBend: 0 };
}

function segCrossesRect(a: Point, b: Point, r: Rect): boolean {
  const x1 = Math.min(a.x, b.x);
  const x2 = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y, b.y);
  return x1 <= r.x + r.w && x2 >= r.x && y1 <= r.y + r.h && y2 >= r.y;
}

export function edgeLabelSize(label: string): { w: number; h: number } {
  return { w: Math.ceil(measureText(label, EDGE_LABEL_FONT) + 18), h: PILL_H };
}

function placeAnnotations(edges: RoutedEdge[], nodes: PlacedNode[], tiers: PlacedTier[], notes: string[]) {
  const hard: Rect[] = [...nodes.map((n) => inflate(n.rect, 6)), ...tiers.map((t) => inflate(t.labelRect, 4)), ...tiers.filter((t) => t.tagRect).map((t) => inflate(t.tagRect!, 4))];
  const placed: Rect[] = [];
  const otherSegs = (e: RoutedEdge, r: Rect) => {
    let n = 0;
    for (const o of edges) {
      if (o === e) continue;
      for (let i = 0; i < o.points.length - 1; i++) if (segCrossesRect(o.points[i], o.points[i + 1], r)) n++;
    }
    return n;
  };

  for (const e of edges) {
    if (!e.label) continue;
    // a stepped, labelled edge carries its badge inside the pill (one unit)
    const withBadge = e.step != null;
    const base0 = edgeLabelSize(e.label);
    const w = base0.w + (withBadge ? BADGE_R * 2 + 2 : 0);
    const h = withBadge ? Math.max(base0.h, BADGE_R * 2 + 2) : base0.h;
    let best: { r: Rect; score: number } | null = null;
    const consider = (r: Rect, base: number, padBy: number) => {
      const pad = inflate(r, padBy);
      const dbg = process.env.DBG_LABEL === e.label;
      if (hard.some((q) => rectsHit(q, pad))) { if (dbg) console.log("hard", JSON.stringify(r), JSON.stringify(hard.find((q) => rectsHit(q, pad)))); return; }
      if (placed.some((q) => rectsHit(q, pad))) { if (dbg) console.log("placed", JSON.stringify(r)); return; }
      // a pill must never cover another edge (that reads as its label)
      if (otherSegs(e, inflate(r, 2))) { if (dbg) console.log("seg", JSON.stringify(r)); return; }
      if (!best || base < best.score) best = { r, score: base };
    };
    const n = e.points.length;
    for (let i = 0; i < n - 1; i++) {
      const a = e.points[i];
      const b = e.points[i + 1];
      const horiz = a.y === b.y;
      const L = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      // prefer segments that belong to this edge alone (trunk branches, not the shared trunk)
      const endBias = i === n - 2 ? -6 : i === 0 ? 4 : 0;
      const ts = [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9];
      for (let d = 8; d < L; d += 8) ts.push(d / L);
      for (const t of ts) {
        const base = Math.abs(t - 0.5) * 30 - Math.min(L, 400) * 0.02 + endBias;
        if (horiz) {
          // on the line
          if (L >= w + 20) {
            const x = Math.min(Math.max(a.x, b.x) - w / 2 - 10, Math.max(Math.min(a.x, b.x) + w / 2 + 10, a.x + (b.x - a.x) * t));
            consider({ x: Math.round(x - w / 2), y: Math.round(a.y - h / 2), w, h }, base, 3);
          }
          // beside the line (above, then below)
          if (L >= Math.min(w + 20, 60)) {
            const x = Math.min(Math.max(a.x, b.x) - w / 2, Math.max(Math.min(a.x, b.x) + w / 2, a.x + (b.x - a.x) * t));
            for (const side of [-1, 1]) {
              const cy = a.y + side * (h / 2 + 4);
              consider({ x: Math.round(x - w / 2), y: Math.round(cy - h / 2), w, h }, base + 26 + (side > 0 ? 4 : 0), 1);
            }
          }
        } else {
          if (L < h + 12) continue;
          const y = Math.min(Math.max(a.y, b.y) - h / 2 - 6, Math.max(Math.min(a.y, b.y) + h / 2 + 6, a.y + (b.y - a.y) * t));
          consider({ x: Math.round(a.x - w / 2), y: Math.round(y - h / 2), w, h }, base + 40, 1);
          for (const side of [1, -1]) {
            consider({ x: Math.round(a.x + side * (w / 2 + 5) - w / 2), y: Math.round(y - h / 2), w, h }, base + 60, 1);
          }
        }
      }
    }
    let chosen = best as { r: Rect; score: number; leader?: Point } | null;
    if (!chosen) {
      // fallback: park the pill in the nearest free spot and draw a leader to the line
      const L = pathLength(e.points);
      let lb: { r: Rect; score: number; leader: Point } | null = null;
      for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
        const anchor = pointAt(e.points, L * t).p;
        for (let rad = 22; rad <= 110 && !lb; rad += 11) {
          for (let k = 0; k < 16; k++) {
            const ang = (k / 16) * Math.PI * 2;
            const c = { x: anchor.x + Math.cos(ang) * rad, y: anchor.y + Math.sin(ang) * rad * 0.7 };
            const r = { x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), w, h };
            const pad = inflate(r, 3);
            if (hard.some((q) => rectsHit(q, pad)) || placed.some((q) => rectsHit(q, pad))) continue;
            if (otherSegs(e, inflate(r, 2))) continue;
            // own line must not run under the pill either (it would look like a crossing)
            let own = false;
            for (let i = 0; i < e.points.length - 1; i++) if (segCrossesRect(e.points[i], e.points[i + 1], inflate(r, 2))) own = true;
            if (own) continue;
            const score = rad + Math.abs(t - 0.5) * 40;
            if (!lb || score < lb.score) lb = { r, score, leader: { x: Math.round(anchor.x), y: Math.round(anchor.y) } };
          }
        }
        if (lb) break;
      }
      if (lb) chosen = lb;
    }
    if (chosen?.leader) e.labelLeader = chosen.leader;
    if (!chosen) {
      notes.push(`label "${e.label}" has no clear straight segment`);
      continue;
    }
    e.labelRect = chosen.r;
    placed.push(chosen.r);
    if (withBadge) {
      e.badgeAt = { x: chosen.r.x + BADGE_R + 1, y: chosen.r.y + chosen.r.h / 2 };
      e.badgeInLabel = true;
    }
  }

  // Badges after labels (they are small and find room more easily), near the source.
  for (const e of [...edges].sort((a, b) => (a.step ?? 0) - (b.step ?? 0))) {
    if (e.step == null || e.badgeInLabel) continue;
    const L = pathLength(e.points);
    let best: { p: Point; score: number } | null = null;
    for (let d = BADGE_R + 10; d <= L - BADGE_R - 12; d += 4) {
      const { p, distToBend } = pointAt(e.points, d);
      const box = { x: p.x - BADGE_R - 3, y: p.y - BADGE_R - 3, w: 2 * BADGE_R + 6, h: 2 * BADGE_R + 6 };
      if (hard.some((r) => rectsHit(r, box)) || placed.some((r) => rectsHit(r, box))) continue;
      const score = d * 0.6 + (distToBend < BADGE_R + 6 ? 80 : 0) + otherSegs(e, box) * 120;
      if (!best || score < best.score) best = { p, score };
      if (score < 60) break;
    }
    if (!best) {
      const mid = pointAt(e.points, L / 2).p;
      best = { p: mid, score: 0 };
      notes.push(`badge ${e.step} could not find a clear spot`);
    }
    e.badgeAt = { x: Math.round(best.p.x * 2) / 2, y: Math.round(best.p.y * 2) / 2 };
    placed.push({ x: best.p.x - BADGE_R - 2, y: best.p.y - BADGE_R - 2, w: 2 * BADGE_R + 4, h: 2 * BADGE_R + 4 });
  }

}
