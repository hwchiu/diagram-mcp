/** Horizontal legend flow: items wrap onto extra rows when the panel is too narrow. */
import { FONTS } from "./grid.js";
import { measureText } from "./text.js";
import type { LegendItem, Rect } from "./types.js";

export const LEGEND_ROW = 26;
const HEAD = 90;

export function legendFlow(items: LegendItem[], r: Rect): Array<{ item: LegendItem; x: number; y: number }> {
  const out: Array<{ item: LegendItem; x: number; y: number }> = [];
  let x = r.x + 4 + HEAD;
  let row = 0;
  for (const it of items) {
    const w = 38 + measureText(it.label, FONTS.legend);
    if (x + w > r.x + r.w && x > r.x + 4 + HEAD) {
      row++;
      x = r.x + 4 + HEAD;
    }
    out.push({ item: it, x, y: r.y + LEGEND_ROW / 2 + 2 + row * LEGEND_ROW });
    x += w + 32;
  }
  return out;
}

/** Height a horizontal legend needs inside `width`. */
export function legendHeight(items: LegendItem[], width: number): number {
  if (!items.length) return 0;
  const f = legendFlow(items, { x: 0, y: 0, w: width, h: 0 });
  const rows = Math.round((f[f.length - 1].y - (LEGEND_ROW / 2 + 2)) / LEGEND_ROW) + 1;
  return rows === 1 ? 30 : rows * LEGEND_ROW + 4;
}
