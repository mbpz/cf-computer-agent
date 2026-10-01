# A05 / R2-008：空间与集合编辑确认及脏表单保护

日期：2026-10-01。基线 `f5ea835`，分支 `codex/functional-checklist-completion`。

## 本轮范围

- [x] 编辑空间/集合保存前复用 ConfirmAction，显示精确空间/集合 ID、名称及字段前后值：名称、slug、说明、排序、状态、父集合。双语影响说明明确仅修改配置，不修改内容正文。
- [x] 默认焦点在取消按钮，复用既有弹窗键盘机制；确认期间表单 inert。取消确认保留草稿且无写入；同步消费确认，双击最多提交一次。
- [x] 确认绑定草稿及读取结果快照。读取替换、pending、锁定、拒绝访问、卸载使旧保存确认失效；正式路由按成员/角色/权限作用域重新挂载。
- [x] 新建空间、新建集合、编辑空间、编辑集合的页内 Cancel 均保护未保存内容：未修改直接关闭，已修改先确认放弃；取消放弃仍保留草稿，确认放弃不调用写接口。创建空间重新打开为空白草稿；写入待定期间禁止关闭。
- [x] 保存仍携带打开编辑器时的原始 expectedUpdatedAt；回读不能将旧草稿静默绑定到新版本。409 后显式重试仍使用原版本，由后台拒绝覆盖；用户须取消并重新打开编辑器。
- [x] 保留既有未知结果先显式读取、已确认写入后的 GET 失败只读恢复、401/403 清空、晚到回执隔离、集合创建 requestKey 重用、父集合约束及分页。集合创建仍沿用既有提交路径，不额外增加保存确认；没有修改后台 API、幂等、审计或迁移。

## TDD 与验证

先写 12 个组件反例，原实现 12/12 失败，确认缺失和脏表单直接关闭得到复现；实现后 12/12 通过。随后扩充至 22 个组件测试，并增加 3 个路由/Response 测试，共新增 25 项。既有恢复测试仅增加显式确认动作及弹窗 HTMLElement 测试环境，原有断言保留。

```sh
rtk proxy npx vitest run test/unit/frontend-admin-space-confirmation.test.tsx test/unit/frontend-admin-space-recovery.test.tsx test/worker/admin-spaces-recovery.test.ts test/worker/spaces.test.ts test/unit/spaces-service.test.ts test/unit/frontend-focus-scope.test.tsx test/unit/frontend-auth-boundary.test.ts test/unit/frontend-app-routes.test.ts test/unit/frontend-admin-menu-confirmation.test.tsx test/unit/frontend-admin-role-confirmation.test.tsx test/unit/frontend-admin-member-confirmation.test.tsx test/unit/frontend-admin-duplicate-confirmation.test.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy npm run audit:functional-checklist
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy git diff --check
```

最终联合 **12 文件 208/208**；类型检查、UI 构建及 VM 静态隔离通过，i18n **13/13** 和静态扫描通过。保留既有大 chunk 告警。组件与路由交互使用 React/happy-dom/模拟 Response；Worker/D1 为本地测试，不替代原生浏览器或生产验收。清单审计 **9/9**、当前父项计数及 `git diff --check` 均通过。

## 剩余边界

- 当前只覆盖这四类表单的页内 Cancel，不是全站离开路由、刷新或关闭浏览器时的 dirty 保护。
- 其他管理页、完整原生键盘/触控、窄屏暗色及真实双身份旅程仍未验收。设备锁定后没有新的人工解锁确认，不绕过限制；本地工作仍可继续。
- **29 范围内 / 5 完成 / 24 未完成**，A05/R2-008 保持开放。下一允许继续 A05 其余页面的危险动作、异步和表单保护核查。
- 仅本地实现、验证及提交，无 push、部署、远程迁移、GitHub 网络重试、SECRETS_FILE 读取、备份或加密；独立验收预览未更新。
