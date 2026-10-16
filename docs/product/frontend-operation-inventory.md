# 前端可见操作源码索引（A01）

此索引是源码清点，不是可见性证明、权限证明或原生浏览器验收；不能据此关闭 A01/A02/A05 父项。

生成器枚举全部第一方 frontend TS/TSX/JS/MJS 中的 JSX 控件、事件回调、导航/表单、role 语义边界、转发 spread 和命令式监听器。包含未接线组件，不能把出现次数当作用户可见功能数。
JSON 保留完整属性、handler、条件分支/重复模板、弹层祖先和前置 return 守卫；下表仅作摘要（长表达式截断），逐项核对以相邻 frontend-operation-inventory.json 和源码锚点为准。
自定义组件回调可能是状态通知而非用户操作；spread、动态菜单数据、跨组件条件传播、门户/第三方控件、createElement/innerHTML 动态生成的控件及 CSS 可见性需人工展开。未求值条件，不承诺列出所有运行时状态组合。
运行 `npm run audit:frontend-operations` 验证无漂移；只有有意更新证据才运行 `npm run inventory:frontend-operations`。

源码文件：322；操作/转发候选：1332。无候选文件也逐一列出，防止静默遗漏扫描范围。

| 源文件 | 候选数 |
| --- | ---: |
| frontend/app-routes.ts | 0 |
| frontend/app.tsx | 89 |
| frontend/asset-manifest.ts | 0 |
| frontend/build-contract.ts | 0 |
| frontend/components/agent/agent-feedback.tsx | 8 |
| frontend/components/agent/agent-history-list.tsx | 8 |
| frontend/components/agent/answer-panel.tsx | 0 |
| frontend/components/agents/agent-code.tsx | 0 |
| frontend/components/agents/agent-disclosure.tsx | 1 |
| frontend/components/agents/agent-highlighter.ts | 0 |
| frontend/components/agents/agent-progress.tsx | 1 |
| frontend/components/agents/citations.tsx | 3 |
| frontend/components/agents/code-block.tsx | 2 |
| frontend/components/assets/asset-availability-panel.tsx | 2 |
| frontend/components/assets/asset-dropzone.tsx | 4 |
| frontend/components/assets/asset-preview-model.ts | 0 |
| frontend/components/assets/asset-preview-panel.tsx | 0 |
| frontend/components/assets/asset-state.ts | 0 |
| frontend/components/assets/asset-upload-model.ts | 0 |
| frontend/components/assets/asset-upload-panel.tsx | 10 |
| frontend/components/assets/asset-upload-queue.ts | 0 |
| frontend/components/calendar-cancel-confirmation.tsx | 1 |
| frontend/components/calendar-create-form.tsx | 15 |
| frontend/components/calendar-range-filter.tsx | 4 |
| frontend/components/data-pagination.tsx | 5 |
| frontend/components/data-table.tsx | 3 |
| frontend/components/focus-action-confirmation.tsx | 1 |
| frontend/components/focus-task-picker.tsx | 9 |
| frontend/components/goal-tasks-editor.tsx | 11 |
| frontend/components/graph/graph-canvas.tsx | 6 |
| frontend/components/graph/graph-evidence-panel.tsx | 4 |
| frontend/components/graph/graph-inspector.tsx | 5 |
| frontend/components/history-navigation-notice.tsx | 2 |
| frontend/components/inbox-action-confirmation.tsx | 1 |
| frontend/components/inbox-create-form.tsx | 17 |
| frontend/components/knowledge/knowledge-share-button.tsx | 3 |
| frontend/components/motion/animated-toast-stack.tsx | 4 |
| frontend/components/motion/button/base.tsx | 3 |
| frontend/components/motion/center-morph-modal.tsx | 4 |
| frontend/components/motion/checkbox.tsx | 1 |
| frontend/components/motion/drawer.tsx | 3 |
| frontend/components/motion/file-tree.tsx | 2 |
| frontend/components/motion/input.tsx | 2 |
| frontend/components/motion/loader.tsx | 3 |
| frontend/components/motion/not-found/glitch.tsx | 0 |
| frontend/components/motion/not-found/shared.tsx | 2 |
| frontend/components/motion/number-ticker.tsx | 0 |
| frontend/components/motion/scroll-reveal.tsx | 0 |
| frontend/components/motion/select.tsx | 5 |
| frontend/components/motion/shared-layout-bg.tsx | 2 |
| frontend/components/motion/switch.tsx | 1 |
| frontend/components/motion/table/editable-cell.tsx | 1 |
| frontend/components/motion/table/index.tsx | 6 |
| frontend/components/motion/table/row-handle.tsx | 2 |
| frontend/components/motion/table/skeleton-rows.tsx | 0 |
| frontend/components/motion/table/table-header.tsx | 9 |
| frontend/components/motion/table/table-menu.tsx | 7 |
| frontend/components/motion/table/types.ts | 0 |
| frontend/components/motion/table/use-column-reorder.ts | 0 |
| frontend/components/motion/table/use-column-resize.ts | 0 |
| frontend/components/motion/table/use-column-sort.ts | 0 |
| frontend/components/motion/table/use-row-selection.ts | 0 |
| frontend/components/motion/table/utils.ts | 0 |
| frontend/components/motion/tabs.tsx | 7 |
| frontend/components/planning-create-form.tsx | 14 |
| frontend/components/planning-status-confirmation.tsx | 1 |
| frontend/components/planning-write-recovery.tsx | 4 |
| frontend/components/project-relations-editor.tsx | 10 |
| frontend/components/review/review-comments-data.ts | 0 |
| frontend/components/review/review-comments-owner.tsx | 0 |
| frontend/components/review/review-comments-panel.tsx | 11 |
| frontend/components/review/review-decision-controls.tsx | 17 |
| frontend/components/review/review-detail-data.ts | 0 |
| frontend/components/review/review-detail-model.ts | 0 |
| frontend/components/review/review-drafts.tsx | 3 |
| frontend/components/shell/app-shell.tsx | 64 |
| frontend/components/shell/command-palette.tsx | 8 |
| frontend/components/shell/context-rail.tsx | 6 |
| frontend/components/shell/navigation-policy.ts | 0 |
| frontend/components/snapshot-target-detail.tsx | 3 |
| frontend/components/submissions/submission-form-model.ts | 0 |
| frontend/components/timeline-create-form.tsx | 21 |
| frontend/components/timeline-item-editor.tsx | 16 |
| frontend/components/today-target-detail.tsx | 1 |
| frontend/components/ui/alert.tsx | 3 |
| frontend/components/ui/badge.tsx | 1 |
| frontend/components/ui/button.tsx | 1 |
| frontend/components/ui/card.tsx | 6 |
| frontend/components/ui/checkbox.tsx | 1 |
| frontend/components/ui/confirm-action.tsx | 4 |
| frontend/components/ui/dialog.tsx | 3 |
| frontend/components/ui/dropdown-menu.tsx | 7 |
| frontend/components/ui/expandable-tabs.tsx | 2 |
| frontend/components/ui/focus-scope.tsx | 1 |
| frontend/components/ui/input.tsx | 1 |
| frontend/components/ui/label.tsx | 1 |
| frontend/components/ui/page-header.tsx | 0 |
| frontend/components/ui/page-state.tsx | 1 |
| frontend/components/ui/pagination.tsx | 10 |
| frontend/components/ui/select.tsx | 2 |
| frontend/components/ui/sheet.tsx | 4 |
| frontend/components/ui/skeleton.tsx | 1 |
| frontend/components/ui/summary-row.tsx | 1 |
| frontend/components/ui/tabs.tsx | 4 |
| frontend/components/ui/textarea.tsx | 1 |
| frontend/components/ui/tooltip.tsx | 4 |
| frontend/contracts/api.ts | 0 |
| frontend/contracts/list-localization-contract.ts | 0 |
| frontend/contracts/routes.ts | 0 |
| frontend/cutover-contract.ts | 0 |
| frontend/features/environments/account-network-boundary.tsx | 0 |
| frontend/features/environments/account-network-owner.mjs | 2 |
| frontend/features/environments/account-network.mjs | 3 |
| frontend/features/environments/account-vm-runtime.mjs | 1 |
| frontend/features/environments/authenticated-vm-runtime.ts | 1 |
| frontend/features/environments/connector-session.mjs | 1 |
| frontend/features/environments/deletion-reconciler.ts | 0 |
| frontend/features/environments/environment-draft.ts | 0 |
| frontend/features/environments/environment-manager.ts | 2 |
| frontend/features/environments/environment-operation-journal.ts | 0 |
| frontend/features/environments/environment-rename-dialog.tsx | 7 |
| frontend/features/environments/environments-page.tsx | 32 |
| frontend/features/environments/files/asset-import-panel.tsx | 23 |
| frontend/features/environments/files/asset-import.ts | 0 |
| frontend/features/environments/files/file-manager.mjs | 0 |
| frontend/features/environments/files/files-panel.tsx | 34 |
| frontend/features/environments/files/knowledge-import-panel.tsx | 14 |
| frontend/features/environments/files/knowledge-import.ts | 0 |
| frontend/features/environments/files/stream-download.mjs | 2 |
| frontend/features/environments/network-lifecycle.mjs | 2 |
| frontend/features/environments/storage/checkpoints.mjs | 2 |
| frontend/features/environments/storage/reconcile-checkpoints.ts | 1 |
| frontend/lib/activity-data.ts | 0 |
| frontend/lib/admin-analytics-data.ts | 0 |
| frontend/lib/admin-asset-retry-intent.ts | 0 |
| frontend/lib/admin-assets-data.ts | 0 |
| frontend/lib/admin-audit-data.ts | 0 |
| frontend/lib/admin-duplicate-intent.ts | 0 |
| frontend/lib/admin-duplicates-data.ts | 0 |
| frontend/lib/admin-member-invitations-data.ts | 0 |
| frontend/lib/admin-member-status-intent.ts | 0 |
| frontend/lib/admin-members-data.ts | 0 |
| frontend/lib/admin-menu-draft.ts | 0 |
| frontend/lib/admin-menu-write-intent.ts | 0 |
| frontend/lib/admin-menus-data.ts | 0 |
| frontend/lib/admin-review-data.ts | 0 |
| frontend/lib/admin-role-draft.ts | 0 |
| frontend/lib/admin-role-write-intent.ts | 0 |
| frontend/lib/admin-roles-controller.ts | 1 |
| frontend/lib/admin-roles-data.ts | 0 |
| frontend/lib/admin-space-draft.ts | 0 |
| frontend/lib/admin-space-write-intent.ts | 0 |
| frontend/lib/admin-spaces-data.ts | 0 |
| frontend/lib/agent-composer-draft.ts | 0 |
| frontend/lib/agent-data.ts | 0 |
| frontend/lib/agent-feedback-intent.ts | 0 |
| frontend/lib/agent-turn-intent.ts | 0 |
| frontend/lib/api.ts | 0 |
| frontend/lib/asset-availability.ts | 0 |
| frontend/lib/asset-resume.ts | 0 |
| frontend/lib/asset-upload-data.ts | 0 |
| frontend/lib/asset-upload-intent.ts | 0 |
| frontend/lib/asset-upload-transport.ts | 1 |
| frontend/lib/asset-upload-workflow.ts | 0 |
| frontend/lib/async-owner.ts | 0 |
| frontend/lib/auth-boundary.ts | 0 |
| frontend/lib/board-move-intent.ts | 0 |
| frontend/lib/calendar-create-intent.ts | 0 |
| frontend/lib/calendar-data.ts | 0 |
| frontend/lib/calendar-draft.ts | 0 |
| frontend/lib/calendar-query.ts | 0 |
| frontend/lib/command-palette.ts | 0 |
| frontend/lib/discussion-draft.ts | 0 |
| frontend/lib/discussion-intent.ts | 0 |
| frontend/lib/discussions-data.ts | 0 |
| frontend/lib/ease.ts | 0 |
| frontend/lib/favicon.ts | 0 |
| frontend/lib/focus-create-intent.ts | 0 |
| frontend/lib/focus-data.ts | 0 |
| frontend/lib/focus-draft.ts | 0 |
| frontend/lib/focus-transition-intent.ts | 0 |
| frontend/lib/focus.ts | 0 |
| frontend/lib/goal-tasks-data.ts | 0 |
| frontend/lib/goals-data.ts | 0 |
| frontend/lib/graph-action-intent.ts | 0 |
| frontend/lib/graph-actions.ts | 0 |
| frontend/lib/graph-data.ts | 0 |
| frontend/lib/graph-evidence.ts | 0 |
| frontend/lib/graph-inspector.ts | 0 |
| frontend/lib/graph-suggestions.ts | 0 |
| frontend/lib/graph-view.ts | 0 |
| frontend/lib/hooks/use-favicon.ts | 0 |
| frontend/lib/hooks/use-hover-capable.ts | 1 |
| frontend/lib/i18n.ts | 0 |
| frontend/lib/inbox-create-intent.ts | 0 |
| frontend/lib/inbox-data.ts | 0 |
| frontend/lib/inbox-draft.ts | 0 |
| frontend/lib/knowledge-data.ts | 0 |
| frontend/lib/knowledge-note.ts | 0 |
| frontend/lib/knowledge-reader-data.ts | 0 |
| frontend/lib/list-mode.ts | 1 |
| frontend/lib/logout-account.ts | 0 |
| frontend/lib/logout.ts | 0 |
| frontend/lib/markdown-renderer.ts | 0 |
| frontend/lib/menu-keyboard.ts | 0 |
| frontend/lib/my-submissions-data.ts | 0 |
| frontend/lib/navigation-data.ts | 0 |
| frontend/lib/notification-summary-events.ts | 0 |
| frontend/lib/notification-update-intent.ts | 0 |
| frontend/lib/notifications-data.ts | 0 |
| frontend/lib/numbered-page.ts | 0 |
| frontend/lib/offline-submission-draft.ts | 0 |
| frontend/lib/planning-create-intent.ts | 0 |
| frontend/lib/planning-draft.ts | 0 |
| frontend/lib/planning-write-recovery.ts | 0 |
| frontend/lib/presence-gate.tsx | 0 |
| frontend/lib/project-relations-data.ts | 0 |
| frontend/lib/projects-data.ts | 0 |
| frontend/lib/reader-favorite-intent.ts | 0 |
| frontend/lib/reader-note-intent.ts | 0 |
| frontend/lib/responsive-contract.ts | 0 |
| frontend/lib/review-comment-intent.ts | 0 |
| frontend/lib/review-data.ts | 0 |
| frontend/lib/review-decision-intent.ts | 0 |
| frontend/lib/review-note-draft.ts | 0 |
| frontend/lib/review-period.ts | 0 |
| frontend/lib/route-access.ts | 0 |
| frontend/lib/router.ts | 0 |
| frontend/lib/saved-view-intent.ts | 0 |
| frontend/lib/saved-views-data.ts | 0 |
| frontend/lib/search-composer-draft.ts | 0 |
| frontend/lib/search-data.ts | 0 |
| frontend/lib/session-state.ts | 0 |
| frontend/lib/session.ts | 0 |
| frontend/lib/snapshot-validation.ts | 0 |
| frontend/lib/submission-data.ts | 0 |
| frontend/lib/submission-intent.ts | 0 |
| frontend/lib/system-share.ts | 0 |
| frontend/lib/tabs-keyboard.ts | 0 |
| frontend/lib/task-editor-draft.ts | 0 |
| frontend/lib/task-write-intent.ts | 0 |
| frontend/lib/tasks-data.ts | 0 |
| frontend/lib/theme.ts | 0 |
| frontend/lib/timeline-create-intent.ts | 0 |
| frontend/lib/timeline-draft.ts | 0 |
| frontend/lib/today-clock.ts | 0 |
| frontend/lib/today-data.ts | 0 |
| frontend/lib/touch.ts | 0 |
| frontend/lib/use-create-draft.tsx | 3 |
| frontend/lib/use-notification-summary.ts | 2 |
| frontend/lib/use-reader-note-shares.tsx | 1 |
| frontend/lib/use-reader-note.tsx | 0 |
| frontend/lib/use-saved-views.tsx | 1 |
| frontend/lib/use-toast.tsx | 1 |
| frontend/lib/utils.ts | 0 |
| frontend/lib/workbench-data.ts | 0 |
| frontend/lib/workbench-review-data.ts | 0 |
| frontend/lib/workspace-browser-history.ts | 3 |
| frontend/lib/workspace-history-traversal.ts | 0 |
| frontend/lib/workspace-location.ts | 2 |
| frontend/lib/workspace-navigation-gate.ts | 0 |
| frontend/main.tsx | 0 |
| frontend/pages/admin/admin-dashboard-page.tsx | 6 |
| frontend/pages/admin/admin-dashboard-route.tsx | 1 |
| frontend/pages/admin/admin-forbidden-page.tsx | 0 |
| frontend/pages/admin/analytics-page.tsx | 11 |
| frontend/pages/admin/asset-queue-page.tsx | 18 |
| frontend/pages/admin/audit-page.tsx | 5 |
| frontend/pages/admin/create-role-page.tsx | 16 |
| frontend/pages/admin/duplicate-queue-page.tsx | 11 |
| frontend/pages/admin/members-page.tsx | 24 |
| frontend/pages/admin/menu-editor.tsx | 11 |
| frontend/pages/admin/menus-page.tsx | 20 |
| frontend/pages/admin/review-detail-page.tsx | 7 |
| frontend/pages/admin/review-detail-route.tsx | 2 |
| frontend/pages/admin/review-queue-page.tsx | 8 |
| frontend/pages/admin/role-detail-page.tsx | 20 |
| frontend/pages/admin/role-permission-groups.ts | 0 |
| frontend/pages/admin/roles-page.tsx | 3 |
| frontend/pages/admin/spaces-page.tsx | 45 |
| frontend/pages/agent-page.tsx | 14 |
| frontend/pages/boards/board-model.ts | 0 |
| frontend/pages/boards/boards-page.tsx | 11 |
| frontend/pages/calendar-page.tsx | 10 |
| frontend/pages/coming-soon-page.tsx | 0 |
| frontend/pages/focus-page.tsx | 16 |
| frontend/pages/goals-page.tsx | 13 |
| frontend/pages/graph-page.tsx | 39 |
| frontend/pages/home-page.tsx | 16 |
| frontend/pages/inbox-page.tsx | 18 |
| frontend/pages/knowledge-page.tsx | 31 |
| frontend/pages/knowledge-reader-page.tsx | 50 |
| frontend/pages/login-page.tsx | 7 |
| frontend/pages/messages/discussion-model.ts | 0 |
| frontend/pages/messages/messages-page.tsx | 4 |
| frontend/pages/messages/thread-page.tsx | 18 |
| frontend/pages/my-submissions-page.tsx | 10 |
| frontend/pages/notifications/notification-model.ts | 0 |
| frontend/pages/notifications/notifications-page.tsx | 10 |
| frontend/pages/project-timeline-page.tsx | 9 |
| frontend/pages/projects-page.tsx | 15 |
| frontend/pages/search-page.tsx | 23 |
| frontend/pages/settings-page.tsx | 4 |
| frontend/pages/submit-page.tsx | 11 |
| frontend/pages/tasks/task-editor.tsx | 50 |
| frontend/pages/tasks/task-types.ts | 0 |
| frontend/pages/tasks/tasks-model.ts | 0 |
| frontend/pages/tasks/tasks-page.tsx | 19 |
| frontend/pages/today-page.tsx | 6 |
| frontend/pages/workbench-landing/public-workbench-page.tsx | 15 |
| frontend/pages/workbench-landing/workbench-copy.ts | 0 |
| frontend/pages/workbench-landing/workbench-demo-data.ts | 0 |
| frontend/pages/workbench-landing/workbench-demo-state.ts | 0 |
| frontend/pages/workbench-landing/workbench-feature-panel.tsx | 13 |
| frontend/pages/workbench-landing/workbench-scene-config.ts | 0 |
| frontend/pages/workbench-landing/workbench-scene-policy.ts | 0 |
| frontend/pages/workbench-landing/workbench-scene-runtime.ts | 5 |
| frontend/pages/workbench-landing/workbench-scene.tsx | 9 |
| frontend/pages/workbench-review-page.tsx | 14 |
| frontend/public/sw.js | 3 |
| frontend/public/theme-boot.js | 0 |
| frontend/styles/token-contract.ts | 0 |

## 路由与共享入口候选映射

以下来自现有成熟度清单的明确 root symbol，再按本地符号引用及相对 import 传递展开；不是把 app.tsx 的所有按钮归给每条路由。候选可过度近似（如局部变量同名）；跨模块动态渲染、默认/re-export 等未解析符号单独列出，不能声称无遗漏。JSON 保存每个入口对应的精确候选 ID。

| 路由/入口 | root symbol | 候选数 | 未解析符号 |
| --- | --- | ---: | --- |
| /graph | frontend/pages/graph-page.tsx#GraphRoute; frontend/pages/graph-page.tsx#GraphPage | 71 | 无（不代表动态边界已核对） |
| /projects/:id/timeline | frontend/app.tsx#ProjectTimelineRoute | 129 | 无（不代表动态边界已核对） |
| /inbox | frontend/app.tsx#InboxRoute | 174 | 无（不代表动态边界已核对） |
| /goals | frontend/app.tsx#GoalsRoute | 121 | 无（不代表动态边界已核对） |
| /projects | frontend/app.tsx#ProjectsRoute | 122 | 无（不代表动态边界已核对） |
| /calendar | frontend/app.tsx#CalendarRoute | 111 | 无（不代表动态边界已核对） |
| /today | frontend/app.tsx#TodayRoute | 32 | 无（不代表动态边界已核对） |
| /focus | frontend/app.tsx#FocusRoute | 109 | 无（不代表动态边界已核对） |
| /review | frontend/app.tsx#WorkbenchReviewRoute | 39 | 无（不代表动态边界已核对） |
| / | frontend/app.tsx#HomeRoute | 26 | 无（不代表动态边界已核对） |
| /submit | frontend/app.tsx#SubmitRoute | 60 | 无（不代表动态边界已核对） |
| /knowledge | frontend/app.tsx#KnowledgeRoute | 99 | 无（不代表动态边界已核对） |
| /search | frontend/app.tsx#SearchRoute; frontend/lib/search-data.ts#* | 101 | 无（不代表动态边界已核对） |
| /agent | frontend/app.tsx#AgentRoute; frontend/app.tsx#AgentConversationRoute; frontend/lib/agent-data.ts#*; frontend/lib/agent-turn-intent.ts#*; frontend/components/agent/agent-feedback.tsx#AgentFeedback; frontend/components/agent/agent-history-list.tsx#AgentHistoryList | 79 | 无（不代表动态边界已核对） |
| /my-submissions | frontend/app.tsx#MySubmissionsRoute | 74 | 无（不代表动态边界已核对） |
| /tasks | frontend/app.tsx#TasksRoute; frontend/lib/tasks-data.ts#*; frontend/pages/tasks/task-editor.tsx#TaskEditor | 150 | 无（不代表动态边界已核对） |
| /boards | frontend/app.tsx#BoardsRoute | 75 | 无（不代表动态边界已核对） |
| /environments | frontend/features/environments/environments-page.tsx#EnvironmentsPage; frontend/features/environments/environment-manager.ts#getEnvironmentManager | 114 | 无（不代表动态边界已核对） |
| /settings | frontend/pages/settings-page.tsx#SettingsPage | 13 | 无（不代表动态边界已核对） |
| /admin | frontend/pages/admin/admin-dashboard-route.tsx#AdminDashboardRoute | 16 | 无（不代表动态边界已核对） |
| /admin/submissions | frontend/app.tsx#ReviewQueueRoute | 106 | 无（不代表动态边界已核对） |
| /admin/duplicates | frontend/app.tsx#AdminDuplicateRoute; frontend/lib/admin-duplicates-data.ts#* | 86 | 无（不代表动态边界已核对） |
| /admin/assets | frontend/app.tsx#AdminAssetsRoute; frontend/lib/admin-assets-data.ts#* | 93 | 无（不代表动态边界已核对） |
| /admin/members | frontend/app.tsx#AdminMembersRoute; frontend/lib/admin-members-data.ts#* | 102 | 无（不代表动态边界已核对） |
| /admin/roles | frontend/app.tsx#AdminRolesRoute; frontend/lib/admin-roles-data.ts#* | 67 | 无（不代表动态边界已核对） |
| /admin/menus | frontend/app.tsx#AdminMenusRoute; frontend/lib/admin-menus-data.ts#* | 68 | 无（不代表动态边界已核对） |
| /admin/spaces | frontend/app.tsx#AdminSpacesRoute; frontend/lib/admin-spaces-data.ts#* | 75 | 无（不代表动态边界已核对） |
| /admin/audit | frontend/app.tsx#AdminAuditRoute | 68 | 无（不代表动态边界已核对） |
| /admin/analytics | frontend/app.tsx#AdminAnalyticsRoute | 76 | 无（不代表动态边界已核对） |
| /notifications | frontend/app.tsx#NotificationsRoute; frontend/lib/notifications-data.ts#* | 75 | 无（不代表动态边界已核对） |
| /messages | frontend/app.tsx#MessagesRoute | 25 | 无（不代表动态边界已核对） |
| /knowledge/:id | frontend/app.tsx#KnowledgeReaderRoute; frontend/app.tsx#KnowledgeReaderSession; frontend/lib/graph-evidence.ts#loadGraphCitation; frontend/lib/knowledge-reader-data.ts#* | 87 | 无（不代表动态边界已核对） |
| /messages/:id | frontend/app.tsx#DiscussionThreadRoute | 48 | 无（不代表动态边界已核对） |
| /admin/submissions/:id | frontend/pages/admin/review-detail-route.tsx#ReviewDetailRoute | 70 | 无（不代表动态边界已核对） |
| &lt;authenticated-shell&gt; | frontend/components/shell/app-shell.tsx#AppShell | 99 | 无（不代表动态边界已核对） |
| &lt;anonymous-home&gt; | frontend/pages/workbench-landing/public-workbench-page.tsx#PublicWorkbenchPage | 61 | 无（不代表动态边界已核对） |
| &lt;login&gt; | frontend/pages/login-page.tsx#LoginPage | 18 | 无（不代表动态边界已核对） |

尚未归入上述入口的候选：161。这些可能是 App 全局守卫、未接线组件或静态图盲区，必须核对，不能删掉以提高覆盖率。

## frontend/app.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 223:106 App | AppShell page | onNavigate=navigate; onLogout=() =&gt; logout(owner) | earlier return: sessionError; earlier return: anonymous && pathname === "/"; earlier return: anonymous; earlier return: !session |
| 250:39 renderPage | SettingsPage  |  | {"kind":"branch","expression":"session","branch":"true"} |
| 314:10 HomeRoute | HomePage  | onRetry=() =&gt; { if (pending.current) return; pending.current = true; setState({ kind: "loading" }); setRetry(value =&gt; value + 1); } |  |
| 387:10 AdminAnalyticsRoute | AdminAnalyticsPage  | onDaysChange=changeDays; onLoadMore=() =&gt; { if (state.kind === "ready" && state.data.recentVisitors.pagination.page &lt; state.data.recentVisitors.paginat… |  |
| 423:10 AdminRolesRoute | AdminRolesPage  | onLoadRetry=controller.retryRead |  |
| 429:10 AdminRoleNewRoute | AdminRoleCreatePage  | onCreate=controller.createRole; onCreated=back; onCancel=back; onDiscardRecord=controller.discardRecord; onLoadRetry=controller.retryRead |  |
| 438:10 AdminRoleDetailRoute | AdminRoleDetailPage  | onBack=() =&gt; writeWorkspaceHistory("push", "/admin/roles"); onLoadRetry=controller.retryRead; onSave=controller.recordBlocked ? undefined : (role, allowBi… |  |
| 473:5 AdminMenusRoute | owner.addEventListener  | "beforeunload", warn |  |
| 565:10 AdminMenusRoute | AdminMenusPage  | onLoadRetry=retryRead; onDiscardRecord=discardRecord; onCreate=recordBlocked ? undefined : (input) =&gt; mutate({ op: "create", input }, () =&gt; createAdmin… |  |
| 616:5 KnowledgeReaderSession | owner.addEventListener  | "beforeunload", warn |  |
| 750:5 KnowledgeReaderSession | window.addEventListener  | "storage", onStorage |  |
| 778:14 KnowledgeReaderSession | KnowledgeReaderPage  | onRetry=() =&gt; setRetry((value) =&gt; value + 1) | {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"} |
| 837:10 KnowledgeReaderSession | KnowledgeReaderPage  | onCompare=showDiff; onRetryRelated=retryRelated; onRetryBacklinks=retryBacklinks; onCheckFavorite=checkFavorite; onToggleFavorite=toggleFavorite | earlier return: state.kind !== "ready" |
| 845:10 KnowledgeRoute | MemberKnowledgeRoute  |  | spread: props |
| 974:10 MemberKnowledgeRoute | KnowledgePage  | onRetry=() =&gt; { if (deniedRef.current) { deniedRef.current = false; setState({ kind: "loading" }); } setRetryVersion((value) =&gt; value + 1); }; onPageCh… |  |
| 1037:5 MemberSearchRoute | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 1111:10 MemberSearchRoute | SearchPage  | onQueryChange=(value) =&gt; queryDraft.edit("query", value); onSubmit=submit; onPageChange=(next) =&gt; load(next); onPageSizeChange=(size) =&gt; setPageSize… |  |
| 1117:88 AgentRoute | a frontendText(locale, "AGENT_NEW_CONVERSATION") | href="/agent" |  |
| 1184:5 AgentConversationRoute | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 1291:183 AgentConversationRoute | Button frontendText(locale, "AGENT_INTENT_ABANDON") | onClick=abandon | {"kind":"branch","expression":"storageBlocked","branch":"true"} |
| 1292:324 AgentConversationRoute | Button frontendText(locale, "AGENT_INTENT_RETRY") | onClick=() =&gt; submit(intentRef.current!.question) | {"kind":"branch","expression":"unconfirmed && intentRef.current","branch":"true"}; earlier return: storageBlocked |
| 1292:437 AgentConversationRoute | Button frontendText(locale, "AGENT_INTENT_ABANDON") | onClick=abandon | {"kind":"branch","expression":"unconfirmed && intentRef.current","branch":"true"}; earlier return: storageBlocked |
| 1294:181 AgentConversationRoute | Button frontendText(locale, "AGENT_RETRY") | onClick=() =&gt; setRecoveryVersion((value) =&gt; value + 1) | {"kind":"branch","expression":"recovery === \"error\"","branch":"true"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; ea… |
| 1294:292 AgentConversationRoute | a frontendText(locale, "AGENT_NEW_CONVERSATION") | href="/agent" | {"kind":"branch","expression":"recovery === \"error\"","branch":"true"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; ea… |
| 1297:27 AgentConversationRoute | div  |  | {"kind":"logical","expression":"composerBlocked","operator":"&&"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; earlier … |
| 1297:187 AgentConversationRoute | Button frontendText(locale, "AGENT_COMPOSER_RECORD_DISCARD") | onClick=discardComposer; type="button" | {"kind":"logical","expression":"composerBlocked","operator":"&&"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; earlier … |
| 1298:26 AgentConversationRoute | p composerNotice |  | {"kind":"logical","expression":"composerNotice","operator":"&&"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; earlier r… |
| 1299:33 AgentConversationRoute | div  |  | {"kind":"logical","expression":"feedbackRecordBlocked","operator":"&&"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; ea… |
| 1299:200 AgentConversationRoute | Button frontendText(locale, "AGENT_FEEDBACK_RECORD_DISCARD") | onClick=discardFeedback; type="button" | {"kind":"logical","expression":"feedbackRecordBlocked","operator":"&&"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; ea… |
| 1300:83 AgentConversationRoute | div  |  | {"kind":"logical","expression":"feedbackIntent && visibleConversation !== feedbackIntent.conversationId","operator":"&&"}; earlier return: storageBlocked; ea… |
| 1300:250 AgentConversationRoute | Button frontendText(locale, "AGENT_FEEDBACK_RETRY") | onClick=retryFeedback; type="button" | {"kind":"logical","expression":"feedbackIntent && visibleConversation !== feedbackIntent.conversationId","operator":"&&"}; earlier return: storageBlocked; ea… |
| 1301:566 AgentConversationRoute | a citation.title ?? citation.id | href=citation.href | {"kind":"logical","expression":"history.length &gt; 0","operator":"&&"}; {"kind":"repeat","expression":"history"}; {"kind":"repeat","expression":"message.cit… |
| 1302:37 AgentConversationRoute | a frontendText(locale, "AGENT_RESTORE_LINK") | href=&#96;/agent?conversationId=${encodeURIComponent(conversationIdRef.current)}&#96; | {"kind":"logical","expression":"conversationIdRef.current","operator":"&&"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current… |
| 1303:7 AgentConversationRoute | AgentPage  | onQuestionChange=value =&gt; questionDraft.edit("question", value); onSubmit=() =&gt; submit(); onCancel=cancel; onRetry=() =&gt; submit(lastQuestion); onSta… | earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; earlier return: recovery === "loading" && state.kind !== "loading"; earlier… |
| 1407:41 MemberSubmitForm | SubmitPage  | onDraftChange=changeDraft; onSubmit=() =&gt; submit(draftRef.current) |  |
| 1443:10 MySubmissionsRoute | MySubmissionsPage  | onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1); onPageChange=(next) =&gt; load(next); onPageSizeChange=(size) =&gt; setPageSize(size); onLoadMore=… |  |
| 1492:5 TasksRoute | owner.addEventListener  | "beforeunload", warn |  |
| 1642:27 TasksRoute | Button frontendText(locale, "TASKS_WRITE_RECORD_DISCARD") | onClick=discardRecord | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 1646:7 TasksRoute | Button frontendText(locale, "TASKS_CHECK_WRITE") | onClick=() =&gt; void resolveListUnknown("check") | disabled=listRecovering; {"kind":"logical","expression":"listUnknown","operator":"&&"} |
| 1647:7 TasksRoute | Button frontendText(locale, "TASKS_RETRY_WRITE") | onClick=() =&gt; void resolveListUnknown("retry") | disabled=listRecovering; {"kind":"logical","expression":"listUnknown","operator":"&&"} |
| 1649:29 TasksRoute | p actionNotice |  | {"kind":"logical","expression":"actionNotice","operator":"&&"} |
| 1649:90 TasksRoute | TasksPage  | onCreate=() =&gt; setEditor({ taskId: null }); onOpen=(taskId) =&gt; setEditor({ taskId }); onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1); onFilt… |  |
| 1649:1021 TasksRoute | TaskEditor  | onClose=() =&gt; setEditor(null); onChanged=() =&gt; setRetryVersion((value) =&gt; value + 1); onDenied=clearDeniedTasks | {"kind":"logical","expression":"editor","operator":"&&"}; spread: (editor.restored ? { restored: editor.restored } : {}) |
| 1675:5 InboxRoute | owner.addEventListener  | "beforeunload", warn | earlier return: !taskTarget?.restored &#124;&#124; taskAccessReady |
| 1793:27 InboxRoute | Button frontendText(locale, "TASKS_WRITE_RECORD_DISCARD") | onClick=() =&gt; { if (memberId && discardBlockedTaskWrite(memberId)) setTaskRecordBlocked(false); } | {"kind":"logical","expression":"taskRecordBlocked","operator":"&&"} |
| 1796:27 InboxRoute | Button frontendText(locale, "NAV_TASKS") | onClick=() =&gt; writeWorkspaceHistory("push", "/tasks") | {"kind":"logical","expression":"taskCreatePending && taskAccessReady","operator":"&&"} |
| 1797:12 InboxRoute | PlanningWriteRecovery  | onDenied=clearDenied; onReadFailure=clearReadFailure |  |
| 1797:198 InboxRoute | InboxPage  | onRetry=() =&gt; setRetryVersion(value =&gt; value + 1); onCreateLock=locked =&gt; { captureLockedRef.current = locked; setCaptureLocked(locked); }; onCreate… |  |
| 1831:73 InboxRoute | TaskEditor  | onClose=() =&gt; setTaskTarget(null); onChanged=() =&gt; setRetryVersion(value =&gt; value + 1); onDenied=error =&gt; { if (clearDenied(error)) setTaskTarget… | {"kind":"logical","expression":"taskTarget && taskAccessReady","operator":"&&"}; spread: (taskTarget.restored ? { restored: taskTarget.restored } : {}) |
| 1945:12 GoalsRoute | PlanningWriteRecovery  | onDenied=clearDeniedGoals |  |
| 1945:160 GoalsRoute | GoalsPage  | onManageTasks=(goal) =&gt; { if (pendingRef.current &#124;&#124; createLockedRef.current &#124;&#124; writeRecovery.locked &#124;&#124; relationGoalRef.curre… |  |
| 1958:22 GoalsRoute | GoalTasksEditor  | onDenied=clearDeniedGoals; onReadFailure=relationReadFailed; onClose=() =&gt; void closeRelations(); onBeginWrite=writeRecovery.begin; onFinishWrite=writeRec… | {"kind":"logical","expression":"relationGoal","operator":"&&"} |
| 2112:12 ProjectsRoute | PlanningWriteRecovery  | onDenied=clearDeniedProjects |  |
| 2112:166 ProjectsRoute | ProjectsPage  | onManageRelations=openRelations; onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1); onRetrySummary=(project) =&gt; void retrySummary(project); onCrea… |  |
| 2114:40 ProjectsRoute | ProjectRelationsEditor  | onSummary=updateRelationSummary; onDenied=clearDeniedProjects; onClose=closeRelations; onBeginWrite=writeRecovery.begin; onFinishWrite=writeRecovery.finish | {"kind":"logical","expression":"relationProject","operator":"&&"} |
| 2238:12 ProjectTimelineRoute | PlanningWriteRecovery  | onDenied=clearDenied |  |
| 2238:165 ProjectTimelineRoute | ProjectTimelinePage  | onRetry=() =&gt; setRetryVersion(value =&gt; value + 1); onBack=() =&gt; writeWorkspaceHistory("push", "/projects"); onCreate=async input =&gt; { if (pending… |  |
| 2346:12 CalendarRoute | PlanningWriteRecovery  | onDenied=clearDenied; onReadFailure=clearReadFailure |  |
| 2346:198 CalendarRoute | CalendarPage  | onRangeChange=changeRange; onPageChange=(next) =&gt; void load(next); onPageSizeChange=(size) =&gt; setPageSize(size); onLoadMore=() =&gt; { if (state.kind =… |  |
| 2388:51 TodayRoute | TodayPage  | onOpen=setTarget; onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1) |  |
| 2388:184 TodayRoute | TodayTargetDetail  | onClose=() =&gt; setTarget(null); onDenied=clearDenied | {"kind":"logical","expression":"target","operator":"&&"} |
| 2413:5 FocusRoute | owner.addEventListener  | "beforeunload", warn |  |
| 2564:5 FocusRoute | p frontendText(locale, transitionRecovery.kind === "blocked" ? "FOCUS_STORAGE_BLOCKED" : "FOCUS_TRANSITION_UNCERTAIN") |  | {"kind":"branch","expression":"transitionRecovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"} |
| 2565:5 FocusRoute | Button frontendText(locale, "FOCUS_RETRY") | onClick=() =&gt; setRetryVersion(value =&gt; value + 1) | disabled=pending; {"kind":"branch","expression":"transitionRecovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"} |
| 2566:81 FocusRoute | Button frontendText(locale, "FOCUS_RETRY_TRANSITION") | onClick=() =&gt; void mutate(epoch =&gt; sendTransition(epoch, transitionRecovery.intent, true)) | disabled=pending; {"kind":"branch","expression":"transitionRecovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"}; {"kind":"logical","expr… |
| 2570:5 FocusRoute | p frontendText(locale, recovery.kind === "blocked" ? "FOCUS_STORAGE_BLOCKED" : "FOCUS_START_UNCERTAIN") |  | {"kind":"branch","expression":"recovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"}; earlier return: transitionRecovery.kind !== "empty"… |
| 2571:5 FocusRoute | Button frontendText(locale, "FOCUS_RETRY") | onClick=() =&gt; setRetryVersion(value =&gt; value + 1) | disabled=pending; {"kind":"branch","expression":"recovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"}; earlier return: transitionRecover… |
| 2572:61 FocusRoute | Button frontendText(locale, "FOCUS_RETRY_START") | onClick=() =&gt; void mutate(epoch =&gt; sendStart(epoch, recovery.intent, recovery.intent), true) | disabled=pending; {"kind":"branch","expression":"recovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"}; {"kind":"logical","expression":"r… |
| 2574:10 FocusRoute | FocusPage  | onDenied=clearDenied; onRetry=() =&gt; setRetryVersion(value =&gt; value + 1); onStart=input =&gt; void mutate(epoch =&gt; sendStart(epoch, input)); onTransi… | earlier return: transitionRecovery.kind !== "empty" && state.kind === "ready"; earlier return: recovery.kind !== "empty" && state.kind === "ready" |
| 2616:51 WorkbenchReviewRoute | WorkbenchReviewPage  | onOpen=setTarget; onPeriodChange=changePeriod; onRetry=() =&gt; { setState({ kind: "loading" }); setRetryVersion((value) =&gt; value + 1); }; onDiscardPeriod… |  |
| 2616:366 WorkbenchReviewRoute | SnapshotTargetDetail  | onClose=() =&gt; setTarget(null); onDenied=clearDenied | {"kind":"logical","expression":"target","operator":"&&"} |
| 2741:5 NotificationsRoute | window.addEventListener  | "beforeunload", warn |  |
| 2799:10 NotificationsRoute | NotificationsPage  | onRetry=() =&gt; { invalidateSnapshot({ kind: "loading" }); setRetryVersion((value) =&gt; value + 1); }; onFilterChange=(next: NotificationFilters) =&gt; nav… |  |
| 2892:10 MessagesRoute | MessagesPage  | onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1); onNext=(cursor) =&gt; navigate({ page: query.page + 1, limit: query.limit, cursor }); onPrevious=(… |  |
| 2992:10 MemberDiscussionThreadRoute | ThreadPage  | onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1); onRefresh=() =&gt; setRetryVersion((value) =&gt; value + 1); onNext=(cursor) =&gt; navigate({ page… |  |
| 3071:5 BoardsRoute | owner.addEventListener  | "beforeunload", warn |  |
| 3223:10 BoardsRoute | BoardsPage  | onDiscardRecord=() =&gt; { if (!memberId &#124;&#124; !discardBlockedBoardMove(memberId)) { setActionError(frontendText(locale, "BOARDS_MOVE_RECORD_STUCK"));… |  |
| 3400:94 ReviewQueueRoute | ReviewQueueSession  |  | spread: props |
| 3428:5 ReviewQueueSession | owner.addEventListener  | "beforeunload", warn |  |
| 3552:10 ReviewQueueSession | ReviewQueuePage  | onOpenDetail=(id) =&gt; writeWorkspaceHistory("push", &#96;/admin/submissions/${encodeURIComponent(id)}&#96;); onDiscardDecisionRecord=discardRecord; onRetry… |  |
| 3593:5 AdminDuplicateRoute | owner.addEventListener  | "beforeunload", warn |  |
| 3701:10 AdminDuplicateRoute | DuplicateQueuePage  | onLoadRetry=retryRead; onDiscardDecisionRecord=discardRecord; onDecision=recordBlocked ? undefined : (id, decision) =&gt; void decide(id, decision); onPageCh… |  |
| 3741:5 AdminMembersRoute | owner.addEventListener  | "beforeunload", warn |  |
| 3945:10 AdminMembersRoute | MembersPage  | onLoadRetry=retryRead; onDiscardStatusRecord=discardRecord; onPageChange=(next) =&gt; { const controller = controllerRef.current; if (controller && state.kin… |  |
| 3971:5 AdminSpacesRoute | owner.addEventListener  | "beforeunload", warn |  |
| 4079:10 AdminSpacesRoute | SpacesPage  | onLoadRetry=() =&gt; void read(); onLoadMore=() =&gt; void read("spaces"); onLoadCollections=id =&gt; void read("collections", id); onDiscardRecord=discardRe… |  |
| 4147:10 AdminAuditRoute | AuditPage  | onRetry=retry; onActionChange=changeFilter; onPageChange=(next) =&gt; load(next); onPageSizeChange=(size) =&gt; setPageSize(size); onLoadMore=() =&gt; { if (… |  |
| 4190:7 AdminAssetsRoute | owner.addEventListener  | "beforeunload", warn | {"kind":"branch","expression":"locked && !leaveGuardRef.current","branch":"true"} |
| 4325:10 AdminAssetsRoute | AssetQueuePage  | onLoadRetry=retryRead; onDiscardRecord=discardRecord; onRetry=recordBlocked ? undefined : (id) =&gt; void retry(id); onPreview=(id) =&gt; void showPreview(id… |  |

## frontend/components/agent/agent-feedback.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 52:7 AgentFeedback | Button frontendText(locale, "AGENT_FEEDBACK_USEFUL") | onClick=() =&gt; send("useful"); type="button" | disabled=recordBlocked &#124;&#124; state !== "idle" |
| 53:7 AgentFeedback | Button frontendText(locale, "AGENT_FEEDBACK_NOT_USEFUL") | onClick=() =&gt; send("not_useful"); type="button" | disabled=recordBlocked &#124;&#124; state !== "idle" |
| 54:7 AgentFeedback | Button frontendText(locale, "AGENT_FEEDBACK_CITATION_ERROR") | onClick=() =&gt; send("citation_error"); type="button" | disabled=recordBlocked &#124;&#124; state !== "idle" &#124;&#124; citationIds.length === 0 |
| 56:16 AgentFeedback | p notice |  | {"kind":"logical","expression":"notice","operator":"&&"} |
| 57:29 AgentFeedback | p frontendText(locale, "AGENT_FEEDBACK_SENDING") |  | {"kind":"logical","expression":"state === \"pending\"","operator":"&&"} |
| 58:27 AgentFeedback | p frontendText(locale, "AGENT_FEEDBACK_SAVED") |  | {"kind":"logical","expression":"state === \"saved\"","operator":"&&"} |
| 59:29 AgentFeedback | div  |  | {"kind":"logical","expression":"state === \"unknown\"","operator":"&&"} |
| 59:102 AgentFeedback | Button frontendText(locale, "AGENT_FEEDBACK_RETRY") | onClick=() =&gt; send(); type="button" | {"kind":"logical","expression":"state === \"unknown\"","operator":"&&"} |

## frontend/components/agent/agent-history-list.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 28:23 AgentHistoryList | Button frontendText(locale, "AGENT_LIST_TITLE") | onClick=() =&gt; setOpened(true); type="button" | {"kind":"branch","expression":"!opened","branch":"true"} |
| 33:30 AgentHistoryList | p frontendText(locale, "AGENT_LIST_LOADING") |  | {"kind":"logical","expression":"status === \"loading\"","operator":"&&"}; earlier return: !opened |
| 34:28 AgentHistoryList | div  |  | {"kind":"logical","expression":"status === \"error\"","operator":"&&"}; earlier return: !opened |
| 34:95 AgentHistoryList | Button frontendText(locale, "AGENT_LIST_RETRY") | onClick=() =&gt; navigate(cursors); type="button" | {"kind":"logical","expression":"status === \"error\"","operator":"&&"}; earlier return: !opened |
| 35:181 AgentHistoryList | a item.createdAt / · / item.id | href=&#96;/agent?conversationId=${encodeURIComponent(item.id)}&#96; | {"kind":"logical","expression":"status === \"ready\" && page","operator":"&&"}; {"kind":"repeat","expression":"page.items"}; earlier return: !opened |
| 38:7 AgentHistoryList | Button frontendText(locale, "AGENT_LIST_PREVIOUS") | onClick=() =&gt; navigate(cursors.slice(0, -1)); type="button" | disabled=status === "loading" &#124;&#124; cursors.length &lt;= 1; earlier return: !opened |
| 39:7 AgentHistoryList | Button frontendText(locale, "AGENT_LIST_NEXT") | onClick=() =&gt; { if (page?.nextCursor) navigate([...cursors, page.nextCursor]); }; type="button" | disabled=status !== "ready" &#124;&#124; !page?.nextCursor; earlier return: !opened |
| 40:7 AgentHistoryList | Button frontendText(locale, "AGENT_LIST_REFRESH") | onClick=() =&gt; navigate([undefined]); type="button" | disabled=status === "loading"; earlier return: !opened |

## frontend/components/agents/agent-disclosure.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 26:5 AgentDisclosure | motion.div  |  | aria-hidden=!open; spread: props |

## frontend/components/agents/agent-progress.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 67:5 AgentProgress | span  |  |  |

## frontend/components/agents/citations.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 81:5 Citation | a index | href=&#96;#${citationTargetId(idPrefix, citationId)}&#96; |  |
| 201:5 CitationRow | a content | href=citation.url | {"kind":"branch","expression":"citation.url","branch":"true"} |
| 285:7 Citations | button  | onClick=() =&gt; setOpen(!currentOpen); type="button" | aria-expanded=currentOpen |

## frontend/components/agents/code-block.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 149:11 CodeBlock | motion.button  | onClick=handleCopy; type="button" | {"kind":"container","tag":"div","attributes":{"aria-busy":"streaming"}}; {"kind":"branch","expression":"copyable &#124;&#124; onCopy","branch":"true"} |
| 170:7 CodeBlock | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"streaming"}} |

## frontend/components/assets/asset-availability-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 37:32 AssetAvailabilityPanel | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"state.kind === \"error\"","operator… |
| 37:67 AssetAvailabilityPanel | button frontendText(locale, "SUBMIT_ASSET_RETRY_READ") | onClick=() =&gt; { void read(); }; type="button" | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"state.kind === \"error\"","operator… |

## frontend/components/assets/asset-dropzone.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 39:10 AssetDropzone | section  | onPaste=(event) =&gt; { if (disabled &#124;&#124; busy) return; const files = clipboardImageFiles(Array.from(event.clipboardData.items)); if (files.length) {… | aria-disabled=disabled ? "true" : undefined; aria-busy=busy |
| 43:36 AssetDropzone | p frontendText(locale, validationKey) |  | {"kind":"container","tag":"section","attributes":{"aria-disabled":"disabled ? \"true\" : undefined","aria-busy":"busy"}}; {"kind":"logical","expression":"val… |
| 44:5 AssetDropzone | input  | onChange=(event) =&gt; { acceptFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }; type="file" | disabled=disabled &#124;&#124; busy; {"kind":"container","tag":"section","attributes":{"aria-disabled":"disabled ? \"true\" : undefined","aria-busy":"busy"}}… |
| 45:5 AssetDropzone | button frontendText(locale, "SUBMIT_ASSET_SELECT") | onClick=() =&gt; inputRef.current?.click(); type="button" | disabled=disabled &#124;&#124; busy; {"kind":"container","tag":"section","attributes":{"aria-disabled":"disabled ? \"true\" : undefined","aria-busy":"busy"}} |

## frontend/components/assets/asset-upload-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 19:5 AssetUploadPanel | AssetDropzone  | onFiles=async files =&gt; { if (files[0]) await workflow.current?.select(files[0]); } | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}} |
| 20:5 AssetUploadPanel | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}} |
| 28:72 AssetUploadPanel | a text("SUBMIT_CHECK_SUBMISSIONS") | href="/my-submissions" | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expression":"state.kind === \"submitted\"","operator":"&&"} |
| 30:21 AssetUploadPanel | p text(errors[state.error]) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expression":"state.error","operator":"&&"} |
| 32:27 AssetUploadPanel | button text("ASSET_FLOW_STOP") | onClick=() =&gt; workflow.current?.stop(); type="button" | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expression":"state.uploading","operator":"&&"} |
| 33:24 AssetUploadPanel | button text("ASSET_FLOW_REFRESH") | onClick=() =&gt; { void workflow.current?.refresh(); }; type="button" | disabled=state.busy &#124;&#124; state.error === "storage"; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expr… |
| 35:9 AssetUploadPanel | button text("ASSET_FLOW_PARSE") | onClick=() =&gt; { void workflow.current?.parse(); }; type="button" | disabled=state.busy &#124;&#124; state.error === "storage"; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expr… |
| 36:9 AssetUploadPanel | button text("ASSET_FLOW_CANCEL") | onClick=() =&gt; { void workflow.current?.cancel(); }; type="button" | disabled=state.busy &#124;&#124; state.error === "storage"; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expr… |
| 38:37 AssetUploadPanel | button text("ASSET_FLOW_RELEASE") | onClick=() =&gt; { void workflow.current?.releaseFailed(); }; type="button" | disabled=state.busy &#124;&#124; state.error === "storage"; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expr… |
| 39:31 AssetUploadPanel | button text("ASSET_FLOW_SUBMIT") | onClick=() =&gt; { void workflow.current?.submit(title); }; type="button" | disabled=state.busy &#124;&#124; state.error === "storage" &#124;&#124; (!state.intent?.review && !title.trim()); {"kind":"container","tag":"div","attributes… |

## frontend/components/calendar-cancel-confirmation.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 35:13 useCalendarCancelConfirmation | ConfirmAction  | onCancel=dismiss; onConfirm=confirm | open=valid |

## frontend/components/calendar-create-form.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 50:5 CalendarCreateForm | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 130:23 CalendarCreateForm | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"recor… |
| 130:161 CalendarCreateForm | Button frontendText(locale, "CALENDAR_DRAFT_RECORD_DISCARD") | onClick=discardRecord; type="button" | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"recor… |
| 131:22 CalendarCreateForm | p recordNotice |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"recor… |
| 133:7 CalendarCreateForm | Input  | onChange=e =&gt; draft.edit("title", e.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}} |
| 134:7 CalendarCreateForm | Input  | onChange=e =&gt; draft.edit("startsAt", e.currentTarget.value); type="datetime-local" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}} |
| 135:7 CalendarCreateForm | Input  | onChange=e =&gt; draft.edit("endsAt", e.currentTarget.value); type="datetime-local" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}} |
| 137:38 CalendarCreateForm | p frontendText(locale, "CALENDAR_CREATE_STORAGE_BLOCKED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 137:115 CalendarCreateForm | Button frontendText(locale, "CALENDAR_CREATE_STORAGE_RETRY") | onClick=reloadStored; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 138:33 CalendarCreateForm | p frontendText(locale, "CALENDAR_CREATE_UNKNOWN") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 138:139 CalendarCreateForm | Button frontendText(locale, "CALENDAR_CREATE_RETRY") | onClick=() =&gt; void submit(); type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 139:37 CalendarCreateForm | p frontendText(locale, "CALENDAR_CREATE_READ_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 139:147 CalendarCreateForm | Button frontendText(locale, "CALENDAR_CREATE_READ_RETRY") | onClick=() =&gt; { if (phaseRef.current === "read-failed") void readback(); }; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 140:9 CalendarCreateForm | Button frontendText(locale, "CALENDAR_CREATE") | onClick=() =&gt; void submit(); type="button" | disabled=locked &#124;&#124; !title.trim() &#124;&#124; !startsAt &#124;&#124; !endsAt &#124;&#124; !onCreate; {"kind":"container","tag":"div","attributes":{… |
| 141:15 CalendarCreateForm | p frontendText(locale, "CALENDAR_ACTION_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"error… |

## frontend/components/calendar-range-filter.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 14:89 CalendarRangeFilter | Input  | onChange=event =&gt; setFrom(event.currentTarget.value); type="datetime-local" | disabled=pending |
| 15:87 CalendarRangeFilter | Input  | onChange=event =&gt; setTo(event.currentTarget.value); type="datetime-local" | disabled=pending |
| 16:7 CalendarRangeFilter | Button frontendText(locale, "CALENDAR_RANGE_APPLY") | onClick=() =&gt; { if (valid) onChange({ from: fromInstant!, to: toInstant! }); }; type="button" | disabled=pending &#124;&#124; !valid |
| 18:16 CalendarRangeFilter | p frontendText(locale, "CALENDAR_RANGE_INVALID") |  | {"kind":"logical","expression":"!valid","operator":"&&"} |

## frontend/components/data-pagination.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 39:10 DataPagination | div  |  | spread: props |
| 42:144 DataPagination | Select  | onChange=(event) =&gt; onPageSizeChange(Number(event.currentTarget.value) as SupportedPageSize) | disabled=pending |
| 43:70 DataPagination | Pagination  | onPageChange=onPageChange | disabled=pending |
| 45:9 DataPagination | button  | onClick=() =&gt; onPageChange(previousPage); type="button" | disabled=pending &#124;&#124; page &lt;= 1 |
| 47:9 DataPagination | button  | onClick=() =&gt; onPageChange(page + 1); type="button" | disabled=pending &#124;&#124; totalPages === 0 &#124;&#124; page &gt;= lastAllowedPage |

## frontend/components/data-table.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 90:5 DataTable | Table  | onEndReached=feed | spread: (fills ? { fill: true } : { height }) |
| 102:67 DataTable | DataPagination  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange | {"kind":"logical","expression":"desktop && pagination && onPageChange && onPageSizeChange","operator":"&&"}; spread: pagination |
| 103:19 DataTable | p statusText |  | {"kind":"branch","expression":"statusText","branch":"true"} |

## frontend/components/focus-action-confirmation.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 40:13 useFocusActionConfirmation | ConfirmAction  | onCancel=dismiss; onConfirm=confirm | open=valid |

## frontend/components/focus-task-picker.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 50:5 FocusTaskPicker | form  | onSubmit=event =&gt; {event.preventDefault(); setState({kind: "loading"}); setQuery({ q: draft.trim() });} |  |
| 51:7 FocusTaskPicker | Input  | onChange=event =&gt; setDraft(event.currentTarget.value) | {"kind":"container","tag":"form","attributes":{}} |
| 52:7 FocusTaskPicker | Button frontendText(locale, "FOCUS_SEARCH_TASKS") | type="submit" | {"kind":"container","tag":"form","attributes":{}} |
| 54:34 FocusTaskPicker | p frontendText(locale, "FOCUS_TASKS_LOADING") |  | {"kind":"logical","expression":"state.kind === \"loading\"","operator":"&&"} |
| 55:32 FocusTaskPicker | div  |  | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"} |
| 55:104 FocusTaskPicker | Button frontendText(locale, "FOCUS_TASKS_RETRY") | onClick=() =&gt; setRetry(value =&gt; value + 1) | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"} |
| 56:32 FocusTaskPicker | DataTable  | onPageChange=changePage; onPageSizeChange=changePageSize; onLoadMore=loadMore | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"} |
| 69:135 FocusTaskPicker | Button task.title | onClick=() =&gt; onSelect(task) | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"} |
| 71:5 FocusTaskPicker | Button frontendText(locale, "FOCUS_PICKER_CLOSE") | onClick=onClose |  |

## frontend/components/goal-tasks-editor.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 137:10 GoalTasksEditor | section  |  |  |
| 138:133 GoalTasksEditor | Button frontendText(locale, "RELATIONS_CLOSE") | onClick=close; type="button" | disabled=writing &#124;&#124; !!decision |
| 139:16 GoalTasksEditor | p notice |  | {"kind":"logical","expression":"notice","operator":"&&"} |
| 140:14 GoalTasksEditor | p frontendText(locale, "RELATIONS_LOADING") |  | {"kind":"logical","expression":"busy","operator":"&&"} |
| 141:16 GoalTasksEditor | div  |  | {"kind":"logical","expression":"failed","operator":"&&"} |
| 141:83 GoalTasksEditor | Button frontendText(locale, "RELATIONS_RETRY") | onClick=() =&gt; { if (!busyRef.current && !decisionRef.current) void loadPages(loadedPages(), "replace"); }; type="button" | disabled=locked; {"kind":"logical","expression":"failed","operator":"&&"} |
| 143:7 GoalTasksEditor | DataTable  | onPageChange=changePage; onPageSizeChange=changePageSize; onLoadMore=moreFailed ? undefined : loadMore | {"kind":"logical","expression":"data","operator":"&&"} |
| 159:132 GoalTasksEditor | Button frontendText(locale, item.linked ? "RELATIONS_UNLINK" : "RELATIONS_LINK") | onClick=event =&gt; requestMutation(item, event?.currentTarget); type="button" | disabled=locked &#124;&#124; writeBlocked &#124;&#124; !!pendingWrite.current; {"kind":"logical","expression":"data","operator":"&&"} |
| 162:22 GoalTasksEditor | div  |  | {"kind":"logical","expression":"data","operator":"&&"}; {"kind":"logical","expression":"moreFailed","operator":"&&"} |
| 162:156 GoalTasksEditor | Button frontendText(locale, "RELATIONS_RETRY") | onClick=loadMore; type="button" | disabled=writing &#124;&#124; !!pendingWrite.current; {"kind":"logical","expression":"data","operator":"&&"}; {"kind":"logical","expression":"moreFailed","op… |
| 164:5 GoalTasksEditor | ConfirmAction  | onCancel=cancel; onConfirm=confirm | open=!!decision |

## frontend/components/graph/graph-canvas.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 203:7 GraphCanvasView | handle.on  | "layoutstop", clearWhenStopped | earlier return: !handle |
| 247:9 GraphCanvasView | localInstance.on  | "tap", tapHandler | earlier return: !active &#124;&#124; !canInitialize() &#124;&#124; !containerRef.current; earlier return: typeof candidate !== "function"; earlier return: !c… |
| 270:7 GraphCanvasView | media?.addEventListener  | "change", handleVisibilityChange | {"kind":"branch","expression":"container","branch":"true"} |
| 271:7 GraphCanvasView | media?.addListener  | handleVisibilityChange | {"kind":"branch","expression":"container","branch":"true"} |
| 298:7 GraphCanvasView | ul  | onKeyDown=(event) =&gt; { const target = event.target; if (!(target instanceof HTMLButtonElement)) return; const index = snapshot.nodes.findIndex((node) =&gt… |  |
| 330:15 GraphCanvasView | button  | onClick=() =&gt; onSelect(node.id); type="button" | {"kind":"repeat","expression":"snapshot.nodes"} |

## frontend/components/graph/graph-evidence-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 71:42 GraphEvidencePanel | aside frontendText(locale, "GRAPH_FORBIDDEN") |  | {"kind":"branch","expression":"state.kind === \"forbidden\"","branch":"true"}; earlier return: state.kind === "idle"; earlier return: state.kind === "loading" |
| 72:140 GraphEvidencePanel | p frontendText(locale, "GRAPH_EVIDENCE_ERROR") |  | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "idle"; earlier return: state.kind === "loading"; e… |
| 72:206 GraphEvidencePanel | Button frontendText(locale, "COMMON_RETRY") | onClick=read | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "idle"; earlier return: state.kind === "loading"; e… |
| 74:277 GraphEvidencePanel | a citation.title | href=&#96;/knowledge/${encodeURIComponent(citation.knowledgeItemId)}#${encodeURIComponent(citation.citationId)}&#96; | {"kind":"repeat","expression":"state.citations"}; earlier return: state.kind === "idle"; earlier return: state.kind === "loading"; earlier return: state.kind… |

## frontend/components/graph/graph-inspector.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 33:5 GraphInspector | aside  |  | earlier return: !model |
| 40:23 GraphInspector | Button copy.close | onClick=onClose; type="button" | {"kind":"logical","expression":"onClose","operator":"&&"}; earlier return: !model |
| 50:21 GraphInspector | a model.href | href=model.href | {"kind":"branch","expression":"isGraphInspectorValueAvailable(model.href)","branch":"true"}; earlier return: !model |
| 68:15 GraphInspector | Button actionStatus === "running" ? copy.running : actionStatus === "success" ? copy.success : actionStatus === "error" ? copy.retry : frontendText(locale, graphAct… | onClick=onAction; type="button" | disabled=actionsDisabled &#124;&#124; actionStatus === "running" &#124;&#124; actionStatus === "success"; {"kind":"logical","expression":"onAction && node &&… |
| 83:44 GraphInspector | p copy.error |  | {"kind":"logical","expression":"onAction && node && graphActionForNode(node)","operator":"&&"}; {"kind":"logical","expression":"actionStatus === \"error\"","… |

## frontend/components/history-navigation-notice.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 11:10 HistoryNavigationNotice | section  |  | earlier return: !fault |
| 13:5 HistoryNavigationNotice | Button frontendText(locale, "HISTORY_RETRY") | onClick=async () =&gt; { setRetrying(true); try { await retryWorkspaceHistory(); } finally { setRetrying(false); } } | disabled=retrying; earlier return: !fault |

## frontend/components/inbox-action-confirmation.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 39:13 useInboxActionConfirmation | ConfirmAction  | onCancel=cancel; onConfirm=confirm | open=valid |

## frontend/components/inbox-create-form.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 49:5 InboxCreateForm | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 129:23 InboxCreateForm | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"recor… |
| 129:155 InboxCreateForm | Button frontendText(locale, "INBOX_DRAFT_RECORD_DISCARD") | onClick=discardRecord; type="button" | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"recor… |
| 130:22 InboxCreateForm | p recordNotice |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"recor… |
| 131:43 InboxCreateForm | select  | onChange=event =&gt; draft.edit("kind", event.currentTarget.value as "text" &#124; "link") | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}} |
| 131:277 InboxCreateForm | option frontendText(locale, "INBOX_KIND_TEXT") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"container","tag":"select","a… |
| 131:348 InboxCreateForm | option frontendText(locale, "INBOX_KIND_LINK") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"container","tag":"select","a… |
| 131:448 InboxCreateForm | Input  | onChange=event =&gt; draft.edit("sourceUrl", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","e… |
| 132:5 InboxCreateForm | Textarea  | onChange=event =&gt; draft.edit("content", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}} |
| 133:38 InboxCreateForm | p frontendText(locale, "INBOX_CREATE_STORAGE_BLOCKED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 133:112 InboxCreateForm | Button frontendText(locale, "INBOX_CREATE_STORAGE_RETRY") | onClick=reloadStored; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 134:33 InboxCreateForm | p frontendText(locale, "INBOX_CREATE_UNKNOWN") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 134:136 InboxCreateForm | Button frontendText(locale, "INBOX_CREATE_RETRY") | onClick=() =&gt; void submit(); type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 135:37 InboxCreateForm | p frontendText(locale, "INBOX_CREATE_READ_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 135:144 InboxCreateForm | Button frontendText(locale, "INBOX_CREATE_READ_RETRY") | onClick=() =&gt; { if (phaseRef.current === "read-failed") void readback(); }; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 136:9 InboxCreateForm | Button frontendText(locale, "INBOX_CAPTURE") | onClick=() =&gt; void submit(); type="button" | disabled=locked &#124;&#124; !content.trim() &#124;&#124; !onCreate; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&… |
| 137:15 InboxCreateForm | p frontendText(locale, "INBOX_ACTION_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"error… |

## frontend/components/knowledge/knowledge-share-button.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 31:62 KnowledgeShareButton | button frontendText(locale, shareState === "pending" ? "KNOWLEDGE_SHARE_PENDING" : "KNOWLEDGE_SHARE_ACTION") | onClick=() =&gt; void share(); type="button" | disabled=shareState === "pending"; aria-busy=shareState === "pending" |
| 31:387 KnowledgeShareButton | span frontendText(locale, "KNOWLEDGE_SHARE_DONE") |  | {"kind":"logical","expression":"shareState === \"shared\"","operator":"&&"} |
| 31:536 KnowledgeShareButton | span frontendText(locale, "KNOWLEDGE_SHARE_UNAVAILABLE") |  | {"kind":"logical","expression":"shareState === \"unavailable\"","operator":"&&"} |

## frontend/components/motion/animated-toast-stack.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 301:11 AnimatedToastStack | ToastItem  | onDismiss=onDismiss | {"kind":"repeat","expression":"visibleToasts"} |
| 352:5 ToastItem | motion.li  | onDragEnd=(_, info) =&gt; { if (!canDismiss &#124;&#124; !onDismiss) return; if (Math.abs(info.offset.x) &gt; 72 &#124;&#124; Math.abs(info.velocity.x) &gt; … |  |
| 480:17 ToastItem | button toast.action.label | onClick=() =&gt; toast.action?.onClick(toast); type="button" | {"kind":"branch","expression":"renderToast","branch":"false"}; {"kind":"branch","expression":"toast.action","branch":"true"} |
| 494:15 ToastItem | button  | onClick=() =&gt; onDismiss?.(toast.id); type="button" | {"kind":"branch","expression":"renderToast","branch":"false"}; {"kind":"branch","expression":"canDismiss","branch":"true"} |

## frontend/components/motion/button/base.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 105:7 Button | motion.button children | onPointerDown=handlePointerDown; type="button" | spread: rest |
| 127:17 Button | motion.span  | onAnimationComplete=() =&gt; setRipples((prev) =&gt; prev.filter((x) =&gt; x.id !== r.id)) | {"kind":"branch","expression":"ripple && !reduce","branch":"true"}; {"kind":"repeat","expression":"ripples"} |
| 172:7 ButtonLink | motion.a children |  | spread: rest |

## frontend/components/motion/center-morph-modal.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 242:5 CenterMorphModalContent | window.addEventListener  | "keydown", onKeyDown | earlier return: !context.open |
| 259:15 CenterMorphModalContent | motion.button  | onClick=() =&gt; context.setOpen(false); type="button" | disabled=!dismissible; {"kind":"branch","expression":"context.open","branch":"true"}; earlier return: !mounted; spread: gate |
| 289:19 CenterMorphModalContent | motion.div children |  | {"kind":"branch","expression":"context.open","branch":"true"}; earlier return: !mounted; spread: gate |
| 331:23 CenterMorphModalContent | motion.button  | onClick=() =&gt; context.setOpen(false); type="button" | {"kind":"branch","expression":"context.open","branch":"true"}; {"kind":"branch","expression":"showCloseButton","branch":"true"}; earlier return: !mounted |

## frontend/components/motion/checkbox.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 59:7 Checkbox | motion.button  | onClick=() =&gt; !disabled && onCheckedChange(!checked); type="button" | disabled=disabled |

## frontend/components/motion/drawer.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 41:5 Drawer | window.addEventListener  | "keydown", onKey | earlier return: !open |
| 62:13 Drawer | motion.button  | onClick=() =&gt; dismissable && onOpenChange(false); type="button" | {"kind":"branch","expression":"open","branch":"true"}; spread: gate |
| 83:13 Drawer | motion.aside children |  | {"kind":"branch","expression":"open","branch":"true"}; spread: gate |

## frontend/components/motion/file-tree.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 319:5 FileTree | SharedLayoutBg  |  |  |
| 351:15 FileTree | button  | onFocus=() =&gt; setFocusedId(row.item.value); onKeyDown=(event) =&gt; handleKeyDown(event, row); onClick=() =&gt; { if (row.item.disabled) return; selectIte… | aria-expanded=isFolder ? isOpen : undefined; aria-disabled=row.item.disabled &#124;&#124; undefined; {"kind":"repeat","expression":"rows"} |

## frontend/components/motion/input.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 153:9 Input | input  | onChange=(e) =&gt; handleChange(e.target.value); onFocus=(event) =&gt; { setFocused(true); onFocus?.(event); }; onBlur=(event) =&gt; { setFocused(false); onB… | disabled=disabled; spread: rest |
| 216:13 Input | motion.p errorMessage |  | {"kind":"branch","expression":"errorMessage","branch":"true"} |

## frontend/components/motion/loader.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 65:5 Loader | span  |  |  |
| 239:5 Morph | motion.svg  |  |  |
| 354:5 Metaballs | svg  |  |  |

## frontend/components/motion/not-found/shared.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 55:7 NotFoundActions | motion.a homeLabel | href=homeHref |  |
| 65:9 NotFoundActions | motion.a browseLabel | href=browseHref | {"kind":"branch","expression":"browseHref","branch":"true"} |

## frontend/components/motion/select.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 177:5 Select | window.addEventListener  | "keydown", onKey | earlier return: !open |
| 178:5 Select | window.addEventListener  | "pointerdown", onPointer | earlier return: !open |
| 247:5 SelectTrigger | motion.button children | onClick=() =&gt; ctx.setOpen(!ctx.open); type="button" | disabled=ctx.disabled; aria-expanded=ctx.open |
| 380:5 SelectContent | motion.div  |  | aria-hidden=!open |
| 442:7 SelectItem | button children | onClick=() =&gt; ctx.select(value); type="button" | disabled=disabled |

## frontend/components/motion/shared-layout-bg.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 130:7 SharedLayoutBg | motion.ul renderedChildren | onMouseLeave=handleMouseLeave | {"kind":"branch","expression":"as === \"ul\"","branch":"true"}; spread: (props as HTMLMotionProps&lt;"ul"&gt;) |
| 140:7 SharedLayoutBg | motion.div renderedChildren | onMouseLeave=handleMouseLeave | {"kind":"branch","expression":"as === \"ul\"","branch":"false"}; spread: (props as HTMLMotionProps&lt;"div"&gt;) |

## frontend/components/motion/switch.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 51:9 Switch | motion.button  | onClick=() =&gt; !disabled && onCheckedChange(!checked); onPointerDown=(e) =&gt; { setIsPressed(true); setIsPointer(e.type.startsWith("pointer")); }; onPoint… | disabled=disabled |

## frontend/components/motion/table/editable-cell.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 13:5 EditableCell | input  | onChange=(e) =&gt; onChange(e.target.value) |  |

## frontend/components/motion/table/index.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 265:7 Table | div  | onScroll=handleScroll |  |
| 292:11 Table | TableHeader  | onToggleAll=toggleAll; onToggleSort=toggleSort; onResizeStart=startResize; onResizeMove=moveResize; onResizeEnd=endResize; onReorderStart=startReorder; onReo… |  |
| 350:21 Table | tr  | onPointerEnter=hasRowMenu ? () =&gt; activateRow(entry.id, index) : undefined; onPointerLeave=hasRowMenu ? deactivateRow : undefined | {"kind":"branch","expression":"sortedRows.length === 0","branch":"false"}; {"kind":"repeat","expression":"(virtualize ? virtualItems.map((vItem) =&gt; ({ ent… |
| 372:29 Table | Checkbox  | onCheckedChange=() =&gt; toggleRow(entry.id) | {"kind":"branch","expression":"sortedRows.length === 0","branch":"false"}; {"kind":"repeat","expression":"(virtualize ? virtualItems.map((vItem) =&gt; ({ ent… |
| 390:29 Table | EditableCell  | onChange=(next) =&gt; onCellEdit?.(entry.id, column.key, next) | {"kind":"branch","expression":"sortedRows.length === 0","branch":"false"}; {"kind":"repeat","expression":"(virtualize ? virtualItems.map((vItem) =&gt; ({ ent… |
| 425:9 Table | RowHandle  | onInsertRow=onInsertRow; onDeleteRow=onDeleteRow; onEnter=() =&gt; activateRow(activeRow.id, activeRow.index); onLeave=deactivateRow | {"kind":"branch","expression":"hasRowMenu && activeRow","branch":"true"} |

## frontend/components/motion/table/row-handle.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 28:5 RowHandle | window.addEventListener  | "scroll", onLeave, true |  |
| 36:5 RowHandle | div  | onPointerEnter=onEnter; onPointerLeave=onLeave | earlier return: !rowEl &#124;&#124; typeof document === "undefined" |

## frontend/components/motion/table/table-header.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 111:5 ColumnHandle | window.addEventListener  | "scroll", onLeave, true |  |
| 120:5 ColumnHandle | div  | onPointerEnter=onEnter; onPointerLeave=onLeave | earlier return: !el &#124;&#124; typeof document === "undefined" |
| 175:9 TableHeader | ColumnHandle  | onInsertColumn=onInsertColumn; onDeleteColumn=onDeleteColumn; onEnter=() =&gt; onColumnActivate?.(activeColumn); onLeave=() =&gt; onColumnDeactivate?.() | {"kind":"branch","expression":"hasColumnMenu && activeColumn && activeIndex &gt;= 0","branch":"true"} |
| 190:15 TableHeader | Checkbox  | onCheckedChange=onToggleAll | {"kind":"branch","expression":"selectable","branch":"true"} |
| 205:13 TableHeader | th  | onPointerEnter=() =&gt; onColumnActivate?.(column.key); onPointerLeave=() =&gt; onColumnDeactivate?.() | {"kind":"repeat","expression":"columns"} |
| 249:19 TableHeader | button  | onPointerDown=(e) =&gt; onReorderStart(column.key, e); onPointerMove=onReorderMove; onPointerUp=onReorderEnd; type="button" | {"kind":"repeat","expression":"columns"}; {"kind":"branch","expression":"reorderable","branch":"true"} |
| 266:19 TableHeader | button  | onClick=() =&gt; onToggleSort(column.key); type="button" | {"kind":"repeat","expression":"columns"}; {"kind":"branch","expression":"column.sortable","branch":"true"} |
| 293:19 TableHeader | input  | onChange=(e) =&gt; onColumnRename(column.key, e.target.value) | {"kind":"repeat","expression":"columns"}; {"kind":"branch","expression":"column.sortable","branch":"false"}; {"kind":"branch","expression":"onColumnRename","… |
| 319:17 TableHeader | button  | onPointerDown=(e) =&gt; onResizeStart(column.key, e); onPointerMove=onResizeMove; onPointerUp=onResizeEnd; type="button" | {"kind":"repeat","expression":"columns"}; {"kind":"branch","expression":"resizable","branch":"true"} |

## frontend/components/motion/table/table-menu.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 43:5 TableMenu | window.addEventListener  | "scroll", close, true | earlier return: !open |
| 44:5 TableMenu | window.addEventListener  | "resize", close | earlier return: !open |
| 45:5 TableMenu | window.addEventListener  | "keydown", onKey | earlier return: !open |
| 69:7 TableMenu | button trigger | onClick=(e) =&gt; { e.stopPropagation(); toggle(); }; type="button" | aria-expanded=open |
| 86:15 TableMenu | div  | onPointerDown=() =&gt; setCoords(null) | {"kind":"branch","expression":"open && typeof document !== \"undefined\"","branch":"true"} |
| 90:15 TableMenu | motion.div  |  | {"kind":"branch","expression":"open && typeof document !== \"undefined\"","branch":"true"} |
| 103:19 TableMenu | button item.icon / item.label | onClick=() =&gt; { setCoords(null); item.onSelect(); }; type="button" | {"kind":"branch","expression":"open && typeof document !== \"undefined\"","branch":"true"}; {"kind":"repeat","expression":"items"} |

## frontend/components/motion/tabs.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 160:5 TabsList | viewport.addEventListener  | "scroll", measure, { passive: true } | earlier return: !root &#124;&#124; !viewport &#124;&#124; !list |
| 226:9 TabsList | button  | onClick=() =&gt; scroll(-1); type="button" | disabled=!edges.left; {"kind":"logical","expression":"edges.overflow","operator":"&&"} |
| 230:7 TabsList | motion.div  | onFocusCapture=(event) =&gt; { if (event.target instanceof HTMLElement && event.target.getAttribute("role") === "tab") reveal(event.target); } |  |
| 242:9 TabsList | div children |  | spread: props |
| 253:9 TabsList | button  | onClick=() =&gt; scroll(1); type="button" | disabled=!edges.right; {"kind":"logical","expression":"edges.overflow","operator":"&&"} |
| 279:7 TabsTrigger | button children | onClick=(event) =&gt; { onClick?.(event); if (!event.defaultPrevented) setValue(value); }; type="button" | {"kind":"branch","expression":"variant === \"underline\"","branch":"true"}; spread: props |
| 326:7 TabsTrigger | button children | onClick=(event) =&gt; { onClick?.(event); if (!event.defaultPrevented) setValue(value); }; type="button" | earlier return: variant === "underline"; spread: props |

## frontend/components/planning-create-form.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 47:5 PlanningCreateForm | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 120:23 PlanningCreateForm | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"recor… |
| 120:161 PlanningCreateForm | Button frontendText(locale, "PLANNING_DRAFT_RECORD_DISCARD") | onClick=discardRecord; type="button" | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"recor… |
| 121:22 PlanningCreateForm | p recordNotice |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"recor… |
| 122:5 PlanningCreateForm | Input  | onChange=(event) =&gt; draft.edit("title", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}} |
| 123:5 PlanningCreateForm | Textarea  | onChange=(event) =&gt; draft.edit("description", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}} |
| 124:38 PlanningCreateForm | p frontendText(locale, "PLANNING_CREATE_STORAGE_BLOCKED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 124:115 PlanningCreateForm | Button frontendText(locale, "PLANNING_CREATE_STORAGE_RETRY") | onClick=reloadStored; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 125:33 PlanningCreateForm | p frontendText(locale, "PLANNING_CREATE_UNKNOWN") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 125:139 PlanningCreateForm | Button frontendText(locale, "PLANNING_CREATE_RETRY") | onClick=() =&gt; void submit(); type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 126:37 PlanningCreateForm | p frontendText(locale, "PLANNING_CREATE_READ_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 126:147 PlanningCreateForm | Button frontendText(locale, "PLANNING_CREATE_READ_RETRY") | onClick=() =&gt; { if (phaseRef.current === "read-failed") void readback(); }; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 127:9 PlanningCreateForm | Button frontendText(locale, &#96;${kind}_CREATE&#96;) | onClick=() =&gt; void submit(); type="button" | disabled=locked &#124;&#124; !title.trim() &#124;&#124; !onCreate; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#1… |
| 128:15 PlanningCreateForm | p frontendText(locale, &#96;${kind}_ACTION_FAILED&#96;) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"error… |

## frontend/components/planning-status-confirmation.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 39:13 usePlanningStatusConfirmation | ConfirmAction  | onCancel=cancel; onConfirm=confirm | open=valid |

## frontend/components/planning-write-recovery.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 34:5 usePlanningWriteRecovery | owner.addEventListener  | "beforeunload", warn |  |
| 85:52 PlanningWriteRecovery | p frontendText(locale, "PLANNING_WRITE_REVIEWED") |  | {"kind":"branch","expression":"!recovery.locked","branch":"true"}; {"kind":"branch","expression":"recovery.reviewed","branch":"true"} |
| 86:10 PlanningWriteRecovery | div  |  | earlier return: !recovery.locked |
| 89:5 PlanningWriteRecovery | Button frontendText(locale, "PLANNING_WRITE_RECOVER") | onClick=() =&gt; void recovery.recover(refresh, onDenied, onReadFailure); type="button" | disabled=pending &#124;&#124; recovery.reading; earlier return: !recovery.locked |

## frontend/components/project-relations-editor.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 172:10 ProjectRelationsEditor | section  |  |  |
| 173:141 ProjectRelationsEditor | Button text("RELATIONS_CLOSE") | onClick=close; type="button" | disabled=writing &#124;&#124; !!decision |
| 174:77 ProjectRelationsEditor | Button text(value === "goals" ? "PROJECTS_GOALS" : "PROJECTS_TASKS") | onClick=() =&gt; change(value); type="button" | disabled=locked &#124;&#124; !!pendingWrite.current &#124;&#124; writeBlocked &#124;&#124; value === kind; {"kind":"repeat","expression":"([\"goals\", \"task… |
| 175:16 ProjectRelationsEditor | p notice |  | {"kind":"logical","expression":"notice","operator":"&&"} |
| 176:37 ProjectRelationsEditor | p text("RELATIONS_LOADING") |  | {"kind":"logical","expression":"busy && !data?.items.length","operator":"&&"} |
| 177:16 ProjectRelationsEditor | div  |  | {"kind":"logical","expression":"failed","operator":"&&"} |
| 177:67 ProjectRelationsEditor | Button text("RELATIONS_RETRY") | onClick=retry; type="button" | disabled=locked; {"kind":"logical","expression":"failed","operator":"&&"} |
| 178:14 ProjectRelationsEditor | DataTable  | onPageChange=changePage; onPageSizeChange=changePageSize; onLoadMore=loadMore | {"kind":"logical","expression":"data","operator":"&&"} |
| 194:116 ProjectRelationsEditor | Button text(item.linked ? "RELATIONS_UNLINK" : "RELATIONS_LINK") | onClick=event =&gt; requestMutation(item, event?.currentTarget); type="button" | disabled=locked &#124;&#124; writeBlocked &#124;&#124; !!pendingWrite.current; {"kind":"logical","expression":"data","operator":"&&"} |
| 197:5 ProjectRelationsEditor | ConfirmAction  | onCancel=cancel; onConfirm=confirm | open=!!decision |

## frontend/components/review/review-comments-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 13:18 ReviewCommentsPanel | ReviewCommentsEditor  |  | {"kind":"branch","expression":"owner","branch":"true"}; spread: props |
| 13:56 ReviewCommentsPanel | ReviewCommentsProvider  |  | {"kind":"branch","expression":"owner","branch":"false"}; spread: props |
| 13:116 ReviewCommentsPanel | ReviewCommentsEditor  |  | {"kind":"branch","expression":"owner","branch":"false"}; spread: props |
| 24:7 ReviewCommentsEditor | Textarea  | onChange=event =&gt; owner.edit(event.currentTarget.value) | disabled=locked; {"kind":"logical","expression":"readState === \"ready\"","operator":"&&"} |
| 25:7 ReviewCommentsEditor | Button writeState === "saving" ? frontendText(locale, "ADMIN_REVIEW_ACTION_PENDING") : frontendText(locale, "ADMIN_REVIEW_COMMENT_ADD") | onClick=() =&gt; { void owner.save(); } | disabled=locked &#124;&#124; !body.trim(); {"kind":"logical","expression":"readState === \"ready\"","operator":"&&"} |
| 27:29 ReviewCommentsEditor | div  |  | {"kind":"logical","expression":"owner.recordBlocked","operator":"&&"} |
| 27:197 ReviewCommentsEditor | Button frontendText(locale, "ADMIN_REVIEW_COMMENT_RECORD_DISCARD") | onClick=owner.discardRecord; type="button" | {"kind":"logical","expression":"owner.recordBlocked","operator":"&&"} |
| 28:28 ReviewCommentsEditor | p owner.recordNotice |  | {"kind":"logical","expression":"owner.recordNotice","operator":"&&"} |
| 29:62 ReviewCommentsEditor | p frontendText(locale, "ADMIN_REVIEW_COMMENT_ERROR") |  | {"kind":"logical","expression":"(readState === \"error\" &#124;&#124; writeState === \"rejected\")","operator":"&&"} |
| 31:59 ReviewCommentsEditor | Button frontendText(locale, "ADMIN_REVIEW_COMMENT_RETRY") | onClick=() =&gt; { void owner.retry(); } | {"kind":"logical","expression":"writeState === \"unknown\" && readState === \"ready\"","operator":"&&"} |
| 32:61 ReviewCommentsEditor | Button frontendText(locale, "ADMIN_REVIEW_RELOAD") | onClick=() =&gt; { void owner.reload(); } | disabled=writeState === "saving" &#124;&#124; readState === "loading"; {"kind":"logical","expression":"(readState === \"error\" &#124;&#124; writeState === \… |

## frontend/components/review/review-decision-controls.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 34:19 ReviewDecisionControls | ReviewDecisionEditor  |  | {"kind":"branch","expression":"drafts","branch":"true"}; spread: props |
| 35:50 ReviewDecisionControls | ReviewDecisionControls  |  | {"kind":"branch","expression":"drafts","branch":"false"}; spread: props |
| 55:5 ReviewDecisionEditor | window.addEventListener  | "beforeunload", warn |  |
| 103:18 ReviewDecisionEditor | Button pendingAction === action ? frontendText(locale, "ADMIN_REVIEW_ACTION_PENDING") : label | onClick=() =&gt; requestChoice(action); type="button" | disabled=locked &#124;&#124; valid; aria-busy=pendingAction === action; aria-expanded=action === "publish" ? undefined : selected === action; {"kind":"contai… |
| 110:33 ReviewDecisionEditor | ReviewDecisionForm  | onChange=setDetails; onCancel=() =&gt; requestChoice(null); onSubmit=submit; action=selected | disabled=locked &#124;&#124; valid &#124;&#124; drafts.confirming; {"kind":"container","tag":"div","attributes":{"aria-hidden":"valid &#124;&#124; undefined"… |
| 113:5 ReviewDecisionEditor | ConfirmAction  | onCancel=cancel; onConfirm=confirm | open=valid |
| 127:10 ReviewDecisionForm | form  | onSubmit=(event) =&gt; { event.preventDefault(); if (!disabled && valid) onSubmit({ reasonCode, note }); } |  |
| 130:7 ReviewDecisionForm | Select  | onChange=(event) =&gt; onChange({ ...details, reasonCode: event.target.value as ReviewNoteInput["reasonCode"] }) | disabled=disabled; {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"action === \"reject\"","operator":"&&"} |
| 131:9 ReviewDecisionForm | option frontendText(locale, "ADMIN_REVIEW_REASON_NOT_RELEVANT") |  | {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"action === \"reject\"","operator":"&&"}; {"kind":"container","tag":"Select… |
| 132:9 ReviewDecisionForm | option frontendText(locale, "ADMIN_REVIEW_REASON_DUPLICATE") |  | {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"action === \"reject\"","operator":"&&"}; {"kind":"container","tag":"Select… |
| 133:9 ReviewDecisionForm | option frontendText(locale, "ADMIN_REVIEW_REASON_UNSAFE") |  | {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"action === \"reject\"","operator":"&&"}; {"kind":"container","tag":"Select… |
| 138:7 ReviewDecisionForm | Textarea  | onChange=(event) =&gt; onChange({ ...details, note: event.target.value }) | disabled=disabled; {"kind":"container","tag":"form","attributes":{}} |
| 145:7 ReviewDecisionForm | Button frontendText(locale, action === "reject" ? "ADMIN_REVIEW_CONFIRM_REJECT" : "ADMIN_REVIEW_CONFIRM_REVISION") | type="submit" | disabled=disabled &#124;&#124; !valid; {"kind":"container","tag":"form","attributes":{}} |
| 148:7 ReviewDecisionForm | Button frontendText(locale, "ADMIN_REVIEW_CANCEL") | onClick=onCancel; type="button" | disabled=disabled; {"kind":"container","tag":"form","attributes":{}} |
| 160:12 ReviewDecisionFeedback | Alert  |  | {"kind":"branch","expression":"state.kind === \"success\"","branch":"true"} |
| 171:36 ReviewDecisionFeedback | Button frontendText(locale, "ADMIN_REVIEW_RETRY_SAME") | onClick=onRetry; type="button" | {"kind":"logical","expression":"state.recovery === \"retry\"","operator":"&&"}; earlier return: state.kind === "success"; earlier return: state.kind !== "error" |
| 172:105 ReviewDecisionFeedback | Button frontendText(locale, "ADMIN_REVIEW_RELOAD") | onClick=onReload; type="button" | {"kind":"logical","expression":"(state.recovery === \"reload\" &#124;&#124; (state.recovery === \"retry\" && allowUnknownReload && onReload))","operator":"&&… |

## frontend/components/review/review-drafts.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 63:22 ReviewDraftProvider | div  |  | {"kind":"branch","expression":"recordBlocked","branch":"true"} |
| 65:7 ReviewDraftProvider | button frontendText(locale, "REVIEW_NOTE_DRAFT_RECORD_DISCARD") | onClick=discardRecord; type="button" | {"kind":"branch","expression":"recordBlocked","branch":"true"} |
| 67:21 ReviewDraftProvider | p recordNotice |  | {"kind":"branch","expression":"recordNotice","branch":"true"} |

## frontend/components/shell/app-shell.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 106:7 AppShell | a locale.t("SHELL_SKIP_MAIN") | href="#main-content" |  |
| 111:13 AppShell | Button  | onClick=() =&gt; setCollapsed((value) =&gt; !value); type="button" | aria-expanded=!collapsed |
| 116:13 AppShell | NavGroup  | onNavigate=navigate; onToggle=(id) =&gt; setExpanded((value) =&gt; ({ ...value, [id]: !value[id] })) |  |
| 117:40 AppShell | NavGroup  | onNavigate=navigate; onToggle=(id) =&gt; setExpanded((value) =&gt; ({ ...value, [id]: !value[id] })) | {"kind":"logical","expression":"adminRoutes.length &gt; 0","operator":"&&"} |
| 120:93 AppShell | AccountMenu  | onActiveMenuChange=setActiveMenu; onThemeChange=changeTheme; onNavigate=navigate; onLogout=onLogout | {"kind":"branch","expression":"collapsed","branch":"true"} |
| 121:81 AppShell | AccountMenu  | onActiveMenuChange=setActiveMenu; onThemeChange=changeTheme; onNavigate=navigate; onLogout=onLogout | {"kind":"branch","expression":"collapsed","branch":"false"} |
| 128:13 AppShell | CommandPalette  | onNavigate=navigate; onToggleTheme=toggleTheme; onLogout=onLogout |  |
| 130:75 AppShell | motion.a  | onClick=(event) =&gt; { event.preventDefault(); navigate(link.path); }; href=link.path | {"kind":"repeat","expression":"collaborationLinks"} |
| 130:1147 AppShell | span unreadState.kind === "ready" ? unreadState.unread : unreadState.kind === "loading" ? "…" : "—" |  | {"kind":"repeat","expression":"collaborationLinks"}; {"kind":"logical","expression":"link.path === \"/notifications\"","operator":"&&"} |
| 130:1538 AppShell | Button locale.t("COMMON_RETRY") | onClick=notificationSummary.retry | {"kind":"repeat","expression":"collaborationLinks"}; {"kind":"logical","expression":"link.path === \"/notifications\" && unreadState.kind === \"error\"","ope… |
| 132:13 AppShell | DropdownMenu  | onOpenChange=(open) =&gt; setActiveMenu(open ? "language" : null) | open=activeMenu === "language" |
| 133:15 AppShell | DropdownMenuTrigger  |  | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === \"language\""}} |
| 135:17 AppShell | DropdownMenuItem locale.t("SHELL_LANGUAGE_EN") | onClick=() =&gt; locale.setLocale("en") | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === \"language\""}} |
| 136:17 AppShell | DropdownMenuItem locale.t("SHELL_LANGUAGE_ZH_CN") | onClick=() =&gt; locale.setLocale("zh-CN") | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === \"language\""}} |
| 141:148 AppShell | MobileNavigation  | onNavigate=navigate; onActiveMenuChange=setActiveMenu; onThemeChange=changeTheme; onLogout=onLogout |  |
| 143:317 AppShell | section  |  | {"kind":"branch","expression":"access.kind === \"forbidden\"","branch":"true"} |
| 157:210 NavGroup | NavNode  | onNavigate=onNavigate; onToggle=onToggle | {"kind":"repeat","expression":"nodes"} |
| 174:29 NavNode | button  | onClick=(event) =&gt; event.preventDefault(); type="button" | aria-disabled="true" |
| 177:14 NavNode | motion.a hoverPill | onMouseEnter=() =&gt; setHovered(true); onMouseLeave=() =&gt; setHovered(false); onClick=(event) =&gt; { event.preventDefault(); onNavigate(path); }; href=path | {"kind":"branch","expression":"path && unavailable","branch":"false"}; {"kind":"branch","expression":"path","branch":"true"} |
| 178:9 NavNode | button hoverPill | onMouseEnter=() =&gt; setHovered(true); onMouseLeave=() =&gt; setHovered(false); onClick=() =&gt; onToggle(node.id); type="button" | aria-expanded=expanded[node.id] ?? false; {"kind":"branch","expression":"path && unavailable","branch":"false"}; {"kind":"branch","expression":"path","branch… |
| 179:168 NavNode | button  | onClick=() =&gt; onToggle(node.id); type="button" | aria-expanded=expanded[node.id] ?? false; {"kind":"logical","expression":"hasChildren && !collapsed","operator":"&&"} |
| 179:688 NavNode | NavNode  | onNavigate=onNavigate; onToggle=onToggle | {"kind":"logical","expression":"hasChildren && (expanded[node.id] ?? false) && !collapsed && depth &lt; 4","operator":"&&"}; {"kind":"repeat","expression":"n… |
| 222:135 Breadcrumb | a locale.t("NAV_HOME") | href="/" |  |
| 227:33 NavIcon | Checks  |  | {"kind":"branch","expression":"path === \"/tasks\"","branch":"true"}; spread: props |
| 228:34 NavIcon | Kanban  |  | {"kind":"branch","expression":"path === \"/boards\"","branch":"true"}; earlier return: path === "/tasks"; spread: props |
| 229:41 NavIcon | Bell  |  | {"kind":"branch","expression":"path === \"/notifications\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; spread: … |
| 230:36 NavIcon | ChatCircle  |  | {"kind":"branch","expression":"path === \"/messages\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier retur… |
| 231:33 NavIcon | ChartLine  |  | {"kind":"branch","expression":"path === \"/graph\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 232:28 NavIcon | House  |  | {"kind":"branch","expression":"path === \"/\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: path … |
| 233:37 NavIcon | BookOpen  |  | {"kind":"branch","expression":"path === \"/knowledge\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier retu… |
| 234:34 NavIcon | UploadSimple  |  | {"kind":"branch","expression":"path === \"/submit\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return:… |
| 235:34 NavIcon | MagnifyingGlass  |  | {"kind":"branch","expression":"path === \"/search\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return:… |
| 236:33 NavIcon | Sparkle  |  | {"kind":"branch","expression":"path === \"/agent\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 237:42 NavIcon | Files  |  | {"kind":"branch","expression":"path === \"/my-submissions\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier… |
| 238:33 NavIcon | Target  |  | {"kind":"branch","expression":"path === \"/goals\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 239:36 NavIcon | FolderSimple  |  | {"kind":"branch","expression":"path === \"/projects\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier retur… |
| 240:36 NavIcon | CalendarBlank  |  | {"kind":"branch","expression":"path === \"/calendar\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier retur… |
| 241:33 NavIcon | CalendarBlank  |  | {"kind":"branch","expression":"path === \"/today\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 242:33 NavIcon | Timer  |  | {"kind":"branch","expression":"path === \"/focus\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 243:34 NavIcon | Check  |  | {"kind":"branch","expression":"path === \"/review\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return:… |
| 244:33 NavIcon | ShieldCheck  |  | {"kind":"branch","expression":"path === \"/admin\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 245:45 NavIcon | NotePencil  |  | {"kind":"branch","expression":"path === \"/admin/submissions\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earl… |
| 246:40 NavIcon | Stack  |  | {"kind":"branch","expression":"path === \"/admin/assets\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier r… |
| 247:41 NavIcon | UsersThree  |  | {"kind":"branch","expression":"path === \"/admin/members\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier … |
| 248:39 NavIcon | ShieldCheck  |  | {"kind":"branch","expression":"path === \"/admin/roles\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier re… |
| 249:39 NavIcon | DotsThree  |  | {"kind":"branch","expression":"path === \"/admin/menus\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier re… |
| 250:40 NavIcon | Stack  |  | {"kind":"branch","expression":"path === \"/admin/spaces\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier r… |
| 251:39 NavIcon | Scroll  |  | {"kind":"branch","expression":"path === \"/admin/audit\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier re… |
| 252:43 NavIcon | ChartLine  |  | {"kind":"branch","expression":"path === \"/admin/analytics\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlie… |
| 253:10 NavIcon | DotsThree  |  | earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: path === "/notifications"; earlier return: path === "/messages"; earli… |
| 272:10 AccountMenu | DropdownMenu  | onOpenChange=(open) =&gt; onActiveMenuChange(open ? menuId : null) | open=activeMenu === menuId |
| 272:135 AccountMenu | DropdownMenuTrigger  |  | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === menuId"}} |
| 272:1163 AccountMenu | DropdownMenuItem locale.t("SHELL_SETTINGS") | onClick=selectSettings | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === menuId"}} |
| 272:1472 AccountMenu | DropdownMenuItem locale.t("SHELL_THEME_LIGHT") / selectedThemeIndicator("light") | onClick=() =&gt; selectTheme("light") | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === menuId"}} |
| 272:1758 AccountMenu | DropdownMenuItem locale.t("SHELL_THEME_DARK") / selectedThemeIndicator("dark") | onClick=() =&gt; selectTheme("dark") | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === menuId"}} |
| 272:2039 AccountMenu | DropdownMenuItem locale.t("SHELL_THEME_SYSTEM") / selectedThemeIndicator("system") | onClick=() =&gt; selectTheme("system") | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === menuId"}} |
| 272:2317 AccountMenu | p logoutError |  | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === menuId"}}; {"kind":"logical","expression":"logoutError","operator":"&&"} |
| 272:2398 AccountMenu | DropdownMenuItem logoutPending ? locale.t("SHELL_LOGGING_OUT") : locale.t("SHELL_LOGOUT") | onClick=onLogout | disabled=logoutPending; {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === menuId"}} |
| 279:10 MobileNavigation | Sheet  | onOpenChange=setOpen | open=open |
| 279:52 MobileNavigation | details  |  | open=open; {"kind":"container","tag":"Sheet","attributes":{"open":"open"}} |
| 279:102 MobileNavigation | summary locale.t("SHELL_OPEN_NAVIGATION") | onClick=(event) =&gt; { event.preventDefault(); setOpen((current) =&gt; !current); } | {"kind":"container","tag":"Sheet","attributes":{"open":"open"}}; {"kind":"container","tag":"details","attributes":{"open":"open"}} |
| 279:885 MobileNavigation | button  | type="button" | disabled=true; aria-disabled="true"; {"kind":"container","tag":"Sheet","attributes":{"open":"open"}}; {"kind":"container","tag":"details","attributes":{"open… |
| 279:1263 MobileNavigation | motion.a  | onClick=(event) =&gt; { event.preventDefault(); setOpen(false); onNavigate(path); }; href=path | {"kind":"container","tag":"Sheet","attributes":{"open":"open"}}; {"kind":"container","tag":"details","attributes":{"open":"open"}}; {"kind":"repeat","express… |
| 279:2097 MobileNavigation | AccountMenu  | onActiveMenuChange=onActiveMenuChange; onThemeChange=onThemeChange; onNavigate=(path) =&gt; { setOpen(false); onNavigate(path); }; onLogout=onLogout | {"kind":"container","tag":"Sheet","attributes":{"open":"open"}}; {"kind":"container","tag":"details","attributes":{"open":"open"}} |

## frontend/components/shell/command-palette.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 48:5 CommandPalette | document.addEventListener  | "keydown", onKeyDown |  |
| 85:5 CommandPalette | Button  | onClick=() =&gt; setOpen(true); type="button" |  |
| 89:5 CommandPalette | Button  | onClick=() =&gt; setOpen(true); type="button" |  |
| 90:5 CommandPalette | Dialog  | onOpenChange=setOpen | open=open |
| 91:7 CommandPalette | DialogContent  | onKeyDown=(event) =&gt; { if (event.target !== inputRef.current) return; if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) =&gt… | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |
| 97:302 CommandPalette | Input  | onChange=(event) =&gt; { setQuery(event.target.value); setActiveIndex(0); } | aria-expanded=open; {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |
| 98:9 CommandPalette | div  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |
| 99:63 CommandPalette | button  | onFocus=() =&gt; setActiveIndex(index); onMouseEnter=() =&gt; setActiveIndex(index); onClick=() =&gt; execute(command); type="button" | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}}; {"kind":"branch","expression":"filtered.length","branch":"true"}; {"kind":"repeat","express… |

## frontend/components/shell/context-rail.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 33:7 ContextRail | Button  | onClick=onClose; type="button" |  |
| 36:32 ContextRail | a !collapsed && frontendText(locale, module.labelKey) | onClick=(event) =&gt; go(event, module.entryPath); href=module.entryPath | {"kind":"repeat","expression":"modules"} |
| 38:296 ContextRail | a frontendText(locale, route.labelKey) | onClick=(event) =&gt; go(event, route.path); href=route.path | {"kind":"logical","expression":"!collapsed && children.length &gt; 0","operator":"&&"}; {"kind":"repeat","expression":"children"} |
| 39:37 ContextRail | a frontendText(locale, "SHELL_OPEN_MODULE") | onClick=(event) =&gt; go(event, currentModule.entryPath); href=currentModule.entryPath | {"kind":"logical","expression":"!collapsed && currentModule","operator":"&&"} |
| 46:60 ContextRail | Button frontendText(locale, "SHELL_OPEN_CONTEXT") | onClick=() =&gt; setMobileOpen(true); type="button" |  |
| 47:5 ContextRail | Sheet  | onOpenChange=setMobileOpen | open=mobileOpen |

## frontend/components/snapshot-target-detail.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 46:10 SnapshotTargetDetail | Dialog  | onOpenChange=open =&gt; {if (!open) onClose();} | open=true |
| 48:213 SnapshotTargetDetail | Button frontendText(locale, "TODAY_DETAIL_RETRY") | onClick=() =&gt; setRetry(value =&gt; value + 1) | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"bran… |
| 49:5 SnapshotTargetDetail | Button frontendText(locale, "TODAY_DETAIL_CLOSE") | onClick=onClose | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}} |

## frontend/components/timeline-create-form.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 50:5 TimelineCreateForm | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 131:39 TimelineCreateForm | p frontendText(locale, "PLANNING_CREATE_STORAGE_BLOCKED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"phase… |
| 131:116 TimelineCreateForm | Button frontendText(locale, "PLANNING_CREATE_STORAGE_RETRY") | onClick=reloadStored; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","… |
| 132:31 TimelineCreateForm | p frontendText(locale, "PLANNING_CREATE_UNKNOWN") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"phase… |
| 132:100 TimelineCreateForm | Button frontendText(locale, "PLANNING_CREATE_RETRY") | onClick=() =&gt; void submit(); type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","… |
| 133:35 TimelineCreateForm | p frontendText(locale, "PLANNING_CREATE_READ_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"phase… |
| 133:108 TimelineCreateForm | Button frontendText(locale, "PLANNING_CREATE_READ_RETRY") | onClick=() =&gt; { if (phaseRef.current === "read-failed") void readback(); }; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","… |
| 134:15 TimelineCreateForm | p frontendText(locale, "PROJECT_TIMELINE_ACTION_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"error… |
| 141:25 TimelineCreateForm | div  |  | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 141:168 TimelineCreateForm | Button frontendText(locale, "TIMELINE_DRAFT_RECORD_DISCARD") | onClick=discardRecord; type="button" | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 142:24 TimelineCreateForm | p recordNotice |  | {"kind":"logical","expression":"recordNotice","operator":"&&"} |
| 146:11 TimelineCreateForm | select  | onChange=(event) =&gt; draft.edit("kind", event.currentTarget.value as ProjectTimelineKind) | disabled=locked; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |
| 147:13 TimelineCreateForm | option frontendText(locale, "PROJECT_TIMELINE_KIND_MEETING") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; {"kind":"container","tag":"select","attributes":{"disabled":"locked"}} |
| 148:13 TimelineCreateForm | option frontendText(locale, "PROJECT_TIMELINE_KIND_DECISION") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; {"kind":"container","tag":"select","attributes":{"disabled":"locked"}} |
| 149:13 TimelineCreateForm | option frontendText(locale, "PROJECT_TIMELINE_KIND_ACTION") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; {"kind":"container","tag":"select","attributes":{"disabled":"locked"}} |
| 150:13 TimelineCreateForm | option frontendText(locale, "PROJECT_TIMELINE_KIND_MILESTONE") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; {"kind":"container","tag":"select","attributes":{"disabled":"locked"}} |
| 153:9 TimelineCreateForm | Input  | onChange=(event) =&gt; draft.edit("title", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |
| 154:9 TimelineCreateForm | Textarea  | onChange=(event) =&gt; draft.edit("body", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |
| 157:11 TimelineCreateForm | Input  | onChange=(event) =&gt; draft.edit("startsAt", event.currentTarget.value); type="datetime-local" | disabled=locked; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |
| 161:11 TimelineCreateForm | Input  | onChange=(event) =&gt; draft.edit("dueAt", event.currentTarget.value); type="datetime-local" | disabled=locked; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |
| 163:40 TimelineCreateForm | Button frontendText(locale, "PROJECT_TIMELINE_CREATE") | onClick=() =&gt; void submit(); type="button" | disabled=locked &#124;&#124; !title.trim() &#124;&#124; !onCreate; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |

## frontend/components/timeline-item-editor.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 68:5 TimelineItemEditor | owner.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, committed |  |
| 69:5 TimelineItemEditor | owner.addEventListener  | "beforeunload", warn |  |
| 111:23 TimelineItemEditor | Button frontendText(locale, "PROJECT_TIMELINE_EDIT") | onClick=() =&gt; { if (!alive.current &#124;&#124; current.current &#124;&#124; blocked()) return; const item = liveProps.current.item; const fields = { titl… | disabled=pending; {"kind":"branch","expression":"!editor","branch":"true"} |
| 121:10 TimelineItemEditor | div  | onKeyDown=event =&gt; { if (event.key === "Escape" && !event.defaultPrevented && !decisionRef.current) { event.preventDefault(); event.stopPropagation(); req… | earlier return: !editor |
| 126:109 TimelineItemEditor | select  | onChange=event =&gt; edit("kind", event.currentTarget.value as ProjectTimelineItem["kind"]) | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; earlier return: !editor |
| 127:86 TimelineItemEditor | option frontendText(locale, &#96;PROJECT_TIMELINE_KIND_${value.toUpperCase()}&#96;) |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; {"kind":"repeat","expression":"([\"meeting\", \"decision\", \"action_item\", \"mile… |
| 129:110 TimelineItemEditor | Input  | onChange=event =&gt; edit("title", event.currentTarget.value) | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; earlier return: !editor |
| 130:123 TimelineItemEditor | Textarea  | onChange=event =&gt; edit("body", event.currentTarget.value) | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; earlier return: !editor |
| 131:110 TimelineItemEditor | Input  | onChange=event =&gt; edit("startsAt", event.currentTarget.value); type="datetime-local" | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; earlier return: !editor |
| 132:108 TimelineItemEditor | Input  | onChange=event =&gt; edit("dueAt", event.currentTarget.value); type="datetime-local" | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; earlier return: !editor |
| 134:20 TimelineItemEditor | p frontendText(locale, "PROJECT_TIMELINE_ACTION_FAILED") |  | {"kind":"logical","expression":"saveFailed","operator":"&&"}; earlier return: !editor |
| 135:15 TimelineItemEditor | p frontendText(locale, "PROJECT_TIMELINE_EDIT_STALE") |  | {"kind":"logical","expression":"stale","operator":"&&"}; earlier return: !editor |
| 136:17 TimelineItemEditor | p frontendText(locale, "PROJECT_TIMELINE_EDIT_INVALID") |  | {"kind":"logical","expression":"invalid","operator":"&&"}; earlier return: !editor |
| 137:33 TimelineItemEditor | Button frontendText(locale, "PROJECT_TIMELINE_EDIT_SAVE") | onClick=() =&gt; void save(); type="button" | disabled=locked &#124;&#124; invalid &#124;&#124; stale; earlier return: !editor |
| 137:192 TimelineItemEditor | Button frontendText(locale, "PROJECT_TIMELINE_EDIT_CANCEL") | onClick=requestClose; type="button" | disabled=locked; earlier return: !editor |
| 138:5 TimelineItemEditor | ConfirmAction  | onCancel=cancelDecision; onConfirm=confirmDecision | open=decision !== null; earlier return: !editor |

## frontend/components/today-target-detail.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 5:10 TodayTargetDetail | SnapshotTargetDetail  |  | spread: props |

## frontend/components/ui/alert.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 11:72 Alert | div  |  | spread: props |
| 12:98 AlertTitle | h5  |  | spread: props |
| 13:106 AlertDescription | div  |  | spread: props |

## frontend/components/ui/badge.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 20:72 Badge | div  |  | spread: props |

## frontend/components/ui/button.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 33:5 Button | BeuiButton  | type=type | spread: (props as BeuiButtonProps) |

## frontend/components/ui/card.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 5:37 Card | div  |  | spread: props |
| 9:85 CardHeader | div  |  | spread: props |
| 10:83 CardTitle | h3  |  | spread: props |
| 11:88 CardDescription | p  |  | spread: props |
| 12:86 CardContent | div  |  | spread: props |
| 13:85 CardFooter | div  |  | spread: props |

## frontend/components/ui/checkbox.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 8:10 Checkbox | input  | type="checkbox" | spread: props |

## frontend/components/ui/confirm-action.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 12:10 ConfirmAction | Dialog  | onOpenChange=(next) =&gt; { if (!next) onCancel(); } | open=open |
| 13:5 ConfirmAction | DialogContent  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |
| 17:9 ConfirmAction | Button cancelLabel | onClick=onCancel | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |
| 18:9 ConfirmAction | Button confirmLabel | onClick=onConfirm | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |

## frontend/components/ui/dialog.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 34:5 DialogContent | div  | onClick=() =&gt; onOpenChange?.(false) | aria-hidden="true"; earlier return: !open |
| 35:5 DialogContent | motion.div  |  | earlier return: !open; spread: props |
| 39:99 DialogTitle | h2  |  | spread: props |

## frontend/components/ui/dropdown-menu.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 77:5 DropdownMenu | document.addEventListener  | "pointerdown", dismissOutside | earlier return: !open |
| 78:5 DropdownMenu | document.addEventListener  | "focusin", dismissAfterFocus | earlier return: !open |
| 79:5 DropdownMenu | document.addEventListener  | "keydown", dismissOnEscape | earlier return: !open |
| 100:110 DropdownMenu | div children | onKeyDown=handleKeyDown |  |
| 116:10 DropdownMenuTrigger | button  | onClick=handleClick; onKeyDown=handleKeyDown; type=type ?? "button" | aria-expanded=open; spread: props |
| 140:10 DropdownMenuContent | div  | onKeyDown=handleKeyDown | earlier return: !open; spread: props |
| 153:10 DropdownMenuItem | button  | onClick=handleClick; type="button" | aria-disabled=disabled ? "true" : undefined; disabled=disabled; spread: props |

## frontend/components/ui/expandable-tabs.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 36:5 ExpandableTabs | div  |  |  |
| 40:11 ExpandableTabs | motion.button  | onClick=() =&gt; onValueChange(active ? null : item.id); type="button" | {"kind":"repeat","expression":"items"} |

## frontend/components/ui/focus-scope.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 40:5 useFocusScope | root.addEventListener  | "keydown", onKeyDown | earlier return: !active &#124;&#124; !root &#124;&#124; typeof document === "undefined" |

## frontend/components/ui/input.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 12:5 Input | input  | type=type | spread: props |

## frontend/components/ui/label.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 5:37 Label | label  |  | spread: props |

## frontend/components/ui/page-state.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 12:10 PageState | Alert children |  | earlier return: kind === "loading"; earlier return: kind === "empty"; earlier return: kind === "degraded" |

## frontend/components/ui/pagination.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 35:145 PaginationContent | ol  |  | spread: props |
| 38:118 PaginationItem | li  |  | spread: props |
| 42:187 PaginationLink | button  | type=type | spread: props |
| 45:103 PaginationEllipsis | span … |  | aria-hidden="true"; spread: props |
| 47:151 PaginationPrevious | PaginationLink  |  | spread: props |
| 50:147 PaginationNext | PaginationLink  |  | spread: props |
| 60:10 Pagination | nav  |  | earlier return: !safePageCount; spread: props |
| 61:5 Pagination | PaginationPrevious  | onClick=() =&gt; onPageChange?.(previousPage) | disabled=disabled &#124;&#124; safeCurrentPage &lt;= 1; earlier return: !safePageCount |
| 64:37 Pagination | PaginationLink token | onClick=() =&gt; onPageChange?.(token) | disabled=disabled &#124;&#124; token &gt; lastAllowedPage; {"kind":"repeat","expression":"tokens"}; {"kind":"branch","expression":"token === \"ellipsis\"","b… |
| 65:5 Pagination | PaginationNext  | onClick=() =&gt; onPageChange?.(safeCurrentPage + 1) | disabled=disabled &#124;&#124; safeCurrentPage &gt;= lastAllowedPage; earlier return: !safePageCount |

## frontend/components/ui/select.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 6:135 Select | select children |  | spread: props |
| 9:113 SelectOption | option  |  | spread: props |

## frontend/components/ui/sheet.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 18:10 SheetContent | motion.div  |  | earlier return: !open; spread: props |
| 21:95 SheetHeader | div  |  | spread: props |
| 22:98 SheetTitle | h2  |  | spread: props |
| 25:10 SheetClose | button  | onClick=(event) =&gt; { onClick?.(event); if (!event.defaultPrevented) onOpenChange?.(false); }; type="button" | spread: props |

## frontend/components/ui/skeleton.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 4:92 Skeleton | div  |  | aria-busy="true"; spread: props |

## frontend/components/ui/summary-row.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 33:21 SummaryRow | Button frontendText(locale, expanded ? "COMMON_COLLAPSE" : "COMMON_EXPAND") | onClick=() =&gt; setExpanded((current) =&gt; !current); type="button" | aria-expanded=expanded; {"kind":"logical","expression":"overflowing","operator":"&&"} |

## frontend/components/ui/tabs.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 35:93 Tabs | div children |  | spread: props |
| 40:10 TabsList | div  | onKeyDown=(event) =&gt; { onKeyDown?.(event); if (event.defaultPrevented) return; const action = tabsKeyAction(event.key, context.orientation); if (!action) … | spread: props |
| 66:10 TabsTrigger | button  | onClick=(event) =&gt; { onClick?.(event); if (!event.defaultPrevented && !disabled) context.setValue(value); }; type="button" | aria-disabled=disabled ? "true" : undefined; disabled=disabled; spread: props |
| 74:10 TabsContent | div  |  | hidden=!active; spread: props |

## frontend/components/ui/textarea.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 11:5 Textarea | textarea  |  | spread: props |

## frontend/components/ui/tooltip.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 6:10 TooltipProvider | TooltipPrimitive.Provider  |  | spread: props |
| 10:10 Tooltip | TooltipPrimitive.Root  |  | spread: props |
| 14:10 TooltipTrigger | TooltipPrimitive.Trigger  |  | spread: props |
| 19:5 TooltipContent | TooltipPrimitive.Content children |  | spread: props |

## frontend/features/environments/account-network-owner.mjs

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 23:3 createAccountNetworkOwner | channel?.addEventListener  | 'message', receive |  |
| 45:3 createAccountNetworkOwner | events?.addEventListener  | 'pagehide', dispose |  |

## frontend/features/environments/account-network.mjs

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 16:5 cancellable | signal.addEventListener  | 'abort', abort, { once: true } |  |
| 164:3 createAccountVmNetwork | events?.addEventListener  | 'offline', offline |  |
| 165:3 createAccountVmNetwork | events?.addEventListener  | 'pagehide', pagehide |  |

## frontend/features/environments/account-vm-runtime.mjs

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 63:3 createAccountVmRuntime | owner.signal.addEventListener  | 'abort', () =&gt; { cancel('ACCOUNT_CLOSED'); unsubscribe(); }, { once: true } |  |

## frontend/features/environments/authenticated-vm-runtime.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 43:9 createAuthenticatedVmRuntime | cancel.addEventListener  | 'abort', abort, {once:true} |  |

## frontend/features/environments/connector-session.mjs

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 24:2 createVmConnectorSession | signal.addEventListener  | 'abort', abort, {once:true} |  |

## frontend/features/environments/environment-manager.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 42:3 createManager | owner.signal.addEventListener  | 'abort', close, {once: true} |  |
| 51:51 createManager | signal.addEventListener  | 'abort', abort, {once: true} |  |

## frontend/features/environments/environment-rename-dialog.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 45:5 EnvironmentRenameDialog | Dialog  | onOpenChange=open=&gt;{if(!open)cancel();} | open=true |
| 47:7 EnvironmentRenameDialog | form  | onSubmit=event=&gt;{event.preventDefault();void save();} | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}} |
| 48:31 EnvironmentRenameDialog | Input  | onChange=event=&gt;draft.edit('name',event.target.value) | disabled=!!discard &#124;&#124; draft.confirming &#124;&#124; operationBlocked(); {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"… |
| 49:21 EnvironmentRenameDialog | p t('ENV_INVALID_INPUT') |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"invalid"… |
| 50:37 EnvironmentRenameDialog | Button t('ENV_SAVE') | type="submit" | disabled=!!discard &#124;&#124; draft.confirming &#124;&#124; operationBlocked() &#124;&#124; !draft.fields.name.trim(); {"kind":"container","tag":"Dialog","… |
| 50:175 EnvironmentRenameDialog | Button t('ENV_CANCEL') | onClick=cancel; type="button" | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{}} |
| 53:5 EnvironmentRenameDialog | ConfirmAction  | onCancel=cancelDiscard; onConfirm=confirmDiscard | open=!!discard |

## frontend/features/environments/environments-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 21:96 EnvironmentsPage | p frontendText(locale,'ENV_FORBIDDEN') |  | {"kind":"branch","expression":"!routeAccessAllowed(session,{capability:null,requiredPermission:'workspace.vm'})","branch":"true"} |
| 87:5 EnvironmentView | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 113:26 EnvironmentView | section t('ENV_ACCOUNT_CLOSED') |  | {"kind":"branch","expression":"state.closed","branch":"true"} |
| 116:230 EnvironmentView | Button t('ENV_CREATE') | onClick=()=&gt;{if(alive.current && !operationBlocked() && !draft.isConfirming() && !editRef.current && !removeRef.current)setCreateOpen(true);}; type="button" | aria-expanded=createOpen; disabled=blocked; earlier return: state.closed |
| 117:37 EnvironmentView | div  |  | {"kind":"logical","expression":"(state.error &#124;&#124; localError)","operator":"&&"}; earlier return: state.closed |
| 118:31 EnvironmentView | div  |  | {"kind":"logical","expression":"state.recoveryBlocked","operator":"&&"}; earlier return: state.closed |
| 120:7 EnvironmentView | Button t('ENV_RECHECK_RECOVERY') | onClick=()=&gt;void run(()=&gt;manager.recheckRecovery()) | disabled=state.writing; {"kind":"logical","expression":"state.recoveryBlocked","operator":"&&"}; earlier return: state.closed |
| 124:45 EnvironmentView | Button t('ENV_LOOKUP_RESULT') | onClick=()=&gt;void run(()=&gt;manager.lookup()) | disabled=state.writing; {"kind":"logical","expression":"state.pending","operator":"&&"}; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.wri… |
| 124:180 EnvironmentView | Button t('ENV_RETRY_WRITE') | onClick=()=&gt;void run(()=&gt;manager.retry()) | disabled=state.writing; {"kind":"logical","expression":"state.pending","operator":"&&"}; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.wri… |
| 126:25 EnvironmentView | div  |  | {"kind":"logical","expression":"state.confirmed","operator":"&&"}; earlier return: state.closed |
| 133:5 EnvironmentView | Dialog  | onOpenChange=open=&gt;{if(!open)setCreateOpen(false);} | open=createOpen; earlier return: state.closed |
| 135:25 EnvironmentView | div  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; {"kind":"logical","expression":"recordBlocked","operator":"&&"}; earlier return: stat… |
| 135:147 EnvironmentView | Button t('ENV_DRAFT_RECORD_DISCARD') | onClick=discardRecord; type="button" | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; {"kind":"logical","expression":"recordBlocked","operator":"&&"}; earlier return: stat… |
| 136:24 EnvironmentView | p recordNotice |  | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; {"kind":"logical","expression":"recordNotice","operator":"&&"}; earlier return: state… |
| 137:7 EnvironmentView | form  | onSubmit=event=&gt;{event.preventDefault();if(!alive.current &#124;&#124; operationBlocked() &#124;&#124; draft.isConfirming() &#124;&#124; editRef.current &… | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; earlier return: state.closed |
| 138:9 EnvironmentView | Input  | onChange=value=&gt;draft.edit('name',value) | disabled=blocked; {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; {"kind":"container","tag":"form","attributes":{}}; earlier return: … |
| 139:113 EnvironmentView | MotionSelect  | onValueChange=value=&gt;draft.edit('type',value==='temporary'?'temporary':'personal') | disabled=blocked; {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; {"kind":"container","tag":"form","attributes":{}}; earlier return: … |
| 140:9 EnvironmentView | Input  | onChange=value=&gt;draft.edit('taskId',value) | disabled=blocked; {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; {"kind":"container","tag":"form","attributes":{}}; earlier return: … |
| 141:66 EnvironmentView | Button t('ENV_CANCEL') | onClick=()=&gt;setCreateOpen(false); type="button" | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; {"kind":"container","tag":"form","attributes":{}}; earlier return: state.closed |
| 141:198 EnvironmentView | Button t('ENV_CREATE') | type="submit" | disabled=blocked &#124;&#124; !title.trim(); {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; {"kind":"container","tag":"form","attrib… |
| 144:97 EnvironmentView | Select  | onChange=event=&gt;void run(()=&gt;manager.load(1,event.target.value as ''&#124;EnvironmentType)) | disabled=state.loading &#124;&#124; state.writing; earlier return: state.closed |
| 144:286 EnvironmentView | option t('ENV_ALL') |  | {"kind":"container","tag":"Select","attributes":{"disabled":"state.loading &#124;&#124; state.writing"}}; earlier return: state.closed |
| 144:326 EnvironmentView | option t('ENV_PERSONAL') |  | {"kind":"container","tag":"Select","attributes":{"disabled":"state.loading &#124;&#124; state.writing"}}; earlier return: state.closed |
| 144:379 EnvironmentView | option t('ENV_TEMPORARY') |  | {"kind":"container","tag":"Select","attributes":{"disabled":"state.loading &#124;&#124; state.writing"}}; earlier return: state.closed |
| 144:451 EnvironmentView | Button t('ENV_REFRESH') | onClick=()=&gt;void run(()=&gt;manager.load()) | disabled=state.loading &#124;&#124; state.writing; earlier return: state.closed |
| 146:7 EnvironmentView | DataTable  | onPageChange=goToPage; onPageSizeChange=changePageSize; onLoadMore=loadMore | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.loading"}}; earlier return: state.closed |
| 163:141 EnvironmentView | Button t('ENV_RENAME') | onClick=()=&gt;{if(alive.current && !operationBlocked() && !draft.isConfirming() && !editRef.current && !removeRef.current){editRef.current=item;setEdit(item… | disabled=blocked; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.loading"}}; earlier return: state.closed |
| 163:397 EnvironmentView | Button t('ENV_DELETE') | onClick=()=&gt;{if(alive.current && !operationBlocked() && !draft.isConfirming() && !editRef.current && !removeRef.current){removeRef.current=item;setRemove(… | disabled=blocked; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.loading"}}; earlier return: state.closed |
| 167:14 EnvironmentView | EnvironmentRenameDialog  | onName=reportRename; onClose=()=&gt;{if(editRef.current===edit){editRef.current=null;setEdit(null);setRenameSeed(null);if(!recordBlocked)persistEnvironmentDr… | {"kind":"logical","expression":"edit","operator":"&&"}; earlier return: state.closed |
| 168:5 EnvironmentView | Dialog  | onOpenChange=open=&gt;{if(!open)closeRemove();} | open=!!remove; earlier return: state.closed |
| 168:343 EnvironmentView | Button t('ENV_DELETE') | onClick=()=&gt;{const item=removeRef.current;if(!alive.current &#124;&#124; !item &#124;&#124; operationBlocked() &#124;&#124; draft.isConfirming())return;cl… | disabled=blocked; {"kind":"container","tag":"Dialog","attributes":{"open":"!!remove"}}; earlier return: state.closed |
| 168:625 EnvironmentView | Button t('ENV_CANCEL') | onClick=closeRemove | {"kind":"container","tag":"Dialog","attributes":{"open":"!!remove"}}; earlier return: state.closed |

## frontend/features/environments/files/asset-import-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 24:37 VmAssetImportPanel | input  | onChange=e=&gt;setUploadAck(e.target.checked); type="checkbox" | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"canUpload","operator":"&&"}; earlier r… |
| 25:7 VmAssetImportPanel | Button t('Upload / retry identical file','上传 / 重试同一文件') | onClick=()=&gt;void model.upload(uploadAck) | disabled=busy&#124;&#124;!uploadAck&#124;&#124;flow?.error==='storage'; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logi… |
| 30:7 VmAssetImportPanel | Button t('Read server status (no replay)','回读服务端状态（不重放）') | onClick=()=&gt;void model.refresh() | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.intent","operator":"&&"}; earlie… |
| 32:9 VmAssetImportPanel | Button t('Start / retry parsing','启动 / 重试解析') | onClick=()=&gt;void model.parse() | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.intent","operator":"&&"}; {"kind… |
| 33:9 VmAssetImportPanel | Button t('Cancel pending server asset','取消服务端待处理资产') | onClick=()=&gt;void model.cancel() | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.intent","operator":"&&"}; {"kind… |
| 35:33 VmAssetImportPanel | Button t('Release failed local intent (keeps server asset)','解除失败的本地意图（保留服务端资产）') | onClick=()=&gt;void model.releaseFailed() | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.intent","operator":"&&"}; {"kind… |
| 36:36 VmAssetImportPanel | Button t('Read parsed content for review','读取解析内容供确认') | onClick=()=&gt;void model.previewParsed() | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.intent","operator":"&&"}; {"kind… |
| 39:9 VmAssetImportPanel | Button t('Retry original review submission','重试原审核提交') | onClick=()=&gt;void model.retrySubmission() | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.intent","operator":"&&"}; {"kind… |
| 42:20 VmAssetImportPanel | pre state.parsed.markdown |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.parsed","operator":"&&"}; earlier return: state… |
| 44:58 VmAssetImportPanel | Input  | onChange=e=&gt;setTitle(e.target.value) | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"editable","operator":"&&"}; earlier re… |
| 45:99 VmAssetImportPanel | Input  | onChange=e=&gt;setSpace(e.target.value) | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"editable","operator":"&&"}; earlier re… |
| 46:68 VmAssetImportPanel | Select  | onChange=e=&gt;setVisibility(e.target.value as 'shared'&#124;'admin_only') | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"editable","operator":"&&"}; earlier re… |
| 46:180 VmAssetImportPanel | option t('Shared','共享') |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"editable","operator":"&&"}; {"kind":"container","tag"… |
| 46:230 VmAssetImportPanel | option t('Administrators only','仅管理员') |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"editable","operator":"&&"}; {"kind":"container","tag"… |
| 47:37 VmAssetImportPanel | input  | onChange=e=&gt;setReviewAck(e.target.checked); type="checkbox" | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"editable","operator":"&&"}; earlier re… |
| 48:7 VmAssetImportPanel | Button t('Submit parsed content for review','提交解析内容审核') | onClick=()=&gt;void model.submit({title,target:{requestedSpaceId:space,requestedCollectionId:null,requestedVisibility:visibility},acknowledged:reviewAck}) | disabled=busy&#124;&#124;!reviewAck&#124;&#124;!title.trim()&#124;&#124;!space.trim(); {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}… |
| 50:34 VmAssetImportPanel | p state.error==='ASSET_STORAGE_NOT_CONFIGURED'?t('Object storage is disabled. No asset will be uploaded; this cannot fall back to direct publication.','对象存储未启用… |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"(state.error&#124;&#124;flow?.error)","operator":"&&"… |
| 51:32 VmAssetImportPanel | p t('Review submission received','已收到审核提交记录') / : / flow.submissionId |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.kind==='submitted'","operator":"&&"}; earlier r… |
| 52:31 VmAssetImportPanel | p t('Server cancellation confirmed','服务端已确认取消') |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.kind==='canceled'","operator":"&&"}; earlier re… |
| 53:31 VmAssetImportPanel | p t('Local failed intent released; server asset retained','已解除失败的本地意图，服务端资产仍保留') |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.kind==='released'","operator":"&&"}; earlier re… |
| 54:5 VmAssetImportPanel | a t('My submissions','我的提交') | href="/my-submissions" | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; earlier return: state.kind==='idle' |
| 55:12 VmAssetImportPanel | Button t('Stop waiting (not server cancellation)','停止等待（不撤销服务端操作）') | onClick=()=&gt;model.stop() | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"busy","operator":"&&"}; earlier return: state.kind===… |
| 56:5 VmAssetImportPanel | Button t('Close (keep pending recovery metadata)','关闭（保留未决恢复元数据）') | onClick=()=&gt;model.close() | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; earlier return: state.kind==='idle' |

## frontend/features/environments/files/files-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 27:129 FilesPanel | FileView  |  | {"kind":"branch","expression":"binding?.runtime === runtime && binding.memberId===submission?.memberId && binding.requester===submission?.requester","branch"… |
| 73:7 FileView | Button t('Up', '上一级') | onClick=() =&gt; void manager.load(state.path.slice(0, state.path.lastIndexOf('/')) &#124;&#124; '/', 1) | disabled=blocked &#124;&#124; state.path === '/'; earlier return: !state.available |
| 74:7 FileView | Button t('Refresh', '刷新') | onClick=() =&gt; void manager.load() | disabled=blocked; earlier return: !state.available |
| 75:7 FileView | Button t('New folder', '新建文件夹') | onClick=() =&gt; openModal('mkdir') | disabled=blocked; earlier return: !state.available |
| 76:41 FileView | Input  | onChange=event =&gt; { const files = Array.from(event.target.files &#124;&#124; []); event.target.value = ''; if (files.length) void manager.upload(files); }… | disabled=blocked; earlier return: !state.available |
| 77:22 FileView | Button t('Cancel unsent work', '取消未发送操作') | onClick=() =&gt; manager.cancel() | disabled=state.cancelling; {"kind":"logical","expression":"state.busy","operator":"&&"}; earlier return: !state.available |
| 79:41 FileView | p ( / prepared.bytes / t('bytes ready', '字节已就绪') / ) |  | {"kind":"logical","expression":"prepared?.epoch === state.epoch","operator":"&&"}; earlier return: !state.available |
| 79:58 FileView | a t('Save to this device', '保存到本机') / · / prepared.name | href=prepared.url | {"kind":"logical","expression":"prepared?.epoch === state.epoch","operator":"&&"}; earlier return: !state.available |
| 80:21 FileView | p messages[state.error] &#124;&#124; t('Operation failed', '操作失败') |  | {"kind":"logical","expression":"state.error","operator":"&&"}; earlier return: !state.available |
| 81:5 FileView | p messages[state.notice] &#124;&#124; (state.busy ? t('Working…', '处理中…') : '') |  | earlier return: !state.available |
| 83:23 FileView | p t('Streaming save is unavailable in this browser; bounded downloads up to 20 MiB remain available.', '当前浏览器不支持流式保存；仍可使用不超过20 MiB的限额下载。') |  | {"kind":"logical","expression":"!openDownload","operator":"&&"}; earlier return: !state.available |
| 87:40 FileView | Button t('Open', '打开') | onClick=() =&gt; void manager.load((state.path === '/' ? '' : state.path) + '/' + entry.name, 1) | disabled=blocked; {"kind":"repeat","expression":"state.entries"}; {"kind":"logical","expression":"entry.type === 'directory'","operator":"&&"}; earlier retur… |
| 88:37 FileView | Button t('Edit', '编辑') | onClick=() =&gt; { setSaveName(''); void manager.open(entry.name); } | disabled=blocked &#124;&#124; entry.bytes &gt; 1048576; {"kind":"repeat","expression":"state.entries"}; {"kind":"logical","expression":"entry.type === 'file'… |
| 88:198 FileView | Button t('Download', '下载') | onClick=() =&gt; void manager.download(entry.name, receive) | disabled=blocked &#124;&#124; entry.bytes &gt; 20971520; {"kind":"repeat","expression":"state.entries"}; {"kind":"logical","expression":"entry.type === 'file… |
| 88:359 FileView | Button t('Stream save', '流式保存') | onClick=() =&gt; { if (openDownload) void manager.downloadTo(entry.name, () =&gt; openDownload(entry.name)); } | disabled=blocked &#124;&#124; !openDownload; {"kind":"repeat","expression":"state.entries"}; {"kind":"logical","expression":"entry.type === 'file'","operator… |
| 88:562 FileView | Button t('Submit text for review','提交文本审核') | onClick=()=&gt;void importer?.select((state.path==='/'?'':state.path)+'/'+entry.name) | disabled=blocked &#124;&#124; !importer &#124;&#124; entry.bytes&gt;131072 &#124;&#124; !entry.bytes; {"kind":"repeat","expression":"state.entries"}; {"kind"… |
| 88:789 FileView | Button t('Import asset','导入资产') | onClick=()=&gt;void assetImporter?.select((state.path==='/'?'':state.path)+'/'+entry.name) | disabled=blocked &#124;&#124; !assetImporter &#124;&#124; entry.bytes&gt;20971520 &#124;&#124; !entry.bytes; {"kind":"repeat","expression":"state.entries"}; … |
| 89:58 FileView | Button t('Rename', '重命名') | onClick=() =&gt; openModal('rename', entry.name) | disabled=blocked; {"kind":"repeat","expression":"state.entries"}; {"kind":"logical","expression":"['file', 'directory'].includes(entry.type)","operator":"&&"… |
| 89:162 FileView | Button t('Remove', '删除') | onClick=() =&gt; openModal('remove', entry.name) | disabled=blocked; {"kind":"repeat","expression":"state.entries"}; {"kind":"logical","expression":"['file', 'directory'].includes(entry.type)","operator":"&&"… |
| 93:7 FileView | Button t('Previous', '上一页') | onClick=() =&gt; void manager.load(state.path, state.page - 1) | disabled=blocked &#124;&#124; state.page &lt;= 1; earlier return: !state.available |
| 95:7 FileView | Button t('Next', '下一页') | onClick=() =&gt; void manager.load(state.path, state.page + 1) | disabled=blocked &#124;&#124; state.page &gt;= state.pages; earlier return: !state.available |
| 96:7 FileView | Select  | onChange=event =&gt; void manager.load(state.path, 1, Number(event.target.value) as 20 &#124; 50 &#124; 100) | disabled=blocked; earlier return: !state.available |
| 96:224 FileView | option size |  | {"kind":"container","tag":"Select","attributes":{"disabled":"blocked"}}; {"kind":"repeat","expression":"[20, 50, 100]"}; earlier return: !state.available |
| 99:23 FileView | Button t('Recover pending asset (read only)','恢复未决资产（只读）') | onClick=()=&gt;void assetImporter.recover() | disabled=blocked; {"kind":"logical","expression":"assetImporter","operator":"&&"}; earlier return: !state.available |
| 102:7 FileView | Textarea  | onChange=event =&gt; manager.edit(event.target.value) | disabled=state.busy; {"kind":"logical","expression":"state.editor","operator":"&&"}; earlier return: !state.available |
| 103:45 FileView | Button t('Save', '保存') | onClick=() =&gt; void manager.save() | disabled=state.busy &#124;&#124; state.editor.conflict &#124;&#124; !state.editor.dirty; {"kind":"logical","expression":"state.editor","operator":"&&"}; earl… |
| 104:9 FileView | Button t('Reload (discard draft)', '重新加载（丢弃草稿）') | onClick=() =&gt; void manager.open(state.editor!.name) | disabled=state.busy; {"kind":"logical","expression":"state.editor","operator":"&&"}; earlier return: !state.available |
| 105:9 FileView | Button t('Discard draft / close', '丢弃草稿 / 关闭') | onClick=() =&gt; { manager.closeEditor(); setSaveName(''); } | disabled=state.busy; {"kind":"logical","expression":"state.editor","operator":"&&"}; earlier return: !state.available |
| 106:43 FileView | Input  | onChange=event =&gt; setSaveName(event.target.value) | disabled=state.busy; {"kind":"logical","expression":"state.editor","operator":"&&"}; earlier return: !state.available |
| 107:7 FileView | Button t('Save as new file', '另存为新文件') | onClick=() =&gt; { void manager.saveAs(saveName); setSaveName(''); } | disabled=state.busy &#124;&#124; !saveName.trim(); {"kind":"logical","expression":"state.editor","operator":"&&"}; earlier return: !state.available |
| 110:5 FileView | Dialog  | onOpenChange=open =&gt; { if (!open) { setModal(null); setName(''); } } | open=modal?.epoch === state.epoch; earlier return: !state.available |
| 112:141 FileView | Input  | onChange=event =&gt; setName(event.target.value) | {"kind":"container","tag":"Dialog","attributes":{"open":"modal?.epoch === state.epoch"}}; {"kind":"branch","expression":"modal?.action === 'remove'","branch"… |
| 113:35 FileView | Button t('Confirm', '确认') | onClick=confirm | disabled=state.busy &#124;&#124; (modal?.action !== 'remove' && !name.trim()); {"kind":"container","tag":"Dialog","attributes":{"open":"modal?.epoch === stat… |
| 113:178 FileView | Button t('Cancel', '取消') | onClick=() =&gt; { setModal(null); setName(''); } | {"kind":"container","tag":"Dialog","attributes":{"open":"modal?.epoch === state.epoch"}}; earlier return: !state.available |

## frontend/features/environments/files/knowledge-import-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 18:12 KnowledgeImportPanel | p t('Waiting for receipt…','等待回执…') |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"busy","operator":"&&"}; earlier return: state.kind===… |
| 21:7 KnowledgeImportPanel | pre state.preview.draft.content |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.preview","operator":"&&"}; earlier return: stat… |
| 22:49 KnowledgeImportPanel | Input  | onChange=e=&gt;setTitle(e.target.value) | disabled=!editable; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.preview","operator":"&&"}; … |
| 23:99 KnowledgeImportPanel | Input  | onChange=e=&gt;setSpace(e.target.value) | disabled=!editable; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.preview","operator":"&&"}; … |
| 24:98 KnowledgeImportPanel | Select  | onChange=e=&gt;setVisibility(e.target.value as 'shared'&#124;'admin_only') | disabled=!editable; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.preview","operator":"&&"}; … |
| 24:215 KnowledgeImportPanel | option t('Shared','共享') |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.preview","operator":"&&"}; {"kind":"container",… |
| 24:265 KnowledgeImportPanel | option t('Administrators only','仅管理员') |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.preview","operator":"&&"}; {"kind":"container",… |
| 25:49 KnowledgeImportPanel | input  | onChange=e=&gt;setAck(e.target.checked); type="checkbox" | disabled=!editable; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.preview","operator":"&&"}; … |
| 26:18 KnowledgeImportPanel | Button t('Confirm submission for review','确认提交审核') | onClick=()=&gt;void model.confirm({title,target:{requestedSpaceId:space,requestedCollectionId:null,requestedVisibility:visibility},acknowledged:ack}) | disabled=!ack&#124;&#124;!title.trim()&#124;&#124;!space.trim(); {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","e… |
| 28:19 KnowledgeImportPanel | p state.error==='IMPORT_OUTCOME_UNKNOWN'?t('Outcome unknown. Check My submissions, or explicitly retry the same key and original payload. Closing the session c… |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.error","operator":"&&"}; earlier return: state.… |
| 29:30 KnowledgeImportPanel | Button t('Retry original submission','重试原提交') | onClick=()=&gt;void model.retry() | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.kind==='unknown'","operator":"&&"}; earlier ret… |
| 30:32 KnowledgeImportPanel | p t('Submission record received; inspect its review status:','已收到提交记录，请查看审核状态：') / state.receipt?.id |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.kind==='submitted'","operator":"&&"}; earlier r… |
| 31:58 KnowledgeImportPanel | a t('My submissions','我的提交') | href="/my-submissions" | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"(state.kind==='unknown'&#124;&#124;state.kind==='subm… |
| 32:37 KnowledgeImportPanel | Button t('Close','关闭') | onClick=()=&gt;model.close() | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"!busy&&state.kind!=='unknown'","operator":"&&"}; earl… |

## frontend/features/environments/files/stream-download.mjs

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 15:3 writeFileDownload | signal?.addEventListener  | 'abort', onAbort, {once:true} |  |
| 22:42 writeFileDownload | signal?.addEventListener  | 'abort', stop, {once:true} |  |

## frontend/features/environments/network-lifecycle.mjs

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 67:2 createVmNetworkLifecycle | events?.addEventListener  | 'offline', offline |  |
| 68:2 createVmNetworkLifecycle | events?.addEventListener  | 'pagehide', pagehide |  |

## frontend/features/environments/storage/checkpoints.mjs

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 49:42 createCheckpointStore | signal?.addEventListener  | 'abort', abort, {once:true} |  |
| 128:3 createCheckpointStore | owner.signal.addEventListener  | 'abort', close, {once:true} |  |

## frontend/features/environments/storage/reconcile-checkpoints.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 30:80 reconcileAccountCheckpoints | cancel.addEventListener  | 'abort', abort, {once:true} |  |

## frontend/lib/admin-roles-controller.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 61:5 useAdminRolesController | owner.addEventListener  | "beforeunload", warn |  |

## frontend/lib/asset-upload-transport.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 26:7 xhrUploadRequester | init.signal?.addEventListener  | "abort", abort, { once: true } | earlier return: init.signal?.aborted |

## frontend/lib/hooks/use-hover-capable.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 18:5 useHoverCapable | mq.addEventListener  | "change", update | earlier return: typeof window === "undefined" &#124;&#124; !window.matchMedia |

## frontend/lib/list-mode.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 19:3 subscribe | query.addEventListener  | "change", onChange | earlier return: !supportsMatchMedia() |

## frontend/lib/use-create-draft.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 55:5 useCreateDraft | owner.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, committed |  |
| 56:5 useCreateDraft | owner.addEventListener  | "beforeunload", warn |  |
| 84:19 useCreateDraft | ConfirmAction  | onCancel=cancel; onConfirm=confirm | open=decision !== null |

## frontend/lib/use-notification-summary.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 40:5 useNotificationSummary | window.addEventListener  | "focus", focus | earlier return: !enabled &#124;&#124; deniedScope.current === scope |
| 41:5 useNotificationSummary | document.addEventListener  | "visibilitychange", visibility | earlier return: !enabled &#124;&#124; deniedScope.current === scope |

## frontend/lib/use-reader-note-shares.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 129:19 useReaderNoteShares | ConfirmAction  | onCancel=cancel; onConfirm=confirm | open=decision !== null |

## frontend/lib/use-saved-views.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 121:41 useSavedViews | ConfirmAction  | onCancel=cancelDelete; onConfirm=confirmDelete | open=deletion !== null |

## frontend/lib/use-toast.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 29:7 ToastProvider | AnimatedToastStack  | onDismiss=stack.dismissToast |  |

## frontend/lib/workspace-browser-history.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 122:3 createWorkspaceBrowserHistory | owner.addEventListener  | "popstate", observe |  |
| 123:3 createWorkspaceBrowserHistory | owner.addEventListener  | "hashchange", observe |  |
| 124:3 createWorkspaceBrowserHistory | native?.addEventListener  | "currententrychange", observe |  |

## frontend/lib/workspace-location.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 63:3 subscribeWorkspaceHistoryFault | owner.addEventListener  | WORKSPACE_HISTORY_FAULT_EVENT, listener |  |
| 112:3 subscribeWorkspaceLocation | owner.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, listener |  |

## frontend/pages/admin/admin-dashboard-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 26:16 AdminDashboardPage | Button frontendText(locale, "ADMIN_METRIC_REFRESH") | onClick=onRefresh | disabled=pending |
| 35:43 AdminDashboardPage | p frontendText(locale, "ADMIN_METRIC_LOADING") |  | {"kind":"repeat","expression":"cards"}; {"kind":"container","tag":"Card","attributes":{"aria-busy":"metric.kind === \"loading\""}}; {"kind":"logical","expres… |
| 40:41 AdminDashboardPage | div  |  | {"kind":"repeat","expression":"cards"}; {"kind":"container","tag":"Card","attributes":{"aria-busy":"metric.kind === \"loading\""}}; {"kind":"logical","expres… |
| 41:15 AdminDashboardPage | Button frontendText(locale, "COMMON_RETRY") | onClick=() =&gt; onRetry(key) | {"kind":"repeat","expression":"cards"}; {"kind":"container","tag":"Card","attributes":{"aria-busy":"metric.kind === \"loading\""}}; {"kind":"logical","expres… |
| 44:43 AdminDashboardPage | ButtonLink frontendText(locale, "ADMIN_METRIC_OPEN") | href=href | {"kind":"repeat","expression":"cards"}; {"kind":"container","tag":"Card","attributes":{"aria-busy":"metric.kind === \"loading\""}}; {"kind":"logical","expres… |
| 49:88 AdminDashboardPage | ButtonLink frontendText(locale, labelKey) | href=href | {"kind":"logical","expression":"links.length &gt; 0","operator":"&&"}; {"kind":"repeat","expression":"links"} |

## frontend/pages/admin/admin-dashboard-route.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 73:10 DashboardMetrics | AdminDashboardPage  | onRetry=load; onRefresh=() =&gt; { if (Object.keys(requests.current).length &gt; 0) return; metricKeys.forEach(load); } |  |

## frontend/pages/admin/analytics-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 15:17 AdminAnalyticsPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRefresh; type="button" | disabled=pending |
| 21:132 AdminAnalyticsPage | select  | onChange=(event) =&gt; onDaysChange?.(Number(event.target.value)) | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" &… |
| 21:338 AdminAnalyticsPage | option frontendText(locale, "ADMIN_ANALYTICS_RANGE_CUSTOM").replace("{days}", String(days)) |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; {"kind":"logical","expression":"![7, 14, 30].includes(days)","operator":"&&"}; ear… |
| 21:455 AdminAnalyticsPage | option frontendText(locale, "ADMIN_ANALYTICS_RANGE_7") |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" &… |
| 21:531 AdminAnalyticsPage | option frontendText(locale, "ADMIN_ANALYTICS_RANGE_14") |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" &… |
| 21:609 AdminAnalyticsPage | option frontendText(locale, "ADMIN_ANALYTICS_RANGE_30") |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" &… |
| 21:696 AdminAnalyticsPage | Button frontendText(locale, "ADMIN_ANALYTICS_REFRESH") | onClick=onRefresh; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; earlier return: state.kind === "loading"; earlier return: state.… |
| 23:33 AdminAnalyticsPage | p frontendText(locale, "ADMIN_ANALYTICS_STALE") |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; {"kind":"logical","expression":"(pending &#124;&#124; localError)","operator":"&&"… |
| 27:158 AdminAnalyticsPage | div retry |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; {"kind":"branch","expression":"localError","branch":"true"}; earlier return: state… |
| 27:316 AdminAnalyticsPage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" &… |
| 61:10 DailyChart | div  |  | earlier return: rows.length === 0 |

## frontend/pages/admin/asset-queue-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 34:164 AssetQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"branch","expression":"error","branch":"true"}; {"kind":"logical","expression":"onLoadRetry","operator":"&&"}; earlier return: loading |
| 36:72 AssetQueuePage | select  | onChange=(event) =&gt; onStatusChange?.(event.target.value as "" &#124; AdminAssetStatus) | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; earlier return: loading; earlier return: … |
| 36:282 AssetQueuePage | option All |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"container","tag":"select","attributes":{"disabled"… |
| 36:311 AssetQueuePage | option queued |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"container","tag":"select","attributes":{"disabled"… |
| 36:349 AssetQueuePage | option processing |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"container","tag":"select","attributes":{"disabled"… |
| 36:395 AssetQueuePage | option succeeded |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"container","tag":"select","attributes":{"disabled"… |
| 36:439 AssetQueuePage | option failed_retryable |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"container","tag":"select","attributes":{"disabled"… |
| 36:497 AssetQueuePage | option failed_terminal |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"container","tag":"select","attributes":{"disabled"… |
| 36:592 AssetQueuePage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"recordBlocked","operator":"… |
| 36:754 AssetQueuePage | Button frontendText(locale, "ADMIN_ASSET_RETRY_RECORD_DISCARD") | onClick=onDiscardRecord; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"recordBlocked","operator":"… |
| 36:941 AssetQueuePage | p previewError &#124;&#124; retryError &#124;&#124; localError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"(previewError &#124;&#124; … |
| 36:1082 AssetQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"(previewE… |
| 36:1263 AssetQueuePage | div frontendText(locale, "ADMIN_ASSET_READ_REQUIRED") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"readRequired && !localError… |
| 36:1375 AssetQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"readRequi… |
| 36:1519 AssetQueuePage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"data","operator":"&&"}; ear… |
| 53:206 AssetQueuePage | Button previewLoading ? frontendText(locale, "ADMIN_ASSET_PREVIEW_LOADING") : frontendText(locale, "ADMIN_ASSET_PREVIEW") | onClick=() =&gt; onPreview?.(asset.id) | disabled=pending &#124;&#124; previewLoading; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logi… |
| 53:553 AssetQueuePage | Button frontendText(locale, "ADMIN_ASSET_RETRY") | onClick=() =&gt; request(asset) | disabled=!onRetry &#124;&#124; pending &#124;&#124; forbidden &#124;&#124; pendingIds.includes(asset.id); {"kind":"container","tag":"section","attributes":{"… |
| 55:84 AssetQueuePage | ConfirmAction  | onCancel=cancel; onConfirm=confirm | open=valid; earlier return: loading; earlier return: error |

## frontend/pages/admin/audit-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 13:28 AuditPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry; type="button" | disabled=pending; {"kind":"logical","expression":"onRetry","operator":"&&"} |
| 18:72 AuditPage | select  | onChange=(event) =&gt; onActionChange?.(event.target.value) | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; earlier return: state.kind === "loading"; earlier return: state.… |
| 18:257 AuditPage | option All |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; {"kind":"container","tag":"select","attributes":{"disabled":"pending"}}; earlier r… |
| 18:310 AuditPage | option value |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; {"kind":"container","tag":"select","attributes":{"disabled":"pending"}}; {"kind":"… |
| 20:5 AuditPage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |

## frontend/pages/admin/create-role-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 55:5 AdminRoleCreatePage | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 83:7 AdminRoleCreatePage | Button ← / frontendText(locale, "ADMIN_ROLES_LIST") | onClick=back; type="button" |  |
| 86:22 AdminRoleCreatePage | div  |  | {"kind":"logical","expression":"draftBlocked","operator":"&&"} |
| 86:158 AdminRoleCreatePage | Button frontendText(locale, "ADMIN_ROLE_DRAFT_RECORD_DISCARD") | onClick=discardDraft; type="button" | {"kind":"logical","expression":"draftBlocked","operator":"&&"} |
| 87:21 AdminRoleCreatePage | p draftNotice |  | {"kind":"logical","expression":"draftNotice","operator":"&&"} |
| 89:7 AdminRoleCreatePage | Input  | onChange=(value) =&gt; draft.edit("newKey", value) | disabled=locked |
| 90:7 AdminRoleCreatePage | Input  | onChange=(value) =&gt; draft.edit("newName", value) | disabled=locked |
| 91:7 AdminRoleCreatePage | Input  | onChange=(value) =&gt; draft.edit("newMask", value) | disabled=locked |
| 92:250 AdminRoleCreatePage | Checkbox  | onCheckedChange=() =&gt; toggle(key) | disabled=locked; {"kind":"repeat","expression":"permissionGroups"}; {"kind":"repeat","expression":"group.keys"} |
| 93:21 AdminRoleCreatePage | p saveError |  | {"kind":"logical","expression":"saveError","operator":"&&"} |
| 95:9 AdminRoleCreatePage | Button saving ? frontendText(locale, "ADMIN_ROLES_SAVING") : frontendText(locale, "ADMIN_ROLES_CREATE") | onClick=() =&gt; { void submit(); }; type="button" | disabled=locked &#124;&#124; !onCreate &#124;&#124; !newKey &#124;&#124; !newName |
| 96:9 AdminRoleCreatePage | Button frontendText(locale, "COMMON_CANCEL") | onClick=back; type="button" | disabled=locked |
| 99:23 AdminRoleCreatePage | div  |  | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 99:178 AdminRoleCreatePage | Button frontendText(locale, "ADMIN_ROLES_RECORD_DISCARD") | onClick=onDiscardRecord; type="button" | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 100:64 AdminRoleCreatePage | p frontendText(locale, "ADMIN_ROLES_READ_REQUIRED") |  | {"kind":"logical","expression":"(readRequired &#124;&#124; saveError)","operator":"&&"} |
| 100:136 AdminRoleCreatePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=readPending; {"kind":"logical","expression":"(readRequired &#124;&#124; saveError)","operator":"&&"} |

## frontend/pages/admin/duplicate-queue-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 55:155 DuplicateQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"}; {"kind":"logical","expression":"onLoadRetry","operator":"&&"}; earlier return: sta… |
| 60:33 DuplicateQueuePage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"decisionRecordBlocked","ope… |
| 60:200 DuplicateQueuePage | Button frontendText(locale, "ADMIN_DUPLICATE_RECORD_DISCARD") | onClick=onDiscardDecisionRecord; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"decisionRecordBlocked","ope… |
| 61:22 DuplicateQueuePage | p localError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"localError","operator":"&&"… |
| 62:24 DuplicateQueuePage | p frontendText(locale, "ADMIN_DUPLICATE_READ_REQUIRED") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"readRequired","operator":"&… |
| 63:55 DuplicateQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=pending &#124;&#124; Boolean(pendingId); {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"… |
| 64:7 DuplicateQueuePage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; earlier return: state.kind === "loading"; earlier return: s… |
| 94:15 DuplicateQueuePage | Button label("associate") | onClick=() =&gt; request(item, "associate") | disabled=itemPending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; earlier return: state.kind === "loadi… |
| 95:15 DuplicateQueuePage | Button label("keep_separate") | onClick=() =&gt; request(item, "keep_separate") | disabled=itemPending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; earlier return: state.kind === "loadi… |
| 96:15 DuplicateQueuePage | Button label("reject") | onClick=() =&gt; request(item, "reject") | disabled=itemPending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; earlier return: state.kind === "loadi… |
| 102:5 DuplicateQueuePage | ConfirmAction  | onCancel=cancel; onConfirm=confirm | open=valid; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |

## frontend/pages/admin/members-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 119:164 MembersPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"branch","expression":"error","branch":"true"}; {"kind":"logical","expression":"onLoadRetry","operator":"&&"}; earlier return: loading |
| 122:72 MembersPage | select  | onChange=(event) =&gt; onStatusFilterChange?.(event.target.value as "" &#124; "active" &#124; "disabled") | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; earlier … |
| 122:294 MembersPage | option All |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"container","tag":… |
| 122:323 MembersPage | option Active |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"container","tag":… |
| 122:361 MembersPage | option Disabled |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"container","tag":… |
| 123:29 MembersPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"logical","express… |
| 123:195 MembersPage | Button frontendText(locale, "ADMIN_MEMBER_STATUS_RECORD_DISCARD") | onClick=onDiscardStatusRecord; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"logical","express… |
| 124:52 MembersPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"logical","express… |
| 124:275 MembersPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":… |
| 125:5 MembersPage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; earlier return: loading; e… |
| 144:530 MembersPage | Button actionLabel | onClick=() =&gt; requestStatusConfirmation(member) | disabled=itemPending &#124;&#124; forbidden &#124;&#124; !onStatusChange; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation … |
| 148:299 MembersPage | Button frontendText(locale, "ADMIN_INVITATION_ADD") | onClick=() =&gt; setAddOpen(true); type="button" | aria-expanded=addOpen; disabled=pending &#124;&#124; invitationWritePending &#124;&#124; forbidden &#124;&#124; !onIssueInvitation; {"kind":"container","tag"… |
| 149:27 MembersPage | p invitationError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"container","tag":… |
| 152:166 MembersPage | Button frontendText(locale, copied ? "ADMIN_INVITATION_CODE_COPIED" : "ADMIN_INVITATION_CODE_COPY") | onClick=() =&gt; void copyCode(issuedInvitation.code); type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"container","tag":… |
| 153:24 MembersPage | p frontendText(locale, "ADMIN_INVITATION_CODE_COPY_FAILED") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"container","tag":… |
| 158:11 MembersPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"container","tag":… |
| 158:128 MembersPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadInvitationsRetry; type="button" | disabled=invitationWritePending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefin… |
| 160:483 MembersPage | Button frontendText(locale, "ADMIN_INVITATION_REVOKE") | onClick=() =&gt; requestRevokeConfirmation(invitation) | disabled=invitationWritePending &#124;&#124; pending &#124;&#124; forbidden &#124;&#124; !onRevokeInvitation; {"kind":"container","tag":"section","attributes… |
| 165:5 MembersPage | Dialog  | onOpenChange=(next) =&gt; { if (!next) setAddOpen(false); } | open=addOpen; earlier return: loading; earlier return: error |
| 166:7 MembersPage | DialogContent  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"addOpen"}}; earlier return: loading; earlier return: error |
| 170:11 MembersPage | Input  | onChange=(value) =&gt; setEmail(value); type="email" | disabled=pending &#124;&#124; invitationWritePending &#124;&#124; forbidden &#124;&#124; !onIssueInvitation; {"kind":"container","tag":"Dialog","attributes":… |
| 173:11 MembersPage | Button frontendText(locale, "COMMON_CANCEL") | onClick=() =&gt; setAddOpen(false); type="button" | {"kind":"container","tag":"Dialog","attributes":{"open":"addOpen"}}; earlier return: loading; earlier return: error |
| 174:11 MembersPage | Button frontendText(locale, "ADMIN_INVITATION_GENERATE") | onClick=requestInviteConfirmation; type="button" | disabled=!email.trim() &#124;&#124; pending &#124;&#124; invitationWritePending &#124;&#124; forbidden &#124;&#124; !onIssueInvitation; {"kind":"container","… |
| 178:5 MembersPage | ConfirmAction  | onCancel=cancelConfirmation; onConfirm=confirmAction | open=validConfirmation; earlier return: loading; earlier return: error |

## frontend/pages/admin/menu-editor.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 60:197 MenuEditor | select  | onChange=event =&gt; formDraft.edit(name, event.target.value) |  |
| 60:375 MenuEditor | option choice.label |  | {"kind":"repeat","expression":"choices"} |
| 61:66 MenuEditor | Input  | onChange=value =&gt; formDraft.edit(name, value); type=name === "position" ? "number" : "text" |  |
| 63:12 MenuEditor | Dialog  | onOpenChange=(next) =&gt; { if (!next) requestCancel(); } | open=true |
| 63:82 MenuEditor | DialogContent  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; spread: (menu ? { "data-menu-edit-dialog": "" } : { "data-menu-create-dialog": "" }) |
| 65:5 MenuEditor | form  | onSubmit=async event =&gt; { event.preventDefault(); if (!alive.current &#124;&#124; disabled &#124;&#124; submitting.current &#124;&#124; confirmationRef.cu… | aria-hidden=validConfirmation &#124;&#124; undefined; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}} |
| 86:16 MenuEditor | Switch  | onCheckedChange=checked =&gt; formDraft.edit("visible", checked ? "true" : "false") | disabled=disabled; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfi… |
| 89:17 MenuEditor | p text("ADMIN_MENUS_INVALID") |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124… |
| 90:38 MenuEditor | Button text(menu ? "ADMIN_MENUS_SAVE_FULL" : "ADMIN_MENUS_CREATE_SUBMIT") | type="submit" | disabled=disabled; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfi… |
| 90:157 MenuEditor | Button text("ADMIN_MENUS_CANCEL") | onClick=requestCancel; type="button" | disabled=pending; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfir… |
| 92:28 MenuEditor | ConfirmAction  | onCancel=cancelConfirmation; onConfirm=confirmAction | open=validConfirmation |

## frontend/pages/admin/menus-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 19:157 AdminMenusPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"}; {"kind":"logical","expression":"onLoadRetry","operator":"&&"}; earlier return: sta… |
| 20:10 AdminMenusPage | ReadyMenus  |  | earlier return: state.kind === "loading"; earlier return: state.kind !== "ready"; spread: { locale, onLoadRetry, onUpdate, onDelete, onCreate, pendingId, err… |
| 79:5 ReadyMenus | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 104:40 ReadyMenus | div  |  | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 104:200 ReadyMenus | Button frontendText(locale, "ADMIN_MENUS_RECORD_DISCARD") | onClick=onDiscardRecord; type="button" | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 104:394 ReadyMenus | p error &#124;&#124; frontendText(locale, "ADMIN_MENUS_READ_REQUIRED") |  | {"kind":"logical","expression":"(error &#124;&#124; readRequired)","operator":"&&"} |
| 104:527 ReadyMenus | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=readPending; {"kind":"logical","expression":"(error &#124;&#124; readRequired)","operator":"&&"}; {"kind":"logical","expression":"onLoadRetry","oper… |
| 108:150 ReadyMenus | Button frontendText(locale, "ADMIN_MENUS_CREATE") | onClick=() =&gt; setEditor({}); type="button" | aria-expanded=Boolean(editor) && !editor?.menu; disabled=busy &#124;&#124; Boolean(editor) &#124;&#124; countMenus(menus) &gt;= 200; {"kind":"container","tag… |
| 110:22 ReadyMenus | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftBlocked","… |
| 110:163 ReadyMenus | Button frontendText(locale, "ADMIN_MENU_DRAFT_RECORD_DISCARD") | onClick=discardDraft; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftBlocked","… |
| 111:21 ReadyMenus | p draftNotice |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftNotice","o… |
| 112:16 ReadyMenus | MenuEditor  | onFields=reportFields; onCancel=() =&gt; { setEditor(null); setLive(null); }; onSave=async input =&gt; { const saved = editor.menu ? await onUpdate?.(editor.… | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"editor","operat… |
| 117:13 ReadyMenus | ConfirmAction  | onCancel=cancelConfirmation; onConfirm=confirmAction | open=validConfirmation |
| 135:18 menuBranch | MenuNodeActions  |  | spread: props |
| 158:331 MenuNodeActions | Button frontendText(locale, "ADMIN_MENUS_EDIT") | onClick=() =&gt; { if (!busy && !rowDraft.isConfirming()) onEdit(menu); }; type="button" | aria-expanded=editingMenuId === menu.id; disabled=busy; {"kind":"logical","expression":"onEdit && !menu.isSystem","operator":"&&"} |
| 158:737 MenuNodeActions | input  | onChange=(event) =&gt; rowDraft.edit("position", event.target.value); type="number" | disabled=menu.isSystem &#124;&#124; busy |
| 158:976 MenuNodeActions | Button frontendText(locale, "ADMIN_MENUS_SAVE") | onClick=() =&gt; { const value = rowDraft.current.current.position; const position = Number(value); if (value.trim() && Number.isSafeInteger(position) && pos… | disabled=menu.isSystem &#124;&#124; busy &#124;&#124; position === menu.position &#124;&#124; !rowDraft.fields.position.trim() &#124;&#124; !Number.isSafeInt… |
| 158:1490 MenuNodeActions | Button menu.status === "active" ? frontendText(locale, "ADMIN_MENUS_DISABLE") : frontendText(locale, "ADMIN_MENUS_ENABLE") | onClick=() =&gt; update({ status: menu.status === "active" ? "disabled" : "active", expected: menuSnapshot(menu) }); type="button" | disabled=menu.isSystem &#124;&#124; busy |
| 158:1812 MenuNodeActions | Button frontendText(locale, menu.visible ? "ADMIN_MENUS_HIDE" : "ADMIN_MENUS_SHOW") | onClick=() =&gt; update({ visible: !menu.visible, expected: menuSnapshot(menu) }); type="button" | disabled=menu.isSystem &#124;&#124; busy |
| 158:2110 MenuNodeActions | Button frontendText(locale, "ADMIN_MENUS_DELETE") | onClick=() =&gt; { if (!busy && !rowDraft.isConfirming()) onDelete?.(menu); }; type="button" | disabled=busy; {"kind":"logical","expression":"!menu.isSystem && menu.children.length === 0","operator":"&&"} |

## frontend/pages/admin/review-detail-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 27:92 ReviewDetailPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"}; {"kind":"logical","expression":"(state.kind !== \"not-found\" &#124;&#124; unresol… |
| 28:9 ReviewDetailPage | ButtonLink frontendText(locale, "ADMIN_REVIEW_BACK") | onClick=(event) =&gt; { if (!onBack &#124;&#124; event.defaultPrevented &#124;&#124; event.button !== 0 &#124;&#124; event.metaKey &#124;&#124; event.ctrlKey… | {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"}; earlier return: state.kind === "loading" |
| 44:31 ReviewDetailPage | div  |  | {"kind":"logical","expression":"decisionRecordBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 44:201 ReviewDetailPage | Button frontendText(locale, "ADMIN_REVIEW_DECISION_RECORD_DISCARD") | onClick=onDiscardDecisionRecord; type="button" | {"kind":"logical","expression":"decisionRecordBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 45:30 ReviewDetailPage | p decisionRecordNotice |  | {"kind":"logical","expression":"decisionRecordNotice","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 46:5 ReviewDetailPage | ReviewDecisionFeedback  | onRetry=onRetryDecision; onReload=onRetry | earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 48:7 ReviewDetailPage | ReviewDecisionControls  | onDecision=onDecision | disabled=reviewDecisionLocked(decisionState); earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |

## frontend/pages/admin/review-detail-route.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 43:5 ReviewDetailSession | window.addEventListener  | "beforeunload", warn |  |
| 156:10 ReviewDetailSession | ReviewDetailPage  | onBack=() =&gt; writeWorkspaceHistory("push", "/admin/submissions"); onRetry=() =&gt; { void read(); }; onRetryDecision=() =&gt; { if (decisionState.kind ===… |  |

## frontend/pages/admin/review-queue-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 24:17 ReviewQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry; type="button" | disabled=pending |
| 30:31 ReviewQueuePage | div  |  | {"kind":"logical","expression":"decisionRecordBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 30:201 ReviewQueuePage | Button frontendText(locale, "ADMIN_REVIEW_DECISION_RECORD_DISCARD") | onClick=onDiscardDecisionRecord; type="button" | {"kind":"logical","expression":"decisionRecordBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 31:5 ReviewQueuePage | ReviewDecisionFeedback  | onRetry=onRetryDecision; onReload=onReloadDecision | earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 32:22 ReviewQueuePage | p localError |  | {"kind":"logical","expression":"localError","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 33:5 ReviewQueuePage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 50:13 ReviewQueuePage | a item.title?.trim() &#124;&#124; frontendText(locale, "ADMIN_REVIEW_UNTITLED") | onClick=(event) =&gt; { if (!onOpenDetail &#124;&#124; event.defaultPrevented &#124;&#124; event.button !== 0 &#124;&#124; event.metaKey &#124;&#124; event.c… | earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 61:18 ReviewQueuePage | ReviewDecisionControls  | onDecision=onReview ? (action, details) =&gt; onReview(item.id, action, details) : undefined | disabled=disabled; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |

## frontend/pages/admin/role-detail-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 42:157 AdminRoleDetailPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"}; {"kind":"logical","expression":"onLoadRetry","operator":"&&"}; earlier return: sta… |
| 44:174 AdminRoleDetailPage | Button frontendText(locale, "ADMIN_ROLES_LIST") | onClick=onBack; type="button" | {"kind":"branch","expression":"!role","branch":"true"}; {"kind":"logical","expression":"onBack","operator":"&&"}; earlier return: state.kind === "loading"; e… |
| 45:10 AdminRoleDetailPage | RolePermissionEditor  | onBack=onBack; onLoadRetry=onLoadRetry; onSave=onSave; onAssignMember=onAssignMember; onUnassignMember=onUnassignMember; onDiscardRecord=onDiscardRecord | earlier return: state.kind === "loading"; earlier return: state.kind !== "ready"; earlier return: !role |
| 73:5 RolePermissionEditor | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 140:22 RolePermissionEditor | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftBlocked","… |
| 140:158 RolePermissionEditor | Button frontendText(locale, "ADMIN_ROLE_DRAFT_RECORD_DISCARD") | onClick=discardDraft; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftBlocked","… |
| 141:21 RolePermissionEditor | p draftNotice |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftNotice","o… |
| 143:7 RolePermissionEditor | Button ← / frontendText(locale, "ADMIN_ROLES_LIST") | onClick=() =&gt; (onBack ? onBack() : writeWorkspaceHistory("push", "/admin/roles")); type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}} |
| 147:713 RolePermissionEditor | Checkbox  | onChange=() =&gt; toggle(key) | disabled=(role.isSystem && !canGrantWorkbench(key)) &#124;&#124; locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &… |
| 148:179 RolePermissionEditor | p frontendText(locale, "ADMIN_ROLES_DIRTY_MEMBERSHIP") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"dirtyPermission… |
| 148:535 RolePermissionEditor | Button frontendText(locale, "ADMIN_ROLES_UNASSIGN_MEMBER") | onClick=() =&gt; requestConfirmation({ kind: "unassign", memberId: id }); type="button" | disabled=locked &#124;&#124; dirtyPermissions &#124;&#124; !onUnassignMember; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmat… |
| 148:1000 RolePermissionEditor | Input  | onChange=(event) =&gt; setMemberId(event.target.value) | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression"… |
| 148:1236 RolePermissionEditor | Button frontendText(locale, "ADMIN_ROLES_ASSIGN_MEMBER") | onClick=() =&gt; requestConfirmation({ kind: "assign", memberId: memberId.trim() }); type="button" | disabled=locked &#124;&#124; dirtyPermissions &#124;&#124; !onAssignMember &#124;&#124; !memberId.trim() &#124;&#124; assignedMemberIds.includes(memberId.tri… |
| 149:21 RolePermissionEditor | p saveError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"saveError","ope… |
| 150:7 RolePermissionEditor | Button saving ? frontendText(locale, "ADMIN_ROLES_SAVING") : frontendText(locale, "ADMIN_ROLES_SAVE") | onClick=() =&gt; requestConfirmation({ kind: "save" }); type="button" | disabled=(role.isSystem && !systemWorkbenchGrant) &#124;&#124; locked &#124;&#124; !onSave; {"kind":"container","tag":"section","attributes":{"aria-hidden":"… |
| 152:13 RolePermissionEditor | ConfirmAction  | onCancel=cancelConfirmation; onConfirm=() =&gt; { void confirmAction(); } | open=validConfirmation |
| 156:99 RolePermissionEditor | div  |  | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 156:254 RolePermissionEditor | Button frontendText(locale, "ADMIN_ROLES_RECORD_DISCARD") | onClick=onDiscardRecord; type="button" | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 156:447 RolePermissionEditor | p frontendText(locale, "ADMIN_ROLES_READ_REQUIRED") |  | {"kind":"logical","expression":"(readRequired &#124;&#124; saveError)","operator":"&&"} |
| 156:519 RolePermissionEditor | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=readPending; {"kind":"logical","expression":"(readRequired &#124;&#124; saveError)","operator":"&&"} |

## frontend/pages/admin/roles-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 19:157 AdminRolesPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"}; {"kind":"logical","expression":"onLoadRetry","operator":"&&"}; earlier return: sta… |
| 22:16 AdminRolesPage | Button frontendText(locale, "ADMIN_ROLES_CREATE") | onClick=() =&gt; writeWorkspaceHistory("push", "/admin/roles/new"); type="button" | earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 37:13 AdminRolesPage | a role.name | onClick=(event) =&gt; { event.preventDefault(); writeWorkspaceHistory("push", adminRoleDetailPath(role.id)); }; href=adminRoleDetailPath(role.id) | earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |

## frontend/pages/admin/spaces-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 32:93 SpacesPage | Button frontendText(props.locale, "COMMON_RETRY") | onClick=props.onLoadRetry; type="button" | {"kind":"branch","expression":"props.error","branch":"true"}; {"kind":"logical","expression":"props.onLoadRetry","operator":"&&"}; earlier return: props.loading |
| 33:10 SpacesPage | SpacesEditor  |  | earlier return: props.loading; earlier return: props.error; spread: props |
| 89:5 SpacesEditor | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 130:239 SpacesEditor | Button frontendText(locale, "ADMIN_CREATE_SPACE") | onClick=openCreate; type="button" | aria-expanded=createOpen; disabled=locked &#124;&#124; Boolean(target); {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&… |
| 130:467 SpacesEditor | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"recordBlocked","oper… |
| 130:623 SpacesEditor | Button frontendText(locale, "ADMIN_SPACE_RECORD_DISCARD") | onClick=onDiscardRecord; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"recordBlocked","oper… |
| 130:774 SpacesEditor | p recordNotice |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"recordNotice","opera… |
| 130:863 SpacesEditor | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftBlocked","opera… |
| 130:1018 SpacesEditor | Button frontendText(locale, "ADMIN_SPACE_DRAFT_RECORD_DISCARD") | onClick=discardDraft; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftBlocked","opera… |
| 130:1171 SpacesEditor | p draftNotice |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftNotice","operat… |
| 130:1256 SpacesEditor | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"needsRead","operator… |
| 130:1332 SpacesEditor | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"ne… |
| 130:1467 SpacesEditor | Dialog  | onOpenChange=(next) =&gt; { if (!next) requestCloseCreate(); } | open=createOpen; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}} |
| 130:1555 SpacesEditor | DialogContent  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"container","tag":"Dialog","attributes":{"op… |
| 130:1799 SpacesEditor | form  | onSubmit=submit | aria-busy=createState === "pending" ? "true" : undefined; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefine… |
| 130:1925 SpacesEditor | Input  | onChange=(value) =&gt; createDraft.edit("name", value) | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"container","tag":"Dialog",… |
| 130:2121 SpacesEditor | Input  | onChange=(value) =&gt; createDraft.edit("slug", value) | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"container","tag":"Dialog",… |
| 130:2416 SpacesEditor | Button createState === "pending" ? frontendText(locale, "ADMIN_SPACE_CREATING") : frontendText(locale, "ADMIN_SPACE_CREATE") | type="submit" | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"container","tag":"Dialog",… |
| 130:2584 SpacesEditor | Button frontendText(locale, "ADMIN_SPACE_CANCEL") | onClick=requestCloseCreate; type="button" | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"container","tag":"Dialog",… |
| 130:2777 SpacesEditor | p frontendText(locale, "ADMIN_SPACE_CREATE_ERROR") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"container","tag":"Dialog","attributes":{"op… |
| 130:2946 SpacesEditor | RecordEditor  | onFields=reportFields; onCancel=() =&gt; { seedTarget.current = null; seedFields.current = null; setLive(null); setTarget(null); }; onSave=async command =&gt… | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"target && onManage",… |
| 130:4032 SpacesEditor | Button frontendText(locale, "ADMIN_SPACE_EDIT") / : / space.name | onClick=() =&gt; setTarget({ kind: "space", space }); type="button" | aria-expanded=target?.kind === "space" && target.space.id === space.id; disabled=locked &#124;&#124; createOpen &#124;&#124; Boolean(target) &#124;&#124; spa… |
| 130:4402 SpacesEditor | Button frontendText(locale, "ADMIN_COLLECTION_CREATE") / : / space.name | onClick=() =&gt; setTarget({ kind: "create-collection", space }); type="button" | aria-expanded=target?.kind === "create-collection" && target.space.id === space.id; disabled=locked &#124;&#124; createOpen &#124;&#124; Boolean(target) &#12… |
| 130:5309 SpacesEditor | Button frontendText(locale, "ADMIN_COLLECTION_EDIT") / : / collection.name | onClick=() =&gt; setTarget({ kind: "collection", space, collection }); type="button" | aria-expanded=target?.kind === "collection" && target.collection?.id === collection.id; disabled=locked &#124;&#124; createOpen &#124;&#124; Boolean(target) … |
| 130:5761 SpacesEditor | Button frontendText(locale, "ADMIN_LOAD_MORE") / : / space.name | onClick=() =&gt; onLoadCollections?.(space.id); type="button" | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"branch","expression":"spac… |
| 130:6118 SpacesEditor | Button frontendText(locale, "ADMIN_LOAD_MORE") | onClick=onLoadMore; type="button" | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"nex… |
| 130:6258 SpacesEditor | ConfirmAction  | onCancel=cancelDiscard; onConfirm=confirmDiscard | open=validDiscard |
| 203:12 RecordEditor | Dialog  | onOpenChange=(next) =&gt; { if (!next) requestCancel(); } | open=true |
| 203:82 RecordEditor | DialogContent  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}} |
| 205:5 RecordEditor | form  | onSubmit=submit | aria-hidden=validConfirmation &#124;&#124; undefined; aria-busy=pending &#124;&#124; undefined; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}} |
| 206:7 RecordEditor | Input  | onChange=value =&gt; set("name", value) | disabled=busy; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmat… |
| 207:35 RecordEditor | Input  | onChange=value =&gt; set("slug", value) | disabled=busy; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmat… |
| 208:7 RecordEditor | Input  | onChange=value =&gt; set("description", value) | disabled=busy; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmat… |
| 209:7 RecordEditor | Input  | onChange=value =&gt; set("position", value); type="number" | disabled=busy; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmat… |
| 210:102 RecordEditor | select  | onChange=event =&gt; set("status", event.currentTarget.value) | disabled=busy; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmat… |
| 210:294 RecordEditor | option frontendText(locale, "ADMIN_MENUS_ACTIVE") |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124… |
| 210:370 RecordEditor | option frontendText(locale, "ADMIN_MENUS_DISABLED") |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124… |
| 211:160 RecordEditor | select  | onChange=event =&gt; set("parentId", event.currentTarget.value) | disabled=busy; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmat… |
| 211:356 RecordEditor | option frontendText(locale, "ADMIN_COLLECTION_ROOT") |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124… |
| 211:504 RecordEditor | option frontendText(locale, "ADMIN_COLLECTION_CURRENT_PARENT") / : / draft.parentId |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124… |
| 211:644 RecordEditor | option item.name |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124… |
| 212:72 RecordEditor | Button frontendText(locale, "ADMIN_RECORD_SAVE") | type="submit" | disabled=busy; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmat… |
| 212:162 RecordEditor | Button frontendText(locale, "ADMIN_SPACE_CANCEL") | onClick=requestCancel; type="button" | disabled=busy; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmat… |
| 212:328 RecordEditor | p frontendText(locale, "ADMIN_RECORD_SAVE_ERROR") |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124… |
| 214:28 RecordEditor | ConfirmAction  | onCancel=cancelConfirmation; onConfirm=confirm | open=validConfirmation |

## frontend/pages/agent-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 32:5 AgentPage | form  | onSubmit=(event) =&gt; { event.preventDefault(); onSubmit?.(); } |  |
| 34:56 AgentPage | Input  | onChange=(event) =&gt; onQuestionChange?.(event.currentTarget.value) | disabled=state.kind === "loading" &#124;&#124; feedbackBlocked; {"kind":"container","tag":"form","attributes":{}} |
| 34:325 AgentPage | Button frontendText(locale, "AGENT_SUBMIT") | type="submit" | disabled=!onSubmit &#124;&#124; state.kind === "loading" &#124;&#124; feedbackBlocked; {"kind":"container","tag":"form","attributes":{}} |
| 36:37 AgentPage | AgentSourceControls  | onStartScope=onStartScope | disabled=state.kind === "loading" &#124;&#124; feedbackBlocked; {"kind":"logical","expression":"onStartScope && sourceDraft","operator":"&&"} |
| 37:151 AgentPage | Button frontendText(locale, "AGENT_STOP") | onClick=onCancel | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"true"} |
| 37:565 AgentPage | Button frontendText(locale, "AGENT_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"cancelled\"","branch":"false"};… |
| 59:5 AgentSourceControls | select  | onChange=(event) =&gt; { draft.edit("kind", event.currentTarget.value as AgentScope["kind"]); draft.edit("ids", ""); setInvalid(false); } | {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}} |
| 60:7 AgentSourceControls | option frontendText(locale, "AGENT_SCOPE_ALL") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}} |
| 60:77 AgentSourceControls | option frontendText(locale, "AGENT_SCOPE_SPACE") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}} |
| 60:151 AgentSourceControls | option frontendText(locale, "AGENT_SCOPE_COLLECTION") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}} |
| 60:235 AgentSourceControls | option frontendText(locale, "AGENT_SCOPE_ITEMS") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}} |
| 62:108 AgentSourceControls | Input  | onChange=(event) =&gt; draft.edit("ids", event.currentTarget.value) | {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}}; {"kind":"logical","expression":"kind !== \"… |
| 64:17 AgentSourceControls | p frontendText(locale, "AGENT_SCOPE_INVALID") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}}; {"kind":"logical","expression":"invalid","o… |
| 65:5 AgentSourceControls | Button frontendText(locale, "AGENT_SCOPE_APPLY") | onClick=apply; type="button" | disabled=disabled; {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}} |

## frontend/pages/boards/boards-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 38:29 BoardsPage | Button frontendText(locale, "BOARDS_MOVE_RECORD_DISCARD") | onClick=onDiscardRecord | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 43:9 BoardsPage | Button frontendText(locale, "BOARDS_MOVE_CHECK") | onClick=onCheckMove | disabled=recovering; {"kind":"logical","expression":"unknownMove","operator":"&&"} |
| 44:9 BoardsPage | Button frontendText(locale, "BOARDS_MOVE_RETRY") | onClick=onRetryMove | disabled=recovering; {"kind":"logical","expression":"unknownMove","operator":"&&"} |
| 48:22 BoardsPage | p actionNotice |  | {"kind":"logical","expression":"actionNotice","operator":"&&"} |
| 50:39 BoardsPage | BoardColumn  | onRetry=onRetry; onLoadMore=onLoadMore; onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onStatusChange=onStatusChange | {"kind":"repeat","expression":"BOARD_STATUSES"} |
| 71:108 BoardColumn | Button frontendText(locale, "BOARDS_RETRY") | onClick=() =&gt; onRetry(status) | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"} |
| 72:32 BoardColumn | ReadyColumn  | onRetry=onRetry; onLoadMore=onLoadMore; onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onStatusChange=onStatusChange | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"} |
| 94:7 ReadyColumn | div  | onKeyDown=(event) =&gt; { if (writeLocked &#124;&#124; event.target !== event.currentTarget) return; if (event.key !== "ArrowLeft" && event.key !== "ArrowRig… |  |
| 104:7 ReadyColumn | Select  | onChange=(event) =&gt; onStatusChange(task, event.currentTarget.value as BoardTargetStatus) | disabled=writeLocked |
| 111:124 ReadyColumn | Button frontendText(locale, "BOARDS_RETRY") | onClick=() =&gt; onRetry(status) | {"kind":"logical","expression":"state.loadError","operator":"&&"} |
| 113:7 ReadyColumn | DataTable  | onPageChange=onPageChange ? (page: number) =&gt; onPageChange(status, page) : undefined; onPageSizeChange=onPageSizeChange ? (pageSize: SupportedPageSize) =&… | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.pending &#124;&#124; undefined"}} |

## frontend/pages/calendar-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 36:84 CalendarPage | Button frontendText(locale, "CALENDAR_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"} |
| 37:33 CalendarPage | Dialog  | onOpenChange=next =&gt; { if (!next) setCreateOpen(false); } | open=createOpen; earlier return: state.kind === "error" |
| 38:5 CalendarPage | DialogContent  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; earlier return: state.kind === "error" |
| 41:29 CalendarPage | CalendarCreateForm  | onCreate=onCreate; onCreateReadback=onCreateReadback; onCreateDenied=onCreateDenied; onCreateLock=locked =&gt; { setCreateComposerLocked(locked); onCreateLoc… | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; earlier return: state.kind === "error" |
| 42:62 CalendarPage | Button frontendText(locale, "COMMON_CANCEL") | onClick=() =&gt; setCreateOpen(false); type="button" | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; earlier return: state.kind === "error" |
| 45:529 CalendarPage | Button frontendText(locale, "CALENDAR_CREATE_TITLE") | onClick=() =&gt; setCreateOpen(true); type="button" | aria-expanded=createOpen; disabled=createBlocked; earlier return: state.kind === "error" |
| 46:32 CalendarPage | CalendarRangeFilter  | onChange=next =&gt; { if (!controlsPending && !confirmation.isOpen()) onRangeChange(next); } | {"kind":"logical","expression":"range && onRangeChange","operator":"&&"}; earlier return: state.kind === "error" |
| 47:21 CalendarPage | div actionError |  | {"kind":"logical","expression":"actionError","operator":"&&"}; earlier return: state.kind === "error" |
| 48:113 CalendarPage | DataTable  | onPageChange=onPageChange ? changePage : undefined; onPageSizeChange=onPageSizeChange ? changePageSize : undefined; onLoadMore=onLoadMore ? loadMore : undefined | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; earlier return: state.kind === "error" |
| 67:164 CalendarPage | Button  | onClick=() =&gt; confirmation.request(event); type="button" | disabled=controlsPending; {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"event.status === \"sch… |

## frontend/pages/focus-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 43:5 FocusPage | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 66:84 FocusPage | Button frontendText(locale, "FOCUS_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 68:40 FocusPage | div  |  | {"kind":"branch","expression":"recordBlocked","branch":"true"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 68:142 FocusPage | button frontendText(locale, "FOCUS_DRAFT_RECORD_DISCARD") | onClick=discardRecord; type="button" | {"kind":"branch","expression":"recordBlocked","branch":"true"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 69:22 FocusPage | p recordNotice |  | {"kind":"branch","expression":"recordBlocked","branch":"false"}; {"kind":"branch","expression":"recordNotice","branch":"true"}; earlier return: state.kind ==… |
| 70:877 FocusPage | Button frontendText(locale, "FOCUS_PAUSE") | onClick=() =&gt; transition("pause") | disabled=controlsPending; {"kind":"branch","expression":"session","branch":"true"}; {"kind":"logical","expression":"session.status === \"active\"","operator"… |
| 70:1046 FocusPage | Button frontendText(locale, "FOCUS_RESUME") | onClick=() =&gt; transition("resume") | disabled=controlsPending; {"kind":"branch","expression":"session","branch":"true"}; {"kind":"logical","expression":"session.status === \"paused\"","operator"… |
| 70:1251 FocusPage | Button frontendText(locale, "FOCUS_COMPLETE") | onClick=() =&gt; confirmation.request("complete") | disabled=controlsPending; {"kind":"branch","expression":"session","branch":"true"}; {"kind":"logical","expression":"(session.status === \"active\" &#124;&#12… |
| 70:1404 FocusPage | Button frontendText(locale, "FOCUS_ABANDON") | onClick=() =&gt; confirmation.request("abandon") | disabled=controlsPending; {"kind":"branch","expression":"session","branch":"true"}; {"kind":"logical","expression":"(session.status === \"active\" &#124;&#12… |
| 70:1731 FocusPage | Button frontendText(locale, "FOCUS_CHOOSE_TASK") | onClick=() =&gt; {if (!editable()) return; setPicking(true);} | aria-expanded=picking; disabled=controlsPending; {"kind":"branch","expression":"session","branch":"false"}; earlier return: state.kind === "loading"; earlier… |
| 70:2005 FocusPage | p actionNotice |  | {"kind":"logical","expression":"actionNotice","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 70:2077 FocusPage | div actionError |  | {"kind":"logical","expression":"actionError","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 70:2162 FocusPage | Dialog  | onOpenChange=(next) =&gt; {if (!next) setPicking(false);} | open=picking; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 70:2615 FocusPage | FocusTaskPicker  | onSelect=task =&gt; {if (!editable()) return; draft.edit("taskId", task.id); draft.edit("taskTitle", task.title);}; onDenied=() =&gt; {draft.reset(); setPick… | {"kind":"container","tag":"Dialog","attributes":{"open":"picking"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 70:2863 FocusPage | Input  | onChange=(event) =&gt; draft.edit("title", event.currentTarget.value) | disabled=controlsPending; {"kind":"container","tag":"Dialog","attributes":{"open":"picking"}}; earlier return: state.kind === "loading"; earlier return: stat… |
| 70:3099 FocusPage | Button frontendText(locale, "FOCUS_START_ACTION") | onClick=() =&gt; { if (!editable() &#124;&#124; !draft.current.current.taskId &#124;&#124; !onStart) return; const input = draft.current.current; starting.cu… | disabled=controlsPending &#124;&#124; !taskId; {"kind":"container","tag":"Dialog","attributes":{"open":"picking"}}; earlier return: state.kind === "loading";… |

## frontend/pages/goals-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 42:84 GoalsPage | Button frontendText(locale, "GOALS_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 43:39 GoalsPage | Dialog  | onOpenChange=next =&gt; { if (!next) setCreateOpen(false); } | open=createOpen; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 44:5 GoalsPage | DialogContent  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 47:29 GoalsPage | PlanningCreateForm  | onCreate=onCreate; onCreateReadback=onCreateReadback; onCreateDenied=onCreateDenied; onCreateLock=locked =&gt; { setCreateComposerLocked(locked); onCreateLoc… | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 48:62 GoalsPage | Button frontendText(locale, "COMMON_CANCEL") | onClick=() =&gt; setCreateOpen(false); type="button" | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 51:513 GoalsPage | Button frontendText(locale, "GOALS_CREATE_TITLE") | onClick=() =&gt; setCreateOpen(true); type="button" | aria-expanded=createOpen; disabled=createBlocked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#124;&#124; undef… |
| 52:21 GoalsPage | div actionError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#124;&#124; undefined"}}; {"kind":"logical","expression":"actionErr… |
| 53:5 GoalsPage | DataTable  | onPageChange=onPageChange ? changePage : undefined; onPageSizeChange=onPageSizeChange ? changePageSize : undefined; onLoadMore=onLoadMore | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#124;&#124; undefined"}}; earlier return: state.kind === "loading";… |
| 71:347 GoalsPage | input  | onChange=(event) =&gt; !statusConfirmation.isOpen() && onProgressChange?.(goal, Number(event.currentTarget.value)); type="range" | disabled=statusConfirmation.open &#124;&#124; createLocked &#124;&#124; pending &#124;&#124; goal.status === "archived"; {"kind":"container","tag":"section",… |
| 72:205 GoalsPage | Button frontendText(locale, "GOALS_TASK_LINKS") | onClick=event =&gt; onManageTasks(goal, event.currentTarget); type="button" | disabled=statusConfirmation.open &#124;&#124; createLocked &#124;&#124; pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfi… |
| 72:527 GoalsPage | Button frontendText(locale, "GOALS_COMPLETE") | onClick=() =&gt; statusConfirmation.request(goal, "completed"); type="button" | disabled=statusConfirmation.unavailable &#124;&#124; statusConfirmation.open &#124;&#124; createLocked &#124;&#124; pending; {"kind":"container","tag":"secti… |
| 72:840 GoalsPage | Button frontendText(locale, "GOALS_ARCHIVE") | onClick=() =&gt; statusConfirmation.request(goal, "archived"); type="button" | disabled=statusConfirmation.unavailable &#124;&#124; statusConfirmation.open &#124;&#124; createLocked &#124;&#124; pending; {"kind":"container","tag":"secti… |
| 72:1165 GoalsPage | Button frontendText(locale, "GOALS_RESTORE") | onClick=() =&gt; statusConfirmation.request(goal, "active"); type="button" | disabled=statusConfirmation.unavailable &#124;&#124; statusConfirmation.open &#124;&#124; createLocked &#124;&#124; pending; {"kind":"container","tag":"secti… |

## frontend/pages/graph-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 87:5 GraphPage | window.addEventListener  | "beforeunload", warn |  |
| 195:47 GraphPage | div  |  | aria-busy=action.status === "checking"; {"kind":"branch","expression":"recoveryAuthorized","branch":"true"}; {"kind":"logical","expression":"action && action… |
| 198:7 GraphPage | Button frontendText(locale, "GRAPH_ACTION_CHECK_RESULT") | onClick=checkGraphAction | disabled=action.status === "checking"; {"kind":"branch","expression":"recoveryAuthorized","branch":"true"}; {"kind":"logical","expression":"action && action.… |
| 199:7 GraphPage | Button frontendText(locale, "GRAPH_ACTION_RETRY") | onClick=() =&gt; runGraphAction(action) | disabled=action.status === "checking"; {"kind":"branch","expression":"recoveryAuthorized","branch":"true"}; {"kind":"logical","expression":"action && action.… |
| 200:28 GraphPage | p frontendText(locale, "GRAPH_ACTION_QUERY_UNCONFIRMED") |  | {"kind":"branch","expression":"recoveryAuthorized","branch":"true"}; {"kind":"logical","expression":"action && action.status !== \"running\"","operator":"&&"… |
| 202:39 GraphPage | p frontendText(locale, "GRAPH_ACTION_CONFIRMED").replace("{id}", outcome.clientKey) |  | {"kind":"branch","expression":"recoveryAuthorized","branch":"true"}; {"kind":"logical","expression":"outcome?.status === \"success\"","operator":"&&"} |
| 209:124 GraphPage | Button frontendText(locale, "GRAPH_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 210:118 GraphPage | Button frontendText(locale, "GRAPH_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"forbidden\"","branch":"true"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 226:11 GraphPage | Input  | onChange=(event) =&gt; onQueryChange?.(event.currentTarget.value) | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: !filteredSnapsh… |
| 227:11 GraphPage | select  | onChange=(event) =&gt; onLensChange?.(event.currentTarget.value as GraphLens) | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: !filteredSnapsh… |
| 228:13 GraphPage | option frontendText(locale, "GRAPH_LENS_WORKSPACE") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: !filteredSnapsh… |
| 229:13 GraphPage | option frontendText(locale, "GRAPH_LENS_KNOWLEDGE") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: !filteredSnapsh… |
| 230:13 GraphPage | option frontendText(locale, "GRAPH_LENS_WORK") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: !filteredSnapsh… |
| 232:11 GraphPage | select  | onChange=(event) =&gt; onTemporalRangeChange?.(event.currentTarget.value as GraphTemporalRange) | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: !filteredSnapsh… |
| 233:13 GraphPage | option frontendText(locale, "GRAPH_TIME_RANGE_ALL") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: !filteredSnapsh… |
| 234:13 GraphPage | option frontendText(locale, "GRAPH_TIME_RANGE_7D") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: !filteredSnapsh… |
| 235:13 GraphPage | option frontendText(locale, "GRAPH_TIME_RANGE_30D") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: !filteredSnapsh… |
| 236:13 GraphPage | option frontendText(locale, "GRAPH_TIME_RANGE_90D") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: !filteredSnapsh… |
| 238:11 GraphPage | select  | onChange=(event) =&gt; onChangeKindChange?.(event.currentTarget.value as NonNullable&lt;GraphPageProps["changeKind"]&gt;) | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: !filteredSnapsh… |
| 239:13 GraphPage | option frontendText(locale, "GRAPH_CHANGE_KIND_ALL") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: !filteredSnapsh… |
| 240:13 GraphPage | option frontendText(locale, "GRAPH_CHANGE_KIND_ADDED") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: !filteredSnapsh… |
| 241:13 GraphPage | option frontendText(locale, "GRAPH_CHANGE_KIND_UPDATED") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: !filteredSnapsh… |
| 242:13 GraphPage | option frontendText(locale, "GRAPH_CHANGE_KIND_COMPLETED") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: !filteredSnapsh… |
| 243:13 GraphPage | option frontendText(locale, "GRAPH_CHANGE_KIND_ARCHIVED") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: !filteredSnapsh… |
| 247:23 GraphPage | div  |  | {"kind":"logical","expression":"viewBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier retu… |
| 247:197 GraphPage | Button frontendText(locale, "GRAPH_VIEW_RECORD_DISCARD") | onClick=onDiscardView | {"kind":"logical","expression":"viewBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier retu… |
| 248:22 GraphPage | p viewNotice |  | {"kind":"logical","expression":"viewNotice","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier retur… |
| 249:25 GraphPage | div  |  | {"kind":"logical","expression":"recordBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier re… |
| 251:9 GraphPage | Button frontendText(locale, "GRAPH_ACTION_RECORD_DISCARD") | onClick=() =&gt; { if (memberId && discardBlockedGraphAction(memberId)) setRecordBlocked(false); } | {"kind":"logical","expression":"recordBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier re… |
| 254:51 GraphPage | p frontendText(locale, outcome.status === "rejected" ? "GRAPH_ACTION_REJECTED" : outcome.status === "not_recorded" ? "GRAPH_ACTION_NOT_RECORDED" : "GRAPH_ACTIO… |  | {"kind":"logical","expression":"outcome && outcome.status !== \"success\"","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.… |
| 257:11 GraphPage | Button frontendText(locale, "GRAPH_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"empty\"","branch":"true"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error"; … |
| 260:9 GraphPage | GraphSuggestionsPanel  | onGenerate=onGenerateSuggestions | {"kind":"branch","expression":"state.kind === \"empty\"","branch":"false"}; {"kind":"logical","expression":"filteredSnapshot","operator":"&&"}; earlier retur… |
| 261:40 GraphPage | div frontendText(locale, "GRAPH_TRUNCATED") |  | {"kind":"branch","expression":"state.kind === \"empty\"","branch":"false"}; {"kind":"logical","expression":"filteredSnapshot","operator":"&&"}; {"kind":"logi… |
| 263:11 GraphPage | GraphCanvas  | onSelect=setSelectedId; onClearSelection=() =&gt; setSelectedId(null) | {"kind":"branch","expression":"state.kind === \"empty\"","branch":"false"}; {"kind":"logical","expression":"filteredSnapshot","operator":"&&"}; earlier retur… |
| 265:13 GraphPage | GraphInspector  | onClose=() =&gt; setSelectedId(null); onAction=selectedNode && (!action &#124;&#124; action.node.id === selectedNode.id) ? () =&gt; runGraphAction(action ?? … | {"kind":"branch","expression":"state.kind === \"empty\"","branch":"false"}; {"kind":"logical","expression":"filteredSnapshot","operator":"&&"}; earlier retur… |
| 273:13 GraphPage | GraphEvidencePanel  | onDenied=onDenied | {"kind":"branch","expression":"state.kind === \"empty\"","branch":"false"}; {"kind":"logical","expression":"filteredSnapshot","operator":"&&"}; earlier retur… |
| 364:10 GraphRoute | GraphPage  | onDenied=denyRead; onGenerateSuggestions=generateSuggestions; onQueryChange=setQuery; onLensChange=setLens; onTemporalRangeChange=setTemporalRange; onChangeK… |  |
| 370:269 GraphSuggestionsPanel | Button frontendText(locale, state.kind === "loading" ? "GRAPH_SUGGESTIONS_LOADING" : "GRAPH_SUGGESTIONS_GENERATE") | onClick=onGenerate | disabled=state.kind === "loading" |
| 372:34 GraphSuggestionsPanel | p frontendText(locale, "GRAPH_SUGGESTIONS_ERROR") |  | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"} |

## frontend/pages/home-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 66:163 HomePage | button frontendText(locale, "COMMON_RETRY") | onClick=onRetry; type="button" | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; {"kind":"logical","expression":"state.retryable !== false","operator":"&&"}; earli… |
| 72:18 HomePage | div  |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: !("summary" in state) |
| 72:91 HomePage | button frontendText(locale, "COMMON_RETRY") | onClick=onRetry; type="button" | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: !("summary" in state) |
| 82:9 HomePage | a frontendText(locale, "WORKBENCH_OPEN_CAPTURE") | href="/submit" | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: !("summary" in state) |
| 94:13 HomePage | a frontendText(locale, "WORKBENCH_QUICK_SUBMIT") | href="/submit" | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: !("summary" in state) |
| 95:13 HomePage | a frontendText(locale, "WORKBENCH_QUICK_AI") | href="/agent" | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: !("summary" in state) |
| 105:13 HomePage | a frontendText(locale, "WORKBENCH_OPEN_TASKS") | href="/tasks" | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: !("summary" in state) |
| 118:13 HomePage | a frontendText(locale, "HOME_OPEN_KNOWLEDGE") | href="/knowledge" | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: !("summary" in state) |
| 124:19 HomePage | a  | href=&#96;/knowledge/${encodeURIComponent(item.id)}&#96; | {"kind":"branch","expression":"unavailable.has(\"knowledge\")","branch":"false"}; {"kind":"branch","expression":"summary.recentKnowledge.length","branch":"tr… |
| 142:38 HomePage | a content | href=item.href | {"kind":"branch","expression":"unavailable.has(\"activity\")","branch":"false"}; {"kind":"branch","expression":"summary.recentActivity.length","branch":"true… |
| 153:49 HomePage | a frontendText(locale, action.labelKey) | href=action.href | {"kind":"repeat","expression":"summary.quickActions"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: !("s… |
| 161:409 LegacyHomePage | a frontendText(locale, "HOME_QUICK_SUBMIT") | href="/submit" |  |
| 161:1410 LegacyHomePage | a  | href=&#96;/knowledge/${encodeURIComponent(item.id)}&#96; | {"kind":"branch","expression":"summary.recentKnowledge.length","branch":"true"}; {"kind":"repeat","expression":"summary.recentKnowledge"} |
| 161:2022 LegacyHomePage | a frontendText(locale, "HOME_OPEN_KNOWLEDGE") | href="/knowledge" |  |
| 161:2156 LegacyHomePage | a frontendText(locale, "HOME_OPEN_SEARCH") | href="/search" |  |
| 161:2284 LegacyHomePage | a frontendText(locale, "HOME_OPEN_AGENT") | href="/agent" |  |

## frontend/pages/inbox-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 38:84 InboxPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 40:511 InboxPage | Button frontendText(locale, "INBOX_CAPTURE_TITLE") | onClick=() =&gt; setCaptureOpen(true); type="button" | aria-expanded=captureOpen; earlier return: state.kind === "loading"; earlier return: state.kind === "error"; spread: (captureLocked ? { "data-inbox-capture-p… |
| 41:21 InboxPage | div actionError |  | {"kind":"logical","expression":"actionError","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 42:165 InboxPage | select  | onChange=event =&gt; { const next = (event.currentTarget.value &#124;&#124; undefined) as InboxStatus &#124; undefined; guard(() =&gt; onFilterChange(next)); } | disabled=controlsPending; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 42:473 InboxPage | option frontendText(locale, "INBOX_STATUS_ALL") |  | {"kind":"container","tag":"select","attributes":{"disabled":"controlsPending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "er… |
| 42:541 InboxPage | option frontendText(locale, "INBOX_STATUS_INBOX") |  | {"kind":"container","tag":"select","attributes":{"disabled":"controlsPending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "er… |
| 42:616 InboxPage | option frontendText(locale, "INBOX_STATUS_ARCHIVED") |  | {"kind":"container","tag":"select","attributes":{"disabled":"controlsPending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "er… |
| 42:697 InboxPage | option frontendText(locale, "INBOX_STATUS_PROMOTED") |  | {"kind":"container","tag":"select","attributes":{"disabled":"controlsPending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "er… |
| 43:5 InboxPage | DataTable  | onPageChange=page =&gt; guard(() =&gt; onPageChange?.(page)); onPageSizeChange=pageSize =&gt; guard(() =&gt; onPageSizeChange?.(pageSize)); onLoadMore=onLoad… | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 60:430 InboxPage | a item.sourceUrl | href=item.sourceUrl | {"kind":"logical","expression":"item.sourceUrl","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 62:201 InboxPage | Button frontendText(locale, "INBOX_OPEN_TASK") | onClick=() =&gt; guard(() =&gt; onOpenTask?.(item)); type="button" | disabled=controlsPending; {"kind":"branch","expression":"item.status === \"promoted\"","branch":"true"}; {"kind":"branch","expression":"item.promotedTaskId",… |
| 62:478 InboxPage | Button item.status === "archived" ? frontendText(locale, "INBOX_RESTORE") : frontendText(locale, "INBOX_ARCHIVE") | onClick=() =&gt; confirmation.request(item, "status"); type="button" | disabled=controlsPending; {"kind":"branch","expression":"item.status === \"promoted\"","branch":"false"}; earlier return: state.kind === "loading"; earlier r… |
| 62:902 InboxPage | Button frontendText(locale, "INBOX_PROMOTE_TASK") | onClick=() =&gt; confirmation.request(item, "task"); type="button" | disabled=controlsPending; {"kind":"branch","expression":"item.status === \"promoted\"","branch":"false"}; earlier return: state.kind === "loading"; earlier r… |
| 66:3 InboxPage | Dialog  | onOpenChange=next =&gt; { if (!next) setCaptureOpen(false); } | open=captureOpen; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 67:21 InboxPage | div  | onClick=() =&gt; setCaptureOpen(false) | aria-hidden="true"; {"kind":"container","tag":"Dialog","attributes":{"open":"captureOpen"}}; {"kind":"logical","expression":"captureOpen","operator":"&&"}; e… |
| 68:5 InboxPage | DialogContent  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"captureOpen"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 71:29 InboxPage | InboxCreateForm  | onCreate=onCreate; onCreateReadback=onCreateReadback; onCreateDenied=onCreateDenied; onCreateLock=locked =&gt; { setCaptureLocked(locked); onCreateLock?.(loc… | {"kind":"container","tag":"Dialog","attributes":{"open":"captureOpen"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 72:62 InboxPage | Button frontendText(locale, "COMMON_CANCEL") | onClick=() =&gt; setCaptureOpen(false); type="button" | {"kind":"container","tag":"Dialog","attributes":{"open":"captureOpen"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |

## frontend/pages/knowledge-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 18:139 KnowledgePage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; {"kind":"logical","expression":"onRetry","operator":"&&"}; earlier return: state.k… |
| 19:284 KnowledgePage | div  |  | {"kind":"logical","expression":"localError","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 19:388 KnowledgePage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"logical","expression":"localError","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 19:521 KnowledgePage | ReviewPanel  | onRetry=onRetryReview; onPeriodChange=onReviewPeriodChange; onDiscardPeriod=onDiscardPeriod | {"kind":"logical","expression":"review","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 19:762 KnowledgePage | SectionUnread  | onRetry=onRetrySections | {"kind":"branch","expression":"favoritesError","branch":"true"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 19:933 KnowledgePage | SectionUnread  | onRetry=onRetrySections | {"kind":"branch","expression":"recentError","branch":"true"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 19:1106 KnowledgePage | SectionUnread  | onRetry=onRetrySections | {"kind":"branch","expression":"researchError","branch":"true"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 19:1293 KnowledgePage | SectionUnread  | onRetry=onRetrySections | {"kind":"branch","expression":"notesError","branch":"true"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 19:1460 KnowledgePage | SectionUnread  | onRetry=onRetrySections | {"kind":"branch","expression":"activityError","branch":"true"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 19:1564 KnowledgePage | ActivityPanel  | onLoadMore=onLoadMoreActivity | {"kind":"branch","expression":"activityError","branch":"false"}; {"kind":"logical","expression":"activity.length &gt; 0","operator":"&&"}; earlier return: st… |
| 19:1709 KnowledgePage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 19:2335 KnowledgePage | a item.title?.trim() &#124;&#124; frontendText(locale, "KNOWLEDGE_UNTITLED") | href=&#96;/knowledge/${encodeURIComponent(item.id)}&#96; | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 19:3416 KnowledgePage | KnowledgeShareButton  |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 23:10 SectionUnread | div  |  |  |
| 23:257 SectionUnread | Button frontendText(locale, "KNOWLEDGE_SECTION_RETRY") | onClick=onRetry; type="button" | {"kind":"logical","expression":"onRetry","operator":"&&"} |
| 27:346 ToReadPanel | a  | href=&#96;/knowledge/${encodeURIComponent(item.id)}&#96; | {"kind":"repeat","expression":"items"} |
| 31:506 ReviewPanel | select  | onChange=(event) =&gt; onPeriodChange?.(event.target.value === "weekly" ? "weekly" : "daily") |  |
| 31:675 ReviewPanel | option frontendText(locale, "KNOWLEDGE_REVIEW_DAILY") |  |  |
| 31:754 ReviewPanel | option frontendText(locale, "KNOWLEDGE_REVIEW_WEEKLY") |  |  |
| 31:876 ReviewPanel | div  |  | {"kind":"logical","expression":"periodBlocked","operator":"&&"} |
| 31:1034 ReviewPanel | Button frontendText(locale, "REVIEW_PERIOD_RECORD_DISCARD") | onClick=onDiscardPeriod; type="button" | {"kind":"logical","expression":"periodBlocked","operator":"&&"} |
| 31:1197 ReviewPanel | p periodNotice |  | {"kind":"logical","expression":"periodNotice","operator":"&&"} |
| 31:1467 ReviewPanel | p frontendText(locale, "KNOWLEDGE_REVIEW_ERROR") |  | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"} |
| 31:1584 ReviewPanel | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry; type="button" | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"}; {"kind":"logical","expression":"onRetry","operator":"&&"} |
| 31:1841 ReviewPanel | a  | href=&#96;/knowledge/${encodeURIComponent(item.knowledgeItemId)}&#96; | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"branch","expression":"state.data.items.length","branch":"true"}; {"kind"… |
| 35:222 ActivityPanel | a  | href=item.resourceType === "knowledge" ? &#96;/knowledge/${encodeURIComponent(item.resourceId)}&#96; : item.resourceType === "task" ? "/tasks" : item.resourc… | {"kind":"repeat","expression":"items"} |
| 35:802 ActivityPanel | p frontendText(locale, "KNOWLEDGE_SECTION_UNREAD") |  | {"kind":"logical","expression":"moreError","operator":"&&"} |
| 35:930 ActivityPanel | Button frontendText(locale, "KNOWLEDGE_ACTIVITY_LOAD_MORE") | onClick=onLoadMore | {"kind":"logical","expression":"nextCursor","operator":"&&"} |
| 39:234 RecentKnowledgePanel | a  | href=&#96;/knowledge/${encodeURIComponent(item.id)}&#96; | {"kind":"repeat","expression":"items"} |
| 43:964 RecentResearchPanel | a frontendText(locale, "KNOWLEDGE_RESEARCH_OPEN") | href=&#96;/knowledge/${encodeURIComponent(item.knowledgeItemId)}?researchRunId=${encodeURIComponent(item.id)}&#96; | {"kind":"repeat","expression":"items"} |
| 47:433 PrivateNotesPanel | a  | href=&#96;/knowledge/${encodeURIComponent(note.knowledgeItemId)}&#96; | {"kind":"repeat","expression":"notes"} |

## frontend/pages/knowledge-reader-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 23:10 KnowledgeReaderPage | KnowledgeReaderSessionPage  |  | spread: props |
| 59:134 KnowledgeReaderSessionPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 62:5 KnowledgeReaderSessionPage | ExpandableTabs  | onValueChange=setMobilePanel | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 68:9 KnowledgeReaderSessionPage | ReaderOutlinePanel  | onSelectChunk=setSelectedChunkId | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 71:491 KnowledgeReaderSessionPage | p frontendText(locale, "KNOWLEDGE_READER_FAVORITE_UNCONFIRMED") |  | {"kind":"logical","expression":"favoritePhase === \"unknown\"","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "er… |
| 71:644 KnowledgeReaderSessionPage | p frontendText(locale, "KNOWLEDGE_READER_FAVORITE_STORAGE") |  | {"kind":"logical","expression":"favoritePhase === \"blocked\"","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "er… |
| 71:894 KnowledgeReaderSessionPage | Button frontendText(locale, "KNOWLEDGE_READER_FAVORITE_CHECK") | onClick=() =&gt; void onCheckFavorite() | disabled=favoritePhase === "checking" &#124;&#124; favoritePhase === "saving"; {"kind":"logical","expression":"(favoriteError &#124;&#124; favoritePhase === … |
| 71:1124 KnowledgeReaderSessionPage | p frontendText(locale, "KNOWLEDGE_READER_FAVORITE_UNKNOWN") |  | {"kind":"logical","expression":"favoriteError","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 71:1373 KnowledgeReaderSessionPage | Button favorite ? frontendText(locale, "KNOWLEDGE_READER_UNFAVORITE") : frontendText(locale, "KNOWLEDGE_READER_FAVORITE") | onClick=() =&gt; void onToggleFavorite() | disabled=favoritePhase !== "idle"; aria-busy=favoritePhase === "saving"; {"kind":"logical","expression":"typeof favorite === \"boolean\" && !favoriteError &&… |
| 71:1754 KnowledgeReaderSessionPage | Button diffState.kind === "loading" ? frontendText(locale, "KNOWLEDGE_READER_COMPARING") : frontendText(locale, "KNOWLEDGE_READER_COMPARE") | onClick=onCompare | disabled=diffState.kind === "loading"; {"kind":"logical","expression":"normalizedRevision.previousRevisionId && onCompare","operator":"&&"}; earlier return: … |
| 71:2033 KnowledgeReaderSessionPage | a frontendText(locale, "MESSAGES_DISCUSS") | href=contextDiscussionHref({ kind: "knowledge", id: normalizedRevision.knowledgeItemId }) | {"kind":"logical","expression":"normalizedRevision.knowledgeItemId","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind ==… |
| 71:2286 KnowledgeReaderSessionPage | a frontendText(locale, "KNOWLEDGE_READER_ASK") | href="/agent?scope=items&knowledgeItemId=" + encodeURIComponent(normalizedRevision.knowledgeItemId) | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 75:9 KnowledgeReaderSessionPage | SourcePanel  | onSelectChunk=setSelectedChunkId | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 76:9 KnowledgeReaderSessionPage | ReaderNotePanel  | onTitleChange=(value) =&gt; note.edit("title", value); onBodyChange=(value) =&gt; note.edit("body", value); onSave=saveNote; onCheck=() =&gt; void note.check… | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 77:43 KnowledgeReaderSessionPage | BacklinkPanel  | onRetry=onRetryBacklinks | {"kind":"logical","expression":"backlinkState.kind !== \"idle\"","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "… |
| 78:42 KnowledgeReaderSessionPage | RelatedKnowledgePanel  | onRetry=onRetryRelated | {"kind":"logical","expression":"relatedState.kind !== \"idle\"","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "e… |
| 88:655 ReaderNotePanel | p frontendText(locale, "KNOWLEDGE_NOTE_DISCARD_ERROR") |  | {"kind":"logical","expression":"discardError","operator":"&&"} |
| 88:778 ReaderNotePanel | div  |  | {"kind":"logical","expression":"phase === \"unknown\"","operator":"&&"} |
| 88:851 ReaderNotePanel | Button frontendText(locale, "KNOWLEDGE_NOTE_CHECK") | onClick=onCheck | {"kind":"logical","expression":"phase === \"unknown\"","operator":"&&"} |
| 88:1013 ReaderNotePanel | div  |  | {"kind":"logical","expression":"phase === \"storage-error\"","operator":"&&"} |
| 88:1116 ReaderNotePanel | Button frontendText(locale, "KNOWLEDGE_NOTE_CHECK") | onClick=onRetryLoad | {"kind":"logical","expression":"phase === \"storage-error\"","operator":"&&"} |
| 88:1287 ReaderNotePanel | div  |  | {"kind":"logical","expression":"phase === \"load-error\"","operator":"&&"} |
| 88:1363 ReaderNotePanel | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetryLoad | {"kind":"logical","expression":"phase === \"load-error\"","operator":"&&"} |
| 88:1628 ReaderNotePanel | input  | onChange=(event) =&gt; onTitleChange(event.currentTarget.value) | readOnly=shared &#124;&#124; locked |
| 88:2101 ReaderNotePanel | textarea  | onChange=(event) =&gt; onBodyChange(event.currentTarget.value) | readOnly=shared &#124;&#124; locked |
| 88:2531 ReaderNotePanel | span statusLabel |  | {"kind":"logical","expression":"!shared","operator":"&&"} |
| 88:2632 ReaderNotePanel | Button status === "saving" ? frontendText(locale, "KNOWLEDGE_NOTE_SAVING") : frontendText(locale, "KNOWLEDGE_NOTE_SAVE") | onClick=onSave | disabled=locked &#124;&#124; status === "saving"; {"kind":"logical","expression":"!shared","operator":"&&"} |
| 88:3031 ReaderNotePanel | div  |  | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.phase === \"unknown\"","operator":"&&"} |
| 88:3110 ReaderNotePanel | Button frontendText(locale, "KNOWLEDGE_NOTE_CHECK") | onClick=() =&gt; void sharing.check() | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.phase === \"unknown\"","operator":"&&"} |
| 88:3305 ReaderNotePanel | div  |  | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.phase === \"storage-error\"","operator":"&&"} |
| 88:3414 ReaderNotePanel | Button frontendText(locale, "KNOWLEDGE_NOTE_CHECK") | onClick=sharing.retryLoad | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.phase === \"storage-error\"","operator":"&&"} |
| 88:3605 ReaderNotePanel | Button frontendText(locale, "COMMON_RETRY") | onClick=sharing.retryLoad | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.phase === \"load-error\"","operator":"&&"} |
| 88:3863 ReaderNotePanel | select  | onChange=(event) =&gt; sharing.select(event.currentTarget.value) | disabled=sharing.locked; {"kind":"logical","expression":"!shared","operator":"&&"} |
| 88:4128 ReaderNotePanel | option frontendText(locale, "KNOWLEDGE_NOTE_SHARE_SELECT") |  | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"container","tag":"select","attributes":{"disabled":"sharing.locked"}} |
| 88:4315 ReaderNotePanel | option member.email |  | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"container","tag":"select","attributes":{"disabled":"sharing.locked"}}; {"kind":"repeat","… |
| 88:4391 ReaderNotePanel | Button frontendText(locale, "KNOWLEDGE_NOTE_SHARE_ACTION") | onClick=() =&gt; sharing.request("share") | disabled=sharing.locked &#124;&#124; !recipientMemberId; {"kind":"logical","expression":"!shared","operator":"&&"} |
| 88:5107 ReaderNotePanel | button frontendText(locale, "KNOWLEDGE_NOTE_SHARE_REVOKE") | onClick=() =&gt; sharing.request("revoke", share); type="button" | disabled=sharing.locked; {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"branch","expression":"(sharing.phase === \"loading\" &#124;&#124… |
| 88:5338 ReaderNotePanel | p frontendText(locale, "KNOWLEDGE_NOTE_SHARE_ERROR") |  | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.error","operator":"&&"} |
| 96:448 ReaderOutlinePanel | button heading.label | onClick=() =&gt; onSelectChunk(heading.id); type="button" | {"kind":"branch","expression":"headings.length === 0","branch":"false"}; {"kind":"repeat","expression":"headings"} |
| 101:206 RelatedKnowledgePanel | p frontendText(locale, "KNOWLEDGE_RELATED_UNREAD") |  | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 101:325 RelatedKnowledgePanel | Button frontendText(locale, "KNOWLEDGE_RELATED_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; {"kind":"logical","expression":"onRetry","operator":"&&"}; earlier return: state.k… |
| 103:466 RelatedKnowledgePanel | a  | href=&#96;/knowledge/${encodeURIComponent(item.id)}&#96; | {"kind":"branch","expression":"state.items.length === 0","branch":"false"}; {"kind":"repeat","expression":"state.items"}; earlier return: state.kind === "loa… |
| 108:200 BacklinkPanel | p frontendText(locale, "KNOWLEDGE_BACKLINKS_UNREAD") |  | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 108:321 BacklinkPanel | Button frontendText(locale, "KNOWLEDGE_BACKLINKS_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; {"kind":"logical","expression":"onRetry","operator":"&&"}; earlier return: state.k… |
| 110:358 BacklinkPanel | a  | href="/knowledge/" + encodeURIComponent(item.id) | {"kind":"branch","expression":"state.items.length === 0","branch":"false"}; {"kind":"repeat","expression":"state.items"}; earlier return: state.kind === "loa… |
| 126:584 SourcePanel | a frontendText(locale, "KNOWLEDGE_READER_DOWNLOAD") | href=downloadHref | {"kind":"logical","expression":"downloadHref","operator":"&&"} |
| 126:927 SourcePanel | div  |  | {"kind":"branch","expression":"revision.chunks.length === 0","branch":"false"} |
| 126:1061 SourcePanel | button  | onClick=() =&gt; onSelectChunk(chunk.id); type="button" | {"kind":"branch","expression":"revision.chunks.length === 0","branch":"false"}; {"kind":"repeat","expression":"revision.chunks"} |
| 126:1886 SourcePanel | div  |  | {"kind":"logical","expression":"selectedChunk","operator":"&&"} |
| 150:38 RevisionDiffPanel | p frontendText(locale, "KNOWLEDGE_READER_DIFF_ERROR") |  | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |

## frontend/pages/login-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 42:21 LoginPage | p error |  | {"kind":"logical","expression":"error","operator":"&&"} |
| 44:15 LoginPage | Button frontendText(locale, "LOGIN_GITHUB") | onClick=() =&gt; { window.location.href = "/auth/github"; } | {"kind":"branch","expression":"githubEnabled","branch":"true"} |
| 47:11 LoginPage | form  | onSubmit=(event) =&gt; { event.preventDefault(); void onCodeSubmit(); } | aria-busy=pending &#124;&#124; undefined |
| 49:27 LoginPage | p formError |  | {"kind":"container","tag":"form","attributes":{"aria-busy":"pending &#124;&#124; undefined"}}; {"kind":"logical","expression":"formError","operator":"&&"} |
| 50:130 LoginPage | Input  | onChange=(event) =&gt; setEmail(event.target.value); type="email" | disabled=pending; {"kind":"container","tag":"form","attributes":{"aria-busy":"pending &#124;&#124; undefined"}} |
| 51:128 LoginPage | Input  | onChange=(event) =&gt; setCode(event.target.value); type="text" | disabled=pending; {"kind":"container","tag":"form","attributes":{"aria-busy":"pending &#124;&#124; undefined"}} |
| 52:13 LoginPage | Button frontendText(locale, pending ? "LOGIN_CODE_PENDING" : "LOGIN_CODE_SUBMIT") | type="submit" | disabled=!canSubmit; {"kind":"container","tag":"form","attributes":{"aria-busy":"pending &#124;&#124; undefined"}} |

## frontend/pages/messages/messages-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 26:109 MessagesPage | Button frontendText(locale, "MESSAGES_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 33:49 MessagesPage | a frontendText(locale, "MESSAGES_OPEN_CONTEXT") | href=discussionContextHref({ kind: thread.contextKind, id: thread.contextId }) | {"kind":"container","tag":"div","attributes":{"aria-busy":"pending &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.items.length === 0","branc… |
| 33:284 MessagesPage | a frontendText(locale, "MESSAGES_OPEN_THREAD") | href=threadDiscussionHref(thread.id) | {"kind":"container","tag":"div","attributes":{"aria-busy":"pending &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.items.length === 0","branc… |
| 37:5 MessagesPage | DiscussionCursorPagination  | onPrevious=onPrevious; onNext=() =&gt; state.nextCursor && onNext(state.nextCursor); onLimitChange=onLimitChange | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |

## frontend/pages/messages/thread-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 63:40 ThreadPage | div  |  | {"kind":"branch","expression":"recordBlocked","branch":"true"} |
| 63:150 ThreadPage | button frontendText(locale, "MESSAGES_DRAFT_RECORD_DISCARD") | onClick=discardRecord; type="button" | {"kind":"branch","expression":"recordBlocked","branch":"true"} |
| 64:22 ThreadPage | p recordNotice |  | {"kind":"branch","expression":"recordBlocked","branch":"false"}; {"kind":"branch","expression":"recordNotice","branch":"true"} |
| 112:152 ThreadPage | Button frontendText(locale, "MESSAGES_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 117:76 ThreadPage | a frontendText(locale, "MESSAGES_BACK") | href="/messages" | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: recoveryBlocked |
| 117:296 ThreadPage | a state.thread.contextId | href=discussionContextHref({ kind: state.thread.contextKind, id: state.thread.contextId }) | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: recoveryBlocked |
| 117:484 ThreadPage | Button frontendText(locale, "MESSAGES_REFRESH") | onClick=onRefresh | disabled=pending; earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: recoveryBlocked |
| 119:900 ThreadPage | Button frontendText(locale, "MESSAGES_REPLY") | onClick=() =&gt; selectReply(message) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"pending &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.messages.… |
| 121:5 ThreadPage | DiscussionCursorPagination  | onPrevious=onPrevious; onNext=() =&gt; state.nextCursor && onNext(state.nextCursor); onLimitChange=onLimitChange | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: recoveryBlocked |
| 122:5 ThreadPage | DiscussionComposer  | onLookup=onLookup ? checkResult : undefined; onBodyChange=(value) =&gt; draft.edit("body", value); onCancelReply=() =&gt; selectReply(null); onSubmit=submit | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: recoveryBlocked |
| 138:10 DiscussionComposer | form  | onSubmit=(event) =&gt; void onSubmit(event) |  |
| 139:202 DiscussionComposer | button frontendText(locale, "MESSAGES_CANCEL_REPLY") | onClick=onCancelReply; type="button" | disabled=locked; {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"replyTo","operator":"&&"} |
| 141:197 DiscussionComposer | Button frontendText(locale, status === "checking" ? "MESSAGES_CHECKING_RESULT" : "MESSAGES_CHECK_RESULT") | onClick=() =&gt; void onLookup(); type="button" | disabled=status === "pending" &#124;&#124; status === "checking"; {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"operatio… |
| 143:5 DiscussionComposer | textarea  | onChange=(event) =&gt; onBodyChange(event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"form","attributes":{}} |
| 144:158 DiscussionComposer | Button status === "pending" ? frontendText(locale, "MESSAGES_SENDING") : frontendText(locale, status === "error" ? "MESSAGES_RETRY_SEND" : "MESSAGES_SEND") | type="submit" | disabled=status === "pending" &#124;&#124; status === "checking" &#124;&#124; !body.trim(); {"kind":"container","tag":"form","attributes":{}} |
| 165:349 DiscussionCursorPagination | Select  | onChange=(event) =&gt; onLimitChange(Number(event.currentTarget.value) as 20 &#124; 50) | disabled=pending |
| 165:615 DiscussionCursorPagination | Button labels.previousLabel | onClick=onPrevious; type="button" | disabled=pending &#124;&#124; page &lt;= 1 |
| 165:773 DiscussionCursorPagination | Button labels.nextLabel | onClick=onNext; type="button" | disabled=pending &#124;&#124; !hasNext |

## frontend/pages/my-submissions-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 29:163 MySubmissionsPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"branch","expression":"!range.invalid && state.kind === \"error\"","branch":"true"}; {"kind":"logical","expression":"onRetry","operator":"&&"}; earli… |
| 35:38 MySubmissionsPage | div  |  | {"kind":"logical","expression":"localError && !range.invalid","operator":"&&"}; earlier return: !range.invalid && state.kind === "loading"; earlier return: !… |
| 35:142 MySubmissionsPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"logical","expression":"localError && !range.invalid","operator":"&&"}; earlier return: !range.invalid && state.kind === "loading"; earlier return: !… |
| 36:33 MySubmissionsPage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"logical","expression":"ready && !range.invalid","operator":"&&"}; earlier return: !range.invalid && state.kind === "loading"; earlier return: !range… |
| 41:296 MySubmissionsPage | button frontendText(locale, "SUBMISSIONS_RESUBMIT") | type="button" | {"kind":"logical","expression":"ready && !range.invalid","operator":"&&"}; {"kind":"logical","expression":"item.status === \"needs_revision\"","operator":"&&… |
| 45:18 MySubmissionsPage | div  |  | {"kind":"logical","expression":"ready && !range.invalid","operator":"&&"}; earlier return: !item.review; earlier return: !range.invalid && state.kind === "lo… |
| 78:89 SubmissionRangeFilter | Input  | onChange=(event) =&gt; setFrom(event.currentTarget.value); type="date" | disabled=pending |
| 79:87 SubmissionRangeFilter | Input  | onChange=(event) =&gt; setTo(event.currentTarget.value); type="date" | disabled=pending |
| 80:7 SubmissionRangeFilter | Button frontendText(locale, "CALENDAR_RANGE_APPLY") | onClick=() =&gt; { if (invalid) return; const { pathname, search } = readWorkspaceLocation(); writeWorkspaceHistory("push", &#96;${pathname}${writeSubmission… | disabled=pending &#124;&#124; invalid |
| 82:17 SubmissionRangeFilter | p frontendText(locale, "SUBMISSIONS_RANGE_INVALID") |  | {"kind":"logical","expression":"invalid","operator":"&&"} |

## frontend/pages/notifications/notifications-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 40:198 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"recovery\"","branch":"true"}; earlier return: state.kind === "loading" |
| 41:114 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading"; earlier return: state.kind === "recovery" |
| 42:126 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"forbidden\"","branch":"true"}; earlier return: state.kind === "loading"; earlier return: state.kind === "reco… |
| 51:7 NotificationsPage | Select  | onChange=(event) =&gt; onFilterChange({ ...filters, read: readFilter(event.currentTarget.value) }) | disabled=pending; earlier return: state.kind === "loading"; earlier return: state.kind === "recovery"; earlier return: state.kind === "error"; earlier return… |
| 56:7 NotificationsPage | Select  | onChange=(event) =&gt; onFilterChange({ ...filters, eventType: eventFilter(event.currentTarget.value) }) | disabled=pending; earlier return: state.kind === "loading"; earlier return: state.kind === "recovery"; earlier return: state.kind === "error"; earlier return… |
| 60:7 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_MARK_VISIBLE_READ") | onClick=() =&gt; onMarkVisibleRead(visibleUnreadIds) | disabled=pending &#124;&#124; actionPending &#124;&#124; recordBlocked &#124;&#124; visibleUnreadIds.length === 0; earlier return: state.kind === "loading"; … |
| 64:29 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_UPDATE_RECORD_DISCARD") | onClick=onDiscardRecord | {"kind":"logical","expression":"recordBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "recovery"; earlier… |
| 67:5 NotificationsPage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | earlier return: state.kind === "loading"; earlier return: state.kind === "recovery"; earlier return: state.kind === "error"; earlier return: state.kind === "… |
| 91:21 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_OPEN") | onClick=() =&gt; onOpen(item.id) | disabled=actionsDisabled; {"kind":"branch","expression":"href","branch":"true"}; earlier return: state.kind === "loading"; earlier return: state.kind === "re… |
| 92:38 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_MARK_READ") | onClick=() =&gt; onMarkRead(item.id) | disabled=actionsDisabled; {"kind":"logical","expression":"item.readAt === null","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: s… |

## frontend/pages/project-timeline-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 28:84 ProjectTimelinePage | Button frontendText(locale, "PROJECT_TIMELINE_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 30:74 ProjectTimelinePage | Button frontendText(locale, "PROJECT_TIMELINE_BACK") | onClick=onBack; type="button" | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 31:5 ProjectTimelinePage | TimelineCreateForm  |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; spread: createCallbacks |
| 32:21 ProjectTimelinePage | div actionError |  | {"kind":"logical","expression":"actionError","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 33:5 ProjectTimelinePage | DataTable  | onPageChange=changePage; onPageSizeChange=changePageSize; onLoadMore=onLoadMore | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 51:257 ProjectTimelinePage | Button frontendText(locale, "PROJECT_TIMELINE_MARK_DONE") | onClick=() =&gt; onStatusChange?.(item, "done"); type="button" | disabled=pending &#124;&#124; createLocked; {"kind":"logical","expression":"item.status === \"open\"","operator":"&&"}; earlier return: state.kind === "loadi… |
| 51:506 ProjectTimelinePage | Button frontendText(locale, "PROJECT_TIMELINE_ARCHIVE") | onClick=() =&gt; onStatusChange?.(item, "archived"); type="button" | disabled=pending &#124;&#124; createLocked; {"kind":"logical","expression":"item.status !== \"archived\"","operator":"&&"}; earlier return: state.kind === "l… |
| 51:733 ProjectTimelinePage | Button frontendText(locale, "PROJECT_TIMELINE_REOPEN") | onClick=() =&gt; onStatusChange?.(item, "open"); type="button" | disabled=pending &#124;&#124; createLocked; {"kind":"logical","expression":"item.status === \"archived\"","operator":"&&"}; earlier return: state.kind === "l… |
| 51:941 ProjectTimelinePage | TimelineItemEditor  | onSave=onEdit | {"kind":"logical","expression":"onEdit","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |

## frontend/pages/projects-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 40:84 ProjectsPage | Button frontendText(locale, "PROJECTS_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 45:39 ProjectsPage | Dialog  | onOpenChange=next =&gt; { if (!next) setCreateOpen(false); } | open=createOpen; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 46:5 ProjectsPage | DialogContent  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 49:29 ProjectsPage | PlanningCreateForm  | onCreate=onCreate; onCreateReadback=onCreateReadback; onCreateDenied=onCreateDenied; onCreateLock=locked =&gt; { setCreateComposerLocked(locked); onCreateLoc… | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 50:62 ProjectsPage | Button frontendText(locale, "COMMON_CANCEL") | onClick=() =&gt; setCreateOpen(false); type="button" | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 53:528 ProjectsPage | Button frontendText(locale, "PROJECTS_CREATE_TITLE") | onClick=() =&gt; setCreateOpen(true); type="button" | aria-expanded=createOpen; disabled=createBlocked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#124;&#124; undef… |
| 54:21 ProjectsPage | div actionError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#124;&#124; undefined"}}; {"kind":"logical","expression":"actionErr… |
| 56:5 ProjectsPage | DataTable  | onPageChange=onPageChange ? changePage : undefined; onPageSizeChange=onPageSizeChange ? changePageSize : undefined; onLoadMore=listBlocked ? undefined : onLo… | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#124;&#124; undefined"}}; earlier return: state.kind === "loading";… |
| 82:892 ProjectsPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#124;&#124; undefined"}}; {"kind":"branch","expression":"summary","… |
| 82:1018 ProjectsPage | Button frontendText(locale, "PROJECTS_SUMMARY_RETRY") | onClick=() =&gt; onRetrySummary?.(project); type="button" | disabled=listBlocked &#124;&#124; summaryPending.includes(project.id); {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.op… |
| 86:11 ProjectsPage | Button frontendText(locale, "RELATIONS_MANAGE") | onClick=() =&gt; onManageRelations?.(project); type="button" | aria-expanded=relationProjectId === project.id; disabled=listBlocked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.ope… |
| 87:11 ProjectsPage | Button frontendText(locale, "PROJECTS_TIMELINE") | onClick=() =&gt; onOpenTimeline?.(project); type="button" | disabled=listBlocked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#124;&#124; undefined"}}; earlier return: sta… |
| 88:79 ProjectsPage | Button frontendText(locale, "PROJECTS_COMPLETE") | onClick=() =&gt; statusConfirmation.request(project, "completed"); type="button" | disabled=statusConfirmation.unavailable &#124;&#124; listBlocked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#… |
| 89:45 ProjectsPage | Button frontendText(locale, "PROJECTS_ARCHIVE") | onClick=() =&gt; statusConfirmation.request(project, "archived"); type="button" | disabled=statusConfirmation.unavailable &#124;&#124; listBlocked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#… |
| 90:45 ProjectsPage | Button frontendText(locale, "PROJECTS_RESTORE") | onClick=() =&gt; statusConfirmation.request(project, "active"); type="button" | disabled=statusConfirmation.unavailable &#124;&#124; listBlocked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#… |

## frontend/pages/search-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 56:25 SearchPage | div  |  | {"kind":"logical","expression":"composerBlocked","operator":"&&"} |
| 56:187 SearchPage | Button frontendText(locale, "SEARCH_COMPOSER_RECORD_DISCARD") | onClick=onDiscardComposer; type="button" | {"kind":"logical","expression":"composerBlocked","operator":"&&"} |
| 57:24 SearchPage | p composerNotice |  | {"kind":"logical","expression":"composerNotice","operator":"&&"} |
| 61:7 SearchPage | form  | onSubmit=(event) =&gt; { event.preventDefault(); onSubmit?.(); } |  |
| 62:137 SearchPage | Input  | onChange=(event) =&gt; onQueryChange?.(event.currentTarget.value) | disabled=queryLocked; {"kind":"container","tag":"form","attributes":{}} |
| 63:9 SearchPage | Button frontendText(locale, "SEARCH_SUBMIT") | type="submit" | disabled=!onSubmit &#124;&#124; queryLocked; {"kind":"container","tag":"form","attributes":{}} |
| 66:55 SearchPage | p savedViewError |  | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"savedViewError && !savedViewRecordBlo… |
| 67:36 SearchPage | div  |  | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"savedViewRecordBlocked","operator":"&&"} |
| 67:155 SearchPage | Button frontendText(locale, "SEARCH_SAVED_VIEW_RECORD_DISCARD") | onClick=onDiscardSavedViewRecord; type="button" | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"savedViewRecordBlocked","operator":"&&"} |
| 68:30 SearchPage | Button frontendText(locale, "SEARCH_SAVED_VIEW_CHECK") | onClick=onCheckSavedView; type="button" | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"savedViewUnknown","operator":"&&"} |
| 70:26 SearchPage | form  | onSubmit=(event) =&gt; { event.preventDefault(); const name = savedViewName.trim(); if (controlledName === undefined && !name) return; onSaveView(name); } | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"onSaveView","operator":"&&"} |
| 71:13 SearchPage | Input  | onChange=(event) =&gt; setSavedViewName(event.currentTarget.value) | disabled=savedViewPending; {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"onSaveView… |
| 72:13 SearchPage | Button frontendText(locale, "SEARCH_SAVE_VIEW") | type="submit" | disabled=savedViewPending &#124;&#124; !savedViewName.trim(); {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind"… |
| 74:36 SearchPage | div  |  | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"!!savedViews?.length","operator":"&&"} |
| 75:293 SearchPage | button view.name | onClick=() =&gt; onApplyView?.(view); type="button" | disabled=savedViewPending; {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"!!savedVie… |
| 75:471 SearchPage | button × | onClick=() =&gt; onDeleteView?.(view.id); type="button" | disabled=savedViewPending &#124;&#124; !onDeleteView; {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logica… |
| 76:34 SearchPage | Button frontendText(locale, viewsExpanded ? "COMMON_COLLAPSE" : "COMMON_EXPAND") | onClick=() =&gt; setViewsExpanded((current) =&gt; !current); type="button" | aria-expanded=viewsExpanded; {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"!!savedV… |
| 82:133 SearchPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"} |
| 84:24 SearchPage | div  |  | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 84:128 SearchPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 86:9 SearchPage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"} |
| 102:160 SearchPage | a result.title?.trim() &#124;&#124; frontendText(locale, "SEARCH_UNTITLED") | href=result.href | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"} |
| 104:409 SearchPage | a frontendText(locale, "SEARCH_ASK_RESULT") | href=&#96;/agent?scope=items&knowledgeItemId=${encodeURIComponent(result.knowledgeItemId)}&#96; | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |

## frontend/pages/settings-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 11:1415 SettingsPage | Button frontendText(locale, mode === "light" ? "SHELL_THEME_LIGHT" : mode === "dark" ? "SHELL_THEME_DARK" : "SHELL_THEME_SYSTEM") | onClick=() =&gt; chooseTheme(mode); type="button" | {"kind":"repeat","expression":"([\"light\", \"dark\", \"system\"] as ThemeMode[])"} |
| 11:2078 SettingsPage | select  | onChange=(event) =&gt; locale.setLocale(event.target.value) |  |
| 11:2227 SettingsPage | option frontendText(locale, "SHELL_LANGUAGE_ZH_CN") |  |  |
| 11:2304 SettingsPage | option frontendText(locale, "SHELL_LANGUAGE_EN") |  |  |

## frontend/pages/submit-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 28:106 SubmitPage | a frontendText(locale, "SUBMIT_CHECK_SUBMISSIONS") | href="/my-submissions" | {"kind":"logical","expression":"recovery?.invalid","operator":"&&"} |
| 32:58 SubmitPage | Button frontendText(locale, pending ? "SUBMIT_BUTTON_PENDING" : "SUBMIT_RETRY") | onClick=recovery?.onRetry; type="button" | disabled=pending; {"kind":"logical","expression":"unresolved && !recovery?.invalid","operator":"&&"} |
| 32:232 SubmitPage | a frontendText(locale, "SUBMIT_CHECK_SUBMISSIONS") | href="/my-submissions" | {"kind":"logical","expression":"unresolved && !recovery?.invalid","operator":"&&"} |
| 35:5 SubmitPage | form  | onSubmit=(event) =&gt; { event.preventDefault(); if (!pending && !recovery?.invalid) onSubmit?.(draft); } | aria-busy=pending ? "true" : undefined |
| 37:100 SubmitPage | Input  | onChange=(event) =&gt; onDraftChange?.({ title: event.currentTarget.value }) | {"kind":"container","tag":"form","attributes":{"aria-busy":"pending ? \"true\" : undefined"}} |
| 38:98 SubmitPage | select  | onChange=(event) =&gt; onDraftChange?.({ mode: event.currentTarget.value as SubmissionDraft["mode"] }) | {"kind":"container","tag":"form","attributes":{"aria-busy":"pending ? \"true\" : undefined"}} |
| 39:11 SubmitPage | option frontendText(locale, "SUBMIT_CONTENT_LABEL") |  | {"kind":"container","tag":"form","attributes":{"aria-busy":"pending ? \"true\" : undefined"}} |
| 39:87 SubmitPage | option frontendText(locale, "SUBMIT_MARKDOWN_LABEL") |  | {"kind":"container","tag":"form","attributes":{"aria-busy":"pending ? \"true\" : undefined"}} |
| 39:168 SubmitPage | option frontendText(locale, "SUBMIT_CODE_LABEL") |  | {"kind":"container","tag":"form","attributes":{"aria-busy":"pending ? \"true\" : undefined"}} |
| 41:204 SubmitPage | Textarea  | onChange=(event) =&gt; onDraftChange?.({ content: event.currentTarget.value }) | {"kind":"container","tag":"form","attributes":{"aria-busy":"pending ? \"true\" : undefined"}} |
| 43:9 SubmitPage | Button frontendText(locale, pending ? "SUBMIT_BUTTON_PENDING" : "SUBMIT_BUTTON") | type="submit" | disabled=pending &#124;&#124; unresolved &#124;&#124; recovery?.invalid; {"kind":"container","tag":"form","attributes":{"aria-busy":"pending ? \"true\" : und… |

## frontend/pages/tasks/task-editor.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 110:5 TaskEditor | owner.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, committed |  |
| 116:5 TaskEditor | owner.addEventListener  | "beforeunload", preventUnload |  |
| 268:22 TaskEditor | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"recordBlocked","branch":"true"} |
| 268:104 TaskEditor | button t("TASKS_DRAFT_RECORD_DISCARD") | onClick=discardRecord; type="button" | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"recordBlocked","branch":"true"} |
| 269:21 TaskEditor | p recordNotice |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"recordNotice","branch":"true"} |
| 270:14 TaskEditor | p t("TASKS_SAVING") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"busy","operator":"&&"} |
| 271:17 TaskEditor | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"unknown","operator":"&&"} |
| 272:7 TaskEditor | Button t("TASKS_CHECK_WRITE") | onClick=() =&gt; void check() | disabled=busy; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"unknown","operator":"… |
| 273:7 TaskEditor | Button t("TASKS_RETRY_WRITE") | onClick=() =&gt; { if (intent.current) void perform(intent.current, true); } | disabled=busy; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"unknown","operator":"… |
| 275:16 TaskEditor | p t(notice) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"notice","operator":"&&"} |
| 276:15 TaskEditor | p t("TASKS_ACTION_FAILED") / t("TASKS_INVALID_FORM") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"error","operator":"&&"} |
| 277:16 TaskEditor | p t("TASKS_LOADING") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"true"} |
| 277:72 TaskEditor | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 277:125 TaskEditor | Button t("TASKS_RELOAD_DETAIL") | onClick=() =&gt; void read() | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 278:7 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); save(); } | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 279:58 TaskEditor | Input  | onChange=(event) =&gt; edit("fields", { ...currentDraft.current.fields, title: event.currentTarget.value }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 280:58 TaskEditor | Input  | onChange=(event) =&gt; edit("fields", { ...currentDraft.current.fields, notes: event.currentTarget.value }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 281:61 TaskEditor | select  | onChange=(event) =&gt; edit("fields", { ...currentDraft.current.fields, priority: event.currentTarget.value }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 281:374 TaskEditor | option t(taskPriorityKey(priority)) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 282:56 TaskEditor | Input  | onChange=(event) =&gt; edit("fields", { ...currentDraft.current.fields, dueAt: event.currentTarget.value }); type="datetime-local" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 284:9 TaskEditor | Button t(taskId ? "TASKS_SAVE" : "TASKS_CREATE") | type="submit" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 287:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); if (!locked) { const next = currentDraft.current.status; void perform({ clean: ["status"], op: { op: "status… | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 288:43 TaskEditor | select  | onChange=(event) =&gt; edit("status", event.currentTarget.value as TaskItem["status"]) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 288:313 TaskEditor | option t(taskStatusKey(value)) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 289:11 TaskEditor | Button t("TASKS_SAVE_STATUS") | type="submit" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 291:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); const progress = currentDraft.current.progress; const next = Number(progress); if (!locked && progress !== "… | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 292:45 TaskEditor | Input  | onChange=(event) =&gt; edit("progress", event.currentTarget.value); type="number" | disabled=locked &#124;&#124; ["done", "canceled"].includes(detail.task.status); {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; … |
| 293:11 TaskEditor | Button t("TASKS_SAVE_PROGRESS") | type="submit" | disabled=locked &#124;&#124; ["done", "canceled"].includes(detail.task.status); {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; … |
| 295:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); saveTags(); } | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 296:41 TaskEditor | Input  | onChange=(event) =&gt; edit("tags", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 297:11 TaskEditor | Button t("TASKS_SAVE_TAGS") | type="submit" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 299:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); const id = currentDraft.current.knowledgeId.trim(); if (!locked && id) void perform({ clean: ["knowledgeId"]… | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 300:38 TaskEditor | Input  | onChange=(event) =&gt; edit("knowledgeId", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 301:11 TaskEditor | Button t("TASKS_LINK_ADD") | type="submit" | disabled=locked &#124;&#124; detail.links.length &gt;= 5; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"b… |
| 303:254 TaskEditor | Button t("TASKS_LINK_REMOVE") | onClick=() =&gt; void perform({ op: { op: "unlink", taskId, linkId: link.id, expectedUpdatedAt: detail.task.updatedAt } }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 304:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); const title = currentDraft.current.subtaskTitle.trim(); const position = nextSubtaskPosition(subtasks); if (… | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 305:44 TaskEditor | Input  | onChange=(event) =&gt; edit("subtaskTitle", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 306:11 TaskEditor | Button t("TASKS_SUBTASK_ADD") | type="submit" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 308:226 TaskEditor | select  | onChange=(event) =&gt; { const status = event.currentTarget.value as TaskSubtask["status"]; if (status !== item.status) void perform({ op: { op: "subtask-upd… | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 308:768 TaskEditor | option t(taskStatusKey(status)) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 308:901 TaskEditor | Button item.status === "done" ? t("TASKS_SUBTASK_REOPEN") : t("TASKS_SUBTASK_DONE") | onClick=() =&gt; void perform({ op: { op: "subtask-update", taskId, subtaskId: item.id, title: item.title, status: item.status === "done" ? "todo" : "done", … | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 308:1362 TaskEditor | Button t("TASKS_SUBTASK_REMOVE") | onClick=() =&gt; void perform({ op: { op: "subtask-delete", taskId, subtaskId: item.id, expectedUpdatedAt: item.updatedAt } }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 309:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); const dependsOnTaskId = currentDraft.current.dependsOnTaskId.trim(); if (locked &#124;&#124; !/^[A-Za-z0-9][… | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 310:44 TaskEditor | Input  | onChange=(event) =&gt; edit("dependsOnTaskId", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 311:11 TaskEditor | Button t("TASKS_DEPENDENCY_ADD") | type="submit" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 313:208 TaskEditor | Button t("TASKS_DEPENDENCY_REMOVE") | onClick=() =&gt; void perform({ op: { op: "dependency-remove", taskId, dependsOnTaskId: item.dependsOnTaskId, expectedUpdatedAt: detail.task.updatedAt } }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 316:5 TaskEditor | Button t("TASKS_CLOSE") | onClick=close | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}} |
| 319:7 TaskEditor | Sheet  | onOpenChange=(open) =&gt; { if (!open) close(); } | open=true; {"kind":"branch","expression":"taskId","branch":"true"} |
| 320:7 TaskEditor | Dialog  | onOpenChange=(open) =&gt; { if (!open) close(); } | open=true; {"kind":"branch","expression":"taskId","branch":"false"} |
| 322:5 TaskEditor | ConfirmAction  | onCancel=cancelDiscard; onConfirm=discard | open=confirmingDiscard |

## frontend/pages/tasks/tasks-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 62:84 TasksPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 65:18 TasksPage | Button frontendText(locale, "TASKS_NEW") | onClick=onCreate | disabled=Boolean(actionPendingId); {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"log… |
| 67:7 TasksPage | Input  | onChange=(event) =&gt; onTextFilterChange?.({ ...filters, q: event.currentTarget.value &#124;&#124; undefined }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; earlier return: state.kind === "loading"; earli… |
| 68:7 TasksPage | FilterSelect  | onChange=(value) =&gt; onFilterChange?.({ ...filters, status: (value &#124;&#124; undefined) as TaskStatus &#124; undefined }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; earlier return: state.kind === "loading"; earli… |
| 69:7 TasksPage | FilterSelect  | onChange=(value) =&gt; onFilterChange?.({ ...filters, priority: (value &#124;&#124; undefined) as TaskPriority &#124; undefined }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; earlier return: state.kind === "loading"; earli… |
| 70:7 TasksPage | Input  | onChange=(event) =&gt; onTextFilterChange?.({ ...filters, tag: event.currentTarget.value &#124;&#124; undefined }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; earlier return: state.kind === "loading"; earli… |
| 71:7 TasksPage | FilterSelect  | onChange=(value) =&gt; onFilterChange?.({ ...filters, due: (value &#124;&#124; undefined) as TaskFilterState["due"] }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; earlier return: state.kind === "loading"; earli… |
| 73:21 TasksPage | div actionError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"actionError","o… |
| 74:24 TasksPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"localLoadError"… |
| 74:132 TasksPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"localLoadError"… |
| 75:5 TasksPage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; earlier return: state.kind === "loading"; earli… |
| 104:13 TasksPage | a frontendText(locale, "MESSAGES_DISCUSS") | href=contextDiscussionHref({ kind: "task", id: task.id }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; earlier return: state.kind === "loading"; earli… |
| 105:24 TasksPage | Button frontendText(locale, "TASKS_EDIT") | onClick=() =&gt; onOpen(task.id) | disabled=Boolean(actionPendingId); {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"log… |
| 106:13 TasksPage | Button statusAction | onClick=() =&gt; { if (!confirmationRef.current) onStatusChange?.(task.id, task.status === "done" ? "todo" : "done"); } | disabled=validConfirmation &#124;&#124; actionPendingId != null; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#1… |
| 107:13 TasksPage | Button frontendText(locale, "TASKS_DELETE") | onClick=() =&gt; requestDelete(task) | disabled=validConfirmation &#124;&#124; deleteBlocked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefi… |
| 112:13 TasksPage | ConfirmAction  | onCancel=cancelDelete; onConfirm=confirmDelete | open=validConfirmation; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 119:10 FilterSelect | select  | onChange=(event) =&gt; onChange(event.currentTarget.value) |  |
| 119:171 FilterSelect | option label |  |  |
| 119:229 FilterSelect | option option |  | {"kind":"repeat","expression":"options"} |

## frontend/pages/today-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 16:84 TodayPage | Button frontendText(locale, "TODAY_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 21:1045 TodayPage | TodayLink frontendText(locale, "TODAY_TASKS_ALL") | href="/tasks?due=today&page=1&pageSize=20" | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 21:1357 TodayPage | Button task.title | onClick=() =&gt; onOpen?.({kind: "task", id: task.id}) | {"kind":"branch","expression":"snapshot.tasks.items.length","branch":"true"}; {"kind":"repeat","expression":"snapshot.tasks.items.slice(0, 10)"}; earlier ret… |
| 21:1780 TodayPage | TodayLink frontendText(locale, "TODAY_CALENDAR_ALL") | href=calendarHref | {"kind":"logical","expression":"calendarHref","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 21:2072 TodayPage | Button event.title | onClick=() =&gt; onOpen?.({kind: "calendar", id: event.id}) | {"kind":"branch","expression":"snapshot.calendar.length","branch":"true"}; {"kind":"repeat","expression":"snapshot.calendar.slice(0, 10)"}; earlier return: s… |
| 27:10 TodayLink | a children | onClick=event =&gt; { if (event.button !== 0 &#124;&#124; event.metaKey &#124;&#124; event.ctrlKey &#124;&#124; event.altKey &#124;&#124; event.shiftKey) ret… |  |

## frontend/pages/workbench-landing/public-workbench-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 67:5 PublicWorkbenchPage | media?.addEventListener  | "change", apply |  |
| 75:17 PublicWorkbenchPage | ButtonLink text("LOGIN") | href="/login" |  |
| 80:9 PublicWorkbenchPage | a text("BRAND") | href="/" |  |
| 82:11 PublicWorkbenchPage | Select  | onValueChange=value =&gt; locale.setLocale(value) |  |
| 102:15 PublicWorkbenchPage | Button text("START") | onClick=() =&gt; dispatch({ type: "start" }) |  |
| 105:15 PublicWorkbenchPage | Button text("EXPLORE") | onClick=() =&gt; firstFeature.current?.focus() |  |
| 109:13 PublicWorkbenchPage | WorkbenchScene  | onStatus=setSceneStatus |  |
| 111:15 PublicWorkbenchPage | Button text(state.paused ? "SCENE_RESUME" : "SCENE_PAUSE") | onClick=() =&gt; dispatch({ type: "pause", value: !state.paused }) | {"kind":"logical","expression":"sceneLive","operator":"&&"} |
| 113:15 PublicWorkbenchPage | div  |  | {"kind":"logical","expression":"sceneLive","operator":"&&"} |
| 114:17 PublicWorkbenchPage | Tabs  | onValueChange=next =&gt; setView(next as SceneViewId) | {"kind":"logical","expression":"sceneLive","operator":"&&"} |
| 116:47 PublicWorkbenchPage | TabsTrigger text(viewLabels[entry.id]) |  | {"kind":"logical","expression":"sceneLive","operator":"&&"}; {"kind":"repeat","expression":"SCENE_VIEWS"} |
| 131:13 PublicWorkbenchPage | div  |  |  |
| 132:67 PublicWorkbenchPage | Button  | onClick=() =&gt; dispatch({ type: "open", feature: id }) | aria-expanded=state.activeFeature === id; {"kind":"repeat","expression":"features"} |
| 149:45 PublicWorkbenchPage | Button text("NEXT") | onClick=() =&gt; dispatch({ type: "next" }) | disabled=gated; {"kind":"logical","expression":"!state.activeFeature && state.step !== \"overview\"","operator":"&&"}; {"kind":"logical","expression":"state.… |
| 151:15 PublicWorkbenchPage | Button text("REPLAY") | onClick=() =&gt; dispatch({ type: "replay" }) | {"kind":"logical","expression":"!state.activeFeature && state.step !== \"overview\"","operator":"&&"} |

## frontend/pages/workbench-landing/workbench-feature-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 77:10 WorkbenchFeaturePanel | Drawer  | onOpenChange=open =&gt; { if (!open) close(); } | open=active; earlier return: !state.activeFeature |
| 79:5 WorkbenchFeaturePanel | div  |  | {"kind":"container","tag":"Drawer","attributes":{"open":"active"}}; earlier return: !state.activeFeature |
| 83:9 WorkbenchFeaturePanel | Button  | onClick=close | {"kind":"container","tag":"Drawer","attributes":{"open":"active"}}; earlier return: !state.activeFeature |
| 88:9 WorkbenchFeaturePanel | Button text("BACK_TO_ANSWER") | onClick=() =&gt; dispatch({ type: "citation-back" }) | {"kind":"container","tag":"Drawer","attributes":{"open":"active"}}; {"kind":"branch","expression":"showingCitation && source && citation","branch":"true"}; e… |
| 91:9 WorkbenchFeaturePanel | h2 source.title |  | {"kind":"container","tag":"Drawer","attributes":{"open":"active"}}; {"kind":"branch","expression":"showingCitation && source && citation","branch":"true"}; e… |
| 107:13 WorkbenchFeaturePanel | Button text(state.captured ? "CAPTURE_DONE" : "CAPTURE_SELECT") | onClick=() =&gt; dispatch({ type: "capture" }) | disabled=state.captured; {"kind":"container","tag":"Drawer","attributes":{"open":"active"}}; {"kind":"branch","expression":"showingCitation && source && cita… |
| 111:11 WorkbenchFeaturePanel | p text(state.captured ? "CAPTURE_DONE" : "CAPTURE_PENDING") |  | {"kind":"container","tag":"Drawer","attributes":{"open":"active"}}; {"kind":"branch","expression":"showingCitation && source && citation","branch":"false"}; … |
| 119:13 WorkbenchFeaturePanel | Button text("OPEN_SOURCE") | onClick=() =&gt; setSourceOpen(sourceOpen === item.id ? null : item.id) | aria-expanded=sourceOpen === item.id; {"kind":"container","tag":"Drawer","attributes":{"open":"active"}}; {"kind":"branch","expression":"showingCitation && s… |
| 131:13 WorkbenchFeaturePanel | Button text("ANSWER_SHOW") | onClick=() =&gt; setAnswerVisible(true) | aria-expanded=answerVisible; {"kind":"container","tag":"Drawer","attributes":{"open":"active"}}; {"kind":"branch","expression":"showingCitation && source && … |
| 137:81 WorkbenchFeaturePanel | Button text("SOURCE_LABEL") / : / content.sources.find(document =&gt; document.id === item.sourceId)?.title | onClick=() =&gt; dispatch({ type: "citation", id: item.id }) | {"kind":"container","tag":"Drawer","attributes":{"open":"active"}}; {"kind":"branch","expression":"showingCitation && source && citation","branch":"false"}; … |
| 148:13 WorkbenchFeaturePanel | p text(state.taskDone ? "ACTION_DONE" : "ACTION_TODO") |  | {"kind":"container","tag":"Drawer","attributes":{"open":"active"}}; {"kind":"branch","expression":"showingCitation && source && citation","branch":"false"}; … |
| 149:13 WorkbenchFeaturePanel | Button text("ACTION_COMPLETE") | onClick=() =&gt; dispatch({ type: "complete-task" }) | disabled=state.taskDone; {"kind":"container","tag":"Drawer","attributes":{"open":"active"}}; {"kind":"branch","expression":"showingCitation && source && cita… |
| 162:11 WorkbenchFeaturePanel | Button text("NEXT") | onClick=() =&gt; dispatch({ type: "next" }) | disabled=gated; {"kind":"container","tag":"Drawer","attributes":{"open":"active"}}; {"kind":"branch","expression":"showingCitation && source && citation","br… |

## frontend/pages/workbench-landing/workbench-scene-runtime.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 120:3 loadModel | options.signal.addEventListener  | "abort", onAbort, { once: true } |  |
| 200:5 createWorkbenchScene | canvas.addEventListener  | "webglcontextlost", contextLost |  |
| 218:5 createWorkbenchScene | controls.addEventListener  | "change", () =&gt; { // Camera updates this module performs itself must not look like visitor input, // otherwise an idle page keeps a frame queued while the… |  |
| 432:5 createWorkbenchScene | options.host.ownerDocument.addEventListener  | "visibilitychange", visibilityChanged |  |
| 434:5 createWorkbenchScene | options.signal.addEventListener  | "abort", dispose, { once: true } |  |

## frontend/pages/workbench-landing/workbench-scene.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 206:5 WorkbenchScene | document.addEventListener  | "visibilitychange", onVisibility |  |
| 207:34 WorkbenchScene | media.addEventListener  | "change", onPreference | {"kind":"branch","expression":"media?.addEventListener","branch":"true"} |
| 208:10 WorkbenchScene | media?.addListener  | onPreference | {"kind":"branch","expression":"media?.addEventListener","branch":"false"} |
| 209:5 WorkbenchScene | connection?.addEventListener  | "change", onPreference |  |
| 228:7 WorkbenchScene | window.addEventListener  | "resize", measure, { passive: true } | {"kind":"branch","expression":"typeof IntersectionObserver !== \"undefined\"","branch":"false"} |
| 229:7 WorkbenchScene | window.addEventListener  | "scroll", measure, { passive: true, capture: true } | {"kind":"branch","expression":"typeof IntersectionObserver !== \"undefined\"","branch":"false"} |
| 273:7 WorkbenchScene | p text(view.message).replace("{percent}", String(view.percent ?? 0)) |  |  |
| 281:11 WorkbenchScene | Button text(failed ? "SCENE_RETRY" : "SCENE_LOAD") | onClick=event =&gt; activate(event.currentTarget, "load") | {"kind":"logical","expression":"view.status !== \"loading\" && view.status !== \"ready\"","operator":"&&"} |
| 285:11 WorkbenchScene | Button text("SCENE_STATIC_MODE") | onClick=event =&gt; activate(event.currentTarget, "useStatic") | {"kind":"logical","expression":"view.status !== \"static\"","operator":"&&"} |

## frontend/pages/workbench-review-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 18:15 WorkbenchReviewPage | Button frontendText(locale, "REVIEW_REFRESH") | onClick=onRetry | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 19:9 WorkbenchReviewPage | Button frontendText(locale, "REVIEW_DAILY") | onClick=() =&gt; onPeriodChange?.("daily") | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}} |
| 20:9 WorkbenchReviewPage | Button frontendText(locale, "REVIEW_WEEKLY") | onClick=() =&gt; onPeriodChange?.("weekly") | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}} |
| 23:23 WorkbenchReviewPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"periodBlocked","operator":"&&"} |
| 23:176 WorkbenchReviewPage | Button frontendText(locale, "REVIEW_PERIOD_RECORD_DISCARD") | onClick=onDiscardPeriod | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"periodBlocked","operator":"&&"} |
| 24:22 WorkbenchReviewPage | p periodNotice |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"periodNotice","operator":"&&"} |
| 26:78 WorkbenchReviewPage | Button frontendText(locale, "REVIEW_RETRY") | onClick=onRetry | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"state.kind === \"error\"","oper… |
| 36:9 WorkbenchReviewPage | ListCard  | onOpen=onOpen; href="/tasks?status=done&page=1&pageSize=20" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 37:9 WorkbenchReviewPage | ListCard  | onOpen=onOpen; href="/tasks?due=overdue&page=1&pageSize=20" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 38:9 WorkbenchReviewPage | ListCard  | onOpen=onOpen; href="/tasks?status=blocked&page=1&pageSize=20" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 39:9 WorkbenchReviewPage | ListCard  | onOpen=onOpen; href="/inbox?status=inbox&page=1&pageSize=20" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 40:9 WorkbenchReviewPage | ListCard  | onOpen=onOpen; href="/projects?status=active&page=1&pageSize=20" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 48:58 ListCard | a frontendText(locale, "REVIEW_VIEW_ALL") | onClick=event =&gt; { if (event.button !== 0 &#124;&#124; event.metaKey &#124;&#124; event.ctrlKey &#124;&#124; event.altKey &#124;&#124; event.shiftKey) ret… |  |
| 51:228 ListCard | Button item.title | onClick=() =&gt; onOpen?.({kind:item.kind,id:item.id}) | {"kind":"branch","expression":"items.length","branch":"true"}; {"kind":"repeat","expression":"items.slice(0,10)"} |

## frontend/public/sw.js

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 4:1 &lt;module&gt; | self.addEventListener  | "install", (event) =&gt; { event.waitUntil(caches.open(CACHE).then((cache) =&gt; cache.addAll(SHELL)).then(() =&gt; self.skipWaiting())); } |  |
| 7:1 &lt;module&gt; | self.addEventListener  | "activate", (event) =&gt; { event.waitUntil(self.clients.claim()); } |  |
| 10:1 &lt;module&gt; | self.addEventListener  | "fetch", (event) =&gt; { const request = event.request; const url = new URL(request.url); if (request.method !== "GET" &#124;&#124; url.origin !== self.locat… |  |

