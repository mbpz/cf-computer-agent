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
