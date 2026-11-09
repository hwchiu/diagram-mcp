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
  // Puppeteer often lacks Inter — use fonts available on macOS Chrome
  const font = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  return {
    theme: isDark ? "dark" : "base",
    themeVariables: {
      darkMode: isDark,
      background: theme.canvas,
      primaryColor: theme.roles.compute.fill,
      primaryTextColor: theme.ink,
      primaryBorderColor: theme.roles.compute.stroke,
      secondaryColor: theme.roles.gateway.fill,
      tertiaryColor: theme.roles.queue.fill,
      lineColor: theme.edgeSync,
      textColor: theme.ink,
      mainBkg: theme.card,
      nodeBorder: theme.border,
      clusterBkg: theme.groupFills[0],
      clusterBorder: theme.groupStrokes[0],
      titleColor: theme.ink,
      edgeLabelBackground: theme.surface,
      fontFamily: font,
      fontSize: "17px",
      // Sequence-specific
      actorBkg: theme.roles.gateway.fill,
      actorBorder: theme.roles.gateway.stroke,
      actorTextColor: theme.ink,
      actorLineColor: theme.border,
      signalColor: theme.edgeSync,
      signalTextColor: theme.ink,
      labelBoxBkgColor: theme.surface,
      labelBoxBorderColor: theme.border,
      labelTextColor: theme.ink,
      loopTextColor: theme.ink,
      noteBkgColor: theme.roles.queue.tint,
      noteTextColor: theme.ink,
      noteBorderColor: theme.roles.queue.stroke,
      activationBkgColor: theme.roles.compute.tint,
      activationBorderColor: theme.roles.compute.stroke,
      sequenceNumberColor: "#FFFFFF",
    },
    themeCSS: `
      svg, text, tspan, .actor, .actor-man, .messageText, .noteText, .labelText, .loopText {
        font-family: ${font} !important;
      }
      .actor { stroke-width: 1.75px !important; fill: ${theme.roles.gateway.fill} !important; stroke: ${theme.roles.gateway.stroke} !important; }
      .actor-line { stroke: ${theme.border} !important; }
      .messageLine0, .messageLine1 { stroke: ${theme.edgeSync} !important; }
      .messageText { font-size: 15px !important; fill: ${theme.ink} !important; }
      .note { fill: ${theme.roles.queue.tint} !important; stroke: ${theme.roles.queue.stroke} !important; }
      .activation0, .activation1, .activation2 {
        fill: ${theme.roles.compute.tint} !important;
        stroke: ${theme.roles.compute.stroke} !important;
      }
    `,
    flowchart: {
      curve: "basis",
      padding: 28,
      nodeSpacing: 55,
      rankSpacing: 65,
      htmlLabels: false,
      useMaxWidth: false,
    },
    sequence: {
      actorMargin: 36,
      messageMargin: 44,
      mirrorActors: false,
      bottomMarginAdj: 18,
      rightAngles: true,
      showSequenceNumbers: true,
      actorFontFamily: font,
      actorFontSize: 15,
      noteFontFamily: font,
      messageFontFamily: font,
      messageFontSize: 14,
    },
  };
}

export async function renderMermaid(
  source: string,
  outSvg: string,
  theme: ThemePalette,
  outPng?: string,
  scale = 2,
): Promise<string> {
  await fs.mkdir(path.dirname(outSvg), { recursive: true });
  const srcPath = outSvg.replace(/\.svg$/i, ".mmd");
  const cfgPath = outSvg.replace(/\.svg$/i, ".mermaid.json");
  const isSequence = source.includes("sequenceDiagram");
  const pngScale = isSequence ? Math.max(scale, 3) : scale;
  await fs.writeFile(srcPath, source, "utf8");
  await fs.writeFile(cfgPath, JSON.stringify(mermaidThemeConfig(theme), null, 2), "utf8");

  await run(MMDC, ["-i", srcPath, "-o", outSvg, "-c", cfgPath, "-b", theme.canvas, "--quiet"]);

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
      String(pngScale),
      "--quiet",
    ]);
  }
  return srcPath;
}
