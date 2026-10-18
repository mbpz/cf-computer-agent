# Gemini Notebook 逆向捕获与 AI 知识库对账

更新时间：2026-10-18 UTC

目标：`https://notebook.google.com/`（原 NotebookLM，捕获时产品名为 **Gemini Notebook**）。

用途：为 [`AI 知识库原子 Checklist`](./ai-knowledge-base-checklist.md) 与 [`国外 AI 知识库标杆与能力映射`](./ai-knowledge-base-benchmark.md) 提供当日真实页面证据。本文只记录结构与接口形态，不记录任何笔记本正文、账号信息、Cookie 或 Secret。

## 1. 边界与方法

三种捕获，全部只读：

| # | 方法 | 身份 | 说明 |
| --- | --- | --- | --- |
| 1 | `rea capture-browser-scenario`（launch, headless） | 匿名 | 落地页 URL、DOM、无障碍树、截图 |
| 2 | `rea capture-browser-scenario`（events: network/console/page-errors） | 匿名 | 落地页请求清单 |
| 3 | omp `browser.open({ app: { relay: true, target: "notebook.google.com" } })` | 已登录（用户授权） | 首页与一个私有笔记本的结构、Studio 面板、fetch/XHR 端点 |
| 4 | `rea capture-browser-scenario`（`/login`） | 匿名 | 登录入口与身份提供方 |

未执行：任何生成（音频/视频/演示文稿/报告/信息图）、上传、分享、发布、设置变更、删除。私有笔记本仅做结构与标签读取，正文与提问内容不进入本文。

## 2. 证据

匿名落地页 `evidence_id ev_346a6bd5c8d2003f0e7e1548d3c30ce706b817a6644bddc00fa19f0751a3e73e`，浏览器 Chromium 155.0.8059.82，`authority=controlled-replay`，`confidence=observed`：

- `https://notebook.google.com/` → `https://notebook.google.com/trynow`（服务端跳转）
- `<title>`：`Gemini Notebook`
- 截图 124,330 B，SHA-256 `4c139c1165d86f6ca4aa5f81ee5d4a4dcb7cba142bbbd52713d520399e672a8c`
- DOM 475,674 B，SHA-256 `f84952526fec4a494b64a769f956c4fc4c544584133c36d081d7e8c545a635e6`
- 无障碍树 792 B，SHA-256 `f46921ce8be33d22688568170b7d784b6fc699f8bd2d54bc64a5d21a5bb7174a`
- 横幅文案：`Understand anything`；副标题声明产品是 “research and thinking partner, grounded in the information you trust, built with the latest Gemini models”；四张能力卡：files → Slide decks、brainstorms → Mind Maps、Assignments → Audio Overviews、textbooks → Video Overviews。

匿名网络捕获 `evidence_id ev_fd3b69d19ceb006df225466b02596ff24b1ae330ef3e0152e166899506a26103`：42 条事件、15 个请求，全部是静态资源（`notebook.google.com` 文档、`gstatic.com` 的 Tailwind Labs JS/图片/字体、`fonts.googleapis.com`）。**落地页没有任何应用 API 调用。**

登录入口 `evidence_id ev_f65e2c27c98523ac1566ff8444ecc2fa4d0532e2c4c8e29c3275433ef563c0c3`：

- `/login?continue=…` → `https://accounts.google.com/v3/signin/identifier`（`flowName=WebLiteSignIn`）
- 无障碍树：`heading "Sign in"`、`textbox "Email or phone"`、`Next`、`Create account`
- 身份提供方只有 Google Account；未见 GitHub、邮箱验证码或第三方 OAuth 入口。

已登录应用（relay 捕获，未持久化到仓库）：

- 首页：`全部` / `我的笔记本` / `发现` / `集合` / `搜索笔记本` / `设置`，`新建笔记本`，`精选笔记本`、`最近打开过的笔记本`、`网格视图` / `列表视图`，每个笔记本一个 `项目操作菜单`。
- 笔记本页来源面板：`添加来源` 提供 `上传文件`、`网站`、`Play 图书`、`云端硬盘`、`复制的文字`；拖放支持 PDF、图片、文档、音频；输入框占位 `基于输入的查询发现来源`，按钮 `Web`、`Fast Research`、`提交`；`来源排序`、`选择所有来源`；来源计数 `2/50`。
- 笔记本页主体：来源摘要、`保存到笔记`、`摘要很棒`/`摘要欠佳`、三个建议问题、`查询框`、`提交`。
- Studio：`音频概览`、`演示文稿`、`视频概览`、`思维导图`、`报告`（横幅标注 “新功能：您现在可以创建互动式报告了！”）、`闪卡`、`测验`、`信息图`、`数据表格`；另有笔记面板（`未读`、`添加笔记`、`修改`）。
- 笔记本头：`创建笔记本`、`分享笔记本`、`笔记本配置`、`设置`。

接口形态（35 条请求）：

- 单一 RPC 网关 `POST /_/LabsTailwindUi/data/batchexecute`，共 17 次调用，通过 `rpcids` 区分方法。
- 观测到的 `rpcids`（15 个）：`rLM1Ne`、`hPTbtc`、`JFMDGd`、`sqTeoe`、`I3xc3c`、`e3bVqc`、`gArtLc`、`tr032e`、`VfAZjd`、`cFji9`、`sODAg`、`EylDcb`、`ozz5Z`、`khqZz`、`wXbhsf`。
- 前端构建标识：`boq_labs-tailwind-frontend_20261015.15_p0`（`bl` 参数）。
- 实时通道：`signaler-pa.clients6.google.com/punctual/multi-watch/channel`（4 次）与 `punctual/v1/chooseServer`（2 次）。
- 未见 REST 资源路径（无 `/api/...` 形式），资源访问被封装在同源 RPC 内；请求体在本会话中不可读（`postData` 为空）。

## 3. 与本项目的映射

| 能力 | Gemini Notebook（2026-10-18） | Memory Garden 现状 | 决策 |
| --- | --- | --- | --- |
| 来源面板与逐项选择 | 有，支持全选、排序、每源菜单 | `READ-012`、`SRC-001…018`，L/W | 已对齐 |
| 来源上限 | UI 显示 `2/50` | 单次上传 1 文件、10 MiB、来源列表分页有界 | 不照搬 50 上限，按免费层与 D1 预算 |
| 上传/网站/粘贴/Drive/Play 图书 | 五类入口 | 文本/Markdown/代码/文件矩阵/URL 快照/替代文本；无 Drive、Play 图书 | Drive/Play 图书为外部授权依赖，不纳入免费层范围 |
| Web 发现 + Fast Research | 有，未知来源先检索再入库 | 无（仅有受控 URL 快照 `SRC-015`） | 需要外部检索索引/配额，列为范围外 |
| 严格引用问答与建议问题 | 有，附 `可能会出错` 提示 | `KB-008`，done/done；证据不足拒答 | 已对齐，且额外强制 citation 回读授权 |
| 保存到笔记 | 有 | `ART-001`、`KB-010` | 已对齐 |
| 思维导图 | 有 | `ART-008`，节点/边逐项 citation | 已对齐 |
| 报告（互动式） | 有 | `RES-001…016`、`ART-011…013`（研究运行 + 不可变报告版本） | 已对齐，交互形态未复刻 |
| 闪卡 / 测验 | 有 | `ART-009`、`ART-010` | 已对齐 |
| 数据表格 | 有 | `ART-006` 来源比较表（逐单元格 citation + 冲突段） | 以比较表覆盖，不新增独立产物 |
| 音频概览 / 视频概览 / 演示文稿 | 有 | `ART-014` 仅策略原语，默认关闭；`experimental-media-policy.ts` 无路由接线 | 维持 P3 延期：Workers AI 免费额度与模型质量不足 |
| 信息图 | 有 | 无 | P3 延期，依赖生成式图像 |
| 分享笔记本 | 有 | 审核 → 不可变 Revision → 授权发布（`KB-004`/`KB-005`） | 不复刻即时分享；保留审核与回滚 |
| 身份 | 仅 Google Account | GitHub OAuth + D1 哈希 Session + allowlist（`IDN-001…007`） | 不切换身份体系 |
| 存储/接口 | 同源 `batchexecute` RPC + 实时通道 | Worker REST + D1/FTS + Durable Object | 不照搬 RPC 形态 |

## 4. 结论

1. 标杆当日证据只强化既有取舍：`docs/product/ai-knowledge-base-benchmark.md` §2.1 的 “Audio/Video/Slide Deck = P3” 结论不变，并新增 `信息图` 同属 P3、`数据表格` 由比较表覆盖。
2. 本轮没有发现可在 Cloudflare 免费层内落地且尚未实现的新能力；`Web 发现 / Fast Research` 需要外部检索配额，`音频/视频/演示文稿/信息图` 需要生成式媒体模型，均不在当前发布边界。
3. 本项目的差异点仍是治理与可回读：成员/Space/Collection 授权逐次重校验、审核与不可变 Revision、citation 回读、回收站与恢复、研究运行的计划确认与配额降级。
4. 本文不提升任何原子、发布或验收状态。

## 5. 未覆盖

- 未触发任何 Studio 生成，因此产物质量、生成时延与配额行为没有观测。
- 未上传来源、未分享/发布、未修改设置，因此这些写路径的权限与幂等没有证据。
- 私有笔记本正文、账号标识、Cookie、RPC 请求体均未采集或记录。
- 未做跨账号隔离、深链接、移动端与深色模式对比。
