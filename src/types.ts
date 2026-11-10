import type { NodeRole, ThemeId } from "./design/themes.js";

export type EdgeKind = "sync" | "async" | "data" | "auth" | "default";

/** Output artifacts. svg + png are always produced; drawio is opt-in for architecture tools. */
export type OutputFormat = "svg" | "png" | "drawio";

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

/**
 * Card shapes. Architecture cards default to "rounded" (icon + text).
 * Notation shapes: person (C4 actor), system (C4 software system, large),
 * process (DFD process, stadium), datastore (DFD open-ended store),
 * entity (DFD external entity, square double frame), decision (diamond),
 * terminator (start / end pill), component (UML component), interface (provided port pill),
 * pod (k8s workload), cylinder (database).
 */
export type NodeShape =
  | "rectangle"
  | "rounded"
  | "cylinder"
  | "diamond"
  | "hexagon"
  | "person"
  | "queue"
  | "cloud"
  | "system"
  | "process"
  | "datastore"
  | "entity"
  | "decision"
  | "terminator"
  | "component"
  | "interface"
  | "pod"
  /** UML state (rounded, name + activity compartment) */
  | "state"
  /** UML initial pseudo-state (filled dot) */
  | "initial"
  /** UML final state (bullseye) */
  | "final"
  /** UML choice pseudo-state (small diamond) */
  | "choice"
  /** flowchart input / output (parallelogram) */
  | "io"
  /** flowchart predefined process (double side bars) */
  | "subprocess"
  /** flowchart document (wavy bottom) */
  | "document"
  /** ERD table: header + column rows (node.rows) */
  | "table"
  /** knowledge-graph entity (pill with type chip) */
  | "entityType";

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
  shape?: NodeShape;
  /** Wrapped body text (≤3 lines) under the label — responsibilities, C4 descriptions */
  description?: string;
  /** Small type chip in the card's top-right corner ("[Person]", "P1", "D2", "×3") */
  tag?: string;
  /** Replica count: draws stacked shadow cards behind the card (deployments) */
  replicas?: number;
  /** @internal third text line (overview blocks list their members) */
  detail?: string;
  /** @internal dimmed stub for an endpoint that lives in another view */
  stub?: boolean;
  /** de-emphasised (impact analysis: not on the highlighted path) */
  dim?: boolean;
  /** emphasised outline (impact analysis: changed / impacted) */
  emphasis?: "changed" | "impacted" | "focus";
  /** ERD table rows */
  rows?: TableRow[];
  /** status chip colour override (workflow task status) */
  status?: string;
}

export interface TableRow {
  name: string;
  type?: string;
  /** "PK" | "FK" | "PK,FK" | "UK" … */
  key?: string;
  nullable?: boolean;
  note?: string;
}

/** Edge-end notation (default: filled arrow at the target). */
export type EdgeMark = "arrow" | "open" | "none" | "one" | "many" | "zeroOrOne" | "exactlyOne" | "zeroOrMany" | "oneOrMany";

export type GroupKind =
  | "region"
  | "vpc"
  | "subnet"
  | "cluster"
  | "namespace"
  | "zone"
  | "lane"
  | "security"
  | "external"
  | "other"
  /** C4 system / container boundary */
  | "boundary"
  /** DFD trust boundary (dashed red) */
  | "trust"
  /** k8s node pool / host */
  | "pool"
  /** network: public internet / DMZ / on-prem site */
  | "internet"
  | "dmz"
  | "site"
  /** UML composite state */
  | "composite"
  /** pipeline stage / phase column */
  | "stage"
  /** workflow task group */
  | "taskgroup";

export interface DiagramGroup {
  id: string;
  label: string;
  /** Nesting parent */
  parent?: string;
  /** Semantic kind for styling depth / color */
  kind?: GroupKind;
  /** Chip on the frame header's right end (CIDR, trust level, "C4 · SYSTEM BOUNDARY") */
  tag?: string;
  /** Cards per row inside this container (architecture grid). Auto when omitted. */
  cols?: number;
  /** How child containers are arranged inside this one (default "row"). */
  layout?: "row" | "column";
  /** @internal frame that only holds stub cards (detail views) */
  stub?: boolean;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  kind?: EdgeKind;
  /** Optional step number badge shown on this edge */
  step?: number;
  /** Data classification chips drawn next to the label (DFD: "PII", "密碼") — rendered in the alert color */
  tags?: string[];
  /** Emphasise this flow (DFD: crosses a trust boundary) */
  highlight?: boolean;
  /** Draw arrowheads on both ends */
  bidirectional?: boolean;
  /** de-emphasised */
  dim?: boolean;
  /** custom end notation (ERD crow's foot, UML open arrows) */
  startMark?: EdgeMark;
  endMark?: EdgeMark;
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
   * @deprecated Architecture diagrams use the built-in SVG grid engine.
   * Kept for API compatibility; ignored by cloud/microservice compilers.
   */
  layout?: "tala" | "elk" | "dagre" | "grid";
  /**
   * Column stacks of tier/group ids for the deterministic grid engine.
   * Example: [["clients"],["edge"],["bff","app"],["data","events"]]
   */
  columns?: string[][];
  /** Optional legend entries (auto-derived from used edge kinds / roles when omitted) */
  legend?: Array<{ label: string; role?: NodeRole; kind?: EdgeKind }>;
  /** Tier ids rendered as a full-width band under the columns (e.g. third-party, observability). */
  bottomRow?: string[];
  /** Where the numbered walkthrough goes. "auto" picks the side that keeps the canvas closest to 16:10. */
  stepsPosition?: "auto" | "right" | "bottom";
  /** Extra outputs. ["drawio"] also writes an editable .drawio file. */
  outputs?: OutputFormat[];
  /**
   * Explicit rows of column stacks (overrides auto-wrap), e.g.
   * [[["clients"],["edge"]],[["app"],["data"]]].
   */
  rows?: string[][][];
  /** "auto" (default) wraps column stacks into 1–3 rows to stay near 16:9; "never" keeps one row. */
  wrap?: "auto" | "never";
  /**
   * Large diagrams: "auto" (default) splits above `splitThreshold` nodes into an
   * overview + one detail view per region / top-level tier; "never" / "always".
   */
  split?: "auto" | "never" | "always";
  /** Node count above which split:"auto" kicks in (default 25). */
  splitThreshold?: number;
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

export type EngineKind = "d2" | "mermaid" | "dot" | "svg";

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
  /** Editable draw.io file (architecture tools, when outputs includes "drawio") */
  drawioPath?: string;
  /** Structural QA findings (architecture tools) */
  qa?: QaIssue[];
}

export interface QaIssue {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  ids?: string[];
}
