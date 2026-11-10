/**
 * Architecture SVG renderer — Cocoon-style dark tech (default) + light variant.
 * Layer order (pkt-lab/svg-diagram): defs → background → containers → nodes → connections → annotations.
 * GitHub-safe: no foreignObject, no scripts, no external references.
 */
import { MONO_PATHS } from "./icons.js";
import { CARD_TEXT_X, FONTS, ICON_BOX, CARD_PAD_X, tierLabelText } from "./grid.js";
import { archTheme, rgba, tierAccent, type ArchTheme } from "./theme.js";
import { measureText } from "./text.js";
import { tagSuffix } from "./notation.js";
import { legendFlow } from "./legend.js";
import { SHAPE_FONTS, TABLE_HEAD, TABLE_ROW } from "./shapes.js";
import { BADGE_R, type LayoutResult, type PlacedNode, type PlacedTier, type Point, type RoutedEdge } from "./types.js";
import type { EdgeMark } from "../types.js";

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
  if (tier.laneHeader) return renderLane(tier, t, accent);
  const trust = tier.kind === "trust";
  const dash = trust
    ? ' stroke-dasharray="9 5"'
    : tier.external || tier.kind === "pool" || tier.kind === "subnet"
      ? ""
      : tier.kind === "region" || tier.kind === "boundary"
        ? ' stroke-dasharray="10 5"'
        : ' stroke-dasharray="5 5"';
  const fill = trust ? rgba(accent, 0.035) : nested ? rgba(accent, t.id === "dark" ? 0.045 : 0.05) : t.frameFill;
  const stroke = trust ? rgba(accent, 0.85) : rgba(accent, nested ? 0.5 : 0.55);
  const sw = trust ? 1.6 : tier.kind === "boundary" ? 1.4 : 1.1;
  const text = tierLabelText(tier.label, tier.index);
  const L = 12;
  const brackets = nested || trust
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
  const marker = trust
    ? `<g transform="translate(${lr.x - 1} ${lr.y + lr.h / 2 - 6}) scale(0.5)" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="${MONO_PATHS.lock}"/></g>`
    : `<circle cx="${lr.x + 5}" cy="${lr.y + lr.h / 2}" r="3" fill="${accent}"/>`;
  const chip = tier.tag && tier.tagRect ? tagChip(tier.tag, tier.tagRect.x, tier.tagRect.y, accent, t, "start") : "";
  return `<g class="tier${tier.stub ? " stub" : ""}" id="tier-${esc(tier.id)}" data-depth="${tier.depth}" data-kind="${tier.kind ?? ""}"${tier.stub ? ' opacity="0.7"' : ""}>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${trust ? 14 : nested ? 10 : 12}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>
  ${brackets}
  ${marker}
  <text x="${lr.x + 14}" y="${lr.y + 12}" fill="${accent}" font-family="${t.mono}" font-size="${FONTS.tierLabel.size}" font-weight="600" letter-spacing="${FONTS.tierLabel.tracking}em">${esc(text)}</text>
  ${chip}
</g>`;
}

/** Swimlane band: full-width row, header cell on the left with the role name. */
function renderLane(tier: PlacedTier, t: ArchTheme, accent: string): string {
  const { x, y, w, h } = tier.rect;
  const hd = tier.laneHeader!;
  const odd = Number(tier.index.replace(/\D/g, "")) % 2 === 1;
  const lines = (tier as PlacedTier & { headerLines?: string[] }).headerLines ?? [tier.label];
  const ty = hd.y + hd.h / 2 - ((lines.length - 1) * 19) / 2 + 5;
  return `<g class="tier lane" id="tier-${esc(tier.id)}" data-kind="lane">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${rgba(accent, odd ? 0.05 : 0.025)}" stroke="${rgba(accent, 0.38)}" stroke-width="1"/>
  <rect x="${hd.x}" y="${hd.y}" width="${hd.w}" height="${hd.h}" fill="${rgba(accent, 0.12)}" stroke="${rgba(accent, 0.5)}" stroke-width="1"/>
  <rect x="${hd.x}" y="${hd.y}" width="3" height="${hd.h}" fill="${accent}"/>
  <text x="${hd.x + 16}" y="${hd.y + 20}" fill="${rgba(accent, 0.9)}" font-family="${t.mono}" font-size="10.5" font-weight="600" letter-spacing="0.16em">LANE ${esc(tier.index)}</text>
  ${lines.map((l, i) => `<text x="${hd.x + hd.w / 2 + 2}" y="${r1(ty + i * 19 + 6)}" text-anchor="middle" fill="${t.ink}" font-family="${t.mono}" font-size="14" font-weight="700">${esc(l)}</text>`).join("")}
  ${tier.tag ? `<text x="${hd.x + hd.w / 2 + 2}" y="${r1(ty + lines.length * 19 + 8)}" text-anchor="middle" fill="${t.muted}" font-family="${t.mono}" font-size="11">${esc(tier.tag)}</text>` : ""}
</g>`;
}

function iconMarkup(name: keyof typeof MONO_PATHS, color: string, x: number, y: number, size: number): string {
  const d = MONO_PATHS[name];
  if (!d) return "";
  const s = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${r1(s * 1000) / 1000})" fill="none" stroke="${color}" stroke-width="${r1(1.7 / s * 100) / 100}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></g>`;
}

interface TLine {
  text: string;
  size: number;
  weight: number;
  fill: string;
  family: string;
  step: number;
}

/** Card text block: label lines, subtitle / detail, wrapped description. */
function textLines(n: PlacedNode, t: ArchTheme): TLine[] {
  const big = n.shape === "system";
  const ls = n.stub ? 13 : big ? 16 : FONTS.cardLabel.size;
  const out: TLine[] = [{ text: n.label.text, size: ls, weight: big ? 700 : 600, fill: t.ink, family: t.mono, step: 0 }];
  if (n.label2) out.push({ text: n.label2.text, size: ls, weight: big ? 700 : 600, fill: t.ink, family: t.mono, step: 18 });
  for (const sub of [n.subtitle, n.detail]) if (sub) out.push({ text: sub.text, size: FONTS.cardSub.size, weight: 400, fill: t.muted, family: t.mono, step: 17 });
  (n.desc ?? []).forEach((d, i) => out.push({ text: d, size: 12, weight: 400, fill: t.id === "dark" ? "#a5b4c8" : "#475569", family: t.sans, step: i === 0 ? 24 : 16 }));
  return out;
}

function drawText(lines: TLine[], x: number, top: number, bottom: number, anchor: "start" | "middle"): string {
  const H = 14 + lines.reduce((s, l) => s + l.step, 0);
  let y = top + (bottom - top - H) / 2 + 12;
  return lines
    .map((l) => {
      y += l.step;
      return `<text x="${r1(x)}" y="${r1(y)}"${anchor === "middle" ? ' text-anchor="middle"' : ""} fill="${l.fill}" font-family="${l.family}" font-size="${l.size}"${l.weight !== 400 ? ` font-weight="${l.weight}"` : ""}>${esc(l.text)}</text>`;
    })
    .join("\n  ");
}

function tagChip(text: string, x: number, y: number, color: string, t: ArchTheme, anchor: "end" | "start" | "middle" = "end"): string {
  const w = measureText(text, SHAPE_FONTS.tag) + 12;
  const x0 = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
  return `<g class="tag"><rect x="${r1(x0)}" y="${r1(y)}" width="${r1(w)}" height="15" rx="4" fill="${rgba(color, 0.14)}" stroke="${rgba(color, 0.5)}" stroke-width="0.8"/><text x="${r1(x0 + w / 2)}" y="${r1(y + 11)}" text-anchor="middle" fill="${color}" font-family="${t.mono}" font-size="10" font-weight="600" letter-spacing="0.06em">${esc(text)}</text></g>`;
}

function renderCard(n: PlacedNode, t: ArchTheme): string {
  let { x, y, w, h } = n.rect;
  const c = t.roles[n.role] ?? t.roles.default;
  const shape = n.shape ?? "rounded";
  const glow = n.stub ? "" : t.glow ? ` filter="url(#glow)"` : ` filter="url(#shadow)"`;
  const op = n.stub ? ` opacity="0.62"` : n.dim ? ` opacity="0.36"` : "";
  const dash = n.stub ? ` stroke-dasharray="4 3"` : "";
  const fill = rgba(c, n.stub ? 0.06 : t.fillAlpha);
  const parts: string[] = [];
  // replica stack: two offset shadow cards behind the front card
  if (n.replicas && n.replicas > 1 && !n.stub) {
    const k = 8;
    for (const off of [k, k / 2]) {
      parts.push(`<rect x="${x + off}" y="${y + k - off}" width="${w - k}" height="${h - k}" rx="8" fill="${t.cardBase}" stroke="${rgba(c, 0.35 + (k - off) * 0.04)}" stroke-width="1"/>`);
    }
    y += k;
    w -= k;
    h -= k;
    parts.push(tagChip(`×${n.replicas}`, x + w - 6, y + h - 21, c, t));
  }
  if (n.emphasis) {
    const ec = n.emphasis === "changed" ? t.alert : n.emphasis === "impacted" ? t.roles.storage : t.badgeFill;
    const k = 5;
    parts.push(`<rect x="${x - k}" y="${y - k}" width="${w + 2 * k}" height="${h + 2 * k}" rx="12" fill="${rgba(ec, 0.06)}" stroke="${ec}" stroke-width="${n.emphasis === "changed" ? 1.8 : 1.2}"${n.emphasis === "changed" ? "" : ' stroke-dasharray="5 3"'} opacity="0.9"/>`);
  }
  const body = (inner: string) => `<g class="node${n.stub ? " stub" : ""}${n.dim ? " dim" : ""}" id="node-${esc(n.id)}" data-role="${n.role}" data-shape="${shape}"${op}>
  ${parts.join("\n  ")}${inner}
</g>`;
  const top = n.top ?? 0;
  const lines = textLines(n, t);
  const iconBox = (bx: number, by: number, ib: number) =>
    `<rect x="${bx}" y="${by}" width="${ib}" height="${ib}" rx="7" fill="${rgba(c, t.id === "dark" ? 0.16 : 0.1)}" stroke="${rgba(c, 0.45)}" stroke-width="1"/>
  ${iconMarkup(n.icon, c, bx + (ib - (n.stub ? 16 : 20)) / 2, by + (ib - (n.stub ? 16 : 20)) / 2, n.stub ? 16 : 20)}`;
  const base = (rx: number | string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${t.cardBase}"/>`;
  const cx = x + w / 2;
  switch (shape) {
    case "person": {
      const hr = 17;
      const bodyY = y + 30;
      return body(`<circle cx="${cx}" cy="${y + hr + 1}" r="${hr}" fill="${t.cardBase}"/><circle cx="${cx}" cy="${y + hr + 1}" r="${hr}" fill="${rgba(c, 0.22)}" stroke="${c}" stroke-width="1.4"${glow}/>
  <rect x="${x}" y="${bodyY}" width="${w}" height="${h - 30}" rx="22" fill="${t.cardBase}"/>
  <rect x="${x}" y="${bodyY}" width="${w}" height="${h - 30}" rx="22" fill="${fill}" stroke="${c}" stroke-width="1.4"${dash}${glow}/>
  <circle cx="${cx}" cy="${y + hr + 1}" r="${hr - 0.7}" fill="${rgba(c, 0.22)}"/>
  ${drawText(lines, cx, bodyY + 4, y + h - 2, "middle")}`);
    }
    case "system": {
      return body(`${base(10)}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${rgba(c, 0.2)}" stroke="${c}" stroke-width="2"${glow}/>
  <rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="7" fill="none" stroke="${rgba(c, 0.35)}" stroke-width="0.8"/>
  ${iconMarkup(n.icon, c, x + 12, y + 12, 18)}
  ${drawText(lines, cx, y + top, y + h, "middle")}`);
    }
    case "decision": {
      const d = `M ${cx} ${y} L ${x + w} ${y + h / 2} L ${cx} ${y + h} L ${x} ${y + h / 2} Z`;
      return body(`<path d="${d}" fill="${t.cardBase}"/><path d="${d}" fill="${rgba(c, 0.16)}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"${glow}/>
  ${drawText(lines, cx, y, y + h, "middle")}`);
    }
    case "terminator":
      return body(`${base(h / 2)}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${rgba(c, 0.2)}" stroke="${c}" stroke-width="1.5"${glow}/>
  ${drawText(lines, cx, y, y + h, "middle")}`);
    case "process": {
      const head = n.tag ? 22 : 0;
      return body(`${base(14)}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${c}" stroke-width="1.5"${dash}${glow}/>
  ${n.tag ? `<line x1="${x}" y1="${y + head}" x2="${x + w}" y2="${y + head}" stroke="${rgba(c, 0.5)}" stroke-width="1"/><text x="${cx}" y="${y + 15}" text-anchor="middle" fill="${c}" font-family="${t.mono}" font-size="10.5" font-weight="700" letter-spacing="0.08em">${esc(n.tag)}</text>` : ""}
  ${drawText(lines, cx, y + head, y + h, "middle")}`);
    }
    case "state": {
      const lab = lines.filter((l) => l.family === t.mono && l.weight !== 400);
      const subs = lines.filter((l) => l.family === t.mono && l.weight === 400);
      const desc = n.desc ?? [];
      const head = desc.length ? 20 + lab.length * 18 + subs.length * 17 : h;
      const tagged = n.tag ? tagChip(n.tag, x + w - 8, y + 6, c, t) : "";
      return body(`${base(16)}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${fill}" stroke="${c}" stroke-width="1.5"${dash}${glow}/>
  ${tagged}
  ${drawText([...lab, ...subs], cx, y, y + head, "middle")}
  ${desc.length ? `<line x1="${x}" y1="${y + head}" x2="${x + w}" y2="${y + head}" stroke="${rgba(c, 0.45)}" stroke-width="1"/>` + desc.map((d, i) => `<text x="${x + 14}" y="${r1(y + head + 18 + i * 16)}" fill="${t.id === "dark" ? "#a5b4c8" : "#475569"}" font-family="${t.sans}" font-size="12">${esc(d)}</text>`).join("") : ""}`);
    }
    case "initial":
      return body(`<circle cx="${cx}" cy="${y + h / 2}" r="${w / 2}" fill="${rgba(c, 0.18)}"/><circle cx="${cx}" cy="${y + h / 2}" r="${w / 2 - 5}" fill="${c}"${glow}/>`);
    case "final":
      return body(`<circle cx="${cx}" cy="${y + h / 2}" r="${w / 2 - 1}" fill="${t.cardBase}" stroke="${c}" stroke-width="1.8"${glow}/><circle cx="${cx}" cy="${y + h / 2}" r="${w / 2 - 7}" fill="${c}"/>`);
    case "choice": {
      const d = `M ${cx} ${y} L ${x + w} ${y + h / 2} L ${cx} ${y + h} L ${x} ${y + h / 2} Z`;
      return body(`<path d="${d}" fill="${t.cardBase}"/><path d="${d}" fill="${rgba(c, 0.2)}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"${glow}/>`);
    }
    case "io": {
      const k = 16;
      const d = `M ${x + k} ${y} H ${x + w} L ${x + w - k} ${y + h} H ${x} Z`;
      return body(`<path d="${d}" fill="${t.cardBase}"/><path d="${d}" fill="${fill}" stroke="${c}" stroke-width="1.4" stroke-linejoin="round"${glow}/>
  ${drawText(lines, cx, y, y + h, "middle")}`);
    }
    case "subprocess":
      return body(`${base(4)}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${c}" stroke-width="1.4"${glow}/>
  <line x1="${x + 11}" y1="${y}" x2="${x + 11}" y2="${y + h}" stroke="${c}" stroke-width="1.1"/><line x1="${x + w - 11}" y1="${y}" x2="${x + w - 11}" y2="${y + h}" stroke="${c}" stroke-width="1.1"/>
  ${drawText(lines, cx, y, y + h, "middle")}`);
    case "document": {
      const wv = 8;
      const d = `M ${x} ${y + 4} Q ${x} ${y} ${x + 4} ${y} H ${x + w - 4} Q ${x + w} ${y} ${x + w} ${y + 4} V ${y + h - wv} C ${x + w * 0.75} ${y + h - wv * 2.2} ${x + w * 0.5} ${y + h + wv * 0.6} ${x + w * 0.25} ${y + h - wv * 0.4} S ${x} ${y + h - wv * 1.2} ${x} ${y + h - wv} Z`;
      return body(`<path d="${d}" fill="${t.cardBase}"/><path d="${d}" fill="${fill}" stroke="${c}" stroke-width="1.4"${glow}/>
  ${drawText(lines, cx, y, y + h - wv, "middle")}`);
    }
    case "table":
      return body(renderTable(n, t, c, glow));
    case "entity":
      return body(`${base(2)}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${fill}" stroke="${c}" stroke-width="1.6"${dash}${glow}/>
  <rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" rx="1" fill="none" stroke="${rgba(c, 0.55)}" stroke-width="0.9"/>
  ${drawText(lines, cx, y, y + h, "middle")}`);
    case "datastore": {
      const idw = 44;
      return body(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${t.cardBase}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${glow}/>
  <path d="M ${x + w} ${y} H ${x} V ${y + h} H ${x + w}" fill="none" stroke="${c}" stroke-width="1.6"/>
  <line x1="${x + idw}" y1="${y}" x2="${x + idw}" y2="${y + h}" stroke="${c}" stroke-width="1.2"/>
  <text x="${x + idw / 2}" y="${y + h / 2 + 4}" text-anchor="middle" fill="${c}" font-family="${t.mono}" font-size="12" font-weight="700">${esc(n.tag ?? "D")}</text>
  ${drawText(lines, x + idw + 12, y, y + h, "start")}`);
    }
    case "interface": {
      const ly = y + h / 2;
      return body(`${base(h / 2)}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="${c}" stroke-width="1.3"${dash}${glow}/>
  <circle cx="${x + 20}" cy="${ly}" r="7" fill="${t.cardBase}" stroke="${c}" stroke-width="1.8"/><line x1="${x + 27}" y1="${ly}" x2="${x + 34}" y2="${ly}" stroke="${c}" stroke-width="1.8"/>
  ${drawText(lines, x + 40, y, y + h, "start")}`);
    }
    default: {
      const hasIcon = n.icon !== "none";
      const tx = hasIcon ? x + CARD_TEXT_X : x + 16;
      const ib = n.stub ? 26 : ICON_BOX;
      const ix = x + CARD_PAD_X;
      const iy = y + top + (h - top - ib) / 2;
      let outline = `${base(8)}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${c}" stroke-width="1.3"${dash}${glow}/>`;
      if (shape === "cylinder") {
        const ry = 7;
        const d = `M ${x} ${y + ry} A ${w / 2} ${ry} 0 0 1 ${x + w} ${y + ry} V ${y + h - ry} A ${w / 2} ${ry} 0 0 1 ${x} ${y + h - ry} Z`;
        outline = `<path d="${d}" fill="${t.cardBase}"/><path d="${d}" fill="${fill}" stroke="${c}" stroke-width="1.3"${glow}/><path d="M ${x} ${y + ry} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + ry}" fill="none" stroke="${c}" stroke-width="1.1"/>`;
      }
      let extra = "";
      if (shape === "component") {
        // UML component glyph, top-right
        const gx = x + w - 22;
        const gy = y + 8;
        extra = `<g fill="none" stroke="${rgba(c, 0.85)}" stroke-width="1"><rect x="${gx + 3}" y="${gy}" width="11" height="13" rx="1"/><rect x="${gx}" y="${gy + 2.5}" width="6" height="3"/><rect x="${gx}" y="${gy + 7.5}" width="6" height="3"/></g>`;
      }
      if (n.tag) extra += tagChip(n.tag, x + w - (shape === "component" ? 28 : 8), y + 6, c, t);
      return body(`${outline}
  ${hasIcon ? iconBox(ix, iy, ib) : ""}
  ${extra}
  ${drawText(lines, tx, y + top, y + h, "start")}`);
    }
  }
}

/** ERD table: header band (icon + name) and one row per column (key chip, name, type). */
function renderTable(n: PlacedNode, t: ArchTheme, c: string, glow: string): string {
  const { x, y, w, h } = n.rect;
  const rows = n.rows ?? [];
  const out: string[] = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${t.cardBase}"/>`,
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${rgba(c, t.fillAlpha * 0.6)}" stroke="${c}" stroke-width="1.3"${glow}/>`,
    `<path d="M ${x} ${y + TABLE_HEAD} V ${y + 9} Q ${x} ${y} ${x + 9} ${y} H ${x + w - 9} Q ${x + w} ${y} ${x + w} ${y + 9} V ${y + TABLE_HEAD} Z" fill="${rgba(c, t.id === "dark" ? 0.24 : 0.16)}"/>`,
    `<line x1="${x}" y1="${y + TABLE_HEAD}" x2="${x + w}" y2="${y + TABLE_HEAD}" stroke="${rgba(c, 0.7)}" stroke-width="1"/>`,
    iconMarkup("table", c, x + 12, y + 9, 18),
    `<text x="${x + 38}" y="${y + 23}" fill="${t.ink}" font-family="${t.mono}" font-size="14" font-weight="700">${esc(n.label.text)}</text>`,
  ];
  rows.forEach((r, i) => {
    const ry = y + TABLE_HEAD + 4 + i * TABLE_ROW;
    if (i % 2 === 1) out.push(`<rect x="${x + 1}" y="${ry}" width="${w - 2}" height="${TABLE_ROW}" fill="${rgba(c, 0.05)}"/>`);
    const key = (r.key ?? "").toUpperCase();
    const pk = key.includes("PK");
    const fk = key.includes("FK");
    const kc = pk ? t.badgeFill : fk ? t.edges.sync : key ? t.muted : "";
    if (key) {
      const kt = pk && fk ? "PF" : pk ? "PK" : fk ? "FK" : key.slice(0, 2);
      out.push(`<rect x="${x + 10}" y="${ry + 4}" width="22" height="14" rx="3" fill="${rgba(kc, 0.16)}" stroke="${rgba(kc, 0.7)}" stroke-width="0.8"/><text x="${x + 21}" y="${ry + 14.5}" text-anchor="middle" fill="${kc}" font-family="${t.mono}" font-size="10" font-weight="700">${kt}</text>`);
    }
    out.push(`<text x="${x + 40}" y="${ry + 15.5}" fill="${pk ? t.ink : t.id === "dark" ? "#cbd5e1" : "#334155"}" font-family="${t.mono}" font-size="12.5"${pk ? ' font-weight="700"' : ""}>${esc(r.name)}${r.nullable ? `<tspan fill="${t.dim}">?</tspan>` : ""}</text>`);
    if (r.type) out.push(`<text x="${x + w - 12}" y="${ry + 15.5}" text-anchor="end" fill="${t.muted}" font-family="${t.mono}" font-size="12">${esc(r.type)}</text>`);
  });
  return out.join("\n  ");
}

/** Crow's-foot / bar / circle glyphs at an edge end (p = endpoint on the card, q = previous point). */
export function endGlyph(mark: EdgeMark | undefined, p: Point, q: Point, color: string, canvas: string): string {
  if (!mark || mark === "arrow" || mark === "open" || mark === "none") return "";
  const L = Math.hypot(p.x - q.x, p.y - q.y) || 1;
  const u = { x: (p.x - q.x) / L, y: (p.y - q.y) / L };
  const v = { x: -u.y, y: u.x };
  const at = (d: number) => ({ x: p.x - u.x * d, y: p.y - u.y * d });
  const bar = (d: number) => {
    const c = at(d);
    return `<line x1="${r1(c.x + v.x * 7)}" y1="${r1(c.y + v.y * 7)}" x2="${r1(c.x - v.x * 7)}" y2="${r1(c.y - v.y * 7)}" stroke="${color}" stroke-width="1.6"/>`;
  };
  const ring = (d: number) => {
    const c = at(d);
    return `<circle cx="${r1(c.x)}" cy="${r1(c.y)}" r="4.6" fill="${canvas}" stroke="${color}" stroke-width="1.5"/>`;
  };
  const crow = () => {
    const a = at(13);
    return `<path d="M ${r1(a.x)} ${r1(a.y)} L ${r1(p.x + v.x * 8)} ${r1(p.y + v.y * 8)} M ${r1(a.x)} ${r1(a.y)} L ${r1(p.x - v.x * 8)} ${r1(p.y - v.y * 8)}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`;
  };
  switch (mark) {
    case "one":
      return bar(10);
    case "exactlyOne":
      return bar(8) + bar(14);
    case "zeroOrOne":
      return bar(8) + ring(18);
    case "many":
      return crow();
    case "oneOrMany":
      return crow() + bar(18);
    case "zeroOrMany":
      return crow() + ring(20);
  }
  return "";
}

function renderEdge(e: RoutedEdge, t: ArchTheme): string {
  const color = t.edges[e.kind] ?? t.edges.default;
  const d = pathD(e.points, 10);
  const hl = !!e.highlight;
  const under = t.glow || hl
    ? `<path d="${d}" fill="none" stroke="${hl ? t.alert : color}" stroke-opacity="${hl ? 0.22 : 0.16}" stroke-width="${hl ? 8 : 5}" stroke-linejoin="round"/>`
    : "";
  const start = e.bidirectional ? ` marker-start="url(#arrow-start-${e.kind})"` : "";
  const marks = (e.crossings ?? [])
    .map((p) => `<g class="boundary-cross"><circle cx="${r1(p.x)}" cy="${r1(p.y)}" r="6.5" fill="${t.canvas}" stroke="${t.alert}" stroke-width="1.6"/><path d="M ${r1(p.x - 2.6)} ${r1(p.y - 2.6)} L ${r1(p.x + 2.6)} ${r1(p.y + 2.6)} M ${r1(p.x + 2.6)} ${r1(p.y - 2.6)} L ${r1(p.x - 2.6)} ${r1(p.y + 2.6)}" stroke="${t.alert}" stroke-width="1.5" stroke-linecap="round"/></g>`)
    .join("");
  const mk = (m: EdgeMark | undefined, end: boolean) =>
    !m || m === "arrow" ? (end ? ` marker-end="url(#arrow-${e.kind})"` : "") : m === "open" ? ` marker-${end ? "end" : "start"}="url(#arrow-open${end ? "" : "-start"}-${e.kind})"` : "";
  const startM = e.startMark ? mk(e.startMark, false) : start;
  const endM = mk(e.endMark, true);
  const n = e.points.length;
  const glyphs = n >= 2 ? endGlyph(e.endMark, e.points[n - 1], e.points[n - 2], color, t.canvas) + endGlyph(e.startMark, e.points[0], e.points[1], color, t.canvas) : "";
  return `<g class="edge${hl ? " highlight" : ""}${e.dim ? " dim" : ""}" id="edge-${e.id}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" data-kind="${e.kind}"${e.dim ? ' opacity="0.3"' : ""}>
  ${under}<path d="${d}" fill="none" stroke="${color}" stroke-width="${hl ? 2.2 : 1.6}" stroke-linejoin="round"${edgeDash(e.kind)}${startM}${endM}/>${glyphs}${marks}
</g>`;
}

/** Label text with data-classification chips coloured as alerts. */
function labelText(e: RoutedEdge, t: ArchTheme): string {
  const raw = e.label ?? "";
  const tags = e.tags ?? [];
  const suffix = tagSuffix(tags);
  if (tags.length && raw === suffix.trim()) return `<tspan fill="${t.alert}" font-weight="700">${esc(raw)}</tspan>`;
  if (!tags.length || !raw.endsWith(suffix)) return esc(raw);
  const head = raw.slice(0, raw.length - suffix.length);
  return `${esc(head)}<tspan fill="${t.alert}" font-weight="700">${esc(suffix)}</tspan>`;
}

function renderAnnotations(e: RoutedEdge, t: ArchTheme): string {
  const color = t.edges[e.kind] ?? t.edges.default;
  const pill = e.tags?.length ? t.alert : color;
  let out = "";
  if (e.label && e.labelRect) {
    const r = e.labelRect;
    if (e.labelLeader) {
      const p = e.labelLeader;
      const q = { x: Math.max(r.x, Math.min(r.x + r.w, p.x)), y: Math.max(r.y, Math.min(r.y + r.h, p.y)) };
      out += `<g class="edge-leader" data-edge="${e.id}"><line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="${color}" stroke-width="1" stroke-dasharray="2 2.5" opacity="0.9"/><circle cx="${p.x}" cy="${p.y}" r="2.6" fill="${color}"/></g>`;
    }
    out += `<g class="edge-label" data-edge="${e.id}"${e.dim ? ' opacity="0.45"' : ""}>
  <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${r.h / 2}" fill="${t.pillFill}" stroke="${pill}" stroke-width="${e.tags?.length ? 1.3 : 1}"/>
  <text x="${r.x + (e.badgeInLabel ? BADGE_R * 2 + 2 : 0) + (r.w - (e.badgeInLabel ? BADGE_R * 2 + 2 : 0)) / 2}" y="${r.y + r.h / 2 + 4.2}" text-anchor="middle" fill="${t.ink}" font-family="${t.mono}" font-size="${FONTS.edgeLabel.size}" font-weight="500">${labelText(e, t)}</text>
</g>`;
  }
  if (e.step != null && e.badgeAt) out += badge(e.badgeAt.x, e.badgeAt.y, e.step, t, `data-edge="${e.id}"`, !e.badgeInLabel);
  return out;
}

function badge(cx: number, cy: number, n: number, t: ArchTheme, attrs = "", halo = true): string {
  const ring = t.glow && halo ? `<circle cx="${cx}" cy="${cy}" r="${BADGE_R + 4}" fill="${rgba(t.badgeFill, 0.18)}"/>` : "";
  return `<g class="badge" ${attrs}>${ring}<circle cx="${cx}" cy="${cy}" r="${BADGE_R}" fill="${t.badgeFill}" stroke="${t.canvas}" stroke-width="2"/>
  <text x="${cx}" y="${cy + 4.2}" text-anchor="middle" fill="${t.badgeInk}" font-family="${t.mono}" font-size="12" font-weight="700">${n}</text></g>`;
}

function legendSwatch(item: LayoutResult["legend"][0], x: number, y: number, t: ArchTheme): string {
  if (item.mark) {
    const c = item.role ? (t.roles[item.role] ?? t.roles.default) : t.alert;
    switch (item.mark) {
      case "trust":
        return `<rect x="${x + 1}" y="${y - 7}" width="26" height="14" rx="4" fill="${rgba(t.alert, 0.06)}" stroke="${t.alert}" stroke-width="1.4" stroke-dasharray="5 3"/>`;
      case "boundary":
        return `<rect x="${x + 1}" y="${y - 7}" width="26" height="14" rx="3" fill="none" stroke="${t.frameKinds.boundary ?? c}" stroke-width="1.3" stroke-dasharray="6 3"/>`;
      case "cross":
        return `<line x1="${x}" y1="${y}" x2="${x + 28}" y2="${y}" stroke="${t.alert}" stroke-opacity="0.3" stroke-width="7"/><circle cx="${x + 14}" cy="${y}" r="6" fill="${t.canvas}" stroke="${t.alert}" stroke-width="1.5"/><path d="M ${x + 11.6} ${y - 2.4} L ${x + 16.4} ${y + 2.4} M ${x + 16.4} ${y - 2.4} L ${x + 11.6} ${y + 2.4}" stroke="${t.alert}" stroke-width="1.4"/>`;
      case "sensitive":
        return `<rect x="${x}" y="${y - 8}" width="30" height="16" rx="8" fill="${t.pillFill}" stroke="${t.alert}" stroke-width="1.2"/><text x="${x + 15}" y="${y + 3.5}" text-anchor="middle" fill="${t.alert}" font-family="${t.mono}" font-size="9" font-weight="700">[!]</text>`;
      case "decision":
        return `<path d="M ${x + 14} ${y - 8} L ${x + 26} ${y} L ${x + 14} ${y + 8} L ${x + 2} ${y} Z" fill="${rgba(c, 0.2)}" stroke="${c}" stroke-width="1.2"/>`;
      case "person":
        return `<circle cx="${x + 14}" cy="${y - 4}" r="4" fill="${rgba(c, 0.25)}" stroke="${c}" stroke-width="1.2"/><rect x="${x + 6}" y="${y + 1}" width="16" height="8" rx="4" fill="${rgba(c, 0.2)}" stroke="${c}" stroke-width="1.2"/>`;
      case "datastore":
        return `<path d="M ${x + 28} ${y - 7} H ${x + 2} V ${y + 7} H ${x + 28} M ${x + 9} ${y - 7} V ${y + 7}" fill="none" stroke="${c}" stroke-width="1.3"/>`;
      case "process":
        return `<rect x="${x + 2}" y="${y - 8}" width="25" height="16" rx="6" fill="${rgba(c, 0.18)}" stroke="${c}" stroke-width="1.2"/>`;
      case "entity":
        return `<rect x="${x + 2}" y="${y - 8}" width="25" height="16" rx="1" fill="${rgba(c, 0.18)}" stroke="${c}" stroke-width="1.2"/><rect x="${x + 4.5}" y="${y - 5.5}" width="20" height="11" fill="none" stroke="${rgba(c, 0.6)}" stroke-width="0.7"/>`;
      case "replicas":
        return `<rect x="${x + 8}" y="${y - 9}" width="18" height="13" rx="3" fill="none" stroke="${rgba(c, 0.5)}"/><rect x="${x + 4}" y="${y - 5}" width="18" height="13" rx="3" fill="${t.cardBase}" stroke="${c}" stroke-width="1.2"/>`;
      case "changed":
        return `<rect x="${x + 2}" y="${y - 8}" width="25" height="16" rx="4" fill="${rgba(t.alert, 0.12)}" stroke="${t.alert}" stroke-width="1.6"/>`;
      case "impacted":
        return `<rect x="${x + 2}" y="${y - 8}" width="25" height="16" rx="4" fill="${rgba(t.roles.storage, 0.12)}" stroke="${t.roles.storage}" stroke-width="1.2" stroke-dasharray="4 2"/>`;
      case "dimmed":
        return `<rect x="${x + 2}" y="${y - 8}" width="25" height="16" rx="4" fill="${rgba(t.roles.default, 0.1)}" stroke="${t.roles.default}" stroke-width="1.1" opacity="0.4"/>`;
      case "state":
        return `<rect x="${x + 2}" y="${y - 8}" width="25" height="16" rx="7" fill="${rgba(c, 0.18)}" stroke="${c}" stroke-width="1.2"/>`;
      case "initial":
        return `<circle cx="${x + 14}" cy="${y}" r="6" fill="${c}"/>`;
      case "final":
        return `<circle cx="${x + 14}" cy="${y}" r="7.5" fill="none" stroke="${c}" stroke-width="1.4"/><circle cx="${x + 14}" cy="${y}" r="4" fill="${c}"/>`;
      case "choice":
        return `<path d="M ${x + 14} ${y - 8} L ${x + 22} ${y} L ${x + 14} ${y + 8} L ${x + 6} ${y} Z" fill="${rgba(c, 0.2)}" stroke="${c}" stroke-width="1.2"/>`;
      case "composite":
      case "stage":
        return `<rect x="${x + 1}" y="${y - 8}" width="27" height="16" rx="4" fill="${rgba(c, 0.06)}" stroke="${rgba(c, 0.7)}" stroke-width="1.1" stroke-dasharray="4 3"/>`;
      case "table":
        return `<rect x="${x + 2}" y="${y - 8}" width="25" height="16" rx="3" fill="${rgba(c, 0.1)}" stroke="${c}" stroke-width="1.1"/><rect x="${x + 2}" y="${y - 8}" width="25" height="5" fill="${rgba(c, 0.4)}"/>`;
      case "pk":
      case "fk": {
        const kc = item.mark === "pk" ? t.badgeFill : t.edges.sync;
        return `<rect x="${x + 3}" y="${y - 7}" width="22" height="14" rx="3" fill="${rgba(kc, 0.16)}" stroke="${rgba(kc, 0.7)}" stroke-width="0.8"/><text x="${x + 14}" y="${y + 3.5}" text-anchor="middle" fill="${kc}" font-family="${t.mono}" font-size="10" font-weight="700">${item.mark.toUpperCase()}</text>`;
      }
      case "crow": {
        const col = t.edges.default === c ? t.muted : t.edges.data;
        return `<line x1="${x}" y1="${y}" x2="${x + 28}" y2="${y}" stroke="${col}" stroke-width="1.6"/>` + endGlyph("oneOrMany", { x: x + 28, y }, { x, y }, col, t.canvas);
      }
      case "io":
        return `<path d="M ${x + 7} ${y - 8} H ${x + 28} L ${x + 21} ${y + 8} H ${x} Z" fill="${rgba(c, 0.18)}" stroke="${c}" stroke-width="1.2"/>`;
      case "terminator":
        return `<rect x="${x + 1}" y="${y - 8}" width="27" height="16" rx="8" fill="${rgba(c, 0.2)}" stroke="${c}" stroke-width="1.2"/>`;
      case "subprocess":
        return `<rect x="${x + 2}" y="${y - 8}" width="25" height="16" rx="2" fill="${rgba(c, 0.18)}" stroke="${c}" stroke-width="1.2"/><line x1="${x + 6}" y1="${y - 8}" x2="${x + 6}" y2="${y + 8}" stroke="${c}"/><line x1="${x + 23}" y1="${y - 8}" x2="${x + 23}" y2="${y + 8}" stroke="${c}"/>`;
      case "lane":
        return `<rect x="${x + 1}" y="${y - 7}" width="26" height="14" fill="${rgba(c, 0.12)}" stroke="${rgba(c, 0.6)}"/><rect x="${x + 1}" y="${y - 7}" width="3" height="14" fill="${c}"/>`;
      case "syncmsg":
        return `<line x1="${x}" y1="${y}" x2="${x + 24}" y2="${y}" stroke="${t.edges.sync}" stroke-width="1.6"/><path d="M ${x + 21} ${y - 4.5} L ${x + 28} ${y} L ${x + 21} ${y + 4.5} z" fill="${t.edges.sync}"/>`;
      case "asyncmsg":
        return `<line x1="${x}" y1="${y}" x2="${x + 27}" y2="${y}" stroke="${t.edges.async}" stroke-width="1.6"/><path d="M ${x + 21} ${y - 4.5} L ${x + 27.5} ${y} L ${x + 21} ${y + 4.5}" fill="none" stroke="${t.edges.async}" stroke-width="1.6"/>`;
      case "return":
        return `<line x1="${x + 28}" y1="${y}" x2="${x + 1}" y2="${y}" stroke="${t.muted}" stroke-width="1.3" stroke-dasharray="5 3"/><path d="M ${x + 7} ${y - 4.5} L ${x + 0.5} ${y} L ${x + 7} ${y + 4.5}" fill="none" stroke="${t.muted}" stroke-width="1.4"/>`;
      case "activation":
        return `<line x1="${x + 14}" y1="${y - 9}" x2="${x + 14}" y2="${y + 9}" stroke="${t.muted}" stroke-dasharray="3 3"/><rect x="${x + 8}" y="${y - 7}" width="12" height="14" rx="2" fill="${rgba(t.roles.compute, 0.3)}" stroke="${t.roles.compute}"/>`;
      case "note":
        return `<path d="M ${x + 2} ${y - 8} H ${x + 21} L ${x + 27} ${y - 2} V ${y + 8} H ${x + 2} Z" fill="${rgba(t.badgeFill, 0.14)}" stroke="${t.badgeFill}" stroke-width="1.1"/>`;
      case "fragment":
        return `<rect x="${x + 1}" y="${y - 8}" width="27" height="16" rx="3" fill="none" stroke="${t.edges.async}" stroke-width="1.1"/><path d="M ${x + 1} ${y - 8} H ${x + 12} V ${y - 3} L ${x + 9} ${y} H ${x + 1} Z" fill="${rgba(t.edges.async, 0.3)}"/>`;
      case "allow":
      case "deny":
      case "conditional":
      case "na": {
        const col = item.mark === "allow" ? t.roles.compute : item.mark === "deny" ? t.alert : item.mark === "conditional" ? t.badgeFill : t.muted;
        const g = item.mark === "allow" ? `<path d="M ${x + 9} ${y} l 3.5 3.5 l 7 -7" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : item.mark === "deny" ? `<path d="M ${x + 10} ${y - 4} l 8 8 M ${x + 18} ${y - 4} l -8 8" stroke="${col}" stroke-width="2" stroke-linecap="round"/>` : item.mark === "conditional" ? `<circle cx="${x + 14}" cy="${y}" r="4.5" fill="none" stroke="${col}" stroke-width="1.6"/><path d="M ${x + 14} ${y - 4.5} A 4.5 4.5 0 0 1 ${x + 14} ${y + 4.5} Z" fill="${col}"/>` : `<line x1="${x + 10}" y1="${y}" x2="${x + 18}" y2="${y}" stroke="${col}" stroke-width="1.6"/>`;
        return `<rect x="${x + 3}" y="${y - 9}" width="22" height="18" rx="4" fill="${rgba(col, 0.16)}" stroke="${rgba(col, 0.55)}"/>` + g;
      }
      case "bar":
        return `<rect x="${x + 1}" y="${y - 6}" width="27" height="12" rx="3" fill="${rgba(c, 0.22)}" stroke="${c}" stroke-width="1.1"/><rect x="${x + 1}" y="${y - 6}" width="15" height="12" rx="3" fill="${rgba(c, 0.6)}"/>`;
      case "critical":
        return `<rect x="${x + 1}" y="${y - 6}" width="27" height="12" rx="3" fill="${rgba(t.alert, 0.22)}" stroke="${t.alert}" stroke-width="1.4"/>`;
      case "milestone":
        return `<path d="M ${x + 14} ${y - 8} L ${x + 22} ${y} L ${x + 14} ${y + 8} L ${x + 6} ${y} Z" fill="${t.badgeFill}" stroke="${t.canvas}" stroke-width="1.2"/>`;
      case "today":
        return `<line x1="${x + 14}" y1="${y - 9}" x2="${x + 14}" y2="${y + 9}" stroke="${t.alert}" stroke-width="1.6" stroke-dasharray="4 2"/><circle cx="${x + 14}" cy="${y - 7}" r="2.5" fill="${t.alert}"/>`;
      case "era":
        return `<rect x="${x + 1}" y="${y - 7}" width="27" height="14" rx="3" fill="${rgba(c, 0.14)}" stroke="${rgba(c, 0.6)}"/>`;
      case "event":
        return `<line x1="${x}" y1="${y + 4}" x2="${x + 28}" y2="${y + 4}" stroke="${t.muted}" stroke-width="1.4"/><line x1="${x + 14}" y1="${y + 4}" x2="${x + 14}" y2="${y - 6}" stroke="${c}" stroke-width="1.2"/><circle cx="${x + 14}" cy="${y + 4}" r="3.5" fill="${c}" stroke="${t.canvas}" stroke-width="1.2"/>`;
    }
  }
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
    const flow = r.h > 40 ? legendFlow(layout.legend, r) : null;
    let x = r.x + 4;
    const y = flow ? flow[0].y : r.y + r.h / 2;
    out += `<text x="${x}" y="${y + 4}" fill="${t.dim}" font-family="${t.mono}" font-size="${FONTS.panelHead.size}" font-weight="600" letter-spacing="0.16em">LEGEND</text>`;
    x += 90;
    if (flow) {
      for (const f of flow) {
        out += legendSwatch(f.item, f.x, f.y, t);
        out += `<text x="${f.x + 38}" y="${f.y + 4}" fill="${t.muted}" font-family="${t.mono}" font-size="${FONTS.legend.size}">${esc(f.item.label)}</text>`;
      }
    } else
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
    .join("\n    ") +
    (Object.keys(t.edges) as Array<keyof typeof t.edges>)
      .map((k) => `<marker id="arrow-start-${k}" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M 10 0.5 L 0 5 L 10 9.5 z" fill="${t.edges[k]}"/></marker>`)
      .join("") +
    (Object.keys(t.edges) as Array<keyof typeof t.edges>)
      .map((k) => `<marker id="arrow-open-${k}" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0.5 0.8 L 9.5 5 L 0.5 9.2" fill="none" stroke="${t.edges[k]}" stroke-width="1.5" stroke-linejoin="round"/></marker><marker id="arrow-open-start-${k}" viewBox="0 0 10 10" refX="0.5" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M 9.5 0.8 L 0.5 5 L 9.5 9.2" fill="none" stroke="${t.edges[k]}" stroke-width="1.5" stroke-linejoin="round"/></marker>`)
      .join("");
  const defs = `<defs>
    ${markers}
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="${t.gridLine}" stroke-width="0.5"/></pattern>
    <radialGradient id="vignette" cx="50%" cy="35%" r="75%"><stop offset="0%" stop-color="${t.id === "dark" ? "#0f2a44" : "#ffffff"}" stop-opacity="${t.id === "dark" ? 0.35 : 0}"/><stop offset="100%" stop-color="${t.canvas}" stop-opacity="0"/></radialGradient>
    <filter id="glow" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="0"/><feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#38bdf8" flood-opacity="0.10"/></filter>
    <filter id="shadow" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="1.5" stdDeviation="2.5" flood-color="#0f172a" flood-opacity="0.10"/></filter>
  </defs>`;

  const tr = layout.titleRect;
  const titleW = layout.title ? measureText(layout.title, FONTS.title) : 0;
  const prof = layout.profile;
  const meta = layout.meta ?? `${layout.nodes.length} ${prof?.nodeNoun ?? "COMPONENTS"} · ${layout.edges.length} ${prof?.edgeNoun ?? "FLOWS"}`;
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
  <text x="${tr.x}" y="${layout.footerY + 20}" fill="${t.dim}" font-family="${t.mono}" font-size="10" letter-spacing="0.08em">${esc((layout.title ?? "Architecture").toUpperCase())} · ${esc(prof?.caption ?? "REFERENCE ARCHITECTURE")}</text>
  <text x="${tr.x + tr.w}" y="${layout.footerY + 20}" text-anchor="end" fill="${t.dim}" font-family="${t.mono}" font-size="10" letter-spacing="0.08em">DIAGRAM-MCP</text></g>`;

  const tiers = [...layout.tiers].sort((a, b) => a.depth - b.depth).map((x) => renderTier(x, t)).join("\n");
  const nodes = layout.nodes.map((n) => renderCard(n, t)).join("\n");
  const edges = layout.edges.map((e) => renderEdge(e, t)).join("\n");
  const ann = layout.edges.map((e) => renderAnnotations(e, t)).join("\n");
  const junctions = layout.junctions
    .map((j) => `<circle class="junction" cx="${j.at.x}" cy="${j.at.y}" r="3.6" fill="${t.edges[j.kind] ?? t.edges.default}" stroke="${t.canvas}" stroke-width="1.5"/>`)
    .join("");
  const anchors = layout.anchors.map((a) => badge(a.at.x, a.at.y, a.n, t, `data-anchor="${esc(a.anchor)}"`)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xml:lang="zh-Hant" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${t.mono}">
  ${defs}
  <g id="background"><rect width="${width}" height="${height}" fill="${t.canvas}"/><rect width="${width}" height="${height}" fill="url(#grid)"/><rect width="${width}" height="${height}" fill="url(#vignette)"/></g>
  ${header}
  <g id="containers">${panel}
  ${tiers}</g>
  <g id="nodes">${nodes}</g>
  <g id="connections">${edges}<g id="junctions">${junctions}</g></g>
  <g id="labels">${ann}${anchors}</g>
  ${renderSteps(layout, t)}
  ${footer}
</svg>`;
}

export function themeCanvas(themeId?: string): string {
  return archTheme(themeId).canvas;
}
