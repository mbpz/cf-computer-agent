# D01-B2 统计事务快照与写后对账：本地证据

日期：2026-09-15。分支：`codex/admin-audit-recovery`；前置：`e05e2d6`（D01-B1）。

## 本地实现

- overview 的趋势、总量、三类分布和当前访客页统一由六个 SELECT 的一次 D1 batch 读取；分页总数复用同批总 PV。
- 数据库返回失败、结果缺失、计数非法或当前页行数不符时失败，不返回伪零。
- 客户端检查总 PV = 分页 total = 每日 PV 合计，并拒绝重复日期。总 UV 跨日去重，不要求每日 UV 相加等于总 UV。
- 写入及重复上报后重新读取两页，验证 total、访客、去重及末页收缩；当前页刷新失败保留旧结果，原查询重试成功后整份替换。

## 验证过程与结果

先用真实 D1 外层的确定性读写交错包装观察旧独立读取的混合快照失败，再改为一次 batch。客户端三项不一致载荷先观察 RED，再加入一致性检查。

实际 controller 测试最初在按钮挂载前点击失败：Response.json 和懒加载页面尚未完成，而不是请求结果错误。测试改为等待可见按钮、错误提示和新行，没有更改运行时调度。全量回归另发现成熟度 fixture 的 PV=1、访客 total=0，补齐一致的访客 fixture，没有放宽生产校验。

| 命令 | 本次结果 |
| --- | --- |
| `npx --no-install vitest run test/unit/frontend-admin-analytics-route.test.tsx test/unit/frontend-admin-analytics-data.test.ts test/worker/analytics.test.ts` | 47 通过：页面 12、载荷 17、Worker 18 |
| `npm test` | smoke 49、i18n 13、交付 28、单元 1,962、Worker 589 全部通过；包含 UI 构建 |
| `npm run typecheck` | 通过 |
| `npm run typecheck:landing` | 通过 |
| `npm run verify:landing` | 96 通过 |
| `node --test scripts/workbench-maturity-contract.test.mjs scripts/workbench-domain-audit.test.mjs scripts/delivery-status-contract.test.mjs` | 64 通过 |

全量测试日志：本机临时文件 `/tmp/workbench-b2-full-test.log`，不提交到仓库。

## 交付边界

这是一次 GET 响应内的一致性，不是跨多个分页请求的冻结快照。写入后须重新请求各页，不能混合旧页和新页宣称无重复快照。

未增加服务、依赖或 D1 迁移；未合并、推送、部署或操作生产数据。真实登录浏览器、中英文键盘、设备及发布验收仍开放，D01/R6 父项和 32 项能力的 partial 状态不升级。

新域快照独立保存于 `docs/operations/evidence/2026-09-15-workbench-d01b2-domain-audit.md`，不重写 D01-B1、D01-A 或 M02 历史快照。下一批处理 D02 审核队列与详情读取恢复；写操作幂等及发布闭环仍需独立交付。
