import type { DependencyGraphInput } from "../types.js";
import { getTheme, type NodeRole } from "../design/themes.js";
import { escapeDot, roleOf, safeId } from "./shared.js";
import { assertValidEdges } from "./paths.js";

/**
 * Readable dependency graph packed toward ~16:9:
 * clusters split into two horizontal rows, concentrate edges, larger fonts.
 */
export function compileDependency(input: DependencyGraphInput): { engine: "dot"; source: string } {
  const theme = getTheme(input.theme);
  const large = input.nodes.length >= 40;
  const edges = assertValidEdges(input.edges, input.nodes, "create_dependency_graph");
  const lines: string[] = [];

  lines.push(`digraph G {`);
  lines.push(`  graph [`);
  lines.push(`    rankdir=TB,`);
  lines.push(`    bgcolor="${theme.canvas}",`);
  lines.push(`    fontname="Helvetica Neue",`);
  lines.push(`    fontsize=18,`);
  lines.push(`    pad="0.55",`);
  lines.push(`    nodesep="${large ? 0.2 : 0.32}",`);
  lines.push(`    ranksep="${large ? 0.4 : 0.55}",`);
  lines.push(`    splines=true,`);
  lines.push(`    overlap=false,`);
  lines.push(`    concentrate=true,`);
  lines.push(`    outputorder=edgesfirst,`);
  lines.push(`    compound=true,`);
  lines.push(`    newrank=true,`);
  lines.push(`    labeljust=l,`);
  lines.push(`    labelloc=t`);
  lines.push(`  ];`);
  lines.push(`  node [`);
  lines.push(`    shape=box,`);
  lines.push(`    style="rounded,filled",`);
  lines.push(`    fontname="Helvetica Neue",`);
  lines.push(`    fontsize=${large ? 11 : 12},`);
  lines.push(`    fontcolor="${theme.ink}",`);
  lines.push(`    fillcolor="${theme.card}",`);
  lines.push(`    color="${theme.border}",`);
  lines.push(`    penwidth=1.6,`);
  lines.push(`    margin="0.14,0.10",`);
  lines.push(`    height=0.42`);
  lines.push(`  ];`);
  lines.push(`  edge [`);
  lines.push(`    fontname="Helvetica Neue",`);
  lines.push(`    fontsize=8,`);
  lines.push(`    fontcolor="${theme.muted}",`);
  lines.push(`    color="${theme.edgeDefault}88",`);
  lines.push(`    penwidth=0.85,`);
  lines.push(`    arrowsize=0.5`);
  lines.push(`  ];`);

  if (input.title) {
    const sub = input.subtitle
      ? `<BR/><FONT POINT-SIZE="13" COLOR="${theme.muted}">${escapeDot(input.subtitle)}</FONT>`
      : "";
    lines.push(
      `  label=<<FONT POINT-SIZE="22"><B>${escapeDot(input.title)}</B></FONT>${sub}>;`,
    );
  }

  const groups = input.groups ?? [];
  const byGroup = new Map<string, typeof input.nodes>();
  for (const n of input.nodes) {
    const g = n.group ?? "_root";
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(n);
  }

  const emitNode = (n: (typeof input.nodes)[0], indent = "      ") => {
    const role: NodeRole = roleOf(n);
    const colors = theme.roles[role] ?? theme.roles.default;
    const label = n.subtitle
      ? `${escapeDot(n.label)}\\n${escapeDot(n.subtitle)}`
      : escapeDot(n.label);
    lines.push(
      `${indent}${safeId(n.id)} [label="${label}", fillcolor="${colors.fill}", color="${colors.stroke}", fontcolor="${theme.ink}"];`,
    );
  };

  const activeGroups = groups.filter((g) => (byGroup.get(g.id) ?? []).length > 0);
  const mid = Math.ceil(activeGroups.length / 2);
  const rows = [activeGroups.slice(0, mid), activeGroups.slice(mid)];

  let clusterIdx = 0;
  const rowFirstNodes: string[] = [];

  for (let row = 0; row < rows.length; row++) {
    const rowGroups = rows[row];
    if (!rowGroups.length) continue;
    lines.push(`  subgraph cluster_row_${row} {`);
    lines.push(`    style="invis";`);
    lines.push(`    pencolor="transparent";`);

    let firstInRow: string | undefined;
    for (const g of rowGroups) {
      const members = byGroup.get(g.id) ?? [];
      byGroup.delete(g.id);
      if (!members.length) continue;
      if (!firstInRow) firstInRow = safeId(members[0].id);

      const fill = theme.groupFills[clusterIdx % theme.groupFills.length];
      const stroke = theme.groupStrokes[clusterIdx % theme.groupStrokes.length];
      lines.push(`    subgraph cluster_${clusterIdx} {`);
      lines.push(`      label=<<B>${escapeDot(g.label)}</B>>;`);
      lines.push(`      fontsize=14; fontcolor="${theme.ink}";`);
      lines.push(
        `      style="rounded,filled"; fillcolor="${fill}"; color="${stroke}"; penwidth=2;`,
      );
      lines.push(`      margin=12;`);
      // Soft square packing: chain invis edges in row chunks
      const cols = Math.max(3, Math.ceil(Math.sqrt(members.length)));
      for (let i = 0; i < members.length; i++) {
        emitNode(members[i]);
      }
      for (let i = 0; i < members.length; i++) {
        const next = i + 1;
        if (next < members.length && Math.floor(i / cols) === Math.floor(next / cols)) {
          lines.push(
            `      ${safeId(members[i].id)} -> ${safeId(members[next].id)} [style=invis, weight=20];`,
          );
        }
      }
      for (let i = 0; i + cols < members.length; i++) {
        lines.push(
          `      ${safeId(members[i].id)} -> ${safeId(members[i + cols].id)} [style=invis, weight=5];`,
        );
      }
      lines.push(`    }`);
      clusterIdx++;
    }
    if (firstInRow) rowFirstNodes.push(firstInRow);
    lines.push(`  }`);
  }

  if (rowFirstNodes.length >= 2) {
    lines.push(
      `  ${rowFirstNodes[0]} -> ${rowFirstNodes[1]} [style=invis, weight=100, minlen=3, constraint=true];`,
    );
  }

  for (const [, members] of byGroup) {
    for (const n of members) emitNode(n, "  ");
  }

  for (const e of edges) {
    const label = e.label ? ` label="${escapeDot(e.label)}"` : "";
    const color =
      e.kind === "async"
        ? theme.edgeAsync
        : e.kind === "data"
          ? theme.edgeData
          : e.kind === "sync"
            ? theme.edgeSync
            : theme.edgeDefault;
    const style = e.kind === "async" ? ", style=dashed" : "";
    lines.push(
      `  ${safeId(e.from)} -> ${safeId(e.to)} [color="${color}99", penwidth=0.85${style}${label}];`,
    );
  }

  lines.push("}");
  return { engine: "dot", source: lines.join("\n") };
}
