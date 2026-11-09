# diagram-mcp

本機 MCP server：用結構化 JSON（或原始 D2 / Mermaid / DOT）產出**專業設計感**的技術圖，輸出 SVG + 2× PNG，並回傳路徑與精簡預覽圖。

## 功能

| Tool | 說明 | 引擎 |
|---|---|---|
| `create_cloud_architecture` | 雲端 / K8s 架構（決定性 grid、monoline icon、正交邊、`steps` 面板） | **SVG grid** |
| `create_microservice_architecture` | 微服務（同上；sync / async / data） | **SVG grid** |
| `create_flowchart` | 流程圖（支援 swimlane） | Mermaid |
| `create_decision_diagram` | 決策樹（yes/no 色碼） | Mermaid |
| `create_dependency_graph` | 套件 / 模組依賴圖 | Graphviz |
| `render_diagram` | 直接渲染原始 D2 / Mermaid / DOT | 依 `engine` |
| `list_diagram_icons` | 列出 monoline（架構用）與舊版 brand icon | — |

架構圖預設 **dark tech** 主題（深海軍藍、HUD tier、霓虹邊線）。亦支援 `light` / `presentation` / `blueprint`。  
設計規範見 [DESIGN.md](./DESIGN.md)。

## 環境需求

- macOS（已在 Apple Silicon 驗證）
- Node.js ≥ 20
- Homebrew：`d2`、`graphviz`、`librsvg`（flowchart / dependency / raw D2 仍需要）

```bash
brew install d2 graphviz librsvg
```

## 安裝

```bash
cd ~/hwchiu/diagram-mcp
npm install
npm run build
```

驗證：

```bash
npm test
npm run examples   # → examples/
npm run showcase   # → examples/showcase/
```

## 啟動（stdio）

```bash
node dist/index.js
```

## 註冊到 Cursor

編輯 `~/.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "diagram-mcp": {
      "command": "node",
      "args": ["/Users/hwchiu/hwchiu/diagram-mcp/dist/index.js"]
    }
  }
}
```

## 架構圖重點 API

```ts
{
  title: "E-Commerce Microservices Architecture",
  theme: "dark",
  columns: [["clients", "edge"], ["bff", "app"], ["data", "ext"]],
  groups: [{ id: "clients", label: "Clients" }, …],
  nodes: [{ id: "web", label: "Web SPA", role: "external", icon: "browser", group: "clients" }],
  edges: [{ from: "clients", to: "edge", step: 1, kind: "sync" }],
  steps: [{ n: 1, label: "Clients → Edge", description: "…" }]
}
```

- `columns`：決定性欄位堆疊（每欄由上到下）
- `edges.from/to`：可為 **node id 或 group id**（tier-to-tier）
- `icon`：請用 monoline key（`server`、`database`、`globe`…），勿用 React/Go 等品牌 logo

## Showcase

| 檔案 | 內容 |
|---|---|
| `examples/showcase/01-ecommerce-microservices-e2e.png` | 電商 overview（dark tech grid） |
| `examples/showcase/01b-ecommerce-data-kafka.png` | 資料擁有權 + Kafka fan-out |
| `examples/showcase/02-place-order-sequence.png` | Place Order 序向圖（Mermaid） |
| `examples/showcase/03-k8s-dual-region.png` | 雙區域 K8s |
| `examples/showcase/04`–`06` | flowchart / decision / dependency |

## 授權

ISC
