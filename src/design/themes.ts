/** Visual design system — curated palettes for professional technical diagrams. */

export type ThemeId = "light" | "dark" | "presentation" | "blueprint";

export type NodeRole =
  | "compute"
  | "data"
  | "network"
  | "security"
  | "external"
  | "queue"
  | "gateway"
  | "storage"
  | "observability"
  | "default";

export interface ThemePalette {
  id: ThemeId;
  label: string;
  /** Canvas / page background */
  canvas: string;
  /** Primary ink for titles */
  ink: string;
  /** Secondary / muted text */
  muted: string;
  /** Hairline / borders */
  border: string;
  /** Soft surface for cards */
  surface: string;
  /** Elevated card fill */
  card: string;
  /** Accent for titles / highlights */
  accent: string;
  /** Group container fills by nesting depth (0 = outermost) */
  groupFills: string[];
  groupStrokes: string[];
  /** Edge colors */
  edgeSync: string;
  edgeAsync: string;
  edgeData: string;
  edgeDefault: string;
  /** Role fills / strokes */
  roles: Record<NodeRole, { fill: string; stroke: string; tint: string }>;
  /** Mermaid / Graphviz font family stack */
  fontFamily: string;
  /** Title block */
  titleBg: string;
  legendBg: string;
}

export const THEMES: Record<ThemeId, ThemePalette> = {
  light: {
    id: "light",
    label: "Light",
    canvas: "#F7F8FA",
    ink: "#0F172A",
    muted: "#64748B",
    border: "#CBD5E1",
    surface: "#FFFFFF",
    card: "#FFFFFF",
    accent: "#2563EB",
    groupFills: ["#EEF2FF", "#F0F9FF", "#F0FDF4", "#FFF7ED", "#FAF5FF"],
    groupStrokes: ["#6366F1", "#0EA5E9", "#22C55E", "#F97316", "#A855F7"],
    edgeSync: "#334155",
    edgeAsync: "#7C3AED",
    edgeData: "#059669",
    edgeDefault: "#64748B",
    roles: {
      compute: { fill: "#EFF6FF", stroke: "#3B82F6", tint: "#DBEAFE" },
      data: { fill: "#ECFDF5", stroke: "#10B981", tint: "#D1FAE5" },
      network: { fill: "#F0F9FF", stroke: "#0EA5E9", tint: "#E0F2FE" },
      security: { fill: "#FEF2F2", stroke: "#EF4444", tint: "#FEE2E2" },
      external: { fill: "#F8FAFC", stroke: "#94A3B8", tint: "#F1F5F9" },
      queue: { fill: "#F5F3FF", stroke: "#8B5CF6", tint: "#EDE9FE" },
      gateway: { fill: "#FFF7ED", stroke: "#F97316", tint: "#FFEDD5" },
      storage: { fill: "#FFFBEB", stroke: "#F59E0B", tint: "#FEF3C7" },
      observability: { fill: "#FDF2F8", stroke: "#EC4899", tint: "#FCE7F3" },
      default: { fill: "#FFFFFF", stroke: "#94A3B8", tint: "#F8FAFC" },
    },
    fontFamily: '"Inter", "SF Pro Text", "Segoe UI", "Helvetica Neue", sans-serif',
    titleBg: "#FFFFFF",
    legendBg: "#FFFFFF",
  },
  dark: {
    id: "dark",
    label: "Dark",
    canvas: "#0B1220",
    ink: "#E2E8F0",
    muted: "#94A3B8",
    border: "#334155",
    surface: "#111827",
    card: "#1E293B",
    accent: "#60A5FA",
    groupFills: ["#1E1B4B", "#0C4A6E", "#052E16", "#431407", "#3B0764"],
    groupStrokes: ["#818CF8", "#38BDF8", "#4ADE80", "#FB923C", "#C084FC"],
    edgeSync: "#CBD5E1",
    edgeAsync: "#A78BFA",
    edgeData: "#34D399",
    edgeDefault: "#64748B",
    roles: {
      compute: { fill: "#1E3A5F", stroke: "#60A5FA", tint: "#1E40AF" },
      data: { fill: "#064E3B", stroke: "#34D399", tint: "#065F46" },
      network: { fill: "#0C4A6E", stroke: "#38BDF8", tint: "#075985" },
      security: { fill: "#7F1D1D", stroke: "#F87171", tint: "#991B1B" },
      external: { fill: "#1E293B", stroke: "#64748B", tint: "#334155" },
      queue: { fill: "#4C1D95", stroke: "#A78BFA", tint: "#5B21B6" },
      gateway: { fill: "#7C2D12", stroke: "#FB923C", tint: "#9A3412" },
      storage: { fill: "#78350F", stroke: "#FBBF24", tint: "#92400E" },
      observability: { fill: "#831843", stroke: "#F472B6", tint: "#9D174D" },
      default: { fill: "#1E293B", stroke: "#64748B", tint: "#334155" },
    },
    fontFamily: '"Inter", "SF Pro Text", "Segoe UI", "Helvetica Neue", sans-serif',
    titleBg: "#111827",
    legendBg: "#111827",
  },
  presentation: {
    id: "presentation",
    label: "Presentation",
    canvas: "#FFFFFF",
    ink: "#111827",
    muted: "#6B7280",
    border: "#E5E7EB",
    surface: "#FFFFFF",
    card: "#FFFFFF",
    accent: "#1D4ED8",
    groupFills: ["#F5F3FF", "#EFF6FF", "#ECFDF5", "#FFF7ED", "#FDF2F8"],
    groupStrokes: ["#7C3AED", "#2563EB", "#059669", "#EA580C", "#DB2777"],
    edgeSync: "#1F2937",
    edgeAsync: "#7C3AED",
    edgeData: "#059669",
    edgeDefault: "#6B7280",
    roles: {
      compute: { fill: "#EFF6FF", stroke: "#2563EB", tint: "#DBEAFE" },
      data: { fill: "#ECFDF5", stroke: "#059669", tint: "#D1FAE5" },
      network: { fill: "#F0F9FF", stroke: "#0284C7", tint: "#E0F2FE" },
      security: { fill: "#FEF2F2", stroke: "#DC2626", tint: "#FEE2E2" },
      external: { fill: "#F9FAFB", stroke: "#9CA3AF", tint: "#F3F4F6" },
      queue: { fill: "#F5F3FF", stroke: "#7C3AED", tint: "#EDE9FE" },
      gateway: { fill: "#FFF7ED", stroke: "#EA580C", tint: "#FFEDD5" },
      storage: { fill: "#FFFBEB", stroke: "#D97706", tint: "#FEF3C7" },
      observability: { fill: "#FDF2F8", stroke: "#DB2777", tint: "#FCE7F3" },
      default: { fill: "#FFFFFF", stroke: "#9CA3AF", tint: "#F9FAFB" },
    },
    fontFamily: '"Inter", "SF Pro Display", "Segoe UI", "Helvetica Neue", sans-serif',
    titleBg: "#F8FAFC",
    legendBg: "#F8FAFC",
  },
  blueprint: {
    id: "blueprint",
    label: "Blueprint",
    canvas: "#0A1628",
    ink: "#E0F2FE",
    muted: "#7DD3FC",
    border: "#1E3A5F",
    surface: "#0C1A2E",
    card: "#0F2744",
    accent: "#38BDF8",
    groupFills: ["#0F2744", "#0C4A6E", "#164E63", "#1E3A5F", "#172554"],
    groupStrokes: ["#38BDF8", "#22D3EE", "#67E8F9", "#7DD3FC", "#BAE6FD"],
    edgeSync: "#BAE6FD",
    edgeAsync: "#A5B4FC",
    edgeData: "#6EE7B7",
    edgeDefault: "#7DD3FC",
    roles: {
      compute: { fill: "#0F2744", stroke: "#38BDF8", tint: "#1E3A5F" },
      data: { fill: "#064E3B", stroke: "#6EE7B7", tint: "#065F46" },
      network: { fill: "#0C4A6E", stroke: "#22D3EE", tint: "#155E75" },
      security: { fill: "#4C0519", stroke: "#FB7185", tint: "#881337" },
      external: { fill: "#1E293B", stroke: "#94A3B8", tint: "#334155" },
      queue: { fill: "#1E1B4B", stroke: "#A5B4FC", tint: "#312E81" },
      gateway: { fill: "#431407", stroke: "#FDBA74", tint: "#7C2D12" },
      storage: { fill: "#422006", stroke: "#FCD34D", tint: "#78350F" },
      observability: { fill: "#500724", stroke: "#F9A8D4", tint: "#9D174D" },
      default: { fill: "#0F2744", stroke: "#7DD3FC", tint: "#1E3A5F" },
    },
    fontFamily: '"IBM Plex Sans", "Inter", "Segoe UI", sans-serif',
    titleBg: "#0C1A2E",
    legendBg: "#0C1A2E",
  },
};

export function getTheme(id?: string): ThemePalette {
  if (id && id in THEMES) return THEMES[id as ThemeId];
  return THEMES.light;
}
