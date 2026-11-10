import { describe, expect, it } from "vitest";
import { layoutArchitecture } from "./grid.js";
import { runArchitectureQa } from "./qa.js";
import { sharesTrunk, computeJunctions } from "./router.js";
import { planViews, shouldSplit, buildOverview, detailUnits } from "./split.js";
import type { ArchitectureLayoutInput, LayoutResult, RoutedEdge } from "./types.js";
import { compileCloud } from "../compilers/cloud.js";

/** n tiers in a chain, k nodes each; every node talks to the next tier. */
function chain(n: number, k: number, extra: Partial<ArchitectureLayoutInput> = {}): ArchitectureLayoutInput {
  const groups = Array.from({ length: n }, (_, i) => ({ id: `t${i}`, label: `Tier ${i}` }));
  const nodes = groups.flatMap((g, i) =>
    Array.from({ length: k }, (_, j) => ({ id: `n${i}_${j}`, label: `Service ${i}.${j}`, role: "compute" as const, icon: "server", group: g.id })),
  );
  const edges = [] as NonNullable<ArchitectureLayoutInput["edges"]>;
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < k; j++) edges.push({ from: `n${i}_${j}`, to: `n${i + 1}_${j % k}`, kind: "sync" });
  return { title: "Chain", groups, nodes, edges, columns: groups.map((g) => [g.id]), ...extra };
}

const aspect = (l: LayoutResult) => l.width / l.height;
const errors = (l: LayoutResult) => runArchitectureQa(l).filter((i) => i.severity === "error");

describe("auto-wrap toward 16:9", () => {
  it("wraps a long single row of tiers into a slide-shaped canvas", () => {
    const l = layoutArchitecture(chain(8, 2));
    expect(l.plan?.rows.length).toBeGreaterThanOrEqual(2);
    expect(aspect(l)).toBeGreaterThan(1.4);
    expect(aspect(l)).toBeLessThan(2.2);
    expect(errors(l)).toEqual([]);
  });

  it("keeps everything on one row with wrap: never", () => {
    const l = layoutArchitecture(chain(8, 2, { wrap: "never" }));
    expect(l.plan?.rows.length ?? 1).toBe(1);
    expect(aspect(l)).toBeGreaterThan(2.5);
  });

  it("respects explicit rows", () => {
    const input = chain(6, 2);
    const l = layoutArchitecture({ ...input, rows: [[["t0"], ["t1"]], [["t2"], ["t3"]], [["t4"], ["t5"]]] });
    expect(l.plan?.rows.length).toBe(3);
    const ys = new Set(l.tiers.filter((t) => !t.parentId).map((t) => Math.round(t.rect.y)));
    expect(ys.size).toBe(3);
  });

  it("does not wrap a small diagram that already fits", () => {
    const l = layoutArchitecture(chain(3, 2));
    expect(l.plan?.rows.length ?? 1).toBe(1);
  });
});

describe("edge trunks", () => {
  const fan = (): ArchitectureLayoutInput => ({
    title: "Fan-in",
    groups: [
      { id: "a", label: "Producers" },
      { id: "b", label: "Sink" },
    ],
    columns: [["a"], ["b"]],
    nodes: [
      ...[0, 1, 2, 3].map((i) => ({ id: `p${i}`, label: `Producer ${i}`, role: "compute" as const, group: "a" })),
      { id: "db", label: "Store", role: "data" as const, group: "b" },
      { id: "q", label: "Queue", role: "queue" as const, group: "b" },
    ],
    edges: [0, 1, 2, 3].map((i) => ({ from: `p${i}`, to: "db", kind: "data" as const })),
  });

  it("bundles edges into one tier into a shared trunk with junction dots", () => {
    const l = layoutArchitecture(fan());
    const es = l.edges;
    expect(es.length).toBe(4);
    for (let i = 1; i < es.length; i++) expect(sharesTrunk(es[0], es[i])).toBe(true);
    expect(l.junctions?.length ?? 0).toBeGreaterThan(0);
    expect(runArchitectureQa(l).filter((i) => i.code === "edge-overlap")).toEqual([]);
  });

  it("emits junctions only where shared track begins or ends", () => {
    const mk = (id: string, pts: Array<[number, number]>, trunks: string[]): RoutedEdge =>
      ({ id, from: id, to: "x", kind: "sync", bundle: id, trunks, points: pts.map(([x, y]) => ({ x, y })) }) as unknown as RoutedEdge;
    const a = mk("a", [[0, 0], [100, 0], [100, 100], [200, 100]], ["T"]);
    const b = mk("b", [[0, 50], [100, 50], [100, 100], [200, 100]], ["T"]);
    const j = computeJunctions([a, b]);
    expect(j.map((p) => p.at)).toEqual([{ x: 100, y: 50 }]);
    const c = mk("c", [[0, 50], [100, 50], [100, 100], [200, 100]], ["U"]);
    expect(sharesTrunk(a, c)).toBe(false);
    expect(computeJunctions([a, c])).toEqual([]);
  });

  it("still flags accidental collinear overlap between unrelated edges", () => {
    const l = layoutArchitecture(fan());
    const bad = structuredClone(l);
    const e0 = bad.edges[0];
    // a foreign edge of another kind laid exactly on top of e0
    bad.edges.push({ ...structuredClone(e0), id: "ghost", from: "q", to: "p0", kind: "async", bundle: "ghost", trunks: [], label: undefined, labelRect: undefined, badgeAt: undefined, step: undefined });
    expect(runArchitectureQa(bad).some((i) => i.code === "edge-overlap")).toBe(true);
  });
});

describe("auto-split into overview + detail views", () => {
  const big = () => {
    const c = chain(6, 5);
    c.steps = [
      { n: 1, label: "Ingest" },
      { n: 2, label: "Store", anchor: "n5_1" },
    ] as ArchitectureLayoutInput["steps"];
    c.edges![0].step = 1;
    return c;
  };

  it("splits above the threshold, honours never / always and a custom threshold", () => {
    expect(shouldSplit(big())).toBe(true); // 30 nodes > 25
    expect(shouldSplit(big(), "never")).toBe(false);
    expect(shouldSplit(chain(3, 2), "auto")).toBe(false);
    expect(shouldSplit(chain(3, 2), "always")).toBe(true);
    expect(shouldSplit(big(), "auto", 40)).toBe(false);
    expect(planViews(big(), "never").length).toBe(1);
  });

  it("collapses each tier into one block with aggregated ×N edges", () => {
    const ov = buildOverview(big());
    expect(ov.info.kind).toBe("overview");
    expect(ov.input.nodes.length).toBe(6);
    expect(ov.input.nodes[0].label).toBe("Tier 0");
    const e01 = ov.input.edges!.filter((e) => e.from === "blk:t0" && e.to === "blk:t1");
    expect(e01.length).toBe(1);
    expect(e01[0].label).toContain("×5");
    const l = layoutArchitecture(ov.input);
    expect(errors(l)).toEqual([]);
    expect(aspect(l)).toBeGreaterThan(1.4);
    expect(aspect(l)).toBeLessThan(2.2);
  });

  it("builds detail views with dimmed stub cards for external endpoints", () => {
    const views = planViews(big());
    expect(views[0].info.key).toBe("overview");
    const details = views.filter((v) => v.info.kind === "detail");
    expect(details.length).toBeGreaterThanOrEqual(2);
    const covered = new Set(details.flatMap((v) => v.input.nodes.filter((n) => !n.stub).map((n) => n.id)));
    expect(covered.size).toBe(30);
    const withStubs = details.filter((v) => v.input.nodes.some((n) => n.stub));
    expect(withStubs.length).toBeGreaterThan(0);
    for (const v of withStubs) for (const g of v.input.groups!.filter((g) => g.stub)) expect(g.label).toMatch(/Tier/);
    for (const v of details) expect(errors(layoutArchitecture(v.input))).toEqual([]);
    expect(new Set(views.map((v) => v.info.key)).size).toBe(views.length);
  });

  it("distributes walkthrough steps to the views that contain them", () => {
    const views = planViews(big());
    const stepsOf = (v: (typeof views)[number]) => (v.input.steps ?? []).map((s) => s.n);
    expect(stepsOf(views[0])).toEqual([1, 2]);
    const details = views.filter((v) => v.info.kind === "detail");
    const all = details.flatMap(stepsOf).sort();
    expect(all).toContain(1);
    expect(all).toContain(2);
    for (const v of details) expect(stepsOf(v).length).toBeLessThanOrEqual(2);
  });

  it("compiler returns one view per file suffix with svg + drawio each", () => {
    const r = compileCloud({ ...big(), provider: "aws" } as never);
    expect(r.views.length).toBeGreaterThan(2);
    expect(r.views[0].info.key).toBe("overview");
    for (const v of r.views) {
      expect(v.source).toContain("<svg");
      expect(v.drawio).toContain("<mxfile");
    }
    expect(detailUnits(big()).length).toBe(r.views.length - 1);
  });
});
