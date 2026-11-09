import type { DiagramEdge, DiagramGroup, DiagramNode } from "../types.js";
import { safeId } from "./shared.js";

/** Walk group → parent chain (root first). */
export function groupAncestorIds(groups: DiagramGroup[], groupId: string): string[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const parts: string[] = [];
  let cur: string | undefined = groupId;
  const seen = new Set<string>();
  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    parts.unshift(cur);
    cur = byId.get(cur)!.parent;
  }
  return parts;
}

export interface PathBuildOptions {
  boardId?: string;
  /**
   * Group ids that wrap children in a `cells` grid container
   * (needed so circular step badges can `near` the outer group).
   */
  cellsGroups?: Set<string>;
}

function qualifyGroupPath(
  groups: DiagramGroup[],
  groupId: string,
  opts?: PathBuildOptions,
): string {
  const parts: string[] = [];
  if (opts?.boardId) parts.push(safeId(opts.boardId));
  for (const gid of groupAncestorIds(groups, groupId)) {
    parts.push(safeId(gid));
  }
  return parts.join(".");
}

/**
 * Map logical node.id → fully-qualified D2 path.
 * Nested nodes become e.g. `board.domain.cells.order` so edges don't spawn duplicates.
 * Also maps group.id → container path (for tier-to-tier edges).
 */
export function buildQualifiedPaths(
  nodes: DiagramNode[],
  groups: DiagramGroup[],
  opts?: PathBuildOptions,
): Map<string, string> {
  const groupIds = new Set(groups.map((g) => g.id));
  const cells = opts?.cellsGroups ?? new Set<string>();
  const map = new Map<string, string>();

  for (const g of groups) {
    map.set(g.id, qualifyGroupPath(groups, g.id, opts));
  }

  for (const n of nodes) {
    const parts: string[] = [];
    const inGroup = !!(n.group && groupIds.has(n.group));
    if (opts?.boardId && inGroup) {
      parts.push(safeId(opts.boardId));
    }
    if (inGroup) {
      for (const gid of groupAncestorIds(groups, n.group!)) {
        parts.push(safeId(gid));
      }
      if (cells.has(n.group!)) {
        parts.push("cells");
      }
    }
    parts.push(safeId(n.id));
    map.set(n.id, parts.join("."));
  }
  return map;
}

/**
 * Ensure every edge endpoint references a declared node id OR group id
 * (group ids enable sparse tier-to-tier / container-to-container edges).
 */
export function assertValidEdges(
  edges: DiagramEdge[] | undefined,
  nodes: DiagramNode[],
  context = "diagram",
  groups?: DiagramGroup[],
): DiagramEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  for (const g of groups ?? []) ids.add(g.id);
  const list = edges ?? [];
  const missing: string[] = [];
  for (const e of list) {
    if (!ids.has(e.from)) missing.push(`from="${e.from}"`);
    if (!ids.has(e.to)) missing.push(`to="${e.to}"`);
  }
  if (missing.length) {
    throw new Error(
      `${context}: edge endpoint(s) are not declared nodes/groups: ${[...new Set(missing)].join(", ")}`,
    );
  }
  return list;
}

/**
 * Parse `a -> b` / `a.b -> c.d` edges from compiled D2 and ensure both ends
 * are exact fully-qualified paths from the path map (no bare nested ids).
 */
export function assertD2EdgesAreQualified(
  source: string,
  paths: Map<string, string>,
  context = "d2",
): void {
  const allowed = new Set(paths.values());
  const edgeRe = /^([A-Za-z_][\w.]*)\s*->\s*([A-Za-z_][\w.]*)/gm;
  const bad: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = edgeRe.exec(source))) {
    const from = m[1];
    const to = m[2];
    if (!allowed.has(from)) bad.push(`from=${from}`);
    if (!allowed.has(to)) bad.push(`to=${to}`);
  }
  if (bad.length) {
    throw new Error(
      `${context}: D2 edges must use fully qualified nested paths: ${[...new Set(bad)].join(", ")}`,
    );
  }
}
