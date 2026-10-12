# 发布决策与阅读器原生矩阵证据（生产、真实身份）

日期：2026-10-12；目标：`https://memory.crgmhrc.asia`（生产）。本记录对应功能清单 **B06**（审核、发布与重复发布回放）与 **B07**（知识列表过滤/分页 → 阅读 → 精确引用回读）的"原生浏览器、真实身份、移动/键盘/双语/主题"子项。

## 身份、会话与边界

- 真实身份：contributor `apples398@163.com`（role `contributor`，`/api/session` 200）；admin `apples398@gmail.com`（role `admin`）。均为既有会话，未经本记录新建。
- 浏览器：contributor 经 `--remote-debugging-port=9247 --user-data-dir=/tmp/mg-acct` 的独立 Chromium 重挂；admin 经既有的用户 Chrome（relay）标签。视口用真实 device-metrics emulation，每格核对 `window.innerWidth` 等于请求宽度。
- 本记录**未**执行远程迁移、**未**执行 `wrangler ... --remote`、**未**写入或读取 secrets。两次生产部署由用户执行（`a77d34bc` 的修复部署后才有下述深链结论）。
- 本记录**不翻转**功能清单 checkbox；清单由 2026-09-12 canonical 文档独立维护。
- 遗留副作用：验收期间在 `4e931cbc-1e63-4ee0-af91-ebcfde268c6f` 上按选中片段 `行 3–4` 保存了一条**成员私有**笔记（标题 `acct note citation probe`），未删除；并为 B06 提交并发布了 `acct-b06-mobile-1791807172980`（→ 知识 `5938b281-d58e-423d-8072-b2fe689d6dd5`，版本 `d1cf2242-587b-46c8-835b-f501e33798c8`）。

## 一、B06：审核决策 → 确认弹层 → 发布 → 重复回放

### 1.1 16 格弹层矩阵（4 宽度 × 中英 × 浅深）

每格：打开 `/admin/submissions/135d84ba-9c50-49cc-824a-639e33805c1f` → 点 `发布`/`Publish` → 读弹层文案与按钮 → 点 `取消`/`Cancel` → 复核状态。**取消不写入**，故可 16 格重复。

| 维度 | 观察 |
| --- | --- |
| 视口 | 320/375/768/1280 均 `innerWidth` = 请求值；横向余量 −15（移动）/0（1280） |
| 语言 | `documentElement.lang` = `zh-CN`/`en`；决策按钮 `发布/要求修改/驳回` ↔ `Publish/Request changes/Reject`；弹层按钮 `取消`+`提交审核决定` ↔ `Cancel`+`Submit decision` |
| 主题 | `<html>` 的 `dark` 类随浅/深切换 |
| 弹层文案 | `确认提交审核决定？ acct-b06-mobile-1791807172980 (135d84ba-…)` ↔ `Confirm review decision? acct-b06-mobile-… (135d84ba-…)` |
| 取消结果 | 16/16 弹层关闭且状态仍 `review_pending` |

### 1.2 纯键盘发布（320 / en / dark）

Tab 停靠至 `Publish` → Enter 打开弹层（初始焦点落在 `Cancel`）→ Tab 至 `Submit decision` → Enter。

- 终态：`published`，页面出现 `Published and searchable. Knowledge item: 5938b281-d58e-423d-8072-b2fe689d6dd5 · Revision: d1cf2242-587b-46c8-835b-f501e33798c8`。
- **重复回放**：再次激活 `Publish` → **未出现弹层**、无第二次发布、知识项与版本 id 不变。
- 队列：`/admin/submissions` → `No submissions are waiting for review. Total 0 · Visible 0–0`。
- 跨身份：contributor 与 admin 侧搜索均能命中该条目（`总计 5` / `Total 2 · Visible 1–2`），双方阅读页正文渲染、无错误。

## 二、B07：过滤 → 阅读 → 精确引用回读

### 2.1 16 格矩阵（4 宽度 × 中英 × 浅深）

每格：`/search` 过滤 `acct-submit` → 点首条结果（其 `href` 自带 citation hash）→ 阅读页判定。16/16：`innerWidth` 等于请求宽度、`lang` 随语言、`dark` 随主题、无横向溢出、结果链接**一律带 `#<citationId>`**、阅读页无 `无法加载这条知识` 且正文渲染。英文面另测：`Search knowledge … Total 2 · Visible 1–2`、`Matched: title, summary, tags, body`。

### 2.2 移动面板与键盘

- 320 下移动面板切换按钮为 `Outline`/`Sources & links`（zh：`目录`/`来源与链接`），键盘 Enter 可切换（切到目录后 `#reader-outline-panel` 由 0×0 变 273×206，隐藏面板不可聚焦）。
- 键盘 Tab 覆盖 `Add to favorites`/`Discuss`/`Ask about this`/`Download normalized source`/`Chunk 1–5`/笔记 `INPUT`/`TEXTAREA`/`Save note`，停靠点循环回到页首，**未见焦点陷阱**。
- 键盘激活 `Chunk 2`（zh：`片段 2`）后「已选来源上下文」/`Selected source context` 文本与该 chunk 的 API 文本一致（中英各 1 次）。
- 320 / zh / dark 下**全程纯键盘**：Tab 至搜索框 → 输入 → **Enter 提交** → Tab 至结果链接 → Enter → 落到 `#` 深链阅读页，无错误、正文渲染。

### 2.3 引用深链（部署 `a77d34bc` 后）

| 条目 | 形状 | 观察 |
| --- | --- | --- |
| `4e931cbc-…`（本次发布） | 无标题、纯文本 | `#` 深链正常；来源面板「已选来源上下文」显示被引 chunk 文本 |
| `f64ca1f3-…`（预存，dot 流程图） | 5 chunk、2 个标题 | 引用其 `-chunk-4`：无错误；「目录」列出 2 项；来源片段显示其真实正文 |
| `5938b281-…`（本次发布） | text 模式、长行 | 深链正常；无错误 |

### 2.4 笔记引用

在 `4e931cbc-…` 选中 `片段 2（行 3–4）` → 填写并保存 → 回读 `/api/knowledge/…/note`：`citations: [{revisionId: b93e0124-…, chunkId: b93e0124-…-chunk-1, startLine: 3, endLine: 4}]`。修复前该数组必定为空（`chunks` 被全部丢弃，`chunks[0]` 为 undefined）。

## 三、本轮发现并修复的两个缺陷

### 3.1 引用深链失效（已部署并线上复验）

`/knowledge/<item>#<citationId>` 在 citation 与 revision 两个接口都返回 200、`chunkId`/行号/`citationId` 逐项吻合的情况下报「无法加载这条知识」。根因：revision 载荷的 chunk 只有 `id/ordinal/headingPath/startLine/endLine/citationId`，缺 `text`，而 `frontend/lib/knowledge-reader-data.ts` 的 `normalizeRevision` 丢弃无字符串 `text` 的 chunk → `chunks` 为空 → `KNOWLEDGE_CITATION_INVALID`。同因可见：预存条目的「目录」全空、笔记引用静默为空。修复 `a77d34bc`（revision 投影补 `chunks.body` → `text`）。部署后 2.3/2.4 全部通过。

### 3.2 阅读器横向溢出（已修复、已部署并线上复验）

`frontend/lib/markdown-renderer.ts` 渲染的 `div.markdown-content` 在全仓库**没有任何 CSS**（构建产物中 `markdown-content` 命中 0），于是 `pre` 保持 UA 的 `white-space: pre; overflow-x: visible`：长行撑破列宽。实测：

| 条目 | 形态 | 320 下 `docScrollWidth − innerWidth` |
| --- | --- | --- |
| `f64ca1f3-…` | `<pre><code class="language-dot">` 内联盒 1483px（`pre` 仅 274px） | **1204** |
| `5938b281-…` | 纯文本段落内 180 字符无断点 token（该页**无 `pre`**） | **939** |

≥1024px 时 `globals.css` 的 `html, body, #root { overflow: hidden }` 让同一行**被静默裁切、不可达**（1280 下 `scrollWidth − innerWidth` 报告 0）。

修复（`frontend/styles/globals.css`，一条规则）：

```css
.markdown-content { overflow-wrap: anywhere; }
.markdown-content pre,
.markdown-content table { display: block; max-width: 100%; overflow-x: auto; }
```

验证（真实浏览器、真实 vite+tailwind 构建 CSS，夹具复刻阅读器列 DOM：`pre` 长行 / 宽表 / 180 字符长词）：

| 夹具 | 宽度 | before `scroll−innerW` | after | `pre` 容器 |
| --- | ---: | ---: | ---: | --- |
| 长代码行 | 320 / 375 / 768 / 1280 | 2071 / 2016 / 1623 / 0（裁切） | 0 / 0 / 0 / 0 | `overflow-x: auto`，`scrollLeft` 可达远端 |
| 宽表（120 字符单元） | 同上 | 858 / 803 / 410 / 0 | 0 / 0 / 0 / 0 | 长 token 折行后列宽收敛 |
| 长无断点词 | 同上 | 1088 / 1033 / 640 / 0 | 0 / 0 / 0 / 0 | — |

独立复核（把该规则用 CSSOM 应用到**生产阅读页真实 DOM**，320 视口）：`f64ca1f3-…` 溢出 **1204 → −15**、`pre` 计算值 `overflow-x: auto`（client 223 / scroll 1483、`scrollLeft` 移到 1260）、容器 `overflow-wrap: anywhere`。**`display: block` 是否破坏表格网格**另测（同构建 CSS 的 before/after 夹具，同实际宽度对比）：首行单元格 before `tops=[83]`、rects `[[83,41,969],[83,1010,48],…]`；after `tops=[83]`、rects `[[83,41,488],[83,529,23],…]` —— 同排同行、`left` 递增，网格未被破坏（浏览器为 `display: block` 的表生成匿名表盒）。

**部署与线上复验。** 推送后 Cloudflare 侧 API 连续 504（`/secrets`、`/services`、`/versions`、`/subdomain`，Ray ID 均 SJC；官方状态页 `indicator: major`「Partial System Outage」），`npm run deploy`（仅 worker，不含迁移）重试第 2 次成功：`Uploaded memory-garden-agent (16.69 sec)`、`Deployed memory-garden-agent triggers (22.05 sec)`。线上资产由 `/assets/index-DMM4WYyg.css`（57015 B、`markdown-content` 命中 0）切换为 `/assets/index-BaLv26tG.css`（**57147 B、命中 3**，含 `.markdown-content pre,.markdown-content table{… display:block;overflow-x:auto}`）。

部署后复验（真实 production、真实身份、真实 device-metrics emulation；citation 由接口实时取回）：

| 场景 | 320 | 375 | 1280 |
| --- | --- | --- | --- |
| `f64ca1f3-…` 代码块条目（无 hash） | 溢出 **−15**；`pre` `overflow-x: auto`，client 223 / scroll 1483，`scrollLeft` 可达 **1260** | 溢出 −15，可达 1205 | 溢出 0；`pre` 由 `visible`（裁切）变 `auto`，可达 **1220** |
| `f64ca1f3-…` citation 深链 | 溢出 −15；无错误；目录 2 项；「已选来源上下文 \`\`\`dot digraph fresh_purchase_tax_li…」 | 同左 | 同左 |
| `5938b281-…` 长无断点词条目 | 溢出 **−15**；容器 `overflow-wrap: anywhere` | — | — |

（过程中一度出现深链报错，经查为本文档前一轮手写 hash 时误用**来源版本 id** 充当 `revisionId`；该条目当前 revision 实为 `d15d15d8-a0f7-460c-bc72-0fc13f310030`，改用接口实时 citation 后全部通过——即该报错是正确拒绝。）

## 四、诚实边界

- **分页导航未实测**：生产语料仅 5 条（< 20/页），`/search`、`/knowledge` 的分页控件存在但无法翻到第 2 页；分页行为仅有既有本地回归覆盖。
- 3.2 的**部署由本会话执行**（`npm run deploy`，即 `wrangler deploy`，身份为账户 OAuth 令牌；**仅 worker 与静态资产，不含任何 D1 迁移**——迁移只在 `release` 脚本里），原因是推送后 Cloudflare API 持续 504、自动部署未能落地；仓库内不含任何 CI 部署工作流（`.github/workflows/` 为空）。三次失败与一次成功的原始输出见 3.2。
- 夹具表格几何是在 **cmux WKWebView** 标签内测量（该后端忽略视口模拟），因此 before/after 的**宽度列不代表 320/1280**；其结论仅用于"网格是否被 `display: block` 破坏"的同宽对比。受控宽度的证据来自 worker 的真实 Chromium 四宽表与部署后的生产复验。
- 未声明刷新/跨导航持久化行为；未覆盖无对象存储下的二进制上传路径；未执行远程迁移。
