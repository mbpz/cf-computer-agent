# 功能 checklist 续作 — 2026-09-26

## 当前状态（2026-09-28）

A03/A04 的分类与原 R1 映射核对现已完成，canonical **29 范围内 / 3 关闭（A03、A04、B03）/ 26 未关闭**。运行 `npm run audit:functional-checklist` 实算；下面各日期段落的 1/28 是当时状态，不能再作为当前计数。详见[30 项关闭条件与 33 页面分类](./2026-09-28-functional-closure-reconciliation.md)。

## 范围与状态（以下保留历史记录）

延续 `codex/functional-checklist-completion`，上一批提交 `1ac279a`。原 30 个父项，排除 D08 生产部署后本轮 29 项；首批完成 A02/D02 的有界子项；本页追加 B03 批次后，本轮 29 项中已关闭 1 项（B03）、余 28 项。仅本地实现、验证、提交；没有 push、部署、迁移、生产写入、备份或 Secret 读取。

## 本批实际修复

- 审核重放请求先校验 ID/action，再由三个明确端点重建目标，必须与已保存的 path 一致才发请求；保留原始 body，合法重试的字节载荷不变。
- 审计解析器仅接受同一函数直接声明的 const 初始化值和有限条件分支；不解析可变变量、对象字段、别名链、循环或被内层作用域遮蔽的变量。一个不受支持的分支就拒绝整项，不增加端点白名单。
- 新的 2026-09-26 领域快照覆盖当前 33 能力。旧 D02-R1 等快照保持原样；图谱三个动作仍是 gap，补齐唯一负责人、缺口矩阵和 R8 计数，不宣称已获得动作重放证据。

## RED → GREEN 和验证

- 审核回归实现前：5 failed / 25 passed；旧代码对不一致目标先发送请求，甚至接受外站目标。
- 审计回归实现前：无法解析 path；实现后精确枚举三个决定端点。详情页另有评论 POST，保留该真实操作，不把它从审计删除。
- `rtk proxy npx vitest run test/unit/frontend-review-detail-data.test.ts test/unit/frontend-review-detail-route.test.tsx test/unit/frontend-review-detail.test.tsx`：3 文件 61/61 通过。
- `rtk proxy node --test scripts/workbench-domain-audit.test.mjs`：26/26 通过，包含可变/不透明/循环/遮蔽及额外未声明端点反例。
- `npm run verify:workbench-maturity`：13/13 通过。
- `npm run audit:workbench-domain`：通过，检查新快照。
- `npm run typecheck`、`npm run build:ui`：通过；构建仍有 chunk 大于 500 kB 警告。
- `npm run verify:delivery-status`：30/30 通过。

以上为定向本地回归，不是全仓测试、真实浏览器或生产验收。原运维 R09 与备份不阻塞继续本地功能。该批之后进入已获用户确认的 B03 附件可用性契约，结果见下；B04/B05 的实际上传、恢复、取消和解析回读仍未闭环。


## B03 — 附件可用性契约（本地已完成）

用户确认的范围：认证成员且具有 `submission:create` 能力才可读取；返回配置状态、禁用原因、单文件限制；前端区分未配置与读取失败并支持重试。不新增收费存储，也不因检测到 binding 就提前开放实际上传。

- 本地配置核对：`wrangler.jsonc` 未声明 `ORIGINALS` R2 binding；`src/app.ts` 保留可选 binding。测试配置单独注入本地 R2，不能推断线上是否配置或健康。
- `GET /api/assets/availability` 放在动态资产 ID 路由之前；只返回 `{storageEnabled, reason, maxBytes}`，`reason` 为 `null` 或 `ASSET_STORAGE_NOT_CONFIGURED`。只读配置，不查询 D1 资产/容量，不访问 R2，不返回桶名、对象键、凭据或成员数据。会话鉴权可能沿用既有会话维护，不将整个 HTTP 请求宣称为绝对无写入。
- 既有权限策略仍适用：contributor 的兼容能力包含提交能力；未改变 role/mask 组合规则。未登录 401、停用成员 403、automation 403，查询参数 400、非 GET 405。响应保持 no-store。
- `maxBytes` 为服务与 HTTP 限制的较小值（默认 10 MiB），不是管理员的总容量。既有上传总量/容量保护保留，当前契约不承诺剩余空间或成功上传。
- 主提交页展示 loading、未配置、已配置但未接线、读取失败。失败可手动重试，快速重复点击只发一次 GET；卸载/切换成员取消旧请求并忽略晚到结果，不缓存其他成员状态。中英文文案，错误不泄露内部消息；文本提交保持可用。真实上传尚未接线，所有状态下文件选择均禁用。
- 新端点与测试已写入成熟度 manifest 并更新当前 33 能力领域审计快照；未提升整体提交能力的 release/acceptance 状态。

### 本轮实际验证

先 RED 后 GREEN：初始 service 无 `availability()`、GET 被动态 ID 路由匹配而 404、前端 loader 不存在、DOM 四个场景失败；实现后以下定向回归通过。停用成员断言按既有 `MEMBER_DISABLED` 403 契约校正，未改鉴权行为。

```sh
rtk proxy npx vitest run test/unit/assets-service.test.ts test/unit/member-asset-availability.test.ts test/unit/frontend-asset-availability.test.ts test/unit/frontend-asset-availability-route.test.tsx test/unit/frontend-asset-dropzone.test.tsx test/unit/frontend-submit-owner-route.test.tsx test/unit/frontend-submit-pages.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/worker/m2-assets.test.ts test/worker/submissions.test.ts
```

- 10 files / 347 tests 通过：包括服务无存储 IO、限制、权限、协议校验、DOM 状态与重试、用户切换、原有附件与文本提交流程及成熟度路由。
- `npm run typecheck`、`npm run build:ui` 通过；UI 构建既有大于 500 kB chunk 警告仍在。
- `npm run verify:i18n`、`npm run test:i18n`（13 tests）通过。
- `npm run verify:workbench-maturity`（13 tests）、`npm run audit:workbench-domain`、`npm run verify:delivery-status`（30 tests）、`node --test scripts/workbench-domain-audit.test.mjs`（26 tests）通过。
- 仅本地定向测试；没有进行全仓测试、真实浏览器/设备验收、push、部署、迁移、收费资源开通或生产验证。

### 下一步与计数

B03 的配置核对及返回契约已本地关闭。本轮 29 个父项已完成 1、剩余 28；原 30 项中的 D08 仍独立保留为发布事项。本地下一步允许进入 B04/B05 上传接线；存储不可用时必须继续禁用，不为完成 checklist 开通收费资源。不需要备份或旧 R09 运维签认来继续本地功能。


## B04/B05 — 附件上传、恢复、解析与提交审核（本地接线已完成）

本段取代上文 B03 时点“所有状态禁用/尚未接线”的当前状态描述；上文保留为历史证据。范围仍为本地代码、测试、文档及提交，不部署、不迁移、不新增存储，不读取或上传 Secret 文件。

### 实现与边界

- 主提交入口在可用性接口确认已配置且成员身份存在时启用选择；未配置、读取失败或本地恢复存储不可用均保持禁用。文本投稿与附件投稿独立，附件动作不清空文本草稿。
- 单文件数量、大小、扩展名、空文件、不安全/超长文件名校验；中文文件名用带明确 encoding 标记的 URI 编码头传输，后端兼容旧头并拒绝错误编码，不把字面 `%20` 自动解码。
- 原生 XHR upload 事件报告字节进度。100% 仅表示字节传输，不表示后端接受或解析成功；响应丢失与停止本地传输进入未知态，保留恢复意图。
- 意图按 memberId 隔离，仅存元数据/SHA256/稳定键和首次审核标题，不存文件内容。显式恢复先 GET；仅确认为 ASSET_NOT_FOUND 且重新选中同一文件时才原键重传。其他权限/网络/协议错误不自动 POST；双击互斥、卸载取消、忽略旧成员迟到响应。跨标签变更检测并非跨标签原子锁。
- 解析、取消、提交审核均先回读。queued/failed_retryable 可解析或取消；processing/succeeded 不误报取消成功。解析状态由用户手动刷新，不自动轮询。终态失败仅可解除本地追踪，服务端附件保留。
- 解析 succeeded 后使用现有提交审核接口；先持久化审核键及标题，丢响应重试使用原载荷，不因编辑标题产生第二次投稿。默认空间/共享审核语义沿用现有接口，未增加发布权限。
- 后端上传是 owner/key 重放，不能宣称严格文件内容重放校验；客户端核对回读 hash。解析与取消依据条件更新，不把取消重复 404 描述为收敛成功。源代码证据与成熟度 manifest 已登记新增操作和 owner 谓词。

### RED → GREEN 与验证

- 实现前：workflow/transport 模块缺失，入口仍禁用，编码文件名处理不符合契约；新增用例 RED。空文件/不安全文件名与跨标签恢复记录变更用例另有 4 failed / 13 passed；解除终态本地追踪先出现 missing function 失败，之后实现通过。
- 最终定向回归：13 files / 378 tests passed，包含既有服务/availability/投稿/成熟度入口，以及新增 workflow 19、transport 5、App route 3 和 Worker 附件新增 4 用例。

```sh
rtk proxy npx vitest run test/unit/assets-service.test.ts test/unit/member-asset-availability.test.ts test/unit/frontend-asset-availability.test.ts test/unit/frontend-asset-availability-route.test.tsx test/unit/frontend-asset-dropzone.test.tsx test/unit/frontend-submit-owner-route.test.tsx test/unit/frontend-submit-pages.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/worker/m2-assets.test.ts test/worker/submissions.test.ts test/unit/frontend-asset-workflow.test.ts test/unit/frontend-asset-transport.test.ts test/unit/frontend-asset-upload-route.test.tsx
```

- `npm run typecheck`、`npm run build:ui`、`npm run verify:i18n`、`npm run test:i18n`（13 tests）通过；既有大 chunk 警告保留。
- 首次成熟度检查因改写未关闭 gap 的文字导致指纹漂移，2 tests 失败；保留原 gap/负责人及验收边界，只扩展实现证据，未放宽契约或消除验收 gap。
- owner 证据描述补回 authenticated 限定，并重新生成当前快照。最终 `verify:workbench-maturity` 13 tests、`audit:workbench-domain`、`verify:delivery-status` 30 tests、`node --test scripts/workbench-domain-audit.test.mjs` 26 tests 及 `git diff --check` 全部通过。
- 真实 App 组件与 Response/XHR 模拟、隔离本地 Worker/D1/R2 测试不等于原生浏览器网络、实际移动设备或生产验收。未执行全仓测试或 Secret 同步脚本。

### 当前进度

本轮仍为 29 个父项：整体完成 1（B03），待整体关闭 28；B04/B05 实现和自动化子项已勾选，原生浏览器/双账号/键盘触控验收保持待验，不提前关闭父项。D08 不在本轮本地范围。没有代码实现阻塞；后续允许补本地浏览器验收或继续 B06 既有审核/发布闭环核对，不需要备份、收费存储或旧运维签认。


## B06 — 审核、发布与重复请求恢复（本地回归完成）

承接 `b654b6d`，复用用户已批准的 D02-R2 设计。后端决定、持久化发布意图、事务通知和索引失败反馈已有实现，本轮未新增平行系统或修改数据库。

- 修复审核详情/队列显式回读无条件解除未知操作锁的问题。`review_pending` 或未知状态不能证明原写入未发生，保留原决定与恢复入口，不允许相反决定。
- 临时读取失败后重读仍保留锁；401/403 清除受保护状态。分页中缺失目标不证明终态，读取原对象详情后再决定是否解除锁及回退空末页；跨页后的晚到详情响应被忽略。
- 仅覆盖当前挂载会话的显式恢复，不声称浏览器刷新或跨导航持久化。原生浏览器、真实双账号、键盘/触控验收保持待验。

### RED → GREEN 与本轮验证

- 实现前详情/队列四个新增反例失败：`4 failed / 58 passed`，均为 pending 回读错误开放相反决定。
- 修复后补充分页缺失目标仍待审、详情撤权、导航后晚到回读，最终 15 文件 **353/353**：

```sh
rtk proxy npx vitest run test/worker/m1-publication.test.ts test/worker/notifications.test.ts test/worker/review-notifications-migration.test.ts test/worker/migrations.test.ts test/worker/m1-api.test.ts test/unit/frontend-notifications-page.test.tsx test/unit/frontend-notifications-route.test.tsx test/unit/frontend-notifications-data.test.ts test/unit/notifications-service.test.ts test/unit/publication-service.test.ts test/unit/frontend-review-detail.test.tsx test/unit/frontend-review-detail-route.test.tsx test/unit/frontend-review-detail-data.test.ts test/unit/frontend-admin-review-data.test.ts test/unit/frontend-moderation-pagination-routes.test.tsx
```

- `typecheck`、`build:ui`、`verify:i18n` 通过；`test:i18n` 13/13、`verify:workbench-maturity` 13/13、领域审计 33 能力快照核对通过、领域审计测试 26/26、`verify:delivery-status` 30/30 通过。
- 构建仍提示大于 500 kB 的 chunk；测试输出有已删除发布文件的 `WorkspaceFsError`，测试最终退出 0、无失败。未运行全仓测试，不据此宣称无全部缺陷。
- 没有 push、部署、远程迁移、生产写入、开通收费资源、备份或手工读取/上传 Secret；未运行 `build:secrets`。

本轮 29 父项，关闭 1（B03），剩余 28；B06 仅完成上述本地实现/回归子项，父项保持未勾选。下一步允许继续 B07 既有知识列表/阅读/精确引用闭环，无新增设计或生产权限依赖。


## B07 — 精确历史引用回读（本地定向回归完成）

承接 B06 提交 `eca4297`。沿用既有知识系统设计的版本绑定与引用重新授权要求，不新增接口、数据库迁移或平行阅读器。

- 原阅读器忽略引用 hash，只读当前版本；现在先读取 citation，再 GET 引用绑定的 revision。严格核对知识 ID、版本 ID、chunk ID、citation ID 和行范围，自动选择来源片段。
- 引用失效、撤权、服务暂时失败、版本/片段不匹配时显示失败，不静默回退当前正文。无引用的普通阅读仍读取当前版本。
- hash/历史导航重新建立阅读会话并清除旧正文，取消旧请求、忽略晚到结果；显式重试保持原引用目标。
- 成熟度清单扩展实际控制器/API/测试归属，重新生成当前领域快照。保留原 gap 指纹和负责人，不借实现证据关闭发布或浏览器验收维度。

### RED → GREEN 与验证

- 数据层新增反例在实现前为 **10 failed / 5 passed**；实现后该文件 15/15。
- 路由 DOM 测试覆盖历史正文/选中片段、撤权清除与重试、导航后旧响应。首轮一个测试使用错误的按钮文本 `Retry`，更正为现有 `Try again`，未修改产品文案或降低断言。
- 最终 9 文件 **319/319**：

```sh
rtk proxy npx vitest run test/unit/frontend-knowledge-citation-route.test.tsx test/unit/frontend-knowledge-reader-data.test.ts test/unit/frontend-reader-pagination-routes.test.tsx test/unit/frontend-knowledge-data.test.ts test/unit/frontend-graph-evidence.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/library-service.test.ts test/worker/m1-library.test.ts test/worker/m1-api.test.ts
```

- `typecheck`、`build:ui`、`verify:i18n` 通过；`verify:workbench-maturity` 13/13、`audit:workbench-domain` 快照核对、领域审计测试 26/26、`verify:delivery-status` 30/30 通过。前端构建仍有大于 500 kB 的 chunk 警告。
- 追加上一批审核路由回归：`rtk proxy npx vitest run test/unit/frontend-review-detail-route.test.tsx test/unit/frontend-moderation-pagination-routes.test.tsx`，2 文件 65/65 通过；文档更新后交付契约再次 30/30 通过。
- DOM 测试使用模拟网络和简化 Markdown 渲染器，只验证路由数据所有权与来源选择，不声称验证原生浏览器或 Markdown 消毒集成。Worker 测试为本地隔离验证，不代表生产权限验收。
- 未运行全仓测试、Secret 同步脚本；无 push、部署、远程迁移、生产写入或备份。

当前仍为 **29 个父项、已关闭 1（B03）、未关闭 28**。B07 本地修复和回归子项已勾选，完整浏览器/真实身份验收待补，父项未关闭。下一步允许继续 B08 既有 AI 会话/来源/取消恢复核对，无需新增生产权限；不能宣称全部功能 checklist 已完结。


## B08 — 停止等待与并发重复提交（本地子项完成）

承接 B07 提交 `a132d0d`，本批仅修复现有 AI 页取消恢复，不宣称整个 B08 完成。

- 原 Stop 只中止请求，页面一直加载；现在退出加载并保留问题，双语明确“尚未确认服务端已取消；再次提问将开启新会话”。首次回答前通常尚无 conversation ID，不把前端 abort 视为服务端停止证明。
- 停止后清除本地会话 ID，后续显式提问创建新会话，避免迟到的会话级取消作用于下一轮。取消请求失败也不自动重放；迟到回答被所有权代次丢弃。
- 同步 pending guard 加禁用按钮阻止同一页面的重复并发提交；这不是跨刷新或后端幂等保证。请求完成后清除活动控制器，卸载已完成页面不再发送取消。
- 四个产品反例实现前 **4 failed / 7 passed**，实现后 11/11。最初 DOM 输入模拟没有触发 React onChange，已改为现有测试通用的 props 驱动，随后才确认四个真实产品失败；未将测试框架错误算作产品 RED。

最终定向回归 **10 文件 249/249**：

```sh
rtk proxy npx vitest run test/unit/frontend-agent-cancellation-route.test.tsx test/unit/frontend-agent-data.test.ts test/unit/frontend-user-read-pages.test.tsx test/unit/frontend-a11y.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/chat-conversation-service.test.ts test/unit/chat-feedback-service.test.ts test/unit/frontend-knowledge-citation-route.test.tsx test/unit/frontend-review-detail-route.test.tsx test/unit/frontend-moderation-pagination-routes.test.tsx
```

`typecheck`、`build:ui`、`verify:i18n`、`test:i18n` 13/13、`verify:workbench-maturity` 13/13、`audit:workbench-domain` 和 `verify:delivery-status` 30/30 通过。保留现有 gap 指纹，生成快照增加有界测试证据。构建仍有大 chunk 警告。测试为本地模拟网络/DOM；未调用远程 AI、未运行全仓测试，不等于原生浏览器或生产验收。

**仍未全部完结：29 父项、关闭 1（B03）、剩余 28。** 当前停在 B08 子项完成；来源选择/范围切换、历史会话恢复、跨刷新或重复请求幂等、完整证据不足反馈及真实浏览器验收仍待核对，不勾选父项。允许继续本地 B08 后续，不需要备份或生产权限。无 push、部署、迁移、生产写入或手工 Secret 读取/上传。


## B08 — 显式来源与单会话恢复（本地子项完成）

承接 `7200493`，沿用既有会话 D1 表；计划见 `2026-09-26-agent-scope-recovery-plan.md`。

- 增加只读 GET `/api/knowledge/chat/conversations/:id`：session member owner 过滤、最多最近 8 条消息、no-store；每次恢复逐个重新检查保存的引用，任一失权则不返回历史正文；不调用 AI，不返回 ownerMemberId。
- all/space/collection/items 显式选择，条目最多 8 个、不重复。未知类型/缺失或非法 ID/重复参数/会话与范围混用均拒绝，不回退 all。应用来源开启新会话，更新 URL，不 PATCH 旧会话。
- 回答后显示专属恢复链接；恢复后可在服务端确认的范围和原会话继续问。恢复失败只重试 GET，不静默新建、不自动重放问题；页面/成员切换丢弃旧响应。历史正文仅 React 文本展示，不解析任意 HTML。
- 8 个新增产品用例先 RED，后 65/65 通过；复查新增 JSON 字段顺序和来源 URL 2 个 RED 后修复。最终 11 文件 **304/304**（同前批 10 文件加 `test/worker/m1-api.test.ts`）。
- `typecheck`、`build:ui`、`verify:i18n`、`test:i18n` 13/13、`verify:workbench-maturity` 13/13、领域快照生成/核对、`verify:delivery-status` 30/30 通过；仍有大 chunk 警告。保留 canonical gap 与验收维度，增加实际控制器/API/测试证据。
- 不宣称：历史列表/分页、任何普通问题页自动刷新恢复、后端问题幂等、原生浏览器或生产完成。Worker 测试 fake AI；未手工读取 Secret、未推送/部署/远程迁移/生产写入/备份。

当前 **29 父项、关闭 1（B03）、剩余 28**。B08 局部功能有真实测试，父项保持未关闭。下一步允许继续本地证据不足提示/反馈与幂等核对。


## B08 — 证据不足与会话反馈（本地子项完成）

承接提交 `8b37fd4`，不新增 AI 调用、数据库迁移或平行反馈存储。

- 只识别服务端 `KNOWLEDGE_EVIDENCE_INSUFFICIENT`，显示双语证据不足提示；改写问题/修改来源建议采用白名单，不自动扩大范围或重新发问。
- 接入已有会话级 useful/not_useful/citation_error 反馈接口，明确同一会话后续评价会覆盖前次；无引用时禁用引用错误评价。
- 同页同步 pending guard 阻止重复写；不确定结果保留原载荷并锁住相反评价，只允许显式同载荷重试。回执必须匹配会话、评价及引用列表；卸载忽略晚到回执。
- Worker 验证现有 `(conversation_id, member_id)` upsert 重试仍只有一行、其他成员写入 404。该条件写证明仅限重复行收敛，不保证不同评价跨标签顺序、刷新后未知反馈恢复或请求时间戳完全一致。
- 四个新增产品用例先 **4 failed**，实现后定向 71/71；最终 **12 文件 354/354**：

```sh
rtk proxy npx vitest run test/unit/frontend-agent-cancellation-route.test.tsx test/unit/frontend-agent-data.test.ts test/unit/frontend-user-read-pages.test.tsx test/unit/frontend-a11y.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/chat-conversation-service.test.ts test/unit/chat-feedback-service.test.ts test/unit/frontend-knowledge-citation-route.test.tsx test/unit/frontend-review-detail-route.test.tsx test/unit/frontend-moderation-pagination-routes.test.tsx test/worker/m1-api.test.ts test/unit/cited-answer-service.test.ts
```

- `typecheck`、`build:ui`、`verify:i18n` 通过；`test:i18n` 13/13、`verify:workbench-maturity` 13/13、领域快照核对及审计测试 26/26、`verify:delivery-status` 30/30 通过。保留 canonical gaps，新增反馈操作根与实际条件写/测试绑定，不放宽门禁。构建仍有大 chunk 警告。
- 所有测试为本地 DOM/隔离 Worker（fake AI）；未做原生浏览器或生产验收，未运行全仓测试、Secret 同步、push、部署、远程迁移、生产写入或备份。

当前 **29 父项、关闭 1（B03）、剩余 28**，B08 父项仍未完成。允许继续既有历史列表/分页和问题回合幂等核对；不将这些局部证据冒充全部 checklist 已完结。


## B08 — 成员会话历史列表与稳定分页（本地子项完成）

承接 `7ab892b`，计划见 `2026-09-26-agent-history-list-plan.md`。

- GET `/api/knowledge/chat/conversations`：服务端 session member 过滤，仅返回 id/createdAt；不预览问题/答案或来源标题，不需要复制或新增正文存储。
- `created_at DESC, id DESC` 稳定创建顺序、limit+1 与成员范围绑定 opaque cursor；校验格式、字段、时间和成员范围。后续回答修改 updated_at 不会移动分页位置；新增会话通过重载首页发现。不是数据库历史快照，也不承诺同时回填旧创建时间的导入可见性。
- 按需打开历史，20 项一页，较新/较早页、重载首页；请求失败清除旧页，显式重试原游标，不自动发问。卸载中止读取并丢弃晚到响应。历史链接使用已验证的单会话恢复/引用重新鉴权。
- 新增产品用例先 **4 failed / 70 passed**，实现后 **78/78**；最终同上一批 12 文件 **358/358**。涵盖跨成员游标拒绝/列表隔离、相同时间 ID 断点、更新不移位、非法/重复参数、无正文响应、前端分页错误/重试、路由切换晚到结果。
- `typecheck`、`build:ui`、`verify:i18n`、`test:i18n` 13/13、`verify:workbench-maturity` 13/13、领域快照生成/核对与审计测试 26/26 通过；交付契约 30/30 通过。保留原 gap 与验收维度，增加实际列表/API/cursor 归属。仍有既有大 chunk 警告。
- 没有 push、部署、远程迁移、生产写入、备份或手工读取/上传 Secret；测试 fake AI，无远程 AI 调用；未运行全仓测试或原生浏览器验收。

**29 父项，关闭 1（B03），剩余 28；B08 仍未关闭。** 本轮累计完成来源切换/单会话恢复、证据不足/反馈、历史列表/分页三个本地切片。下一项是跨刷新/重复问题的持久回合幂等，尚无完成证据，不能用同页禁用提交或反馈 upsert 冒充完成。后续本地工作允许继续，生产操作仍不在本轮范围。


## B08 — 带键回合幂等与当前标签刷新恢复（本地子项完成）

承接 `a3be700`，本批不新增平行会话/消息系统，不扩大生产权限。

- 新增 `0052_chat_turn_requests.sql` 与 `ChatTurnReceipts`：`(member_id, idempotency_key)` 唯一，原子占位发生在建会话之前；指纹包含 question、scope、原 conversationId。带键同载荷重放返回原回执，不再调用 AI；异载荷 409，跨成员键隔离。
- pending 不是可过期接管的租约；失败请求不重新生成。消息和成功回执同一 D1 batch 保存，取消不缓存成功；触发器故障证明回执写失败会回滚消息。未知 commit 保留 pending，显式同键请求只回查状态，不擅自补跑。
- 生成前重验历史引用、生成后重验历史/检索/回答引用；重放验证 owner 与当时保存的授权引用，不因缓存绕过当前权限。
- App 传入当前会话成员；新 React 路由在 POST 前将原意图写入成员分区 sessionStorage。只保存问题/来源/会话/key，不保存回答。刷新/路由返回不会自动重发，手动恢复使用原载荷；不同成员不显示其他意图。存储损坏/写入失败阻断新问题，错误 key 或 conversation 回执不显示成功。
- Stop/明确放弃清理当前意图，仍明示服务端取消未确认，后续新问题可能独立执行；同标签未确认意图不能被新问题静默覆盖。成功后下一问题生成新 key，并沿用已确认 conversation。
- RED→GREEN：后端同键重复/非法 key；前端缺失 key/错误回执；回执会话不匹配反例。存储故障测试最初错误地覆盖 happy-dom Storage 属性，修正为明确的故障端口后证明没有 POST。

验证：

- 14 文件 **399/399**：`frontend-agent-cancellation-route`、`frontend-agent-data`、`frontend-agent-turn-intent`、`frontend-user-read-pages`、`frontend-a11y`、`frontend-workbench-maturity-routes`、`chat-conversation-service`、`chat-feedback-service`、`frontend-knowledge-citation-route`、`frontend-review-detail-route`、`frontend-moderation-pagination-routes`、`m1-api`、`cited-answer-service`、`migrations`。
- `typecheck`、`build:ui`、`verify:i18n` 通过；`test:i18n` 13/13、`verify:workbench-maturity` 13/13、领域审计测试 26/26、`verify:delivery-status` 30/30，更新清单后交付契约与领域快照再次通过。构建仍有既有 >500 kB chunk 警告。
- 只验证选定本地套件，未运行全仓测试或 secrets 同步；未 push、部署、远程迁移、生产写入或备份。
- happy-dom 与本地 Worker/fake AI 不代表原生浏览器、真实成员或生产 AI 验收。旧无键 API 保留兼容且不宣称幂等；不同标签的独立新意图不保证语义去重。外部 AI 与 D1 不组成分布式事务，pending 可长期未知。

当前仍为 **29 个父项、已关闭 1（B03）、未关闭 28**。B08 此本地功能子项完成但父项不关闭；下一步允许进入 B09 的知识关联任务/讨论跨模块权限核对，真实浏览器验收单独保留，禁止据此宣称全部 checklist 完成。


## B09 — 任务关联目标重新授权（本地修复与回归完成）

承接 B08 提交 `5ad04d9`。本批不新增界面、迁移或授权模型，修复既有跨模块关系对当前知识权限的遗漏。

- `TasksRepository.listLinks/findLink` 过去直接 JOIN 当前 revision 标题，历史关联可继续读取已撤权目标标题。现在复用知识读取的 active member、active item、active non-legacy space、shared/admin 条件，在同一 SQL 语句中仅投影可读标题。
- 失效关联仍属于当前任务所有者，只保留原关联 ID/目标 ID/时间，`knowledgeTitle: null`；这不是读取目标的授权。所有者仍可删除失效关联，其他成员仍 404；没有自动删除用户关系。
- `TasksService.linkKnowledge` 的当前知识可见性检查移到幂等回读前，已有链接不再绕过撤权；拒绝时不新增链接或审计。
- 覆盖 admin_only、知识 trashed、空间 disabled/legacy、角色升降级、成员停用、恢复可读、跨成员与失效关系删除。讨论使用既有当前任务/知识授权，随本批一起回归，未改为参与者授权。

### RED → GREEN 与验证

- 修复前有效回归 **5 failed / 30 passed**：四种撤权仍泄露标题，服务层撤权重放错误成功。首次运行有两个测试 fixture 状态枚举写错；按真实 schema 修正后重新跑 RED，五项均为实际行为断言失败，随后才修改实现。
- 最终 **10 文件 97/97** 通过：

```sh
rtk proxy npx vitest run test/unit/tasks-service.test.ts test/worker/tasks.test.ts test/worker/task-structure.test.ts test/unit/discussions-service.test.ts test/worker/discussions.test.ts test/unit/frontend-discussion-route.test.tsx test/unit/frontend-discussions-data.test.ts test/unit/frontend-tasks-route.test.tsx test/unit/frontend-tasks-data.test.ts test/unit/frontend-knowledge-citation-route.test.tsx
```

- `typecheck`、`build:ui`、`verify:workbench-maturity`（13/13）、`audit:workbench-domain` 与 `verify:delivery-status`（30/30）通过。构建保留既有 >500 kB chunk 警告。本批没有修改 UI 文案，B08 双语证据不重新冒充本批执行。
- 定向本地回归不是全仓测试或真实双账号浏览器验收。本批未执行 push、部署、远程迁移、生产写入、备份或手工读取/上传 Secret。

### 下一环节与总进度

本轮仍为 **29 父项，关闭 1（B03），剩余 28**。B09 上述本地子项完成，完整真实身份跨模块跳转验收仍未完成，不提前勾选父项。下一环节允许继续 **C01 任务创建/编辑/状态/截止时间/标签/知识关联逐项核对**；无需等待备份或旧运维签认，但不得把未验证的生产/浏览器项写成完成。


## C01 — 任务页面撤权清理（本地有界子项完成）

承接 B09 提交 `149a8b8`，进入 C01 后核对真实 TasksRoute，而非仅以 API 客户端存在判断功能完成。

- 列表加载、状态 mutation、mutation 成功后的读取三条路径，401/403 均清除旧任务标题、行与操作入口；废弃当前请求控制器，晚到的成功读取不得恢复受保护行。
- 显式“重新搜索”只重新 GET，恢复权限后可以正常显示列表，不重放上一次状态操作。普通 500/网络错误沿用保留列表与本地重试反馈的体验。
- RED：新增六个 401/403 反例在实现前全部失败，19 个既有测试通过。修复后另加迟到读取反例，最后联合 **8 文件 227/227** 通过：

```sh
rtk proxy npx vitest run test/unit/frontend-tasks-route.test.tsx test/unit/frontend-tasks-page.test.tsx test/unit/frontend-tasks-data.test.ts test/unit/tasks-service.test.ts test/worker/tasks.test.ts test/worker/task-structure.test.ts test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-a11y.test.tsx
```

- `typecheck`、`build:ui`、成熟度契约 13/13、领域审计快照检查通过；保留既有大 chunk 警告，无新界面文案或迁移。
- **尚未闭环的具体功能**：`loadTaskDetail/createTask/updateTask/replaceTaskTags/addTaskLink` 存在于客户端模块，但没有在当前 TasksRoute 中调用；任务创建/编辑/截止时间/标签/知识关联的界面交互及未知结果恢复需要后续接线。后端可调用不等于成员界面可用。
- 总清单仍 **29 父项、关闭 1、剩余 28**。当前在 C01，继续本地实施允许，无需新生产权限；下一步应完成上述任务编辑工作流，不越过未完成项直接宣称 C01 或全部清单完成。
- 没有 push、部署、远程迁移、生产写入、备份或手工读取/上传 Secret。以上不是全仓测试、真实浏览器或生产验收。


## C01 — 任务创建与详情编辑工作流（本地实现与回归）

承接 `4d85e07`，沿用已批准的 `docs/superpowers/plans/2026-08-27-workbench-tasks.md`，没有增加新的存储或领域模型。

- TasksRoute 接入新建 Dialog 和详情 Sheet：创建、标题/备注/优先级/截止时间修改、合法状态迁移、绝对进度、替换标签、按知识 ID 关联及移除失效关系。当前创建只写基本任务；知识关联作为后续独立操作，避免后端组合创建中“任务已创建但关联失败”的部分成功被误报为整体成功。
- 同一挂载内一次创建意图固定 ID/body；写入未决期间阻止双击和 Escape，未知结果冻结输入，仅显式重试原操作。成功后列表/详情重新 GET；读取失败不自动重放 mutation。401/403 同时清空详情及列表，成员切换通过 keyed route 重新挂载，取消详情读取后忽略迟到响应。
- 详情与写回执严格验证任务 ID、可编辑字段、日期；知识链接回执核对 taskId/knowledgeItemId。移除已不存在关联的 404 收敛成功。不可访问关联只显示安全占位，不推断目标权限。
- 截止时间按设备时区编辑，未修改时保留原始 ISO 精度（包括毫秒）；清空表示 null。终态禁止进度编辑，标签数量与 Unicode 码点限制对齐后端。新增文案中英齐全。
- 未完成边界：当前恢复意图未跨刷新/路由离开持久化；勿刷新提示和 beforeunload 不是跨路由持久化保证。跨标签并发覆盖、真实身份/原生浏览器/移动布局完整旅程仍待验收；不因此关闭 C01 父项。

### RED → GREEN 与本地验证

- 首批实际行为 RED：9 failed / 8 passed（缺少创建/编辑入口、错误目标回执未拒绝、关联 404 未收敛）。在实现后补充严格详情与状态/进度目标校验，第二批 RED 为 2 failed / 25 passed；Unicode 边界 RED 为 1 failed / 14 passed。
- 测试 DOM harness 按既有路由测试提供 HTMLElement 和输入 onChange；不把测试环境错误算作功能反例。真实浏览器键盘/布局仍保留未验收。
- 最终联合回归：10 文件 **267/267**（任务编辑路由 15、任务数据层 13，以及既有任务/看板/权限/无障碍等回归）。命令：

```sh
rtk proxy npx vitest run test/unit/frontend-task-editor-route.test.tsx test/unit/frontend-tasks-data.test.ts test/unit/frontend-tasks-route.test.tsx test/unit/frontend-tasks-page.test.tsx test/unit/tasks-service.test.ts test/worker/tasks.test.ts test/worker/task-structure.test.ts test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-a11y.test.tsx test/unit/frontend-boards-route.test.tsx
```

- 安全门禁：typecheck、build:ui、verify:i18n、test:i18n（13/13）、verify:workbench-maturity（13/13）、audit:workbench-domain、verify:delivery-status（30/30）。领域审计因为新增 UI 调用根/测试证据而重新生成快照，不修改冻结的 gap 指纹或宣称发布验收完成。保留既有 >500 kB chunk 警告。
- 总清单 **29 父项、关闭 1（B03）、剩余 28**。C01 本地主要编辑旅程已接通，下一环节允许继续 C02 看板权威数据/键盘移动/并发恢复的本地核对；C01 未完成项明确保留。
- 没有 push、部署、远程迁移、生产写入、备份或手工读取/上传 Secret；以上不是全仓测试或生产验收。


## C02：看板撤权清理与回执隔离（接续 C01 提交 `7346a4c`）

- 先新增 7 个行为反例：401/403 移动拒绝、已有分页读取拒绝、其他列迟到成功，以及拒绝前发出的移动回执；RED 为 7 failed / 19 passed。
- `BoardsRoute` 收到有效请求的 401/403 时同步清空全部列，取消在途列请求、递增请求版本和移动代次；不把拒绝当普通写失败回滚。用户显式重试重新读取四列，不重发状态写入；撤权期间历史查询变化不触发自动读取。实际 App 以成员 ID 隔离看板挂载。
- 扩展写成功后 GET 拒绝及显式恢复后旧移动回执反例。写后读取测试补齐独立 effect 的等待，最终看板 28/28；原有 19 项分页、局部回滚、StrictMode、路由和并发请求测试未删改。
- 提交前关联回归：10 文件 **276/276**（任务编辑器、数据、列表/页面、服务/Worker、结构、成熟度路由、可访问性、看板）。`typecheck`、`build:ui`、`verify:i18n`、`test:i18n` 13/13、`verify:workbench-maturity` 13/13、`audit:workbench-domain`、`verify:delivery-status` 30/30 通过。UI 构建仍有既有 >500 kB 提示；typecheck 不代表所有前端 TSX 的完整类型检查。
- 边界：未知写入后的跨标签冲突解决、原生浏览器键盘/移动端/真实账号验收仍未完成；普通 500 沿用已有乐观回滚，不将其宣称为服务端未提交证明。
- 总账仍为 **29 个父项，1 个关闭，28 个未关闭**；本批只关闭 C02 的本地撤权子项。未推送、部署、远程迁移、备份或读取/上传人工秘密文件。下一步允许进入 C03 的本地任务归属与摘要计数核对。


## C03：项目摘要恢复与关联计数对账（接续 C02 提交 `123ef7d`）

- 项目摘要的普通失败不再拖垮整页；失败行显示错误而非虚假 0/0，只显式重试该行且同步合并双击。其他项目时间线仍可操作；读取使用 AbortController 和请求代次，状态写后刷新取消旧摘要回执。401/403 清空全部私有项目并取消在途读取，App 按成员 ID 重挂载。
- 摘要计数要求非负安全整数、completedTaskCount 不大于 taskCount，目标预览不超过 total/10 且 ID 唯一；允许 total 大于预览长度。合法 ID `constructor` 的继承属性反例使用 Object.hasOwn 修复，防止把原型属性误认成已加载摘要。
- 真实本地 D1：任务重复关联不重复计数，完成/重开/取消、解除关联及任务删除后对账正确；12 个目标仅预览 10 个且 total 保留 12；跨成员关联与读取返回 404。项目 progress 是独立手工字段，不冒充关联任务完成比例。时间线稳定键重放、2+1 分页及项目绑定游标正确，timeline action 不进入关联任务总数。
- RED → GREEN：首批行为反例 12 failed / 1 passed；实现后 13 passed。追加过期回执、分页与继承属性反例，`constructor` 用例实际 RED 为 1 failed / 16 passed，修复后项目路由/摘要 17/17。
- 最终关联回归 **13 文件 269/269**，运行命令：

```sh
rtk proxy npx vitest run test/unit/frontend-project-summary-recovery.test.tsx test/unit/frontend-workbench-extended-routes.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-a11y.test.tsx test/worker/projects.test.ts test/worker/goals.test.ts test/worker/project-timeline.test.ts test/unit/projects-service.test.ts test/unit/projects-route.test.ts test/unit/goals-service.test.ts test/unit/goals-route.test.ts test/unit/frontend-boards-route.test.tsx test/unit/frontend-task-editor-route.test.tsx
```

- 本地门禁：typecheck、build:ui、verify:i18n、test:i18n 13/13、verify:workbench-maturity 13/13、verify:delivery-status 30/30 均通过。领域审计因新增测试证据先报告 STALE，重新生成快照后 audit:workbench-domain 通过；冻结 gap 指纹未改。保留既有 >500 kB chunk 提示，typecheck 不代表全部前端 TSX 类型覆盖。
- 范围边界：本批关闭 EXT-PRJ-02 本地子项及 C03 计数子项，不关闭 C03 父项。目标/项目数字分页与 URL 恢复、创建稳定意图、完整关联编辑 UI、未知写入/并发恢复和真实浏览器验收仍开放。摘要普通失败可恢复不等于流式加载，首次页面仍等待当前摘要批次结束。
- 总清单仍为 **29 父项 / 已关闭 1（B03）/ 未关闭 28**。下一步允许继续 C03 剩余功能或 C04 既有原子待办；不需要重复新建已有模块。未 push、部署、远程迁移、生产写入、备份或手工读取/上传 Secret；以上不是全仓或生产验收。


## C03 — 目标/项目同页面创建意图恢复（本地子项完成）

承接项目摘要恢复提交 `25ee5fe`，本批严格对应 EXT-GL-02 / EXT-PRJ-03 的创建子项，不提前关闭 C03 父项。

- 共享创建表单在首次提交时固定 `id`、`clientKey`、标题和描述。网络异常、超时、可重试响应或不可信回执保留原意图与草稿；仅显式重试同一请求，不生成新键或自动重放。
- 校验服务端回执的实体 ID、clientKey 与 created 布尔值。首次确定的非重试 4xx 拒绝允许修改原草稿；未知结果之后收到拒绝仍不释放未知意图。
- 写入已确认但列表读取失败时，仅重试读取，不再 POST；读取成功后才清空草稿。401/403 清理私有列表和草稿，卸载后的迟到回执不触发读取。目标路由补齐成员 key、AbortController 与 generation 隔离。
- 同步状态门防止重复创建点击，并覆盖同一时刻状态修改与创建互斥。项目路由拒绝忙碌创建时不破坏已有写入 generation，避免永久 busy。
- 未解决写入提供离开页面提示，但不声称跨 SPA 路由/刷新持久恢复。标题按 Unicode 码点 200、描述按后端 200000 上限校验，没有新增任意 10000 字符限制。

### RED → GREEN 与验证

- 初始用例装载等待空表单创建按钮可用造成 harness 失败，修正为等待标题字段；该错误不作为业务 RED 证据。
- 增补边界回归出现 **4 failed / 38 passed**，暴露可重试 404 被错误释放及描述长度限制不一致；修复后通过。
- 同时点击状态与创建回归出现 **2 failed / 42 passed**，原实现产生两次 POST；补齐同步入口守卫后通过。
- 新增 **44 项**真实 App / happy-dom 用例；联合 **13 文件、273/273** 通过：

```sh
rtk proxy npx vitest run test/unit/frontend-planning-create-recovery.test.tsx test/unit/frontend-project-summary-recovery.test.tsx test/unit/frontend-workbench-extended-routes.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-a11y.test.tsx test/unit/frontend-goals-page.test.tsx test/unit/frontend-projects-page.test.tsx test/worker/goals.test.ts test/worker/projects.test.ts test/unit/goals-service.test.ts test/unit/projects-service.test.ts test/unit/goals-route.test.ts test/unit/projects-route.test.ts
```

- `typecheck`、`build:ui`、`verify:i18n`、`test:i18n`（13/13）通过；构建仍有既有 >500 kB chunk 警告。仓库 typecheck 不覆盖所有前端 TSX，因此不表述为全前端严格类型检查。
- 成熟度契约（13/13）、交付契约（30/30）及领域审计通过。领域 AST 审计不追踪直接函数引用形式的回调；改为显式 API 调用后恢复调用证据，新增测试清单后重生成领域报告。没有弱化冻结 gap 指纹或提前提升成熟度。
- 仅执行本地选定套件，没有全仓/真实浏览器/生产验收；未 push、部署、远程迁移、生产写入、备份或手工读取上传 Secret。

### 下一环节与总进度

原审计共 **30 个父项**；按用户功能范围排除 D08 发布环节后，仍为 **29 个范围内父项、关闭 1（B03）、未关闭 28**。C03 两个创建恢复子项可勾选，EXT-GL-02 / EXT-PRJ-03 与 C03 父项保持未完成。下一步允许继续 C03 编号分页/URL 状态及关系编辑核对；跨刷新恢复、条件写入、完整关系 UI 和真实浏览器验收仍待完成。没有新的外部阻塞，也不以“不需备份”代替功能完成证据。


## C03 — 目标/项目编号分页与 URL 恢复（本地子项完成）

承接创建意图恢复提交 `21337c0`，本批只对应 EXT-GL-01 / EXT-PRJ-01，不关闭 C03 父项。

- GET 显式 `page/pageSize` 进入编号模式，支持 20/50/100；严格拒绝重复/混合 cursor/limit、未知字段、外部 memberId、非法数字及 offset >= 10000。未指定编号参数的旧游标 API 保持兼容。
- D1 count 和 rows 同 batch、同 member_id/status 条件；编号排序使用 `created_at DESC, id DESC`，不因进度/状态修改的 updated_at 自动移动。total 不跨成员泄露。编号分页不是跨请求数据库快照；并发插入/删除仍可能改变后续页位置。
- Goals/Projects 真正渲染编号控件；URL 深链与历史事件恢复、页大小切换归首页、非法参数规范化、空页返回可用页。严格校验页码/大小、总数/条数及重复实体 ID，翻页替换旧行而非追加。
- 导航失败不遗留上一页私有行；取消并忽略迟到结果。项目摘要仅当前页读取，普通失败局部重试不重新拉整个列表。复用此前创建未知意图锁，翻页入口同步锁写，防同帧旧页状态写入。
- total 保持真实值；10000 行查询窗口以外的页码及下一页按钮禁用，不再显示可点击却无响应的导航。大数据集窗口外仍不能访问，不虚报无限制分页。没有新增状态筛选 UI。

### RED → GREEN 与验证

- 后端初始反例 **8 failed / 24 passed**；实现后定向 3 文件 **32/32**（其中本地 D1 新增 6 项）。覆盖成员/状态计数、相同创建时间稳定 ID 边界、空页、非法参数及旧游标兼容。
- 前端修正 happy-dom `PopStateEvent` harness 后，业务 RED **14 failed**；初步实现后通过。追加查询窗口反例 **2 failed / 33 passed**，补导航禁用后通过；同帧翻页/写入反例 **2 failed / 20 passed**，补同步锁后通过。最终新增分页 **22/22**。
- 旧项目摘要“追加页”用例调整为“编号替换页 + 单行 GET 重试”，仍验证健康摘要可用；收集箱/日历原游标回归保留，不用删除旧失败断言冒充通过。
- 最终联合 **16 文件，332/332**：

```sh
rtk proxy npx vitest run test/unit/frontend-planning-numbered-pages.test.tsx test/unit/frontend-pagination.test.tsx test/unit/frontend-planning-create-recovery.test.tsx test/unit/frontend-project-summary-recovery.test.tsx test/unit/frontend-workbench-extended-routes.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-a11y.test.tsx test/unit/frontend-goals-page.test.tsx test/unit/frontend-projects-page.test.tsx test/worker/goals.test.ts test/worker/projects.test.ts test/worker/planning-numbered-pages.test.ts test/unit/goals-service.test.ts test/unit/projects-service.test.ts test/unit/goals-route.test.ts test/unit/projects-route.test.ts
```

- `typecheck`、`build:ui`、`verify:i18n`、`test:i18n`（13/13）、成熟度契约（13/13）、交付契约（30/30）通过；既有 >500 kB chunk 警告仍在。仓库 typecheck 不覆盖全部前端 TSX，不表述为全前端严格类型检查。
- 领域审计证据已重新生成，新测试挂入能力证据清单；冻结历史 gap 文案/ownership 不改写，不提升发布或验收维度。
- 全部证据来自本地选定测试/构建，不是全仓、原生浏览器或生产验收。未 push、部署、远程迁移、备份、生产写入或手工读取/上传 Secret。

### 下一环节与总进度

原清单 **30 个父项**，排除 D08 发布后为 **29 个范围内父项 / 关闭 1（B03）/ 未关闭 28**。本批勾选 EXT-GL-01 / EXT-PRJ-01 两个本地子项，C03 仍开放。下一环节继续 EXT-GL-02 / EXT-PRJ-03 的条件写、任务/目标关联编辑及跨刷新恢复；真实身份/原生浏览器完整旅程单独验收。无新的外部阻塞，允许继续本地功能，不以局部通过声称所有 checklist 完结。


## C03 — 目标/项目条件写与冲突回读（2026-09-27，本地子项）

### 本批实现与 API 契约

- 继续 EXT-GL-02 / EXT-PRJ-03，不关闭两个父子旅程或 C03 父项。目标与项目 PATCH、状态 POST、目标进度 POST 及归档 DELETE 必须在 JSON 中携带从 GET/列表读取的 `expectedUpdatedAt`（规范 ISO 毫秒字符串）。DELETE 现在也要求 application/json body；旧无版本写入不再兼容。创建与关联 API 不改变。
- 服务层先查成员所有权，再检查版本；D1 用 member_id/id/updated_at 原子比较更新，写入和回执查询在同 batch 中完成。未匹配不拿别人的新结果冒充写成功；旧版本返回不可自动重试的 409，跨成员保持 404，缺失/非法版本 400。无需新增迁移。
- `updatedAt` 同时作为单调版本，取 max(当前时钟, 原版本+1ms)。同毫秒、时钟倒退及状态改回原值都不复用旧版本；新的同值修改也推进版本。此机制不是持久幂等回执，不能把网络未知结果当成已失败或擅自重试。
- 页面状态/进度请求带显示行版本；409 只重新 GET 当前页，成功后提示核对最新数据，用户再次操作才用新版本写入。回读中禁用写入，失败清除旧行并提供 GET 重试；401/403 清除私有内容，路由离开后忽略迟到回执。项目回读沿用局部摘要失败隔离。

### RED → GREEN 与验证

- 后端初始 RED 19 failed / 2 passed，实现后原 21 项通过；追加倒退时钟与 ABA 状态反例，最终新增 D1 **23/23**。
- 前端初始冲突 RED **10 failed**，实现后通过；补进度携带版本和离开页面的迟到回读，最终新增真实 App / happy-dom **13/13**。
- 现有成功状态写入与归档测试按强制版本前提更新；创建/状态同帧互斥断言继续保留，并断言完整版本载荷。另加 GET 列表不得接受写入版本参数的两项反例，保持原严格查询契约。
- 最终联合 **18 文件，370/370 通过**：

```sh
rtk proxy npx vitest run test/unit/frontend-planning-conflicts.test.tsx test/worker/planning-conditional-writes.test.ts test/unit/frontend-planning-numbered-pages.test.tsx test/unit/frontend-pagination.test.tsx test/unit/frontend-planning-create-recovery.test.tsx test/unit/frontend-project-summary-recovery.test.tsx test/unit/frontend-workbench-extended-routes.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-a11y.test.tsx test/unit/frontend-goals-page.test.tsx test/unit/frontend-projects-page.test.tsx test/worker/goals.test.ts test/worker/projects.test.ts test/worker/planning-numbered-pages.test.ts test/unit/goals-service.test.ts test/unit/projects-service.test.ts test/unit/goals-route.test.ts test/unit/projects-route.test.ts
```

- typecheck、build:ui、verify:i18n、test:i18n 13/13、verify:workbench-maturity 13/13、verify:delivery-status 30/30 通过。领域证据已重新生成并通过 audit:workbench-domain；冻结历史 gap 文案及 ownership 未改。既有 >500 kB chunk 警告保留；仓库 typecheck 不覆盖全部前端 TSX。
- 未 push、merge、部署、远程迁移、生产写入、备份或手工读取/上传 Secret；不调用 AI。本批不是全仓、原生浏览器或生产验收。

### 总进度和下一环节

- 原清单 30 个父项，D08 发布排除后 **29 范围内父项 / 已关闭 1（B03）/ 未关闭 28**。当前 C03，两个条件写/冲突回读本地子项已完成；EXT-GL-02 / EXT-PRJ-03 与 C03 仍未整体完结。
- 下一环节：完整目标/任务关联编辑及参数化时间线旅程、跨刷新/离开页面的持久恢复、未知写入结果恢复；真实身份/原生浏览器验收仍独立开放。本地功能可继续，无新增外部阻塞。不得以本批提交代替全部 checklist 完结。


## C03 — 参数化项目时间线隔离与同挂载创建恢复（2026-09-27，本地子项）

### 本批实现与边界

- 继续 EXT-PRJ-03，不关闭 C03 或完整项目旅程。时间线路由按成员/项目路径键挂载；读取使用 AbortController 与代次校验，切换项目取消旧 GET、清空旧草稿并忽略迟到读写回执。App 目前只在首次挂载读取 session；本批没有新增会话刷新机制，不能据 key 声称动态账号切换或真实双身份完整验收。
- 读取/状态写入/创建及写后回读遇 401/403/404，清除私有行与表单，恢复入口只重新 GET。普通续页失败保留已读行并允许原游标重试；校验行的 projectId、项目详情 id、页内重复、页大小和游标循环；跨页重叠按 id 合并。不把更新排序的 cursor 分页声称为快照或数字分页。
- 新 TimelineCreateForm 保留同一挂载内不可变 id/clientKey/完整载荷，校验标题/正文及起止时间。写入未知结果保留并冻结字段，用户显式重试原键/原载荷；已确认创建但读取失败时只重试 GET。收到有效创建回执且列表回读成功才清空草稿。
- 初次明确 4xx 拒绝（除 408 及权限/失效对象）保留可编辑草稿，下次提交才生成新意图；曾经未知的原请求即使重试返回 400，也不擅自放弃原意图。创建回执严格匹配项目/id/clientKey 和 created 类型；同帧创建/状态/续页互斥。
- 只对未解决意图提供 beforeunload 提醒，**没有跨刷新/路由离开的持久恢复**。时间线状态仍为既有非条件写，未知状态结果、完整编辑和数字分页仍开放。本批无数据库/API schema 变更，不扩展关联编辑范围。

### RED → GREEN 与验证

- 首批 16 项真实 App / happy-dom 测试先观察到 **14 failed / 2 passed**，失败覆盖旧草稿泄漏、未取消读取、拒绝后旧行保留、错误归属/重复/循环响应、创建确认前丢草稿及同帧重复写入。
- 实现后追加拒绝/重试等边界测试，观察到创建 404 未清屏的 **1 failed / 30 passed**（4 文件），修复后通过。最终新增文件 **33/33**，覆盖返回项目/重进时间线、日期校验、迟到创建/状态回执、普通失败重试、撤权/项目失效、固定意图与同帧互斥。HTTP fixture 不替代后端授权证据。
- 最终联合 **22 文件，407/407 通过**，包含既有本地 D1 时间线重放与隔离、项目计数和目标/项目条件写回归：

```sh
rtk proxy npx vitest run test/unit/frontend-project-timeline-recovery.test.tsx test/unit/frontend-project-timeline-page.test.tsx test/unit/project-timeline-service.test.ts test/worker/project-timeline.test.ts test/unit/frontend-planning-conflicts.test.tsx test/worker/planning-conditional-writes.test.ts test/unit/frontend-planning-numbered-pages.test.tsx test/unit/frontend-pagination.test.tsx test/unit/frontend-planning-create-recovery.test.tsx test/unit/frontend-project-summary-recovery.test.tsx test/unit/frontend-workbench-extended-routes.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-a11y.test.tsx test/unit/frontend-goals-page.test.tsx test/unit/frontend-projects-page.test.tsx test/worker/goals.test.ts test/worker/projects.test.ts test/worker/planning-numbered-pages.test.ts test/unit/goals-service.test.ts test/unit/projects-service.test.ts test/unit/goals-route.test.ts test/unit/projects-route.test.ts
```

- typecheck、build:ui、verify:i18n、test:i18n 13/13、verify:workbench-maturity 13/13、verify:delivery-status 30/30 通过；领域审计证据已重新生成，audit:workbench-domain 通过。新增表单及测试挂入 timeline 能力证据，不改冻结历史 gap 文案/ownership，不提升 release/acceptance 维度。
- 既有 >500 kB chunk 警告仍在；仓库 typecheck 不覆盖全部前端 TSX。没有运行全仓 npm test/check，也不是原生浏览器/生产验收。未 push、merge、部署、远程迁移、备份、生产写入或手工读取/上传 Secret；未调用 AI。

### 总进度和下一环节

- 重新按 canonical checklist 统计：原清单 **30 父项**，D08 发布排除后 **29 范围内 / 已关闭 1（B03）/ 未关闭 28**。当前 C03，时间线本地子项勾选，EXT-PRJ-03 和 C03 保持开放；不得把本批提交当作全部 checklist 完结。
- 下一环节继续 EXT-GL-02 / EXT-PRJ-03：完整目标/任务关联编辑与计数回读、时间线条件状态写及未知写恢复、跨刷新/路由离开恢复。真实身份及原生浏览器验收独立保留。当前无新增外部阻塞，允许继续本地功能实施。


## C03 — 时间线条件状态写与冲突/未知结果回读（2026-09-27，本地子项）

### 本批实现与边界

- 从 `bb3d134` 继续 EXT-PRJ-03。状态 API 新增必填 `expectedUpdatedAt`，接受规范 ISO 版本；缺失/非规范版本 400，旧版本 409，成员/项目归属不符仍先返回 404。body 不允许声明成员、query 不允许传版本。
- 复用 planning-version 校验并扩展 timeline 错误码。D1 batch 中 UPDATE 按 member_id/project_id/id/updated_at 比较，再读取该行；仅 changes=1 算成功，失败竞争不能返回胜者数据伪装本次成功。同值状态也消费版本；冻结时钟、倒退时钟、ABA 状态回转都严格递增。
- 前端发送当前显示行版本，核对状态回执的项目/id/目标状态及递增规范时间。409 只回读并提示核对；网络拒绝、408、5xx、可重试错误和非法回执均视为结果不明，只 GET，不自动重发 POST，也不根据当前行反推本次请求已提交。
- 核对期间同帧状态/创建/续页互斥。已确认写、冲突或未知结果的回读失败均清空私有旧行，恢复按钮只 GET；同挂载未知警告在普通读取失败后保留。401/403/404 清除私有状态，离开路由取消并忽略迟到回读。普通分页失败仍保留已有行，不混淆两类失败策略。
- 无数据库迁移、新依赖或存储扩展。此为状态 API 契约收紧，旧调用方缺少版本将得到 400；本批只更新仓库内调用方并在本地验证，未发布。仍没有跨刷新/路由离开的持久意图，也没有 timeline 数字分页、完整编辑或目标/任务关联编辑 UI。

### RED → GREEN 与验证

- 新增本地 D1 16 项首先观察到 **12 failed / 4 passed**，覆盖丢失更新、同值版本消费、冻结/倒退时钟、直接 SQL 条件、缺失及非法版本、严格 API 与归属隔离。
- 新增真实 App / happy-dom 17 项首先观察到 **16 failed / 1 passed**，覆盖 409、权限/普通回读失败、同刻互斥、卸载迟到结果、网络/超时/服务端未知结果、非法回执及已知 400 不自动回读。
- 实现后定向 **5 文件 75/75**，最终联合 **24 文件 440/440** 通过；新用例共 **33/33**。执行命令：

```sh
rtk proxy npx vitest run test/unit/frontend-project-timeline-conflicts.test.tsx test/worker/project-timeline-conditional-writes.test.ts test/unit/frontend-project-timeline-recovery.test.tsx test/unit/frontend-project-timeline-page.test.tsx test/unit/project-timeline-service.test.ts test/worker/project-timeline.test.ts test/unit/frontend-planning-conflicts.test.tsx test/worker/planning-conditional-writes.test.ts test/unit/frontend-planning-numbered-pages.test.tsx test/unit/frontend-pagination.test.tsx test/unit/frontend-planning-create-recovery.test.tsx test/unit/frontend-project-summary-recovery.test.tsx test/unit/frontend-workbench-extended-routes.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-a11y.test.tsx test/unit/frontend-goals-page.test.tsx test/unit/frontend-projects-page.test.tsx test/worker/goals.test.ts test/worker/projects.test.ts test/worker/planning-numbered-pages.test.ts test/unit/goals-service.test.ts test/unit/projects-service.test.ts test/unit/goals-route.test.ts test/unit/projects-route.test.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run verify:i18n
rtk proxy npm run test:i18n
rtk proxy npm run verify:workbench-maturity
rtk proxy npm run verify:delivery-status
rtk proxy node scripts/workbench-domain-audit.mjs --write docs/operations/evidence/2026-09-26-workbench-functional-domain-audit.md
rtk proxy npm run audit:workbench-domain
```

- 上述检查通过：i18n 13/13、maturity 13/13、delivery-status 30/30；领域证据已重新生成并校验。将新测试和共享版本 helper 挂入 timeline 能力证据，不改冻结历史 gap/ownership，不提升 release/acceptance。
- 保留既有 >500 kB chunk 警告；typecheck 未覆盖全部前端 TSX。未执行全仓 npm test/check，happy-dom/HTTP fixture 不替代原生浏览器及真实身份旅程；D1 测试为本地 Workerd。未 push、merge、部署、远程迁移、备份或生产写入，未手工读取/上传 Secret，未调用 AI。

### 总进度与下一环节

- Canonical 原清单 **30 父项**；D08 发布排除后 **29 范围内 / 已关闭 1（B03）/ 未关闭 28**。本批只勾选 C03/EXT-PRJ-03 的时间线条件状态子项，父项及完整旅程保持开放。
- 下一环节仍属 C03/EXT-GL-02/EXT-PRJ-03：完整目标/任务关联编辑与计数回读、跨刷新/路由离开的持久恢复、timeline 数字分页及完整编辑；真实身份和原生浏览器验收独立保留。本地实施允许继续，无新增外部阻塞，不得把本次提交称为全部完结。


## C03 — 项目目标/任务关联编辑与计数回读（2026-09-27，本地子项）

### 本批实现与边界

- 从 `1f0c731` 继续 EXT-PRJ-03，新增项目关联编辑入口及目标/任务切换。候选列表按当前认证成员取数，20/50/100 数字分页、稳定创建顺序、准确 total、10000 行查询窗口；不再依赖摘要中最多十条目标预览。
- 新增 GET 项目 goals/tasks 列表，严格校验页参数；服务层先验证项目归属，候选与关联边均限定 member_id。关联/解除关联复用既有 POST/DELETE，解除关联补齐子对象归属检查，跨成员项目/目标/任务均 404。没有新迁移、新依赖或直接 goal-task 数据模型。
- 编辑器同刻只允许一个写入，打开期间冻结父页创建/状态/翻页及摘要重试；写后分别 GET 候选与摘要，完成数、任务总数、目标总数按服务端回读，不改变手工 progress。两次 GET 不宣称并发时的全局原子快照。
- 网络、408、5xx、409、非法回执仅显示核对提示并 GET，不自动重放。回读失败清除旧列表及该项目摘要，显式恢复只 GET 且保留同挂载未知警告。401/403/404 清空私有项目；已知 400 保留可编辑内容。关闭取消读取，代次隔离迟到响应，恢复触发按钮焦点。
- 不宣称关联/解除关联混合并发的顺序保证；不宣称未知请求已成功；没有跨刷新/离开路由的持久意图。目标直接关联任务、timeline 数字分页及完整编辑仍留在后续清单。

### RED → GREEN 与最终验证

- 本地 D1 初始 RED 为 12 项中 5 failed / 7 passed（新增列表尚不存在）；最终扩展为 14/14。数据层先出现模块缺失 RED，最终 7/7；真实 App / happy-dom 首轮 6 项 UI RED，最终 18/18。权限失效后不得回读的反例还捕获并修复了 finally 中多发 GET 的问题。
- 最终联合 **27 文件 479/479**；本批新增 **39/39**。实际执行：

```sh
rtk proxy npx vitest run test/unit/frontend-project-relations.test.tsx test/unit/frontend-project-relations-data.test.ts test/worker/project-relations.test.ts test/unit/frontend-project-timeline-conflicts.test.tsx test/worker/project-timeline-conditional-writes.test.ts test/unit/frontend-project-timeline-recovery.test.tsx test/unit/frontend-project-timeline-page.test.tsx test/unit/project-timeline-service.test.ts test/worker/project-timeline.test.ts test/unit/frontend-planning-conflicts.test.tsx test/worker/planning-conditional-writes.test.ts test/unit/frontend-planning-numbered-pages.test.tsx test/unit/frontend-pagination.test.tsx test/unit/frontend-planning-create-recovery.test.tsx test/unit/frontend-project-summary-recovery.test.tsx test/unit/frontend-workbench-extended-routes.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-a11y.test.tsx test/unit/frontend-goals-page.test.tsx test/unit/frontend-projects-page.test.tsx test/worker/goals.test.ts test/worker/projects.test.ts test/worker/planning-numbered-pages.test.ts test/unit/goals-service.test.ts test/unit/projects-service.test.ts test/unit/goals-route.test.ts test/unit/projects-route.test.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run verify:i18n
rtk proxy npm run test:i18n
rtk proxy npm run verify:workbench-maturity
rtk proxy npm run verify:delivery-status
rtk proxy node scripts/workbench-domain-audit.mjs --write docs/operations/evidence/2026-09-26-workbench-functional-domain-audit.md
rtk proxy npm run audit:workbench-domain
```

- 领域审计保留 fail-closed：将请求代码改为 AST 可识别的显式 POST/DELETE，而非削弱检测。新增四个前端可达关联写操作按 gap 登记；成熟度合同先因缺少 owner 失败，随后为四个新增 source 增补固定政策与矩阵行，统一归属已有 R4-015。当前 87 gap（47 P0 / 39 P1 / 1 P2），R4 负责 38 gap；旧 source/owner 不改、124 个实施原子不变，历史 83 gap 快照不回填。Roadmap 增量说明置于概览，不污染退出条件结构。
- 最终 maturity 13/13、delivery-status 30/30 通过，领域证据重新生成并检查通过。typecheck、UI build、i18n 检查及 13/13 i18n 合同通过；保留 >500 kB chunk 警告。typecheck 不覆盖全部前端 TSX。未执行全仓 npm test/check；本地 Workerd/D1 与 happy-dom/HTTP fixture 不代替生产、原生浏览器或真实双身份验收。
- 未 push、merge、部署、远程迁移、备份或生产写入，未手工读取/上传 Secret，未调用 AI。

### 总进度与下一环节

- 原 canonical **30 父项**，排除 D08 发布后 **29 范围内 / 已关闭 1（B03）/ 未关闭 28**。仅勾选 C03/EXT-PRJ-03 本地关联编辑子项，父项和完整旅程保持开放。
- 下一环节仍为 C03：关联写入并发顺序与跨刷新/离开路由持久恢复，然后 timeline 数字分页及完整编辑；EXT-GL-02 的直接任务关联仍待核对模型与范围。真实身份及原生浏览器验收单独保留。无新增外部阻塞，允许继续本地实施，不得将本批提交称为全部完结。


## C03 — 项目关联条件写入与混合并发顺序（本地子项完成）

承接 `377bfd0`，本批仅对应 C03 / EXT-PRJ-03 已有并发子项，未扩大到发布或生产操作。

### 实现与边界

- 项目目标/任务 POST 与 DELETE 全部要求 JSON 中的规范 ISO `expectedUpdatedAt`；缺失/无效版本返回 400，额外字段及 query 注入被拒绝。原不带版本调用不再兼容，当前只在本地同时更新前后端，未部署。
- 关联候选列表返回项目版本。服务先验证当前成员的项目和目标归属，再比较版本，跨成员仍返回 404。仓储在 D1 batch 内再次验证目标归属，避免仅依赖非复合外键。
- 同一事务先按旧版本变更关系，再消耗项目版本；重复关联/解除的 no-op 也消耗版本。任务、目标、元数据和状态共用项目版本，同版本竞争只有一个成功；冻结/倒退时钟仍单调递增。更新版本失败时整批关系写入回滚。
- 前端使用候选列表版本发起写入，409 显示冲突，未知结果保留未知提示；两者只进行 GET 回读，不自动重发写请求。显式下一次操作使用回读版本。
- 候选列表版本和列表内容未声明为全局一致快照；并发变化会保守地产生 409。关系编辑后不把单独的新版本戳写入旧项目卡片元数据；后续卡片操作可能先冲突再刷新，避免覆盖其他标签页的元数据。
- 四个关系 mutation gap 仍包含跨刷新/离开路由恢复等未完成条件，因此保留 source/owner、87 gap（47 P0 / 39 P1 / 1 P2）、R4 的 38 gap 与 124 实施原子，不把局部并发证据当成整条 gap 关闭。

### TDD 与验证

- RED：新增条件写入 Worker 首轮 14/14 失败；前端定向首轮 6 失败 / 22 通过，覆盖未传版本、未验证列表版本和错误的冲突提示。
- 反证修正：初版认为跨成员外键会拒绝写入，真实本地 D1 反例否定该假设，改为事务 SQL 显式目标归属条件，并增加回滚 trigger、跨类型竞争和严格请求体验证。
- GREEN：新增 Worker 18 项、关联 UI 19 项、数据层 10 项；定向 7 文件 85/85。联合目标/项目、分页、创建恢复、timeline、关联、权限及可访问性回归 28 文件 501/501（2026-09-27 本地）。
- 命令：`rtk proxy npx vitest run`，参数为本批新增的 `test/worker/project-relation-conditional-writes.test.ts` 加上上一批 27 个目标/项目联合回归文件；另执行 `rtk proxy npm run typecheck`、`rtk proxy npm run build:ui`、`rtk proxy npm run verify:i18n`、`rtk proxy npm run test:i18n`，全部通过，i18n 13/13。UI build 保留 >500 kB chunk 警告；typecheck 不覆盖全部前端 TSX。
- `rtk proxy npm run verify:workbench-maturity` 13/13、`rtk proxy npm run verify:delivery-status` 30/30；领域证据重新生成，`rtk proxy npm run audit:workbench-domain` 检查通过，`rtk git diff --check` 通过。
- 本地 Workerd/D1 与 happy-dom/HTTP fixture 不代替真实身份、原生浏览器或生产验收。未执行全仓 npm test/check；未 push、merge、部署、远程迁移、生产写入、备份或手工读取/上传 Secret；未调用 AI。

### 总进度与下一环节

- 原 canonical 30 父项，排除 D08 发布后仍为 **29 范围内 / 已关闭 1（B03）/ 未关闭 28**。仅勾选 C03 / EXT-PRJ-03 本地关联并发子项，父项保持开放。
- 下一环节允许继续 C03 的跨刷新/路由离开持久恢复；随后 timeline 数字分页及完整编辑、目标直接任务关联模型核对与旅程。无新增外部阻塞，不把本次本地提交称为全部完结。


## C03 — 目标/项目创建会话级持久恢复（本地子项完成）

承接 `ba214e8`，仅推进 C03 / EXT-GL-02 / EXT-PRJ-03 的目标与项目创建恢复，不扩大到生产操作。

### 实现与边界

- 真实 App 将当前登录成员传入创建表单，以成员和 GOALS/PROJECTS 模块隔离 sessionStorage；POST 前持久化不可变 id/clientKey/title/description 并读回验证。记录严格校验版本、作用域、字段、类型及长度；损坏、错误载荷、不可用、写入失败或清理失败均阻止新创建，不静默删除问题记录。
- 刷新/路由返回不自动 POST。未知结果只允许用户显式重试原意图；已有合法成功回执的记录只允许 GET 回读。确认回读并成功清理后才解锁新创建；重复恢复不降级已确认状态。迟到旧挂载回执不能更新新挂载恢复记录。
- 401/403 清除 UI 私有字段并尝试清理本成员有效记录；若浏览器拒绝存储访问，不能保证物理清理。其他成员不渲染、重放或删除该成员记录；项目 404 不删除创建恢复记录。独立预览/组件调用无成员参数时保持原内存行为，真实登录 App 始终传入成员。
- 这是当前标签页会话恢复，不是长期备份：不承诺关闭标签、清除浏览器数据、跨设备或跨标签协调。未添加应用层加密，未修改后端或迁移；已输入私有草稿暂存在当前浏览器会话内，不由存储 helper 向外发送。未提交前未发送的普通编辑草稿不在恢复范围内。
- 状态/进度/关联及 timeline 创建未知结果的持久恢复、timeline 数字分页/完整编辑、目标直接关联任务模型与旅程仍开放。历史 gap source/owner 不变，87 gap（47 P0 / 39 P1 / 1 P2）、R4 38 gap、124 实施原子不因该局部证据改为关闭。

### TDD 与验证

- RED：存储合同首轮 14/14 失败；App 恢复首轮 6 失败 / 44 通过。新增撤权清理反证后 4 失败 / 46 通过，定位并修复回读撤权只清界面未清恢复记录的问题。
- GREEN：新增存储 14 项、新浏览器上下文恢复 10 项、既有创建恢复扩至 56 项；定向 3 文件 80/80。新上下文测试手动复制会话记录到 fresh happy-dom realm，不声称原生浏览器刷新验收。
- 联合回归命令：`rtk proxy npx vitest run`，参数为上一批 28 个目标/项目联合回归文件，加 `test/unit/frontend-planning-create-storage.test.ts`、`test/unit/frontend-planning-create-reload.test.tsx`；30 文件 **537/537**（2026-09-27 本地）。
- `rtk proxy npm run typecheck`、`rtk proxy npm run build:ui`、`rtk proxy npm run verify:i18n`、`rtk proxy npm run test:i18n` 均通过，i18n **13/13**；UI build 保留 >500 kB chunk 警告，typecheck 不覆盖全部前端 TSX。
- 领域证据重新生成，`rtk proxy npm run audit:workbench-domain` 检查通过；`rtk proxy npm run verify:workbench-maturity` **13/13**、`rtk proxy npm run verify:delivery-status` **30/30**，`rtk git diff --check` 通过。
- 本地 Workerd/D1、happy-dom/HTTP fixtures 不代替生产、真实双身份或原生浏览器验收。未运行全仓 npm test/check；未 push、merge、部署、远程迁移、备份、生产写入或手工读取/上传 Secret；未调用 AI。

### 总进度与下一环节

- 原 canonical 30 父项，排除 D08 后 **29 范围内 / 已关闭 1（B03）/ 未关闭 28**。只勾选创建会话恢复子项，C03/EXT-GL-02/EXT-PRJ-03 父项继续开放。
- 下一环节允许继续 C03 状态/进度/关联未知写入的持久恢复，然后 timeline 数字分页和完整编辑；真实身份与原生浏览器验收仍独立保留。无新增本地外部阻塞，不将本地提交宣称为全部完结。


## C03 — 目标状态/进度与项目状态的会话级只读恢复（本地子项完成）

承接 `111c32b`，本批只覆盖 C03 / EXT-GL-02 / EXT-PRJ-03 三个既有条件写入入口；不改关系或时间线写入，不扩展到生产操作。

### 实现与边界

- 新增 `planning-write-recovery` 存储契约与共享 hook/banner。真实 App 按登录成员与模块隔离 sessionStorage；POST 前保存并读回验证 `{token,id,expectedUpdatedAt}`，不保存标题、目标值或可执行请求。存储损坏、不可用、配额拒绝、已有记录、异成员/模块及清理失败均阻止新写入；清理比较完整旧记录，不删除被替换的记录。
- 未知结果或离开页面后保留只读恢复标记；重新挂载/刷新不会自动写入，用户显式操作才 GET 原对象和当前列表。对象 ID 必须匹配、版本必须是规范 ISO 且不早于写前版本，列表回读成功后才尝试释放标记。恢复不是重放队列，也不是“原请求已成功”的证明；版本未变化仍可核对现状，下一次明确操作携带当时显示的版本，迟到原写入由服务端 CAS 竞争处理。
- 正常写入成功/409 冲突经过原有列表对账后释放标记；空白、错对象、错目标状态/进度、无效/未推进版本的成功回执按结果未知处理。明确不可重试 4xx（不含 408/409）才解除写入锁；网络失败、408、未知 409、5xx 和非法回执保留恢复入口。
- 401/403 清空私有 UI 并尝试清理本成员记录，存储不可访问时不能承诺物理删除；404 清空旧内容但保留标记，不提供绕过目标核对的丢弃按钮。目标读取仍失败时保持锁；目标可再次读取后才能继续核对。
- 路由离开或分页查询变化取消并失效旧回读；迟到写入/回读不清除新挂载的记录。写入恢复期间禁止同模块创建、状态/进度、分页及打开关联编辑。读取核对可以重试，不能自动重发原条件写入。
- 仅当前标签页会话；关闭标签、清理存储、跨设备或真正原生浏览器的持久性不在本批证明范围。fresh happy-dom realm 手动复制记录用于恢复契约测试，不能替代原生刷新验收。
- 增补目标/项目成熟度记录的测试证据路径，不改历史 gap source/owner，不自行关闭成熟度缺口：仍为 87 gap（47 P0 / 39 P1 / 1 P2）、R4 38 gap、124 实施原子。

### TDD 与验证

- RED：初始恢复 App 测试 21 失败 / 2 通过，存储模块尚不存在；新增回执反例 21 失败 / 4 通过。404 旧内容清屏反例两项失败后修复；分页查询改变后的迟到回读两项失败后，加入查询生命周期失效并验证可重新恢复。
- GREEN：存储 8 项、真实 App 恢复 37 项、回执校验 25 项。首次联合回归 604 通过 / 3 失败，原因是既有成功写入夹具仍返回旧版本/旧状态；将夹具改为符合服务端已存在的版本推进协议，未放宽回执校验或移除原断言。
- 最终联合回归 33 文件 **607/607**（2026-09-27 本地）。命令为 `rtk proxy npx vitest run`，参数是上一批 30 个目标/项目联合回归文件，加 `test/unit/frontend-planning-write-storage.test.ts`、`test/unit/frontend-planning-write-recovery.test.tsx`、`test/unit/frontend-planning-write-receipts.test.ts`；覆盖目标、项目、关联、时间线、分页、权限、创建恢复和可访问性。
- `rtk proxy npm run typecheck`、`rtk proxy npm run build:ui`、`rtk proxy npm run verify:i18n`、`rtk proxy npm run test:i18n` 通过，i18n **13/13**；UI build 保留 >500 kB chunk 警告，typecheck 不覆盖全部前端 TSX。
- 领域证据重新生成，`rtk proxy npm run audit:workbench-domain` 检查通过；`rtk proxy npm run verify:workbench-maturity` **13/13**、`rtk proxy npm run verify:delivery-status` **30/30**，`rtk git diff --check` 通过。
- 本地 Workerd/D1 和 happy-dom/HTTP fixtures 不代替真实双身份、原生浏览器或生产验收。未执行全仓 npm test/check；未 push、merge、部署、远程迁移、备份、生产写入、手工读取/上传 Secret 或 AI 调用。

### 总进度与下一环节

- 原 canonical 30 父项，排除 D08 后仍为 **29 范围内 / 已关闭 1（B03）/ 未关闭 28**。本批只勾选状态/进度会话恢复子项，C03 / EXT-GL-02 / EXT-PRJ-03 父项保持开放。
- 下一环节为项目关联的跨刷新/离开路由持久恢复，随后是 timeline 创建/状态恢复、数字分页与完整编辑、目标直接关联任务及真实身份/原生浏览器验收。无新增外部阻塞，允许继续本地实施；本次提交不代表全部完结。


## C03 — 项目关联会话级只读恢复（本地子项完成）

承接 `e5f84e7`，只推进 C03 / EXT-PRJ-03 的四种项目关系写入恢复；不扩大到 timeline 或生产操作。

### 实现与边界

- 目标/任务的关联、解除关联共用既有 PROJECTS 条件写恢复标记。POST/DELETE 前保存并读回验证；标记仅含操作 token、项目 id 和旧版本，不含关系目标、标题、载荷或待重放指令。成员隔离及严格存储校验沿用已验证的条件写恢复模块。
- 同挂载成功或不确定写入之后，只 GET 关联页和项目计数；两者成功且项目版本不倒退才释放标记。不确定提示保留，不把读回等同于原请求成功。已知非重试 400 拒绝可以释放；401/403 清除私有内容并尝试清理，404 清屏并保留标记。
- 读回失败保留锁；显式 Retry links 只读取，不重复写入。存储不可用、丢弃写入、清理失败都不允许继续 mutation；关闭编辑器也不能绕过模块锁。编辑器打开时禁用父页面通用恢复，避免两个恢复流程互相抢先释放。
- 路由退出后的迟到回执或读回不得清理恢复标记。返回/新上下文仅加载列表，不自动 POST/DELETE；显式恢复 GET 项目与当前列表后解除模块屏障，重新打开编辑器会再 GET 关系/计数，以读取的新版本发起新的用户操作。
- 通用恢复未证明特定目标关系已改变，也不声称原请求已提交；它仅核对当前项目和列表。仅当前标签页 sessionStorage，fresh happy-dom realm 复制记录是模拟契约，不代替原生刷新、关闭标签/清存储、跨设备或真实双身份验收。
- 未改 backend/schema、原 gap source/owner 或发布/验收维度；仍为 87 gap（47 P0 / 39 P1 / 1 P2）、R4 38 gap、124 实施原子。

### TDD 与验证

- RED：新增 `test/unit/frontend-project-relations-reload.test.tsx` 17 项中 15 失败 / 2 通过，缺口为写前无持久标记、存储失败仍写入、迟到结果和读回版本回退未锁定。
- GREEN：新增 17 项与既有关系 UI 19 项合计 **36/36**，覆盖四种关系操作、成员隔离、新 realm、路由返回、只读重试、失败存储、401/403/404、已知 400、计数失败和迟到读写。
- 联合回归 **34 文件 624/624**；命令为 `rtk proxy npx vitest run`，沿用上一批 33 个文件并加入 `test/unit/frontend-project-relations-reload.test.tsx`，覆盖目标/项目、关联、timeline、分页、创建/条件写恢复、权限与可访问性。
- `rtk proxy npm run typecheck`、`rtk proxy npm run build:ui`、`rtk proxy npm run verify:i18n`、`rtk proxy npm run test:i18n` 通过（i18n **13/13**）。UI build 仍有 >500 kB chunk 警告；typecheck 不覆盖全部前端 TSX。
- 项目 capability 追加专属测试证据并重新生成领域审计；maturity **13/13**、delivery status **30/30**、domain audit 检查通过。
- 本地 Workerd/D1 与 happy-dom/HTTP fixtures 不代替生产或真实身份验收；未执行全仓 npm test/check，未 push、merge、部署、远程迁移、备份、生产写入、手工读取/上传 Secret 或 AI 调用。

### 总进度与下一环节

- 原 canonical 30 父项，排除 D08 后 **29 范围内 / 已关闭 1（B03）/ 未关闭 28**。仅勾选关系会话恢复子项，C03 / EXT-PRJ-03 父项仍开放。
- 下一环节允许继续 timeline 创建/状态的持久恢复，其后为 timeline 数字分页/完整编辑、目标直接关联任务与真实身份/原生浏览器验收。无新增本地外部阻塞；本次提交不代表全部完结。


## C03 — 时间线创建/状态的会话级持久恢复（本地子项完成）

承接 `59487f3`，严格推进 C03 / EXT-PRJ-03 已列出的 timeline 创建与状态跨刷新/路由离开恢复；不扩展后端业务、迁移或生产操作。

### 实现与边界

- 创建记录按当前登录成员与项目隔离，POST 前保存并读回验证 `id/clientKey/kind/title/body/startsAt/dueAt` 七字段不可变意图。严格校验作用域、结构、枚举、字段长度、规范 ISO 日期及起止顺序；不静默替换损坏记录或不同载荷。返回路由或新上下文不自动 POST；未知结果仅允许显式同意图重试，合法成功回执先持久化 acknowledged，之后只允许 GET 回读。
- 状态操作复用只读恢复标记 `{token,id,expectedUpdatedAt}`，作用域为成员与 `TIMELINE:projectId`，不保存私有正文、目标状态或可执行请求；写前必须持久化并读回验证。正常回读包含原对象且版本不早于写前版本才释放；对象不在当前页或读回失败仍保留标记，显式恢复通过已有详情 GET 加项目/列表 GET 核对，不重放原写入。
- 详情核对拒绝错项目、错 id、非法及回退版本；清理采用比较后删除，失败继续锁定。401/403 清空私有 UI 并尝试删除本成员有效记录；浏览器拒绝删除时不承诺物理清理。404 清屏但保留记录。成员/项目隔离、异步取消与代次守卫使迟到创建回执和只读结果不能解除新挂载的恢复锁。
- 创建、状态与续页保持互斥；存储不可用、配额拒绝、静默丢弃或损坏均在发写请求前阻止操作。此功能仅当前标签页 sessionStorage，不提供关标签、清浏览器数据、跨标签协调或跨设备恢复；普通未发送编辑草稿不在恢复范围内。不新增应用层加密或备份。
- 新增恢复 helper、已有详情 GET 的前端调用及测试进入 timeline 能力证据，重新生成当前领域快照；历史 gap source/owner、87 gap（47 P0 / 39 P1 / 1 P2）、R4 38 gap、124 实施原子不变，不提升 release/acceptance 维度。

### TDD 与验证

- RED：创建存储模块缺失；修正 App 测试按钮选择后，15 项恢复测试有 13 失败 / 2 通过，定位跨挂载记录、锁和恢复行为缺失。实现后首轮 2 项断言先于异步完成，改为等待真实读回 UI 完成再断言，未放宽业务断言。
- GREEN：创建存储 19 项、新增真实 App / happy-dom 27 项、共享状态存储增 1 项（该文件共 9 项）；三文件定向 **55/55**。覆盖成员/项目隔离、完整载荷存储比较、acknowledged 单调、无自动重放、损坏/拒绝/丢弃存储、迟到回执、错误对象、版本回退、401/403/404/503 和清理失败。
- 联合回归命令：`rtk proxy npx vitest run`，参数为上一批 34 个目标/项目/关联/时间线联合文件，加 `test/unit/frontend-timeline-create-storage.test.ts` 与 `test/unit/frontend-timeline-reload.test.tsx`；36 文件 **671/671**（2026-09-27 本地）。
- `rtk proxy npm run typecheck`、`rtk proxy npm run build:ui`、`rtk proxy npm run verify:i18n`、`rtk proxy npm run test:i18n` 均通过，i18n **13/13**；保留 >500 kB chunk 警告，typecheck 不覆盖全部前端 TSX。
- `rtk proxy npm run verify:workbench-maturity` **13/13**、`rtk proxy npm run verify:delivery-status` **30/30**、`rtk proxy npm run audit:workbench-domain` 与 `rtk git diff --check` 通过。
- 新上下文恢复测试是将 sessionStorage 记录复制到 fresh happy-dom realm；不是原生浏览器刷新验收。本地 Workerd/D1、HTTP fixtures 不替代真实双身份或生产验收。未运行全仓 npm test/check；未 push、merge、部署、远程迁移、生产写入、备份、AI 调用或手工读取/上传 Secret。

### 总进度与下一环节

- canonical 30 父项，排除 D08 后 **29 范围内 / 已关闭 1（B03）/ 未关闭 28**。本批只勾选时间线会话恢复子项，C03 与 EXT-PRJ-03 继续开放。
- 下一环节允许继续 timeline 数字分页与完整编辑，之后目标直接关联任务旅程；真实身份/原生浏览器完整旅程独立保留。无新增本地外部阻塞，不将本地提交或 GET 核对声称为全部完结或未知原请求已成功。


## C03 — 时间线数字分页与 URL 恢复（本地子项完成）

承接 `705abdc`，推进 C03 / EXT-PRJ-03 中 timeline 数字分页；完整编辑与后续目标直接关联任务保持待办。本批不新增迁移或生产操作。

### 实现与边界

- 时间线 GET 增加 `page/pageSize`，支持 20/50/100；严格拒绝重复、非法、未知及与 cursor/limit 混合的参数，offset 必须小于 10000。会话成员与所属项目同时约束 rows/count，D1 同 batch 读取；缺失/其他成员项目为 404，未登录为 401，owned 空项目及超过末页返回准确 total 与空数组。
- 编号分页按 `created_at DESC, id DESC` 排序，状态更新时间不会把已有行搬到另一页。并发新增/删除仍可能改变偏移页，不承诺跨请求固定快照。旧 cursor GET、排序和项目绑定保持兼容；测试发现旧跨项目游标抛普通 Error 导致 500，改为明确 400，且安全拒绝 null/非对象载荷。
- App 采用编号分页替换旧续页追加：深链/历史页码恢复、非法 URL 归一化、页大小切换回到第一页、空页返回；请求页/页大小/总数/条数/重复 ID/项目归属严格验证。取消和代次守卫拒绝迟到响应；翻页失败清除旧行，重试只 GET 当前请求页。保留真实总数，但窗口之外的页面不可点击。
- 翻页、创建及状态写同步互斥。浏览器 history 仍可改变位置，未决创建和状态标记不丢失；旧创建回执与旧详情核对不得释放新页面锁。显式只读恢复可核对不在当前页的原对象，不重放写入，不把 GET 成功当作未知写入成功证明。
- 迁移原有 App timeline fixtures 到严格 numbered metadata；旧 cursor UI 测试按实际改动迁移为编号替换、失败清屏/原页重试、错页响应拒绝，未删除恢复/权限/并发断言。公共 page 展示组件保留无 pagination 的旧 preview 兼容，但真实 App 不回退到 cursor。
- 更新能力证据和领域快照；历史 gap source/owner、87 gap（47 P0 / 39 P1 / 1 P2）、R4 38 gap、124 实施原子不变，不提升 release/acceptance 维度。

### TDD 与验证

- RED：新后端测试初始 6 失败 / 9 通过，证明合法编号请求和 service 缺失；实现后捕获 metadata 多余 projectId、旧越作用域游标 500，并修正。新 App 分页测试初始 11/11 失败，证明尚无页码请求/控件/查询生命周期。
- GREEN：新增 Worker/D1 18 项、真实 App / happy-dom 分页 11 项、严格数据契约 11 项，以及原持久恢复文件新增 2 项跨页未知写入/迟到核对，共新增 42 项；联合回归沿用上一批 36 文件并追加三个 numbered 文件，**39 文件 713/713** 通过（2026-09-27 本地）。
- 联合命令：`rtk proxy npx vitest run`，上一批 36 文件加 `test/worker/project-timeline-numbered-pages.test.ts`、`test/unit/frontend-timeline-numbered-pages.test.tsx`、`test/unit/frontend-timeline-numbered-data.test.ts`。
- `rtk proxy npm run typecheck`、`rtk proxy npm run build:ui` 通过；保留 >500 kB chunk 警告，typecheck 不覆盖全部前端 TSX。
- `rtk proxy npm run verify:i18n`、`rtk proxy npm run test:i18n` **13/13**、`rtk proxy npm run verify:workbench-maturity` **13/13**、`rtk proxy npm run verify:delivery-status` **30/30**、领域快照生成及 `rtk proxy npm run audit:workbench-domain` 通过。
- 本地 Workerd/D1 与 happy-dom/HTTP fixtures 不替代真实双身份、原生浏览器及生产验收。未执行全仓 npm test/check；未 push、merge、部署、远程迁移、生产写入、备份、AI 调用或手工读取/上传 Secret。

### 总进度与下一环节

- canonical 30 父项，排除 D08 后 **29 范围内 / 已关闭 1（B03）/ 未关闭 28**；本批仅勾选 timeline 数字分页子项，C03 / EXT-PRJ-03 父项保持开放。
- 下一环节允许继续 timeline 完整编辑，然后目标直接关联任务旅程；真实身份/原生浏览器验收独立保留。无新增本地外部阻塞，不把本地提交宣称为全部完结。


## C03 — 时间线完整内容编辑（2026-09-27，本地子项完成）

承接 `3ba5bd2`，完成 C03 / EXT-PRJ-03 的 timeline 完整编辑本地切片；不新增迁移或生产操作。

### 实现边界

- 新增 `PATCH /api/projects/:projectId/timeline/:id`，必须显式提供类型、标题、正文、开始/截止时间和规范 `expectedUpdatedAt`；拒绝额外字段/查询参数。会话推导 memberId，本人项目及条目检查；D1 batch 以 member/project/id/旧版本原子更新五字段并单调推进版本。状态写与内容写共用版本，旧版本 409、外部成员/项目 404；保留 id/clientKey/status/createdAt。
- 页面内联编辑预填五字段，保留未改变日期的原始精度与时间点；校验标题/正文长度及日期先后，打开聚焦标题、取消返回编辑按钮。同刻编辑/状态写互斥，离开页面取消并忽略迟到响应。
- 严格校验写回执对象、不可变字段、全部目标内容及推进版本；已确认写后的 GET 不允许回退至低于回执的版本。409 保留当前挂载草稿但禁止旧版本再次保存；未知结果只 GET 核对，不自动重放。读失败清空旧私有行，401/403/404 失权处理沿用既有边界；会话恢复仅保存对象/版本标记，不保存编辑正文，刷新后草稿不恢复。
- 修复共用创建校验中合法 `__invalid__` 正文被误拒、超出 JavaScript Date 范围的安全整数导致异常，以及前端非法日期回执被规范化为空值后误接受的问题。
- 历史 gap source/owner 不变，87 gaps（47 P0 / 39 P1 / 1 P2），R4 38 gaps / 124 实施原子；本地子项证据不提升 release/acceptance 状态。

### TDD 与验证证据

- RED：编辑接口初始返回 405/缺少方法；页面无编辑入口；随后新增超范围日期、合法正文、非法日期回执、旧版本写后 GET、编辑焦点测试均捕获预期失败，再实现修复。
- GREEN：新增 `test/worker/project-timeline-edit.test.ts` 31 项，包含真实本地 D1 条件写、状态竞争、跨成员/项目及 HTTP 会话/自动化身份权限；`test/unit/frontend-timeline-edit-data.test.ts` 15 项；`test/unit/frontend-timeline-edit.test.tsx` 13 项。共新增 **59 项**。
- 联合命令：`rtk proxy npx vitest run`，沿用前批 39 文件，追加上述三个文件；**42 文件 772/772 通过**（2026-09-27 本地）。覆盖编辑、冲突/未知结果恢复、分页、目标/项目/关联、持久恢复与无障碍回归。
- `rtk proxy npm run typecheck`、`rtk proxy npm run build:ui`、`rtk proxy npm run verify:i18n`、`rtk proxy npm run test:i18n` **13/13** 通过。构建仍有 >500 kB chunk 警告；typecheck 不覆盖全部前端 TSX。
- 审计初次捕获新 PATCH 缺少 mutation 声明；已补充独立条件写绑定及源代码/测试证据，不改旧 gap 文案与 owner。重新生成领域快照，`verify:workbench-maturity` **13/13**、`verify:delivery-status` **30/30**、`audit:workbench-domain` 和 `git diff --check` 均通过。
- 本地 Workerd/D1 与 happy-dom/HTTP fixtures 不替代真实双身份、原生浏览器及生产验收。未执行全仓 npm test/check；未 push、merge、部署、远程迁移、生产写入、备份、AI 调用或手工读取/上传 Secret。

### 总进度与下一环节

- canonical 30 父项，排除 D08 后 **29 范围内 / 已关闭 1（B03）/ 未关闭 28**；本批只勾选 timeline 完整编辑子项，C03 / EXT-PRJ-03 父项保持开放。
- 下一环节允许继续目标直接关联任务的模型核对与旅程；真实身份/原生浏览器验收独立保留。无新增本地外部阻塞，不把本地提交宣称为全部完结。


## C03 — 目标直接关联任务（2026-09-27，本地子项完成）

承接 `5e5a53b`，严格推进 C03 / EXT-GL-02 既有任务关联子项。核对确认原实现只有项目—目标、项目—任务关系，故新增独立目标—任务关系，不复用项目间接关联，不改变目标手动进度语义。

### 实现边界

- 新增 `0053_goal_tasks.sql`：成员/目标/任务联合主键、目标及任务的同成员复合外键与级联删除、反向索引。迁移仅在本地 Worker/D1 测试库验证，未执行远程迁移。
- 新增 GET/POST `/api/goals/:id/tasks` 与 DELETE `/api/goals/:id/tasks/:taskId`；会话派生成员、tasks:use 权限、严格请求体/查询参数。20/50/100 候选分页，同批查询目标版本、总数、稳定 created_at/id 顺序及直接关联完成计数。一个任务可独立关联多个目标，删除任务/目标级联清理关系。
- 关联和解除在 D1 batch 内与目标版本一起提交；包括关系未变的请求也消耗版本。与状态/进度/元数据写共用版本，旧版本返回 409；不存在及其他成员对象统一 404。不会自动把完成计数换算为目标进度。
- 真实 App 增加关联编辑器，严格验证页码、重复 ID、对象、计数及推进版本回执。写入期间互斥；冲突/未知结果仅 GET 核对，不自动重放；已确认写入的回读不得倒退版本。读失败清空旧私有数据、保留只读恢复锁；失权清屏，路由离开取消并忽略迟到响应；关闭后刷新目标版本并恢复入口焦点。
- 沿用按成员/GOALS 隔离的会话恢复标记，只保存对象/版本，不保存任务正文；返回路由后显式 GET 对象与当前列表，再重新打开读取关联。回读不证明原未知请求成功，不承诺清存储、关标签或跨设备恢复。
- 领域审计补充两个条件写 source/test bindings 与迁移/前后端证据；历史 gap 文案和 owner 不变，87 gaps（47 P0 / 39 P1 / 1 P2），R4 38 gaps / 124 实施原子。

### TDD 与验证证据

- RED：后端新接口未实现时 19 项失败 / 3 项通过（404）；前端数据模块缺失；UI 焦点测试捕获裸 requestAnimationFrame 和提前聚焦问题，改为关闭后的 React effect。新恢复测试补充回归验证，不声称每个回归都经历 RED。
- 新增 `test/worker/goal-tasks.test.ts` **22** 项，`test/unit/frontend-goal-tasks-data.test.ts` **16** 项，`test/unit/frontend-goal-tasks.test.tsx` **17** 项，共 **55** 项。包括完成/重开/取消/删除、SQL 复合归属约束、不同任务并发竞争、无操作消耗版本、分页、未知回执、失权读取与迟到写入离开后恢复。
- `rtk proxy npx vitest run`：沿用前批 42 文件并追加以上三文件，**45 文件 827/827 通过**。
- `rtk proxy npm run typecheck`、`build:ui`、`verify:i18n` 通过；`test:i18n` **13/13**、`verify:workbench-maturity` **13/13**、`verify:delivery-status` **30/30**、`audit:workbench-domain` 通过。UI 构建仍有 >500 kB chunk 提示；typecheck 不覆盖全部前端 TSX。
- 领域审计先捕获动态 HTTP method 无法静态识别和 DELETE 缺少独立 route guard，已调整为显式分支并重新生成领域快照；未放宽审计器。
- 未运行全仓 npm test/check；未 push、merge、部署、远程迁移、生产写入、备份、AI 调用或手工读取/上传 Secret。本地 happy-dom/HTTP fixture 与 Workerd/D1 不代替真实身份及原生浏览器验收。

### 总进度与下一环节

- canonical 30 父项，排除 D08 后仍 **29 范围内 / 已关闭 1（B03）/ 未关闭 28**；本批只勾选 C03 / EXT-GL-02 的本地关联子项，不关闭父项。
- 下一环节允许继续 C04 收集箱/今日/日历/专注/复盘既有实现核对；先定位 EXT-INB 原子待办，避免重复新建。C03 真实身份/原生浏览器验收仍独立待办；新增迁移部署尚未进行，不称为全部完结。


## C04 — 收集箱数字分页后端（2026-09-27，本地子项完成）

承接 `da3f2f5`，进入 C04 / EXT-INB-01。已核对既有 InboxRoute、InboxService、InboxRepository、前端 InboxRoute/loadInbox/InboxPage；原页面依旧 cursor/load more。本批只完成可独立验证的后端分页层，不重复新建收集箱模块，不改创建/归档/转任务语义。

- GET `/api/inbox` 在出现 page 或 pageSize 时采用既有严格数字分页解析器；允许 status，拒绝混合 cursor/limit、重复参数、非法状态、非整数、非 20/50/100 页大小及 10000 行窗口外请求。
- Repository 复用 queryNumberedPage，在同一 D1 batch 中对同一 member_id/status 谓词 COUNT + rows；created_at DESC/id DESC 稳定排序。请求越界页返回该页空结果和真实总数，不泄露其他成员计数。未带数字分页参数的旧 cursor 调用不变。
- Service 单独校验直接调用的分页及状态，RepositoryPort/fake 同步更新；无新增表、迁移或远程操作。
- RED：新测试 **6 失败 / 12 通过**（数字分页返回 400、缺少 listNumbered）。GREEN：`test/worker/inbox-numbered-pages.test.ts` **18/18**；与 `test/worker/inbox.test.ts`、`test/unit/inbox-service.test.ts`、`test/unit/inbox-route.test.ts`、`test/unit/frontend-workbench-extended-routes.test.tsx` 联合 **5 文件 58/58**。
- `rtk proxy npm run typecheck` 通过；领域快照重新生成。仅新增后端分页测试证据，不修改历史 gap / owner，不将前端分页分类提升为 numbered。
- canonical 仍 **29 范围内 / 已关闭 1（B03）/ 未关闭 28**。EXT-INB-01 及 C04 父项保持开放；下一环节是收集箱前端数字分页、URL/筛选恢复与迟到响应隔离，允许继续本地实施。
- 本轮两批均未 push、merge、部署、远程迁移、生产写入或备份。C03 的迁移 0053 尚未发布；真实身份和原生浏览器验收未完成，不能宣称全部完结。


## C04 — 收集箱数字分页前端（2026-09-27，本地子项完成）

承接 `8962710`，继续 EXT-INB-01；不改归档/转任务后端语义，不将稳定创建意图或生产验收提前勾选。

- InboxRoute 使用 page/pageSize/status 数字分页；20/50/100，筛选/页大小变更回到第一页，浏览器历史恢复当前查询；非法/重复分页及状态参数归一化并移除旧 cursor/limit。后端旧 cursor API 保留。
- 共享 DataPagination 显示真实 total/totalPages、空越界页及可返回页；禁用超出 10000 行窗口的导航，不截断总数。不再追加旧页行。
- 数字分页响应严格检查请求页/页大小、总数与行数、重复 ID、过滤状态及关键字段；将 AbortSignal 传到 fetch。读取失败/失权移除旧私有行；路由/查询变化取消并代次隔离迟到响应。路由按成员 key 重新挂载。
- 导航开始同步锁写；写入去重并只回读仍有效的同一查询，迟到写入不刷新其他页面；本批不声称归档/转换已具备条件写、未知结果恢复或稳定创建意图。
- 页错误重试改为通用文案，筛选双语。旧 InboxPage/extended fixture 适配数字分页；旧收集箱 cursor 页面测试由新数字分页旅程替代，日历 cursor 仍保留。
- RED：新 App 分页旅程 15/15 失败（未发 page、无分页控件、旧响应未隔离等）。GREEN：新增 App 22 项 + 数据契约 13 项；其余新增边界作为回归补充，不宣称每项均经历 RED。
- 联合回归命令：`rtk proxy npx vitest run test/unit/frontend-inbox-numbered-pages.test.tsx test/unit/frontend-inbox-numbered-data.test.ts test/unit/frontend-inbox-page.test.tsx test/unit/frontend-workbench-extended-routes.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-pagination.test.tsx test/unit/frontend-planning-numbered-pages.test.tsx test/worker/inbox-numbered-pages.test.ts test/worker/inbox.test.ts test/unit/inbox-service.test.ts test/unit/inbox-route.test.ts`，**11 文件 276/276**。
- `typecheck`、`build:ui`、`verify:i18n`、`test:i18n`（13/13）通过。构建保留 >500 kB chunk 提示；typecheck 不覆盖全部前端 TSX。没有运行全仓 npm test/check。
- 成熟度仅追加测试证据，不重写历史 gap/owner/分类；本地实现以增量清单为准。canonical 仍 **29 范围内 / 已关闭 1（B03）/ 未关闭 28**。
- 无新增迁移；未 push、merge、部署、生产写入、备份、AI 调用或手工读取/上传 Secret。真实身份/原生浏览器分页旅程仍待验收。下一步允许本地继续 EXT-INB-02 稳定创建意图及精确原请求重试。


## C04 — 收集箱创建稳定意图（2026-09-27，本地子项完成）

承接 `1a8e20f`，按 EXT-INB-02 继续；仅修改收集箱创建与本地恢复，不改归档/转任务服务语义，不新增迁移。

- 创建表单一次生成并冻结 id/clientKey/kind/content/sourceUrl，成员隔离 sessionStorage 在 POST 前落盘并读回核验。保存失败不得发送；重复点击通过同步状态锁合并，未决创建阻止同页其他写操作。
- 未知结果保留草稿与原请求，必须显式重试；路由返回/新 browser realm 恢复不自动 POST。已确认回执持久标记后只 GET `/api/inbox/:id` 和当前数字分页列表，回读成功并清理恢复记录后才清空。普通首次 400/413/422 保留可编辑草稿；401/403 清屏并尝试清理本成员记录。
- 对 id/clientKey/kind/content/sourceUrl、created 布尔值及关键行字段严格校验；错误回执保留未知状态。后端同成员 clientKey 精确重试返回同一项，跨成员 GET 为 404；后端未增加载荷冲突检测，不能据此前端闭环宣称所有调用者都具有严格幂等性。
- 恢复存储损坏、权限/配额故障、读回不一致、不同未决记录均失败关闭。修复补测发现的记录替换问题：显式存储检查也不能用其他请求替代内存中未决载荷。acknowledged 单调，确认后落盘暂时失败也不能退回 POST 重试。仅当前标签页明文 sessionStorage，不保证关标签、清存储、跨设备恢复；不增加加密或备份。
- 路由按成员重新挂载；离开页面/变更查询中止 GET、忽略旧读写结果。POST 不自动取消后重发。新 realm 重建已存请求和另一成员隔离有 App/happy-dom 测试，不等同原生浏览器验收。
- RED：稳定创建初版 11/11 失败（丢草稿、每次新键、无恢复/写前存储保护）；后续存储冲突补测 1 失败 / 16 通过，修复后通过。其余新增契约边界作为补充回归，不宣称全部逐条 RED。
- 联合命令：`rtk proxy npx vitest run test/unit/frontend-inbox-create.test.tsx test/unit/frontend-inbox-create-intent.test.ts test/unit/frontend-inbox-create-data.test.ts test/unit/frontend-inbox-numbered-pages.test.tsx test/unit/frontend-inbox-numbered-data.test.ts test/unit/frontend-inbox-page.test.tsx test/unit/frontend-workbench-extended-routes.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-pagination.test.tsx test/unit/frontend-planning-numbered-pages.test.tsx test/worker/inbox-numbered-pages.test.ts test/worker/inbox.test.ts test/unit/inbox-service.test.ts test/unit/inbox-route.test.ts`：**14 文件 329/329**（较前批新增 53 项）。
- `typecheck`、`build:ui`、`verify:i18n`、`test:i18n` 13/13、`verify:workbench-maturity` 13/13、`verify:delivery-status` 30/30、领域快照校验、`git diff --check` 通过。typecheck 不覆盖全部前端 TSX；构建仍有 >500 kB chunk 提示；未执行全仓 npm test/check。
- canonical **29 范围内 / 已关闭 1（B03）/ 未关闭 28**；EXT-INB-02 和 C04 父项仍开放。下一项 EXT-INB-03 归档/转任务条件写、未知结果恢复与跳转旅程允许继续本地实施，真实身份/原生浏览器验收仍待补。
- 本批未 push、merge、部署、远程迁移、生产写入、备份、AI 调用或手工读取/上传 Secret。


## 2026-09-28：EXT-INB-03 归档/恢复条件写与只读恢复

延续 `95a3a51`，仍在 `codex/functional-checklist-completion`。本批仅关闭 EXT-INB-03 的归档/恢复本地子项，不把转任务或 C04 父项标为完成。

### 实际实现

- PATCH `/api/inbox/:id` 增加必需的 canonical `expectedUpdatedAt`；先验证 owned 对象，再按成员/id/旧版本和未 promoted 状态进行 D1 CAS。旧版本 409、外部成员/不存在 404；`meta.changes` 无命中不伪造成功；版本取旧版本 +1 与当前时钟的较大值，同状态请求也推进版本。
- 前端发送精确版本，严格校验回执身份/状态/推进版本；确认后 GET owned 原对象（版本不得早于回执），再读取精确当前页、页大小和状态筛选，不追加旧行。
- 写前使用成员隔离 INBOX sessionStorage 只读标记（仅 token/id/expectedUpdatedAt，不保存私密正文或可执行写入载荷）。未知结果、409、错误回执与失败回读保持写锁；离开再返回可显式 GET 原对象与列表核对，不自动重发 PATCH。存储损坏/写失败阻止写入；401/403 清屏并尝试清标记，404/读失败清屏但保留标记；重复点击及迟到写回执有本地回归。
- 复用现有 Planning 只读恢复机制，增加 INBOX 作用域和可选读取失败清屏回调；已有目标/项目/时间线恢复回归同时验证。旧分页测试使用真实 canonical 时间戳和新增 owned GET 的响应契约。

### RED → GREEN 与验证

- Worker/D1 条件写初始 10 failed / 1 passed：旧路由拒绝版本字段、缺版本仍写入、没有 CAS，回退时钟会触发 updated_at 约束；实现后 11/11。
- 前端状态契约初始 5 failed / 6 passed（旧签名/缺少 owned loader），最终 11/11；App 初始 15 failed / 1 passed，补充失权恢复与确定拒绝覆盖后 23/23。新增测试合计 **45**。
- 联合本地回归 **22 文件 492/492**：Inbox 创建/分页/页面/路由/服务及新状态流程、工作台扩展/成熟度路由、共享数字分页、Planning 写恢复/存储、时间线恢复，以及 Planning/时间线条件写。
- `verify:i18n`、`test:i18n` 13/13、`verify:workbench-maturity` 13/13、`verify:delivery-status` 30/30、领域审计快照校验、`git diff --check` 通过。
- `rtk proxy npm run typecheck`、`rtk proxy npm run build:ui` 通过；typecheck 不覆盖全部前端 TSX，构建仍有 >500 kB chunk 提示。未运行全仓 npm test/check，避免扩大任务范围与触发 Secret 同步钩子。

联合测试可复现命令：

```sh
rtk proxy npx vitest run test/unit/frontend-inbox-status-recovery.test.tsx test/unit/frontend-inbox-status-data.test.ts test/worker/inbox-conditional-writes.test.ts test/unit/frontend-inbox-create.test.tsx test/unit/frontend-inbox-create-intent.test.ts test/unit/frontend-inbox-create-data.test.ts test/unit/frontend-inbox-numbered-pages.test.tsx test/unit/frontend-inbox-numbered-data.test.ts test/unit/frontend-inbox-page.test.tsx test/unit/frontend-workbench-extended-routes.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-pagination.test.tsx test/unit/frontend-planning-numbered-pages.test.tsx test/worker/inbox-numbered-pages.test.ts test/worker/inbox.test.ts test/unit/inbox-service.test.ts test/unit/inbox-route.test.ts test/unit/frontend-planning-write-recovery.test.tsx test/unit/frontend-planning-write-storage.test.ts test/unit/frontend-project-timeline-recovery.test.tsx test/worker/planning-conditional-writes.test.ts test/worker/project-timeline-conditional-writes.test.ts
```

### 剩余范围与下一步

canonical **29 范围内 / 已关闭 1（B03）/ 未关闭 28**。EXT-INB-03 与 C04 父项保持开放。下一步是转任务一致性和目标跳转/权限：现有实现先调用 TasksService 创建任务，再更新 Inbox；本批没有为该流程提供事务原子性、并发唯一性或碰撞保护证明，不能因归档条件写通过而宣称转任务已完成。该子项仍允许继续本地实施；真实身份/原生浏览器验收是后续验收缺口。

本批未 push、merge、部署、远程迁移、生产写入、备份、AI 调用或手工读取/上传 Secret；无需新增迁移。


## 2026-09-28：纠正父任务推进方式，关闭 A03/A04 核对任务

用户追问为什么始终未关闭 28 项。本批在 `c6169e0` 后核对 canonical 父/子任务、既有原子证据、R1 与交付账本，确认此前连续补子项而未完成可独立关闭的核对任务，且进度汇报未区分代码缺口与功能验收。没有把“完成子项”当作父项完成，也不再把排除的 D08 发布验收作为功能任务的重复门禁。

### 实际交付

- 完成 A03：当前 33 个页面能力的五类子能力分类、限定本地实现、具体剩余工作及父任务归属；额外记录无正式路由的 VM 与会话管理。通过现有 domain audit loader 核对分类表与 manifest 的 33 路由精确相等，30 个父任务关闭条件一一对应；不宣称 A01 的全部按钮枚举或 A02 的逐 mutation 核对已完成。
- 完成 A04：`937ea87` 账户/导航/品牌修复逐项映射 R1-005/006/007/009–014 和 WB-002/WB-SETTINGS；重跑当前 Shell/菜单/焦点/导航/退出/settings 回归。原 R1 父项和交付总账 release/acceptance 不提升。
- 新增 `npm run audit:functional-checklist`，仅从 canonical 顶层 checkbox 实算 30 原始/29 范围内，拒绝缺失、重复、未知/畸形父项和父已勾但子未完；忽略子项计数与历史段落。脚本只读、不自动关闭任务，也不验证业务完成。
- [完整分类、映射与关闭条件](./2026-09-28-functional-closure-reconciliation.md)已登记，canonical 和原 R1 清单同步。

### 新鲜验证

```sh
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
rtk proxy npx vitest run test/unit/workspace-shell.test.tsx test/unit/frontend-menu-keyboard.test.tsx test/unit/frontend-shell.test.tsx test/unit/command-palette.test.ts test/unit/frontend-focus-scope.test.tsx test/unit/frontend-logout.test.ts test/unit/frontend-navigation-data.test.ts test/unit/frontend-responsive.test.tsx test/unit/frontend-a11y.test.tsx test/unit/ui-shell.test.ts test/unit/settings-page.test.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run verify:i18n
rtk proxy npm run test:i18n
rtk proxy npm run verify:workbench-maturity
rtk proxy npm run audit:workbench-domain
rtk proxy npm run verify:delivery-status
rtk git diff --check
```

- 计数器 RED：模块未实现时 import 失败；补测畸形重复父行出现 **1 失败 / 5 通过**，修复 fail-closed 校验后 **6/6**。CLI 实际输出 **3 完成 / 26 剩余**，完成 ID 为 A03/A04/B03。
- Shell 联合 **11 文件 / 95 项通过**；首次 sandbox 的日志/监听 EPERM 不记为通过，授权后相同命令重跑 exit 0。测试 harness 的 AI binding 警告不是 AI 调用，本批未调用 AI。
- `typecheck`、`build:ui`、`verify:i18n` 通过；`test:i18n` **13/13**；`verify:workbench-maturity` **13/13**；域快照 current；`verify:delivery-status` **30/30**；`git diff --check` 通过。构建保留既有 >500 kB chunk 警告，默认 typecheck 仍不覆盖全部前端 TSX；未执行全仓测试或带 Secret 同步的 build/check。

### 当前与下一步

**29 范围内 / 3 关闭 / 26 未关闭**。本批没有新增完成两个业务模块，完成的是清单本就要求的分类和映射交付物。九个父项 B01/B02/B04–B09/D01 主要剩余真实身份/原生功能验收，其他 17 个仍涉及实现、逐操作核对、身份/设备矩阵或最终门禁。具体剩余条件逐项列出，不把全部 26 项一概归咎于生产部署。

下一业务切片 C04 / EXT-INB-03 的转任务一致性与目标跳转/权限仍允许本地推进；不以备份、加密或旧运维签认阻塞。原生功能验收尚未执行，本批未核查当前登录会话/第二成员可用性，不沿用旧锁屏状态作为当前 blocker。未 push、merge、部署、远程迁移、生产写入、备份或手工读取/上传 Secret。


## 2026-09-28：C04 / EXT-INB-03 转任务原子性、恢复及目标入口

承接 `1abe99e`，本批完成实际业务切片，不仅更新计数。canonical 仍为 **29 范围内 / 3 关闭 / 26 未关闭**；EXT-INB-03 本地两个操作子项已完成，真实身份/原生浏览器验收子项未完成，C04 还包含其他模块，不能整项关闭。

### 实际实现

- 新增 `src/inbox/task-promotion.ts`：任务、task.created 审计和 Inbox promoted 收据同一个本地 D1 batch。INSERT/UPDATE 共同约束 session 成员、记录 ID、当前版本及可转换状态；中间写入失败整批回滚；并发请求只产生一个任务/审计，另一个返回同一目标。随机任务 ID 防止误认历史可预测 ID 的不相关任务；未清理历史孤立数据。
- HTTP 转任务必须带 canonical `expectedUpdatedAt`。旧版本转换 409，成员越权 404，已转换重放检查当前目标归属和存在性；已删除目标不重新创建。复用 Tasks 的输入校验及单调版本，保留长度限制，不默默截断 notes。
- 原子 INSERT 同时校验成员任务配额（500）：达到上限拒绝且 Inbox 不变，不同 Inbox 并发争夺最后一个名额只允许一项成功；已成功收据的重放不被配额阻断，其他成员任务不计入当前成员配额。该保证限于本批 Inbox 转任务路径，不宣称修复所有任务创建入口的并发配额。
- Inbox 转任务共用已有写前成员隔离恢复标记：严格验证回执对象、版本和目标，然后 GET 原对象及精确当前页。丢响应、409、畸形回执、读失败保持锁；离开路由/重新挂载后仅 GET 核对，不自动重发 POST。失权清屏、存储不可用阻止提交。
- promoted 卡片增加双语“打开任务”，复用已有 TaskEditor 和同成员详情 API；目标 403/404 不显示内容。这里是已有详情编辑器，不是新增任务深链接 URL。任务编辑器其他写操作的未知结果恢复仍归既有 C01/R4 任务，不宣称本批全部修复。
- 源码域审计检测到复用 TaskEditor 扩展了 Inbox 的静态可达操作面：补充 7 条操作及 API 归属、缺口 owner，并更新确定性域快照。新增的是入口证据映射，不是 7 个新父任务；均分派现有 R4-002/003/004/005，历史 atom 不增加。创建分支仅为保守静态登记，当前入口只传已有 taskId。

### RED / GREEN 与验证边界

- 后端先跑出 8 失败 / 2 通过，暴露创建任务后 Inbox 写入失败留下孤立任务、缺少版本及重复动作边界；实现后通过。前端请求/恢复测试在接口签名对齐后观察到 22 失败 / 1 通过，再补实现。
- 自查发现绕过 TasksService 后可能遗漏配额；新增 3 项真实 D1 测试，先观察 2 失败 / 16 通过，再将配额检查纳入条件 INSERT，联合回归通过。
- 新增共 **46 项**：18 Worker/D1 HTTP、10 前端数据契约、18 App/happy-dom。覆盖原子失败回滚、并发转换/归档、目标删除/跨成员、旧版本/倒退时钟、重复点击、迟到回执、失权和只读恢复。
- 扩展权限测试最初错误假设清零系统角色掩码会撤销 contributor 的内置能力，出现 1 失败 / 42 通过。检查现有策略确认角色掩码为叠加授权，不能借该 fixture 宣称可撤权。本批不改全局 RBAC；改为真实受支持的成员 disabled 边界，验证 403 且无任务写入。不声称实现系统角色能力撤销。
- 新测试首次 3 文件 **43/43**，补充 3 项配额测试后，Inbox/Tasks/恢复联合 **22 文件 319/319**；扩展/成熟度页面另 **2 文件 176/176**，共 24 文件 495 项定向回归。不是全仓测试或真实登录验收。
- `typecheck`、`build:ui`、`verify:i18n` 通过，`test:i18n` 13/13。默认 typecheck 未覆盖全部 frontend TSX；构建保留既有 >500 kB chunk 提示。未运行带 Secret 同步的 build/check。
- 域审计先因新增 TaskEditor 可达写操作缺少清单/API 归属而失败，补真实登记而非放松断言；成熟度合同再暴露缺少 owner，补既有 owner 映射后 13/13；delivery 合同 30/30。域测试还发现历史断言仍把已完成数字分页的 Inbox/Goals/Projects/Timeline 写为 cursor，改为实际 numbered，Calendar 保持 cursor；域审计与 checklist 计数器测试联合 32/32，不修改历史执行记录。

### 可重跑命令

```sh
rtk proxy npx vitest run test/worker/inbox-task-promotion.test.ts test/worker/inbox-conditional-writes.test.ts test/worker/inbox-numbered-pages.test.ts test/worker/inbox.test.ts test/worker/tasks.test.ts test/unit/inbox-service.test.ts test/unit/inbox-route.test.ts test/unit/tasks-service.test.ts test/unit/frontend-inbox-promotion-data.test.ts test/unit/frontend-inbox-promotion-recovery.test.tsx test/unit/frontend-inbox-status-data.test.ts test/unit/frontend-inbox-status-recovery.test.tsx test/unit/frontend-inbox-create.test.tsx test/unit/frontend-inbox-numbered-pages.test.tsx test/unit/frontend-inbox-numbered-data.test.ts test/unit/frontend-inbox-create-intent.test.ts test/unit/frontend-inbox-page.test.tsx test/unit/frontend-inbox-create-data.test.ts test/unit/frontend-task-editor-route.test.tsx test/unit/frontend-tasks-data.test.ts test/unit/frontend-planning-write-recovery.test.tsx test/unit/frontend-planning-write-storage.test.ts
rtk proxy npx vitest run test/unit/frontend-workbench-extended-routes.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run verify:i18n
rtk proxy npm run test:i18n
rtk proxy npm run audit:workbench-domain
rtk proxy npm run verify:workbench-maturity
rtk proxy npm run verify:delivery-status
rtk proxy node --test scripts/workbench-domain-audit.test.mjs scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
rtk git diff --check
```

### 当前与下一步

下一本地实现切片为 **C04 / EXT-CAL-01 日历数字分页、日期范围与 URL 恢复**，无需备份/加密/生产运维签认即可继续。Inbox 原生双身份、键盘/触控旅程仍待验；未检查当前登录身份是否可用，不以旧浏览器状态推断当前阻塞。

本批未 push、merge、部署、远程迁移、生产写入、备份或 AI 调用，也未手工读取/上传 Secret。无新增迁移。所有完成声明只针对本地实现与上述定向验证，不提升生产/发布/acceptance。


## 2026-09-28 — C04 / EXT-CAL-01 日历范围数字分页与 URL 恢复

### 范围与实现

- 本轮严格承接 EXT-CAL-01，完成其本地实现和定向验证；父级仍为 **29 范围内 / 3 关闭（A03、A04、B03）/ 26 未关闭**，D08 单独排除。不是把日历分页子项作为整个 C04 的验收。
- Calendar API 新增显式 page/pageSize 分支，20/50/100，成员/状态/半开重叠范围一致的批量 count/rows，稳定 starts_at/id 顺序，10000 行查询窗口；拒绝混用 cursor/limit、重复/未知参数。旧 cursor 接口不变，保留 Today/Focus 等消费者边界。
- 默认范围为浏览器时区当日零点起 14 个本地自然日；可修改本地时间起止，应用时回到第一页。查询范围上限沿用后端 31×24 小时，不宣称任意自然月；DST 秋季的 31 个本地日可能超过此上限。UTC 绝对起止写入 URL，恢复相同时间点；卡片按事件自身时区显示两端完整日期和时区名。
- 请求页替换而不追加、页大小切换重置、空末页返回、窗口外禁用导航而保留真实 total。查询变化同步清空旧行并取消读取，代次隔离迟到响应，卸载取消；401/403/500 或畸形分页均清屏，在原查询重试。
- 日期输入草稿仅 Apply 才发请求；错误/超限范围禁用。创建/取消沿用现有行为，不把本项描述为稳定意图、编辑、危险操作确认或未知写恢复已经完成；这些仍属于 EXT-CAL-02/后续完整旅程。

### RED / GREEN 与复核

- 首次 Worker 新测试 7 失败 / 16 通过；实现后发现 status 缺省 null 被误当非法值，修复路由转换后新后端 **23/23**。
- 首次 App 分页新测试 13 失败；接入后修正测试误用页大小/重试标签和越界页按钮假设。日期输入通过实际 React onChange handler 驱动 happy-dom；这不是原生键盘/触控证据。
- 时区测试不能在 Workerd 内通过修改 TZ 或启动 child_process 来模拟真实 Node 时区；保留原 DST/跨日断言，移至独立 `scripts/calendar-query.test.mjs`，并纳入 test:smoke。3 项在真实 Node 子进程中分别设置纽约/上海 TZ，全绿。
- 新增 **65 项**：23 Worker/D1、24 数据/查询、15 App/happy-dom、3 Node TZ。日历新旧联合 **5 文件 66/66**；关联 Calendar/Today/Focus/扩展与成熟度路由 **6 文件 185/185**，合计 **11 文件 251/251**，另 TZ 3/3。没有运行全仓测试，亦无真实登录验收。
- 本地构建 `build:ui`、`typecheck`、`verify:i18n` 通过。默认 typecheck 不覆盖全部 frontend TSX，Vite 构建与 App 测试补证，但不冒充完整 frontend 类型检查。构建保留既有 >500 kB chunk 警告。
- 域审计最初因新增 owner 文案未登记失败；将 listOwned/listNumbered 两处绑定登记到同一成员证据后更新确定性快照。成熟度合同随后发现旧 gap fingerprint，同步剩余缺口描述/原 R4-016 owner 与矩阵，未删除 gap、未增加历史 atom、未提升 partial。
- 域审计、父项计数器、成熟度、交付、国际化及 TZ 合同联合 **91/91**。旧段落所记 Calendar cursor 是当时事实，保留历史记录；当前断言改为源码证明的 numbered。

### 可重跑命令

```sh
rtk proxy npx vitest run test/unit/frontend-calendar-numbered-pages.test.tsx test/unit/frontend-calendar-numbered-data.test.ts test/unit/frontend-calendar-page.test.tsx test/unit/calendar-service.test.ts test/worker/calendar-numbered-pages.test.ts
rtk proxy npx vitest run test/unit/frontend-workbench-extended-routes.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/worker/calendar.test.ts test/unit/today-service.test.ts test/worker/today.test.ts test/worker/focus.test.ts
rtk proxy node --test scripts/workbench-domain-audit.test.mjs scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs scripts/delivery-status-contract.test.mjs scripts/i18n-contract.test.mjs scripts/calendar-query.test.mjs
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run verify:i18n
rtk proxy npm run audit:workbench-domain
rtk proxy npm run audit:functional-checklist
rtk git diff --check
```

### 下一动作与边界

下一实现为 **EXT-CAL-02：稳定创建意图、时间校验、取消确认/并发、丢响应恢复与成员隔离的完整旅程**。允许本地继续，无备份/加密/生产维护签认阻塞。原生真实双身份/键盘/触控仍待验，不以 happy-dom 或历史浏览器状态代替。

本轮无新迁移；未 push、merge、部署、远程迁移、生产写入、备份、AI 调用或手工读取/上传 Secret。未运行带 Secret 同步的 build/check。

## 2026-09-28 — C04 / EXT-CAL-02 稳定创建与条件取消恢复

### 实现与关闭口径

- EXT-CAL-02 本地子项完成；父项保持 **29 范围内 / 3 关闭 / 26 未关闭**，D08 排除。Calendar 编辑 UI、跨模块完整旅程以及 EXT-ACCEPT-02 原生真实身份验收没有完成，不因此关闭 C04。
- 创建前将成员/标签页隔离的精确 id/clientKey/title/startsAt/endsAt/timezone 意图写入 sessionStorage 并回读确认；拒绝坏记录、存储不可用和替换未决请求。丢响应只允许显式重试相同载荷；确认回执后只读恢复详情与当前列表，重载不会自动 POST。此存储不加密，不承诺跨设备或关闭标签页后的恢复。
- 创建服务按 member/clientKey 回读，修复并发同键不同 id 误 404；占用 id 不能返回无关记录。保留既有同键重放语义，不宣称服务端拒绝同键异载荷。
- 时间顺序、规范时间、有效时区和 JS Date 上界均校验。编辑 API 和取消必须提供 expectedUpdatedAt；成员/id/版本 CAS + UPDATE RETURNING 原子回执，单调版本防止时钟倒退。跨成员访问 404，版本冲突 409。Focus 内部状态更新也使用 CAS，但不宣称跨模块完整生命周期已闭环。
- 页面取消先显示目标标题/时间并确认；写前持久化只读恢复标记，失败/丢响应/409 不自动重试 DELETE，仅 GET 详情和当前列表后解除锁定。401/403 清除页面私有内容；404 对账失败保留锁定。非模态确认区的原生键盘/触控仍待验。

### RED / GREEN 与本地验证

- 新后端并发、条件写和时间校验初次 7 失败 / 1 通过；修复后 8/8。数据校验新增 6 个畸形详情用例先失败后通过。App 创建/取消初次 4 项失败，后扩至 11 项全绿；其中预装存储必须在 React 挂载前完成，修正 harness 后才计入恢复证据。
- 新增 54 项：8 Worker/D1、17 意图存储、18 数据、11 App/happy-dom。Calendar/Today/Focus/扩展路由联合 **15 文件 305/305**；共享 Planning/Inbox/Timeline/Projects 写恢复 **6 文件 133/133**。这是本地定向回归，不是全仓或真实浏览器验收。
- `typecheck`、`build:ui`、`verify:i18n` 通过；typecheck 不覆盖所有前端 TSX，Vite 与 App 测试不冒充完整前端类型检查。保留既有 >500 kB chunk 警告。
- 更新 Calendar maturity 证据及原 R4-016 gap 指纹，保留 partial、编辑/跨模块/原生验收缺口；未删除历史 gap 或提升发布维度。

### 可重跑命令

```sh
rtk proxy npx vitest run test/unit/frontend-calendar-write-journeys.test.tsx test/unit/frontend-calendar-create-intent.test.ts test/unit/frontend-calendar-write-data.test.ts test/unit/frontend-calendar-numbered-pages.test.tsx test/unit/frontend-calendar-numbered-data.test.ts test/unit/frontend-calendar-page.test.tsx test/unit/calendar-service.test.ts test/worker/calendar-numbered-pages.test.ts test/worker/calendar-write-journeys.test.ts test/worker/calendar.test.ts test/worker/focus.test.ts test/unit/today-service.test.ts test/worker/today.test.ts test/unit/frontend-workbench-extended-routes.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx
rtk proxy npx vitest run test/unit/frontend-planning-write-storage.test.ts test/unit/frontend-planning-write-recovery.test.tsx test/unit/frontend-inbox-status-recovery.test.tsx test/unit/frontend-inbox-promotion-recovery.test.tsx test/unit/frontend-timeline-reload.test.tsx test/unit/frontend-project-relations-reload.test.tsx
rtk proxy node --test scripts/workbench-domain-audit.test.mjs scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs scripts/delivery-status-contract.test.mjs scripts/i18n-contract.test.mjs scripts/calendar-query.test.mjs
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run verify:i18n
rtk proxy npm run audit:workbench-domain
rtk proxy npm run audit:functional-checklist
rtk git diff --check
```

下一业务切片为 **EXT-TOD-01：今日摘要权限校验目标入口/查看全部与有界快照说明**。本地继续允许，没有加密/备份/生产签认阻塞。本轮无迁移、push、merge、部署、生产写入、备份、AI 调用或手工读取/上传 Secret；未执行带 Secret 同步的 build/check。

## 2026-09-28 — C04 / EXT-TOD-01 今日摘要可追溯入口

- Calendar EXT-CAL-02 已先提交 `093a468`，本批严格进入下一子项 EXT-TOD-01。新增任务/日程只读详情：点击后重新请求既有成员鉴权 API，精确核对目标 ID，不把摘要内容当授权凭据；404/畸形回执仅显示错误并允许 GET 重试，401/403 清除摘要和详情。关闭/卸载 abort + active guard 隔离迟到读取；Today 按成员 key 重挂载。
- 查看全部任务进入 `/tasks?due=today&page=1&pageSize=20`，按服务器当前日过滤；查看全部日程固定摘要日期的 UTC 半开范围，进入已有数字分页页。普通点击走现有 SPA history，保留修饰键/新标签页原生链接行为。
- 显式说明未完成任务是全量未完成计数，其余是有界快照数量（日历上限 20、收件箱/项目上限 10），列表仅前 10 条；不能把截断数组长度称为总数。Today 日期计算显式 UTC，与 Tasks 的 UTC 日期过滤一致，不宣称浏览器本地日。
- 新增 App 10 项先 RED 10/10，接通实现后全绿，补实际路由跳转 2 项；新增 Worker 双成员摘要/详情 1 项，交叉 ID 均 404。联合 Today/扩展/成熟度/Calendar 页面 **6 文件 201/201**。`typecheck`、`build:ui`、`verify:i18n` 通过，保留既有 chunk 警告；前端全量 TSX 类型检查并未覆盖，不冒充原生浏览器证据。
- 父项仍 **29 范围内 / 3 关闭 / 26 未关闭**。EXT-TOD-01 仅本地子项完成；下一项 **EXT-TOD-02 深层快照校验与局部失败**允许继续。新增 13 项测试不是完整原生双身份验收。没有备份/加密/生产签认阻塞。
- 未 push、merge、部署、远程迁移、生产写入、备份、AI 调用或手工读取/上传 Secret。

```sh
rtk proxy npx vitest run test/unit/frontend-today-targets.test.tsx test/unit/today-service.test.ts test/worker/today.test.ts test/unit/frontend-workbench-extended-routes.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-calendar-write-journeys.test.tsx
rtk proxy node --test scripts/workbench-domain-audit.test.mjs scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs scripts/delivery-status-contract.test.mjs scripts/i18n-contract.test.mjs scripts/calendar-query.test.mjs
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run verify:i18n
rtk proxy npm run audit:workbench-domain
rtk proxy npm run audit:functional-checklist
rtk git diff --check
```
