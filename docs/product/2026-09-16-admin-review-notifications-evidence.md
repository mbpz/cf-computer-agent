# D02-R2-C 审核结果通知：本地证据

日期：2026-09-16。分支：`codex/admin-audit-recovery`。基线：`e4666d2`（B 批已提交）。

范围对应[实施计划](../superpowers/plans/2026-09-16-admin-review-notifications.md)与[设计 C 批](../superpowers/specs/2026-09-16-admin-review-write-recovery-design.md)。这是本地实现与自动化证据，不是上线或真实登录验收；D02/R6-003/ADM-002 的发布、验收维度不提升。

## 实现与边界

- `submission.published`、`submission.rejected`、`submission.revision_requested` 在最终决定的同一 D1 batch 内写入；通知失败则决定、审核、审计回滚，已写内容的发布 intent 保留供原恢复机制继续。
- 收件人从数据库中的 `submissions.submitter_id` 读取，审核人沿用已鉴权主体；不增加调用方可指定收件人的参数。去重键为 `submission:<id>:<decision>`，复用收件人维度唯一约束。相同决定重放、并发及索引恢复不重复通知。
- 载荷为 `{}`，不复制正文、标题或私密说明。仅新发生的决定生成通知，旧终态记录不补发。
- 列表与已读 API 对 submission 目标检查当前活动成员及当前归属/管理员身份。失效目标返回空引用；另一成员不能读取或修改本人的通知。
- 点击“打开”先调用已读 API 重新鉴权，再按返回目标导航；不信任列表里的缓存链接。普通成员进入现有“我的提交”分页列表，管理员进入审核详情，不直接链接知识正文。普通成员的逐条详情深链不是本批新增能力。
- 会话失效或撤权的 401/403 会取消当前列表请求、清空通知与计数，展示双语权限恢复提示和重试入口；旧请求不能重新填回受限缓存。普通迟到错误不污染新查询，迟到点击成功不跨页面导航，也不触发无关刷新。
- 沿用现有 shadcn 风格 Button/PageState 和数字分页；新增三个事件筛选和中英文文案。未增加依赖、外部服务或生产配置。

## 迁移与契约

- 新增 `0050_admin_review_notifications.sql`，重建通知表以扩展 CHECK 白名单；不修改历史迁移。
- 带旧数据的实际迁移覆盖全部六种历史事件、已读时间、去重唯一键、三个索引、actor 删除置空、recipient 删除级联及 foreign key check；三种新事件可写，未知事件/目标仍拒绝，无历史审核通知回填。
- reviewed manifest 为 50；SHA-256：`1fe5cf8ffe42237804fb82a75efa509a70aa2862b1ab2c5403cc9b9ff13e9716`。
- 同步迁移 verifier、release contract、delivery-status manifest 数量；保留已部署历史前缀校验。首次 smoke 暴露旧 delivery contract 只允许到 49，修正后原命令通过，未放宽为任意数量。

## TDD 与审查

1. 三种决定的通知及通知故障回滚共六条测试先失败，再实现最终事务写入后通过。
2. 前端事件/链接与当前权限测试先复现缺口，随后补齐；API fixture 一度误传 `{}` 请求体，按既有无请求体的已读协议修正。
3. 独立只读审查发现点击遇 401/403 后旧缓存仍可操作，以及旧点击失败污染新查询。新增三条测试确认红灯；修复后通知路由 11 项通过，联合回归也通过。复核意见单独记录，不将其代替测试或实际浏览器验收。
4. 独立定向复核确认上述 Important/Minor 均已关闭，限定复核范围内无新增发现；复核者仅核对代码及测试断言，未重跑测试。

## 本地验证

```sh
rtk proxy npx --no-install vitest run test/worker/m1-publication.test.ts test/worker/notifications.test.ts test/worker/review-notifications-migration.test.ts test/worker/migrations.test.ts test/worker/m1-api.test.ts test/unit/frontend-notifications-page.test.tsx test/unit/frontend-notifications-route.test.tsx test/unit/frontend-notifications-data.test.ts test/unit/notifications-service.test.ts test/unit/publication-service.test.ts
rtk proxy npm run typecheck
rtk proxy npx --no-install tsc --noEmit --ignoreConfig --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --lib ES2022,DOM,DOM.Iterable --types vite/client --strict --skipLibCheck frontend/pages/notifications/notifications-page.tsx frontend/pages/notifications/notification-model.ts frontend/lib/notifications-data.ts
rtk proxy npm run verify:m1:migrations -- --files
rtk proxy npm run test:smoke
rtk proxy npm run verify:workbench-maturity
rtk proxy npm run build:ui
rtk proxy npm run verify:landing
rtk proxy npm run build:secrets
rtk proxy npm run build:legacy-audit
rtk proxy git diff --check
```

- 联合回归：10 文件、244 项通过。包括真实 D1 故障回滚、恢复/并发/重放、旧数据迁移和 HTTP 权限测试。
- 默认 typecheck 与通知模块独立 DOM 严格检查通过。另跑整个 `frontend/app.tsx` 严格检查仍有 28 项诊断，与 B 批记录数量一致；本轮未逐条重建基线对照，不宣称全前端类型检查通过。
- 迁移文件/hash 检查通过（50）。smoke 49、i18n 13、delivery-status 28、maturity 13 项通过。
- 完整 `npm run build`（含 Worker dry-run）在审查 UI 修复前通过；之后未改后端源代码。UI 修复后再次请求完整构建权限连续超时，未实际执行；改为仅工作区的 `build:ui`、landing 96 项、secret scan、legacy audit 验证最终前端产物。最终组合产物的 Worker dry-run 尚需重跑，不能把此前结果冒充最终快照证据。
- 已知输出：Vite 大 chunk 提示仍在；既有 purge 缺失文件用例输出 `WorkspaceFsError`，但回归退出 0、无失败用例。AI binding 配置警告不等于本批新增远程 AI 调用；本批未新增此类调用。

## 留给下一环节

- [ ] D：跨批故障矩阵与完整权限场景收口；真实登录、中英文、键盘、深浅主题、移动尺寸交互。
- [x] 最终组合产物 Worker dry-run（2026-09-17 补验通过）；部署前迁移/发布流程及部署后验收须在授权后独立执行。
- [ ] 全前端 28 项严格类型诊断的独立治理。
- 未提交本批、未推送、未合并 main、未部署、未执行远程迁移。历史 A/B 及旧发布证据保留原快照。

## 2026-09-17 提交前补验

- 最终快照完整 `npm run build` 退出 0：前端构建、landing 96 项、secret scan、legacy audit 和 Wrangler Worker dry-run 全部通过。上述 9 月 16 日权限超时记录保留为历史，不再是当前构建缺口。
- 重新执行上列十文件联合回归：244 项通过；`npm run typecheck` 退出 0。全前端严格检查的历史诊断仍独立开放，不由默认 typecheck 的结果替代。
- 用户已授权提交 C 批；本补验与代码一起提交，随后进入 D 批。仍未推送、合并、部署或执行远程迁移。
