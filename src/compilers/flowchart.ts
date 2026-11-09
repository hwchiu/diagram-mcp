import type { FlowchartInput } from "../types.js";
import { getTheme } from "../design/themes.js";
import { escapeMermaid, safeId } from "./shared.js";

function nodeDecl(
  node: FlowchartInput["nodes"][0],
  theme: ReturnType<typeof getTheme>,
): string {
  const id = safeId(node.id);
  const label = node.subtitle
    ? `${escapeMermaid(node.label)} - ${escapeMermaid(node.subtitle)}`
    : escapeMermaid(node.label);
  const t = node.type ?? "process";
  const role = node.role ?? "default";
  const colors = theme.roles[role] ?? theme.roles.default;

  let shape: string;
  switch (t) {
    case "start":
    case "end":
      shape = `${id}((${label}))`;
      break;
    case "decision":
      shape = `${id}{${label}}`;
      break;
    case "io":
      shape = `${id}[/${label}/]`;
      break;
    case "subprocess":
      shape = `${id}[[${label}]]`;
      break;
    default:
      shape = `${id}[${label}]`;
  }

  return `${shape}
  style ${id} fill:${colors.fill},stroke:${colors.stroke},color:${theme.ink},stroke-width:2px`;
}

export function compileFlowchart(input: FlowchartInput): { engine: "mermaid"; source: string } {
  const theme = getTheme(input.theme);
  const dir = input.direction ?? "TB";
  const groups = input.groups ?? [];
  const lanes = groups.filter((g) => g.kind === "lane" || !g.kind);

  const lines: string[] = [];
  lines.push(
    `%%{init: {"flowchart": {"htmlLabels": false, "curve": "basis", "padding": 24, "nodeSpacing": 50, "rankSpacing": 60}} }%%`,
  );
  lines.push(`flowchart ${dir}`);

  if (input.title) {
    lines.push(
      `  title_block["${escapeMermaid(input.title)}${input.subtitle ? " — " + escapeMermaid(input.subtitle) : ""}"]`,
    );
    lines.push(
      `  style title_block fill:${theme.titleBg},stroke:${theme.accent},color:${theme.ink},stroke-width:2px`,
    );
  }

  if (lanes.length) {
    for (const lane of lanes) {
      lines.push(`  subgraph ${safeId(lane.id)}[${escapeMermaid(lane.label)}]`);
      lines.push(`    direction ${dir}`);
      const members = input.nodes.filter((n) => n.group === lane.id);
      for (const n of members) {
        for (const l of nodeDecl(n, theme).split("\n")) {
          lines.push(`    ${l}`);
        }
      }
      lines.push(`  end`);
      const fill = theme.groupFills[0];
      const stroke = theme.groupStrokes[0];
      lines.push(
        `  style ${safeId(lane.id)} fill:${fill},stroke:${stroke},color:${theme.ink},stroke-width:2px`,
      );
    }
    const free = input.nodes.filter((n) => !n.group || !lanes.some((l) => l.id === n.group));
    for (const n of free) {
      for (const l of nodeDecl(n, theme).split("\n")) {
        lines.push(`  ${l}`);
      }
    }
  } else {
    for (const n of input.nodes) {
      for (const l of nodeDecl(n, theme).split("\n")) {
        lines.push(`  ${l}`);
      }
    }
  }

  // Connect title into first node without a visible edge style fight
  if (input.title && input.nodes[0]) {
    const first =
      lanes.length && input.nodes.find((n) => n.group === lanes[0].id)
        ? input.nodes.find((n) => n.group === lanes[0].id)!
        : input.nodes[0];
    lines.push(`  title_block --> ${safeId(first.id)}`);
  }

  for (const e of input.edges ?? []) {
    const when = e.when ?? e.label;
    const label = when ? `|${escapeMermaid(when)}|` : "";
    const kind = e.kind ?? "default";
    if (kind === "async") {
      lines.push(`  ${safeId(e.from)} -.->${label} ${safeId(e.to)}`);
    } else {
      lines.push(`  ${safeId(e.from)} -->${label} ${safeId(e.to)}`);
    }
  }

  return { engine: "mermaid", source: lines.join("\n") };
}
