import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { getTheme, type ThemePalette } from "../design/themes.js";
import { renderD2 } from "../engines/d2.js";
import { renderMermaid } from "../engines/mermaid.js";
import { renderDot } from "../engines/graphviz.js";
import { postprocessSvg } from "./postprocess.js";
import type { EngineKind, QaIssue, RenderResult } from "../types.js";

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

/** Cap raster width so diagrams stay readable when viewed ~1600px wide. */
const MAX_PNG_WIDTH = 3600;

async function svgToPng(
  svgPath: string,
  pngPath: string,
  scale = 2,
): Promise<{ width: number; height: number }> {
  const tmp = pngPath.replace(/\.png$/i, ".raw.png");
  try {
    await run("rsvg-convert", ["-z", String(scale), "-o", tmp, svgPath]);
  } catch {
    await sharp(svgPath, { density: 144 * scale }).png().toFile(tmp);
  }
  const meta = await sharp(tmp).metadata();
  const w = meta.width ?? 0;
  if (w > MAX_PNG_WIDTH) {
    await sharp(tmp).resize({ width: MAX_PNG_WIDTH }).png().toFile(pngPath);
    await fs.unlink(tmp).catch(() => undefined);
    const out = await sharp(pngPath).metadata();
    return { width: out.width ?? MAX_PNG_WIDTH, height: out.height ?? 0 };
  }
  await fs.rename(tmp, pngPath);
  return { width: w, height: meta.height ?? 0 };
}

async function fitPngWidth(pngPath: string): Promise<{ width: number; height: number }> {
  const meta = await sharp(pngPath).metadata();
  const w = meta.width ?? 0;
  if (w > MAX_PNG_WIDTH) {
    const tmp = pngPath.replace(/\.png$/i, ".fit.png");
    await sharp(pngPath).resize({ width: MAX_PNG_WIDTH }).png().toFile(tmp);
    await fs.rename(tmp, pngPath);
    const out = await sharp(pngPath).metadata();
    return { width: out.width ?? MAX_PNG_WIDTH, height: out.height ?? 0 };
  }
  return { width: w, height: meta.height ?? 0 };
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
  layout?: "elk" | "dagre" | "tala" | "grid";
  /** Graphviz layout engine */
  graphvizLayout?: "dot" | "sfdp" | "neato" | "fdp";
  /** Editable draw.io XML to write next to the SVG (architecture tools) */
  drawio?: string;
  /** Structural QA findings to pass through */
  qa?: QaIssue[];
  /** Appended after the slugged name with a dot: name.overview.png */
  suffix?: string;
}

export async function renderPipeline(input: PipelineInput): Promise<RenderResult> {
  const theme: ThemePalette = getTheme(input.themeId);
  const outDir = path.resolve(input.outputDir ?? DEFAULT_OUTPUT_DIR);
  await fs.mkdir(outDir, { recursive: true });

  const base = slugify(input.name ?? `${input.engine}-${Date.now()}`) + (input.suffix ? `.${input.suffix}` : "");
  const svgPath = path.join(outDir, `${base}.svg`);
  const pngPath = path.join(outDir, `${base}.png`);

  let sourcePath = "";
  let dims = { width: 0, height: 0 };

  if (input.engine === "svg") {
    // Deterministic architecture SVG (already themed) — write + rasterize at 2×
    sourcePath = svgPath;
    await fs.writeFile(svgPath, input.source, "utf8");
    dims = await svgToPng(svgPath, pngPath, 2);
  } else if (input.engine === "d2") {
    sourcePath = svgPath.replace(/\.svg$/i, ".d2");
    await renderD2({
      source: input.source,
      outSvg: svgPath,
      theme,
      layout: input.layout === "grid" ? "tala" : (input.layout ?? "tala"),
    });
    await postprocessSvg(svgPath, theme);
    dims = await svgToPng(svgPath, pngPath, 2);
  } else if (input.engine === "mermaid") {
    // Puppeteer PNG keeps Mermaid text (rsvg drops many labels). SVG still post-processed.
    sourcePath = await renderMermaid(input.source, svgPath, theme, pngPath);
    await postprocessSvg(svgPath, theme);
    dims = await fitPngWidth(pngPath);
  } else {
    sourcePath = await renderDot(input.source, svgPath, input.graphvizLayout ?? "dot");
    await postprocessSvg(svgPath, theme);
    dims = await svgToPng(svgPath, pngPath, 2);
  }

  let drawioPath: string | undefined;
  if (input.drawio) {
    drawioPath = path.join(outDir, `${base}.drawio`);
    await fs.writeFile(drawioPath, input.drawio, "utf8");
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
    drawioPath,
    qa: input.qa,
  };
}
