import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { KIND_RAW } from "./registry.js";
import { KIND_COMPILERS } from "./registry.js";
import { branchKind, parseCardinality, reach } from "./graph-kinds.js";
import { compileAuthz, compileGantt, compileSequence, compileTimeline } from "./scene-kinds.js";
import { assignRanks, pavPlace, totalCrossings } from "../../layout/layered.js";
import { toDay } from "../../layout/gantt.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const examples = path.resolve(here, "../../../examples/types");
const parser = new XMLParser({ ignoreAttributes: false });
const load = (n: string) => JSON.parse(fs.readFileSync(path.join(examples, `${n}.json`), "utf8"));

const NEW_KINDS: Record<string, string> = {
  lineage: "create_data_lineage",
  workflow: "create_workflow_dag",
  dependency: "create_dependency_graph",
  knowledge: "create_knowledge_graph",
  flowchart: "create_flowchart",
  state: "create_state_machine",
  erd: "create_er_diagram",
  sequence: "create_sequence_diagram",
  authz: "create_authorization_matrix",
  gantt: "create_gantt",
  timeline: "create_timeline",
};

describe("group 2–4 diagram kinds (example specs)", () => {
  for (const [kind, tool] of Object.entries(NEW_KINDS))
    for (const size of ["s", "m"])
      it(`${kind}-${size}: schema, 0 QA errors, near 16:9, svg + draw.io parse`, () => {
        const spec = load(`${kind}-${size}`);
        expect(spec.tool).toBe(tool);
        const k = KIND_COMPILERS[tool];
        const r = KIND_RAW[tool]({ ...k.schema.parse(spec.input), outputs: ["svg", "drawio"] });
        const errors = r.qa.filter((q) => q.severity === "error");
        expect(errors, errors.map((e) => e.message).join("\n")).toEqual([]);
        const a = r.arch.width / r.arch.height;
        expect(a).toBeGreaterThanOrEqual(1.3);
        expect(a).toBeLessThanOrEqual(2.3);
        expect(r.arch.width).toBeLessThanOrEqual(3000);
        expect(r.source).toContain('xml:lang="zh-Hant"');
        expect(() => parser.parse(r.source)).not.toThrow();
        const doc = parser.parse(r.drawio!);
        const cells = doc.mxfile.diagram.mxGraphModel.root.mxCell as Array<Record<string, string>>;
        expect(cells.length).toBeGreaterThan(5);
        // no text below 12px except tracking captions / badges
        const sizes = [...r.source.matchAll(/font-size="([\d.]+)"/g)].map((m) => +m[1]);
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10);
      });

  it("every new tool is registered", () => {
    for (const tool of Object.values(NEW_KINDS)) {
      expect(KIND_COMPILERS[tool], tool).toBeTruthy();
      expect(KIND_RAW[tool], tool).toBeTruthy();
    }
    expect(KIND_COMPILERS.create_decision_diagram).toBeTruthy();
  });
});

describe("layered engine helpers", () => {
  it("assignRanks: longest path, cycles broken", () => {
    const { rank, dag } = assignRanks(["a", "b", "c", "d"], [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "a", to: "c" },
      { from: "c", to: "a" },
      { from: "c", to: "d" },
    ] as never);
    expect(rank.get("a")).toBe(0);
    expect(rank.get("b")).toBe(1);
    expect(rank.get("c")).toBe(2);
    expect(rank.get("d")).toBe(3);
    for (const [u, v] of dag) expect(rank.get(u)!).toBeLessThan(rank.get(v)!);
  });
  it("pavPlace keeps separation and stays near targets", () => {
    const p = pavPlace([0, 0, 0], [0, 10, 10], [1, 1, 1]);
    expect(p[1] - p[0]).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(p[2] - p[1]).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(Math.abs(p[1])).toBeLessThan(1e-6);
    expect(pavPlace([5, 50], [0, 10], [1, 1])).toEqual([5, 50]);
  });
  it("totalCrossings counts inversions", () => {
    const down = new Map([
      ["a", ["d"]],
      ["b", ["c"]],
    ]);
    expect(totalCrossings([["a", "b"], ["c", "d"]], down)).toBe(1);
    expect(totalCrossings([["a", "b"], ["d", "c"]], down)).toBe(0);
  });
  it("impact reach + branch / cardinality parsing", () => {
    const e = [
      { from: "web", to: "api" },
      { from: "api", to: "db" },
      { from: "job", to: "db" },
    ];
    expect([...reach(["db"], e, "up")].sort()).toEqual(["api", "job", "web"]);
    expect([...reach(["api"], e, "down")].sort()).toEqual(["db"]);
    expect(branchKind("Yes")).toBe("data");
    expect(branchKind("否")).toBe("auth");
    expect(branchKind("通過")).toBe("data");
    expect(branchKind("maybe")).toBeUndefined();
    expect(parseCardinality("1:N")).toEqual(["exactlyOne", "zeroOrMany"]);
    expect(parseCardinality("0..1:1..n")).toEqual(["zeroOrOne", "oneOrMany"]);
  });
  it("dependency impact dims unaffected nodes", () => {
    const r = KIND_RAW.create_dependency_graph(KIND_COMPILERS.create_dependency_graph.schema.parse(load("dependency-m").input));
    expect(r.arch.nodes.some((n) => n.emphasis === "changed")).toBe(true);
    expect(r.arch.nodes.some((n) => n.emphasis === "impacted")).toBe(true);
    expect(r.arch.nodes.some((n) => n.dim)).toBe(true);
  });
});

describe("fixed-form kinds", () => {
  it("sequence: activations, fragments, numbering, validation", () => {
    const base = {
      participants: [
        { id: "a", label: "Client", type: "actor" as const },
        { id: "b", label: "API" },
      ],
      messages: [
        { id: "m1", from: "a", to: "b", label: "GET /x" },
        { from: "b", to: "b", label: "check" },
        { id: "m3", from: "b", to: "a", label: "200", kind: "return" as const },
      ],
      fragments: [{ kind: "opt" as const, label: "cache miss", start: "m1", end: "m3" }],
    };
    const r = compileSequence(base);
    expect(r.qa.filter((q) => q.severity === "error")).toEqual([]);
    expect(r.source).toContain(">opt<");
    expect(r.source).toContain("[cache miss]");
    expect(r.source).toMatch(/>3</);
    expect(() => compileSequence({ ...base, messages: [{ from: "a", to: "zz", label: "x" }] })).toThrow(/not a participant/);
    expect(() => compileSequence({ ...base, fragments: [{ kind: "alt", start: "nope", end: 1 }] })).toThrow(/does not match/);
  });
  it("sequence: long conversations wrap into panels", () => {
    const participants = ["a", "b", "c"].map((id) => ({ id, label: id.toUpperCase() }));
    const messages = Array.from({ length: 60 }, (_, i) => ({ from: ["a", "b", "c"][i % 3], to: ["b", "c", "a"][i % 3], label: `step ${i + 1}`, kind: "async" as const }));
    const r = compileSequence({ participants, messages });
    expect(r.source).toContain("PANELS");
    const a = r.arch.width / r.arch.height;
    expect(a).toBeGreaterThan(1.2);
  });
  it("authz: wildcards, order, conditions footnotes", () => {
    const r = compileAuthz({
      roles: [
        { id: "u", label: "User" },
        { id: "adm", label: "Admin" },
      ],
      actions: ["read", "write"],
      resources: [{ id: "doc", label: "Docs" }],
      permissions: [
        { role: "*", resource: "*", effect: "allow" },
        { role: "u", resource: "doc", actions: ["write"], effect: "conditional", condition: "own documents" },
      ],
    });
    expect(r.qa.filter((q) => q.severity === "error")).toEqual([]);
    expect(r.source).toContain("own documents");
    expect(r.source).toContain("CONDITIONS");
    expect(() => compileAuthz({ roles: [{ id: "u", label: "U" }], resources: [{ id: "d", label: "D" }], permissions: [] })).toThrow(/no actions/);
  });
  it("gantt: after-scheduling, milestone, today", () => {
    expect(toDay("2026-01-02") - toDay("2026-01-01")).toBe(1);
    expect(() => toDay("2026-02-30")).toThrow();
    const r = compileGantt({
      tasks: [
        { id: "a", label: "Design", start: "2026-03-02", duration: "1w" },
        { id: "b", label: "Build", after: "a", duration: 10 },
        { id: "m", label: "Launch", after: "b", milestone: true },
      ],
      today: "2026-03-10",
    });
    expect(r.qa.filter((q) => q.severity === "error")).toEqual([]);
    expect(r.source).toContain("TODAY 3/10");
    expect(r.source).toContain("2026-03-02 → 2026-03-19");
    expect(() => compileGantt({ tasks: [{ id: "a", label: "A", after: "b" }, { id: "b", label: "B", after: "a" }] })).toThrow(/cycle/);
  });
  it("timeline: cards never overlap", () => {
    const events = Array.from({ length: 24 }, (_, i) => ({ date: `${2000 + Math.floor(i / 2)}-${(i % 2) * 6 + 1}`, label: `Event ${i + 1}`, description: "something happened here" }));
    const r = compileTimeline({ events });
    expect(r.qa.filter((q) => q.severity === "error")).toEqual([]);
  });
});
