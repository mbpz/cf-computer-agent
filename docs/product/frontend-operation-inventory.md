# 前端可见操作源码索引（A01）

此索引是源码清点，不是可见性证明、权限证明或原生浏览器验收；不能据此关闭 A01/A02/A05 父项。

生成器枚举全部第一方 frontend TS/TSX/JS/MJS 中的 JSX 控件、事件回调、导航/表单、role 语义边界、转发 spread 和命令式监听器。包含未接线组件，不能把出现次数当作用户可见功能数。
JSON 保留完整属性、handler、条件分支/重复模板、弹层祖先和前置 return 守卫；下表仅作摘要（长表达式截断），逐项核对以相邻 frontend-operation-inventory.json 和源码锚点为准。
自定义组件回调可能是状态通知而非用户操作；spread、动态菜单数据、跨组件条件传播、门户/第三方控件、createElement/innerHTML 动态生成的控件及 CSS 可见性需人工展开。未求值条件，不承诺列出所有运行时状态组合。
运行 `npm run audit:frontend-operations` 验证无漂移；只有有意更新证据才运行 `npm run inventory:frontend-operations`。

源码文件：254；操作/转发候选：1096。无候选文件也逐一列出，防止静默遗漏扫描范围。

| 源文件 | 候选数 |
| --- | ---: |
| frontend/app-routes.ts | 0 |
| frontend/app.tsx | 78 |
| frontend/asset-manifest.ts | 0 |
| frontend/build-contract.ts | 0 |
| frontend/components/agent/agent-feedback.tsx | 8 |
| frontend/components/agent/agent-history-list.tsx | 8 |
| frontend/components/agent/answer-panel.tsx | 1 |
| frontend/components/assets/asset-availability-panel.tsx | 2 |
| frontend/components/assets/asset-dropzone.tsx | 4 |
| frontend/components/assets/asset-preview-model.ts | 0 |
| frontend/components/assets/asset-preview-panel.tsx | 0 |
| frontend/components/assets/asset-state.ts | 0 |
| frontend/components/assets/asset-upload-model.ts | 0 |
| frontend/components/assets/asset-upload-panel.tsx | 10 |
| frontend/components/assets/asset-upload-queue.ts | 0 |
| frontend/components/calendar-cancel-confirmation.tsx | 1 |
| frontend/components/calendar-create-form.tsx | 11 |
| frontend/components/calendar-range-filter.tsx | 4 |
| frontend/components/data-pagination.tsx | 5 |
| frontend/components/focus-action-confirmation.tsx | 1 |
| frontend/components/focus-task-picker.tsx | 9 |
| frontend/components/goal-tasks-editor.tsx | 9 |
| frontend/components/graph/graph-canvas.tsx | 6 |
| frontend/components/graph/graph-evidence-panel.tsx | 1 |
| frontend/components/graph/graph-inspector.tsx | 5 |
| frontend/components/history-navigation-notice.tsx | 2 |
| frontend/components/inbox-action-confirmation.tsx | 1 |
| frontend/components/inbox-create-form.tsx | 13 |
| frontend/components/knowledge/knowledge-card.tsx | 4 |
| frontend/components/planning-create-form.tsx | 10 |
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
| frontend/components/search/search-result-list.tsx | 2 |
| frontend/components/shell/app-shell.tsx | 64 |
| frontend/components/shell/command-palette.tsx | 8 |
| frontend/components/shell/context-rail.tsx | 6 |
| frontend/components/shell/navigation-policy.ts | 0 |
| frontend/components/snapshot-target-detail.tsx | 3 |
| frontend/components/submissions/submission-form-model.ts | 0 |
| frontend/components/timeline-create-form.tsx | 17 |
| frontend/components/timeline-item-editor.tsx | 16 |
| frontend/components/today-target-detail.tsx | 1 |
| frontend/components/ui/alert.tsx | 3 |
| frontend/components/ui/badge.tsx | 1 |
| frontend/components/ui/button.tsx | 1 |
| frontend/components/ui/card.tsx | 6 |
| frontend/components/ui/checkbox.tsx | 1 |
| frontend/components/ui/confirm-action.tsx | 5 |
| frontend/components/ui/dialog.tsx | 2 |
| frontend/components/ui/dropdown-menu.tsx | 6 |
| frontend/components/ui/focus-scope.tsx | 1 |
| frontend/components/ui/input.tsx | 1 |
| frontend/components/ui/label.tsx | 1 |
| frontend/components/ui/page-state.tsx | 1 |
| frontend/components/ui/pagination.tsx | 10 |
| frontend/components/ui/select.tsx | 2 |
| frontend/components/ui/sheet.tsx | 4 |
| frontend/components/ui/skeleton.tsx | 1 |
| frontend/components/ui/tabs.tsx | 4 |
| frontend/components/ui/textarea.tsx | 1 |
| frontend/components/ui/tooltip.tsx | 4 |
| frontend/contracts/api.ts | 0 |
| frontend/contracts/pagination-localization-contract.ts | 0 |
| frontend/contracts/routes.ts | 0 |
| frontend/cutover-contract.ts | 0 |
| frontend/features/environments/account-network-boundary.tsx | 0 |
| frontend/features/environments/account-network-owner.mjs | 2 |
| frontend/features/environments/account-network.mjs | 3 |
| frontend/features/environments/account-vm-runtime.mjs | 1 |
| frontend/features/environments/authenticated-vm-runtime.ts | 1 |
| frontend/features/environments/connector-session.mjs | 1 |
| frontend/features/environments/deletion-reconciler.ts | 0 |
| frontend/features/environments/environment-manager.ts | 2 |
| frontend/features/environments/environment-operation-journal.ts | 0 |
| frontend/features/environments/environment-rename-dialog.tsx | 7 |
| frontend/features/environments/environments-page.tsx | 28 |
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
| frontend/lib/admin-member-status-intent.ts | 0 |
| frontend/lib/admin-members-data.ts | 0 |
| frontend/lib/admin-menu-write-intent.ts | 0 |
| frontend/lib/admin-menus-data.ts | 0 |
| frontend/lib/admin-review-data.ts | 0 |
| frontend/lib/admin-role-write-intent.ts | 0 |
| frontend/lib/admin-roles-data.ts | 0 |
| frontend/lib/admin-space-write-intent.ts | 0 |
| frontend/lib/admin-spaces-data.ts | 0 |
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
| frontend/lib/calendar-query.ts | 0 |
| frontend/lib/command-palette.ts | 0 |
| frontend/lib/discussion-intent.ts | 0 |
| frontend/lib/discussions-data.ts | 0 |
| frontend/lib/focus-create-intent.ts | 0 |
| frontend/lib/focus-data.ts | 0 |
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
| frontend/lib/i18n.ts | 0 |
| frontend/lib/inbox-create-intent.ts | 0 |
| frontend/lib/inbox-data.ts | 0 |
| frontend/lib/knowledge-data.ts | 0 |
| frontend/lib/knowledge-note.ts | 0 |
| frontend/lib/knowledge-reader-data.ts | 0 |
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
| frontend/lib/planning-write-recovery.ts | 0 |
| frontend/lib/project-relations-data.ts | 0 |
| frontend/lib/projects-data.ts | 0 |
| frontend/lib/reader-note-intent.ts | 0 |
| frontend/lib/responsive-contract.ts | 0 |
| frontend/lib/review-comment-intent.ts | 0 |
| frontend/lib/review-data.ts | 0 |
| frontend/lib/review-decision-intent.ts | 0 |
| frontend/lib/review-note-draft.ts | 0 |
| frontend/lib/route-access.ts | 0 |
| frontend/lib/router.ts | 0 |
| frontend/lib/saved-view-intent.ts | 0 |
| frontend/lib/saved-views-data.ts | 0 |
| frontend/lib/search-data.ts | 0 |
| frontend/lib/session-state.ts | 0 |
| frontend/lib/session.ts | 0 |
| frontend/lib/snapshot-validation.ts | 0 |
| frontend/lib/submission-data.ts | 0 |
| frontend/lib/submission-intent.ts | 0 |
| frontend/lib/system-share.ts | 0 |
| frontend/lib/tabs-keyboard.ts | 0 |
| frontend/lib/task-write-intent.ts | 0 |
| frontend/lib/tasks-data.ts | 0 |
| frontend/lib/theme.ts | 0 |
| frontend/lib/timeline-create-intent.ts | 0 |
| frontend/lib/today-data.ts | 0 |
| frontend/lib/use-create-draft.tsx | 3 |
| frontend/lib/use-notification-summary.ts | 2 |
| frontend/lib/use-reader-note-shares.tsx | 1 |
| frontend/lib/use-reader-note.tsx | 0 |
| frontend/lib/use-saved-views.tsx | 1 |
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
| frontend/pages/admin/duplicate-queue-page.tsx | 11 |
| frontend/pages/admin/members-page.tsx | 12 |
| frontend/pages/admin/menu-editor.tsx | 8 |
| frontend/pages/admin/menus-page.tsx | 17 |
| frontend/pages/admin/review-detail-page.tsx | 7 |
| frontend/pages/admin/review-detail-route.tsx | 2 |
| frontend/pages/admin/review-queue-page.tsx | 8 |
| frontend/pages/admin/roles-page.tsx | 20 |
| frontend/pages/admin/spaces-page.tsx | 36 |
| frontend/pages/agent-page.tsx | 14 |
| frontend/pages/boards/board-model.ts | 0 |
| frontend/pages/boards/boards-page.tsx | 12 |
| frontend/pages/calendar-page.tsx | 6 |
| frontend/pages/coming-soon-page.tsx | 0 |
| frontend/pages/focus-page.tsx | 11 |
| frontend/pages/goals-page.tsx | 10 |
| frontend/pages/graph-page.tsx | 31 |
| frontend/pages/home-page.tsx | 16 |
| frontend/pages/inbox-page.tsx | 13 |
| frontend/pages/knowledge-page.tsx | 16 |
| frontend/pages/knowledge-reader-page.tsx | 42 |
| frontend/pages/login-page.tsx | 2 |
| frontend/pages/messages/discussion-model.ts | 0 |
| frontend/pages/messages/messages-page.tsx | 4 |
| frontend/pages/messages/thread-page.tsx | 15 |
| frontend/pages/my-submissions-page.tsx | 6 |
| frontend/pages/notifications/notification-model.ts | 0 |
| frontend/pages/notifications/notifications-page.tsx | 11 |
| frontend/pages/project-timeline-page.tsx | 10 |
| frontend/pages/projects-page.tsx | 12 |
| frontend/pages/search-page.tsx | 16 |
| frontend/pages/settings-page.tsx | 4 |
| frontend/pages/submit-page.tsx | 11 |
| frontend/pages/tasks/task-editor.tsx | 47 |
| frontend/pages/tasks/task-types.ts | 0 |
| frontend/pages/tasks/tasks-model.ts | 0 |
| frontend/pages/tasks/tasks-page.tsx | 19 |
| frontend/pages/today-page.tsx | 6 |
| frontend/pages/workbench-landing/public-workbench-page.tsx | 13 |
| frontend/pages/workbench-landing/workbench-copy.ts | 0 |
| frontend/pages/workbench-landing/workbench-demo-data.ts | 0 |
| frontend/pages/workbench-landing/workbench-demo-state.ts | 0 |
| frontend/pages/workbench-landing/workbench-feature-panel.tsx | 13 |
| frontend/pages/workbench-landing/workbench-scene-config.ts | 0 |
| frontend/pages/workbench-landing/workbench-scene-policy.ts | 0 |
| frontend/pages/workbench-landing/workbench-scene-runtime.ts | 4 |
| frontend/pages/workbench-landing/workbench-scene.tsx | 9 |
| frontend/pages/workbench-review-page.tsx | 11 |
| frontend/public/sw.js | 3 |
| frontend/styles/token-contract.ts | 0 |

## 路由与共享入口候选映射

以下来自现有成熟度清单的明确 root symbol，再按本地符号引用及相对 import 传递展开；不是把 app.tsx 的所有按钮归给每条路由。候选可过度近似（如局部变量同名）；跨模块动态渲染、默认/re-export 等未解析符号单独列出，不能声称无遗漏。JSON 保存每个入口对应的精确候选 ID。

| 路由/入口 | root symbol | 候选数 | 未解析符号 |
| --- | --- | ---: | --- |
| /graph | frontend/pages/graph-page.tsx#GraphRoute; frontend/pages/graph-page.tsx#GraphPage | 57 | 无（不代表动态边界已核对） |
| /projects/:id/timeline | frontend/app.tsx#ProjectTimelineRoute | 93 | 无（不代表动态边界已核对） |
| /inbox | frontend/app.tsx#InboxRoute | 128 | 无（不代表动态边界已核对） |
| /goals | frontend/app.tsx#GoalsRoute | 81 | 无（不代表动态边界已核对） |
| /projects | frontend/app.tsx#ProjectsRoute | 84 | 无（不代表动态边界已核对） |
| /calendar | frontend/app.tsx#CalendarRoute | 72 | 无（不代表动态边界已核对） |
| /today | frontend/app.tsx#TodayRoute | 28 | 无（不代表动态边界已核对） |
| /focus | frontend/app.tsx#FocusRoute | 71 | 无（不代表动态边界已核对） |
| /review | frontend/app.tsx#WorkbenchReviewRoute | 32 | 无（不代表动态边界已核对） |
| / | frontend/app.tsx#HomeRoute | 26 | 无（不代表动态边界已核对） |
| /submit | frontend/app.tsx#SubmitRoute | 57 | 无（不代表动态边界已核对） |
| /knowledge | frontend/app.tsx#KnowledgeRoute | 53 | 无（不代表动态边界已核对） |
| /search | frontend/app.tsx#SearchRoute; frontend/lib/search-data.ts#* | 62 | 无（不代表动态边界已核对） |
| /agent | frontend/app.tsx#AgentRoute; frontend/app.tsx#AgentConversationRoute; frontend/lib/agent-data.ts#*; frontend/lib/agent-turn-intent.ts#*; frontend/components/agent/agent-feedback.tsx#AgentFeedback; frontend/components/agent/agent-history-list.tsx#AgentHistoryList | 68 | 无（不代表动态边界已核对） |
| /my-submissions | frontend/app.tsx#MySubmissionsRoute | 37 | 无（不代表动态边界已核对） |
| /tasks | frontend/app.tsx#TasksRoute; frontend/lib/tasks-data.ts#*; frontend/pages/tasks/task-editor.tsx#TaskEditor | 114 | 无（不代表动态边界已核对） |
| /boards | frontend/app.tsx#BoardsRoute | 44 | 无（不代表动态边界已核对） |
| /environments | frontend/features/environments/environments-page.tsx#EnvironmentsPage; frontend/features/environments/environment-manager.ts#getEnvironmentManager | 58 | 无（不代表动态边界已核对） |
| /settings | frontend/pages/settings-page.tsx#SettingsPage | 10 | 无（不代表动态边界已核对） |
| /admin | frontend/pages/admin/admin-dashboard-route.tsx#AdminDashboardRoute | 12 | 无（不代表动态边界已核对） |
| /admin/submissions | frontend/app.tsx#ReviewQueueRoute | 74 | 无（不代表动态边界已核对） |
| /admin/duplicates | frontend/app.tsx#AdminDuplicateRoute; frontend/lib/admin-duplicates-data.ts#* | 54 | 无（不代表动态边界已核对） |
| /admin/assets | frontend/app.tsx#AdminAssetsRoute; frontend/lib/admin-assets-data.ts#* | 60 | 无（不代表动态边界已核对） |
| /admin/members | frontend/app.tsx#AdminMembersRoute; frontend/lib/admin-members-data.ts#* | 55 | 无（不代表动态边界已核对） |
| /admin/roles | frontend/app.tsx#AdminRolesRoute; frontend/lib/admin-roles-data.ts#* | 49 | 无（不代表动态边界已核对） |
| /admin/menus | frontend/app.tsx#AdminMenusRoute; frontend/lib/admin-menus-data.ts#* | 52 | 无（不代表动态边界已核对） |
| /admin/spaces | frontend/app.tsx#AdminSpacesRoute; frontend/lib/admin-spaces-data.ts#* | 64 | 无（不代表动态边界已核对） |
| /admin/audit | frontend/app.tsx#AdminAuditRoute | 35 | 无（不代表动态边界已核对） |
| /admin/analytics | frontend/app.tsx#AdminAnalyticsRoute | 43 | 无（不代表动态边界已核对） |
| /notifications | frontend/app.tsx#NotificationsRoute; frontend/lib/notifications-data.ts#* | 43 | 无（不代表动态边界已核对） |
| /messages | frontend/app.tsx#MessagesRoute | 22 | 无（不代表动态边界已核对） |
| /knowledge/:id | frontend/app.tsx#KnowledgeReaderRoute; frontend/app.tsx#KnowledgeReaderSession; frontend/lib/graph-evidence.ts#loadGraphCitation; frontend/lib/knowledge-reader-data.ts#* | 70 | 无（不代表动态边界已核对） |
| /messages/:id | frontend/app.tsx#DiscussionThreadRoute | 42 | 无（不代表动态边界已核对） |
| /admin/submissions/:id | frontend/pages/admin/review-detail-route.tsx#ReviewDetailRoute | 66 | 无（不代表动态边界已核对） |
| &lt;authenticated-shell&gt; | frontend/components/shell/app-shell.tsx#AppShell | 94 | 无（不代表动态边界已核对） |
| &lt;anonymous-home&gt; | frontend/pages/workbench-landing/public-workbench-page.tsx#PublicWorkbenchPage | 38 | 无（不代表动态边界已核对） |
| &lt;login&gt; | frontend/pages/login-page.tsx#LoginPage | 8 | 无（不代表动态边界已核对） |

尚未归入上述入口的候选：110。这些可能是 App 全局守卫、未接线组件或静态图盲区，必须核对，不能删掉以提高覆盖率。

## frontend/app.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 204:75 App | AppShell page | onNavigate=navigate; onLogout=() =&gt; logout(owner) | earlier return: sessionError; earlier return: anonymous && pathname === "/"; earlier return: anonymous; earlier return: !session |
| 231:39 renderPage | SettingsPage  |  | {"kind":"branch","expression":"session","branch":"true"} |
| 293:10 HomeRoute | HomePage  | onRetry=() =&gt; { if (pending.current) return; pending.current = true; setState({ kind: "loading" }); setRetry(value =&gt; value + 1); } |  |
| 367:10 AdminAnalyticsRoute | AdminAnalyticsPage  | onDaysChange=(nextDays) =&gt; navigateState({ days: nextDays, page: 1, pageSize }); onPageChange=(nextPage) =&gt; navigateState({ ...analyticsUrlState(readWo… |  |
| 425:5 AdminRolesRoute | owner.addEventListener  | "beforeunload", warn |  |
| 516:10 AdminRolesRoute | AdminRolesPage  | onLoadRetry=retryRead; onDiscardRecord=discardRecord; onSave=recordBlocked ? undefined : (role, allowBits) =&gt; mutate({ op: "update", roleId: role.id, allo… |  |
| 547:5 AdminMenusRoute | owner.addEventListener  | "beforeunload", warn |  |
| 639:10 AdminMenusRoute | AdminMenusPage  | onLoadRetry=retryRead; onDiscardRecord=discardRecord; onCreate=recordBlocked ? undefined : (input) =&gt; mutate({ op: "create", input }, () =&gt; createAdmin… |  |
| 718:14 KnowledgeReaderSession | KnowledgeReaderPage  | onRetry=() =&gt; setRetry((value) =&gt; value + 1) | {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"} |
| 726:10 KnowledgeReaderSession | KnowledgeReaderPage  | onCompare=showDiff; onToggleFavorite=toggleFavorite | earlier return: state.kind !== "ready" |
| 730:250 NotFoundPage | a frontendText(locale, "PAGE_RETURN_HOME") | href="/" |  |
| 785:10 KnowledgeRoute | KnowledgePage  | onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1); onPageChange=(next) =&gt; navigate({ page: next, pageSize }); onPageSizeChange=(next) =&gt; naviga… |  |
| 881:10 MemberSearchRoute | SearchPage  | onQueryChange=(value) =&gt; queryDraft.edit("query", value); onSubmit=submit; onPageChange=(next) =&gt; navigate({ page: next, pageSize }); onPageSizeChange=… |  |
| 887:88 AgentRoute | a frontendText(locale, "AGENT_NEW_CONVERSATION") | href="/agent" |  |
| 1033:183 AgentConversationRoute | Button frontendText(locale, "AGENT_INTENT_ABANDON") | onClick=abandon | {"kind":"branch","expression":"storageBlocked","branch":"true"} |
| 1034:324 AgentConversationRoute | Button frontendText(locale, "AGENT_INTENT_RETRY") | onClick=() =&gt; submit(intentRef.current!.question) | {"kind":"branch","expression":"unconfirmed && intentRef.current","branch":"true"}; earlier return: storageBlocked |
| 1034:437 AgentConversationRoute | Button frontendText(locale, "AGENT_INTENT_ABANDON") | onClick=abandon | {"kind":"branch","expression":"unconfirmed && intentRef.current","branch":"true"}; earlier return: storageBlocked |
| 1036:181 AgentConversationRoute | Button frontendText(locale, "AGENT_RETRY") | onClick=() =&gt; setRecoveryVersion((value) =&gt; value + 1) | {"kind":"branch","expression":"recovery === \"error\"","branch":"true"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; ea… |
| 1036:292 AgentConversationRoute | a frontendText(locale, "AGENT_NEW_CONVERSATION") | href="/agent" | {"kind":"branch","expression":"recovery === \"error\"","branch":"true"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; ea… |
| 1039:33 AgentConversationRoute | div  |  | {"kind":"logical","expression":"feedbackRecordBlocked","operator":"&&"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; ea… |
| 1039:200 AgentConversationRoute | Button frontendText(locale, "AGENT_FEEDBACK_RECORD_DISCARD") | onClick=discardFeedback; type="button" | {"kind":"logical","expression":"feedbackRecordBlocked","operator":"&&"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; ea… |
| 1040:83 AgentConversationRoute | div  |  | {"kind":"logical","expression":"feedbackIntent && visibleConversation !== feedbackIntent.conversationId","operator":"&&"}; earlier return: storageBlocked; ea… |
| 1040:250 AgentConversationRoute | Button frontendText(locale, "AGENT_FEEDBACK_RETRY") | onClick=retryFeedback; type="button" | {"kind":"logical","expression":"feedbackIntent && visibleConversation !== feedbackIntent.conversationId","operator":"&&"}; earlier return: storageBlocked; ea… |
| 1041:566 AgentConversationRoute | a citation.title ?? citation.id | href=citation.href | {"kind":"logical","expression":"history.length &gt; 0","operator":"&&"}; {"kind":"repeat","expression":"history"}; {"kind":"repeat","expression":"message.cit… |
| 1042:37 AgentConversationRoute | a frontendText(locale, "AGENT_RESTORE_LINK") | href=&#96;/agent?conversationId=${encodeURIComponent(conversationIdRef.current)}&#96; | {"kind":"logical","expression":"conversationIdRef.current","operator":"&&"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current… |
| 1043:7 AgentConversationRoute | AgentPage  | onQuestionChange=value =&gt; questionDraft.edit("question", value); onSubmit=() =&gt; submit(); onCancel=cancel; onRetry=() =&gt; submit(lastQuestion); onSta… | earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; earlier return: recovery === "loading" && state.kind !== "loading"; earlier… |
| 1147:41 MemberSubmitForm | SubmitPage  | onDraftChange=changeDraft; onSubmit=() =&gt; submit(draftRef.current) |  |
| 1174:10 MySubmissionsRoute | MySubmissionsPage  | onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1); onPageChange=(next) =&gt; navigate({ page: next, pageSize }); onPageSizeChange=(next) =&gt; naviga… |  |
| 1225:5 TasksRoute | owner.addEventListener  | "beforeunload", warn |  |
| 1367:27 TasksRoute | Button frontendText(locale, "TASKS_WRITE_RECORD_DISCARD") | onClick=discardRecord | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 1371:7 TasksRoute | Button frontendText(locale, "TASKS_CHECK_WRITE") | onClick=() =&gt; void resolveListUnknown("check") | disabled=listRecovering; {"kind":"logical","expression":"listUnknown","operator":"&&"} |
| 1372:7 TasksRoute | Button frontendText(locale, "TASKS_RETRY_WRITE") | onClick=() =&gt; void resolveListUnknown("retry") | disabled=listRecovering; {"kind":"logical","expression":"listUnknown","operator":"&&"} |
| 1374:29 TasksRoute | p actionNotice |  | {"kind":"logical","expression":"actionNotice","operator":"&&"} |
| 1374:90 TasksRoute | TasksPage  | onCreate=() =&gt; setEditor({ taskId: null }); onOpen=(taskId) =&gt; setEditor({ taskId }); onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1); onFilt… |  |
| 1374:955 TasksRoute | TaskEditor  | onClose=() =&gt; setEditor(null); onChanged=() =&gt; setRetryVersion((value) =&gt; value + 1); onDenied=clearDeniedTasks | {"kind":"logical","expression":"editor","operator":"&&"}; spread: (editor.restored ? { restored: editor.restored } : {}) |
| 1486:55 InboxRoute | PlanningWriteRecovery  | onDenied=clearDenied; onReadFailure=clearReadFailure |  |
| 1486:241 InboxRoute | InboxPage  | onRetry=() =&gt; setRetryVersion(value =&gt; value + 1); onCreateLock=locked =&gt; { captureLockedRef.current = locked; setCaptureLocked(locked); }; onCreate… |  |
| 1511:99 InboxRoute | TaskEditor  | onClose=() =&gt; setTaskTarget(null); onChanged=() =&gt; setRetryVersion(value =&gt; value + 1); onDenied=error =&gt; { if (clearDenied(error)) setTaskTarget… | {"kind":"logical","expression":"taskTarget","operator":"&&"} |
| 1633:12 GoalsRoute | PlanningWriteRecovery  | onDenied=clearDeniedGoals |  |
| 1633:160 GoalsRoute | GoalsPage  | onManageTasks=(goal) =&gt; { if (pendingRef.current &#124;&#124; createLockedRef.current &#124;&#124; writeRecovery.locked &#124;&#124; relationGoalRef.curre… |  |
| 1644:22 GoalsRoute | GoalTasksEditor  | onDenied=clearDeniedGoals; onReadFailure=relationReadFailed; onClose=() =&gt; void closeRelations(); onBeginWrite=writeRecovery.begin; onFinishWrite=writeRec… | {"kind":"logical","expression":"relationGoal","operator":"&&"} |
| 1806:12 ProjectsRoute | PlanningWriteRecovery  | onDenied=clearDeniedProjects |  |
| 1806:166 ProjectsRoute | ProjectsPage  | onManageRelations=openRelations; onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1); onRetrySummary=(project) =&gt; void retrySummary(project); onCrea… |  |
| 1808:40 ProjectsRoute | ProjectRelationsEditor  | onSummary=updateRelationSummary; onDenied=clearDeniedProjects; onClose=closeRelations; onBeginWrite=writeRecovery.begin; onFinishWrite=writeRecovery.finish | {"kind":"logical","expression":"relationProject","operator":"&&"} |
| 1935:12 ProjectTimelineRoute | PlanningWriteRecovery  | onDenied=clearDenied |  |
| 1935:165 ProjectTimelineRoute | ProjectTimelinePage  | onRetry=() =&gt; setRetryVersion(value =&gt; value + 1); onBack=() =&gt; writeWorkspaceHistory("push", "/projects"); onCreate=async input =&gt; { if (pending… |  |
| 2028:12 CalendarRoute | PlanningWriteRecovery  | onDenied=clearDenied; onReadFailure=clearReadFailure |  |
| 2028:198 CalendarRoute | CalendarPage  | onRangeChange=range =&gt; navigate({ ...query, ...range, page: 1 }); onPageChange=next =&gt; navigate({ ...query, page: next }); onPageSizeChange=size =&gt; … |  |
| 2064:51 TodayRoute | TodayPage  | onOpen=setTarget; onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1) |  |
| 2064:184 TodayRoute | TodayTargetDetail  | onClose=() =&gt; setTarget(null); onDenied=clearDenied | {"kind":"logical","expression":"target","operator":"&&"} |
| 2089:5 FocusRoute | owner.addEventListener  | "beforeunload", warn |  |
| 2240:5 FocusRoute | p frontendText(locale, transitionRecovery.kind === "blocked" ? "FOCUS_STORAGE_BLOCKED" : "FOCUS_TRANSITION_UNCERTAIN") |  | {"kind":"branch","expression":"transitionRecovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"} |
| 2241:5 FocusRoute | Button frontendText(locale, "FOCUS_RETRY") | onClick=() =&gt; setRetryVersion(value =&gt; value + 1) | disabled=pending; {"kind":"branch","expression":"transitionRecovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"} |
| 2242:81 FocusRoute | Button frontendText(locale, "FOCUS_RETRY_TRANSITION") | onClick=() =&gt; void mutate(epoch =&gt; sendTransition(epoch, transitionRecovery.intent, true)) | disabled=pending; {"kind":"branch","expression":"transitionRecovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"}; {"kind":"logical","expr… |
| 2246:5 FocusRoute | p frontendText(locale, recovery.kind === "blocked" ? "FOCUS_STORAGE_BLOCKED" : "FOCUS_START_UNCERTAIN") |  | {"kind":"branch","expression":"recovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"}; earlier return: transitionRecovery.kind !== "empty"… |
| 2247:5 FocusRoute | Button frontendText(locale, "FOCUS_RETRY") | onClick=() =&gt; setRetryVersion(value =&gt; value + 1) | disabled=pending; {"kind":"branch","expression":"recovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"}; earlier return: transitionRecover… |
| 2248:61 FocusRoute | Button frontendText(locale, "FOCUS_RETRY_START") | onClick=() =&gt; void mutate(epoch =&gt; sendStart(epoch, recovery.intent, recovery.intent), true) | disabled=pending; {"kind":"branch","expression":"recovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"}; {"kind":"logical","expression":"r… |
| 2250:10 FocusRoute | FocusPage  | onDenied=clearDenied; onRetry=() =&gt; setRetryVersion(value =&gt; value + 1); onStart=input =&gt; void mutate(epoch =&gt; sendStart(epoch, input)); onTransi… | earlier return: transitionRecovery.kind !== "empty" && state.kind === "ready"; earlier return: recovery.kind !== "empty" && state.kind === "ready" |
| 2283:51 WorkbenchReviewRoute | WorkbenchReviewPage  | onOpen=setTarget; onPeriodChange=changePeriod; onRetry=() =&gt; { setState({ kind: "loading" }); setRetryVersion((value) =&gt; value + 1); } |  |
| 2283:276 WorkbenchReviewRoute | SnapshotTargetDetail  | onClose=() =&gt; setTarget(null); onDenied=clearDenied | {"kind":"logical","expression":"target","operator":"&&"} |
| 2408:5 NotificationsRoute | window.addEventListener  | "beforeunload", warn |  |
| 2466:10 NotificationsRoute | NotificationsPage  | onRetry=() =&gt; { invalidateSnapshot({ kind: "loading" }); setRetryVersion((value) =&gt; value + 1); }; onFilterChange=(filters: NotificationFilters) =&gt; … |  |
| 2560:10 MessagesRoute | MessagesPage  | onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1); onNext=(cursor) =&gt; navigate({ page: query.page + 1, limit: query.limit, cursor }); onPrevious=(… |  |
| 2660:10 MemberDiscussionThreadRoute | ThreadPage  | onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1); onRefresh=() =&gt; setRetryVersion((value) =&gt; value + 1); onNext=(cursor) =&gt; navigate({ page… |  |
| 2750:5 BoardsRoute | owner.addEventListener  | "beforeunload", warn |  |
| 2905:10 BoardsRoute | BoardsPage  | onDiscardRecord=() =&gt; { if (!memberId &#124;&#124; !discardBlockedBoardMove(memberId)) { setActionError(frontendText(locale, "BOARDS_MOVE_RECORD_STUCK"));… |  |
| 3085:94 ReviewQueueRoute | ReviewQueueSession  |  | spread: props |
| 3112:5 ReviewQueueSession | owner.addEventListener  | "beforeunload", warn |  |
| 3252:10 ReviewQueueSession | ReviewQueuePage  | onOpenDetail=(id) =&gt; writeWorkspaceHistory("push", &#96;/admin/submissions/${encodeURIComponent(id)}&#96;); onDiscardDecisionRecord=discardRecord; onRetry… |  |
| 3292:5 AdminDuplicateRoute | owner.addEventListener  | "beforeunload", warn |  |
| 3409:10 AdminDuplicateRoute | DuplicateQueuePage  | onLoadRetry=retryRead; onDiscardDecisionRecord=discardRecord; onDecision=recordBlocked ? undefined : (id, decision) =&gt; void decide(id, decision); onPageCh… |  |
| 3446:5 AdminMembersRoute | owner.addEventListener  | "beforeunload", warn |  |
| 3566:10 AdminMembersRoute | MembersPage  | onLoadRetry=retryRead; onDiscardStatusRecord=discardRecord; onStatusFilterChange=(next) =&gt; navigate({ page: 1, pageSize, status: next &#124;&#124; undefin… |  |
| 3590:5 AdminSpacesRoute | owner.addEventListener  | "beforeunload", warn |  |
| 3698:10 AdminSpacesRoute | SpacesPage  | onLoadRetry=() =&gt; void read(); onLoadMore=() =&gt; void read("spaces"); onLoadCollections=id =&gt; void read("collections", id); onDiscardRecord=discardRe… |  |
| 3763:10 AdminAuditRoute | AuditPage  | onRetry=retry; onActionChange=changeFilter; onPageChange=(next) =&gt; navigate({ page: next, pageSize }); onPageSizeChange=(next) =&gt; navigate({ page: 1, p… |  |
| 3807:7 AdminAssetsRoute | owner.addEventListener  | "beforeunload", warn | {"kind":"branch","expression":"locked && !leaveGuardRef.current","branch":"true"} |
| 3936:10 AdminAssetsRoute | AssetQueuePage  | onLoadRetry=retryRead; onDiscardRecord=discardRecord; onRetry=recordBlocked ? undefined : (id) =&gt; void retry(id); onPreview=(id) =&gt; void showPreview(id… |  |

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
| 32:30 AgentHistoryList | p frontendText(locale, "AGENT_LIST_LOADING") |  | {"kind":"logical","expression":"status === \"loading\"","operator":"&&"}; earlier return: !opened |
| 33:28 AgentHistoryList | div  |  | {"kind":"logical","expression":"status === \"error\"","operator":"&&"}; earlier return: !opened |
| 33:95 AgentHistoryList | Button frontendText(locale, "AGENT_LIST_RETRY") | onClick=() =&gt; navigate(cursors); type="button" | {"kind":"logical","expression":"status === \"error\"","operator":"&&"}; earlier return: !opened |
| 34:181 AgentHistoryList | a item.createdAt / · / item.id | href=&#96;/agent?conversationId=${encodeURIComponent(item.id)}&#96; | {"kind":"logical","expression":"status === \"ready\" && page","operator":"&&"}; {"kind":"repeat","expression":"page.items"}; earlier return: !opened |
| 36:7 AgentHistoryList | Button frontendText(locale, "AGENT_LIST_PREVIOUS") | onClick=() =&gt; navigate(cursors.slice(0, -1)); type="button" | disabled=status === "loading" &#124;&#124; cursors.length &lt;= 1; earlier return: !opened |
| 37:7 AgentHistoryList | Button frontendText(locale, "AGENT_LIST_NEXT") | onClick=() =&gt; { if (page?.nextCursor) navigate([...cursors, page.nextCursor]); }; type="button" | disabled=status !== "ready" &#124;&#124; !page?.nextCursor; earlier return: !opened |
| 38:7 AgentHistoryList | Button frontendText(locale, "AGENT_LIST_REFRESH") | onClick=() =&gt; navigate([undefined]); type="button" | disabled=status === "loading"; earlier return: !opened |

## frontend/components/agent/answer-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 11:1150 AnswerPanel | a  | href=citation.href | {"kind":"repeat","expression":"state.citations"}; earlier return: state.kind === "error" |

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
| 110:7 CalendarCreateForm | Input  | onChange=e =&gt; draft.edit("title", e.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}} |
| 111:7 CalendarCreateForm | Input  | onChange=e =&gt; draft.edit("startsAt", e.currentTarget.value); type="datetime-local" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}} |
| 112:7 CalendarCreateForm | Input  | onChange=e =&gt; draft.edit("endsAt", e.currentTarget.value); type="datetime-local" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}} |
| 114:38 CalendarCreateForm | p frontendText(locale, "CALENDAR_CREATE_STORAGE_BLOCKED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 114:115 CalendarCreateForm | Button frontendText(locale, "CALENDAR_CREATE_STORAGE_RETRY") | onClick=reloadStored; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 115:33 CalendarCreateForm | p frontendText(locale, "CALENDAR_CREATE_UNKNOWN") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 115:139 CalendarCreateForm | Button frontendText(locale, "CALENDAR_CREATE_RETRY") | onClick=() =&gt; void submit(); type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 116:37 CalendarCreateForm | p frontendText(locale, "CALENDAR_CREATE_READ_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 116:147 CalendarCreateForm | Button frontendText(locale, "CALENDAR_CREATE_READ_RETRY") | onClick=() =&gt; { if (phaseRef.current === "read-failed") void readback(); }; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 117:9 CalendarCreateForm | Button frontendText(locale, "CALENDAR_CREATE") | onClick=() =&gt; void submit(); type="button" | disabled=locked &#124;&#124; !title.trim() &#124;&#124; !startsAt &#124;&#124; !endsAt &#124;&#124; !onCreate; {"kind":"container","tag":"div","attributes":{… |
| 118:15 CalendarCreateForm | p frontendText(locale, "CALENDAR_ACTION_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"error… |

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

## frontend/components/focus-action-confirmation.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 40:13 useFocusActionConfirmation | ConfirmAction  | onCancel=dismiss; onConfirm=confirm | open=valid |

## frontend/components/focus-task-picker.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 32:5 FocusTaskPicker | form  | onSubmit=event =&gt; {event.preventDefault(); setState({kind: "loading"}); setQuery({...query, page: 1, q: draft.trim()});} |  |
| 33:7 FocusTaskPicker | Input  | onChange=event =&gt; setDraft(event.currentTarget.value) | {"kind":"container","tag":"form","attributes":{}} |
| 34:7 FocusTaskPicker | Button frontendText(locale, "FOCUS_SEARCH_TASKS") | type="submit" | {"kind":"container","tag":"form","attributes":{}} |
| 36:34 FocusTaskPicker | p frontendText(locale, "FOCUS_TASKS_LOADING") |  | {"kind":"logical","expression":"state.kind === \"loading\"","operator":"&&"} |
| 37:32 FocusTaskPicker | div  |  | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"} |
| 37:104 FocusTaskPicker | Button frontendText(locale, "FOCUS_TASKS_RETRY") | onClick=() =&gt; setRetry(value =&gt; value + 1) | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"} |
| 40:81 FocusTaskPicker | Button task.title | onClick=() =&gt; onSelect(task) | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"repeat","expression":"state.page.items"} |
| 41:7 FocusTaskPicker | DataPagination  | onPageChange=page =&gt; {setState({kind: "loading"}); setQuery({...query, page});}; onPageSizeChange=pageSize =&gt; {setState({kind: "loading"}); setQuery({.… | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; spread: state.page.pagination |
| 43:5 FocusTaskPicker | Button frontendText(locale, "FOCUS_PICKER_CLOSE") | onClick=onClose |  |

## frontend/components/goal-tasks-editor.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 102:10 GoalTasksEditor | section  |  |  |
| 103:133 GoalTasksEditor | Button frontendText(locale, "RELATIONS_CLOSE") | onClick=close; type="button" | disabled=writing &#124;&#124; !!decision |
| 104:16 GoalTasksEditor | p notice |  | {"kind":"logical","expression":"notice","operator":"&&"} |
| 105:14 GoalTasksEditor | p frontendText(locale, "RELATIONS_LOADING") |  | {"kind":"logical","expression":"busy","operator":"&&"} |
| 106:16 GoalTasksEditor | div  |  | {"kind":"logical","expression":"failed","operator":"&&"} |
| 106:83 GoalTasksEditor | Button frontendText(locale, "RELATIONS_RETRY") | onClick=() =&gt; { if (!busyRef.current && !decisionRef.current) void read(); }; type="button" | disabled=locked; {"kind":"logical","expression":"failed","operator":"&&"} |
| 108:189 GoalTasksEditor | Button frontendText(locale, item.linked ? "RELATIONS_UNLINK" : "RELATIONS_LINK") | onClick=event =&gt; requestMutation(item, event?.currentTarget); type="button" | disabled=locked &#124;&#124; writeBlocked &#124;&#124; !!pendingWrite.current; {"kind":"logical","expression":"data","operator":"&&"}; {"kind":"repeat","expr… |
| 110:7 GoalTasksEditor | DataPagination  | onPageChange=page =&gt; change({ ...request, page }); onPageSizeChange=pageSize =&gt; change({ page: 1, pageSize }) | {"kind":"logical","expression":"data","operator":"&&"}; spread: data.pagination |
| 112:5 GoalTasksEditor | ConfirmAction  | onCancel=cancel; onConfirm=confirm | open=!!decision |

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
| 43:277 GraphEvidencePanel | a citation.title | href=&#96;/knowledge/${encodeURIComponent(citation.knowledgeItemId)}#${encodeURIComponent(citation.citationId)}&#96; | {"kind":"repeat","expression":"state.citations"}; earlier return: state.kind === "idle"; earlier return: state.kind === "loading"; earlier return: state.kind… |

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
| 109:43 InboxCreateForm | select  | onChange=event =&gt; draft.edit("kind", event.currentTarget.value as "text" &#124; "link") | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}} |
| 109:277 InboxCreateForm | option frontendText(locale, "INBOX_KIND_TEXT") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"container","tag":"select","a… |
| 109:348 InboxCreateForm | option frontendText(locale, "INBOX_KIND_LINK") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"container","tag":"select","a… |
| 109:448 InboxCreateForm | Input  | onChange=event =&gt; draft.edit("sourceUrl", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","e… |
| 110:5 InboxCreateForm | Textarea  | onChange=event =&gt; draft.edit("content", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}} |
| 111:38 InboxCreateForm | p frontendText(locale, "INBOX_CREATE_STORAGE_BLOCKED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 111:112 InboxCreateForm | Button frontendText(locale, "INBOX_CREATE_STORAGE_RETRY") | onClick=reloadStored; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 112:33 InboxCreateForm | p frontendText(locale, "INBOX_CREATE_UNKNOWN") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 112:136 InboxCreateForm | Button frontendText(locale, "INBOX_CREATE_RETRY") | onClick=() =&gt; void submit(); type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 113:37 InboxCreateForm | p frontendText(locale, "INBOX_CREATE_READ_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 113:144 InboxCreateForm | Button frontendText(locale, "INBOX_CREATE_READ_RETRY") | onClick=() =&gt; { if (phaseRef.current === "read-failed") void readback(); }; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 114:9 InboxCreateForm | Button frontendText(locale, "INBOX_CAPTURE") | onClick=() =&gt; void submit(); type="button" | disabled=locked &#124;&#124; !content.trim() &#124;&#124; !onCreate; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&… |
| 115:15 InboxCreateForm | p frontendText(locale, "INBOX_ACTION_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"error… |

## frontend/components/knowledge/knowledge-card.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 19:39 KnowledgeCard | a title | href=&#96;/knowledge/${encodeURIComponent(item.id)}&#96; |  |
| 19:534 KnowledgeCard | button frontendText(locale, "KNOWLEDGE_SHARE_ACTION") | onClick=() =&gt; void share(); type="button" |  |
| 19:731 KnowledgeCard | span frontendText(locale, "KNOWLEDGE_SHARE_DONE") |  | {"kind":"logical","expression":"shareState === \"shared\"","operator":"&&"} |
| 19:880 KnowledgeCard | span frontendText(locale, "KNOWLEDGE_SHARE_UNAVAILABLE") |  | {"kind":"logical","expression":"shareState === \"unavailable\"","operator":"&&"} |

## frontend/components/planning-create-form.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 101:5 PlanningCreateForm | Input  | onChange=(event) =&gt; draft.edit("title", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}} |
| 102:5 PlanningCreateForm | Textarea  | onChange=(event) =&gt; draft.edit("description", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}} |
| 103:38 PlanningCreateForm | p frontendText(locale, "PLANNING_CREATE_STORAGE_BLOCKED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 103:115 PlanningCreateForm | Button frontendText(locale, "PLANNING_CREATE_STORAGE_RETRY") | onClick=reloadStored; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 104:33 PlanningCreateForm | p frontendText(locale, "PLANNING_CREATE_UNKNOWN") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 104:139 PlanningCreateForm | Button frontendText(locale, "PLANNING_CREATE_RETRY") | onClick=() =&gt; void submit(); type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 105:37 PlanningCreateForm | p frontendText(locale, "PLANNING_CREATE_READ_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 105:147 PlanningCreateForm | Button frontendText(locale, "PLANNING_CREATE_READ_RETRY") | onClick=() =&gt; { if (phaseRef.current === "read-failed") void readback(); }; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 106:9 PlanningCreateForm | Button frontendText(locale, &#96;${kind}_CREATE&#96;) | onClick=() =&gt; void submit(); type="button" | disabled=locked &#124;&#124; !title.trim() &#124;&#124; !onCreate; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#1… |
| 107:15 PlanningCreateForm | p frontendText(locale, &#96;${kind}_ACTION_FAILED&#96;) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"error… |

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
| 140:10 ProjectRelationsEditor | section  |  |  |
| 141:141 ProjectRelationsEditor | Button text("RELATIONS_CLOSE") | onClick=close; type="button" | disabled=writing &#124;&#124; !!decision |
| 142:77 ProjectRelationsEditor | Button text(value === "goals" ? "PROJECTS_GOALS" : "PROJECTS_TASKS") | onClick=() =&gt; change(value, { page: 1, pageSize: request.pageSize }); type="button" | disabled=locked &#124;&#124; !!pendingWrite.current &#124;&#124; writeBlocked &#124;&#124; value === kind; {"kind":"repeat","expression":"([\"goals\", \"task… |
| 143:16 ProjectRelationsEditor | p notice |  | {"kind":"logical","expression":"notice","operator":"&&"} |
| 144:14 ProjectRelationsEditor | p text("RELATIONS_LOADING") |  | {"kind":"logical","expression":"busy","operator":"&&"} |
| 145:16 ProjectRelationsEditor | div  |  | {"kind":"logical","expression":"failed","operator":"&&"} |
| 145:67 ProjectRelationsEditor | Button text("RELATIONS_RETRY") | onClick=() =&gt; { if (!busyRef.current && !decisionRef.current) void read(); }; type="button" | disabled=locked; {"kind":"logical","expression":"failed","operator":"&&"} |
| 146:341 ProjectRelationsEditor | Button text(item.linked ? "RELATIONS_UNLINK" : "RELATIONS_LINK") | onClick=event =&gt; requestMutation(item, event?.currentTarget); type="button" | disabled=locked &#124;&#124; writeBlocked &#124;&#124; !!pendingWrite.current; {"kind":"logical","expression":"data","operator":"&&"}; {"kind":"repeat","expr… |
| 148:7 ProjectRelationsEditor | DataPagination  | onPageChange=page =&gt; change(kind, { ...request, page }); onPageSizeChange=pageSize =&gt; change(kind, { page: 1, pageSize }) | {"kind":"logical","expression":"data","operator":"&&"}; spread: data.pagination |
| 150:5 ProjectRelationsEditor | ConfirmAction  | onCancel=cancel; onConfirm=confirm | open=!!decision |

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

## frontend/components/search/search-result-list.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 6:157 SearchResultList | a result.title?.trim() &#124;&#124; frontendText(locale, "SEARCH_UNTITLED") | href=result.href | {"kind":"repeat","expression":"results"} |
| 6:651 SearchResultList | a frontendText(locale, "SEARCH_ASK_RESULT") | href=&#96;/agent?scope=items&knowledgeItemId=${encodeURIComponent(result.knowledgeItemId)}&#96; | {"kind":"repeat","expression":"results"}; {"kind":"logical","expression":"result.knowledgeItemId","operator":"&&"} |

## frontend/components/shell/app-shell.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 97:7 AppShell | a locale.t("SHELL_SKIP_MAIN") | href="#main-content" |  |
| 102:13 AppShell | Button  | onClick=() =&gt; setCollapsed((value) =&gt; !value); type="button" | aria-expanded=!collapsed |
| 107:13 AppShell | NavGroup  | onNavigate=navigate; onToggle=(id) =&gt; setExpanded((value) =&gt; ({ ...value, [id]: !value[id] })) |  |
| 108:40 AppShell | NavGroup  | onNavigate=navigate; onToggle=(id) =&gt; setExpanded((value) =&gt; ({ ...value, [id]: !value[id] })) | {"kind":"logical","expression":"adminRoutes.length &gt; 0","operator":"&&"} |
| 111:93 AppShell | AccountMenu  | onActiveMenuChange=setActiveMenu; onThemeChange=changeTheme; onNavigate=navigate; onLogout=onLogout | {"kind":"branch","expression":"collapsed","branch":"true"} |
| 112:81 AppShell | AccountMenu  | onActiveMenuChange=setActiveMenu; onThemeChange=changeTheme; onNavigate=navigate; onLogout=onLogout | {"kind":"branch","expression":"collapsed","branch":"false"} |
| 119:13 AppShell | CommandPalette  | onNavigate=navigate; onToggleTheme=toggleTheme; onLogout=onLogout |  |
| 121:75 AppShell | a  | onClick=(event) =&gt; { event.preventDefault(); navigate(link.path); }; href=link.path | {"kind":"repeat","expression":"collaborationLinks"} |
| 121:820 AppShell | span unreadState.kind === "ready" ? unreadState.unread : unreadState.kind === "loading" ? "…" : "—" |  | {"kind":"repeat","expression":"collaborationLinks"}; {"kind":"logical","expression":"link.path === \"/notifications\"","operator":"&&"} |
| 121:1190 AppShell | Button locale.t("COMMON_RETRY") | onClick=notificationSummary.retry | {"kind":"repeat","expression":"collaborationLinks"}; {"kind":"logical","expression":"link.path === \"/notifications\" && unreadState.kind === \"error\"","ope… |
| 123:13 AppShell | DropdownMenu  | onOpenChange=(open) =&gt; setActiveMenu(open ? "language" : null) | open=activeMenu === "language" |
| 124:15 AppShell | DropdownMenuTrigger  |  | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === \"language\""}} |
| 126:17 AppShell | DropdownMenuItem locale.t("SHELL_LANGUAGE_EN") | onClick=() =&gt; locale.setLocale("en") | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === \"language\""}} |
| 127:17 AppShell | DropdownMenuItem locale.t("SHELL_LANGUAGE_ZH_CN") | onClick=() =&gt; locale.setLocale("zh-CN") | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === \"language\""}} |
| 132:148 AppShell | MobileNavigation  | onNavigate=navigate; onActiveMenuChange=setActiveMenu; onThemeChange=changeTheme; onLogout=onLogout |  |
| 134:307 AppShell | section  |  | {"kind":"branch","expression":"access.kind === \"forbidden\"","branch":"true"} |
| 148:210 NavGroup | NavNode  | onNavigate=onNavigate; onToggle=onToggle | {"kind":"repeat","expression":"nodes"} |
| 158:29 NavNode | button  | onClick=(event) =&gt; event.preventDefault(); type="button" | aria-disabled="true" |
| 161:14 NavNode | a  | onClick=(event) =&gt; { event.preventDefault(); onNavigate(path); }; href=path | {"kind":"branch","expression":"path && unavailable","branch":"false"}; {"kind":"branch","expression":"path","branch":"true"} |
| 162:9 NavNode | button  | onClick=() =&gt; onToggle(node.id); type="button" | aria-expanded=expanded[node.id] ?? false; {"kind":"branch","expression":"path && unavailable","branch":"false"}; {"kind":"branch","expression":"path","branch… |
| 163:168 NavNode | button  | onClick=() =&gt; onToggle(node.id); type="button" | aria-expanded=expanded[node.id] ?? false; {"kind":"logical","expression":"hasChildren && !collapsed","operator":"&&"} |
| 163:688 NavNode | NavNode  | onNavigate=onNavigate; onToggle=onToggle | {"kind":"logical","expression":"hasChildren && (expanded[node.id] ?? false) && !collapsed && depth &lt; 4","operator":"&&"}; {"kind":"repeat","expression":"n… |
| 206:135 Breadcrumb | a locale.t("NAV_HOME") | href="/" |  |
| 211:33 NavIcon | Checks  |  | {"kind":"branch","expression":"path === \"/tasks\"","branch":"true"}; spread: props |
| 212:34 NavIcon | Kanban  |  | {"kind":"branch","expression":"path === \"/boards\"","branch":"true"}; earlier return: path === "/tasks"; spread: props |
| 213:41 NavIcon | Bell  |  | {"kind":"branch","expression":"path === \"/notifications\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; spread: … |
| 214:36 NavIcon | ChatCircle  |  | {"kind":"branch","expression":"path === \"/messages\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier retur… |
| 215:33 NavIcon | ChartLine  |  | {"kind":"branch","expression":"path === \"/graph\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 216:28 NavIcon | House  |  | {"kind":"branch","expression":"path === \"/\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: path … |
| 217:37 NavIcon | BookOpen  |  | {"kind":"branch","expression":"path === \"/knowledge\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier retu… |
| 218:34 NavIcon | UploadSimple  |  | {"kind":"branch","expression":"path === \"/submit\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return:… |
| 219:34 NavIcon | MagnifyingGlass  |  | {"kind":"branch","expression":"path === \"/search\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return:… |
| 220:33 NavIcon | Sparkle  |  | {"kind":"branch","expression":"path === \"/agent\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 221:42 NavIcon | Files  |  | {"kind":"branch","expression":"path === \"/my-submissions\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier… |
| 222:33 NavIcon | Target  |  | {"kind":"branch","expression":"path === \"/goals\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 223:36 NavIcon | FolderSimple  |  | {"kind":"branch","expression":"path === \"/projects\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier retur… |
| 224:36 NavIcon | CalendarBlank  |  | {"kind":"branch","expression":"path === \"/calendar\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier retur… |
| 225:33 NavIcon | CalendarBlank  |  | {"kind":"branch","expression":"path === \"/today\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 226:33 NavIcon | Timer  |  | {"kind":"branch","expression":"path === \"/focus\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 227:34 NavIcon | Check  |  | {"kind":"branch","expression":"path === \"/review\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return:… |
| 228:33 NavIcon | ShieldCheck  |  | {"kind":"branch","expression":"path === \"/admin\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 229:45 NavIcon | NotePencil  |  | {"kind":"branch","expression":"path === \"/admin/submissions\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earl… |
| 230:40 NavIcon | Stack  |  | {"kind":"branch","expression":"path === \"/admin/assets\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier r… |
| 231:41 NavIcon | UsersThree  |  | {"kind":"branch","expression":"path === \"/admin/members\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier … |
| 232:39 NavIcon | ShieldCheck  |  | {"kind":"branch","expression":"path === \"/admin/roles\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier re… |
| 233:39 NavIcon | DotsThree  |  | {"kind":"branch","expression":"path === \"/admin/menus\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier re… |
| 234:40 NavIcon | Stack  |  | {"kind":"branch","expression":"path === \"/admin/spaces\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier r… |
| 235:39 NavIcon | Scroll  |  | {"kind":"branch","expression":"path === \"/admin/audit\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier re… |
| 236:43 NavIcon | ChartLine  |  | {"kind":"branch","expression":"path === \"/admin/analytics\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlie… |
| 237:10 NavIcon | DotsThree  |  | earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: path === "/notifications"; earlier return: path === "/messages"; earli… |
| 256:10 AccountMenu | DropdownMenu  | onOpenChange=(open) =&gt; onActiveMenuChange(open ? menuId : null) | open=activeMenu === menuId |
| 256:135 AccountMenu | DropdownMenuTrigger  |  | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === menuId"}} |
| 256:1163 AccountMenu | DropdownMenuItem locale.t("SHELL_SETTINGS") | onClick=selectSettings | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === menuId"}} |
| 256:1472 AccountMenu | DropdownMenuItem locale.t("SHELL_THEME_LIGHT") / selectedThemeIndicator("light") | onClick=() =&gt; selectTheme("light") | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === menuId"}} |
| 256:1758 AccountMenu | DropdownMenuItem locale.t("SHELL_THEME_DARK") / selectedThemeIndicator("dark") | onClick=() =&gt; selectTheme("dark") | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === menuId"}} |
| 256:2039 AccountMenu | DropdownMenuItem locale.t("SHELL_THEME_SYSTEM") / selectedThemeIndicator("system") | onClick=() =&gt; selectTheme("system") | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === menuId"}} |
| 256:2317 AccountMenu | p logoutError |  | {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === menuId"}}; {"kind":"logical","expression":"logoutError","operator":"&&"} |
| 256:2398 AccountMenu | DropdownMenuItem logoutPending ? locale.t("SHELL_LOGGING_OUT") : locale.t("SHELL_LOGOUT") | onClick=onLogout | disabled=logoutPending; {"kind":"container","tag":"DropdownMenu","attributes":{"open":"activeMenu === menuId"}} |
| 262:10 MobileNavigation | Sheet  | onOpenChange=setOpen | open=open |
| 262:52 MobileNavigation | details  |  | open=open; {"kind":"container","tag":"Sheet","attributes":{"open":"open"}} |
| 262:102 MobileNavigation | summary locale.t("SHELL_OPEN_NAVIGATION") | onClick=(event) =&gt; { event.preventDefault(); setOpen((current) =&gt; !current); } | {"kind":"container","tag":"Sheet","attributes":{"open":"open"}}; {"kind":"container","tag":"details","attributes":{"open":"open"}} |
| 262:885 MobileNavigation | button  | type="button" | disabled=true; aria-disabled="true"; {"kind":"container","tag":"Sheet","attributes":{"open":"open"}}; {"kind":"container","tag":"details","attributes":{"open… |
| 262:1263 MobileNavigation | a locale.t(route.labelKey) | onClick=(event) =&gt; { event.preventDefault(); setOpen(false); onNavigate(path); }; href=path | {"kind":"container","tag":"Sheet","attributes":{"open":"open"}}; {"kind":"container","tag":"details","attributes":{"open":"open"}}; {"kind":"repeat","express… |
| 262:1701 MobileNavigation | AccountMenu  | onActiveMenuChange=onActiveMenuChange; onThemeChange=onThemeChange; onNavigate=(path) =&gt; { setOpen(false); onNavigate(path); }; onLogout=onLogout | {"kind":"container","tag":"Sheet","attributes":{"open":"open"}}; {"kind":"container","tag":"details","attributes":{"open":"open"}} |

## frontend/components/shell/command-palette.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 41:5 CommandPalette | document.addEventListener  | "keydown", onKeyDown |  |
| 65:5 CommandPalette | Button  | onClick=() =&gt; setOpen(true); type="button" |  |
| 69:5 CommandPalette | Button  | onClick=() =&gt; setOpen(true); type="button" |  |
| 70:5 CommandPalette | Dialog  | onOpenChange=setOpen | open=open |
| 71:7 CommandPalette | DialogContent  | onKeyDown=(event) =&gt; { if (event.target !== inputRef.current) return; if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) =&gt… | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |
| 77:302 CommandPalette | Input  | onChange=(event) =&gt; { setQuery(event.target.value); setActiveIndex(0); } | aria-expanded=open; {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |
| 78:9 CommandPalette | div  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |
| 79:63 CommandPalette | button  | onFocus=() =&gt; setActiveIndex(index); onMouseEnter=() =&gt; setActiveIndex(index); onClick=() =&gt; execute(command); type="button" | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}}; {"kind":"branch","expression":"filtered.length","branch":"true"}; {"kind":"repeat","express… |

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
| 110:39 TimelineCreateForm | p frontendText(locale, "PLANNING_CREATE_STORAGE_BLOCKED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"phase… |
| 110:116 TimelineCreateForm | Button frontendText(locale, "PLANNING_CREATE_STORAGE_RETRY") | onClick=reloadStored; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","… |
| 111:31 TimelineCreateForm | p frontendText(locale, "PLANNING_CREATE_UNKNOWN") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"phase… |
| 111:100 TimelineCreateForm | Button frontendText(locale, "PLANNING_CREATE_RETRY") | onClick=() =&gt; void submit(); type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","… |
| 112:35 TimelineCreateForm | p frontendText(locale, "PLANNING_CREATE_READ_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"phase… |
| 112:108 TimelineCreateForm | Button frontendText(locale, "PLANNING_CREATE_READ_RETRY") | onClick=() =&gt; { if (phaseRef.current === "read-failed") void readback(); }; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","… |
| 113:15 TimelineCreateForm | p frontendText(locale, "PROJECT_TIMELINE_ACTION_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"error… |
| 123:11 TimelineCreateForm | select  | onChange=(event) =&gt; draft.edit("kind", event.currentTarget.value as ProjectTimelineKind) | disabled=locked; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |
| 124:13 TimelineCreateForm | option frontendText(locale, "PROJECT_TIMELINE_KIND_MEETING") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; {"kind":"container","tag":"select","attributes":{"disabled":"locked"}} |
| 125:13 TimelineCreateForm | option frontendText(locale, "PROJECT_TIMELINE_KIND_DECISION") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; {"kind":"container","tag":"select","attributes":{"disabled":"locked"}} |
| 126:13 TimelineCreateForm | option frontendText(locale, "PROJECT_TIMELINE_KIND_ACTION") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; {"kind":"container","tag":"select","attributes":{"disabled":"locked"}} |
| 127:13 TimelineCreateForm | option frontendText(locale, "PROJECT_TIMELINE_KIND_MILESTONE") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; {"kind":"container","tag":"select","attributes":{"disabled":"locked"}} |
| 130:9 TimelineCreateForm | Input  | onChange=(event) =&gt; draft.edit("title", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |
| 131:9 TimelineCreateForm | Textarea  | onChange=(event) =&gt; draft.edit("body", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |
| 134:11 TimelineCreateForm | Input  | onChange=(event) =&gt; draft.edit("startsAt", event.currentTarget.value); type="datetime-local" | disabled=locked; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |
| 138:11 TimelineCreateForm | Input  | onChange=(event) =&gt; draft.edit("dueAt", event.currentTarget.value); type="datetime-local" | disabled=locked; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |
| 140:40 TimelineCreateForm | Button frontendText(locale, "PROJECT_TIMELINE_CREATE") | onClick=() =&gt; void submit(); type="button" | disabled=locked &#124;&#124; !title.trim() &#124;&#124; !onCreate; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |

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
| 33:5 Button | button  | type=type | spread: props |

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
| 13:14 ConfirmAction | div  | onClick=onCancel | aria-hidden="true"; {"kind":"container","tag":"Dialog","attributes":{"open":"open"}}; {"kind":"logical","expression":"open","operator":"&&"} |
| 14:5 ConfirmAction | DialogContent  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |
| 18:9 ConfirmAction | Button cancelLabel | onClick=onCancel | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |
| 19:9 ConfirmAction | Button confirmLabel | onClick=onConfirm | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |

## frontend/components/ui/dialog.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 15:10 DialogContent | div  |  | earlier return: !open; spread: props |
| 17:99 DialogTitle | h2  |  | spread: props |

## frontend/components/ui/dropdown-menu.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 67:5 DropdownMenu | document.addEventListener  | "pointerdown", dismissOutside | earlier return: !open |
| 68:5 DropdownMenu | document.addEventListener  | "focusin", dismissAfterFocus | earlier return: !open |
| 88:110 DropdownMenu | div children | onKeyDown=handleKeyDown |  |
| 104:10 DropdownMenuTrigger | button  | onClick=handleClick; onKeyDown=handleKeyDown; type=type ?? "button" | aria-expanded=open; spread: props |
| 128:10 DropdownMenuContent | div  | onKeyDown=handleKeyDown | earlier return: !open; spread: props |
| 141:10 DropdownMenuItem | button  | onClick=handleClick; type="button" | aria-disabled=disabled ? "true" : undefined; disabled=disabled; spread: props |

## frontend/components/ui/focus-scope.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 40:5 useFocusScope | root.addEventListener  | "keydown", onKeyDown | earlier return: !active &#124;&#124; !root &#124;&#124; typeof document === "undefined" |

## frontend/components/ui/input.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 6:5 Input | input  | type=type | spread: props |

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
| 5:135 Select | select children |  | spread: props |
| 8:113 SelectOption | option  |  | spread: props |

## frontend/components/ui/sheet.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 15:10 SheetContent | div  |  | earlier return: !open; spread: props |
| 18:95 SheetHeader | div  |  | spread: props |
| 19:98 SheetTitle | h2  |  | spread: props |
| 22:10 SheetClose | button  | onClick=(event) =&gt; { onClick?.(event); if (!event.defaultPrevented) onOpenChange?.(false); }; type="button" | spread: props |

## frontend/components/ui/skeleton.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 4:92 Skeleton | div  |  | aria-busy="true"; spread: props |

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
| 6:5 Textarea | textarea  |  | spread: props |

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
| 41:3 createManager | owner.signal.addEventListener  | 'abort', close, {once: true} |  |
| 50:51 createManager | signal.addEventListener  | 'abort', abort, {once: true} |  |

## frontend/features/environments/environment-rename-dialog.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 44:5 EnvironmentRenameDialog | Dialog  | onOpenChange=open=&gt;{if(!open)cancel();} | open=true |
| 46:7 EnvironmentRenameDialog | form  | onSubmit=event=&gt;{event.preventDefault();void save();} | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}} |
| 47:31 EnvironmentRenameDialog | Input  | onChange=event=&gt;draft.edit('name',event.target.value) | disabled=!!discard &#124;&#124; draft.confirming &#124;&#124; operationBlocked(); {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"… |
| 48:21 EnvironmentRenameDialog | p t('ENV_INVALID_INPUT') |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"invalid"… |
| 49:37 EnvironmentRenameDialog | Button t('ENV_SAVE') | type="submit" | disabled=!!discard &#124;&#124; draft.confirming &#124;&#124; operationBlocked() &#124;&#124; !draft.fields.name.trim(); {"kind":"container","tag":"Dialog","… |
| 49:175 EnvironmentRenameDialog | Button t('ENV_CANCEL') | onClick=cancel; type="button" | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{}} |
| 52:5 EnvironmentRenameDialog | ConfirmAction  | onCancel=cancelDiscard; onConfirm=confirmDiscard | open=!!discard |

## frontend/features/environments/environments-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 17:96 EnvironmentsPage | p frontendText(locale,'ENV_FORBIDDEN') |  | {"kind":"branch","expression":"!routeAccessAllowed(session,{capability:null,requiredPermission:'workspace.vm'})","branch":"true"} |
| 51:26 EnvironmentView | section t('ENV_ACCOUNT_CLOSED') |  | {"kind":"branch","expression":"state.closed","branch":"true"} |
| 55:37 EnvironmentView | div  |  | {"kind":"logical","expression":"(state.error &#124;&#124; localError)","operator":"&&"}; earlier return: state.closed |
| 56:31 EnvironmentView | div  |  | {"kind":"logical","expression":"state.recoveryBlocked","operator":"&&"}; earlier return: state.closed |
| 58:7 EnvironmentView | Button t('ENV_RECHECK_RECOVERY') | onClick=()=&gt;void run(()=&gt;manager.recheckRecovery()) | disabled=state.writing; {"kind":"logical","expression":"state.recoveryBlocked","operator":"&&"}; earlier return: state.closed |
| 62:45 EnvironmentView | Button t('ENV_LOOKUP_RESULT') | onClick=()=&gt;void run(()=&gt;manager.lookup()) | disabled=state.writing; {"kind":"logical","expression":"state.pending","operator":"&&"}; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.wri… |
| 62:180 EnvironmentView | Button t('ENV_RETRY_WRITE') | onClick=()=&gt;void run(()=&gt;manager.retry()) | disabled=state.writing; {"kind":"logical","expression":"state.pending","operator":"&&"}; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.wri… |
| 64:25 EnvironmentView | div  |  | {"kind":"logical","expression":"state.confirmed","operator":"&&"}; earlier return: state.closed |
| 72:7 EnvironmentView | form  | onSubmit=event=&gt;{event.preventDefault();if(!alive.current &#124;&#124; operationBlocked() &#124;&#124; draft.isConfirming() &#124;&#124; editRef.current &… | earlier return: state.closed |
| 73:61 EnvironmentView | Input  | onChange=event=&gt;draft.edit('name',event.target.value) | disabled=blocked; {"kind":"container","tag":"form","attributes":{}}; earlier return: state.closed |
| 74:61 EnvironmentView | Select  | onChange=event=&gt;draft.edit('type',event.target.value) | disabled=blocked; {"kind":"container","tag":"form","attributes":{}}; earlier return: state.closed |
| 74:169 EnvironmentView | option t('ENV_PERSONAL') |  | {"kind":"container","tag":"form","attributes":{}}; {"kind":"container","tag":"Select","attributes":{"disabled":"blocked"}}; earlier return: state.closed |
| 74:222 EnvironmentView | option t('ENV_TEMPORARY') |  | {"kind":"container","tag":"form","attributes":{}}; {"kind":"container","tag":"Select","attributes":{"disabled":"blocked"}}; earlier return: state.closed |
| 75:61 EnvironmentView | Input  | onChange=event=&gt;draft.edit('taskId',event.target.value) | disabled=blocked; {"kind":"container","tag":"form","attributes":{}}; earlier return: state.closed |
| 76:9 EnvironmentView | Button t('ENV_CREATE') | type="submit" | disabled=blocked &#124;&#124; !title.trim(); {"kind":"container","tag":"form","attributes":{}}; earlier return: state.closed |
| 79:97 EnvironmentView | Select  | onChange=event=&gt;void run(()=&gt;manager.load(1,event.target.value as ''&#124;EnvironmentType)) | disabled=state.loading &#124;&#124; state.writing; earlier return: state.closed |
| 79:286 EnvironmentView | option t('ENV_ALL') |  | {"kind":"container","tag":"Select","attributes":{"disabled":"state.loading &#124;&#124; state.writing"}}; earlier return: state.closed |
| 79:326 EnvironmentView | option t('ENV_PERSONAL') |  | {"kind":"container","tag":"Select","attributes":{"disabled":"state.loading &#124;&#124; state.writing"}}; earlier return: state.closed |
| 79:379 EnvironmentView | option t('ENV_TEMPORARY') |  | {"kind":"container","tag":"Select","attributes":{"disabled":"state.loading &#124;&#124; state.writing"}}; earlier return: state.closed |
| 79:451 EnvironmentView | Button t('ENV_REFRESH') | onClick=()=&gt;void run(()=&gt;manager.load()) | disabled=state.loading &#124;&#124; state.writing; earlier return: state.closed |
| 81:585 EnvironmentView | Button t('ENV_RENAME') | onClick=()=&gt;{if(alive.current && !operationBlocked() && !draft.isConfirming() && !editRef.current && !removeRef.current){editRef.current=item;setEdit(item… | disabled=blocked; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.loading"}}; {"kind":"branch","expression":"state.loading","branch":"false"… |
| 81:841 EnvironmentView | Button t('ENV_DELETE') | onClick=()=&gt;{if(alive.current && !operationBlocked() && !draft.isConfirming() && !editRef.current && !removeRef.current){removeRef.current=item;setRemove(… | disabled=blocked; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.loading"}}; {"kind":"branch","expression":"state.loading","branch":"false"… |
| 83:89 EnvironmentView | Button t('ENV_PREVIOUS') | onClick=()=&gt;void run(()=&gt;manager.load(state.pagination.page-1)) | disabled=state.loading &#124;&#124; state.writing &#124;&#124; state.pagination.page&lt;=1; earlier return: state.closed |
| 83:402 EnvironmentView | Button t('ENV_NEXT') | onClick=()=&gt;void run(()=&gt;manager.load(state.pagination.page+1)) | disabled=state.loading &#124;&#124; state.writing &#124;&#124; state.pagination.page&gt;=state.pagination.totalPages &#124;&#124; state.pagination.page&gt;=5… |
| 84:14 EnvironmentView | EnvironmentRenameDialog  | onClose=()=&gt;{if(editRef.current===edit){editRef.current=null;setEdit(null);}} | {"kind":"logical","expression":"edit","operator":"&&"}; earlier return: state.closed |
| 85:5 EnvironmentView | Dialog  | onOpenChange=open=&gt;{if(!open)closeRemove();} | open=!!remove; earlier return: state.closed |
| 85:343 EnvironmentView | Button t('ENV_DELETE') | onClick=()=&gt;{const item=removeRef.current;if(!alive.current &#124;&#124; !item &#124;&#124; operationBlocked() &#124;&#124; draft.isConfirming())return;cl… | disabled=blocked; {"kind":"container","tag":"Dialog","attributes":{"open":"!!remove"}}; earlier return: state.closed |
| 85:625 EnvironmentView | Button t('ENV_CANCEL') | onClick=closeRemove | {"kind":"container","tag":"Dialog","attributes":{"open":"!!remove"}}; earlier return: state.closed |

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

## frontend/lib/asset-upload-transport.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 26:7 xhrUploadRequester | init.signal?.addEventListener  | "abort", abort, { once: true } | earlier return: init.signal?.aborted |

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
| 26:7 AdminDashboardPage | Button frontendText(locale, "ADMIN_METRIC_REFRESH") | onClick=onRefresh | disabled=pending |
| 36:43 AdminDashboardPage | p frontendText(locale, "ADMIN_METRIC_LOADING") |  | {"kind":"repeat","expression":"cards"}; {"kind":"container","tag":"Card","attributes":{"aria-busy":"metric.kind === \"loading\""}}; {"kind":"logical","expres… |
| 41:41 AdminDashboardPage | div  |  | {"kind":"repeat","expression":"cards"}; {"kind":"container","tag":"Card","attributes":{"aria-busy":"metric.kind === \"loading\""}}; {"kind":"logical","expres… |
| 42:15 AdminDashboardPage | Button frontendText(locale, "COMMON_RETRY") | onClick=() =&gt; onRetry(key) | {"kind":"repeat","expression":"cards"}; {"kind":"container","tag":"Card","attributes":{"aria-busy":"metric.kind === \"loading\""}}; {"kind":"logical","expres… |
| 45:43 AdminDashboardPage | a frontendText(locale, "ADMIN_METRIC_OPEN") | href=href | {"kind":"repeat","expression":"cards"}; {"kind":"container","tag":"Card","attributes":{"aria-busy":"metric.kind === \"loading\""}}; {"kind":"logical","expres… |
| 50:88 AdminDashboardPage | a frontendText(locale, labelKey) | href=href | {"kind":"logical","expression":"links.length &gt; 0","operator":"&&"}; {"kind":"repeat","expression":"links"} |

## frontend/pages/admin/admin-dashboard-route.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 73:10 DashboardMetrics | AdminDashboardPage  | onRetry=load; onRefresh=() =&gt; { if (Object.keys(requests.current).length &gt; 0) return; metricKeys.forEach(load); } |  |

## frontend/pages/admin/analytics-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 13:17 AdminAnalyticsPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRefresh; type="button" | disabled=pending |
| 18:529 AdminAnalyticsPage | select  | onChange=(event) =&gt; onDaysChange?.(Number(event.target.value)) | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" &… |
| 18:735 AdminAnalyticsPage | option frontendText(locale, "ADMIN_ANALYTICS_RANGE_CUSTOM").replace("{days}", String(days)) |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; {"kind":"logical","expression":"![7, 14, 30].includes(days)","operator":"&&"}; ear… |
| 18:852 AdminAnalyticsPage | option frontendText(locale, "ADMIN_ANALYTICS_RANGE_7") |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" &… |
| 18:928 AdminAnalyticsPage | option frontendText(locale, "ADMIN_ANALYTICS_RANGE_14") |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" &… |
| 18:1006 AdminAnalyticsPage | option frontendText(locale, "ADMIN_ANALYTICS_RANGE_30") |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" &… |
| 18:1093 AdminAnalyticsPage | Button frontendText(locale, "ADMIN_ANALYTICS_REFRESH") | onClick=onRefresh; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; earlier return: state.kind === "loading"; earlier return: state.… |
| 20:33 AdminAnalyticsPage | p frontendText(locale, "ADMIN_ANALYTICS_STALE") |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; {"kind":"logical","expression":"(pending &#124;&#124; localError)","operator":"&&"… |
| 24:158 AdminAnalyticsPage | div retry |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; {"kind":"branch","expression":"localError","branch":"true"}; earlier return: state… |
| 24:382 AdminAnalyticsPage | DataPagination  | onPageChange=(page) =&gt; onPageChange?.(page); onPageSizeChange=(pageSize) =&gt; onPageSizeChange?.(pageSize) | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" &… |
| 35:10 DailyChart | div  |  | earlier return: rows.length === 0 |

## frontend/pages/admin/asset-queue-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 34:164 AssetQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"branch","expression":"error","branch":"true"}; {"kind":"logical","expression":"onLoadRetry","operator":"&&"}; earlier return: loading |
| 36:423 AssetQueuePage | select  | onChange=(event) =&gt; onStatusChange?.(event.target.value as "" &#124; AdminAssetStatus) | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; earlier return: loading; earlier return: … |
| 36:633 AssetQueuePage | option All |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"container","tag":"select","attributes":{"disabled"… |
| 36:662 AssetQueuePage | option queued |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"container","tag":"select","attributes":{"disabled"… |
| 36:700 AssetQueuePage | option processing |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"container","tag":"select","attributes":{"disabled"… |
| 36:746 AssetQueuePage | option succeeded |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"container","tag":"select","attributes":{"disabled"… |
| 36:790 AssetQueuePage | option failed_retryable |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"container","tag":"select","attributes":{"disabled"… |
| 36:848 AssetQueuePage | option failed_terminal |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"container","tag":"select","attributes":{"disabled"… |
| 36:945 AssetQueuePage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"recordBlocked","operator":"… |
| 36:1107 AssetQueuePage | Button frontendText(locale, "ADMIN_ASSET_RETRY_RECORD_DISCARD") | onClick=onDiscardRecord; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"recordBlocked","operator":"… |
| 36:1294 AssetQueuePage | p previewError &#124;&#124; retryError &#124;&#124; localError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"(previewError &#124;&#124; … |
| 36:1435 AssetQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"(previewE… |
| 36:1616 AssetQueuePage | div frontendText(locale, "ADMIN_ASSET_READ_REQUIRED") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"readRequired && !localError… |
| 36:1728 AssetQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"readRequi… |
| 36:2498 AssetQueuePage | Button previewLoading ? frontendText(locale, "ADMIN_ASSET_PREVIEW_LOADING") : frontendText(locale, "ADMIN_ASSET_PREVIEW") | onClick=() =&gt; onPreview?.(asset.id) | disabled=pending &#124;&#124; previewLoading; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"bran… |
| 36:2845 AssetQueuePage | Button frontendText(locale, "ADMIN_ASSET_RETRY") | onClick=() =&gt; request(asset) | disabled=!onRetry &#124;&#124; pending &#124;&#124; forbidden &#124;&#124; pendingIds.includes(asset.id); {"kind":"container","tag":"section","attributes":{"… |
| 36:3281 AssetQueuePage | DataPagination  | onPageChange=(page) =&gt; onPageChange?.(page); onPageSizeChange=(size) =&gt; onPageSizeChange?.(size) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"data","operator":"&&"}; ear… |
| 36:3533 AssetQueuePage | ConfirmAction  | onCancel=cancel; onConfirm=confirm | open=valid; earlier return: loading; earlier return: error |

## frontend/pages/admin/audit-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 13:28 AuditPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry; type="button" | disabled=pending; {"kind":"logical","expression":"onRetry","operator":"&&"} |
| 17:326 AuditPage | select  | onChange=(event) =&gt; onActionChange?.(event.target.value) | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; earlier return: state.kind === "loading"; earlier return: state.… |
| 17:511 AuditPage | option All |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; {"kind":"container","tag":"select","attributes":{"disabled":"pending"}}; earlier r… |
| 17:564 AuditPage | option value |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; {"kind":"container","tag":"select","attributes":{"disabled":"pending"}}; {"kind":"… |
| 20:5 AuditPage | DataPagination  | onPageChange=(page) =&gt; onPageChange?.(page); onPageSizeChange=(size) =&gt; onPageSizeChange?.(size) | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error"; … |

## frontend/pages/admin/duplicate-queue-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 54:155 DuplicateQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"}; {"kind":"logical","expression":"onLoadRetry","operator":"&&"}; earlier return: sta… |
| 61:33 DuplicateQueuePage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"decisionRecordBlocked","ope… |
| 61:200 DuplicateQueuePage | Button frontendText(locale, "ADMIN_DUPLICATE_RECORD_DISCARD") | onClick=onDiscardDecisionRecord; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"decisionRecordBlocked","ope… |
| 62:22 DuplicateQueuePage | p localError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"localError","operator":"&&"… |
| 63:24 DuplicateQueuePage | p frontendText(locale, "ADMIN_DUPLICATE_READ_REQUIRED") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"logical","expression":"readRequired","operator":"&… |
| 64:55 DuplicateQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=pending &#124;&#124; Boolean(pendingId); {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"… |
| 78:15 DuplicateQueuePage | Button label("associate") | onClick=() =&gt; request(item, "associate") | disabled=itemPending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.… |
| 79:15 DuplicateQueuePage | Button label("keep_separate") | onClick=() =&gt; request(item, "keep_separate") | disabled=itemPending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.… |
| 80:15 DuplicateQueuePage | Button label("reject") | onClick=() =&gt; request(item, "reject") | disabled=itemPending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.… |
| 85:7 DuplicateQueuePage | DataPagination  | onPageChange=(page) =&gt; onPageChange?.(page); onPageSizeChange=(size) =&gt; onPageSizeChange?.(size) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; earlier return: state.kind === "loading"; earlier return: s… |
| 87:5 DuplicateQueuePage | ConfirmAction  | onCancel=cancel; onConfirm=confirm | open=valid; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |

## frontend/pages/admin/members-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 42:164 MembersPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"branch","expression":"error","branch":"true"}; {"kind":"logical","expression":"onLoadRetry","operator":"&&"}; earlier return: loading |
| 44:330 MembersPage | select  | onChange=(event) =&gt; onStatusFilterChange?.(event.target.value as "" &#124; "active" &#124; "disabled") | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; earlier return: loading; earl… |
| 44:552 MembersPage | option All |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"container","tag":"select","attributes"… |
| 44:581 MembersPage | option Active |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"container","tag":"select","attributes"… |
| 44:619 MembersPage | option Disabled |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"container","tag":"select","attributes"… |
| 45:29 MembersPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"statusRecordBlo… |
| 45:195 MembersPage | Button frontendText(locale, "ADMIN_MEMBER_STATUS_RECORD_DISCARD") | onClick=onDiscardStatusRecord; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"statusRecordBlo… |
| 46:52 MembersPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"(actionError &#… |
| 46:275 MembersPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression… |
| 47:1106 MembersPage | Button actionLabel | onClick=() =&gt; requestConfirmation(member) | disabled=itemPending &#124;&#124; forbidden &#124;&#124; !onStatusChange; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation … |
| 48:20 MembersPage | DataPagination  | onPageChange=(page) =&gt; onPageChange?.(page); onPageSizeChange=(size) =&gt; onPageSizeChange?.(size) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"pagination","op… |
| 50:5 MembersPage | ConfirmAction  | onCancel=cancelConfirmation; onConfirm=confirmStatusChange | open=validConfirmation; earlier return: loading; earlier return: error |

## frontend/pages/admin/menu-editor.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 53:203 MenuEditor | select  | onChange=event =&gt; formDraft.edit(name, event.target.value) | {"kind":"branch","expression":"choices","branch":"true"} |
| 53:381 MenuEditor | option choice.label |  | {"kind":"branch","expression":"choices","branch":"true"}; {"kind":"repeat","expression":"choices"} |
| 53:466 MenuEditor | input  | onChange=event =&gt; formDraft.edit(name, event.target.value); type=name === "position" ? "number" : "text" | {"kind":"branch","expression":"choices","branch":"false"} |
| 54:12 MenuEditor | form  | onSubmit=async event =&gt; { event.preventDefault(); if (!alive.current &#124;&#124; disabled &#124;&#124; submitting.current &#124;&#124; confirmationRef.cu… | aria-hidden=validConfirmation &#124;&#124; undefined |
| 79:17 MenuEditor | p text("ADMIN_MENUS_INVALID") |  | {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"invalid","operator… |
| 80:38 MenuEditor | Button text(menu ? "ADMIN_MENUS_SAVE_FULL" : "ADMIN_MENUS_CREATE_SUBMIT") | type="submit" | disabled=disabled; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}} |
| 80:157 MenuEditor | Button text("ADMIN_MENUS_CANCEL") | onClick=() =&gt; { if (pending &#124;&#124; submitting.current &#124;&#124; confirmationRef.current &#124;&#124; formDraft.isConfirming()) return; const draf… | disabled=pending; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}} |
| 81:10 MenuEditor | ConfirmAction  | onCancel=cancelConfirmation; onConfirm=confirmAction | open=validConfirmation |

## frontend/pages/admin/menus-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 15:157 AdminMenusPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"}; {"kind":"logical","expression":"onLoadRetry","operator":"&&"}; earlier return: sta… |
| 16:10 AdminMenusPage | ReadyMenus  |  | earlier return: state.kind === "loading"; earlier return: state.kind !== "ready"; spread: { locale, onLoadRetry, onUpdate, onDelete, onCreate, pendingId, err… |
| 50:40 ReadyMenus | div  |  | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 50:200 ReadyMenus | Button frontendText(locale, "ADMIN_MENUS_RECORD_DISCARD") | onClick=onDiscardRecord; type="button" | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 50:394 ReadyMenus | p error &#124;&#124; frontendText(locale, "ADMIN_MENUS_READ_REQUIRED") |  | {"kind":"logical","expression":"(error &#124;&#124; readRequired)","operator":"&&"} |
| 50:527 ReadyMenus | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=readPending; {"kind":"logical","expression":"(error &#124;&#124; readRequired)","operator":"&&"}; {"kind":"logical","expression":"onLoadRetry","oper… |
| 54:18 ReadyMenus | Button frontendText(locale, "ADMIN_MENUS_CREATE") | onClick=() =&gt; setEditor({}); type="button" | disabled=busy &#124;&#124; Boolean(editor) &#124;&#124; countMenus(menus) &gt;= 200; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validCo… |
| 56:16 ReadyMenus | MenuEditor  | onCancel=() =&gt; setEditor(null); onSave=async input =&gt; { const saved = editor.menu ? await onUpdate?.(editor.menu, { ...input, expected: menuSnapshot(ed… | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"editor","operat… |
| 60:176 ReadyMenus | MenuNode  | onUpdate=onUpdate ? (menu, input) =&gt; requestConfirmation(menu, input) : undefined; onDelete=onDelete ? menu =&gt; requestConfirmation(menu) : undefined; o… | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"branch","expression":"menus.length","b… |
| 61:13 ReadyMenus | ConfirmAction  | onCancel=cancelConfirmation; onConfirm=confirmAction | open=validConfirmation |
| 85:699 MenuNode | Button frontendText(locale, "ADMIN_MENUS_EDIT") | onClick=() =&gt; { if (!busy && !rowDraft.isConfirming()) onEdit(menu); }; type="button" | disabled=busy; {"kind":"logical","expression":"onEdit && !menu.isSystem","operator":"&&"} |
| 85:1020 MenuNode | input  | onChange=(event) =&gt; rowDraft.edit("position", event.target.value); type="number" | disabled=menu.isSystem &#124;&#124; busy |
| 85:1259 MenuNode | Button frontendText(locale, "ADMIN_MENUS_SAVE") | onClick=() =&gt; { const value = rowDraft.current.current.position; const position = Number(value); if (value.trim() && Number.isSafeInteger(position) && pos… | disabled=menu.isSystem &#124;&#124; busy &#124;&#124; position === menu.position &#124;&#124; !rowDraft.fields.position.trim() &#124;&#124; !Number.isSafeInt… |
| 85:1773 MenuNode | Button menu.status === "active" ? frontendText(locale, "ADMIN_MENUS_DISABLE") : frontendText(locale, "ADMIN_MENUS_ENABLE") | onClick=() =&gt; update({ status: menu.status === "active" ? "disabled" : "active", expected: menuSnapshot(menu) }); type="button" | disabled=menu.isSystem &#124;&#124; busy |
| 85:2095 MenuNode | Button frontendText(locale, menu.visible ? "ADMIN_MENUS_HIDE" : "ADMIN_MENUS_SHOW") | onClick=() =&gt; update({ visible: !menu.visible, expected: menuSnapshot(menu) }); type="button" | disabled=menu.isSystem &#124;&#124; busy |
| 85:2393 MenuNode | Button frontendText(locale, "ADMIN_MENUS_DELETE") | onClick=() =&gt; { if (!busy && !rowDraft.isConfirming()) onDelete?.(menu); }; type="button" | disabled=busy; {"kind":"logical","expression":"!menu.isSystem && menu.children.length === 0","operator":"&&"} |
| 85:2624 MenuNode | MenuNode  | onUpdate=onUpdate; onDelete=onDelete; onEdit=onEdit | {"kind":"repeat","expression":"menu.children"} |

## frontend/pages/admin/review-detail-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 25:92 ReviewDetailPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"}; {"kind":"logical","expression":"(state.kind !== \"not-found\" &#124;&#124; unresol… |
| 26:9 ReviewDetailPage | a frontendText(locale, "ADMIN_REVIEW_BACK") | onClick=(event) =&gt; { if (!onBack &#124;&#124; event.defaultPrevented &#124;&#124; event.button !== 0 &#124;&#124; event.metaKey &#124;&#124; event.ctrlKey… | {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"}; earlier return: state.kind === "loading" |
| 46:31 ReviewDetailPage | div  |  | {"kind":"logical","expression":"decisionRecordBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 46:201 ReviewDetailPage | Button frontendText(locale, "ADMIN_REVIEW_DECISION_RECORD_DISCARD") | onClick=onDiscardDecisionRecord; type="button" | {"kind":"logical","expression":"decisionRecordBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 47:30 ReviewDetailPage | p decisionRecordNotice |  | {"kind":"logical","expression":"decisionRecordNotice","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 48:5 ReviewDetailPage | ReviewDecisionFeedback  | onRetry=onRetryDecision; onReload=onRetry | earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 50:7 ReviewDetailPage | ReviewDecisionControls  | onDecision=onDecision | disabled=reviewDecisionLocked(decisionState); earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |

## frontend/pages/admin/review-detail-route.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 43:5 ReviewDetailSession | window.addEventListener  | "beforeunload", warn |  |
| 156:10 ReviewDetailSession | ReviewDetailPage  | onBack=() =&gt; writeWorkspaceHistory("push", "/admin/submissions"); onRetry=() =&gt; { void read(); }; onRetryDecision=() =&gt; { if (decisionState.kind ===… |  |

## frontend/pages/admin/review-queue-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 23:17 ReviewQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry; type="button" | disabled=pending |
| 31:31 ReviewQueuePage | div  |  | {"kind":"logical","expression":"decisionRecordBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 31:201 ReviewQueuePage | Button frontendText(locale, "ADMIN_REVIEW_DECISION_RECORD_DISCARD") | onClick=onDiscardDecisionRecord; type="button" | {"kind":"logical","expression":"decisionRecordBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 32:5 ReviewQueuePage | ReviewDecisionFeedback  | onRetry=onRetryDecision; onReload=onReloadDecision | earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 33:22 ReviewQueuePage | p localError |  | {"kind":"logical","expression":"localError","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready" |
| 39:11 ReviewQueuePage | a item.title?.trim() &#124;&#124; frontendText(locale, "ADMIN_REVIEW_UNTITLED") | onClick=(event) =&gt; { if (!onOpenDetail &#124;&#124; event.defaultPrevented &#124;&#124; event.button !== 0 &#124;&#124; event.metaKey &#124;&#124; event.c… | {"kind":"branch","expression":"state.data.items.length","branch":"true"}; {"kind":"repeat","expression":"state.data.items"}; earlier return: state.kind === "… |
| 46:9 ReviewQueuePage | ReviewDecisionControls  | onDecision=onReview ? (action, details) =&gt; onReview(item.id, action, details) : undefined | disabled=disabled; {"kind":"branch","expression":"state.data.items.length","branch":"true"}; {"kind":"repeat","expression":"state.data.items"}; earlier retur… |
| 51:5 ReviewQueuePage | DataPagination  | onPageChange=(page) =&gt; onPageChange?.(page); onPageSizeChange=(size) =&gt; onPageSizeChange?.(size) | earlier return: state.kind === "loading"; earlier return: state.kind !== "ready"; spread: state.data.pagination |

## frontend/pages/admin/roles-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 27:157 AdminRolesPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"}; {"kind":"logical","expression":"onLoadRetry","operator":"&&"}; earlier return: sta… |
| 29:12 AdminRolesPage | RoleEditor  | onSelect=onSelect; onSave=onSave; onCreate=onCreate; onAssignMember=onAssignMember; onUnassignMember=onUnassignMember | earlier return: state.kind === "loading"; earlier return: state.kind !== "ready"; earlier return: !state.roles.length |
| 29:270 AdminRolesPage | div  |  | {"kind":"logical","expression":"recordBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready"; earlier re… |
| 29:425 AdminRolesPage | Button frontendText(locale, "ADMIN_ROLES_RECORD_DISCARD") | onClick=onDiscardRecord; type="button" | {"kind":"logical","expression":"recordBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind !== "ready"; earlier re… |
| 29:618 AdminRolesPage | p frontendText(locale, "ADMIN_ROLES_READ_REQUIRED") |  | {"kind":"logical","expression":"(readRequired &#124;&#124; saveError)","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind… |
| 29:690 AdminRolesPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=readPending; {"kind":"logical","expression":"(readRequired &#124;&#124; saveError)","operator":"&&"}; earlier return: state.kind === "loading"; earl… |
| 143:183 RoleEditor | button  | onClick=() =&gt; selectRole(role.id); type="button" | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"repeat","expression":… |
| 143:874 RoleEditor | Input  | onChange=(event) =&gt; setNewKey(event.target.value) | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}} |
| 143:1103 RoleEditor | Input  | onChange=(event) =&gt; setNewName(event.target.value) | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}} |
| 143:1336 RoleEditor | Input  | onChange=(event) =&gt; setNewMask(event.target.value) | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}} |
| 143:1520 RoleEditor | Button frontendText(locale, "ADMIN_ROLES_CREATE") | onClick=() =&gt; { void createRole(); }; type="button" | disabled=locked &#124;&#124; !newKey &#124;&#124; !newName; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; u… |
| 144:1099 RoleEditor | Checkbox  | onChange=() =&gt; toggle(key) | disabled=(selected.isSystem && !canGrantWorkbench(key)) &#124;&#124; locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmati… |
| 144:1602 RoleEditor | p frontendText(locale, "ADMIN_ROLES_DIRTY_MEMBERSHIP") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"dirtyPermission… |
| 144:1846 RoleEditor | p frontendText(locale, "ADMIN_ROLES_DIRTY_MEMBERSHIP") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"dirtyPermission… |
| 144:2206 RoleEditor | Button frontendText(locale, "ADMIN_ROLES_UNASSIGN_MEMBER") | onClick=() =&gt; requestConfirmation({ kind: "unassign", memberId: id }); type="button" | disabled=locked &#124;&#124; dirtyPermissions &#124;&#124; !onUnassignMember; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmat… |
| 144:2675 RoleEditor | Input  | onChange=(event) =&gt; setMemberId(event.target.value) | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression"… |
| 144:2911 RoleEditor | Button frontendText(locale, "ADMIN_ROLES_ASSIGN_MEMBER") | onClick=() =&gt; requestConfirmation({ kind: "assign", memberId: memberId.trim() }); type="button" | disabled=locked &#124;&#124; dirtyPermissions &#124;&#124; !onAssignMember &#124;&#124; !memberId.trim() &#124;&#124; assignedMemberIds.includes(memberId.tri… |
| 144:3232 RoleEditor | p saveError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"saveError","ope… |
| 144:3301 RoleEditor | Button saving ? frontendText(locale, "ADMIN_ROLES_SAVING") : frontendText(locale, "ADMIN_ROLES_SAVE") | onClick=() =&gt; requestConfirmation({ kind: "save" }); type="button" | disabled=(selected.isSystem && !systemWorkbenchGrant) &#124;&#124; locked &#124;&#124; !onSave; {"kind":"container","tag":"section","attributes":{"aria-hidde… |
| 146:13 RoleEditor | ConfirmAction  | onCancel=cancelConfirmation; onConfirm=() =&gt; { void confirmAction(); } | open=validConfirmation |

## frontend/pages/admin/spaces-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 27:93 SpacesPage | Button frontendText(props.locale, "COMMON_RETRY") | onClick=props.onLoadRetry; type="button" | {"kind":"branch","expression":"props.error","branch":"true"}; {"kind":"logical","expression":"props.onLoadRetry","operator":"&&"}; earlier return: props.loading |
| 28:10 SpacesPage | SpacesEditor  |  | earlier return: props.loading; earlier return: props.error; spread: props |
| 79:363 SpacesEditor | Button createOpen ? frontendText(locale, "ADMIN_SPACE_CANCEL") : frontendText(locale, "ADMIN_CREATE_SPACE") | onClick=toggleCreate | disabled=locked &#124;&#124; Boolean(target); {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}} |
| 79:566 SpacesEditor | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"recordBlocked","oper… |
| 79:722 SpacesEditor | Button frontendText(locale, "ADMIN_SPACE_RECORD_DISCARD") | onClick=onDiscardRecord; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"recordBlocked","oper… |
| 79:873 SpacesEditor | p recordNotice |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"recordNotice","opera… |
| 79:959 SpacesEditor | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"needsRead","operator… |
| 79:1035 SpacesEditor | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"ne… |
| 79:1302 SpacesEditor | form  | onSubmit=submit | aria-busy=createState === "pending" ? "true" : undefined; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefine… |
| 79:1512 SpacesEditor | Input  | onChange=(event) =&gt; { const value = event.currentTarget.value; createDraft.edit("name", value); } | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"cre… |
| 79:1800 SpacesEditor | Input  | onChange=(event) =&gt; { const value = event.currentTarget.value; createDraft.edit("slug", value); } | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"cre… |
| 79:2098 SpacesEditor | Button createState === "pending" ? frontendText(locale, "ADMIN_SPACE_CREATING") : frontendText(locale, "ADMIN_SPACE_CREATE") | type="submit" | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"cre… |
| 79:2294 SpacesEditor | p frontendText(locale, "ADMIN_SPACE_CREATE_ERROR") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"createOpen","operato… |
| 79:2460 SpacesEditor | RecordEditor  | onCancel=() =&gt; setTarget(null); onSave=async command =&gt; { const saved = await onManage(command); if (saved) setTarget(null); return saved; } | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"target && onManage",… |
| 79:3121 SpacesEditor | Button frontendText(locale, "ADMIN_SPACE_EDIT") / : / space.name | onClick=() =&gt; setTarget({ kind: "space", space }); type="button" | disabled=locked &#124;&#124; createOpen &#124;&#124; Boolean(target) &#124;&#124; space.readOnly &#124;&#124; space.kind === "legacy"; {"kind":"container","t… |
| 79:3374 SpacesEditor | Button frontendText(locale, "ADMIN_COLLECTION_CREATE") / : / space.name | onClick=() =&gt; setTarget({ kind: "create-collection", space }); type="button" | disabled=locked &#124;&#124; createOpen &#124;&#124; Boolean(target) &#124;&#124; space.readOnly &#124;&#124; space.kind === "legacy"; {"kind":"container","t… |
| 79:4152 SpacesEditor | Button frontendText(locale, "ADMIN_COLLECTION_EDIT") / : / collection.name | onClick=() =&gt; setTarget({ kind: "collection", space, collection }); type="button" | disabled=locked &#124;&#124; createOpen &#124;&#124; Boolean(target) &#124;&#124; space.readOnly &#124;&#124; space.kind === "legacy"; {"kind":"container","t… |
| 79:4471 SpacesEditor | Button frontendText(locale, "ADMIN_LOAD_MORE") / : / space.name | onClick=() =&gt; onLoadCollections?.(space.id); type="button" | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"branch","expression":"spac… |
| 79:4828 SpacesEditor | Button frontendText(locale, "ADMIN_LOAD_MORE") | onClick=onLoadMore; type="button" | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"nex… |
| 79:4968 SpacesEditor | ConfirmAction  | onCancel=cancelDiscard; onConfirm=confirmDiscard | open=validDiscard |
| 149:5 RecordEditor | form  | onSubmit=submit | aria-hidden=validConfirmation &#124;&#124; undefined; aria-busy=pending &#124;&#124; undefined |
| 150:97 RecordEditor | Input  | onChange=event =&gt; set("name", event.currentTarget.value) | disabled=busy; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined","aria-busy":"pending &#124;&#124; unde… |
| 151:125 RecordEditor | Input  | onChange=event =&gt; set("slug", event.currentTarget.value) | disabled=busy; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined","aria-busy":"pending &#124;&#124; unde… |
| 152:138 RecordEditor | Input  | onChange=event =&gt; set("description", event.currentTarget.value) | disabled=busy; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined","aria-busy":"pending &#124;&#124; unde… |
| 153:106 RecordEditor | Input  | onChange=event =&gt; set("position", event.currentTarget.value); type="number" | disabled=busy; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined","aria-busy":"pending &#124;&#124; unde… |
| 154:102 RecordEditor | select  | onChange=event =&gt; set("status", event.currentTarget.value) | disabled=busy; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined","aria-busy":"pending &#124;&#124; unde… |
| 154:294 RecordEditor | option frontendText(locale, "ADMIN_MENUS_ACTIVE") |  | {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined","aria-busy":"pending &#124;&#124; undefined"}}; {"kin… |
| 154:370 RecordEditor | option frontendText(locale, "ADMIN_MENUS_DISABLED") |  | {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined","aria-busy":"pending &#124;&#124; undefined"}}; {"kin… |
| 155:160 RecordEditor | select  | onChange=event =&gt; set("parentId", event.currentTarget.value) | disabled=busy; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined","aria-busy":"pending &#124;&#124; unde… |
| 155:356 RecordEditor | option frontendText(locale, "ADMIN_COLLECTION_ROOT") |  | {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined","aria-busy":"pending &#124;&#124; undefined"}}; {"kin… |
| 155:504 RecordEditor | option frontendText(locale, "ADMIN_COLLECTION_CURRENT_PARENT") / : / draft.parentId |  | {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined","aria-busy":"pending &#124;&#124; undefined"}}; {"kin… |
| 155:644 RecordEditor | option item.name |  | {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined","aria-busy":"pending &#124;&#124; undefined"}}; {"kin… |
| 156:72 RecordEditor | Button frontendText(locale, "ADMIN_RECORD_SAVE") | type="submit" | disabled=busy; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined","aria-busy":"pending &#124;&#124; unde… |
| 156:162 RecordEditor | Button frontendText(locale, "ADMIN_SPACE_CANCEL") | onClick=() =&gt; { if (!alive.current &#124;&#124; busy &#124;&#124; writing.current &#124;&#124; confirmationRef.current &#124;&#124; recordDraft.isConfirmi… | disabled=busy; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined","aria-busy":"pending &#124;&#124; unde… |
| 156:586 RecordEditor | p frontendText(locale, "ADMIN_RECORD_SAVE_ERROR") |  | {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined","aria-busy":"pending &#124;&#124; undefined"}}; {"kin… |
| 158:24 RecordEditor | ConfirmAction  | onCancel=cancelConfirmation; onConfirm=confirm | open=validConfirmation |

## frontend/pages/agent-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 20:5 AgentPage | form  | onSubmit=(event) =&gt; { event.preventDefault(); onSubmit?.(); } |  |
| 22:56 AgentPage | Input  | onChange=(event) =&gt; onQuestionChange?.(event.currentTarget.value) | disabled=state.kind === "loading" &#124;&#124; feedbackBlocked; {"kind":"container","tag":"form","attributes":{}} |
| 22:325 AgentPage | Button frontendText(locale, "AGENT_SUBMIT") | type="submit" | disabled=!onSubmit &#124;&#124; state.kind === "loading" &#124;&#124; feedbackBlocked; {"kind":"container","tag":"form","attributes":{}} |
| 24:37 AgentPage | AgentSourceControls  | onStartScope=onStartScope | disabled=state.kind === "loading" &#124;&#124; feedbackBlocked; {"kind":"logical","expression":"onStartScope && sourceDraft","operator":"&&"} |
| 25:114 AgentPage | Button frontendText(locale, "AGENT_STOP") | onClick=onCancel | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"true"} |
| 25:528 AgentPage | Button frontendText(locale, "AGENT_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"cancelled\"","branch":"false"};… |
| 47:5 AgentSourceControls | select  | onChange=(event) =&gt; { draft.edit("kind", event.currentTarget.value as AgentScope["kind"]); draft.edit("ids", ""); setInvalid(false); } | {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}} |
| 48:7 AgentSourceControls | option frontendText(locale, "AGENT_SCOPE_ALL") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}} |
| 48:77 AgentSourceControls | option frontendText(locale, "AGENT_SCOPE_SPACE") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}} |
| 48:151 AgentSourceControls | option frontendText(locale, "AGENT_SCOPE_COLLECTION") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}} |
| 48:235 AgentSourceControls | option frontendText(locale, "AGENT_SCOPE_ITEMS") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}} |
| 50:108 AgentSourceControls | Input  | onChange=(event) =&gt; draft.edit("ids", event.currentTarget.value) | {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}}; {"kind":"logical","expression":"kind !== \"… |
| 52:17 AgentSourceControls | p frontendText(locale, "AGENT_SCOPE_INVALID") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}}; {"kind":"logical","expression":"invalid","o… |
| 53:5 AgentSourceControls | Button frontendText(locale, "AGENT_SCOPE_APPLY") | onClick=apply; type="button" | disabled=disabled; {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}} |

## frontend/pages/boards/boards-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 38:29 BoardsPage | Button frontendText(locale, "BOARDS_MOVE_RECORD_DISCARD") | onClick=onDiscardRecord | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 43:9 BoardsPage | Button frontendText(locale, "BOARDS_MOVE_CHECK") | onClick=onCheckMove | disabled=recovering; {"kind":"logical","expression":"unknownMove","operator":"&&"} |
| 44:9 BoardsPage | Button frontendText(locale, "BOARDS_MOVE_RETRY") | onClick=onRetryMove | disabled=recovering; {"kind":"logical","expression":"unknownMove","operator":"&&"} |
| 48:22 BoardsPage | p actionNotice |  | {"kind":"logical","expression":"actionNotice","operator":"&&"} |
| 50:39 BoardsPage | BoardColumn  | onRetry=onRetry; onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onStatusChange=onStatusChange | {"kind":"repeat","expression":"BOARD_STATUSES"} |
| 70:108 BoardColumn | Button frontendText(locale, "BOARDS_RETRY") | onClick=() =&gt; onRetry(status) | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"} |
| 71:32 BoardColumn | ReadyColumn  | onRetry=onRetry; onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onStatusChange=onStatusChange | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"} |
| 88:124 ReadyColumn | Button frontendText(locale, "BOARDS_RETRY") | onClick=() =&gt; onRetry(status) | {"kind":"logical","expression":"state.loadError","operator":"&&"} |
| 90:130 ReadyColumn | TaskCard  | onStatusChange=onStatusChange | disabled=movesLocked &#124;&#124; state.pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.pending &#124;&#124; undefined"}}; {"kind":… |
| 92:5 ReadyColumn | DataPagination  | onPageChange=(page) =&gt; onPageChange(status, page); onPageSizeChange=(pageSize) =&gt; onPageSizeChange(status, pageSize) | spread: state.pagination |
| 108:10 TaskCard | Card  | onKeyDown=(event) =&gt; { if (disabled &#124;&#124; event.target !== event.currentTarget) return; if (event.key !== "ArrowLeft" && event.key !== "ArrowRight"… |  |
| 117:7 TaskCard | Select  | onChange=(event) =&gt; onStatusChange(task, event.currentTarget.value as BoardTargetStatus) | disabled=disabled |

## frontend/pages/calendar-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 23:84 CalendarPage | Button frontendText(locale, "CALENDAR_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"} |
| 26:32 CalendarPage | CalendarRangeFilter  | onChange=next =&gt; { if (!controlsPending && !confirmation.isOpen()) onRangeChange(next); } | {"kind":"logical","expression":"range && onRangeChange","operator":"&&"}; earlier return: state.kind === "error" |
| 27:183 CalendarPage | CalendarCreateForm  | onCreate=onCreate; onCreateReadback=onCreateReadback; onCreateDenied=onCreateDenied; onCreateLock=onCreateLock | earlier return: state.kind === "error" |
| 28:21 CalendarPage | div actionError |  | {"kind":"logical","expression":"actionError","operator":"&&"}; earlier return: state.kind === "error" |
| 30:693 CalendarPage | Button  | onClick=() =&gt; confirmation.request(event); type="button" | disabled=controlsPending; {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.items.length","b… |
| 31:62 CalendarPage | DataPagination  | onPageChange=page =&gt; { if (!controlsPending && !confirmation.isOpen()) onPageChange(page); }; onPageSizeChange=size =&gt; { if (!controlsPending && !confi… | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"logical","expression":"state.pagination && onPageChange && onPageSizeC… |

## frontend/pages/focus-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 40:84 FocusPage | Button frontendText(locale, "FOCUS_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 42:863 FocusPage | Button frontendText(locale, "FOCUS_PAUSE") | onClick=() =&gt; transition("pause") | disabled=controlsPending; {"kind":"branch","expression":"session","branch":"true"}; {"kind":"logical","expression":"session.status === \"active\"","operator"… |
| 42:1032 FocusPage | Button frontendText(locale, "FOCUS_RESUME") | onClick=() =&gt; transition("resume") | disabled=controlsPending; {"kind":"branch","expression":"session","branch":"true"}; {"kind":"logical","expression":"session.status === \"paused\"","operator"… |
| 42:1237 FocusPage | Button frontendText(locale, "FOCUS_COMPLETE") | onClick=() =&gt; confirmation.request("complete") | disabled=controlsPending; {"kind":"branch","expression":"session","branch":"true"}; {"kind":"logical","expression":"(session.status === \"active\" &#124;&#12… |
| 42:1390 FocusPage | Button frontendText(locale, "FOCUS_ABANDON") | onClick=() =&gt; confirmation.request("abandon") | disabled=controlsPending; {"kind":"branch","expression":"session","branch":"true"}; {"kind":"logical","expression":"(session.status === \"active\" &#124;&#12… |
| 42:1717 FocusPage | Button frontendText(locale, "FOCUS_CHOOSE_TASK") | onClick=() =&gt; {if (!editable()) return; draft.edit("taskId", ""); draft.edit("taskTitle", ""); setPicking(true);} | disabled=controlsPending; {"kind":"branch","expression":"session","branch":"false"}; earlier return: state.kind === "loading"; earlier return: state.kind ===… |
| 42:2065 FocusPage | FocusTaskPicker  | onSelect=task =&gt; {if (!editable()) return; draft.edit("taskId", task.id); draft.edit("taskTitle", task.title); setPicking(false);}; onDenied=() =&gt; {dra… | {"kind":"branch","expression":"session","branch":"false"}; {"kind":"logical","expression":"picking","operator":"&&"}; earlier return: state.kind === "loading… |
| 42:2333 FocusPage | Input  | onChange=(event) =&gt; draft.edit("title", event.currentTarget.value) | disabled=controlsPending; {"kind":"branch","expression":"session","branch":"false"}; earlier return: state.kind === "loading"; earlier return: state.kind ===… |
| 42:2569 FocusPage | Button frontendText(locale, "FOCUS_START_ACTION") | onClick=() =&gt; { if (!editable() &#124;&#124; picking &#124;&#124; !draft.current.current.taskId &#124;&#124; !onStart) return; const input = draft.current… | disabled=controlsPending &#124;&#124; !taskId &#124;&#124; picking; {"kind":"branch","expression":"session","branch":"false"}; earlier return: state.kind ===… |
| 42:3027 FocusPage | p actionNotice |  | {"kind":"logical","expression":"actionNotice","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 42:3099 FocusPage | div actionError |  | {"kind":"logical","expression":"actionError","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |

## frontend/pages/goals-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 27:84 GoalsPage | Button frontendText(locale, "GOALS_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 30:180 GoalsPage | PlanningCreateForm  | onCreate=onCreate; onCreateReadback=onCreateReadback; onCreateDenied=onCreateDenied; onCreateLock=onCreateLock | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#124;&#124; undefined"}}; earlier return: state.kind === "loading";… |
| 31:21 GoalsPage | div actionError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#124;&#124; undefined"}}; {"kind":"logical","expression":"actionErr… |
| 32:812 GoalsPage | input  | onChange=(event) =&gt; !statusConfirmation.isOpen() && onProgressChange?.(goal, Number(event.currentTarget.value)); type="range" | disabled=statusConfirmation.open &#124;&#124; createLocked &#124;&#124; pending &#124;&#124; goal.status === "archived"; {"kind":"container","tag":"section",… |
| 32:1256 GoalsPage | Button frontendText(locale, "GOALS_TASK_LINKS") | onClick=event =&gt; onManageTasks(goal, event.currentTarget); type="button" | disabled=statusConfirmation.open &#124;&#124; createLocked &#124;&#124; pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfi… |
| 32:1578 GoalsPage | Button frontendText(locale, "GOALS_COMPLETE") | onClick=() =&gt; statusConfirmation.request(goal, "completed"); type="button" | disabled=statusConfirmation.unavailable &#124;&#124; statusConfirmation.open &#124;&#124; createLocked &#124;&#124; pending; {"kind":"container","tag":"secti… |
| 32:1891 GoalsPage | Button frontendText(locale, "GOALS_ARCHIVE") | onClick=() =&gt; statusConfirmation.request(goal, "archived"); type="button" | disabled=statusConfirmation.unavailable &#124;&#124; statusConfirmation.open &#124;&#124; createLocked &#124;&#124; pending; {"kind":"container","tag":"secti… |
| 32:2216 GoalsPage | Button frontendText(locale, "GOALS_RESTORE") | onClick=() =&gt; statusConfirmation.request(goal, "active"); type="button" | disabled=statusConfirmation.unavailable &#124;&#124; statusConfirmation.open &#124;&#124; createLocked &#124;&#124; pending; {"kind":"container","tag":"secti… |
| 33:26 GoalsPage | DataPagination  | onPageChange=page =&gt; onPageChange?.(page); onPageSizeChange=size =&gt; onPageSizeChange?.(size) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#124;&#124; undefined"}}; {"kind":"logical","expression":"state.pag… |
| 34:63 GoalsPage | Button frontendText(locale, "GOALS_LOAD_MORE") | onClick=onLoadMore; type="button" | disabled=statusConfirmation.open &#124;&#124; createLocked &#124;&#124; pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfi… |

## frontend/pages/graph-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 78:5 GraphPage | window.addEventListener  | "beforeunload", warn |  |
| 100:106 GraphPage | Button frontendText(locale, "GRAPH_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 101:118 GraphPage | Button frontendText(locale, "GRAPH_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"forbidden\"","branch":"true"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 158:11 GraphPage | Input  | onChange=(event) =&gt; onQueryChange?.(event.currentTarget.value) | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 159:11 GraphPage | select  | onChange=(event) =&gt; onLensChange?.(event.currentTarget.value as GraphLens) | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 160:13 GraphPage | option frontendText(locale, "GRAPH_LENS_WORKSPACE") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 161:13 GraphPage | option frontendText(locale, "GRAPH_LENS_KNOWLEDGE") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 162:13 GraphPage | option frontendText(locale, "GRAPH_LENS_WORK") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 164:11 GraphPage | select  | onChange=(event) =&gt; onTemporalRangeChange?.(event.currentTarget.value as GraphTemporalRange) | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 165:13 GraphPage | option frontendText(locale, "GRAPH_TIME_RANGE_ALL") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 166:13 GraphPage | option frontendText(locale, "GRAPH_TIME_RANGE_7D") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 167:13 GraphPage | option frontendText(locale, "GRAPH_TIME_RANGE_30D") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 168:13 GraphPage | option frontendText(locale, "GRAPH_TIME_RANGE_90D") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 170:11 GraphPage | select  | onChange=(event) =&gt; onChangeKindChange?.(event.currentTarget.value as NonNullable&lt;GraphPageProps["changeKind"]&gt;) | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 171:13 GraphPage | option frontendText(locale, "GRAPH_CHANGE_KIND_ALL") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 172:13 GraphPage | option frontendText(locale, "GRAPH_CHANGE_KIND_ADDED") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 173:13 GraphPage | option frontendText(locale, "GRAPH_CHANGE_KIND_UPDATED") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 174:13 GraphPage | option frontendText(locale, "GRAPH_CHANGE_KIND_COMPLETED") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 175:13 GraphPage | option frontendText(locale, "GRAPH_CHANGE_KIND_ARCHIVED") |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 179:25 GraphPage | div  |  | {"kind":"logical","expression":"recordBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier re… |
| 181:9 GraphPage | Button frontendText(locale, "GRAPH_ACTION_RECORD_DISCARD") | onClick=() =&gt; { if (memberId && discardBlockedGraphAction(memberId)) setRecordBlocked(false); } | {"kind":"logical","expression":"recordBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier re… |
| 183:44 GraphPage | div  |  | {"kind":"logical","expression":"action?.status === \"unconfirmed\"","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind ==… |
| 185:9 GraphPage | Button frontendText(locale, "GRAPH_ACTION_RETRY") | onClick=() =&gt; runGraphAction(action) | {"kind":"logical","expression":"action?.status === \"unconfirmed\"","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind ==… |
| 187:51 GraphPage | p frontendText(locale, outcome.status === "rejected" ? "GRAPH_ACTION_REJECTED" : outcome.status === "not_recorded" ? "GRAPH_ACTION_NOT_RECORDED" : "GRAPH_ACTIO… |  | {"kind":"logical","expression":"outcome && outcome.status !== \"success\"","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.… |
| 188:7 GraphPage | GraphSuggestionsPanel  | onGenerate=onGenerateSuggestions | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 189:38 GraphPage | div frontendText(locale, "GRAPH_TRUNCATED") |  | {"kind":"logical","expression":"state.kind === \"truncated\"","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "err… |
| 191:9 GraphPage | GraphCanvas  | onSelect=setSelectedId; onClearSelection=() =&gt; setSelectedId(null) | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 193:11 GraphPage | GraphInspector  | onClose=() =&gt; setSelectedId(null); onAction=selectedNode && (!action &#124;&#124; action.node.id === selectedNode.id) ? () =&gt; runGraphAction(action ?? … | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: state.kind === "forbidden"; earlier return: state.kind === … |
| 242:10 GraphRoute | GraphPage  | onDenied=() =&gt; setState({ kind: "forbidden" }); onGenerateSuggestions=generateSuggestions; onQueryChange=setQuery; onLensChange=setLens; onTemporalRangeCh… |  |
| 248:269 GraphSuggestionsPanel | Button frontendText(locale, state.kind === "loading" ? "GRAPH_SUGGESTIONS_LOADING" : "GRAPH_SUGGESTIONS_GENERATE") | onClick=onGenerate | disabled=state.kind === "loading" |
| 250:34 GraphSuggestionsPanel | p frontendText(locale, "GRAPH_SUGGESTIONS_ERROR") |  | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"} |

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
| 26:84 InboxPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 29:203 InboxPage | InboxCreateForm  | onCreate=onCreate; onCreateReadback=onCreateReadback; onCreateDenied=onCreateDenied; onCreateLock=onCreateLock | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 30:21 InboxPage | div actionError |  | {"kind":"logical","expression":"actionError","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 31:114 InboxPage | select  | onChange=event =&gt; { if (!controlsPending && !confirmation.isOpen()) onFilterChange((event.currentTarget.value &#124;&#124; undefined) as InboxStatus &#124… | disabled=controlsPending; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 31:438 InboxPage | option frontendText(locale, "INBOX_STATUS_ALL") |  | {"kind":"container","tag":"select","attributes":{"disabled":"controlsPending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "er… |
| 31:506 InboxPage | option frontendText(locale, "INBOX_STATUS_INBOX") |  | {"kind":"container","tag":"select","attributes":{"disabled":"controlsPending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "er… |
| 31:581 InboxPage | option frontendText(locale, "INBOX_STATUS_ARCHIVED") |  | {"kind":"container","tag":"select","attributes":{"disabled":"controlsPending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "er… |
| 31:662 InboxPage | option frontendText(locale, "INBOX_STATUS_PROMOTED") |  | {"kind":"container","tag":"select","attributes":{"disabled":"controlsPending"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "er… |
| 32:848 InboxPage | a item.sourceUrl | href=item.sourceUrl | {"kind":"branch","expression":"state.items.length","branch":"true"}; {"kind":"repeat","expression":"state.items"}; {"kind":"logical","expression":"item.sourc… |
| 32:1250 InboxPage | Button frontendText(locale, "INBOX_OPEN_TASK") | onClick=() =&gt; { if (!controlsPending && !confirmation.isOpen()) onOpenTask?.(item); }; type="button" | disabled=controlsPending; {"kind":"branch","expression":"state.items.length","branch":"true"}; {"kind":"repeat","expression":"state.items"}; {"kind":"logical… |
| 32:1535 InboxPage | Button item.status === "archived" ? frontendText(locale, "INBOX_RESTORE") : frontendText(locale, "INBOX_ARCHIVE") | onClick=() =&gt; confirmation.request(item, "status"); type="button" | disabled=controlsPending; {"kind":"branch","expression":"state.items.length","branch":"true"}; {"kind":"repeat","expression":"state.items"}; {"kind":"logical… |
| 32:1820 InboxPage | Button frontendText(locale, "INBOX_PROMOTE_TASK") | onClick=() =&gt; confirmation.request(item, "task"); type="button" | disabled=controlsPending; {"kind":"branch","expression":"state.items.length","branch":"true"}; {"kind":"repeat","expression":"state.items"}; {"kind":"logical… |
| 33:5 InboxPage | DataPagination  | onPageChange=page =&gt; { if (!controlsPending && !confirmation.isOpen()) onPageChange(page); }; onPageSizeChange=size =&gt; { if (!controlsPending && !confi… | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; spread: state.pagination |

## frontend/pages/knowledge-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 16:139 KnowledgePage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; {"kind":"logical","expression":"onRetry","operator":"&&"}; earlier return: state.k… |
| 17:253 KnowledgePage | div  |  | {"kind":"logical","expression":"localError","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 17:357 KnowledgePage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"logical","expression":"localError","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 17:490 KnowledgePage | ReviewPanel  | onPeriodChange=onReviewPeriodChange | {"kind":"logical","expression":"review","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 17:940 KnowledgePage | ActivityPanel  | onLoadMore=onLoadMoreActivity | {"kind":"logical","expression":"activity.length &gt; 0","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 17:1292 KnowledgePage | DataPagination  | onPageChange=(page) =&gt; onPageChange?.(page); onPageSizeChange=(size) =&gt; onPageSizeChange?.(size) | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; spread: state.pagination |
| 21:346 ToReadPanel | a  | href=&#96;/knowledge/${encodeURIComponent(item.id)}&#96; | {"kind":"repeat","expression":"items"} |
| 25:506 ReviewPanel | select  | onChange=(event) =&gt; onPeriodChange?.(event.target.value === "weekly" ? "weekly" : "daily") |  |
| 25:675 ReviewPanel | option frontendText(locale, "KNOWLEDGE_REVIEW_DAILY") |  |  |
| 25:754 ReviewPanel | option frontendText(locale, "KNOWLEDGE_REVIEW_WEEKLY") |  |  |
| 25:1251 ReviewPanel | a  | href=&#96;/knowledge/${encodeURIComponent(item.knowledgeItemId)}&#96; | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"branch","expression":"state.data.items.length","branch":"true"}; {"kind"… |
| 29:222 ActivityPanel | a  | href=item.resourceType === "knowledge" ? &#96;/knowledge/${encodeURIComponent(item.resourceId)}&#96; : item.resourceType === "task" ? "/tasks" : item.resourc… | {"kind":"repeat","expression":"items"} |
| 29:803 ActivityPanel | Button frontendText(locale, "KNOWLEDGE_ACTIVITY_LOAD_MORE") | onClick=onLoadMore | {"kind":"logical","expression":"nextCursor","operator":"&&"} |
| 33:234 RecentKnowledgePanel | a  | href=&#96;/knowledge/${encodeURIComponent(item.id)}&#96; | {"kind":"repeat","expression":"items"} |
| 37:964 RecentResearchPanel | a frontendText(locale, "KNOWLEDGE_RESEARCH_OPEN") | href=&#96;/knowledge/${encodeURIComponent(item.knowledgeItemId)}?researchRunId=${encodeURIComponent(item.id)}&#96; | {"kind":"repeat","expression":"items"} |
| 41:433 PrivateNotesPanel | a  | href=&#96;/knowledge/${encodeURIComponent(note.knowledgeItemId)}&#96; | {"kind":"repeat","expression":"notes"} |

## frontend/pages/knowledge-reader-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 19:10 KnowledgeReaderPage | KnowledgeReaderSessionPage  |  | spread: props |
| 55:134 KnowledgeReaderSessionPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 58:5 KnowledgeReaderSessionPage | div  |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 59:7 KnowledgeReaderSessionPage | button frontendText(locale, "KNOWLEDGE_READER_TAB_OUTLINE") | onClick=() =&gt; setMobilePanel(mobilePanel === "outline" ? null : "outline"); type="button" | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 60:7 KnowledgeReaderSessionPage | button frontendText(locale, "KNOWLEDGE_READER_TAB_SOURCES") | onClick=() =&gt; setMobilePanel(mobilePanel === "sources" ? null : "sources"); type="button" | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 64:9 KnowledgeReaderSessionPage | ReaderOutlinePanel  | onSelectChunk=setSelectedChunkId | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 67:501 KnowledgeReaderSessionPage | Button favorite ? frontendText(locale, "KNOWLEDGE_READER_UNFAVORITE") : frontendText(locale, "KNOWLEDGE_READER_FAVORITE") | onClick=() =&gt; void onToggleFavorite() | {"kind":"logical","expression":"favorite !== null && onToggleFavorite","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind… |
| 67:807 KnowledgeReaderSessionPage | Button diffState.kind === "loading" ? frontendText(locale, "KNOWLEDGE_READER_COMPARING") : frontendText(locale, "KNOWLEDGE_READER_COMPARE") | onClick=onCompare | disabled=diffState.kind === "loading"; {"kind":"logical","expression":"normalizedRevision.previousRevisionId && onCompare","operator":"&&"}; earlier return: … |
| 67:1086 KnowledgeReaderSessionPage | a frontendText(locale, "MESSAGES_DISCUSS") | href=contextDiscussionHref({ kind: "knowledge", id: normalizedRevision.knowledgeItemId }) | {"kind":"logical","expression":"normalizedRevision.knowledgeItemId","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind ==… |
| 67:1339 KnowledgeReaderSessionPage | a frontendText(locale, "KNOWLEDGE_READER_ASK") | href="/agent?scope=items&knowledgeItemId=" + encodeURIComponent(normalizedRevision.knowledgeItemId) | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 71:9 KnowledgeReaderSessionPage | SourcePanel  | onSelectChunk=setSelectedChunkId | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 72:9 KnowledgeReaderSessionPage | ReaderNotePanel  | onTitleChange=(value) =&gt; note.edit("title", value); onBodyChange=(value) =&gt; note.edit("body", value); onSave=saveNote; onCheck=() =&gt; void note.check… | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 84:655 ReaderNotePanel | p frontendText(locale, "KNOWLEDGE_NOTE_DISCARD_ERROR") |  | {"kind":"logical","expression":"discardError","operator":"&&"} |
| 84:778 ReaderNotePanel | div  |  | {"kind":"logical","expression":"phase === \"unknown\"","operator":"&&"} |
| 84:851 ReaderNotePanel | Button frontendText(locale, "KNOWLEDGE_NOTE_CHECK") | onClick=onCheck | {"kind":"logical","expression":"phase === \"unknown\"","operator":"&&"} |
| 84:1013 ReaderNotePanel | div  |  | {"kind":"logical","expression":"phase === \"storage-error\"","operator":"&&"} |
| 84:1116 ReaderNotePanel | Button frontendText(locale, "KNOWLEDGE_NOTE_CHECK") | onClick=onRetryLoad | {"kind":"logical","expression":"phase === \"storage-error\"","operator":"&&"} |
| 84:1287 ReaderNotePanel | div  |  | {"kind":"logical","expression":"phase === \"load-error\"","operator":"&&"} |
| 84:1363 ReaderNotePanel | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetryLoad | {"kind":"logical","expression":"phase === \"load-error\"","operator":"&&"} |
| 84:1628 ReaderNotePanel | input  | onChange=(event) =&gt; onTitleChange(event.currentTarget.value) | readOnly=shared &#124;&#124; locked |
| 84:2101 ReaderNotePanel | textarea  | onChange=(event) =&gt; onBodyChange(event.currentTarget.value) | readOnly=shared &#124;&#124; locked |
| 84:2531 ReaderNotePanel | span statusLabel |  | {"kind":"logical","expression":"!shared","operator":"&&"} |
| 84:2632 ReaderNotePanel | Button status === "saving" ? frontendText(locale, "KNOWLEDGE_NOTE_SAVING") : frontendText(locale, "KNOWLEDGE_NOTE_SAVE") | onClick=onSave | disabled=locked &#124;&#124; status === "saving"; {"kind":"logical","expression":"!shared","operator":"&&"} |
| 84:3031 ReaderNotePanel | div  |  | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.phase === \"unknown\"","operator":"&&"} |
| 84:3110 ReaderNotePanel | Button frontendText(locale, "KNOWLEDGE_NOTE_CHECK") | onClick=() =&gt; void sharing.check() | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.phase === \"unknown\"","operator":"&&"} |
| 84:3305 ReaderNotePanel | div  |  | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.phase === \"storage-error\"","operator":"&&"} |
| 84:3414 ReaderNotePanel | Button frontendText(locale, "KNOWLEDGE_NOTE_CHECK") | onClick=sharing.retryLoad | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.phase === \"storage-error\"","operator":"&&"} |
| 84:3605 ReaderNotePanel | Button frontendText(locale, "COMMON_RETRY") | onClick=sharing.retryLoad | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.phase === \"load-error\"","operator":"&&"} |
| 84:3863 ReaderNotePanel | select  | onChange=(event) =&gt; sharing.select(event.currentTarget.value) | disabled=sharing.locked; {"kind":"logical","expression":"!shared","operator":"&&"} |
| 84:4128 ReaderNotePanel | option frontendText(locale, "KNOWLEDGE_NOTE_SHARE_SELECT") |  | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"container","tag":"select","attributes":{"disabled":"sharing.locked"}} |
| 84:4315 ReaderNotePanel | option member.email |  | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"container","tag":"select","attributes":{"disabled":"sharing.locked"}}; {"kind":"repeat","… |
| 84:4391 ReaderNotePanel | Button frontendText(locale, "KNOWLEDGE_NOTE_SHARE_ACTION") | onClick=() =&gt; sharing.request("share") | disabled=sharing.locked &#124;&#124; !recipientMemberId; {"kind":"logical","expression":"!shared","operator":"&&"} |
| 84:4997 ReaderNotePanel | button frontendText(locale, "KNOWLEDGE_NOTE_SHARE_REVOKE") | onClick=() =&gt; sharing.request("revoke", share); type="button" | disabled=sharing.locked; {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"branch","expression":"shares.length === 0","branch":"false"}; {"… |
| 84:5228 ReaderNotePanel | p frontendText(locale, "KNOWLEDGE_NOTE_SHARE_ERROR") |  | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.error","operator":"&&"} |
| 92:448 ReaderOutlinePanel | button heading.label | onClick=() =&gt; onSelectChunk(heading.id); type="button" | {"kind":"branch","expression":"headings.length === 0","branch":"false"}; {"kind":"repeat","expression":"headings"} |
| 98:362 RelatedKnowledgePanel | a  | href=&#96;/knowledge/${encodeURIComponent(item.id)}&#96; | {"kind":"branch","expression":"state.items.length === 0","branch":"false"}; {"kind":"repeat","expression":"state.items"}; earlier return: state.kind === "loa… |
| 104:358 BacklinkPanel | a  | href="/knowledge/" + encodeURIComponent(item.id) | {"kind":"branch","expression":"state.items.length === 0","branch":"false"}; {"kind":"repeat","expression":"state.items"}; earlier return: state.kind === "loa… |
| 120:584 SourcePanel | a frontendText(locale, "KNOWLEDGE_READER_DOWNLOAD") | href=downloadHref | {"kind":"logical","expression":"downloadHref","operator":"&&"} |
| 120:927 SourcePanel | div  |  | {"kind":"branch","expression":"revision.chunks.length === 0","branch":"false"} |
| 120:1061 SourcePanel | button  | onClick=() =&gt; onSelectChunk(chunk.id); type="button" | {"kind":"branch","expression":"revision.chunks.length === 0","branch":"false"}; {"kind":"repeat","expression":"revision.chunks"} |
| 120:1886 SourcePanel | div  |  | {"kind":"logical","expression":"selectedChunk","operator":"&&"} |
| 132:38 RevisionDiffPanel | p frontendText(locale, "KNOWLEDGE_READER_DIFF_ERROR") |  | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |

## frontend/pages/login-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 18:21 LoginPage | p error |  | {"kind":"logical","expression":"error","operator":"&&"} |
| 20:15 LoginPage | Button frontendText(locale, "LOGIN_GITHUB") | onClick=() =&gt; { window.location.href = "/auth/github"; } | {"kind":"branch","expression":"githubEnabled","branch":"true"} |

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
| 94:138 ThreadPage | Button frontendText(locale, "MESSAGES_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 98:76 ThreadPage | a frontendText(locale, "MESSAGES_BACK") | href="/messages" | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: recoveryBlocked |
| 98:296 ThreadPage | a state.thread.contextId | href=discussionContextHref({ kind: state.thread.contextKind, id: state.thread.contextId }) | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: recoveryBlocked |
| 98:484 ThreadPage | Button frontendText(locale, "MESSAGES_REFRESH") | onClick=onRefresh | disabled=pending; earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: recoveryBlocked |
| 100:900 ThreadPage | Button frontendText(locale, "MESSAGES_REPLY") | onClick=() =&gt; selectReply(message) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"pending &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.messages.… |
| 102:5 ThreadPage | DiscussionCursorPagination  | onPrevious=onPrevious; onNext=() =&gt; state.nextCursor && onNext(state.nextCursor); onLimitChange=onLimitChange | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: recoveryBlocked |
| 103:5 ThreadPage | DiscussionComposer  | onLookup=onLookup ? checkResult : undefined; onBodyChange=(value) =&gt; draft.edit("body", value); onCancelReply=() =&gt; selectReply(null); onSubmit=submit | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: recoveryBlocked |
| 119:10 DiscussionComposer | form  | onSubmit=(event) =&gt; void onSubmit(event) |  |
| 120:202 DiscussionComposer | button frontendText(locale, "MESSAGES_CANCEL_REPLY") | onClick=onCancelReply; type="button" | disabled=locked; {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"replyTo","operator":"&&"} |
| 122:197 DiscussionComposer | Button frontendText(locale, status === "checking" ? "MESSAGES_CHECKING_RESULT" : "MESSAGES_CHECK_RESULT") | onClick=() =&gt; void onLookup(); type="button" | disabled=status === "pending" &#124;&#124; status === "checking"; {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"operatio… |
| 124:5 DiscussionComposer | textarea  | onChange=(event) =&gt; onBodyChange(event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"form","attributes":{}} |
| 125:158 DiscussionComposer | Button status === "pending" ? frontendText(locale, "MESSAGES_SENDING") : frontendText(locale, status === "error" ? "MESSAGES_RETRY_SEND" : "MESSAGES_SEND") | type="submit" | disabled=status === "pending" &#124;&#124; status === "checking" &#124;&#124; !body.trim(); {"kind":"container","tag":"form","attributes":{}} |
| 146:349 DiscussionCursorPagination | Select  | onChange=(event) =&gt; onLimitChange(Number(event.currentTarget.value) as 20 &#124; 50) | disabled=pending |
| 146:615 DiscussionCursorPagination | Button labels.previousLabel | onClick=onPrevious; type="button" | disabled=pending &#124;&#124; page &lt;= 1 |
| 146:773 DiscussionCursorPagination | Button labels.nextLabel | onClick=onNext; type="button" | disabled=pending &#124;&#124; !hasNext |

## frontend/pages/my-submissions-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 11:145 MySubmissionsPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; {"kind":"logical","expression":"onRetry","operator":"&&"}; earlier return: state.k… |
| 12:257 MySubmissionsPage | div  |  | {"kind":"logical","expression":"localError","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 12:361 MySubmissionsPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"logical","expression":"localError","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 12:1298 MySubmissionsPage | button frontendText(locale, "SUBMISSIONS_RESUBMIT") | type="button" | {"kind":"branch","expression":"state.items.length","branch":"true"}; {"kind":"repeat","expression":"state.items"}; {"kind":"logical","expression":"item.statu… |
| 12:1475 MySubmissionsPage | div  |  | {"kind":"branch","expression":"state.items.length","branch":"true"}; {"kind":"repeat","expression":"state.items"}; {"kind":"logical","expression":"item.revie… |
| 12:1972 MySubmissionsPage | DataPagination  | onPageChange=(page) =&gt; onPageChange?.(page); onPageSizeChange=(size) =&gt; onPageSizeChange?.(size) | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; spread: state.pagination |

## frontend/pages/notifications/notifications-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 40:198 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"recovery\"","branch":"true"}; earlier return: state.kind === "loading" |
| 41:114 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading"; earlier return: state.kind === "recovery" |
| 42:126 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"forbidden\"","branch":"true"}; earlier return: state.kind === "loading"; earlier return: state.kind === "reco… |
| 50:7 NotificationsPage | Select  | onChange=(event) =&gt; onFilterChange({ ...filters, read: readFilter(event.currentTarget.value) }) | disabled=pending; earlier return: state.kind === "loading"; earlier return: state.kind === "recovery"; earlier return: state.kind === "error"; earlier return… |
| 55:7 NotificationsPage | Select  | onChange=(event) =&gt; onFilterChange({ ...filters, eventType: eventFilter(event.currentTarget.value) }) | disabled=pending; earlier return: state.kind === "loading"; earlier return: state.kind === "recovery"; earlier return: state.kind === "error"; earlier return… |
| 59:7 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_MARK_VISIBLE_READ") | onClick=() =&gt; onMarkVisibleRead(visibleUnreadIds) | disabled=pending &#124;&#124; actionPending &#124;&#124; recordBlocked &#124;&#124; visibleUnreadIds.length === 0; earlier return: state.kind === "loading"; … |
| 63:29 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_UPDATE_RECORD_DISCARD") | onClick=onDiscardRecord | {"kind":"logical","expression":"recordBlocked","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "recovery"; earlier… |
| 67:34 NotificationsPage | NotificationCard  | onMarkRead=onMarkRead; onOpen=onOpen | disabled=actionPending &#124;&#124; pending; {"kind":"branch","expression":"state.items.length === 0","branch":"false"}; {"kind":"container","tag":"div","att… |
| 69:5 NotificationsPage | DataPagination  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange | earlier return: state.kind === "loading"; earlier return: state.kind === "recovery"; earlier return: state.kind === "error"; earlier return: state.kind === "… |
| 84:53 NotificationCard | Button frontendText(locale, "NOTIFICATIONS_OPEN") | onClick=() =&gt; onOpen(item.id) | disabled=disabled &#124;&#124; recordBlocked; {"kind":"branch","expression":"href","branch":"true"} |
| 84:323 NotificationCard | Button frontendText(locale, "NOTIFICATIONS_MARK_READ") | onClick=() =&gt; onMarkRead(item.id) | disabled=disabled &#124;&#124; recordBlocked; {"kind":"logical","expression":"unread","operator":"&&"} |

## frontend/pages/project-timeline-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 26:84 ProjectTimelinePage | Button frontendText(locale, "PROJECT_TIMELINE_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 28:74 ProjectTimelinePage | Button frontendText(locale, "PROJECT_TIMELINE_BACK") | onClick=onBack; type="button" | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 29:5 ProjectTimelinePage | TimelineCreateForm  |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; spread: createCallbacks |
| 30:21 ProjectTimelinePage | div actionError |  | {"kind":"logical","expression":"actionError","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 31:1109 ProjectTimelinePage | Button frontendText(locale, "PROJECT_TIMELINE_MARK_DONE") | onClick=() =&gt; onStatusChange?.(item, "done"); type="button" | disabled=pending &#124;&#124; createLocked; {"kind":"branch","expression":"state.items.length","branch":"true"}; {"kind":"repeat","expression":"state.items"}… |
| 31:1358 ProjectTimelinePage | Button frontendText(locale, "PROJECT_TIMELINE_ARCHIVE") | onClick=() =&gt; onStatusChange?.(item, "archived"); type="button" | disabled=pending &#124;&#124; createLocked; {"kind":"branch","expression":"state.items.length","branch":"true"}; {"kind":"repeat","expression":"state.items"}… |
| 31:1585 ProjectTimelinePage | Button frontendText(locale, "PROJECT_TIMELINE_REOPEN") | onClick=() =&gt; onStatusChange?.(item, "open"); type="button" | disabled=pending &#124;&#124; createLocked; {"kind":"branch","expression":"state.items.length","branch":"true"}; {"kind":"repeat","expression":"state.items"}… |
| 31:1793 ProjectTimelinePage | TimelineItemEditor  | onSave=onEdit | {"kind":"branch","expression":"state.items.length","branch":"true"}; {"kind":"repeat","expression":"state.items"}; {"kind":"logical","expression":"onEdit","o… |
| 32:26 ProjectTimelinePage | DataPagination  | onPageChange=page =&gt; onPageChange?.(page); onPageSizeChange=size =&gt; onPageSizeChange?.(size) | {"kind":"logical","expression":"state.pagination","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error"; spread:… |
| 33:84 ProjectTimelinePage | Button frontendText(locale, "PROJECT_TIMELINE_LOAD_MORE") | onClick=onLoadMore; type="button" | disabled=pending &#124;&#124; createLocked; {"kind":"logical","expression":"!state.pagination && state.nextCursor","operator":"&&"}; earlier return: state.ki… |

## frontend/pages/projects-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 30:84 ProjectsPage | Button frontendText(locale, "PROJECTS_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 33:183 ProjectsPage | PlanningCreateForm  | onCreate=onCreate; onCreateReadback=onCreateReadback; onCreateDenied=onCreateDenied; onCreateLock=onCreateLock | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#124;&#124; undefined"}}; earlier return: state.kind === "loading";… |
| 34:21 ProjectsPage | div actionError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#124;&#124; undefined"}}; {"kind":"logical","expression":"actionErr… |
| 36:2029 ProjectsPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.item… |
| 36:2155 ProjectsPage | Button frontendText(locale, "PROJECTS_SUMMARY_RETRY") | onClick=() =&gt; onRetrySummary?.(project); type="button" | disabled=statusConfirmation.open &#124;&#124; !!relationProjectId &#124;&#124; createLocked &#124;&#124; pending &#124;&#124; summaryPending.includes(project… |
| 36:2492 ProjectsPage | Button frontendText(locale, "RELATIONS_MANAGE") | onClick=() =&gt; onManageRelations?.(project); type="button" | aria-expanded=relationProjectId === project.id; disabled=statusConfirmation.open &#124;&#124; !!relationProjectId &#124;&#124; createLocked &#124;&#124; pend… |
| 36:2900 ProjectsPage | Button frontendText(locale, "PROJECTS_TIMELINE") | onClick=() =&gt; onOpenTimeline?.(project); type="button" | disabled=statusConfirmation.open &#124;&#124; !!relationProjectId &#124;&#124; createLocked &#124;&#124; pending; {"kind":"container","tag":"section","attrib… |
| 36:3238 ProjectsPage | Button frontendText(locale, "PROJECTS_COMPLETE") | onClick=() =&gt; statusConfirmation.request(project, "completed"); type="button" | disabled=statusConfirmation.unavailable &#124;&#124; statusConfirmation.open &#124;&#124; !!relationProjectId &#124;&#124; createLocked &#124;&#124; pending;… |
| 36:3583 ProjectsPage | Button frontendText(locale, "PROJECTS_ARCHIVE") | onClick=() =&gt; statusConfirmation.request(project, "archived"); type="button" | disabled=statusConfirmation.unavailable &#124;&#124; statusConfirmation.open &#124;&#124; !!relationProjectId &#124;&#124; createLocked &#124;&#124; pending;… |
| 36:3940 ProjectsPage | Button frontendText(locale, "PROJECTS_RESTORE") | onClick=() =&gt; statusConfirmation.request(project, "active"); type="button" | disabled=statusConfirmation.unavailable &#124;&#124; statusConfirmation.open &#124;&#124; !!relationProjectId &#124;&#124; createLocked &#124;&#124; pending;… |
| 37:26 ProjectsPage | DataPagination  | onPageChange=page =&gt; onPageChange?.(page); onPageSizeChange=size =&gt; onPageSizeChange?.(size) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open &#124;&#124; undefined"}}; {"kind":"logical","expression":"state.pag… |
| 38:63 ProjectsPage | Button frontendText(locale, "PROJECTS_LOAD_MORE") | onClick=onLoadMore; type="button" | disabled=statusConfirmation.open &#124;&#124; !!relationProjectId &#124;&#124; createLocked &#124;&#124; pending; {"kind":"container","tag":"section","attrib… |

## frontend/pages/search-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 41:5 SearchPage | form  | onSubmit=(event) =&gt; { event.preventDefault(); onSubmit?.(); } |  |
| 42:135 SearchPage | Input  | onChange=(event) =&gt; onQueryChange?.(event.currentTarget.value) | disabled=queryLocked; {"kind":"container","tag":"form","attributes":{}} |
| 43:7 SearchPage | Button frontendText(locale, "SEARCH_SUBMIT") | type="submit" | disabled=!onSubmit &#124;&#124; queryLocked; {"kind":"container","tag":"form","attributes":{}} |
| 46:53 SearchPage | p savedViewError |  | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"savedViewError && !savedViewRecordBlo… |
| 47:34 SearchPage | div  |  | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"savedViewRecordBlocked","operator":"&&"} |
| 47:158 SearchPage | Button frontendText(locale, "SEARCH_SAVED_VIEW_RECORD_DISCARD") | onClick=onDiscardSavedViewRecord; type="button" | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"savedViewRecordBlocked","operator":"&&"} |
| 48:28 SearchPage | Button frontendText(locale, "SEARCH_SAVED_VIEW_CHECK") | onClick=onCheckSavedView; type="button" | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"savedViewUnknown","operator":"&&"} |
| 51:24 SearchPage | form  | onSubmit=(event) =&gt; { event.preventDefault(); const name = savedViewName.trim(); if (controlledName === undefined && !name) return; onSaveView(name); } | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"onSaveView","operator":"&&"} |
| 52:11 SearchPage | Input  | onChange=(event) =&gt; setSavedViewName(event.currentTarget.value) | disabled=savedViewPending; {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"onSaveView… |
| 53:11 SearchPage | Button frontendText(locale, "SEARCH_SAVE_VIEW") | type="submit" | disabled=savedViewPending &#124;&#124; !savedViewName.trim(); {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind"… |
| 56:213 SearchPage | button view.name | onClick=() =&gt; onApplyView?.(view); type="button" | disabled=savedViewPending; {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"!!savedVie… |
| 56:391 SearchPage | button × | onClick=() =&gt; onDeleteView?.(view.id); type="button" | disabled=savedViewPending &#124;&#124; !onDeleteView; {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logica… |
| 59:133 SearchPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"} |
| 61:24 SearchPage | div  |  | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 61:128 SearchPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 64:9 SearchPage | DataPagination  | onPageChange=(page) =&gt; onPageChange?.(page); onPageSizeChange=(size) =&gt; onPageSizeChange?.(size) | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; spr… |

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
| 98:5 TaskEditor | owner.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, committed |  |
| 104:5 TaskEditor | owner.addEventListener  | "beforeunload", preventUnload |  |
| 249:14 TaskEditor | p t("TASKS_SAVING") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"busy","operator":"&&"} |
| 250:17 TaskEditor | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"unknown","operator":"&&"} |
| 251:7 TaskEditor | Button t("TASKS_CHECK_WRITE") | onClick=() =&gt; void check() | disabled=busy; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"unknown","operator":"… |
| 252:7 TaskEditor | Button t("TASKS_RETRY_WRITE") | onClick=() =&gt; { if (intent.current) void perform(intent.current, true); } | disabled=busy; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"unknown","operator":"… |
| 254:16 TaskEditor | p t(notice) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"notice","operator":"&&"} |
| 255:15 TaskEditor | p t("TASKS_ACTION_FAILED") / t("TASKS_INVALID_FORM") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"error","operator":"&&"} |
| 256:16 TaskEditor | p t("TASKS_LOADING") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"true"} |
| 256:72 TaskEditor | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 256:125 TaskEditor | Button t("TASKS_RELOAD_DETAIL") | onClick=() =&gt; void read() | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 257:7 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); save(); } | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 258:58 TaskEditor | Input  | onChange=(event) =&gt; edit("fields", { ...currentDraft.current.fields, title: event.currentTarget.value }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 259:58 TaskEditor | Input  | onChange=(event) =&gt; edit("fields", { ...currentDraft.current.fields, notes: event.currentTarget.value }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 260:61 TaskEditor | select  | onChange=(event) =&gt; edit("fields", { ...currentDraft.current.fields, priority: event.currentTarget.value }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 260:374 TaskEditor | option t(taskPriorityKey(priority)) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 261:56 TaskEditor | Input  | onChange=(event) =&gt; edit("fields", { ...currentDraft.current.fields, dueAt: event.currentTarget.value }); type="datetime-local" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 263:9 TaskEditor | Button t(taskId ? "TASKS_SAVE" : "TASKS_CREATE") | type="submit" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 266:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); if (!locked) { const next = currentDraft.current.status; void perform({ clean: ["status"], op: { op: "status… | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 267:43 TaskEditor | select  | onChange=(event) =&gt; edit("status", event.currentTarget.value as TaskItem["status"]) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 267:313 TaskEditor | option t(taskStatusKey(value)) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 268:11 TaskEditor | Button t("TASKS_SAVE_STATUS") | type="submit" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 270:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); const progress = currentDraft.current.progress; const next = Number(progress); if (!locked && progress !== "… | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 271:45 TaskEditor | Input  | onChange=(event) =&gt; edit("progress", event.currentTarget.value); type="number" | disabled=locked &#124;&#124; ["done", "canceled"].includes(detail.task.status); {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; … |
| 272:11 TaskEditor | Button t("TASKS_SAVE_PROGRESS") | type="submit" | disabled=locked &#124;&#124; ["done", "canceled"].includes(detail.task.status); {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; … |
| 274:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); saveTags(); } | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 275:41 TaskEditor | Input  | onChange=(event) =&gt; edit("tags", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 276:11 TaskEditor | Button t("TASKS_SAVE_TAGS") | type="submit" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 278:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); const id = currentDraft.current.knowledgeId.trim(); if (!locked && id) void perform({ clean: ["knowledgeId"]… | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 279:38 TaskEditor | Input  | onChange=(event) =&gt; edit("knowledgeId", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 280:11 TaskEditor | Button t("TASKS_LINK_ADD") | type="submit" | disabled=locked &#124;&#124; detail.links.length &gt;= 5; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"b… |
| 282:254 TaskEditor | Button t("TASKS_LINK_REMOVE") | onClick=() =&gt; void perform({ op: { op: "unlink", taskId, linkId: link.id, expectedUpdatedAt: detail.task.updatedAt } }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 283:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); const title = currentDraft.current.subtaskTitle.trim(); if (locked &#124;&#124; !title &#124;&#124; [...titl… | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 284:44 TaskEditor | Input  | onChange=(event) =&gt; edit("subtaskTitle", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 285:11 TaskEditor | Button t("TASKS_SUBTASK_ADD") | type="submit" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 287:226 TaskEditor | select  | onChange=(event) =&gt; { const status = event.currentTarget.value as TaskSubtask["status"]; if (status !== item.status) void perform({ op: { op: "subtask-upd… | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 287:768 TaskEditor | option t(taskStatusKey(status)) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 287:901 TaskEditor | Button item.status === "done" ? t("TASKS_SUBTASK_REOPEN") : t("TASKS_SUBTASK_DONE") | onClick=() =&gt; void perform({ op: { op: "subtask-update", taskId, subtaskId: item.id, title: item.title, status: item.status === "done" ? "todo" : "done", … | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 287:1362 TaskEditor | Button t("TASKS_SUBTASK_REMOVE") | onClick=() =&gt; void perform({ op: { op: "subtask-delete", taskId, subtaskId: item.id, expectedUpdatedAt: item.updatedAt } }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 288:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); const dependsOnTaskId = currentDraft.current.dependsOnTaskId.trim(); if (locked &#124;&#124; !/^[A-Za-z0-9][… | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 289:44 TaskEditor | Input  | onChange=(event) =&gt; edit("dependsOnTaskId", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 290:11 TaskEditor | Button t("TASKS_DEPENDENCY_ADD") | type="submit" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 292:208 TaskEditor | Button t("TASKS_DEPENDENCY_REMOVE") | onClick=() =&gt; void perform({ op: { op: "dependency-remove", taskId, dependsOnTaskId: item.dependsOnTaskId, expectedUpdatedAt: detail.task.updatedAt } }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 295:5 TaskEditor | Button t("TASKS_CLOSE") | onClick=close | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}} |
| 298:7 TaskEditor | Sheet  | onOpenChange=(open) =&gt; { if (!open) close(); } | open=true; {"kind":"branch","expression":"taskId","branch":"true"} |
| 299:7 TaskEditor | Dialog  | onOpenChange=(open) =&gt; { if (!open) close(); } | open=true; {"kind":"branch","expression":"taskId","branch":"false"} |
| 301:5 TaskEditor | ConfirmAction  | onCancel=cancelDiscard; onConfirm=discard | open=confirmingDiscard |

## frontend/pages/tasks/tasks-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 61:84 TasksPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 64:18 TasksPage | Button frontendText(locale, "TASKS_NEW") | onClick=onCreate | disabled=Boolean(actionPendingId); {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"log… |
| 66:7 TasksPage | Input  | onChange=(event) =&gt; onTextFilterChange?.({ ...filters, q: event.currentTarget.value &#124;&#124; undefined }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; earlier return: state.kind === "loading"; earli… |
| 67:7 TasksPage | FilterSelect  | onChange=(value) =&gt; onFilterChange?.({ ...filters, status: (value &#124;&#124; undefined) as TaskStatus &#124; undefined }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; earlier return: state.kind === "loading"; earli… |
| 68:7 TasksPage | FilterSelect  | onChange=(value) =&gt; onFilterChange?.({ ...filters, priority: (value &#124;&#124; undefined) as TaskPriority &#124; undefined }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; earlier return: state.kind === "loading"; earli… |
| 69:7 TasksPage | Input  | onChange=(event) =&gt; onTextFilterChange?.({ ...filters, tag: event.currentTarget.value &#124;&#124; undefined }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; earlier return: state.kind === "loading"; earli… |
| 70:7 TasksPage | FilterSelect  | onChange=(value) =&gt; onFilterChange?.({ ...filters, due: (value &#124;&#124; undefined) as TaskFilterState["due"] }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; earlier return: state.kind === "loading"; earli… |
| 72:21 TasksPage | div actionError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"actionError","o… |
| 73:24 TasksPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"localLoadError"… |
| 73:132 TasksPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"localLoadError"… |
| 78:260 TasksPage | Button frontendText(locale, "TASKS_EDIT") | onClick=() =&gt; onOpen(task.id) | disabled=Boolean(actionPendingId); {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"bra… |
| 78:820 TasksPage | a frontendText(locale, "MESSAGES_DISCUSS") | href=contextDiscussionHref({ kind: "task", id: task.id }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.items.leng… |
| 78:1096 TasksPage | Button statusAction | onClick=() =&gt; { if (!confirmationRef.current) onStatusChange?.(task.id, task.status === "done" ? "todo" : "done"); } | disabled=validConfirmation &#124;&#124; actionPendingId != null; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#1… |
| 78:1375 TasksPage | Button frontendText(locale, "TASKS_DELETE") | onClick=() =&gt; requestDelete(task) | disabled=validConfirmation &#124;&#124; deleteBlocked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefi… |
| 80:5 TasksPage | DataPagination  | onPageChange=(page) =&gt; onPageChange?.(page); onPageSizeChange=(size) =&gt; onPageSizeChange?.(size) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; earlier return: state.kind === "loading"; earli… |
| 81:13 TasksPage | ConfirmAction  | onCancel=cancelDelete; onConfirm=confirmDelete | open=validConfirmation; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 88:10 FilterSelect | select  | onChange=(event) =&gt; onChange(event.currentTarget.value) |  |
| 88:171 FilterSelect | option label |  |  |
| 88:229 FilterSelect | option option |  | {"kind":"repeat","expression":"options"} |

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
| 43:5 PublicWorkbenchPage | media?.addEventListener  | "change", apply |  |
| 49:7 PublicWorkbenchPage | a text("LOGIN") | href="/auth/github" | {"kind":"branch","expression":"githubEnabled","branch":"true"} |
| 55:9 PublicWorkbenchPage | a text("BRAND") | href="/" |  |
| 57:11 PublicWorkbenchPage | select  | onChange=event =&gt; locale.setLocale(event.target.value) |  |
| 59:13 PublicWorkbenchPage | option English |  |  |
| 59:48 PublicWorkbenchPage | option 简体中文 |  |  |
| 71:15 PublicWorkbenchPage | Button text("START") | onClick=() =&gt; dispatch({ type: "start" }) |  |
| 74:15 PublicWorkbenchPage | Button text("EXPLORE") | onClick=() =&gt; firstFeature.current?.focus() |  |
| 79:13 PublicWorkbenchPage | Button text(state.paused ? "SCENE_RESUME" : "SCENE_PAUSE") | onClick=() =&gt; dispatch({ type: "pause", value: !state.paused }) |  |
| 90:11 PublicWorkbenchPage | div  |  |  |
| 91:65 PublicWorkbenchPage | Button  | onClick=() =&gt; dispatch({ type: "open", feature: id }) | aria-expanded=state.activeFeature === id; {"kind":"repeat","expression":"features"} |
| 108:43 PublicWorkbenchPage | Button text("NEXT") | onClick=() =&gt; dispatch({ type: "next" }) | disabled=gated; {"kind":"logical","expression":"!state.activeFeature && state.step !== \"overview\"","operator":"&&"}; {"kind":"logical","expression":"state.… |
| 110:13 PublicWorkbenchPage | Button text("REPLAY") | onClick=() =&gt; dispatch({ type: "replay" }) | {"kind":"logical","expression":"!state.activeFeature && state.step !== \"overview\"","operator":"&&"} |

## frontend/pages/workbench-landing/workbench-feature-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 83:10 WorkbenchFeaturePanel | div  | onClick=event =&gt; { if (event.target === event.currentTarget) close(); } | earlier return: !state.activeFeature |
| 86:5 WorkbenchFeaturePanel | div  |  | earlier return: !state.activeFeature |
| 90:9 WorkbenchFeaturePanel | Button  | onClick=close | earlier return: !state.activeFeature |
| 95:9 WorkbenchFeaturePanel | Button text("BACK_TO_ANSWER") | onClick=() =&gt; dispatch({ type: "citation-back" }) | {"kind":"branch","expression":"showingCitation && source && citation","branch":"true"}; earlier return: !state.activeFeature |
| 98:9 WorkbenchFeaturePanel | h2 source.title |  | {"kind":"branch","expression":"showingCitation && source && citation","branch":"true"}; earlier return: !state.activeFeature |
| 114:13 WorkbenchFeaturePanel | Button text(state.captured ? "CAPTURE_DONE" : "CAPTURE_SELECT") | onClick=() =&gt; dispatch({ type: "capture" }) | disabled=state.captured; {"kind":"branch","expression":"showingCitation && source && citation","branch":"false"}; {"kind":"logical","expression":"feature ===… |
| 118:11 WorkbenchFeaturePanel | p text(state.captured ? "CAPTURE_DONE" : "CAPTURE_PENDING") |  | {"kind":"branch","expression":"showingCitation && source && citation","branch":"false"}; {"kind":"logical","expression":"feature === \"capture\"","operator":… |
| 126:13 WorkbenchFeaturePanel | Button text("OPEN_SOURCE") | onClick=() =&gt; setSourceOpen(sourceOpen === item.id ? null : item.id) | aria-expanded=sourceOpen === item.id; {"kind":"branch","expression":"showingCitation && source && citation","branch":"false"}; {"kind":"logical","expression"… |
| 138:13 WorkbenchFeaturePanel | Button text("ANSWER_SHOW") | onClick=() =&gt; setAnswerVisible(true) | aria-expanded=answerVisible; {"kind":"branch","expression":"showingCitation && source && citation","branch":"false"}; {"kind":"logical","expression":"feature… |
| 144:81 WorkbenchFeaturePanel | Button text("SOURCE_LABEL") / : / content.sources.find(document =&gt; document.id === item.sourceId)?.title | onClick=() =&gt; dispatch({ type: "citation", id: item.id }) | {"kind":"branch","expression":"showingCitation && source && citation","branch":"false"}; {"kind":"logical","expression":"feature === \"answer\"","operator":"… |
| 155:13 WorkbenchFeaturePanel | p text(state.taskDone ? "ACTION_DONE" : "ACTION_TODO") |  | {"kind":"branch","expression":"showingCitation && source && citation","branch":"false"}; {"kind":"logical","expression":"feature === \"action\"","operator":"… |
| 156:13 WorkbenchFeaturePanel | Button text("ACTION_COMPLETE") | onClick=() =&gt; dispatch({ type: "complete-task" }) | disabled=state.taskDone; {"kind":"branch","expression":"showingCitation && source && citation","branch":"false"}; {"kind":"logical","expression":"feature ===… |
| 169:11 WorkbenchFeaturePanel | Button text("NEXT") | onClick=() =&gt; dispatch({ type: "next" }) | disabled=gated; {"kind":"branch","expression":"showingCitation && source && citation","branch":"false"}; {"kind":"logical","expression":"state.step === featu… |

## frontend/pages/workbench-landing/workbench-scene-runtime.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 50:3 loadModel | options.signal.addEventListener  | "abort", onAbort, { once: true } |  |
| 127:5 createWorkbenchScene | canvas.addEventListener  | "webglcontextlost", contextLost |  |
| 260:5 createWorkbenchScene | options.host.ownerDocument.addEventListener  | "visibilitychange", visibilityChanged |  |
| 262:5 createWorkbenchScene | options.signal.addEventListener  | "abort", dispose, { once: true } |  |

## frontend/pages/workbench-landing/workbench-scene.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 175:5 WorkbenchScene | document.addEventListener  | "visibilitychange", onVisibility |  |
| 176:34 WorkbenchScene | media.addEventListener  | "change", onPreference | {"kind":"branch","expression":"media?.addEventListener","branch":"true"} |
| 177:10 WorkbenchScene | media?.addListener  | onPreference | {"kind":"branch","expression":"media?.addEventListener","branch":"false"} |
| 178:5 WorkbenchScene | connection?.addEventListener  | "change", onPreference |  |
| 197:7 WorkbenchScene | window.addEventListener  | "resize", measure, { passive: true } | {"kind":"branch","expression":"typeof IntersectionObserver !== \"undefined\"","branch":"false"} |
| 198:7 WorkbenchScene | window.addEventListener  | "scroll", measure, { passive: true, capture: true } | {"kind":"branch","expression":"typeof IntersectionObserver !== \"undefined\"","branch":"false"} |
| 242:7 WorkbenchScene | p text(view.message) |  |  |
| 245:11 WorkbenchScene | button text(failed ? "SCENE_RETRY" : "SCENE_LOAD") | onClick=event =&gt; activate(event.currentTarget, "load"); type="button" | {"kind":"logical","expression":"view.status !== \"loading\" && view.status !== \"ready\"","operator":"&&"} |
| 249:11 WorkbenchScene | button text("SCENE_STATIC_MODE") | onClick=event =&gt; activate(event.currentTarget, "useStatic"); type="button" | {"kind":"logical","expression":"view.status !== \"static\"","operator":"&&"} |

## frontend/pages/workbench-review-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 18:15 WorkbenchReviewPage | Button frontendText(locale, "REVIEW_REFRESH") | onClick=onRetry | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 19:9 WorkbenchReviewPage | Button frontendText(locale, "REVIEW_DAILY") | onClick=() =&gt; onPeriodChange?.("daily") | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}} |
| 20:9 WorkbenchReviewPage | Button frontendText(locale, "REVIEW_WEEKLY") | onClick=() =&gt; onPeriodChange?.("weekly") | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}} |
| 24:78 WorkbenchReviewPage | Button frontendText(locale, "REVIEW_RETRY") | onClick=onRetry | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"state.kind === \"error\"","oper… |
| 34:9 WorkbenchReviewPage | ListCard  | onOpen=onOpen; href="/tasks?status=done&page=1&pageSize=20" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 35:9 WorkbenchReviewPage | ListCard  | onOpen=onOpen; href="/tasks?due=overdue&page=1&pageSize=20" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 36:9 WorkbenchReviewPage | ListCard  | onOpen=onOpen; href="/tasks?status=blocked&page=1&pageSize=20" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 37:9 WorkbenchReviewPage | ListCard  | onOpen=onOpen; href="/inbox?status=inbox&page=1&pageSize=20" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 38:9 WorkbenchReviewPage | ListCard  | onOpen=onOpen; href="/projects?status=active&page=1&pageSize=20" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 46:58 ListCard | a frontendText(locale, "REVIEW_VIEW_ALL") | onClick=event =&gt; { if (event.button !== 0 &#124;&#124; event.metaKey &#124;&#124; event.ctrlKey &#124;&#124; event.altKey &#124;&#124; event.shiftKey) ret… |  |
| 49:228 ListCard | Button item.title | onClick=() =&gt; onOpen?.({kind:item.kind,id:item.id}) | {"kind":"branch","expression":"items.length","branch":"true"}; {"kind":"repeat","expression":"items.slice(0,10)"} |

## frontend/public/sw.js

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 4:1 &lt;module&gt; | self.addEventListener  | "install", (event) =&gt; { event.waitUntil(caches.open(CACHE).then((cache) =&gt; cache.addAll(SHELL)).then(() =&gt; self.skipWaiting())); } |  |
| 7:1 &lt;module&gt; | self.addEventListener  | "activate", (event) =&gt; { event.waitUntil(self.clients.claim()); } |  |
| 10:1 &lt;module&gt; | self.addEventListener  | "fetch", (event) =&gt; { const request = event.request; const url = new URL(request.url); if (request.method !== "GET" &#124;&#124; url.origin !== self.locat… |  |

