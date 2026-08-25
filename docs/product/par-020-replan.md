# PAR-020 重新解析排期

状态：暂停，已重新排期到 shadcn/ui 前端 release 之后的 M2 解析切片。

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

## 验收边界

- 重新解析失败不得覆盖已发布内容。
- 同一 source/revision 的重试必须幂等。
- parser warnings 和位置元数据不得泄漏原始密钥、Cookie 或异常 body。
- 每个格式都必须有独立 RED→GREEN 测试与可回滚状态。

