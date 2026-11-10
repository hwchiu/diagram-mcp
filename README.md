# diagram-mcp

本機 MCP server：用結構化 JSON（或原始 D2 / Mermaid / DOT）產出**專業設計感**的技術圖，輸出 SVG + 2× PNG（架構圖可另外輸出可編輯的 **draw.io**），並回傳路徑、精簡預覽圖與**自動結構 QA 報告**。

## 功能

| Tool | 說明 | 引擎 |
|---|---|---|
| `create_cloud_architecture` | 雲端 / K8s 架構（巢狀 tier、避障正交路由、`steps` 面板、QA、draw.io） | **SVG grid** |
| `create_microservice_architecture` | 微服務（同上；sync / async / data / auth） | **SVG grid** |
| `create_flowchart` | 流程圖（支援 swimlane） | Mermaid |
| `create_decision_diagram` | 決策樹（yes/no 色碼） | Mermaid |
| `create_dependency_graph` | 套件 / 模組依賴圖 | Graphviz |
| `render_diagram` | 直接渲染原始 D2 / Mermaid / DOT | 依 `engine` |
| `list_diagram_icons` | 列出 monoline（架構用）與舊版 brand icon | — |

架構圖預設 **dark tech** 主題，採用 [Cocoon-AI architecture-diagram-generator](https://github.com/Cocoon-AI/architecture-diagram-generator)（MIT）的設計語言：slate-950 畫布 + 40px 格線、JetBrains Mono、依角色上色的半透明卡片、HUD 角括號 tier、琥珀色步驟徽章。亦支援 `light` / `presentation` / `blueprint`。  
設計規範與 QA 規則見 [DESIGN.md](./DESIGN.md)。

## 環境需求

- macOS（Apple Silicon）或 Linux（Debian trixie 已驗證）
- Node.js ≥ 20
- `d2`、`graphviz`、`librsvg`（flowchart / dependency / raw D2 需要；架構圖本身是純 TypeScript SVG，不依賴它們）
- Mermaid 需要 Chromium（`@mermaid-js/mermaid-cli` 透過 puppeteer 下載）
- 字型：**JetBrains Mono** 與 **Inter**（PNG 由 sharp/librsvg 依系統字型渲染；沒裝會退回 monospace，量測寬度會不準）

```bash
# macOS
brew install d2 graphviz librsvg
brew install --cask font-jetbrains-mono font-inter

# Debian / Ubuntu
sudo apt-get install -y graphviz librsvg2-bin fonts-jetbrains-mono fonts-inter
curl -fsSL https://d2lang.com/install.sh | sh -s --
```

## 安裝

```bash
git clone https://github.com/hwchiu/diagram-mcp.git
cd diagram-mcp
npm ci
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
      "args": ["<repo 絕對路徑>/dist/index.js"]
    }
  }
}
```

## 架構圖重點 API

```ts
{
  title: "Dual-Region Kubernetes Platform",
  subtitle: "Global edge · us-east-1 active · us-west-2 warm standby",
  theme: "dark",
  columns: [["users"], ["global"], ["east", "west"]],   // 欄位，由上到下堆疊 tier
  bottomRow: ["obs"],                                   // 可選：全寬底部帶狀 tier
  groups: [
    { id: "east", label: "us-east-1 · active", kind: "region" },
    { id: "eks_e", label: "EKS · shop namespace", kind: "cluster", parent: "east", cols: 2 },
    { id: "obs", label: "Observability", layout: "row" },
  ],
  nodes: [{ id: "gw", label: "API Gateway", subtitle: "Envoy · mTLS", role: "gateway", icon: "gateway", group: "eks_e" }],
  edges: [
    { from: "global", to: "east", label: "primary", step: 2, kind: "sync" },
    { from: "order", to: "kafka", step: 5, kind: "async" },
  ],
  steps: [{ n: 1, label: "Global edge", description: "…" }],
  stepsPosition: "auto",            // "right" | "bottom" | "auto"（依長寬比自動選）
  wrap: "auto",                     // 預設：自動把欄位折成 1–3 列，貼近 16:9；"never" 維持單列
  // rows: [[["users"], ["global"]], [["east", "west"]]],  // 可選：手動指定每一列的欄位（關閉自動折列）
  split: "auto",                    // "auto"（> splitThreshold 個節點時拆圖）| "never" | "always"
  splitThreshold: 25,
  outputs: ["svg", "png", "drawio"] // draw.io 預設輸出；outputs 不含 "drawio" 即可關閉
}
```

- `columns` / `bottomRow`：決定性排版；沒有隨機的 auto-layout
- **自動 16:9**：`wrap: "auto"` 時 planner 會枚舉「欄位折成 1–3 列」× 每個 tier 的欄數，依長寬比（目標 1.4–2.0）、
  1600px 寬下的可讀性（最小字級 ≥ ~10px）、空白、預估邊長與交叉評分，挑出最佳排法；巢狀 region 保持完整。
  `columns`、`rows`、`bottomRow`、`groups.cols` 一律尊重呼叫端設定
- `groups.parent`：巢狀 tier（region → cluster → namespace…）；`cols` 指定欄數、`layout: "row" | "column"` 指定子 tier 排列
- `groups.kind`：`region` / `vpc` / `cluster` / `namespace` / `subnet` / `security` / `external`（決定外框色）
- `edges.from/to`：可為 **node id 或 group id**（指向 tier 時箭頭停在 tier 外框，QA 視為刻意）
- `edges.kind`：`sync`（青）、`async`（紫、虛線）、`data`（綠）、`auth`（玫瑰、點線）；圖例自動依實際用到的種類產生
- `role`：`client` / `network` / `gateway` / `security` / `compute` / `data` / `queue` / `storage` / `observability` / `external`
- `icon`：monoline key（`server`、`database`、`gateway`、`stream`…；`list_diagram_icons` 可查），勿用品牌 logo

### 路由與主幹（trunk）

邊線由 `src/layout/router.ts` 的正交 A* 路由產生：在稀疏可視格網上搜尋，**卡片是硬障礙**（間距 14px），
轉彎、穿越其他 tier、與其他邊重疊或交叉都有成本；同側多條邊會均分 port。

- **Edge bundling**：指向同一個 tier / region（或從同一來源出發）的同種類邊線會在 gutter 合併成一條主幹再扇出，
  匯流 / 分岔點畫上圓點（junction）；不同主幹之間會保持間距。QA 把同主幹共線視為刻意，只對「意外重疊」發 warning。
- **標籤**：先放 label 再放徽章；pill 只放在自己的分支直線段上，不壓其他線；真的放不下時改用虛線 leader 把 pill 停在旁邊的空位。

### 自動拆圖（split）

節點數 > `splitThreshold`（預設 25）時，同一份輸入會產生多張圖：

| 檔案 | 內容 |
|---|---|
| `<name>.overview.{png,svg,drawio}` | 每個 tier / region 收成一個區塊（「N components」＋成員摘要），跨 tier 的邊彙總去重並標上「×5」；walkthrough 保留 |
| `<name>.<tier>.{png,svg,drawio}` | 每個 region / 頂層 tier 一張細節圖；外部端點以淡化的 stub 卡片呈現並標示所屬 tier（上游在左、下游在右），只帶入相關的 steps |

工具回應會列出每張圖的路徑、尺寸與 QA；預覽圖是 overview。`split: "never"` 可強制單張，`"always"` 可強制拆圖。

### 結構 QA（自動）

每次渲染都會跑 `src/layout/qa.ts`，結果附在 tool 回應中（`error` / `warning` / `info`）：

| 代碼 | 檢查 |
|---|---|
| `card-overlap` | 卡片重疊或間距 < 16px |
| `out-of-bounds` / `card-outside-frame` / `frame-overlap` | 元素超出畫布、卡片超出所屬 tier、巢狀 tier 溢出父框 |
| `text-overflow` / `text-truncated` / `tier-label-overflow` | 以實際字型量測文字寬度是否超出卡片 / 被截斷 / tier 標籤被裁切 |
| `edge-through-card` | 邊線穿過任一卡片內部 |
| `edge-through-label` | 邊線穿過 tier 標籤或其他邊的 pill（穿過徽章為 warning） |
| `label-collision` | pill / 徽章 / tier 標籤彼此或與卡片重疊 |
| `edge-dangling` | 邊線端點沒落在宣告的 node 上，或「停在 tier 外框」但目標其實是 node |
| `edge-diagonal` / `edge-jog` / `edge-unrouted` | 非正交線段、< 10px 的小抖動、路由失敗 |
| `edge-overlap` / `edge-crossings` | 不屬於同一主幹的邊線意外重疊；交叉數超過預算（max(4, 30% 邊數)） |
| `label-missing` / `badge-floating` / `badge-ambiguous` | 有 label 卻放不下、步驟徽章離線、徽章無法判斷屬於哪條線 |
| `canvas-aspect` / `whitespace` | 長寬比超出 1.3–2.3、大片空白帶（> 16%）或 tier 覆蓋率過低 |
| `readability` | 以 1600px 寬檢視時最小字級 < 9px（warning；< 10px 為 info）——請拆圖或折列 |
| `step-unanchored` / `step-undocumented` | steps 與邊上的 step 編號不一致 |

`npm test` 會確保所有內建範例 **0 error、0 warning**，並以合成缺陷驗證每條規則能抓到問題。

### draw.io 輸出

預設會在 PNG 旁輸出 `<name>.drawio`（mxGraph XML；拆圖時每張 view 各一份）：位置與 SVG 完全一致、
深色樣式、tier 為可拖曳的巢狀 container、卡片內嵌 monoline icon、邊線為 orthogonal + waypoint、
步驟徽章 / 圖例 / walkthrough 皆為可編輯 cell。可直接用 draw.io / diagrams.net 開啟。

## Showcase

| 檔案 | 內容 |
|---|---|
| `examples/showcase/01-ecommerce-microservices-e2e.png` | 電商 overview（dark tech grid） |
| `examples/showcase/01b-ecommerce-data-kafka.png` | 資料擁有權 + Kafka fan-out |
| `examples/showcase/02-place-order-sequence.png` | Place Order 序向圖（Mermaid） |
| `examples/showcase/03-k8s-dual-region.png` | 雙區域 K8s（巢狀 region → EKS → namespace；附 `.drawio`） |
| `examples/01-cloud-architecture.png` | AWS Serverless Web Store（附 `.drawio`） |
| `examples/02-microservice-architecture.png` | Event-driven 訂單平台（CQRS / outbox；附 `.drawio`） |
| `examples/showcase/04`–`06` | flowchart / decision / dependency |

## 授權

ISC。架構圖設計語言參考 Cocoon-AI/architecture-diagram-generator（MIT）。
