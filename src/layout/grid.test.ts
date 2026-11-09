import { describe, expect, it } from "vitest";
import { edgeHitsCards, layoutArchitecture, rectsOverlap } from "./grid.js";
import { renderArchitectureSvg } from "./svg.js";
import { compileMicroservice } from "../compilers/microservice.js";
import { compileCloud } from "../compilers/cloud.js";

const sample = {
  title: "Sample Architecture",
  subtitle: "Deterministic grid",
  theme: "dark",
  columns: [["clients"], ["edge"], ["app"], ["data"]],
  groups: [
    { id: "clients", label: "Clients" },
    { id: "edge", label: "Edge" },
    { id: "app", label: "App Tier" },
    { id: "data", label: "Data" },
  ],
  nodes: [
    { id: "web", label: "Web", role: "external" as const, icon: "browser", group: "clients" },
    { id: "mobile", label: "Mobile", role: "external" as const, icon: "mobile", group: "clients" },
    { id: "cdn", label: "CDN", role: "network" as const, icon: "cdn", group: "edge" },
    { id: "waf", label: "WAF", role: "security" as const, icon: "waf", group: "edge" },
    { id: "order", label: "Order", role: "compute" as const, icon: "server", group: "app" },
    { id: "pay", label: "Payment", role: "compute" as const, icon: "server", group: "app" },
    { id: "pg", label: "Orders DB", role: "data" as const, icon: "database", group: "data" },
    { id: "kafka", label: "Kafka", role: "queue" as const, icon: "kafka", group: "data" },
  ],
  edges: [
    { from: "clients", to: "edge", step: 1, kind: "sync" as const },
    { from: "edge", to: "app", step: 2, kind: "sync" as const },
    { from: "order", to: "pay", kind: "sync" as const },
    { from: "order", to: "pg", step: 3, kind: "data" as const },
    { from: "order", to: "kafka", step: 4, kind: "async" as const },
  ],
  steps: [
    { n: 1, label: "Ingress", description: "Clients hit edge" },
    { n: 2, label: "Route", description: "Edge to app" },
    { n: 3, label: "Persist", description: "Write DB" },
    { n: 4, label: "Emit", description: "Publish event" },
  ],
};

describe("layoutArchitecture", () => {
  it("is deterministic", () => {
    const a = layoutArchitecture(sample);
    const b = layoutArchitecture(sample);
    expect(a).toEqual(b);
  });

  it("places non-overlapping cards with gutters", () => {
    const layout = layoutArchitecture(sample);
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        expect(rectsOverlap(layout.nodes[i].rect, layout.nodes[j].rect, 8)).toBe(false);
      }
    }
  });

  it("routes edges that largely avoid card interiors", () => {
    const layout = layoutArchitecture(sample);
    const cards = layout.nodes.map((n) => n.rect);
    let hits = 0;
    for (const e of layout.edges) {
      if (edgeHitsCards(e, cards, 4)) hits++;
    }
    // Allow a small number of near-port grazes; most should clear
    expect(hits).toBeLessThanOrEqual(2);
  });

  it("includes title, sidebar, and step badges metadata", () => {
    const layout = layoutArchitecture(sample);
    expect(layout.title).toBe("Sample Architecture");
    expect(layout.sidebar.w).toBeGreaterThan(200);
    expect(layout.edges.some((e) => e.step === 1)).toBe(true);
    expect(layout.steps).toHaveLength(4);
  });

  it("renders SVG with white badge numerals and Steps panel", () => {
    const layout = layoutArchitecture(sample);
    const svg = renderArchitectureSvg(layout, "dark");
    expect(svg).toContain("<svg");
    expect(svg).toContain("Sample Architecture");
    expect(svg).toContain(">Steps<");
    expect(svg).toContain('fill="#FFFFFF"');
    expect(svg).toContain("font-weight=\"700\">1<");
    expect(svg).toContain("dotGrid");
    expect(svg).not.toContain("Guidance for");
  });
});

describe("compilers → svg engine", () => {
  it("compileMicroservice returns svg source", () => {
    const r = compileMicroservice(sample);
    expect(r.engine).toBe("svg");
    expect(r.source).toContain("<svg");
    expect(r.source).toContain("Order");
  });

  it("compileCloud returns svg source", () => {
    const r = compileCloud({ ...sample, provider: "aws" });
    expect(r.engine).toBe("svg");
    expect(r.source).toContain("CDN");
  });

  it("rejects unknown edge endpoints", () => {
    expect(() =>
      compileMicroservice({
        nodes: [{ id: "a", label: "A" }],
        edges: [{ from: "a", to: "ghost" }],
      }),
    ).toThrow(/not declared/);
  });
});
