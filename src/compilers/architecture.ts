import type { CloudDiagramInput, MicroserviceDiagramInput, QaIssue } from "../types.js";
import { layoutArchitecture } from "../layout/grid.js";
import { renderArchitectureSvg } from "../layout/svg.js";
import { renderArchitectureDrawio } from "../layout/drawio.js";
import { runArchitectureQa } from "../layout/qa.js";
import type { LayoutResult } from "../layout/types.js";
import { assertValidEdges } from "./paths.js";

export interface CompiledArchitecture {
  engine: "svg";
  source: string;
  theme: string;
  drawio?: string;
  qa: QaIssue[];
  arch: LayoutResult;
}

export function compileArchitecture(
  input: CloudDiagramInput | MicroserviceDiagramInput,
  toolName: string,
): CompiledArchitecture {
  assertValidEdges(input.edges, input.nodes, toolName, input.groups);
  const theme = input.theme ?? "dark";
  const layout = layoutArchitecture({
    title: input.title,
    subtitle: input.subtitle,
    theme,
    nodes: input.nodes,
    groups: input.groups,
    edges: input.edges,
    steps: input.steps,
    legend: input.legend,
    columns: input.columns,
    bottomRow: input.bottomRow,
    stepsPosition: input.stepsPosition,
  });
  const source = renderArchitectureSvg(layout, theme);
  const qa = runArchitectureQa(layout);
  const drawio = input.outputs?.includes("drawio") ? renderArchitectureDrawio(layout, theme) : undefined;
  return { engine: "svg", source, theme, drawio, qa, arch: layout };
}
