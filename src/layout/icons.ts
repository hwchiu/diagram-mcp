import type { NodeRole } from "../design/themes.js";
/**
 * Monoline icon set (24×24, 1.75 stroke, round caps) — Lucide-inspired, hand-tuned.
 * One consistent stroke family; never brand logos.
 */
export const MONO_PATHS = {
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  browser: "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M2 9h20 M5 7h.01 M8 7h.01",
  mobile: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M11 18h2",
  terminal: "M3 4h18v16H3z M7 9l3 3-3 3 M12 15h5",
  globe:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  dns: "M12 2v20 M6 4h11l3 3-3 3H6z M18 12H7l-3 3 3 3h11z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4",
  firewall: "M3 4h18v16H3z M3 9.3h18 M3 14.6h18 M9 4v5.3 M15 9.3v5.3 M9 14.6V20",
  gateway: "M9 9h6v6H9z M12 2v7 M12 15v7 M2 12h7 M15 12h7 M5 9l-3 3 3 3 M19 9l3 3-3 3",
  loadbalancer: "M10 2h4v4h-4z M12 6v4 M5 14v-2h14v2 M12 10v4 M3 14h4v4H3z M10 14h4v4h-4z M17 14h4v4h-4z",
  server:
    "M4 3h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M4 13h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z M7 7h.01 M7 17h.01 M11 7h6 M11 17h6",
  container: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  cluster: "M12 2l8.66 5v10L12 22l-8.66-5V7z M12 7.5v9 M8.1 9.75l7.8 4.5 M15.9 9.75l-7.8 4.5",
  function: "M5 4h3.5l9.5 16 M12.2 11.8L6 20 M15 20h4",
  cpu: "M6 6h12v12H6z M9.5 9.5h5v5h-5z M9 2v4 M15 2v4 M9 18v4 M15 18v4 M2 9h4 M2 15h4 M18 9h4 M18 15h4",
  database:
    "M12 2C7 2 3 3.8 3 6v12c0 2.2 4 4 9 4s9-1.8 9-4V6c0-2.2-4-4-9-4z M3 6c0 2.2 4 4 9 4s9-1.8 9-4 M3 12c0 2.2 4 4 9 4s9-1.8 9-4",
  cache: "M13 2L4 14h7l-1 8 9-12h-7z",
  queue: "M3 7h4v10H3z M10 7h4v10h-4z M17 7h4v10h-4z",
  stream: "M2 8c2.5-3.3 5-3.3 7.5 0s5 3.3 7.5 0 3.5-3.3 5 0 M2 16c2.5-3.3 5-3.3 7.5 0s5 3.3 7.5 0 3.5-3.3 5 0",
  storage: "M4 6h16l-1.8 13.2a2 2 0 0 1-2 1.8H7.8a2 2 0 0 1-2-1.8z M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3 M4 6c0 1.7 3.6 3 8 3s8-1.3 8-3",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M22 6l-10 7L2 6",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0",
  payment: "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M2 10h20 M6 15h4",
  cart: "M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.6L21 7H6 M9 21h.01 M18 21h.01",
  order: "M5 2v20l2.3-1.5 2.3 1.5 2.4-1.5 2.3 1.5 2.4-1.5L19 22V2l-2.3 1.5L14.4 2 12 3.5 9.6 2 7.3 3.5z M8.5 8h7 M8.5 12h7 M8.5 16h4",
  box: "M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10",
  truck: "M1 4h14v12H1z M15 8h4l3 3v5h-7z M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  tag: "M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z M7 7h.01",
  cloud: "M17.5 19a4.5 4.5 0 1 0-.3-9 7 7 0 1 0-13.4 2.2A4 4 0 0 0 6 19z",
  region: "M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  chart: "M3 3v18h18 M7 15l4-4 3 3 6-7",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  logs: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4 M12 15v2",
  key: "M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l2.1-2.1A4 4 0 0 1 15 7z M16 9.5h.01",
  layers: "M12 2L2 7l10 5 10-5-10-5z M2 12l10 5 10-5 M2 17l10 5 10-5",
  replica: "M8 8h12v12H8z M4 16V4h12",
  router: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M7.5 12h9 M14 9.5l2.5 2.5-2.5 2.5 M10 9.5L7.5 12l2.5 2.5",
  switch: "M3 7h18v10H3z M7 11h.01 M10 11h.01 M13 11h.01 M16 11h.01 M7 14h10",
  vpn: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 11h6v5H9z M10 11V9a2 2 0 0 1 4 0v2",
  monitor: "M3 4h18v12H3z M8 20h8 M12 16v4",
  factory: "M2 20V9l6 4V9l6 4V5h4l2 15z M2 20h20 M6 17h2 M11 17h2",
  building: "M4 21V3h11v18 M15 9h5v12 M8 7h3 M8 11h3 M8 15h3 M2 21h20",
  component: "M8 3h12v18H8z M4 7h7v3H4z M4 14h7v3H4z",
  check: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M8.5 12l2.5 2.5 4.5-5",
  mask: "M3 3l18 18 M10.6 10.6a2 2 0 0 0 2.8 2.8 M9.9 5.1A10 10 0 0 1 22 12a17 17 0 0 1-2.2 3.2 M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5",
  plug: "M9 2v6 M15 2v6 M6 8h12v4a6 6 0 0 1-12 0z M12 18v4",
  approve: "M22 11.1V12a10 10 0 1 1-5.9-9.1 M22 4L12 14l-3-3",
  namespace: "M4 4h16v16H4z M4 9h16 M8 6.5h.01",
  none: "",
} as const;

export type MonoIcon = keyof typeof MONO_PATHS;

const ALIAS: Record<string, MonoIcon> = {
  person: "user", customer: "user", admin: "terminal", console: "terminal", cli: "terminal",
  team: "users", clients: "users",
  web: "browser", spa: "browser", frontend: "browser",
  phone: "mobile", ios: "mobile", android: "mobile", app: "mobile",
  cdn: "globe", cloudfront: "globe", cloudflare: "globe", edge: "globe", internet: "globe",
  route53: "dns", "cloud-dns": "dns",
  waf: "firewall", security: "shield", guard: "shield",
  apigateway: "gateway", "api-gateway": "gateway", kong: "gateway", bff: "gateway", graphql: "gateway", envoy: "gateway", mesh: "gateway",
  alb: "loadbalancer", nlb: "loadbalancer", elb: "loadbalancer", lb: "loadbalancer", ingress: "loadbalancer", nginx: "loadbalancer",
  service: "server", compute: "server", ec2: "server", vm: "server",
  pod: "container", fargate: "container", ecs: "container", docker: "container", deployment: "container",
  kubernetes: "cluster", k8s: "cluster", eks: "cluster", gke: "cluster", aks: "cluster",
  lambda: "function", serverless: "function", faas: "function", worker: "cpu", ml: "cpu", gpu: "cpu",
  db: "database", postgres: "database", postgresql: "database", mysql: "database", mongodb: "database",
  dynamodb: "database", aurora: "database", rds: "database", sql: "database", spanner: "database",
  redis: "cache", elasticache: "cache", memcached: "cache",
  kafka: "stream", msk: "stream", kinesis: "stream", pubsub: "stream", topic: "stream", events: "stream", eventbus: "stream",
  sqs: "queue", rabbitmq: "queue", mq: "queue",
  s3: "storage", gcs: "storage", blob: "storage", bucket: "storage", object: "storage",
  elasticsearch: "search", opensearch: "search",
  email: "mail", ses: "mail", sms: "bell", notify: "bell", notification: "bell", push: "bell",
  stripe: "payment", card: "payment", billing: "payment",
  checkout: "cart", basket: "cart",
  orders: "order", receipt: "order",
  inventory: "box", package: "box", stock: "box",
  shipping: "truck", delivery: "truck",
  catalog: "tag", product: "tag", pricing: "tag",
  aws: "cloud", gcp: "cloud", azure: "cloud",
  vpc: "region", zone: "region",
  monitoring: "chart", prometheus: "chart", grafana: "chart", metrics: "chart", observability: "chart",
  tracing: "activity", tempo: "activity", jaeger: "activity", otel: "activity", opentelemetry: "activity", apm: "activity",
  loki: "logs", logging: "logs", elk: "logs",
  auth: "key", oidc: "key", oauth: "key", jwt: "key", cognito: "key", iam: "key", identity: "key",
  vault: "lock", secrets: "lock", kms: "lock",
  vpngw: "vpn", ipsec: "vpn", tunnel: "vpn", nat: "router", gw: "router", igw: "router", tgw: "router", "transit-gateway": "router",
  l3: "router", core: "switch", tor: "switch", workstation: "monitor", desktop: "monitor", pc: "monitor", host: "server", node: "server",
  plant: "factory", fab: "factory", mes: "factory", office: "building", hq: "building", company: "building", org: "building",
  module: "component", authz: "check", rbac: "check", policy: "check", masking: "mask", mask: "mask", redact: "mask",
  doc: "file", document: "file", form: "file", report: "file", api: "plug", endpoint: "plug", review: "approve", approval: "approve",
  ns: "namespace", statefulset: "container", daemonset: "container", job: "cpu", cronjob: "cpu", mariadb: "database", oracle: "database",
  replication: "replica", replica: "replica",
};

/** Map role / common icon aliases → monoline icon */
export function resolveMonoIcon(icon?: string, role?: NodeRole, shape?: string): MonoIcon {
  const key = (icon ?? "").toLowerCase().trim();
  if (key && key in MONO_PATHS) return key as MonoIcon;
  if (key && ALIAS[key]) return ALIAS[key];
  if (shape === "person") return "user";
  if (shape === "cylinder") return "database";
  if (shape === "queue") return "queue";
  if (shape === "cloud") return "cloud";
  if (shape === "component") return "component";
  if (shape === "pod") return "container";
  if (shape === "datastore") return "database";
  if (shape === "interface") return "plug";
  switch (role) {
    case "client":
      return "browser";
    case "external":
      return "globe";
    case "network":
      return "globe";
    case "security":
      return "shield";
    case "gateway":
      return "gateway";
    case "compute":
      return "server";
    case "data":
      return "database";
    case "queue":
      return "stream";
    case "storage":
      return "storage";
    case "observability":
      return "chart";
    default:
      return "server";
  }
}

export function monoIconSvg(
  name: MonoIcon,
  opts: { size?: number; stroke?: string; strokeWidth?: number } = {},
): string {
  const size = opts.size ?? 28;
  const stroke = opts.stroke ?? "currentColor";
  const sw = opts.strokeWidth ?? 1.75;
  const d = MONO_PATHS[name];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}
