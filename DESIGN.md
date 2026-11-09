# Design System

`diagram-mcp` aims for **AWS reference-architecture / SaaS-docs** quality — not default Graphviz or Mermaid chrome.

Quality bar: `docs/reference-aws-webstore.png` and `docs/reference-aws-order-workflow.jpg`.

## Themes

| Theme | Canvas | Character |
|---|---|---|
| `light` | `#F7F8FA` | Soft editorial docs |
| `dark` | `#0B1220` | Night-mode engineering |
| `presentation` | `#FFFFFF` | Conference slides / bright posters |
| `blueprint` | `#0A1628` | Cyan-on-navy schematic |

Tokens live in `src/design/themes.ts`.

## Semantic node roles

| Role | Use for | Typical accent |
|---|---|---|
| `compute` | Services, workers | Blue |
| `data` | Databases, indexes | Emerald |
| `network` | CDN, mesh, DNS | Sky |
| `security` | Auth, WAF, vault | Red |
| `external` | Clients, 3rd parties | Slate |
| `queue` | Kafka, SQS, bus | Violet |
| `gateway` | API GW, BFF, ALB | Orange |
| `storage` | Object / blob | Amber |
| `observability` | Metrics, traces, logs | Pink |

## Typography

- Family: Inter / SF Pro / Helvetica Neue (IBM Plex Sans for blueprint)
- Hierarchy: diagram title (top-left) ≫ group header ≫ node label ≫ edge label
- Node cards: **icon above label**, fixed ~140×110, label never overlaps icon
- No multi-line subtitles on architecture cards (they collide with icons)

## Layout rules (AWS reference style)

1. **Cloud / microservice → D2 + TALA** (orthogonal routing). Fallback: ELK / dagre via `layout`.
2. **Tiers = dashed tinted boundary boxes** (Clients, Edge, Web/BFF, App, Data, Async/Event). External / third-party bands use a solid grey chip row.
3. **Uniform icon cards** inside a hidden `cells` grid wrapper (so step badges / near keys stay valid on the outer group).
4. **Sparse edges** — prefer **tier-to-tier / container-to-container** edges for many-to-many (BFF → App Tier). Target **&lt; ~25 edges** on overviews. Put per-service DB ownership and Kafka topic fan-out on a **separate detail diagram**.
5. **Numbered steps** are first-class: `steps: [{ n, label, description, anchor? }]` plus optional `edge.step`. Rendered as a right-side **Architecture steps** panel with circular badges; step numbers also appear on edges.
6. **Aspect ~16:9**, generous whitespace, grid-aligned cards, no huge empty voids when avoidable.
7. **D2 edges MUST use fully-qualified paths** (`domain.cells.order -> events.kafka`). Group ids are valid endpoints. Compilers call `buildQualifiedPaths` + `assertValidEdges` / `assertD2EdgesAreQualified`.
8. Do **not** name a shape `steps` — reserved D2 keyword (boards). Use `guide` for the panel.
9. Flowchart / decision → Mermaid; dependency → Graphviz DOT (~16:9 clusters).
10. Every render: SVG post-process + PNG at **2×** (width capped at 3600).

## Engines

| Kind | Engine | Why |
|---|---|---|
| Cloud architecture | D2 + TALA | Nested dashed tiers, icons, orthogonal edges |
| Microservice | D2 + TALA | Sync/async/data edges + steps panel |
| Flowchart | Mermaid | Swimlanes / decisions |
| Decision tree | Mermaid | Branch coloring |
| Dependency graph | Graphviz | Scales to 80+ nodes |
| Escape hatch | `render_diagram` | Raw D2 / Mermaid / DOT |

## Icons

Local SVGs under `assets/icons/` (Simple Icons + aliases). Pass `node.icon` as a key such as `kubernetes`, `postgresql`, `kafka`, `aws`, `lambda`.

## Schema notes

```ts
steps?: { n: number; label: string; description?: string; anchor?: string }[]
edges?: { from: string; to: string; label?: string; kind?: "sync"|"async"|"data"; step?: number }[]
layout?: "tala" | "elk" | "dagre"
```

`from` / `to` may be **node ids or group ids** (tier-to-tier edges).
