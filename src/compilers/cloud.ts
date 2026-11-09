import type { CloudDiagramInput } from "../types.js";
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
import {
  assertD2EdgesAreQualified,
  assertValidEdges,
  buildQualifiedPaths,
} from "./paths.js";

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
  const useGrid = childNodes.length + childGroups.length >= 3 && childGroups.length === 0;
  const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(Math.max(childNodes.length, 1)))));

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
${indent}  ${useGrid ? `grid-columns: ${cols}` : ""}
${indent}  style: {
${indent}    fill: "${fill}"
${indent}    stroke: "${stroke}"
${indent}    stroke-width: 2
${indent}    border-radius: 12
${indent}    font-size: 20
${indent}    bold: true
${indent}    font-color: "${theme.ink}"
${indent}  }
${body}
${indent}}`;
}

export function compileCloud(input: CloudDiagramInput): { engine: "d2"; source: string } {
  const theme = getTheme(input.theme);
  const groups = input.groups ?? [];
  const tree = buildGroupTree(groups);
  const roots = tree.get(undefined) ?? [];
  const useBoard = roots.length >= 2;
  const boardId = useBoard ? "board" : undefined;
  const paths = buildQualifiedPaths(input.nodes, groups, { boardId });
  const edges = assertValidEdges(input.edges, input.nodes, "create_cloud_architecture");

  const boardCols = roots.length <= 2 ? roots.length : roots.length <= 4 ? 2 : 3;
  const rootBlocks = useBoard
    ? `board: " " {
  grid-columns: ${boardCols}
  grid-gap: 40
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

  const edgeBlock = edges
    .map((e) => {
      const label = e.label ? `: "${escapeD2(e.label)}"` : "";
      return `${paths.get(e.from)!} -> ${paths.get(e.to)!}${label} {
  ${edgeStyleD2(theme, e.kind)}
}`;
    })
    .join("\n");

  const source = `
direction: right

${titleBlockD2(theme, input.title, input.subtitle)}

${rootBlocks}

${free}

${edgeBlock}

${legendD2(theme, input.legend)}
`.trim();

  assertD2EdgesAreQualified(source, paths, "create_cloud_architecture");
  return { engine: "d2", source };
}
