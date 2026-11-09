import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { ThemePalette } from "../design/themes.js";

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: process.env });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`dot failed (${code}): ${stderr}`));
    });
  });
}

export function graphvizPreamble(theme: ThemePalette, direction: "TB" | "LR" = "LR"): string {
  return `digraph G {
  graph [
    rankdir=${direction},
    bgcolor="${theme.canvas}",
    fontname="Helvetica Neue",
    fontsize=14,
    pad="0.6",
    nodesep="0.45",
    ranksep="0.7",
    splines=true,
    overlap=false,
    outputorder=edgesfirst,
    labeljust=l,
    labelloc=t
  ];
  node [
    shape=box,
    style="rounded,filled",
    fontname="Helvetica Neue",
    fontsize=11,
    fontcolor="${theme.ink}",
    fillcolor="${theme.card}",
    color="${theme.border}",
    penwidth=1.4,
    margin="0.18,0.12",
    width=1.4,
    height=0.5
  ];
  edge [
    fontname="Helvetica Neue",
    fontsize=9,
    fontcolor="${theme.muted}",
    color="${theme.edgeDefault}",
    penwidth=1.2,
    arrowsize=0.7
  ];
`;
}

export async function renderDot(
  source: string,
  outSvg: string,
  layout: "dot" | "sfdp" | "neato" | "fdp" = "dot",
): Promise<string> {
  await fs.mkdir(path.dirname(outSvg), { recursive: true });
  const srcPath = outSvg.replace(/\.svg$/i, ".dot");
  await fs.writeFile(srcPath, source, "utf8");
  const bin = layout === "dot" ? "dot" : layout;
  await run(bin, ["-Tsvg", srcPath, "-o", outSvg]);
  return srcPath;
}
