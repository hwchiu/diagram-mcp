/**
 * Card geometry per notation shape. Every shape keeps a rectangular bounding
 * box (the router / QA work on boxes); the SVG / draw.io backends draw the
 * notation inside it (person head, DFD store rails, decision diamond, …).
 */
import type { DiagramNode, NodeShape } from "../types.js";
import { ellipsize, measureText, wrapBalanced, wrapText, type FontSpec } from "./text.js";

export const SHAPE_FONTS = {
  label: { font: "mono", size: 14, weight: 600 } as FontSpec,
  labelLg: { font: "mono", size: 16, weight: 700 } as FontSpec,
  sub: { font: "mono", size: 12, weight: 400 } as FontSpec,
  desc: { font: "sans", size: 12, weight: 400 } as FontSpec,
  tag: { font: "mono", size: 10, weight: 600, tracking: 0.06 } as FontSpec,
};

export const DESC_LINE = 16;
/** ERD table geometry */
export const TABLE_HEAD = 36;
export const TABLE_ROW = 22;
export const LABEL_LINE = 18;
const MAX_DESC = 3;

/** Shapes whose text block is centred (no icon box). */
export const CENTERED: ReadonlySet<NodeShape> = new Set<NodeShape>(["person", "decision", "terminator", "process", "entity", "system", "state", "io", "subprocess", "document", "initial", "final", "choice"]);

export interface CardMetrics {
  w: number;
  h: number;
  /** text column width */
  textRoom: number;
  /** label lines (1–2) */
  label: string[];
  labelTruncated: boolean;
  desc: string[];
  centered: boolean;
  /** extra top space reserved by the shape (person head, tag row) */
  top: number;
}

export interface CardBase {
  cardW: number;
  cardH: number;
  iconTextX: number;
}

export function shapeOf(n: DiagramNode): NodeShape {
  return n.shape ?? "rounded";
}

/** Label wrapped to ≤2 lines (CJK breaks anywhere), ellipsized on the 2nd. */
export function wrapLabel(text: string, spec: FontSpec, room: number, maxLines = 2): { lines: string[]; truncated: boolean } {
  if (measureText(text, spec) <= room) return { lines: [text], truncated: false };
  const lines = wrapBalanced(text, spec, room);
  if (lines.length <= maxLines) return { lines, truncated: lines.some((l) => l.endsWith("…")) };
  const head = lines.slice(0, maxLines - 1);
  const rest = lines.slice(maxLines - 1).join(/[\u2e80-\ua4cf\uff00-\uff60]$/.test(lines[maxLines - 2] ?? "") ? "" : " ");
  const last = ellipsize(rest, spec, room);
  return { lines: [...head, last.text], truncated: true };
}

export function cardMetrics(n: DiagramNode, base: CardBase): CardMetrics {
  const shape = shapeOf(n);
  const { cardW, cardH, iconTextX } = base;
  const hasIcon = n.icon !== "none";
  if (n.stub) {
    const room = cardW - iconTextX - 12;
    return { w: cardW, h: 46, textRoom: room, label: [ellipsize(n.label, SHAPE_FONTS.label, room).text], labelTruncated: false, desc: [], centered: false, top: 0 };
  }
  let w = cardW;
  let room: number;
  let top = 0;
  let minH = cardH;
  const centered = CENTERED.has(shape);
  switch (shape) {
    case "system":
      w = Math.min(360, Math.max(cardW + 72, Math.round(cardW * 1.4)));
      room = w - 40;
      top = 0;
      minH = 120;
      break;
    case "person":
      room = w - 28;
      top = 38;
      minH = cardH + 34;
      break;
    case "decision":
      room = Math.round(w * 0.56);
      minH = 104;
      break;
    case "terminator":
      room = w - 40;
      minH = 46;
      break;
    case "process":
      room = w - 44;
      top = n.tag ? 14 : 0;
      minH = cardH + (n.tag ? 10 : 0);
      break;
    case "entity":
      room = w - 32;
      minH = cardH;
      break;
    case "datastore":
      room = w - 64;
      minH = 54;
      break;
    case "interface":
      room = w - 46;
      minH = 40;
      break;
    case "initial":
      return { w: 30, h: 30, textRoom: 0, label: [""], labelTruncated: false, desc: [], centered: true, top: 0 };
    case "final":
      return { w: 34, h: 34, textRoom: 0, label: [""], labelTruncated: false, desc: [], centered: true, top: 0 };
    case "choice":
      return { w: 44, h: 44, textRoom: 0, label: [""], labelTruncated: false, desc: [], centered: true, top: 0 };
    case "table": {
      const rows = n.rows ?? [];
      return { w, h: TABLE_HEAD + rows.length * TABLE_ROW + 10, textRoom: w - 48, label: [n.label], labelTruncated: false, desc: [], centered: false, top: 0 };
    }
    case "state":
      room = w - 28;
      minH = 52;
      break;
    case "io":
      room = w - 64;
      minH = cardH - 4;
      break;
    case "subprocess":
      room = w - 48;
      minH = cardH - 4;
      break;
    case "document":
      room = w - 30;
      minH = cardH + 8;
      break;
    case "cylinder":
      room = hasIcon ? w - iconTextX - 12 : w - 28;
      top = 8;
      minH = cardH + 12;
      break;
    default:
      room = hasIcon ? w - iconTextX - 12 : w - 28;
  }
  if (n.replicas && n.replicas > 1) room -= 8;
  if (n.tag && shape !== "system" && shape !== "process" && shape !== "datastore" && shape !== "person" && shape !== "decision" && shape !== "state") top += 16;
  const lf = shape === "system" ? SHAPE_FONTS.labelLg : SHAPE_FONTS.label;
  const lab = wrapLabel(n.label, lf, room, shape === "interface" || shape === "terminator" || shape === "datastore" ? 1 : 2);
  let desc: string[] = [];
  if (n.description && shape !== "decision" && shape !== "terminator" && shape !== "interface" && shape !== "io") {
    const all = n.description.includes("\n")
      ? n.description.split("\n").flatMap((l) => wrapText(l, SHAPE_FONTS.desc, room))
      : wrapText(n.description, SHAPE_FONTS.desc, room).length <= MAX_DESC ? wrapBalanced(n.description, SHAPE_FONTS.desc, room) : wrapText(n.description, SHAPE_FONTS.desc, room);
    desc = all.slice(0, MAX_DESC);
    if (all.length > MAX_DESC) desc[MAX_DESC - 1] = ellipsize(all.slice(MAX_DESC - 1).join(" "), SHAPE_FONTS.desc, room).text;
  }
  const lines = lab.lines.length + (n.subtitle ? 1 : 0) + (n.detail ? 1 : 0);
  const textH = (lab.lines.length - 1) * LABEL_LINE + 14 + (lines - lab.lines.length) * 17 + (desc.length ? 8 + desc.length * DESC_LINE : 0);
  let h = Math.max(minH, top + textH + 30);
  if (shape === "decision") h = Math.max(104, textH * 2 + 40);
  if (shape === "state" && desc.length) h += 8;
  if (shape === "document") h += 6;
  if (n.replicas && n.replicas > 1) h += 8;
  return { w, h: Math.round(h), textRoom: room, label: lab.lines, labelTruncated: lab.truncated, desc, centered, top };
}
