# 个人工作台 · 全功能代码评审报告

> **后续状态（2026-10-18）：** 用户已就本报告的关键问题作出三项决定并完成本地实现：邀请码注册/绑定式重置、`/agent` 接入 AgentSession、审核元数据编辑 UI。实现记录、测试与剩余风险见 [`2026-10-18-decision-implementation.md`](./2026-10-18-decision-implementation.md)。本报告保留为决策前的评审快照；发布/验收状态未因此提升。


- 评审对象：`cf-computer-agent` `main` @ `4d00e381b49772867ce545c6fe6e8a91164e2dff`（2026-10-18 22:21 +08:00，工作树干净）
- 评审日期：2026-10-18
- 评审范围：全部登录后功能（知识、检索、问答、Agent、任务、看板、通知、消息、日历、今日、专注、目标、项目、收件箱、图谱、审核发布、管理、身份认证、环境/VM、保留与清理、落地页），以及交互统一性、共享 UI 原语、本地门禁与需求可追溯性
- 评审性质：**只读代码评审**。未修改任何源码/测试/迁移/脚本/既有文档；未读取 `.dev.vars` / `SECRETS_FILE`；未联网、未部署、未提交、未执行生产操作。唯一新增文件为 `docs/review/` 下的评审产物
- 评审基准：`README.md`、`ROADMAP.md`、`docs/product/delivery-status-ledger.md`（99 atoms 唯一权威账本）、`docs/product/2026-09-12-personal-workbench-completion-audit.md`（A01–D08 功能清单）、`docs/product/2026-10-16-authenticated-workspace-interaction-contract.md`（交互契约）、`docs/product/2026-10-18-beui-page-adoption-checklist.md`、`docs/product/workbench-product-maturity-gap-matrix.md` 及各 atom 行内 evidence

---

## 0. 结论（先看这里）

**一句话：本地实现覆盖率与核心闭环质量都相当高（99 个 atom 中实现 done 79、验证 done 83；知识闭环后端、任务协作、管理写操作、GitHub OAuth/Session/HMAC 基本符合要求），但当前不能判定“所有功能符合要求”。**

不成立的原因集中在四类，按严重度排序：

| 类别 | 结论 | 关键事实 |
| --- | --- | --- |
| **① 产品边界与认证安全** | **不符合（P0×3）** | 2026-10-18 新增的开放邮箱密码注册绕过 `ALLOWED_MEMBER_EMAILS`/invitation-only；“忘记密码 = 邮箱 + 新密码”允许任何知道邮箱的人接管账户；未验证注册可抢占 allowlist/bootstrap 管理员邮箱。三者均与 README 首段与 ROADMAP“不做公开注册”硬边界冲突 |
| **② 交互统一性** | **基本符合但不完整（交互相关 P1×5 + P2/P3）** | 30+ 个页面已按交互契约统一（PageHeader / FilterSelect / AppliedFilters / PageState / DataTable / ConfirmAction / FocusScope / reduced-motion），共享原语质量高；但 `/`、`/focus`、`/projects/:id/timeline` 三页 loading/error 整页早返回卸载标题；`/boards` 与 `/notifications` 桌面端丢分页（功能回归）；`/admin/audit` 筛选变化后保留旧行；中文界面仍有硬编码英文；日期与确认模式不统一 |
| **③ 核心功能能力** | **大部分符合，少数名不副实（P1×3）** | 知识主链（提交→解析→审核→不可变 Revision→发布→FTS→引用回读→严格引用问答）真实连通；但 `/agent` 实际是 KB-008 grounded chat，KB-009 的 AgentSession DO+工具链无任何前端入口且 stream 不接地；React 审核 UI 无标题/Space/Collection/Tag/可见性编辑（GOV-004~007 已勾选）；服务端搜索高亮被前端丢弃。保留/清理/评测（RET-001/002/003、EVAL-001 等）仍 pending |
| **④ 门禁与需求追溯** | **不可全信（P2 级但要紧）** | `npm run check` 在 HEAD 退出 0（unit 406 文件/5630 用例、Worker 78 文件/1304 用例、landing 100、smoke 88、i18n 14、delivery 30），但 `npm run audit:workbench-domain` 在 HEAD **退出 1**（`7ef7055a` 新增 `DELETE /api/knowledge/:id/artifacts/:id` 未登记进成熟度清单），且该门禁不在 `npm run check` 链路；`verify:delivery-status` 不校验实现/验证证据路径（WB-A11Y 引用已删除的测试文件仍 30/30 通过）；文档路由数 32/33/34 vs 实际 38/39、迁移 61 vs 78；README invitation-only 与代码自相矛盾 |

**发布/验收维度**（账本实算，被门禁强制）：release `done 0 / partial 29 / pending 70`，acceptance `done 1 / partial 9 / pending 89`。因此即便本地功能大多通过，也**没有任何“当前版本已发布/已验收”的证据**；本报告不构成发布或生产验收结论。

**数字基线（2026-10-18 HEAD 实算）**

| 指标 | 实测 |
| --- | --- |
| 交付账本 atoms | 99（94 个编号行 + 5 个命名 atom：WB-PAGE / WB-SCROLL / WB-ENVIRONMENTS / WB-SETTINGS / WB-A11Y） |
| implementation | done 79 / partial 8 / pending 12 |
| verification | done 83 / partial 3 / pending 13 |
| release | done 0 / partial 29 / pending 70 |
| acceptance | done 1 / partial 9 / pending 89 |
| 功能清单 A01–D08 | 30 原始 / 29 范围内 / **12 已关闭 / 17 未关闭**（A01、A02、A05、A06、B01、B02、B04、B05、B08、B09、C02、C05、C06、D01、D02、D04、D07） |
| 登录后页面模式 | 31 个静态路由（全部 `ready`）+ 7 个参数化页面 = 38；成熟度记录 39 条；`renderPage` 40 个 case |
| D1 迁移 | 78 个文件，0001–0078 连续，哈希被门禁 pin |
| 测试资产 | `test/unit` 目录 407 个文件（本次运行 406 个测试文件 / 5630 用例）、`test/worker` 78 个文件 / 1304 用例、landing 100、smoke 88；账本证据 363 个文件路径，362 存在（缺失 1 个：`test/unit/frontend-menu-keyboard.test.tsx`，WB-A11Y 仍引用） |

---

## 1. 评审方法与边界

### 1.1 组织方式

由 Lead 统一制定基准与严重度，五路并行只读评审（报告见 §9 附录），Lead 独立复核关键结论并实跑全量本地门禁：

| 评审域 | 负责范围 | 报告 |
| --- | --- | --- |
| A 知识核心闭环 | 提交/解析/审核/发布/Revision/检索/阅读/引用问答/Agent/Studio/研究/附件摄取 | `docs/review/area-a-knowledge.md` |
| B 执行与协作 | 任务/看板/通知/消息/日历/今日/专注/目标/项目/收件箱/图谱 | `docs/review/area-b-work.md` |
| C 身份·授权·管理 | 密码认证/GitHub OAuth/Session/HMAC/位图/管理页/审计/统计/环境 | `docs/review/area-c-identity-admin.md` |
| D 交互统一性 | 共享原语/逐页矩阵/筛选/状态/分页/确认/i18n/键盘焦点/结构 | `docs/review/area-d-interaction.md` |
| E 需求追溯与门禁 | 账本统计/证据路径/路由/迁移/契约脚本/文档漂移 | `docs/review/area-e-traceability.md` |

### 1.2 证据强度（诚实标注）

- **静态核对为主**：全仓约 3.8 万行后端 TS + 7.3 万行前端 TS/TSX，五路评审共全文或区间精读约 150+ 文件，其余为定位式抽样；每条发现都带 `file:line`。
- **动态证据有限**：评审员按约定只跑了少量单文件测试（合计约 8 个文件、40+ 用例，全部通过）；Lead 实跑 `npm run check`（结果见 §6）。
- **未覆盖**：真实浏览器（320/375/768/1280、深色主题、真实键盘/Tab 顺序、读屏）、双账号越权旅程、生产环境、远程 D1 schema 状态、真实并发时序、免费层 CPU/配额。凡属这些范围的结论均标注为“静态推导”或“待验收”。
- 本报告中的“符合”均指**本地代码与要求一致且测试文件存在**，不等于发布/验收通过。

---

## 2. 核心功能能力逐域判定

图例：**符合**（本地代码与要求一致，测试存在）｜**部分符合**（主路径可用但存在明确缺口）｜**不符合**（能力与要求不一致）｜**未实现**（pending）。

| # | 功能域 | 要求来源 | 判定 | 关键事实与缺口 |
| --- | --- | --- | --- | --- |
| 1 | GitHub OAuth / D1 Session / HMAC automation | IDN-001/003/006 | **符合** | state+PKCE S256+primary verified email；`__Host-` HttpOnly/Secure/SameSite=Lax；非安全方法同源校验；禁用即时 403；幂等退出；HMAC 覆盖 method/path/query/timestamp/nonce/body hash，300s 窗口 + D1 nonce 防重放，仅 legacy 能力。未发现可利用缺陷 |
| 2 | 邮箱密码自注册/登录/重置 | IDN-007 | **实现符合设计，安全与产品边界不符合** | PBKDF2-SHA256 100k/16B 盐/恒定时间比较、唯一邮箱索引、5 次/15 分钟锁定、每 IP 每小时 5 次成功注册、重置删会话——均按 2026-10-18 规格实现；但开放注册、无所有权证明重置、可抢占 allowlist 邮箱（P0，见 §4） |
| 3 | 知识摄取：提交 → 解析 → 分块 → 审核 → 不可变 Revision → 发布 | KB-001~004、ADM-002/003 | **符合（本地）** | 幂等键 + SourceVersion；parser/chunker + 内容哈希；审核 CAS + 操作回执；DO 正文 + D1 元数据哈希校验；current 单指针原子切换；文件解析在无 R2 时 fail-closed，无半成品 |
| 4 | 检索 / 阅读器 / 精确引用 / 严格引用问答 | KB-005~008 | **部分符合** | 服务端 FTS（仅 current+indexed）、权限重校验、citation 精确回读（含历史 Revision/PDF/Sheet/Slide 位置）、引用 allowlist 与 evidenceQuotes 逐字校验、会话 owner 隔离——均成立；但**服务端高亮被前端数据层丢弃**（A-03），搜索结果只显示纯文本 excerpt |
| 5 | 有界只读 Agent 与可恢复会话 | KB-009 | **不符合（作为产品能力）** | `/agent` 实际调用 `/api/knowledge/chat/stream`（KB-008 链路）；`src/agent` 的 AgentSession DO + 工具带无任何前端消费者（`rg '/api/agent' frontend/` = 0），且其 `/stream` 把问题原样交给模型，无检索、无工具、无引用校验。工具含私有 draft 写，与“只读”表述也不完全一致 |
| 6 | 审核 UI 与发布治理 | GOV-004~007、ADM-002 | **部分符合** | 后端支持发布时覆盖 title/space/collection/tags/visibility 与扩权确认；**React 审核队列/详情没有任何元数据编辑入口**，publish 直接取 preview 原值，管理员无法在 UI 扩大/调整可见性（A-02）。回滚、回收站、最终清理可用；purge 不覆盖 R2 原件（当前无 R2 绑定），与账本 partial 自述一致 |
| 7 | 任务 | TSK-001~011 | **基本符合** | 成员隔离、状态机、子项/依赖、标签/知识关联、幂等写、回执、数字分页齐全；TSK-009/011 账本备注过时（实际已有 tombstone 与前端编辑）。缺口：创建上限 check-then-act 可并发越界（B-05）；保留/清理策略 pending |
| 8 | 看板 | BRD-001~007 | **部分符合** | 四列是任务 API 投影、不建第二权威；键盘移动、乐观回滚、未知移动恢复、逐列空/错态都成立；但**桌面端（≥1024px）每列只能看到前 20 条**——路由未传分页回调，桌面 pager 不渲染且移动 feed 在桌面被禁用（B-01，P1） |
| 9 | 通知 | NTF-001~006 | **部分符合** | 收件人隔离、事件去重、未读汇总、目标撤权、批量已读、过滤 URL 恢复都成立；但**桌面端同样丢失分页**（B-02，P1）；任务状态通知 intent 只在下次状态写入时 drain，无 Cron/兜底重投（B-07）；保留/清理 pending |
| 10 | 上下文消息 | MSG-001~006 | **符合（本地）** | 仅任务/知识上下文建线程（CHECK 约束），participants 不给授权；游标分页 + author+clientKey 幂等发送；撤权/删除触发器收缩 access；401/403/404 清屏并失效并发读 |
| 11 | 日历 / 今日 / 专注 / 目标 / 项目 / 收件箱 / 复盘 / 图谱 | CAL-001、TOD-001、FOC-001、GL-001、PRJ-001、P4-001、INB-001、REV-001、CAP-001、WB-GR-001 | **基本符合** | CRUD/关联/幂等/隔离/摘要/时间线均在；缺口：focus/calendar/goals/projects/timeline 的“同键重试”在服务端不收敛（响应丢失后重放 409，靠前端 journal 恢复，B-06）；图谱节点 `href` 指向不存在的 `/tasks/:id` 等路由（B-08）；CAP-001 分类只有 API、无前端入口且 dismiss 可被再次 classify 复活（B-04）；`/today`、`/review` 初始 401/403 折叠成通用错误（B-10） |
| 12 | 管理：概览/重复/资产/成员/角色/菜单/空间/审计/统计 | ADM-001~012 | **基本符合** | 写操作幂等回执、CAS、逐项批量结果、审计 metadata 白名单、菜单树/空间/角色级联保护、数字分页齐全；缺口：8 个 permission bit 是“幽灵权限”（可分配但从不校验，C-10）；`analytics:read` 与 `audit:read` 双轨（C-12）；系统 admin 角色可分配给 contributor 且 admin 加位无实效（C-11）；被授予 mask 位的 contributor 可读多个管理只读 API（C-07）；`/admin/submissions` 能力表与读取 API 不一致（D-04）；禁用不删会话，重新启用后旧会话复活（C-08）；未认证重置的审计 actor 归因错误（C-14） |
| 13 | 环境 / Browser VM | WB-ENVIRONMENTS | **符合（边界诚实）** | 服务端只有元数据 CRUD + 生命周期事件/墓碑，无启动/终端 API；前端明示 metadata-only 并禁用启动；`VM_SESSION_UNAVAILABLE` fail-closed。潜在缺陷：`vm:use` 永不由 `/api/session` 签发，导致 VM 启动前哨必然失败（当前被“VM 未启用”掩盖，D-10） |
| 14 | 保留 / 清理 / 评测 / 维护 / 研究 | RET-001~003、EVAL-001、OPS-*、研究 run | **部分符合或未实现** | 账本自述 pending 的保留/清理/评测未完成；维护协调器、研究运行、标签治理、评审评论、admin-summary、operations、indexing 等模块**没有独立账本 atom**（E 报告 §未登记清单），其中研究/衍生物 UI 已在阅读器交付但未入账本，违反“先入总账再实施”的治理规则 |
| 15 | 匿名落地页 / 登录页 / 设置 | README、WB-SETTINGS | **基本符合** | 3D 演示 + 静态降级存在；登录页双语、注册/重置/错误映射可用；设置页账户只读 + 主题 + 语言；主题与语言持久化有失败恢复。缺口：登录页 `githubEnabled` 恒为 true（未读 `/api/auth/providers`），未配置 OAuth 时点击得到 503（C-22）；设置页无已登录改密入口（C-15） |

---

## 3. 交互统一性专项（用户重点关注）

### 3.1 已经统一的部分（结论：共享原语质量高）

| 契约维度 | 实现 | 覆盖情况 |
| --- | --- | --- |
| 页头唯一 `<h1>` | `frontend/components/ui/page-header.tsx` | 30+ 页使用共享 `PageHeader`（源码 68 处引用含导入）；除 3 个未迁移页与公开/登录面外，逐页恰好一个 h1 |
| 页面状态 | `PageState`：`data-page-state` + loading `aria-busy` + error/forbidden `role="alert"` + degraded `role="status"` | 40+ 处页面/面板统一使用；错误就地而非页级 toast |
| 筛选控件 | beUI combobox 适配层 `FilterSelect` + `AppliedFilters`（可逐项移除/清空、URL 条件可见） | **全仓 0 个原生 `<select>`**；legacy audit 也会拦截 |
| 数据表格与分页 | `DataTable` + `DataPagination` + `numbered-page`（桌面表尾分页、移动 scroll-feed） | 任务/知识/搜索/审核/资产/成员/审计/统计/我的提交等已接线 |
| 危险操作确认 | `ConfirmAction` / `TypedConfirmAction` / `HoldActionButton` | 30+ 确认点；仅 2 处例外（D-09） |
| 焦点与键盘 | `useFocusScope`（初始焦点/Tab 环/Escape/焦点恢复）+ `MotionConfig reducedMotion="user"` + `globals.css` 兜底 | dialog/sheet/popover/命令面板一致 |
| 代码卫生 | 前端源码无 `any`/`ts-ignore`/`TODO`/`console`（仅 vendored tooltip 一处 `console.warn`）、无原生 `<select>` | 扫描通过 |

### 3.2 仍未统一 / 违反契约的部分（按严重度）

| ID | 严重度 | 问题 | 位置 | 影响 |
| --- | --- | --- | --- | --- |
| **B-01** | **P1** | `/boards` 桌面端每列永久停在第 1 页 20 条 | `frontend/app.tsx:3554-3566` + `frontend/pages/boards/boards-page.tsx:142-147` + `frontend/components/data-table.tsx:72,102` | 桌面 pager 不渲染（缺 `onPageChange/onPageSizeChange`），移动 feed 在桌面被禁用；第 21 条起不可达。账本 BRD-004“完整数字分页/URL 独立”不实 |
| **B-02** | **P1** | `/notifications` 桌面端只能看到前 20 条 | `frontend/app.tsx:3116-3126` + `frontend/pages/notifications/notifications-page.tsx:61,154` | 页脚仅在传入两个回调时挂载，路由只传 `onLoadMore`；桌面滚动加载又被 `if (desktop) return` 跳过。NTF-003 不实 |
| **D-01** | **P1** | `/`、`/focus`、`/projects/:id/timeline` loading/error 整页早返回卸载标题 | `home-page.tsx:75-76`；`focus-page.tsx:66-67`；`project-timeline-page.tsx:28-29` | 违反交互契约 §2.1/§2.3；时间线连返回按钮一起消失；三页同时**未使用 PageHeader**，标题字号/结构与环境其余页面分叉（D-07） |
| **D-02** | **P1** | `/admin/audit` 筛选变化失败仍展示上一条件的行 | `frontend/app.tsx:4367` | 违反契约 §2.2；其他列表（tasks/knowledge/inbox/members/assets）已正确清行，仅审计这份手写逻辑漏了 |
| **D-03** | **P1** | 中文界面出现硬编码英文筛选标签/选项 | `tasks-page.tsx:148-151`；`admin/audit-page.tsx:19-24`；`admin/asset-queue-page.tsx:39-44`；`admin/members-page.tsx:119-124` | 采用清单要求 en/zh 键；`verify-i18n` 只扫 legacy `public/`，漏掉应用内联目录的硬编码 |
| D-06 | P2 | 交互契约矩阵声称 `/goals`、`/projects` 有 FilterSelect+AppliedFilters，代码不存在 | 契约 `:54`；`goals-page.tsx:45-70`；`projects-page.tsx:38-75` | 评审基准本身失真，后续容易被误判为回归 |
| D-08 | P2 | 日期时间展示不统一：同一产品既有本地化格式也有原始 ISO | `notifications-page.tsx:134`、`thread-page.tsx:157`、`knowledge-page.tsx:44` 等 vs `tasks-page.tsx:125`、`inbox-page.tsx:91` | 中文界面显示 `2026-10-18T12:34:56.000Z`；时间线 `toLocaleString()` 未传 locale |
| D-09 | P2 | 确认模式不统一：回滚用行内两段式、知识分享用 `window.confirm` | `admin/knowledge-item-page.tsx:153-164`；`components/knowledge/knowledge-share-button.tsx:24` | 与其余 30+ 处 beUI 确认控件不一致；原生 confirm 不受焦点/键盘/可访问名控制 |
| D-04 | P2 | `/admin/submissions` 路由能力 `knowledge:review` 与队列读取 API `submission:read-all` 不一致 | `shared/workspace-route-capabilities.ts:77`；`src/routes/admin.ts:253-254` | 自定义角色下“可见→403”或“隐藏→可用” |
| D-10 | P2 | `vm:use` 能力永不签发，环境启动前哨必然失败 | `frontend/features/environments/authenticated-vm-runtime.ts:32`；`src/authorization/policy.ts:22-44` | 当前被 VM 未启用掩盖，接入引擎后会拦住所有启动 |
| D-12 | P3 | 三套分页语义并存（DataTable、cursor“加载更多”、自绘消息 pager） | `data-table.tsx`；`recycle-bin-page.tsx:185`；`messages/thread-page.tsx:202-205` | 外观/总数文案/播报不一致；可接受但应登记为例外 |
| D-16 | P3 | 侧栏分组展开/收起 `aria-label` 硬编码英文 | `components/shell/app-shell.tsx:246` | 中文界面读屏混合语言 |

### 3.3 逐页结论

- `docs/review/area-d-interaction.md` 给出 39 行逐页矩阵（壳常驻 / h1 / 筛选 / 五态 / 分页 / 确认 / 键焦 / i18n）。
- 汇总：**30+ 个页面壳常驻并正确使用共享页头/筛选**；3 个页面 ❌（`/`、`/focus`、`/projects/:id/timeline`）；2 个页面 ⚠️（`/environments` forbidden 分支换掉页头但当前不可达；`/admin/knowledge/trash` 用表外“加载更多”）。`/boards`、`/notifications` 的组件层状态齐全，但**路由装配层漏接线**导致桌面分页不可用（B-01/B-02）。
- **判断**：交互统一属于“**共享层已达标、装配层不完整**”。问题不在 `PageHeader`/`PageState`/`FilterSelect`/`DataTable` 这些原语，而在各路由容器的接线与三页未迁移的旧实现；`app.tsx` 4664 行、5 份手写“筛选键变化→清行”逻辑是根因（D-11）。建议抽 `useNumberedListQuery({ key, load, keepOnRefreshFailure })` 与 `useSessionIdentityKey()` 收敛，并把剩余 27 个路由容器移出 `app.tsx`。

---

## 4. 关键发现汇总（P0 / P1）

> 每个发现均可按 `file:line` 复核；详细论证见对应域报告。严重度定义：P0=认证/授权/隐私/数据正确性破坏或违反产品硬性边界；P1=需求未满足、主要交互不一致、用户可感知错误。

### 4.1 P0（3 项，全部来自 2026-10-18 新密码认证）

| ID | 标题 | 位置 | 要求 | 事实 | 建议 |
| --- | --- | --- | --- | --- | --- |
| **C-01** | 开放自注册绕过 allowlist/invitation-only | `src/routes/auth.ts:97-113`；`src/password/service.ts:53-98`；`README.md:3,39`；`ROADMAP.md` 产品边界 | README“Access is invitation-only”；IDN-004；ROADMAP“不做公开注册” | `/auth/register` 只校验格式/密码策略/D1 唯一性，不读 `ALLOWED_MEMBER_EMAILS`，直接创建 active contributor 并下发会话。测试夹具 allowlist 仅含 bootstrap 邮箱，却用外部邮箱断言 201——测试本身证明边界失效。同一 README 首段与后文互相矛盾 | 产品裁决：若保留开放注册，需书面接受并同步 README/ROADMAP/IDN-004；若坚持邀请制，注册前校验 allowlist 或独立邀请表 |
| **C-02** | 忘记密码仅凭“邮箱+新密码”即可接管账户 | `src/password/service.ts:138-173`；`src/routes/auth.ts:115-122`；设计规格 §决策 2 | 认证安全 | 重置只判断“有 password_hash 或 access_sub 以 code: 开头”，不要求旧密码、会话、邮件/验证码/恢复码；任何知道邮箱的人都可覆盖密码并删除该成员全部会话。设计文档自述“已知边界”，但安全效果等同认证绕过 | 恢复邮箱所有权证明（magic link/一次性 token）；或改为已认证会话内改密/管理员重置；至少补限流与审计来源 |
| **C-03** | 未验证注册可抢占 allowlist/bootstrap 邮箱，管理员永久丢失 | `src/password/service.ts:53-66`；`src/members/service.ts:61-77,129-160` | IDN-004 bootstrap admin/allowlist | 注册不拒绝 allowlist/`BOOTSTRAP_ADMIN_EMAIL` 邮箱；真管理员首次 GitHub 登录时先过 allowlist，再 `findByCanonicalEmail` 命中抢占记录 → `linkExistingIdentity`（保持 contributor/密码不变）。结果：系统仍无 active admin（不再触发 bootstrap 提升），攻击者保留密码可持续登录同一记录 | 注册拒绝 allowlist/bootstrap 邮箱；GitHub link 仅限明确安全场景或需管理员确认；bootstrap 提升改为按邮箱独立判定并对已存在记录一次性升级 |

### 4.2 P1（12 项）

| ID | 标题 | 位置 | 影响 |
| --- | --- | --- | --- |
| **B-01** | 看板桌面端丢分页，每列截断 20 条 | `app.tsx:3554-3566`；`boards-page.tsx:142-147`；`data-table.tsx:72,102` | 核心功能不可达；BRD-004 账本不实 |
| **B-02** | 通知桌面端丢分页，收件箱只剩 20 条 | `app.tsx:3116-3126`；`notifications-page.tsx:61,154` | `summary.unread` 可大于可见条数且无入口查看；NTF-003 不实 |
| **A-01** | `/agent` 名不副实：AgentSession DO/工具链无前端入口，stream 不接地 | `frontend/lib/agent-data.ts:165`；`src/routes/agent.ts:83-88`；`src/app.ts:357-365` | KB-009 作为产品能力不符合；用户以为在与知识库对话，实际是无检索的裸模型流 |
| **A-02** | React 审核 UI 无发布元数据编辑 | `frontend/components/review/review-detail-data.ts:44-49`；`src/routes/admin-review.ts:246-262` | 管理员无法改标题/Space/Collection/Tag/可见性，扩权确认 UI 不可达；GOV-004~007 勾选不实 |
| **A-03** | 服务端 FTS 高亮被前端丢弃 | `src/library/search-policy.ts:64-68`；`frontend/lib/search-data.ts:31-46` | KB-007“高亮”在 current UI 不成立；证据指向未进 Vite 构建的 `public/workspace-ui.js` |
| **D-01** | 三页 loading/error 卸载页头 | `home-page.tsx:75-76`；`focus-page.tsx:66-67`；`project-timeline-page.tsx:28-29` | 违反交互契约 §2.1；三页标题/返回按钮消失且未用 PageHeader |
| **D-02** | 审计筛选变化失败保留旧行 | `app.tsx:4367` | 违反契约 §2.2，展示“旧条件的答案” |
| **D-03** | 中文界面硬编码英文筛选 | `tasks-page.tsx:148-151` 等 4 处 | 违反 en/zh 要求；i18n 门禁有盲区 |
| **C-04** | 登录/重置无 IP 限流；409 可枚举邮箱；PBKDF2 可被匿名消耗 | `src/password/service.ts:100-155`；`src/password/repository.ts:64-69` | 免费层 CPU 滥用、邮箱枚举、暴力/重置探测无成本 |
| **C-05** | 锁定过期不清计数，一次错误即再锁 15 分钟；可被重置清锁 | `src/password/repository.ts:96-105`；`service.ts:107-130,156-171` | 知道邮箱即可周期性锁死受害者（持久 DoS） |
| **C-06** | `ALLOWED_MEMBER_EMAILS` 不再是撤权通道 | `src/password/service.ts:100-136`；README/手册仍称白名单 | 运维误以为移除邮箱即撤权，实际只影响 GitHub 登录 |
| **C-07** | “管理组非 mask 授权”只在导航层实现 | `src/routes/navigation.ts:24-31`；`src/routes/admin.ts:112,136,218,353,453` | 被授予 mask 的 contributor 可读成员/审计/统计/资产/重复/投稿等管理只读 API，但导航看不到管理组 |

---

## 5. 中等与轻微问题（P2 / P3 摘要）

### 5.1 知识域（A）

- A-04（P2）`/my-submissions` 状态标签比较 `needs_revision`，但枚举值是 `revision_requested` → 用户会看到原始英文 token。
- A-05（P2）阅读器非 ready 态头部 `Ask` 链接带空 knowledgeItemId，点击必然进入 Agent scope 错误页（`Discuss` 有守卫，`Ask` 没有）。
- A-06（P2）Studio 产物固定绑定 `currentRevision` 而非生成时阅读的历史修订；历史修订生成后可能读回 404，审计修订号也不实。
- A-07（P2）回收站最终清理不覆盖 R2 原件（当前无绑定，账本已承认）。
- A-08（P2）发布/索引恢复只有管理员手动入口；Cron 只扫资产且无 R2 时直接跳过。
- A-09（P2）研究 run 重复 approve/pause/cancel 返回 404 而非幂等/409；`recordQuery` 不校验 resultIds；研究/衍生物 UI 未入账本。
- A-10（P2）Studio 交付后 ROADMAP 退出标准未勾选、retention 文档仍称 pending、缺口矩阵仍列开放 P0，与账本 KB-013 acceptance done 不一致。
- A-11（P3）Studio 损坏 payload JSON 未映射受控错误，会冒泡成通用 500。

### 5.2 执行协作域（B）

- B-03（P2）分页门禁只做文件级正则，`frontend/app.tsx` 只要任意一处 `onPageChange=` 即通过，B-01/B-02 这类路由漏接线无法被发现。
- B-04（P2）CAP-001 分类建议无前端入口；`dismiss` 后再次 `classify` 会复活为 suggested，不是稳定终态。
- B-05（P2）任务创建上限 check-then-act，无 SQL 容量谓词，可并发越界。
- B-06（P2）focus/calendar/goals/projects/timeline 的状态转移先版本 CAS 再判目标态，响应丢失后同键重试 409，只能靠前端 journal 恢复。
- B-07（P2）任务状态通知 intent 只在下次状态写入时 drain；Cron 不扫，一次 emit 失败可能永久悬挂。
- B-08（P2）图谱节点深链指向 `/tasks/:id`、`/projects/:id` 等不存在路由，inspector 渲染为可点链接，点击即 NotFound。
- B-09（P2）账本双向漂移：BRD-004/NTF-003 夸大；TSK-009/TSK-011/CAL-001 低估（代码已实现但备注仍 pending）。
- B-10（P3）`/today`、`/review` 初始 401/403 折叠为通用加载错误，无 forbidden/revoked 面。
- B-11（P3）越界页码返回“空列表 + 正总数”，前端无 clamp。
- B-12（P3）日界按 UTC，与本地时区用户的“今天”不一致，且未登记为用户可见边界。

### 5.3 身份·授权·管理（C）

- C-08（P2）禁用成员不删会话：重新启用后旧 token（≤7 天）复活。
- C-09（P2）自定义角色 `knowledge:review` 可打开 `/admin/submissions`，但审核 API 还要求 `role==="admin"` → 页面可达却必然 403。
- C-10（P2）8 个 permission bit 可分配但从不校验（幽灵权限）：`knowledge:create/edit/publish/delete`、`asset:manage`、`duplicate:review`、`agent:use`、`search:use`。
- C-11（P2）系统 admin 角色可分配给 contributor（只得到部分 mask）；admin 角色加位无实效。
- C-12（P2）`analytics:read` 与 `audit:read` 双轨：菜单 seed/角色矩阵/策略一处、路由/API 一处。
- C-13（P2）PBKDF2 100k 低于 OWASP 当前建议，且免费层 CPU 未压测。
- C-14（P2）未认证重置的审计 actor 记成受害者本人；注册写 `member.login` 语义错误。
- C-15（P2）重置不看成员状态（禁用成员可重置）；无“已登录会话内改密”路径。
- C-16（P2）注册限流只计成功、缺失 IP 时共享 unknown 桶。
- C-17（P2）0078 直接 `DROP TABLE`，与“migration 只追加/不靠删表回滚”的手册表述冲突。
- C-18（P2）IDN-007 证据文档过期且自相矛盾（仍列 0079/恢复码/count=79，实际 78）。
- C-19（P2）访客哈希无密钥（`sha256(day|ip|ua)`），可离线反推 IPv4+UA；管理端返回 UA 与 /24 IP。
- C-20~C-23（P3）审计筛选列表与后端动作漂移、HMAC canonical 不含 host、登录页 `githubEnabled` 恒 true、历史字段/注释残留。

### 5.4 交互与结构（D）

- D-04、D-05、D-06、D-08、D-09、D-10、D-11、D-12、D-13、D-14、D-15、D-16 见 §3.2 与 `area-d-interaction.md`。其中 D-05（双 i18n 目录 + `verify-i18n` 只扫 legacy + 硬编码扫描漏 `frontend/`）与 D-11（app.tsx 4664 行、5 份手写筛选清行）是根因级问题。

### 5.5 需求追溯与门禁（E）

- **E-1（要紧）** `npm run audit:workbench-domain` 在 HEAD 失败：`shared/workbench-maturity-capabilities.ts:1278/1282` 漏登记 `7ef7055a` 新增的 `DELETE /api/knowledge/:id/artifacts/:id`（以及 artifacts GET 路径）；其自身测试 20 例失败。该门禁**不在** `npm run check` 链路，因此“完整 check 通过”不代表领域审计通过。
- **E-2（要紧）** `verify:delivery-status` 30/30 通过但**不校验实现/验证证据路径是否存在**（只校验 release/acceptance 的 dated-file）；WB-A11Y 引用已被 `496425af` 删除的 `test/unit/frontend-menu-keyboard.test.tsx` 仍通过。
- **E-3** 文档计数系统性滞后：路由实际 38 页面模式/39 成熟度记录 vs 文档 32/33/34；迁移实际 78 vs README/ROADMAP/完成审计多处 `count=61`。
- **E-4** README 内部矛盾：首段“invitation-only” vs 后文“self-register”；“no email-based reset” vs “A forgotten password is replaced directly from its registered email and a new password”。ROADMAP 仍写“不做公开注册”。
- **E-5** 代码有、账本/成熟度无登记：`src/maintenance`、`src/research`、`src/tags`、`src/review-comments`、`src/admin-summary`、`src/operations`、`src/indexing`、`src/goal-tasks`（部分）、`src/agent/sessions` API、`src/capture` API。
- **E-6** 账本/契约状态与代码不同步：TSK-009/011、CAL-001 低估；GOV-004~007、KB-007 高估；ROADMAP/账本头部时间戳仍为 09-23。
- **E-7** `0078` 破坏性 DROP 与手册/账本“只追加、可恢复”表述冲突；证据文档自述无回滚点。
- **E-8** 功能清单当前 29/12/17，但 ROADMAP/完成审计多处仍写 29/5/24（门禁只强制 `## 当前计数` 一节，历史段落未更新）。

---

## 6. 本地门禁与测试实测

### 6.1 Lead 实跑：`npm run check`

`npm run check` = `vendor:check && types:check && typecheck && typecheck:landing && npm test && build`（`package.json:34`）。

Lead 在 HEAD `4d00e381` 上完整实跑，**退出码 0**：

| 阶段 | 结果 |
| --- | --- |
| `vendor:check` | 通过（markdown-it 15.0.0 / dompurify 3.4.14 指纹匹配） |
| `types:check` | 通过（wrangler 绑定类型无漂移） |
| `typecheck` | 通过（Worker `tsc --noEmit` + 前端 TSX） |
| `typecheck:landing` | 通过 |
| `test:smoke` | 88/88 pass（node --test 的 14 个契约文件） |
| `test:i18n` | 14/14 pass（**仅 legacy `public/` 目录**） |
| `verify:delivery-status` | 30/30 pass（**不校验实现/验证证据路径**） |
| `test:unit` | **406 文件 / 5630 用例通过** |
| `test:worker` | **78 文件 / 1304 用例通过**（Workerd/D1） |
| `build` | 通过：`build:ui`（Vite）+ `verify:landing` 100/100 + 构建产物 secret 扫描 + legacy audit + `wrangler deploy --dry-run`（上传 1708.68 KiB / gzip 324.30 KiB） |

> 运行中出现的 `Failed to write to log file ... EPERM ... /Users/.../.wrangler/logs` 是沙箱不允许写用户目录调试日志导致的 wrangler 告警，**不影响命令退出码与测试结果**（每个阶段内均继续执行并完成）。
>
> **重要边界**：`npm run check` **不包含** `verify:workbench-maturity` 与 `audit:workbench-domain`（`package.json:13/14/34/52/53`），而 `audit:workbench-domain` 在 HEAD 是红的（见 §6.2）。因此“check 退出 0”只能证明 check 覆盖的合同通过，不能推出“成熟度/领域审计通过”，也不能证明所有功能符合要求。

### 6.2 评审员实跑的脚本级门禁（HEAD `4d00e381`）

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `node scripts/functional-checklist-audit.mjs` | 0 | 30 原始 / 29 范围内 / 12 已关闭 / 17 未关闭 |
| `npm run verify:delivery-status` | 0 | 30/30 pass（但不校验实现/验证证据路径） |
| `npm run verify:workbench-maturity` | 0 | 15/15 pass |
| `npm run audit:workbench-domain` | **1** | `workbench-knowledge-reader: mutation declarations must map one-to-one to generated facts`（多出 `DELETE /api/knowledge/:id/artifacts/:id`） |
| `node --test scripts/workbench-domain-audit.test.mjs` | **1** | 20 个用例受影响，均源于同一 manifest 漏登记 |
| `node scripts/frontend-operation-inventory.mjs --check` | 0 | 475 源文件 / 1760 候选；非运行时验收 |
| `node scripts/verify-i18n.mjs` | 0 | legacy `public/`：434 keys / 55 placeholders / 6 files；**不覆盖应用内联目录与硬编码扫描** |
| `node scripts/wcag-contract.mjs` | 0 | 通过 |
| `node --test scripts/paged-list-contract.test.mjs scripts/frontend-app-contract.test.mjs scripts/frontend-typecheck-contract.test.mjs` | 0 | 17 pass / 0 fail |
| `node scripts/frontend-legacy-audit.mjs` | 0 | 无 legacy 引用；页面/共享组件均使用 beUI 原语 |
| `node scripts/verify-m1-migrations.mjs --files` | 0 | `migration-files count=78` |

### 6.3 评审员的单文件测试（不作为全量证据）

知识域 2 文件（5 用例）、协作域 2 文件（25 用例）、身份域 1 文件（12 用例）通过；但多为组件层/服务层用例，恰好绕过 B-01/B-02 的路由装配盲区（boards/notifications 路由测试均 `stubListViewport(..., "mobile")`）。

### 6.4 结论

- 本地单测/组件测试覆盖较强，但**门禁存在三个盲区**：① `workbench-maturity` 与 `workbench-domain` 不在 `check` 链路，且后者当前红；② `paged-list-contract` 不按路由断言，桌面视口在路由层零覆盖，导致 B-01/B-02 通过所有门禁；③ `verify:delivery-status` 不校验验证证据路径，删掉的测试文件不会让账本变红。
- `npm run check` 全绿也只能证明“check 覆盖的合同”通过，不能证明“所有要求符合”。

---

## 7. 直接回答“功能是否符合要求”

### 7.1 符合（本地实现）

- GitHub OAuth（state/PKCE/verified primary email）、D1 哈希 Session、同源写保护、幂等退出、禁用即时 403、HMAC automation 最小权限。
- 知识主链后端：提交幂等、确定性解析分块、审核 CAS/回执、不可变 Revision、current 原子切换、FTS 权限检索、citation 精确回读、严格引用问答与拒答。
- 成员隔离、跨成员 404、审计 metadata 白名单、任务/消息/通知/日历/专注/目标/项目/收件箱/复盘的 owner-scoped SQL 与幂等写。
- 管理写操作：成员状态 CAS+重放、角色/菜单并发、资产/回收回执、批量审核逐项结果。
- VM/环境边界诚实（metadata-only，不伪装可用）。
- 共享 UI 原语（PageHeader/PageState/FilterSelect/AppliedFilters/DataTable/ConfirmAction/FocusScope/reduced-motion）质量高；30+ 个页面已统一。

### 7.2 部分符合

- 交互统一：共享层达标、装配层不完整（3 页早返回、2 处桌面分页回归、审计陈旧行、i18n 硬编码、日期/确认不统一）。
- 审核与发布：后端能力齐、UI 缺元数据编辑与扩权确认。
- 检索：服务端能力齐、前端丢弃高亮。
- 权限体系：位图/角色/菜单/审计实现扎实，但存在幽灵权限、双轨 bit、导航与 API 不一致、管理只读 API 越过“管理组”语义。
- 保留/清理/评测：账本 pending，代码有部分基础设施但无产品闭环。

### 7.3 不符合 / 未实现

- `/agent` 作为“有界只读 Agent”不符合：KB-009 的 DO/工具链没有前端入口，`/agent` 实际是 KB-008 grounded chat 且 stream 未接地。
- 开放注册 + 无所有权证明重置 + allowlist 邮箱抢占：与产品硬边界和基本认证安全不符。
- 保留/清理（RET-001/002/003）、评测（EVAL-001）、部分管理/研究/维护能力未完成或未登记。

### 7.4 需要用户/产品裁决的三件事

1. **是否接受“开放注册 + 无邮箱验证重置”**？若接受，需书面记录风险并同步 README:3、ROADMAP“不做公开注册”、IDN-004 与运维手册；若不接受，需在发布前恢复邀请/allowlist 或邮箱所有权验证。**在裁决与修复前，不建议把 IDN-007 视为可发布能力。**
2. **KB-009 的定位**：把 `/agent` 改为真正调用 AgentSession 工具协议（服务端回合含检索/工具/引用校验），还是把 KB-009 降级为 partial 并承认 `/agent` 是 KB-008 入口。
3. **GOV-004~007 的定位**：补 React 审核元数据编辑 UI，还是把 checklist 降级为“仅 API 能力”。

---

## 8. 修复优先级建议

### 批次 0（发布前必须，P0）

1. 裁决并修复 C-01/C-02/C-03：注册 allowlist/邀请约束、邮箱所有权验证（或书面接受 + 限流 + 审计）、拒绝 allowlist/bootstrap 邮箱注册、GitHub link 安全路径。
2. 同步 README/ROADMAP/IDN-004/运维手册的边界表述，消除 invitation-only 与开放注册的矛盾。
3. 为 `/auth/{register,password,password/reset}` 加 IP+账户双维度限流，把失败/被拒尝试计入；重置审计记录来源（C-04/C-14/C-16）。

### 批次 1（发布前应修，P1）

4. 修复 B-01/B-02：`BoardsRoute` 与 `NotificationsRoute` 传入 `onPageChange/onPageSizeChange`（或桌面接 `onLoadMore`），补 desktop 路由测试（≥21 条、断言 page=2 请求）。
5. 修复 D-01：三页改为“页头常量 + 内容区三态”，统一 `PageHeader`。
6. 修复 D-02（审计条件变化清旧行）与 D-03（可见筛选文案 i18n）。
7. 决定 `/agent` 与审核 UI 的走向（A-01/A-02），要么实现要么降级账本/清单。
8. 补搜索高亮到 React 搜索页（A-03）。
9. 修 C-05（锁定计数/DoS）、C-06（allowlist 撤权语义）、C-07（管理只读 API 与导航一致）。

### 批次 2（质量与一致性，P2）

10. 补 domain 清单并纳入 `check`：`shared/workbench-maturity-capabilities.ts` 登记 artifacts GET/DELETE，重新生成领域证据，使 `audit:workbench-domain` 在 HEAD 转绿（E-1）。
11. 扩展 `verify:delivery-status`：校验实现/验证证据路径存在性（E-2）；修复 WB-A11Y 失效证据。
12. 抽 `useNumberedListQuery`/`useSessionIdentityKey`，收敛 `app.tsx` 的 5 份筛选清行逻辑与 12 份 identity key（D-11）。
13. 统一日期格式化与确认模式（D-08/D-09）；修复 D-04/D-10 权限探针；清理幽灵权限/双轨 bit（C-10/C-12）；补任务创建容量谓词（B-05）与通知 intent 兜底 drain（B-07）。
14. 更新路由/迁移计数（38/39、78）、账本低估项（TSK-009/011、CAL-001）、未登记模块（E-3/E-5/E-6）。

### 批次 3（文档与整洁，P3）

15. 清理死代码（`useInitialReadRetry`、`LegacyHomePage`、`asset-state.ts`、`context-menu.tsx`）、更新采用清单/契约中已不成立的“原生 select/无 h1”表述、统一图表 token、修复硬编码 aria-label。
16. 更新 0078 的回滚/归档策略与 IDN-007 证据文档（C-17/C-18/E-7）。

---

## 9. 附录

### 9.1 评审产物

- 知识核心闭环：`docs/review/area-a-knowledge.md`
- 执行与协作：`docs/review/area-b-work.md`
- 身份·授权·管理：`docs/review/area-c-identity-admin.md`
- 交互统一性：`docs/review/area-d-interaction.md`
- 需求追溯与门禁：`docs/review/area-e-traceability.md`

### 9.2 复跑命令

```bash
# 全量本地门禁（本报告 §6 实跑）
npm run check

# 脚本级门禁（其中 audit:workbench-domain 在 HEAD 预期失败）
node scripts/functional-checklist-audit.mjs
npm run verify:delivery-status
npm run verify:workbench-maturity
npm run audit:workbench-domain
node --test scripts/workbench-domain-audit.test.mjs
node scripts/frontend-operation-inventory.mjs --check
node scripts/verify-i18n.mjs
node scripts/wcag-contract.mjs
```

### 9.3 覆盖局限（必须与结论一起阅读）

- 未做真实浏览器/设备、深色主题、真实键盘/触屏、双账号、生产环境与远程 D1 验证；所有“权限一致/交互常驻/桌面分页”结论来自静态阅读与既有测试，未用真实会话复验。
- 未逐行审计全部 38 个页面与 1760 个操作候选；风险最高的 `app.tsx` 仅覆盖相关装配段。
- 未验证并发时序（CAS、nonce、唯一索引、批量回执）在真实 D1 并发下的行为。
- 未评估免费层 CPU/配额与 PBKDF2 新端点的真实成本；OPS-009 仍为发布前复核项。
- 本报告不构成发布、部署或生产验收结论；发布/验收状态只以账本 dated evidence 为准。
