/**
 * Structural QA for architecture layouts (inspired by pkt-lab/svg-diagram's
 * validate_svg.py, but run on the exact layout model instead of re-parsing SVG).
 * Every render returns these findings; tests require zero errors on showcase specs.
 */
import type { QaIssue } from "../types.js";
import { CARD_TEXT_X, FONTS } from "./grid.js";
import { measureText } from "./text.js";
import { sharesTrunk } from "./router.js";
import { BADGE_R, type LayoutResult, type Point, type Rect } from "./types.js";

const hit = (a: Rect, b: Rect, gap = 0) =>
  a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
const contains = (outer: Rect, inner: Rect, pad = 0) =>
  inner.x >= outer.x + pad && inner.y >= outer.y + pad && inner.x + inner.w <= outer.x + outer.w - pad && inner.y + inner.h <= outer.y + outer.h - pad;

function segHitsInterior(a: Point, b: Point, r: Rect, shrink = 1): boolean {
  const q = { x: r.x + shrink, y: r.y + shrink, w: r.w - 2 * shrink, h: r.h - 2 * shrink };
  const x1 = Math.min(a.x, b.x);
  const x2 = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y, b.y);
  if (a.y === b.y) return a.y > q.y && a.y < q.y + q.h && x1 < q.x + q.w && x2 > q.x;
  if (a.x === b.x) return a.x > q.x && a.x < q.x + q.w && y1 < q.y + q.h && y2 > q.y;
  return x1 < q.x + q.w && x2 > q.x && y1 < q.y + q.h && y2 > q.y;
}

function onBoundary(p: Point, r: Rect, tol = 1.01): boolean {
  const inX = p.x >= r.x - tol && p.x <= r.x + r.w + tol;
  const inY = p.y >= r.y - tol && p.y <= r.y + r.h + tol;
  return (
    (inY && (Math.abs(p.x - r.x) <= tol || Math.abs(p.x - (r.x + r.w)) <= tol)) ||
    (inX && (Math.abs(p.y - r.y) <= tol || Math.abs(p.y - (r.y + r.h)) <= tol))
  );
}

function distPointSeg(p: Point, a: Point, b: Point): number {
  const x = Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), p.x));
  const y = Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), p.y));
  return Math.hypot(p.x - x, p.y - y);
}

export interface QaOptions {
  /** Max acceptable crossings before warning (default: max(4, 30% of edges)) */
  maxCrossings?: number;
  /** Acceptable canvas aspect band (default [1.3, 2.3]) */
  aspect?: [number, number];
  /** Minimum effective font px at 1600px viewing width (default 9.5) */
  minEffectiveFont?: number;
}

export function runArchitectureQa(layout: LayoutResult, opts: QaOptions = {}): QaIssue[] {
  const issues: QaIssue[] = [];
  const add = (severity: QaIssue["severity"], code: string, message: string, ids?: string[]) =>
    issues.push({ severity, code, message, ids });
  const cards = layout.nodes;
  const tiers = layout.tiers;
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const nodeById = new Map(cards.map((n) => [n.id, n]));
  const canvas: Rect = { x: 0, y: 0, w: layout.width, h: layout.height };

  // 1. Cards
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (hit(cards[i].rect, cards[j].rect, 15.9)) {
        add("error", "card-overlap", `cards ${cards[i].id} and ${cards[j].id} overlap or are closer than 16px`, [cards[i].id, cards[j].id]);
      }
    }
    const n = cards[i];
    if (!contains(canvas, n.rect, 8)) add("error", "out-of-bounds", `card ${n.id} is outside the canvas`, [n.id]);
    if (n.tierId) {
      const t = tierById.get(n.tierId);
      if (t && !contains(t.rect, n.rect, 8)) add("error", "card-outside-frame", `card ${n.id} spills out of tier ${t.id}`, [n.id, t.id]);
    }
    const room = n.rect.w - (n.icon === "none" ? 16 : CARD_TEXT_X) - 10;
    const lw = measureText(n.label.text, FONTS.cardLabel);
    if (lw > room) add("error", "text-overflow", `label of ${n.id} (${Math.round(lw)}px) exceeds card text room (${Math.round(room)}px)`, [n.id]);
    if (n.subtitle && measureText(n.subtitle.text, FONTS.cardSub) > room) add("error", "text-overflow", `subtitle of ${n.id} overflows`, [n.id]);
    if (n.label.truncated || n.subtitle?.truncated) add("warning", "text-truncated", `text of ${n.id} was truncated with an ellipsis — shorten it`, [n.id]);
  }

  // 2. Frames
  for (const t of tiers) {
    if (!contains(canvas, t.rect, 4)) add("error", "out-of-bounds", `tier ${t.id} is outside the canvas`, [t.id]);
    if (t.labelRect.x + t.labelRect.w > t.rect.x + t.rect.w - 12) add("error", "tier-label-overflow", `tier label of ${t.id} is clipped by its frame`, [t.id]);
    for (const n of cards) {
      if (hit(n.rect, t.labelRect, 3)) add("error", "label-collision", `tier label ${t.id} touches card ${n.id}`, [t.id, n.id]);
    }
    if (t.parentId) {
      const p = tierById.get(t.parentId);
      if (p && !contains(p.rect, t.rect, 6)) add("error", "frame-overlap", `nested tier ${t.id} spills out of ${p.id}`, [t.id, p.id]);
    }
  }
  const ancestors = (id: string) => {
    const out = new Set<string>();
    let cur = tierById.get(id)?.parentId;
    while (cur) {
      out.add(cur);
      cur = tierById.get(cur)?.parentId;
    }
    return out;
  };
  for (let i = 0; i < tiers.length; i++) {
    for (let j = i + 1; j < tiers.length; j++) {
      const a = tiers[i];
      const b = tiers[j];
      if (ancestors(a.id).has(b.id) || ancestors(b.id).has(a.id)) continue;
      if (hit(a.rect, b.rect, 0)) add("error", "frame-overlap", `tiers ${a.id} and ${b.id} overlap`, [a.id, b.id]);
    }
  }

  // 3. Edges
  const annotations: Array<{ r: Rect; owner: string; kind: "pill" | "badge" }> = [];
  for (const e of layout.edges) {
    if (e.labelRect) annotations.push({ r: e.labelRect, owner: e.id, kind: "pill" });
    if (e.badgeAt)
      annotations.push({
        r: { x: e.badgeAt.x - BADGE_R, y: e.badgeAt.y - BADGE_R, w: BADGE_R * 2, h: BADGE_R * 2 },
        owner: e.id,
        kind: "badge",
      });
  }
  for (const e of layout.edges) {
    const pts = e.points;
    if (pts.length < 2) {
      add("error", "edge-unrouted", `edge ${e.from}→${e.to} has no path`, [e.from, e.to]);
      continue;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.x !== b.x && a.y !== b.y) add("error", "edge-diagonal", `edge ${e.from}→${e.to} has a non-orthogonal segment`, [e.id]);
      const L = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (L < 10 && i > 0 && i < pts.length - 2) add("warning", "edge-jog", `edge ${e.from}→${e.to} has a ${L.toFixed(0)}px jog`, [e.id]);
      for (const n of cards) {
        if (segHitsInterior(a, b, n.rect)) add("error", "edge-through-card", `edge ${e.from}→${e.to} passes through card ${n.id}`, [e.id, n.id]);
      }
      for (const t of tiers) {
        if (segHitsInterior(a, b, t.labelRect, 0)) add("error", "edge-through-label", `edge ${e.from}→${e.to} crosses tier label ${t.id}`, [e.id, t.id]);
      }
      for (const an of annotations) {
        if (an.owner === e.id) continue;
        const owner = layout.edges.find((x) => x.id === an.owner);
        if (owner && sharesTrunk(owner, e) && an.kind === "badge") continue;
        if (segHitsInterior(a, b, an.r, 1)) {
          add(an.kind === "pill" ? "error" : "warning", "edge-through-label", `edge ${e.from}→${e.to} runs under another edge's ${an.kind}`, [e.id, an.owner]);
        }
      }
    }
    // Endpoints must sit on the declared target
    const checkEnd = (p: Point, id: string, which: "source" | "target") => {
      const n = nodeById.get(id);
      const t = tierById.get(id);
      const r = n?.rect ?? t?.rect;
      if (!r) return;
      if (!onBoundary(p, r)) {
        const frame = tiers.find((tt) => onBoundary(p, tt.rect));
        add(
          "error",
          "edge-dangling",
          frame
            ? `edge ${e.from}→${e.to} ${which} stops on tier frame ${frame.id} instead of ${id}`
            : `edge ${e.from}→${e.to} ${which} does not touch ${id}`,
          [e.id, id],
        );
      }
    };
    checkEnd(pts[0], e.from, "source");
    checkEnd(pts[pts.length - 1], e.to, "target");
    if (e.label && !e.labelRect) add("warning", "label-missing", `label "${e.label}" on ${e.from}→${e.to} could not be placed`, [e.id]);
    if (e.step != null && e.badgeAt && !e.badgeInLabel) {
      let onOwn = Infinity;
      for (let i = 0; i < pts.length - 1; i++) onOwn = Math.min(onOwn, distPointSeg(e.badgeAt, pts[i], pts[i + 1]));
      if (onOwn > 1.5) add("warning", "badge-floating", `step ${e.step} badge is not on its edge`, [e.id]);
      for (const o of layout.edges) {
        if (o === e || sharesTrunk(o, e)) continue;
        for (let i = 0; i < o.points.length - 1; i++) {
          if (distPointSeg(e.badgeAt, o.points[i], o.points[i + 1]) < BADGE_R + 2) {
            add("warning", "badge-ambiguous", `step ${e.step} badge also sits on edge ${o.from}→${o.to}`, [e.id, o.id]);
            break;
          }
        }
      }
    }
  }

  // Annotation collisions
  for (let i = 0; i < annotations.length; i++) {
    for (const n of cards) if (hit(annotations[i].r, n.rect, 2)) add("error", "label-collision", `${annotations[i].kind} of ${annotations[i].owner} overlaps card ${n.id}`, [annotations[i].owner, n.id]);
    for (const t of tiers) if (hit(annotations[i].r, t.labelRect, 1)) add("error", "label-collision", `${annotations[i].kind} of ${annotations[i].owner} overlaps tier label ${t.id}`, [annotations[i].owner, t.id]);
    for (let j = i + 1; j < annotations.length; j++) {
      if (annotations[i].owner === annotations[j].owner) continue;
      if (hit(annotations[i].r, annotations[j].r, 1)) add("error", "label-collision", `${annotations[i].kind} of ${annotations[i].owner} overlaps ${annotations[j].kind} of ${annotations[j].owner}`, [annotations[i].owner, annotations[j].owner]);
    }
  }

  // Overlaps / crossings between different bundles
  let crossings = 0;
  const E = layout.edges;
  for (let i = 0; i < E.length; i++) {
    for (let j = i + 1; j < E.length; j++) {
      const a = E[i];
      const b = E[j];
      // shared trunks are intentional bundling; only accidental overlaps count
      const shared = (a.kind === b.kind && sharesTrunk(a, b)) || a.from === b.from || a.to === b.to;
      for (let p = 0; p < a.points.length - 1; p++) {
        for (let q = 0; q < b.points.length - 1; q++) {
          const a1 = a.points[p], a2 = a.points[p + 1], b1 = b.points[q], b2 = b.points[q + 1];
          const aH = a1.y === a2.y;
          const bH = b1.y === b2.y;
          if (aH === bH) {
            const same = aH ? Math.abs(a1.y - b1.y) < 1 : Math.abs(a1.x - b1.x) < 1;
            if (!same || shared) continue;
            const lo = aH ? Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x)) : Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y));
            const hi = aH ? Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x)) : Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y));
            if (hi - lo > 8) add("warning", "edge-overlap", `edges ${a.from}→${a.to} and ${b.from}→${b.to} share ${Math.round(hi - lo)}px of track`, [a.id, b.id]);
          } else if (!shared) {
            const h1 = aH ? a1 : b1, h2 = aH ? a2 : b2, v1 = aH ? b1 : a1, v2 = aH ? b2 : a2;
            if (
              v1.x > Math.min(h1.x, h2.x) && v1.x < Math.max(h1.x, h2.x) &&
              h1.y > Math.min(v1.y, v2.y) && h1.y < Math.max(v1.y, v2.y)
            ) crossings++;
          }
        }
      }
    }
  }
  const maxCross = opts.maxCrossings ?? Math.max(4, Math.round(E.length * 0.3));
  if (crossings > maxCross) add("warning", "edge-crossings", `${crossings} edge crossings (budget ${maxCross}) — reorder columns or tiers`);
  else if (crossings) add("info", "edge-crossings", `${crossings} edge crossings`);

  // 4. Composition / whitespace
  const aspect = layout.width / layout.height;
  const [amin, amax] = opts.aspect ?? [1.3, 2.3];
  if (aspect > amax || aspect < amin) add("warning", "canvas-aspect", `canvas aspect ${aspect.toFixed(2)} is outside ${amin}–${amax} (poster too ${aspect > amax ? "wide" : "tall"})`);
  // Readability when the PNG is viewed 1600px wide
  const minFont = Math.min(FONTS.edgeLabel.size, FONTS.cardSub.size, FONTS.tierLabel.size, FONTS.stepBody.size);
  const effective = (minFont * Math.min(1, 1600 / layout.width));
  if (effective < (opts.minEffectiveFont ?? 9)) add("warning", "readability", `smallest text renders at ${effective.toFixed(1)}px when viewed 1600px wide — split the diagram or wrap rows`);
  else if (effective < 10) add("info", "readability", `smallest text renders at ${effective.toFixed(1)}px when viewed 1600px wide`);
  const panel = layout.content;
  const filled = [...cards.map((n) => n.rect), ...tiers.filter((t) => t.depth === 0).map((t) => t.rect)];
  const band = (horizontal: boolean) => {
    const step = 8;
    const total = horizontal ? panel.h : panel.w;
    let run = 0;
    let worst = 0;
    for (let s = 0; s < total; s += step) {
      const strip: Rect = horizontal ? { x: panel.x, y: panel.y + s, w: panel.w, h: step } : { x: panel.x + s, y: panel.y, w: step, h: panel.h };
      if (filled.some((r) => hit(r, strip))) run = 0;
      else worst = Math.max(worst, (run += step));
    }
    return worst / total;
  };
  const emptyRows = band(true);
  const emptyCols = band(false);
  if (emptyRows > 0.16) add("warning", "whitespace", `diagram panel has an empty horizontal band of ${(emptyRows * 100).toFixed(0)}% height`);
  if (emptyCols > 0.16) add("warning", "whitespace", `diagram panel has an empty vertical band of ${(emptyCols * 100).toFixed(0)}% width`);
  for (const t of tiers) {
    const kids = cards.filter((n) => t.nodeIds.includes(n.id));
    if (!kids.length) continue;
    const used = kids.reduce((s, n) => s + n.rect.w * n.rect.h, 0);
    const fill = used / (t.rect.w * t.rect.h);
    if (fill < 0.12 && t.rect.w * t.rect.h > panel.w * panel.h * 0.06) {
      add("warning", "whitespace", `tier ${t.id} is mostly empty (${(fill * 100).toFixed(0)}% card coverage) — give it fewer columns or more cards`, [t.id]);
    }
  }

  // 5. Steps consistency
  const edgeSteps = new Set(layout.edges.filter((e) => e.step != null).map((e) => e.step!));
  for (const s of layout.steps) {
    if (!edgeSteps.has(s.n) && !layout.anchors.some((a) => a.n === s.n)) add("warning", "step-unanchored", `step ${s.n} has no edge badge on the diagram`);
  }
  for (const n of edgeSteps) {
    if (!layout.steps.some((s) => s.n === n)) add("warning", "step-undocumented", `badge ${n} has no entry in the steps panel`);
  }
  for (const note of layout.routeNotes) {
    add(note.includes("could not be routed") ? "error" : "warning", "router", note);
  }

  // de-duplicate identical messages
  const seen = new Set<string>();
  return issues.filter((i) => (seen.has(i.code + i.message) ? false : (seen.add(i.code + i.message), true)));
}

export function summarizeQa(issues: QaIssue[]): string {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const head = `QA: ${errors.length} error(s), ${warnings.length} warning(s)`;
  const lines = [...errors, ...warnings].slice(0, 25).map((i) => `- [${i.severity}] ${i.code}: ${i.message}`);
  return [head, ...lines].join("\n");
}
