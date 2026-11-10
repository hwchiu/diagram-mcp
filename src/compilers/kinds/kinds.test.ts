import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { compileComponent, compileDataflow, compileDeployment, compileNetwork, compileSystemContext } from "./grid-kinds.js";
import { compileSwimlane } from "./swimlane.js";
import { componentSchema, dataflowSchema, deploymentSchema, networkSchema, swimlaneSchema, systemContextSchema } from "../../tools/kindSchemas.js";
import { cardMetrics } from "../../layout/shapes.js";
import { compactRanks, flowRanks } from "../../layout/swimlane.js";
import { collapseFanIn, splitDenseZones } from "../../layout/split.js";
import { wrapBalanced } from "../../layout/text.js";
import type { CompiledArchitecture } from "../architecture.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const examples = path.resolve(here, "../../../examples/types");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const KINDS: Record<string, { schema: { parse: (x: unknown) => any }; compile: (x: any) => CompiledArchitecture; tool: string }> = {
  context: { schema: systemContextSchema, compile: compileSystemContext, tool: "create_system_context" },
  component: { schema: componentSchema, compile: compileComponent, tool: "create_component_diagram" },
  deployment: { schema: deploymentSchema, compile: compileDeployment, tool: "create_deployment_topology" },
  network: { schema: networkSchema, compile: compileNetwork, tool: "create_network_topology" },
  dataflow: { schema: dataflowSchema, compile: compileDataflow, tool: "create_dataflow_trust_boundary" },
  swimlane: { schema: swimlaneSchema, compile: compileSwimlane, tool: "create_swimlane" },
};

const parser = new XMLParser({ ignoreAttributes: false });

describe("group-1 diagram kinds (example specs)", () => {
  for (const [kind, k] of Object.entries(KINDS)) {
    for (const size of ["s", "m"]) {
      const file = path.join(examples, `${kind}-${size}.json`);
      it(`${kind}-${size}: schema, 0 QA errors, poster aspect, draw.io`, () => {
        const spec = JSON.parse(fs.readFileSync(file, "utf8"));
        expect(spec.tool).toBe(k.tool);
        const input = k.schema.parse(spec.input);
        const r = k.compile({ ...input, outputs: ["svg", "drawio"] });
        const errors = r.qa.filter((q) => q.severity === "error");
        expect(errors, errors.map((e) => e.message).join("\n")).toEqual([]);
        const a = r.arch.width / r.arch.height;
        expect(a).toBeGreaterThanOrEqual(1.4);
        expect(a).toBeLessThanOrEqual(2.2);
        // every labelled flow got its pill
        for (const e of r.arch.edges) if (e.label) expect(e.labelRect, `${e.from}→${e.to}`).toBeTruthy();
        expect(r.source).toContain('xml:lang="zh-Hant"');
        expect(r.drawio).toBeTruthy();
        const doc = parser.parse(r.drawio!);
        const cells = doc.mxfile.diagram.mxGraphModel.root.mxCell as Array<Record<string, string>>;
        expect(cells.filter((c) => c["@_edge"] === "1").length).toBe(r.arch.edges.length);
      });
    }
  }

  it("each kind has its own notation", () => {
    const load = (n: string) => JSON.parse(fs.readFileSync(path.join(examples, `${n}.json`), "utf8")).input;
    const ctx = compileSystemContext(load("context-s"));
    expect(ctx.arch.nodes.some((n) => n.shape === "person")).toBe(true);
    expect(ctx.arch.nodes.some((n) => n.shape === "system")).toBe(true);
    expect(ctx.arch.tiers.some((t) => t.kind === "boundary")).toBe(true);
    const dfd = compileDataflow(load("dataflow-m"));
    expect(dfd.arch.tiers.filter((t) => t.kind === "trust").length).toBeGreaterThanOrEqual(2);
    expect(dfd.arch.nodes.filter((n) => n.shape === "process").every((n) => /^P\d+$/.test(n.tag ?? ""))).toBe(true);
    expect(dfd.arch.edges.some((e) => (e.crossings?.length ?? 0) > 0)).toBe(true);
    expect(dfd.source).toContain("[PII]");
    const dep = compileDeployment(load("deployment-m"));
    expect(dep.arch.nodes.some((n) => (n.replicas ?? 0) > 1)).toBe(true);
    const sw = compileSwimlane(load("swimlane-m"));
    expect(sw.arch.tiers.every((t) => t.kind === "lane" && t.laneHeader)).toBe(true);
    expect(sw.arch.nodes.some((n) => n.shape === "decision")).toBe(true);
    expect(sw.drawio).toContain("swimlane");
    const net = compileNetwork(load("network-m"));
    expect(net.arch.tiers.some((t) => /\d+\.\d+\.\d+\.\d+\/\d+/.test(t.tag ?? ""))).toBe(true);
  });
});

describe("card shapes", () => {
  const base = { cardW: 220, cardH: 64, iconTextX: 59 };
  it("system cards are wider and taller, persons leave room for the head", () => {
    const sys = cardMetrics({ id: "s", label: "Insight", shape: "system" }, base);
    const card = cardMetrics({ id: "c", label: "Insight" }, base);
    const person = cardMetrics({ id: "p", label: "User", shape: "person" }, base);
    expect(sys.w).toBeGreaterThan(card.w);
    expect(sys.h).toBeGreaterThan(card.h);
    expect(person.top).toBeGreaterThan(0);
  });
  it("descriptions wrap to at most three lines", () => {
    const m = cardMetrics({ id: "x", label: "X", description: "很長的描述".repeat(20) }, base);
    expect(m.desc.length).toBe(3);
    expect(m.desc[2].endsWith("…")).toBe(true);
  });
  it("replicas add a stack offset", () => {
    const a = cardMetrics({ id: "a", label: "API", shape: "pod" }, base);
    const b = cardMetrics({ id: "b", label: "API", shape: "pod", replicas: 3 }, base);
    expect(b.h).toBeGreaterThan(a.h);
    expect(b.textRoom).toBeLessThan(a.textRoom);
  });
});

describe("CJK wrapping", () => {
  it("breaks after punctuation and never starts a line with it", () => {
    const f = { font: "sans" as const, size: 12, weight: 400 };
    const ls = wrapBalanced("企業徵信工作台；查詢公司資料、產生報告並控管存取權限", f, 190);
    expect(ls.length).toBe(2);
    for (const l of ls.slice(1)) expect(/^[；，、。]/.test(l)).toBe(false);
    expect(/[；、]$/.test(ls[0])).toBe(true);
  });
});

describe("swimlane ranks", () => {
  const nodes = ["a", "b", "c", "d"].map((id, i) => ({ id, label: id, group: i % 2 ? "L2" : "L1" }));
  const edges = [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "c", to: "d" },
    { from: "d", to: "b" }, // loop back
  ];
  it("strict ranks follow the flow, loops do not explode", () => {
    const r = flowRanks(nodes, edges);
    expect(r.get("a")).toBe(0);
    expect(r.get("b")!).toBeLessThan(r.get("c")!);
    expect(r.get("c")!).toBeLessThan(r.get("d")!);
  });
  it("compact ranks never move a step before its predecessor", () => {
    const r = compactRanks(nodes, edges, ["L1", "L2"]);
    for (const e of edges.slice(0, 3)) expect(r.get(e.to)!).toBeGreaterThanOrEqual(r.get(e.from)!);
    expect(Math.max(...r.values())).toBeLessThanOrEqual(Math.max(...flowRanks(nodes, edges).values()));
  });
});

describe("detail-view density", () => {
  it("collapses ≥3 cards hitting one stub into a zone edge ×N", () => {
    const focus = ["a", "b", "c", "d"].map((id) => ({ id, label: id, group: "z" }));
    const cross = [
      ...["a", "b", "c"].map((id) => ({ from: id, to: "stub:db", kind: "data" as const })),
      { from: "d", to: "stub:db", kind: "async" as const },
      { from: "stub:gw", to: "a", kind: "sync" as const },
    ];
    const out = collapseFanIn(cross, focus, ["z"]);
    expect(out).toContainEqual(expect.objectContaining({ from: "z", to: "stub:db", kind: "data", label: "×3" }));
    expect(out.filter((e) => e.to === "stub:db").length).toBe(2);
    expect(out).toContainEqual(expect.objectContaining({ from: "stub:gw", to: "a" }));
  });
  it("splits a zone above 12 cards into connected sub-groups", () => {
    const nodes = Array.from({ length: 16 }, (_, i) => ({ id: `n${i}`, label: `N${i}`, group: "z" }));
    const edges = nodes.filter((n) => n.id !== "n0" && n.id !== "n8").map((n) => ({ from: Number(n.id.slice(1)) < 8 ? "n0" : "n8", to: n.id }));
    const { subGroups, subOf } = splitDenseZones([{ id: "z", label: "Zone" }], nodes, edges);
    expect(subGroups.length).toBe(2);
    expect(subGroups.every((g) => g.parent === "z")).toBe(true);
    expect(subOf.get("n1")).toBe(subOf.get("n0"));
    expect(subOf.get("n12")).toBe(subOf.get("n8"));
    // small zones are left alone
    expect(splitDenseZones([{ id: "y", label: "Y" }], nodes.slice(0, 5).map((n) => ({ ...n, group: "y" })), []).subGroups).toEqual([]);
  });
});
