/**
 * Gantt chart: label column with task groups, auto-scaled two-tier time axis
 * (day / week / month / quarter), bars with progress fill, milestones,
 * finish-to-start dependency arrows and an optional today marker. The time
 * axis width is chosen so the poster lands near 16:9.
 */
import { measureText, ellipsize } from "./text.js";
import { archTheme, type ArchTheme } from "./theme.js";
import { frameScene, sceneChromeH, SCENE_CHROME_W, type Scene, type SItem } from "./scene.js";
import type { DiagramProfile, LegendItem } from "./types.js";

export interface GanttTask {
  id: string;
  label: string;
  /** day numbers (UTC days since epoch), end exclusive */
  start: number;
  end: number;
  group?: string;
  progress?: number;
  milestone?: boolean;
  critical?: boolean;
  owner?: string;
  after: string[];
}
export interface GanttInput {
  title?: string;
  subtitle?: string;
  theme?: string;
  groups: Array<{ id: string; label: string }>;
  tasks: GanttTask[];
  today?: number;
  scale?: "auto" | "day" | "week" | "month" | "quarter";
}

const ROW = 30;
const PALETTE: Array<keyof ArchTheme["roles"]> = ["client", "gateway", "compute", "data", "queue", "observability", "network", "storage"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86400000;
export const toDay = (s: string): number => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim());
  if (!m) throw new Error(`bad date "${s}" (use YYYY-MM-DD)`);
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCMonth() !== +m[2] - 1) throw new Error(`bad date "${s}"`);
  return Math.round(t / DAY);
};
const dateOf = (d: number) => new Date(d * DAY);
export const fmtDay = (d: number) => {
  const x = dateOf(d);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
};
const monthStart = (y: number, m: number) => Math.round(Date.UTC(y, m, 1) / DAY);

type Unit = "day" | "week" | "month" | "quarter";
const MIN_PX: Record<Unit, number> = { day: 24, week: 44, month: 50, quarter: 64 };
const UNIT_DAYS: Record<Unit, number> = { day: 1, week: 7, month: 30.4, quarter: 91.3 };

/** Bottom-tier ticks [start, end) and top-tier spans for a unit. */
function ticks(unit: Unit, a: number, b: number) {
  const low: Array<{ s: number; e: number; label: string; weekend?: boolean }> = [];
  const top: Array<{ s: number; e: number; label: string }> = [];
  const pushTop = (s: number, e: number, label: string) => top.push({ s: Math.max(s, a), e: Math.min(e, b), label });
  const A = dateOf(a);
  if (unit === "day") {
    for (let d = a; d < b; d++) {
      const w = dateOf(d).getUTCDay();
      low.push({ s: d, e: d + 1, label: String(dateOf(d).getUTCDate()), weekend: w === 0 || w === 6 });
    }
  } else if (unit === "week") {
    const w0 = a - ((dateOf(a).getUTCDay() + 6) % 7);
    for (let d = w0; d < b; d += 7) low.push({ s: d, e: d + 7, label: `${dateOf(d).getUTCMonth() + 1}/${dateOf(d).getUTCDate()}` });
  } else if (unit === "month") {
    for (let y = A.getUTCFullYear(), m = A.getUTCMonth(); monthStart(y, m) < b; m === 11 ? ((m = 0), y++) : m++) low.push({ s: monthStart(y, m), e: monthStart(m === 11 ? y + 1 : y, (m + 1) % 12), label: MONTHS[m] });
  } else {
    for (let y = A.getUTCFullYear(), q = Math.floor(A.getUTCMonth() / 3); monthStart(y, q * 3) < b; q === 3 ? ((q = 0), y++) : q++) low.push({ s: monthStart(y, q * 3), e: q === 3 ? monthStart(y + 1, 0) : monthStart(y, q * 3 + 3), label: `Q${q + 1}` });
  }
  if (unit === "day" || unit === "week") {
    for (let y = A.getUTCFullYear(), m = A.getUTCMonth(); monthStart(y, m) < b; m === 11 ? ((m = 0), y++) : m++) pushTop(monthStart(y, m), monthStart(m === 11 ? y + 1 : y, (m + 1) % 12), `${MONTHS[m]} ${y}`);
  } else for (let y = A.getUTCFullYear(); monthStart(y, 0) < b; y++) pushTop(monthStart(y, 0), monthStart(y + 1, 0), String(y));
  return { low, top: top.filter((x) => x.e > x.s) };
}

export function layoutGantt(input: GanttInput, profile: DiagramProfile, legend: LegendItem[]): Scene {
  const t = archTheme(input.theme);
  const tasks = input.tasks;
  const gColor = new Map<string, string>(input.groups.map((g, i) => [g.id, t.roles[PALETTE[i % PALETTE.length]]]));
  const ungroupedColor = t.roles.client;
  // rows: groups in order, then ungrouped tasks
  type Row = { kind: "group"; id: string; label: string; color: string } | { kind: "task"; task: GanttTask; color: string };
  const rows: Row[] = [];
  const free = tasks.filter((x) => !x.group);
  for (const x of free) rows.push({ kind: "task", task: x, color: ungroupedColor });
  for (const g of input.groups) {
    const ts = tasks.filter((x) => x.group === g.id);
    if (!ts.length) continue;
    rows.push({ kind: "group", id: g.id, label: g.label, color: gColor.get(g.id)! });
    for (const x of ts) rows.push({ kind: "task", task: x, color: gColor.get(g.id)! });
  }
  let lo = Math.min(...tasks.map((x) => x.start));
  let hi = Math.max(...tasks.map((x) => Math.max(x.end, x.start + 1)));
  if (input.today != null) ((lo = Math.min(lo, input.today)), (hi = Math.max(hi, input.today + 1)));
  const span0 = hi - lo;
  // label column
  const LF = { font: "mono" as const, size: 12, weight: 500 };
  const GF = { font: "mono" as const, size: 12, weight: 700 };
  const labelW = Math.round(Math.min(300, Math.max(180, ...rows.map((r) => (r.kind === "group" ? measureText(r.label, GF) + 30 : measureText(r.task.label, LF) + 44)))));
  const axisH = 52;
  const footH = input.today != null ? 30 : 8;
  const bodyH = rows.length * ROW;
  const chromeH = sceneChromeH(1);
  const innerH = axisH + bodyH + footH;
  // unit + width
  const order: Unit[] = ["day", "week", "month", "quarter"];
  const natural: Unit = input.scale && input.scale !== "auto" ? input.scale : span0 <= 35 ? "day" : span0 <= 150 ? "week" : span0 <= 700 ? "month" : "quarter";
  const wantTotal = Math.min(2600, Math.max(1300, 1.62 * (innerH + chromeH)));
  let unit = natural;
  let chartW = Math.max(600, wantTotal - SCENE_CHROME_W - labelW);
  for (let k = order.indexOf(natural); k < order.length; k++) {
    unit = order[k];
    const pad = unit === "day" ? 1 : unit === "week" ? 3 : unit === "month" ? 10 : 20;
    const need = ((span0 + pad * 2) / UNIT_DAYS[unit]) * MIN_PX[unit];
    if (need <= 2600 - SCENE_CHROME_W - labelW || (input.scale && input.scale !== "auto")) {
      chartW = Math.max(chartW, need);
      break;
    }
  }
  // snap range to unit
  const pad = unit === "day" ? 1 : unit === "week" ? 3 : unit === "month" ? 10 : 20;
  let a = lo - pad;
  let b = hi + pad;
  if (unit === "week") a -= (dateOf(a).getUTCDay() + 6) % 7;
  if (unit === "month" || unit === "quarter") {
    const A = dateOf(a);
    a = monthStart(A.getUTCFullYear(), unit === "quarter" ? Math.floor(A.getUTCMonth() / 3) * 3 : A.getUTCMonth());
    const B = dateOf(b - 1);
    const mm = unit === "quarter" ? Math.floor(B.getUTCMonth() / 3) * 3 + 3 : B.getUTCMonth() + 1;
    b = mm >= 12 ? monthStart(B.getUTCFullYear() + 1, mm - 12) : monthStart(B.getUTCFullYear(), mm);
  }
  const { low, top } = ticks(unit, a, b);
  chartW = Math.round(chartW);
  const X = (d: number) => labelW + ((d - a) / (b - a)) * chartW;
  const W = labelW + chartW;
  const items: SItem[] = [];
  const y0 = axisH;
  // backgrounds
  items.push({ kind: "rect", x: 0, y: 0, w: W, h: axisH + bodyH, rx: 8, fill: { color: t.cardBase }, stroke: { color: t.muted, alpha: 0.35 } });
  items.push({ kind: "rect", x: 0, y: 0, w: W, h: axisH, rx: 8, fill: { color: t.muted, alpha: 0.08 } });
  rows.forEach((r, i) => {
    if (r.kind === "group") items.push({ kind: "rect", x: 1, y: y0 + i * ROW, w: W - 2, h: ROW, fill: { color: r.color, alpha: 0.07 } });
    else if (i % 2 === 1) items.push({ kind: "rect", x: 1, y: y0 + i * ROW, w: W - 2, h: ROW, fill: { color: t.muted, alpha: 0.035 } });
  });
  for (const k of low) if (k.weekend) items.push({ kind: "rect", x: X(k.s), y: y0, w: X(k.e) - X(k.s), h: bodyH, fill: { color: t.muted, alpha: 0.07 } });
  // axis
  for (const k of top) {
    const x1 = X(k.s);
    const x2 = X(k.e);
    items.push({ kind: "line", points: [{ x: x1, y: 4 }, { x: x1, y: y0 + bodyH }], color: t.muted, sw: 1, opacity: 0.35 });
    const TF = { font: "mono" as const, size: 12, weight: 700 };
    const lab = [k.label, k.label.split(" ")[0]].find((l) => measureText(l, TF) <= x2 - x1 - 14);
    if (lab) items.push({ kind: "text", x: x1 + 8, y: 20, text: lab, size: 12, weight: 700, color: t.ink, maxW: x2 - x1 - 8 });
  }
  const lowW = chartW / low.length;
  for (const k of low) {
    const x1 = X(k.s);
    const x2 = X(k.e);
    items.push({ kind: "line", points: [{ x: x1, y: 30 }, { x: x1, y: y0 + bodyH }], color: t.muted, sw: 1, opacity: 0.12 });
    if (lowW >= 18) items.push({ kind: "text", x: (Math.max(x1, labelW) + x2) / 2, y: 45, text: k.label, size: 12, color: k.weekend ? t.dim : t.muted, anchor: "middle", maxW: x2 - Math.max(x1, labelW) - 2, solid: false });
  }
  items.push({ kind: "line", points: [{ x: 0, y: y0 }, { x: W, y: y0 }], color: t.muted, sw: 1, opacity: 0.4 });
  items.push({ kind: "line", points: [{ x: labelW, y: 0 }, { x: labelW, y: y0 + bodyH }], color: t.muted, sw: 1, opacity: 0.4 });
  items.push({ kind: "text", x: 14, y: 30, text: unit === "day" ? "TASK · DAYS" : unit === "week" ? "TASK · WEEKS" : unit === "month" ? "TASK · MONTHS" : "TASK · QUARTERS", size: 11, weight: 600, color: t.dim, tracking: 0.12 });
  // rows
  const rowOf = new Map<string, number>();
  const barEnd = new Map<string, { x1: number; x2: number; y: number }>();
  rows.forEach((r, i) => {
    const y = y0 + i * ROW;
    if (r.kind === "group") {
      items.push({ kind: "rect", x: 12, y: y + 10, w: 10, h: 10, rx: 2, fill: { color: r.color } });
      items.push({ kind: "text", x: 30, y: y + 19.5, text: ellipsize(r.label, GF, labelW - 40).text, size: 12, weight: 700, color: r.color, maxW: labelW - 36 });
      const ts = tasks.filter((x) => x.group === r.id);
      const s = Math.min(...ts.map((x) => x.start));
      const e = Math.max(...ts.map((x) => Math.max(x.end, x.start)));
      const x1 = X(s);
      const x2 = Math.max(X(e), x1 + 4);
      items.push({ kind: "poly", points: [{ x: x1, y: y + 11 }, { x: x2, y: y + 11 }, { x: x2, y: y + 21 }, { x: x2 - 5, y: y + 16 }, { x: x1 + 5, y: y + 16 }, { x: x1, y: y + 21 }], fill: { color: r.color, alpha: 0.75 } });
      return;
    }
    const x = r.task;
    rowOf.set(x.id, i);
    items.push({ kind: "text", x: 30, y: y + 19.5, text: ellipsize(x.label, LF, labelW - 42).text, size: 12, weight: 500, color: t.ink, maxW: labelW - 36, group: `row${i}` });
    const cy = y + ROW / 2;
    if (x.milestone) {
      const mx = X(x.start);
      items.push({ kind: "poly", id: `ms-${x.id}`, points: [{ x: mx, y: cy - 9 }, { x: mx + 9, y: cy }, { x: mx, y: cy + 9 }, { x: mx - 9, y: cy }], fill: { color: x.critical ? t.alert : t.badgeFill }, stroke: { color: t.canvas }, sw: 1.5, drawio: "rhombus" });
      items.push({ kind: "text", x: mx + 15, y: cy + 4.5, text: fmtShort(x.start), size: 12, color: t.muted, solid: false });
      barEnd.set(x.id, { x1: mx - 9, x2: mx + 9, y: cy });
      return;
    }
    const x1 = X(x.start);
    const x2 = Math.max(X(x.end), x1 + 4);
    const bc = x.critical ? t.alert : r.color;
    items.push({ kind: "rect", x: x1, y: cy - 8, w: x2 - x1, h: 16, rx: 4, fill: { color: t.cardBase } });
    items.push({ kind: "rect", id: `bar-${x.id}`, x: x1, y: cy - 8, w: x2 - x1, h: 16, rx: 4, fill: { color: bc, alpha: 0.22 }, stroke: { color: bc, alpha: x.critical ? 1 : 0.85 }, sw: x.critical ? 1.6 : 1.1 });
    if (x.progress) items.push({ kind: "rect", x: x1 + 1, y: cy - 7, w: Math.max(2, (x2 - x1 - 2) * Math.min(1, x.progress / 100)), h: 14, rx: 3, fill: { color: bc, alpha: 0.6 } });
    const tag = [x.progress != null ? `${Math.round(x.progress)}%` : "", x.owner ?? ""].filter(Boolean).join(" · ");
    if (tag) {
      const tw = measureText(tag, { font: "mono", size: 12 });
      const right = x2 + 8 + tw <= W - 6;
      items.push({ kind: "text", x: right ? x2 + 8 : x1 - 8, y: cy + 4.5, text: tag, size: 12, color: t.muted, anchor: right ? "start" : "end", solid: false });
    }
    barEnd.set(x.id, { x1, x2, y: cy });
  });
  // dependencies (finish → start)
  for (const x of tasks)
    for (const dep of x.after) {
      const p = barEnd.get(dep);
      const q = barEnd.get(x.id);
      if (!p || !q) continue;
      const below = q.y > p.y;
      const ms = tasks.find((z) => z.id === dep)?.milestone;
      const vx = ms ? (p.x1 + p.x2) / 2 : Math.max(p.x1 + 3, Math.min(p.x2 - 6, q.x1 - 12));
      const sy = p.y + (below ? (ms ? 9 : 8) : ms ? -9 : -8);
      const pts =
        q.x1 >= vx + 10
          ? [{ x: vx, y: sy }, { x: vx, y: q.y }, { x: q.x1, y: q.y }]
          : [{ x: vx, y: sy }, { x: vx, y: q.y + (below ? -ROW / 2 : ROW / 2) }, { x: q.x1 - 10, y: q.y + (below ? -ROW / 2 : ROW / 2) }, { x: q.x1 - 10, y: q.y }, { x: q.x1, y: q.y }];
      items.push({ kind: "line", points: pts, color: t.muted, sw: 1.2, end: "arrow", radius: 3, opacity: 0.85 });
    }
  if (input.today != null) {
    const tx = X(input.today + 0.5);
    items.push({ kind: "line", points: [{ x: tx, y: y0 - 4 }, { x: tx, y: y0 + bodyH + 4 }], color: t.alert, sw: 1.6, dash: "5 3" });
    const lab = `TODAY ${fmtShort(input.today)}`;
    const lw = measureText(lab, { font: "mono", size: 12, weight: 700 }) + 16;
    const lx = Math.min(Math.max(tx - lw / 2, 0), W - lw);
    items.push({ kind: "rect", x: lx, y: y0 + bodyH + 6, w: lw, h: 20, rx: 10, fill: { color: t.alert, alpha: 0.18 }, stroke: { color: t.alert } });
    items.push({ kind: "text", x: lx + lw / 2, y: y0 + bodyH + 20, text: lab, size: 12, weight: 700, color: t.alert, anchor: "middle" });
  }
  const span = `${fmtDay(lo)} → ${fmtDay(hi - 1)}`;
  return frameScene({
    title: input.title,
    subtitle: input.subtitle,
    meta: `${tasks.filter((x) => !x.milestone).length} TASKS · ${tasks.filter((x) => x.milestone).length} MILESTONES · ${span}`,
    profile,
    legend,
    innerW: W,
    innerH,
    items,
  });
}

function fmtShort(d: number) {
  const x = dateOf(d);
  return `${x.getUTCMonth() + 1}/${x.getUTCDate()}`;
}
