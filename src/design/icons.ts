import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const ICONS_DIR = path.join(ROOT, "assets", "icons");

/** Map friendly / cloud service names → local SVG basename (no .svg). */
const ALIASES: Record<string, string> = {
  // AWS
  aws: "aws",
  amazon: "aws",
  ec2: "ec2",
  compute: "ec2",
  s3: "s3",
  bucket: "s3",
  rds: "rds",
  aurora: "rds",
  postgres: "postgresql",
  postgresql: "postgresql",
  mysql: "mysql",
  dynamodb: "dynamodb",
  ddb: "dynamodb",
  lambda: "lambda",
  sqs: "sqs",
  queue: "sqs",
  sns: "sqs",
  apigateway: "apigateway",
  "api-gateway": "apigateway",
  api: "apigateway",
  alb: "apigateway",
  elb: "apigateway",
  cloudwatch: "cloudwatch",
  ecs: "ecs",
  eks: "eks",
  fargate: "ecs",
  // GCP / Azure / K8s
  gcp: "gcp",
  gke: "kubernetes",
  azure: "gcp", // fallback until azure icon present
  aks: "kubernetes",
  kubernetes: "kubernetes",
  k8s: "kubernetes",
  docker: "docker",
  // Data / messaging
  redis: "redis",
  kafka: "kafka",
  rabbitmq: "rabbitmq",
  mongodb: "mongodb",
  mongo: "mongodb",
  elasticsearch: "elasticsearch",
  elastic: "elasticsearch",
  cassandra: "cassandra",
  neo4j: "neo4j",
  sqlite: "sqlite",
  minio: "minio",
  // Edge / mesh
  nginx: "nginx",
  traefik: "traefik",
  istio: "istio",
  cloudflare: "cloudflare",
  proxy: "proxy",
  // Observability / security
  prometheus: "prometheus",
  grafana: "grafana",
  jaeger: "jaeger",
  otel: "opentelemetry",
  opentelemetry: "opentelemetry",
  vault: "vault",
  consul: "consul",
  auth0: "auth0",
  openid: "openid",
  // App / lang
  node: "nodejs",
  nodejs: "nodejs",
  go: "go",
  golang: "go",
  python: "python",
  typescript: "typescript",
  react: "react",
  next: "nextjs",
  nextjs: "nextjs",
  fastapi: "fastapi",
  spring: "springboot",
  springboot: "springboot",
  graphql: "graphql",
  helm: "helm",
  terraform: "terraform",
  celery: "celery",
  github: "githubactions",
  githubactions: "githubactions",
};

export function resolveIconPath(icon?: string): string | undefined {
  if (!icon) return undefined;
  if (icon.startsWith("/") && fs.existsSync(icon)) return icon;
  if (icon.endsWith(".svg") && fs.existsSync(icon)) return icon;

  const key = icon.toLowerCase().replace(/\s+/g, "").replace(/_/g, "-");
  const base = ALIASES[key] ?? ALIASES[key.replace(/-/g, "")] ?? key;
  const candidate = path.join(ICONS_DIR, `${base}.svg`);
  if (fs.existsSync(candidate)) return candidate;

  // fuzzy: try basename
  const loose = path.join(ICONS_DIR, `${key}.svg`);
  if (fs.existsSync(loose)) return loose;
  return undefined;
}

export function listIcons(): string[] {
  if (!fs.existsSync(ICONS_DIR)) return [];
  return fs
    .readdirSync(ICONS_DIR)
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.replace(/\.svg$/, ""))
    .sort();
}
