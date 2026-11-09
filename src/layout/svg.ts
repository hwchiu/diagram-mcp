/**
 * Architecture SVG renderer — Cocoon-style dark tech (default) + light variant.
 * Layer order (pkt-lab/svg-diagram): defs → background → containers → nodes → connections → annotations.
 * GitHub-safe: no foreignObject, no scripts, no external references.
 */
import { MONO_PATHS } from "./icons.js";
import { CARD_TEXT_X, FONTS, ICON_BOX, CARD_PAD_X, tierLabelText } from "./grid.js";
import { archTheme, rgba, tierAccent, type ArchTheme } from "./theme.js";
import { measureText } from "./text.js";
import { BADGE_R, type LayoutResult, type PlacedNode, type PlacedTier, type Point, type RoutedEdge } from "./types.js";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function pathD(pts: Point[], radius = 10): string {
  if (pts.length < 2) return "";
  let d = `M ${r1(pts[0].x)} ${r1(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const l1 = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
    const l2 = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
    const r = Math.min(radius, l1 / 2, l2 / 2);
    const ax = cur.x - ((cur.x - prev.x) / l1) * r;
    const ay = cur.y - ((cur.y - prev.y) / l1) * r;
    const bx = cur.x + ((next.x - cur.x) / l2) * r;
    const by = cur.y + ((next.y - cur.y) / l2) * r;
    d += ` L ${r1(ax)} ${r1(ay)} Q ${r1(cur.x)} ${r1(cur.y)} ${r1(bx)} ${r1(by)}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L ${r1(last.x)} ${r1(last.y)}`;
}

function edgeDash(kind: string): string {
  if (kind === "async") return ' stroke-dasharray="7 5"';
  if (kind === "auth") return ' stroke-dasharray="2 4"';
  return "";
}

function renderTier(tier: PlacedTier, t: ArchTheme): string {
  const { x, y, w, h } = tier.rect;
  const accent = tierAccent(t, tier.kind, tier.accentRole, tier.external);
  const nested = tier.depth > 0;
  const dash = tier.external ? "" : tier.kind === "region" ? ' stroke-dasharray="10 5"' : ' stroke-dasharray="5 5"';
  const fill = nested ? rgba(accent, t.id === "dark" ? 0.045 : 0.05) : t.frameFill;
  const stroke = rgba(accent, nested ? 0.5 : 0.55);
  const text = tierLabelText(tier.label, tier.index);
  const L = 12;
  const brackets = nested
    ? ""
    : [
        `M ${x} ${y + L} V ${y + 4} Q ${x} ${y} ${x + 4} ${y} H ${x + L}`,
        `M ${x + w - L} ${y} H ${x + w - 4} Q ${x + w} ${y} ${x + w} ${y + 4} V ${y + L}`,
        `M ${x} ${y + h - L} V ${y + h - 4} Q ${x} ${y + h} ${x + 4} ${y + h} H ${x + L}`,
        `M ${x + w - L} ${y + h} H ${x + w - 4} Q ${x + w} ${y + h} ${x + w} ${y + h - 4} V ${y + h - L}`,
      ]
        .map((d) => `<path d="${d}" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round"/>`)
        .join("");
  const lr = tier.labelRect;
  return `<g class="tier" id="tier-${esc(tier.id)}" data-depth="${tier.depth}">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${nested ? 10 : 12}" fill="${fill}" stroke="${stroke}" stroke-width="1.1"${dash}/>
  ${brackets}
  <circle cx="${lr.x + 5}" cy="${lr.y + lr.h / 2}" r="3" fill="${accent}"/>
  <text x="${lr.x + 14}" y="${lr.y + 12}" fill="${accent}" font-family="${t.mono}" font-size="${FONTS.tierLabel.size}" font-weight="600" letter-spacing="${FONTS.tierLabel.tracking}em">${esc(text)}</text>
</g>`;
}

function iconMarkup(name: keyof typeof MONO_PATHS, color: string, x: number, y: number, size: number): string {
  const d = MONO_PATHS[name];
  if (!d) return "";
  const s = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${r1(s * 1000) / 1000})" fill="none" stroke="${color}" stroke-width="${r1(1.7 / s * 100) / 100}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></g>`;
}

function renderCard(n: PlacedNode, t: ArchTheme): string {
  const { x, y, w, h } = n.rect;
  const c = t.roles[n.role] ?? t.roles.default;
  const hasIcon = n.icon !== "none";
  const tx = hasIcon ? x + CARD_TEXT_X : x + 16;
  const ly = n.subtitle ? y + 27 : y + h / 2 + 5;
  const glow = t.glow ? ` filter="url(#glow)"` : ` filter="url(#shadow)"`;
  const ib = ICON_BOX;
  const ix = x + CARD_PAD_X;
  const iy = y + (h - ib) / 2;
  return `<g class="node" id="node-${esc(n.id)}" data-role="${n.role}">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${t.cardBase}"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${rgba(c, t.fillAlpha)}" stroke="${c}" stroke-width="1.3"${glow}/>
  ${
    hasIcon
      ? `<rect x="${ix}" y="${iy}" width="${ib}" height="${ib}" rx="7" fill="${rgba(c, t.id === "dark" ? 0.16 : 0.1)}" stroke="${rgba(c, 0.45)}" stroke-width="1"/>
  ${iconMarkup(n.icon, c, ix + (ib - 20) / 2, iy + (ib - 20) / 2, 20)}`
      : ""
  }
  <text x="${tx}" y="${ly}" fill="${t.ink}" font-family="${t.mono}" font-size="${FONTS.cardLabel.size}" font-weight="600">${esc(n.label.text)}</text>
  ${n.subtitle ? `<text x="${tx}" y="${y + 44}" fill="${t.muted}" font-family="${t.mono}" font-size="${FONTS.cardSub.size}">${esc(n.subtitle.text)}</text>` : ""}
</g>`;
}

function renderEdge(e: RoutedEdge, t: ArchTheme): string {
  const color = t.edges[e.kind] ?? t.edges.default;
  const d = pathD(e.points, 10);
  const under = t.glow
    ? `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="0.16" stroke-width="5" stroke-linejoin="round"/>`
    : "";
  return `<g class="edge" id="edge-${e.id}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" data-kind="${e.kind}">
  ${under}<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"${edgeDash(e.kind)} marker-end="url(#arrow-${e.kind})"/>
</g>`;
}

function renderAnnotations(e: RoutedEdge, t: ArchTheme): string {
  const color = t.edges[e.kind] ?? t.edges.default;
  let out = "";
  if (e.label && e.labelRect) {
    const r = e.labelRect;
    out += `<g class="edge-label" data-edge="${e.id}">
  <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${r.h / 2}" fill="${t.pillFill}" stroke="${color}" stroke-width="1"/>
  <text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 3.6}" text-anchor="middle" fill="${t.ink}" font-family="${t.mono}" font-size="${FONTS.edgeLabel.size}" font-weight="500">${esc(e.label)}</text>
</g>`;
  }
  if (e.step != null && e.badgeAt) out += badge(e.badgeAt.x, e.badgeAt.y, e.step, t, `data-edge="${e.id}"`);
  return out;
}

function badge(cx: number, cy: number, n: number, t: ArchTheme, attrs = ""): string {
  const ring = t.glow ? `<circle cx="${cx}" cy="${cy}" r="${BADGE_R + 4}" fill="${rgba(t.badgeFill, 0.18)}"/>` : "";
  return `<g class="badge" ${attrs}>${ring}<circle cx="${cx}" cy="${cy}" r="${BADGE_R}" fill="${t.badgeFill}" stroke="${t.canvas}" stroke-width="2"/>
  <text x="${cx}" y="${cy + 4.2}" text-anchor="middle" fill="${t.badgeInk}" font-family="${t.mono}" font-size="12" font-weight="700">${n}</text></g>`;
}

function legendSwatch(item: LayoutResult["legend"][0], x: number, y: number, t: ArchTheme): string {
  if (item.kind) {
    const c = t.edges[item.kind] ?? t.edges.default;
    return `<line x1="${x}" y1="${y}" x2="${x + 26}" y2="${y}" stroke="${c}" stroke-width="2"${edgeDash(item.kind)}/><path d="M ${x + 22} ${y - 4} L ${x + 28} ${y} L ${x + 22} ${y + 4} z" fill="${c}"/>`;
  }
  const c = t.roles[item.role ?? "default"] ?? t.roles.default;
  return `<rect x="${x + 4}" y="${y - 7}" width="18" height="14" rx="3" fill="${rgba(c, 0.2)}" stroke="${c}" stroke-width="1.2"/>`;
}

function renderLegend(layout: LayoutResult, t: ArchTheme, vertical: boolean): string {
  const r = layout.legendRect;
  if (!layout.legend.length) return "";
  let out = `<g class="legend">`;
  if (vertical) {
    out += `<text x="${r.x + 4}" y="${r.y + 14}" fill="${t.dim}" font-family="${t.mono}" font-size="${FONTS.panelHead.size}" font-weight="600" letter-spacing="0.16em">LEGEND</text>`;
    layout.legend.forEach((it, i) => {
      const y = r.y + 38 + i * 22;
      out += legendSwatch(it, r.x + 6, y, t);
      out += `<text x="${r.x + 46}" y="${y + 4}" fill="${t.muted}" font-family="${t.mono}" font-size="${FONTS.legend.size}">${esc(it.label)}</text>`;
    });
  } else {
    let x = r.x + 4;
    const y = r.y + r.h / 2;
    out += `<text x="${x}" y="${y + 4}" fill="${t.dim}" font-family="${t.mono}" font-size="${FONTS.panelHead.size}" font-weight="600" letter-spacing="0.16em">LEGEND</text>`;
    x += 90;
    for (const it of layout.legend) {
      out += legendSwatch(it, x, y, t);
      out += `<text x="${x + 38}" y="${y + 4}" fill="${t.muted}" font-family="${t.mono}" font-size="${FONTS.legend.size}">${esc(it.label)}</text>`;
      x += 38 + measureText(it.label, FONTS.legend) + 32;
    }
  }
  return out + `</g>`;
}

function renderSteps(layout: LayoutResult, t: ArchTheme): string {
  if (layout.stepsPosition === "none") return renderLegend(layout, t, false);
  const s = layout.sidebar;
  let out = `<g class="steps">`;
  if (layout.stepsPosition === "right") {
    out += `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="14" fill="${t.panel}" stroke="${t.panelStroke}"/>
  <circle cx="${s.x + 22}" cy="${s.y + 25}" r="3" fill="${t.badgeFill}"/>
  <text x="${s.x + 32}" y="${s.y + 29}" fill="${t.dim}" font-family="${t.mono}" font-size="${FONTS.panelHead.size}" font-weight="600" letter-spacing="0.16em">WALKTHROUGH</text>`;
    layout.stepCards.forEach((c, i) => {
      const bx = c.rect.x + 12;
      const by = c.rect.y + 12;
      out += badge(bx, by, c.n, t);
      out += `<text x="${c.rect.x + 34}" y="${c.rect.y + 16.5}" fill="${t.ink}" font-family="${t.mono}" font-size="${FONTS.stepTitle.size}" font-weight="600">${esc(c.label.text)}</text>`;
      c.lines.forEach((ln, k) => {
        out += `<text x="${c.rect.x + 34}" y="${c.rect.y + 36 + k * 17}" fill="${t.muted}" font-family="${t.sans}" font-size="${FONTS.stepBody.size}">${esc(ln)}</text>`;
      });
      if (i < layout.stepCards.length - 1) {
        out += `<line x1="${bx}" y1="${by + BADGE_R + 4}" x2="${bx}" y2="${c.rect.y + c.rect.h - 4}" stroke="${rgba(t.badgeFill, 0.35)}" stroke-width="1" stroke-dasharray="2 3"/>`;
      }
    });
    out += renderLegend(layout, t, true);
  } else {
    out += `<circle cx="${s.x + 6}" cy="${s.y + 13}" r="3" fill="${t.badgeFill}"/>
  <text x="${s.x + 16}" y="${s.y + 17}" fill="${t.dim}" font-family="${t.mono}" font-size="${FONTS.panelHead.size}" font-weight="600" letter-spacing="0.16em">WALKTHROUGH</text>`;
    for (const c of layout.stepCards) {
      out += `<rect x="${c.rect.x}" y="${c.rect.y}" width="${c.rect.w}" height="${c.rect.h}" rx="12" fill="${t.panel}" stroke="${t.panelStroke}"/>`;
      out += badge(c.rect.x + 26, c.rect.y + 24, c.n, t);
      out += `<text x="${c.rect.x + 48}" y="${c.rect.y + 28.5}" fill="${t.ink}" font-family="${t.mono}" font-size="${FONTS.stepTitle.size}" font-weight="600">${esc(c.label.text)}</text>`;
      c.lines.forEach((ln, k) => {
        out += `<text x="${c.rect.x + 48}" y="${c.rect.y + 48 + k * 17}" fill="${t.muted}" font-family="${t.sans}" font-size="${FONTS.stepBody.size}">${esc(ln)}</text>`;
      });
    }
    out += renderLegend(layout, t, false);
  }
  return out + `</g>`;
}

export function renderArchitectureSvg(layout: LayoutResult, themeId?: string): string {
  const t = archTheme(themeId);
  const { width, height } = layout;
  const markers = (Object.keys(t.edges) as Array<keyof typeof t.edges>)
    .map(
      (k) =>
        `<marker id="arrow-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 0.5 L 10 5 L 0 9.5 z" fill="${t.edges[k]}"/></marker>`,
    )
    .join("\n    ");
  const defs = `<defs>
    ${markers}
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="${t.gridLine}" stroke-width="0.5"/></pattern>
    <radialGradient id="vignette" cx="50%" cy="35%" r="75%"><stop offset="0%" stop-color="${t.id === "dark" ? "#0f2a44" : "#ffffff"}" stop-opacity="${t.id === "dark" ? 0.35 : 0}"/><stop offset="100%" stop-color="${t.canvas}" stop-opacity="0"/></radialGradient>
    <filter id="glow" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="0"/><feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#38bdf8" flood-opacity="0.10"/></filter>
    <filter id="shadow" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="1.5" stdDeviation="2.5" flood-color="#0f172a" flood-opacity="0.10"/></filter>
  </defs>`;

  const tr = layout.titleRect;
  const titleW = layout.title ? measureText(layout.title, FONTS.title) : 0;
  const meta = `${layout.nodes.length} COMPONENTS · ${layout.edges.length} FLOWS`;
  const metaW = measureText(meta, { font: "mono", size: 11, tracking: 0.12 });
  const header = `<g class="title">
  <circle cx="${tr.x + 7}" cy="${tr.y + 19}" r="9" fill="${rgba(t.titleDot, 0.18)}"/>
  <circle cx="${tr.x + 7}" cy="${tr.y + 19}" r="4.5" fill="${t.titleDot}"/>
  ${layout.title ? `<text x="${tr.x + 26}" y="${tr.y + 28}" fill="${t.ink}" font-family="${t.mono}" font-size="${FONTS.title.size}" font-weight="700">${esc(layout.title)}</text>` : ""}
  ${layout.subtitle ? `<text x="${tr.x + 26}" y="${tr.y + 54}" fill="${t.muted}" font-family="${t.mono}" font-size="${FONTS.subtitle.size}">${esc(layout.subtitle)}</text>` : ""}
  ${titleW + metaW + 80 < tr.w ? `<text x="${tr.x + tr.w}" y="${tr.y + 26}" text-anchor="end" fill="${t.dim}" font-family="${t.mono}" font-size="11" letter-spacing="0.12em">${meta}</text>` : ""}
</g>`;
  const c = layout.content;
  const panel = `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="16" fill="${t.panel}" stroke="${t.panelStroke}"/>`;
  const footer = `<g class="footer"><line x1="${tr.x}" y1="${layout.footerY}" x2="${tr.x + tr.w}" y2="${layout.footerY}" stroke="${t.panelStroke}"/>
  <text x="${tr.x}" y="${layout.footerY + 20}" fill="${t.dim}" font-family="${t.mono}" font-size="10" letter-spacing="0.08em">${esc((layout.title ?? "Architecture").toUpperCase())} · REFERENCE ARCHITECTURE</text>
  <text x="${tr.x + tr.w}" y="${layout.footerY + 20}" text-anchor="end" fill="${t.dim}" font-family="${t.mono}" font-size="10" letter-spacing="0.08em">DIAGRAM-MCP</text></g>`;

  const tiers = [...layout.tiers].sort((a, b) => a.depth - b.depth).map((x) => renderTier(x, t)).join("\n");
  const nodes = layout.nodes.map((n) => renderCard(n, t)).join("\n");
  const edges = layout.edges.map((e) => renderEdge(e, t)).join("\n");
  const ann = layout.edges.map((e) => renderAnnotations(e, t)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${t.mono}">
  ${defs}
  <g id="background"><rect width="${width}" height="${height}" fill="${t.canvas}"/><rect width="${width}" height="${height}" fill="url(#grid)"/><rect width="${width}" height="${height}" fill="url(#vignette)"/></g>
  ${header}
  <g id="containers">${panel}
  ${tiers}</g>
  <g id="nodes">${nodes}</g>
  <g id="connections">${edges}</g>
  <g id="labels">${ann}</g>
  ${renderSteps(layout, t)}
  ${footer}
</svg>`;
}

export function themeCanvas(themeId?: string): string {
  return archTheme(themeId).canvas;
}
