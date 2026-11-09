import type { CloudDiagramInput } from "../types.js";
import { layoutArchitecture } from "../layout/grid.js";
import { renderArchitectureSvg } from "../layout/svg.js";
import { assertValidEdges } from "./paths.js";

export function compileCloud(input: CloudDiagramInput): {
  engine: "svg";
  source: string;
  theme?: string;
} {
  assertValidEdges(input.edges, input.nodes, "create_cloud_architecture", input.groups);
  const layout = layoutArchitecture({
    title: input.title,
    subtitle: input.subtitle,
    theme: input.theme,
    nodes: input.nodes,
    groups: input.groups,
    edges: input.edges,
    steps: input.steps,
    legend: input.legend,
    columns: input.columns,
  });
  const source = renderArchitectureSvg(layout, input.theme ?? "dark");
  return { engine: "svg", source, theme: input.theme ?? "dark" };
}
