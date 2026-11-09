/**
 * High-complexity designer showcase diagrams → examples/showcase/
 * Run: npx tsx scripts/generate-showcase.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderPipeline } from "../src/render/pipeline.js";
import { compileCloud } from "../src/compilers/cloud.js";
import { compileMicroservice } from "../src/compilers/microservice.js";
import * as A from "../src/showcase/architecture.js";
import { compileFlowchart } from "../src/compilers/flowchart.js";
import { compileDecision } from "../src/compilers/decision.js";
import { compileDependency } from "../src/compilers/dependency.js";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "examples", "showcase");

async function render(
  name: string,
  compiled: {
    engine: "d2" | "mermaid" | "dot" | "svg";
    source: string;
    theme?: string;
    layout?: "tala" | "elk" | "dagre" | "grid";
    drawio?: string;
    qa?: import("../src/types.js").QaIssue[];
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
    drawio: compiled.drawio,
    qa: compiled.qa,
  });
  const errs = (result.qa ?? []).filter((q) => q.severity === "error");
  if (errs.length) throw new Error(`${name}: ${errs.length} QA error(s)\n` + errs.map((e) => e.message).join("\n"));
  if (result.drawioPath) console.log(`  ↳ draw.io ${result.drawioPath}`);
  console.log(`✓ ${name}  ${result.width}×${result.height}  ${result.pngPath}`);
  return result;
}

/**
 * 2. Place-order request flow — numbered sequence-style Mermaid.
 * Styled to match design system (presentation theme).
 */
function placeOrderFlow() {
  // Theme fonts/colors come from mermaidThemeConfig (DESIGN.md) via -c config —
  // avoid %%{init}%% which would override Inter / role colors with Mermaid defaults.
  const source = `sequenceDiagram
  autonumber
  actor User as Web SPA
  participant GW as API Gateway
  participant BFF as Web BFF
  participant Ord as Order Service
  participant Cart as Cart Service
  participant Inv as Inventory Service
  participant Pay as Payment Service
  participant Stripe as Stripe
  participant K as Kafka
  participant Ship as Shipping Service
  participant Ntf as Notification Service

  Note over User,Ntf: Place Order — sync request path, then async Kafka fan-out

  User->>GW: POST /orders (HTTPS)
  GW->>GW: WAF + JWT validate
  GW->>BFF: route to Web BFF
  BFF->>Cart: gRPC GetCart(userId)
  Cart-->>BFF: cart lines
  BFF->>Ord: gRPC CreateOrder(cart)
  activate Ord
  Ord->>Inv: gRPC ReserveStock(sku, qty)
  Inv-->>Ord: reservationId
  Ord->>Pay: gRPC AuthorizePayment(orderId)
  Pay->>Stripe: charge (HTTPS)
  Stripe-->>Pay: payment_intent ok
  Pay-->>Ord: PaymentAuthorized
  Ord-->>BFF: OrderCreated
  deactivate Ord
  BFF-->>GW: 201 + orderId
  GW-->>User: order confirmation

  Ord-)K: publish OrderPlaced
  Pay-)K: publish PaymentCaptured
  Inv-)K: publish StockReserved
  K-)Ship: consume OrderPlaced
  Ship-)K: publish ShipmentCreated
  K-)Ntf: consume OrderPlaced + PaymentCaptured
  Ntf->>User: email / push receipt
`;
  return { engine: "mermaid" as const, source };
}

function flowchartSwimlanes() {
  // Flat TB flow (no Mermaid subgraph swimlanes) — subgraphs + feedback edges
  // split styled nodes from the main chain. Lane is encoded in the subtitle.
  return compileFlowchart({
    title: "CI/CD Release Pipeline",
    subtitle: "PR to production with canary · swimlanes via role colors",
    theme: "presentation",
    name: "04-flowchart-swimlanes",
    direction: "TB",
    nodes: [
      { id: "start", label: "Open Pull Request", subtitle: "Developer", type: "start", role: "external" },
      { id: "review", label: "Code Review", subtitle: "Developer", type: "process", role: "compute" },
      { id: "lint", label: "Lint + Typecheck", subtitle: "CI", type: "process", role: "compute" },
      { id: "unit", label: "Unit Tests", subtitle: "CI", type: "process", role: "compute" },
      { id: "build", label: "Build Container", subtitle: "CI", type: "process", role: "compute" },
      { id: "sast", label: "SAST / SCA Scan", subtitle: "CI", type: "process", role: "security" },
      { id: "pass_ci", label: "CI Green?", subtitle: "CI", type: "decision", role: "network" },
      { id: "staging", label: "Deploy Staging", subtitle: "CD", type: "subprocess", role: "gateway" },
      { id: "e2e", label: "E2E + Contract Tests", subtitle: "CD", type: "process", role: "compute" },
      { id: "approve", label: "Manual Approval?", subtitle: "CD", type: "decision", role: "network" },
      { id: "canary", label: "Canary 5%", subtitle: "CD", type: "subprocess", role: "gateway" },
      { id: "healthy", label: "SLOs Healthy?", subtitle: "SRE", type: "decision", role: "observability" },
      { id: "rollout", label: "Full Rollout", subtitle: "CD", type: "process", role: "compute" },
      { id: "rollback", label: "Auto Rollback", subtitle: "SRE", type: "process", role: "security" },
      { id: "done", label: "Release Complete", subtitle: "SRE", type: "end", role: "data" },
      { id: "fix", label: "Notify Author", subtitle: "Developer", type: "end", role: "external" },
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

function decisionTree() {
  return compileDecision({
    title: "Incident Severity Triage",
    subtitle: "On-call multi-branch decision tree",
    theme: "light",
    name: "05-decision-tree",
    root: "q_user_impact",
    nodes: [
      { id: "q_user_impact", label: "User-facing impact?", type: "question" },
      { id: "q_pct", label: "Over 5% of traffic?", type: "question" },
      { id: "q_data", label: "Data loss or corruption?", type: "question" },
      { id: "q_security", label: "Security incident?", type: "question" },
      { id: "q_workaround", label: "Workaround available?", type: "question" },
      { id: "q_single", label: "Single tenant or region?", type: "question" },
      { id: "q_revenue", label: "Checkout / payments broken?", type: "question" },
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
      { from: "q_data", to: "q_revenue", when: "no" },
      { from: "q_revenue", to: "act_bridge", when: "yes" },
      { from: "q_revenue", to: "a_sev2", when: "no" },
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

function dependency80() {
  const packages = [
    ["apps", ["web", "admin", "mobile-bff", "worker", "scheduler", "cli", "storybook", "docs-site", "partner-portal"]],
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
        "recommendation-svc",
        "user-svc",
        "fraud-svc",
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
        "i18n",
        "form-kit",
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
        "network-policies",
        "cert-manager-config",
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
        "discount-engine",
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
        "dbt-models",
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

  const edges: Array<{ from: string; to: string; kind?: "sync" }> = [];
  const dep = (from: string, to: string) => edges.push({ from, to, kind: "sync" });

  for (const a of ["web", "admin", "mobile-bff", "docs-site"]) {
    dep(a, "ui-kit");
    dep(a, "auth-sdk");
    dep(a, "http-client");
    dep(a, "types-common");
  }
  dep("web", "design-tokens");
  dep("web", "i18n");
  dep("web", "form-kit");
  dep("admin", "design-tokens");
  dep("storybook", "storybook-config");
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
    "recommendation-svc",
    "user-svc",
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
  dep("pricing-svc", "discount-engine");
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
  dep("recommendation-svc", "kafka-client");
  dep("recommendation-svc", "cache-kit");
  dep("user-svc", "domain-customers");

  dep("domain-orders", "types-orders");
  dep("domain-orders", "money");
  dep("domain-orders", "id-generator");
  dep("domain-catalog", "types-catalog");
  dep("domain-payments", "money");
  dep("domain-shipping", "address");
  dep("domain-pricing", "money");
  dep("domain-pricing", "tax-engine");
  dep("discount-engine", "money");
  dep("policy-engine", "feature-flags");
  dep("tax-engine", "money");

  dep("ui-kit", "design-tokens");
  dep("form-kit", "ui-kit");
  dep("form-kit", "validation");
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
  dep("i18n", "types-common");

  dep("migrations-orders", "schema-registry");
  dep("migrations-inventory", "schema-registry");
  dep("etl-jobs", "warehouse-models");
  dep("etl-jobs", "event-schemas");
  dep("dbt-models", "warehouse-models");
  dep("event-schemas", "protobuf-defs");
  dep("openapi-specs", "types-common");
  dep("helm-charts", "k8s-manifests");
  dep("pulumi-aws", "terraform-modules");
  dep("ci-templates", "docker-base");
  dep("observability-stack", "helm-charts");
  dep("network-policies", "k8s-manifests");
  dep("cert-manager-config", "helm-charts");
  dep("orders-svc", "migrations-orders");
  dep("inventory-svc", "migrations-inventory");
  dep("web", "openapi-specs");
  dep("mobile-bff", "grpc-client");

  return compileDependency({
    title: "Monorepo Dependency Graph",
    subtitle: `${nodes.length} packages · 80+ nodes · internal edges`,
    theme: "presentation",
    name: "06-dependency-graph-80",
    direction: "TB",
    groups,
    nodes,
    edges,
  });
}


const withDrawio = <T extends object>(x: T) => ({ ...x, outputs: ["svg", "png", "drawio"] as ("svg" | "png" | "drawio")[] });
const ecommerceE2E = () => compileMicroservice(withDrawio(A.ecommerceE2E()));
const ecommerceDataDetail = () => compileMicroservice(withDrawio(A.ecommerceDataDetail()));
const k8sMultiRegion = () => compileCloud(withDrawio(A.k8sMultiRegion()));

async function main() {
  console.log("Showcase →", OUT);
  await render("01-ecommerce-microservices-e2e", ecommerceE2E(), "dark");
  await render("01b-ecommerce-data-kafka", ecommerceDataDetail(), "dark");
  await render("02-place-order-sequence", placeOrderFlow(), "presentation");
  await render("03-k8s-dual-region", k8sMultiRegion(), "dark");
  await render("04-flowchart-swimlanes", flowchartSwimlanes(), "presentation");
  await render("05-decision-tree", decisionTree(), "light");
  await render("06-dependency-graph-80", dependency80(), "presentation");
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
