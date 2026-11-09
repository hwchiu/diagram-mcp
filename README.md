# diagram-mcp

本機 MCP server：用結構化 JSON（或原始 D2 / Mermaid / DOT）產出**專業設計感**的技術圖，輸出 SVG + 2× PNG，並回傳路徑與精簡預覽圖。

## 功能

| Tool | 說明 | 引擎 |
|---|---|---|
| `create_cloud_architecture` | 雲端 / K8s 架構（區域、VPC、叢集分組、圖示） | D2 + ELK |
| `create_microservice_architecture` | 微服務（gateway / queue / DB、同步 vs 非同步邊） | D2 + ELK |
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

`npm run examples` 會在 `examples/` 產生五種圖：

| 檔案 | 類型 |
|---|---|
| `examples/01-cloud-architecture.png` | 多區域 AWS/EKS |
| `examples/02-microservice-architecture.png` | 事件驅動微服務 |
| `examples/03-flowchart.png` | CI/CD swimlane |
| `examples/04-decision-tree.png` | 事故分級決策樹 |
| `examples/05-dependency-graph.png` | 69 packages 依賴圖 |

## 授權

ISC
