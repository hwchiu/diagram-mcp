import type { DiagramEdge, DiagramGroup, DiagramNode, DiagramStep, EdgeKind } from "../types.js";
import type { MonoIcon } from "./icons.js";

export interface LayoutColumns {
  /** Column stacks of tier/group ids. Each inner array is stacked top→bottom. */
  columns: string[][];
}

export interface ArchitectureLayoutInput {
  title?: string;
  subtitle?: string;
  theme?: string;
  nodes: DiagramNode[];
  groups?: DiagramGroup[];
  edges?: DiagramEdge[];
  steps?: DiagramStep[];
  legend?: Array<{ label: string; role?: string; kind?: EdgeKind }>;
  /** Column layout hint. Defaults to one column per root group (L→R). */
  columns?: string[][];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedNode {
  id: string;
  label: string;
  subtitle?: string;
  role?: string;
  icon: MonoIcon;
  rect: Rect;
  /** Parent tier id if any */
  tierId?: string;
  compact?: boolean;
}

export interface PlacedTier {
  id: string;
  label: string;
  index: number;
  rect: Rect;
  nodeIds: string[];
  kind?: string;
  external?: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface RoutedEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  step?: number;
  points: Point[];
  /** Collision-checked label position */
  labelAt: Point;
  badgeAt?: Point;
}

export interface RoutingQuality {
  crossings: number;
  overlapLength: number;
  /** Parallel overlap weighted by the shortfall from the preferred track spacing. */
  closeParallelLength: number;
  length: number;
  bends: number;
}

export interface LayoutResult {
  width: number;
  height: number;
  title?: string;
  subtitle?: string;
  nodes: PlacedNode[];
  tiers: PlacedTier[];
  edges: RoutedEdge[];
  routing: RoutingQuality;
  steps: DiagramStep[];
  legend: Array<{ label: string; role?: string; kind?: EdgeKind }>;
  /** Diagram content area (excludes sidebar) */
  content: Rect;
  /** Right sidebar for steps + legend */
  sidebar: Rect;
  titleRect: Rect;
}
