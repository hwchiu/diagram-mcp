import type { DiagramEdge, DiagramGroup, DiagramNode, EdgeKind } from "../types.js";
import type { NodeRole, ThemePalette } from "../design/themes.js";
import { resolveIconPath } from "../design/icons.js";

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
    return `style: {\n    stroke: "${color}"\n    stroke-width: 3\n  }`;
  }
  if (kind === "sync") {
    return `style: {\n    stroke: "${color}"\n    stroke-width: 2\n  }`;
  }
  return `style: {\n    stroke: "${color}"\n    stroke-width: 2\n  }`;
}

export function nodeStyleD2(theme: ThemePalette, node: DiagramNode): string {
  const role = roleOf(node);
  const colors = theme.roles[role] ?? theme.roles.default;
  const icon = resolveIconPath(node.icon);
  const lines: string[] = [
    `style: {`,
    `  fill: "${colors.fill}"`,
    `  stroke: "${colors.stroke}"`,
    `  stroke-width: 2`,
    `  border-radius: 8`,
    `  shadow: true`,
    `  font-size: 22`,
    `  font-color: "${theme.ink}"`,
    `}`,
  ];
  if (icon) {
    lines.unshift(`icon: "${icon}"`);
  }
  if (node.shape === "cylinder") lines.unshift(`shape: cylinder`);
  else if (node.shape === "diamond") lines.unshift(`shape: diamond`);
  else if (node.shape === "hexagon") lines.unshift(`shape: hexagon`);
  else if (node.shape === "queue") lines.unshift(`shape: queue`);
  else if (node.shape === "person") lines.unshift(`shape: person`);
  else if (node.shape === "cloud") lines.unshift(`shape: cloud`);
  else lines.unshift(`shape: rectangle`);
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

export function titleBlockD2(theme: ThemePalette, title?: string, subtitle?: string): string {
  if (!title) return "";
  const sub = subtitle ? `\n  ${escapeD2(subtitle)}` : "";
  void sub;
  return `
title: |md
  # ${escapeD2(title)}${subtitle ? `\n  ${escapeD2(subtitle)}` : ""}
| {
  near: top-center
  style: {
    fill: "${theme.titleBg}"
    stroke: "${theme.border}"
    border-radius: 10
    font-color: "${theme.ink}"
  }
}
`;
}

export function legendD2(
  theme: ThemePalette,
  legend?: Array<{ label: string; role?: NodeRole; kind?: EdgeKind }>,
): string {
  if (!legend?.length) {
    // Default edge legend
    legend = [
      { label: "Sync / request", kind: "sync" },
      { label: "Async / event", kind: "async" },
      { label: "Data path", kind: "data" },
    ];
  }
  const items = legend
    .map((item, i) => {
      const id = `leg_${i}`;
      if (item.role) {
        const c = theme.roles[item.role];
        return `${id}: "${escapeD2(item.label)}" {
  shape: rectangle
  style: {
    fill: "${c.fill}"
    stroke: "${c.stroke}"
    border-radius: 6
    font-size: 16
    font-color: "${theme.ink}"
  }
}`;
      }
      const color = edgeColor(theme, item.kind);
      const dash = item.kind === "async" ? `\n    stroke-dash: 3` : "";
      return `${id}: "${escapeD2(item.label)}" {
  shape: rectangle
  style: {
    fill: "${theme.surface}"
    stroke: "${color}"
    stroke-width: 2
    border-radius: 6
    font-size: 16
    font-color: "${theme.ink}"${dash}
  }
}`;
    })
    .join("\n  ");

  return `
legend: Legend {
  near: bottom-center
  style: {
    fill: "${theme.legendBg}"
    stroke: "${theme.border}"
    border-radius: 10
    font-color: "${theme.muted}"
    font-size: 16
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
