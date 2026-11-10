/**
 * Group 2 (layered DAG family) + graph-shaped Group 3 kinds: data lineage,
 * workflow DAG, dependency / impact graph, knowledge graph, flowchart,
 * decision tree, state machine and ERD. Each maps its schema onto
 * nodes / clusters / edges and runs the layered (Sugiyama) layout; routing,
 * QA, SVG and draw.io are the shared engine's.
 */
import type { z } from "zod";
import type { DiagramEdge, DiagramGroup, DiagramNode, EdgeKind, EdgeMark, TableRow } from "../../types.js";
import type { NodeRole } from "../../design/themes.js";
import type { DiagramProfile, LegendItem } from "../../layout/types.js";
import { layoutLayered, type LayeredLayoutInput, type LayeredOptions } from "../../layout/layered.js";
import { flowRanks } from "../../layout/swimlane.js";
import { measureText } from "../../layout/text.js";
import { labelWithTags } from "../../layout/notation.js";
import { compileModel, type CompiledArchitecture } from "../architecture.js";
import { compileSwimlane } from "./swimlane.js";
import { validateModel } from "./common.js";
import type {
  decisionKindSchema,
  dependencyGraphSchema,
  erdSchema,
  flowchartKindSchema,
  knowledgeGraphSchema,
  lineageSchema,
  stateMachineSchema,
  workflowSchema,
} from "../../tools/kindSchemas.js";

interface Meta {
  title?: string;
  subtitle?: string;
  theme?: string;
  outputs?: Array<"svg" | "png" | "drawio">;
}

function run(tool: string, nodes: DiagramNode[], groups: DiagramGroup[], edges: DiagramEdge[], legend: LegendItem[], profile: DiagramProfile, layered: LayeredOptions, meta: Meta): CompiledArchitecture {
  validateModel(tool, nodes, groups, edges.filter((e) => e.from !== e.to));
  const model: LayeredLayoutInput = { title: meta.title, subtitle: meta.subtitle, theme: meta.theme, nodes, groups, edges, legend, profile, layered };
  return compileModel(model, { theme: meta.theme, outputs: meta.outputs, layout: (m) => layoutLayered(m as LayeredLayoutInput) });
}

/** Nodes reachable from `start` following `adj` (start excluded). */
export function reach(start: string[], edges: Array<{ from: string; to: string }>, dir: "down" | "up"): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const [a, b] = dir === "down" ? [e.from, e.to] : [e.to, e.from];
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
  }
  const seen = new Set<string>();
  const q = [...start];
  while (q.length) {
    const u = q.shift()!;
    for (const v of adj.get(u) ?? []) if (!seen.has(v) && !start.includes(v)) (seen.add(v), q.push(v));
  }
  return seen;
}

/** Dim everything outside `keep`; edges stay lit only when both ends are kept. */
function dimOutside(nodes: DiagramNode[], edges: DiagramEdge[], keep: Set<string>, onPath?: (e: DiagramEdge) => boolean): void {
  for (const n of nodes) if (!keep.has(n.id)) n.dim = true;
  for (const e of edges) if (!(keep.has(e.from) && keep.has(e.to) && (!onPath || onPath(e)))) e.dim = true;
}

// ── Data lineage ─────────────────────────────────────────────────────────────
const DS: Record<string, { role: NodeRole; icon: string; shape?: DiagramNode["shape"]; noun: string }> = {
  source: { role: "external", icon: "database", noun: "Source system" },
  table: { role: "data", icon: "table", noun: "Table" },
  view: { role: "data", icon: "layers", noun: "View" },
  file: { role: "storage", icon: "file", noun: "File / object" },
  stream: { role: "queue", icon: "stream", noun: "Stream / topic" },
  job: { role: "compute", icon: "play", noun: "Job / transform" },
  model: { role: "observability", icon: "cpu", noun: "ML model" },
  dashboard: { role: "client", icon: "chart", noun: "Dashboard" },
  report: { role: "client", icon: "file", noun: "Report" },
  api: { role: "gateway", icon: "plug", noun: "API" },
};
const FLOW_KIND: Record<string, EdgeKind> = { batch: "sync", stream: "async", cdc: "data", manual: "default" };

export function compileLineage(input: z.infer<typeof lineageSchema>): CompiledArchitecture {
  const nodes: DiagramNode[] = input.datasets.map((d) => {
    const t = DS[d.type ?? "table"];
    return { id: d.id, label: d.label, subtitle: d.system, description: d.description, role: t.role, icon: t.icon, tag: d.tags?.length ? d.tags.join(" · ") : undefined };
  });
  const edges: DiagramEdge[] = input.flows.map((f) => ({ from: f.from, to: f.to, label: f.label, kind: FLOW_KIND[f.kind ?? "batch"] }));
  if (input.focus) {
    const dir = input.focus.direction ?? "both";
    const keep = new Set([input.focus.node]);
    if (dir !== "downstream") for (const u of reach([input.focus.node], edges, "up")) keep.add(u);
    if (dir !== "upstream") for (const u of reach([input.focus.node], edges, "down")) keep.add(u);
    dimOutside(nodes, edges, keep);
    const f = nodes.find((n) => n.id === input.focus!.node);
    if (f) f.emphasis = "focus";
  }
  const used = [...new Set(input.datasets.map((d) => d.type ?? "table"))];
  const kinds = [...new Set(input.flows.map((f) => f.kind ?? "batch"))];
  const legend: LegendItem[] = [
    ...used.map((u) => ({ label: DS[u].noun, role: DS[u].role })),
    ...kinds.map((k) => ({ label: { batch: "Batch load", stream: "Streaming", cdc: "CDC / replication", manual: "Manual / export" }[k]!, kind: FLOW_KIND[k] })),
    ...(input.focus ? [{ label: "Outside the focused lineage", mark: "dimmed" as const }] : []),
  ];
  const stageOf: Record<string, string> = {};
  for (const d of input.datasets) if (d.stage) stageOf[d.id] = d.stage;
  if (input.stages?.length) for (const d of input.datasets) if (d.stage && !input.stages.some((s) => s.id === d.stage)) throw new Error(`create_data_lineage: dataset "${d.id}" references unknown stage "${d.stage}". Known: ${input.stages.map((s) => s.id).join(", ")}`);
  return run(
    "create_data_lineage",
    nodes,
    [],
    edges,
    legend,
    { kind: "lineage", caption: "DATA LINEAGE", nodeNoun: "DATASETS", edgeNoun: "FLOWS" },
    { direction: input.direction, prefer: "LR", wrap: input.wrap, stages: input.stages?.map((s) => ({ id: s.id, label: s.label, tag: s.description })), stageOf },
    input,
  );
}

// ── Workflow DAG ─────────────────────────────────────────────────────────────
const STATUS: Record<string, { role: NodeRole; label: string; icon: string }> = {
  success: { role: "compute", label: "Success", icon: "approve" },
  failed: { role: "security", label: "Failed", icon: "cross" },
  running: { role: "network", label: "Running", icon: "activity" },
  queued: { role: "default", label: "Queued", icon: "clock" },
  skipped: { role: "external", label: "Skipped", icon: "play" },
  upstream_failed: { role: "queue", label: "Upstream failed", icon: "cross" },
  none: { role: "gateway", label: "Task", icon: "play" },
};

export function compileWorkflow(input: z.infer<typeof workflowSchema>): CompiledArchitecture {
  const groups: DiagramGroup[] = (input.groups ?? []).map((g) => ({ id: g.id, label: g.label, parent: g.parent, kind: "taskgroup" }));
  const nodes: DiagramNode[] = input.tasks.map((t) => {
    const s = STATUS[t.status ?? "none"];
    return {
      id: t.id,
      label: t.label,
      subtitle: t.operator,
      description: t.description,
      role: s.role,
      icon: t.icon ?? s.icon,
      group: t.group,
      tag: t.status && t.status !== "none" ? s.label.toUpperCase() : undefined,
      dim: t.status === "skipped" ? true : undefined,
    };
  });
  const edges: DiagramEdge[] = input.dependencies.map((d) => ({ from: d.from, to: d.to, label: d.label ?? (d.condition && d.condition !== "success" ? `on ${d.condition}` : undefined), kind: d.condition === "failure" ? "auth" : d.condition === "always" ? "async" : "sync" }));
  const statuses = [...new Set(input.tasks.map((t) => t.status ?? "none"))];
  const legend: LegendItem[] = [
    ...statuses.map((s) => ({ label: STATUS[s].label, role: STATUS[s].role })),
    ...(groups.length ? [{ label: "Task group", mark: "composite" as const, role: "compute" as NodeRole }] : []),
    { label: "Runs after (on success)", kind: "sync" },
    ...(edges.some((e) => e.kind === "auth") ? [{ label: "On failure", kind: "auth" as EdgeKind }] : []),
    ...(edges.some((e) => e.kind === "async") ? [{ label: "Always", kind: "async" as EdgeKind }] : []),
  ];
  return run(
    "create_workflow_dag",
    nodes,
    groups,
    edges,
    legend,
    { kind: "workflow", caption: input.schedule ? `WORKFLOW DAG · SCHEDULE ${input.schedule}` : "WORKFLOW DAG", nodeNoun: "TASKS", edgeNoun: "DEPENDENCIES" },
    { direction: input.direction, prefer: "LR", wrap: input.wrap, frameIndex: false },
    input,
  );
}

// ── Dependency / impact graph ───────────────────────────────────────────────
const DEP_TYPE: Record<string, { role: NodeRole; icon: string }> = {
  service: { role: "compute", icon: "server" },
  library: { role: "gateway", icon: "package" },
  database: { role: "data", icon: "database" },
  queue: { role: "queue", icon: "stream" },
  external: { role: "external", icon: "globe" },
  app: { role: "client", icon: "browser" },
};

export function compileDependencyGraph(input: z.infer<typeof dependencyGraphSchema>): CompiledArchitecture {
  const groups: DiagramGroup[] = (input.groups ?? []).map((g) => ({ id: g.id, label: g.label, parent: g.parent, kind: "zone" }));
  const nodes: DiagramNode[] = input.nodes.map((n) => {
    const t = DEP_TYPE[n.type ?? "service"];
    return { id: n.id, label: n.label, subtitle: n.subtitle, description: n.description, role: n.role ?? t.role, icon: n.icon ?? t.icon, group: n.group };
  });
  const edges: DiagramEdge[] = input.edges.map((e) => ({ from: e.from, to: e.to, label: e.label, kind: e.kind ?? (e.optional ? "async" : "sync") }));
  const legend: LegendItem[] = [{ label: "Depends on", kind: "sync" }, ...(edges.some((e) => e.kind === "async") ? [{ label: "Optional / soft", kind: "async" as EdgeKind }] : [])];
  let subtitle = input.subtitle;
  if (input.changed?.length) {
    const known = new Set(nodes.map((n) => n.id));
    for (const c of input.changed) if (!known.has(c)) throw new Error(`create_dependency_graph: changed node "${c}" is not in nodes`);
    const mode = input.impact ?? "dependents";
    const hit = new Set<string>();
    if (mode !== "dependencies") for (const u of reach(input.changed, edges, "up")) hit.add(u);
    if (mode !== "dependents") for (const u of reach(input.changed, edges, "down")) hit.add(u);
    const keep = new Set([...input.changed, ...hit]);
    for (const n of nodes) {
      if (input.changed.includes(n.id)) {
        n.emphasis = "changed";
        n.tag = "CHANGED";
        n.role = "security";
      } else if (hit.has(n.id)) {
        n.emphasis = "impacted";
        n.tag = "IMPACTED";
      }
    }
    // impact edges: along a dependency path between kept nodes
    dimOutside(nodes, edges, keep);
    for (const e of edges) if (!e.dim) e.highlight = true;
    legend.unshift({ label: "Changed", mark: "changed" }, { label: `Impacted (${hit.size})`, mark: "impacted" }, { label: "Not affected", mark: "dimmed" });
    legend.push({ label: "Impact path", kind: "sync" });
    legend.splice(legend.findIndex((l) => l.label === "Impact path"), 1);
    subtitle = subtitle ?? `Change to ${input.changed.map((c) => nodes.find((n) => n.id === c)!.label).join(", ")} impacts ${hit.size} of ${nodes.length - input.changed.length} components`;
  }
  const dir = input.direction ?? "auto";
  return run(
    "create_dependency_graph",
    nodes,
    groups,
    edges,
    legend,
    { kind: "dependency", caption: input.changed?.length ? "DEPENDENCY · IMPACT ANALYSIS" : "DEPENDENCY GRAPH", nodeNoun: "COMPONENTS", edgeNoun: "DEPENDENCIES" },
    { direction: dir, prefer: "LR", wrap: input.wrap, frameIndex: false, blockDir: "auto" },
    { ...input, subtitle },
  );
}

// ── Knowledge graph ─────────────────────────────────────────────────────────
const PALETTE: NodeRole[] = ["network", "compute", "data", "queue", "observability", "storage", "gateway", "client", "security"];

export function compileKnowledgeGraph(input: z.infer<typeof knowledgeGraphSchema>): CompiledArchitecture {
  const types = input.types ?? [];
  const typeIds = [...new Set([...types.map((t) => t.id), ...input.entities.map((e) => e.type).filter((x): x is string => !!x)])];
  const tinfo = new Map(
    typeIds.map((id, i) => {
      const t = types.find((x) => x.id === id);
      return [id, { label: t?.label ?? id, role: (t?.color ?? PALETTE[i % PALETTE.length]) as NodeRole, icon: t?.icon ?? "circle" }];
    }),
  );
  const nodes: DiagramNode[] = input.entities.map((e) => {
    const t = e.type ? tinfo.get(e.type)! : { label: "", role: "default" as NodeRole, icon: "circle" };
    const attrs = (e.attributes ?? []).slice(0, 3);
    return { id: e.id, label: e.label, subtitle: attrs.length ? undefined : e.description, description: attrs.length ? attrs.join(" · ") : undefined, role: t.role, icon: t.icon, tag: t.label ? t.label.toUpperCase() : undefined };
  });
  const edges: DiagramEdge[] = input.relations.map((r) => {
    const tax = r.kind === "is_a" || r.kind === "instance_of";
    return { from: r.from, to: r.to, label: r.label, kind: tax ? "async" : r.kind === "part_of" ? "data" : "sync", endMark: tax ? "open" : undefined, bidirectional: r.bidirectional };
  });
  if (input.focus) {
    const dir = input.focus.direction ?? "both";
    const keep = new Set([input.focus.node]);
    for (const e of edges) {
      if (dir !== "upstream" && e.from === input.focus.node) keep.add(e.to);
      if (dir !== "downstream" && e.to === input.focus.node) keep.add(e.from);
    }
    dimOutside(nodes, edges, keep, (e) => e.from === input.focus!.node || e.to === input.focus!.node);
    const f = nodes.find((n) => n.id === input.focus!.node);
    if (f) f.emphasis = "focus";
  }
  const legend: LegendItem[] = [
    ...[...tinfo.values()].map((t) => ({ label: t.label, role: t.role })),
    { label: "Relation (predicate)", kind: "sync" },
    ...(edges.some((e) => e.kind === "async") ? [{ label: "is_a / instance_of", kind: "async" as EdgeKind }] : []),
    ...(edges.some((e) => e.kind === "data") ? [{ label: "part_of", kind: "data" as EdgeKind }] : []),
  ];
  return run(
    "create_knowledge_graph",
    nodes,
    [],
    edges,
    legend,
    { kind: "knowledge", caption: "ONTOLOGY · KNOWLEDGE GRAPH", nodeNoun: "ENTITIES", edgeNoun: "RELATIONS" },
    { direction: input.direction, prefer: "LR", wrap: input.wrap },
    input,
  );
}

// ── Flowchart ───────────────────────────────────────────────────────────────
const FC: Record<string, { shape?: DiagramNode["shape"]; role: NodeRole; icon?: string; legend: string; mark?: LegendItem["mark"] }> = {
  start: { shape: "terminator", role: "compute", legend: "Start / end", mark: "terminator" },
  end: { shape: "terminator", role: "default", legend: "Start / end", mark: "terminator" },
  process: { shape: "process", role: "network", legend: "Process step", mark: "process" },
  decision: { shape: "decision", role: "queue", legend: "Decision", mark: "decision" },
  io: { shape: "io", role: "data", legend: "Input / output", mark: "io" },
  subprocess: { shape: "subprocess", role: "gateway", legend: "Sub-process", mark: "subprocess" },
  document: { shape: "document", role: "storage", legend: "Document" },
  data: { shape: "cylinder", role: "data", icon: "database", legend: "Data store" },
  wait: { shape: "process", role: "observability", legend: "Wait / delay", mark: "process" },
};
const YES = /^(yes|y|true|ok|pass(ed)?|valid|approved?|是|通過|成功|有|符合|同意|核准)\b|^(是|通過|成功|有|符合|同意|核准)/i;
const NO = /^(no|n|false|fail(ed)?|invalid|reject(ed)?|deny|denied|否|不|退回|失敗|無|拒絕|駁回)\b|^(否|不|退回|失敗|無|拒絕|駁回)/i;

export function branchKind(label: string | undefined): EdgeKind | undefined {
  if (!label) return undefined;
  const s = label.trim();
  if (YES.test(s)) return "data";
  if (NO.test(s)) return "auth";
  return undefined;
}

export function compileFlowchartKind(input: z.infer<typeof flowchartKindSchema>, tool = "create_flowchart"): CompiledArchitecture {
  const lanes = (input.groups ?? []).filter((g) => g.kind === "lane");
  if (lanes.length && input.nodes.every((n) => n.group && lanes.some((l) => l.id === n.group))) {
    // legacy swimlane flowcharts → the swimlane engine
    const T: Record<string, "start" | "end" | "task" | "decision" | "document" | "system" | "wait"> = { start: "start", end: "end", process: "task", decision: "decision", io: "system", subprocess: "system", document: "document", data: "system", wait: "wait" };
    return compileSwimlane({
      title: input.title,
      subtitle: input.subtitle,
      theme: input.theme,
      outputs: input.outputs,
      lanes: lanes.map((l) => ({ id: l.id, label: l.label })),
      steps: input.nodes.map((n) => ({ id: n.id, label: n.label, lane: n.group!, type: T[n.type ?? "process"], description: n.description ?? n.subtitle })),
      flows: (input.edges ?? []).map((e) => ({ from: e.from, to: e.to, label: e.label ?? e.when, kind: e.kind ?? (branchKind(e.label ?? e.when) === "auth" ? "auth" : "sync") })),
    } as Parameters<typeof compileSwimlane>[0]);
  }
  const groups: DiagramGroup[] = (input.groups ?? []).filter((g) => g.kind !== "lane").map((g) => ({ id: g.id, label: g.label, parent: g.parent, kind: "zone" }));
  const gids = new Set(groups.map((g) => g.id));
  const nodes: DiagramNode[] = input.nodes.map((n) => {
    const t = FC[n.type ?? "process"];
    return { id: n.id, label: n.label, subtitle: n.subtitle, description: n.description, shape: t.shape, role: n.role ?? t.role, icon: n.icon ?? t.icon ?? "none", group: n.group && gids.has(n.group) ? n.group : undefined };
  });
  const raw = input.edges ?? [];
  const rank = flowRanks(nodes, raw.map((e) => ({ from: e.from, to: e.to })));
  const edges: DiagramEdge[] = raw.map((e) => {
    const label = e.label ?? e.when;
    const back = (rank.get(e.to) ?? 0) <= (rank.get(e.from) ?? 0) && e.from !== e.to;
    return { from: e.from, to: e.to, label, kind: e.kind ?? branchKind(label) ?? (back ? "async" : "sync") };
  });
  const used = [...new Set(input.nodes.map((n) => n.type ?? "process"))];
  const seen = new Set<string>();
  const legend: LegendItem[] = [];
  for (const u of used) {
    const t = FC[u];
    if (seen.has(t.legend)) continue;
    seen.add(t.legend);
    legend.push({ label: t.legend, role: t.role, mark: t.mark });
  }
  const ek = new Set(edges.map((e) => e.kind));
  if (ek.has("sync")) legend.push({ label: "Flow", kind: "sync" });
  if (ek.has("data")) legend.push({ label: "Yes / pass", kind: "data" });
  if (ek.has("auth")) legend.push({ label: "No / fail", kind: "auth" });
  if (ek.has("async")) legend.push({ label: "Loop back", kind: "async" });
  return run(
    tool,
    nodes,
    groups,
    edges,
    legend,
    { kind: "flowchart", caption: "PROCESS FLOWCHART", nodeNoun: "STEPS", edgeNoun: "FLOWS" },
    { direction: input.direction, prefer: "TB", wrap: input.wrap, frameIndex: false, nodeGap: 44 },
    input,
  );
}

export function compileDecisionKind(input: z.infer<typeof decisionKindSchema>): CompiledArchitecture {
  const T = { question: "decision", outcome: "end", action: "process" } as const;
  const order = [...input.nodes].sort((a, b) => (a.id === input.root ? -1 : b.id === input.root ? 1 : 0));
  const c = compileFlowchartKind(
    {
      ...input,
      nodes: order.map((n) => ({ ...n, type: T[n.type ?? "action"] })),
      edges: input.edges,
      groups: undefined,
    } as z.infer<typeof flowchartKindSchema>,
    "create_decision_diagram",
  );
  return c;
}

// ── State machine ───────────────────────────────────────────────────────────
export function compileStateMachine(input: z.infer<typeof stateMachineSchema>): CompiledArchitecture {
  const composites = new Set(input.states.filter((s) => s.type === "composite" || input.states.some((c) => c.parent === s.id)).map((s) => s.id));
  const groups: DiagramGroup[] = input.states
    .filter((s) => composites.has(s.id))
    .map((s) => ({ id: s.id, label: s.label ?? s.id, parent: s.parent, kind: "composite" }));
  const nodes: DiagramNode[] = input.states
    .filter((s) => !composites.has(s.id))
    .map((s) => {
      const type = s.type ?? "state";
      const acts = [s.entry && `entry / ${s.entry}`, s.do && `do / ${s.do}`, s.exit && `exit / ${s.exit}`].filter(Boolean).join("\n");
      if (type === "initial") return { id: s.id, label: "", shape: "initial", role: "client", icon: "none", group: s.parent };
      if (type === "final") return { id: s.id, label: "", shape: "final", role: "client", icon: "none", group: s.parent };
      if (type === "choice") return { id: s.id, label: "", shape: "choice", role: "queue", icon: "none", group: s.parent };
      return { id: s.id, label: s.label ?? s.id, description: acts || s.description, shape: "state", role: "network", icon: "none", group: s.parent };
    });
  const kind: Record<string, EdgeKind> = { normal: "sync", error: "auth", timeout: "async", internal: "default" };
  const edges: DiagramEdge[] = input.transitions.map((t) => {
    const label = [t.event, t.guard ? `[${t.guard}]` : "", t.action ? `/ ${t.action}` : ""].filter(Boolean).join(" ").trim();
    return { from: t.from, to: t.to, label: label || undefined, kind: kind[t.kind ?? "normal"] };
  });
  // multi-line activity text → card description lines
  for (const n of nodes) if (n.description?.includes("\n")) n.description = n.description;
  const legend: LegendItem[] = [
    { label: "Initial", mark: "initial", role: "client" },
    { label: "State", mark: "state", role: "network" },
    ...(groups.length ? [{ label: "Composite state", mark: "composite" as const, role: "gateway" as NodeRole }] : []),
    ...(nodes.some((n) => n.shape === "choice") ? [{ label: "Choice", mark: "choice" as const, role: "queue" as NodeRole }] : []),
    ...(nodes.some((n) => n.shape === "final") ? [{ label: "Final", mark: "final" as const, role: "client" as NodeRole }] : []),
    { label: "event [guard] / action", kind: "sync" },
    ...(edges.some((e) => e.kind === "auth") ? [{ label: "Error", kind: "auth" as EdgeKind }] : []),
    ...(edges.some((e) => e.kind === "async") ? [{ label: "Timeout", kind: "async" as EdgeKind }] : []),
  ];
  return run(
    "create_state_machine",
    nodes,
    groups,
    edges,
    legend,
    { kind: "state", caption: "STATE MACHINE · UML", nodeNoun: "STATES", edgeNoun: "TRANSITIONS" },
    { direction: input.direction, prefer: "LR", wrap: input.wrap, frameIndex: false },
    input,
  );
}

// ── ERD ─────────────────────────────────────────────────────────────────────
const CARD: Record<string, EdgeMark> = { "1": "exactlyOne", "0..1": "zeroOrOne", "1..n": "oneOrMany", "1..*": "oneOrMany", "1..m": "oneOrMany", n: "zeroOrMany", m: "zeroOrMany", "*": "zeroOrMany", "0..n": "zeroOrMany", "0..*": "zeroOrMany" };

export function parseCardinality(c: string | undefined): [EdgeMark, EdgeMark] {
  const [a, b] = (c ?? "1:N").toLowerCase().replace(/\s+/g, "").split(/[:\-–]/);
  return [CARD[a] ?? "exactlyOne", CARD[b ?? "n"] ?? "zeroOrMany"];
}

const isMany = (m: EdgeMark) => m === "many" || m === "zeroOrMany" || m === "oneOrMany";

export function compileErd(input: z.infer<typeof erdSchema>): CompiledArchitecture {
  const groups: DiagramGroup[] = (input.domains ?? []).map((d) => ({ id: d.id, label: d.label, kind: "zone" }));
  const sizes: Record<string, { w: number; h: number }> = {};
  const nodes: DiagramNode[] = input.entities.map((e) => {
    const rows: TableRow[] = e.columns.map((c) => ({
      name: c.name,
      type: c.type,
      key: [c.pk ? "PK" : "", c.fk ? "FK" : "", c.unique && !c.pk ? "UK" : ""].filter(Boolean).join(","),
      nullable: c.nullable,
    }));
    const nameW = Math.max(...rows.map((r) => measureText(r.name + (r.nullable ? "?" : ""), { font: "mono", size: 12.5, weight: 700 })));
    const typeW = Math.max(0, ...rows.map((r) => (r.type ? measureText(r.type, { font: "mono", size: 12 }) : 0)));
    const label = e.label ?? e.id;
    const w = Math.ceil(Math.max(200, measureText(label, { font: "mono", size: 14, weight: 700 }) + 60, 40 + nameW + (typeW ? 24 + typeW : 0) + 14));
    sizes[e.id] = { w, h: 36 + rows.length * 22 + 10 };
    return { id: e.id, label, shape: "table", role: "data", icon: "table", rows, group: e.domain };
  });
  const edges: DiagramEdge[] = (input.relationships ?? []).map((r) => {
    let [fm, tm] = parseCardinality(r.cardinality);
    if (r.fromEnd) fm = r.fromEnd;
    if (r.toEnd) tm = r.toEnd;
    let from = r.from;
    let to = r.to;
    // layer parents (one side) before children (many side)
    if (isMany(fm) && !isMany(tm)) {
      [from, to] = [to, from];
      [fm, tm] = [tm, fm];
    }
    return { from, to, label: r.label, kind: r.identifying === false ? "async" : "sync", startMark: fm, endMark: tm };
  });
  const legend: LegendItem[] = [
    { label: "Table", mark: "table", role: "data" },
    { label: "Primary key", mark: "pk" },
    { label: "Foreign key", mark: "fk" },
    { label: "One / many (crow's foot)", mark: "crow" },
    ...(edges.some((e) => e.kind === "sync") ? [{ label: "Identifying", kind: "sync" as EdgeKind }] : []),
    ...(edges.some((e) => e.kind === "async") ? [{ label: "Non-identifying", kind: "async" as EdgeKind }] : []),
  ];
  return run(
    "create_er_diagram",
    nodes,
    groups,
    edges,
    legend,
    { kind: "erd", caption: "ENTITY RELATIONSHIP · CROW'S FOOT", nodeNoun: "TABLES", edgeNoun: "RELATIONSHIPS" },
    { direction: input.direction, prefer: "LR", wrap: input.wrap, sizes, nodeGap: 48, frameIndex: false, blockDir: "auto" },
    input,
  );
}
void labelWithTags;
