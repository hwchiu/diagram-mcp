import { describe, expect, it } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { layoutArchitecture, rectsOverlap } from "./grid.js";
import { renderArchitectureSvg } from "./svg.js";
import { renderArchitectureDrawio } from "./drawio.js";
import { runArchitectureQa } from "./qa.js";
import type { LayoutResult, Point, Rect } from "./types.js";
import { compileMicroservice } from "../compilers/microservice.js";
import { compileCloud } from "../compilers/cloud.js";
import { ARCHITECTURE_SPECS } from "../showcase/architecture.js";
import { measureText } from "./text.js";

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

const clone = (l: LayoutResult): LayoutResult => JSON.parse(JSON.stringify(l));
const interiorHit = (a: Point, b: Point, r: Rect) => {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return x1 > r.x + 1 && x0 < r.x + r.w - 1 && y1 > r.y + 1 && y0 < r.y + r.h - 1;
};

describe("text measurement", () => {
  it("measures mono at 0.6em and CJK at 1em", () => {
    expect(measureText("abcd", { font: "mono", size: 10 })).toBeCloseTo(24, 0);
    expect(measureText("中文", { font: "mono", size: 10 })).toBeCloseTo(20, 0);
    expect(measureText("WWW", { font: "sans", size: 12, weight: 600 })).toBeGreaterThan(measureText("iii", { font: "sans", size: 12, weight: 600 }));
  });
});

describe("layoutArchitecture", () => {
  it("is deterministic", () => {
    expect(layoutArchitecture(sample)).toEqual(layoutArchitecture(sample));
  });

  it("places non-overlapping cards with gutters", () => {
    const layout = layoutArchitecture(sample);
    for (let i = 0; i < layout.nodes.length; i++)
      for (let j = i + 1; j < layout.nodes.length; j++)
        expect(rectsOverlap(layout.nodes[i].rect, layout.nodes[j].rect, 8)).toBe(false);
  });

  it("routes orthogonal edges that never pass through cards", () => {
    for (const [name, make] of Object.entries(ARCHITECTURE_SPECS)) {
      const layout = layoutArchitecture(make());
      for (const e of layout.edges) {
        expect(e.points.length, `${name} ${e.id}`).toBeGreaterThanOrEqual(2);
        for (let i = 1; i < e.points.length; i++) {
          const a = e.points[i - 1], b = e.points[i];
          expect(a.x === b.x || a.y === b.y, `${name} ${e.id} diagonal`).toBe(true);
          for (const n of layout.nodes) expect(interiorHit(a, b, n.rect), `${name} ${e.id} through ${n.id}`).toBe(false);
        }
      }
    }
  });

  it("renders the Cocoon dark language", () => {
    const svg = renderArchitectureSvg(layoutArchitecture(sample), "dark");
    expect(svg).toContain("<svg");
    expect(svg).toContain("Sample Architecture");
    expect(svg).toContain("#020617");
    expect(svg).toContain("JetBrains Mono");
    expect(svg).not.toMatch(/xlink:href="http|href="http/);
  });
});

describe("structural QA", () => {
  it("reports zero errors and zero warnings on every shipped architecture spec", () => {
    for (const [name, make] of Object.entries(ARCHITECTURE_SPECS)) {
      const issues = runArchitectureQa(layoutArchitecture(make())).filter((i) => i.severity !== "info");
      expect(issues.map((i) => `${i.severity} ${i.code}: ${i.message}`), name).toEqual([]);
    }
  });

  const base = layoutArchitecture(sample);
  const codes = (l: LayoutResult) => runArchitectureQa(l).map((i) => i.code);

  it("detects overlapping cards", () => {
    const l = clone(base);
    l.nodes[1].rect = { ...l.nodes[0].rect, x: l.nodes[0].rect.x + 10 };
    expect(codes(l)).toContain("card-overlap");
  });

  it("detects text overflow", () => {
    const l = clone(base);
    l.nodes[0].label = { text: "An extremely long service name that cannot fit", truncated: false, width: 999 };
    expect(codes(l)).toContain("text-overflow");
  });

  it("detects an edge through a card", () => {
    const l = clone(base);
    const a = l.nodes.find((n) => n.id === "web")!.rect;
    const b = l.nodes.find((n) => n.id === "kafka")!.rect;
    const y = a.y + a.h / 2;
    l.edges[0].points = [{ x: a.x + a.w, y }, { x: b.x, y }];
    expect(codes(l)).toContain("edge-through-card");
  });

  it("detects edges that stop on a tier frame", () => {
    const l = clone(base);
    const e = l.edges.find((x) => x.from === "order" && x.to === "pg")!;
    const last = e.points[e.points.length - 1];
    e.points[e.points.length - 1] = { x: last.x - 30, y: last.y };
    expect(codes(l)).toContain("edge-dangling");
  });

  it("detects labels on top of cards", () => {
    const l = clone(base);
    const e = l.edges.find((x) => x.step)!;
    const r = l.nodes[0].rect;
    e.badgeAt = { x: r.x + 20, y: r.y + 20 };
    expect(codes(l)).toContain("label-collision");
  });
});

describe("draw.io backend", () => {
  for (const [name, make] of Object.entries(ARCHITECTURE_SPECS)) {
    it(`emits well-formed mxGraph XML matching the SVG layout (${name})`, () => {
      const spec = make();
      const layout = layoutArchitecture(spec);
      const xml = renderArchitectureDrawio(layout, spec.theme ?? "dark");
      expect(XMLValidator.validate(xml)).toBe(true);
      const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" }).parse(xml);
      const cells: any[] = [].concat(doc.mxfile.diagram.mxGraphModel.root.mxCell);
      const byId = new Map(cells.map((c) => [c.id, c]));
      // absolute position of a cell (containers nest children with relative geometry)
      const abs = (c: any): { x: number; y: number } => {
        const g = c.mxGeometry ?? {};
        const p = c.parent && byId.get(c.parent);
        const o = p && p.mxGeometry && p.vertex === "1" ? abs(p) : { x: 0, y: 0 };
        return { x: o.x + Number(g.x ?? 0), y: o.y + Number(g.y ?? 0) };
      };
      for (const n of layout.nodes) {
        const c = byId.get(`node-${n.id}`);
        expect(c, n.id).toBeTruthy();
        const p = abs(c);
        expect(Math.abs(p.x - n.rect.x)).toBeLessThan(1.01);
        expect(Math.abs(p.y - n.rect.y)).toBeLessThan(1.01);
        expect(Number(c.mxGeometry.width)).toBeCloseTo(n.rect.w, 0);
      }
      for (const t of layout.tiers.filter((t) => !t.hidden)) expect(byId.has(`tier-${t.id}`), t.id).toBe(true);
      const edges = cells.filter((c) => c.edge === "1");
      expect(edges.length).toBe(layout.edges.length);
      for (const e of edges) expect(e.style).toContain("edgeStyle=orthogonalEdgeStyle");
    });
  }
});

describe("compilers → svg engine", () => {
  it("compileMicroservice returns svg source and QA", () => {
    const r = compileMicroservice(sample);
    expect(r.engine).toBe("svg");
    expect(r.source).toContain("<svg");
    expect(r.source).toContain("Order");
    expect(Array.isArray(r.qa)).toBe(true);
    expect(r.drawio).toBeUndefined();
  });

  it("compileCloud returns drawio when requested", () => {
    const r = compileCloud({ ...sample, provider: "aws", outputs: ["svg", "png", "drawio"] });
    expect(r.engine).toBe("svg");
    expect(r.source).toContain("CDN");
    expect(r.drawio).toContain("<mxfile");
  });

  it("rejects unknown edge endpoints", () => {
    expect(() =>
      compileMicroservice({ nodes: [{ id: "a", label: "A" }], edges: [{ from: "a", to: "ghost" }] }),
    ).toThrow(/not declared/);
  });
});
