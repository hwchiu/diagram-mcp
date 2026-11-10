/**
 * Input schemas for the notation-specific diagram tools (Group 1: zone-grid family).
 * Labels may be Traditional Chinese, English or mixed; ids should be ASCII-ish slugs.
 */
import { z } from "zod";

const id = z.string().min(1).describe("Unique id (ASCII slug recommended, e.g. \"biz\", \"api-pod\")");
const label = z.string().min(1).describe("Display label — 中文 / English / mixed are all fine");
const flowKind = z.enum(["sync", "async", "data", "auth", "default"]);

const base = {
  title: z.string().optional().describe("Diagram title"),
  subtitle: z.string().optional().describe("One-line context under the title"),
  theme: z.enum(["dark", "light"]).optional().describe("dark (default, Cocoon tech) or light"),
  name: z.string().optional().describe("Output file basename"),
  outputDir: z.string().optional(),
  includePreview: z.boolean().optional().describe("Return a compact PNG preview (default true)"),
  outputs: z.array(z.enum(["svg", "png", "drawio"])).optional().describe("draw.io is written by default; pass [\"svg\",\"png\"] to skip it"),
};

const stepsSchema = z
  .array(
    z.object({
      n: z.number().int().positive(),
      label: z.string().min(1),
      description: z.string().optional(),
      anchor: z.string().optional().describe("Node / zone id for a pinned badge when no relationship carries this step"),
    }),
  )
  .optional()
  .describe("Numbered walkthrough panel; put `step: n` on relationships to badge them");

const splitOpts = {
  split: z.enum(["auto", "never", "always"]).optional().describe("Large diagrams: overview + per-zone detail views (auto above splitThreshold nodes)"),
  splitThreshold: z.number().int().min(4).max(500).optional(),
};

// ── 1. System context (C4 L1) ───────────────────────────────────────────────
export const systemContextSchema = z.object({
  ...base,
  ...splitOpts,
  system: z
    .object({ id, label, description: z.string().optional().describe("What the system does (1–2 sentences)"), technology: z.string().optional() })
    .describe("The software system in scope — drawn as the one large central box"),
  boundary: z
    .object({ label: z.string().optional().describe("Boundary label, e.g. \"Insight 平台範圍\" / \"Enterprise\""), tag: z.string().optional() })
    .optional()
    .describe("Dashed boundary around the system (and internalSystems)"),
  internalSystems: z
    .array(z.object({ id, label, description: z.string().optional() }))
    .optional()
    .describe("Other systems inside the same boundary (optional)"),
  actors: z
    .array(z.object({ id, label, description: z.string().optional(), external: z.boolean().optional().describe("Actor outside the organisation") }))
    .describe("People / roles / teams that use the system (C4 Person)"),
  externalSystems: z
    .array(
      z.object({
        id,
        label,
        description: z.string().optional(),
        type: z.enum(["system", "database", "saas", "provider", "partner", "device"]).optional(),
        icon: z.string().optional(),
      }),
    )
    .optional()
    .describe("Systems outside the boundary the system depends on or serves"),
  relationships: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().optional().describe("Verb phrase, e.g. \"提交查詢\" / \"reads company data\""),
        technology: z.string().optional().describe("e.g. HTTPS/JSON, SFTP, Kafka"),
        kind: flowKind.optional(),
        bidirectional: z.boolean().optional(),
        step: z.number().int().positive().optional(),
      }),
    )
    .describe("Who uses / calls what"),
  steps: stepsSchema,
});

// ── 2. Component diagram (C4 L3) ───────────────────────────────────────────
export const componentSchema = z.object({
  ...base,
  ...splitOpts,
  container: z
    .object({ id, label, technology: z.string().optional(), description: z.string().optional() })
    .describe("The one service / container being opened up (drawn as the boundary)"),
  interfaces: z
    .array(z.object({ id, label, protocol: z.string().optional().describe("e.g. REST, gRPC, Kafka topic") }))
    .optional()
    .describe("Provided interfaces / endpoints exposed by the container (drawn as port pills)"),
  components: z
    .array(
      z.object({
        id,
        label,
        responsibility: z.string().optional().describe("What this component is responsible for"),
        technology: z.string().optional(),
        layer: z.string().optional().describe("Optional layer / module group, e.g. \"API\", \"Domain\", \"Infra\""),
        type: z.enum(["component", "store", "adapter", "policy", "job"]).optional(),
        icon: z.string().optional(),
      }),
    )
    .min(1)
    .describe("Modules / components inside the container"),
  layers: z.array(z.string()).optional().describe("Layer order left → right (defaults to first-seen order)"),
  externals: z
    .array(
      z.object({
        id,
        label,
        description: z.string().optional(),
        type: z.enum(["person", "system", "database", "queue", "cache", "storage"]).optional(),
        side: z.enum(["left", "right"]).optional().describe("Force placement: callers left, dependencies right (auto by flow)"),
      }),
    )
    .optional()
    .describe("Callers and dependencies outside the container"),
  relationships: z
    .array(z.object({ from: z.string(), to: z.string(), label: z.string().optional(), technology: z.string().optional(), kind: flowKind.optional(), step: z.number().int().positive().optional() }))
    .describe("Uses / calls between interfaces, components and externals"),
  steps: stepsSchema,
});

// ── 3. Deployment topology ────────────────────────────────────────────────
const workloadType = z.enum(["deployment", "statefulset", "daemonset", "job", "cronjob", "pod", "service", "ingress", "configmap", "secret", "gateway"]);
export const deploymentSchema = z.object({
  ...base,
  ...splitOpts,
  clusters: z
    .array(
      z.object({
        id,
        label,
        provider: z.string().optional().describe("e.g. EKS, GKE, on-prem k8s, OpenShift"),
        version: z.string().optional(),
        region: z.string().optional(),
        namespaces: z
          .array(
            z.object({
              id,
              label,
              workloads: z
                .array(
                  z.object({
                    id,
                    label,
                    type: workloadType.optional().describe("default deployment"),
                    replicas: z.number().int().min(1).optional(),
                    image: z.string().optional().describe("Image or short runtime note"),
                    port: z.union([z.string(), z.number()]).optional(),
                    description: z.string().optional(),
                  }),
                )
                .min(1),
            }),
          )
          .min(1),
      }),
    )
    .min(1)
    .describe("Clusters → namespaces → workloads"),
  outside: z
    .array(
      z.object({
        id,
        label,
        type: z.enum(["database", "storage", "queue", "cache", "saas", "user", "loadbalancer", "dns", "registry", "server", "system"]).optional(),
        location: z.string().optional().describe("e.g. \"on-prem DC\", \"RDS\""),
        description: z.string().optional(),
        side: z.enum(["left", "right"]).optional(),
      }),
    )
    .optional()
    .describe("Things that run outside the cluster (managed DBs, users, LBs, registries)"),
  connections: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().optional(),
        protocol: z.string().optional().describe("e.g. TCP, HTTPS, gRPC"),
        port: z.union([z.string(), z.number()]).optional(),
        kind: flowKind.optional(),
        step: z.number().int().positive().optional(),
      }),
    )
    .optional(),
  steps: stepsSchema,
});

// ── 4. Network topology ───────────────────────────────────────────────────
export const networkSchema = z.object({
  ...base,
  ...splitOpts,
  zones: z
    .array(
      z.object({
        id,
        label,
        type: z.enum(["internet", "dmz", "vpc", "subnet", "onprem", "site", "cloud", "segment", "mgmt"]).optional(),
        cidr: z.string().optional().describe("e.g. 10.20.0.0/16 — shown as a chip on the frame"),
        parent: z.string().optional().describe("Nest inside another zone (subnet inside VPC)"),
      }),
    )
    .min(1)
    .describe("Network zones / segments / VPCs / subnets"),
  devices: z
    .array(
      z.object({
        id,
        label,
        type: z
          .enum(["firewall", "router", "switch", "loadbalancer", "vpn", "nat", "server", "host", "workstation", "internet", "cloud", "waf", "proxy", "dns", "database", "plc", "gateway"])
          .optional(),
        zone: z.string().optional().describe("Zone id; omit for devices that sit between zones (edge firewalls)"),
        ip: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .min(1),
  links: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        protocol: z.string().optional().describe("TCP / UDP / HTTPS / IPsec …"),
        port: z.union([z.string(), z.number()]).optional(),
        label: z.string().optional(),
        type: z.enum(["allow", "deny", "vpn", "route", "mgmt"]).optional().describe("allow (default) · deny · vpn tunnel · route · mgmt"),
        bidirectional: z.boolean().optional(),
        step: z.number().int().positive().optional(),
      }),
    )
    .optional(),
  steps: stepsSchema,
});

// ── 5. Data-flow diagram with trust boundaries ────────────────────────────
export const dataflowSchema = z.object({
  ...base,
  ...splitOpts,
  boundaries: z
    .array(
      z.object({
        id,
        label,
        trust: z.enum(["untrusted", "low", "medium", "high", "restricted"]).optional(),
        parent: z.string().optional(),
      }),
    )
    .optional()
    .describe("Trust boundaries (drawn dashed red); flows crossing one are highlighted"),
  externalEntities: z.array(z.object({ id, label, boundary: z.string().optional(), description: z.string().optional() })).optional().describe("People / systems outside your control (DFD external entity)"),
  processes: z
    .array(z.object({ id, label, boundary: z.string().optional(), number: z.string().optional().describe("e.g. 1.0 (auto P1, P2 … when omitted)"), description: z.string().optional() }))
    .min(1)
    .describe("Processes that transform data"),
  dataStores: z.array(z.object({ id, label, boundary: z.string().optional(), number: z.string().optional().describe("e.g. D1") })).optional(),
  flows: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().optional().describe("What data moves, e.g. \"查詢條件\""),
        data: z.array(z.string()).optional().describe("Sensitive data classes carried, e.g. [\"PII\", \"統編\"] — shown as alert chips"),
        protocol: z.string().optional(),
        kind: flowKind.optional(),
        step: z.number().int().positive().optional(),
      }),
    )
    .min(1),
  steps: stepsSchema,
});

// ── 6. Swimlane ───────────────────────────────────────────────────────────
export const swimlaneSchema = z.object({
  ...base,
  lanes: z.array(z.object({ id, label, description: z.string().optional().describe("Shown under the lane name (team, system)") })).min(1).describe("One horizontal lane per team / role / system, top → bottom"),
  steps: z
    .array(
      z.object({
        id,
        label,
        lane: z.string().describe("Lane id"),
        type: z.enum(["start", "end", "task", "decision", "document", "system", "wait"]).optional().describe("default task"),
        description: z.string().optional(),
        column: z.number().int().min(0).optional().describe("Force a time column (0-based); auto from the flow otherwise"),
      }),
    )
    .min(1)
    .describe("Process steps; placed left → right in flow order"),
  flows: z
    .array(z.object({ from: z.string(), to: z.string(), label: z.string().optional().describe("Branch label, e.g. 通過 / 退回"), kind: flowKind.optional() }))
    .describe("Sequence / handoffs between steps"),
  numbering: z.boolean().optional().describe("Number task cards in flow order (default true)"),
});

// ════════════════════════════════════════════════════════════════════════════
// Group 2 — layered DAG family (Sugiyama layout, own engine)
// ════════════════════════════════════════════════════════════════════════════
const direction = z.enum(["LR", "TB", "auto"]).optional().describe("Layer direction: LR (left → right), TB (top → bottom) or auto (default: whichever reads best near 16:9)");
const wrapOpt = z.enum(["auto", "never"]).optional().describe("auto (default) wraps long chains into 2–3 bands to stay near 16:9");
const roleEnum = z.enum(["compute", "data", "network", "security", "external", "client", "queue", "gateway", "storage", "observability", "default"]);

// ── 7. Data lineage ────────────────────────────────────────────────────────
export const lineageSchema = z.object({
  ...base,
  direction,
  wrap: wrapOpt,
  stages: z
    .array(z.object({ id, label, description: z.string().optional().describe("Shown as a chip on the stage header (system / tech)") }))
    .optional()
    .describe("Pipeline stages left → right (Source, Ingest, Lake, Warehouse, Serve …); each dataset sits in one stage column"),
  datasets: z
    .array(
      z.object({
        id,
        label,
        type: z.enum(["source", "table", "view", "file", "stream", "job", "model", "dashboard", "report", "api"]).optional().describe("default table"),
        system: z.string().optional().describe("Where it lives (\"Oracle · ERP\", \"BigQuery\") — shown under the label"),
        stage: z.string().optional().describe("Stage id"),
        description: z.string().optional(),
        tags: z.array(z.string()).optional().describe("Classification chips, e.g. [\"PII\"]"),
      }),
    )
    .min(1),
  flows: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().optional().describe("Transformation (\"dbt model\", \"Spark job\", \"CDC\")"),
        kind: z.enum(["batch", "stream", "cdc", "manual"]).optional().describe("default batch"),
      }),
    )
    .describe("Data movement source → target"),
  focus: z
    .object({ node: z.string(), direction: z.enum(["upstream", "downstream", "both"]).optional() })
    .optional()
    .describe("Highlight the lineage of one dataset (others are dimmed)"),
});

// ── 8. Workflow DAG ────────────────────────────────────────────────────────
export const workflowSchema = z.object({
  ...base,
  direction,
  wrap: wrapOpt,
  schedule: z.string().optional().describe("Schedule / trigger shown as a header chip (\"0 2 * * *\", \"on push\")"),
  groups: z.array(z.object({ id, label, parent: z.string().optional() })).optional().describe("Task groups (frames)"),
  tasks: z
    .array(
      z.object({
        id,
        label,
        operator: z.string().optional().describe("Operator / runner shown under the label (\"SparkSubmit\", \"dbt run\")"),
        status: z.enum(["success", "failed", "running", "queued", "skipped", "upstream_failed", "none"]).optional(),
        group: z.string().optional().describe("Task group id"),
        description: z.string().optional(),
        icon: z.string().optional(),
      }),
    )
    .min(1),
  dependencies: z
    .array(z.object({ from: z.string(), to: z.string(), label: z.string().optional(), condition: z.enum(["success", "failure", "always"]).optional().describe("Trigger rule (default success)") }))
    .describe("upstream → downstream"),
});

// ── 9. Dependency / impact graph (backward compatible with the old tool) ─────
export const dependencyGraphSchema = z.object({
  ...base,
  direction,
  wrap: wrapOpt,
  layout: z.string().optional().describe("ignored (legacy)"),
  nodes: z
    .array(
      z.object({
        id,
        label,
        subtitle: z.string().optional(),
        description: z.string().optional(),
        role: roleEnum.optional(),
        icon: z.string().optional(),
        group: z.string().optional().describe("Cluster id (package / domain / team)"),
        shape: z.string().optional().describe("ignored (legacy)"),
        type: z.enum(["service", "library", "database", "queue", "external", "app"]).optional(),
      }),
    )
    .min(1),
  edges: z
    .array(z.object({ from: z.string().describe("dependent"), to: z.string().describe("dependency"), label: z.string().optional(), kind: flowKind.optional(), optional: z.boolean().optional().describe("soft / optional dependency (dashed)") }))
    .min(1)
    .describe("from DEPENDS ON to (arrow points at the dependency)"),
  groups: z.array(z.object({ id, label, parent: z.string().optional(), kind: z.string().optional() })).optional(),
  changed: z.array(z.string()).optional().describe("Impact analysis: ids of changed nodes — everything that (transitively) depends on them is highlighted, the rest dimmed"),
  impact: z.enum(["dependents", "dependencies", "both"]).optional().describe("dependents (default): who breaks if the changed node changes; dependencies: what the changed node needs"),
});

// ── 10. Ontology / knowledge graph ──────────────────────────────────────────
export const knowledgeGraphSchema = z.object({
  ...base,
  direction,
  wrap: wrapOpt,
  types: z
    .array(z.object({ id, label, color: roleEnum.optional().describe("Palette role"), icon: z.string().optional() }))
    .optional()
    .describe("Entity classes (Person, Company, Dataset …) — coloured and listed in the legend"),
  entities: z
    .array(
      z.object({
        id,
        label,
        type: z.string().optional().describe("Type id"),
        description: z.string().optional(),
        attributes: z.array(z.string()).optional().describe("Up to 3 \"key: value\" lines"),
      }),
    )
    .min(1),
  relations: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().describe("Predicate (\"owns\", \"is_a\", \"擁有\")"),
        kind: z.enum(["relation", "is_a", "part_of", "instance_of"]).optional().describe("is_a / instance_of draw a hollow-arrow taxonomy edge"),
        bidirectional: z.boolean().optional(),
      }),
    )
    .describe("Labelled, directed relations"),
  focus: z.object({ node: z.string(), direction: z.enum(["upstream", "downstream", "both"]).optional() }).optional().describe("Highlight one entity's neighbourhood"),
});

// ── 11. Flowchart (backward compatible) ────────────────────────────────────
const fcType = z.enum(["start", "end", "process", "decision", "io", "subprocess", "document", "data", "wait"]);
export const flowchartKindSchema = z.object({
  ...base,
  direction,
  wrap: wrapOpt,
  layout: z.string().optional().describe("ignored (legacy)"),
  nodes: z
    .array(
      z.object({
        id,
        label,
        type: fcType.optional().describe("default process"),
        subtitle: z.string().optional(),
        description: z.string().optional(),
        role: roleEnum.optional(),
        icon: z.string().optional(),
        group: z.string().optional().describe("Lane id (when groups have kind \"lane\" the chart becomes a swimlane)"),
        shape: z.string().optional().describe("ignored (legacy)"),
      }),
    )
    .min(1),
  edges: z
    .array(z.object({ from: z.string(), to: z.string(), label: z.string().optional(), when: z.string().optional().describe("Branch label (yes / no / 是 / 否)"), kind: flowKind.optional() }))
    .optional(),
  groups: z.array(z.object({ id, label, kind: z.string().optional(), parent: z.string().optional() })).optional(),
});

export const decisionKindSchema = z.object({
  ...base,
  direction,
  wrap: wrapOpt,
  layout: z.string().optional(),
  root: z.string(),
  nodes: z
    .array(z.object({ id, label, type: z.enum(["question", "outcome", "action"]).optional(), subtitle: z.string().optional(), description: z.string().optional(), role: roleEnum.optional(), icon: z.string().optional(), group: z.string().optional(), shape: z.string().optional() }))
    .min(1),
  edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional(), when: z.string().optional(), kind: flowKind.optional() })).min(1),
});

// ════════════════════════════════════════════════════════════════════════════
// Group 3 — fixed-form notations
// ════════════════════════════════════════════════════════════════════════════
// ── 12. State machine ──────────────────────────────────────────────────────
export const stateMachineSchema = z.object({
  ...base,
  direction,
  wrap: wrapOpt,
  states: z
    .array(
      z.object({
        id,
        label: z.string().optional().describe("Defaults to the id; ignored for initial / final / choice"),
        type: z.enum(["state", "initial", "final", "choice", "composite"]).optional().describe("default state; composite = has child states (parent)"),
        parent: z.string().optional().describe("Composite state id"),
        entry: z.string().optional().describe("entry / action"),
        do: z.string().optional().describe("do / activity"),
        exit: z.string().optional().describe("exit / action"),
        description: z.string().optional(),
      }),
    )
    .min(1),
  transitions: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        event: z.string().optional(),
        guard: z.string().optional().describe("Condition, drawn as [guard]"),
        action: z.string().optional().describe("Effect, drawn as / action"),
        kind: z.enum(["normal", "error", "timeout", "internal"]).optional(),
      }),
    )
    .describe("Self transitions (from == to) are drawn as loops"),
});

// ── 13. ERD ─────────────────────────────────────────────────────────────────
const cardEnd = z.enum(["one", "exactlyOne", "zeroOrOne", "many", "oneOrMany", "zeroOrMany"]);
export const erdSchema = z.object({
  ...base,
  direction,
  wrap: wrapOpt,
  domains: z.array(z.object({ id, label })).optional().describe("Optional subject areas (frames)"),
  entities: z
    .array(
      z.object({
        id,
        label: z.string().optional().describe("Table name (defaults to id)"),
        domain: z.string().optional(),
        columns: z
          .array(
            z.object({
              name: z.string(),
              type: z.string().optional(),
              pk: z.boolean().optional(),
              fk: z.union([z.boolean(), z.string()]).optional().describe("true or \"table.column\""),
              unique: z.boolean().optional(),
              nullable: z.boolean().optional(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
  relationships: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        cardinality: z.string().optional().describe("\"1:N\" (default), \"1:1\", \"N:1\", \"N:M\", \"0..1:N\", \"1:1..N\""),
        fromEnd: cardEnd.optional().describe("Explicit notation at the from table (overrides cardinality)"),
        toEnd: cardEnd.optional(),
        label: z.string().optional().describe("Verb (\"places\", \"擁有\")"),
        identifying: z.boolean().optional().describe("Identifying (solid, default) vs non-identifying (dashed)"),
      }),
    )
    .optional()
    .default([]),
});

// ── 14. Sequence ────────────────────────────────────────────────────────────
const itemRef = z.union([z.string(), z.number().int().positive()]).describe("Item id, or 1-based position in messages[]");
export const sequenceSchema = z.object({
  ...base,
  participants: z
    .array(
      z.object({
        id,
        label,
        type: z.enum(["actor", "service", "database", "queue", "external", "browser", "gateway", "security", "job"]).optional().describe("Header icon / colour (default service)"),
        description: z.string().optional().describe("Second header line, e.g. technology"),
      }),
    )
    .min(1)
    .describe("Left → right order of lifelines"),
  messages: z
    .array(
      z.object({
        type: z.enum(["message", "note", "divider"]).optional().describe("default message"),
        id: z.string().optional().describe("Referenced by fragments"),
        from: z.string().optional(),
        to: z.string().optional().describe("from == to draws a self call"),
        label: z.string().optional().describe("Message text (or divider label)"),
        kind: z.enum(["sync", "async", "return", "error"]).optional().describe("sync (default, solid filled arrow), async (open arrow), return (dashed), error"),
        text: z.string().optional().describe("Note text"),
        over: z.array(z.string()).optional().describe("Note: participant ids it sits over (1 or a span)"),
        position: z.enum(["over", "left", "right"]).optional().describe("Note placement relative to over[0]"),
      }),
    )
    .min(1)
    .describe("Messages, notes and dividers in time order (top → bottom)"),
  fragments: z
    .array(
      z.object({
        kind: z.enum(["alt", "opt", "loop", "par", "critical", "break", "group"]),
        label: z.string().optional().describe("Guard / condition, drawn as [label]"),
        start: itemRef,
        end: itemRef,
        sections: z.array(z.object({ start: itemRef, label: z.string().optional() })).optional().describe("alt else / par branches: the item where each extra section begins"),
      }),
    )
    .optional()
    .describe("Combined fragments over a contiguous range of items (may nest, must not partially overlap)"),
  autonumber: z.boolean().optional().describe("Number messages (default true)"),
  activations: z.enum(["auto", "none"]).optional().describe("auto (default): sync call activates the callee until its return"),
  panels: z.number().int().min(1).max(3).optional().describe("Force 1–3 side-by-side panels (default: auto for long conversations)"),
});

// ── 15. Authorization matrix ────────────────────────────────────────────────
export const authzSchema = z.object({
  ...base,
  roles: z.array(z.object({ id, label, description: z.string().optional().describe("Second line, e.g. who holds the role") })).min(1),
  resources: z
    .array(z.object({ id, label, actions: z.array(z.string().min(1)).optional().describe("Actions for this resource (default: top-level actions)") }))
    .min(1),
  actions: z.array(z.string().min(1)).optional().describe("Default actions for every resource, e.g. [\"read\",\"write\",\"delete\"]"),
  permissions: z
    .array(
      z.object({
        role: z.string().describe("Role id or \"*\""),
        resource: z.string().describe("Resource id or \"*\""),
        actions: z.union([z.array(z.string()), z.literal("*")]).optional().describe("Actions (default all of the resource's actions)"),
        effect: z.enum(["allow", "deny", "conditional"]),
        condition: z.string().optional().describe("For conditional: the rule, shown as a numbered footnote (e.g. 僅限本人建立的資料)"),
      }),
    )
    .describe("Applied in order; later entries override earlier ones"),
  default: z.enum(["none", "deny"]).optional().describe("Cells no permission covers: none (—, default) or deny"),
  orientation: z.enum(["auto", "roles-rows", "roles-columns"]).optional().describe("auto (default) picks the layout nearest 16:9"),
});

// ── 16. Gantt ───────────────────────────────────────────────────────────────
const isoDate = z.string().regex(/^\d{4}-\d{1,2}-\d{1,2}$/, "use YYYY-MM-DD");
export const ganttSchema = z.object({
  ...base,
  groups: z.array(z.object({ id, label })).optional().describe("Task groups / phases / workstreams (rows are grouped in this order)"),
  tasks: z
    .array(
      z.object({
        id,
        label,
        group: z.string().optional(),
        start: isoDate.optional().describe("YYYY-MM-DD; omit when after is set (starts when its dependencies finish)"),
        end: isoDate.optional().describe("Last day (inclusive), YYYY-MM-DD"),
        duration: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?\s*[dwm]$/i)]).optional().describe("Days, or \"5d\" / \"2w\" / \"1m\" (30 days)"),
        after: z.union([z.string(), z.array(z.string())]).optional().describe("Finish-to-start dependencies (task ids)"),
        progress: z.number().min(0).max(100).optional().describe("Percent complete"),
        milestone: z.boolean().optional().describe("Zero-length diamond at start"),
        critical: z.boolean().optional().describe("Highlight as critical path"),
        owner: z.string().optional(),
      }),
    )
    .min(1),
  today: isoDate.optional().describe("Draws a TODAY marker (only when given)"),
  scale: z.enum(["auto", "day", "week", "month", "quarter"]).optional().describe("Axis unit (default auto from the date span)"),
});

// ── 17. Timeline ────────────────────────────────────────────────────────────
const looseDate = z.string().regex(/^\d{4}(-\d{1,2}(-\d{1,2})?)?$/, "use YYYY, YYYY-MM or YYYY-MM-DD");
export const timelineSchema = z.object({
  ...base,
  events: z
    .array(
      z.object({
        date: looseDate,
        label,
        description: z.string().optional().describe("Up to ~3 short lines"),
        role: roleEnum.optional().describe("Colour"),
        milestone: z.boolean().optional().describe("Emphasised event"),
      }),
    )
    .min(1),
  eras: z.array(z.object({ label, start: looseDate, end: looseDate, role: roleEnum.optional() })).optional().describe("Periods drawn as bands on the axis"),
  scale: z.enum(["time", "even"]).optional().describe("time (default): positions proportional to dates; even: equal spacing in date order"),
});
