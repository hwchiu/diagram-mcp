/**
 * Layered (Sugiyama-style) layout for directed graphs: data lineage, workflow
 * DAGs, dependency / impact graphs, knowledge graphs, flowcharts, state
 * machines and ERDs.
 *
 *  1. cycle breaking (DFS back edges reversed, stage order respected)
 *  2. layer assignment: longest path + source tightening, optional stages
 *     (pipeline phases) as contiguous layer ranges drawn as column frames
 *  3. long edges split into dummy chains (reserved edge tracks)
 *  4. crossing minimisation: alternating barycentre sweeps + transpose,
 *     best ordering kept
 *  5. coordinates: isotonic (pool-adjacent-violators) placement pulling every
 *     node toward its neighbours' mean, dummies weighted for straight edges;
 *     gutters widened for edge labels and track counts
 *  6. compound clusters (composite states, task groups) laid out recursively
 *     and placed as blocks
 *  7. LR / TB and 1–3 wrapped bands scored for a ~16:9 poster
 * Routing (A*, trunks, labels), QA, SVG and draw.io are the shared engine's.
 */
import type { DiagramEdge, DiagramGroup, DiagramNode } from "../types.js";
import { CARD_H, CARD_MAX_W, CARD_MIN_W, CARD_TEXT_X, FONTS, FOOTER_H, FRAME_HEADER, FRAME_PAD, MARGIN, PANEL_PAD, TITLE_H, aspectPenalty, placeNode, tierLabelText } from "./grid.js";
import { edgeLabelSize, routeEdges } from "./router.js";
import { cardMetrics, SHAPE_FONTS, type CardMetrics } from "./shapes.js";
import { measureText } from "./text.js";
import { legendHeight } from "./legend.js";
import type { ArchitectureLayoutInput, LayoutResult, PlacedNode, PlacedTier, Point, Rect, RoutedEdge } from "./types.js";

export type LayerDir = "LR" | "TB";

export interface LayeredStage {
  id: string;
  label: string;
  tag?: string;
}

export interface LayeredOptions {
  /** "auto" scores both directions (default) */
  direction?: LayerDir | "auto";
  /** preferred direction when scores are close */
  prefer?: LayerDir;
  /** pipeline phases → contiguous layer ranges with a column frame each */
  stages?: LayeredStage[];
  stageOf?: Record<string, string>;
  /** fixed card sizes (ERD tables) */
  sizes?: Record<string, { w: number; h: number }>;
  /** "auto" wraps long chains into 2–3 bands */
  wrap?: "auto" | "never";
  /** show "01 /" indices on top-level frames */
  frameIndex?: boolean;
  /** cross-axis gap between cards in one layer */
  nodeGap?: number;
  /** base gutter between layers */
  layerGap?: number;
  /** shared card width override */
  cardW?: number;
  /** clusters may lay out their members in the other direction when that makes the block squarer */
  blockDir?: "same" | "auto";
}

export type LayeredLayoutInput = ArchitectureLayoutInput & { layered?: LayeredOptions };

interface Sz {
  w: number;
  h: number;
}

interface FlatEdge {
  from: string;
  to: string;
  /** label width (0 = none) */
  lw: number;
}

const DUMMY = "\u0000d";
const BAND_GAP = 76;
const LOOP_TOP = 50;
const LOOP_RIGHT = 36;

// ── 1–2. ranks ─────────────────────────────────────────────────────────────
export function assignRanks(ids: string[], edges: FlatEdge[], stageIdx?: Map<string, number>, compact = false): { rank: Map<string, number>; dag: Array<[string, string]> } {
  const idx = new Map(ids.map((u, i) => [u, i]));
  const succ = new Map<string, string[]>(ids.map((u) => [u, []]));
  const dag: Array<[string, string]> = [];
  const st = (u: string) => stageIdx?.get(u) ?? 0;
  for (const e of edges) {
    if (!idx.has(e.from) || !idx.has(e.to) || e.from === e.to) continue;
    if (stageIdx && st(e.from) !== st(e.to)) {
      dag.push(st(e.from) < st(e.to) ? [e.from, e.to] : [e.to, e.from]);
      continue;
    }
    succ.get(e.from)!.push(e.to);
  }
  // DFS cycle breaking (sources first, input order)
  const state = new Map<string, number>();
  const indeg = new Map(ids.map((u) => [u, 0]));
  for (const vs of succ.values()) for (const v of vs) indeg.set(v, indeg.get(v)! + 1);
  const visit = (u: string) => {
    state.set(u, 1);
    for (const v of succ.get(u)!) {
      const s = state.get(v) ?? 0;
      if (s === 1) dag.push([v, u]);
      else {
        dag.push([u, v]);
        if (s === 0) visit(v);
      }
    }
    state.set(u, 2);
  };
  for (const u of ids) if (indeg.get(u) === 0 && !state.has(u)) visit(u);
  for (const u of ids) if (!state.has(u)) visit(u);

  const out = new Map<string, string[]>(ids.map((u) => [u, []]));
  const inn = new Map<string, string[]>(ids.map((u) => [u, []]));
  for (const [a, b] of dag) {
    out.get(a)!.push(b);
    inn.get(b)!.push(a);
  }
  const longest = (members: string[], intra: (a: string, b: string) => boolean) => {
    const r = new Map<string, number>(members.map((u) => [u, 0]));
    const set = new Set(members);
    // Kahn order
    const deg = new Map(members.map((u) => [u, inn.get(u)!.filter((p) => set.has(p) && intra(p, u)).length]));
    const q = members.filter((u) => deg.get(u) === 0);
    const order: string[] = [];
    while (q.length) {
      const u = q.shift()!;
      order.push(u);
      for (const v of out.get(u)!) {
        if (!set.has(v) || !intra(u, v)) continue;
        r.set(v, Math.max(r.get(v)!, r.get(u)! + 1));
        deg.set(v, deg.get(v)! - 1);
        if (deg.get(v) === 0) q.push(v);
      }
    }
    // tighten sources toward their consumers (shorter edges)
    for (let pass = 0; pass < 2; pass++) {
      for (const u of [...order].reverse()) {
        const ins = inn.get(u)!.filter((p) => set.has(p) && intra(p, u));
        const outs = out.get(u)!.filter((v) => set.has(v) && intra(u, v));
        if (ins.length || !outs.length) continue;
        r.set(u, Math.max(r.get(u)!, Math.min(...outs.map((v) => r.get(v)!)) - 1));
      }
    }
    return r;
  };
  const rank = new Map<string, number>();
  if (stageIdx && compact) {
    // one column per stage: intra-stage flows run vertically inside the column
    const used = [...new Set(ids.map(st))].sort((a, b) => a - b);
    for (const u of ids) rank.set(u, used.indexOf(st(u)));
  } else if (stageIdx) {
    const S = Math.max(0, ...ids.map(st)) + 1;
    let off = 0;
    for (let s = 0; s < S; s++) {
      const mem = ids.filter((u) => st(u) === s);
      if (!mem.length) continue;
      const r = longest(mem, (a, b) => st(a) === st(b));
      let mx = 0;
      for (const [u, v] of r) {
        rank.set(u, off + v);
        mx = Math.max(mx, v);
      }
      off += mx + 1;
    }
  } else {
    for (const [u, v] of longest(ids, () => true)) rank.set(u, v);
  }
  return { rank, dag };
}

// ── 3–4. layers + ordering ─────────────────────────────────────────────────
interface Layering {
  layers: string[][];
  up: Map<string, string[]>;
  down: Map<string, string[]>;
  isDummy: (k: string) => boolean;
}

function buildLayering(ids: string[], dag: Array<[string, string]>, rank: Map<string, number>): Layering {
  const L = Math.max(0, ...ids.map((u) => rank.get(u)!)) + 1;
  const layers: string[][] = Array.from({ length: L }, () => []);
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  const add = (k: string) => {
    if (!up.has(k)) up.set(k, []);
    if (!down.has(k)) down.set(k, []);
  };
  ids.forEach(add);
  const link = (a: string, b: string) => {
    down.get(a)!.push(b);
    up.get(b)!.push(a);
  };
  let d = 0;
  const seen = new Set<string>();
  for (const [a, b] of dag) {
    const key = `${a}>${b}`;
    if (seen.has(key)) continue; // parallel edges share a track
    seen.add(key);
    const ra = rank.get(a)!;
    const rb = rank.get(b)!;
    if (rb <= ra) continue;
    let prev = a;
    for (let r = ra + 1; r < rb; r++) {
      const k = `${DUMMY}${d++}`;
      add(k);
      rank.set(k, r);
      link(prev, k);
      prev = k;
    }
    link(prev, b);
  }
  // initial order: DFS from sources in input order
  const visited = new Set<string>();
  const dfs = (u: string) => {
    if (visited.has(u)) return;
    visited.add(u);
    layers[rank.get(u)!].push(u);
    for (const v of down.get(u)!) dfs(v);
  };
  for (const u of ids) if (!up.get(u)!.length) dfs(u);
  for (const u of ids) dfs(u);
  for (const k of up.keys()) if (!visited.has(k)) dfs(k);
  return { layers, up, down, isDummy: (k) => k.startsWith(DUMMY) };
}

function pairCrossings(top: string[], bottom: string[], down: Map<string, string[]>): number {
  const pos = new Map(bottom.map((k, i) => [k, i]));
  const es: Array<[number, number]> = [];
  top.forEach((k, i) => {
    for (const v of down.get(k) ?? []) if (pos.has(v)) es.push([i, pos.get(v)!]);
  });
  let c = 0;
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) if ((es[i][0] - es[j][0]) * (es[i][1] - es[j][1]) < 0) c++;
  return c;
}

export function totalCrossings(layers: string[][], down: Map<string, string[]>): number {
  let c = 0;
  for (let r = 0; r + 1 < layers.length; r++) c += pairCrossings(layers[r], layers[r + 1], down);
  return c;
}

function orderLayers(lay: Layering, iterations = 28): string[][] {
  const { up, down } = lay;
  let layers = lay.layers.map((l) => [...l]);
  let best = layers.map((l) => [...l]);
  let bestC = totalCrossings(layers, down);
  const posOf = () => {
    const m = new Map<string, number>();
    for (const l of layers) l.forEach((k, i) => m.set(k, i));
    return m;
  };
  const bary = (layer: string[], nb: Map<string, string[]>, pos: Map<string, number>) => {
    const cur = new Map(layer.map((k, i) => [k, i]));
    const val = new Map<string, number>();
    for (const k of layer) {
      const ps = (nb.get(k) ?? []).map((v) => pos.get(v)).filter((v): v is number => v != null).sort((a, b) => a - b);
      if (!ps.length) val.set(k, cur.get(k)!);
      else {
        // median with barycentre tie-break
        const m = ps.length % 2 ? ps[(ps.length - 1) / 2] : (ps[ps.length / 2 - 1] + ps[ps.length / 2]) / 2;
        const b = ps.reduce((s, v) => s + v, 0) / ps.length;
        val.set(k, m * 0.5 + b * 0.5);
      }
    }
    return [...layer].sort((a, b) => val.get(a)! - val.get(b)! || cur.get(a)! - cur.get(b)!);
  };
  const crossPair = (u: string, v: string, nb: Map<string, string[]>, pos: Map<string, number>) => {
    let c = 0;
    for (const a of nb.get(u) ?? []) for (const b of nb.get(v) ?? []) if (pos.has(a) && pos.has(b) && pos.get(a)! > pos.get(b)!) c++;
    return c;
  };
  const transpose = () => {
    let improved = true;
    let guard = 0;
    while (improved && guard++ < 6) {
      improved = false;
      for (let r = 0; r < layers.length; r++) {
        const l = layers[r];
        for (let i = 0; i + 1 < l.length; i++) {
          const pos = posOf();
          const u = l[i];
          const v = l[i + 1];
          const before = crossPair(u, v, up, pos) + crossPair(u, v, down, pos);
          const after = crossPair(v, u, up, pos) + crossPair(v, u, down, pos);
          if (after < before) {
            l[i] = v;
            l[i + 1] = u;
            improved = true;
          }
        }
      }
    }
  };
  for (let it = 0; it < iterations; it++) {
    if (it % 2 === 0) for (let r = 1; r < layers.length; r++) layers[r] = bary(layers[r], up, posOf());
    else for (let r = layers.length - 2; r >= 0; r--) layers[r] = bary(layers[r], down, posOf());
    transpose();
    const c = totalCrossings(layers, down);
    if (c < bestC) {
      bestC = c;
      best = layers.map((l) => [...l]);
    }
    if (bestC === 0) break;
  }
  layers = best;
  return layers;
}

// ── 5. coordinates ────────────────────────────────────────────────────────
/** Isotonic placement: minimise Σw(p−d)² s.t. p[i] ≥ p[i−1] + sep[i]. */
export function pavPlace(desired: number[], seps: number[], weights: number[]): number[] {
  const n = desired.length;
  const S: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += i ? seps[i] : 0;
    S.push(acc);
  }
  const blocks: Array<{ v: number; w: number; n: number }> = [];
  for (let i = 0; i < n; i++) {
    blocks.push({ v: desired[i] - S[i], w: weights[i], n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].v > blocks[blocks.length - 1].v) {
      const b = blocks.pop()!;
      const a = blocks.pop()!;
      blocks.push({ v: (a.v * a.w + b.v * b.w) / (a.w + b.w), w: a.w + b.w, n: a.n + b.n });
    }
  }
  const out: number[] = [];
  let i = 0;
  for (const b of blocks) for (let k = 0; k < b.n; k++, i++) out.push(b.v + S[i]);
  return out;
}

interface FlatOpts {
  dir: LayerDir;
  nodeGap: number;
  layerGap: number;
  stageIdx?: Map<string, number>;
  /** all nodes of a stage share one layer */
  compact?: boolean;
  /** stage → extra main-axis padding before / after its layers */
  stagePad?: { before: number; after: number; minSpan: Map<number, number> };
  bands: number;
  bandCuts?: number[];
}

export interface FlatLayout {
  /** item centers */
  pos: Map<string, Point>;
  w: number;
  h: number;
  rank: Map<string, number>;
  layers: string[][];
  crossings: number;
  /** per band: rank range + rect (level coords) */
  bands: Array<{ from: number; to: number; rect: Rect }>;
  /** per rank: main-axis start / end in its band */
  span: Array<{ a: number; b: number }>;
  bandOf: (rank: number) => number;
  /** main-axis padding before / after each rank (stage frames) */
  before: number[];
  after: number[];
}

function flatLayout(ids: string[], size: Map<string, Sz>, edges: FlatEdge[], o: FlatOpts): FlatLayout {
  const { dir } = o;
  const main = (k: string) => (dir === "LR" ? size.get(k)!.w : size.get(k)!.h);
  const cross = (k: string) => (k.startsWith(DUMMY) ? 10 : dir === "LR" ? size.get(k)!.h : size.get(k)!.w);
  const { rank, dag } = assignRanks(ids, edges, o.stageIdx, o.compact);
  const lay = buildLayering(ids, dag, rank);
  const layers = orderLayers(lay);
  // flat (same-layer) edges: keep the source above / left of the target when the order allows
  const flat = edges.filter((e) => rank.has(e.from) && rank.has(e.to) && e.from !== e.to && rank.get(e.from) === rank.get(e.to));
  if (flat.length) {
    for (let pass = 0; pass < 3; pass++) {
      for (const e of flat) {
        const l = layers[rank.get(e.from)!];
        const i = l.indexOf(e.from);
        const j = l.indexOf(e.to);
        if (i > j) {
          l.splice(i, 1);
          l.splice(l.indexOf(e.to), 0, e.from);
        }
      }
    }
  }
  const flatGap = new Map<string, number>();
  for (const e of flat) {
    const k = [e.from, e.to].sort().join("|");
    flatGap.set(k, Math.max(flatGap.get(k) ?? 0, e.lw ? 22 + 34 : 30));
  }
  const crossings = totalCrossings(layers, lay.down);
  const L = layers.length;
  // cross coordinates (centers)
  const c = new Map<string, number>();
  const sep = (a: string, b: string) => {
    const da = a.startsWith(DUMMY);
    const db = b.startsWith(DUMMY);
    const g = da && db ? 16 : da || db ? 24 : Math.max(o.nodeGap, (flatGap.get([a, b].sort().join("|")) ?? 0) + (dir === "LR" ? 20 : 30));
    return (cross(a) + cross(b)) / 2 + g;
  };
  for (const l of layers) {
    let p = 0;
    l.forEach((k, i) => {
      if (i) p += sep(l[i - 1], k);
      c.set(k, p);
    });
  }
  const relax = (r: number, nbs: Array<Map<string, string[]>>) => {
    const l = layers[r];
    if (!l.length) return;
    const desired = l.map((k) => {
      const ps: number[] = [];
      for (const nb of nbs) for (const v of nb.get(k) ?? []) ps.push(c.get(v)!);
      return ps.length ? ps.reduce((s, v) => s + v, 0) / ps.length : c.get(k)!;
    });
    const w = l.map((k) => (k.startsWith(DUMMY) ? 3 : (lay.up.get(k)!.length + lay.down.get(k)!.length ? 1 : 0.2)));
    const seps = l.map((k, i) => (i ? sep(l[i - 1], k) : 0));
    pavPlace(desired, seps, w).forEach((v, i) => c.set(l[i], v));
  };
  for (let it = 0; it < 12; it++) {
    if (it % 3 === 0) for (let r = 1; r < L; r++) relax(r, [lay.up]);
    else if (it % 3 === 1) for (let r = L - 2; r >= 0; r--) relax(r, [lay.down]);
    else for (let r = 0; r < L; r++) relax(r, [lay.up, lay.down]);
  }
  // snap near-straight single links
  for (let r = 1; r < L; r++) {
    const l = layers[r];
    for (let i = 0; i < l.length; i++) {
      const k = l[i];
      const ups = lay.up.get(k)!;
      if (ups.length !== 1) continue;
      const t = c.get(ups[0])!;
      const d = t - c.get(k)!;
      if (Math.abs(d) < 0.5 || Math.abs(d) > 40) continue;
      const lo = i ? c.get(l[i - 1])! + sep(l[i - 1], k) : -Infinity;
      const hi = i + 1 < l.length ? c.get(l[i + 1])! - sep(k, l[i + 1]) : Infinity;
      if (t >= lo && t <= hi) c.set(k, t);
    }
  }
  // main-axis thickness + gutters
  const thick = layers.map((l) => Math.max(0, ...l.filter((k) => !k.startsWith(DUMMY)).map(main)));
  const gutter: number[] = new Array(Math.max(0, L - 1)).fill(o.layerGap);
  const tracks: number[] = new Array(Math.max(0, L - 1)).fill(0);
  for (let r = 0; r + 1 < L; r++) {
    for (const k of layers[r]) for (const v of lay.down.get(k)!) if (Math.abs(c.get(k)! - c.get(v)!) > 2) tracks[r]++;
  }
  for (let r = 0; r + 1 < L; r++) gutter[r] = Math.max(gutter[r], 44 + Math.min(10, tracks[r]) * 12);
  for (const e of edges) {
    if (!e.lw || !rank.has(e.from) || !rank.has(e.to)) continue;
    const a = Math.min(rank.get(e.from)!, rank.get(e.to)!);
    const b = Math.max(rank.get(e.from)!, rank.get(e.to)!);
    if (a === b) continue;
    const need = dir === "LR" ? e.lw + 56 : 22 + 52;
    // the label goes on the first gutter of the edge (and the last for back edges)
    gutter[a] = Math.max(gutter[a], need);
    if (b - 1 !== a && rank.get(e.from)! > rank.get(e.to)!) gutter[b - 1] = Math.max(gutter[b - 1], need);
  }
  // stage padding
  const before = new Array(L).fill(0);
  const after = new Array(L).fill(0);
  if (o.stageIdx && o.stagePad) {
    const stOfRank = new Map<number, number>();
    for (const [k, r] of rank) if (!k.startsWith(DUMMY)) stOfRank.set(r, o.stageIdx.get(k) ?? 0);
    for (let r = 0; r < L; r++) {
      const s = stOfRank.get(r);
      if (s == null) continue;
      if (r === 0 || stOfRank.get(r - 1) !== s) before[r] = o.stagePad.before;
      if (r === L - 1 || stOfRank.get(r + 1) !== s) after[r] = o.stagePad.after;
    }
    // stage too narrow for its label → widen evenly
    const ranksOf = new Map<number, number[]>();
    for (let r = 0; r < L; r++) {
      const s = stOfRank.get(r);
      if (s != null) (ranksOf.get(s) ?? ranksOf.set(s, []).get(s)!).push(r);
    }
    for (const [s, rs] of ranksOf) {
      const need = o.stagePad.minSpan.get(s) ?? 0;
      let span = 0;
      for (const r of rs) span += thick[r] + before[r] + after[r];
      for (let i = 0; i + 1 < rs.length; i++) span += gutter[rs[i]];
      if (span < need) {
        const add = (need - span) / 2;
        before[rs[0]] += add;
        after[rs[rs.length - 1]] += add;
      }
    }
  }
  // bands
  const nb = Math.max(1, Math.min(o.bands, L));
  let cuts = o.bandCuts;
  if (!cuts) {
    cuts = [0];
    const tot = thick.reduce((s, v) => s + v, 0) + gutter.reduce((s, v) => s + v, 0);
    let acc = 0;
    for (let r = 0; r < L && cuts.length < nb; r++) {
      acc += thick[r] + (r < L - 1 ? gutter[r] : 0);
      if (acc >= (tot * cuts.length) / nb && r + 1 < L) cuts.push(r + 1);
    }
  }
  const bandRanges = cuts.map((a, i) => ({ from: a, to: i + 1 < cuts!.length ? cuts![i + 1] : L }));
  const bandOf = (r: number) => bandRanges.findIndex((b) => r >= b.from && r < b.to);
  const span: Array<{ a: number; b: number }> = new Array(L);
  const bands: FlatLayout["bands"] = [];
  const pos = new Map<string, Point>();
  let crossOff = 0;
  let maxMain = 0;
  for (const br of bandRanges) {
    let m = 0;
    for (let r = br.from; r < br.to; r++) {
      m += before[r];
      span[r] = { a: m, b: m + thick[r] };
      m += thick[r] + after[r];
      if (r + 1 < br.to) m += gutter[r];
    }
    maxMain = Math.max(maxMain, m);
    let lo = Infinity;
    let hi = -Infinity;
    for (let r = br.from; r < br.to; r++)
      for (const k of layers[r]) {
        lo = Math.min(lo, c.get(k)! - cross(k) / 2);
        hi = Math.max(hi, c.get(k)! + cross(k) / 2);
      }
    if (!isFinite(lo)) ((lo = 0), (hi = 0));
    const pb = o.stagePad && o.stageIdx ? (dir === "LR" ? FRAME_HEADER : FRAME_PAD) : 0;
    const pa = o.stagePad && o.stageIdx ? FRAME_PAD : 0;
    for (let r = br.from; r < br.to; r++)
      for (const k of layers[r]) {
        const mc = (span[r].a + span[r].b) / 2;
        const cc = crossOff + pb + c.get(k)! - lo;
        pos.set(k, dir === "LR" ? { x: mc, y: cc } : { x: cc, y: mc });
      }
    const ext = hi - lo + pb + pa;
    bands.push({ from: br.from, to: br.to, rect: dir === "LR" ? { x: 0, y: crossOff, w: m, h: ext } : { x: crossOff, y: 0, w: ext, h: m } });
    crossOff += ext + BAND_GAP;
  }
  crossOff -= BAND_GAP;
  for (const b of bands) if (dir === "LR") b.rect.w = maxMain;
  else b.rect.h = maxMain;
  for (const k of [...pos.keys()]) if (k.startsWith(DUMMY)) pos.delete(k);
  const w = dir === "LR" ? maxMain : crossOff;
  const h = dir === "LR" ? crossOff : maxMain;
  return { pos, w, h, rank, layers, crossings, bands, span, bandOf, before, after };
}

// ── 6–7. compound layout + chrome ──────────────────────────────────────────
interface Block {
  w: number;
  h: number;
  /** relative card rects */
  nodes: Map<string, Rect>;
  /** relative frame rects */
  frames: Array<{ id: string; rect: Rect; depth: number; parent?: string }>;
}

export function layoutLayered(input: LayeredLayoutInput): LayoutResult {
  const opts = input.layered ?? {};
  const nodes = input.nodes;
  const groups = input.groups ?? [];
  const edges = (input.edges ?? []) as DiagramEdge[];
  const stages = opts.stages?.length ? opts.stages : undefined;
  const useGroups = !stages;
  const gById = new Map(groups.map((g) => [g.id, g]));
  // shared card width
  let textMax = 0;
  for (const n of nodes) if (!opts.sizes?.[n.id]) textMax = Math.max(textMax, Math.min(measureText(n.label, FONTS.cardLabel), 190), Math.min(n.subtitle ? measureText(n.subtitle, FONTS.cardSub) : 0, 176));
  const cardW = opts.cardW ?? Math.round(Math.min(CARD_MAX_W, Math.max(CARD_MIN_W - 8, CARD_TEXT_X + textMax + 18)));
  const metrics = new Map<string, CardMetrics>();
  for (const n of nodes) {
    const fixed = opts.sizes?.[n.id];
    const m = cardMetrics(n, { cardW, cardH: CARD_H, iconTextX: CARD_TEXT_X });
    metrics.set(n.id, fixed ? { ...m, w: fixed.w, h: fixed.h } : m);
  }
  const loops = new Set(edges.filter((e) => e.from === e.to).map((e) => e.from));
  const itemSize = (id: string): Sz => {
    const m = metrics.get(id)!;
    return loops.has(id) ? { w: m.w + LOOP_RIGHT, h: m.h + LOOP_TOP } : { w: m.w, h: m.h };
  };
  const loopLabelW = new Map<string, number>();
  for (const e of edges) if (e.from === e.to && e.label) loopLabelW.set(e.from, Math.max(loopLabelW.get(e.from) ?? 0, edgeLabelSize(e.label).w));
  const labelW = (e: DiagramEdge) => (e.label ? edgeLabelSize(e.label).w : 0);
  const nodeGapBase = opts.nodeGap ?? 40;

  // parent chain helpers
  const parentOf = (id: string): string | undefined => {
    if (!useGroups) return undefined;
    const n = nodes.find((x) => x.id === id);
    if (n) return n.group && gById.has(n.group) ? n.group : undefined;
    const g = gById.get(id);
    return g?.parent && gById.has(g.parent) ? g.parent : undefined;
  };
  const liftTo = (level: string | undefined, id: string): string | undefined => {
    let cur: string | undefined = id;
    let guard = 0;
    while (cur != null && guard++ < 64) {
      const p = parentOf(cur);
      if (p === level) return cur;
      cur = p;
    }
    return undefined;
  };
  const childrenOf = (level: string | undefined) => [
    ...(useGroups ? groups.filter((g) => (g.parent && gById.has(g.parent) ? g.parent : undefined) === level).map((g) => g.id) : []),
    ...nodes.filter((n) => parentOf(n.id) === level).map((n) => n.id),
  ];
  const liftedEdges = (level: string | undefined): FlatEdge[] => {
    const out: FlatEdge[] = [];
    for (const e of edges) {
      const a = liftTo(level, e.from);
      const b = liftTo(level, e.to);
      if (a == null || b == null || a === b) continue;
      out.push({ from: a, to: b, lw: labelW(e) });
    }
    return out;
  };
  const frameLabelW = (g: DiagramGroup, index: string) => measureText(tierLabelText(g.label, index), FONTS.tierLabel) + 18 + 40 + (g.tag ? measureText(g.tag, SHAPE_FONTS.tag) + 30 : 0);

  const blockCache = new Map<string, Block>();
  const blockOf = (gid: string, dir: LayerDir): Block => {
    const key = `${gid}|${dir}`;
    if (blockCache.has(key)) return blockCache.get(key)!;
    const kids = childrenOf(gid);
    const sizes = new Map<string, Sz>();
    for (const k of kids) sizes.set(k, gById.has(k) ? blockSize(blockOf(k, dir)) : itemSize(k));
    let fl: FlatLayout | null = null;
    let innerDir = dir;
    if (kids.length) {
      const tries: LayerDir[] = opts.blockDir === "auto" ? [dir, dir === "LR" ? "TB" : "LR"] : [dir];
      let bestS = Infinity;
      for (const d of tries) {
        const f = flatLayout(kids, sizes, liftedEdges(gid), { dir: d, nodeGap: nodeGapBase - 6, layerGap: opts.layerGap ?? 64, bands: 1 });
        const target = dir === "LR" ? 1.0 : 2.4;
        const sc = Math.abs(Math.log((f.w + 48) / (f.h + 64)) - Math.log(target)) + f.crossings * 0.08 + (d !== dir ? 0.12 : 0);
        if (sc < bestS) ((bestS = sc), (fl = f), (innerDir = d));
      }
    }
    void innerDir;
    const innerW = fl?.w ?? 120;
    const innerH = fl?.h ?? 40;
    const g = gById.get(gid)!;
    const w = Math.max(innerW + FRAME_PAD * 2, frameLabelW(g, ""));
    const h = innerH + FRAME_HEADER + FRAME_PAD;
    const ox = (w - innerW) / 2;
    const oy = FRAME_HEADER;
    const blk: Block = { w, h, nodes: new Map(), frames: [] };
    if (fl) place(fl, sizes, blk, ox, oy, gid, 1);
    blockCache.set(key, blk);
    return blk;
  };
  const blockSize = (b: Block): Sz => ({ w: b.w, h: b.h });
  /** copy a flat layout's items into a block (recursing into sub-blocks) */
  function place(fl: FlatLayout, sizes: Map<string, Sz>, into: Block, ox: number, oy: number, parent: string | undefined, depth: number, dir?: LayerDir) {
    for (const [k, p] of fl.pos) {
      const s = sizes.get(k)!;
      const x = ox + p.x - s.w / 2;
      const y = oy + p.y - s.h / 2;
      if (gById.has(k) && useGroups) {
        const sub = blockCache.get(`${k}|${dir ?? curDir}`)!;
        into.frames.push({ id: k, rect: { x, y, w: sub.w, h: sub.h }, depth, parent });
        for (const f of sub.frames) into.frames.push({ ...f, rect: { ...f.rect, x: f.rect.x + x, y: f.rect.y + y }, depth: f.depth + depth });
        for (const [nid, r] of sub.nodes) into.nodes.set(nid, { ...r, x: r.x + x, y: r.y + y });
      } else {
        const m = metrics.get(k)!;
        into.nodes.set(k, { x, y: y + (loops.has(k) ? LOOP_TOP : 0), w: m.w, h: m.h });
      }
    }
  }
  let curDir: LayerDir = "LR";

  // stages
  const stageIdx = stages ? new Map<string, number>() : undefined;
  if (stages && stageIdx) {
    const si = new Map(stages.map((s, i) => [s.id, i]));
    for (const n of nodes) {
      const s = opts.stageOf?.[n.id];
      if (s != null && si.has(s)) stageIdx.set(n.id, si.get(s)!);
    }
    // unstaged nodes follow their predecessors
    for (let it = 0; it < nodes.length; it++) {
      let changed = false;
      for (const n of nodes) {
        if (stageIdx.has(n.id)) continue;
        const ps = edges.filter((e) => e.to === n.id && stageIdx.has(e.from)).map((e) => stageIdx.get(e.from)!);
        if (ps.length) {
          stageIdx.set(n.id, Math.max(...ps));
          changed = true;
        }
      }
      if (!changed) break;
    }
    for (const n of nodes) if (!stageIdx.has(n.id)) stageIdx.set(n.id, 0);
  }

  const titleW = Math.max(input.title ? measureText(input.title, FONTS.title) + 60 : 0, input.subtitle ? measureText(input.subtitle, FONTS.subtitle) + 60 : 0);
  const legendH = input.legend?.length ? 30 : 0;
  const chromeH = MARGIN + TITLE_H + PANEL_PAD * 2 + (legendH ? 18 + legendH : 0) + 18 + FOOTER_H - 12 + MARGIN / 2;

  interface Cand {
    dir: LayerDir;
    bands: number;
    fl: FlatLayout;
    sizes: Map<string, Sz>;
    W: number;
    H: number;
    score: number;
    compact: boolean;
  }
  const rootKids = childrenOf(undefined);
  const rootEdges = liftedEdges(undefined);
  const dirs: LayerDir[] = opts.direction && opts.direction !== "auto" ? [opts.direction] : ["LR", "TB"];
  const cands: Cand[] = [];
  const stageMin = new Map<number, number>();
  stages?.forEach((s, i) => stageMin.set(i, measureText(tierLabelText(s.label, opts.frameIndex === false ? "" : String(i + 1).padStart(2, "0")), FONTS.tierLabel) + 18 + 40 + (s.tag ? measureText(s.tag, SHAPE_FONTS.tag) + 30 : 0)));
  for (const dir of dirs) {
    curDir = dir;
    blockCache.clear();
    const sizes = new Map<string, Sz>();
    for (const k of rootKids) sizes.set(k, gById.has(k) && useGroups ? blockSize(blockOf(k, dir)) : itemSize(k));
    const base: Omit<FlatOpts, "bands"> = {
      dir,
      nodeGap: dir === "LR" ? nodeGapBase : nodeGapBase + 16,
      layerGap: opts.layerGap ?? (dir === "LR" ? 84 : 66),
      stageIdx,
      stagePad: stageIdx ? { before: dir === "LR" ? FRAME_PAD : FRAME_HEADER, after: FRAME_PAD, minSpan: dir === "LR" ? stageMin : new Map() } : undefined,
    };
    for (const compact of stageIdx ? [false, true] : [false]) {
    const one = flatLayout(rootKids, sizes, rootEdges, { ...base, compact, bands: 1 });
    const L = one.layers.length;
    const maxB = opts.wrap === "never" ? 1 : Math.min(3, Math.floor(L / 2));
    for (let b = 1; b <= Math.max(1, maxB); b++) {
      let bandCuts: number[] | undefined;
      if (stageIdx && b > 1) {
        // cut only at stage boundaries
        const firstRank = new Map<number, number>();
        for (const [k, r] of one.rank) if (!k.startsWith(DUMMY) && stageIdx.has(k)) firstRank.set(stageIdx.get(k)!, Math.min(firstRank.get(stageIdx.get(k)!) ?? Infinity, r));
        const starts = [...firstRank.values()].sort((x, y) => x - y);
        if (starts.length < b) continue;
        const tot = one.span[L - 1].b;
        bandCuts = [0];
        for (let k = 1; k < b; k++) {
          const target = (tot * k) / b;
          let bestS = -1;
          let bestD = Infinity;
          for (const s of starts) {
            if (s <= bandCuts[bandCuts.length - 1]) continue;
            const d = Math.abs(one.span[s].a - target);
            if (d < bestD) ((bestD = d), (bestS = s));
          }
          if (bestS < 0) break;
          bandCuts.push(bestS);
        }
        if (bandCuts.length < b) continue;
      }
      let fl = b === 1 ? one : flatLayout(rootKids, sizes, rootEdges, { ...base, compact, bands: b, bandCuts });
      let W = Math.max(fl.w + PANEL_PAD * 2, titleW) + MARGIN * 2;
      let H = chromeH + fl.h;
      // poster too flat (LR) / too narrow (TB): open up the cross-axis gaps
      for (const extra of [24, 48, 72, 100]) {
        const a0 = W / H;
        if (!((dir === "LR" && a0 > 1.95) || (dir === "TB" && a0 < 1.45))) break;
        fl = flatLayout(rootKids, sizes, rootEdges, { ...base, nodeGap: base.nodeGap + extra, compact, bands: b, bandCuts });
        W = Math.max(fl.w + PANEL_PAD * 2, titleW) + MARGIN * 2;
        H = chromeH + fl.h;
      }
      const a = W / H;
      const score =
        aspectPenalty(a) * 4 +
        (b - 1) * 0.45 +
        Math.max(0, W - 2600) / 1600 +
        fl.crossings * 0.03 +
        (opts.prefer && dir !== opts.prefer ? (stageIdx ? 0.9 : 0.35) : 0) +
        (stageIdx && b > 1 ? 0.4 : 0);
      if (process.env.DBG_LAYERED) console.log("layered", dir, b, compact ? "compact" : "", Math.round(W), Math.round(H), a.toFixed(2), fl.crossings, score.toFixed(3));
      cands.push({ dir, bands: b, fl, sizes, W, H, score, compact });
    }
    }
  }
  cands.sort((a, b) => a.score - b.score);
  const best = cands[0];
  curDir = best.dir;
  blockCache.clear();
  for (const k of rootKids) if (gById.has(k) && useGroups) blockOf(k, best.dir);
  const root: Block = { w: best.fl.w, h: best.fl.h, nodes: new Map(), frames: [] };
  place(best.fl, best.sizes, root, 0, 0, undefined, 0, best.dir);

  // chrome
  const contentW = Math.max(best.fl.w + PANEL_PAD * 2, titleW);
  const content: Rect = { x: MARGIN, y: MARGIN + TITLE_H, w: Math.round(contentW), h: Math.round(best.fl.h + PANEL_PAD * 2) };
  const ox = content.x + (content.w - best.fl.w) / 2;
  const oy = content.y + PANEL_PAD;
  const R = (r: Rect): Rect => ({ x: Math.round(r.x + ox), y: Math.round(r.y + oy), w: Math.round(r.w), h: Math.round(r.h) });

  const tiers: PlacedTier[] = [];
  const tierOfNode = new Map<string, string>();
  let topIdx = 0;
  const sortedFrames = [...root.frames].sort((a, b) => a.depth - b.depth);
  for (const f of sortedFrames) {
    const g = gById.get(f.id)!;
    const index = f.depth === 0 && opts.frameIndex ? String(++topIdx).padStart(2, "0") : "";
    const r = R(f.rect);
    const lw = measureText(tierLabelText(g.label, index), FONTS.tierLabel);
    const members = nodes.filter((n) => liftTo(f.id, n.id) != null).map((n) => n.id);
    for (const m of members) tierOfNode.set(m, f.id); // deepest wins (sorted by depth)
    tiers.push({
      id: g.id,
      label: g.label,
      index,
      rect: r,
      labelRect: { x: r.x + 16, y: r.y + 12, w: lw + 18, h: 16 },
      depth: f.depth,
      parentId: f.parent,
      kind: g.kind ?? "zone",
      external: g.kind === "external",
      hidden: false,
      accentRole: "network",
      nodeIds: members,
      tag: g.tag,
      tagRect: g.tag ? (() => { const tw = measureText(g.tag!, SHAPE_FONTS.tag) + 12; return { x: r.x + r.w - 14 - tw, y: r.y + 11, w: tw, h: 15 }; })() : undefined,
    });
  }
  // stage frames
  if (stages && stageIdx) {
    const fl = best.fl;
    best.fl.bands.forEach((band, bi) => {
      stages.forEach((s, si) => {
        const rs = [...fl.rank.entries()].filter(([k, r]) => !k.startsWith(DUMMY) && stageIdx.get(k) === si && r >= band.from && r < band.to).map(([, r]) => r);
        if (!rs.length) return;
        const a = Math.min(...rs);
        const b = Math.max(...rs);
        const m0 = fl.span[a].a - fl.before[a];
        const m1 = fl.span[b].b + fl.after[b];
        const rel: Rect = best.dir === "LR" ? { x: m0, y: band.rect.y, w: m1 - m0, h: band.rect.h } : { x: band.rect.x, y: m0, w: band.rect.w, h: m1 - m0 };
        const r = R(rel);
        const id = fl.bands.length > 1 ? `${s.id}~${bi + 1}` : s.id;
        const index = opts.frameIndex === false ? "" : String(si + 1).padStart(2, "0");
        const lw = measureText(tierLabelText(s.label, index), FONTS.tierLabel);
        const members = nodes.filter((n) => stageIdx.get(n.id) === si && fl.rank.get(n.id)! >= band.from && fl.rank.get(n.id)! < band.to).map((n) => n.id);
        for (const m of members) tierOfNode.set(m, id);
        tiers.push({
          id,
          label: s.label,
          index,
          rect: r,
          labelRect: { x: r.x + 16, y: r.y + 12, w: lw + 18, h: 16 },
          depth: 0,
          kind: "stage",
          external: false,
          hidden: false,
          accentRole: "network",
          nodeIds: members,
          tag: s.tag,
          tagRect: s.tag ? (() => { const tw = measureText(s.tag!, SHAPE_FONTS.tag) + 12; return { x: r.x + r.w - 14 - tw, y: r.y + 11, w: tw, h: 15 }; })() : undefined,
        });
      });
    });
  }
  const placed: PlacedNode[] = [];
  for (const n of nodes) {
    const r = root.nodes.get(n.id);
    if (!r) continue;
    const p = placeNode(n, R(r), tierOfNode.get(n.id), metrics.get(n.id)!);
    p.dim = n.dim;
    p.emphasis = n.emphasis;
    p.rows = n.rows;
    p.status = n.status;
    placed.push(p);
  }
  const routable = edges.filter((e) => e.from !== e.to);
  const routed = routeEdges({ nodes: placed, tiers, edges: routable, area: content });
  // self-loops: small orthogonal loop over the card's top-right corner
  const byId = new Map(placed.map((p) => [p.id, p]));
  let li = 0;
  for (const e of edges) {
    if (e.from !== e.to) continue;
    const n = byId.get(e.from);
    if (!n) continue;
    const r = n.rect;
    const x0 = r.x + r.w - 34;
    const yTop = r.y - 24;
    const xR = r.x + r.w + 22;
    const y1 = r.y + 18;
    const pts: Point[] = [{ x: x0, y: r.y }, { x: x0, y: yTop }, { x: xR, y: yTop }, { x: xR, y: y1 }, { x: r.x + r.w, y: y1 }];
    const re: RoutedEdge = {
      id: `loop${li++}`,
      from: e.from,
      to: e.to,
      kind: (e.kind ?? "sync") as RoutedEdge["kind"],
      label: e.label,
      points: pts,
      fromSide: "top",
      toSide: "right",
      fromTier: false,
      toTier: false,
      bundle: `loop:${e.from}`,
      trunks: [],
      dim: e.dim,
      highlight: e.highlight,
    };
    if (e.label) {
      const s = edgeLabelSize(e.label);
      re.labelRect = { x: Math.round(Math.min(xR + 8, r.x + r.w + LOOP_RIGHT - s.w + 30) - s.w / 2 + s.w / 2 - s.w + 8), y: Math.round(yTop - s.h / 2), w: s.w, h: s.h };
      // centre the pill on the loop's top run
      re.labelRect.x = Math.round((x0 + xR) / 2 - s.w / 2);
    }
    routed.edges.push(re);
  }
  const legendH2 = legendHeight(input.legend ?? [], content.w);
  const legendRect: Rect = { x: content.x, y: content.y + content.h + 18, w: content.w, h: legendH2 };
  const footerY = legendH2 ? legendRect.y + legendRect.h + 18 : content.y + content.h + 18;
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
    routeNotes: routed.notes.filter((n) => !n.includes("self-loop")),
    plan: { rows: [], variant: best.bands, spacing: best.dir === "LR" ? 0 : 1, score: best.score },
    view: input.view,
    profile: input.profile,
  };
}
