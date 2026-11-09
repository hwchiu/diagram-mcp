import { describe, expect, it } from "vitest";
import { compileMicroservice } from "./microservice.js";
import { compileCloud } from "./cloud.js";
import {
  assertD2EdgesAreQualified,
  assertValidEdges,
  buildQualifiedPaths,
} from "./paths.js";
import { cloudSchema, microserviceSchema } from "../tools/schemas.js";

describe("qualified D2 paths", () => {
  it("builds nested paths with optional board + cells wrapper", () => {
    const paths = buildQualifiedPaths(
      [
        { id: "order", label: "Order", group: "domain" },
        { id: "cart", label: "Cart", group: "domain" },
        { id: "kafka", label: "Kafka", group: "events" },
        { id: "users", label: "Users" },
      ],
      [
        { id: "domain", label: "Domain" },
        { id: "events", label: "Events" },
      ],
      { boardId: "board", cellsGroups: new Set(["domain"]) },
    );
    expect(paths.get("order")).toBe("board.domain.cells.order");
    expect(paths.get("cart")).toBe("board.domain.cells.cart");
    expect(paths.get("kafka")).toBe("board.events.kafka");
    expect(paths.get("domain")).toBe("board.domain");
    expect(paths.get("users")).toBe("users");
  });

  it("builds deep nested cloud paths", () => {
    const paths = buildQualifiedPaths(
      [{ id: "order_e", label: "order", group: "east_shop" }],
      [
        { id: "east", label: "East" },
        { id: "east_shop", label: "Shopping", parent: "east" },
      ],
      { boardId: "board" },
    );
    expect(paths.get("order_e")).toBe("board.east.east_shop.order_e");
    expect(paths.get("east_shop")).toBe("board.east.east_shop");
  });

  it("throws when edge references unknown node", () => {
    expect(() =>
      assertValidEdges([{ from: "a", to: "missing" }], [{ id: "a", label: "A" }], "test"),
    ).toThrow(/not declared nodes/);
  });

  it("allows edges to group ids (tier-to-tier)", () => {
    const edges = assertValidEdges(
      [{ from: "bff", to: "domain", kind: "sync" }],
      [{ id: "x", label: "X", group: "bff" }],
      "test",
      [
        { id: "bff", label: "BFF" },
        { id: "domain", label: "Domain" },
      ],
    );
    expect(edges).toHaveLength(1);
  });

  it("microservice edges use fully qualified paths (no board under 7 roots)", () => {
    const r = compileMicroservice({
      nodes: [
        { id: "order", label: "Order", role: "compute", group: "core" },
        { id: "kafka", label: "Kafka", role: "queue", group: "data" },
        { id: "web", label: "Web", role: "external", group: "edge" },
      ],
      groups: [
        { id: "edge", label: "Edge" },
        { id: "core", label: "Core" },
        { id: "data", label: "Data" },
      ],
      edges: [
        { from: "web", to: "order", kind: "sync" },
        { from: "order", to: "kafka", kind: "async" },
        { from: "core", to: "data", kind: "data" },
      ],
      steps: [
        { n: 1, label: "Client to service", description: "Web calls Order", anchor: "edge" },
        { n: 2, label: "Persist via bus", description: "Order publishes", anchor: "data" },
      ],
    });
    expect(r.source).toContain("core.order -> data.kafka");
    expect(r.source).toContain("edge.web -> core.order");
    expect(r.source).toContain("core -> data");
    expect(r.source).toContain('guide: "Architecture steps"');
    expect(r.source).toContain('n1: "1"');
    expect(r.source).not.toMatch(/^order\s*->/m);
    expect(r.layout).toBe("tala");

    const paths = buildQualifiedPaths(
      [
        { id: "order", label: "Order", group: "core" },
        { id: "kafka", label: "Kafka", group: "data" },
        { id: "web", label: "Web", group: "edge" },
      ],
      [
        { id: "edge", label: "Edge" },
        { id: "core", label: "Core" },
        { id: "data", label: "Data" },
      ],
    );
    expect(() => assertD2EdgesAreQualified(r.source, paths)).not.toThrow();
  });

  it("cloud edges use cells wrapper for multi-node leaf tiers", () => {
    const single = compileCloud({
      nodes: [
        { id: "gw", label: "GW", group: "shop", role: "gateway" },
        { id: "ord", label: "Order", group: "shop", role: "compute" },
        { id: "db", label: "DB", group: "data", role: "data" },
      ],
      groups: [
        { id: "east", label: "East" },
        { id: "shop", label: "Shopping", parent: "east" },
        { id: "data", label: "Data", parent: "east" },
      ],
      edges: [
        { from: "gw", to: "ord", kind: "sync" },
        { from: "ord", to: "db", kind: "data" },
      ],
    });
    expect(single.source).toContain("east.shop.cells.gw -> east.shop.cells.ord");
    expect(single.source).toContain("east.shop.cells.ord -> east.data.db");
    expect(single.source).toContain("stroke-dash: 4");
    expect(single.source).not.toMatch(/^gw\s*->/m);
  });

  it("rejects invalid edges at compile time", () => {
    expect(() =>
      compileMicroservice({
        nodes: [{ id: "a", label: "A" }],
        edges: [{ from: "a", to: "ghost" }],
      }),
    ).toThrow(/not declared nodes/);
  });
});

describe("steps schema", () => {
  it("accepts steps on cloud and microservice schemas", () => {
    const steps = [
      { n: 1, label: "Ingress", description: "CDN + WAF", anchor: "edge" },
      { n: 2, label: "Route", description: "API Gateway", anchor: "bff" },
    ];
    expect(() =>
      cloudSchema.parse({
        nodes: [{ id: "a", label: "A", group: "edge" }],
        groups: [{ id: "edge", label: "Edge" }],
        steps,
      }),
    ).not.toThrow();
    expect(() =>
      microserviceSchema.parse({
        nodes: [{ id: "a", label: "A", group: "bff" }],
        groups: [{ id: "bff", label: "BFF" }],
        edges: [{ from: "a", to: "a", step: 1 }],
        steps,
      }),
    ).not.toThrow();
  });

  it("rejects invalid step numbers", () => {
    expect(() =>
      microserviceSchema.parse({
        nodes: [{ id: "a", label: "A" }],
        steps: [{ n: 0, label: "Bad" }],
      }),
    ).toThrow();
  });
});
