/**
 * High-complexity designer showcase diagrams → examples/showcase/
 * Run: npx tsx scripts/generate-showcase.ts
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
const OUT = path.join(ROOT, "examples", "showcase");

async function render(
  name: string,
  compiled: {
    engine: "d2" | "mermaid" | "dot";
    source: string;
    layout?: "tala" | "elk" | "dagre";
  },
  theme: string,
) {
  const result = await renderPipeline({
    engine: compiled.engine,
    source: compiled.source,
    themeId: theme,
    name,
    outputDir: OUT,
    includePreview: false,
    layout: compiled.layout ?? (compiled.engine === "d2" ? "tala" : undefined),
  });
  console.log(`✓ ${name}  ${result.width}×${result.height}  ${result.pngPath}`);
  return result;
}

/**
 * 1. E-commerce overview — AWS reference style:
 * sparse tier-to-tier edges, dashed bands, numbered steps.
 * Per-service DB / Kafka detail → 01b diagram.
 */
function ecommerceE2E() {
  return compileMicroservice({
    title: "Guidance for E-Commerce Microservices",
    subtitle: "Clients → Edge → BFF → App tier → Data / Events · sparse main flows",
    theme: "presentation",
    name: "01-ecommerce-microservices-e2e",
    layout: "tala",
    groups: [
      { id: "clients", label: "Clients" },
      { id: "edge", label: "Edge" },
      { id: "bff", label: "Web / BFF Tier" },
      { id: "domain", label: "App Tier" },
      { id: "data", label: "Data" },
      { id: "events", label: "Async / Event" },
      { id: "ext", label: "Key Third-Party Services" },
    ],
    nodes: [
      { id: "web", label: "Web SPA", role: "external", icon: "react", group: "clients" },
      { id: "mobile", label: "Mobile", role: "external", shape: "person", group: "clients" },
      { id: "admin", label: "Admin", role: "external", icon: "nextjs", group: "clients" },

      { id: "cdn", label: "CDN", role: "network", icon: "cloudflare", group: "edge" },
      { id: "waf", label: "WAF", role: "security", icon: "aws", group: "edge" },

      { id: "apigw", label: "API Gateway", role: "gateway", icon: "apigateway", group: "bff" },
      { id: "bff_web", label: "Web BFF", role: "gateway", icon: "graphql", group: "bff" },
      { id: "bff_mobile", label: "Mobile BFF", role: "gateway", icon: "nginx", group: "bff" },

      { id: "auth", label: "Auth", role: "security", icon: "auth0", group: "domain" },
      { id: "catalog", label: "Catalog", role: "compute", icon: "go", group: "domain" },
      { id: "cart", label: "Cart", role: "compute", icon: "go", group: "domain" },
      { id: "order", label: "Order", role: "compute", icon: "go", group: "domain" },
      { id: "payment", label: "Payment", role: "compute", icon: "typescript", group: "domain" },
      { id: "inventory", label: "Inventory", role: "compute", icon: "go", group: "domain" },
      { id: "shipping", label: "Shipping", role: "compute", icon: "python", group: "domain" },
      { id: "notify", label: "Notify", role: "compute", icon: "nodejs", group: "domain" },

      { id: "pg", label: "PostgreSQL", role: "data", icon: "postgresql", group: "data" },
      { id: "redis", label: "Redis", role: "data", icon: "redis", group: "data" },
      { id: "mongo", label: "MongoDB", role: "data", icon: "mongodb", group: "data" },
      { id: "s3", label: "Object Store", role: "storage", icon: "s3", group: "data" },

      { id: "kafka", label: "Kafka", role: "queue", icon: "kafka", group: "events" },

      { id: "stripe", label: "Payment Provider", role: "external", group: "ext" },
      { id: "twilio", label: "Email / SMS", role: "external", group: "ext" },
    ],
    edges: [
      // Tier-to-tier + a few key hops (≤ ~20)
      { from: "clients", to: "edge", step: 1, kind: "sync" },
      { from: "edge", to: "bff", step: 2, kind: "sync" },
      { from: "cdn", to: "waf", kind: "sync" },
      { from: "apigw", to: "bff_web", kind: "sync" },
      { from: "apigw", to: "auth", label: "JWT", kind: "sync" },
      { from: "bff", to: "domain", step: 3, kind: "sync" },
      { from: "order", to: "cart", kind: "sync" },
      { from: "order", to: "inventory", kind: "sync" },
      { from: "order", to: "payment", step: 4, kind: "sync" },
      { from: "payment", to: "stripe", step: 5, kind: "sync" },
      { from: "domain", to: "data", step: 6, kind: "data" },
      { from: "domain", to: "events", step: 7, kind: "async" },
      { from: "events", to: "shipping", kind: "async" },
      { from: "events", to: "notify", kind: "async" },
      { from: "notify", to: "twilio", kind: "sync" },
    ],
    steps: [
      {
        n: 1,
        label: "Clients reach Edge",
        description: "Web, mobile, and admin traffic hits CDN / WAF",
        anchor: "clients",
      },
      {
        n: 2,
        label: "Edge to BFF tier",
        description: "WAF forwards to API Gateway and BFFs",
        anchor: "edge",
      },
      {
        n: 3,
        label: "BFF calls App Tier",
        description: "BFFs aggregate domain services over gRPC / HTTP",
        anchor: "bff",
      },
      {
        n: 4,
        label: "Order coordinates",
        description: "Order reserves inventory and authorizes payment",
        anchor: "domain",
      },
      {
        n: 5,
        label: "External payment",
        description: "Payment Service calls the card network",
        anchor: "ext",
      },
      {
        n: 6,
        label: "Persist state",
        description: "App Tier reads/writes owned data stores",
        anchor: "data",
      },
      {
        n: 7,
        label: "Async fan-out",
        description: "Domain publishes to Kafka; Shipping / Notify consume",
        anchor: "events",
      },
    ],
    legend: [
      { label: "Sync / request", kind: "sync" },
      { label: "Async event", kind: "async" },
      { label: "Data path", kind: "data" },
    ],
  });
}

/** 1b. Separate detail: per-service data ownership + Kafka topics */
function ecommerceDataDetail() {
  return compileMicroservice({
    title: "E-Commerce — Data Ownership & Kafka Events",
    subtitle: "Service → store ownership · topic producers / consumers",
    theme: "presentation",
    name: "01b-ecommerce-data-kafka",
    layout: "tala",
    groups: [
      { id: "svc", label: "Domain Services" },
      { id: "stores", label: "Owned Data Stores" },
      { id: "bus", label: "Kafka Topics" },
      { id: "consumers", label: "Async Consumers" },
    ],
    nodes: [
      { id: "order", label: "Order", role: "compute", icon: "go", group: "svc" },
      { id: "cart", label: "Cart", role: "compute", icon: "go", group: "svc" },
      { id: "payment", label: "Payment", role: "compute", icon: "typescript", group: "svc" },
      { id: "inventory", label: "Inventory", role: "compute", icon: "go", group: "svc" },
      { id: "catalog", label: "Catalog", role: "compute", icon: "go", group: "svc" },
      { id: "user", label: "User / Auth", role: "security", icon: "auth0", group: "svc" },

      { id: "pg_order", label: "Orders DB", role: "data", icon: "postgresql", group: "stores" },
      { id: "redis", label: "Redis Cart", role: "data", icon: "redis", group: "stores" },
      { id: "mysql_inv", label: "Inventory DB", role: "data", icon: "mysql", group: "stores" },
      { id: "mongo", label: "Catalog DB", role: "data", icon: "mongodb", group: "stores" },
      { id: "pg_user", label: "User DB", role: "data", icon: "postgresql", group: "stores" },
      { id: "s3", label: "Invoices / Assets", role: "storage", icon: "s3", group: "stores" },

      { id: "t_order", label: "order.events", role: "queue", icon: "kafka", group: "bus" },
      { id: "t_pay", label: "payment.events", role: "queue", icon: "kafka", group: "bus" },
      { id: "t_inv", label: "inventory.events", role: "queue", icon: "kafka", group: "bus" },

      { id: "shipping", label: "Shipping", role: "compute", icon: "python", group: "consumers" },
      { id: "notify", label: "Notify", role: "compute", icon: "nodejs", group: "consumers" },
      { id: "search", label: "Search", role: "compute", icon: "python", group: "consumers" },
      { id: "rec", label: "Recommend", role: "compute", icon: "python", group: "consumers" },
    ],
    edges: [
      { from: "order", to: "pg_order", step: 1, kind: "data" },
      { from: "cart", to: "redis", kind: "data" },
      { from: "inventory", to: "mysql_inv", kind: "data" },
      { from: "catalog", to: "mongo", kind: "data" },
      { from: "user", to: "pg_user", kind: "data" },
      { from: "payment", to: "s3", kind: "data" },
      { from: "order", to: "t_order", step: 2, label: "OrderPlaced", kind: "async" },
      { from: "payment", to: "t_pay", kind: "async" },
      { from: "inventory", to: "t_inv", kind: "async" },
      { from: "t_order", to: "shipping", step: 3, kind: "async" },
      { from: "t_order", to: "notify", kind: "async" },
      { from: "t_pay", to: "notify", kind: "async" },
      { from: "t_inv", to: "search", kind: "async" },
      { from: "t_order", to: "rec", kind: "async" },
    ],
    steps: [
      {
        n: 1,
        label: "Owned stores",
        description: "Each service writes only its database",
        anchor: "stores",
      },
      {
        n: 2,
        label: "Publish events",
        description: "Order / Payment / Inventory emit Kafka topics",
        anchor: "bus",
      },
      {
        n: 3,
        label: "Consume & react",
        description: "Shipping, Notify, Search, Recommend subscribe",
        anchor: "consumers",
      },
    ],
    legend: [
      { label: "Data ownership", kind: "data" },
      { label: "Kafka event", kind: "async" },
    ],
  });
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

/** 3. Dual-region K8s — AWS reference style, sparse tier edges */
function k8sMultiRegion() {
  return compileCloud({
    title: "Guidance for Dual-Region Kubernetes",
    subtitle: "Global edge · us-east-1 primary · us-west-2 standby · observability",
    theme: "presentation",
    name: "03-k8s-dual-region",
    provider: "kubernetes",
    layout: "tala",
    groups: [
      { id: "clients", label: "Clients" },
      { id: "global", label: "Global Edge", kind: "other" },
      { id: "east", label: "Region us-east-1 (Primary)", kind: "region" },
      { id: "east_ing", label: "Ingress", parent: "east", kind: "other" },
      { id: "east_shop", label: "ns: shopping", parent: "east", kind: "namespace" },
      { id: "east_plat", label: "ns: platform", parent: "east", kind: "namespace" },
      { id: "east_data", label: "Managed Data", parent: "east", kind: "other" },
      { id: "west", label: "Region us-west-2 (Standby)", kind: "region" },
      { id: "west_ing", label: "Ingress", parent: "west", kind: "other" },
      { id: "west_shop", label: "ns: shopping", parent: "west", kind: "namespace" },
      { id: "west_data", label: "Managed Data", parent: "west", kind: "other" },
      { id: "obs", label: "Observability", kind: "other" },
    ],
    nodes: [
      { id: "users", label: "Users", role: "external", shape: "person", group: "clients" },
      { id: "web", label: "Web / Mobile", role: "external", icon: "react", group: "clients" },

      { id: "cf", label: "CloudFront", role: "network", icon: "cloudflare", group: "global" },
      { id: "r53", label: "Route 53", role: "network", icon: "aws", group: "global" },
      { id: "waf", label: "WAF", role: "security", icon: "aws", group: "global" },

      { id: "alb_e", label: "ALB", role: "gateway", icon: "apigateway", group: "east_ing" },
      { id: "ing_e", label: "Ingress", role: "gateway", icon: "nginx", group: "east_ing" },
      { id: "istio_e", label: "Istio GW", role: "network", icon: "istio", group: "east_ing" },

      { id: "gw_e", label: "API Gateway", role: "gateway", icon: "apigateway", group: "east_shop" },
      { id: "order_e", label: "order", role: "compute", icon: "go", group: "east_shop" },
      { id: "cart_e", label: "cart", role: "compute", icon: "go", group: "east_shop" },
      { id: "catalog_e", label: "catalog", role: "compute", icon: "go", group: "east_shop" },
      { id: "pay_e", label: "payment", role: "compute", icon: "typescript", group: "east_shop" },
      { id: "inv_e", label: "inventory", role: "compute", icon: "go", group: "east_shop" },

      { id: "auth_e", label: "auth", role: "security", icon: "auth0", group: "east_plat" },
      { id: "mesh_e", label: "Istio Mesh", role: "network", icon: "istio", group: "east_plat" },
      { id: "kafka_e", label: "MSK Kafka", role: "queue", icon: "kafka", group: "east_plat" },

      { id: "aurora_e", label: "Aurora PG", role: "data", icon: "postgresql", group: "east_data" },
      { id: "redis_e", label: "ElastiCache", role: "data", icon: "redis", group: "east_data" },
      { id: "s3_e", label: "S3", role: "storage", icon: "s3", group: "east_data" },

      { id: "alb_w", label: "ALB", role: "gateway", icon: "apigateway", group: "west_ing" },
      { id: "ing_w", label: "Ingress", role: "gateway", icon: "nginx", group: "west_ing" },
      { id: "order_w", label: "order", role: "compute", icon: "kubernetes", group: "west_shop" },
      { id: "cart_w", label: "cart", role: "compute", icon: "kubernetes", group: "west_shop" },
      { id: "catalog_w", label: "catalog", role: "compute", icon: "kubernetes", group: "west_shop" },
      { id: "aurora_w", label: "Aurora replica", role: "data", icon: "postgresql", group: "west_data" },
      { id: "redis_w", label: "Redis replica", role: "data", icon: "redis", group: "west_data" },

      { id: "otel", label: "OTel", role: "observability", icon: "opentelemetry", group: "obs" },
      { id: "prom", label: "Prometheus", role: "observability", icon: "prometheus", group: "obs" },
      { id: "graf", label: "Grafana", role: "observability", icon: "grafana", group: "obs" },
    ],
    edges: [
      { from: "clients", to: "global", step: 1, kind: "sync" },
      { from: "cf", to: "waf", kind: "sync" },
      { from: "global", to: "east", step: 2, label: "primary", kind: "sync" },
      { from: "global", to: "west", label: "failover", kind: "sync" },
      { from: "east_ing", to: "east_shop", step: 3, kind: "sync" },
      { from: "auth_e", to: "gw_e", label: "JWT", kind: "sync" },
      { from: "order_e", to: "pay_e", kind: "sync" },
      { from: "order_e", to: "inv_e", kind: "sync" },
      { from: "east_shop", to: "east_data", step: 4, kind: "data" },
      { from: "east_shop", to: "kafka_e", step: 5, kind: "async" },
      { from: "west_ing", to: "west_shop", kind: "sync" },
      { from: "aurora_e", to: "aurora_w", step: 6, label: "replica", kind: "async" },
      { from: "redis_e", to: "redis_w", kind: "async" },
      { from: "east", to: "obs", step: 7, kind: "async" },
      { from: "otel", to: "prom", kind: "data" },
      { from: "prom", to: "graf", kind: "sync" },
    ],
    steps: [
      {
        n: 1,
        label: "Clients → global edge",
        description: "Users hit CloudFront / WAF / Route 53",
        anchor: "clients",
      },
      {
        n: 2,
        label: "DNS to primary region",
        description: "Route 53 latency-routes to us-east-1 (failover west)",
        anchor: "global",
      },
      {
        n: 3,
        label: "Ingress to workloads",
        description: "ALB → Ingress → Istio → shopping namespace",
        anchor: "east_ing",
      },
      {
        n: 4,
        label: "Managed data",
        description: "Services persist to Aurora / Redis / S3",
        anchor: "east_data",
      },
      {
        n: 5,
        label: "Async platform",
        description: "Order events publish to MSK Kafka",
        anchor: "east_plat",
      },
      {
        n: 6,
        label: "Cross-region replica",
        description: "Aurora / Redis async replicate to us-west-2",
        anchor: "west",
      },
      {
        n: 7,
        label: "Observability",
        description: "OTel → Prometheus → Grafana",
        anchor: "obs",
      },
    ],
    legend: [
      { label: "Sync traffic", kind: "sync" },
      { label: "Async / replica", kind: "async" },
      { label: "Data path", kind: "data" },
    ],
  });
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

async function main() {
  console.log("Showcase →", OUT);
  await render("01-ecommerce-microservices-e2e", ecommerceE2E(), "presentation");
  await render("01b-ecommerce-data-kafka", ecommerceDataDetail(), "presentation");
  await render("02-place-order-sequence", placeOrderFlow(), "presentation");
  await render("03-k8s-dual-region", k8sMultiRegion(), "presentation");
  await render("04-flowchart-swimlanes", flowchartSwimlanes(), "presentation");
  await render("05-decision-tree", decisionTree(), "light");
  await render("06-dependency-graph-80", dependency80(), "presentation");
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
