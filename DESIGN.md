# Design System

`diagram-mcp` aims for **vendor-poster / SaaS-docs** quality — not default Graphviz or Mermaid chrome.

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
- Hierarchy: diagram title ≫ group header ≫ node label ≫ subtitle / edge label
- Node cards: icon + title + optional subtitle

## Layout rules

1. **Cloud / microservice → D2 + ELK** with nested tinted containers and local `grid-columns` so sibling nodes pack horizontally.
2. **Flowchart / decision → Mermaid** with native SVG labels (`htmlLabels: false`) so PNG text survives rasterization; yes/no edges are color-coded.
3. **Dependency → Graphviz DOT** with clustered subgraphs packed into ~2 rows, `concentrate=true`, aiming near **16:9**.
4. Nested depth stays shallow (≤3) for architecture posters; deeper trees get skyscraper-tall.
5. Edges only connect **nodes**, never group containers.
6. **D2 edges MUST use fully-qualified paths** (`board.domain.order -> board.events.kafka`). Bare ids create duplicate top-level ghosts. Compilers call `buildQualifiedPaths` + `assertValidEdges` / `assertD2EdgesAreQualified`.
7. Prefer edge **color** over dense edge labels (labels become visual noise).
8. Every render: SVG post-process (canvas fill, Inter import, soft shadow filter) + PNG at **2×**.

## Engines

| Kind | Engine | Why |
|---|---|---|
| Cloud architecture | D2 | Nested containers, icons, ELK |
| Microservice | D2 | Sync/async edge styles + icons |
| Flowchart | Mermaid | Swimlanes / decisions |
| Decision tree | Mermaid | Branch coloring |
| Dependency graph | Graphviz | Scales to 80+ nodes |
| Escape hatch | `render_diagram` | Raw D2 / Mermaid / DOT |

## Icons

Local SVGs under `assets/icons/` (Simple Icons + aliases). Pass `node.icon` as a key such as `kubernetes`, `postgresql`, `kafka`, `aws`, `lambda`.
