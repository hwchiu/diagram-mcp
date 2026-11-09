import type { DependencyGraphInput } from "../types.js";
import { getTheme, type NodeRole } from "../design/themes.js";
import { escapeDot, roleOf, safeId } from "./shared.js";

export function compileDependency(input: DependencyGraphInput): { engine: "dot"; source: string } {
  const theme = getTheme(input.theme);
  const dir = input.direction ?? "TB";
  const large = input.nodes.length >= 40;
  const lines: string[] = [];

  lines.push(`digraph G {`);
  lines.push(`  graph [`);
  lines.push(`    rankdir=${dir},`);
  lines.push(`    bgcolor="${theme.canvas}",`);
  lines.push(`    fontname="Helvetica Neue",`);
  lines.push(`    fontsize=16,`);
  lines.push(`    pad="0.75",`);
  lines.push(`    nodesep="${large ? 0.25 : 0.4}",`);
  lines.push(`    ranksep="${large ? 0.55 : 0.7}",`);
  lines.push(`    splines=${large ? "spline" : "true"},`);
  lines.push(`    overlap=false,`);
  lines.push(`    concentrate=${large ? "true" : "false"},`);
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
  lines.push(`    fontsize=${large ? 9 : 11},`);
  lines.push(`    fontcolor="${theme.ink}",`);
  lines.push(`    fillcolor="${theme.card}",`);
  lines.push(`    color="${theme.border}",`);
  lines.push(`    penwidth=1.6,`);
  lines.push(`    margin="0.12,0.08",`);
  lines.push(`    height=0.35`);
  lines.push(`  ];`);
  lines.push(`  edge [`);
  lines.push(`    fontname="Helvetica Neue",`);
  lines.push(`    fontsize=8,`);
  lines.push(`    fontcolor="${theme.muted}",`);
  lines.push(`    color="${theme.edgeDefault}",`);
  lines.push(`    penwidth=1.05,`);
  lines.push(`    arrowsize=0.55`);
  lines.push(`  ];`);

  if (input.title) {
    const sub = input.subtitle ? `<BR/><FONT POINT-SIZE="12" COLOR="${theme.muted}">${escapeDot(input.subtitle)}</FONT>` : "";
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

  const emitNode = (n: (typeof input.nodes)[0], indent = "    ") => {
    const role: NodeRole = roleOf(n);
    const colors = theme.roles[role] ?? theme.roles.default;
    const label = n.subtitle
      ? `${escapeDot(n.label)}\\n${escapeDot(n.subtitle)}`
      : escapeDot(n.label);
    lines.push(
      `${indent}${safeId(n.id)} [label="${label}", fillcolor="${colors.fill}", color="${colors.stroke}", fontcolor="${theme.ink}"];`,
    );
  };

  let clusterIdx = 0;
  for (const g of groups) {
    const members = byGroup.get(g.id) ?? [];
    if (!members.length) continue;
    const fill = theme.groupFills[clusterIdx % theme.groupFills.length];
    const stroke = theme.groupStrokes[clusterIdx % theme.groupStrokes.length];
    lines.push(`  subgraph cluster_${clusterIdx} {`);
    lines.push(`    label=<<B>${escapeDot(g.label)}</B>>;`);
    lines.push(`    fontsize=13; fontcolor="${theme.ink}";`);
    lines.push(`    style="rounded,filled"; fillcolor="${fill}"; color="${stroke}"; penwidth=2;`);
    lines.push(`    margin=18;`);
    for (const n of members) emitNode(n);
    lines.push(`  }`);
    clusterIdx++;
    byGroup.delete(g.id);
  }

  for (const [, members] of byGroup) {
    for (const n of members) emitNode(n, "  ");
  }

  for (const e of input.edges) {
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
    const pw = large ? 0.85 : 1.1;
    lines.push(
      `  ${safeId(e.from)} -> ${safeId(e.to)} [color="${color}99", penwidth=${pw}${style}${label}];`,
    );
  }

  lines.push("}");
  return { engine: "dot", source: lines.join("\n") };
}
