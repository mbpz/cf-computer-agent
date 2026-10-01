# A05 / R2-008：重复候选决策确认

日期：2026-10-01。基线 `ca535dc`，分支 `codex/functional-checklist-completion`。

## 本轮范围

- [x] 关联、保持独立、驳回均先显式确认，显示所选决策、提交标题/ID、既有提交标题/ID、来源及版本 ID；中英文影响说明。
- [x] 核对 `src/duplicates/repository.ts` 的实际事务：只记录候选决策及审计，不合并、删除或发布内容。说明不夸大按钮能力；终态候选离开待处理队列，本页没有撤销入口。
- [x] 默认取消焦点、复用共享弹窗键盘机制，确认时背景 inert。取消无写入；同步消费确认，重复点击或同批次另一个操作不会更换目标或重放决策。
- [x] 确认绑定当前读取结果；列表替换、读取/写入 pending、行锁、拒绝访问、页面切换及卸载使旧确认失效。正式路由按成员/角色/权限作用域重新挂载。
- [x] 保留既有单次写入、未知结果先显式只读恢复、已确认终态不被陈旧 pending 数据解锁、401/403 清空、晚到回执隔离及空页回退。没有更改后台接口、审计、幂等或迁移。

## TDD 与验证

先写 14 个组件交互测试，原实现 14/14 失败（直接回调、缺少确认）；实现后通过。另加 4 个真实路由/Response 测试验证三种操作取消不发 POST、换页丢弃确认。旧恢复测试只增加显式确认动作及弹窗所需 HTMLElement 测试环境，保留原有恢复断言。共新增 18 项。

```sh
rtk proxy npx vitest run test/unit/frontend-admin-duplicate-confirmation.test.tsx test/unit/frontend-admin-duplicate-recovery.test.tsx test/unit/frontend-admin-duplicates.test.ts test/worker/submissions.test.ts test/unit/frontend-focus-scope.test.tsx test/unit/frontend-auth-boundary.test.ts test/unit/frontend-app-routes.test.ts test/unit/frontend-admin-menu-confirmation.test.tsx test/unit/frontend-admin-role-confirmation.test.tsx test/unit/frontend-admin-member-confirmation.test.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy npm run audit:functional-checklist
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
```

联合 **10 文件 161/161**；类型检查、UI 构建及 VM 静态隔离通过，i18n **13/13** 及静态扫描通过；清单检查 **9/9**。保留既有大 chunk 警告。交互为 React/happy-dom/模拟 Response，Worker 为本地测试，不能作为原生浏览器或生产证据。

## 剩余边界

- 本轮只完成重复候选管理页的确认子项；不增加真正的内容合并或投稿驳回功能，也不将后台决策记录描述为这些功能。
- 其他管理页、全站离开/刷新 dirty 保护及原生键盘/触控、窄屏暗色、双身份验收未覆盖。设备锁定后未取得新的人工解锁确认，不绕过限制；本地下一项可继续。
- **29 范围内 / 5 完成 / 24 未完成**，A05/R2-008 保持开放。下一允许继续 A05 空间/集合编辑确认及脏表单核查。
- 仅本地实现、验证及提交；无 push、部署、远程迁移、GitHub 重试、SECRETS_FILE 读取、备份或加密；独立预览未更新。
