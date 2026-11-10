import type { DiagramEdge, DiagramGroup, DiagramNode, DiagramStep, EdgeKind, NodeShape } from "../types.js";
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
  legend?: LegendItem[];
  /** Column stacks of tier (group) ids — or ungrouped node ids — each stacked top→bottom. */
  columns?: string[][];
  /** Tier ids laid out as one full-width band under the columns. */
  bottomRow?: string[];
  stepsPosition?: "auto" | "right" | "bottom";
  /** Explicit rows of column stacks (disables auto-wrap) */
  rows?: string[][][];
  wrap?: "auto" | "never";
  /** Alternative column groupings; the planner keeps the one that scores best */
  columnCandidates?: string[][][];
  /** Reorder cards inside each zone by neighbour barycentre (fewer crossings) */
  reorder?: boolean;
  /** View metadata when this layout is one view of a split diagram */
  view?: ViewInfo;
  /** Diagram kind presentation (footer caption, header nouns) */
  profile?: DiagramProfile;
}

export type DiagramKind = "architecture" | "context" | "component" | "deployment" | "network" | "dfd" | "swimlane";

export interface DiagramProfile {
  kind: DiagramKind;
  /** footer caption, e.g. "SYSTEM CONTEXT · C4 LEVEL 1" */
  caption: string;
  /** header meta nouns ("ELEMENTS", "RELATIONSHIPS") */
  nodeNoun?: string;
  edgeNoun?: string;
}

export interface ViewInfo {
  kind: "full" | "overview" | "detail";
  /** file-name suffix ("overview", tier slug) */
  key: string;
  /** detail: the tier ids this view zooms into */
  focus?: string[];
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
  detail?: TextLine;
  stub?: boolean;
  /** notation shape (defaults to the icon card) */
  shape?: NodeShape;
  /** wrapped description lines */
  desc?: string[];
  tag?: string;
  replicas?: number;
  /** usable text width inside the card (QA) */
  textRoom?: number;
  /** second label line (wrapped instead of truncated) */
  label2?: TextLine;
  centered?: boolean;
  /** space reserved at the top by the shape */
  top?: number;
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
  stub?: boolean;
  /** invisible wrapper for ungrouped nodes */
  hidden: boolean;
  accentRole: NodeRole;
  nodeIds: string[];
  /** header chip (CIDR, trust level) */
  tag?: string;
  /** header chip box (obstacle for routing / labels) */
  tagRect?: Rect;
  /** swimlane: header is a left column instead of a top bar */
  laneHeader?: Rect;
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
  /** pill parked off the line: leader from this point on the path to the pill */
  labelLeader?: Point;
  /** badge drawn at the left end of the label pill */
  badgeInLabel?: boolean;
  /** bundle key: edges sharing a port */
  bundle: string;
  /** trunk keys: edges sharing any key may share track (intentional bundling) */
  trunks: string[];
  tags?: string[];
  highlight?: boolean;
  bidirectional?: boolean;
  /** points where the path crosses a trust boundary (DFD) */
  crossings?: Point[];
}

export interface Junction {
  at: Point;
  kind: EdgeKind;
}

export interface StepCard {
  n: number;
  label: TextLine;
  lines: string[];
  rect: Rect;
}

export type LegendMark = "trust" | "cross" | "sensitive" | "boundary" | "decision" | "person" | "datastore" | "process" | "entity" | "replicas" | "lane";

export interface LegendItem {
  label: string;
  role?: NodeRole;
  kind?: EdgeKind;
  /** notation swatch */
  mark?: LegendMark;
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
  /** Trunk split / merge points (drawn as dots) */
  junctions: Junction[];
  /** Step badges pinned to a node / tier (steps without an edge) */
  anchors: Array<{ n: number; at: Point; anchor: string }>;
  /** Chosen wrap plan */
  plan?: { rows: string[][][]; variant: number; spacing: number; score: number };
  view?: ViewInfo;
  profile?: DiagramProfile;
}

export const BADGE_R = 11;
