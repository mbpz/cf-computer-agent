# 知识标签与推荐原因数组完整性（本地）

基线：`5a743e95`，分支 `codex/functional-checklist-completion`。归属 B07；不关闭父任务。

## 本轮修复

- 知识列表不再把缺失/非数组标签转换为无标签，不再过滤非法元素而返回部分标签。兼容合法 `tags` 别名；显式非法 `tags` 不再回退到 `tagIds` 掩盖错误。
- 相关推荐完整校验 `reasonFields` 的每个元素，类型错误或未知字段使推荐区域显示读取失败。保留合法空数组、五种合法字段和最多五条推荐的既有边界。
- 保留工作区已有标签回归用例并扩展；分页 fixture 按服务端实际 `tagIds: string[]` 契约补齐。原来期待过滤混合数组的测试改为独立拒绝断言，正常分页/字段展示另用合法数据验证，没有删除异常覆盖。

## 执行证据

1. 修复前两文件 24 条：15 失败 / 9 通过，失败点为缺失、错误类型、未知原因或混合数组被接受。
2. 修复后同组 24/24 通过。
3. 扩展回归首轮 132/137：旧分页 fixture 缺少标签、两个旧断言期待静默过滤；核对后端契约后更新 fixture 和断言，并增加混合数组拒绝与五条上限用例。最终 20 文件 **140/140 通过**。
4. `rtk proxy npm run typecheck`：Worker 与 frontend 均通过。
5. `rtk proxy npm run build:ui`：构建及 VM 构建隔离检查通过。
6. `rtk proxy node --test scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs`：24/24 通过。
7. `inventory:frontend-operations` 后 `audit:frontend-operations` 通过：270 源文件、1165 源码候选，生成内容无漂移；不是运行验收。

扩展回归命令：

```sh
rtk proxy npx vitest run test/unit/frontend-knowledge-citation-route.test.tsx test/unit/frontend-knowledge-data.test.ts test/unit/frontend-knowledge-favorite-read.test.tsx test/unit/frontend-knowledge-link-read.test.tsx test/unit/frontend-knowledge-list-identity.test.tsx test/unit/frontend-knowledge-list-tags.test.tsx test/unit/frontend-knowledge-note-access.test.tsx test/unit/frontend-knowledge-reader-data.test.ts test/unit/frontend-knowledge-research-plan.test.tsx test/unit/frontend-knowledge-review-read.test.tsx test/unit/frontend-knowledge-revision-chunks.test.tsx test/unit/frontend-knowledge-revision-identity.test.tsx test/unit/frontend-knowledge-revision-status.test.tsx test/unit/frontend-knowledge-section-read.test.tsx test/unit/frontend-note-share-directory.test.tsx test/unit/frontend-reader-note-draft.test.tsx test/unit/frontend-reader-pagination-routes.test.tsx test/unit/frontend-recent-visit-count.test.tsx test/unit/frontend-related-reason-read.test.tsx test/unit/frontend-review-period-refresh.test.tsx
```

## 关闭条件与边界

主清单原 30 / 范围内 29 / 已关闭 5 / 未关闭 24，D08 排除。本轮只关闭上述两个审查缺口，不提升 B07 或任一父项。

B07 仍缺原生浏览器、真实身份的过滤到阅读完整路径与移动/键盘验收。当前 `orca status --json` 与 `orca computer capabilities --json` 均返回命令不存在；本轮未取得原生浏览器验收证据，也未改用非授权控制路径。其他本地 checklist 工作可继续。

未执行 push、部署、远程迁移或生产验收。Vitest 使用现有配置并自动加载本地开发变量；测试 fetch 由 fixture 模拟，不作为真实身份/线上结果证据。
