import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { edgeHitsCards, layoutArchitecture, rectsOverlap } from "./grid.js";
import { renderArchitectureSvg } from "./svg.js";
import { compileMicroservice } from "../compilers/microservice.js";
import { compileCloud } from "../compilers/cloud.js";
import {
  EDGE_CLEARANCE, TRACK_SPACING, edgeLabelSize, inflateRect, measureRouting,
  rectanglesIntersect, routeArchitectureEdges, RoutingCapacityError, segmentHitsRect, tierHeaderRect,
} from "./routing.js";
import type { ArchitectureLayoutInput, LayoutResult, Point, Rect } from "./types.js";

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

  it("routes every edge clear of card interiors without shared tracks", () => {
    const layout = layoutArchitecture(sample);
    const cards = layout.nodes.map((n) => n.rect);
    for (const e of layout.edges) {
      expect(edgeHitsCards(e, cards, 0)).toBe(false);
    }
    expect(layout.routing.overlapLength).toBe(0);
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

function expectClearRouting(layout: LayoutResult): void {
  expect(layout.routing.overlapLength).toBe(0);
  expect(layout.routing.closeParallelLength).toBe(0);
  const { content } = layout;
  for (const e of layout.edges) {
    expect(e.points.length).toBeGreaterThanOrEqual(2);
    expect(edgeHitsCards(e, layout.nodes.map((n) => n.rect), 0)).toBe(false);
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1];
      const b = e.points[i];
      expect(a.x === b.x || a.y === b.y).toBe(true);
      expect(a).not.toEqual(b);
      if (i > 1) {
        const prev = e.points[i - 2];
        expect((a.x - prev.x) * (b.x - a.x) + (a.y - prev.y) * (b.y - a.y)).toBeGreaterThanOrEqual(0);
      }
      for (let j = 1; j < i - 1; j++) {
        const conflict = measureRouting([
          { points: [a, b] }, { points: [e.points[j - 1], e.points[j]] },
        ]);
        expect(conflict.overlapLength).toBe(0);
        expect(conflict.crossings).toBe(0);
      }
      for (const n of layout.nodes.filter((n) => n.id !== e.from && n.id !== e.to)) {
        expect(segmentHitsRect(a, b, inflateRect(n.rect, EDGE_CLEARANCE - 1e-5))).toBe(false);
      }
      for (const tier of layout.tiers) expect(segmentHitsRect(a, b, tierHeaderRect(tier))).toBe(false);
    }
    for (const p of e.points) {
      expect(p.x).toBeGreaterThanOrEqual(content.x);
      expect(p.y).toBeGreaterThanOrEqual(content.y);
      expect(p.x).toBeLessThanOrEqual(content.x + content.w);
      expect(p.y).toBeLessThanOrEqual(content.y + content.h);
    }
    for (const [id, point, adjacent] of [
      [e.from, e.points[0], e.points[1]],
      [e.to, e.points[e.points.length - 1], e.points[e.points.length - 2]],
    ] as const) {
      const rect = [...layout.nodes, ...layout.tiers].find((n) => n.id === id)!.rect;
      const normal = Math.abs(point.x - rect.x) < 1e-5 ? { x: -1, y: 0 }
        : Math.abs(point.x - rect.x - rect.w) < 1e-5 ? { x: 1, y: 0 }
        : Math.abs(point.y - rect.y) < 1e-5 ? { x: 0, y: -1 } : { x: 0, y: 1 };
      expect((adjacent.x - point.x) * normal.x + (adjacent.y - point.y) * normal.y).toBeGreaterThan(0);
    }
  }
}

function expectClearAnnotations(layout: LayoutResult): void {
  const annotations: { edge: number; rect: Rect }[] = [];
  const box = (p: Point, w: number, h: number): Rect => ({ x: p.x - w / 2, y: p.y - h / 2, w, h });
  layout.edges.forEach((e, edge) => {
    if (e.label) {
      const { w, h } = edgeLabelSize(e.label);
      annotations.push({ edge, rect: box(e.labelAt, w, h) });
    }
    if (e.step != null) {
      expect(e.badgeAt).toBeDefined();
      annotations.push({ edge, rect: box(e.badgeAt!, 28, 28) });
    }
  });
  annotations.forEach(({ edge, rect }, i) => {
    expect(rect.x).toBeGreaterThanOrEqual(layout.content.x);
    expect(rect.y).toBeGreaterThanOrEqual(layout.content.y);
    expect(rect.x + rect.w).toBeLessThanOrEqual(layout.content.x + layout.content.w);
    expect(rect.y + rect.h).toBeLessThanOrEqual(layout.content.y + layout.content.h);
    for (const n of layout.nodes) expect(rectanglesIntersect(rect, n.rect)).toBe(false);
    for (const other of annotations.slice(0, i)) expect(rectanglesIntersect(rect, other.rect)).toBe(false);
    layout.edges.forEach((e, j) => {
      if (j === edge) return;
      for (let k = 1; k < e.points.length; k++) {
        expect(segmentHitsRect(e.points[k - 1], e.points[k], inflateRect(rect, 3))).toBe(false);
      }
    });
  });
}

describe("congestion-aware architecture routing", () => {
  const fanout: ArchitectureLayoutInput = {
    groups: [{ id: "sources", label: "Sources" }, { id: "targets", label: "Targets" }],
    columns: [["sources"], ["targets"]],
    nodes: [
      { id: "hub", label: "Hub", group: "sources" },
      ...Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, label: `Target ${i}`, group: "targets" })),
    ],
    edges: Array.from({ length: 10 }, (_, i) => ({ from: "hub", to: `t${i}` })),
  };

  it("allocates more than four distinct ports inside the card boundary", () => {
    const layout = layoutArchitecture(fanout);
    expectClearRouting(layout);
    const hub = layout.nodes.find((n) => n.id === "hub")!.rect;
    const starts = layout.edges.map((e) => e.points[0]);
    expect(new Set(starts.map((p) => `${p.x}:${p.y}`)).size).toBe(10);
    for (const p of starts) {
      expect(p.x === hub.x || p.x === hub.x + hub.w || p.y === hub.y || p.y === hub.y + hub.h).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(hub.x);
      expect(p.x).toBeLessThanOrEqual(hub.x + hub.w);
      expect(p.y).toBeGreaterThanOrEqual(hub.y);
      expect(p.y).toBeLessThanOrEqual(hub.y + hub.h);
    }
    const right = starts.filter((p) => p.x === hub.x + hub.w).sort((a, b) => a.y - b.y);
    for (let i = 1; i < right.length; i++) expect(right[i].y - right[i - 1].y).toBeGreaterThanOrEqual(TRACK_SPACING);
  });

  it("keeps routing stable when the edge input order changes", () => {
    const a = layoutArchitecture(fanout);
    const b = layoutArchitecture({ ...fanout, edges: [...fanout.edges!].reverse() });
    expect(a.nodes).toEqual(b.nodes);
    for (const edge of a.edges) {
      expect(b.edges.find((e) => e.from === edge.from && e.to === edge.to)).toEqual(edge);
    }
    expect(a.routing).toEqual(b.routing);
  });

  it("reserves enough port capacity for high-degree tier endpoints too", () => {
    const layout = layoutArchitecture({
      groups: [{ id: "g0", label: "Source" }, { id: "g1", label: "Target" }],
      nodes: [{ id: "a", label: "A", group: "g0" }, { id: "b", label: "B", group: "g1" }],
      edges: Array.from({ length: 24 }, () => ({ from: "g0", to: "g1" })),
    });
    expectClearRouting(layout);
    const ys = layout.edges.map((e) => e.points[0].y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(TRACK_SPACING);
  });

  it("separates parallel, reverse, and self-loop connections", () => {
    const layout = layoutArchitecture({
      nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      edges: [
        { from: "a", to: "b", label: "Request", step: 1 },
        { from: "a", to: "b", label: "Events", kind: "async", step: 2 },
        { from: "b", to: "a", label: "Response" },
        { from: "a", to: "a", label: "Retry", step: 3 },
      ],
    });
    expect(layout.edges).toHaveLength(4);
    expectClearRouting(layout);
    expectClearAnnotations(layout);
    const loop = layout.edges[3];
    expect(loop.points.length).toBeGreaterThanOrEqual(4);
    expect(loop.points[0]).not.toEqual(loop.points[loop.points.length - 1]);
    expect(layout.nodes.every((n) => n.rect.x + n.rect.w < layout.sidebar.x)).toBe(true);
  });

  it("routes dense mixed node/tier traffic and collision-checks labels and badges", () => {
    const layout = layoutArchitecture({
      groups: [{ id: "app", label: "Applications" }, { id: "data", label: "Data" }, { id: "ext", label: "External" }],
      columns: [["app"], ["data", "ext"]],
      nodes: [
        ...Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, label: `App ${i}`, group: "app" })),
        ...Array.from({ length: 4 }, (_, i) => ({ id: `d${i}`, label: `Store ${i}`, group: "data" })),
        { id: "external", label: "Provider", group: "ext" },
      ],
      edges: [
        ...Array.from({ length: 4 }, (_, i) => ({ from: `a${i}`, to: `d${3 - i}`, label: `Write ${i}`, step: i + 1 })),
        { from: "a0", to: "d0", label: "讀取資料" },
        { from: "a0", to: "d1" },
        { from: "d2", to: "a1", kind: "async" },
        { from: "app", to: "data", label: "Persistence", step: 5 },
        { from: "data", to: "ext", step: 6 },
        { from: "external", to: "a3", label: "Callback", step: 7 },
      ],
    });
    expect(layout.edges).toHaveLength(10);
    expectClearRouting(layout);
    expectClearAnnotations(layout);
    const svg = renderArchitectureSvg(layout, "dark");
    expect(svg).toContain('class="edge-halo"');
    expect(svg).toContain('id="routing-quality"');
    expect(svg.lastIndexOf('class="edge-annotations"')).toBeGreaterThan(svg.lastIndexOf('class="card"'));
  });

  it("finds a multi-bend detour rather than crossing staggered obstacles", () => {
    const node = (id: string, rect: Rect) => ({ id, label: id, icon: "server" as const, rect });
    const nodes = [
      node("from", { x: 20, y: 120, w: 60, h: 60 }),
      node("wall1", { x: 130, y: 0, w: 50, h: 220 }),
      node("wall2", { x: 240, y: 100, w: 50, h: 260 }),
      node("to", { x: 340, y: 120, w: 60, h: 60 }),
    ];
    const result = routeArchitectureEdges([{ from: "from", to: "to" }], nodes, [], { x: 0, y: 0, w: 440, h: 380 });
    expect(result.edges[0].points.length).toBeGreaterThanOrEqual(6);
    expect(edgeHitsCards(result.edges[0], nodes.map((n) => n.rect), 0)).toBe(false);
  });

  it("reports unavoidable crossings without hiding or overlapping connections", () => {
    const layout = layoutArchitecture({
      groups: [{ id: "left", label: "Left" }, { id: "right", label: "Right" }],
      nodes: [
        ...Array.from({ length: 3 }, (_, i) => ({ id: `l${i}`, label: `L${i}`, group: "left" })),
        ...Array.from({ length: 3 }, (_, i) => ({ id: `r${i}`, label: `R${i}`, group: "right" })),
      ],
      edges: Array.from({ length: 9 }, (_, i) => ({ from: `l${Math.floor(i / 3)}`, to: `r${i % 3}` })),
    });
    expectClearRouting(layout);
    expect(layout.routing.crossings).toBeGreaterThan(0);
    expect(layout.routing).toEqual(measureRouting(layout.edges));
  });

  it("reports impossible routing explicitly instead of drawing through cards", () => {
    const nodes = [
      { id: "a", label: "A", icon: "server" as const, rect: { x: 0, y: 30, w: 40, h: 40 } },
      { id: "b", label: "B", icon: "server" as const, rect: { x: 160, y: 30, w: 40, h: 40 } },
      { id: "wall", label: "Wall", icon: "server" as const, rect: { x: 90, y: 0, w: 20, h: 100 } },
    ];
    expect(() => routeArchitectureEdges([{ from: "a", to: "b" }], nodes, [], { x: 0, y: 0, w: 200, h: 100 }))
      .toThrow(RoutingCapacityError);
  });

  it("detects narrow card penetrations missed by sampling and measures exact edge conflicts", () => {
    const line = { from: "a", to: "b", kind: "sync" as const, labelAt: { x: 0, y: 0 },
      points: [{ x: 0, y: 10 }, { x: 1000, y: 10 }] };
    expect(edgeHitsCards(line, [{ x: 51, y: 5, w: 2, h: 10 }], 0)).toBe(true);
    expect(measureRouting([
      line,
      { points: [{ x: 25, y: 10 }, { x: 75, y: 10 }] },
      { points: [{ x: 500, y: 0 }, { x: 500, y: 20 }] },
    ])).toMatchObject({ overlapLength: 50, crossings: 1 });
  });

  it.each(["horizontal", "vertical"])("keeps straight %s edges visible in the rasterized dark theme", async (direction) => {
    const layout = layoutArchitecture({
      groups: [{ id: "g0", label: "Source" }, { id: "g1", label: "Target" }],
      columns: direction === "horizontal" ? [["g0"], ["g1"]] : [["g0", "g1"]],
      nodes: [{ id: "a", label: "A", group: "g0" }, { id: "b", label: "B", group: "g1" }],
      edges: [{ from: "g0", to: "g1" }],
    });
    const points = layout.edges[0].points;
    expect(points).toHaveLength(2);
    const x = Math.round((points[0].x + points[1].x) / 2);
    const y = Math.round((points[0].y + points[1].y) / 2);
    const pixel = await sharp(Buffer.from(renderArchitectureSvg(layout, "dark")))
      .extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    expect(pixel[0]).toBeLessThan(100);
    expect(pixel[1]).toBeGreaterThan(150);
    expect(pixel[2]).toBeGreaterThan(150);
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
