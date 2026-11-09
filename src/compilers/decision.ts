import type { DecisionTreeInput } from "../types.js";
import { getTheme } from "../design/themes.js";
import { escapeMermaid, safeId } from "./shared.js";

export function compileDecision(input: DecisionTreeInput): { engine: "mermaid"; source: string } {
  const theme = getTheme(input.theme);
  const lines: string[] = [];
  lines.push(
    `%%{init: {"flowchart": {"htmlLabels": false, "curve": "basis", "padding": 28, "nodeSpacing": 45, "rankSpacing": 55}} }%%`,
  );
  lines.push(`flowchart TD`);

  if (input.title) {
    lines.push(
      `  title_block["${escapeMermaid(input.title)}${input.subtitle ? " — " + escapeMermaid(input.subtitle) : ""}"]`,
    );
    lines.push(
      `  style title_block fill:${theme.titleBg},stroke:${theme.accent},color:${theme.ink},stroke-width:2px`,
    );
    lines.push(`  title_block --> ${safeId(input.root)}`);
  }

  for (const n of input.nodes) {
    const id = safeId(n.id);
    const label = n.subtitle
      ? `${escapeMermaid(n.label)} - ${escapeMermaid(n.subtitle)}`
      : escapeMermaid(n.label);
    const t = n.type ?? (n.id === input.root ? "question" : "outcome");

    if (t === "question") {
      lines.push(`  ${id}{${label}}`);
      const c = theme.roles.network;
      lines.push(
        `  style ${id} fill:${c.fill},stroke:${c.stroke},color:${theme.ink},stroke-width:2px`,
      );
    } else if (t === "action") {
      lines.push(`  ${id}[${label}]`);
      const c = theme.roles.compute;
      lines.push(
        `  style ${id} fill:${c.fill},stroke:${c.stroke},color:${theme.ink},stroke-width:2px`,
      );
    } else {
      lines.push(`  ${id}([${label}])`);
      const c = n.role === "security" ? theme.roles.security : theme.roles.data;
      lines.push(
        `  style ${id} fill:${c.fill},stroke:${c.stroke},color:${theme.ink},stroke-width:2px`,
      );
    }
  }

  let linkIndex = input.title ? 1 : 0;
  const linkStyles: string[] = [];
  if (input.title) {
    linkStyles.push(`  linkStyle 0 stroke:${theme.border},stroke-width:1px`);
  }

  for (const e of input.edges) {
    const when = e.when ?? e.label;
    const label = when ? `|${escapeMermaid(when)}|` : "";
    lines.push(`  ${safeId(e.from)} -->${label} ${safeId(e.to)}`);
    const color =
      when?.toLowerCase() === "yes" || when?.toLowerCase() === "true"
        ? theme.edgeData
        : when?.toLowerCase() === "no" || when?.toLowerCase() === "false"
          ? theme.roles.security.stroke
          : theme.edgeDefault;
    linkStyles.push(`  linkStyle ${linkIndex} stroke:${color},stroke-width:2.5px`);
    linkIndex++;
  }

  lines.push(...linkStyles);
  return { engine: "mermaid", source: lines.join("\n") };
}
