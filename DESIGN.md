# Design System

`diagram-mcp` aims for **dark-tech reference architecture** quality (HUD tiers, monoline icons, orthogonal edges) — not default Graphviz/Mermaid/D2 chrome.

Quality bar: `docs/reference-aws-webstore.png` (local only — never committed).

## Engines

| Kind | Engine | Notes |
|---|---|---|
| Cloud architecture | **SVG grid** (`src/layout/`) | Deterministic columns/tiers, orthogonal routing |
| Microservice | **SVG grid** | Same engine; `steps` + monoline icons |
| Flowchart / decision / sequence | Mermaid | Unchanged |
| Dependency graph | Graphviz DOT | Unchanged |
| Escape hatch | `render_diagram` | Raw D2 / Mermaid / DOT |

## Architecture SVG (dark tech default)

- Canvas `#0B1020` + subtle dot grid + soft radial glow
- Cards: glassy dark fill, 1px role-accent border, soft glow, rounded 12px
- Icons: **one monoline set** (`src/layout/icons.ts`) — never brand logos (React/Go/…)
- Tier frames: dashed HUD with corner brackets; label `01 / EDGE` in monospace caps
- Edges: orthogonal with rounded bends; sync cyan · async dashed violet · data green; white/dark pills for labels; step badges = accent circle + **white bold** numerals
- Right column: Steps panel (aligned to diagram top) + Legend docked below
- Title 30px bold Inter; card title 15 semibold; subtitle 11 mono muted
- Light/presentation themes remain available via `theme: "light" | "presentation"`

## Layout API

```ts
columns?: string[][]   // e.g. [["clients","edge"],["bff","app"],["data","ext"]]
steps?: { n, label, description?, anchor? }[]
edges?: { from, to, label?, kind?, step? }[]  // from/to may be group ids
```

Grid rules: uniform card size per tier, aligned gutters, docked sidebar, no auto-layout randomness. Routing clearance takes priority over a fixed aspect ratio.

### Architecture edge routing

- Ports are counted per endpoint/side and ordered by the opposite endpoint's position, not input edge order. Cards grow for high-degree nodes.
- `src/layout/routing.ts` builds a compressed rectilinear visibility grid and uses direction-aware A*. Inflated cards and tier headers are hard obstacles; endpoint escape stubs preserve arrow approach directions.
- Length and bends have a cost; crossings, overlapping tracks, and parallel lines closer than 10px carry larger penalties. Up to three rip-up/reroute passes accept only improvements in the global score.
- Labels and badges are collision-checked as rectangles and reserve space during routing. A label with a step number is packed together; later routes avoid both. They render after all lines and cards.
- Gutters and perimeter lanes grow with traffic. If routing or annotation placement fails, layout retries with wider gaps (1×, 1.75×, 3×), then throws `RoutingCapacityError`; it never falls back to drawing through cards or accepting shared line segments.
- Crossings cannot always be eliminated with fixed node positions and ports. Canvas-colored line halos distinguish crossings from junctions. Edge strokes do not use bounding-box glow filters, which can hide perfectly horizontal/vertical paths.
- `LayoutResult.routing` and SVG `<metadata id="routing-quality">` expose crossings, collinear overlap length, weighted close-parallel length, total length, and bends. Preferred track spacing is a soft constraint, not a universal minimum-distance guarantee.

## Themes

| Theme | Use |
|---|---|
| `dark` (default for architecture) | Dark tech showcase |
| `blueprint` | Same dark tech treatment |
| `light` / `presentation` | Clean light docs variant |

## Semantic roles → accents / icons

| Role | Accent (dark) | Default mono icon |
|---|---|---|
| compute | cyan | server |
| data | green | database |
| network | sky | globe |
| security | pink | shield / lock |
| gateway | amber | gateway |
| queue | violet | queue |
| storage | amber | storage |
| observability | pink | chart |
| external | slate | user / browser |

## Verification

- Unit tests: input-order stability, high-degree ports, dense/reverse/parallel/self-loop connections, exact card clearance, label/badge collisions, impossible routes, and raster visibility of straight edges (`src/layout/grid.test.ts`)
- Visual QA: full-size + 1600px-wide reads for showcase architecture PNGs
- Architecture-only showcase regeneration: `npm run showcase -- --architecture-only`
