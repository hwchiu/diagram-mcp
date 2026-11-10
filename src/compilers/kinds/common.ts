/**
 * Shared plumbing for the notation-specific diagram kinds (system context,
 * component, deployment, network, DFD, swimlane). Each kind compiles its own
 * domain schema into the zone-grid model (zones / nodes / edges / steps) and
 * hands it to compileModel → split, layout, router, QA, SVG, draw.io.
 */
import type { DiagramEdge, DiagramGroup, DiagramNode, DiagramStep, EdgeKind } from "../../types.js";
import type { ArchitectureLayoutInput, DiagramProfile, LegendItem } from "../../layout/types.js";
import { assertValidEdges } from "../paths.js";

export interface KindMeta {
  title?: string;
  subtitle?: string;
  theme?: string;
  outputs?: Array<"svg" | "png" | "drawio">;
  split?: "auto" | "never" | "always";
  splitThreshold?: number;
  steps?: DiagramStep[];
}

export interface KindModel {
  nodes: DiagramNode[];
  groups: DiagramGroup[];
  edges: DiagramEdge[];
  columns?: string[][];
  rows?: string[][][];
  wrap?: "auto" | "never";
  reorder?: boolean;
  legend: LegendItem[];
  profile: DiagramProfile;
}

/** Throw an LLM-friendly error for duplicate ids / unknown references. */
export function validateModel(tool: string, nodes: DiagramNode[], groups: DiagramGroup[], edges: DiagramEdge[]): void {
  const seen = new Map<string, string>();
  for (const g of groups) {
    if (seen.has(g.id)) throw new Error(`${tool}: duplicate id "${g.id}" (ids must be unique across zones and nodes)`);
    seen.set(g.id, "zone");
  }
  for (const n of nodes) {
    if (seen.has(n.id)) throw new Error(`${tool}: duplicate id "${n.id}" (ids must be unique across zones and nodes)`);
    seen.set(n.id, "node");
  }
  const gids = new Set(groups.map((g) => g.id));
  for (const n of nodes) if (n.group && !gids.has(n.group)) throw new Error(`${tool}: "${n.id}" references unknown zone "${n.group}". Known zones: ${[...gids].join(", ") || "(none)"}`);
  for (const g of groups) if (g.parent && !gids.has(g.parent)) throw new Error(`${tool}: zone "${g.id}" has unknown parent "${g.parent}"`);
  assertValidEdges(edges, nodes, tool, groups);
}

/** Top-level zone id of a node / zone (or the node id itself when ungrouped). */
export function unitResolver(nodes: DiagramNode[], groups: DiagramGroup[]): (id: string) => string {
  const gById = new Map(groups.map((g) => [g.id, g]));
  const nById = new Map(nodes.map((n) => [n.id, n]));
  const top = (gid: string): string => {
    let cur = gid;
    let guard = 0;
    while (gById.get(cur)?.parent && gById.has(gById.get(cur)!.parent!) && guard++ < 64) cur = gById.get(cur)!.parent!;
    return cur;
  };
  return (id: string) => {
    if (gById.has(id)) return top(id);
    const n = nById.get(id);
    if (n?.group && gById.has(n.group)) return top(n.group);
    return id;
  };
}

/**
 * Column stacks by flow rank: units (top-level zones / free nodes) are layered
 * by longest path over cross-unit edges (cycles broken in input order), pinned
 * units keep their rank, and units sharing a rank stack top → bottom ordered by
 * the mean position of their predecessors.
 */
export function rankColumns(units: string[], edges: DiagramEdge[], unitOf: (id: string) => string, pin: Map<string, number> = new Map()): string[][] {
  const idx = new Map(units.map((u, i) => [u, i]));
  const succ = new Map<string, Set<string>>(units.map((u) => [u, new Set()]));
  for (const e of edges) {
    const a = unitOf(e.from);
    const b = unitOf(e.to);
    if (a === b || !idx.has(a) || !idx.has(b)) continue;
    succ.get(a)!.add(b);
  }
  // DFS to drop back edges
  const state = new Map<string, number>();
  const dag = new Map<string, Set<string>>(units.map((u) => [u, new Set()]));
  const visit = (u: string) => {
    state.set(u, 1);
    for (const v of succ.get(u)!) {
      const s = state.get(v) ?? 0;
      if (s === 1) continue; // back edge
      dag.get(u)!.add(v);
      if (s === 0) visit(v);
    }
    state.set(u, 2);
  };
  const indeg = new Map(units.map((u) => [u, 0]));
  for (const [, vs] of succ) for (const v of vs) indeg.set(v, (indeg.get(v) ?? 0) + 1);
  for (const u of units) if ((indeg.get(u) ?? 0) === 0 && !state.has(u)) visit(u);
  for (const u of units) if (!state.has(u)) visit(u);
  const rank = new Map<string, number>();
  const order: string[] = [];
  const seen = new Set<string>();
  const topo = (u: string) => {
    if (seen.has(u)) return;
    seen.add(u);
    for (const v of dag.get(u)!) topo(v);
    order.unshift(u);
  };
  for (const u of units) topo(u);
  for (const u of order) rank.set(u, Math.max(rank.get(u) ?? 0, pin.get(u) ?? 0));
  for (const u of order) {
    for (const v of dag.get(u)!) if (!pin.has(v)) rank.set(v, Math.max(rank.get(v) ?? 0, (rank.get(u) ?? 0) + 1));
  }
  for (const [u, r] of pin) if (idx.has(u)) rank.set(u, r);
  // isolated units (no edges at all) join the busiest middle column rather than a lonely column 0
  const touched = new Set<string>();
  for (const e of edges) {
    touched.add(unitOf(e.from));
    touched.add(unitOf(e.to));
  }
  const ranks = [...new Set([...rank.values()])].sort((a, b) => a - b);
  const cols: string[][] = ranks.map((r) => units.filter((u) => rank.get(u) === r));
  // barycentre order inside each column
  const pos = new Map<string, number>();
  cols.forEach((c, ci) => {
    if (ci > 0) {
      const bc = (u: string) => {
        const ps: number[] = [];
        for (const [a, vs] of succ) if (vs.has(u) && pos.has(a)) ps.push(pos.get(a)!);
        return ps.length ? ps.reduce((s, v) => s + v, 0) / ps.length : idx.get(u)!;
      };
      c.sort((a, b) => bc(a) - bc(b) || idx.get(a)! - idx.get(b)!);
    }
    c.forEach((u, i) => pos.set(u, i));
  });
  void touched;
  return cols.filter((c) => c.length);
}

export function joinLabel(...parts: Array<string | undefined | null | false>): string | undefined {
  const p = parts.filter((x): x is string => !!x && !!String(x).trim());
  return p.length ? p.join(" · ") : undefined;
}

export function edgeKindsLegend(edges: DiagramEdge[], labels: Partial<Record<EdgeKind, string>>): LegendItem[] {
  const order: EdgeKind[] = ["sync", "async", "data", "auth", "default"];
  const used = new Set(edges.map((e) => e.kind ?? "sync"));
  return order.filter((k) => used.has(k) && labels[k]).map((k) => ({ label: labels[k]!, kind: k }));
}

export function toLayoutInput(m: KindModel, meta: KindMeta): ArchitectureLayoutInput {
  return {
    title: meta.title,
    subtitle: meta.subtitle,
    theme: meta.theme,
    nodes: m.nodes,
    groups: m.groups,
    edges: m.edges,
    steps: meta.steps,
    legend: m.legend,
    columns: m.columns,
    rows: m.rows,
    // left → right reading order matters more than squareness for ≤3 stacks
    wrap: m.wrap ?? ((m.columns?.length ?? 0) <= 3 ? "never" : "auto"),
    // undefined → the engine tries barycentre order and keeps it when it removes crossings
    reorder: m.reorder,
    profile: m.profile,
  };
}

/** Stable-sort each group's members by flow depth (longest path), so chains read top→bottom. */
export function flowSortMembers(nodes: DiagramNode[], edges: DiagramEdge[]): void {
  const ids = new Set(nodes.map((n) => n.id));
  const depth = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (let it = 0; it < nodes.length; it++) {
    let changed = false;
    for (const e of edges) {
      if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
      const d = depth.get(e.from)! + 1;
      if (d > depth.get(e.to)! && d < nodes.length) {
        depth.set(e.to, d);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const pos = new Map(nodes.map((n, i) => [n.id, i]));
  const byGroup = new Map<string, number[]>();
  nodes.forEach((n, i) => (byGroup.get(n.group ?? "") ?? byGroup.set(n.group ?? "", []).get(n.group ?? "")!).push(i));
  const copy = [...nodes];
  for (const slots of byGroup.values()) {
    const members = slots.map((i) => copy[i]).sort((a, b) => depth.get(a.id)! - depth.get(b.id)! || pos.get(a.id)! - pos.get(b.id)!);
    slots.forEach((i, k) => (nodes[i] = members[k]));
  }
}
