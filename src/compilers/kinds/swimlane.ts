/** Swimlane (cross-functional flowchart) → lane model → swimlane layout. */
import type { z } from "zod";
import type { DiagramEdge, DiagramGroup, DiagramNode, EdgeKind } from "../../types.js";
import type { NodeRole } from "../../design/themes.js";
import type { LegendItem } from "../../layout/types.js";
import type { swimlaneSchema } from "../../tools/kindSchemas.js";
import { layoutSwimlane, flowRanks } from "../../layout/swimlane.js";
import { compileModel, type CompiledArchitecture } from "../architecture.js";
import { validateModel } from "./common.js";

type SwimlaneInput = z.infer<typeof swimlaneSchema>;

const STEP: Record<string, { shape?: DiagramNode["shape"]; role: NodeRole; icon: string }> = {
  start: { shape: "terminator", role: "compute", icon: "none" },
  end: { shape: "terminator", role: "default", icon: "none" },
  task: { role: "client", icon: "user" },
  decision: { shape: "decision", role: "queue", icon: "none" },
  document: { role: "storage", icon: "file" },
  system: { role: "network", icon: "server" },
  wait: { role: "observability", icon: "activity" },
};

export function compileSwimlane(input: SwimlaneInput): CompiledArchitecture {
  const groups: DiagramGroup[] = input.lanes.map((l) => ({ id: l.id, label: l.label, kind: "lane", tag: l.description }));
  const nodes: DiagramNode[] = input.steps.map((s) => {
    const t = STEP[s.type ?? "task"];
    return { id: s.id, label: s.label, description: s.description, shape: t.shape, role: t.role, icon: t.icon, group: s.lane };
  });
  const edges: DiagramEdge[] = input.flows.map((f) => ({ from: f.from, to: f.to, label: f.label, kind: (f.kind ?? "sync") as EdgeKind }));
  validateModel("create_swimlane", nodes, groups, edges);
  for (const n of nodes) if (!n.group) throw new Error(`create_swimlane: step "${n.id}" needs a lane`);
  const columnOf: Record<string, number> = {};
  for (const s of input.steps) if (s.column != null) columnOf[s.id] = s.column;
  if (input.numbering !== false) {
    const rank = flowRanks(nodes, edges, columnOf);
    const laneIdx = new Map(groups.map((g, i) => [g.id, i]));
    const tasks = nodes.filter((n) => !n.shape).sort((a, b) => rank.get(a.id)! - rank.get(b.id)! || laneIdx.get(a.group!)! - laneIdx.get(b.group!)!);
    tasks.forEach((n, i) => (n.tag = String(i + 1).padStart(2, "0")));
  }
  const kinds = new Set(edges.map((e) => e.kind));
  const legend: LegendItem[] = [
    { label: "Lane (team / role)", mark: "lane", role: "gateway" },
    { label: "Task", role: "client" },
    ...(nodes.some((n) => n.role === "network") ? [{ label: "System step", role: "network" as NodeRole }] : []),
    ...(nodes.some((n) => n.shape === "decision") ? [{ label: "Decision", mark: "decision" as const, role: "queue" as NodeRole }] : []),
    ...(kinds.has("sync") ? [{ label: "Sequence / handoff", kind: "sync" as EdgeKind }] : []),
    ...(kinds.has("async") ? [{ label: "Async / notification", kind: "async" as EdgeKind }] : []),
    ...(kinds.has("auth") ? [{ label: "Reject / rework", kind: "auth" as EdgeKind }] : []),
  ];
  return compileModel(
    { title: input.title, subtitle: input.subtitle, theme: input.theme, nodes, groups, edges, legend, profile: { kind: "swimlane", caption: "SWIMLANE · CROSS-FUNCTIONAL FLOW", nodeNoun: "STEPS", edgeNoun: "HANDOFFS" }, swimlane: { columnOf } } as Parameters<typeof layoutSwimlane>[0],
    { theme: input.theme, outputs: input.outputs, layout: (m) => layoutSwimlane(m as Parameters<typeof layoutSwimlane>[0]) },
  );
}
