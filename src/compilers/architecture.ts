/**
 * Shared AWS-reference-style D2 emitter for cloud + microservice diagrams.
 * Dashed tiers, uniform icon cards, sparse edges, numbered steps panel.
 */
import type {
  DiagramGroup,
  DiagramNode,
  StructuredDiagramInput,
} from "../types.js";
import { getTheme, type ThemePalette } from "../design/themes.js";
import {
  buildGroupTree,
  emitArchitectureNode,
  emitEdgeBlock,
  escapeD2,
  groupDepth,
  isExternalBand,
  legendD2,
  nodesInGroup,
  preferVerticalGrid,
  safeId,
  stepBadgesD2,
  stepsPanelD2,
  titleBlockD2,
  ungroupedNodes,
} from "./shared.js";
import {
  assertD2EdgesAreQualified,
  assertValidEdges,
  buildQualifiedPaths,
} from "./paths.js";

function collectCellsGroups(
  input: StructuredDiagramInput,
  tree: Map<string | undefined, DiagramGroup[] | undefined>,
): Set<string> {
  const groups = input.groups ?? [];
  const cells = new Set<string>();
  for (const g of groups) {
    const childGroups = tree.get(g.id) ?? [];
    const childNodes = nodesInGroup(input.nodes, g.id);
    // Leaf tiers with 2+ nodes get a cells grid wrapper
    if (childNodes.length >= 2 && childGroups.length === 0) {
      cells.add(g.id);
    }
  }
  return cells;
}

function emitGroup(
  theme: ThemePalette,
  input: StructuredDiagramInput,
  groupId: string,
  tree: Map<string | undefined, DiagramGroup[] | undefined>,
  cellsGroups: Set<string>,
  indent = "  ",
): string {
  const groups = input.groups ?? [];
  const g = groups.find((x) => x.id === groupId)!;
  const depth = groupDepth(groups, groupId);
  const fill = theme.groupFills[depth % theme.groupFills.length];
  const stroke = theme.groupStrokes[depth % theme.groupStrokes.length];
  const id = safeId(g.id);
  const childGroups = (tree.get(groupId) ?? []) as DiagramGroup[];
  const childNodes = nodesInGroup(input.nodes, groupId);
  const external = isExternalBand(g);
  const useCells = cellsGroups.has(groupId);
  const vertical = preferVerticalGrid(g, childNodes.length);

  const cols = vertical
    ? 1
    : Math.min(external ? 6 : 4, Math.max(2, childNodes.length));
  const gridDecl = vertical ? `grid-rows: ${childNodes.length}` : `grid-columns: ${cols}`;

  const nodeBlocks = childNodes
    .map((n) =>
      emitArchitectureNode(theme, n, { compact: external })
        .split("\n")
        .map((l) => (useCells ? indent + "    " : indent + "  ") + l)
        .join("\n"),
    )
    .join("\n");

  const nested = childGroups
    .map((cg) => emitGroup(theme, input, cg.id, tree, cellsGroups, indent + "  "))
    .join("\n\n");

  let body: string;
  if (useCells) {
    // Label must be blank — a visible "cells" caption is a layout artifact
    body = `${indent}  cells: " " {
${indent}    ${gridDecl}
${indent}    style: {
${indent}      fill: "transparent"
${indent}      stroke: "transparent"
${indent}      font-size: 8
${indent}      font-color: "transparent"
${indent}    }
${nodeBlocks}
${indent}  }`;
  } else {
    body = [nodeBlocks, nested].filter(Boolean).join("\n");
  }

  // External band: solid (not dashed) grey footer-style container — no `near`
  // (constant near keys conflict with step badges / TALA).
  return `${indent}${id}: "${escapeD2(g.label)}" {
${indent}  style: {
${indent}    fill: "${external ? "#F1F5F9" : fill}"
${indent}    stroke: "${external ? "#94A3B8" : stroke}"
${indent}    ${external ? "" : "stroke-dash: 4"}
${indent}    stroke-width: 2
${indent}    border-radius: 4
${indent}    font-size: 14
${indent}    bold: true
${indent}    font-color: "${theme.ink}"
${indent}  }
${body}
${indent}}`;
}

export function compileArchitecture(
  input: StructuredDiagramInput,
  context: string,
  opts?: {
    defaultLegend?: Array<{
      label: string;
      role?: import("../design/themes.js").NodeRole;
      kind?: import("../types.js").EdgeKind;
    }>;
  },
): { engine: "d2"; source: string; layout: "tala" | "elk" | "dagre" } {
  const theme = getTheme(input.theme);
  const groups = input.groups ?? [];
  const tree = buildGroupTree(groups);
  const roots = tree.get(undefined) ?? [];
  const cellsGroups = collectCellsGroups(input, tree);

  // Prefer flat root siblings for TALA (no board grid) when ≤6 roots —
  // board grids fight orthogonal routing. Use board only when many roots.
  const useBoard = roots.length >= 7;
  const boardId = useBoard ? "board" : undefined;
  const paths = buildQualifiedPaths(input.nodes, groups, {
    boardId,
    cellsGroups,
  });
  const edges = assertValidEdges(input.edges, input.nodes, context, groups);

  const layout = input.layout ?? "tala";

  const rootBlocks = useBoard
    ? `board: " " {
  grid-columns: ${roots.length <= 4 ? 2 : 3}
  grid-gap: 48
  style: {
    fill: "transparent"
    stroke: "transparent"
    font-size: 8
    font-color: "transparent"
  }
${roots.map((g) => emitGroup(theme, input, g.id, tree, cellsGroups, "  ")).join("\n\n")}
}`
    : roots.map((g) => emitGroup(theme, input, g.id, tree, cellsGroups, "")).join("\n\n");

  const free = ungroupedNodes(input.nodes, groups)
    .map((n) => emitArchitectureNode(theme, n))
    .join("\n");

  const source = `
direction: right

${titleBlockD2(theme, input.title, input.subtitle)}

${rootBlocks}

${free}

${emitEdgeBlock(theme, edges, paths)}

${stepBadgesD2(theme, input.steps, paths)}

${stepsPanelD2(theme, input.steps)}

${legendD2(theme, input.legend ?? opts?.defaultLegend)}
`.trim();

  assertD2EdgesAreQualified(source, paths, context);
  return { engine: "d2", source, layout };
}

/** Expose for tests: which groups wrap children in cells. */
export function cellsGroupsFor(input: StructuredDiagramInput): Set<string> {
  return collectCellsGroups(input, buildGroupTree(input.groups ?? []));
}

export type { DiagramNode };
