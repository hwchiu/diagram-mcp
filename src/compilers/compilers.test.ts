import { describe, expect, it } from "vitest";
import { compileCloud } from "./cloud.js";
import { compileMicroservice } from "./microservice.js";
import { compileFlowchart } from "./flowchart.js";
import { compileDecision } from "./decision.js";
import { compileDependency } from "./dependency.js";

describe("compilers", () => {
  it("compiles cloud to svg", () => {
    const r = compileCloud({
      title: "Test Cloud",
      nodes: [{ id: "a", label: "API", role: "gateway", icon: "gateway" }],
      edges: [],
    });
    expect(r.engine).toBe("svg");
    expect(r.source).toContain("API");
  });

  it("compiles microservice to svg", () => {
    const r = compileMicroservice({
      nodes: [
        { id: "s", label: "Svc", role: "compute" },
        { id: "q", label: "Bus", role: "queue", icon: "kafka" },
      ],
      edges: [{ from: "s", to: "q", kind: "async" }],
    });
    expect(r.engine).toBe("svg");
    expect(r.source).toContain("stroke-dasharray");
  });

  it("compiles flowchart to mermaid", () => {
    const r = compileFlowchart({
      nodes: [
        { id: "a", label: "Start", type: "start" },
        { id: "b", label: "End", type: "end" },
      ],
      edges: [{ from: "a", to: "b" }],
    });
    expect(r.engine).toBe("mermaid");
    expect(r.source).toContain("flowchart");
  });

  it("compiles decision to mermaid", () => {
    const r = compileDecision({
      root: "q",
      nodes: [
        { id: "q", label: "OK?", type: "question" },
        { id: "y", label: "Yes", type: "outcome" },
      ],
      edges: [{ from: "q", to: "y", when: "yes" }],
    });
    expect(r.engine).toBe("mermaid");
    expect(r.source).toContain("q{OK?}");
  });

  it("compiles dependency to dot", () => {
    const r = compileDependency({
      nodes: [
        { id: "a", label: "a" },
        { id: "b", label: "b" },
      ],
      edges: [{ from: "a", to: "b" }],
    });
    expect(r.engine).toBe("dot");
    expect(r.source).toContain("digraph");
  });
});
