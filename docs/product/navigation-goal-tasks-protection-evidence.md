# A05 目标任务关联确认与未决写入离页保护（本地）

日期：2026-10-02。基线 `7f88cd4`，分支 `codex/functional-checklist-completion`。

## 已实现

- 关联/解除关联先显示共享 ConfirmAction，明确目标、任务、关联前后状态及影响：只改变关联，不删除任务、不改任务状态或目标手动进度；解除后可重新关联。
- 默认取消、Escape 取消及焦点恢复；取消不产生写入、读回或恢复标记。决定绑定关系页对象及读取 epoch，单次消费，旧确认/取消/行按钮与卸载后回调不能作用到新页面。
- 同事件批准立即锁住写入、关闭、分页及普通离页；关闭同步失效旧行回调。沿用条件版本写入和单次请求，不自动重放。
- GoalsRoute 持有未决写入导航与 beforeunload 守卫，覆盖目标状态/进度及任务关联。编辑器因错误关闭后仍保持保护；显式 GET 核对成功才释放。这不证明未知写入成功。
- 保留 400、401/403/404、409、超时/5xx、畸形回执、版本回退及读回失败边界。

## RED → GREEN

新增 9 项行为测试，首次行为 RED 为 9 失败、17 旧用例通过。实现后旧用例显式经过确认；修正新增测试的会话存储成员键，使其与 fixture 的 contributor-route-auditor 身份一致，不改变生产存储语义。

旧未决写入恢复测试先断言 writeWorkspaceHistory 被阻止，再用 forceRemountAppAt 强制组件卸载/重挂载并保留 sessionStorage，验证迟到响应隔离及 GET-only 恢复。该夹具不是生产导航绕行，也不是原生刷新、强制离开或双账号验收。

## 验证

- 定向 5 文件 **147/147**；最终扩大回归 **44 文件 1135/1135**，不是全仓测试。
- GoalTasksEditor 独立严格 DOM 类型检查通过；项目 typecheck、build:ui（含 VM 隔离）通过。
- 双语契约 **13/13**、静态文案检查通过。
- 清单契约 **9/9**、审计 **29/5/24**、git diff --check 通过。
- 项目 typecheck 不等于全 App 严格 DOM 检查；既有全 App 严格类型基线诊断未在本切片修复，不声称全前端严格类型无错。
- Vitest 的本地回环监听/日志权限使用已批准执行方式；启动 AI 绑定警告不代表调用付费 AI。

## 复现

```sh
rtk proxy npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --jsx react-jsx --module ESNext --moduleResolution bundler --target ES2022 --lib ES2023,DOM,DOM.Iterable --esModuleInterop --allowSyntheticDefaultImports frontend/components/goal-tasks-editor.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
rtk proxy npx vitest run test/unit/frontend-admin-analytics-route.test.tsx test/unit/frontend-admin-pagination-routes.test.tsx test/unit/frontend-agent-cancellation-route.test.tsx test/unit/frontend-boards-route.test.tsx test/unit/frontend-calendar-cancel-confirmation.test.tsx test/unit/frontend-calendar-numbered-pages.test.tsx test/unit/frontend-calendar-write-journeys.test.tsx test/unit/frontend-create-form-navigation.test.tsx test/unit/frontend-cutover-contract.test.ts test/unit/frontend-discussion-route.test.tsx test/unit/frontend-focus-task-selection.test.tsx test/unit/frontend-goal-tasks.test.tsx test/unit/frontend-home-route.test.tsx test/unit/frontend-inbox-action-confirmation.test.tsx test/unit/frontend-inbox-create.test.tsx test/unit/frontend-inbox-numbered-pages.test.tsx test/unit/frontend-inbox-promotion-recovery.test.tsx test/unit/frontend-inbox-status-recovery.test.tsx test/unit/frontend-logout.test.ts test/unit/frontend-moderation-pagination-routes.test.tsx test/unit/frontend-notifications-route.test.tsx test/unit/frontend-planning-conflicts.test.tsx test/unit/frontend-planning-create-recovery.test.tsx test/unit/frontend-planning-create-reload.test.tsx test/unit/frontend-planning-numbered-pages.test.tsx test/unit/frontend-planning-status-confirmation.test.tsx test/unit/frontend-planning-write-recovery.test.tsx test/unit/frontend-project-relations-reload.test.tsx test/unit/frontend-project-timeline-conflicts.test.tsx test/unit/frontend-project-timeline-recovery.test.tsx test/unit/frontend-reader-pagination-routes.test.tsx test/unit/frontend-shell.test.tsx test/unit/frontend-task-editor-route.test.tsx test/unit/frontend-tasks-data.test.ts test/unit/frontend-tasks-route.test.tsx test/unit/frontend-timeline-edit.test.tsx test/unit/frontend-timeline-numbered-pages.test.tsx test/unit/frontend-timeline-reload.test.tsx test/unit/frontend-workspace-history-traversal.test.ts test/unit/frontend-workspace-location.test.tsx test/unit/frontend-workspace-navigation-gate.test.ts test/unit/frontend-project-relations.test.tsx test/unit/frontend-project-relations-data.test.ts test/unit/frontend-goal-tasks-data.test.ts
```

## 关闭边界

只关闭 A05/R2-008 下本地目标任务关联子项。父项及共享导航 Task 4 保持开放：其余逐页危险动作/dirty/pending、完整浏览器版本、键盘/触控及真实双身份验收仍需证据。总清单 30 原始、D08 排除、29 范围内、5 完成、24 未关闭。允许继续本地逐页审计；未 push、发布或远端迁移。
