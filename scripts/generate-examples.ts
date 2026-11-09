/**
 * Render showcase examples for all 5 diagram kinds into examples/.
 * Run: npm run examples
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderPipeline } from "../src/render/pipeline.js";
import { compileCloud } from "../src/compilers/cloud.js";
import { compileMicroservice } from "../src/compilers/microservice.js";
import { compileFlowchart } from "../src/compilers/flowchart.js";
import { compileDecision } from "../src/compilers/decision.js";
import { compileDependency } from "../src/compilers/dependency.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "examples");

async function render(
  name: string,
  compiled: { engine: "d2" | "mermaid" | "dot"; source: string },
  theme: string,
) {
  const result = await renderPipeline({
    engine: compiled.engine,
    source: compiled.source,
    themeId: theme,
    name,
    outputDir: OUT,
    includePreview: false,
    layout: "dagre",
  });
  console.log(`✓ ${name} → ${result.pngPath} (${result.width}×${result.height})`);
  return result;
}

function cloudExample() {
  // Flatter nesting (region → zone) keeps ELK layout poster-like, not skyscraper-tall.
  return compileCloud({
    title: "Multi-Region Commerce Platform",
    subtitle: "AWS + EKS · Active-active · Production",
    theme: "presentation",
    name: "01-cloud-architecture",
    provider: "aws",
    groups: [
      { id: "edge", label: "Edge & DNS", kind: "other" },
      { id: "use1", label: "us-east-1 · Primary", kind: "region" },
      { id: "pub_e", label: "Public / Ingress", parent: "use1", kind: "subnet" },
      { id: "shop_e", label: "EKS · shopping + platform", parent: "use1", kind: "cluster" },
      { id: "data_e", label: "Data Tier", parent: "use1", kind: "other" },
      { id: "usw2", label: "us-west-2 · Secondary", kind: "region" },
      { id: "west_app", label: "EKS West", parent: "usw2", kind: "cluster" },
      { id: "west_data", label: "Data West", parent: "usw2", kind: "other" },
      { id: "sec", label: "Security & Identity", kind: "other" },
      { id: "obs", label: "Observability", kind: "other" },
    ],
    nodes: [
      { id: "users", label: "Clients", subtitle: "Web · Mobile", role: "external", shape: "person" },
      { id: "cf", label: "CloudFront", subtitle: "CDN + WAF", role: "network", icon: "cloudflare", group: "edge" },
      { id: "r53", label: "Route 53", subtitle: "latency routing", role: "network", icon: "aws", group: "edge" },
      { id: "ext_pay", label: "Stripe", subtitle: "payments", role: "external", icon: "cloudflare", group: "edge" },
      { id: "ext_email", label: "SES", subtitle: "email", role: "external", icon: "aws", group: "edge" },

      { id: "alb_e", label: "ALB", subtitle: "HTTPS :443", role: "gateway", icon: "apigateway", group: "pub_e" },
      { id: "ing_e", label: "Ingress NGINX", role: "gateway", icon: "nginx", group: "pub_e" },
      { id: "nat_e", label: "NAT Gateway", role: "network", icon: "aws", group: "pub_e" },

      { id: "gw_e", label: "API Gateway", subtitle: "Kong", role: "gateway", icon: "apigateway", group: "shop_e" },
      { id: "mesh", label: "Istio Mesh", role: "network", icon: "istio", group: "shop_e" },
      { id: "cart", label: "Cart", subtitle: "Go · gRPC", role: "compute", icon: "go", group: "shop_e" },
      { id: "catalog", label: "Catalog", subtitle: "Go · gRPC", role: "compute", icon: "go", group: "shop_e" },
      { id: "checkout", label: "Checkout", subtitle: "TypeScript", role: "compute", icon: "typescript", group: "shop_e" },
      { id: "search", label: "Search", subtitle: "Python", role: "compute", icon: "python", group: "shop_e" },
      { id: "rec", label: "Recommendations", subtitle: "Python · ML", role: "compute", icon: "python", group: "shop_e" },

      { id: "redis_e", label: "ElastiCache", subtitle: "Redis", role: "data", icon: "redis", group: "data_e" },
      { id: "aurora_e", label: "Aurora PG", subtitle: "Multi-AZ", role: "data", icon: "postgresql", group: "data_e" },
      { id: "os_e", label: "OpenSearch", role: "data", icon: "elasticsearch", group: "data_e" },
      { id: "s3_e", label: "S3 Assets", role: "storage", icon: "s3", group: "data_e" },
      { id: "msk_e", label: "MSK Kafka", role: "queue", icon: "kafka", group: "data_e" },

      { id: "alb_w", label: "ALB West", role: "gateway", icon: "apigateway", group: "west_app" },
      { id: "cart_w", label: "Cart replica", role: "compute", icon: "kubernetes", group: "west_app" },
      { id: "catalog_w", label: "Catalog replica", role: "compute", icon: "kubernetes", group: "west_app" },
      { id: "aurora_w", label: "Aurora replica", role: "data", icon: "postgresql", group: "west_data" },

      { id: "cognito", label: "Cognito", subtitle: "OIDC", role: "security", icon: "openid", group: "sec" },
      { id: "vault", label: "Vault", subtitle: "secrets", role: "security", icon: "vault", group: "sec" },
      { id: "waf", label: "AWS WAF", role: "security", icon: "aws", group: "sec" },

      { id: "prom", label: "Prometheus", role: "observability", icon: "prometheus", group: "obs" },
      { id: "graf", label: "Grafana", role: "observability", icon: "grafana", group: "obs" },
      { id: "otel", label: "OTel Collector", role: "observability", icon: "opentelemetry", group: "obs" },
      { id: "cw", label: "CloudWatch", role: "observability", icon: "cloudwatch", group: "obs" },
    ],
    edges: [
      { from: "users", to: "cf", label: "HTTPS", kind: "sync" },
      { from: "cf", to: "r53", kind: "sync" },
      { from: "waf", to: "cf", label: "rules", kind: "sync" },
      { from: "r53", to: "alb_e", label: "primary", kind: "sync" },
      { from: "r53", to: "alb_w", label: "failover", kind: "sync" },
      { from: "alb_e", to: "ing_e", kind: "sync" },
      { from: "ing_e", to: "gw_e", kind: "sync" },
      { from: "gw_e", to: "cart", label: "gRPC", kind: "sync" },
      { from: "gw_e", to: "catalog", label: "gRPC", kind: "sync" },
      { from: "gw_e", to: "checkout", label: "HTTP", kind: "sync" },
      { from: "gw_e", to: "search", label: "HTTP", kind: "sync" },
      { from: "checkout", to: "cart", kind: "sync" },
      { from: "checkout", to: "ext_pay", label: "charge", kind: "sync" },
      { from: "nat_e", to: "ext_pay", kind: "sync" },
      { from: "search", to: "os_e", kind: "data" },
      { from: "catalog", to: "aurora_e", kind: "data" },
      { from: "cart", to: "redis_e", kind: "data" },
      { from: "checkout", to: "aurora_e", kind: "data" },
      { from: "checkout", to: "msk_e", label: "OrderPlaced", kind: "async" },
      { from: "msk_e", to: "rec", label: "consume", kind: "async" },
      { from: "msk_e", to: "ext_email", label: "notify", kind: "async" },
      { from: "rec", to: "s3_e", kind: "data" },
      { from: "cognito", to: "gw_e", label: "JWT", kind: "sync" },
      { from: "vault", to: "cart", label: "secrets", kind: "sync" },
      { from: "vault", to: "checkout", label: "secrets", kind: "sync" },
      { from: "mesh", to: "cart", kind: "sync" },
      { from: "mesh", to: "catalog", kind: "sync" },
      { from: "otel", to: "prom", kind: "data" },
      { from: "prom", to: "graf", kind: "sync" },
      { from: "gw_e", to: "cw", label: "logs", kind: "async" },
      { from: "alb_w", to: "cart_w", kind: "sync" },
      { from: "alb_w", to: "catalog_w", kind: "sync" },
      { from: "aurora_e", to: "aurora_w", label: "async replica", kind: "async" },
    ],
  });
}

function microserviceExample() {
  return compileMicroservice({
    title: "Event-Driven Order Platform",
    subtitle: "15+ services · Kafka backbone · CQRS",
    theme: "light",
    name: "02-microservice-architecture",
    groups: [
      { id: "edge", label: "Edge" },
      { id: "bff", label: "BFF / Gateways" },
      { id: "core", label: "Core Domain" },
      { id: "ops", label: "Ops & Fulfillment" },
      { id: "data", label: "Data & Messaging" },
      { id: "plat", label: "Platform" },
    ],
    nodes: [
      { id: "web", label: "Web App", subtitle: "Next.js", role: "external", icon: "nextjs", group: "edge" },
      { id: "mobile", label: "Mobile", role: "external", shape: "person", group: "edge" },
      { id: "cdn", label: "CDN", role: "network", icon: "cloudflare", group: "edge" },
      { id: "apigw", label: "API Gateway", subtitle: "rate limit · auth", role: "gateway", icon: "apigateway", group: "bff" },
      { id: "bff_web", label: "Web BFF", subtitle: "GraphQL", role: "gateway", icon: "graphql", group: "bff" },
      { id: "bff_mobile", label: "Mobile BFF", subtitle: "REST", role: "gateway", icon: "nginx", group: "bff" },
      { id: "orders", label: "Orders", subtitle: "write model", role: "compute", icon: "go", group: "core" },
      { id: "inventory", label: "Inventory", role: "compute", icon: "go", group: "core" },
      { id: "pricing", label: "Pricing", role: "compute", icon: "python", group: "core" },
      { id: "catalog", label: "Catalog", role: "compute", icon: "typescript", group: "core" },
      { id: "customers", label: "Customers", role: "compute", icon: "nodejs", group: "core" },
      { id: "payments", label: "Payments", role: "compute", icon: "go", group: "core" },
      { id: "shipping", label: "Shipping", role: "compute", icon: "python", group: "ops" },
      { id: "warehouse", label: "Warehouse", role: "compute", icon: "go", group: "ops" },
      { id: "returns", label: "Returns", role: "compute", icon: "typescript", group: "ops" },
      { id: "notify", label: "Notifications", role: "compute", icon: "nodejs", group: "ops" },
      { id: "analytics", label: "Analytics", role: "compute", icon: "python", group: "ops" },
      { id: "kafka", label: "Kafka", subtitle: "event backbone", role: "queue", icon: "kafka", group: "data" },
      { id: "pg_orders", label: "Orders DB", role: "data", icon: "postgresql", group: "data" },
      { id: "pg_inv", label: "Inventory DB", role: "data", icon: "postgresql", group: "data" },
      { id: "mongo_cat", label: "Catalog DB", role: "data", icon: "mongodb", group: "data" },
      { id: "redis", label: "Redis", role: "data", icon: "redis", group: "data" },
      { id: "es", label: "Search Index", role: "data", icon: "elasticsearch", group: "data" },
      { id: "auth", label: "Auth", role: "security", icon: "auth0", group: "plat" },
      { id: "config", label: "Config", role: "compute", icon: "consul", group: "plat" },
      { id: "otel", label: "Tracing", role: "observability", icon: "jaeger", group: "plat" },
    ],
    edges: [
      { from: "web", to: "cdn", kind: "sync" },
      { from: "mobile", to: "apigw", kind: "sync" },
      { from: "cdn", to: "apigw", kind: "sync" },
      { from: "apigw", to: "auth", label: "validate", kind: "sync" },
      { from: "apigw", to: "bff_web", kind: "sync" },
      { from: "apigw", to: "bff_mobile", kind: "sync" },
      { from: "bff_web", to: "orders", kind: "sync" },
      { from: "bff_web", to: "catalog", kind: "sync" },
      { from: "bff_web", to: "customers", kind: "sync" },
      { from: "bff_mobile", to: "orders", kind: "sync" },
      { from: "bff_mobile", to: "pricing", kind: "sync" },
      { from: "orders", to: "pg_orders", kind: "data" },
      { from: "inventory", to: "pg_inv", kind: "data" },
      { from: "catalog", to: "mongo_cat", kind: "data" },
      { from: "catalog", to: "es", kind: "data" },
      { from: "catalog", to: "redis", kind: "data" },
      { from: "orders", to: "kafka", label: "OrderCreated", kind: "async" },
      { from: "payments", to: "kafka", label: "PaymentCaptured", kind: "async" },
      { from: "inventory", to: "kafka", label: "StockReserved", kind: "async" },
      { from: "kafka", to: "shipping", label: "consume", kind: "async" },
      { from: "kafka", to: "warehouse", label: "consume", kind: "async" },
      { from: "kafka", to: "notify", label: "consume", kind: "async" },
      { from: "kafka", to: "analytics", label: "consume", kind: "async" },
      { from: "kafka", to: "returns", label: "consume", kind: "async" },
      { from: "orders", to: "payments", label: "authorize", kind: "sync" },
      { from: "orders", to: "inventory", label: "reserve", kind: "sync" },
      { from: "pricing", to: "redis", kind: "data" },
      { from: "config", to: "orders", kind: "sync" },
      { from: "otel", to: "orders", kind: "async" },
    ],
  });
}

function flowchartExample() {
  return compileFlowchart({
    title: "CI/CD Release Pipeline",
    subtitle: "PR to production with canary",
    theme: "presentation",
    name: "03-flowchart",
    direction: "LR",
    groups: [
      { id: "dev", label: "Developer", kind: "lane" },
      { id: "ci", label: "CI System", kind: "lane" },
      { id: "cd", label: "CD / Release", kind: "lane" },
      { id: "ops", label: "SRE / Ops", kind: "lane" },
    ],
    nodes: [
      { id: "start", label: "Open Pull Request", type: "start", group: "dev", role: "external" },
      { id: "review", label: "Code Review", type: "process", group: "dev", role: "compute" },
      { id: "lint", label: "Lint + Typecheck", type: "process", group: "ci", role: "compute" },
      { id: "unit", label: "Unit Tests", type: "process", group: "ci", role: "compute" },
      { id: "build", label: "Build Container", type: "process", group: "ci", role: "compute" },
      { id: "sast", label: "SAST / SCA Scan", type: "process", group: "ci", role: "security" },
      { id: "pass_ci", label: "CI Green?", type: "decision", group: "ci", role: "network" },
      { id: "staging", label: "Deploy Staging", type: "subprocess", group: "cd", role: "gateway" },
      { id: "e2e", label: "E2E + Contract Tests", type: "process", group: "cd", role: "compute" },
      { id: "approve", label: "Manual Approval?", type: "decision", group: "cd", role: "network" },
      { id: "canary", label: "Canary 5%", type: "subprocess", group: "cd", role: "gateway" },
      { id: "healthy", label: "SLOs Healthy?", type: "decision", group: "ops", role: "observability" },
      { id: "rollout", label: "Full Rollout", type: "process", group: "cd", role: "compute" },
      { id: "rollback", label: "Auto Rollback", type: "process", group: "ops", role: "security" },
      { id: "done", label: "Release Complete", type: "end", group: "ops", role: "data" },
      { id: "fix", label: "Notify Author", type: "end", group: "dev", role: "external" },
    ],
    edges: [
      { from: "start", to: "review" },
      { from: "review", to: "lint" },
      { from: "lint", to: "unit" },
      { from: "unit", to: "build" },
      { from: "build", to: "sast" },
      { from: "sast", to: "pass_ci" },
      { from: "pass_ci", to: "staging", when: "yes" },
      { from: "pass_ci", to: "fix", when: "no" },
      { from: "staging", to: "e2e" },
      { from: "e2e", to: "approve" },
      { from: "approve", to: "canary", when: "yes" },
      { from: "approve", to: "fix", when: "no" },
      { from: "canary", to: "healthy" },
      { from: "healthy", to: "rollout", when: "yes" },
      { from: "healthy", to: "rollback", when: "no" },
      { from: "rollout", to: "done" },
      { from: "rollback", to: "fix" },
    ],
  });
}

function decisionExample() {
  return compileDecision({
    title: "Incident Severity Triage",
    subtitle: "On-call decision tree",
    theme: "light",
    name: "04-decision-tree",
    root: "q_user_impact",
    nodes: [
      { id: "q_user_impact", label: "User-facing impact?", type: "question" },
      { id: "q_pct", label: "Over 5% of traffic?", type: "question" },
      { id: "q_data", label: "Data loss or corruption?", type: "question" },
      { id: "q_security", label: "Security incident?", type: "question" },
      { id: "q_workaround", label: "Workaround available?", type: "question" },
      { id: "q_single", label: "Single tenant or region?", type: "question" },
      { id: "a_sev1", label: "SEV-1", subtitle: "Page incident command", type: "outcome", role: "security" },
      { id: "a_sev2", label: "SEV-2", subtitle: "Page primary + secondary", type: "outcome", role: "security" },
      { id: "a_sev3", label: "SEV-3", subtitle: "Next business day", type: "outcome", role: "compute" },
      { id: "a_sev4", label: "SEV-4", subtitle: "Backlog", type: "outcome", role: "data" },
      { id: "act_bridge", label: "Open Zoom bridge", type: "action" },
      { id: "act_status", label: "Update status page", type: "action" },
      { id: "act_comms", label: "Notify incidents channel", type: "action" },
      { id: "act_ticket", label: "File Jira ticket", type: "action" },
    ],
    edges: [
      { from: "q_user_impact", to: "q_pct", when: "yes" },
      { from: "q_user_impact", to: "q_security", when: "no" },
      { from: "q_pct", to: "q_data", when: "yes" },
      { from: "q_pct", to: "q_workaround", when: "no" },
      { from: "q_data", to: "a_sev1", when: "yes" },
      { from: "q_data", to: "act_bridge", when: "no" },
      { from: "act_bridge", to: "act_status" },
      { from: "act_status", to: "a_sev1" },
      { from: "q_workaround", to: "q_single", when: "yes" },
      { from: "q_workaround", to: "a_sev2", when: "no" },
      { from: "q_single", to: "a_sev3", when: "yes" },
      { from: "q_single", to: "a_sev2", when: "no" },
      { from: "q_security", to: "a_sev1", when: "yes" },
      { from: "q_security", to: "act_ticket", when: "no" },
      { from: "act_ticket", to: "act_comms" },
      { from: "act_comms", to: "a_sev4" },
    ],
  });
}

function dependencyExample() {
  const packages = [
    ["apps", ["web", "admin", "mobile-bff", "worker", "scheduler", "cli"]],
    [
      "services",
      [
        "orders-svc",
        "inventory-svc",
        "catalog-svc",
        "pricing-svc",
        "payments-svc",
        "shipping-svc",
        "notify-svc",
        "search-svc",
        "auth-svc",
        "media-svc",
        "analytics-svc",
        "billing-svc",
      ],
    ],
    [
      "packages",
      [
        "ui-kit",
        "design-tokens",
        "eslint-config",
        "tsconfig",
        "logger",
        "metrics",
        "tracing",
        "config",
        "errors",
        "http-client",
        "grpc-client",
        "kafka-client",
        "db-kit",
        "cache-kit",
        "auth-sdk",
        "feature-flags",
        "validation",
        "types-orders",
        "types-catalog",
        "types-common",
        "test-utils",
        "storybook-config",
      ],
    ],
    [
      "infra",
      [
        "terraform-modules",
        "helm-charts",
        "pulumi-aws",
        "ci-templates",
        "docker-base",
        "k8s-manifests",
        "observability-stack",
        "secrets-policy",
      ],
    ],
    [
      "domain",
      [
        "domain-orders",
        "domain-inventory",
        "domain-catalog",
        "domain-payments",
        "domain-shipping",
        "domain-pricing",
        "domain-customers",
        "policy-engine",
        "id-generator",
        "money",
        "address",
        "tax-engine",
      ],
    ],
    [
      "data",
      [
        "schema-registry",
        "migrations-orders",
        "migrations-inventory",
        "seed-scripts",
        "etl-jobs",
        "warehouse-models",
        "event-schemas",
        "protobuf-defs",
        "openapi-specs",
      ],
    ],
  ] as const;

  const nodes: Array<{
    id: string;
    label: string;
    group: string;
    role: "compute" | "data" | "network" | "default" | "storage" | "security";
  }> = [];
  const groups = packages.map(([id]) => ({
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
  }));

  for (const [g, names] of packages) {
    for (const n of names) {
      const role =
        g === "apps"
          ? "compute"
          : g === "services"
            ? "network"
            : g === "data"
              ? "data"
              : g === "infra"
                ? "storage"
                : g === "domain"
                  ? "security"
                  : "default";
      nodes.push({ id: n, label: n, group: g, role });
    }
  }

  const edges: Array<{ from: string; to: string; kind?: "sync" | "async" | "data" }> = [];
  const dep = (from: string, to: string) => edges.push({ from, to, kind: "sync" });

  for (const a of ["web", "admin", "mobile-bff"]) {
    dep(a, "ui-kit");
    dep(a, "auth-sdk");
    dep(a, "http-client");
    dep(a, "types-common");
  }
  dep("web", "design-tokens");
  dep("admin", "design-tokens");
  dep("worker", "kafka-client");
  dep("worker", "logger");
  dep("worker", "metrics");
  dep("scheduler", "config");
  dep("cli", "config");

  for (const s of [
    "orders-svc",
    "inventory-svc",
    "catalog-svc",
    "pricing-svc",
    "payments-svc",
    "shipping-svc",
    "notify-svc",
    "search-svc",
    "billing-svc",
  ]) {
    dep(s, "logger");
    dep(s, "metrics");
    dep(s, "tracing");
    dep(s, "config");
    dep(s, "errors");
    dep(s, "db-kit");
  }
  dep("orders-svc", "domain-orders");
  dep("orders-svc", "types-orders");
  dep("orders-svc", "kafka-client");
  dep("orders-svc", "money");
  dep("inventory-svc", "domain-inventory");
  dep("catalog-svc", "domain-catalog");
  dep("catalog-svc", "types-catalog");
  dep("catalog-svc", "cache-kit");
  dep("pricing-svc", "domain-pricing");
  dep("pricing-svc", "money");
  dep("pricing-svc", "tax-engine");
  dep("payments-svc", "domain-payments");
  dep("payments-svc", "money");
  dep("shipping-svc", "domain-shipping");
  dep("shipping-svc", "address");
  dep("auth-svc", "auth-sdk");
  dep("auth-svc", "feature-flags");
  dep("media-svc", "http-client");
  dep("analytics-svc", "kafka-client");
  dep("billing-svc", "domain-payments");
  dep("notify-svc", "kafka-client");
  dep("search-svc", "types-catalog");

  dep("domain-orders", "types-orders");
  dep("domain-orders", "money");
  dep("domain-orders", "id-generator");
  dep("domain-catalog", "types-catalog");
  dep("domain-payments", "money");
  dep("domain-shipping", "address");
  dep("domain-pricing", "money");
  dep("domain-pricing", "tax-engine");
  dep("policy-engine", "feature-flags");
  dep("tax-engine", "money");

  dep("ui-kit", "design-tokens");
  dep("http-client", "errors");
  dep("http-client", "logger");
  dep("grpc-client", "errors");
  dep("kafka-client", "logger");
  dep("kafka-client", "event-schemas");
  dep("db-kit", "logger");
  dep("cache-kit", "logger");
  dep("auth-sdk", "validation");
  dep("types-orders", "types-common");
  dep("types-catalog", "types-common");
  dep("metrics", "tracing");
  dep("test-utils", "logger");
  dep("storybook-config", "ui-kit");
  dep("eslint-config", "tsconfig");

  dep("migrations-orders", "schema-registry");
  dep("migrations-inventory", "schema-registry");
  dep("etl-jobs", "warehouse-models");
  dep("etl-jobs", "event-schemas");
  dep("event-schemas", "protobuf-defs");
  dep("openapi-specs", "types-common");
  dep("helm-charts", "k8s-manifests");
  dep("pulumi-aws", "terraform-modules");
  dep("ci-templates", "docker-base");
  dep("observability-stack", "helm-charts");
  dep("orders-svc", "migrations-orders");
  dep("inventory-svc", "migrations-inventory");
  dep("web", "openapi-specs");
  dep("mobile-bff", "grpc-client");

  return compileDependency({
    title: "Monorepo Dependency Graph",
    subtitle: `${nodes.length} packages · internal edges only`,
    theme: "presentation",
    name: "05-dependency-graph",
    direction: "TB",
    groups,
    nodes,
    edges,
  });
}

async function main() {
  console.log("Generating showcase examples into", OUT);
  await render("01-cloud-architecture", cloudExample(), "presentation");
  await render("02-microservice-architecture", microserviceExample(), "light");
  await render("03-flowchart", flowchartExample(), "presentation");
  await render("04-decision-tree", decisionExample(), "light");
  await render("05-dependency-graph", dependencyExample(), "presentation");
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
