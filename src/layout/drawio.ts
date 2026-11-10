/**
 * draw.io (mxGraph XML) backend for the architecture model.
 * Same positions as the SVG: tiers → containers (nested parents, relative
 * geometry), cards → rounded cells with an embedded monoline icon, edges →
 * orthogonalEdgeStyle with explicit exit/entry anchors and waypoints.
 * Open the .drawio file in diagrams.net / VS Code draw.io and keep editing.
 */
import { MONO_PATHS } from "./icons.js";
import { CARD_PAD_X, ICON_BOX, tierLabelText } from "./grid.js";
import { archTheme, rgba, tierAccent, type ArchTheme } from "./theme.js";
import { BADGE_R, type LayoutResult, type PlacedNode, type Point, type Rect, type RoutedEdge } from "./types.js";

function xmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "&#xa;");
}
function htmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Composite a color at alpha over an opaque base → hex (draw.io has no stacked fills). */
function blend(hex: string, alpha: number, base: string): string {
  const p = (h: string) => {
    const n = parseInt(h.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = p(hex);
  const b = p(base);
  const c = a.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

function style(obj: Record<string, string | number | undefined>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => (v === "" ? k : `${k}=${v}`))
    .join(";") + ";";
}

function iconDataUri(icon: keyof typeof MONO_PATHS, color: string, t: ArchTheme): string {
  const d = MONO_PATHS[icon];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"><rect x="0.5" y="0.5" width="33" height="33" rx="7" fill="${rgba(color, t.id === "dark" ? 0.16 : 0.1)}" stroke="${rgba(color, 0.45)}"/><g transform="translate(7 7) scale(0.8333)" fill="none" stroke="${color}" stroke-width="2.04" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></g></svg>`;
  // draw.io style values cannot contain ';' → base64 without the ';base64' marker
  return "data:image/svg+xml," + Buffer.from(svg, "utf8").toString("base64");
}

interface Cell {
  xml: string;
}

export function renderArchitectureDrawio(layout: LayoutResult, themeId?: string): string {
  const t = archTheme(themeId);
  const cells: Cell[] = [];
  const mono = "JetBrains Mono";
  let seq = 0;
  const nid = (p: string) => `${p}-${++seq}`;
  const tierCell = new Map<string, { id: string; rect: Rect }>();
  const nodeCell = new Map<string, { id: string; rect: Rect }>();

  const vertex = (id: string, value: string, st: string, r: Rect, parent = "1", parentRect?: Rect) => {
    const x = parentRect ? r.x - parentRect.x : r.x;
    const y = parentRect ? r.y - parentRect.y : r.y;
    cells.push({
      xml: `<mxCell id="${id}" value="${xmlEsc(value)}" style="${xmlEsc(st)}" vertex="1" parent="${parent}"><mxGeometry x="${round(x)}" y="${round(y)}" width="${round(r.w)}" height="${round(r.h)}" as="geometry"/></mxCell>`,
    });
  };

  // Title + subtitle
  const tr = layout.titleRect;
  if (layout.title) {
    vertex("title", layout.title, style({ text: "", html: 1, align: "left", verticalAlign: "top", fontFamily: mono, fontSize: 26, fontStyle: 1, fontColor: t.ink, spacing: 0 }), { x: tr.x + 26, y: tr.y, w: tr.w - 26, h: 36 });
  }
  if (layout.subtitle) {
    vertex("subtitle", layout.subtitle, style({ text: "", html: 1, align: "left", verticalAlign: "top", fontFamily: mono, fontSize: 13, fontColor: t.muted, spacing: 0 }), { x: tr.x + 26, y: tr.y + 40, w: tr.w - 26, h: 20 });
  }
  vertex("title-dot", "", style({ ellipse: "", fillColor: rgbaToHex(t.titleDot), strokeColor: "none" }), { x: tr.x + 2.5, y: tr.y + 14.5, w: 9, h: 9 });

  // Panel
  const c = layout.content;
  vertex("panel", "", style({ rounded: 1, arcSize: 16, absoluteArcSize: 1, fillColor: t.id === "dark" ? "#0a1124" : "#ffffff", strokeColor: t.id === "dark" ? "#1e293b" : "#e2e8f0", movable: 0, editable: 1 }), c);

  // Tiers (parents before children)
  const tiers = [...layout.tiers].sort((a, b) => a.depth - b.depth);
  for (const tier of tiers) {
    const accent = tierAccent(t, tier.kind, tier.accentRole, tier.external);
    const id = `tier-${safe(tier.id)}`;
    const parent = tier.parentId ? tierCell.get(tier.parentId) : undefined;
    const base = t.id === "dark" ? "#0a1124" : "#ffffff";
    const fill = tier.depth === 0 ? blend(t.id === "dark" ? "#0f172a" : "#f1f5f9", 0.6, base) : blend(accent, 0.05, parent ? blend("#0f172a", 0.6, base) : base);
    vertex(
      id,
      tierLabelText(tier.label, tier.index),
      style({
        rounded: 1,
        arcSize: tier.depth ? 10 : 12,
        absoluteArcSize: 1,
        container: 1,
        collapsible: 0,
        recursiveResize: 0,
        html: 1,
        whiteSpace: "wrap",
        fillColor: fill,
        strokeColor: blend(accent, 0.55, base),
        strokeWidth: 1.1,
        dashed: tier.external ? 0 : 1,
        dashPattern: tier.kind === "region" ? "10 5" : "5 5",
        verticalAlign: "top",
        align: "left",
        spacingLeft: 28,
        spacingTop: 4,
        fontFamily: mono,
        fontSize: 11,
        fontStyle: 1,
        fontColor: accent,
      }),
      tier.rect,
      parent?.id ?? "1",
      parent?.rect,
    );
    tierCell.set(tier.id, { id, rect: tier.rect });
    const lr = tier.labelRect;
    vertex(nid("tdot"), "", style({ ellipse: "", fillColor: accent, strokeColor: "none", movable: 0, connectable: 0 }), { x: lr.x + 2, y: lr.y + lr.h / 2 - 3, w: 6, h: 6 }, id, tier.rect);
  }

  // Nodes
  for (const n of layout.nodes) {
    const parent = n.tierId ? tierCell.get(n.tierId) : undefined;
    const color = t.roles[n.role] ?? t.roles.default;
    const id = `node-${safe(n.id)}`;
    const hasIcon = n.icon !== "none";
    const sub = (txt?: string) => (txt ? `<br><font style="font-size:11px" color="${t.muted}">${htmlEsc(txt)}</font>` : "");
    const value = `<b>${htmlEsc(n.rawLabel)}</b>${sub(n.rawSubtitle)}${sub(n.detail?.text)}`;
    vertex(
      id,
      value,
      style({
        rounded: 1,
        arcSize: 8,
        absoluteArcSize: 1,
        whiteSpace: "wrap",
        html: 1,
        fillColor: blend(color, t.fillAlpha, t.cardBase),
        strokeColor: color,
        strokeWidth: 1.3,
        dashed: n.stub ? 1 : 0,
        opacity: n.stub ? 62 : undefined,
        textOpacity: n.stub ? 70 : undefined,
        fontFamily: mono,
        fontSize: 13,
        fontColor: t.ink,
        align: "left",
        verticalAlign: "middle",
        spacingLeft: hasIcon ? CARD_PAD_X + ICON_BOX + 8 : 12,
        shadow: 0,
      }),
      n.rect,
      parent?.id ?? "1",
      parent?.rect,
    );
    nodeCell.set(n.id, { id, rect: n.rect });
    if (hasIcon) {
      vertex(
        `${id}-icon`,
        "",
        style({ shape: "image", image: iconDataUri(n.icon, color, t), imageAspect: 0, aspect: "fixed", connectable: 0, movable: 0, resizable: 0, editable: 0 }),
        { x: n.rect.x + CARD_PAD_X, y: n.rect.y + (n.rect.h - ICON_BOX) / 2, w: ICON_BOX, h: ICON_BOX },
        id,
        n.rect,
      );
    }
  }

  // Edges
  for (const e of layout.edges) {
    const src = nodeCell.get(e.from) ?? tierCell.get(e.from);
    const dst = nodeCell.get(e.to) ?? tierCell.get(e.to);
    if (!src || !dst) continue;
    const color = t.edges[e.kind] ?? t.edges.default;
    const p0 = e.points[0];
    const pn = e.points[e.points.length - 1];
    const rel = (p: Point, r: Rect) => ({ x: clamp01((p.x - r.x) / r.w), y: clamp01((p.y - r.y) / r.h) });
    const ex = rel(p0, src.rect);
    const en = rel(pn, dst.rect);
    const st = style({
      edgeStyle: "orthogonalEdgeStyle",
      rounded: 1,
      orthogonalLoop: 1,
      jettySize: "auto",
      html: 1,
      strokeColor: color,
      strokeWidth: 1.6,
      endArrow: "block",
      endFill: 1,
      endSize: 6,
      startArrow: "none",
      dashed: e.kind === "async" || e.kind === "auth" ? 1 : 0,
      dashPattern: e.kind === "async" ? "7 5" : e.kind === "auth" ? "2 4" : undefined,
      exitX: round3(ex.x),
      exitY: round3(ex.y),
      exitDx: 0,
      exitDy: 0,
      exitPerimeter: 0,
      entryX: round3(en.x),
      entryY: round3(en.y),
      entryDx: 0,
      entryDy: 0,
      entryPerimeter: 0,
      fontFamily: mono,
      fontSize: 12,
      fontColor: t.ink,
      labelBackgroundColor: t.pillFill,
      labelBorderColor: color,
      spacing: 4,
    });
    const way = e.points.slice(1, -1).map((p) => `<mxPoint x="${round(p.x)}" y="${round(p.y)}"/>`).join("");
    let labelGeo = "";
    let offset = "";
    if (e.label && e.labelRect) {
      // relative position along the polyline (-1..1) + offset for pills beside the line
      const L = pathLen(e.points);
      const bw = e.badgeInLabel ? BADGE_R * 2 + 2 : 0;
      const cx = { x: e.labelRect.x + bw + (e.labelRect.w - bw) / 2, y: e.labelRect.y + e.labelRect.h / 2 };
      const d = distAlong(e.points, cx);
      const q = nearestOn(e.points, cx);
      labelGeo = ` x="${round3((d / L) * 2 - 1)}" y="0"`;
      if (Math.hypot(cx.x - q.x, cx.y - q.y) > 0.5) offset = `<mxPoint x="${round(cx.x - q.x)}" y="${round(cx.y - q.y)}" as="offset"/>`;
    }
    cells.push({
      xml: `<mxCell id="edge-${e.id}" value="${xmlEsc(e.label ?? "")}" style="${xmlEsc(st)}" edge="1" parent="1" source="${src.id}" target="${dst.id}"><mxGeometry relative="1"${labelGeo} as="geometry">${way ? `<Array as="points">${way}</Array>` : ""}${offset}</mxGeometry></mxCell>`,
    });
  }

  // Step badges on the canvas
  const badgeStyle = style({ ellipse: "", whiteSpace: "wrap", html: 1, fillColor: t.badgeFill, strokeColor: t.canvas, strokeWidth: 2, fontColor: t.badgeInk, fontStyle: 1, fontFamily: mono, fontSize: 12, connectable: 0 });
  for (const e of layout.edges) {
    if (e.step == null || !e.badgeAt) continue;
    vertex(`badge-${e.id}`, String(e.step), badgeStyle, { x: e.badgeAt.x - BADGE_R, y: e.badgeAt.y - BADGE_R, w: BADGE_R * 2, h: BADGE_R * 2 });
  }

  // Pinned step badges + trunk junctions
  for (const a of layout.anchors) {
    vertex(nid("anchor"), String(a.n), badgeStyle, { x: a.at.x - BADGE_R, y: a.at.y - BADGE_R, w: BADGE_R * 2, h: BADGE_R * 2 });
  }
  for (const j of layout.junctions) {
    const c = t.edges[j.kind] ?? t.edges.default;
    vertex(nid("junction"), "", style({ ellipse: "", fillColor: c, strokeColor: t.canvas, strokeWidth: 1.5, connectable: 0 }), { x: j.at.x - 3.6, y: j.at.y - 3.6, w: 7.2, h: 7.2 });
  }

  // Steps panel
  if (layout.stepsPosition !== "none") {
    const s = layout.sidebar;
    if (layout.stepsPosition === "right") {
      vertex("steps-panel", "", style({ rounded: 1, arcSize: 14, absoluteArcSize: 1, fillColor: t.id === "dark" ? "#0a1124" : "#ffffff", strokeColor: t.id === "dark" ? "#1e293b" : "#e2e8f0" }), s);
    }
    vertex("steps-head", "WALKTHROUGH", style({ text: "", html: 1, align: "left", verticalAlign: "middle", fontFamily: mono, fontSize: 11, fontStyle: 1, fontColor: t.dim }), { x: s.x + (layout.stepsPosition === "right" ? 32 : 16), y: s.y + (layout.stepsPosition === "right" ? 17 : 5), w: 200, h: 18 });
    for (const sc of layout.stepCards) {
      const right = layout.stepsPosition === "right";
      if (!right) vertex(nid("stepcard"), "", style({ rounded: 1, arcSize: 12, absoluteArcSize: 1, fillColor: t.id === "dark" ? "#0a1124" : "#ffffff", strokeColor: t.id === "dark" ? "#1e293b" : "#e2e8f0" }), sc.rect);
      const bx = right ? sc.rect.x + 12 : sc.rect.x + 26;
      const by = right ? sc.rect.y + 12 : sc.rect.y + 24;
      vertex(nid("stepbadge"), String(sc.n), badgeStyle, { x: bx - BADGE_R, y: by - BADGE_R, w: BADGE_R * 2, h: BADGE_R * 2 });
      const tx = right ? sc.rect.x + 34 : sc.rect.x + 48;
      const body = `<b style="font-family:${mono};font-size:12.5px;color:${t.ink}">${htmlEsc(sc.label.text)}</b>` + (sc.lines.length ? `<br><span style="font-family:Inter;font-size:12px;color:${t.muted}">${sc.lines.map(htmlEsc).join(" ")}</span>` : "");
      vertex(nid("steptext"), body, style({ text: "", html: 1, whiteSpace: "wrap", align: "left", verticalAlign: "top", spacing: 0, fontColor: t.ink }), { x: tx, y: by - 9, w: sc.rect.x + sc.rect.w - tx - 8, h: sc.rect.h - 6 });
    }
  }
  // Legend
  if (layout.legend.length) {
    const r = layout.legendRect;
    const items = layout.legend
      .map((it) => {
        const col = it.kind ? (t.edges[it.kind] ?? t.edges.default) : (t.roles[it.role ?? "default"] ?? t.roles.default);
        const swatch = it.kind ? (it.kind === "async" ? "╌╌╌▶" : it.kind === "auth" ? "┈┈┈▶" : "━━━▶") : "■";
        return `<font color="${col}">${swatch}</font>&nbsp;&nbsp;<font color="${t.muted}">${htmlEsc(it.label)}</font>`;
      })
      .join(layout.stepsPosition === "right" ? "<br>" : "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;");
    vertex("legend", `<font color="${t.dim}"><b>LEGEND</b></font>${layout.stepsPosition === "right" ? "<br>" : "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"}${items}`, style({ text: "", html: 1, whiteSpace: "wrap", align: "left", verticalAlign: "top", fontFamily: mono, fontSize: 11, spacing: 2 }), r);
  }

  const W = layout.width;
  const H = layout.height;
  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="diagram-mcp" agent="diagram-mcp" version="24.0.0" type="device">
  <diagram id="architecture" name="${xmlEsc(layout.title ?? "Architecture")}">
    <mxGraphModel dx="${W}" dy="${H}" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${W}" pageHeight="${H}" background="${t.canvas}" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        ${cells.map((c) => c.xml).join("\n        ")}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;
}

function safe(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "_");
}
function round(v: number): number {
  return Math.round(v * 10) / 10;
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
function rgbaToHex(c: string): string {
  return c;
}
function pathLen(pts: Point[]): number {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y);
  return L || 1;
}
function nearestOn(pts: Point[], p: Point): Point {
  let best = { q: pts[0], err: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const q = { x: Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), p.x)), y: Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), p.y)) };
    const err = Math.hypot(p.x - q.x, p.y - q.y);
    if (err < best.err) best = { q, err };
  }
  return best.q;
}

function distAlong(pts: Point[], p: Point): number {
  let acc = 0;
  let best = { d: 0, err: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const L = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const x = Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), p.x));
    const y = Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), p.y));
    const err = Math.hypot(p.x - x, p.y - y);
    if (err < best.err) best = { d: acc + Math.abs(x - a.x) + Math.abs(y - a.y), err };
    acc += L;
  }
  return best.d;
}
void (null as unknown as RoutedEdge | PlacedNode);
