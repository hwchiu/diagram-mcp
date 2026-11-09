import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { renderPipeline } from "./render/pipeline.js";
import { compileCloud } from "./compilers/cloud.js";
import { compileMicroservice } from "./compilers/microservice.js";
import { compileFlowchart } from "./compilers/flowchart.js";
import { compileDecision } from "./compilers/decision.js";
import { compileDependency } from "./compilers/dependency.js";
import { listIcons } from "./design/icons.js";
import {
  cloudSchema,
  microserviceSchema,
  flowchartSchema,
  decisionSchema,
  dependencySchema,
  renderSchema,
} from "./tools/schemas.js";
import type { RenderResult } from "./types.js";
import type { z } from "zod";

function formatResult(result: RenderResult) {
  const text = [
    `Rendered with ${result.engine} (theme: ${result.theme})`,
    `SVG: ${result.svgPath}`,
    `PNG: ${result.pngPath}`,
    `Source: ${result.sourcePath}`,
    result.width && result.height ? `Size: ${result.width}×${result.height}px` : null,
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

async function runCompiled(
  compiled: { engine: "d2" | "mermaid" | "dot"; source: string },
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
    themeId: meta.theme,
    name: meta.name ?? meta.title,
    includePreview: meta.includePreview,
    outputDir: meta.outputDir,
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
        "Generate a polished cloud / Kubernetes architecture diagram (AWS/GCP/Azure/K8s) with nested groups (region→VPC→subnet→cluster), provider icons, and semantic node roles. Returns SVG+PNG paths and a compact PNG preview.",
      inputSchema: cloudSchema.shape,
    },
    async (args: z.infer<typeof cloudSchema>) => {
      const compiled = compileCloud(args);
      return runCompiled(compiled, args);
    },
  );

  server.registerTool(
    "create_microservice_architecture",
    {
      title: "Create microservice architecture diagram",
      description:
        "Generate a polished microservice architecture diagram with services, gateways, queues, databases, and sync vs async edges. Returns SVG+PNG paths and a compact PNG preview.",
      inputSchema: microserviceSchema.shape,
    },
    async (args: z.infer<typeof microserviceSchema>) => {
      const compiled = compileMicroservice(args);
      return runCompiled(compiled, args);
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
      description: "List available local icon keys for cloud/service nodes (pass as node.icon).",
    },
    async () => ({
      content: [
        {
          type: "text" as const,
          text: `Available icons (${listIcons().length}):\n${listIcons().join(", ")}`,
        },
      ],
    }),
  );

  return server;
}
