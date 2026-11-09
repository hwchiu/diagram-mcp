import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { ThemePalette } from "../design/themes.js";

export interface D2RenderOptions {
  source: string;
  outSvg: string;
  outPng?: string;
  theme: ThemePalette;
  layout?: "elk" | "dagre" | "tala";
  /** PNG scale factor (d2 --pad / scale via width). We use rsvg for 2x after SVG. */
  pad?: number;
}

function run(cmd: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} ${args.join(" ")} failed (${code}): ${stderr || stdout}`));
    });
  });
}

/** Inject canvas / sketchy-free theme vars into D2 source if not already present. */
export function wrapD2Source(source: string, theme: ThemePalette, layout: "elk" | "dagre" | "tala" = "elk"): string {
  if (source.includes("vars:") && source.includes("d2-config")) {
    return source;
  }
  const header = `vars: {
  d2-config: {
    layout-engine: ${layout}
    theme-id: 0
    pad: 64
  }
  ink: "${theme.ink}"
  muted: "${theme.muted}"
  accent: "${theme.accent}"
  canvas: "${theme.canvas}"
  card: "${theme.card}"
  border: "${theme.border}"
}

# Canvas fill via a full-bleed background shape is handled in post-process.
`;
  return header + source;
}

export async function renderD2(opts: D2RenderOptions): Promise<void> {
  const layout = opts.layout ?? "elk";
  const wrapped = wrapD2Source(opts.source, opts.theme, layout);
  const srcPath = opts.outSvg.replace(/\.svg$/i, ".d2");
  await fs.mkdir(path.dirname(opts.outSvg), { recursive: true });
  await fs.writeFile(srcPath, wrapped, "utf8");

  const args = [
    `--layout=${layout}`,
    "--theme=0",
    `--pad=${opts.pad ?? 64}`,
    "--sketch=false",
    srcPath,
    opts.outSvg,
  ];
  await run("d2", args);
}
