import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ThemePalette } from "../design/themes.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MMDC = path.join(ROOT, "node_modules", ".bin", "mmdc");

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: process.env });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`mmdc failed (${code}): ${stderr}`));
    });
  });
}

export function mermaidThemeConfig(theme: ThemePalette): object {
  const isDark = theme.id === "dark" || theme.id === "blueprint";
  return {
    theme: isDark ? "dark" : "base",
    themeVariables: {
      darkMode: isDark,
      background: theme.canvas,
      primaryColor: theme.roles.compute.fill,
      primaryTextColor: theme.ink,
      primaryBorderColor: theme.roles.compute.stroke,
      secondaryColor: theme.roles.data.fill,
      tertiaryColor: theme.roles.queue.fill,
      lineColor: theme.edgeDefault,
      textColor: theme.ink,
      mainBkg: theme.card,
      nodeBorder: theme.border,
      clusterBkg: theme.groupFills[0],
      clusterBorder: theme.groupStrokes[0],
      titleColor: theme.ink,
      edgeLabelBackground: theme.surface,
      fontFamily: "Inter, Helvetica Neue, Arial, sans-serif",
      fontSize: "16px",
    },
    flowchart: {
      curve: "basis",
      padding: 28,
      nodeSpacing: 55,
      rankSpacing: 65,
      // foreignObject HTML labels break rsvg/sharp text — keep native SVG text
      htmlLabels: false,
      useMaxWidth: false,
    },
  };
}

export async function renderMermaid(
  source: string,
  outSvg: string,
  theme: ThemePalette,
  outPng?: string,
): Promise<string> {
  await fs.mkdir(path.dirname(outSvg), { recursive: true });
  const srcPath = outSvg.replace(/\.svg$/i, ".mmd");
  const cfgPath = outSvg.replace(/\.svg$/i, ".mermaid.json");
  await fs.writeFile(srcPath, source, "utf8");
  await fs.writeFile(cfgPath, JSON.stringify(mermaidThemeConfig(theme), null, 2), "utf8");

  // SVG (for editing / archival)
  await run(MMDC, ["-i", srcPath, "-o", outSvg, "-c", cfgPath, "-b", theme.canvas, "--quiet"]);

  // PNG via Puppeteer so labels render correctly (scale 2 for retina)
  if (outPng) {
    await run(MMDC, [
      "-i",
      srcPath,
      "-o",
      outPng,
      "-c",
      cfgPath,
      "-b",
      theme.canvas,
      "-s",
      "2",
      "--quiet",
    ]);
  }
  return srcPath;
}
