# diagram-mcp

本機 MCP server：用結構化 JSON（或原始 D2 / Mermaid / DOT）產出**專業設計感**的技術圖，輸出 SVG + 2× PNG（架構圖可另外輸出可編輯的 **draw.io**），並回傳路徑、精簡預覽圖與**自動結構 QA 報告**。

## 功能

| Tool | 說明 | 引擎 |
|---|---|---|
| `create_cloud_architecture` | 雲端 / K8s 架構（巢狀 tier、避障正交路由、`steps` 面板、QA、draw.io） | **SVG grid** |
| `create_microservice_architecture` | 微服務（同上；sync / async / data / auth） | **SVG grid** |
| `create_system_context` | **C4 L1 系統情境圖**：人物（頭像卡）→ 系統邊界內的大型系統方塊 → 外部系統 | **SVG grid** |
| `create_component_diagram` | **C4 L3 元件圖**：container 邊界、provided interface（pill）、分層元件、外部依賴 | **SVG grid** |
| `create_deployment_topology` | **K8s 部署拓撲**：cluster → namespace → workload（類型 chip、replica 疊卡）、叢集外資源 | **SVG grid** |
| `create_network_topology` | **網路拓撲**：Internet / DMZ / VPC / subnet / 廠區，CIDR chip、防火牆 / VPN / 路由，allow / deny / VPN 線型 | **SVG grid** |
| `create_dataflow_trust_boundary` | **DFD + 信任邊界**（威脅建模）：外部實體 / P# 流程 / D# 資料存放、紅色虛線信任邊界、⊗ 跨界標記、`[PII]` 敏感資料標籤 | **SVG grid** |
| `create_swimlane` | **泳道圖**：每個角色一條 lane，任務自動編號、決策菱形、起訖膠囊、跨 lane 交接 | **SVG swimlane** |
| `create_data_lineage` | **資料血緣**：Source → Staging → Warehouse → BI 分 stage 欄位，batch / stream / CDC 線型，`focus` 上下游追蹤 | **SVG layered** |
| `create_workflow_dag` | **Workflow / Pipeline DAG**（Airflow / Argo / CI）：狀態 chip、fan-out / fan-in、trigger rule | **SVG layered** |
| `create_dependency_graph` | 套件 / 模組 / 服務依賴圖 + **影響分析**（`changed` → 受影響路徑高亮、其餘淡化）；相容舊輸入 | **SVG layered** |
| `create_knowledge_graph` | **Ontology / 知識圖譜**：實體、關係（謂詞 label）、is_a / instance_of 分類邊、`focus` 鄰域 | **SVG layered** |
| `create_flowchart` | 流程圖：起訖、處理、決策菱形（是 / 否 色碼）、迴圈（回頭虛線）、I/O、子流程；lane 自動轉泳道；相容舊輸入 | **SVG layered** |
| `create_decision_diagram` | 決策樹（yes / no 色碼）；相容舊輸入 | **SVG layered** |
| `create_state_machine` | **UML 狀態機**：初始 / 終止、entry / do / exit、複合狀態、choice、event [guard] / action | **SVG layered** |
| `create_er_diagram` | **ER 圖**：資料表卡（PK / FK / UK、型別、nullable）、crow's foot 基數、主題區框 | **SVG layered** |
| `create_sequence_diagram` | **循序圖**：參與者標頭、lifeline、編號 sync / async / return 訊息、自呼叫、自動 activation、alt / opt / loop / par 片段、note、divider；長對話自動分 2–3 欄 | **SVG scene** |
| `create_authorization_matrix` | **權限矩陣**：角色 × 資源 × 動作，allow ✓ / deny ✗ / conditional ◐（附註編號 + 條件面板），`*` 萬用字元 | **SVG scene** |
| `create_gantt` | **甘特圖**：分組、`after` 自動排程（finish-to-start）、進度、里程碑、關鍵路徑、TODAY 線；日 / 週 / 月 / 季自動刻度 | **SVG scene** |
| `create_timeline` | **時間軸**：事件卡上下交錯不重疊、era 色帶、里程碑；依時間比例或等距；事件多時分多列 | **SVG scene** |
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

## 圖種

所有結構化工具（Group 1–4，共 18 個）都由本專案自己的引擎排版與繪製（**不經過 Mermaid / Graphviz**），共用同一套 dark Cocoon 視覺、避障正交路由、結構 QA 與 draw.io 輸出（`outputs` 預設 svg + png + drawio），
文字支援繁體中文（Noto Sans / Mono CJK TC 量測與渲染）。範例輸入在 [`examples/types/`](./examples/types)（每種一個小圖 `-s`、一個 12–20 節點的中圖 `-m`）。
所有工具都接受共用欄位 `title` / `subtitle` / `theme` / `name` / `outputDir` / `outputs` / `steps`（walkthrough）/ `split` / `splitThreshold`。

| Tool | 主要欄位 | 視覺特徵 |
|---|---|---|
| `create_system_context` | `system{id,label,description,technology}`、`boundary{label,tag}`、`internalSystems[]`、`actors[]{external}`、`externalSystems[]{type}`、`relationships[]{from,to,label,technology,kind,bidirectional,step}` | 人物＝頭像 + 圓角卡；系統＝加大加粗的中央方塊；藍色虛線系統邊界；外部系統灰色 |
| `create_component_diagram` | `container{id,label,technology}`、`interfaces[]{protocol}`、`components[]{responsibility,technology,layer,type: component/store/adapter/policy/job}`、`layers[]`、`externals[]{type,side}`、`relationships[]` | container 邊界 + 技術 chip；interface 為 pill（左側圓點）；元件右上 UML 元件符號；依 layer 分欄 |
| `create_deployment_topology` | `clusters[]{provider,version,region,namespaces[]{workloads[]{type,replicas,image,port}}}`、`outside[]{type,location,side}`、`connections[]{protocol,port,kind}` | cluster / namespace 巢狀框 + 類型 chip（DEPLOY / STS / DS / ING / CRON…）；replicas > 1 畫成疊卡；叢集外資源另一欄 |
| `create_network_topology` | `zones[]{type: internet/dmz/vpc/subnet/onprem/site/…,cidr,parent}`、`devices[]{type,zone,ip}`、`links[]{protocol,port,type: allow/deny/vpn/route/mgmt,bidirectional}` | 區域框右上 CIDR chip；防火牆紅、VPN / 路由器專屬 icon；allow 實線、VPN 紫色虛線、deny 紅色點線 |
| `create_dataflow_trust_boundary` | `boundaries[]{trust: untrusted…restricted,parent}`、`externalEntities[]`、`processes[]{number}`、`dataStores[]{number}`、`flows[]{label,data[],protocol,kind}` | 紅色虛線信任邊界 + 鎖頭 + 信任等級 chip；外部實體雙框方塊、流程 P#、資料存放 D#（開口框）；跨界的流用 ⊗ 標記並加光暈；`data` 中的 PII / 機密以紅色 `[TAG]` 標在 pill 上 |
| `create_swimlane` | `lanes[]{id,label,description}`、`steps[]{id,label,lane,type: start/end/task/decision/document/system/wait,column}`、`flows[]{from,to,label,kind}`、`numbering` | 左側 lane 標頭（LANE 01…）；任務自動編號 chip；決策菱形、起訖膠囊；退回流用紅色點線；寬度太長會自動壓縮欄位或分段 |

### Group 2：分層 DAG（`src/layout/layered.ts`）

自製 Sugiyama 流程：DFS 去環 → longest-path 分層（可指定 stage）→ dummy 節點 → median / barycenter 掃描 + transpose 減少交叉 →
isotonic（PAV）座標 → 依 label 加寬間距；巢狀群組（複合狀態、task group、主題區）遞迴排成區塊。LR / TB × 1–3 段自動評分，挑最接近 16:9 的版本。

| Tool | 主要欄位 | 視覺特徵 |
|---|---|---|
| `create_data_lineage` | `stages[]{id,label,description}`、`datasets[]{id,label,type: source/table/view/file/stream/job/model/dashboard/report/api,stage,system,description,tags}`、`flows[]{from,to,label,kind: batch/stream/cdc/manual}`、`focus{node,direction}` | stage 框 + 系統 chip；資料集依類型換形狀 / icon；stream 紫色、CDC 虛線；focus 外的節點淡化 |
| `create_workflow_dag` | `schedule`、`tasks[]{id,label,operator,status: success/failed/running/queued/skipped/upstream_failed,group,description}`、`groups[]{parent}`、`dependencies[]{from,to,label,condition: success/failure/always}` | 狀態 chip（綠 / 紅 / 藍 / 灰）；task group 綠框；failure 分支紅色點線 |
| `create_dependency_graph` | `nodes[]{type: service/library/database/queue/external/app}`、`edges[]{optional}`、`groups[]`、`changed[]`、`impact: dependents/dependencies/both` | 變更節點琥珀光暈、受影響路徑高亮、其餘淡化；optional 依賴虛線 |
| `create_knowledge_graph` | `types[]`、`entities[]{id,label,type,description,attributes[]}`、`relations[]{from,to,label,kind: relation/is_a/part_of/instance_of,bidirectional}`、`focus` | 依 type 上色 / 分組；屬性列；is_a / instance_of 空心箭頭；謂詞以 pill 標示 |
| `create_flowchart` | `nodes[]{type: start/end/process/decision/io/subprocess/document/data/wait}`、`edges[]{when,label}`、`groups[]`（kind=lane → 泳道） | 是 / 否 自動判斷（中英）上色；回頭邊畫成紫色虛線 loop |
| `create_decision_diagram` | `root`、`nodes[]{type: question/outcome/action}`、`edges[]{when}` | 問題菱形、結果膠囊；yes 綠 / no 紅 |
| `create_state_machine` | `states[]{type: state/initial/final/choice/composite,parent,entry,do,exit}`、`transitions[]{event,guard,action,kind: normal/error/timeout/internal}` | UML 初始黑點 / 終止靶心；複合狀態靛色框；自轉移 loop |
| `create_er_diagram` | `entities[]{id,label,domain,columns[]{name,type,pk,fk,unique,nullable}}`、`relationships[]{from,to,cardinality:"1:N" / "0..1:N"…,fromEnd,toEnd,label,identifying}`、`domains[]` | 表格卡 + 欄位列；PK / FK chip；crow's foot（one / many / zero-or-one …） |

### Group 3–4：固定格式圖（`src/layout/scene.ts` + 各自排版）

| Tool | 主要欄位 | 視覺特徵 |
|---|---|---|
| `create_sequence_diagram` | `participants[]{id,label,type: actor/service/database/queue/external/browser/gateway/security/job,description}`、`messages[]{type: message/note/divider,id,from,to,label,kind: sync/async/return/error,over[],position}`、`fragments[]{kind: alt/opt/loop/par/critical/break/group,label,start,end,sections[]}`、`autonumber`、`activations`、`panels` | 同步實線實心箭頭、非同步開口箭頭、回傳虛線；自動 activation（呼叫 → 回傳）；片段 tab + `[條件]` + else 分隔；長對話分欄並重複標頭 |
| `create_authorization_matrix` | `roles[]`、`resources[]{actions[]}`、`actions[]`（預設動作）、`permissions[]{role,resource,actions,effect: allow/deny/conditional,condition}`（依序套用、可用 `*`）、`default: none/deny`、`orientation` | 兩層欄標頭（資源 → 動作）；✓ / ✗ / ◐ 色塊；條件附註編號 + CONDITIONS 面板；預設 deny 的格子淡化；太寬會分段或轉置 |
| `create_gantt` | `groups[]`、`tasks[]{start,end,duration:"5d"/"2w"/"1m",after,progress,milestone,critical,owner,group}`、`today`、`scale` | 兩層時間軸（月 / 日、月 / 週、年 / 月、年 / 季）；週末底色；進度填色；菱形里程碑；finish-to-start 箭頭；紅色 TODAY 線（有給才畫） |
| `create_timeline` | `events[]{date: YYYY / YYYY-MM / YYYY-MM-DD,label,description,role,milestone}`、`eras[]{label,start,end,role}`、`scale: time/even` | 事件卡上下交錯、分層避免重疊且引線不穿過其他卡；era 色帶 + 名稱；年 / 月刻度；事件多時自動分 2–3 列 |

QA 規則與架構圖相同（0 error 為必要條件）；`npm test` 會對 `examples/types/` 的 34 份規格檢查 0 error、長寬比
（Group 1：1.4–2.2；Group 2–4：1.3–2.3）、每條有 label 的邊都有 pill，以及 SVG / draw.io XML 可解析。
固定格式圖另外檢查：文字超出空間、標籤互撞、卡片重疊、超出畫布、長寬比與 1600px 寬下的可讀性。

舊版 `create_flowchart` / `create_decision_diagram` / `create_dependency_graph` 的輸入格式仍可使用（工具名稱不變），
但改由新引擎繪製並輸出 draw.io；若真的需要 Mermaid / Graphviz，請用 `render_diagram`。

### 細節圖密度控制（split）

- **stub 扇入合併**：同一個 zone 內 ≥ 3 張卡片以同一種線連到同一個 stub 時，改畫一條「zone → stub」的邊並標 `×N`。
- **大 zone 自動分組**：細節圖中 > 12 張卡片或 > 20 條內部邊的 zone，會依連線自動拆成子群組（以 hub 命名）。
- **重心排序**：未指定 `reorder` 時，引擎會同時試排「原順序」與「鄰居重心順序」，交叉較少者勝出。

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
