# PAR-020 重新解析排期

状态：M2 实施中。候选构建器、D1 queued/processing/indexed 状态机、管理员重解析 API 和管理员确认物化已完成；将物化后的待审核 Submission 走现有发布审核流程生成新 Revision 仍待实现。

## 原因

PAR-020 会触及 parser version、source version、发布 Revision 和任务状态。前端切换期间继续改解析链会让发布、回滚和 UI 状态同时漂移，不符合当前 Cloudflare 免费层、5–20 人私有知识库的收敛边界。

## 启动前置条件

1. FE-075 旧 vanilla UI 清理前，React Assets 生产回滚证据已完成。
2. FE-078 前端迁移 release commit 已完成，并通过 `npm run check`、`npm run build:ui`、Wrangler dry-run。
3. 生产 OAuth/session、disabled contributor、DO 跨激活读取和 workers.dev/preview URL 关闭证据已归档。
4. M2 parser format matrix 与降级策略已评审，且不引入 R2/付费 Cloudflare 产品作为强依赖。

## M2 原子任务顺序

1. 固化 parser version 与 source fingerprint。
2. 新建解析任务，不修改已发布 Revision。
3. 记录 queued/processing/indexed/retryable/failed 状态及 bounded error code。
4. 对 text/Markdown/code/PDF/DOC/PPT/XLSX 等格式逐项补 parser fixture、恶意输入和降级证据。
5. 只在管理员确认后生成新 Revision；旧 Revision 保持可读。

当前证据：`src/sources/reparse.ts` 的 `buildReparseCandidate` 生成 `m2-v1`/`m2-v1` 候选、递增 ordinal 和稳定 source fingerprint；候选构建没有任何 D1、VFS 或发布 Revision 写入副作用。`src/sources/reparse-service.ts` 与 `src/sources/reparse-repository.ts` 通过 `0006_m2_source_reparse.sql` 持久化幂等任务、候选正文和安全错误码；管理员可调用 `POST /api/admin/source-versions/:id/reparse`，再用 `GET /api/admin/reparse-jobs/:id` 查询，并通过 `POST /api/admin/reparse-jobs/:id/promote` 将候选物化为新的 review_pending Submission/Source/SourceVersion。`test/unit/source-reparse.test.ts`、`test/unit/source-reparse-service.test.ts` 和 `test/worker/m2-reparse.test.ts` 覆盖确定性、代码元数据、任务状态、幂等物化、路由和旧 SourceVersion/Revision 身份保持。

## 验收边界

- 重新解析失败不得覆盖已发布内容。
- 同一 source/revision 的重试必须幂等。
- parser warnings 和位置元数据不得泄漏原始密钥、Cookie 或异常 body。
- 每个格式都必须有独立 RED→GREEN 测试与可回滚状态。
