import type { CloudDiagramInput, MicroserviceDiagramInput, QaIssue } from "../types.js";
import { layoutArchitecture } from "../layout/grid.js";
import { renderArchitectureSvg } from "../layout/svg.js";
import { renderArchitectureDrawio } from "../layout/drawio.js";
import { runArchitectureQa } from "../layout/qa.js";
import { planViews, DEFAULT_SPLIT_THRESHOLD, type SplitMode } from "../layout/split.js";
import type { ArchitectureLayoutInput, LayoutResult, ViewInfo } from "../layout/types.js";
import { assertValidEdges } from "./paths.js";

export interface CompiledView {
  info: ViewInfo;
  source: string;
  drawio?: string;
  qa: QaIssue[];
  arch: LayoutResult;
}

export interface CompiledArchitecture {
  engine: "svg";
  /** first view (overview when split) — kept for single-view callers */
  source: string;
  theme: string;
  drawio?: string;
  qa: QaIssue[];
  arch: LayoutResult;
  views: CompiledView[];
}

export interface CompileOptions {
  theme?: string;
  outputs?: Array<"svg" | "png" | "drawio">;
  split?: SplitMode;
  splitThreshold?: number;
  /** custom layout (swimlane); default: the zone grid */
  layout?: (input: ArchitectureLayoutInput) => LayoutResult;
}

/** Shared back half: model → views → SVG + draw.io + QA. Every zone-grid diagram kind goes through here. */
export function compileModel(model: ArchitectureLayoutInput, opts: CompileOptions = {}): CompiledArchitecture {
  const theme = opts.theme ?? model.theme ?? "dark";
  const wantDrawio = !opts.outputs || opts.outputs.includes("drawio");
  const specs = opts.layout ? [{ info: { kind: "full" as const, key: "" }, input: { ...model, view: { kind: "full" as const, key: "" } } }] : planViews(model, opts.split ?? "auto", opts.splitThreshold ?? DEFAULT_SPLIT_THRESHOLD);
  const views: CompiledView[] = specs.map((spec) => {
    const layout = (opts.layout ?? layoutArchitecture)(spec.input);
    return {
      info: spec.info,
      source: renderArchitectureSvg(layout, theme),
      drawio: wantDrawio ? renderArchitectureDrawio(layout, theme) : undefined,
      qa: runArchitectureQa(layout),
      arch: layout,
    };
  });
  const first = views[0];
  return { engine: "svg", source: first.source, theme, drawio: first.drawio, qa: first.qa, arch: first.arch, views };
}

export function compileArchitecture(
  input: CloudDiagramInput | MicroserviceDiagramInput,
  toolName: string,
): CompiledArchitecture {
  assertValidEdges(input.edges, input.nodes, toolName, input.groups);
  const theme = input.theme ?? "dark";
  // draw.io is on by default; outputs: ["svg","png"] opts out
  const wantDrawio = !input.outputs || input.outputs.includes("drawio");
  const specs = planViews(
    {
      title: input.title,
      subtitle: input.subtitle,
      theme,
      nodes: input.nodes,
      groups: input.groups,
      edges: input.edges,
      steps: input.steps,
      legend: input.legend,
      columns: input.columns,
      rows: input.rows,
      wrap: input.wrap,
      bottomRow: input.bottomRow,
      stepsPosition: input.stepsPosition,
    },
    input.split ?? "auto",
    input.splitThreshold ?? DEFAULT_SPLIT_THRESHOLD,
  );
  const views: CompiledView[] = specs.map((spec) => {
    const layout = layoutArchitecture(spec.input);
    return {
      info: spec.info,
      source: renderArchitectureSvg(layout, theme),
      drawio: wantDrawio ? renderArchitectureDrawio(layout, theme) : undefined,
      qa: runArchitectureQa(layout),
      arch: layout,
    };
  });
  const first = views[0];
  return { engine: "svg", source: first.source, theme, drawio: first.drawio, qa: first.qa, arch: first.arch, views };
}
