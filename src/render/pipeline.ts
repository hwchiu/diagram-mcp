import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { getTheme, type ThemePalette } from "../design/themes.js";
import { renderD2 } from "../engines/d2.js";
import { renderMermaid } from "../engines/mermaid.js";
import { renderDot } from "../engines/graphviz.js";
import { postprocessSvg } from "./postprocess.js";
import type { EngineKind, RenderResult } from "../types.js";

export const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "output");

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: process.env });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} failed (${code}): ${stderr}`));
    });
  });
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "diagram"
  );
}

async function svgToPng(
  svgPath: string,
  pngPath: string,
  scale = 2,
): Promise<{ width: number; height: number }> {
  try {
    await run("rsvg-convert", ["-z", String(scale), "-o", pngPath, svgPath]);
    const meta = await sharp(pngPath).metadata();
    return { width: meta.width ?? 0, height: meta.height ?? 0 };
  } catch {
    const img = sharp(svgPath, { density: 144 * scale });
    const meta = await img.metadata();
    await img.png().toFile(pngPath);
    return { width: meta.width ?? 0, height: meta.height ?? 0 };
  }
}

async function makePreview(pngPath: string, maxWidth = 720): Promise<string> {
  const buf = await sharp(pngPath)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .png({ quality: 80, compressionLevel: 9 })
    .toBuffer();
  return buf.toString("base64");
}

export interface PipelineInput {
  engine: EngineKind;
  source: string;
  themeId?: string;
  name?: string;
  outputDir?: string;
  includePreview?: boolean;
  layout?: "elk" | "dagre" | "tala";
  /** Graphviz layout engine */
  graphvizLayout?: "dot" | "sfdp" | "neato" | "fdp";
}

export async function renderPipeline(input: PipelineInput): Promise<RenderResult> {
  const theme: ThemePalette = getTheme(input.themeId);
  const outDir = path.resolve(input.outputDir ?? DEFAULT_OUTPUT_DIR);
  await fs.mkdir(outDir, { recursive: true });

  const base = slugify(input.name ?? `${input.engine}-${Date.now()}`);
  const svgPath = path.join(outDir, `${base}.svg`);
  const pngPath = path.join(outDir, `${base}.png`);

  let sourcePath = "";
  let dims = { width: 0, height: 0 };

  if (input.engine === "d2") {
    sourcePath = svgPath.replace(/\.svg$/i, ".d2");
    await renderD2({
      source: input.source,
      outSvg: svgPath,
      theme,
      layout: input.layout ?? "elk",
    });
    await postprocessSvg(svgPath, theme);
    dims = await svgToPng(svgPath, pngPath, 2);
  } else if (input.engine === "mermaid") {
    // Puppeteer PNG preserves text; SVG still post-processed for archival
    sourcePath = await renderMermaid(input.source, svgPath, theme, pngPath);
    await postprocessSvg(svgPath, theme);
    const meta = await sharp(pngPath).metadata();
    dims = { width: meta.width ?? 0, height: meta.height ?? 0 };
  } else {
    sourcePath = await renderDot(input.source, svgPath, input.graphvizLayout ?? "dot");
    await postprocessSvg(svgPath, theme);
    dims = await svgToPng(svgPath, pngPath, 2);
  }

  let previewBase64: string | undefined;
  if (input.includePreview !== false) {
    previewBase64 = await makePreview(pngPath);
  }

  return {
    svgPath,
    pngPath,
    sourcePath,
    engine: input.engine,
    theme: theme.id,
    previewBase64,
    width: dims.width,
    height: dims.height,
  };
}
