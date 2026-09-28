# D02 成员状态更新、撤权与只读恢复 — 2026-09-28 UTC

用户本地日期为 2026-09-29（Asia/Shanghai）。基线 `b33b240`，分支 `codex/functional-checklist-completion`。这是既有 D02 成员页状态操作的本地子任务，不是 D02 六页整体或原生验收完成。没有 push、merge、部署、远程迁移、生产写入或真实 AI 调用。

## 实施及边界

- `AdminMembersRoute` 在发 PATCH 前同步登记每成员 mutation token，同一 React 批次的重复点击只发一次。不同成员可以独立操作；读取过程中旧操作按钮禁用。管理员、未知角色或未知状态不提供启用/停用，route handler 也校验当前可操作行。未知状态显示“状态不可用”，不误标为 Active。
- PATCH 回执必须包含请求的 member ID、目标状态和 contributor 角色。列表须匹配请求页码、页大小及 status，且无重复 ID；不把其他页或不匹配筛选的数据作为新鲜回读。
- 未知写入结果、错误回执或写入确认后的回读失败，均不自动重发 PATCH。保留当前挂载内的读前锁；显式恢复只执行当前查询的 GET，同批次恢复点击也只发一次。
- 只有 GET 包含该行且该行从 GET 开始到响应时没有在途 PATCH，才释放读前锁。缺失于分页/筛选结果不代表原写入成功；开始于 PATCH 未完成时的 GET，即使晚到，也不能证明写入后的状态。
- 当前列表、PATCH 或后续 GET 的 401/403 清除成员数据和操作入口，取消在途读取、失效旧 scope，显示 forbidden。恢复为用户显式 GET；拒绝后旧 GET 即使忽略 abort 也不能重新显示数据。
- 页码/筛选/历史导航使 scope 失效，立刻移除旧查询的可操作数据。旧 PATCH 即使在离开后返回同一查询才成功/拒绝，也不能刷新、报错或撤销新页面权限。相同查询数值不等于同一异步生命周期。
- 已确认写入后的回读失败保留收缩意图，手动 GET 恢复到空页时 replace 到有效页并保留筛选，不循环后退或自动重发写入。
- **不承诺跨刷新或关闭标签恢复、版本条件写入或后端 exactly-once。** 既有成员状态 API 没有持久化请求键。本地 HTTP 实测重复显式赋值最终状态相同，但产生两条审计（第二条记录 disabled → disabled）；因此只读恢复不能被表述为“自动幂等重放”。本批未更改后端业务契约、表结构或生产配置。

## 测试先行与修复记录

1. 首批 13 个真实 React route/API loader 测试：**13 failed / 14 passed**，复现重复 PATCH、未知写入后可再次操作、401/403 残留数据、旧查询可操作及错误回执被接受。
2. 实施后 26/27；剩余迟到成功测试过早观察 `Response.json()` 的异步处理。改为等待只读恢复提示，不改预期或放松生产逻辑；七文件 **251/251**。
3. 增加在途读不能解锁、并发撤权取消旧 GET、缺失行不推断成功、初始 401/403 恢复等五项验证，以及未知状态显示的失败测试：**1 failed / 32 passed**。中性状态显示修复后继续。
4. 新增四项页码/页大小/筛选/重复 ID 回执测试：**4 failed / 33 passed**；补严格关联校验。
5. 八文件首次联合：**1 failed / 324 passed**。原因是成熟度测试夹具在 page=2 时仍返回 page=1；修正网络夹具按请求页码/大小/筛选生成真实合法载荷，不放松生产校验。
6. 最终八文件 **325/325，exit 0**。本批新增 **23 项前端路由测试 + 5 项真实本地 D1/HTTP 测试**。五项 D1/HTTP 是既有行为补证，不冒称观察过失败。

D1/HTTP 覆盖：启用/停用及过滤回读和审计；重复状态赋值及两条审计边界；管理员保护/非法状态/缺失目标无写审计；普通 contributor 与已禁用 admin 的读取和写入拒绝。既有成员服务与真实 D1 审计失败回滚测试一并复跑。

最终联合命令：

```sh
rtk proxy npx vitest run test/unit/frontend-admin-pagination-routes.test.tsx test/unit/frontend-admin-pages.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-workbench-extended-routes.test.tsx test/unit/members-service.test.ts test/worker/members.test.ts test/worker/admin-audit.test.ts test/unit/frontend-moderation-pagination-routes.test.tsx
```

## 最终候选门禁

- `rtk proxy npm run typecheck`：通过。仅沿用仓库现有范围，不声称全部前端 TSX 已通过静态检查。
- `rtk proxy npm run build:ui`：通过；既有大于 500 kB 的 chunk 警告保留。
- `rtk proxy npm run verify:i18n`：通过，脚本范围 keys=434 / placeholders=55 / files=6，hardcoded-copy 检查通过；不是全部前端翻译键计数。
- `rtk proxy node --test scripts/workbench-domain-audit.test.mjs scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs scripts/delivery-status-contract.test.mjs scripts/i18n-contract.test.mjs scripts/calendar-query.test.mjs`：**92/92**，0 failed、0 cancelled。
- 本地 Vitest 首次因 `listen EPERM` 无法启动，经授权使用本地监听端口后执行成功。Vitest 自动读取现有 `.dev.vars`，未人工读取或上传 Secrets；binding 警告不等于真实 AI 调用。
- happy-dom/本地 D1 不是原生浏览器、真实双账号或键盘/触控验收。本批未重跑原生验收，不提升 release/acceptance。

## Checklist 与下一环节

原始 30；D08 单列排除；本轮 **29 / 已关闭 4 / 未关闭 25**。A03/A04/B03/C07 为已关闭父项。D02 新增成员状态操作本地子项证据，父项保持开放。

下一允许执行：D02 去重决策写入的重复提交、未知结果/回读失败、撤权与导航并发矩阵；随后角色/菜单/空间。继续既有功能，不以备份、加密或生产维护阻塞本地开发，不重复六页已完成的初始读取重试。
