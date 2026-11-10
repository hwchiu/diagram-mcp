/**
 * Group 1 diagram kinds on the zone grid: system context (C4 L1), component
 * (C4 L3), deployment topology, network topology, data-flow with trust
 * boundaries. Each maps its domain schema onto zones / nodes / edges and a
 * presentation profile, then reuses the shared engine.
 */
import type { z } from "zod";
import type { DiagramEdge, DiagramGroup, DiagramNode, EdgeKind } from "../../types.js";
import type { NodeRole } from "../../design/themes.js";
import type { LegendItem } from "../../layout/types.js";
import { labelWithTags } from "../../layout/notation.js";
import type { componentSchema, dataflowSchema, deploymentSchema, networkSchema, systemContextSchema } from "../../tools/kindSchemas.js";
import { compileModel, type CompiledArchitecture } from "../architecture.js";
import { edgeKindsLegend, flowSortMembers, joinLabel, rankColumns, toLayoutInput, unitResolver, validateModel, type KindModel } from "./common.js";

type SystemContextInput = z.infer<typeof systemContextSchema>;
type ComponentInput = z.infer<typeof componentSchema>;
type DeploymentInput = z.infer<typeof deploymentSchema>;
type NetworkInput = z.infer<typeof networkSchema>;
type DataflowInput = z.infer<typeof dataflowSchema>;

function finish(tool: string, m: KindModel, input: { title?: string; subtitle?: string; theme?: string; outputs?: Array<"svg" | "png" | "drawio">; split?: "auto" | "never" | "always"; splitThreshold?: number; steps?: Array<{ n: number; label: string; description?: string; anchor?: string }> }): CompiledArchitecture {
  validateModel(tool, m.nodes, m.groups, m.edges);
  return compileModel(toLayoutInput(m, input), { theme: input.theme, outputs: input.outputs, split: input.split, splitThreshold: input.splitThreshold });
}

/** Callers (only send into the core) go left, everything else right. */
function sideOf(id: string, edges: DiagramEdge[], core: (x: string) => boolean): "left" | "right" {
  let out = 0;
  let inn = 0;
  for (const e of edges) {
    if (e.from === id && core(e.to)) out++;
    if (e.to === id && core(e.from)) inn++;
  }
  return out > 0 && inn === 0 ? "left" : out > inn ? "left" : "right";
}

// ── 1. System context ──────────────────────────────────────────────────────
const EXT_ICON: Record<string, string> = { database: "database", saas: "cloud", provider: "building", partner: "building", device: "monitor", system: "server" };

export function compileSystemContext(input: SystemContextInput): CompiledArchitecture {
  const nodes: DiagramNode[] = [];
  const groups: DiagramGroup[] = [];
  const bid = "__boundary";
  groups.push({ id: bid, label: input.boundary?.label ?? "System boundary", kind: "boundary", tag: input.boundary?.tag ?? "C4 · L1", cols: 1, layout: "column" });
  nodes.push({
    id: input.system.id,
    label: input.system.label,
    subtitle: input.system.technology ? `[Software System · ${input.system.technology}]` : "[Software System]",
    description: input.system.description,
    shape: "system",
    role: "network",
    icon: "layers",
    group: bid,
  });
  for (const s of input.internalSystems ?? []) nodes.push({ id: s.id, label: s.label, subtitle: "[Internal System]", description: s.description, role: "default", icon: "server", group: bid });
  for (const a of input.actors) nodes.push({ id: a.id, label: a.label, subtitle: a.external ? "[External Person]" : "[Person]", description: a.description, shape: "person", role: a.external ? "external" : "client" });
  const ext = input.externalSystems ?? [];
  const eid = "__external";
  if (ext.length) groups.push({ id: eid, label: "External systems", kind: "external" });
  for (const x of ext) nodes.push({ id: x.id, label: x.label, subtitle: "[External System]", description: x.description, role: "external", icon: x.icon ?? EXT_ICON[x.type ?? "system"] ?? "server", group: eid });
  const edges: DiagramEdge[] = input.relationships.map((r) => ({
    from: r.from,
    to: r.to,
    label: joinLabel(r.label, r.technology ? `[${r.technology}]` : undefined),
    kind: (r.kind ?? "sync") as EdgeKind,
    step: r.step,
    bidirectional: r.bidirectional,
  }));
  const inScope = new Set([bid, ...nodes.filter((n) => n.group === bid).map((n) => n.id)]);
  const actorIds = input.actors.map((a) => a.id);
  const internal = input.internalSystems ?? [];
  let columns: string[][] | undefined;
  let rows: string[][][] | undefined;
  if (actorIds.length <= 2 && ext.length <= 3 && internal.length <= 1) {
    // small: person → system → externals, one row
    columns = [actorIds, [bid], ...(ext.length ? [[eid]] : [])];
    if (!actorIds.length) columns.shift();
  } else {
    // classic C4 poster: people across the top, the system in the middle, external systems below
    const aid = "__actors";
    groups.push({ id: aid, label: "People & roles", kind: "zone", cols: Math.min(actorIds.length, 5) });
    for (const n of nodes) if (actorIds.includes(n.id)) n.group = aid;
    const b = groups.find((g) => g.id === bid)!;
    b.layout = undefined;
    b.cols = Math.min(1 + internal.length, 3);
    // the system in the middle of its boundary row
    const sys = nodes.findIndex((n) => n.id === input.system.id);
    const [sysNode] = nodes.splice(sys, 1);
    const firstInt = nodes.findIndex((n) => n.group === bid);
    const half = Math.floor(Math.min(internal.length, 2) / 2);
    nodes.splice(firstInt < 0 ? nodes.length : firstInt + half, 0, sysNode);
    if (ext.length) groups.find((g) => g.id === eid)!.cols = Math.min(ext.length, ext.length > 6 ? 4 : ext.length);
    // order people / externals under the boundary member they talk to (fewer crossings)
    const inB = nodes.filter((n) => n.group === bid).map((n) => n.id);
    const xOf = new Map(inB.map((id, i) => [id, i]));
    const bary = (id: string) => {
      const xs: number[] = [];
      for (const e of edges) {
        if (e.from === id && xOf.has(e.to)) xs.push(xOf.get(e.to)!);
        if (e.to === id && xOf.has(e.from)) xs.push(xOf.get(e.from)!);
      }
      return xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : (inB.length - 1) / 2;
    };
    const reorderGroup = (gid: string) => {
      const members = nodes.filter((n) => n.group === gid);
      const idx = new Map(members.map((n, i) => [n.id, i]));
      const sorted = [...members].sort((a, b) => bary(a.id) - bary(b.id) || idx.get(a.id)! - idx.get(b.id)!);
      let k = 0;
      for (let i = 0; i < nodes.length; i++) if (nodes[i].group === gid) nodes[i] = sorted[k++];
    };
    reorderGroup(aid);
    if (ext.length) reorderGroup(eid);
    rows = [[[aid]], [[bid]], ...(ext.length ? [[[eid]]] : [])];
    columns = undefined;
  }
  void inScope;
  const legend: LegendItem[] = [
    { label: "Person / 角色", mark: "person", role: "client" },
    { label: "System in scope", role: "network" },
    ...(ext.length ? [{ label: "External system", role: "external" as NodeRole }] : []),
    { label: "System boundary", mark: "boundary" },
    ...edgeKindsLegend(edges, { sync: "Uses / calls", async: "Async / event", data: "Data exchange", auth: "Auth / identity" }),
  ];
  return finish("create_system_context", { nodes, groups, edges, columns, rows, wrap: rows ? "auto" : undefined, reorder: rows ? false : undefined, legend, profile: { kind: "context", caption: "SYSTEM CONTEXT · C4 LEVEL 1", nodeNoun: "ELEMENTS", edgeNoun: "RELATIONSHIPS" } }, input);
}

// ── 2. Component diagram ───────────────────────────────────────────────────
const COMP_ROLE: Record<string, NodeRole> = { component: "compute", store: "data", adapter: "network", policy: "security", job: "queue" };
const COMP_ICON: Record<string, string> = { store: "database", adapter: "plug", policy: "check", job: "cpu" };
const EXT_TYPE: Record<string, { role: NodeRole; icon: string; shape?: DiagramNode["shape"] }> = {
  person: { role: "client", icon: "user", shape: "person" },
  system: { role: "external", icon: "server" },
  database: { role: "data", icon: "database", shape: "cylinder" },
  queue: { role: "queue", icon: "stream" },
  cache: { role: "data", icon: "cache" },
  storage: { role: "storage", icon: "storage" },
};

export function compileComponent(input: ComponentInput): CompiledArchitecture {
  const nodes: DiagramNode[] = [];
  const groups: DiagramGroup[] = [];
  const cid = input.container.id;
  groups.push({ id: cid, label: input.container.label, kind: "boundary", tag: input.container.technology ?? "CONTAINER" });
  if (input.interfaces?.length) {
    groups.push({ id: `${cid}__if`, label: "Interfaces", parent: cid, kind: "zone", cols: 1 });
    for (const i of input.interfaces) nodes.push({ id: i.id, label: i.label, subtitle: i.protocol, shape: "interface", role: "gateway", group: `${cid}__if` });
  }
  const layerOrder = input.layers?.length ? [...input.layers] : [];
  for (const c of input.components) if (c.layer && !layerOrder.includes(c.layer)) layerOrder.push(c.layer);
  const layerId = (l: string) => `${cid}__L${layerOrder.indexOf(l)}`;
  for (const l of layerOrder) {
    const n = input.components.filter((c) => c.layer === l).length;
    if (n) groups.push({ id: layerId(l), label: l, parent: cid, kind: "zone", cols: n > 4 ? 2 : 1 });
  }
  const unlayered = input.components.filter((c) => !c.layer);
  const coreGroup = unlayered.length && (layerOrder.length || input.interfaces?.length);
  if (coreGroup) groups.push({ id: `${cid}__core`, label: "Components", parent: cid, kind: "zone", cols: unlayered.length > 6 ? 3 : unlayered.length > 3 ? 2 : 1 });
  for (const c of input.components) {
    const t = c.type ?? "component";
    nodes.push({
      id: c.id,
      label: c.label,
      subtitle: c.technology,
      description: c.responsibility,
      shape: t === "store" ? "cylinder" : "component",
      role: COMP_ROLE[t] ?? "compute",
      icon: c.icon ?? COMP_ICON[t] ?? "component",
      group: c.layer ? layerId(c.layer) : coreGroup ? `${cid}__core` : cid,
    });
  }
  if (!coreGroup && unlayered.length > 3) groups[0].cols = unlayered.length > 6 ? 3 : 2;
  const edges: DiagramEdge[] = input.relationships.map((r) => ({ from: r.from, to: r.to, label: joinLabel(r.label, r.technology ? `[${r.technology}]` : undefined), kind: (r.kind ?? "sync") as EdgeKind, step: r.step }));
  flowSortMembers(nodes, edges);
  const inside = new Set([cid, ...groups.map((g) => g.id), ...nodes.map((n) => n.id)]);
  const left: string[] = [];
  const rightIds: string[] = [];
  for (const x of input.externals ?? []) {
    const t = EXT_TYPE[x.type ?? "system"];
    nodes.push({ id: x.id, label: x.label, description: x.description, role: t.role, icon: t.icon, shape: t.shape, subtitle: x.type === "person" ? "[Person]" : undefined });
    const side = x.side ?? (x.type === "person" ? "left" : sideOf(x.id, edges, (y) => inside.has(y)));
    (side === "left" ? left : rightIds).push(x.id);
  }
  const right: string[] = [];
  if (rightIds.length) {
    groups.push({ id: "__deps", label: "Dependencies", kind: "external", cols: rightIds.length > 4 ? 2 : 1 });
    for (const n of nodes) if (rightIds.includes(n.id)) n.group = "__deps";
    right.push("__deps");
  }
  const columns: string[][] = [];
  if (left.length) columns.push(left);
  columns.push([cid]);
  if (right.length) columns.push(right);
  const legend: LegendItem[] = [
    ...(input.interfaces?.length ? [{ label: "Provided interface", role: "gateway" as NodeRole }] : []),
    { label: "Component", role: "compute" },
    ...(input.components.some((c) => c.type === "policy") ? [{ label: "Policy / guard", role: "security" as NodeRole }] : []),
    { label: "Container boundary", mark: "boundary" },
    ...edgeKindsLegend(edges, { sync: "Calls", async: "Publishes / consumes", data: "Reads / writes", auth: "Auth" }),
  ];
  return finish("create_component_diagram", { nodes, groups, edges, columns, legend, profile: { kind: "component", caption: "COMPONENT DIAGRAM · C4 LEVEL 3", nodeNoun: "COMPONENTS", edgeNoun: "DEPENDENCIES" } }, input);
}

// ── 3. Deployment topology ─────────────────────────────────────────────────
const WL: Record<string, { tag: string; role: NodeRole; icon: string; shape?: DiagramNode["shape"] }> = {
  deployment: { tag: "DEPLOY", role: "compute", icon: "container", shape: "pod" },
  statefulset: { tag: "STS", role: "data", icon: "database", shape: "pod" },
  daemonset: { tag: "DS", role: "observability", icon: "container", shape: "pod" },
  job: { tag: "JOB", role: "queue", icon: "cpu", shape: "pod" },
  cronjob: { tag: "CRON", role: "queue", icon: "cpu", shape: "pod" },
  pod: { tag: "POD", role: "compute", icon: "container", shape: "pod" },
  service: { tag: "SVC", role: "network", icon: "loadbalancer" },
  ingress: { tag: "ING", role: "gateway", icon: "loadbalancer" },
  gateway: { tag: "GW", role: "gateway", icon: "gateway" },
  configmap: { tag: "CM", role: "default", icon: "file" },
  secret: { tag: "SECRET", role: "security", icon: "lock" },
};
const OUT: Record<string, { role: NodeRole; icon: string; shape?: DiagramNode["shape"] }> = {
  database: { role: "data", icon: "database", shape: "cylinder" },
  storage: { role: "storage", icon: "storage" },
  queue: { role: "queue", icon: "stream" },
  cache: { role: "data", icon: "cache" },
  saas: { role: "external", icon: "cloud" },
  user: { role: "client", icon: "user", shape: "person" },
  loadbalancer: { role: "network", icon: "loadbalancer" },
  dns: { role: "network", icon: "dns" },
  registry: { role: "storage", icon: "box" },
  server: { role: "compute", icon: "server" },
  system: { role: "external", icon: "server" },
};

export function compileDeployment(input: DeploymentInput): CompiledArchitecture {
  const nodes: DiagramNode[] = [];
  const groups: DiagramGroup[] = [];
  for (const c of input.clusters) {
    groups.push({ id: c.id, label: c.label, kind: "cluster", tag: joinLabel(c.provider, c.version, c.region) ?? "KUBERNETES" });
    for (const ns of c.namespaces) {
      const n = ns.workloads.length;
      groups.push({ id: ns.id, label: ns.label, parent: c.id, kind: "namespace", tag: "NAMESPACE", cols: n > 6 ? 3 : n > 3 ? 2 : 1 });
      for (const w of ns.workloads) {
        const t = WL[w.type ?? "deployment"];
        nodes.push({
          id: w.id,
          label: w.label,
          // image · :port when it fits a card; the port also shows on the edges
          subtitle: (() => {
            const full = joinLabel(w.image, w.port != null ? `:${w.port}` : undefined);
            return full && full.length > 21 && w.image ? w.image : full;
          })(),
          description: w.description,
          role: t.role,
          icon: t.icon,
          shape: t.shape,
          tag: t.tag,
          replicas: t.shape === "pod" && (w.replicas ?? 1) > 1 ? w.replicas : undefined,
          group: ns.id,
        });
      }
    }
  }
  const edges: DiagramEdge[] = (input.connections ?? []).map((c) => ({
    from: c.from,
    to: c.to,
    label: joinLabel(c.label, [c.protocol, c.port != null ? String(c.port) : undefined].filter(Boolean).join(" ") || undefined),
    kind: (c.kind ?? "sync") as EdgeKind,
    step: c.step,
  }));
  const inCluster = new Set([...groups.map((g) => g.id), ...nodes.map((n) => n.id)]);
  const left: string[] = [];
  const right: string[] = [];
  for (const o of input.outside ?? []) {
    const t = OUT[o.type ?? "system"];
    nodes.push({ id: o.id, label: o.label, subtitle: o.location, description: o.description, role: t.role, icon: t.icon, shape: t.shape });
    const t0 = o.type ?? "system";
    const side = o.side ?? (t0 === "user" || t0 === "dns" || t0 === "loadbalancer" ? "left" : t0 === "system" || t0 === "server" || t0 === "saas" ? sideOf(o.id, edges, (y) => inCluster.has(y)) : "right");
    (side === "left" ? left : right).push(o.id);
  }
  if (right.length) {
    groups.push({ id: "__outside", label: "Outside cluster", kind: "external", cols: right.length > 4 ? 2 : 1 });
    for (const n of nodes) if (right.includes(n.id)) n.group = "__outside";
  }
  // clusters ranked by flow (multi-cluster / DR layouts)
  const unitOf = unitResolver(nodes, groups);
  const clusterCols = rankColumns(input.clusters.map((c) => c.id), edges, unitOf);
  const columns: string[][] = [...(left.length ? [left] : []), ...clusterCols, ...(right.length ? [["__outside"]] : [])];
  const legend: LegendItem[] = [
    { label: "Workload (×N replicas)", mark: "replicas", role: "compute" },
    ...(nodes.some((n) => n.role === "network" && n.tag === "SVC") ? [{ label: "Service / ingress", role: "network" as NodeRole }] : []),
    ...(right.length ? [{ label: "Outside the cluster", role: "external" as NodeRole }] : []),
    ...edgeKindsLegend(edges, { sync: "Request", async: "Async / events", data: "Data connection", auth: "Auth" }),
  ];
  flowSortMembers(nodes, edges);
  return finish("create_deployment_topology", { nodes, groups, edges, columns, legend, profile: { kind: "deployment", caption: "DEPLOYMENT TOPOLOGY", nodeNoun: "WORKLOADS", edgeNoun: "CONNECTIONS" } }, input);
}

// ── 4. Network topology ────────────────────────────────────────────────────
const ZONE_KIND: Record<string, DiagramGroup["kind"]> = { internet: "internet", dmz: "dmz", vpc: "vpc", subnet: "subnet", onprem: "site", site: "site", cloud: "region", segment: "zone", mgmt: "security" };
const DEV: Record<string, { role: NodeRole; icon: string; shape?: DiagramNode["shape"] }> = {
  firewall: { role: "security", icon: "firewall" },
  waf: { role: "security", icon: "firewall" },
  router: { role: "network", icon: "router" },
  nat: { role: "network", icon: "router" },
  switch: { role: "network", icon: "switch" },
  loadbalancer: { role: "gateway", icon: "loadbalancer" },
  proxy: { role: "gateway", icon: "gateway" },
  gateway: { role: "gateway", icon: "gateway" },
  vpn: { role: "security", icon: "vpn" },
  server: { role: "compute", icon: "server" },
  host: { role: "compute", icon: "server" },
  workstation: { role: "client", icon: "monitor" },
  plc: { role: "queue", icon: "cpu" },
  internet: { role: "external", icon: "globe" },
  cloud: { role: "external", icon: "cloud" },
  dns: { role: "network", icon: "dns" },
  database: { role: "data", icon: "database", shape: "cylinder" },
};
const LINK_KIND: Record<string, EdgeKind> = { allow: "sync", route: "default", vpn: "async", deny: "auth", mgmt: "data" };

export function compileNetwork(input: NetworkInput): CompiledArchitecture {
  const groups: DiagramGroup[] = input.zones.map((z) => ({ id: z.id, label: z.label, parent: z.parent, kind: ZONE_KIND[z.type ?? "segment"] ?? "zone", tag: z.cidr }));
  const nodes: DiagramNode[] = input.devices.map((d) => {
    const t = DEV[d.type ?? "server"] ?? DEV.server;
    return { id: d.id, label: d.label, subtitle: d.ip, description: d.description, role: t.role, icon: t.icon, shape: t.shape, group: d.zone };
  });
  for (const g of groups) {
    const n = nodes.filter((x) => x.group === g.id).length;
    if (n > 3) g.cols = n > 6 ? 3 : 2;
  }
  const edges: DiagramEdge[] = (input.links ?? []).map((l) => {
    const pp = [l.protocol, l.port != null ? String(l.port) : undefined].filter(Boolean).join(" ");
    const type = l.type ?? "allow";
    return {
      from: l.from,
      to: l.to,
      label: joinLabel(type === "deny" ? "DENY" : undefined, l.label, pp || undefined),
      kind: LINK_KIND[type],
      bidirectional: l.bidirectional,
      step: l.step,
    };
  });
  const unitOf = unitResolver(nodes, groups);
  const units = [...new Set([...groups.filter((g) => !g.parent).map((g) => g.id), ...nodes.filter((n) => !n.group).map((n) => n.id)])];
  const internetish = units.filter((u) => groups.find((g) => g.id === u)?.kind === "internet");
  const columns = rankColumns(units, edges, unitOf, new Map(internetish.map((u) => [u, 0])));
  const used = new Set(edges.map((e) => e.kind));
  const legend: LegendItem[] = [
    ...(nodes.some((n) => n.role === "security") ? [{ label: "Firewall / security device", role: "security" as NodeRole }] : []),
    { label: "Network device", role: "network" },
    ...(used.has("sync") ? [{ label: "Allowed traffic", kind: "sync" as EdgeKind }] : []),
    ...(used.has("async") ? [{ label: "VPN / tunnel", kind: "async" as EdgeKind }] : []),
    ...(used.has("default") ? [{ label: "Routing", kind: "default" as EdgeKind }] : []),
    ...(used.has("data") ? [{ label: "Management", kind: "data" as EdgeKind }] : []),
    ...(used.has("auth") ? [{ label: "Denied", kind: "auth" as EdgeKind }] : []),
  ];
  return finish("create_network_topology", { nodes, groups, edges, columns, legend, profile: { kind: "network", caption: "NETWORK TOPOLOGY", nodeNoun: "DEVICES", edgeNoun: "LINKS" } }, input);
}

// ── 5. Data flow + trust boundaries ────────────────────────────────────────
const TRUST_TAG: Record<string, string> = { untrusted: "UNTRUSTED", low: "TRUST · LOW", medium: "TRUST · MEDIUM", high: "TRUST · HIGH", restricted: "RESTRICTED" };

export function compileDataflow(input: DataflowInput): CompiledArchitecture {
  const groups: DiagramGroup[] = (input.boundaries ?? []).map((b) => ({ id: b.id, label: b.label, parent: b.parent, kind: "trust", tag: b.trust ? TRUST_TAG[b.trust] : "TRUST BOUNDARY" }));
  const nodes: DiagramNode[] = [];
  for (const e of input.externalEntities ?? []) nodes.push({ id: e.id, label: e.label, description: e.description, shape: "entity", role: "client", icon: "none", group: e.boundary });
  input.processes.forEach((p, i) => nodes.push({ id: p.id, label: p.label, description: p.description, shape: "process", role: "compute", icon: "none", tag: p.number ? `P${p.number.replace(/^P/i, "")}` : `P${i + 1}`, group: p.boundary }));
  (input.dataStores ?? []).forEach((d, i) => nodes.push({ id: d.id, label: d.label, shape: "datastore", role: "data", icon: "none", tag: d.number ?? `D${i + 1}`, group: d.boundary }));
  for (const g of groups) {
    const n = nodes.filter((x) => x.group === g.id).length;
    if (n > 3) g.cols = n > 6 ? 3 : 2;
  }
  // boundary chain per node → a flow crosses when the chains differ
  const gById = new Map(groups.map((g) => [g.id, g]));
  const chain = (id: string) => {
    const out: string[] = [];
    let cur = nodes.find((n) => n.id === id)?.group;
    while (cur && gById.has(cur)) {
      out.push(cur);
      cur = gById.get(cur)!.parent;
    }
    return out.join("/");
  };
  const edges: DiagramEdge[] = input.flows.map((f) => {
    const crosses = chain(f.from) !== chain(f.to);
    return {
      from: f.from,
      to: f.to,
      label: labelWithTags(joinLabel(f.label, f.protocol), f.data),
      tags: f.data?.length ? f.data : undefined,
      kind: (f.kind ?? "data") as EdgeKind,
      step: f.step,
      highlight: crosses || undefined,
    };
  });
  const unitOf = unitResolver(nodes, groups);
  const units = [...new Set([...groups.filter((g) => !g.parent).map((g) => g.id), ...nodes.filter((n) => !n.group).map((n) => n.id)])];
  const columns = rankColumns(units, edges, unitOf);
  const legend: LegendItem[] = [
    { label: "External entity", mark: "entity", role: "client" },
    { label: "Process", mark: "process", role: "compute" },
    ...((input.dataStores ?? []).length ? [{ label: "Data store", mark: "datastore" as const, role: "data" as NodeRole }] : []),
    ...(groups.length ? [{ label: "Trust boundary", mark: "trust" as const }] : []),
    ...(edges.some((e) => e.highlight) ? [{ label: "Crosses a boundary", mark: "cross" as const }] : []),
    ...(edges.some((e) => e.tags) ? [{ label: "Sensitive data", mark: "sensitive" as const }] : []),
  ];
  flowSortMembers(nodes, edges);
  return finish("create_dataflow_trust_boundary", { nodes, groups, edges, columns, legend, profile: { kind: "dfd", caption: "DATA FLOW DIAGRAM · TRUST BOUNDARIES", nodeNoun: "ELEMENTS", edgeNoun: "DATA FLOWS" } }, input);
}
