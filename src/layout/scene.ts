/**
 * Scene graph for the fixed-form notations (sequence, authorization matrix,
 * gantt, timeline). Layouts emit absolute-positioned primitives; this module
 * renders them to SVG and draw.io with the same chrome (title, panel, legend,
 * footer) as the graph engine, and runs structural QA on them (text overflow,
 * label collisions, lines through cards, bounds, aspect, readability).
 */
import type { EdgeMark, QaIssue } from "../types.js";
import { FONTS, FOOTER_H, MARGIN, PANEL_PAD, TITLE_H } from "./grid.js";
import { renderArchitectureDrawio } from "./drawio.js";
import { endGlyph, esc, pathD, renderArchitectureSvg } from "./svg.js";
import { archTheme, rgba, type ArchTheme } from "./theme.js";
import { measureText, type FontSpec } from "./text.js";
import { legendHeight } from "./legend.js";
import type { DiagramProfile, LayoutResult, LegendItem, Point, Rect } from "./types.js";
import { MONO_PATHS, type MonoIcon } from "./icons.js";

export interface Paint {
  color: string;
  alpha?: number;
}

interface Base {
  id?: string;
  /** QA group: items sharing a group may overlap each other */
  group?: string;
  opacity?: number;
}

export interface SRect extends Base {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
  fill?: Paint;
  stroke?: Paint;
  sw?: number;
  dash?: string;
  glow?: boolean;
  /** QA obstacle: lines must not pass through, labels must not overlap */
  card?: boolean;
}

export interface SText extends Base {
  kind: "text";
  x: number;
  /** baseline */
  y: number;
  text: string;
  size: number;
  weight?: number;
  color: string;
  font?: "mono" | "sans";
  anchor?: "start" | "middle" | "end";
  tracking?: number;
  /** declared room: QA flags text wider than this */
  maxW?: number;
  /** take part in label-collision QA (default true) */
  solid?: boolean;
}

export interface SLine extends Base {
  kind: "line";
  points: Point[];
  color: string;
  sw?: number;
  dash?: string;
  start?: EdgeMark;
  end?: EdgeMark;
  /** rounded corner radius */
  radius?: number;
  glow?: boolean;
  /** QA: must not cross cards except the listed ones */
  route?: { ends: string[] };
}

export interface SCircle extends Base {
  kind: "circle";
  cx: number;
  cy: number;
  r: number;
  fill?: Paint;
  stroke?: Paint;
  sw?: number;
}

export interface SPoly extends Base {
  kind: "poly";
  points: Point[];
  fill?: Paint;
  stroke?: Paint;
  sw?: number;
  /** draw.io stencil for this polygon */
  drawio?: "rhombus" | "triangle" | "hexagon" | "note" | "tab";
  card?: boolean;
}

export interface SIcon extends Base {
  kind: "icon";
  name: MonoIcon;
  x: number;
  y: number;
  size: number;
  color: string;
}

export type SItem = SRect | SText | SLine | SCircle | SPoly | SIcon;

export interface Scene {
  width: number;
  height: number;
  title?: string;
  subtitle?: string;
  meta: string;
  profile: DiagramProfile;
  legend: LegendItem[];
  legendRect: Rect;
  content: Rect;
  titleRect: Rect;
  footerY: number;
  items: SItem[];
}

export const SF = {
  label: { font: "mono", size: 14, weight: 600 } as FontSpec,
  small: { font: "mono", size: 12, weight: 400 } as FontSpec,
  smallB: { font: "mono", size: 12, weight: 600 } as FontSpec,
  body: { font: "sans", size: 12, weight: 400 } as FontSpec,
  head: { font: "mono", size: 11, weight: 600, tracking: 0.12 } as FontSpec,
};

/** Wrap a content block (already laid out at origin 0,0) in the standard chrome. */
export function frameScene(o: {
  title?: string;
  subtitle?: string;
  meta: string;
  profile: DiagramProfile;
  legend: LegendItem[];
  innerW: number;
  innerH: number;
  /** items in inner coordinates (0,0 = top-left of the content area inside the panel padding) */
  items: SItem[];
}): Scene {
  const titleW = Math.max(o.title ? measureText(o.title, FONTS.title) + 60 + measureText(o.meta, { font: "mono", size: 11, tracking: 0.12 }) + 40 : 0, o.subtitle ? measureText(o.subtitle, FONTS.subtitle) + 60 : 0);
  const contentW = Math.max(o.innerW + PANEL_PAD * 2, titleW);
  const content: Rect = { x: MARGIN, y: MARGIN + TITLE_H, w: Math.round(contentW), h: Math.round(o.innerH + PANEL_PAD * 2) };
  const ox = content.x + Math.round((content.w - o.innerW) / 2);
  const oy = content.y + PANEL_PAD;
  const items = o.items.map((it) => shift(it, ox, oy));
  const lh = legendHeight(o.legend, content.w);
  const legendRect: Rect = { x: content.x, y: content.y + content.h + 18, w: content.w, h: lh };
  const footerY = lh ? legendRect.y + lh + 18 : content.y + content.h + 18;
  const width = Math.round(content.x + content.w + MARGIN);
  const height = Math.round(footerY + FOOTER_H - 12 + MARGIN / 2);
  return { width, height, title: o.title, subtitle: o.subtitle, meta: o.meta, profile: o.profile, legend: o.legend, legendRect, content, titleRect: { x: MARGIN, y: MARGIN, w: width - MARGIN * 2, h: TITLE_H }, footerY, items };
}

/** Chrome height (everything but the inner content) for aspect planning. */
export function sceneChromeH(legendRows = 1): number {
  return MARGIN + TITLE_H + PANEL_PAD * 2 + 18 + (legendRows > 1 ? legendRows * 26 + 4 : 30) + 18 + FOOTER_H - 12 + MARGIN / 2;
}
export const SCENE_CHROME_W = MARGIN * 2 + PANEL_PAD * 2;

function shift<T extends SItem>(it: T, dx: number, dy: number): T {
  switch (it.kind) {
    case "rect":
      return { ...it, x: it.x + dx, y: it.y + dy };
    case "text":
      return { ...it, x: it.x + dx, y: it.y + dy };
    case "circle":
      return { ...it, cx: it.cx + dx, cy: it.cy + dy };
    case "icon":
      return { ...it, x: it.x + dx, y: it.y + dy };
    case "line":
    case "poly":
      return { ...it, points: it.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) } as T;
  }
}

export function chromeLayout(s: Scene): LayoutResult {
  return {
    width: s.width,
    height: s.height,
    title: s.title,
    subtitle: s.subtitle,
    nodes: [],
    tiers: [],
    edges: [],
    steps: [],
    stepCards: [],
    stepsPosition: "none",
    legend: s.legend,
    legendRect: s.legendRect,
    content: s.content,
    sidebar: { x: 0, y: 0, w: 0, h: 0 },
    titleRect: s.titleRect,
    footerY: s.footerY,
    routeNotes: [],
    junctions: [],
    anchors: [],
    profile: s.profile,
    meta: s.meta,
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const paint = (p: Paint | undefined) => (p ? (p.alpha == null || p.alpha >= 1 ? p.color : rgba(p.color, p.alpha)) : "none");

/** Arrow head (filled / open) at p pointing away from q. */
function arrowHead(mark: EdgeMark, p: Point, q: Point, color: string, sw: number): string {
  const L = Math.hypot(p.x - q.x, p.y - q.y) || 1;
  const u = { x: (p.x - q.x) / L, y: (p.y - q.y) / L };
  const v = { x: -u.y, y: u.x };
  const k = 9;
  const a = { x: p.x - u.x * k + v.x * 4.5, y: p.y - u.y * k + v.y * 4.5 };
  const b = { x: p.x - u.x * k - v.x * 4.5, y: p.y - u.y * k - v.y * 4.5 };
  if (mark === "arrow") return `<path d="M ${r1(p.x)} ${r1(p.y)} L ${r1(a.x)} ${r1(a.y)} L ${r1(b.x)} ${r1(b.y)} Z" fill="${color}"/>`;
  if (mark === "open") return `<path d="M ${r1(a.x)} ${r1(a.y)} L ${r1(p.x)} ${r1(p.y)} L ${r1(b.x)} ${r1(b.y)}" fill="none" stroke="${color}" stroke-width="${Math.max(1.4, sw)}" stroke-linejoin="round" stroke-linecap="round"/>`;
  return "";
}

function itemSvg(it: SItem, t: ArchTheme): string {
  const op = it.opacity != null && it.opacity < 1 ? ` opacity="${it.opacity}"` : "";
  const id = it.id ? ` id="${esc(it.id)}"` : "";
  switch (it.kind) {
    case "rect": {
      const glow = it.glow ? (t.glow ? ` filter="url(#glow)"` : ` filter="url(#shadow)"`) : "";
      return `<rect${id} x="${r1(it.x)}" y="${r1(it.y)}" width="${r1(it.w)}" height="${r1(it.h)}" rx="${it.rx ?? 0}" fill="${paint(it.fill)}" stroke="${paint(it.stroke)}" stroke-width="${it.stroke ? (it.sw ?? 1) : 0}"${it.dash ? ` stroke-dasharray="${it.dash}"` : ""}${glow}${op}/>`;
    }
    case "text": {
      const fam = it.font === "sans" ? t.sans : t.mono;
      return `<text${id} x="${r1(it.x)}" y="${r1(it.y)}"${it.anchor && it.anchor !== "start" ? ` text-anchor="${it.anchor}"` : ""} fill="${it.color}" font-family="${fam}" font-size="${it.size}"${it.weight && it.weight !== 400 ? ` font-weight="${it.weight}"` : ""}${it.tracking ? ` letter-spacing="${it.tracking}em"` : ""}${op}>${esc(it.text)}</text>`;
    }
    case "icon": {
      const d = MONO_PATHS[it.name];
      if (!d) return "";
      const sc = it.size / 24;
      return `<g${id} transform="translate(${r1(it.x)} ${r1(it.y)}) scale(${Math.round(sc * 1000) / 1000})" fill="none" stroke="${it.color}" stroke-width="${Math.round((1.7 / sc) * 100) / 100}" stroke-linecap="round" stroke-linejoin="round"${op}><path d="${d}"/></g>`;
    }
    case "circle":
      return `<circle${id} cx="${r1(it.cx)}" cy="${r1(it.cy)}" r="${r1(it.r)}" fill="${paint(it.fill)}" stroke="${paint(it.stroke)}" stroke-width="${it.stroke ? (it.sw ?? 1) : 0}"${op}/>`;
    case "poly":
      return `<path${id} d="M ${it.points.map((p) => `${r1(p.x)} ${r1(p.y)}`).join(" L ")} Z" fill="${paint(it.fill)}" stroke="${paint(it.stroke)}" stroke-width="${it.stroke ? (it.sw ?? 1) : 0}" stroke-linejoin="round"${op}/>`;
    case "line": {
      const sw = it.sw ?? 1.6;
      const d = pathD(it.points, it.radius ?? 8);
      const n = it.points.length;
      const under = it.glow && t.glow ? `<path d="${d}" fill="none" stroke="${it.color}" stroke-opacity="0.16" stroke-width="${sw + 3.5}" stroke-linejoin="round"/>` : "";
      let heads = "";
      if (n >= 2) {
        for (const [m, p, q] of [[it.end, it.points[n - 1], it.points[n - 2]], [it.start, it.points[0], it.points[1]]] as Array<[EdgeMark | undefined, Point, Point]>) {
          if (!m || m === "none") continue;
          heads += m === "arrow" || m === "open" ? arrowHead(m, p, q, it.color, sw) : endGlyph(m, p, q, it.color, t.canvas);
        }
      }
      return `<g${id} class="sline"${op}>${under}<path d="${d}" fill="none" stroke="${it.color}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"${it.dash ? ` stroke-dasharray="${it.dash}"` : ""}/>${heads}</g>`;
    }
  }
}

export function renderSceneSvg(s: Scene, themeId?: string): string {
  const t = archTheme(themeId);
  const chrome = renderArchitectureSvg(chromeLayout(s), themeId);
  const body = `<g id="scene">\n${s.items.map((it) => itemSvg(it, t)).join("\n")}\n</g>`;
  // scene sits above the panel, below the legend / footer
  return chrome.replace('<g id="nodes">', `${body}\n  <g id="nodes">`);
}

// ── draw.io ────────────────────────────────────────────────────────────────
function blend(hex: string, alpha: number, base: string): string {
  const p = (h: string) => {
    const n = parseInt(h.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = p(hex);
  const b = p(base);
  return "#" + a.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("");
}
const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "&#xa;");
const st = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => (v === "" ? k : `${k}=${v}`))
    .join(";") + ";";
const rd = (v: number) => Math.round(v * 10) / 10;
const DRAWIO_MARK: Record<string, string> = { arrow: "block", open: "open", none: "none", one: "ERone", many: "ERmany", exactlyOne: "ERmandOne", zeroOrOne: "ERzeroToOne", oneOrMany: "ERoneToMany", zeroOrMany: "ERzeroToMany" };

export function renderSceneDrawio(s: Scene, themeId?: string): string {
  const t = archTheme(themeId);
  const chrome = renderArchitectureDrawio(chromeLayout(s), themeId);
  const base = t.id === "dark" ? "#0a1124" : "#ffffff";
  const col = (p?: Paint) => (p ? (p.alpha == null || p.alpha >= 1 ? p.color : blend(p.color, p.alpha, base)) : "none");
  const cells: string[] = [];
  let k = 0;
  const v = (value: string, style: string, r: Rect) => cells.push(`<mxCell id="s${++k}" value="${xmlEsc(value)}" style="${xmlEsc(style)}" vertex="1" parent="1"><mxGeometry x="${rd(r.x)}" y="${rd(r.y)}" width="${rd(Math.max(1, r.w))}" height="${rd(Math.max(1, r.h))}" as="geometry"/></mxCell>`);
  for (const it of s.items) {
    const opacity = it.opacity != null && it.opacity < 1 ? Math.round(it.opacity * 100) : undefined;
    switch (it.kind) {
      case "rect":
        v("", st({ rounded: it.rx ? 1 : 0, arcSize: it.rx, absoluteArcSize: it.rx ? 1 : undefined, fillColor: col(it.fill), strokeColor: col(it.stroke), strokeWidth: it.stroke ? (it.sw ?? 1) : undefined, dashed: it.dash ? 1 : undefined, dashPattern: it.dash, opacity, html: 1 }), it);
        break;
      case "icon": {
        const d = MONO_PATHS[it.name];
        if (!d) break;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${it.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
        v("", st({ shape: "image", image: "data:image/svg+xml," + Buffer.from(svg, "utf8").toString("base64"), imageAspect: 0, connectable: 0 }), { x: it.x, y: it.y, w: it.size, h: it.size });
        break;
      }
      case "circle":
        v("", st({ ellipse: "", fillColor: col(it.fill), strokeColor: col(it.stroke), strokeWidth: it.sw, opacity }), { x: it.cx - it.r, y: it.cy - it.r, w: it.r * 2, h: it.r * 2 });
        break;
      case "poly": {
        const xs = it.points.map((p) => p.x);
        const ys = it.points.map((p) => p.y);
        const r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        const shape = it.drawio === "rhombus" ? { rhombus: "" } : it.drawio === "triangle" ? { triangle: "" } : it.drawio === "hexagon" ? { shape: "hexagon", perimeter: "hexagonPerimeter2", size: 0.2 } : it.drawio === "note" ? { shape: "note", size: 10 } : { shape: "card" };
        v("", st({ ...shape, fillColor: col(it.fill), strokeColor: col(it.stroke), strokeWidth: it.sw, opacity }), r);
        break;
      }
      case "text": {
        const spec: FontSpec = { font: it.font ?? "mono", size: it.size, weight: it.weight, tracking: it.tracking };
        const w = measureText(it.text, spec) + 6;
        const x = it.anchor === "middle" ? it.x - w / 2 : it.anchor === "end" ? it.x - w : it.x - 3;
        v(it.text, st({ text: "", html: 0, align: it.anchor === "middle" ? "center" : it.anchor === "end" ? "right" : "left", verticalAlign: "middle", spacing: 0, fontFamily: it.font === "sans" ? "Inter" : "JetBrains Mono", fontSize: it.size, fontStyle: it.weight && it.weight >= 600 ? 1 : 0, fontColor: it.color, opacity }), { x, y: it.y - it.size * 0.95, w, h: it.size * 1.3 });
        break;
      }
      case "line": {
        const n = it.points.length;
        if (n < 2) break;
        const way = it.points.slice(1, -1).map((p) => `<mxPoint x="${rd(p.x)}" y="${rd(p.y)}"/>`).join("");
        const sty = st({
          edgeStyle: "none",
          rounded: it.radius === 0 ? 0 : 1,
          html: 1,
          strokeColor: it.color,
          strokeWidth: it.sw ?? 1.6,
          dashed: it.dash ? 1 : 0,
          dashPattern: it.dash,
          endArrow: DRAWIO_MARK[it.end ?? "none"],
          endFill: it.end === "arrow" ? 1 : 0,
          endSize: it.end && it.end !== "arrow" && it.end !== "open" ? 12 : 7,
          startArrow: DRAWIO_MARK[it.start ?? "none"],
          startFill: it.start === "arrow" ? 1 : 0,
          startSize: it.start && it.start !== "arrow" && it.start !== "open" ? 12 : 7,
          opacity,
        });
        cells.push(`<mxCell id="s${++k}" value="" style="${xmlEsc(sty)}" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${rd(it.points[0].x)}" y="${rd(it.points[0].y)}" as="sourcePoint"/><mxPoint x="${rd(it.points[n - 1].x)}" y="${rd(it.points[n - 1].y)}" as="targetPoint"/>${way ? `<Array as="points">${way}</Array>` : ""}</mxGeometry></mxCell>`);
        break;
      }
    }
  }
  return chrome.replace("      </root>", `        ${cells.join("\n        ")}\n      </root>`);
}

// ── QA ─────────────────────────────────────────────────────────────────────
export function textBox(it: SText): Rect {
  const spec: FontSpec = { font: it.font ?? "mono", size: it.size, weight: it.weight, tracking: it.tracking };
  const w = measureText(it.text, spec);
  const x = it.anchor === "middle" ? it.x - w / 2 : it.anchor === "end" ? it.x - w : it.x;
  return { x, y: it.y - it.size * 0.78, w, h: it.size * 1.0 };
}

const hit = (a: Rect, b: Rect, gap = 0) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

function segThrough(a: Point, b: Point, r: Rect, shrink = 2): boolean {
  const q = { x: r.x + shrink, y: r.y + shrink, w: r.w - 2 * shrink, h: r.h - 2 * shrink };
  if (q.w <= 0 || q.h <= 0) return false;
  const x1 = Math.min(a.x, b.x);
  const x2 = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y, b.y);
  return x1 < q.x + q.w && x2 > q.x && y1 < q.y + q.h && y2 > q.y;
}

export function runSceneQa(s: Scene, opts: { aspect?: [number, number] } = {}): QaIssue[] {
  const issues: QaIssue[] = [];
  const add = (severity: QaIssue["severity"], code: string, message: string, ids?: string[]) => issues.push({ severity, code, message, ids });
  const canvas: Rect = { x: 0, y: 0, w: s.width, h: s.height };
  const texts = s.items.filter((i): i is SText => i.kind === "text");
  const cards = s.items.filter((i): i is SRect | SPoly => (i.kind === "rect" || i.kind === "poly") && !!i.card);
  const boxOf = (c: SRect | SPoly): Rect => {
    if (c.kind === "rect") return c;
    const xs = c.points.map((p) => p.x);
    const ys = c.points.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  const inside = (r: Rect) => r.x >= canvas.x + 2 && r.y >= canvas.y + 2 && r.x + r.w <= canvas.w - 2 && r.y + r.h <= canvas.h - 2;
  for (const t of texts) {
    const b = textBox(t);
    if (!inside(b)) add("error", "out-of-bounds", `text "${t.text}" is outside the canvas`, t.id ? [t.id] : undefined);
    if (t.maxW != null && b.w > t.maxW + 1) add("error", "text-overflow", `text "${t.text}" (${Math.round(b.w)}px) exceeds its room (${Math.round(t.maxW)}px)`, t.id ? [t.id] : undefined);
    if (t.text.endsWith("…")) add("warning", "text-truncated", `text "${t.text}" was truncated — shorten it`);
  }
  for (const c of cards) if (!inside(boxOf(c))) add("error", "out-of-bounds", `shape ${c.id ?? ""} is outside the canvas`);
  // label collisions
  const solid = texts.filter((t) => t.solid !== false);
  const boxes = solid.map(textBox);
  for (let i = 0; i < solid.length; i++)
    for (let j = i + 1; j < solid.length; j++) {
      if (solid[i].group && solid[i].group === solid[j].group) continue;
      if (hit(boxes[i], boxes[j], 1)) add("error", "label-collision", `labels "${solid[i].text}" and "${solid[j].text}" overlap`);
    }
  // cards overlapping
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++) {
      if (cards[i].group && cards[i].group === cards[j].group) continue;
      if (hit(boxOf(cards[i]), boxOf(cards[j]), -1)) add("error", "card-overlap", `shapes ${cards[i].id ?? i} and ${cards[j].id ?? j} overlap`);
    }
  // routed lines through cards
  for (const l of s.items) {
    if (l.kind !== "line" || !l.route) continue;
    for (let i = 0; i + 1 < l.points.length; i++)
      for (const c of cards) {
        if (c.id && l.route.ends.includes(c.id)) continue;
        if (segThrough(l.points[i], l.points[i + 1], boxOf(c))) add("error", "edge-through-card", `line ${l.id ?? ""} passes through ${c.id ?? "a shape"}`, l.id ? [l.id] : undefined);
      }
  }
  const aspect = s.width / s.height;
  const [amin, amax] = opts.aspect ?? [1.3, 2.3];
  if (aspect < amin || aspect > amax) add("warning", "canvas-aspect", `canvas aspect ${aspect.toFixed(2)} is outside ${amin}–${amax} (poster too ${aspect > amax ? "wide" : "tall"})`);
  const minFont = Math.min(12, ...texts.filter((t) => !t.tracking && t.solid !== false).map((t) => t.size));
  const eff = minFont * Math.min(1, 1600 / s.width);
  if (eff < 9) add("warning", "readability", `smallest text renders at ${eff.toFixed(1)}px when viewed 1600px wide — split or wrap`);
  else if (eff < 10) add("info", "readability", `smallest text renders at ${eff.toFixed(1)}px when viewed 1600px wide`);
  const seen = new Set<string>();
  return issues.filter((i) => (seen.has(i.code + i.message) ? false : (seen.add(i.code + i.message), true)));
}

export function paintOf(color: string, alpha?: number): Paint {
  return { color, alpha };
}
export type { ArchTheme };

/** Cocoon card: opaque base + tinted body, optional icon box, label (+ subtitle). */
export function sceneCard(o: { id?: string; x: number; y: number; w: number; h: number; color: string; t: ArchTheme; icon?: MonoIcon; label: string; sub?: string; dashed?: boolean; group?: string; rx?: number }): SItem[] {
  const { x, y, w, h, color, t } = o;
  const rx = o.rx ?? 8;
  const items: SItem[] = [
    { kind: "rect", x, y, w, h, rx, fill: { color: t.cardBase } },
    { kind: "rect", id: o.id, x, y, w, h, rx, fill: { color, alpha: t.fillAlpha }, stroke: { color }, sw: 1.3, glow: true, card: true, dash: o.dashed ? "4 3" : undefined, group: o.group },
  ];
  let tx = x + 14;
  if (o.icon && o.icon !== "none") {
    const ib = 30;
    const iy = y + (h - ib) / 2;
    items.push({ kind: "rect", x: x + 10, y: iy, w: ib, h: ib, rx: 7, fill: { color, alpha: t.id === "dark" ? 0.16 : 0.1 }, stroke: { color, alpha: 0.45 } });
    items.push({ kind: "icon", name: o.icon, x: x + 10 + 6, y: iy + 6, size: 18, color });
    tx = x + 10 + ib + 10;
  }
  const room = x + w - tx - 10;
  const cy = y + h / 2;
  if (o.sub) {
    items.push({ kind: "text", x: tx, y: cy - 2, text: o.label, size: 14, weight: 600, color: t.ink, maxW: room, group: o.group });
    items.push({ kind: "text", x: tx, y: cy + 15, text: o.sub, size: 12, color: t.muted, maxW: room, group: o.group });
  } else items.push({ kind: "text", x: tx, y: cy + 5, text: o.label, size: 14, weight: 600, color: t.ink, maxW: room, group: o.group });
  return items;
}
