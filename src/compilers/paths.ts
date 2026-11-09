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

/**
 * Map logical node.id → fully-qualified D2 path.
 * Nested nodes become e.g. `board.domain.order` so edges don't spawn duplicates.
 */
export function buildQualifiedPaths(
  nodes: DiagramNode[],
  groups: DiagramGroup[],
  opts?: { boardId?: string },
): Map<string, string> {
  const groupIds = new Set(groups.map((g) => g.id));
  const map = new Map<string, string>();

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
    }
    parts.push(safeId(n.id));
    map.set(n.id, parts.join("."));
  }
  return map;
}

/**
 * Ensure every edge endpoint references a declared node id.
 * Throws with a clear message (used by compilers + unit tests).
 */
export function assertValidEdges(
  edges: DiagramEdge[] | undefined,
  nodes: DiagramNode[],
  context = "diagram",
): DiagramEdge[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const list = edges ?? [];
  const missing: string[] = [];
  for (const e of list) {
    if (!nodeIds.has(e.from)) missing.push(`from="${e.from}"`);
    if (!nodeIds.has(e.to)) missing.push(`to="${e.to}"`);
  }
  if (missing.length) {
    throw new Error(
      `${context}: edge endpoint(s) are not declared nodes: ${[...new Set(missing)].join(", ")}`,
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
