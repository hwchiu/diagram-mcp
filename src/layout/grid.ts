/**
 * Deterministic architecture layout: nested tier containers on a column grid,
 * uniform cards, docked walkthrough panel. Routing lives in ./router.ts.
 */
import type { NodeRole } from "../design/themes.js";
import type { DiagramEdge, DiagramGroup, DiagramNode, EdgeKind } from "../types.js";
import { resolveMonoIcon } from "./icons.js";
import { ellipsize, measureText, wrapText, type FontSpec } from "./text.js";
import { countCrossings, routeEdges } from "./router.js";
import type {
  ArchitectureLayoutInput,
  LayoutResult,
  LegendItem,
  PlacedNode,
  PlacedTier,
  Rect,
  StepCard,
  TextLine,
} from "./types.js";
import { BADGE_R } from "./types.js";

// ── Design tokens (px) ────────────────────────────────────────────────────
export const CARD_H = 62;
/** Overview blocks carry a third text line (member list). */
export const CARD_H_TALL = 80;
/** Dimmed stub cards for endpoints that live in another view. */
export const CARD_H_STUB = 46;
export const CARD_MIN_W = 184;
export const CARD_MAX_W = 244;
export const ICON_BOX = 34;
export const CARD_PAD_X = 13;
export const CARD_TEXT_X = CARD_PAD_X + ICON_BOX + 12;
export const CARD_GAP_X = 48;
export const CARD_GAP_Y = 36;
export const FRAME_PAD = 24;
export const FRAME_HEADER = 40;
export const FRAME_HEADER_NESTED = 34;
export const CHILD_GAP = 24;
export const COL_GAP = 72;
export const ROW_GAP = 52;
export const MARGIN = 48;
export const TITLE_H = 84;
export const PANEL_PAD = 36;
export const SIDEBAR_W = 340;
export const SIDEBAR_GAP = 28;
export const FOOTER_H = 40;

export const FONTS = {
  title: { font: "mono", size: 26, weight: 700 } as FontSpec,
  subtitle: { font: "mono", size: 13, weight: 400 } as FontSpec,
  cardLabel: { font: "mono", size: 14, weight: 600 } as FontSpec,
  cardSub: { font: "mono", size: 12, weight: 400 } as FontSpec,
  tierLabel: { font: "mono", size: 12, weight: 600, tracking: 0.14 } as FontSpec,
  edgeLabel: { font: "mono", size: 12, weight: 500 } as FontSpec,
  stepTitle: { font: "mono", size: 12.5, weight: 600 } as FontSpec,
  stepBody: { font: "sans", size: 12, weight: 400 } as FontSpec,
  panelHead: { font: "mono", size: 11, weight: 600, tracking: 0.16 } as FontSpec,
  legend: { font: "mono", size: 12, weight: 400 } as FontSpec,
};

interface Box {
  id: string;
  group?: DiagramGroup;
  hidden: boolean;
  depth: number;
  nodes: DiagramNode[];
  children: Box[];
  cols: number;
  layout: "row" | "column";
  /** horizontal gap between cards (widened for labelled in-row edges) */
  gapX: number;
  /** vertical gap between card rows (widened for labelled / stepped in-column edges) */
  gapY?: number;
  /** natural size */
  w: number;
  h: number;
  blockW: number;
  blockH: number;
  header: number;
  pad: number;
}

function isExternalGroup(g: DiagramGroup): boolean {
  if (g.kind === "external") return true;
  const id = g.id.toLowerCase();
  const label = g.label.toLowerCase();
  return (
    id === "ext" ||
    id.includes("third") ||
    label.includes("third-party") ||
    label.includes("third party") ||
    (label.includes("external") && !label.includes("edge"))
  );
}

function autoCols(n: number, band: boolean): number {
  if (band) return Math.max(1, n);
  if (n <= 3) return 1;
  if (n <= 6) return 2;
  if (n <= 9) return 3;
  return 4;
}

export function tierLabelText(label: string, index: string): string {
  const up = label.toUpperCase();
  return index ? `${index} / ${up}` : up;
}

function dominantRole(nodes: DiagramNode[]): NodeRole {
  const count = new Map<NodeRole, number>();
  for (const n of nodes) count.set(n.role ?? "default", (count.get(n.role ?? "default") ?? 0) + 1);
  let best: NodeRole = "default";
  let bc = -1;
  for (const [r, c] of count) if (c > bc) ((best = r), (bc = c));
  return best;
}

/** Caller-facing aspect band the auto-wrapper aims for (width / height). */
export const TARGET_ASPECT = { min: 1.4, max: 2.0, ideal: 1.72 };
/** Canvas width above which text drops below ~10px when viewed 1600px wide. */
export const READABLE_W = 1920;

interface ColsVariant {
  id: number;
  cols: (n: number, ext: boolean) => number;
}
const VARIANTS: ColsVariant[] = [
  { id: 0, cols: (n, ext) => (ext ? Math.min(n, 5) : autoCols(n, false)) },
  { id: 1, cols: (n) => autoCols(n, false) },
  { id: 2, cols: (n) => Math.min(5, Math.max(1, Math.ceil(n / 2))) },
  { id: 3, cols: (n) => Math.max(1, Math.ceil(n / 4)) },
];

export interface GridPlan {
  /** rows → column stacks → tier / free-node ids */
  rows: string[][][];
  variant: number;
  spacing: number;
  score: number;
}

/**
 * Lay out an architecture diagram. Tries the regular spacing first and widens
 * gutters when the router could not place every label / badge cleanly.
 */
export function layoutArchitecture(input: ArchitectureLayoutInput): LayoutResult {
  let best: { r: LayoutResult; f: number } | null = null;
  // regular spacing first; then wider gutters; then the runner-up wrap plans
  const attempts: Array<[number, number]> = [[1, 0], [1, 1], [1.3, 0], [1, 2], [1.3, 1], [1, 3], [1.65, 0], [1.3, 2]];
  for (const [sp, rank] of attempts) {
    const r = layoutOnce(input, sp, rank);
    // unplaced annotations dominate; a canvas too wide to read at 1600px costs too
    const a = r.width / r.height;
    const budget = Math.max(4, Math.round(r.edges.length * 0.3));
    const f =
      layoutFailures(r) +
      Math.max(0, (r.width - 2040) / 240) +
      (a < 1.4 || a > 2.2 ? 1.5 : 0) +
      Math.max(0, countCrossings(r.edges) - budget) * 0.04;
    if (process.env.DBG_ATTEMPT) console.log("attempt", sp, rank, r.width, r.height, f.toFixed(2), r.routeNotes.join(" | "));
    if (!best || f < best.f) best = { r, f };
    // one parked (leader) label is cheaper than a reshuffled or wider canvas
    if (f < 0.15) break;
  }
  return best!.r;
}

function layoutFailures(r: LayoutResult): number {
  let f = 0;
  for (const n of r.routeNotes) f += n.includes("could not be routed") ? 10 : 1;
  for (const e of r.edges) if (e.label && !e.labelRect) f += 1;
  for (const e of r.edges) if (e.labelLeader) f += 0.1;
  return f;
}

function layoutOnce(input: ArchitectureLayoutInput, sp: number, rank = 0): LayoutResult {
  const groups = input.groups ?? [];
  const nodes = input.nodes;
  const edges = input.edges ?? [];
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const steps = [...(input.steps ?? [])].sort((a, b) => a.n - b.n);
  const GAP_X = Math.round(CARD_GAP_X * sp);
  const GAP_Y = Math.round(CARD_GAP_Y * sp);
  const CGAP = Math.round(COL_GAP * sp);
  const RGAP = Math.round(ROW_GAP * sp);
  const KGAP = Math.round(CHILD_GAP * sp);

  // ── Card width: uniform across the diagram, sized to measured text ────────
  let textMax = 0;
  for (const n of nodes) {
    textMax = Math.max(
      textMax,
      measureText(n.label, FONTS.cardLabel),
      n.subtitle ? measureText(n.subtitle, FONTS.cardSub) : 0,
      n.detail ? measureText(n.detail, FONTS.cardSub) : 0,
    );
  }
  const cardW = Math.round(Math.min(CARD_MAX_W, Math.max(CARD_MIN_W, CARD_TEXT_X + textMax + 16)));
  const textRoom = cardW - CARD_TEXT_X - 12;
  const cardH = nodes.some((n) => n.detail) ? CARD_H_TALL : CARD_H;
  const stubH = CARD_H_STUB;
  const hOf = (n: DiagramNode) => (n.stub ? stubH : cardH);

  const planCandidate = (columnsIn: string[][] | undefined) => {
  // ── Column stacks (tier ids / free node ids) ─────────────────────────────
  const bandIds = new Set(input.bottomRow ?? []);
  const rootGroups = groups.filter((g) => !g.parent || !groupById.has(g.parent));
  const grouped = new Set(groups.map((g) => g.id));
  const freeNodes = nodes.filter((n) => !n.group || !grouped.has(n.group));
  const explicitRows = input.rows?.length ? input.rows.map((r) => r.map((c) => [...c])) : null;
  let stackSpec: string[][] = explicitRows ? explicitRows.flat() : columnsIn?.length ? columnsIn.map((c) => [...c]) : [];
  const bottomSpec = [...(input.bottomRow ?? [])];
  const mentioned = new Set([...stackSpec.flat(), ...bottomSpec]);
  const appended: string[][] = [];
  if (!stackSpec.length) stackSpec = rootGroups.filter((g) => !bandIds.has(g.id)).map((g) => [g.id]);
  else for (const g of rootGroups) if (!mentioned.has(g.id)) appended.push([g.id]);
  stackSpec.push(...appended);
  const unmentionedFree = freeNodes.filter((n) => !mentioned.has(n.id));
  if (unmentionedFree.length) stackSpec.unshift(["__free"]);
  if (explicitRows && unmentionedFree.length) explicitRows[0].unshift(["__free"]);
  if (explicitRows && appended.length) explicitRows[explicitRows.length - 1].push(...appended);

  // ── Box tree for one cols-variant ─────────────────────────────────────────
  const buildModel = (variant: ColsVariant) => {
    const buildBox = (g: DiagramGroup, depth: number, band: boolean): Box => {
      const own = nodes.filter((n) => n.group === g.id);
      const kids = groups.filter((c) => c.parent === g.id).map((c) => buildBox(c, depth + 1, false));
      const ext = isExternalGroup(g);
      const auto = band ? own.length : variant.cols(own.length, ext);
      return {
        id: g.id,
        group: g,
        hidden: false,
        depth,
        nodes: own,
        children: kids,
        cols: Math.max(1, Math.min(own.length || 1, g.cols ?? auto)),
        layout: g.layout ?? "row",
        gapX: GAP_X,
        w: 0,
        h: 0,
        blockW: 0,
        blockH: 0,
        header: depth === 0 ? FRAME_HEADER : FRAME_HEADER_NESTED,
        pad: FRAME_PAD,
      };
    };
    const hiddenBox = (ns: DiagramNode[], id: string): Box => ({
      id,
      hidden: true,
      depth: 0,
      nodes: ns,
      children: [],
      cols: 1,
      layout: "column",
      gapX: GAP_X,
      w: 0,
      h: 0,
      blockW: 0,
      blockH: 0,
      header: 0,
      pad: 0,
    });
    const measure = (b: Box): void => {
      b.children.forEach(measure);
      const n = b.nodes.length;
      for (const e of edges) {
        if (!e.label) continue;
        const i = b.nodes.findIndex((x) => x.id === e.from);
        const j = b.nodes.findIndex((x) => x.id === e.to);
        if (i < 0 || j < 0 || Math.floor(i / b.cols) !== Math.floor(j / b.cols)) continue;
        b.gapX = Math.max(b.gapX, Math.ceil((measureText(e.label, FONTS.edgeLabel) + 18 + (e.step != null ? 24 : 0) + 34) * sp));
      }
      b.gapY = GAP_Y;
      for (const e of edges) {
        if (!e.label && e.step == null) continue;
        const i = b.nodes.findIndex((x) => x.id === e.from);
        const j = b.nodes.findIndex((x) => x.id === e.to);
        if (i < 0 || j < 0 || i % b.cols !== j % b.cols || Math.abs(Math.floor(i / b.cols) - Math.floor(j / b.cols)) !== 1) continue;
        b.gapY = Math.max(b.gapY, Math.round((30 + (e.label ? 30 : 0) + (e.step != null ? 30 : 0)) * sp));
      }
      if (n) {
        const rows = Math.ceil(n / b.cols);
        const rowH = (r: number) => Math.max(...b.nodes.slice(r * b.cols, r * b.cols + b.cols).map(hOf));
        b.blockW = b.cols * cardW + (b.cols - 1) * b.gapX;
        b.blockH = 0;
        for (let r = 0; r < rows; r++) b.blockH += rowH(r) + (r ? b.gapY : 0);
      }
      const items: Array<{ w: number; h: number }> = [];
      if (n) items.push({ w: b.blockW, h: b.blockH });
      for (const c of b.children) items.push({ w: c.w, h: c.h });
      let iw = 0;
      let ih = 0;
      const gap = b.children.length ? KGAP + 8 : 0;
      if (b.layout === "row") {
        iw = items.reduce((s, it) => s + it.w, 0) + Math.max(0, items.length - 1) * gap;
        ih = Math.max(0, ...items.map((it) => it.h));
      } else {
        iw = Math.max(0, ...items.map((it) => it.w));
        ih = items.reduce((s, it) => s + it.h, 0) + Math.max(0, items.length - 1) * gap;
      }
      if (b.hidden) {
        b.w = iw;
        b.h = ih;
        return;
      }
      const labelW = measureText(tierLabelText(b.group!.label, "00"), FONTS.tierLabel) + 56;
      b.w = Math.max(iw + b.pad * 2, labelW);
      b.h = b.header + ih + b.pad;
    };
    const boxFor = (id: string, band: boolean): Box | undefined => {
      if (id === "__free") return hiddenBox(unmentionedFree, "__free");
      const g = groupById.get(id);
      if (g) return buildBox(g, 0, band);
      if (nodeById.has(id)) return hiddenBox([nodeById.get(id)!], `__free_${id}`);
      return undefined;
    };
    const stacks: Box[][] = stackSpec.map((st) => st.map((id) => boxFor(id, false)).filter((b): b is Box => !!b));
    const band: Box[] = bottomSpec.map((id) => boxFor(id, true)).filter((b): b is Box => !!b);
    stacks.forEach((c) => c.forEach(measure));
    band.forEach(measure);
    return { stacks, band, measure };
  };

  // id → (stack, box) for geometry estimates and gutter sizing
  const ownerOf = new Map<string, { s: number; b: number }>();
  const markIds = (ids: string[], s: number, b: number) => {
    for (const id of ids) ownerOf.set(id, { s, b });
  };
  const descendantsOf = (gid: string): string[] => {
    const out = [gid];
    for (const n of nodes) if (n.group === gid) out.push(n.id);
    for (const c of groups) if (c.parent === gid) out.push(...descendantsOf(c.id));
    return out;
  };
  stackSpec.forEach((st, s) =>
    st.forEach((id, b) => markIds(id === "__free" ? unmentionedFree.map((n) => n.id) : groupById.has(id) ? descendantsOf(id) : [id], s, b)),
  );
  bottomSpec.forEach((id, b) => markIds(groupById.has(id) ? descendantsOf(id) : [id], -1, b));

  // Gutter between adjacent stacks: wide enough for the labels that cross it
  const labelGap = stackSpec.map(() => CGAP);
  for (let i = 0; i < stackSpec.length - 1; i++) {
    const crossing = edges.filter((e) => {
      if (!e.label) return false;
      const a = ownerOf.get(e.from)?.s;
      const b = ownerOf.get(e.to)?.s;
      return a != null && b != null && Math.min(a, b) === i && Math.max(a, b) === i + 1;
    });
    if (!crossing.length) continue;
    const lw = (e: DiagramEdge) => measureText(e.label!, FONTS.edgeLabel) + 18 + (e.step != null ? 24 : 0);
    let need = Math.max(...crossing.map(lw)) + 56;
    const byEnd = new Map<string, number[]>();
    for (const e of crossing) {
      for (const k of [`f:${e.from}`, `t:${e.to}`]) (byEnd.get(k) ?? byEnd.set(k, []).get(k)!).push(lw(e));
    }
    for (const ws of byEnd.values()) if (ws.length > 1) need = Math.max(need, ws.reduce((a, b) => a + b, 0) + 16 * (ws.length - 1) + 48);
    labelGap[i] = Math.max(CGAP, Math.min(380 * sp, Math.ceil(need * sp)));
  }

  const titleW = input.title ? measureText(input.title, FONTS.title) + 40 : 0;
  const subW = input.subtitle ? measureText(input.subtitle, FONTS.subtitle) + 40 : 0;
  const legend = deriveLegend(input, nodes);
  const stepBodyW = SIDEBAR_W - 72;
  const rightStepsH = (): number => {
    let h = 52;
    for (const s of steps) {
      const lines = s.description ? wrapText(s.description, FONTS.stepBody, stepBodyW) : [];
      h += 20 + lines.length * 17 + 18;
    }
    h += 24 + 30 + legend.length * 22 + 16;
    return h;
  };
  const RIGHT_H = rightStepsH();
  const bottomCardW = 300;
  const bottomLayout = (totalW: number) => {
    const maxCols = Math.max(1, Math.min(steps.length || 1, Math.floor((totalW + 20) / (bottomCardW + 20))));
    const rows = Math.ceil((steps.length || 1) / maxCols);
    const bottomCols = Math.ceil((steps.length || 1) / rows);
    const cw = (totalW - (bottomCols - 1) * 20) / bottomCols;
    const cards: Array<{ h: number; lines: string[] }> = steps.map((s) => {
      const lines = s.description ? wrapText(s.description, FONTS.stepBody, cw - 64) : [];
      return { h: 22 + 20 + lines.length * 17 + 18, lines };
    });
    let h = 0;
    for (let i = 0; i < cards.length; i += bottomCols) {
      h += Math.max(...cards.slice(i, i + bottomCols).map((c) => c.h)) + 20;
    }
    return { cw, cards, h: h + 40, cols: bottomCols };
  };
  const want = input.stepsPosition ?? "auto";
  /** Canvas size for a content panel; picks the steps position. */
  const chrome = (contentW: number, contentH: number) => {
    const head = MARGIN + TITLE_H;
    const tail = 18 + FOOTER_H - 12 + MARGIN / 2;
    const titleNeed = Math.max(titleW, subW);
    const right = () => {
      const w = Math.max(contentW, titleNeed - SIDEBAR_GAP - SIDEBAR_W) + SIDEBAR_GAP + SIDEBAR_W + 2 * MARGIN;
      return { W: w, H: head + Math.max(contentH, RIGHT_H) + tail, pos: "right" as const };
    };
    const bottom = () => {
      const cw = Math.max(contentW, titleNeed);
      return { W: cw + 2 * MARGIN, H: head + contentH + SIDEBAR_GAP + bottomLayout(cw).h + 44 + tail, pos: "bottom" as const };
    };
    if (!steps.length) {
      const cw = Math.max(contentW, titleNeed);
      return { W: cw + 2 * MARGIN, H: head + contentH + 48 + tail, pos: "none" as const };
    }
    if (want === "right") return right();
    if (want === "bottom") return bottom();
    const r = right();
    const b = bottom();
    const sc = (x: { W: number; H: number }) => aspectPenalty(x.W / x.H) + widthPenalty(x.W) * 0.5;
    return sc(b) + 0.06 < sc(r) ? b : r;
  };

  // ── Wrap planning: choose rows × cols-variant ─────────────────────────────
  const k = stackSpec.length;
  const partitions: number[][][] = [];
  if (explicitRows) {
    let i = 0;
    partitions.push(explicitRows.map((r) => r.map(() => i++)));
  } else if (input.wrap === "never" || k <= 2) {
    partitions.push([stackSpec.map((_, i) => i)]);
  } else {
    const maxRows = Math.min(3, k);
    const rec = (start: number, left: number, acc: number[][]) => {
      if (left === 1) {
        partitions.push([...acc, range(start, k)]);
        return;
      }
      for (let end = start + 1; end <= k - left + 1; end++) rec(end, left - 1, [...acc, range(start, end)]);
    };
    for (let r = 1; r <= maxRows; r++) rec(0, r, []);
    // snake variants: odd rows run right→left so a wrapped flow turns a U instead of jumping back to the left edge
    const n0 = partitions.length;
    for (let i = 0; i < n0; i++) {
      const p = partitions[i];
      if (p.length < 2 || !p.some((row, r) => r % 2 === 1 && row.length > 1)) continue;
      partitions.push(p.map((row, r) => (r % 2 === 1 ? [...row].reverse() : row)));
    }
  }
  const variants = input.wrap === "never" && !explicitRows ? [VARIANTS[0]] : VARIANTS;

  const rowGapFor = (rowOfStack: number[], r: number) => {
    // trunks that must cross the boundary between row r and r+1
    const keys = new Set<string>();
    for (const e of edges) {
      const a = ownerOf.get(e.from)?.s;
      const b = ownerOf.get(e.to)?.s;
      if (a == null || b == null || a < 0 || b < 0) continue;
      const ra = rowOfStack[a];
      const rb = rowOfStack[b];
      if (Math.min(ra, rb) <= r && Math.max(ra, rb) > r) keys.add(`${b}:${e.kind ?? "sync"}`);
    }
    return Math.max(RGAP + 12, Math.min(200, 44 + keys.size * 16));
  };

  interface Geo {
    rowOfStack: number[];
    gaps: number[];
    rowGaps: number[];
    colW: number[];
    colH: number[];
    rowW: number[];
    rowH: number[];
    innerW: number;
    innerH: number;
    bandW: number;
    bandH: number;
  }
  const geometry = (model: ReturnType<typeof buildModel>, part: number[][]): Geo => {
    const rowOfStack: number[] = [];
    part.forEach((row, r) => row.forEach((s) => (rowOfStack[s] = r)));
    const colW = model.stacks.map((c) => Math.max(0, ...c.map((b) => b.w)));
    const colH = model.stacks.map((c) => c.reduce((s, b) => s + b.h, 0) + Math.max(0, c.length - 1) * RGAP);
    // gap after stack i in its row (rows may run right→left when snaked)
    const gaps = model.stacks.map(() => 0);
    for (const row of part) for (let j = 0; j < row.length - 1; j++) gaps[row[j]] = labelGap[Math.min(row[j], row[j + 1])];
    const rowW = part.map((row) => row.reduce((s, i, j) => s + colW[i] + (j < row.length - 1 ? gaps[i] : 0), 0));
    const rowH = part.map((row) => Math.max(0, ...row.map((i) => colH[i])));
    const rowGaps = part.map((_, r) => (r < part.length - 1 ? rowGapFor(rowOfStack, r) : 0));
    const bandW = model.band.reduce((s, b) => s + b.w, 0) + Math.max(0, model.band.length - 1) * CGAP;
    const bandH = model.band.length ? Math.max(...model.band.map((b) => b.h)) : 0;
    const innerW = Math.max(bandW, ...rowW);
    const innerH = rowH.reduce((s, h) => s + h, 0) + rowGaps.reduce((s, g) => s + g, 0) + (model.band.length ? RGAP + bandH : 0);
    return { rowOfStack, gaps, rowGaps, colW, colH, rowW, rowH, innerW, innerH, bandW, bandH };
  };

  const estimateLength = (model: ReturnType<typeof buildModel>, g: Geo, part: number[][]): number => {
    const cx: number[] = [];
    const cyBox: number[][] = [];
    let y = 0;
    part.forEach((row, r) => {
      let x = 0;
      for (const s of row) {
        cx[s] = x + g.colW[s] / 2;
        let by = y;
        cyBox[s] = model.stacks[s].map((b) => {
          const c = by + b.h / 2;
          by += b.h + RGAP;
          return c;
        });
        x += g.colW[s] + g.gaps[s];
      }
      y += g.rowH[r] + g.rowGaps[r];
    });
    const bandY = y + g.bandH / 2;
    const pos = (id: string) => {
      const o = ownerOf.get(id);
      if (!o) return null;
      if (o.s < 0) return { x: g.innerW / 2, y: bandY };
      return { x: cx[o.s], y: cyBox[o.s]?.[o.b] ?? 0 };
    };
    let L = 0;
    for (const e of edges) {
      const a = pos(e.from);
      const b = pos(e.to);
      if (!a || !b) continue;
      L += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      // flows that run right→left read backwards
      if (b.x < a.x - 1 && Math.abs(a.y - b.y) > 1) L += 120;
    }
    return L;
  };

  type Plan = { part: number[][]; variant: ColsVariant; score: number; model: ReturnType<typeof buildModel>; geo: Geo };
  const plans: Plan[] = [];
  for (const v of variants) {
    const model = buildModel(v);
    for (const part of partitions) {
      const g = geometry(model, part);
      const c = chrome(g.innerW + PANEL_PAD * 2, g.innerH + PANEL_PAD * 2);
      const a = c.W / c.H;
      const waste =
        part.reduce((s, row, r) => s + (g.innerW - g.rowW[r]) * g.rowH[r], 0) / Math.max(1, g.innerW * g.innerH);
      const len = estimateLength(model, g, part) / Math.max(1, edges.length * (c.W + c.H) * 0.5);
      const score =
        aspectPenalty(a) * 6 + widthPenalty(c.W) * 6 + waste * 1.2 + len * 1.0 + (part.length - 1) * 0.08 + v.id * 0.03;
      plans.push({ part, variant: v, score, model, geo: g });
      if (process.env.DBG_PLAN) console.log("plan", JSON.stringify(part), "v", v.id, "W", Math.round(c.W), "H", Math.round(c.H), "a", a.toFixed(2), "score", score.toFixed(3), "asp", aspectPenalty(a).toFixed(2), "wid", widthPenalty(c.W).toFixed(2), "waste", waste.toFixed(2), "len", len.toFixed(2));
    }
  }
    plans.sort((a, b) => a.score - b.score);
    return { stackSpec, ownerOf, plans, geometry, chrome, RIGHT_H, bottomLayout, legend, titleW, subW, stepBodyW, labelGap };
  };
  const candidates = input.columnCandidates?.length ? input.columnCandidates : [input.columns];
  const ranked: Array<{ P: ReturnType<typeof planCandidate>; plan: ReturnType<typeof planCandidate>["plans"][0] }> = [];
  for (const c of candidates) {
    const r = planCandidate(c);
    for (const pl of r.plans.slice(0, 4)) ranked.push({ P: r, plan: pl });
  }
  ranked.sort((a, b) => a.plan.score - b.plan.score);
  // plans that differ only in an unused cols-variant produce the same canvas: keep one
  for (let i = ranked.length - 1; i > 0; i--) {
    const a = ranked[i].plan;
    if (ranked.slice(0, i).some((o) => o.P === ranked[i].P && JSON.stringify(o.plan.part) === JSON.stringify(a.part) && Math.abs(o.plan.geo.innerW - a.geo.innerW) < 1 && Math.abs(o.plan.geo.innerH - a.geo.innerH) < 1)) ranked.splice(i, 1);
  }
  const pick = ranked[Math.min(rank, ranked.length - 1)];
  const { stackSpec, ownerOf, chrome, RIGHT_H, bottomLayout, legend, titleW, subW, stepBodyW } = pick.P;
  const plan = pick.plan;
  const { part, model } = plan;
  const { stacks, band } = model;

  let geo = plan.geo;
  if (input.reorder) {
    reorderCards(stacks, part, geo, ownerOf, edges, cardW, GAP_Y, RGAP);
    // gaps that depend on card order (labelled in-row / in-column edges) may change
    for (const st of stacks) st.forEach((b) => model.measure(b));
    band.forEach((b) => model.measure(b));
    geo = pick.P.geometry(model, part);
  }

  // ── Content geometry ──────────────────────────────────────────────────────
  const contentW = geo.innerW + PANEL_PAD * 2;
  const contentH = geo.innerH + PANEL_PAD * 2;
  let stepsPosition: LayoutResult["stepsPosition"] = chrome(contentW, contentH).pos;

  const contentX = MARGIN;
  const contentY = MARGIN + TITLE_H;
  let content: Rect = { x: contentX, y: contentY, w: contentW, h: contentH };
  let sidebar: Rect = { x: 0, y: 0, w: 0, h: 0 };
  const stepCards: StepCard[] = [];
  let legendRect: Rect;

  {
    const side = stepsPosition === "right" ? SIDEBAR_GAP + SIDEBAR_W : 0;
    const need = Math.max(titleW, subW) - side;
    if (need > content.w) content = { ...content, w: Math.round(need) };
  }
  if (stepsPosition === "right") {
    if (RIGHT_H > content.h) content = { ...content, h: RIGHT_H };
    sidebar = { x: contentX + content.w + SIDEBAR_GAP, y: contentY, w: SIDEBAR_W, h: content.h };
    let cy = sidebar.y + 52;
    for (const s of steps) {
      const lines = s.description ? wrapText(s.description, FONTS.stepBody, stepBodyW) : [];
      const h = 20 + lines.length * 17 + 18;
      stepCards.push({
        n: s.n,
        label: line(s.label, FONTS.stepTitle, stepBodyW),
        lines,
        rect: { x: sidebar.x + 16, y: cy - 16, w: sidebar.w - 32, h },
      });
      cy += h;
    }
    const lh = 30 + legend.length * 22 + 8;
    legendRect = { x: sidebar.x + 16, y: sidebar.y + sidebar.h - lh - 12, w: sidebar.w - 32, h: lh };
  } else if (stepsPosition === "bottom") {
    const bl = bottomLayout(content.w);
    const bottomCols = bl.cols;
    const legendH = 44;
    sidebar = { x: contentX, y: contentY + content.h + SIDEBAR_GAP, w: content.w, h: bl.h + legendH };
    let cy = sidebar.y + 40;
    for (let i = 0; i < steps.length; i += bottomCols) {
      const row = bl.cards.slice(i, i + bottomCols);
      const rh = Math.max(...row.map((c) => c.h));
      row.forEach((c, kk) => {
        const s = steps[i + kk];
        stepCards.push({
          n: s.n,
          label: line(s.label, FONTS.stepTitle, bl.cw - 64),
          lines: c.lines,
          rect: { x: sidebar.x + kk * (bl.cw + 20), y: cy, w: bl.cw, h: rh },
        });
      });
      cy += rh + 20;
    }
    legendRect = { x: sidebar.x, y: sidebar.y + sidebar.h - legendH + 6, w: sidebar.w, h: legendH - 12 };
  } else {
    legendRect = { x: contentX, y: contentY + content.h + 18, w: content.w, h: 30 };
  }

  const rightEdge = stepsPosition === "right" ? sidebar.x + sidebar.w : contentX + content.w;
  const width = Math.round(rightEdge + MARGIN);

  // ── Place frames ─────────────────────────────────────────────────────────
  const placedTiers: PlacedTier[] = [];
  const placedNodes: PlacedNode[] = [];
  let tierCounter = 0;
  const framesX = content.x + PANEL_PAD;
  const framesY = content.y + PANEL_PAD;
  const innerW = content.w - PANEL_PAD * 2;
  // Extra height (tall steps panel) goes to the rows evenly
  const extraH = Math.max(0, content.h - contentH);
  const perRowH = part.length ? extraH / part.length : 0;

  const placeBox = (b: Box, r: Rect, parentId?: string): void => {
    let inner: Rect;
    if (!b.hidden) {
      const g = b.group!;
      const index = b.depth === 0 ? String(++tierCounter).padStart(2, "0") : "";
      const text = tierLabelText(g.label, index);
      const lw = measureText(text, FONTS.tierLabel);
      const labelRect = { x: r.x + 16, y: r.y + 12, w: lw + 18, h: 16 };
      const descendants = collectNodes(b);
      placedTiers.push({
        id: g.id,
        label: g.label,
        index,
        rect: r,
        labelRect,
        depth: b.depth,
        parentId,
        kind: g.kind,
        external: isExternalGroup(g),
        stub: !!g.stub,
        hidden: false,
        accentRole: dominantRole(descendants),
        nodeIds: descendants.map((n) => n.id),
      });
      inner = { x: r.x + b.pad, y: r.y + b.header, w: r.w - b.pad * 2, h: r.h - b.header - b.pad };
    } else {
      inner = r;
    }
    const items: Array<{ kind: "block" } | { kind: "box"; box: Box }> = [];
    if (b.nodes.length) items.push({ kind: "block" });
    for (const c of b.children) items.push({ kind: "box", box: c });
    const gap = b.children.length ? KGAP + 8 : 0;
    const natural = items.map((it) => (it.kind === "block" ? { w: b.blockW, h: b.blockH } : { w: it.box.w, h: it.box.h }));
    const nChildren = b.children.length;
    if (b.layout === "row") {
      const total = natural.reduce((s, n) => s + n.w, 0) + (items.length - 1) * gap;
      const extra = Math.max(0, inner.w - total);
      const perChild = nChildren ? extra / nChildren : 0;
      let x = inner.x + (nChildren ? 0 : extra / 2);
      items.forEach((it, i) => {
        const w = natural[i].w + (it.kind === "box" ? perChild : 0);
        const slot = { x, y: inner.y, w, h: inner.h };
        if (it.kind === "block") placeBlock(b, slot);
        else placeBox(it.box, slot, b.hidden ? parentId : b.id);
        x += w + gap;
      });
    } else {
      const total = natural.reduce((s, n) => s + n.h, 0) + (items.length - 1) * gap;
      const extra = Math.max(0, inner.h - total);
      const perChild = nChildren ? extra / nChildren : 0;
      let y = inner.y + (nChildren ? 0 : extra / 2);
      items.forEach((it, i) => {
        const h = natural[i].h + (it.kind === "box" ? perChild : 0);
        const slot = { x: inner.x, y, w: inner.w, h };
        if (it.kind === "block") placeBlock(b, slot);
        else placeBox(it.box, slot, b.hidden ? parentId : b.id);
        y += h + gap;
      });
    }
  };

  const placeBlock = (b: Box, slot: Rect): void => {
    const x0 = slot.x + (slot.w - b.blockW) / 2;
    const y0 = slot.y + (slot.h - b.blockH) / 2;
    const tierId = b.hidden ? undefined : b.id;
    const rows = Math.ceil(b.nodes.length / b.cols);
    const rowHs: number[] = [];
    for (let r = 0; r < rows; r++) rowHs.push(Math.max(...b.nodes.slice(r * b.cols, r * b.cols + b.cols).map(hOf)));
    b.nodes.forEach((n, i) => {
      const col = i % b.cols;
      const row = Math.floor(i / b.cols);
      const lastRowCount = b.nodes.length - row * b.cols;
      const rowShift = lastRowCount < b.cols ? ((b.cols - lastRowCount) * (cardW + b.gapX)) / 2 : 0;
      let ry = y0;
      for (let r = 0; r < row; r++) ry += rowHs[r] + (b.gapY ?? GAP_Y);
      const h = hOf(n);
      const rect = {
        x: Math.round(x0 + rowShift + col * (cardW + b.gapX)),
        y: Math.round(ry + (rowHs[row] - h) / 2),
        w: cardW,
        h,
      };
      const role = (n.role ?? "default") as NodeRole;
      placedNodes.push({
        id: n.id,
        label: line(n.label, FONTS.cardLabel, textRoom),
        subtitle: n.subtitle ? line(n.subtitle, FONTS.cardSub, textRoom) : undefined,
        detail: n.detail ? line(n.detail, FONTS.cardSub, textRoom) : undefined,
        rawLabel: n.label,
        rawSubtitle: n.subtitle,
        role,
        icon: resolveMonoIcon(n.icon, role, n.shape),
        rect,
        tierId,
        stub: !!n.stub,
      });
    });
  };

  let y = framesY;
  part.forEach((row, r) => {
    const rowH = geo.rowH[r] + perRowH;
    const extra = Math.max(0, innerW - geo.rowW[r]);
    // stub-only stacks (detail views) keep their natural size and float centred
    const isStub = (si: number) => stacks[si].every((b) => !!b.group?.stub);
    const growable = row.filter((si) => !isStub(si));
    const colExtra = growable.length ? extra / growable.length : 0;
    // an all-stub row spreads its stacks instead of stretching them
    const spread = growable.length ? 0 : extra / (row.length + 1);
    let cx = framesX + spread;
    for (const si of row) {
      const col = stacks[si];
      const stubby = isStub(si);
      const w = geo.colW[si] + (stubby ? 0 : colExtra);
      const natural = geo.colH[si];
      const per = stubby ? 0 : Math.max(0, rowH - natural) / Math.max(1, col.length);
      let by = stubby ? y + Math.max(0, rowH - natural) / 2 : y;
      for (const b of col) {
        const h = b.h + per;
        placeBox(b, { x: Math.round(cx), y: Math.round(by), w: Math.round(w), h: Math.round(h) });
        by += h + RGAP;
      }
      cx += w + geo.gaps[si] + spread;
    }
    y += rowH + geo.rowGaps[r];
  });
  if (band.length) {
    const by = content.y + content.h - PANEL_PAD - geo.bandH;
    const natural = band.reduce((s, b) => s + b.w, 0) + (band.length - 1) * CGAP;
    const per = Math.max(0, innerW - natural) / band.length;
    let bx = framesX;
    for (const b of band) {
      const w = b.w + per;
      placeBox(b, { x: Math.round(bx), y: Math.round(by), w: Math.round(w), h: Math.round(geo.bandH) });
      bx += w + CGAP;
    }
  }

  const footerY =
    (stepsPosition === "bottom" ? sidebar.y + sidebar.h : stepsPosition === "none" ? legendRect.y + legendRect.h : content.y + content.h) + 18;
  const height = Math.round(footerY + FOOTER_H - 12 + MARGIN / 2);

  avoidLabelCorridors(placedTiers, placedNodes, edges);

  const routed = routeEdges({
    nodes: placedNodes,
    tiers: placedTiers,
    edges,
    area: content,
  });

  const anchors = placeAnchorBadges(steps, routed.edges, placedNodes, placedTiers);

  return {
    width,
    height,
    title: input.title,
    subtitle: input.subtitle,
    nodes: placedNodes,
    tiers: placedTiers,
    edges: routed.edges,
    junctions: routed.junctions,
    anchors,
    steps,
    stepCards,
    stepsPosition,
    legend,
    legendRect,
    content,
    sidebar,
    titleRect: { x: MARGIN, y: MARGIN, w: width - MARGIN * 2, h: TITLE_H },
    footerY,
    routeNotes: routed.notes,
    plan: {
      rows: part.map((row) => row.map((si) => stackSpec[si])),
      variant: plan.variant.id,
      spacing: sp,
      score: plan.score,
    },
    view: input.view,
  };
}

/**
 * Barycentric card ordering: inside every zone, swap cards between grid slots
 * while it shortens the estimated length of their edges (external neighbours
 * pull a card toward their side, internal neighbours pull cards together).
 */
function reorderCards(
  stacks: Box[][],
  part: number[][],
  geo: { colW: number[]; gaps: number[]; rowH: number[]; rowGaps: number[] },
  ownerOf: Map<string, { s: number; b: number }>,
  edges: DiagramEdge[],
  cardW: number,
  gapY: number,
  rgap: number,
): void {
  // stack / box centres
  const cx: number[] = [];
  const cy: number[][] = [];
  let y = 0;
  part.forEach((row, r) => {
    let x = 0;
    for (const si of row) {
      cx[si] = x + geo.colW[si] / 2;
      let by = y;
      cy[si] = stacks[si].map((b) => {
        const c = by + b.h / 2;
        by += b.h + rgap;
        return c;
      });
      x += geo.colW[si] + geo.gaps[si];
    }
    y += geo.rowH[r] + geo.rowGaps[r];
  });
  const posOf = (id: string) => {
    const o = ownerOf.get(id);
    if (!o || o.s < 0 || cx[o.s] == null) return null;
    return { x: cx[o.s], y: cy[o.s][o.b] };
  };
  const visit = (b: Box, center: { x: number; y: number }) => {
    const n = b.nodes.length;
    if (n >= 2) {
      const ids = new Set(b.nodes.map((x) => x.id));
      const rows = Math.ceil(n / b.cols);
      const gx = b.gapX;
      const slots: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < n; i++) {
        const col = i % b.cols;
        const row = Math.floor(i / b.cols);
        const last = n - row * b.cols;
        const shift = last < b.cols ? ((b.cols - last) * (cardW + gx)) / 2 : 0;
        slots.push({
          x: center.x - b.blockW / 2 + shift + col * (cardW + gx) + cardW / 2,
          y: center.y - b.blockH / 2 + row * (CARD_H + (b.gapY ?? gapY)) + CARD_H / 2 + (rows === 1 ? 0 : 0),
        });
      }
      const ext = new Map<string, Array<{ x: number; y: number }>>();
      const internal: Array<[string, string]> = [];
      for (const e of edges) {
        for (const [a, o] of [[e.from, e.to], [e.to, e.from]] as const) {
          if (!ids.has(a)) continue;
          if (ids.has(o)) {
            if (a === e.from) internal.push([e.from, e.to]);
            continue;
          }
          const p = posOf(o);
          if (p) (ext.get(a) ?? ext.set(a, []).get(a)!).push(p);
        }
      }
      if (ext.size || internal.length) {
        const order = b.nodes.map((x) => x.id);
        const at = new Map(order.map((id, i) => [id, i]));
        const cost = () => {
          let c = 0;
          for (const [id, ps] of ext) {
            const s = slots[at.get(id)!];
            for (const p of ps) c += Math.abs(s.x - p.x) + Math.abs(s.y - p.y);
          }
          for (const [a, bb] of internal) {
            const p = slots[at.get(a)!];
            const q = slots[at.get(bb)!];
            c += (Math.abs(p.x - q.x) + Math.abs(p.y - q.y)) * 1.2;
          }
          return c;
        };
        let best = cost();
        for (let pass = 0; pass < 6; pass++) {
          let improved = false;
          for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
              const a = order[i];
              const c = order[j];
              at.set(a, j);
              at.set(c, i);
              const v = cost();
              if (v < best - 0.5) {
                best = v;
                order[i] = c;
                order[j] = a;
                improved = true;
              } else {
                at.set(a, i);
                at.set(c, j);
              }
            }
          }
          if (!improved) break;
        }
        const byId = new Map(b.nodes.map((x) => [x.id, x]));
        b.nodes = order.map((id) => byId.get(id)!);
      }
    }
    for (const c of b.children) visit(c, center);
  };
  stacks.forEach((col, si) => col.forEach((b, bi) => cx[si] != null && visit(b, { x: cx[si], y: cy[si][bi] })));
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i < b; i++) out.push(i);
  return out;
}

export function aspectPenalty(a: number): number {
  const lo = Math.log(TARGET_ASPECT.min);
  const hi = Math.log(TARGET_ASPECT.max);
  const v = Math.log(a);
  const out = v < lo ? lo - v : v > hi ? v - hi : 0;
  return out * 3 + Math.abs(v - Math.log(TARGET_ASPECT.ideal)) * 0.15;
}

function widthPenalty(w: number): number {
  return Math.max(0, w - READABLE_W) / READABLE_W;
}

/**
 * Steps without an edge (step.anchor → node / tier id) get a badge pinned to
 * the anchor's top-right corner, stacked when several share one anchor.
 */
function placeAnchorBadges(
  steps: ArchitectureLayoutInput["steps"],
  edges: LayoutResult["edges"],
  nodes: PlacedNode[],
  tiers: PlacedTier[],
): LayoutResult["anchors"] {
  const out: LayoutResult["anchors"] = [];
  const onEdge = new Set(edges.filter((e) => e.step != null).map((e) => e.step!));
  const used = new Map<string, number>();
  for (const s of steps ?? []) {
    if (!s.anchor || onEdge.has(s.n)) continue;
    const n = nodes.find((x) => x.id === s.anchor);
    const t = tiers.find((x) => x.id === s.anchor);
    const r = n?.rect ?? t?.rect;
    if (!r) continue;
    const k = used.get(s.anchor) ?? 0;
    used.set(s.anchor, k + 1);
    const at = n
      ? { x: r.x + r.w - 4 - k * (BADGE_R * 2 + 4), y: r.y }
      : { x: r.x + r.w - 18 - k * (BADGE_R * 2 + 4), y: r.y + 20 };
    out.push({ n: s.n, at, anchor: s.anchor });
  }
  return out;
}

/**
 * Straight vertical edges between column-aligned cards would have to dodge a
 * tier label sitting in their corridor. Move such labels to the frame's right
 * end (or the widest free stretch of the header) instead.
 */
function avoidLabelCorridors(tiers: PlacedTier[], nodes: PlacedNode[], edges: Array<{ from: string; to: string }>): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const corridors: Array<{ x: number; y1: number; y2: number }> = [];
  for (const e of edges) {
    const a = byId.get(e.from)?.rect ?? tierById.get(e.from)?.rect;
    const b = byId.get(e.to)?.rect ?? tierById.get(e.to)?.rect;
    if (!a || !b) continue;
    const lo = Math.max(a.x, b.x);
    const hi = Math.min(a.x + a.w, b.x + b.w);
    if (hi - lo < 40) continue; // not vertically stacked
    const ca = a.x + a.w / 2;
    const cb = b.x + b.w / 2;
    const x = Math.abs(ca - cb) < 1 ? ca : (lo + hi) / 2;
    corridors.push({ x, y1: Math.min(a.y, b.y), y2: Math.max(a.y + a.h, b.y + b.h) });
  }
  const blocked = (r: Rect) => corridors.some((c) => c.x > r.x - 24 && c.x < r.x + r.w + 24 && c.y1 < r.y + r.h && c.y2 > r.y);
  for (const t of tiers) {
    if (!blocked(t.labelRect)) continue;
    const w = t.labelRect.w;
    const candidates: number[] = [t.rect.x + t.rect.w - 16 - w];
    // free stretches between corridors inside the header
    const xs = corridors
      .filter((c) => c.y1 < t.labelRect.y + t.labelRect.h && c.y2 > t.labelRect.y && c.x > t.rect.x && c.x < t.rect.x + t.rect.w)
      .map((c) => c.x)
      .sort((p, q) => p - q);
    for (const x of xs) candidates.push(x + 28);
    for (const x of candidates) {
      const r = { ...t.labelRect, x };
      if (x < t.rect.x + 12 || x + w > t.rect.x + t.rect.w - 12) continue;
      if (blocked(r)) continue;
      if (nodes.some((n) => rectsOverlap(n.rect, r, 4))) continue;
      t.labelRect = r;
      break;
    }
  }
}

function collectNodes(b: Box): DiagramNode[] {
  return [...b.nodes, ...b.children.flatMap(collectNodes)];
}

function line(text: string, spec: FontSpec, max: number): TextLine {
  const r = ellipsize(text, spec, max);
  return { text: r.text, truncated: r.truncated, width: measureText(r.text, spec) };
}

const KIND_LABEL: Record<EdgeKind, string> = {
  sync: "Sync request",
  async: "Async event",
  data: "Data read / write",
  auth: "Auth / identity",
  default: "Dependency",
};

function deriveLegend(input: ArchitectureLayoutInput, _nodes: DiagramNode[]): LegendItem[] {
  if (input.legend?.length) return input.legend;
  const kinds: EdgeKind[] = [];
  for (const e of input.edges ?? []) {
    const k = (e.kind ?? "sync") as EdgeKind;
    if (!kinds.includes(k)) kinds.push(k);
  }
  const order: EdgeKind[] = ["sync", "async", "data", "auth", "default"];
  kinds.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return kinds.map((k) => ({ label: KIND_LABEL[k], kind: k }));
}

/** Test helpers */
export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}
