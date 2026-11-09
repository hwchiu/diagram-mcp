import { z } from "zod";

const themeSchema = z.enum(["light", "dark", "presentation", "blueprint"]).optional();

const nodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  subtitle: z.string().optional(),
  role: z
    .enum([
      "compute",
      "data",
      "network",
      "security",
      "external",
      "queue",
      "gateway",
      "storage",
      "observability",
      "default",
    ])
    .optional(),
  icon: z.string().optional(),
  group: z.string().optional(),
  shape: z
    .enum(["rectangle", "rounded", "cylinder", "diamond", "hexagon", "person", "queue", "cloud"])
    .optional(),
});

const groupSchema = z.object({
  id: z.string(),
  label: z.string(),
  parent: z.string().optional(),
  kind: z
    .enum(["region", "vpc", "subnet", "cluster", "namespace", "zone", "lane", "other"])
    .optional(),
});

const edgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  kind: z.enum(["sync", "async", "data", "default"]).optional(),
  step: z.number().int().positive().optional(),
});

const stepSchema = z.object({
  n: z.number().int().positive(),
  label: z.string().min(1),
  description: z.string().optional(),
  /** Node or group id for on-diagram circular badge placement */
  anchor: z.string().optional(),
});

const meta = {
  title: z.string().optional(),
  subtitle: z.string().optional(),
  theme: themeSchema,
  name: z.string().optional(),
  includePreview: z.boolean().optional(),
  outputDir: z.string().optional(),
  layout: z.enum(["tala", "elk", "dagre"]).optional(),
};

export const cloudSchema = z.object({
  ...meta,
  provider: z.enum(["aws", "gcp", "azure", "kubernetes", "multi"]).optional(),
  nodes: z.array(nodeSchema).min(1),
  groups: z.array(groupSchema).optional(),
  edges: z.array(edgeSchema).optional(),
  steps: z.array(stepSchema).optional(),
  legend: z
    .array(
      z.object({
        label: z.string(),
        role: nodeSchema.shape.role,
        kind: edgeSchema.shape.kind,
      }),
    )
    .optional(),
});

export const microserviceSchema = z.object({
  ...meta,
  nodes: z.array(nodeSchema).min(1),
  groups: z.array(groupSchema).optional(),
  edges: z.array(edgeSchema).optional(),
  steps: z.array(stepSchema).optional(),
  legend: cloudSchema.shape.legend,
});

export const flowchartSchema = z.object({
  ...meta,
  direction: z.enum(["TB", "LR"]).optional(),
  nodes: z
    .array(
      nodeSchema.extend({
        type: z.enum(["start", "end", "process", "decision", "io", "subprocess"]).optional(),
      }),
    )
    .min(1),
  groups: z.array(groupSchema).optional(),
  edges: z
    .array(edgeSchema.extend({ when: z.string().optional() }))
    .optional(),
});

export const decisionSchema = z.object({
  ...meta,
  root: z.string(),
  nodes: z
    .array(
      nodeSchema.extend({
        type: z.enum(["question", "outcome", "action"]).optional(),
      }),
    )
    .min(1),
  edges: z.array(edgeSchema.extend({ when: z.string().optional() })).min(1),
});

export const dependencySchema = z.object({
  ...meta,
  direction: z.enum(["TB", "LR"]).optional(),
  nodes: z.array(nodeSchema).min(1),
  edges: z.array(edgeSchema).min(1),
  groups: z.array(groupSchema).optional(),
});

export const renderSchema = z.object({
  ...meta,
  engine: z.enum(["d2", "mermaid", "dot"]),
  source: z.string().min(1),
});
