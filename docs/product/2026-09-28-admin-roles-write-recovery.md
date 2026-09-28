# D02 角色写入恢复与原子审计 — 本地证据

日期：2026-09-28 UTC / 2026-09-29 Asia/Shanghai。基线 `57f1ca9`，分支 `codex/functional-checklist-completion`。

## 范围与结果

仅继续已批准 D02 角色管理局部矩阵，不新增业务、迁移、生产配置或真实 AI 调用。本地实现与自动化已完成；D02 父项及原生验收保持开放。范围仍为 29 父项，关闭 4（A03/A04/B03/C07），未关闭 25。

- 创建、权限修改、分配/移除成员共用同步写互斥；同批连点只发送一次请求。成功回执后读取权威角色与成员，不凭回执推算成员数量。
- 网络失败、5xx、错误对象/权限/布尔回执及成功后读取失败保持写锁。显式恢复只 GET，不自动重发 POST/PATCH/DELETE，也不宣称确认了上次未知写入。
- 当前 401/403 清受限角色和成员编辑器；语言 scope 变化隔离旧响应，旧写完成前开始的 GET 不解除写锁。普通失败保留创建和成员输入，确认回执且回读成功后才清理。
- 列表拒绝缺失 items、非法行、重复角色、重复/非法成员 ID 及计数不一致；修改/创建/成员分配回执严格校验。权限表补工作台任务和 VM 位及中英文文案。
- 创建、修改、删除角色及成员分配/移除，业务单行变更与条件审计在同一 D1 batch。审计失败整体回滚，零行变更不制造成功审计。
- 权限修改对原权限、名称和说明作条件更新，竞争失败返回 409，不重试；成功审计前值与已提交状态链一致。角色删除同时检查未分配成员。
- 不改变重复创建/分配的 409、缺失分配移除的 404 合同；没有新增跨请求幂等键或 unknown-write 精确对账协议。

## 实际测试过程

1. 路由测试先暴露重复提交、错误回执、撤权清屏和草稿丢失；首轮修复后联合 33/33。
2. 真实本地 D1 审计失败触发器验证五种写入全部存在非原子问题；另一个前端失败定位到缺少任务/VM 权限位。修复后联合 55/55。
3. 并发不同权限更新再暴露审计前值竞争；条件更新后联合 287/287。
4. 严格成员数量校验暴露旧正向 fixture 不一致，修正正向数据并增加明确反例；补错误创建/分配回执后，最终 **10 文件 293/293**。
5. 初次 typecheck 暴露审计 action/metadata 联合类型不匹配，改用保持判别联合的类型后重新通过。最终 typecheck、build:ui、verify:i18n 均通过；i18n 434 keys / 55 placeholders / 6 files。构建仅有既有大 chunk 警告。
6. 六组 Node 契约 **92/92**，failed/cancelled/skipped 均为 0。

新增 27 路由测试与 11 Worker 测试（Worker 文件现 15 项），共 38 个测试。前端用真实路由、页面及 loader，边界 mock fetch；后端用真实本地 D1/HTTP、审计失败 trigger、并发请求和现有 session 权限回读，不以 mock 数据库代替事务验证。

### 可复现命令

```sh
rtk proxy npx vitest run test/unit/frontend-admin-role-recovery.test.tsx test/worker/admin-roles.test.ts test/unit/admin-roles-page.test.tsx test/worker/admin-audit.test.ts test/unit/frontend-admin-pages.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-admin-duplicate-recovery.test.tsx test/worker/submissions.test.ts test/worker/members.test.ts test/worker/spaces.test.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/workbench-domain-audit.test.mjs scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs scripts/delivery-status-contract.test.mjs scripts/i18n-contract.test.mjs scripts/calendar-query.test.mjs
```

## 未覆盖边界与下一环节

当前锁和草稿仅存在于挂载期间；不承诺跨刷新恢复、跨标签去重或后端 exactly-once。GET 当前状态不能证明未知请求是否成功。角色空列表的新增入口、完整角色生命周期/原生弹层、真实身份、键盘/触控及跨刷新体验不由本切片宣告完成。未重新检查浏览器锁屏状态。

下一本地动作是 D02 菜单、空间的写入/并发/撤权矩阵；继续补齐后再核对 D02 完整关闭条件。没有本地实现阻塞。未 push、合并、部署或运行远程迁移，不读取/上传秘密文件；本地测试结果不是生产或原生验收证据。
