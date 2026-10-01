# A05 / R2-008：角色权限与成员归属确认的本地证据

日期：2026-10-01。基线 `8c74bbb`，分支 `codex/functional-checklist-completion`。

## 既有设计范围与实现

延续既有 ConfirmAction、危险操作说明和 dirty/pending 设计，仅交付角色页本地子项，不关闭 A05 或 R2-008。

- [x] 权限保存、分配成员、移除成员均先显示共享 ConfirmAction；取消不调用写 API。权限确认显示角色、关联成员数、前后完整位图及已知权限增加/移除；归属确认显示角色及精确成员 ID。
- [x] 中英文影响说明对应当前 repository：有效角色贡献权限，与基础/其他角色权限合并；分配不启用已禁用成员；移除仅删除该角色关联，不删除成员及其数据，不承诺撤销来自其他角色的权限。
- [x] 默认焦点在取消，背景 editor 设置 inert/aria-hidden；沿用已测试的共享焦点循环、Escape 和遮罩取消。
- [x] 确认绑定角色列表、目标对象、权限草稿及成员输入。读取替换、saving/writeBlocked、拒绝访问或卸载后旧确认失效；同步消费确认，连续点击只提交一次。
- [x] 权限或成员输入未保存时，切换角色必须明确确认放弃；取消保留草稿，确认切换不写 API。未处理权限草稿前禁用成员归属操作，避免随后权威回读覆盖未保存权限。写入/未知结果锁期间禁用角色切换。
- [x] 成员分配迟到成功回执不得清除更新后的输入；正式角色路由按成员/角色/权限作用域 key 重新挂载，避免沿用旧作用域确认。
- [x] 保留原有路由写锁、结果未知先显式 GET、401/403 清空和迟到结果隔离。没有新 API、数据库迁移或自动写重放。

## 测试证据

TDD：先运行 14 项新增组件测试，未实现时 14 项失败，复现直接写入、无 dirty 切换确认及 pending 下仍能切换；实现后 14/14。随后补充 1 项迟到分配回执保护和 4 项真实路由/Response 边界测试（3 类取消无 mutation、卸载旧确认无写入）。新增共 19 项；原有恢复测试改为显式确认后继续验证原断言。

```sh
rtk proxy npx vitest run test/unit/frontend-admin-role-confirmation.test.tsx test/unit/frontend-admin-role-recovery.test.tsx test/unit/admin-roles-page.test.tsx test/worker/admin-roles.test.ts test/unit/frontend-admin-member-confirmation.test.tsx test/unit/frontend-admin-pagination-routes.test.tsx test/unit/frontend-focus-scope.test.tsx test/unit/frontend-auth-boundary.test.ts test/unit/frontend-app-routes.test.ts test/unit/frontend-i18n.test.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy npm run audit:functional-checklist
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
```

结果：联合 **10 文件 155/155**；类型检查、UI 构建及 VM 静态构建隔离通过；i18n **13/13** 及静态检查通过；checklist **9/9**。既有大 chunk 警告保留。交互为 React/happy-dom/模拟网络，Worker 为本地 D1/接口契约，不是原生浏览器或生产验收；未调用远程 AI。

## 尚未完成的范围

- dirty 保护只覆盖角色编辑器内切换，不包含离开路由、刷新页面或全站表单统一保护；新建角色表单及其他管理页仍需既有任务的逐页核对。
- 原生键盘、触控/窄屏、暗色及真实双身份验收尚缺；此前设备访问锁定，收到解锁确认前不绕过限制。
- 当前总表 **29 范围内 / 5 完成 / 24 未完成**，D08 排除；A05 和 R2-008 父项保持开放。
- 下一允许继续 A05 其余管理页危险操作及全站 dirty/pending 缺口，本地实现无新增阻塞。
- 仅本地实现、验证和提交；无 push、部署、远程迁移、GitHub 重试、SECRETS_FILE 读取、备份或加密；独立预览未更新。
