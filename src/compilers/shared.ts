import type {
  DiagramEdge,
  DiagramGroup,
  DiagramNode,
  DiagramStep,
  EdgeKind,
} from "../types.js";
import type { NodeRole, ThemePalette } from "../design/themes.js";
import { resolveIconPath } from "../design/icons.js";

/** Uniform AWS-style icon card size */
export const CARD_WIDTH = 140;
export const CARD_HEIGHT = 110;
/** Compact chip size for third-party / external bottom band */
export const CHIP_WIDTH = 160;
export const CHIP_HEIGHT = 48;

export function escapeD2(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}

export function escapeDot(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function escapeMermaid(s: string): string {
  return s.replace(/"/g, "'").replace(/[[\]|]/g, " ").replace(/\s+/g, " ").trim();
}

export function safeId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[0-9]/.test(cleaned) ? `n_${cleaned}` : cleaned;
}

export function roleOf(node: DiagramNode): NodeRole {
  return node.role ?? "default";
}

export function edgeColor(theme: ThemePalette, kind?: EdgeKind): string {
  switch (kind) {
    case "sync":
      return theme.edgeSync;
    case "async":
      return theme.edgeAsync;
    case "data":
      return theme.edgeData;
    default:
      return theme.edgeDefault;
  }
}

export function edgeStyleD2(theme: ThemePalette, kind?: EdgeKind): string {
  const color = edgeColor(theme, kind);
  if (kind === "async") {
    return `style: {\n    stroke: "${color}"\n    stroke-dash: 4\n    stroke-width: 2\n  }`;
  }
  if (kind === "data") {
    return `style: {\n    stroke: "${color}"\n    stroke-width: 2\n  }`;
  }
  return `style: {\n    stroke: "${color}"\n    stroke-width: 2\n  }`;
}

/** AWS reference: white card, icon above label, no shadow, fixed size. */
export function nodeStyleD2(
  theme: ThemePalette,
  node: DiagramNode,
  opts?: { compact?: boolean },
): string {
  const role = roleOf(node);
  const colors = theme.roles[role] ?? theme.roles.default;
  const icon = resolveIconPath(node.icon);
  const w = opts?.compact ? CHIP_WIDTH : CARD_WIDTH;
  const h = opts?.compact ? CHIP_HEIGHT : CARD_HEIGHT;
  const fontSize = opts?.compact ? 11 : 13;
  const lines: string[] = [
    `width: ${w}`,
    `height: ${h}`,
    `style: {`,
    `  fill: "${theme.card}"`,
    `  stroke: "${theme.border}"`,
    `  stroke-width: 1`,
    `  border-radius: ${opts?.compact ? 4 : 6}`,
    `  shadow: false`,
    `  font-size: ${fontSize}`,
    `  font-color: "${theme.ink}"`,
    `}`,
  ];
  // Keep a subtle role tint via stroke only when not compact
  if (!opts?.compact && role !== "default" && role !== "external") {
    lines[4] = `  stroke: "${colors.stroke}"`;
    lines[5] = `  stroke-width: 1`;
  }
  if (icon && !opts?.compact) {
    lines.unshift(`icon: "${icon}"`);
  }
  // Prefer rectangle for icon-above-label cards (cylinder/queue distort uniformity)
  if (!opts?.compact) {
    if (node.shape === "diamond") lines.unshift(`shape: diamond`);
    else if (node.shape === "hexagon") lines.unshift(`shape: hexagon`);
    else if (node.shape === "person") lines.unshift(`shape: person`);
    else if (node.shape === "cloud") lines.unshift(`shape: cloud`);
    else lines.unshift(`shape: rectangle`);
  } else {
    lines.unshift(`shape: rectangle`);
  }
  return lines.join("\n  ");
}

export function groupDepth(groups: DiagramGroup[], id: string): number {
  let depth = 0;
  let cur: string | undefined = id;
  const byId = new Map(groups.map((g) => [g.id, g]));
  const seen = new Set<string>();
  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    depth++;
    cur = byId.get(cur)!.parent;
  }
  return Math.max(0, depth - 1);
}

/** Title top-left like AWS reference architectures. */
export function titleBlockD2(theme: ThemePalette, title?: string, subtitle?: string): string {
  if (!title) return "";
  return `
title: |md
  # ${escapeD2(title)}${subtitle ? `\n  ${escapeD2(subtitle)}` : ""}
| {
  near: top-left
  style: {
    fill: "transparent"
    stroke: "transparent"
    font-color: "${theme.ink}"
  }
}
`;
}

/**
 * Right-side numbered steps panel with circular badges + wrapped text rows.
 * NOTE: id must NOT be `steps` — that is a reserved D2 keyword (boards).
 * Prefer child shapes over |md| so each step stays on its own row (md collapses).
 */
export function stepsPanelD2(theme: ThemePalette, steps?: DiagramStep[]): string {
  if (!steps?.length) return "";
  const sorted = [...steps].sort((a, b) => a.n - b.n);
  const rows = sorted
    .map((s) => {
      const text = s.description
        ? `${escapeD2(s.label)}\\n${escapeD2(s.description)}`
        : escapeD2(s.label);
      return `  row_${s.n}: " " {
    grid-columns: 2
    grid-gap: 10
    style: {
      fill: "transparent"
      stroke: "transparent"
      font-size: 8
      font-color: "transparent"
    }
    n${s.n}: "${s.n}" {
      shape: circle
      width: 28
      height: 28
      style: {
        fill: "${theme.ink}"
        stroke: "${theme.ink}"
        font-color: "#FFFFFF"
        font-size: 12
        bold: true
      }
    }
    t${s.n}: "${text}" {
      width: 260
      height: 52
      style: {
        fill: "transparent"
        stroke: "transparent"
        font-size: 12
        font-color: "${theme.ink}"
      }
    }
  }`;
    })
    .join("\n");
  return `
guide: "Architecture steps" {
  near: center-right
  grid-rows: ${sorted.length}
  grid-gap: 10
  style: {
    fill: "${theme.legendBg}"
    stroke: "${theme.border}"
    border-radius: 8
    font-size: 14
    bold: true
    font-color: "${theme.ink}"
  }
${rows}
}
`;
}

/** Badges are embedded in the guide panel rows — keep this a no-op for API stability. */
export function stepBadgesD2(
  _theme: ThemePalette,
  _steps: DiagramStep[] | undefined,
  _paths: Map<string, string>,
): string {
  return "";
}

export function legendD2(
  theme: ThemePalette,
  legend?: Array<{ label: string; role?: NodeRole; kind?: EdgeKind }>,
): string {
  if (!legend?.length) return "";
  const items = legend
    .map((item, i) => {
      const id = `leg_${i}`;
      if (item.role) {
        const c = theme.roles[item.role];
        return `${id}: "${escapeD2(item.label)}" {
  shape: rectangle
  width: 120
  height: 36
  style: {
    fill: "${c.fill}"
    stroke: "${c.stroke}"
    border-radius: 4
    font-size: 12
    font-color: "${theme.ink}"
  }
}`;
      }
      const color = edgeColor(theme, item.kind);
      const dash = item.kind === "async" ? `\n    stroke-dash: 3` : "";
      return `${id}: "${escapeD2(item.label)}" {
  shape: rectangle
  width: 120
  height: 36
  style: {
    fill: "${theme.surface}"
    stroke: "${color}"
    stroke-width: 2
    border-radius: 4
    font-size: 12
    font-color: "${theme.ink}"${dash}
  }
}`;
    })
    .join("\n  ");

  return `
legend: Legend {
  near: bottom-left
  style: {
    fill: "${theme.legendBg}"
    stroke: "${theme.border}"
    border-radius: 6
    font-color: "${theme.muted}"
    font-size: 12
  }
  ${items}
}
`;
}

export function buildGroupTree(groups: DiagramGroup[]): Map<string | undefined, DiagramGroup[]> {
  const map = new Map<string | undefined, DiagramGroup[]>();
  for (const g of groups) {
    const p = g.parent;
    if (!map.has(p)) map.set(p, []);
    map.get(p)!.push(g);
  }
  return map;
}

export function nodesInGroup(nodes: DiagramNode[], groupId: string): DiagramNode[] {
  return nodes.filter((n) => n.group === groupId);
}

export function ungroupedNodes(nodes: DiagramNode[], groups: DiagramGroup[]): DiagramNode[] {
  const ids = new Set(groups.map((g) => g.id));
  return nodes.filter((n) => !n.group || !ids.has(n.group));
}

/** True for bottom-band third-party / external chip tiers. */
export function isExternalBand(g: DiagramGroup): boolean {
  const id = g.id.toLowerCase();
  const label = g.label.toLowerCase();
  return (
    id === "ext" ||
    id === "external" ||
    id === "externals" ||
    id.includes("third") ||
    label.includes("third-party") ||
    label.includes("third party") ||
    label.includes("external")
  );
}

/** Prefer vertical strip for clients/edge when few nodes. */
export function preferVerticalGrid(g: DiagramGroup, childCount: number): boolean {
  const id = g.id.toLowerCase();
  const label = g.label.toLowerCase();
  if (childCount <= 1) return false;
  return (
    id === "clients" ||
    id === "edge" ||
    id === "global" ||
    label.includes("client") ||
    label === "edge" ||
    label.includes("global edge")
  );
}

export function emitArchitectureNode(
  theme: ThemePalette,
  node: DiagramNode,
  opts?: { compact?: boolean },
): string {
  const id = safeId(node.id);
  // Single-line labels only — subtitle overlaps icons on small cards
  const label = escapeD2(node.label);
  return `${id}: "${label}" {
  ${nodeStyleD2(theme, node, opts)}
}`;
}

export function emitEdgeBlock(
  theme: ThemePalette,
  edges: DiagramEdge[],
  paths: Map<string, string>,
): string {
  return edges
    .map((e) => {
      const stepPrefix = e.step != null ? `${e.step}` : "";
      const text = [stepPrefix, e.label].filter(Boolean).join(" · ");
      const label = text ? `: "${escapeD2(text)}"` : "";
      return `${paths.get(e.from)!} -> ${paths.get(e.to)!}${label} {
  ${edgeStyleD2(theme, e.kind)}
}`;
    })
    .join("\n");
}
