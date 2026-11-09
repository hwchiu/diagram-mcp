import type { DiagramEdge, MicroserviceDiagramInput } from "../types.js";
import { getTheme } from "../design/themes.js";
import {
  buildGroupTree,
  escapeD2,
  edgeStyleD2,
  groupDepth,
  legendD2,
  nodeStyleD2,
  nodesInGroup,
  safeId,
  titleBlockD2,
  ungroupedNodes,
} from "./shared.js";

function emitNode(theme: ReturnType<typeof getTheme>, node: MicroserviceDiagramInput["nodes"][0]): string {
  const id = safeId(node.id);
  const label = node.subtitle
    ? `${escapeD2(node.label)}\\n${escapeD2(node.subtitle)}`
    : escapeD2(node.label);
  const shaped =
    node.role === "queue" && !node.shape
      ? { ...node, shape: "queue" as const }
      : node.role === "data" && !node.shape
        ? { ...node, shape: "cylinder" as const }
        : node;
  return `${id}: "${label}" {
  ${nodeStyleD2(theme, shaped)}
}`;
}

function emitGroup(
  theme: ReturnType<typeof getTheme>,
  input: MicroserviceDiagramInput,
  groupId: string,
  tree: Map<string | undefined, MicroserviceDiagramInput["groups"]>,
  indent = "  ",
): string {
  const groups = input.groups ?? [];
  const g = groups.find((x) => x.id === groupId)!;
  const depth = groupDepth(groups, groupId);
  const fill = theme.groupFills[depth % theme.groupFills.length];
  const stroke = theme.groupStrokes[depth % theme.groupStrokes.length];
  const id = safeId(g.id);
  const childGroups = (tree.get(groupId) ?? []) as NonNullable<MicroserviceDiagramInput["groups"]>;
  const childNodes = nodesInGroup(input.nodes, groupId);
  const useGrid = childNodes.length >= 3 && childGroups.length === 0;
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
${indent}  ${useGrid ? `grid-columns: ${Math.min(4, childNodes.length)}` : ""}
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

export function compileMicroservice(input: MicroserviceDiagramInput): { engine: "d2"; source: string } {
  const theme = getTheme(input.theme);
  const groups = input.groups ?? [];
  const tree = buildGroupTree(groups);
  const roots = tree.get(undefined) ?? [];
  const nodeIds = new Set(input.nodes.map((n) => n.id));

  const rootBlocks =
    roots.length >= 2
      ? `board: " " {
  grid-columns: ${Math.min(3, roots.length)}
  grid-gap: 56
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

  const edges = ((input.edges ?? []) as DiagramEdge[])
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e) => {
      const label = e.label ? `: "${escapeD2(e.label)}"` : "";
      return `${safeId(e.from)} -> ${safeId(e.to)}${label} {
  ${edgeStyleD2(theme, e.kind ?? (e.label?.toLowerCase().includes("event") ? "async" : "sync"))}
}`;
    })
    .join("\n");

  const source = `
direction: right

${titleBlockD2(theme, input.title, input.subtitle)}

${rootBlocks}

${free}

${edges}

${legendD2(
  theme,
  input.legend ?? [
    { label: "Service", role: "compute" },
    { label: "Gateway", role: "gateway" },
    { label: "Queue / bus", role: "queue" },
    { label: "Database", role: "data" },
    { label: "Sync call", kind: "sync" },
    { label: "Async event", kind: "async" },
  ],
)}
`.trim();

  return { engine: "d2", source };
}
