import type { NodeRole, ThemeId } from "./design/themes.js";

export type EdgeKind = "sync" | "async" | "data" | "default";

export interface DiagramMeta {
  title?: string;
  subtitle?: string;
  theme?: ThemeId | string;
  /** Output basename (without extension). Auto-generated if omitted. */
  name?: string;
  /** Include compact inline PNG preview (default true). */
  includePreview?: boolean;
  /** Output directory override. */
  outputDir?: string;
}

export interface DiagramNode {
  id: string;
  label: string;
  /** Secondary line under the label */
  subtitle?: string;
  role?: NodeRole;
  /** Icon key (aws, lambda, kubernetes, redis, …) or absolute path */
  icon?: string;
  /** Parent group id */
  group?: string;
  /** Shape hint for compilers that support it */
  shape?: "rectangle" | "rounded" | "cylinder" | "diamond" | "hexagon" | "person" | "queue" | "cloud";
}

export interface DiagramGroup {
  id: string;
  label: string;
  /** Nesting parent */
  parent?: string;
  /** Semantic kind for styling depth / color */
  kind?: "region" | "vpc" | "subnet" | "cluster" | "namespace" | "zone" | "lane" | "other";
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  kind?: EdgeKind;
  /** Optional step number badge shown on this edge */
  step?: number;
}

/** Numbered architecture walkthrough (AWS reference-style side panel). */
export interface DiagramStep {
  /** 1-based step number */
  n: number;
  /** Short bold title in the panel */
  label: string;
  /** Longer description */
  description?: string;
  /**
   * Optional node or group id to place a circular badge near.
   * Prefer group ids (tier containers) — badges cannot target D2 grid cells.
   */
  anchor?: string;
}

export interface StructuredDiagramInput extends DiagramMeta {
  nodes: DiagramNode[];
  groups?: DiagramGroup[];
  edges?: DiagramEdge[];
  /**
   * Numbered steps rendered as a right-side panel (+ optional on-diagram badges).
   * First-class for cloud / microservice reference architectures.
   */
  steps?: DiagramStep[];
  /**
   * D2 layout engine. Prefer `tala` for orthogonal AWS-style posters;
   * `elk` as fallback; `dagre` for simpler graphs.
   */
  layout?: "tala" | "elk" | "dagre";
  /** Optional legend entries */
  legend?: Array<{ label: string; role?: NodeRole; kind?: EdgeKind }>;
}

export interface CloudDiagramInput extends StructuredDiagramInput {
  provider?: "aws" | "gcp" | "azure" | "kubernetes" | "multi";
}

export interface MicroserviceDiagramInput extends StructuredDiagramInput {}

export interface FlowchartInput extends DiagramMeta {
  nodes: Array<DiagramNode & { type?: "start" | "end" | "process" | "decision" | "io" | "subprocess" }>;
  edges?: Array<DiagramEdge & { when?: string }>;
  groups?: DiagramGroup[];
  /** Prefer swimlanes when groups.kind === 'lane' */
  direction?: "TB" | "LR";
}

export interface DecisionTreeInput extends DiagramMeta {
  root: string;
  nodes: Array<DiagramNode & { type?: "question" | "outcome" | "action" }>;
  edges: Array<DiagramEdge & { when?: string }>;
}

export interface DependencyGraphInput extends DiagramMeta {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** Rank direction */
  direction?: "TB" | "LR";
  /** Cluster by group */
  groups?: DiagramGroup[];
}

export type EngineKind = "d2" | "mermaid" | "dot";

export interface RenderDiagramInput extends DiagramMeta {
  engine: EngineKind;
  source: string;
}

export interface RenderResult {
  svgPath: string;
  pngPath: string;
  sourcePath: string;
  engine: EngineKind;
  theme: string;
  /** Compact preview as base64 PNG (optional) */
  previewBase64?: string;
  width?: number;
  height?: number;
}
