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
