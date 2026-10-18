# KB-011 回滚目标选择、未知结果恢复与条目读取（本地闭环）

更新时间：2026-10-18 UTC

范围：`KB-011` 中仍标记 partial 的子项——完整版本选择、管理回滚确认、未知结果回读、多轮/并发边界——以及条目治理页对已回收条目的读取。本文只记录本地实现与 Workerd/单元/本地浏览器验证，不提升发布或验收状态。

## 1. 变更

| 层 | 变更 | 位置 |
| --- | --- | --- |
| 读取 | `GET /api/admin/knowledge/:id/revisions`：内容无关，按 `published_at DESC, id DESC`；固定 50 条/页，`nextCursor` 续读更早版本，伪造/畸形 cursor 返回 400 | `src/routes/admin.ts`、`src/library/service.ts`、`src/library/repository.ts`、`src/library/types.ts` |
| 读取 | `GET /api/admin/knowledge/:id`：active 与 trashed 均可读，不读已发布正文；返回条目身份、当前修订、上一个修订与索引状态，contributor 403 | `src/routes/admin-review.ts`、`src/publication/service.ts`、`src/publication/repository.ts`、`src/publication/types.ts` |
| 写入 | 回滚审计 ID 按操作身份生成（`rollback-{item}-{revision}-{operationId}`）；目标等于当前修订版本返回 409 `ROLLBACK_STATE_CONFLICT`，不再空写或伪造成替换 | `src/publication/repository.ts` |
| 读取 | `GET /api/admin/knowledge/:id/operations/:operationId`：仅 claim 者读回，返回 `{kind,response}` 或 `{operation:null}` | `src/routes/admin-review.ts`、`src/publication/service.ts`、`src/publication/repository.ts` |
| 前端 | 条目页改用管理读取端点，已回收条目也能渲染身份与历史；状态来自服务端 | `frontend/lib/admin-knowledge-item-data.ts`、`frontend/pages/admin/knowledge-item-route.tsx` |
| 前端 | 修订历史列表、目标选择、确认后写入；`加载更早的修订版本` 按服务端 cursor 追加并去重 | `frontend/pages/admin/knowledge-item-page.tsx`、`frontend/pages/admin/knowledge-item-route.tsx` |
| 前端 | 未知结果可"核对已记录的结果"：读回执成功即清除冻结操作并展示权威结果，不重发写入；无回执时提示重试同一操作号 | 同上、`frontend/lib/admin-knowledge-item-data.ts` |
| 文案 | 历史、分页、确认、核对与无回执提示的中英文键 | `frontend/lib/i18n.ts` |

操作号仍在发送前冻结到 `sessionStorage`，重试与读回复用同一编号。

## 2. 合同

- 历史只包含调用者当前可读的修订版本；条目缺失、已回收或越权时返回 404，而非空列表。
- cursor 绑定上一页最后一行的 `(publishedAt, id)`；同一页不会因并发回滚重复或跳过。
- 回滚仍重新执行 active admin、条目状态与目标归属校验；历史列表不是授权来源。
- 同一目标多轮回滚产生独立审计行；同一操作号配不同目标仍是 `KNOWLEDGE_OPERATION_CONFLICT`。
- 并发回滚到同一目标：一方 200 且另一方收敛 200，或另一方 409 `ROLLBACK_STATE_CONFLICT`；审计最多一行，current 必须等于目标。
- 未知结果读回绑定 `actor_id`；其他管理员即使知道操作号也读不到回执。
- 管理条目读取对 active/trashed 都重新校验管理员身份与 active Space；它不返回正文，也不依赖 published content。

## 3. 验证

命令：

```bash
rtk npx vitest run test/worker/admin-knowledge-lifecycle.test.ts \
  test/unit/frontend-knowledge-item-page.test.tsx \
  test/unit/frontend-knowledge-lifecycle-wiring.test.tsx \
  test/unit/library-service.test.ts \
  test/unit/publication-service.test.ts \
  test/unit/frontend-workbench-maturity-routes.test.tsx
rtk npm run typecheck
rtk npm run verify:delivery-status
rtk npm run verify:m1:docs
rtk npm run test:frontend-operations
```

结果：

- 6 个文件 **285/285** 通过。覆盖：历史分页与伪造 cursor、任意目标回滚、同目标第三轮回滚（3 条不同审计）、回滚到当前版本 409、回执读回/缺失、操作号换目标冲突、并发同目标安全收敛、active/trashed 条目读取与 contributor 403。
- `typecheck` worker + frontend 通过。
- `verify:delivery-status` 30/30；`verify:m1:docs` 通过；`test:frontend-operations` 10/10（操作清单 1810 候选，已重新生成）。

本地浏览器验收（managed Chromium，非生产）：

1. 本地 D1 装入仅本机 fixture：管理员 `local-admin`、条目 `item-local`、修订 `rev-local-1`/`rev-local-2`；会话 cookie 由本地插入的哈希会话签发。
2. 打开 `/admin/knowledge/item-local`：渲染标题、`active`、当前修订、历史两行。
3. 选择非当前修订并确认前：**0 个回滚 POST**；确认按钮可见。
4. 点击确认后：**恰好 1 个回滚 POST**；页面显示 `回滚完成：rev-local-2 现在是当前修订版本，替换了 rev-local-1。`
5. 重新读取 API：`current=rev-local-2`、`previous=rev-local-1`，历史 current 标记随之一致；截图 1024×736（WEBP，29.10 KB）仅含本地 fixture。

访问控制：新端点匿名请求 401；worker 测试覆盖 contributor 403。

## 4. 未覆盖

- 未部署、未执行生产迁移、未触发真实回滚；发布列保持 `pending`。
- 未做生产环境的真实身份、键盘/读屏、多视口与深色主题验收；验收列保持 `pending`。
- 本地浏览器只验证了两条修订的历史；超过 50 条的分页由单元测试覆盖，未在浏览器造 51 条数据。
- 已回收条目可读取身份与历史，但恢复/彻底清除仍在回收站页面完成。
