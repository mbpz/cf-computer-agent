# A05 / R2-008：菜单危险操作确认与表单取消保护

日期：2026-10-01。基线 `055d73b`，分支 `codex/functional-checklist-completion`。

## 本轮范围

执行既有产品成熟度设计中的 ConfirmAction、影响说明及 dirty/pending 要求，只推进菜单页本地子项，不关闭整个 A05 或 R2-008。

- [x] 行内排序、启用/禁用、显示/隐藏、删除及编辑表单保存均需显式确认。显示菜单 key、路径/ID，修改确认显示实际变更字段及前后值（层级、标签、路径、排序、权限位、状态、可见性）。
- [x] 中英文说明区分导航配置与内容/API 权限；删除仅删除菜单项，无此处撤销功能；隐藏/禁用祖先可能隐藏后代。后台系统菜单不可变、非叶节点不可删、全树 CAS 及审计保持原样。
- [x] 默认取消焦点、共享弹窗键盘机制、行操作确认期间背景 inert；表单确认期间该表单 inert。取消不写入，保留排序或编辑草稿；确认同步消费，重复点击只提交一次。
- [x] 行操作确认绑定原菜单树，读取替换、pending、写锁、拒绝访问、卸载后失效。编辑确认绑定草稿及当前树；回读后必须重新确认，但不重置草稿或原始 expected 快照，陈旧编辑仍由服务端拒绝，不能悄悄覆盖胜者。
- [x] 创建/编辑表单的 Cancel 在有修改时先确认放弃；无修改立即关闭。正在写入时禁止取消；失败后的只读恢复锁仍保留，可显式放弃表单但不能借此解除写锁。
- [x] 正式菜单路由按成员/角色/权限作用域重新挂载，避免旧确认跨身份复用。401/403 清空、未知结果先只读恢复及晚到回执隔离保持不变。
- [x] 新建菜单保持既有校验、单次提交、确认回执及恢复语义；没有增加新 API、迁移或自动写重放。

## TDD 与验证

先新增 18 项交互测试，修复前 18/18 失败，复现直接写入、没有确认和脏表单直接丢弃；修复后全绿。随后补充 5 项表单状态测试（无修改关闭、锁定失效、pending、撤权）及 5 项真实路由/Response 边界测试（取消无 mutation、卸载不重放），新增共 28 项。原有回归显式确认后继续原断言，不削弱未知写/冲突恢复测试。

```sh
rtk proxy npx vitest run test/unit/frontend-admin-menu-confirmation.test.tsx test/unit/frontend-admin-menu-recovery.test.tsx test/unit/admin-menus-page.test.tsx test/worker/admin-menus.test.ts test/unit/menu-tree.test.ts test/unit/frontend-menu-keyboard.test.tsx test/unit/frontend-focus-scope.test.tsx test/unit/frontend-auth-boundary.test.ts test/unit/frontend-app-routes.test.ts test/unit/frontend-admin-role-confirmation.test.tsx test/unit/frontend-admin-member-confirmation.test.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy npm run audit:functional-checklist
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
```

结果：联合 **11 文件 185/185**；类型/UI 构建及 VM 静态隔离通过；i18n **13/13** 及静态扫描通过；checklist **9/9**。保留既有大 chunk 警告。交互为 React/happy-dom/模拟网络，Worker 为本地 D1/接口契约；没有调用远程 AI，不是原生浏览器或线上验收。

## 剩余边界与下一步

- 本轮脏表单保护仅覆盖创建/编辑表单的 Cancel，不包含全站路由离开、刷新或行内排序草稿的统一丢弃保护。
- 其他管理页仍需逐项核对，原生键盘/触控、窄屏暗色和真实双身份验收仍缺；设备锁定后未获新的解锁确认，不绕过访问限制。
- 总表 **29 范围内 / 5 完成 / 24 未完成**（D08 排除）；A05 和 R2-008 保持开放。下一允许继续 A05 的其他页面危险操作、dirty/pending 核查，本地工作无新增阻塞。
- 仅本地实现、验证和提交；没有 push、部署、远程迁移、GitHub 重试、SECRETS_FILE 读取、备份或加密；独立预览未更新。
