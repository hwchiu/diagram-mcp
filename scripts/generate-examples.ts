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
  compiled: {
    engine: "d2" | "mermaid" | "dot" | "svg";
    source: string;
    theme?: string;
    layout?: "tala" | "elk" | "dagre" | "grid";
  },
  theme: string,
) {
  const result = await renderPipeline({
    engine: compiled.engine,
    source: compiled.source,
    themeId: compiled.theme ?? theme,
    name,
    outputDir: OUT,
    includePreview: false,
    layout: compiled.layout,
  });
  console.log(`✓ ${name} → ${result.pngPath} (${result.width}×${result.height})`);
  return result;
}

function cloudExample() {
  return compileCloud({
    title: "Multi-Region Commerce Platform",
    subtitle: "AWS + EKS · Active-active · sparse main flows",
    theme: "dark",
    name: "01-cloud-architecture",
    provider: "aws",
    columns: [["clients", "edge"], ["use1"], ["usw2"], ["ext", "obs"]],
    groups: [
      { id: "clients", label: "Clients" },
      { id: "edge", label: "Edge & DNS" },
      { id: "use1", label: "us-east-1 Primary" },
      { id: "usw2", label: "us-west-2 Secondary" },
      { id: "ext", label: "Third-Party" },
      { id: "obs", label: "Observability" },
    ],
    nodes: [
      { id: "users", label: "Users", role: "external", icon: "user", group: "clients" },
      { id: "web", label: "Web / Mobile", role: "external", icon: "browser", group: "clients" },
      { id: "cf", label: "CDN", role: "network", icon: "globe", group: "edge" },
      { id: "r53", label: "DNS", subtitle: "latency", role: "network", icon: "globe", group: "edge" },
      { id: "waf", label: "WAF", role: "security", icon: "shield", group: "edge" },
      { id: "alb_e", label: "ALB", role: "gateway", icon: "gateway", group: "use1" },
      { id: "gw_e", label: "API Gateway", role: "gateway", icon: "gateway", group: "use1" },
      { id: "cart", label: "Cart", role: "compute", icon: "server", group: "use1" },
      { id: "catalog", label: "Catalog", role: "compute", icon: "server", group: "use1" },
      { id: "checkout", label: "Checkout", role: "compute", icon: "server", group: "use1" },
      { id: "search", label: "Search", role: "compute", icon: "search", group: "use1" },
      { id: "redis_e", label: "Redis", role: "data", icon: "cache", group: "use1" },
      { id: "aurora_e", label: "Aurora", role: "data", icon: "database", group: "use1" },
      { id: "msk_e", label: "MSK", role: "queue", icon: "queue", group: "use1" },
      { id: "alb_w", label: "ALB", role: "gateway", icon: "gateway", group: "usw2" },
      { id: "cart_w", label: "Cart", role: "compute", icon: "cluster", group: "usw2" },
      { id: "catalog_w", label: "Catalog", role: "compute", icon: "cluster", group: "usw2" },
      { id: "aurora_w", label: "Aurora replica", role: "data", icon: "database", group: "usw2" },
      { id: "stripe", label: "Payment Provider", role: "external", group: "ext" },
      { id: "ses", label: "Email / SMS", role: "external", group: "ext" },
      { id: "otel", label: "OTel", role: "observability", icon: "chart", group: "obs" },
      { id: "prom", label: "Prometheus", role: "observability", icon: "chart", group: "obs" },
      { id: "graf", label: "Grafana", role: "observability", icon: "chart", group: "obs" },
    ],
    edges: [
      { from: "clients", to: "edge", step: 1, kind: "sync" },
      { from: "edge", to: "use1", step: 2, label: "primary", kind: "sync" },
      { from: "edge", to: "usw2", label: "failover", kind: "sync" },
      { from: "alb_e", to: "gw_e", step: 3, kind: "sync" },
      { from: "gw_e", to: "checkout", kind: "sync" },
      { from: "checkout", to: "cart", kind: "sync" },
      { from: "checkout", to: "stripe", step: 4, kind: "sync" },
      { from: "checkout", to: "aurora_e", step: 5, kind: "data" },
      { from: "cart", to: "redis_e", kind: "data" },
      { from: "checkout", to: "msk_e", step: 6, kind: "async" },
      { from: "msk_e", to: "ses", kind: "async" },
      { from: "aurora_e", to: "aurora_w", step: 7, label: "replica", kind: "async" },
      { from: "use1", to: "obs", kind: "async" },
      { from: "otel", to: "prom", kind: "data" },
      { from: "prom", to: "graf", kind: "sync" },
    ],
    steps: [
      { n: 1, label: "Clients → Edge", description: "CDN / DNS / WAF" },
      { n: 2, label: "Route primary", description: "Traffic to us-east-1" },
      { n: 3, label: "Ingress", description: "ALB → Gateway → services" },
      { n: 4, label: "Payment", description: "Checkout → provider" },
      { n: 5, label: "Persist", description: "Aurora / Redis" },
      { n: 6, label: "Events", description: "MSK fan-out" },
      { n: 7, label: "Replicate", description: "Async to west" },
    ],
  });
}

function microserviceExample() {
  return compileMicroservice({
    title: "Event-Driven Order Platform",
    subtitle: "Edge · BFF · App · Ops · Data",
    theme: "dark",
    name: "02-microservice-architecture",
    columns: [["clients", "edge"], ["bff", "core"], ["ops", "data"], ["ext"]],
    groups: [
      { id: "clients", label: "Clients" },
      { id: "edge", label: "Edge" },
      { id: "bff", label: "Web / BFF" },
      { id: "core", label: "App Tier" },
      { id: "ops", label: "Ops" },
      { id: "data", label: "Data & Messaging" },
      { id: "ext", label: "Third-Party" },
    ],
    nodes: [
      { id: "web", label: "Web App", role: "external", icon: "browser", group: "clients" },
      { id: "mobile", label: "Mobile", role: "external", icon: "mobile", group: "clients" },
      { id: "cdn", label: "CDN", role: "network", icon: "globe", group: "edge" },
      { id: "waf", label: "WAF", role: "security", icon: "shield", group: "edge" },
      { id: "apigw", label: "API Gateway", role: "gateway", icon: "gateway", group: "bff" },
      { id: "bff_web", label: "Web BFF", role: "gateway", icon: "gateway", group: "bff" },
      { id: "auth", label: "Auth", role: "security", icon: "lock", group: "bff" },
      { id: "orders", label: "Orders", role: "compute", icon: "server", group: "core" },
      { id: "inventory", label: "Inventory", role: "compute", icon: "server", group: "core" },
      { id: "catalog", label: "Catalog", role: "compute", icon: "server", group: "core" },
      { id: "payments", label: "Payments", role: "compute", icon: "server", group: "core" },
      { id: "customers", label: "Customers", role: "compute", icon: "server", group: "core" },
      { id: "shipping", label: "Shipping", role: "compute", icon: "server", group: "ops" },
      { id: "notify", label: "Notify", role: "compute", icon: "mail", group: "ops" },
      { id: "analytics", label: "Analytics", role: "compute", icon: "chart", group: "ops" },
      { id: "kafka", label: "Kafka", role: "queue", icon: "queue", group: "data" },
      { id: "pg_orders", label: "Orders DB", role: "data", icon: "database", group: "data" },
      { id: "redis", label: "Redis", role: "data", icon: "cache", group: "data" },
      { id: "mongo_cat", label: "Catalog DB", role: "data", icon: "database", group: "data" },
      { id: "stripe", label: "Payment Provider", role: "external", group: "ext" },
      { id: "ses", label: "Email / SMS", role: "external", group: "ext" },
    ],
    edges: [
      { from: "clients", to: "edge", step: 1, kind: "sync" },
      { from: "edge", to: "bff", step: 2, kind: "sync" },
      { from: "apigw", to: "auth", label: "JWT", kind: "sync" },
      { from: "bff", to: "core", step: 3, kind: "sync" },
      { from: "orders", to: "inventory", kind: "sync" },
      { from: "orders", to: "payments", step: 4, kind: "sync" },
      { from: "payments", to: "stripe", step: 5, kind: "sync" },
      { from: "core", to: "data", step: 6, kind: "data" },
      { from: "orders", to: "kafka", step: 7, kind: "async" },
      { from: "kafka", to: "ops", kind: "async" },
      { from: "notify", to: "ses", kind: "sync" },
    ],
    steps: [
      { n: 1, label: "Clients → Edge", description: "CDN / WAF" },
      { n: 2, label: "Authenticate", description: "Gateway + Auth + BFF" },
      { n: 3, label: "BFF → App", description: "Domain service calls" },
      { n: 4, label: "Coordinate", description: "Orders → Inventory / Payments" },
      { n: 5, label: "External pay", description: "Card network" },
      { n: 6, label: "Persist", description: "Owned data stores" },
      { n: 7, label: "Async ops", description: "Kafka → Shipping / Notify" },
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
  await render("01-cloud-architecture", cloudExample(), "dark");
  await render("02-microservice-architecture", microserviceExample(), "dark");
  await render("03-flowchart", flowchartExample(), "presentation");
  await render("04-decision-tree", decisionExample(), "light");
  await render("05-dependency-graph", dependencyExample(), "presentation");
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
