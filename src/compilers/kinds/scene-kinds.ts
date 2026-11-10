/**
 * Fixed-form notations (sequence, authorization matrix, gantt, timeline) drawn
 * through the scene graph instead of the layered / grid layout.
 */
import type { z } from "zod";
import type { CompiledArchitecture } from "../architecture.js";
import { chromeLayout, renderSceneDrawio, renderSceneSvg, runSceneQa, type Scene } from "../../layout/scene.js";
import { layoutSequence } from "../../layout/sequence.js";
import type { LegendItem } from "../../layout/types.js";
import type { authzSchema, ganttSchema, sequenceSchema, timelineSchema } from "../../tools/kindSchemas.js";
import { layoutGantt, toDay, fmtDay, type GanttTask } from "../../layout/gantt.js";
import { layoutTimeline } from "../../layout/timeline.js";
import { layoutAuthz, type Effect } from "../../layout/authz.js";

export function sceneResult(scene: Scene, meta: { theme?: string; outputs?: string[] }, qaOpts: { aspect?: [number, number] } = {}): CompiledArchitecture {
  const theme = meta.theme ?? "dark";
  const source = renderSceneSvg(scene, theme);
  const drawio = !meta.outputs || meta.outputs.includes("drawio") ? renderSceneDrawio(scene, theme) : undefined;
  const qa = runSceneQa(scene, qaOpts);
  const arch = chromeLayout(scene);
  const view = { info: { kind: "full" as const, key: "" }, source, drawio, qa, arch };
  return { engine: "svg", source, theme, drawio, qa, arch, views: [view] };
}

export function compileSequence(input: z.infer<typeof sequenceSchema>): CompiledArchitecture {
  const ids = new Set(input.participants.map((p) => p.id));
  const seen = new Set<string>();
  for (const p of input.participants) {
    if (seen.has(p.id)) throw new Error(`create_sequence_diagram: duplicate participant id "${p.id}"`);
    seen.add(p.id);
  }
  const known = [...ids].join(", ");
  input.messages.forEach((m, i) => {
    const type = m.type ?? "message";
    if (type === "message") {
      for (const k of ["from", "to"] as const) {
        if (!m[k]) throw new Error(`create_sequence_diagram: messages[${i}] needs "${k}"`);
        if (!ids.has(m[k]!)) throw new Error(`create_sequence_diagram: messages[${i}].${k} "${m[k]}" is not a participant. Known: ${known}`);
      }
    } else if (type === "note") {
      if (!m.over?.length) throw new Error(`create_sequence_diagram: note messages[${i}] needs over: [participant ids]`);
      for (const o of m.over) if (!ids.has(o)) throw new Error(`create_sequence_diagram: note messages[${i}] over "${o}" is not a participant. Known: ${known}`);
    }
  });
  const ms = input.messages.filter((m) => (m.type ?? "message") === "message");
  const legend: LegendItem[] = [
    { label: "Sync call", mark: "syncmsg" },
    ...(ms.some((m) => m.kind === "async") ? [{ label: "Async message", mark: "asyncmsg" as const }] : []),
    ...(ms.some((m) => m.kind === "return") ? [{ label: "Return", mark: "return" as const }] : []),
    ...(ms.some((m) => m.kind === "error") ? [{ label: "Error", kind: "auth" as const }] : []),
    ...(input.activations !== "none" ? [{ label: "Activation", mark: "activation" as const }] : []),
    ...(input.messages.some((m) => m.type === "note") ? [{ label: "Note", mark: "note" as const }] : []),
    ...(input.fragments?.length ? [{ label: "Fragment (alt / opt / loop / par)", mark: "fragment" as const }] : []),
  ];
  const scene = layoutSequence({ ...input, items: input.messages }, { kind: "sequence", caption: "SEQUENCE DIAGRAM · UML 2" }, legend);
  return sceneResult(scene, input);
}

export function compileAuthz(input: z.infer<typeof authzSchema>): CompiledArchitecture {
  const T = "create_authorization_matrix";
  const roles = new Set<string>();
  for (const r of input.roles) {
    if (roles.has(r.id)) throw new Error(`${T}: duplicate role id "${r.id}"`);
    roles.add(r.id);
  }
  const res = new Map<string, string[]>();
  for (const r of input.resources) {
    if (res.has(r.id)) throw new Error(`${T}: duplicate resource id "${r.id}"`);
    const acts = r.actions ?? input.actions;
    if (!acts?.length) throw new Error(`${T}: resource "${r.id}" has no actions — set resources[].actions or top-level actions`);
    res.set(r.id, acts);
  }
  const conds: string[] = [];
  const grid = new Map<string, { effect: Effect; note?: number }>();
  const def: Effect = input.default === "deny" ? "deny" : "none";
  for (const [i, p] of input.permissions.entries()) {
    if (p.role !== "*" && !roles.has(p.role)) throw new Error(`${T}: permissions[${i}].role "${p.role}" is not a role. Known: ${[...roles].join(", ")}`);
    if (p.resource !== "*" && !res.has(p.resource)) throw new Error(`${T}: permissions[${i}].resource "${p.resource}" is not a resource. Known: ${[...res.keys()].join(", ")}`);
    let note: number | undefined;
    if (p.effect === "conditional" && p.condition) {
      const k = conds.indexOf(p.condition);
      note = k >= 0 ? k + 1 : conds.push(p.condition);
    }
    for (const rl of p.role === "*" ? [...roles] : [p.role])
      for (const rs of p.resource === "*" ? [...res.keys()] : [p.resource]) {
        const all = res.get(rs)!;
        const acts = !p.actions || p.actions === "*" ? all : p.actions;
        for (const a of acts) {
          if (!all.includes(a)) {
            if (p.resource === "*") continue;
            throw new Error(`${T}: permissions[${i}] action "${a}" is not an action of "${rs}" (${all.join(", ")})`);
          }
          grid.set(`${rl}\u0000${rs}\u0000${a}`, { effect: p.effect, note });
        }
      }
  }
  const effects = new Set<Effect>();
  for (const r of input.roles) for (const [rs, acts] of res) for (const a of acts) effects.add(grid.get(`${r.id}\u0000${rs}\u0000${a}`)?.effect ?? def);
  const legend: LegendItem[] = [
    ...(effects.has("allow") ? [{ label: "Allow", mark: "allow" as const }] : []),
    ...(effects.has("deny") ? [{ label: "Deny", mark: "deny" as const }] : []),
    ...(effects.has("conditional") ? [{ label: "Conditional (see note)", mark: "conditional" as const }] : []),
    ...(effects.has("none") ? [{ label: "Not granted", mark: "na" as const }] : []),
  ];
  const scene = layoutAuthz(
    {
      title: input.title,
      subtitle: input.subtitle,
      theme: input.theme,
      roles: input.roles,
      resources: input.resources.map((r) => ({ id: r.id, label: r.label, actions: res.get(r.id)! })),
      cell: (role, rs, a) => grid.get(`${role}\u0000${rs}\u0000${a}`) ?? { effect: def, implicit: true },
      conditions: conds,
      orientation: input.orientation,
    },
    { kind: "authz", caption: "AUTHORIZATION MATRIX · RBAC" },
    legend,
  );
  return sceneResult(scene, input);
}

export function compileGantt(input: z.infer<typeof ganttSchema>): CompiledArchitecture {
  const T = "create_gantt";
  const groups = input.groups ?? [];
  const gids = new Set(groups.map((g) => g.id));
  const byId = new Map(input.tasks.map((x) => [x.id, x]));
  if (byId.size !== input.tasks.length) throw new Error(`${T}: duplicate task id`);
  const date = (s: string, where: string) => {
    try {
      return toDay(s);
    } catch (e) {
      throw new Error(`${T}: ${where}: ${(e as Error).message}`);
    }
  };
  const dur = (d: number | string | undefined): number | undefined => {
    if (d == null) return undefined;
    if (typeof d === "number") return d;
    const m = /^(\d+(?:\.\d+)?)\s*([dwm])$/i.exec(d)!;
    return Math.round(+m[1] * ({ d: 1, w: 7, m: 30 } as Record<string, number>)[m[2].toLowerCase()]);
  };
  const done = new Map<string, { start: number; end: number }>();
  const visiting = new Set<string>();
  const resolve = (id: string): { start: number; end: number } => {
    if (done.has(id)) return done.get(id)!;
    const x = byId.get(id)!;
    if (visiting.has(id)) throw new Error(`${T}: dependency cycle through "${id}"`);
    visiting.add(id);
    const after = x.after == null ? [] : Array.isArray(x.after) ? x.after : [x.after];
    for (const a of after) if (!byId.has(a)) throw new Error(`${T}: task "${id}" depends on unknown task "${a}". Known: ${[...byId.keys()].join(", ")}`);
    let start = x.start ? date(x.start, `task "${id}" start`) : undefined;
    if (start == null && after.length) start = Math.max(...after.map((a) => resolve(a).end));
    let end = x.end ? date(x.end, `task "${id}" end`) + 1 : undefined;
    const d = dur(x.duration);
    if (start == null && end != null && d != null) start = end - d;
    if (start == null) throw new Error(`${T}: task "${id}" needs start (or after / end + duration)`);
    if (x.milestone) end = start;
    else if (end == null) end = start + (d ?? 1);
    if (end < start) throw new Error(`${T}: task "${id}" ends (${fmtDay(end - 1)}) before it starts (${fmtDay(start)})`);
    visiting.delete(id);
    const r = { start, end };
    done.set(id, r);
    return r;
  };
  const tasks: GanttTask[] = input.tasks.map((x) => {
    if (x.group && !gids.has(x.group)) throw new Error(`${T}: task "${x.id}" references unknown group "${x.group}". Known: ${[...gids].join(", ") || "(none)"}`);
    const r = resolve(x.id);
    return { id: x.id, label: x.label, start: r.start, end: r.end, group: x.group, progress: x.progress, milestone: x.milestone, critical: x.critical, owner: x.owner, after: x.after == null ? [] : Array.isArray(x.after) ? x.after : [x.after] };
  });
  const legend: LegendItem[] = [
    { label: "Task (fill = progress)", mark: "bar", role: "client" },
    ...(tasks.some((x) => x.milestone) ? [{ label: "Milestone", mark: "milestone" as const }] : []),
    ...(tasks.some((x) => x.critical) ? [{ label: "Critical", mark: "critical" as const }] : []),
    ...(tasks.some((x) => x.after.length) ? [{ label: "Finish → start dependency", kind: "default" as const }] : []),
    ...(input.today ? [{ label: "Today", mark: "today" as const }] : []),
  ];
  const scene = layoutGantt(
    { title: input.title, subtitle: input.subtitle, theme: input.theme, groups, tasks, today: input.today ? date(input.today, "today") : undefined, scale: input.scale },
    { kind: "gantt", caption: "GANTT CHART · SCHEDULE" },
    legend,
  );
  return sceneResult(scene, input);
}

function looseDay(s: string, where: string, end = false): number {
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(s.trim());
  if (!m) throw new Error(`create_timeline: ${where}: bad date "${s}" (use YYYY, YYYY-MM or YYYY-MM-DD)`);
  const y = +m[1];
  const mo = m[2] ? +m[2] - 1 : end ? 11 : 0;
  if (mo < 0 || mo > 11) throw new Error(`create_timeline: ${where}: bad month in "${s}"`);
  if (m[3]) return Math.round(Date.UTC(y, mo, +m[3]) / 86400000);
  if (end) return Math.round(Date.UTC(y, mo + 1, 1) / 86400000) - 1;
  return Math.round(Date.UTC(y, mo, 1) / 86400000);
}

export function compileTimeline(input: z.infer<typeof timelineSchema>): CompiledArchitecture {
  const events = input.events.map((e, i) => ({ day: looseDay(e.date, `events[${i}]`), dateLabel: e.date, label: e.label, description: e.description, role: e.role, milestone: e.milestone }));
  const eras = (input.eras ?? []).map((e, i) => {
    const start = looseDay(e.start, `eras[${i}].start`);
    const end = looseDay(e.end, `eras[${i}].end`, true);
    if (end < start) throw new Error(`create_timeline: era "${e.label}" ends before it starts`);
    return { start, end, label: e.label, role: e.role };
  });
  const legend: LegendItem[] = [
    { label: "Event", mark: "event", role: "client" },
    ...(input.events.some((e) => e.milestone) ? [{ label: "Milestone (filled)", mark: "event" as const, role: "storage" as const }] : []),
    ...(eras.length && input.scale !== "even" ? [{ label: "Era / period", mark: "era" as const, role: "gateway" as const }] : []),
  ];
  const scene = layoutTimeline({ title: input.title, subtitle: input.subtitle, theme: input.theme, events, eras, scale: input.scale }, { kind: "timeline", caption: "TIMELINE · EVENTS & ERAS" }, legend);
  return sceneResult(scene, input);
}
