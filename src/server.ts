import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { renderPipeline } from "./render/pipeline.js";
import { compileCloud } from "./compilers/cloud.js";
import type { CompiledArchitecture } from "./compilers/architecture.js";
import { compileMicroservice } from "./compilers/microservice.js";
import { compileFlowchart } from "./compilers/flowchart.js";
import { compileDecision } from "./compilers/decision.js";
import { compileDependency } from "./compilers/dependency.js";
import { listIcons } from "./design/icons.js";
import { MONO_PATHS } from "./layout/icons.js";
import {
  cloudSchema,
  microserviceSchema,
  flowchartSchema,
  decisionSchema,
  dependencySchema,
  renderSchema,
} from "./tools/schemas.js";
import type { EngineKind, QaIssue, RenderResult } from "./types.js";
import { summarizeQa } from "./layout/qa.js";
import type { z } from "zod";

function formatResult(result: RenderResult) {
  const text = [
    `Rendered with ${result.engine} (theme: ${result.theme})`,
    `SVG: ${result.svgPath}`,
    `PNG: ${result.pngPath}`,
    `Source: ${result.sourcePath}`,
    result.drawioPath ? `draw.io: ${result.drawioPath}` : null,
    result.width && result.height ? `Size: ${result.width}×${result.height}px` : null,
    result.qa ? summarizeQa(result.qa) : null,
    result.qa
      ? "Self-review: inspect the preview for balance, crossings and label legibility; if QA lists issues, adjust columns / bottomRow / group cols and re-render."
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  > = [{ type: "text", text }];

  if (result.previewBase64) {
    content.push({
      type: "image",
      data: result.previewBase64,
      mimeType: "image/png",
    });
  }
  return { content };
}

async function runArchitecture(
  compiled: CompiledArchitecture,
  meta: { theme?: string; name?: string; includePreview?: boolean; outputDir?: string; title?: string },
) {
  const t0 = Date.now();
  const results = [];
  for (let i = 0; i < compiled.views.length; i++) {
    const v = compiled.views[i];
    results.push({
      v,
      r: await renderPipeline({
        engine: "svg",
        source: v.source,
        themeId: meta.theme ?? compiled.theme,
        name: meta.name ?? meta.title,
        suffix: v.info.key || undefined,
        includePreview: i === 0 ? meta.includePreview : false,
        outputDir: meta.outputDir,
        drawio: v.drawio,
        qa: v.qa,
      }),
    });
  }
  if (results.length === 1) return formatResult(results[0].r);
  const head = [
    `Split into ${results.length} views (overview + ${results.length - 1} detail) in ${Date.now() - t0}ms. Preview shows the overview.`,
  ];
  const blocks = results.map(({ v, r }) =>
    [
      `## ${v.info.kind === "overview" ? "Overview" : `Detail: ${(v.info.focus ?? []).join(", ")}`} (${v.info.key})`,
      `SVG: ${r.svgPath}`,
      `PNG: ${r.pngPath}`,
      r.drawioPath ? `draw.io: ${r.drawioPath}` : null,
      r.width && r.height ? `Size: ${r.width}×${r.height}px` : null,
      r.qa ? summarizeQa(r.qa) : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
    { type: "text", text: [...head, ...blocks, 'Self-review: inspect the overview preview; pass split:"never" for a single poster or split:"always" to force views.'].join("\n\n") },
  ];
  if (results[0].r.previewBase64) content.push({ type: "image", data: results[0].r.previewBase64, mimeType: "image/png" });
  return { content };
}

async function runCompiled(
  compiled: {
    engine: EngineKind;
    source: string;
    theme?: string;
    layout?: "tala" | "elk" | "dagre" | "grid";
    drawio?: string;
    qa?: QaIssue[];
  },
  meta: {
    theme?: string;
    name?: string;
    includePreview?: boolean;
    outputDir?: string;
    title?: string;
  },
) {
  const result = await renderPipeline({
    engine: compiled.engine,
    source: compiled.source,
    themeId: meta.theme ?? compiled.theme,
    name: meta.name ?? meta.title,
    includePreview: meta.includePreview,
    outputDir: meta.outputDir,
    layout: compiled.layout,
    drawio: compiled.drawio,
    qa: compiled.qa,
  });
  return formatResult(result);
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "diagram-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "create_cloud_architecture",
    {
      title: "Create cloud architecture diagram",
      description:
        "Generate a reference-architecture style cloud / Kubernetes diagram (dark tech theme by default): deterministic tier grid (columns + optional bottomRow, nested groups) auto-wrapped into 1–3 rows to stay near 16:9 (override with rows / wrap:\"never\"), uniform cards with monoline icons, A*-routed orthogonal edges that never cross cards and bundle into trunks with junction dots, numbered step badges + walkthrough panel. Diagrams above splitThreshold nodes (default 25; split: \"auto\"|\"never\"|\"always\") are split into an overview (one block per tier, aggregated ×N flows) plus one detail view per region / top-level tier with dimmed stub cards for external endpoints; files are <name>.overview.* and <name>.<tier>.*. Returns SVG+PNG+.drawio paths per view (draw.io on by default; outputs without \"drawio\" opts out), structural QA per view and a compact PNG preview of the first (overview) view.",
      inputSchema: cloudSchema.shape,
    },
    async (args: z.infer<typeof cloudSchema>) => {
      return runArchitecture(compileCloud(args), args);
    },
  );

  server.registerTool(
    "create_microservice_architecture",
    {
      title: "Create microservice architecture diagram",
      description:
        "Generate a microservice architecture diagram (frontend → edge → BFF → services → data / events → third-party) with sync / async / data / auth edge styles, numbered steps, auto 16:9 wrap, edge trunks, auto-split into overview + detail views above splitThreshold nodes (split: \"auto\"|\"never\"|\"always\"), structural QA per view, PNG preview, and editable .drawio output (on by default).",
      inputSchema: microserviceSchema.shape,
    },
    async (args: z.infer<typeof microserviceSchema>) => {
      return runArchitecture(compileMicroservice(args), args);
    },
  );

  server.registerTool(
    "create_flowchart",
    {
      title: "Create flowchart",
      description:
        "Generate a professional process / program flowchart (supports swimlanes via groups with kind=lane, decisions, subprocesses). Returns SVG+PNG paths and a compact PNG preview.",
      inputSchema: flowchartSchema.shape,
    },
    async (args: z.infer<typeof flowchartSchema>) => {
      const compiled = compileFlowchart(args);
      return runCompiled(compiled, args);
    },
  );

  server.registerTool(
    "create_decision_diagram",
    {
      title: "Create decision diagram",
      description:
        "Generate a decision tree / decision diagram with questions, actions, and outcomes. Branch labels (yes/no/…) are color-coded. Returns SVG+PNG paths and a compact PNG preview.",
      inputSchema: decisionSchema.shape,
    },
    async (args: z.infer<typeof decisionSchema>) => {
      const compiled = compileDecision(args);
      return runCompiled(compiled, args);
    },
  );

  server.registerTool(
    "create_dependency_graph",
    {
      title: "Create dependency graph",
      description:
        "Generate a readable dependency graph for packages / modules / services (Graphviz). Tuned for large graphs (dozens–hundreds of nodes). Returns SVG+PNG paths and a compact PNG preview.",
      inputSchema: dependencySchema.shape,
    },
    async (args: z.infer<typeof dependencySchema>) => {
      const compiled = compileDependency(args);
      return runCompiled(compiled, args);
    },
  );

  server.registerTool(
    "render_diagram",
    {
      title: "Render raw diagram source",
      description:
        "Render raw D2, Mermaid, or Graphviz DOT source with the design-system post-processing pipeline. Use when you need full control of the engine source. Returns SVG+PNG paths and a compact PNG preview.",
      inputSchema: renderSchema.shape,
    },
    async (args: z.infer<typeof renderSchema>) => {
      const result = await renderPipeline({
        engine: args.engine,
        source: args.source,
        themeId: args.theme,
        name: args.name ?? args.title,
        includePreview: args.includePreview,
        outputDir: args.outputDir,
      });
      return formatResult(result);
    },
  );

  server.registerTool(
    "list_diagram_icons",
    {
      title: "List diagram icons",
      description:
        "List monoline architecture icon keys (preferred) and legacy brand icon keys.",
    },
    async () => ({
      content: [
        {
          type: "text" as const,
          text: [
            `Monoline icons (architecture): ${Object.keys(MONO_PATHS).join(", ")}`,
            `Legacy brand icons (avoid for architecture): ${listIcons().join(", ")}`,
          ].join("\n"),
        },
      ],
    }),
  );

  return server;
}
