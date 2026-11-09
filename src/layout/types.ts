import type { DiagramEdge, DiagramGroup, DiagramNode, DiagramStep, EdgeKind } from "../types.js";
import type { NodeRole } from "../design/themes.js";
import type { MonoIcon } from "./icons.js";

export interface ArchitectureLayoutInput {
  title?: string;
  subtitle?: string;
  theme?: string;
  nodes: DiagramNode[];
  groups?: DiagramGroup[];
  edges?: DiagramEdge[];
  steps?: DiagramStep[];
  legend?: Array<{ label: string; role?: NodeRole; kind?: EdgeKind }>;
  /** Column stacks of tier (group) ids — or ungrouped node ids — each stacked top→bottom. */
  columns?: string[][];
  /** Tier ids laid out as one full-width band under the columns. */
  bottomRow?: string[];
  stepsPosition?: "auto" | "right" | "bottom";
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export type Side = "left" | "right" | "top" | "bottom";

export interface TextLine {
  text: string;
  truncated: boolean;
  /** measured width */
  width: number;
}

export interface PlacedNode {
  id: string;
  label: TextLine;
  subtitle?: TextLine;
  /** original strings (for draw.io / tooltips) */
  rawLabel: string;
  rawSubtitle?: string;
  role: NodeRole;
  icon: MonoIcon;
  rect: Rect;
  /** Innermost tier id if any */
  tierId?: string;
}

export interface PlacedTier {
  id: string;
  label: string;
  /** "01" style index for top-level tiers, "01.2" for nested */
  index: string;
  rect: Rect;
  /** Header label bounding box (obstacle for routing / labels) */
  labelRect: Rect;
  depth: number;
  parentId?: string;
  kind?: DiagramGroup["kind"];
  external: boolean;
  /** invisible wrapper for ungrouped nodes */
  hidden: boolean;
  accentRole: NodeRole;
  nodeIds: string[];
}

export interface RoutedEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  step?: number;
  points: Point[];
  fromSide: Side;
  toSide: Side;
  /** endpoint targets a tier frame (intentional tier-to-tier flow) */
  fromTier: boolean;
  toTier: boolean;
  labelRect?: Rect;
  badgeAt?: Point;
  /** bundle key: edges sharing a port/trunk */
  bundle: string;
}

export interface StepCard {
  n: number;
  label: TextLine;
  lines: string[];
  rect: Rect;
}

export interface LegendItem {
  label: string;
  role?: NodeRole;
  kind?: EdgeKind;
}

export interface LayoutResult {
  width: number;
  height: number;
  title?: string;
  subtitle?: string;
  nodes: PlacedNode[];
  tiers: PlacedTier[];
  edges: RoutedEdge[];
  steps: DiagramStep[];
  stepCards: StepCard[];
  stepsPosition: "right" | "bottom" | "none";
  legend: LegendItem[];
  legendRect: Rect;
  /** Diagram panel (frames + cards) */
  content: Rect;
  /** Steps panel (right) or band (bottom) */
  sidebar: Rect;
  titleRect: Rect;
  footerY: number;
  /** Diagnostics from the router (unroutable edges, etc.) */
  routeNotes: string[];
}

export const BADGE_R = 11;
