import { describe, expect, it } from "vitest";
import { compileMicroservice } from "./microservice.js";
import { compileCloud } from "./cloud.js";
import {
  assertD2EdgesAreQualified,
  assertValidEdges,
  buildQualifiedPaths,
} from "./paths.js";

describe("qualified D2 paths", () => {
  it("builds nested paths with board prefix", () => {
    const paths = buildQualifiedPaths(
      [
        { id: "order", label: "Order", group: "domain" },
        { id: "kafka", label: "Kafka", group: "events" },
        { id: "users", label: "Users" },
      ],
      [
        { id: "domain", label: "Domain" },
        { id: "events", label: "Events" },
      ],
      { boardId: "board" },
    );
    expect(paths.get("order")).toBe("board.domain.order");
    expect(paths.get("kafka")).toBe("board.events.kafka");
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
  });

  it("throws when edge references unknown node", () => {
    expect(() =>
      assertValidEdges([{ from: "a", to: "missing" }], [{ id: "a", label: "A" }], "test"),
    ).toThrow(/not declared nodes/);
  });

  it("microservice edges use fully qualified paths (no duplicate bare ids)", () => {
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
      ],
    });
    expect(r.source).toContain("board.core.order -> board.data.kafka");
    expect(r.source).toContain("board.edge.web -> board.core.order");
    // Bare nested ids must NOT appear as edge endpoints
    expect(r.source).not.toMatch(/^order\s*->/m);
    expect(r.source).not.toMatch(/^kafka\s*->/m);
    expect(r.source).not.toMatch(/->\s*kafka\b/m);

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
      { boardId: "board" },
    );
    expect(() => assertD2EdgesAreQualified(r.source, paths)).not.toThrow();
  });

  it("cloud edges use fully qualified nested paths", () => {
    // Single root → no board wrapper; path is still fully nested
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
    expect(single.source).toContain("east.shop.gw -> east.shop.ord");
    expect(single.source).toContain("east.shop.ord -> east.data.db");
    expect(single.source).not.toMatch(/^gw\s*->/m);

    // Multi-root → board prefix
    const multi = compileCloud({
      nodes: [
        { id: "a", label: "A", group: "r1", role: "compute" },
        { id: "b", label: "B", group: "r2", role: "compute" },
      ],
      groups: [
        { id: "r1", label: "R1" },
        { id: "r2", label: "R2" },
      ],
      edges: [{ from: "a", to: "b", kind: "sync" }],
    });
    expect(multi.source).toContain("board.r1.a -> board.r2.b");
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
