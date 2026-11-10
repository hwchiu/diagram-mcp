import type { NodeRole } from "../design/themes.js";
import type { EdgeKind } from "../types.js";
import type { DiagramGroup } from "../types.js";

/**
 * Architecture palette — Cocoon-AI "architecture-diagram-generator" design
 * language (MIT): slate-950 canvas, 40px grid, semantic stroke colors with
 * translucent fills, JetBrains Mono throughout.
 */
export interface ArchTheme {
  id: "dark" | "light";
  canvas: string;
  gridLine: string;
  panel: string;
  panelStroke: string;
  cardBase: string;
  ink: string;
  muted: string;
  dim: string;
  frameStroke: string;
  frameFill: string;
  pillFill: string;
  badgeFill: string;
  badgeInk: string;
  titleDot: string;
  mono: string;
  sans: string;
  fillAlpha: number;
  glow: boolean;
  roles: Record<NodeRole, string>;
  edges: Record<EdgeKind, string>;
  frameKinds: Partial<Record<NonNullable<DiagramGroup["kind"]>, string>>;
  /** sensitive data / trust-boundary alert color */
  alert: string;
}

const MONO = "'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'Noto Sans Mono CJK TC', monospace";
const SANS = "Inter, 'SF Pro Text', 'Segoe UI', 'Noto Sans CJK TC', 'PingFang TC', system-ui, sans-serif";

export const DARK: ArchTheme = {
  id: "dark",
  canvas: "#020617",
  gridLine: "#1e293b",
  panel: "rgba(15,23,42,0.55)",
  panelStroke: "rgba(148,163,184,0.16)",
  cardBase: "#0a1020",
  ink: "#e2e8f0",
  muted: "#94a3b8",
  dim: "#64748b",
  frameStroke: "rgba(148,163,184,0.42)",
  frameFill: "rgba(15,23,42,0.45)",
  pillFill: "#020617",
  badgeFill: "#fbbf24",
  badgeInk: "#1c1203",
  titleDot: "#34d399",
  mono: MONO,
  sans: SANS,
  fillAlpha: 0.13,
  glow: true,
  roles: {
    client: "#22d3ee",
    network: "#38bdf8",
    gateway: "#818cf8",
    security: "#fb7185",
    compute: "#34d399",
    data: "#a78bfa",
    queue: "#fb923c",
    storage: "#fbbf24",
    observability: "#f472b6",
    external: "#94a3b8",
    default: "#94a3b8",
  },
  edges: {
    sync: "#22d3ee",
    async: "#c084fc",
    data: "#34d399",
    auth: "#fb7185",
    default: "#64748b",
  },
  frameKinds: {
    region: "#fbbf24",
    vpc: "#a78bfa",
    cluster: "#22d3ee",
    namespace: "#34d399",
    subnet: "#38bdf8",
    zone: "#94a3b8",
    security: "#fb7185",
    external: "#94a3b8",
    boundary: "#60a5fa",
    trust: "#f43f5e",
    pool: "#38bdf8",
    internet: "#94a3b8",
    dmz: "#f59e0b",
    site: "#2dd4bf",
    lane: "#818cf8",
    composite: "#818cf8",
    stage: "#38bdf8",
    taskgroup: "#34d399",
  },
  alert: "#f43f5e",
};

export const LIGHT: ArchTheme = {
  id: "light",
  canvas: "#f8fafc",
  gridLine: "#e2e8f0",
  panel: "rgba(255,255,255,0.85)",
  panelStroke: "#e2e8f0",
  cardBase: "#ffffff",
  ink: "#0f172a",
  muted: "#475569",
  dim: "#94a3b8",
  frameStroke: "#94a3b8",
  frameFill: "rgba(241,245,249,0.6)",
  pillFill: "#ffffff",
  badgeFill: "#0f172a",
  badgeInk: "#ffffff",
  titleDot: "#059669",
  mono: MONO,
  sans: SANS,
  fillAlpha: 0.08,
  glow: false,
  roles: {
    client: "#0891b2",
    network: "#0284c7",
    gateway: "#4f46e5",
    security: "#e11d48",
    compute: "#059669",
    data: "#7c3aed",
    queue: "#ea580c",
    storage: "#d97706",
    observability: "#db2777",
    external: "#64748b",
    default: "#64748b",
  },
  edges: {
    sync: "#0369a1",
    async: "#7c3aed",
    data: "#059669",
    auth: "#e11d48",
    default: "#64748b",
  },
  frameKinds: {
    region: "#d97706",
    vpc: "#7c3aed",
    cluster: "#0891b2",
    namespace: "#059669",
    subnet: "#0284c7",
    zone: "#64748b",
    security: "#e11d48",
    external: "#64748b",
    boundary: "#2563eb",
    trust: "#e11d48",
    pool: "#0284c7",
    internet: "#64748b",
    dmz: "#d97706",
    site: "#0d9488",
    lane: "#4f46e5",
    composite: "#4f46e5",
    stage: "#0284c7",
    taskgroup: "#059669",
  },
  alert: "#e11d48",
};

export function archTheme(themeId?: string): ArchTheme {
  return themeId === "light" || themeId === "presentation" ? LIGHT : DARK;
}

export function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function tierAccent(t: ArchTheme, kind: DiagramGroup["kind"] | undefined, role: NodeRole, external: boolean): string {
  if (external) return t.roles.external;
  if (kind && t.frameKinds[kind]) return t.frameKinds[kind]!;
  return t.roles[role] ?? t.roles.default;
}
