import type { CloudDiagramInput, DiagramEdge } from "../types.js";
import { getTheme } from "../design/themes.js";
import {
  buildGroupTree,
  escapeD2,
  groupDepth,
  legendD2,
  nodeStyleD2,
  nodesInGroup,
  safeId,
  titleBlockD2,
  ungroupedNodes,
  edgeStyleD2,
} from "./shared.js";

function emitNode(theme: ReturnType<typeof getTheme>, node: CloudDiagramInput["nodes"][0]): string {
  const id = safeId(node.id);
  const label = node.subtitle
    ? `${escapeD2(node.label)}\\n${escapeD2(node.subtitle)}`
    : escapeD2(node.label);
  return `${id}: "${label}" {
  ${nodeStyleD2(theme, node)}
}`;
}

function emitGroup(
  theme: ReturnType<typeof getTheme>,
  input: CloudDiagramInput,
  groupId: string,
  tree: Map<string | undefined, CloudDiagramInput["groups"]>,
  indent = "  ",
): string {
  const groups = input.groups ?? [];
  const g = groups.find((x) => x.id === groupId)!;
  const depth = groupDepth(groups, groupId);
  const fill = theme.groupFills[depth % theme.groupFills.length];
  const stroke = theme.groupStrokes[depth % theme.groupStrokes.length];
  const id = safeId(g.id);

  const childGroups = (tree.get(groupId) ?? []) as NonNullable<CloudDiagramInput["groups"]>;
  const childNodes = nodesInGroup(input.nodes, groupId);

  // Horizontal packing inside containers keeps architecture posters readable
  const useGrid = childNodes.length + childGroups.length >= 3 && childGroups.length === 0;

  const body = [
    ...childNodes.map((n) =>
      emitNode(theme, n)
        .split("\n")
        .map((l) => indent + "  " + l)
        .join("\n"),
    ),
    ...childGroups.map((cg) => emitGroup(theme, input, cg.id, tree, indent + "  ")),
  ].join("\n");

  return `${indent}${id}: "${escapeD2(g.label)}" {
${indent}  ${useGrid ? `grid-columns: ${Math.min(4, Math.max(2, Math.ceil(Math.sqrt(childNodes.length))))}` : ""}
${indent}  style: {
${indent}    fill: "${fill}"
${indent}    stroke: "${stroke}"
${indent}    stroke-width: 2
${indent}    border-radius: 12
${indent}    font-size: 15
${indent}    bold: true
${indent}    font-color: "${theme.ink}"
${indent}  }
${body}
${indent}}`;
}

function filterNodeEdges(
  edges: DiagramEdge[] | undefined,
  nodeIds: Set<string>,
): DiagramEdge[] {
  return (edges ?? []).filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
}

export function compileCloud(input: CloudDiagramInput): { engine: "d2"; source: string } {
  const theme = getTheme(input.theme);
  const groups = input.groups ?? [];
  const tree = buildGroupTree(groups);
  const roots = tree.get(undefined) ?? [];
  const nodeIds = new Set(input.nodes.map((n) => n.id));

  // Invisible board container packs root groups into a poster-friendly grid.
  const rootBlocks =
    roots.length >= 2
      ? `board: " " {
  grid-columns: ${Math.min(3, roots.length)}
  grid-gap: 72
  style: {
    fill: "transparent"
    stroke: "transparent"
    font-size: 8
    font-color: "transparent"
  }
${roots.map((g) => emitGroup(theme, input, g.id, tree, "  ")).join("\n\n")}
}`
      : roots.map((g) => emitGroup(theme, input, g.id, tree, "")).join("\n\n");

  const free = ungroupedNodes(input.nodes, groups)
    .map((n) => emitNode(theme, n))
    .join("\n");

  const edges = filterNodeEdges(input.edges, nodeIds)
    .map((e) => {
      const label = e.label ? `: "${escapeD2(e.label)}"` : "";
      return `${safeId(e.from)} -> ${safeId(e.to)}${label} {
  ${edgeStyleD2(theme, e.kind)}
}`;
    })
    .join("\n");

  const source = `
direction: right

${titleBlockD2(theme, input.title, input.subtitle)}

${rootBlocks}

${free}

${edges}

${legendD2(theme, input.legend)}
`.trim();

  return { engine: "d2", source };
}
