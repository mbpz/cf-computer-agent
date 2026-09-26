# 功能 checklist 续作 — 2026-09-26

## 范围与状态

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
