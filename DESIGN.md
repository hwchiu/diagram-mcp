# Design System

`diagram-mcp` aims for **AWS reference-architecture quality** in a dark, technical style: nested HUD tiers, monoline icons,
obstacle-aware orthogonal edges, numbered walkthroughs, and no default Graphviz/Mermaid/D2 chrome.

Reference images used during development stay local only — third-party samples (`docs/reference-aws-*`, etc.) are **never committed**.

## Engines

| Kind | Engine | Notes |
|---|---|---|
| Cloud architecture | **SVG grid** (`src/layout/`) | Deterministic nested layout, A* orthogonal router, QA, draw.io |
| Microservice | **SVG grid** | Same engine |
| Flowchart / decision / sequence | Mermaid | Unchanged |
| Dependency graph | Graphviz DOT | Unchanged |
| Escape hatch | `render_diagram` | Raw D2 / Mermaid / DOT |

Pipeline: `compileArchitecture` → `layoutArchitecture` (`grid.ts`, calls `routeEdges` in `router.ts`) →
`renderArchitectureSvg` (`svg.ts`) + optional `renderArchitectureDrawio` (`drawio.ts`) → `runArchitectureQa` (`qa.ts`) → PNG via sharp.

## Visual language (Cocoon-AI, MIT)

Adapted from [Cocoon-AI/architecture-diagram-generator](https://github.com/Cocoon-AI/architecture-diagram-generator):

- Canvas `#020617` (slate-950) with a 40px grid of `#1e293b` lines and a soft vignette; content sits on a translucent panel
- Typography: **JetBrains Mono** everywhere (title 26/700, card label 14/600, subtitle 11, tier label 11/600 caps +0.14em);
  walkthrough body text Inter 12
- Cards 62px high, uniform width per diagram (measured from the longest label, 184–244px), opaque base + role tint
  (13% fill, role-colored 1px stroke), 34px icon box
- Tiers: dashed frames with HUD corner brackets, `● 01 / EDGE` label; frame color by `kind`
  (region amber, vpc violet, cluster cyan, namespace emerald, subnet sky, security rose, external slate)
- Edges: sync cyan solid · async violet dashed · data emerald · auth rose dotted; glow underlay; rounded bends;
  labels on dark pills on straight segments
- Step badges: amber `#fbbf24` circles with dark numerals, placed near the source end of their edge
- Walkthrough: right panel or bottom card grid, chosen automatically so the canvas aspect is closest to 1.6;
  legend lists only the edge kinds actually used
- Light theme (`light` / `presentation`) mirrors the same structure on a white canvas

### Role colors (dark)

| Role | Stroke | Default icon |
|---|---|---|
| client | `#22d3ee` cyan | user / browser |
| network | `#38bdf8` sky | globe |
| gateway | `#818cf8` indigo | gateway |
| security | `#fb7185` rose | shield / key |
| compute | `#34d399` emerald | server / container |
| data | `#a78bfa` violet | database |
| queue | `#fb923c` orange | queue / stream |
| storage | `#fbbf24` amber | storage |
| observability | `#f472b6` pink | chart |
| external | `#94a3b8` slate | cloud |

## Layout

```ts
columns?: string[][]       // tier ids per column, stacked top→bottom
bottomRow?: string[]       // full-width band under the columns
groups[].parent / cols / layout ("row" | "column") / kind
steps?: { n, label, description?, anchor? }[]
stepsPosition?: "auto" | "right" | "bottom"
edges?: { from, to, label?, kind?: "sync"|"async"|"data"|"auth", step? }   // from/to may be group ids
rows?: string[][][]        // explicit rows of column stacks (disables auto-wrap)
wrap?: "auto" | "never"
split?: "auto" | "never" | "always"; splitThreshold?: number   // default 25 nodes
outputs?: ("svg" | "png" | "drawio")[]                         // drawio on by default
```

### Auto-wrap planner (`grid.ts`)

The planner treats the spec as a list of *column stacks* (zones / tiers). It enumerates every partition of the stacks
into 1–3 rows (order preserved), every per-zone column-count variant, and every `columnCandidates` entry, and scores each by
`6·aspectPenalty + 6·widthPenalty + 1.2·waste + estimatedEdgeLength + 0.08·(rows−1) + 0.03·variant`. Aspect target is
1.4–2.0 (ideal 1.72); the width penalty keeps the canvas ≤ ~1920px so the smallest font (12px) stays ≥ ~10px at 1600px.
A retry ladder then tries (spacing × plan-rank) — `[1,0] [1,1] [1.3,0] [1,2] …` — and keeps the attempt with the fewest
unplaced labels/badges (a leader-parked label costs 0.1), penalising width > 2040 and aspect outside 1.4–2.2.
Explicit `rows`, `columns`, `bottomRow` and `groups.cols` are always respected. Generated detail views may also reorder
cards inside a zone by neighbour barycentre to cut crossings (`reorder: true`).

### Split views (`split.ts`)

Pure model → model transform, independent of the diagram domain: it only knows zones (groups with `parent`), nodes,
edges and steps, so future diagram types (deployment, network zones, DFD, swimlanes…) can reuse it.

- `shouldSplit`: `split` mode, ≥ 2 root zones, `nodes > splitThreshold`.
- Overview: each leaf root zone → one block `blk:<id>` ("N components", members listed); zones with children keep
  their frame with one block per child. Edges are aggregated per block pair (dominant kind, `×N` label, step kept).
- Detail units: regions / zones with children / zones with ≥ 6 nodes stand alone; small neighbours are merged up to 12
  nodes. Each detail view keeps the focus zone(s) intact and adds dimmed stub cards (`stub: true`) grouped by their home
  zone — upstream stubs to the left, downstream to the right; > 5 stubs from one zone collapse into a single zone stub.
- Steps are distributed: overview keeps all; a detail view keeps steps whose edge or anchor lives in it.
- Files: `<name>.overview.*`, `<name>.<zone-slug>.*`; the MCP preview is the overview.

Rules: 8px-based tokens (`grid.ts`), uniform card size, column heights equalized, gutters widened only where a labelled
edge needs room for its pill, tier labels shifted out of straight vertical edge corridors. Text width is *measured*
(`text.ts`: JetBrains Mono 0.6em/glyph, Inter advance table baked from the font, CJK 1em) and ellipsized if needed.

## Router

`router.ts` — sparse orthogonal visibility grid (lanes 14px from cards, 10px from frames, 6px from labels) and A* over
(point × heading). Costs: bend 70, travelling through a foreign tier 2.5×length, overlapping another edge 400+4×length,
crossing 45. Edges carry *trunk keys* (same target zone, same source, same port bundle; labelled and intra-zone edges get
none); edges that share a key and a kind get a 0.7× discount for running on each other's track, so fan-in/fan-out
collapses into one trunk in the gutter. `computeJunctions` walks every path and drops a dot wherever it joins or leaves
shared track. Distinct trunks are kept apart by the overlap cost; QA ignores overlaps between trunk mates only. Pass 1 picks sides,
ports are then spread per side, pass 2 routes for real, two rip-up rounds re-route the worst offenders, and tiny jogs
are snapped away. Cards are hard obstacles. Labels are placed first (on the edge's own straight segments, never over
another edge), then badges; a stepped label carries its badge inside the pill. If no on-line slot exists, the pill is
parked in the nearest free spot with a dotted leader to the line.

## Structural QA

`qa.ts` runs on every render and in `npm test`. See the README table for the full code list: card overlap/spacing,
out-of-bounds, measured text overflow, edges through cards / labels, label & badge collisions, dangling edges
(including "stops on a tier frame" when a node was the target), diagonal/jog/unrouted edges, overlaps and crossing
budget, missing labels, floating or ambiguous badges, aspect ratio, whitespace balance, and step consistency.
Every shipped architecture example must have **0 errors and 0 warnings**; the example scripts fail on any QA error.

## draw.io backend

`drawio.ts` emits an `mxfile` whose geometry is taken from the same `LayoutResult` as the SVG: tier containers with
nested parents (relative geometry), node cells with blended fills + embedded SVG icons, edges with
`edgeStyle=orthogonalEdgeStyle`, fixed exit/entry points and the router's waypoints, badges, legend and walkthrough cells.

## Self-review loop

After rendering, read each architecture PNG at full size and downscaled to ~1600px wide; check tangles, label
placement, empty bands and tier balance; then adjust column / node order in the spec and re-render.
Scratch previews live in `tmp/` (gitignored).
