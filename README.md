# diagram-mcp

本機 MCP server：用結構化 JSON（或原始 D2 / Mermaid / DOT）產出**專業設計感**的技術圖，輸出 SVG + 2× PNG，並回傳路徑與精簡預覽圖。

## 功能

| Tool | 說明 | 引擎 |
|---|---|---|
| `create_cloud_architecture` | 雲端 / K8s 架構（虛線 tier、統一 icon card、`steps` 編號面板、稀疏邊） | D2 + TALA |
| `create_microservice_architecture` | 微服務（gateway / queue / DB、同步 vs 非同步、`steps`、tier-to-tier 邊） | D2 + TALA |
| `create_flowchart` | 流程圖（支援 swimlane） | Mermaid |
| `create_decision_diagram` | 決策樹（yes/no 色碼） | Mermaid |
| `create_dependency_graph` | 套件 / 模組依賴圖（大量節點仍可讀） | Graphviz |
| `render_diagram` | 直接渲染原始 D2 / Mermaid / DOT | 依 `engine` |
| `list_diagram_icons` | 列出可用圖示 key | — |

主題：`light` · `dark` · `presentation` · `blueprint`  
設計規範見 [DESIGN.md](./DESIGN.md)。

## 環境需求

- macOS（已在 Apple Silicon 驗證）
- Node.js ≥ 20（建議 nvm 的 Node 24）
- Homebrew 套件：`d2`、`graphviz`、`librsvg`

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
npm run examples   # 產出 examples/*.svg + *.png
```

## 啟動（stdio）

```bash
node dist/index.js
# 或
npm start
```

## 註冊到 Cursor

編輯 `~/.cursor/mcp.json`（**請自行加入**，本專案不會改你的設定）：

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

若已有其他 server，把 `diagram-mcp` 區塊合併進去即可。

## 註冊到 Claude Desktop

編輯 Claude Desktop 設定檔（macOS 通常為  
`~/Library/Application Support/Claude/claude_desktop_config.json`）：

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

## 輸出

- 預設目錄：`./output/`（可用參數 `outputDir` 覆寫）
- 每個圖：`.svg`、`.png`（2×）、以及引擎原始檔（`.d2` / `.mmd` / `.dot`）
- MCP 回傳：絕對路徑 + 精簡 PNG preview（`includePreview` 預設開啟）

## Showcase

```bash
npm run showcase   # → examples/showcase/（複雜示範）
npm run examples   # → examples/（基礎五種）
```

| 檔案 | 內容 |
|---|---|
| `examples/showcase/01-ecommerce-microservices-e2e.png` | 電商 overview（稀疏 tier 邊 + 編號 steps，對齊 AWS reference） |
| `examples/showcase/01b-ecommerce-data-kafka.png` | 分圖：per-service 資料擁有權 + Kafka topics |
| `examples/showcase/02-place-order-sequence.png` | Place Order 編號序向圖（sync + Kafka fan-out） |
| `examples/showcase/03-k8s-dual-region.png` | 雙區域 K8s（稀疏邊 + steps 面板） |
| `examples/showcase/04-flowchart-swimlanes.png` | CI/CD swimlane 流程圖 |
| `examples/showcase/05-decision-tree.png` | 事故分級決策樹 |
| `examples/showcase/06-dependency-graph-80.png` | 80+ packages 依賴圖 |

品質對標：`docs/reference-aws-webstore.png`。架構圖支援 `steps`、`edge.step`、`layout: tala|elk|dagre`，以及 **group id 當邊端點**（tier-to-tier）。

## 授權

ISC
