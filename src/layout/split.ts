/**
 * Auto-split for large diagrams.
 *
 * One input spec → an overview (every top-level zone collapses into one block;
 * zones with sub-zones keep their frame and show one block per sub-zone) plus
 * one detail view per region / top-level zone (small neighbouring zones are
 * merged). Detail views show the zone's own nodes and dimmed stub cards for
 * endpoints that live elsewhere, framed and labelled with their home zone.
 *
 * The transform is model-level (zones, nodes, edges, steps) and knows nothing
 * about clouds, so any zone-based diagram kind can reuse it.
 */
import type { DiagramEdge, DiagramGroup, DiagramNode, DiagramStep, EdgeKind } from "../types.js";
import type { ArchitectureLayoutInput, ViewInfo } from "./types.js";

export type SplitMode = "auto" | "never" | "always";
export const DEFAULT_SPLIT_THRESHOLD = 25;
/** Stub cards per foreign zone before they collapse into one zone stub. */
const MAX_STUBS_PER_ZONE = 5;
/** Small zones are merged into one detail view up to this many nodes. */
const MERGE_NODES = 12;

export interface ViewSpec {
  info: ViewInfo;
  input: ArchitectureLayoutInput;
}

export function shouldSplit(input: ArchitectureLayoutInput, mode: SplitMode = "auto", threshold = DEFAULT_SPLIT_THRESHOLD): boolean {
  if (mode === "never") return false;
  const roots = (input.groups ?? []).filter((g) => !g.parent);
  if (roots.length < 2) return false;
  if (mode === "always") return true;
  return input.nodes.length > threshold;
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "view";
}

interface Model {
  input: ArchitectureLayoutInput;
  groups: DiagramGroup[];
  groupById: Map<string, DiagramGroup>;
  nodeById: Map<string, DiagramNode>;
  /** top-level zone of a node / zone id */
  topOf: (id: string) => string | undefined;
  /** reading order of top-level zones */
  order: string[];
  /** original column stacks / band, top-level ids only */
  stacks: string[][];
  band: string[];
}

function model(input: ArchitectureLayoutInput): Model {
  const groups = input.groups ?? [];
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const nodeById = new Map(input.nodes.map((n) => [n.id, n]));
  const topGroup = (gid: string | undefined): string | undefined => {
    let cur = gid;
    let guard = 0;
    while (cur && groupById.get(cur)?.parent && groupById.has(groupById.get(cur)!.parent!) && guard++ < 64) cur = groupById.get(cur)!.parent;
    return cur && groupById.has(cur) ? cur : undefined;
  };
  const topOf = (id: string) => (groupById.has(id) ? topGroup(id) : nodeById.has(id) ? topGroup(nodeById.get(id)!.group) ?? "__free" : undefined);
  const roots = groups.filter((g) => !g.parent || !groupById.has(g.parent)).map((g) => g.id);
  const src = input.rows?.length ? input.rows.flat() : input.columns ?? [];
  const stacks = src.map((st) => st.filter((id) => roots.includes(id))).filter((st) => st.length);
  const band = (input.bottomRow ?? []).filter((id) => roots.includes(id));
  const seen = new Set([...stacks.flat(), ...band]);
  for (const r of roots) if (!seen.has(r)) stacks.push([r]);
  const order = [...stacks.flat(), ...band];
  if (input.nodes.some((n) => topOf(n.id) === "__free")) order.unshift("__free");
  return { input, groups, groupById, nodeById, topOf, order, stacks, band };
}

function membersOf(m: Model, gid: string): DiagramNode[] {
  const out: DiagramNode[] = [];
  const walk = (g: string) => {
    for (const n of m.input.nodes) if (n.group === g) out.push(n);
    for (const c of m.groups) if (c.parent === g) walk(c.id);
  };
  walk(gid);
  return out;
}

function dominant<T>(xs: T[]): T | undefined {
  const c = new Map<T, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  let best: T | undefined;
  let bc = -1;
  for (const [k, v] of c) if (v > bc) ((best = k), (bc = v));
  return best;
}

function blockNode(id: string, label: string, members: DiagramNode[], group?: string): DiagramNode {
  const role = dominant(members.map((n) => n.role ?? "default")) ?? "default";
  const icon = members.find((n) => (n.role ?? "default") === role)?.icon;
  const names = members.map((n) => n.label);
  return {
    id,
    label,
    subtitle: `${members.length} component${members.length === 1 ? "" : "s"}`,
    detail: names.join(" · "),
    role,
    icon,
    group,
  };
}

interface Agg {
  from: string;
  to: string;
  kind: EdgeKind;
  count: number;
  labels: Set<string>;
  steps: number[];
  kinds: EdgeKind[];
}

function aggregate(edges: DiagramEdge[], map: (id: string) => string | undefined, byKind = true): { edges: Agg[]; selfSteps: Array<{ step: number; at: string }> } {
  const out = new Map<string, Agg>();
  const selfSteps: Array<{ step: number; at: string }> = [];
  for (const e of edges) {
    const a = map(e.from);
    const b = map(e.to);
    if (!a || !b) continue;
    if (a === b) {
      if (e.step != null) selfSteps.push({ step: e.step, at: a });
      continue;
    }
    const kind = (e.kind ?? "sync") as EdgeKind;
    const key = byKind ? `${a}→${b}:${kind}` : `${a}→${b}`;
    const g = out.get(key) ?? { from: a, to: b, kind, count: 0, labels: new Set<string>(), steps: [], kinds: [] };
    g.count++;
    g.kinds.push(kind);
    g.kind = dominant(g.kinds) ?? kind;
    if (e.label) g.labels.add(e.label);
    if (e.step != null) g.steps.push(e.step);
    out.set(key, g);
  }
  return { edges: [...out.values()], selfSteps };
}

function aggLabel(a: Agg): string | undefined {
  if (a.count > 1) return `×${a.count}`;
  return [...a.labels][0];
}

/** Turn aggregated edges into DiagramEdges; one badge per edge, the rest anchor on the target. */
function materialize(aggs: Agg[], selfSteps: Array<{ step: number; at: string }>, steps: DiagramStep[]): { edges: DiagramEdge[]; steps: DiagramStep[] } {
  const anchor = new Map<number, string>();
  const edges: DiagramEdge[] = aggs.map((a) => {
    const sorted = [...a.steps].sort((x, y) => x - y);
    for (const s of sorted.slice(1)) anchor.set(s, a.to);
    return { from: a.from, to: a.to, kind: a.kind, label: aggLabel(a), step: sorted[0] };
  });
  for (const s of selfSteps) anchor.set(s.step, s.at);
  const outSteps = steps.map((s) => (anchor.has(s.n) ? { ...s, anchor: anchor.get(s.n) } : s));
  return { edges, steps: outSteps };
}

export function buildOverview(input: ArchitectureLayoutInput): ViewSpec {
  const m = model(input);
  const nodes: DiagramNode[] = [];
  const groups: DiagramGroup[] = [];
  const blockOf = new Map<string, string>(); // node / zone id → block id
  const idFor = new Map<string, string>(); // top-level zone → id used in stacks
  for (const top of m.order) {
    if (top === "__free") {
      const free = input.nodes.filter((n) => m.topOf(n.id) === "__free");
      const id = "blk:__free";
      nodes.push(blockNode(id, "Other", free));
      for (const n of free) blockOf.set(n.id, id);
      idFor.set(top, id);
      continue;
    }
    const g = m.groupById.get(top)!;
    const kids = m.groups.filter((c) => c.parent === top);
    if (!kids.length) {
      const id = `blk:${top}`;
      nodes.push(blockNode(id, g.label, membersOf(m, top)));
      for (const n of membersOf(m, top)) blockOf.set(n.id, id);
      blockOf.set(top, id);
      idFor.set(top, id);
      continue;
    }
    // zone with sub-zones keeps its frame; one block per sub-zone
    groups.push({ id: top, label: g.label, kind: g.kind, layout: g.layout, cols: Math.min(kids.length, 3) });
    idFor.set(top, top);
    blockOf.set(top, top);
    const own = input.nodes.filter((n) => n.group === top);
    if (own.length) {
      const id = `blk:${top}:own`;
      nodes.push(blockNode(id, g.label, own, top));
      for (const n of own) blockOf.set(n.id, id);
    }
    for (const k of kids) {
      const id = `blk:${k.id}`;
      const mem = membersOf(m, k.id);
      nodes.push(blockNode(id, k.label, mem, top));
      for (const n of mem) blockOf.set(n.id, id);
      const mark = (gid: string) => {
        blockOf.set(gid, id);
        for (const c of m.groups) if (c.parent === gid) mark(c.id);
      };
      mark(k.id);
    }
  }
  const { edges: aggs, selfSteps } = aggregate(input.edges ?? [], (id) => blockOf.get(id), false);
  const mapped = materialize(aggs, selfSteps, input.steps ?? []);
  const steps = mapped.steps.map((s) => (s.anchor && !nodes.some((n) => n.id === s.anchor) && !groups.some((g) => g.id === s.anchor) ? { ...s, anchor: blockOf.get(s.anchor) } : s));
  const mapId = (id: string) => idFor.get(id) ?? id;
  return {
    info: { kind: "overview", key: "overview", focus: [] },
    input: {
      ...input,
      title: input.title ? `${input.title} · Overview` : "Overview",
      nodes,
      groups,
      edges: mapped.edges,
      steps,
      columns: m.stacks.map((st) => st.map(mapId)),
      // the planner may also lay every block out as its own stack (reading order)
      columnCandidates: [m.stacks.map((st) => st.map(mapId)), m.stacks.flat().map((id) => [mapId(id)])],
      bottomRow: m.band.map(mapId),
      rows: undefined,
      // sub-zone order inside a region is semantic (ingress → services → data): keep it
      reorder: false,
      view: { kind: "overview", key: "overview", focus: [] },
    },
  };
}

/** Group top-level zones into detail views (regions / big zones alone, small neighbours merged). */
export function detailUnits(input: ArchitectureLayoutInput): string[][] {
  const m = model(input);
  const size = (top: string) => (top === "__free" ? input.nodes.filter((n) => m.topOf(n.id) === "__free").length : membersOf(m, top).length);
  const alone = (top: string) => {
    const g = m.groupById.get(top);
    return !!g && (g.kind === "region" || m.groups.some((c) => c.parent === top) || size(top) >= 6);
  };
  const units: string[][] = [];
  let cur: string[] = [];
  let curN = 0;
  for (const top of m.order) {
    if (!size(top)) continue;
    if (alone(top)) {
      if (cur.length) units.push(cur);
      units.push([top]);
      cur = [];
      curN = 0;
      continue;
    }
    if (cur.length && (curN + size(top) > MERGE_NODES || cur.length >= 3)) {
      units.push(cur);
      cur = [];
      curN = 0;
    }
    cur.push(top);
    curN += size(top);
  }
  if (cur.length) {
    // a small trailing group joins the previous merged group when it fits
    const prev = units[units.length - 1];
    const n = (u: string[]) => u.reduce((t, x) => t + size(x), 0);
    if (prev && !prev.some(alone) && n(cur) < 5 && n(prev) + n(cur) <= 14) prev.push(...cur);
    else units.push(cur);
  }
  return units;
}

export function buildDetail(input: ArchitectureLayoutInput, unit: string[]): ViewSpec {
  const m = model(input);
  const inUnit = (id: string) => {
    const t = m.topOf(id);
    return t != null && unit.includes(t);
  };
  const focusNodes = input.nodes.filter((n) => inUnit(n.id));
  const focusGroups = m.groups.filter((g) => inUnit(g.id));
  const crossing = (input.edges ?? []).filter((e) => inUnit(e.from) !== inUnit(e.to) && m.topOf(e.from) && m.topOf(e.to));
  const inner = (input.edges ?? []).filter((e) => inUnit(e.from) && inUnit(e.to));

  // foreign endpoints per home zone
  const foreign = new Map<string, Set<string>>();
  for (const e of crossing) {
    const x = inUnit(e.from) ? e.to : e.from;
    const home = m.topOf(x)!;
    (foreign.get(home) ?? foreign.set(home, new Set()).get(home)!).add(x);
  }
  const stubNodes: DiagramNode[] = [];
  const stubGroups: DiagramGroup[] = [];
  const stubOf = new Map<string, string>();
  const homeLabel = (home: string) => (home === "__free" ? "Other" : m.groupById.get(home)?.label ?? home);
  for (const [home, ids] of foreign) {
    const gid = `stubg:${home}`;
    stubGroups.push({ id: gid, label: homeLabel(home), kind: m.groupById.get(home)?.kind, stub: true, cols: 1 });
    if (ids.size > MAX_STUBS_PER_ZONE) {
      const id = `stub:${home}`;
      const mem = home === "__free" ? input.nodes.filter((n) => m.topOf(n.id) === "__free") : membersOf(m, home);
      stubNodes.push({ ...blockNode(id, homeLabel(home), mem, gid), detail: undefined, stub: true, subtitle: `${ids.size} endpoints` });
      for (const x of ids) stubOf.set(x, id);
      continue;
    }
    for (const x of ids) {
      const id = `stub:${x}`;
      const n = m.nodeById.get(x);
      const g = m.groupById.get(x);
      stubNodes.push({ id, label: n?.label ?? g?.label ?? x, role: n?.role ?? "default", icon: n?.icon ?? "layers", group: gid, stub: true });
      stubOf.set(x, id);
    }
  }
  const remap = (id: string) => (inUnit(id) ? id : stubOf.get(id));
  // dedupe after collapsing (zone stubs) and count
  const { edges: aggCross } = aggregate(crossing, remap);
  const crossEdges: DiagramEdge[] = aggCross.map((a) => {
    const orig = crossing.find((e) => remap(e.from) === a.from && remap(e.to) === a.to && (e.kind ?? "sync") === a.kind);
    return { from: a.from, to: a.to, kind: a.kind, label: a.count > 1 ? `×${a.count}` : orig?.label, step: a.count === 1 ? orig?.step : [...a.steps].sort((x, y) => x - y)[0] };
  });
  const edges = [...inner, ...collapseFanIn(crossEdges, focusNodes, unit)];

  // upstream stubs left, downstream right
  const flow = new Map<string, number>();
  for (const e of crossing) {
    const x = inUnit(e.from) ? e.to : e.from;
    const home = m.topOf(x)!;
    flow.set(home, (flow.get(home) ?? 0) + (inUnit(e.to) ? -1 : 1));
  }
  const rank = (home: string) => m.order.indexOf(home);
  const firstUnit = Math.min(...unit.map(rank));
  const homes = [...foreign.keys()];
  const isLeft = (h: string) => (flow.get(h) ?? 0) < 0 || ((flow.get(h) ?? 0) === 0 && rank(h) < firstUnit);
  const left = homes.filter(isLeft).sort((a, b) => rank(a) - rank(b)).map((h) => `stubg:${h}`);
  const right = homes.filter((h) => !isLeft(h)).sort((a, b) => rank(a) - rank(b)).map((h) => `stubg:${h}`);
  const chunk = (ids: string[], n: number) => {
    const out: string[][] = [];
    for (let i = 0; i < ids.length; i += n) out.push(ids.slice(i, i + n));
    return out;
  };
  const unitStacks = m.stacks.map((st) => st.filter((id) => unit.includes(id))).filter((st) => st.length);
  for (const id of [...m.band, ...unit]) if (unit.includes(id) && !unitStacks.flat().includes(id)) unitStacks.push([id]);
  const freeIds = unit.includes("__free") ? focusNodes.filter((n) => m.topOf(n.id) === "__free").map((n) => n.id) : [];
  if (freeIds.length) unitStacks.unshift(freeIds);
  const columns = [...chunk(left, 3), ...unitStacks, ...chunk(right, 3)];
  const columnCandidates = [1, 2, 3].flatMap((k) => [
    [...chunk(left, k), ...unitStacks, ...chunk(right, k)],
    // every stub after the zone: lets the wrapper drop them into a row below
    [...unitStacks, ...chunk([...left, ...right], k)],
  ]);

  const { subGroups, subOf } = splitDenseZones(focusGroups, focusNodes, inner);

  const stepNs = new Set(edges.filter((e) => e.step != null).map((e) => e.step!));
  const steps = (input.steps ?? []).filter((s) => stepNs.has(s.n) || (s.anchor && inUnit(s.anchor)));
  const label = unit.map(homeLabel).join(" + ");
  const key = slug(unit.join("-"));
  const info: ViewInfo = { kind: "detail", key, focus: unit };
  return {
    info,
    input: {
      ...input,
      title: input.title ? `${input.title} · ${label}` : label,
      nodes: [...focusNodes, ...stubNodes].map((n) => (subOf.has(n.id) ? { ...n, group: subOf.get(n.id) } : n)),
      groups: [...focusGroups, ...subGroups, ...stubGroups],
      edges,
      steps,
      columns,
      columnCandidates,
      bottomRow: undefined,
      rows: undefined,
      reorder: true,
      view: info,
    },
  };
}

export function planViews(input: ArchitectureLayoutInput, mode: SplitMode = "auto", threshold = DEFAULT_SPLIT_THRESHOLD): ViewSpec[] {
  if (!shouldSplit(input, mode, threshold)) {
    const info: ViewInfo = { kind: "full", key: "" };
    return [{ info, input: { ...input, view: info } }];
  }
  return [buildOverview(input), ...detailUnits(input).map((u) => buildDetail(input, u))];
}

/** A stub hit by this many focus cards with one kind collapses into one zone → stub edge. */
export const FAN_IN_COLLAPSE = 3;

/**
 * Collapse fan-in / fan-out on stub cards: when ≥ FAN_IN_COLLAPSE focus cards of
 * one zone talk to the same stub with the same kind and direction, draw a single
 * zone → stub edge labelled "×N" instead of N parallel wires.
 */
export function collapseFanIn(cross: DiagramEdge[], focusNodes: DiagramNode[], unit: string[]): DiagramEdge[] {
  const focus = new Map(focusNodes.map((n) => [n.id, n]));
  const zoneOf = (id: string) => focus.get(id)?.group ?? unit[0];
  const buckets = new Map<string, DiagramEdge[]>();
  for (const e of cross) {
    const out = focus.has(e.from);
    const stub = out ? e.to : e.from;
    const zone = zoneOf(out ? e.from : e.to);
    const key = `${zone}|${stub}|${e.kind ?? "sync"}|${out ? ">" : "<"}`;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(e);
  }
  const result: DiagramEdge[] = [];
  for (const [key, es] of buckets) {
    const [zone, stub, kind, dir] = key.split("|");
    const cards = new Set(es.map((e) => (dir === ">" ? e.from : e.to)));
    if (cards.size < FAN_IN_COLLAPSE || !zone) {
      result.push(...es);
      continue;
    }
    const n = es.reduce((t, e) => t + (e.label && /^×\d+$/.test(e.label) ? Number(e.label.slice(1)) : 1), 0);
    const steps = es.map((e) => e.step).filter((x): x is number => x != null).sort((a, b) => a - b);
    result.push({ from: dir === ">" ? zone : stub, to: dir === ">" ? stub : zone, kind: kind as EdgeKind, label: `×${n}`, step: steps[0] });
  }
  return result;
}

/** Zones above these sizes get auto sub-groups in detail views. */
export const DENSE_ZONE = { nodes: 12, edges: 20 };

/**
 * Split a dense leaf zone (> 12 cards or > 20 internal flows) into connected
 * sub-groups so the router gets corridors between them. Greedy: hubs (highest
 * degree) seed the groups, every other card joins the seed group it talks to most.
 */
export function splitDenseZones(groups: DiagramGroup[], nodes: DiagramNode[], inner: DiagramEdge[]): { subGroups: DiagramGroup[]; subOf: Map<string, string> } {
  const subGroups: DiagramGroup[] = [];
  const subOf = new Map<string, string>();
  for (const g of groups) {
    if (groups.some((c) => c.parent === g.id) || g.layout) continue;
    const mem = nodes.filter((n) => n.group === g.id);
    const ids = new Set(mem.map((n) => n.id));
    const own = inner.filter((e) => ids.has(e.from) && ids.has(e.to));
    if (mem.length <= DENSE_ZONE.nodes && own.length <= DENSE_ZONE.edges) continue;
    const k = Math.max(2, Math.ceil(mem.length / 8));
    const cap = Math.ceil(mem.length / k) + 1;
    const deg = new Map(mem.map((n) => [n.id, 0]));
    const adj = new Map<string, Map<string, number>>();
    for (const e of own) {
      deg.set(e.from, deg.get(e.from)! + 1);
      deg.set(e.to, deg.get(e.to)! + 1);
      for (const [a, b] of [[e.from, e.to], [e.to, e.from]]) {
        const m = adj.get(a) ?? adj.set(a, new Map()).get(a)!;
        m.set(b, (m.get(b) ?? 0) + 1);
      }
    }
    const order = [...mem].sort((a, b) => deg.get(b.id)! - deg.get(a.id)!);
    // seeds: high-degree cards that are not direct neighbours of an earlier seed
    const seeds: DiagramNode[] = [];
    for (const n of order) {
      if (seeds.length >= k) break;
      if (seeds.every((s) => !adj.get(s.id)?.has(n.id))) seeds.push(n);
    }
    for (const n of order) if (seeds.length < k && !seeds.includes(n)) seeds.push(n);
    const of = new Map<string, number>(seeds.map((s, i) => [s.id, i]));
    const size = seeds.map(() => 1);
    for (const n of order) {
      if (of.has(n.id)) continue;
      let bi = 0;
      let bv = -1;
      seeds.forEach((_, i) => {
        if (size[i] >= cap) return;
        let v = 0;
        for (const [o, w] of adj.get(n.id) ?? []) if (of.get(o) === i) v += w;
        if (v > bv || (v === bv && size[i] < size[bi])) {
          bv = v;
          bi = i;
        }
      });
      of.set(n.id, bi);
      size[bi]++;
    }
    seeds.forEach((s, i) => {
      const id = `${g.id}~${i + 1}`;
      subGroups.push({ id, label: `${s.label} +${size[i] - 1}`, parent: g.id, kind: g.kind, cols: size[i] > 4 ? 2 : 1 });
    });
    for (const n of mem) subOf.set(n.id, `${g.id}~${of.get(n.id)! + 1}`);
  }
  return { subGroups, subOf };
}
