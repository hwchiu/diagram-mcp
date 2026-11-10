/**
 * Hand-designed SVG architecture renderer — dark-tech default, light variant.
 */
import { getTheme, type ThemePalette } from "../design/themes.js";
import { MONO_PATHS, type MonoIcon } from "./icons.js";
import type { LayoutResult, PlacedNode, Point, RoutedEdge } from "./types.js";
import { edgeLabelSize } from "./routing.js";

export interface ArchTheme {
  canvas: string;
  ink: string;
  muted: string;
  card: string;
  cardBorder: string;
  tierFill: string;
  tierStroke: string;
  accent: string;
  sync: string;
  async: string;
  data: string;
  sidebar: string;
  sidebarBorder: string;
  badge: string;
  glow: string;
  gridDot: string;
  mono: string;
  sans: string;
  tech: boolean;
}

export function archThemeFrom(themeId?: string): ArchTheme {
  const id = themeId ?? "dark";
  const base = getTheme(id);
  if (id === "light" || id === "presentation") {
    return {
      canvas: id === "presentation" ? "#FFFFFF" : "#F7F8FA",
      ink: "#0F172A",
      muted: "#64748B",
      card: "#FFFFFF",
      cardBorder: "#E2E8F0",
      tierFill: "rgba(148,163,184,0.08)",
      tierStroke: "#94A3B8",
      accent: "#2563EB",
      sync: "#334155",
      async: "#7C3AED",
      data: "#059669",
      sidebar: "#FFFFFF",
      sidebarBorder: "#E2E8F0",
      badge: "#0F172A",
      glow: "transparent",
      gridDot: "rgba(15,23,42,0.06)",
      mono: "ui-monospace, JetBrains Mono, SF Mono, Menlo, monospace",
      sans: "Inter, SF Pro Text, system-ui, sans-serif",
      tech: false,
    };
  }
  // dark / blueprint → dark tech
  return {
    canvas: "#0B1020",
    ink: "#E8EEF9",
    muted: "#8B9BB8",
    card: "rgba(255,255,255,0.06)",
    cardBorder: "rgba(94,234,212,0.35)",
    tierFill: "rgba(56,189,248,0.04)",
    tierStroke: "rgba(56,189,248,0.45)",
    accent: "#22D3EE",
    sync: "#22D3EE",
    async: "#A78BFA",
    data: "#34D399",
    sidebar: "rgba(15,23,42,0.85)",
    sidebarBorder: "rgba(148,163,184,0.25)",
    badge: "#22D3EE",
    glow: "rgba(34,211,238,0.15)",
    gridDot: "rgba(148,163,184,0.12)",
    mono: "ui-monospace, JetBrains Mono, SF Mono, Menlo, monospace",
    sans: "Inter, Geist, SF Pro Text, system-ui, sans-serif",
    tech: true,
  };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function roleAccent(role: string | undefined, t: ArchTheme): string {
  switch (role) {
    case "network":
      return t.tech ? "#38BDF8" : "#0284C7";
    case "security":
      return t.tech ? "#F472B6" : "#DC2626";
    case "gateway":
      return t.tech ? "#FB923C" : "#EA580C";
    case "compute":
      return t.tech ? "#22D3EE" : "#2563EB";
    case "data":
      return t.tech ? "#34D399" : "#059669";
    case "queue":
      return t.tech ? "#A78BFA" : "#7C3AED";
    case "storage":
      return t.tech ? "#FBBF24" : "#D97706";
    case "observability":
      return t.tech ? "#F472B6" : "#DB2777";
    case "external":
      return t.tech ? "#94A3B8" : "#64748B";
    default:
      return t.accent;
  }
}

function edgeColor(kind: string | undefined, t: ArchTheme): string {
  if (kind === "async") return t.async;
  if (kind === "data") return t.data;
  return t.sync;
}

function iconMarkup(name: MonoIcon, color: string, size = 28): string {
  const d = MONO_PATHS[name];
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

function pathD(pts: Point[], radius = 8): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const dx1 = cur.x - prev.x;
    const dy1 = cur.y - prev.y;
    const dx2 = next.x - cur.x;
    const dy2 = next.y - cur.y;
    const len1 = Math.hypot(dx1, dy1) || 1;
    const len2 = Math.hypot(dx2, dy2) || 1;
    const r = Math.min(radius, len1 / 2, len2 / 2);
    const ax = cur.x - (dx1 / len1) * r;
    const ay = cur.y - (dy1 / len1) * r;
    const bx = cur.x + (dx2 / len2) * r;
    const by = cur.y + (dy2 / len2) * r;
    d += ` L ${ax} ${ay} Q ${cur.x} ${cur.y} ${bx} ${by}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function renderCard(n: PlacedNode, t: ArchTheme): string {
  const { x, y, w, h } = n.rect;
  const accent = roleAccent(n.role, t);
  const r = n.compact ? 8 : 12;
  const glow = t.tech
    ? `filter:url(#nodeGlow);`
    : `filter:url(#cardShadow);`;
  const iconSize = n.compact ? 0 : 28;
  const iconY = y + 16;
  const titleY = n.compact ? y + h / 2 + 5 : y + 58;
  const subY = titleY + 18;
  const icon = n.compact
    ? ""
    : `<g transform="translate(${x + w / 2 - iconSize / 2}, ${iconY})">${iconMarkup(n.icon, accent, iconSize)}</g>`;
  const sub = n.subtitle && !n.compact
    ? `<text x="${x + w / 2}" y="${subY}" text-anchor="middle" fill="${t.muted}" font-family="${t.mono}" font-size="11">${esc(n.subtitle)}</text>`
    : "";
  return `
  <g class="card" data-id="${esc(n.id)}">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}"
      fill="${t.card}" stroke="${accent}" stroke-width="1" style="${glow}"/>
    ${icon}
    <text x="${x + w / 2}" y="${titleY}" text-anchor="middle" fill="${t.ink}"
      font-family="${t.sans}" font-size="15" font-weight="600">${esc(n.label)}</text>
    ${sub}
  </g>`;
}

function renderTier(tier: LayoutResult["tiers"][0], t: ArchTheme): string {
  const { x, y, w, h } = tier.rect;
  const idx = String(tier.index).padStart(2, "0");
  const label = tier.label.toUpperCase();
  const stroke = tier.external ? (t.tech ? "#FBBF24" : "#94A3B8") : t.tierStroke;
  const fill = tier.external ? (t.tech ? "rgba(251,191,36,0.06)" : "rgba(148,163,184,0.1)") : t.tierFill;
  // HUD corner brackets for tech theme
  const brackets = t.tech
    ? `
    <path d="M ${x + 8} ${y + 18} L ${x + 8} ${y + 8} L ${x + 18} ${y + 8}" fill="none" stroke="${stroke}" stroke-width="1.5"/>
    <path d="M ${x + w - 8} ${y + 18} L ${x + w - 8} ${y + 8} L ${x + w - 18} ${y + 8}" fill="none" stroke="${stroke}" stroke-width="1.5"/>
    <path d="M ${x + 8} ${y + h - 18} L ${x + 8} ${y + h - 8} L ${x + 18} ${y + h - 8}" fill="none" stroke="${stroke}" stroke-width="1.5"/>
    <path d="M ${x + w - 8} ${y + h - 18} L ${x + w - 8} ${y + h - 8} L ${x + w - 18} ${y + h - 8}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`
    : "";
  return `
  <g class="tier" data-id="${esc(tier.id)}">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" ry="10"
      fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-dasharray="${tier.external ? "0" : "5 4"}"/>
    ${brackets}
    <text x="${x + 16}" y="${y + 22}" fill="${t.muted}" font-family="${t.mono}" font-size="12"
      letter-spacing="0.12em" font-weight="500">${idx} / ${esc(label)}</text>
  </g>`;
}

function renderEdge(e: RoutedEdge, t: ArchTheme, markerId: string, annotations = false): string {
  const color = edgeColor(e.kind, t);
  const dash = e.kind === "async" ? ' stroke-dasharray="6 4"' : "";
  const d = pathD(e.points, 10);
  if (!annotations) {
    return `
  <g class="edge">
    <path class="edge-halo" d="${d}" fill="none" stroke="${t.canvas}" stroke-width="5.5"
      stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"${dash}
      marker-end="url(#${markerId})"/>
  </g>`;
  }
  // Prefer step badge over duplicating the number inside the pill when both exist
  let label = "";
  if (e.label) {
    const text = e.label;
    const { w: tw, h: th } = edgeLabelSize(text);
    const lx = e.labelAt.x - tw / 2;
    const ly = e.labelAt.y - th / 2;
    label = `
    <rect x="${lx}" y="${ly}" width="${tw}" height="${th}" rx="11" ry="11"
      fill="${t.tech ? "#0B1020" : "#FFFFFF"}" stroke="${color}" stroke-width="1" opacity="0.95"/>
    <text x="${e.labelAt.x}" y="${e.labelAt.y + 5}" text-anchor="middle" fill="${t.ink}"
      font-family="${t.sans}" font-size="12" font-weight="600">${esc(text)}</text>`;
  }
  let badge = "";
  if (e.step != null && e.badgeAt) {
    const bx = e.badgeAt.x;
    const by = e.badgeAt.y;
    badge = `
    <circle cx="${bx}" cy="${by}" r="12" fill="${t.badge}" stroke="${t.tech ? "#ECFEFF" : "#FFFFFF"}" stroke-width="2"
      style="${t.tech ? "filter:url(#badgeGlow)" : ""}"/>
    <text x="${bx}" y="${by + 5}" text-anchor="middle" fill="#FFFFFF"
      font-family="${t.sans}" font-size="13" font-weight="700">${e.step}</text>`;
  } else if (e.step != null && !e.label) {
    // Fall back: pill with step number only
    const text = String(e.step);
    const tw = 28;
    const th = 22;
    const lx = e.labelAt.x - tw / 2;
    const ly = e.labelAt.y - th / 2;
    label = `
    <rect x="${lx}" y="${ly}" width="${tw}" height="${th}" rx="11" ry="11"
      fill="${t.badge}" stroke="${t.tech ? "#ECFEFF" : "#FFFFFF"}" stroke-width="1"/>
    <text x="${e.labelAt.x}" y="${e.labelAt.y + 5}" text-anchor="middle" fill="#FFFFFF"
      font-family="${t.sans}" font-size="12" font-weight="700">${esc(text)}</text>`;
  }
  if (!label && !badge) return "";
  return `<g class="edge-annotations">${label}${badge}
  </g>`;
}

function renderSidebar(layout: LayoutResult, t: ArchTheme): string {
  const { sidebar, steps, legend } = layout;
  const { x, y, w } = sidebar;
  let cy = y + 28;
  let html = `
  <g class="sidebar">
    <rect x="${x}" y="${y}" width="${w}" height="${sidebar.h}" rx="12" ry="12"
      fill="${t.sidebar}" stroke="${t.sidebarBorder}" stroke-width="1"/>
    <text x="${x + 20}" y="${cy}" fill="${t.ink}" font-family="${t.sans}" font-size="16" font-weight="700">Steps</text>`;
  cy += 28;
  for (const s of steps) {
    html += `
    <circle cx="${x + 28}" cy="${cy + 4}" r="12" fill="${t.badge}" stroke="${t.tech ? "#ECFEFF" : "#FFFFFF"}" stroke-width="1.5"/>
    <text x="${x + 28}" y="${cy + 9}" text-anchor="middle" fill="#FFFFFF"
      font-family="${t.sans}" font-size="13" font-weight="700">${s.n}</text>
    <text x="${x + 50}" y="${cy}" fill="${t.ink}" font-family="${t.sans}" font-size="14" font-weight="700">${esc(s.label)}</text>`;
    if (s.description) {
      // wrap roughly
      const words = s.description.split(/\s+/);
      let line = "";
      let ly = cy + 18;
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (next.length > 34) {
          html += `<text x="${x + 50}" y="${ly}" fill="${t.muted}" font-family="${t.sans}" font-size="12">${esc(line)}</text>`;
          ly += 16;
          line = word;
        } else line = next;
      }
      if (line) {
        html += `<text x="${x + 50}" y="${ly}" fill="${t.muted}" font-family="${t.sans}" font-size="12">${esc(line)}</text>`;
        cy = ly + 28;
      } else cy += 40;
    } else {
      cy += 36;
    }
  }

  // Legend at bottom of sidebar
  const legY = Math.max(cy + 16, y + sidebar.h - legend.length * 28 - 36);
  html += `<text x="${x + 20}" y="${legY}" fill="${t.ink}" font-family="${t.sans}" font-size="13" font-weight="700">Legend</text>`;
  legend.forEach((item, i) => {
    const iy = legY + 22 + i * 26;
    const color =
      item.kind === "async" ? t.async : item.kind === "data" ? t.data : item.kind ? t.sync : t.muted;
    const dash = item.kind === "async" ? 'stroke-dasharray="4 3"' : "";
    html += `
    <line x1="${x + 20}" y1="${iy}" x2="${x + 48}" y2="${iy}" stroke="${color}" stroke-width="2" ${dash}/>
    <text x="${x + 56}" y="${iy + 4}" fill="${t.muted}" font-family="${t.sans}" font-size="12">${esc(item.label)}</text>`;
  });
  html += `</g>`;
  return html;
}

export function renderArchitectureSvg(layout: LayoutResult, themeId?: string): string {
  const t = archThemeFrom(themeId);
  const { width, height } = layout;

  const markers = `
  <marker id="arrow-sync" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L6,3 L0,6 Z" fill="${t.sync}"/>
  </marker>
  <marker id="arrow-async" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L6,3 L0,6 Z" fill="${t.async}"/>
  </marker>
  <marker id="arrow-data" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L6,3 L0,6 Z" fill="${t.data}"/>
  </marker>`;

  const defs = `
  <defs>
    ${markers}
    <pattern id="dotGrid" width="20" height="20" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="0.8" fill="${t.gridDot}"/>
    </pattern>
    <radialGradient id="tierGlow" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="${t.glow}"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0F172A" flood-opacity="0.12"/>
    </filter>
    <filter id="nodeGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${t.accent}" flood-opacity="0.35"/>
    </filter>
    <filter id="badgeGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="${t.badge}" flood-opacity="0.7"/>
    </filter>
    <style type="text/css"><![CDATA[
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
      text { font-family: ${t.sans}; }
    ]]></style>
  </defs>`;

  const title = layout.title
    ? `<text x="${layout.titleRect.x}" y="${layout.titleRect.y + 28}" fill="${t.ink}"
        font-family="${t.sans}" font-size="30" font-weight="700">${esc(layout.title)}</text>`
    : "";
  const subtitle = layout.subtitle
    ? `<text x="${layout.titleRect.x}" y="${layout.titleRect.y + 52}" fill="${t.muted}"
        font-family="${t.sans}" font-size="14">${esc(layout.subtitle)}</text>`
    : "";

  const tiers = layout.tiers.map((tier) => renderTier(tier, t)).join("\n");
  const cards = layout.nodes.map((n) => renderCard(n, t)).join("\n");
  const edges = layout.edges
    .map((e) => {
      const mid =
        e.kind === "async" ? "arrow-async" : e.kind === "data" ? "arrow-data" : "arrow-sync";
      return renderEdge(e, t, mid);
    })
    .join("\n");
  const annotations = layout.edges.map((e) => renderEdge(e, t, "", true)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <desc>Orthogonal architecture diagram. Line crossings are not connections; arrows identify endpoints.</desc>
  <metadata id="routing-quality">${esc(JSON.stringify(layout.routing))}</metadata>
  ${defs}
  <rect width="100%" height="100%" fill="${t.canvas}"/>
  <rect width="100%" height="100%" fill="url(#dotGrid)"/>
  <rect x="${layout.content.x - 10}" y="${layout.content.y - 10}" width="${layout.content.w + 20}" height="${layout.content.h + 20}"
    fill="url(#tierGlow)" rx="16"/>
  ${title}
  ${subtitle}
  ${tiers}
  ${edges}
  ${cards}
  ${annotations}
  ${renderSidebar(layout, t)}
</svg>`;
}

/** Expose theme palette bridge for pipeline compatibility */
export function themeCanvas(themeId?: string): string {
  return archThemeFrom(themeId).canvas;
}

void getTheme;
type _Keep = ThemePalette;
void (0 as unknown as _Keep);
