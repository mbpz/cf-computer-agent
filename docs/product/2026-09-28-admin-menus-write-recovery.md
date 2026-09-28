# D02 菜单管理写入恢复与原子审计 — 本地证据

日期：2026-09-28 UTC / 2026-09-29 Asia/Shanghai。基线 `66fda7c`，分支 `codex/functional-checklist-completion`。

## 范围与结果

完成 D02 菜单管理的有界本地矩阵，不关闭完整 D02 或原生验收。原始 30 父项，D08 排除，本轮范围 **29 / 关闭 4（A03/A04/B03/C07）/ 未关闭 25**。

- 修复管理 GET 复用导航树导致编辑元数据缺失、隐藏/停用菜单及空分组被丢弃的问题。管理树保留所有记录和 parentId/status/visible/isSystem；成员导航仍独立按权限、可见性与状态过滤。真实 HTTP 响应经过前端 loader 验证可用。
- 排序、启停、显示/隐藏、删除共用同步互斥，同批重复点击只发一次写请求，其他行同步禁用。成功后 GET 当前层级，不做乐观删除/修改。
- 未知写入、错误对象/状态/位置/可见性回执或写后 GET 失败维持写锁，只提供显式 GET 恢复，不自动重发。GET 不能证明未知请求是否成功。
- 当前 401/403 清除管理树和输入；scope 变化隔离旧响应，旧写完成前开始的 GET 不解锁。空树仍保留只读恢复入口。普通失败保留位置草稿，权威回读后同步位置输入。
- 管理列表严格校验完整 children、父子关系、重复 id/key/path、深度 4、总量 200、64 位掩码和位置范围。数据库超过 200 项返回 409，不静默截断；没有新增超限修复界面或分页。
- 创建/更新/删除与条件审计同一 D1 batch，审计失败整体回滚；零行竞争失败不插成功审计。使用全配置快照条件而非仅逐行条件，避免并发互相改父节点形成环路及删除/新增留下孤儿。
- 竞争失败 409 不自动重试；成功更新返回本次提交值，审计前值链与最终数据库一致。重复创建路径 409、超深层级 400，不再误报 500。系统项不可变、普通成员/停用管理员无写权限、导航掩码配置不授予 API 权限。

## 实际验证

1. 首轮测试 **28 failed / 6 passed**：复现前端恢复与合同缺口、真实管理树接线、三类审计失败不能回滚、并发环路。修复后四文件 **38/38**。
2. 增补测试出现 **6 failed / 41 passed**；其中五项是显示/隐藏入口及严格数据合同缺口，一项是测试夹具误插重复路径，改为更新既有菜单权限位。修复后联合十文件 **275/275**。
3. 最后补测空树恢复、创建路径冲突和深度超限，明确 **3 failed / 47 passed** 后修复。最终十文件 **278/278**。
4. 新增 **31 路由测试 + 13 Worker 测试 = 44 项**（菜单 Worker 文件从 6 增至 19）。前端真实路由/页面/loader 在 fetch 边界模拟；后端真实本地 D1、HTTP、失败 trigger 与并发请求，不用 mock 数据库证明事务。
5. `typecheck`、`build:ui`、`verify:i18n` 全通过；i18n 434 keys / 55 placeholders / 6 files。保留既有大 chunk 警告。六组 Node 契约 **92/92**，0 failed/cancelled/skipped。

```sh
rtk proxy npx vitest run test/unit/frontend-admin-menu-recovery.test.tsx test/worker/admin-menus.test.ts test/unit/admin-menus-page.test.tsx test/unit/menu-tree.test.ts test/unit/frontend-admin-pages.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-admin-role-recovery.test.tsx test/worker/admin-roles.test.ts test/worker/admin-audit.test.ts test/unit/frontend-menu-keyboard.test.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/workbench-domain-audit.test.mjs scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs scripts/delivery-status-contract.test.mjs scripts/i18n-contract.test.mjs scripts/calendar-query.test.mjs
```

## 边界及下一步

本切片没有新增前端创建、改父节点或完整 CRUD 编辑器。API 创建/层级竞争已测试，不据此宣称页面完整生命周期完成。没有新增请求幂等键；快照条件保护同时竞争，不能消除顺序重复请求。没有跨刷新/跨标签未知写入恢复或 exactly-once 承诺。

原生真实身份、键盘/触控与完整生命周期验收仍待完成；本轮未重新检查浏览器状态。下一允许继续 **D02 空间管理写入、归属、并发及撤权矩阵**，无本地实现阻塞。未 push、合并、部署、远程迁移、真实 AI 调用或人工读取/上传秘密文件。本地测试不能替代发布和生产验收。
