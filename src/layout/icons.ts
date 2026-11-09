
import type { NodeRole } from "../design/themes.js";
/**
 * Vendored monoline icon paths (Lucide-inspired, MIT-style).
 * Single stroke set — never mix brand logos.
 */
export type MonoIcon =
  | "user"
  | "browser"
  | "mobile"
  | "globe"
  | "shield"
  | "gateway"
  | "server"
  | "database"
  | "cache"
  | "queue"
  | "storage"
  | "search"
  | "mail"
  | "payment"
  | "cloud"
  | "region"
  | "cluster"
  | "chart"
  | "lock"
  | "layers";

/** viewBox 0 0 24 24 path d values */
export const MONO_PATHS: Record<MonoIcon, string> = {
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  browser: "M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z M2 10h20",
  mobile: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M12 18h.01",
  globe:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  gateway: "M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5",
  server:
    "M4 4h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z M6 8h.01 M6 18h.01",
  database:
    "M12 2C7 2 3 3.8 3 6v12c0 2.2 4 4 9 4s9-1.8 9-4V6c0-2.2-4-4-9-4z M3 6c0 2.2 4 4 9 4s9-1.8 9-4 M3 12c0 2.2 4 4 9 4s9-1.8 9-4",
  cache:
    "M12 2v6 M12 16v6 M4.9 4.9l4.2 4.2 M14.9 14.9l4.2 4.2 M2 12h6 M16 12h6 M4.9 19.1l4.2-4.2 M14.9 9.1l4.2-4.2",
  queue: "M4 6h16 M4 12h16 M4 18h10 M18 16l4 2-4 2",
  storage: "M22 12H2 M5.5 5.5L2 12l3.5 6.5h13L22 12l-3.5-6.5h-13z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M22 6l-10 7L2 6",
  payment: "M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8z M2 10h20",
  cloud: "M17.5 19a4.5 4.5 0 1 0-.3-9 7 7 0 1 0-13.4 2.2A4 4 0 0 0 6 19z",
  region: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 8v8 M8 12h8",
  cluster:
    "M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5",
  chart: "M3 3v18h18 M7 14l4-4 4 4 5-6",
  lock: "M12 17a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M7 11V7a5 5 0 0 1 10 0v4 M5 11h14v10H5V11z",
  layers: "M12 2L2 7l10 5 10-5-10-5z M2 12l10 5 10-5 M2 17l10 5 10-5",
};


/** Map role / common icon aliases → monoline icon */
export function resolveMonoIcon(icon?: string, role?: NodeRole, shape?: string): MonoIcon {
  const key = (icon ?? "").toLowerCase();
  const alias: Record<string, MonoIcon> = {
    user: "user",
    users: "user",
    person: "user",
    browser: "browser",
    web: "browser",
    mobile: "mobile",
    phone: "mobile",
    cdn: "globe",
    globe: "globe",
    cloudflare: "globe",
    dns: "globe",
    route53: "globe",
    waf: "shield",
    shield: "shield",
    security: "shield",
    gateway: "gateway",
    apigateway: "gateway",
    alb: "gateway",
    nginx: "gateway",
    ingress: "gateway",
    server: "server",
    service: "server",
    compute: "server",
    fargate: "server",
    lambda: "server",
    database: "database",
    db: "database",
    postgres: "database",
    postgresql: "database",
    mysql: "database",
    mongodb: "database",
    dynamodb: "database",
    aurora: "database",
    cache: "cache",
    redis: "cache",
    elasticache: "cache",
    queue: "queue",
    kafka: "queue",
    msk: "queue",
    sqs: "queue",
    stream: "queue",
    storage: "storage",
    s3: "storage",
    object: "storage",
    search: "search",
    elasticsearch: "search",
    opensearch: "search",
    mail: "mail",
    email: "mail",
    ses: "mail",
    notify: "mail",
    payment: "payment",
    stripe: "payment",
    card: "payment",
    cloud: "cloud",
    aws: "cloud",
    region: "region",
    cluster: "cluster",
    kubernetes: "cluster",
    k8s: "cluster",
    chart: "chart",
    monitoring: "chart",
    prometheus: "chart",
    grafana: "chart",
    observability: "chart",
    lock: "lock",
    auth: "lock",
    cognito: "lock",
    vault: "lock",
    layers: "layers",
    bff: "gateway",
    graphql: "gateway",
  };
  if (key && alias[key]) return alias[key];
  if (shape === "person") return "user";
  if (shape === "cylinder") return "database";
  if (shape === "queue") return "queue";
  if (shape === "cloud") return "cloud";
  switch (role) {
    case "external":
      return "user";
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
      return "queue";
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
