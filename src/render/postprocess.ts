import fs from "node:fs/promises";
import type { ThemePalette } from "../design/themes.js";

/**
 * Polish raw engine SVG: inject fonts, canvas background, soft card shadows,
 * and tighten presentation for a designer look.
 */
export async function postprocessSvg(svgPath: string, theme: ThemePalette): Promise<void> {
  let svg = await fs.readFile(svgPath, "utf8");

  // Ensure xmlns
  if (!svg.includes("xmlns=")) {
    svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const defs = `
  <defs>
    <style type="text/css"><![CDATA[
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
      text, tspan {
        font-family: ${theme.fontFamily} !important;
      }
      .diagram-title { font-weight: 700; letter-spacing: -0.02em; }
      .diagram-subtitle { font-weight: 500; opacity: 0.75; }
    ]]></style>
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="${theme.ink}" flood-opacity="0.10"/>
    </filter>
    <linearGradient id="titleGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0"/>
    </linearGradient>
  </defs>`;

  if (!svg.includes('id="cardShadow"')) {
    svg = svg.replace(/<svg([^>]*)>/, `<svg$1>${defs}`);
  }

  // Force canvas background
  if (!svg.includes('id="canvas-bg"')) {
    svg = svg.replace(
      /(<svg[^>]*>)/,
      `$1\n  <rect id="canvas-bg" width="100%" height="100%" fill="${theme.canvas}"/>`,
    );
  } else {
    svg = svg.replace(
      /id="canvas-bg"[^>]*fill="[^"]*"/,
      `id="canvas-bg" width="100%" height="100%" fill="${theme.canvas}"`,
    );
  }

  // Soften Graphviz / Mermaid hard blacks on dark themes
  if (theme.id === "dark" || theme.id === "blueprint") {
    svg = svg.replace(/fill="#000000"/gi, `fill="${theme.ink}"`);
    svg = svg.replace(/stroke="#000000"/gi, `stroke="${theme.border}"`);
    svg = svg.replace(/fill="black"/gi, `fill="${theme.ink}"`);
  }

  // Force design-system sans on Mermaid sequence (often emits serif / Times)
  svg = svg.replace(
    /font-family\s*[:=]\s*["']?(?:Times|Times New Roman|serif)["']?/gi,
    `font-family: ${theme.fontFamily}`,
  );
  svg = svg.replace(
    /font-family="[^"]*"/gi,
    `font-family="${theme.fontFamily.replace(/"/g, "")}"`,
  );

  await fs.writeFile(svgPath, svg, "utf8");
}
