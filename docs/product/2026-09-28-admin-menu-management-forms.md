# D02 菜单创建与层级编辑 — 本地证据

时间：2026-09-28 UTC（2026-09-29 Asia/Shanghai）。基线 `402542b`，分支 `codex/functional-checklist-completion`。本批仅既有 D02 子项，不新增父任务、不执行发布。

## 交付

- 空树与非空树都有创建入口。创建填写唯一 key、翻译标签、路径、父级、分组、图标、位置、64 位权限；编辑覆盖 API 已支持的父级、标签、路径、位置、权限、状态和可见性。创建后 key、icon、group 不可编辑，表单提示明确。
- 系统菜单不提供编辑/删除；父级选择排除自身、后代及会导致子树超过四层的父级。200 项上限由前端入口及服务端共同约束，服务端继续拒绝循环、孤儿、重复路径。
- 页面和表单同步锁拒绝同批连点；打开表单期间其他行不可写。未知结果保留草稿，先 GET 恢复，不自动 POST/PATCH。401/403 卸载受限页面及草稿。已验证写回执后，即使随后 GET 失败也关闭已完成表单，同时保持恢复写锁。
- 前端严格比对回执身份及本次写入字段（权限比较规范化数值）。打开编辑器时保存字段快照；回读不会把新数据替换为该草稿的基线。服务端校验完整快照并在旧值不符时 409；既有全树 SQL CAS 和事务审计继续保护同时写入的层级约束。
- 新旧客户端兼容：`expected` 仍为可选字段；这是字段快照，不是单调版本号，不声称解决 ABA 或所有旧客户端覆盖问题。创建依赖唯一 key 防重复行，但重复请求返回 409，尚无稳定不可变重放回执；刷新/卸载后意图不持久化。

## RED / GREEN

8 个新 DOM 用例先因缺少创建/编辑入口失败；1 个 Worker 用例先因 `expected` 未支持返回 400，而非预期 200。实现后通过，再补边界和端到端 helper 回归。总计新增 23 DOM + 2 Worker 用例。

覆盖空树创建、已确认后回读失败、编辑字段与快照、后代/深度过滤、无效 key/path/空位置/越界位置/权限、同时提交互斥、错误回执、网络/409 恢复、401/403 清屏、过期草稿不 rebase、真实前端 helper → HTTP → D1、重复创建唯一性以及陈旧更新保留胜者。

```sh
rtk proxy npx vitest run test/unit/frontend-admin-menu-recovery.test.tsx test/worker/admin-menus.test.ts test/unit/admin-menus-page.test.tsx test/unit/frontend-admin-pages.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-admin-space-recovery.test.tsx test/unit/frontend-admin-role-recovery.test.tsx test/worker/admin-audit.test.ts
```

结果：**8 文件 / 317 项通过**。菜单路由 54 项；菜单 Worker 21 项。首次 sandbox 拒绝本地日志/监听端口，授权后原测试命令成功执行；没有将权限失败当 RED。

```sh
rtk proxy node --test scripts/workbench-domain-audit.test.mjs scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs scripts/delivery-status-contract.test.mjs scripts/i18n-contract.test.mjs scripts/calendar-query.test.mjs
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run verify:i18n
rtk proxy npm run audit:functional-checklist
rtk git diff --check
```

六组 Node **93/93**；其余门禁通过。UI 构建既有 >500kB chunk 告警保留，未为降噪修改阈值。新增创建 mutation 纳入领域审计及 R6-007；风险策略要求 P0，已修正矩阵归属/优先级，不放宽断言。当前源缺口 101（54 P0 / 46 P1 / 1 P2），与功能父项 29/4/25 是不同计数。

## 边界与下一步

- 本地实现、验证和提交，不代表推送、发布、迁移或生产验收。无新增 migration，无 push、远程 D1 写入、部署或真实 AI 请求；没有手动读取 secrets。
- D02 父项仍开放：完整原生双身份/键盘/触控、跨会话菜单投影、跨刷新意图恢复尚未验收。本批不改写旧历史证据。
- **29 范围内 / 4 关闭 / 25 未关闭**，下一允许 D03：按原 roadmap 核对知识版本、回收、导出/恢复与研究产物。当前无本地实现阻塞；不能宣称全部功能完结。
