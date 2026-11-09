import { describe, expect, it } from "vitest";
import { assertValidEdges, buildQualifiedPaths } from "./paths.js";
import { cloudSchema, microserviceSchema } from "../tools/schemas.js";

describe("edge validation", () => {
  it("throws when edge references unknown node", () => {
    expect(() =>
      assertValidEdges([{ from: "a", to: "missing" }], [{ id: "a", label: "A" }], "test"),
    ).toThrow(/not declared/);
  });

  it("allows edges to group ids", () => {
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

  it("still builds qualified paths for raw D2 escape hatch", () => {
    const paths = buildQualifiedPaths(
      [{ id: "order", label: "Order", group: "domain" }],
      [{ id: "domain", label: "Domain" }],
      { boardId: "board" },
    );
    expect(paths.get("order")).toBe("board.domain.order");
    expect(paths.get("domain")).toBe("board.domain");
  });
});

describe("steps schema", () => {
  it("accepts steps and columns on cloud/microservice schemas", () => {
    const steps = [{ n: 1, label: "Ingress", description: "CDN", anchor: "edge" }];
    expect(() =>
      cloudSchema.parse({
        nodes: [{ id: "a", label: "A", group: "edge" }],
        groups: [{ id: "edge", label: "Edge" }],
        steps,
        columns: [["edge"]],
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
});
