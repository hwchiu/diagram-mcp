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
import { getTheme } from "../src/design/themes.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "examples", "showcase");

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
    layout: "elk",
  });
  console.log(`✓ ${name}  ${result.width}×${result.height}  ${result.pngPath}`);
  return result;
}

/** 1. Full e-commerce microservices E2E */
function ecommerceE2E() {
  return compileMicroservice({
    title: "E-Commerce Platform — End-to-End Architecture",
    subtitle: "Clients · Edge · BFFs · Domain services · Data · Kafka · Externals",
    theme: "presentation",
    name: "01-ecommerce-microservices-e2e",
    groups: [
      { id: "clients", label: "Clients" },
      { id: "edge", label: "Edge" },
      { id: "bff", label: "API Gateway & BFFs" },
      { id: "domain", label: "Domain Services" },
      { id: "data", label: "Data Stores (per service)" },
      { id: "events", label: "Event Bus" },
      { id: "ext", label: "External Systems" },
    ],
    nodes: [
      // Clients
      { id: "web", label: "Web SPA", subtitle: "React · Next.js", role: "external", icon: "react", group: "clients" },
      { id: "mobile", label: "Mobile App", subtitle: "iOS / Android", role: "external", shape: "person", group: "clients" },
      { id: "admin", label: "Admin Portal", subtitle: "Internal ops", role: "external", icon: "nextjs", group: "clients" },
      // Edge
      { id: "cdn", label: "CDN", subtitle: "Cloudflare", role: "network", icon: "cloudflare", group: "edge" },
      { id: "waf", label: "WAF", subtitle: "edge rules", role: "security", icon: "aws", group: "edge" },
      // BFF / GW
      { id: "apigw", label: "API Gateway", subtitle: "Kong · JWT · rate limit", role: "gateway", icon: "apigateway", group: "bff" },
      { id: "bff_web", label: "Web BFF", subtitle: "GraphQL federation", role: "gateway", icon: "graphql", group: "bff" },
      { id: "bff_mobile", label: "Mobile BFF", subtitle: "REST / BFF", role: "gateway", icon: "nginx", group: "bff" },
      { id: "bff_admin", label: "Admin BFF", subtitle: "REST", role: "gateway", icon: "nginx", group: "bff" },
      // Domain services
      { id: "auth", label: "Auth Service", subtitle: "OIDC · sessions", role: "security", icon: "auth0", group: "domain" },
      { id: "user", label: "User Service", subtitle: "profiles · prefs", role: "compute", icon: "nodejs", group: "domain" },
      { id: "catalog", label: "Catalog Service", subtitle: "products · SKUs", role: "compute", icon: "go", group: "domain" },
      { id: "search", label: "Search Service", subtitle: "query · facets", role: "compute", icon: "python", group: "domain" },
      { id: "cart", label: "Cart Service", subtitle: "session cart", role: "compute", icon: "go", group: "domain" },
      { id: "order", label: "Order Service", subtitle: "write model", role: "compute", icon: "go", group: "domain" },
      { id: "payment", label: "Payment Service", subtitle: "capture · refund", role: "compute", icon: "typescript", group: "domain" },
      { id: "inventory", label: "Inventory Service", subtitle: "stock · reserve", role: "compute", icon: "go", group: "domain" },
      { id: "shipping", label: "Shipping Service", subtitle: "labels · tracking", role: "compute", icon: "python", group: "domain" },
      { id: "notify", label: "Notification Service", subtitle: "email · SMS · push", role: "compute", icon: "nodejs", group: "domain" },
      { id: "rec", label: "Recommendation", subtitle: "ML ranking", role: "compute", icon: "python", group: "domain" },
      // Data
      { id: "pg_user", label: "User DB", subtitle: "PostgreSQL", role: "data", icon: "postgresql", group: "data" },
      { id: "pg_order", label: "Orders DB", subtitle: "PostgreSQL", role: "data", icon: "postgresql", group: "data" },
      { id: "mysql_inv", label: "Inventory DB", subtitle: "MySQL", role: "data", icon: "mysql", group: "data" },
      { id: "mongo_cat", label: "Catalog DB", subtitle: "MongoDB", role: "data", icon: "mongodb", group: "data" },
      { id: "redis", label: "Redis Cache", subtitle: "cart · sessions", role: "data", icon: "redis", group: "data" },
      { id: "es", label: "Elasticsearch", subtitle: "product index", role: "data", icon: "elasticsearch", group: "data" },
      { id: "s3", label: "Object Storage", subtitle: "S3 assets · invoices", role: "storage", icon: "s3", group: "data" },
      // Events
      { id: "kafka", label: "Kafka Cluster", subtitle: "orders · inventory · payments · notify", role: "queue", icon: "kafka", group: "events" },
      { id: "t_order", label: "topic: order.events", role: "queue", icon: "kafka", group: "events" },
      { id: "t_pay", label: "topic: payment.events", role: "queue", icon: "kafka", group: "events" },
      { id: "t_inv", label: "topic: inventory.events", role: "queue", icon: "kafka", group: "events" },
      { id: "t_ship", label: "topic: shipping.events", role: "queue", icon: "kafka", group: "events" },
      // External
      { id: "stripe", label: "Stripe", subtitle: "card network", role: "external", icon: "cloudflare", group: "ext" },
      { id: "twilio", label: "Twilio / SES", subtitle: "SMS · email", role: "external", icon: "aws", group: "ext" },
    ],
    edges: [
      // Client → edge → GW
      { from: "web", to: "cdn", label: "HTTPS", kind: "sync" },
      { from: "mobile", to: "apigw", label: "HTTPS", kind: "sync" },
      { from: "admin", to: "apigw", label: "HTTPS", kind: "sync" },
      { from: "cdn", to: "waf", kind: "sync" },
      { from: "waf", to: "apigw", kind: "sync" },
      { from: "apigw", to: "bff_web", label: "route", kind: "sync" },
      { from: "apigw", to: "bff_mobile", label: "route", kind: "sync" },
      { from: "apigw", to: "bff_admin", label: "route", kind: "sync" },
      { from: "apigw", to: "auth", label: "validate JWT", kind: "sync" },
      // BFF → services (sync)
      { from: "bff_web", to: "catalog", label: "gRPC", kind: "sync" },
      { from: "bff_web", to: "search", label: "REST", kind: "sync" },
      { from: "bff_web", to: "cart", label: "gRPC", kind: "sync" },
      { from: "bff_web", to: "order", label: "gRPC", kind: "sync" },
      { from: "bff_web", to: "user", label: "gRPC", kind: "sync" },
      { from: "bff_web", to: "rec", label: "REST", kind: "sync" },
      { from: "bff_mobile", to: "catalog", kind: "sync" },
      { from: "bff_mobile", to: "cart", kind: "sync" },
      { from: "bff_mobile", to: "order", kind: "sync" },
      { from: "bff_admin", to: "inventory", kind: "sync" },
      { from: "bff_admin", to: "shipping", kind: "sync" },
      { from: "bff_admin", to: "user", kind: "sync" },
      // Cross-service sync
      { from: "order", to: "inventory", label: "reserve gRPC", kind: "sync" },
      { from: "order", to: "payment", label: "authorize gRPC", kind: "sync" },
      { from: "order", to: "cart", label: "read cart", kind: "sync" },
      { from: "payment", to: "stripe", label: "charge", kind: "sync" },
      { from: "search", to: "catalog", label: "hydrate", kind: "sync" },
      // DB edges (data)
      { from: "auth", to: "pg_user", label: "R/W", kind: "data" },
      { from: "user", to: "pg_user", label: "R/W", kind: "data" },
      { from: "order", to: "pg_order", label: "R/W", kind: "data" },
      { from: "inventory", to: "mysql_inv", label: "R/W", kind: "data" },
      { from: "catalog", to: "mongo_cat", label: "R/W", kind: "data" },
      { from: "cart", to: "redis", label: "R/W", kind: "data" },
      { from: "search", to: "es", label: "query", kind: "data" },
      { from: "catalog", to: "s3", label: "images", kind: "data" },
      { from: "payment", to: "s3", label: "invoices", kind: "data" },
      { from: "rec", to: "redis", label: "features", kind: "data" },
      // Kafka topology
      { from: "order", to: "t_order", label: "OrderPlaced", kind: "async" },
      { from: "payment", to: "t_pay", label: "PaymentCaptured", kind: "async" },
      { from: "inventory", to: "t_inv", label: "StockReserved", kind: "async" },
      { from: "shipping", to: "t_ship", label: "Shipped", kind: "async" },
      { from: "t_order", to: "kafka", kind: "async" },
      { from: "t_pay", to: "kafka", kind: "async" },
      { from: "t_inv", to: "kafka", kind: "async" },
      { from: "t_ship", to: "kafka", kind: "async" },
      { from: "kafka", to: "shipping", label: "consume order", kind: "async" },
      { from: "kafka", to: "notify", label: "consume *", kind: "async" },
      { from: "kafka", to: "rec", label: "consume order", kind: "async" },
      { from: "kafka", to: "search", label: "reindex", kind: "async" },
      { from: "notify", to: "twilio", label: "send", kind: "sync" },
    ],
    legend: [
      { label: "Sync REST / gRPC", kind: "sync" },
      { label: "Async Kafka event", kind: "async" },
      { label: "DB read / write", kind: "data" },
      { label: "Service", role: "compute" },
      { label: "Gateway / BFF", role: "gateway" },
      { label: "Data store", role: "data" },
    ],
  });
}

/**
 * 2. Place-order request flow — numbered sequence-style Mermaid.
 * Styled to match design system (presentation theme).
 */
function placeOrderFlow() {
  const theme = getTheme("presentation");
  const source = `%%{init: {
  "theme": "base",
  "themeVariables": {
    "fontFamily": "Inter, Helvetica Neue, Arial, sans-serif",
    "fontSize": "15px",
    "primaryColor": "${theme.roles.compute.fill}",
    "primaryTextColor": "${theme.ink}",
    "primaryBorderColor": "${theme.roles.compute.stroke}",
    "secondaryColor": "${theme.roles.gateway.fill}",
    "tertiaryColor": "${theme.roles.queue.fill}",
    "lineColor": "${theme.edgeSync}",
    "signalColor": "${theme.edgeSync}",
    "signalTextColor": "${theme.ink}",
    "labelBoxBkgColor": "${theme.surface}",
    "labelBoxBorderColor": "${theme.border}",
    "labelTextColor": "${theme.ink}",
    "actorBkg": "${theme.roles.gateway.fill}",
    "actorBorder": "${theme.roles.gateway.stroke}",
    "actorTextColor": "${theme.ink}",
    "actorLineColor": "${theme.border}",
    "noteBkgColor": "${theme.roles.queue.tint}",
    "noteBorderColor": "${theme.roles.queue.stroke}",
    "noteTextColor": "${theme.ink}",
    "activationBkgColor": "${theme.roles.compute.tint}",
    "activationBorderColor": "${theme.roles.compute.stroke}",
    "sequenceNumberColor": "${theme.accent}"
  },
  "sequence": {
    "actorMargin": 36,
    "messageMargin": 48,
    "mirrorActors": false,
    "bottomMarginAdj": 20,
    "rightAngles": true,
    "showSequenceNumbers": true,
    "width": 240
  }
}}%%
sequenceDiagram
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

/** 3. Same system on Kubernetes across 2 regions */
function k8sMultiRegion() {
  return compileCloud({
    title: "E-Commerce on Kubernetes — Dual Region",
    subtitle: "Ingress · namespaces · Istio mesh · managed DBs · observability",
    theme: "presentation",
    name: "03-k8s-dual-region",
    provider: "kubernetes",
    groups: [
      { id: "global", label: "Global Edge", kind: "other" },
      { id: "east", label: "Region us-east-1", kind: "region" },
      { id: "east_ing", label: "Ingress", parent: "east", kind: "other" },
      { id: "east_shop", label: "ns: shopping", parent: "east", kind: "namespace" },
      { id: "east_plat", label: "ns: platform", parent: "east", kind: "namespace" },
      { id: "east_data", label: "Managed Data (east)", parent: "east", kind: "other" },
      { id: "west", label: "Region us-west-2", kind: "region" },
      { id: "west_ing", label: "Ingress", parent: "west", kind: "other" },
      { id: "west_shop", label: "ns: shopping", parent: "west", kind: "namespace" },
      { id: "west_data", label: "Managed Data (west)", parent: "west", kind: "other" },
      { id: "obs", label: "Observability Stack", kind: "other" },
    ],
    nodes: [
      { id: "users", label: "Clients", subtitle: "Web · Mobile · Admin", role: "external", shape: "person" },
      { id: "cf", label: "CloudFront + WAF", role: "network", icon: "cloudflare", group: "global" },
      { id: "r53", label: "Route 53", subtitle: "latency / failover", role: "network", icon: "aws", group: "global" },

      { id: "alb_e", label: "ALB", role: "gateway", icon: "apigateway", group: "east_ing" },
      { id: "ing_e", label: "Ingress NGINX", role: "gateway", icon: "nginx", group: "east_ing" },
      { id: "istio_e", label: "Istio IngressGW", role: "network", icon: "istio", group: "east_ing" },

      { id: "gw_e", label: "API Gateway", role: "gateway", icon: "apigateway", group: "east_shop" },
      { id: "order_e", label: "order", role: "compute", icon: "go", group: "east_shop" },
      { id: "cart_e", label: "cart", role: "compute", icon: "go", group: "east_shop" },
      { id: "catalog_e", label: "catalog", role: "compute", icon: "go", group: "east_shop" },
      { id: "pay_e", label: "payment", role: "compute", icon: "typescript", group: "east_shop" },
      { id: "inv_e", label: "inventory", role: "compute", icon: "go", group: "east_shop" },
      { id: "ship_e", label: "shipping", role: "compute", icon: "python", group: "east_shop" },
      { id: "ntf_e", label: "notification", role: "compute", icon: "nodejs", group: "east_shop" },
      { id: "search_e", label: "search", role: "compute", icon: "python", group: "east_shop" },
      { id: "rec_e", label: "recommendation", role: "compute", icon: "python", group: "east_shop" },

      { id: "auth_e", label: "auth", role: "security", icon: "auth0", group: "east_plat" },
      { id: "mesh_e", label: "Istio Mesh", subtitle: "mTLS · retries", role: "network", icon: "istio", group: "east_plat" },
      { id: "kafka_e", label: "MSK Kafka", role: "queue", icon: "kafka", group: "east_plat" },

      { id: "aurora_e", label: "Aurora PG", subtitle: "orders · users", role: "data", icon: "postgresql", group: "east_data" },
      { id: "mysql_e", label: "RDS MySQL", subtitle: "inventory", role: "data", icon: "mysql", group: "east_data" },
      { id: "redis_e", label: "ElastiCache", role: "data", icon: "redis", group: "east_data" },
      { id: "es_e", label: "OpenSearch", role: "data", icon: "elasticsearch", group: "east_data" },
      { id: "s3_e", label: "S3", role: "storage", icon: "s3", group: "east_data" },

      { id: "alb_w", label: "ALB", role: "gateway", icon: "apigateway", group: "west_ing" },
      { id: "ing_w", label: "Ingress NGINX", role: "gateway", icon: "nginx", group: "west_ing" },
      { id: "order_w", label: "order", role: "compute", icon: "kubernetes", group: "west_shop" },
      { id: "cart_w", label: "cart", role: "compute", icon: "kubernetes", group: "west_shop" },
      { id: "catalog_w", label: "catalog", role: "compute", icon: "kubernetes", group: "west_shop" },
      { id: "pay_w", label: "payment", role: "compute", icon: "kubernetes", group: "west_shop" },
      { id: "aurora_w", label: "Aurora replica", role: "data", icon: "postgresql", group: "west_data" },
      { id: "redis_w", label: "Redis replica", role: "data", icon: "redis", group: "west_data" },

      { id: "prom", label: "Prometheus", role: "observability", icon: "prometheus", group: "obs" },
      { id: "graf", label: "Grafana", role: "observability", icon: "grafana", group: "obs" },
      { id: "loki", label: "Loki", subtitle: "logs", role: "observability", icon: "grafana", group: "obs" },
      { id: "tempo", label: "Tempo", subtitle: "traces", role: "observability", icon: "jaeger", group: "obs" },
      { id: "otel", label: "OTel Collector", role: "observability", icon: "opentelemetry", group: "obs" },
    ],
    edges: [
      { from: "users", to: "cf", label: "HTTPS", kind: "sync" },
      { from: "cf", to: "r53", kind: "sync" },
      { from: "r53", to: "alb_e", label: "primary", kind: "sync" },
      { from: "r53", to: "alb_w", label: "failover", kind: "sync" },
      { from: "alb_e", to: "ing_e", kind: "sync" },
      { from: "ing_e", to: "istio_e", kind: "sync" },
      { from: "istio_e", to: "gw_e", kind: "sync" },
      { from: "gw_e", to: "order_e", label: "gRPC", kind: "sync" },
      { from: "gw_e", to: "cart_e", kind: "sync" },
      { from: "gw_e", to: "catalog_e", kind: "sync" },
      { from: "gw_e", to: "search_e", kind: "sync" },
      { from: "order_e", to: "inv_e", kind: "sync" },
      { from: "order_e", to: "pay_e", kind: "sync" },
      { from: "mesh_e", to: "order_e", label: "mTLS", kind: "sync" },
      { from: "auth_e", to: "gw_e", label: "JWT", kind: "sync" },
      { from: "order_e", to: "aurora_e", kind: "data" },
      { from: "cart_e", to: "redis_e", kind: "data" },
      { from: "catalog_e", to: "s3_e", kind: "data" },
      { from: "inv_e", to: "mysql_e", kind: "data" },
      { from: "search_e", to: "es_e", kind: "data" },
      { from: "order_e", to: "kafka_e", label: "OrderPlaced", kind: "async" },
      { from: "kafka_e", to: "ship_e", kind: "async" },
      { from: "kafka_e", to: "ntf_e", kind: "async" },
      { from: "kafka_e", to: "rec_e", kind: "async" },
      { from: "alb_w", to: "ing_w", kind: "sync" },
      { from: "ing_w", to: "order_w", kind: "sync" },
      { from: "ing_w", to: "cart_w", kind: "sync" },
      { from: "ing_w", to: "catalog_w", kind: "sync" },
      { from: "ing_w", to: "pay_w", kind: "sync" },
      { from: "aurora_e", to: "aurora_w", label: "async replica", kind: "async" },
      { from: "redis_e", to: "redis_w", label: "replica", kind: "async" },
      { from: "otel", to: "prom", kind: "data" },
      { from: "otel", to: "tempo", kind: "data" },
      { from: "otel", to: "loki", kind: "data" },
      { from: "prom", to: "graf", kind: "sync" },
      { from: "loki", to: "graf", kind: "sync" },
      { from: "tempo", to: "graf", kind: "sync" },
      { from: "order_e", to: "otel", label: "traces", kind: "async" },
    ],
    legend: [
      { label: "Sync traffic", kind: "sync" },
      { label: "Async / replica / events", kind: "async" },
      { label: "Data path", kind: "data" },
      { label: "Workload", role: "compute" },
      { label: "Observability", role: "observability" },
    ],
  });
}

function flowchartSwimlanes() {
  return compileFlowchart({
    title: "CI/CD Release Pipeline",
    subtitle: "PR to production with canary · swimlanes",
    theme: "presentation",
    name: "04-flowchart-swimlanes",
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
