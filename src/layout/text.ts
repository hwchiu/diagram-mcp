/**
 * Deterministic text measurement for SVG layout + QA.
 * - JetBrains Mono (and every common monospace fallback) advances 0.6em per glyph.
 * - Inter widths come from a baked advance table (src/layout/fontMetrics.ts).
 * - CJK / full-width glyphs are measured at 1em (Noto Sans CJK / PingFang).
 */
import { INTER_WIDTHS } from "./fontMetrics.js";

export type FontKind = "mono" | "sans";

export interface FontSpec {
  font: FontKind;
  size: number;
  weight?: number;
  /** letter-spacing in em */
  tracking?: number;
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

function interWeight(w = 400): 400 | 500 | 600 | 700 {
  if (w >= 650) return 700;
  if (w >= 550) return 600;
  if (w >= 450) return 500;
  return 400;
}

export function measureText(text: string, spec: FontSpec): number {
  const { size } = spec;
  const tracking = (spec.tracking ?? 0) * size;
  let units = 0;
  let count = 0;
  const table = INTER_WIDTHS[interWeight(spec.weight)];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    count++;
    if (isWide(cp)) {
      units += 1000;
    } else if (spec.font === "mono") {
      units += 600;
    } else if (cp >= 32 && cp <= 126) {
      units += table[cp - 32];
    } else {
      units += 600; // accented latin, arrows, symbols ≈ average
    }
  }
  // Bold mono is still monospace; sans bold already in table.
  return (units / 1000) * size + Math.max(0, count - 1) * tracking;
}

/** Truncate with an ellipsis so the measured width fits `max`. */
export function ellipsize(text: string, spec: FontSpec, max: number): { text: string; truncated: boolean } {
  if (measureText(text, spec) <= max) return { text, truncated: false };
  const chars = [...text];
  while (chars.length > 1 && measureText(chars.join("") + "…", spec) > max) chars.pop();
  return { text: chars.join("").trimEnd() + "…", truncated: true };
}

/** Greedy word wrap by measured width (CJK may break anywhere). */
export function wrapText(text: string, spec: FontSpec, max: number): string[] {
  const tokens = text.match(/[\u2e80-\ua4cf\uac00-\ud7a3\uff00-\uff60]|[^\s\u2e80-\ua4cf\uac00-\ud7a3\uff00-\uff60]+|\s+/g) ?? [];
  const lines: string[] = [];
  let line = "";
  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) {
      if (line) line += " ";
      continue;
    }
    const next = line + tok;
    if (line && measureText(next.trimEnd(), spec) > max) {
      lines.push(line.trimEnd());
      line = tok;
    } else {
      line = next;
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  // Hard-break words longer than max
  return lines.flatMap((l) => (measureText(l, spec) <= max ? [l] : [ellipsize(l, spec, max).text]));
}
