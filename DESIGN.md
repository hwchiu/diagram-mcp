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

Grid rules: uniform card size per tier, aligned gutters, ~16:9 with docked sidebar, no auto-layout randomness.

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

- Unit tests: deterministic layout, no card overlaps, edge clearance, SVG structure (`src/layout/grid.test.ts`)
- Visual QA: full-size + 1600px-wide reads for showcase architecture PNGs
