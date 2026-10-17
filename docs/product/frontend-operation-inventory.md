# 前端可见操作源码索引（A01）

此索引是源码清点，不是可见性证明、权限证明或原生浏览器验收；不能据此关闭 A01/A02/A05 父项。

生成器枚举全部第一方 frontend TS/TSX/JS/MJS 中的 JSX 控件、事件回调、导航/表单、role 语义边界、转发 spread 和命令式监听器。包含未接线组件，不能把出现次数当作用户可见功能数。
JSON 保留完整属性、handler、条件分支/重复模板、弹层祖先和前置 return 守卫；下表仅作摘要（长表达式截断），逐项核对以相邻 frontend-operation-inventory.json 和源码锚点为准。
自定义组件回调可能是状态通知而非用户操作；spread、动态菜单数据、跨组件条件传播、门户/第三方控件、createElement/innerHTML 动态生成的控件及 CSS 可见性需人工展开。未求值条件，不承诺列出所有运行时状态组合。
运行 `npm run audit:frontend-operations` 验证无漂移；只有有意更新证据才运行 `npm run inventory:frontend-operations`。

源码文件：443；操作/转发候选：1794。无候选文件也逐一列出，防止静默遗漏扫描范围。

| 源文件 | 候选数 |
| --- | ---: |
| frontend/app-routes.ts | 0 |
| frontend/app.tsx | 88 |
| frontend/asset-manifest.ts | 0 |
| frontend/build-contract.ts | 0 |
| frontend/components/admin/maintenance-status-panel.tsx | 6 |
| frontend/components/admin/tag-admin-panel.tsx | 8 |
| frontend/components/agent/agent-feedback.tsx | 2 |
| frontend/components/agent/agent-history-list.tsx | 8 |
| frontend/components/agent/agent-transcript.tsx | 1 |
| frontend/components/agent/answer-panel.tsx | 0 |
| frontend/components/agents/agent-activity/activity-row.tsx | 1 |
| frontend/components/agents/agent-activity/index.tsx | 5 |
| frontend/components/agents/agent-activity/types.ts | 0 |
| frontend/components/agents/agent-code.tsx | 0 |
| frontend/components/agents/agent-disclosure.tsx | 1 |
| frontend/components/agents/agent-highlighter.ts | 0 |
| frontend/components/agents/citations.tsx | 3 |
| frontend/components/agents/code-block.tsx | 2 |
| frontend/components/agents/loading-states/reasoning-text.tsx | 4 |
| frontend/components/agents/loading-states/thinking-shimmer.tsx | 0 |
| frontend/components/agents/message-bubble.tsx | 5 |
| frontend/components/agents/message-context.tsx | 0 |
| frontend/components/agents/message-scroller.tsx | 4 |
| frontend/components/agents/message.tsx | 8 |
| frontend/components/agents/prompt-input.tsx | 7 |
| frontend/components/agents/streaming-response.tsx | 6 |
| frontend/components/agents/todo-list.tsx | 4 |
| frontend/components/assets/asset-availability-panel.tsx | 2 |
| frontend/components/assets/asset-dropzone.tsx | 4 |
| frontend/components/assets/asset-hygiene-panel.tsx | 15 |
| frontend/components/assets/asset-preview-model.ts | 0 |
| frontend/components/assets/asset-preview-panel.tsx | 0 |
| frontend/components/assets/asset-state.ts | 0 |
| frontend/components/assets/asset-upload-model.ts | 0 |
| frontend/components/assets/asset-upload-panel.tsx | 21 |
| frontend/components/assets/asset-upload-queue.ts | 0 |
| frontend/components/calendar-cancel-confirmation.tsx | 1 |
| frontend/components/calendar-create-form.tsx | 15 |
| frontend/components/calendar-range-filter.tsx | 7 |
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
| frontend/components/knowledge/knowledge-derivatives-panel.tsx | 10 |
| frontend/components/knowledge/knowledge-research-panel.tsx | 33 |
| frontend/components/knowledge/knowledge-share-button.tsx | 3 |
| frontend/components/knowledge/reader-article.tsx | 2 |
| frontend/components/motion/action-swap-roll.tsx | 3 |
| frontend/components/motion/action-swap.tsx | 1 |
| frontend/components/motion/alert.tsx | 7 |
| frontend/components/motion/animated-badge.tsx | 1 |
| frontend/components/motion/animated-sidebar.tsx | 24 |
| frontend/components/motion/animated-toast-stack.tsx | 4 |
| frontend/components/motion/bottom-sheet.tsx | 4 |
| frontend/components/motion/bouncy-accordion.tsx | 3 |
| frontend/components/motion/breadcrumb.tsx | 13 |
| frontend/components/motion/button/base.tsx | 3 |
| frontend/components/motion/button/index.tsx | 0 |
| frontend/components/motion/button/magnetic.tsx | 1 |
| frontend/components/motion/button/metallic.tsx | 1 |
| frontend/components/motion/button/stateful.tsx | 1 |
| frontend/components/motion/card.tsx | 10 |
| frontend/components/motion/center-morph-modal.tsx | 4 |
| frontend/components/motion/checkbox.tsx | 1 |
| frontend/components/motion/collapsible.tsx | 4 |
| frontend/components/motion/combobox.tsx | 0 |
| frontend/components/motion/combobox/content.tsx | 2 |
| frontend/components/motion/combobox/context.tsx | 3 |
| frontend/components/motion/combobox/list.tsx | 3 |
| frontend/components/motion/combobox/trigger.tsx | 2 |
| frontend/components/motion/combobox/use-active-option.ts | 0 |
| frontend/components/motion/command-palette.tsx | 6 |
| frontend/components/motion/context-menu.tsx | 8 |
| frontend/components/motion/date-range-picker.tsx | 23 |
| frontend/components/motion/date-range-picker/context.ts | 0 |
| frontend/components/motion/date-range-picker/date-utils.ts | 0 |
| frontend/components/motion/date-range-picker/types.ts | 0 |
| frontend/components/motion/date-range-picker/use-date-range-picker.ts | 0 |
| frontend/components/motion/drawer.tsx | 3 |
| frontend/components/motion/expandable-action-bar.tsx | 3 |
| frontend/components/motion/feedback-widget.tsx | 11 |
| frontend/components/motion/file-tree.tsx | 2 |
| frontend/components/motion/file-upload.tsx | 7 |
| frontend/components/motion/hold-action-button.tsx | 2 |
| frontend/components/motion/input.tsx | 2 |
| frontend/components/motion/loader.tsx | 3 |
| frontend/components/motion/magnetic.tsx | 1 |
| frontend/components/motion/morphing-lightbox.tsx | 15 |
| frontend/components/motion/morphing-modal.tsx | 2 |
| frontend/components/motion/not-found/glitch.tsx | 0 |
| frontend/components/motion/not-found/shared.tsx | 2 |
| frontend/components/motion/notification-stack.tsx | 4 |
| frontend/components/motion/number-ticker.tsx | 0 |
| frontend/components/motion/overflow-actions.tsx | 4 |
| frontend/components/motion/popover-morph.tsx | 4 |
| frontend/components/motion/popover-position.ts | 2 |
| frontend/components/motion/popover.tsx | 2 |
| frontend/components/motion/preview-rail.tsx | 4 |
| frontend/components/motion/radio.tsx | 2 |
| frontend/components/motion/range-slider.tsx | 2 |
| frontend/components/motion/scroll-reveal.tsx | 0 |
| frontend/components/motion/select.tsx | 5 |
| frontend/components/motion/shared-layout-bg.tsx | 2 |
| frontend/components/motion/slide-action-button.tsx | 2 |
| frontend/components/motion/sortable-list.tsx | 7 |
| frontend/components/motion/sortable-stack.tsx | 0 |
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
| frontend/components/motion/tabs.tsx | 10 |
| frontend/components/motion/text-scramble.tsx | 0 |
| frontend/components/motion/text-shimmer.tsx | 0 |
| frontend/components/motion/tooltip-surface.tsx | 1 |
| frontend/components/motion/tooltip.tsx | 15 |
| frontend/components/motion/tooltip/grace.ts | 2 |
| frontend/components/motion/tooltip/positioner.tsx | 0 |
| frontend/components/motion/tooltip/use-position.ts | 8 |
| frontend/components/planning-create-form.tsx | 14 |
| frontend/components/planning-status-confirmation.tsx | 1 |
| frontend/components/planning-write-recovery.tsx | 4 |
| frontend/components/project-relations-editor.tsx | 10 |
| frontend/components/review-period-control.tsx | 1 |
| frontend/components/review/review-batch-owner.tsx | 10 |
| frontend/components/review/review-chunk-panel.tsx | 5 |
| frontend/components/review/review-comments-data.ts | 0 |
| frontend/components/review/review-comments-owner.tsx | 0 |
| frontend/components/review/review-comments-panel.tsx | 11 |
| frontend/components/review/review-decision-controls.tsx | 16 |
| frontend/components/review/review-detail-data.ts | 0 |
| frontend/components/review/review-detail-model.ts | 0 |
| frontend/components/review/review-drafts.tsx | 3 |
| frontend/components/review/review-source-panel.tsx | 9 |
| frontend/components/shell/app-shell.tsx | 68 |
| frontend/components/shell/command-palette.tsx | 3 |
| frontend/components/shell/context-rail.tsx | 6 |
| frontend/components/shell/navigation-policy.ts | 0 |
| frontend/components/snapshot-target-detail.tsx | 3 |
| frontend/components/submissions/submission-comments-panel.tsx | 1 |
| frontend/components/submissions/submission-form-model.ts | 0 |
| frontend/components/submissions/submission-target-picker.tsx | 15 |
| frontend/components/timeline-create-form.tsx | 21 |
| frontend/components/timeline-item-editor.tsx | 16 |
| frontend/components/today-target-detail.tsx | 1 |
| frontend/components/ui/alert.tsx | 4 |
| frontend/components/ui/applied-filters.tsx | 3 |
| frontend/components/ui/badge.tsx | 1 |
| frontend/components/ui/button.tsx | 1 |
| frontend/components/ui/card.tsx | 0 |
| frontend/components/ui/checkbox.tsx | 1 |
| frontend/components/ui/confirm-action.tsx | 5 |
| frontend/components/ui/date-range-input.tsx | 5 |
| frontend/components/ui/dialog.tsx | 3 |
| frontend/components/ui/expandable-tabs.tsx | 2 |
| frontend/components/ui/filter-disclosure.tsx | 2 |
| frontend/components/ui/filter-select.tsx | 2 |
| frontend/components/ui/focus-scope.tsx | 1 |
| frontend/components/ui/input.tsx | 1 |
| frontend/components/ui/label.tsx | 1 |
| frontend/components/ui/page-header.tsx | 0 |
| frontend/components/ui/page-state.tsx | 2 |
| frontend/components/ui/pagination.tsx | 10 |
| frontend/components/ui/select.tsx | 2 |
| frontend/components/ui/sheet.tsx | 6 |
| frontend/components/ui/skeleton.tsx | 1 |
| frontend/components/ui/summary-row.tsx | 1 |
| frontend/components/ui/tabs.tsx | 4 |
| frontend/components/ui/textarea.tsx | 1 |
| frontend/components/ui/tooltip.tsx | 4 |
| frontend/components/ui/typed-confirm-action.tsx | 5 |
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
| frontend/features/environments/environment-files-surface.tsx | 3 |
| frontend/features/environments/environment-manager.ts | 2 |
| frontend/features/environments/environment-operation-journal.ts | 0 |
| frontend/features/environments/environment-rename-dialog.tsx | 7 |
| frontend/features/environments/environment-vm-composition.ts | 0 |
| frontend/features/environments/environment-vm-provider.tsx | 0 |
| frontend/features/environments/environments-page.tsx | 33 |
| frontend/features/environments/files/asset-import-panel.tsx | 23 |
| frontend/features/environments/files/asset-import.ts | 0 |
| frontend/features/environments/files/file-manager.mjs | 0 |
| frontend/features/environments/files/files-panel.tsx | 34 |
| frontend/features/environments/files/knowledge-import-panel.tsx | 14 |
| frontend/features/environments/files/knowledge-import.ts | 0 |
| frontend/features/environments/files/stream-download.mjs | 2 |
| frontend/features/environments/network-lifecycle.mjs | 2 |
| frontend/features/environments/storage/checkpoint-identity.mjs | 0 |
| frontend/features/environments/storage/checkpoints.mjs | 2 |
| frontend/features/environments/storage/reconcile-checkpoints.ts | 1 |
| frontend/lib/activity-data.ts | 0 |
| frontend/lib/admin-analytics-data.ts | 0 |
| frontend/lib/admin-asset-hygiene-data.ts | 0 |
| frontend/lib/admin-asset-retry-intent.ts | 0 |
| frontend/lib/admin-assets-data.ts | 0 |
| frontend/lib/admin-audit-data.ts | 0 |
| frontend/lib/admin-batch-review-data.ts | 0 |
| frontend/lib/admin-chunk-data.ts | 0 |
| frontend/lib/admin-dashboard-data.ts | 0 |
| frontend/lib/admin-duplicate-intent.ts | 0 |
| frontend/lib/admin-duplicates-data.ts | 0 |
| frontend/lib/admin-knowledge-item-data.ts | 0 |
| frontend/lib/admin-knowledge-trash-data.ts | 0 |
| frontend/lib/admin-maintenance-data.ts | 0 |
| frontend/lib/admin-member-invitations-data.ts | 0 |
| frontend/lib/admin-member-status-intent.ts | 0 |
| frontend/lib/admin-members-data.ts | 0 |
| frontend/lib/admin-members-query.ts | 0 |
| frontend/lib/admin-menu-draft.ts | 0 |
| frontend/lib/admin-menu-write-intent.ts | 0 |
| frontend/lib/admin-menus-data.ts | 0 |
| frontend/lib/admin-operation-intent.ts | 0 |
| frontend/lib/admin-reparse-data.ts | 0 |
| frontend/lib/admin-review-data.ts | 0 |
| frontend/lib/admin-role-draft.ts | 0 |
| frontend/lib/admin-role-write-intent.ts | 0 |
| frontend/lib/admin-roles-controller.ts | 1 |
| frontend/lib/admin-roles-data.ts | 0 |
| frontend/lib/admin-space-draft.ts | 0 |
| frontend/lib/admin-space-write-intent.ts | 0 |
| frontend/lib/admin-spaces-data.ts | 0 |
| frontend/lib/admin-tags-data.ts | 0 |
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
| frontend/lib/command-search.ts | 0 |
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
| frontend/lib/hooks/use-dismiss.ts | 6 |
| frontend/lib/hooks/use-favicon.ts | 0 |
| frontend/lib/hooks/use-hover-capable.ts | 1 |
| frontend/lib/hooks/use-hover-gesture.ts | 0 |
| frontend/lib/hooks/use-modal-scope.ts | 2 |
| frontend/lib/hooks/use-on-open.ts | 0 |
| frontend/lib/hooks/use-row-cursor.ts | 0 |
| frontend/lib/hooks/use-slider.ts | 0 |
| frontend/lib/hooks/use-tap-gesture.ts | 0 |
| frontend/lib/hooks/use-touch-capable.ts | 1 |
| frontend/lib/i18n.ts | 0 |
| frontend/lib/inbox-create-intent.ts | 0 |
| frontend/lib/inbox-data.ts | 0 |
| frontend/lib/inbox-draft.ts | 0 |
| frontend/lib/knowledge-data.ts | 0 |
| frontend/lib/knowledge-derivative-draft-intent.ts | 0 |
| frontend/lib/knowledge-derivatives-data.ts | 0 |
| frontend/lib/knowledge-lifecycle-intent.ts | 0 |
| frontend/lib/knowledge-note.ts | 0 |
| frontend/lib/knowledge-panels-data.ts | 0 |
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
| frontend/lib/reader-visit-intent.ts | 0 |
| frontend/lib/responsive-contract.ts | 0 |
| frontend/lib/review-batch-plan.ts | 0 |
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
| frontend/lib/submission-comments-data.ts | 0 |
| frontend/lib/submission-data.ts | 0 |
| frontend/lib/submission-draft-data.ts | 0 |
| frontend/lib/submission-intent.ts | 0 |
| frontend/lib/submission-resubmit-data.ts | 0 |
| frontend/lib/submission-targets-data.ts | 0 |
| frontend/lib/system-share.ts | 0 |
| frontend/lib/tabs-keyboard.ts | 0 |
| frontend/lib/task-editor-draft.ts | 0 |
| frontend/lib/task-write-intent.ts | 0 |
| frontend/lib/tasks-data.ts | 0 |
| frontend/lib/text-shimmer.ts | 0 |
| frontend/lib/theme.ts | 0 |
| frontend/lib/timeline-create-intent.ts | 0 |
| frontend/lib/timeline-draft.ts | 0 |
| frontend/lib/today-clock.ts | 0 |
| frontend/lib/today-data.ts | 0 |
| frontend/lib/touch.ts | 0 |
| frontend/lib/use-create-draft.tsx | 3 |
| frontend/lib/use-knowledge-derivatives.ts | 0 |
| frontend/lib/use-notification-summary.ts | 2 |
| frontend/lib/use-reader-note-shares.tsx | 1 |
| frontend/lib/use-reader-note.tsx | 0 |
| frontend/lib/use-saved-views.tsx | 1 |
| frontend/lib/use-submission-draft.ts | 2 |
| frontend/lib/use-toast.tsx | 1 |
| frontend/lib/utils.ts | 0 |
| frontend/lib/workbench-data.ts | 0 |
| frontend/lib/workbench-review-data.ts | 0 |
| frontend/lib/workspace-browser-history.ts | 3 |
| frontend/lib/workspace-history-traversal.ts | 0 |
| frontend/lib/workspace-location.ts | 2 |
| frontend/lib/workspace-navigation-gate.ts | 0 |
| frontend/main.tsx | 0 |
| frontend/pages/admin/admin-dashboard-page.tsx | 12 |
| frontend/pages/admin/admin-dashboard-route.tsx | 1 |
| frontend/pages/admin/admin-forbidden-page.tsx | 1 |
| frontend/pages/admin/analytics-page.tsx | 11 |
| frontend/pages/admin/asset-queue-page.tsx | 13 |
| frontend/pages/admin/audit-page.tsx | 6 |
| frontend/pages/admin/create-role-page.tsx | 17 |
| frontend/pages/admin/duplicate-queue-page.tsx | 8 |
| frontend/pages/admin/knowledge-item-page.tsx | 11 |
| frontend/pages/admin/knowledge-item-route.tsx | 2 |
| frontend/pages/admin/members-page.tsx | 25 |
| frontend/pages/admin/menu-editor.tsx | 11 |
| frontend/pages/admin/menus-page.tsx | 16 |
| frontend/pages/admin/recycle-bin-page.tsx | 14 |
| frontend/pages/admin/recycle-bin-route.tsx | 1 |
| frontend/pages/admin/review-detail-page.tsx | 7 |
| frontend/pages/admin/review-detail-route.tsx | 2 |
| frontend/pages/admin/review-queue-page.tsx | 11 |
| frontend/pages/admin/role-detail-page.tsx | 21 |
| frontend/pages/admin/role-permission-groups.ts | 0 |
| frontend/pages/admin/roles-page.tsx | 3 |
| frontend/pages/admin/spaces-page.tsx | 47 |
| frontend/pages/agent-page.tsx | 11 |
| frontend/pages/boards/board-model.ts | 0 |
| frontend/pages/boards/boards-page.tsx | 11 |
| frontend/pages/calendar-page.tsx | 10 |
| frontend/pages/coming-soon-page.tsx | 0 |
| frontend/pages/focus-page.tsx | 16 |
| frontend/pages/goals-page.tsx | 9 |
| frontend/pages/graph-page.tsx | 33 |
| frontend/pages/home-page.tsx | 18 |
| frontend/pages/inbox-page.tsx | 14 |
| frontend/pages/knowledge-page.tsx | 39 |
| frontend/pages/knowledge-reader-page.tsx | 53 |
| frontend/pages/login-page.tsx | 7 |
| frontend/pages/messages/discussion-model.ts | 0 |
| frontend/pages/messages/messages-page.tsx | 6 |
| frontend/pages/messages/thread-page.tsx | 20 |
| frontend/pages/my-submissions-page.tsx | 12 |
| frontend/pages/notifications/notification-model.ts | 0 |
| frontend/pages/notifications/notifications-page.tsx | 14 |
| frontend/pages/project-timeline-page.tsx | 9 |
| frontend/pages/projects-page.tsx | 10 |
| frontend/pages/search-page.tsx | 30 |
| frontend/pages/settings-page.tsx | 8 |
| frontend/pages/submit-page.tsx | 18 |
| frontend/pages/tasks/task-editor.tsx | 50 |
| frontend/pages/tasks/task-types.ts | 0 |
| frontend/pages/tasks/tasks-model.ts | 0 |
| frontend/pages/tasks/tasks-page.tsx | 20 |
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
| frontend/pages/workbench-review-page.tsx | 13 |
| frontend/public/sw.js | 3 |
| frontend/public/theme-boot.js | 0 |
| frontend/styles/token-contract.ts | 0 |

## 路由与共享入口候选映射

以下来自现有成熟度清单的明确 root symbol，再按本地符号引用及相对 import 传递展开；不是把 app.tsx 的所有按钮归给每条路由。候选可过度近似（如局部变量同名）；跨模块动态渲染、默认/re-export 等未解析符号单独列出，不能声称无遗漏。JSON 保存每个入口对应的精确候选 ID。

| 路由/入口 | root symbol | 候选数 | 未解析符号 |
| --- | --- | ---: | --- |
| /graph | frontend/pages/graph-page.tsx#GraphRoute; frontend/pages/graph-page.tsx#GraphPage | 91 | frontend/components/motion/combobox.tsx#Combobox; frontend/components/motion/combobox.tsx#ComboboxContent; frontend/components/motion/combobox.tsx#ComboboxItem; frontend/components/motion/combobox.tsx#ComboboxList; frontend/components/motion/combobox.tsx#ComboboxTrigger; frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /projects/:id/timeline | frontend/app.tsx#ProjectTimelineRoute | 146 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /inbox | frontend/app.tsx#InboxRoute | 203 | frontend/components/motion/combobox.tsx#Combobox; frontend/components/motion/combobox.tsx#ComboboxContent; frontend/components/motion/combobox.tsx#ComboboxItem; frontend/components/motion/combobox.tsx#ComboboxList; frontend/components/motion/combobox.tsx#ComboboxTrigger; frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /goals | frontend/app.tsx#GoalsRoute | 142 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /projects | frontend/app.tsx#ProjectsRoute | 140 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /calendar | frontend/app.tsx#CalendarRoute | 144 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /today | frontend/app.tsx#TodayRoute | 45 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /focus | frontend/app.tsx#FocusRoute | 125 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /review | frontend/app.tsx#WorkbenchReviewRoute | 54 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| / | frontend/app.tsx#HomeRoute | 35 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /submit | frontend/app.tsx#SubmitRoute | 120 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /knowledge | frontend/app.tsx#KnowledgeRoute | 123 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /search | frontend/app.tsx#SearchRoute; frontend/lib/search-data.ts#* | 170 | frontend/components/motion/combobox.tsx#Combobox; frontend/components/motion/combobox.tsx#ComboboxContent; frontend/components/motion/combobox.tsx#ComboboxItem; frontend/components/motion/combobox.tsx#ComboboxList; frontend/components/motion/combobox.tsx#ComboboxTrigger; frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /agent | frontend/app.tsx#AgentRoute; frontend/app.tsx#AgentConversationRoute; frontend/lib/agent-data.ts#*; frontend/lib/agent-turn-intent.ts#*; frontend/components/agent/agent-feedback.tsx#AgentFeedback; frontend/components/agent/agent-history-list.tsx#AgentHistoryList | 136 | frontend/components/agents/message.tsx#MessageBubble; frontend/components/agents/message.tsx#MessageBubbleContent; frontend/components/agents/message.tsx#MessageScroller; frontend/components/motion/button/index.tsx#Button; frontend/components/motion/button/index.tsx#StatefulButton; frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /my-submissions | frontend/app.tsx#MySubmissionsRoute | 116 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /tasks | frontend/app.tsx#TasksRoute; frontend/lib/tasks-data.ts#*; frontend/pages/tasks/task-editor.tsx#TaskEditor | 164 | frontend/components/motion/combobox.tsx#Combobox; frontend/components/motion/combobox.tsx#ComboboxContent; frontend/components/motion/combobox.tsx#ComboboxItem; frontend/components/motion/combobox.tsx#ComboboxList; frontend/components/motion/combobox.tsx#ComboboxTrigger; frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /boards | frontend/app.tsx#BoardsRoute | 92 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /environments | frontend/features/environments/environments-page.tsx#EnvironmentsPage; frontend/features/environments/environment-manager.ts#getEnvironmentManager | 133 | frontend/components/motion/combobox.tsx#Combobox; frontend/components/motion/combobox.tsx#ComboboxContent; frontend/components/motion/combobox.tsx#ComboboxItem; frontend/components/motion/combobox.tsx#ComboboxList; frontend/components/motion/combobox.tsx#ComboboxTrigger |
| /settings | frontend/pages/settings-page.tsx#SettingsPage | 13 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardDescription; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /admin | frontend/pages/admin/admin-dashboard-route.tsx#AdminDashboardRoute | 42 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /admin/submissions | frontend/app.tsx#ReviewQueueRoute | 142 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /admin/duplicates | frontend/app.tsx#AdminDuplicateRoute; frontend/lib/admin-duplicates-data.ts#* | 106 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /admin/assets | frontend/app.tsx#AdminAssetsRoute; frontend/lib/admin-assets-data.ts#* | 134 | frontend/components/motion/combobox.tsx#Combobox; frontend/components/motion/combobox.tsx#ComboboxContent; frontend/components/motion/combobox.tsx#ComboboxItem; frontend/components/motion/combobox.tsx#ComboboxList; frontend/components/motion/combobox.tsx#ComboboxTrigger; frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /admin/members | frontend/app.tsx#AdminMembersRoute; frontend/lib/admin-members-data.ts#* | 141 | frontend/components/motion/combobox.tsx#Combobox; frontend/components/motion/combobox.tsx#ComboboxContent; frontend/components/motion/combobox.tsx#ComboboxItem; frontend/components/motion/combobox.tsx#ComboboxList; frontend/components/motion/combobox.tsx#ComboboxTrigger; frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /admin/roles | frontend/app.tsx#AdminRolesRoute; frontend/lib/admin-roles-data.ts#* | 77 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /admin/menus | frontend/app.tsx#AdminMenusRoute; frontend/lib/admin-menus-data.ts#* | 86 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /admin/spaces | frontend/app.tsx#AdminSpacesRoute; frontend/lib/admin-spaces-data.ts#* | 104 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /admin/audit | frontend/app.tsx#AdminAuditRoute | 83 | frontend/components/motion/combobox.tsx#Combobox; frontend/components/motion/combobox.tsx#ComboboxContent; frontend/components/motion/combobox.tsx#ComboboxItem; frontend/components/motion/combobox.tsx#ComboboxList; frontend/components/motion/combobox.tsx#ComboboxTrigger; frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /admin/analytics | frontend/app.tsx#AdminAnalyticsRoute | 83 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /notifications | frontend/app.tsx#NotificationsRoute; frontend/lib/notifications-data.ts#* | 88 | frontend/components/motion/combobox.tsx#Combobox; frontend/components/motion/combobox.tsx#ComboboxContent; frontend/components/motion/combobox.tsx#ComboboxItem; frontend/components/motion/combobox.tsx#ComboboxList; frontend/components/motion/combobox.tsx#ComboboxTrigger; frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /messages | frontend/app.tsx#MessagesRoute | 37 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /knowledge/:id | frontend/app.tsx#KnowledgeReaderRoute; frontend/app.tsx#KnowledgeReaderSession; frontend/lib/graph-evidence.ts#loadGraphCitation; frontend/lib/knowledge-reader-data.ts#* | 181 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardAction; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /messages/:id | frontend/app.tsx#DiscussionThreadRoute | 71 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /admin/submissions/:id | frontend/pages/admin/review-detail-route.tsx#ReviewDetailRoute | 106 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /admin/roles/new | frontend/app.tsx#AdminRoleNewRoute; frontend/pages/admin/create-role-page.tsx#AdminRoleCreatePage | 49 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /admin/roles/:id | frontend/app.tsx#AdminRoleDetailRoute; frontend/pages/admin/role-detail-page.tsx#AdminRoleDetailPage | 70 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| /admin/knowledge/trash | frontend/pages/admin/recycle-bin-route.tsx#RecycleBinRoute | 86 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /admin/knowledge/trash | frontend/pages/admin/recycle-bin-route.tsx#RecycleBinRoute | 86 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent |
| /admin/knowledge/:id | frontend/pages/admin/knowledge-item-route.tsx#AdminKnowledgeItemRoute | 35 | frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |
| &lt;authenticated-shell&gt; | frontend/components/shell/app-shell.tsx#AppShell | 184 | 无（不代表动态边界已核对） |
| &lt;anonymous-home&gt; | frontend/pages/workbench-landing/public-workbench-page.tsx#PublicWorkbenchPage | 61 | frontend/components/ui/card.tsx#Card |
| &lt;login&gt; | frontend/pages/login-page.tsx#LoginPage | 13 | frontend/components/ui/button.tsx#StatefulButton; frontend/components/ui/card.tsx#Card; frontend/components/ui/card.tsx#CardContent; frontend/components/ui/card.tsx#CardDescription; frontend/components/ui/card.tsx#CardHeader; frontend/components/ui/card.tsx#CardTitle |

尚未归入上述入口的候选：181。这些可能是 App 全局守卫、未接线组件或静态图盲区，必须核对，不能删掉以提高覆盖率。

## frontend/app.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 236:106 App | AppShell page | onNavigate=navigate; onLogout=() =&gt; logout(owner) | earlier return: sessionError; earlier return: anonymous && pathname === "/"; earlier return: anonymous; earlier return: !session |
| 263:39 renderPage | SettingsPage  |  | {"kind":"branch","expression":"session","branch":"true"} |
| 362:10 HomeRoute | HomePage  | onLoadMoreRecent=loadMoreRecent; onRetry=() =&gt; { if (pending.current) return; pending.current = true; setState({ kind: "loading" }); setRetry(value =&gt; … |  |
| 435:10 AdminAnalyticsRoute | AdminAnalyticsPage  | onDaysChange=changeDays; onLoadMore=() =&gt; { if (state.kind === "ready" && state.data.recentVisitors.pagination.page &lt; state.data.recentVisitors.paginat… |  |
| 471:10 AdminRolesRoute | AdminRolesPage  | onLoadRetry=controller.retryRead |  |
| 477:10 AdminRoleNewRoute | AdminRoleCreatePage  | onCreate=controller.createRole; onCreated=back; onCancel=back; onDiscardRecord=controller.discardRecord; onRetryWrite=controller.retryWrite; onLoadRetry=cont… |  |
| 486:10 AdminRoleDetailRoute | AdminRoleDetailPage  | onBack=() =&gt; writeWorkspaceHistory("push", "/admin/roles"); onLoadRetry=controller.retryRead; onSave=controller.recordBlocked ? undefined : (role, allowBi… |  |
| 521:5 AdminMenusRoute | owner.addEventListener  | "beforeunload", warn |  |
| 613:10 AdminMenusRoute | AdminMenusPage  | onLoadRetry=retryRead; onDiscardRecord=discardRecord; onCreate=recordBlocked ? undefined : (input) =&gt; mutate({ op: "create", input }, () =&gt; createAdmin… |  |
| 668:5 KnowledgeReaderSession | owner.addEventListener  | "beforeunload", warn |  |
| 802:5 KnowledgeReaderSession | window.addEventListener  | "storage", onStorage |  |
| 830:14 KnowledgeReaderSession | KnowledgeReaderPage  | onRetry=() =&gt; setRetry((value) =&gt; value + 1) | {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"} |
| 889:10 KnowledgeReaderSession | KnowledgeReaderPage  | onCompare=showDiff; onRetryRelated=retryRelated; onRetryBacklinks=retryBacklinks; onCheckFavorite=checkFavorite; onToggleFavorite=toggleFavorite | earlier return: state.kind !== "ready" |
| 897:10 KnowledgeRoute | MemberKnowledgeRoute  |  | spread: props |
| 1078:10 MemberKnowledgeRoute | KnowledgePage  | onFilterChange=(next) =&gt; writeWorkspaceHistory("push", &#96;/knowledge${writeKnowledgeFilters(readWorkspaceLocation().search, next)}&#96;); onRetry=() =&g… |  |
| 1143:5 MemberSearchRoute | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 1229:10 MemberSearchRoute | SearchPage  | onFilterChange=(next) =&gt; { const nextSearch = writeSearchFilters(readWorkspaceLocation().search, next); writeWorkspaceHistory("push", &#96;/search${nextSe… |  |
| 1235:88 AgentRoute | a frontendText(locale, "AGENT_NEW_CONVERSATION") | href="/agent" |  |
| 1302:5 AgentConversationRoute | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 1416:183 AgentConversationRoute | Button frontendText(locale, "AGENT_INTENT_ABANDON") | onClick=abandon | {"kind":"branch","expression":"storageBlocked","branch":"true"} |
| 1417:558 AgentConversationRoute | Button frontendText(locale, "AGENT_INTENT_RETRY") | onClick=() =&gt; submit(intentRef.current!.question) | {"kind":"branch","expression":"unconfirmed && intentRef.current","branch":"true"}; earlier return: storageBlocked |
| 1417:671 AgentConversationRoute | Button frontendText(locale, "AGENT_INTENT_ABANDON") | onClick=abandon | {"kind":"branch","expression":"unconfirmed && intentRef.current","branch":"true"}; earlier return: storageBlocked |
| 1419:181 AgentConversationRoute | Button frontendText(locale, "AGENT_RETRY") | onClick=() =&gt; setRecoveryVersion((value) =&gt; value + 1) | {"kind":"branch","expression":"recovery === \"error\"","branch":"true"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; ea… |
| 1419:292 AgentConversationRoute | a frontendText(locale, "AGENT_NEW_CONVERSATION") | href="/agent" | {"kind":"branch","expression":"recovery === \"error\"","branch":"true"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; ea… |
| 1422:27 AgentConversationRoute | div  |  | {"kind":"logical","expression":"composerBlocked","operator":"&&"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; earlier … |
| 1422:187 AgentConversationRoute | Button frontendText(locale, "AGENT_COMPOSER_RECORD_DISCARD") | onClick=discardComposer; type="button" | {"kind":"logical","expression":"composerBlocked","operator":"&&"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; earlier … |
| 1423:26 AgentConversationRoute | p composerNotice |  | {"kind":"logical","expression":"composerNotice","operator":"&&"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; earlier r… |
| 1424:33 AgentConversationRoute | div  |  | {"kind":"logical","expression":"feedbackRecordBlocked","operator":"&&"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; ea… |
| 1424:200 AgentConversationRoute | Button frontendText(locale, "AGENT_FEEDBACK_RECORD_DISCARD") | onClick=discardFeedback; type="button" | {"kind":"logical","expression":"feedbackRecordBlocked","operator":"&&"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; ea… |
| 1425:83 AgentConversationRoute | div  |  | {"kind":"logical","expression":"feedbackIntent && visibleConversation !== feedbackIntent.conversationId","operator":"&&"}; earlier return: storageBlocked; ea… |
| 1425:250 AgentConversationRoute | Button frontendText(locale, "AGENT_FEEDBACK_RETRY") | onClick=retryFeedback; type="button" | {"kind":"logical","expression":"feedbackIntent && visibleConversation !== feedbackIntent.conversationId","operator":"&&"}; earlier return: storageBlocked; ea… |
| 1427:37 AgentConversationRoute | a frontendText(locale, "AGENT_RESTORE_LINK") | href=&#96;/agent?conversationId=${encodeURIComponent(conversationIdRef.current)}&#96; | {"kind":"logical","expression":"conversationIdRef.current","operator":"&&"}; earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current… |
| 1428:7 AgentConversationRoute | AgentPage  | onQuestionChange=value =&gt; questionDraft.edit("question", value); onSubmit=() =&gt; submit(); onCancel=cancel; onRetry=() =&gt; submit(lastQuestion); onSta… | earlier return: storageBlocked; earlier return: unconfirmed && intentRef.current; earlier return: recovery === "loading" && state.kind !== "loading"; earlier… |
| 1665:41 MemberSubmitForm | SubmitPage  | onDraftChange=changeDraft; onSubmit=() =&gt; submit(draftRef.current); onDraftRetry=() =&gt; { if (draftWrites.state.reason === "unknown" &#124;&#124; draftW… | spread: (resubmitView ? { resubmit: resubmitView, onResubmitRestart: restartResubmit, onResubmitLeave: leaveResubmit, onResubmitStatusRetry: () =&gt; { if (r… |
| 1745:10 MySubmissionsRoute | MySubmissionsPage  | onResubmit=memberId ? startResubmit : undefined; onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1); onPageChange=(next) =&gt; load(next); onPageSizeC… |  |
| 1796:5 TasksRoute | owner.addEventListener  | "beforeunload", warn |  |
| 1953:27 TasksRoute | Button frontendText(locale, "TASKS_WRITE_RECORD_DISCARD") | onClick=discardRecord | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 1957:7 TasksRoute | Button frontendText(locale, "TASKS_CHECK_WRITE") | onClick=() =&gt; void resolveListUnknown("check") | disabled=listRecovering; {"kind":"logical","expression":"listUnknown","operator":"&&"} |
| 1958:7 TasksRoute | Button frontendText(locale, "TASKS_RETRY_WRITE") | onClick=() =&gt; void resolveListUnknown("retry") | disabled=listRecovering; {"kind":"logical","expression":"listUnknown","operator":"&&"} |
| 1960:29 TasksRoute | p actionNotice |  | {"kind":"logical","expression":"actionNotice","operator":"&&"} |
| 1960:90 TasksRoute | TasksPage  | onCreate=() =&gt; setEditor({ taskId: null }); onOpen=(taskId) =&gt; setEditor({ taskId }); onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1); onFilt… |  |
| 1960:1381 TasksRoute | TaskEditor  | onClose=() =&gt; setEditor(null); onChanged=() =&gt; setRetryVersion((value) =&gt; value + 1); onDenied=clearDeniedTasks | {"kind":"logical","expression":"editor","operator":"&&"}; spread: (editor.restored ? { restored: editor.restored } : {}) |
| 1986:5 InboxRoute | owner.addEventListener  | "beforeunload", warn | earlier return: !taskTarget?.restored &#124;&#124; taskAccessReady |
| 2104:27 InboxRoute | Button frontendText(locale, "TASKS_WRITE_RECORD_DISCARD") | onClick=() =&gt; { if (memberId && discardBlockedTaskWrite(memberId)) setTaskRecordBlocked(false); } | {"kind":"logical","expression":"taskRecordBlocked","operator":"&&"} |
| 2107:27 InboxRoute | Button frontendText(locale, "NAV_TASKS") | onClick=() =&gt; writeWorkspaceHistory("push", "/tasks") | {"kind":"logical","expression":"taskCreatePending && taskAccessReady","operator":"&&"} |
| 2108:12 InboxRoute | PlanningWriteRecovery  | onDenied=clearDenied; onReadFailure=clearReadFailure |  |
| 2108:198 InboxRoute | InboxPage  | onRetry=() =&gt; setRetryVersion(value =&gt; value + 1); onCreateLock=locked =&gt; { captureLockedRef.current = locked; setCaptureLocked(locked); }; onCreate… |  |
| 2142:73 InboxRoute | TaskEditor  | onClose=() =&gt; setTaskTarget(null); onChanged=() =&gt; setRetryVersion(value =&gt; value + 1); onDenied=error =&gt; { if (clearDenied(error)) setTaskTarget… | {"kind":"logical","expression":"taskTarget && taskAccessReady","operator":"&&"}; spread: (taskTarget.restored ? { restored: taskTarget.restored } : {}) |
| 2256:12 GoalsRoute | PlanningWriteRecovery  | onDenied=clearDeniedGoals |  |
| 2256:160 GoalsRoute | GoalsPage  | onManageTasks=(goal) =&gt; { if (pendingRef.current &#124;&#124; createLockedRef.current &#124;&#124; writeRecovery.locked &#124;&#124; relationGoalRef.curre… |  |
| 2269:22 GoalsRoute | GoalTasksEditor  | onDenied=clearDeniedGoals; onReadFailure=relationReadFailed; onClose=() =&gt; void closeRelations(); onBeginWrite=writeRecovery.begin; onFinishWrite=writeRec… | {"kind":"logical","expression":"relationGoal","operator":"&&"} |
| 2423:12 ProjectsRoute | PlanningWriteRecovery  | onDenied=clearDeniedProjects |  |
| 2423:166 ProjectsRoute | ProjectsPage  | onManageRelations=openRelations; onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1); onRetrySummary=(project) =&gt; void retrySummary(project); onCrea… |  |
| 2425:40 ProjectsRoute | ProjectRelationsEditor  | onSummary=updateRelationSummary; onDenied=clearDeniedProjects; onClose=closeRelations; onBeginWrite=writeRecovery.begin; onFinishWrite=writeRecovery.finish | {"kind":"logical","expression":"relationProject","operator":"&&"} |
| 2549:12 ProjectTimelineRoute | PlanningWriteRecovery  | onDenied=clearDenied |  |
| 2549:165 ProjectTimelineRoute | ProjectTimelinePage  | onRetry=() =&gt; setRetryVersion(value =&gt; value + 1); onBack=() =&gt; writeWorkspaceHistory("push", "/projects"); onCreate=async input =&gt; { if (pending… |  |
| 2658:12 CalendarRoute | PlanningWriteRecovery  | onDenied=clearDenied; onReadFailure=clearReadFailure |  |
| 2658:198 CalendarRoute | CalendarPage  | onRangeChange=changeRange; onPageChange=(next) =&gt; void load(next); onPageSizeChange=(size) =&gt; setPageSize(size); onLoadMore=() =&gt; { if (state.kind =… |  |
| 2700:51 TodayRoute | TodayPage  | onOpen=setTarget; onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1) |  |
| 2700:184 TodayRoute | TodayTargetDetail  | onClose=() =&gt; setTarget(null); onDenied=clearDenied | {"kind":"logical","expression":"target","operator":"&&"} |
| 2725:5 FocusRoute | owner.addEventListener  | "beforeunload", warn |  |
| 2876:5 FocusRoute | p frontendText(locale, transitionRecovery.kind === "blocked" ? "FOCUS_STORAGE_BLOCKED" : "FOCUS_TRANSITION_UNCERTAIN") |  | {"kind":"branch","expression":"transitionRecovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"} |
| 2877:5 FocusRoute | Button frontendText(locale, "FOCUS_RETRY") | onClick=() =&gt; setRetryVersion(value =&gt; value + 1) | disabled=pending; {"kind":"branch","expression":"transitionRecovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"} |
| 2878:81 FocusRoute | Button frontendText(locale, "FOCUS_RETRY_TRANSITION") | onClick=() =&gt; void mutate(epoch =&gt; sendTransition(epoch, transitionRecovery.intent, true)) | disabled=pending; {"kind":"branch","expression":"transitionRecovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"}; {"kind":"logical","expr… |
| 2882:5 FocusRoute | p frontendText(locale, recovery.kind === "blocked" ? "FOCUS_STORAGE_BLOCKED" : "FOCUS_START_UNCERTAIN") |  | {"kind":"branch","expression":"recovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"}; earlier return: transitionRecovery.kind !== "empty"… |
| 2883:5 FocusRoute | Button frontendText(locale, "FOCUS_RETRY") | onClick=() =&gt; setRetryVersion(value =&gt; value + 1) | disabled=pending; {"kind":"branch","expression":"recovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"}; earlier return: transitionRecover… |
| 2884:61 FocusRoute | Button frontendText(locale, "FOCUS_RETRY_START") | onClick=() =&gt; void mutate(epoch =&gt; sendStart(epoch, recovery.intent, recovery.intent), true) | disabled=pending; {"kind":"branch","expression":"recovery.kind !== \"empty\" && state.kind === \"ready\"","branch":"true"}; {"kind":"logical","expression":"r… |
| 2886:10 FocusRoute | FocusPage  | onDenied=clearDenied; onRetry=() =&gt; setRetryVersion(value =&gt; value + 1); onStart=input =&gt; void mutate(epoch =&gt; sendStart(epoch, input)); onTransi… | earlier return: transitionRecovery.kind !== "empty" && state.kind === "ready"; earlier return: recovery.kind !== "empty" && state.kind === "ready" |
| 2928:51 WorkbenchReviewRoute | WorkbenchReviewPage  | onOpen=setTarget; onPeriodChange=changePeriod; onRetry=() =&gt; { setState({ kind: "loading" }); setRetryVersion((value) =&gt; value + 1); }; onDiscardPeriod… |  |
| 2928:366 WorkbenchReviewRoute | SnapshotTargetDetail  | onClose=() =&gt; setTarget(null); onDenied=clearDenied | {"kind":"logical","expression":"target","operator":"&&"} |
| 3057:5 NotificationsRoute | window.addEventListener  | "beforeunload", warn |  |
| 3118:10 NotificationsRoute | NotificationsPage  | onRetry=() =&gt; { setRevokedTarget(false); invalidateSnapshot({ kind: "loading" }); setRetryVersion((value) =&gt; value + 1); }; onFilterChange=(next: Notif… |  |
| 3218:10 MessagesRoute | MessagesPage  | onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1); onNext=(cursor) =&gt; navigate({ page: query.page + 1, limit: query.limit, cursor }); onPrevious=(… |  |
| 3319:10 MemberDiscussionThreadRoute | ThreadPage  | onRetry=() =&gt; setRetryVersion((value) =&gt; value + 1); onRefresh=() =&gt; setRetryVersion((value) =&gt; value + 1); onNext=(cursor) =&gt; navigate({ page… |  |
| 3404:5 BoardsRoute | owner.addEventListener  | "beforeunload", warn |  |
| 3556:10 BoardsRoute | BoardsPage  | onDiscardRecord=() =&gt; { if (!memberId &#124;&#124; !discardBlockedBoardMove(memberId)) { setActionError(frontendText(locale, "BOARDS_MOVE_RECORD_STUCK"));… |  |
| 3733:94 ReviewQueueRoute | ReviewQueueSession  |  | spread: props |
| 3761:5 ReviewQueueSession | owner.addEventListener  | "beforeunload", warn |  |
| 3890:10 ReviewQueueSession | ReviewQueuePage  | onOpenDetail=(id) =&gt; writeWorkspaceHistory("push", &#96;/admin/submissions/${encodeURIComponent(id)}&#96;); onDiscardDecisionRecord=discardRecord; onRetry… |  |
| 3933:5 AdminDuplicateRoute | owner.addEventListener  | "beforeunload", warn |  |
| 4041:10 AdminDuplicateRoute | DuplicateQueuePage  | onLoadRetry=retryRead; onDiscardDecisionRecord=discardRecord; onDecision=recordBlocked ? undefined : (id, decision) =&gt; void decide(id, decision); onPageCh… |  |
| 4085:5 AdminMembersRoute | owner.addEventListener  | "beforeunload", warn |  |
| 4306:10 AdminMembersRoute | MembersPage  | onLoadRetry=retryRead; onTabChange=changeTab; onDiscardStatusRecord=discardRecord; onPageChange=(next) =&gt; { const controller = controllerRef.current; if (… |  |
| 4332:5 AdminSpacesRoute | owner.addEventListener  | "beforeunload", warn |  |
| 4440:10 AdminSpacesRoute | SpacesPage  | onLoadRetry=() =&gt; void read(); onLoadMore=() =&gt; void read("spaces"); onLoadCollections=id =&gt; void read("collections", id); onDiscardRecord=discardRe… |  |
| 4508:10 AdminAuditRoute | AuditPage  | onRetry=retry; onActionChange=changeFilter; onPageChange=(next) =&gt; load(next); onPageSizeChange=(size) =&gt; setPageSize(size); onLoadMore=() =&gt; { if (… |  |
| 4551:7 AdminAssetsRoute | owner.addEventListener  | "beforeunload", warn | {"kind":"branch","expression":"locked && !leaveGuardRef.current","branch":"true"} |
| 4699:10 AdminAssetsRoute | AssetQueuePage  | onLoadRetry=retryRead; onDiscardRecord=discardRecord; onRetry=recordBlocked ? undefined : (id) =&gt; void retry(id); onPreview=(id) =&gt; void showPreview(id… |  |

## frontend/components/admin/maintenance-status-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 92:36 MaintenanceStatusPanel | div  |  | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"} |
| 97:15 MaintenanceStatusPanel | a frontendText(locale, "ADMIN_MAINTENANCE_RUNBOOK_LINK") | href=MAINTENANCE_ACTIVATION_RUNBOOK | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"}; {"ki… |
| 99:15 MaintenanceStatusPanel | Button frontendText(locale, "COMMON_RETRY") | onClick=read; type="button" | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"true"}; {"ki… |
| 102:49 MaintenanceStatusPanel | div  |  | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"false"}; {"k… |
| 106:48 MaintenanceStatusPanel | div  |  | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"false"}; {"k… |
| 121:38 MaintenanceStatusPanel | p state.capacityError |  | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind !== \"ready\"","branch":"false"}; {"k… |

## frontend/components/admin/tag-admin-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 97:36 TagAdminPanel | div  |  | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"} |
| 99:11 TagAdminPanel | Button frontendText(locale, "COMMON_RETRY") | onClick=() =&gt; { const controller = new AbortController(); read.current = controller; load(controller.signal); }; type="button" | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"} |
| 111:63 TagAdminPanel | Button frontendText(locale, "ADMIN_TAG_LOAD_MORE") | onClick=loadMore; type="button" | {"kind":"logical","expression":"state.kind === \"ready\" && state.nextCursor !== null","operator":"&&"} |
| 119:13 TagAdminPanel | input  | onChange=(event) =&gt; setSlug(event.target.value) | disabled=pending |
| 122:13 TagAdminPanel | input  | onChange=(event) =&gt; setName(event.target.value) | disabled=pending |
| 125:9 TagAdminPanel | Button frontendText(locale, "ADMIN_TAG_CREATE") | onClick=() =&gt; void submit(); type="button" | disabled=pending &#124;&#124; !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) &#124;&#124; name.trim().length === 0 |
| 133:9 TagAdminPanel | p notice |  | {"kind":"logical","expression":"notice","operator":"&&"} |
| 135:9 TagAdminPanel | Button frontendText(locale, "ADMIN_TAG_RELOAD") | onClick=reload; type="button" | {"kind":"logical","expression":"notice","operator":"&&"} |

## frontend/components/agent/agent-feedback.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 57:5 AgentFeedback | FeedbackWidget  | onSubmit=({ rating }) =&gt; send(rating as AgentFeedbackRating &#124; undefined) | disabled=recordBlocked &#124;&#124; completed |
| 78:28 AgentFeedback | p notice |  | {"kind":"branch","expression":"notice","branch":"true"} |

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

## frontend/components/agent/agent-transcript.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 26:98 AgentTranscript | a citation.title ?? citation.id | href=citation.href | {"kind":"repeat","expression":"messages"}; {"kind":"logical","expression":"message.citations.length &gt; 0","operator":"&&"}; {"kind":"repeat","expression":"… |

## frontend/components/agents/agent-activity/activity-row.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 105:5 SearchResultRow | a content | href=result.url | {"kind":"branch","expression":"result.url","branch":"true"} |

## frontend/components/agents/agent-activity/index.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 203:9 AgentActivity | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"working"}}; {"kind":"branch","expression":"working","branch":"true"} |
| 213:9 AgentActivity | button  | onClick=toggle; type="button" | aria-expanded=expanded; {"kind":"container","tag":"div","attributes":{"aria-busy":"working"}}; {"kind":"branch","expression":"working","branch":"false"} |
| 237:7 AgentActivity | AgentDisclosure  |  | open=expanded; {"kind":"container","tag":"div","attributes":{"aria-busy":"working"}} |
| 252:11 AgentActivity | motion.div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"working"}}; {"kind":"container","tag":"AgentDisclosure","attributes":{"open":"expanded"}} |
| 262:17 AgentActivity | motion.div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"working"}}; {"kind":"container","tag":"AgentDisclosure","attributes":{"open":"expanded"}}; {"kind"… |

## frontend/components/agents/agent-disclosure.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 26:5 AgentDisclosure | motion.div  |  | aria-hidden=!open; spread: props |

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

## frontend/components/agents/loading-states/reasoning-text.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 191:7 ReasoningText | span  |  |  |
| 216:13 ReasoningText | CascadePhrase  |  | {"kind":"container","tag":"span","attributes":{"aria-hidden":"\"true\""}}; {"kind":"branch","expression":"variant === \"cascade\"","branch":"true"}; spread: … |
| 218:13 ReasoningText | ScramblePhrase  |  | {"kind":"container","tag":"span","attributes":{"aria-hidden":"\"true\""}}; {"kind":"branch","expression":"variant === \"cascade\"","branch":"false"}; {"kind"… |
| 220:13 ReasoningText | SwapPhrase  |  | {"kind":"container","tag":"span","attributes":{"aria-hidden":"\"true\""}}; {"kind":"branch","expression":"variant === \"cascade\"","branch":"false"}; {"kind"… |

## frontend/components/agents/message-bubble.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 127:7 MessageBubble | motion.div children |  | spread: props |
| 264:5 MessageBubbleContent | div composedChildren |  | earlier return: render; spread: props |
| 281:5 MessageBubbleGroup | div  |  | spread: props |
| 330:5 MessageBubbleCollapsible | div  |  | spread: props |
| 348:7 MessageBubbleCollapsible | button  | onClick=() =&gt; setOpen(!currentOpen); type="button" | aria-expanded=currentOpen |

## frontend/components/agents/message-scroller.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 410:5 MessageScroller | section  | onScroll=(event) =&gt; { handleScroll(); onViewportScroll?.(event); }; onWheel=(event) =&gt; { leaveLiveEdge(); onViewportWheel?.(event); }; onTouchStart=(ev… | spread: restViewportProps |
| 441:7 MessageScroller | div children |  | aria-busy=busy; spread: contentProps |
| 456:5 MessageScroller | div  |  | spread: props |
| 462:9 MessageScroller | PreviewRail viewport | onItemSelect=scrollToRailItem | {"kind":"branch","expression":"navigation === \"rail\"","branch":"true"} |

## frontend/components/agents/message.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 86:9 Message | motion.article children |  | spread: props |
| 144:5 MessageGroup | div  |  | spread: props |
| 163:5 MessageAvatar | div children |  | aria-hidden=placeholder &#124;&#124; undefined; spread: props |
| 182:5 MessageContent | div  |  | spread: props |
| 198:5 MessageHeader | div  |  | spread: props |
| 214:5 MessageFooter | div  |  | spread: props |
| 228:5 MessageMarker | div  |  | spread: props |
| 247:5 MessageTyping | span  |  | spread: props |

## frontend/components/agents/prompt-input.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 218:5 PromptInput | form  | onSubmit=submit |  |
| 233:7 PromptInput | textarea  | onChange=(event) =&gt; setValue(event.currentTarget.value); onKeyDown=handleKeyDown | disabled=disabled; {"kind":"container","tag":"form","attributes":{}}; spread: textareaProps |
| 248:11 PromptInput | MorphPopover  | onOpenChange=setActionsOpen | open=actionsOpen; {"kind":"container","tag":"form","attributes":{}}; {"kind":"branch","expression":"actions.length","branch":"true"} |
| 250:15 PromptInput | Button  | type="button" | disabled=disabled &#124;&#124; loading; {"kind":"container","tag":"form","attributes":{}}; {"kind":"branch","expression":"actions.length","branch":"true"}; {… |
| 276:17 PromptInput | button  | onClick=() =&gt; { onAction?.(action.value); setActionsOpen(false); }; type="button" | disabled=action.disabled; {"kind":"container","tag":"form","attributes":{}}; {"kind":"branch","expression":"actions.length","branch":"true"}; {"kind":"contai… |
| 308:11 PromptInput | Select  | onValueChange=setModel | disabled=disabled &#124;&#124; loading; {"kind":"container","tag":"form","attributes":{}}; {"kind":"branch","expression":"models.length","branch":"true"} |
| 350:9 PromptInput | Button  | onClick=loading ? onStop : undefined; type=loading ? "button" : "submit" | disabled=loading ? !onStop : !canSubmit; {"kind":"container","tag":"form","attributes":{}} |

## frontend/components/agents/streaming-response.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 74:5 ResponseAction | motion.button children | onClick=onClick; type="button" |  |
| 189:17 StreamingResponse | ResponseAction  | onClick=handleCopy | {"kind":"container","tag":"div","attributes":{"aria-busy":"streaming"}}; {"kind":"branch","expression":"shouldShowActions","branch":"true"}; {"kind":"branch"… |
| 201:17 StreamingResponse | ResponseAction  | onClick=onRetry | {"kind":"container","tag":"div","attributes":{"aria-busy":"streaming"}}; {"kind":"branch","expression":"shouldShowActions","branch":"true"}; {"kind":"branch"… |
| 207:19 StreamingResponse | ResponseAction  | onClick=() =&gt; setFeedback("up") | {"kind":"container","tag":"div","attributes":{"aria-busy":"streaming"}}; {"kind":"branch","expression":"shouldShowActions","branch":"true"}; {"kind":"branch"… |
| 214:19 StreamingResponse | ResponseAction  | onClick=() =&gt; setFeedback("down") | {"kind":"container","tag":"div","attributes":{"aria-busy":"streaming"}}; {"kind":"branch","expression":"shouldShowActions","branch":"true"}; {"kind":"branch"… |
| 224:17 StreamingResponse | button  | onClick=() =&gt; setSourcesOpen(!currentSourcesOpen); type="button" | aria-expanded=currentSourcesOpen; {"kind":"container","tag":"div","attributes":{"aria-busy":"streaming"}}; {"kind":"branch","expression":"shouldShowActions",… |

## frontend/components/agents/todo-list.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 314:5 TodoList | section  |  | spread: rest |
| 323:9 TodoList | button  | onClick=() =&gt; setOpen(!currentOpen); type="button" | aria-expanded=currentOpen; {"kind":"branch","expression":"collapsible","branch":"true"} |
| 382:7 TodoList | AgentDisclosure  |  | open=collapsible ? currentOpen : true |
| 389:9 TodoList | div  | onScroll=(event) =&gt; { if (!onEndReached) return; const viewport = event.currentTarget; if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHei… | {"kind":"container","tag":"AgentDisclosure","attributes":{"open":"collapsible ? currentOpen : true"}} |

## frontend/components/assets/asset-availability-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 38:32 AssetAvailabilityPanel | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"state.kind === \"error\"","operator… |
| 38:67 AssetAvailabilityPanel | button frontendText(locale, "SUBMIT_ASSET_RETRY_READ") | onClick=() =&gt; { void read(); }; type="button" | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"state.kind === \"error\"","operator… |

## frontend/components/assets/asset-dropzone.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 63:10 AssetDropzone | div  | onPaste=(event) =&gt; { if (disabled &#124;&#124; busy) return; const files = clipboardImageFiles(Array.from(event.clipboardData.items)); if (files.length) {… | aria-disabled=disabled ? "true" : undefined; aria-busy=busy |
| 86:5 AssetDropzone | FileUpload  | onFilesRejected=() =&gt; { // Two files in one drop: refuse the whole drop as "one file at a time", exactly as // the picker does, instead of uploading the f… | disabled=disabled &#124;&#124; busy; {"kind":"container","tag":"div","attributes":{"aria-disabled":"disabled ? \"true\" : undefined","aria-busy":"busy"}} |
| 126:36 AssetDropzone | p frontendText(locale, validationKey) |  | {"kind":"container","tag":"div","attributes":{"aria-disabled":"disabled ? \"true\" : undefined","aria-busy":"busy"}}; {"kind":"logical","expression":"validat… |
| 127:39 AssetDropzone | span frontendText(locale, "SUBMIT_ASSET_QUEUE") |  | {"kind":"container","tag":"div","attributes":{"aria-disabled":"disabled ? \"true\" : undefined","aria-busy":"busy"}}; {"kind":"logical","expression":"showQue… |

## frontend/components/assets/asset-hygiene-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 168:9 AssetHygienePanel | Button frontendText(locale, "ADMIN_ASSET_CAPACITY_READ") | onClick=readCapacity; type="button" | {"kind":"branch","expression":"capacity.kind === \"idle\"","branch":"true"} |
| 171:39 AssetHygienePanel | div  |  | {"kind":"branch","expression":"capacity.kind === \"idle\"","branch":"false"}; {"kind":"branch","expression":"capacity.kind === \"loading\"","branch":"false"}… |
| 173:11 AssetHygienePanel | Button frontendText(locale, "COMMON_RETRY") | onClick=readCapacity; type="button" | {"kind":"branch","expression":"capacity.kind === \"idle\"","branch":"false"}; {"kind":"branch","expression":"capacity.kind === \"loading\"","branch":"false"}… |
| 195:9 AssetHygienePanel | FilterSelect  | onChange=(value) =&gt; { setPrefix(value === "parsed" ? "parsed" : "staging"); setSelected([]); } | disabled=pending &#124;&#124; scan.kind === "loading" |
| 199:9 AssetHygienePanel | FilterSelect  | onChange=(value) =&gt; { setLimit(Number(value) === ADMIN_ORPHAN_MAX_LIMIT ? ADMIN_ORPHAN_MAX_LIMIT : ADMIN_ORPHAN_DEFAULT_LIMIT); setSelected([]); } | disabled=pending &#124;&#124; scan.kind === "loading" |
| 203:9 AssetHygienePanel | Button frontendText(locale, scan.kind === "loading" ? "ADMIN_ASSET_ORPHAN_SCANNING" : "ADMIN_ASSET_ORPHAN_SCAN") | onClick=scanOrphans; type="button" | disabled=pending &#124;&#124; scan.kind === "loading" |
| 210:35 AssetHygienePanel | div  |  | {"kind":"branch","expression":"scan.kind === \"idle\"","branch":"false"}; {"kind":"branch","expression":"scan.kind === \"loading\"","branch":"false"}; {"kind… |
| 212:11 AssetHygienePanel | Button frontendText(locale, "COMMON_RETRY") | onClick=scanOrphans; type="button" | {"kind":"branch","expression":"scan.kind === \"idle\"","branch":"false"}; {"kind":"branch","expression":"scan.kind === \"loading\"","branch":"false"}; {"kind… |
| 222:17 AssetHygienePanel | Checkbox  | onChange=() =&gt; toggle(item.key) | disabled=pending; {"kind":"branch","expression":"scan.kind === \"idle\"","branch":"false"}; {"kind":"branch","expression":"scan.kind === \"loading\"","branch… |
| 237:13 AssetHygienePanel | Button frontendText(locale, "ADMIN_ASSET_ORPHAN_RECLAIM") | onClick=() =&gt; setConfirming(true); type="button" | disabled=pending &#124;&#124; selected.length === 0 &#124;&#124; !memberId; {"kind":"branch","expression":"scan.kind === \"idle\"","branch":"false"}; {"kind"… |
| 248:11 AssetHygienePanel | Button frontendText(locale, "ADMIN_ASSET_ORPHAN_RETRY_SAME") | onClick=() =&gt; void send(storedReclaim.operationId, storedReclaim.keys); type="button" | disabled=pending; {"kind":"logical","expression":"storedReclaim","operator":"&&"} |
| 254:19 AssetHygienePanel | div  |  | {"kind":"logical","expression":"blocked","operator":"&&"} |
| 256:22 AssetHygienePanel | Button frontendText(locale, "ADMIN_ASSET_ORPHAN_RECORD_DISCARD") | onClick=() =&gt; { discardBlockedAdminOperation(memberId); setRecord(loadAdminOperation(memberId)); }; type="button" | {"kind":"logical","expression":"blocked","operator":"&&"}; {"kind":"logical","expression":"memberId","operator":"&&"} |
| 260:18 AssetHygienePanel | p notice |  | {"kind":"logical","expression":"notice","operator":"&&"} |
| 269:5 AssetHygienePanel | TypedConfirmAction  | onCancel=() =&gt; setConfirming(false); onConfirm=confirmReclaim | open=confirming |

## frontend/components/assets/asset-upload-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 34:5 AssetUploadView | AssetDropzone  | onFiles=onFiles | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}} |
| 35:5 AssetUploadView | form  | onSubmit=event =&gt; { event.preventDefault(); onCreateUrl(url); } | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}} |
| 38:9 AssetUploadView | input  | onChange=event =&gt; setUrl(event.target.value); type="url" | disabled=state.busy; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"container","tag":"form","attributes":{}} |
| 40:7 AssetUploadView | button text("ASSET_URL_SUBMIT") | type="submit" | disabled=state.busy &#124;&#124; state.error === "storage"; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"container","ta… |
| 42:116 AssetUploadView | button text("ASSET_URL_RECHECK") | onClick=onRefresh; type="button" | disabled=state.busy; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"container","tag":"form","attributes":{}}; {"kind":"lo… |
| 44:5 AssetUploadView | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}} |
| 52:72 AssetUploadView | a text("SUBMIT_CHECK_SUBMISSIONS") | href="/my-submissions" | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expression":"state.kind === \"submitted\"","operator":"&&"} |
| 54:18 AssetUploadView | p text(errorKey) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expression":"errorKey","operator":"&&"} |
| 56:7 AssetUploadView | a text("ASSET_ORIGINAL_DOWNLOAD") | href=assetDownloadHref(state.record.asset.id, "original") | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expression":"state.record","operator":"&&"} |
| 57:31 AssetUploadView | a text("ASSET_PARSED_DOWNLOAD") | href=assetDownloadHref(state.record.asset.id, "parsed") | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expression":"state.record","operator":"&&"}; {"kind":"logical","… |
| 60:27 AssetUploadView | button text("ASSET_FLOW_STOP") | onClick=onStop; type="button" | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expression":"state.uploading","operator":"&&"} |
| 61:24 AssetUploadView | button text("ASSET_FLOW_REFRESH") | onClick=onRefresh; type="button" | disabled=state.busy &#124;&#124; state.error === "storage"; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expr… |
| 63:9 AssetUploadView | button text("ASSET_FLOW_PARSE") | onClick=onParse; type="button" | disabled=state.busy &#124;&#124; state.error === "storage"; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expr… |
| 64:9 AssetUploadView | button text("ASSET_FLOW_CANCEL") | onClick=onCancel; type="button" | disabled=state.busy &#124;&#124; state.error === "storage"; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expr… |
| 66:37 AssetUploadView | button text("ASSET_FLOW_RELEASE") | onClick=onRelease; type="button" | disabled=state.busy &#124;&#124; state.error === "storage"; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expr… |
| 67:31 AssetUploadView | button text("ASSET_FLOW_SUBMIT") | onClick=onSubmit; type="button" | disabled=state.busy &#124;&#124; state.error === "storage" &#124;&#124; (!state.intent?.review && !title.trim()); {"kind":"container","tag":"div","attributes… |
| 69:67 AssetUploadView | form  | onSubmit=event =&gt; { event.preventDefault(); onAlternative(alternative); } | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expression":"(job === \"failed_retryable\" &#124;&#124; job === … |
| 73:9 AssetUploadView | Textarea  | onChange=event =&gt; setAlternative(event.target.value) | disabled=state.busy; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expression":"(job === \"failed_retryable\" … |
| 75:31 AssetUploadView | p text(alternativeErrorKey) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.busy"}}; {"kind":"logical","expression":"(job === \"failed_retryable\" &#124;&#124; job === … |
| 76:7 AssetUploadView | button text("ASSET_ALTERNATIVE_SUBMIT") | type="submit" | disabled=state.busy &#124;&#124; state.error === "storage" &#124;&#124; !alternative.trim() &#124;&#124; !title.trim(); {"kind":"container","tag":"div","attr… |
| 98:10 AssetUploadPanel | AssetUploadView  | onFiles=async files =&gt; { const file = files[0]; if (file) attempt(() =&gt; { void fileFlow.current?.select(file); }); }; onCreateUrl=value =&gt; { attempt… |  |

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
| 50:5 CalendarRangeFilter | Popover  | onOpenChange=setOpen | open=open |
| 52:9 CalendarRangeFilter | Button  | type="button" | {"kind":"container","tag":"Popover","attributes":{"open":"open"}} |
| 58:16 CalendarRangeFilter | PopoverContent  |  | {"kind":"container","tag":"Popover","attributes":{"open":"open"}}; {"kind":"logical","expression":"open","operator":"&&"} |
| 62:13 CalendarRangeFilter | Input  | onChange=event =&gt; setFrom(event.currentTarget.value); type="datetime-local" | disabled=pending; {"kind":"container","tag":"Popover","attributes":{"open":"open"}}; {"kind":"logical","expression":"open","operator":"&&"} |
| 66:13 CalendarRangeFilter | Input  | onChange=event =&gt; setTo(event.currentTarget.value); type="datetime-local" | disabled=pending; {"kind":"container","tag":"Popover","attributes":{"open":"open"}}; {"kind":"logical","expression":"open","operator":"&&"} |
| 70:11 CalendarRangeFilter | Button frontendText(locale, "CALENDAR_RANGE_APPLY") | onClick=() =&gt; { if (!valid) return; triggerRef.current?.focus({ preventScroll: true }); setOpen(false); onChange({ from: fromInstant!, to: toInstant! }); … | disabled=pending &#124;&#124; !valid; {"kind":"container","tag":"Popover","attributes":{"open":"open"}}; {"kind":"logical","expression":"open","operator":"&&"} |
| 77:20 CalendarRangeFilter | p frontendText(locale, "CALENDAR_RANGE_INVALID") |  | {"kind":"container","tag":"Popover","attributes":{"open":"open"}}; {"kind":"logical","expression":"open","operator":"&&"}; {"kind":"logical","expression":"!v… |

## frontend/components/data-pagination.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 40:10 DataPagination | div  |  | spread: props |
| 43:144 DataPagination | Select  | onChange=(event) =&gt; onPageSizeChange(Number(event.currentTarget.value) as SupportedPageSize) | disabled=pending |
| 44:70 DataPagination | Pagination  | onPageChange=onPageChange | disabled=pending |
| 46:9 DataPagination | Button  | onClick=() =&gt; onPageChange(previousPage); type="button" | disabled=pending &#124;&#124; page &lt;= 1 |
| 48:9 DataPagination | Button  | onClick=() =&gt; onPageChange(page + 1); type="button" | disabled=pending &#124;&#124; totalPages === 0 &#124;&#124; page &gt;= lastAllowedPage |

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
| 50:5 InboxCreateForm | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 130:23 InboxCreateForm | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"recor… |
| 130:155 InboxCreateForm | Button frontendText(locale, "INBOX_DRAFT_RECORD_DISCARD") | onClick=discardRecord; type="button" | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"recor… |
| 131:22 InboxCreateForm | p recordNotice |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"recor… |
| 132:43 InboxCreateForm | Select  | onChange=event =&gt; draft.edit("kind", event.currentTarget.value as "text" &#124; "link") | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}} |
| 132:215 InboxCreateForm | option frontendText(locale, "INBOX_KIND_TEXT") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"container","tag":"Select","a… |
| 132:286 InboxCreateForm | option frontendText(locale, "INBOX_KIND_LINK") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"container","tag":"Select","a… |
| 132:386 InboxCreateForm | Input  | onChange=event =&gt; draft.edit("sourceUrl", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","e… |
| 133:5 InboxCreateForm | Textarea  | onChange=event =&gt; draft.edit("content", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}} |
| 134:38 InboxCreateForm | p frontendText(locale, "INBOX_CREATE_STORAGE_BLOCKED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 134:112 InboxCreateForm | Button frontendText(locale, "INBOX_CREATE_STORAGE_RETRY") | onClick=reloadStored; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 135:33 InboxCreateForm | p frontendText(locale, "INBOX_CREATE_UNKNOWN") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 135:136 InboxCreateForm | Button frontendText(locale, "INBOX_CREATE_RETRY") | onClick=() =&gt; void submit(); type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 136:37 InboxCreateForm | p frontendText(locale, "INBOX_CREATE_READ_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","expression":"phase … |
| 136:144 InboxCreateForm | Button frontendText(locale, "INBOX_CREATE_READ_RETRY") | onClick=() =&gt; { if (phaseRef.current === "read-failed") void readback(); }; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"branch","e… |
| 137:9 InboxCreateForm | Button frontendText(locale, "INBOX_CAPTURE") | onClick=() =&gt; void submit(); type="button" | disabled=locked &#124;&#124; !content.trim() &#124;&#124; !onCreate; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&… |
| 138:15 InboxCreateForm | p frontendText(locale, "INBOX_ACTION_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"error… |

## frontend/components/knowledge/knowledge-derivatives-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 66:7 KnowledgeDerivativesPanel | div  |  |  |
| 70:18 KnowledgeDerivativesPanel | Button generating ? frontendText(locale, "KNOWLEDGE_DERIVATIVES_GENERATING") : derivativeLabel(kind, locale) | onClick=() =&gt; derivatives.generate(kind, kind === "report" ? runningRunId ?? undefined : undefined); type="button" | aria-busy=generating; disabled=!derivatives.canGenerate; {"kind":"repeat","expression":"KNOWLEDGE_ARTIFACT_KINDS"} |
| 88:77 KnowledgeDerivativesPanel | a frontendText(locale, "KNOWLEDGE_DERIVATIVES_OPEN_RESEARCH") | href="#reader-research-panel" | {"kind":"logical","expression":"activeKind !== null && activeState.kind === \"blocked\"","operator":"&&"}; {"kind":"branch","expression":"activeState.reason … |
| 92:11 KnowledgeDerivativesPanel | DerivativeResult  | onGenerate=() =&gt; derivatives.generate(activeKind, activeKind === "report" ? runningRunId ?? undefined : undefined); onClose=derivatives.dismiss | {"kind":"branch","expression":"activeKind !== null && activeState.kind !== \"idle\" && activeState.kind !== \"blocked\"","branch":"true"} |
| 109:17 DerivativeResult | Button frontendText(locale, "KNOWLEDGE_DERIVATIVES_CLOSE") | onClick=onClose; type="button" |  |
| 112:7 DerivativeResult | p frontendText(locale, "KNOWLEDGE_DERIVATIVES_RUNNING").replace("{artifact}", label) |  | {"kind":"branch","expression":"state.kind === \"generating\"","branch":"true"} |
| 121:40 DerivativeResult | Button frontendText(locale, "KNOWLEDGE_DERIVATIVES_RETRY").replace("{artifact}", label) | onClick=onGenerate; type="button" | {"kind":"branch","expression":"state.kind === \"empty\"","branch":"true"}; earlier return: state.kind === "generating" |
| 127:7 DerivativeResult | p unavailable ? frontendText(locale, state.reason === "quota" ? "KNOWLEDGE_DERIVATIVES_QUOTA" : "KNOWLEDGE_DERIVATIVES_DEGRADED") : frontendText(locale, "KNOWL… |  | {"kind":"branch","expression":"state.kind === \"failed\" &#124;&#124; state.kind === \"unavailable\"","branch":"true"}; earlier return: state.kind === "gener… |
| 133:40 DerivativeResult | Button frontendText(locale, "KNOWLEDGE_DERIVATIVES_RETRY").replace("{artifact}", label) | onClick=onGenerate; type="button" | {"kind":"branch","expression":"state.kind === \"failed\" &#124;&#124; state.kind === \"unavailable\"","branch":"true"}; earlier return: state.kind === "gener… |
| 158:7 Citations | a citation.title.trim() &#124;&#124; frontendText(locale, "KNOWLEDGE_UNTITLED") | href=&#96;/knowledge/${encodeURIComponent(knowledgeItemId)}#${encodeURIComponent(citation.citationId)}&#96; | {"kind":"repeat","expression":"citations"}; earlier return: citations.length === 0 |

## frontend/components/knowledge/knowledge-research-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 99:9 KnowledgeResearchRunPanel | Button frontendText(locale, "KNOWLEDGE_RESEARCH_LOAD") | onClick=research.load; type="button" | {"kind":"logical","expression":"list.kind === \"idle\"","operator":"&&"} |
| 101:35 KnowledgeResearchRunPanel | p frontendText(locale, "KNOWLEDGE_RESEARCH_LOADING") |  | {"kind":"logical","expression":"list.kind === \"loading\"","operator":"&&"} |
| 103:9 KnowledgeResearchRunPanel | p frontendText(locale, list.kind === "degraded" ? "KNOWLEDGE_RESEARCH_DEGRADED" : "KNOWLEDGE_RESEARCH_UNREAD") |  | {"kind":"logical","expression":"(list.kind === \"failed\" &#124;&#124; list.kind === \"degraded\")","operator":"&&"} |
| 107:9 KnowledgeResearchRunPanel | Button frontendText(locale, "KNOWLEDGE_RESEARCH_RETRY") | onClick=research.load; type="button" | {"kind":"logical","expression":"(list.kind === \"failed\" &#124;&#124; list.kind === \"degraded\")","operator":"&&"} |
| 128:19 KnowledgeResearchRunPanel | Button frontendText(locale, "KNOWLEDGE_RESEARCH_SELECT") | onClick=() =&gt; research.selectRun(isSelected ? null : run.id); type="button" | {"kind":"logical","expression":"list.kind === \"ready\"","operator":"&&"}; {"kind":"branch","expression":"runs.length === 0","branch":"false"}; {"kind":"repe… |
| 129:75 KnowledgeResearchRunPanel | Button frontendText(locale, "KNOWLEDGE_RESEARCH_APPROVE") | onClick=() =&gt; research.transition(run.id, "approve"); type="button" | disabled=pending; {"kind":"logical","expression":"list.kind === \"ready\"","operator":"&&"}; {"kind":"branch","expression":"runs.length === 0","branch":"fals… |
| 130:76 KnowledgeResearchRunPanel | Button frontendText(locale, "KNOWLEDGE_RESEARCH_PAUSE") | onClick=() =&gt; research.transition(run.id, "pause"); type="button" | disabled=pending; {"kind":"logical","expression":"list.kind === \"ready\"","operator":"&&"}; {"kind":"branch","expression":"runs.length === 0","branch":"fals… |
| 131:103 KnowledgeResearchRunPanel | Button frontendText(locale, "KNOWLEDGE_RESEARCH_CANCEL") | onClick=() =&gt; research.transition(run.id, "cancel"); type="button" | disabled=pending; {"kind":"logical","expression":"list.kind === \"ready\"","operator":"&&"}; {"kind":"branch","expression":"runs.length === 0","branch":"fals… |
| 136:29 KnowledgeResearchRunPanel | p frontendText(locale, "KNOWLEDGE_RESEARCH_ACTION_RUNNING").replace("{action}", frontendText(locale, ACTION_KEYS[research.action.name])) |  | {"kind":"logical","expression":"list.kind === \"ready\"","operator":"&&"}; {"kind":"logical","expression":"research.action","operator":"&&"} |
| 139:34 KnowledgeResearchRunPanel | p frontendText(locale, "KNOWLEDGE_RESEARCH_ACTION_FAILED").replace("{code}", research.actionError.code) |  | {"kind":"logical","expression":"list.kind === \"ready\"","operator":"&&"}; {"kind":"logical","expression":"research.actionError","operator":"&&"} |
| 154:13 KnowledgeResearchRunPanel | Select  | onChange=(event) =&gt; setQuerySubquestionId(event.target.value) | {"kind":"logical","expression":"list.kind === \"ready\"","operator":"&&"}; {"kind":"logical","expression":"selected","operator":"&&"} |
| 159:51 KnowledgeResearchRunPanel | option item.question |  | {"kind":"logical","expression":"list.kind === \"ready\"","operator":"&&"}; {"kind":"logical","expression":"selected","operator":"&&"}; {"kind":"repeat","expr… |
| 161:13 KnowledgeResearchRunPanel | input  | onChange=(event) =&gt; setQueryText(event.target.value) | {"kind":"logical","expression":"list.kind === \"ready\"","operator":"&&"}; {"kind":"logical","expression":"selected","operator":"&&"} |
| 163:13 KnowledgeResearchRunPanel | input  | onChange=(event) =&gt; setQueryRationale(event.target.value) | {"kind":"logical","expression":"list.kind === \"ready\"","operator":"&&"}; {"kind":"logical","expression":"selected","operator":"&&"} |
| 164:28 KnowledgeResearchRunPanel | p frontendText(locale, "KNOWLEDGE_RESEARCH_QUERY_INVALID") |  | {"kind":"logical","expression":"list.kind === \"ready\"","operator":"&&"}; {"kind":"logical","expression":"selected","operator":"&&"}; {"kind":"logical","exp… |
| 165:13 KnowledgeResearchRunPanel | Button frontendText(locale, "KNOWLEDGE_RESEARCH_QUERY_SUBMIT") | onClick=submitQuery; type="button" | disabled=research.action?.name === "query"; {"kind":"logical","expression":"list.kind === \"ready\"","operator":"&&"}; {"kind":"logical","expression":"select… |
| 172:55 KnowledgeResearchRunPanel | Button frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_ACTION") | onClick=() =&gt; research.createDraft(selected.id, { reportId: selectedReport.reportId, title: selectedReport.title }, draftTarget); type="button" | disabled=research.draft.kind === "pending"; {"kind":"logical","expression":"list.kind === \"ready\"","operator":"&&"}; {"kind":"logical","expression":"select… |
| 187:9 KnowledgeResearchRunPanel | input  | onChange=(event) =&gt; setGoal(event.target.value) |  |
| 189:9 KnowledgeResearchRunPanel | Textarea  | onChange=(event) =&gt; setCompletion(event.target.value) |  |
| 191:9 KnowledgeResearchRunPanel | Textarea  | onChange=(event) =&gt; setSteps(event.target.value) |  |
| 193:9 KnowledgeResearchRunPanel | Textarea  | onChange=(event) =&gt; setSubquestions(event.target.value) |  |
| 194:24 KnowledgeResearchRunPanel | p frontendText(locale, "KNOWLEDGE_RESEARCH_START_INVALID") |  | {"kind":"logical","expression":"startError","operator":"&&"} |
| 195:9 KnowledgeResearchRunPanel | Button frontendText(locale, "KNOWLEDGE_RESEARCH_START_SUBMIT") | onClick=submitStart; type="button" | disabled=research.action?.name === "start" |
| 207:40 ResearchDraftStatus | p frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_PENDING") |  | {"kind":"branch","expression":"draft.kind === \"pending\"","branch":"true"}; earlier return: draft.kind === "idle" |
| 208:40 ResearchDraftStatus | p frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_CAPABILITY") |  | {"kind":"branch","expression":"draft.kind === \"blocked\"","branch":"true"}; earlier return: draft.kind === "idle"; earlier return: draft.kind === "pending" |
| 210:5 ResearchDraftStatus | p frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_STORAGE") |  | {"kind":"branch","expression":"draft.kind === \"storage-blocked\"","branch":"true"}; earlier return: draft.kind === "idle"; earlier return: draft.kind === "p… |
| 211:5 ResearchDraftStatus | Button frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_DISCARD") | onClick=research.discardDraft; type="button" | {"kind":"branch","expression":"draft.kind === \"storage-blocked\"","branch":"true"}; earlier return: draft.kind === "idle"; earlier return: draft.kind === "p… |
| 216:9 ResearchDraftStatus | a frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_READY_OPEN") | href="/submit" | {"kind":"branch","expression":"draft.kind === \"ready\"","branch":"true"}; {"kind":"branch","expression":"draft.composer === \"loaded\"","branch":"true"}; ea… |
| 218:9 ResearchDraftStatus | p frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_COMPOSER_BLOCKED").replace("{id}", draft.receipt.id).replace("{code}", draft.composer.blocked) |  | {"kind":"branch","expression":"draft.kind === \"ready\"","branch":"true"}; {"kind":"branch","expression":"draft.composer === \"loaded\"","branch":"false"}; e… |
| 221:9 ResearchDraftStatus | Button frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_COMPOSER_RETRY") | onClick=research.retryComposerHandOff; type="button" | {"kind":"branch","expression":"draft.kind === \"ready\"","branch":"true"}; {"kind":"branch","expression":"draft.composer === \"loaded\"","branch":"false"}; e… |
| 226:5 ResearchDraftStatus | p unconfirmed ? frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_UNCONFIRMED") : frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_FAILED").replace("{code}", draft.… |  | earlier return: draft.kind === "idle"; earlier return: draft.kind === "pending"; earlier return: draft.kind === "blocked"; earlier return: draft.kind === "st… |
| 234:7 ResearchDraftStatus | Button frontendText(locale, unconfirmed ? "KNOWLEDGE_RESEARCH_DRAFT_UNCONFIRMED_RETRY" : "KNOWLEDGE_RESEARCH_DRAFT_RETRY") | onClick=research.retryDraft; type="button" | earlier return: draft.kind === "idle"; earlier return: draft.kind === "pending"; earlier return: draft.kind === "blocked"; earlier return: draft.kind === "st… |
| 235:7 ResearchDraftStatus | Button frontendText(locale, "KNOWLEDGE_RESEARCH_DRAFT_DISCARD") | onClick=research.discardDraft; type="button" | earlier return: draft.kind === "idle"; earlier return: draft.kind === "pending"; earlier return: draft.kind === "blocked"; earlier return: draft.kind === "st… |

## frontend/components/knowledge/knowledge-share-button.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 31:62 KnowledgeShareButton | button frontendText(locale, shareState === "pending" ? "KNOWLEDGE_SHARE_PENDING" : "KNOWLEDGE_SHARE_ACTION") | onClick=() =&gt; void share(); type="button" | disabled=shareState === "pending"; aria-busy=shareState === "pending" |
| 31:425 KnowledgeShareButton | span frontendText(locale, "KNOWLEDGE_SHARE_DONE") |  | {"kind":"logical","expression":"shareState === \"shared\"","operator":"&&"} |
| 31:574 KnowledgeShareButton | span frontendText(locale, "KNOWLEDGE_SHARE_UNAVAILABLE") |  | {"kind":"logical","expression":"shareState === \"unavailable\"","operator":"&&"} |

## frontend/components/knowledge/reader-article.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 51:10 ReaderArticle | ImageViewer  | onValueChange=setActive |  |
| 52:5 ReaderArticle | div renderMarkdown(markdown) | onClick=(event) =&gt; { const image = imageFrom(event.target); if (image instanceof HTMLImageElement) open(image); }; onKeyDown=(event) =&gt; { if (event.key… |  |

## frontend/components/motion/action-swap-roll.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 23:10 ActionSwapRollButton | ActionSwapButton  |  | spread: props |
| 27:10 ActionSwapRollText | ActionSwapText  |  | spread: props |
| 31:10 ActionSwapRollIcon | ActionSwapIcon  |  | spread: props |

## frontend/components/motion/action-swap.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 313:5 ActionSwapButton | motion.button  | onClick=(event) =&gt; { onClick?.(event); if (event.defaultPrevented &#124;&#124; disabled &#124;&#124; !cycle &#124;&#124; !nextItem) return; if (value === … | disabled=disabled; earlier return: !activeItem; spread: rest |

## frontend/components/motion/alert.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 134:15 Alert | motion.div  |  | aria-hidden=!isPresent &#124;&#124; props["aria-hidden"]; {"kind":"logical","expression":"open","operator":"&&"}; spread: props; spread: gate |
| 180:5 AlertIcon | span  |  | aria-hidden="true"; spread: props |
| 200:10 AlertContent | div  |  | spread: props |
| 206:10 AlertTitle | div  |  | spread: props |
| 212:10 AlertDescription | div  |  | spread: props |
| 219:10 AlertAction | div  |  | spread: props |
| 227:5 AlertClose | motion.button  | onClick=(event) =&gt; { onClick?.(event); if (!event.defaultPrevented) dismiss(); }; type="button" | spread: props |

## frontend/components/motion/animated-badge.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 147:5 AnimatedBadge | motion.span  |  | spread: rest |

## frontend/components/motion/animated-sidebar.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 181:7 useIsMobile | media.addEventListener  | "change", callback |  |
| 313:5 AnimatedSidebarProvider | window.addEventListener  | "keydown", handleShortcut | earlier return: !keyboardShortcut |
| 333:7 AnimatedSidebarProvider | div children |  | spread: props |
| 440:7 MobileSidebar | motion.button  | onClick=() =&gt; context.setOpenMobile(false); type="button" | earlier return: !mounted |
| 458:7 MobileSidebar | motion.div  | onAnimationComplete=() =&gt; { if (!openMobileRef.current) setHidden(true); }; onKeyDown=(event) =&gt; { if (event.key === "Escape") { event.preventDefault()… | aria-hidden=!context.openMobile; earlier return: !mounted |
| 597:7 AnimatedSidebar | motion.aside  |  | earlier return: context.isMobile && mobilePanel; spread: props |
| 665:5 AnimatedSidebarTrigger | button  | onClick=(event) =&gt; { onClick?.(event); if (!event.defaultPrevented) context.toggleSidebar(); }; type=type | aria-expanded=expanded; spread: props |
| 703:5 AnimatedSidebarClose | button  | onClick=(event) =&gt; { onClick?.(event); if (event.defaultPrevented) return; if (context.isMobile) context.setOpenMobile(false); else context.setOpen(false)… | spread: props |
| 737:5 AnimatedSidebarRail | button  | onClick=(event) =&gt; { onClick?.(event); if (!event.defaultPrevented) context.toggleSidebar(); }; type=type | spread: props |
| 767:5 AnimatedSidebarInset | motion.main  |  | spread: props |
| 785:5 AnimatedSidebarHeader | div  |  | spread: props |
| 799:5 AnimatedSidebarContent | div  |  | spread: props |
| 816:5 AnimatedSidebarFooter | div  |  | spread: props |
| 833:5 AnimatedSidebarGroup | div  |  | spread: props |
| 852:5 AnimatedSidebarGroupLabel | div children |  | aria-hidden=collapsed; spread: props |
| 876:5 AnimatedSidebarGroupContent | div  |  | spread: props |
| 893:5 AnimatedSidebarMenu | SharedLayoutBg children |  | spread: props |
| 913:5 AnimatedSidebarMenuItem | motion.li  |  | spread: props |
| 943:9 AnimatedSidebarMenuSub | motion.ul children |  | {"kind":"branch","expression":"open && !panel.collapsed","branch":"true"}; spread: props |
| 973:5 AnimatedSidebarMenuSubItem | motion.li  |  | spread: props |
| 1050:5 AnimatedSidebarMenuSubButton | motion.a content | onClick=(event) =&gt; { props.onClick?.(event as unknown as React.MouseEvent&lt;HTMLButtonElement&gt;); if (event.defaultPrevented) return; select(event); };… | aria-disabled=disabled &#124;&#124; undefined; {"kind":"branch","expression":"href","branch":"true"}; spread: (props as HTMLMotionProps&lt;"a"&gt;) |
| 1073:5 AnimatedSidebarMenuSubButton | motion.button content | onClick=(event) =&gt; { props.onClick?.(event); if (event.defaultPrevented) return; select(event); }; type="button" | disabled=disabled; {"kind":"branch","expression":"href","branch":"false"}; spread: (props as HTMLMotionProps&lt;"button"&gt;) |
| 1225:5 AnimatedSidebarMenuButton | motion.a content | onClick=(event) =&gt; { props.onClick?.(event as unknown as React.MouseEvent&lt;HTMLButtonElement&gt;); if (event.defaultPrevented) return; select(event); };… | aria-expanded=ariaExpanded; aria-disabled=disabled &#124;&#124; undefined; {"kind":"branch","expression":"href","branch":"true"}; spread: (props as HTMLMotio… |
| 1251:5 AnimatedSidebarMenuButton | motion.button content | onClick=(event) =&gt; { props.onClick?.(event); if (event.defaultPrevented) return; select(event); }; type="button" | disabled=disabled; aria-expanded=ariaExpanded; {"kind":"branch","expression":"href","branch":"false"}; spread: (props as HTMLMotionProps&lt;"button"&gt;) |

## frontend/components/motion/animated-toast-stack.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 301:11 AnimatedToastStack | ToastItem  | onDismiss=onDismiss | {"kind":"repeat","expression":"visibleToasts"} |
| 352:5 ToastItem | motion.li  | onDragEnd=(_, info) =&gt; { if (!canDismiss &#124;&#124; !onDismiss) return; if (Math.abs(info.offset.x) &gt; 72 &#124;&#124; Math.abs(info.velocity.x) &gt; … |  |
| 480:17 ToastItem | button toast.action.label | onClick=() =&gt; toast.action?.onClick(toast); type="button" | {"kind":"branch","expression":"renderToast","branch":"false"}; {"kind":"branch","expression":"toast.action","branch":"true"} |
| 494:15 ToastItem | button  | onClick=() =&gt; onDismiss?.(toast.id); type="button" | {"kind":"branch","expression":"renderToast","branch":"false"}; {"kind":"branch","expression":"canDismiss","branch":"true"} |

## frontend/components/motion/bottom-sheet.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 93:5 BottomSheet | window.addEventListener  | "keydown", onKey | earlier return: !open |
| 156:13 BottomSheet | motion.button  | onClick=() =&gt; onOpenChange(false); type="button" | {"kind":"branch","expression":"open","branch":"true"}; earlier return: !mounted; spread: gate |
| 176:13 BottomSheet | motion.div  | onDragEnd=onDragEnd; onAnimationComplete=() =&gt; { if (sheetRef.current) heightRef.current = sheetRef.current.offsetHeight; } | {"kind":"branch","expression":"open","branch":"true"}; earlier return: !mounted; spread: gate |
| 208:17 BottomSheet | div  | onPointerDown=(event) =&gt; dragControls.start(event) | {"kind":"branch","expression":"open","branch":"true"}; earlier return: !mounted |

## frontend/components/motion/bouncy-accordion.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 171:5 BouncyAccordionRow | motion.div  |  | spread: item.attributes |
| 198:9 BouncyAccordionRow | motion.button  | onClick=onToggle; type="button" | disabled=item.disabled; aria-expanded=open |
| 339:11 BouncyAccordion | BouncyAccordionRow  | onToggle=() =&gt; toggleItem(item.id) | open=open; {"kind":"repeat","expression":"items"} |

## frontend/components/motion/breadcrumb.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 36:5 Breadcrumb | nav  |  | spread: props |
| 66:5 BreadcrumbList | ol  |  | spread: props |
| 98:7 BreadcrumbItem | motion.li children |  | aria-hidden=!present &#124;&#124; undefined; spread: props |
| 138:39 BreadcrumbLink | a  |  | {"kind":"branch","expression":"render","branch":"false"}; spread: linkProps |
| 145:5 BreadcrumbPage | span children |  | spread: props |
| 163:5 BreadcrumbSeparator | span  |  | aria-hidden="true"; spread: props |
| 209:5 BreadcrumbEllipsis | window.addEventListener  | "resize", update | earlier return: !open |
| 233:5 BreadcrumbEllipsis | document.addEventListener  | "focusin", onFocus | earlier return: !open |
| 238:5 BreadcrumbEllipsis | MorphPopover  | onOpenChange=setOpen | open=open && present |
| 239:7 BreadcrumbEllipsis | span  | onPointerEnter=(event) =&gt; { cancelClose(); if (canHover && event.pointerType === "mouse") { focusOnOpen.current = false; setOpen(true); } }; onPointerLeav… | {"kind":"container","tag":"MorphPopover","attributes":{"open":"open && present"}} |
| 250:11 BreadcrumbEllipsis | button  | onClick=(event) =&gt; { focusOnOpen.current = event.detail === 0; }; onKeyDown=(event) =&gt; { if (event.key === "ArrowDown") { event.preventDefault(); focus… | {"kind":"container","tag":"MorphPopover","attributes":{"open":"open && present"}} |
| 269:11 BreadcrumbEllipsis | BreadcrumbOverflowPaths children | onPointerEnter=() =&gt; { cancelClose(); setOpen(true); }; onPointerLeave=leave; onClick=(event) =&gt; { if ((event.target as Element).closest("a[href]")) se… | {"kind":"container","tag":"MorphPopover","attributes":{"open":"open && present"}} |
| 301:5 BreadcrumbOverflowPaths | ol  |  | spread: props |

## frontend/components/motion/button/base.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 105:7 Button | motion.button children | onPointerDown=handlePointerDown; type="button" | spread: rest |
| 127:17 Button | motion.span  | onAnimationComplete=() =&gt; setRipples((prev) =&gt; prev.filter((x) =&gt; x.id !== r.id)) | {"kind":"branch","expression":"ripple && !reduce","branch":"true"}; {"kind":"repeat","expression":"ripples"} |
| 172:7 ButtonLink | motion.a children |  | spread: rest |

## frontend/components/motion/button/magnetic.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 21:7 MagneticButton | Button children |  | spread: rest |

## frontend/components/motion/button/metallic.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 50:5 MetallicButton | Button  | onHoverStart=(event, info) =&gt; { setHovered(true); onHoverStart?.(event, info); }; onHoverEnd=(event, info) =&gt; { setHovered(false); onHoverEnd?.(event, … | spread: rest |

## frontend/components/motion/button/stateful.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 209:5 StatefulButton | Button  |  | disabled=disabled &#124;&#124; isBusy; aria-busy=isBusy; spread: rest |

## frontend/components/motion/card.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 107:5 Card | window.addEventListener  | "pointerup", release, options | earlier return: !interactive &#124;&#124; reduce &#124;&#124; releaseRef.current; earlier return: !event.isPrimary &#124;&#124; event.button !== 0 &#124;&#12… |
| 108:5 Card | window.addEventListener  | "pointercancel", release, options | earlier return: !interactive &#124;&#124; reduce &#124;&#124; releaseRef.current; earlier return: !event.isPrimary &#124;&#124; event.button !== 0 &#124;&#12… |
| 109:5 Card | window.addEventListener  | "pointermove", releaseOnDrag | earlier return: !interactive &#124;&#124; reduce &#124;&#124; releaseRef.current; earlier return: !event.isPrimary &#124;&#124; event.button !== 0 &#124;&#12… |
| 116:7 Card | motion.div children | onPointerDown=press | spread: (props as React.ComponentProps&lt;typeof motion.div&gt;) |
| 146:5 CardHeader | div  |  | spread: props |
| 166:5 CardTitle | Tag  |  | spread: (props as React.ComponentProps&lt;"h3"&gt;) |
| 178:5 CardDescription | p  |  | spread: props |
| 193:5 CardAction | div  |  | spread: props |
| 208:10 CardContent | div  |  | spread: props |
| 216:5 CardFooter | div  |  | spread: props |

## frontend/components/motion/center-morph-modal.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 337:5 CenterMorphModalContent | window.addEventListener  | "keydown", onKeyDown | earlier return: !context.open |
| 354:15 CenterMorphModalContent | motion.button  | onClick=() =&gt; { context.setOpen(false); onDismiss?.(); }; type="button" | disabled=!dismissible; {"kind":"branch","expression":"context.open","branch":"true"}; earlier return: !mounted; spread: backdropProps; spread: gate |
| 388:19 CenterMorphModalContent | motion.div children |  | {"kind":"branch","expression":"context.open","branch":"true"}; earlier return: !mounted; spread: panelProps; spread: gate |
| 432:23 CenterMorphModalContent | motion.button  | onClick=() =&gt; { context.setOpen(false); onDismiss?.(); }; type="button" | {"kind":"branch","expression":"context.open","branch":"true"}; {"kind":"branch","expression":"showCloseButton","branch":"true"}; earlier return: !mounted |

## frontend/components/motion/checkbox.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 60:7 Checkbox | motion.button  | onClick=() =&gt; !disabled && onCheckedChange(!checked); type="button" | disabled=disabled |

## frontend/components/motion/collapsible.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 130:7 Collapsible | motion.div  |  | spread: props |
| 211:5 CollapsibleTrigger | motion.button children |  | earlier return: child; spread: props; spread: triggerProps |
| 263:5 CollapsibleContent | motion.div  |  | aria-hidden=!context.open; spread: props |
| 301:5 CollapsibleIndicator | motion.span  |  | aria-hidden="true"; spread: props |

## frontend/components/motion/combobox/content.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 111:7 ComboboxContent | motion.div children |  | aria-hidden=!context.open; {"kind":"branch","expression":"inline","branch":"true"}; spread: rest |
| 161:5 ComboboxContent | motion.div  |  | aria-hidden=!context.open; earlier return: inline; earlier return: !portalReady; spread: rest |

## frontend/components/motion/combobox/context.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 286:5 Combobox | window.addEventListener  | "pointerdown", onPointerDown | earlier return: !open |
| 287:5 Combobox | window.addEventListener  | "focusin", onFocusIn | earlier return: !open |
| 288:5 Combobox | window.addEventListener  | "keydown", onKeyDown | earlier return: !open |

## frontend/components/motion/combobox/list.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 37:5 ComboboxList | div children |  | spread: rest |
| 149:5 ComboboxItem | button  | onPointerMove=() =&gt; { if (!disabled) context.setActiveValue(value); }; onPointerDown=(event) =&gt; event.preventDefault(); onClick=() =&gt; { if (disabled… | disabled=disabled; earlier return: !visible; spread: rest |
| 214:5 ComboboxEmpty | div children |  | earlier return: context.visibleCount &gt; 0 |

## frontend/components/motion/combobox/trigger.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 134:5 ComboboxTrigger | div  | onPointerDown=(event) =&gt; { if (context.disabled &#124;&#124; event.target === context.inputRef.current) return; event.preventDefault(); if (keyboard === "… | earlier return: render; spread: semantics |
| 266:7 ComboboxInput | input  | onPointerDown=(event) =&gt; { onPointerDown?.(event); if (event.defaultPrevented &#124;&#124; context.open) return; event.preventDefault(); context.inputRef.… | aria-expanded=context.open; disabled=context.disabled; spread: props |

## frontend/components/motion/command-palette.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 148:5 CommandPalette | window.addEventListener  | "keydown", onKey |  |
| 245:13 CommandPalette | motion.button  | onClick=() =&gt; setOpen(false); type="button" | {"kind":"branch","expression":"open","branch":"true"}; earlier return: !mounted; spread: gate |
| 272:15 CommandPalette | motion.div footer | onKeyDown=onKeyDown | {"kind":"branch","expression":"open","branch":"true"}; earlier return: !mounted; spread: gate |
| 295:19 CommandPalette | input  | onChange=(e) =&gt; setQuery(e.target.value) | aria-expanded="true"; {"kind":"branch","expression":"open","branch":"true"}; earlier return: !mounted |
| 323:17 CommandPalette | div  |  | {"kind":"branch","expression":"open","branch":"true"}; earlier return: !mounted |
| 349:29 CommandPalette | button  | onMouseEnter=() =&gt; moveTo(it.id); onClick=() =&gt; { it.onSelect(); setOpen(false); }; type="button" | {"kind":"branch","expression":"open","branch":"true"}; {"kind":"branch","expression":"rows.length === 0","branch":"false"}; {"kind":"repeat","expression":"gr… |

## frontend/components/motion/context-menu.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 159:5 ContextMenu | window.addEventListener  | "pointerdown", onPointerDown | earlier return: !open |
| 160:5 ContextMenu | window.addEventListener  | "resize", onWindowChange | earlier return: !open |
| 161:5 ContextMenu | window.addEventListener  | "scroll", onWindowChange | earlier return: !open |
| 497:7 ContextMenuContent | motion.div children | onKeyDown=onKeyDown; onContextMenu=(event) =&gt; event.preventDefault() | {"kind":"container","tag":"div","attributes":{"aria-hidden":"!context.open"}}; earlier return: !mounted |
| 577:5 ContextMenuItemBase | button children | onFocus=() =&gt; context.setActiveId(id); onPointerMove=(event) =&gt; { if (!disabled && event.pointerType !== "touch") event.currentTarget.focus(); }; onCli… | disabled=disabled; spread: checkedProps |
| 623:10 ContextMenuItem | ContextMenuItemBase  |  | spread: props |
| 640:5 ContextMenuCheckboxItem | ContextMenuItemBase children | onSelect=() =&gt; onCheckedChange?.(!checked) | spread: props |
| 716:5 ContextMenuRadioItem | ContextMenuItemBase children | onSelect=() =&gt; group.onValueChange?.(value) | spread: props |

## frontend/components/motion/date-range-picker.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 100:7 DateRangePicker | MorphPopover  | onOpenChange=ctx.setOpen | open=ctx.open |
| 129:5 DateRangePickerCalendar | section  |  | spread: props |
| 157:7 DateRangePickerCalendar | span ctx.announcement |  |  |
| 176:5 DateRangePickerSummary | div  |  | spread: props |
| 238:5 DateRangePickerHeader | div  |  | spread: props |
| 243:9 DateRangePickerHeader | button monthNameFormat.format(parse(month)) | onClick=() =&gt; openChoices("months"); type="button" | aria-expanded=view === "months"; disabled=disabled |
| 266:9 DateRangePickerHeader | button view === "years" ? &#96;${yearPage}–${yearPageEnd}&#96; : year | onClick=() =&gt; openChoices("years"); type="button" | aria-expanded=view === "years"; disabled=disabled |
| 285:9 DateRangePickerHeader | button  | onClick=() =&gt; page(-1); type="button" | disabled=previousDisabled |
| 300:9 DateRangePickerHeader | button  | onClick=() =&gt; page(1); type="button" | disabled=nextDisabled; hidden=view === "years" && nextDisabled |
| 364:5 DateRangePickerGrid | div  | onPointerLeave=(event) =&gt; { onPointerLeave?.(event); setPreview(null); } | spread: props |
| 392:15 DateRangePickerGrid | CalendarChoices  | onClose=closeChoices; onSelect=(id) =&gt; goToMonth( view === "months" ? id : &#96;${id.padStart(4, "0")}-${month.slice(5, 7)}-01&#96;, ) | {"kind":"branch","expression":"view !== \"days\"","branch":"true"} |
| 413:15 DateRangePickerGrid | table  |  | {"kind":"branch","expression":"view !== \"days\"","branch":"false"} |
| 469:27 DateRangePickerGrid | td  | onPointerEnter=(event) =&gt; { if ( canHover && event.pointerType !== "touch" && date && !unavailable(date) && value && !value.to ) setPreview(date); } | {"kind":"branch","expression":"view !== \"days\"","branch":"false"}; {"kind":"repeat","expression":"weeks"}; {"kind":"repeat","expression":"week"} |
| 532:31 DateRangePickerGrid | motion.button new Date(parse(date)).getUTCDate() | onClick=() =&gt; select(date); onFocus=() =&gt; { setCursor(date); if (value && !value.to) setPreview(date); }; onKeyDown=(event) =&gt; onKey(event, date); t… | disabled=unavailable(date); {"kind":"branch","expression":"view !== \"days\"","branch":"false"}; {"kind":"repeat","expression":"weeks"}; {"kind":"repeat","ex… |
| 589:5 DateRangePickerSelection | p children ?? (dayCount ? &#96;${dayCount} ${dayCount === 1 ? "day" : "days"} selected&#96; : value ? "Choose an end date" : "Choose a start date") |  | spread: props |
| 610:5 DateRangePickerClear | button children | onClick=(event) =&gt; { onClick?.(event); if (!event.defaultPrevented) ctx.clear(); }; type="button" | disabled=disabled &#124;&#124; ctx.disabled &#124;&#124; !ctx.value; spread: props |
| 636:5 DateRangePickerFooter | div  |  | spread: props |
| 664:5 DateRangePickerPresets | div  |  | earlier return: children === undefined && ctx.presets.length === 0; spread: props |
| 701:5 DateRangePickerPreset | button children ?? label | onClick=(event) =&gt; { onClick?.(event); if (!event.defaultPrevented) ctx.selectPreset(value, label); }; type="button" | disabled=disabled &#124;&#124; !ctx.rangeAvailable(value); spread: props |
| 757:7 DateRangePickerTrigger | motion.button  | type="button" | disabled=disabled &#124;&#124; ctx.disabled; spread: props |
| 839:5 DateRangePickerContent | MorphPopoverContent children | onOpenAutoFocus=(content) =&gt; { ctx.content.current = content; if (autoFocus) focusCalendarDate(content); onOpenAutoFocus?.(content); } | spread: props |
| 872:5 DateRangePickerDropdown | DateRangePicker  |  | spread: props |
| 971:9 CalendarChoices | motion.button choice.label | onFocus=() =&gt; setCursor(choice.id); onKeyDown=onKey; onClick=() =&gt; onSelect(choice.id); type="button" | disabled=choice.disabled; {"kind":"repeat","expression":"choices"} |

## frontend/components/motion/drawer.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 41:5 Drawer | window.addEventListener  | "keydown", onKey | earlier return: !open |
| 62:13 Drawer | motion.button  | onClick=() =&gt; dismissable && onOpenChange(false); type="button" | {"kind":"branch","expression":"open","branch":"true"}; spread: gate |
| 83:13 Drawer | motion.aside children |  | {"kind":"branch","expression":"open","branch":"true"}; spread: gate |

## frontend/components/motion/expandable-action-bar.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 273:7 ExpandableActionBar | motion.div  | onPointerEnter=onRootPointerEnter; onPointerLeave=onRootPointerLeave; onFocus=onRootFocus; onBlur=onRootBlur |  |
| 459:15 ExpandableActionBar | motion.a content | href=item.href | {"kind":"repeat","expression":"items"}; {"kind":"branch","expression":"item.href","branch":"true"}; spread: shared; spread: item.dataAttributes |
| 468:15 ExpandableActionBar | motion.button content | type="button" | disabled=item.disabled; {"kind":"repeat","expression":"items"}; {"kind":"branch","expression":"item.href","branch":"false"}; spread: shared; spread: item.dat… |

## frontend/components/motion/feedback-widget.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 195:5 FeedbackWidget | window.addEventListener  | "keydown", onKey | earlier return: !open |
| 196:5 FeedbackWidget | window.addEventListener  | "pointerdown", onPointer | earlier return: !open |
| 429:23 FeedbackWidget | div  |  | {"kind":"branch","expression":"open","branch":"true"}; {"kind":"branch","expression":"status === \"sent\"","branch":"false"}; {"kind":"branch","expression":"… |
| 444:25 FeedbackWidget | Button labels.retry | onClick=() =&gt; void submit() | {"kind":"branch","expression":"open","branch":"true"}; {"kind":"branch","expression":"status === \"sent\"","branch":"false"}; {"kind":"branch","expression":"… |
| 465:27 FeedbackWidget | button  | onClick=close; type="button" | {"kind":"branch","expression":"open","branch":"true"}; {"kind":"branch","expression":"status === \"sent\"","branch":"false"}; {"kind":"branch","expression":"… |
| 483:33 FeedbackWidget | Button option.label | onClick=() =&gt; void submit(option.value); type="button" | disabled=busy &#124;&#124; disabled &#124;&#124; option.disabled; {"kind":"branch","expression":"open","branch":"true"}; {"kind":"branch","expression":"statu… |
| 496:31 FeedbackWidget | p labels.sending |  | {"kind":"branch","expression":"open","branch":"true"}; {"kind":"branch","expression":"status === \"sent\"","branch":"false"}; {"kind":"branch","expression":"… |
| 502:27 FeedbackWidget | textarea  | onChange=(e) =&gt; setMessage(e.target.value) | disabled=busy &#124;&#124; disabled; {"kind":"branch","expression":"open","branch":"true"}; {"kind":"branch","expression":"status === \"sent\"","branch":"fal… |
| 517:27 FeedbackWidget | Button labels.cancel | onClick=close | disabled=busy; {"kind":"branch","expression":"open","branch":"true"}; {"kind":"branch","expression":"status === \"sent\"","branch":"false"}; {"kind":"branch"… |
| 526:27 FeedbackWidget | StatefulButton labels.submit | onClick=() =&gt; void submit() | disabled=busy &#124;&#124; message.trim().length === 0; {"kind":"branch","expression":"open","branch":"true"}; {"kind":"branch","expression":"status === \"se… |
| 544:13 FeedbackWidget | motion.button  | onClick=() =&gt; { if (disabled) return; clearCloseTimer(); setStatus("open"); }; type="button" | disabled=disabled; {"kind":"branch","expression":"open","branch":"false"} |

## frontend/components/motion/file-tree.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 335:5 FileTree | SharedLayoutBg  |  |  |
| 367:15 FileTree | button  | onFocus=() =&gt; setFocusedId(row.item.value); onKeyDown=(event) =&gt; handleKeyDown(event, row); onClick=() =&gt; { if (row.item.disabled) return; selectIte… | aria-expanded=isFolder ? isOpen : undefined; aria-disabled=row.item.disabled &#124;&#124; undefined; {"kind":"repeat","expression":"rows"}; spread: row.item.… |

## frontend/components/motion/file-upload.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 362:17 FileUploadRow | button  | onClick=() =&gt; onRetry(item); type="button" | {"kind":"branch","expression":"status === \"error\"","branch":"true"} |
| 374:15 FileUploadRow | button  | onClick=() =&gt; onRemove(item); type="button" |  |
| 389:13 FileUploadRow | div  |  | {"kind":"branch","expression":"showProgress","branch":"true"} |
| 527:5 FileUpload | div  |  | spread: rest |
| 528:7 FileUpload | input  | onChange=(event) =&gt; { addFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }; type="file" | disabled=disabled &#124;&#124; maxReached |
| 544:7 FileUpload | button  | onClick=() =&gt; inputRef.current?.click(); onDragEnter=(event) =&gt; { if (disabled &#124;&#124; maxReached) return; event.preventDefault(); dragDepthRef.cu… | disabled=disabled &#124;&#124; maxReached |
| 642:15 FileUpload | FileUploadRow  | onRemove=removeItem; onRetry=retryItem | {"kind":"repeat","expression":"items"}; {"kind":"branch","expression":"renderRow === undefined","branch":"true"} |

## frontend/components/motion/hold-action-button.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 176:5 HoldActionButton | motion.button  | onPointerDown=handlePointerDown; onPointerMove=handlePointerMove; onPointerUp=handlePointerUp; onPointerCancel=cancelHold; onPointerLeave=handlePointerLeave;… | disabled=disabled; spread: rest |
| 211:9 HoldActionButton | motion.span  | onAnimationComplete=handleFillComplete | aria-hidden="true"; {"kind":"container","tag":"motion.button","attributes":{"disabled":"disabled"}}; {"kind":"container","tag":"span","attributes":{"aria-hid… |

## frontend/components/motion/input.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 153:9 Input | input  | onChange=(e) =&gt; handleChange(e.target.value); onFocus=(event) =&gt; { setFocused(true); onFocus?.(event); }; onBlur=(event) =&gt; { setFocused(false); onB… | disabled=disabled; spread: rest |
| 218:13 Input | motion.p errorMessage |  | {"kind":"branch","expression":"errorMessage","branch":"true"} |

## frontend/components/motion/loader.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 65:5 Loader | span  |  |  |
| 239:5 Morph | motion.svg  |  |  |
| 354:5 Metaballs | svg  |  |  |

## frontend/components/motion/magnetic.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 41:5 Magnetic | motion.div children | onMouseMove=onMove; onMouseLeave=onLeave |  |

## frontend/components/motion/morphing-lightbox.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 251:5 ImageViewerGallery | section  |  | spread: props |
| 283:5 ImageViewerThumbnail | motion.button children | onClick=(event) =&gt; { onClick?.(event); if (!event.defaultPrevented && !disabled) select(image.id); }; type="button" | disabled=disabled; aria-expanded=image.id === value; spread: props |
| 324:5 ImageViewerCounter | span index + 1 / / / images.length |  | spread: props |
| 341:5 ImageViewerCaption | div children ?? (image && (renderCaption ? renderCaption(image) : (image.caption ?? image.alt))) |  | spread: props |
| 377:5 ViewerButton | button  | onClick=(event) =&gt; { onClick?.(event); if (!event.defaultPrevented) { if (action === "close") select(null); else move(action === "previous" ? -1 : 1); } }… | disabled=disabled &#124;&#124; unavailable; spread: props |
| 402:10 ImageViewerClose | ViewerButton  | action="close" | spread: props |
| 405:10 ImageViewerPrevious | ViewerButton  | action="previous" | spread: props |
| 408:10 ImageViewerNext | ViewerButton  | action="next" | spread: props |
| 460:17 ImageViewerContent | motion.button  | onClick=() =&gt; select(null); type="button" | aria-hidden="true"; {"kind":"logical","expression":"image","operator":"&&"}; earlier return: !mounted; spread: gate |
| 476:19 ImageViewerContent | div  | onPointerDownCapture=(event) =&gt; { const target = event.target; if ( target instanceof Element && !target.closest( "button, a, input, select, textarea, [da… | {"kind":"logical","expression":"image","operator":"&&"}; earlier return: !mounted; spread: gate |
| 534:21 ImageViewerContent | LightboxFrame  | onSwipe=move | {"kind":"logical","expression":"image","operator":"&&"}; earlier return: !mounted |
| 663:19 LightboxFrame | motion.div  |  | spread: gate |
| 673:21 LightboxFrame | motion.img  | onError=() =&gt; { if (slidePresent && present) setFailed(true); }; onPointerDown=(event) =&gt; { // Swiping the image keeps keyboard focus on the controls. … |  |
| 736:13 LightboxFrame | p labels.loadFailed |  | {"kind":"logical","expression":"failed","operator":"&&"} |
| 745:7 LightboxFrame | button  | onKeyDown=(event) =&gt; { if (!zoom) return; const dx = event.key === "ArrowLeft" ? -40 : event.key === "ArrowRight" ? 40 : 0; const dy = event.key === "Arro… |  |

## frontend/components/motion/morphing-modal.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 97:13 MorphingModal | motion.button  | onClick=onClose; type="button" | {"kind":"branch","expression":"open","branch":"true"}; spread: gate |
| 124:15 MorphingModal | motion.div  |  | {"kind":"branch","expression":"open","branch":"true"}; spread: gate; spread: panelProps |

## frontend/components/motion/not-found/shared.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 55:7 NotFoundActions | motion.a homeLabel | href=homeHref |  |
| 65:9 NotFoundActions | motion.a browseLabel | href=browseHref | {"kind":"branch","expression":"browseHref","branch":"true"} |

## frontend/components/motion/notification-stack.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 290:9 NotificationStack | span  |  | {"kind":"branch","expression":"!interactive","branch":"true"}; earlier return: !primaryItem |
| 296:13 NotificationStack | span  |  | {"kind":"branch","expression":"!interactive","branch":"true"}; {"kind":"repeat","expression":"visibleItems"}; earlier return: !primaryItem; spread: item.data |
| 364:5 NotificationStack | motion.button  | onPointerEnter=(event: PointerEvent&lt;HTMLButtonElement&gt;) =&gt; { if (hover.enter(event)) setIsExpanded(true); }; onPointerLeave=(event: PointerEvent&lt;… | aria-expanded=isExpandedValue; earlier return: !primaryItem; earlier return: !interactive |
| 440:15 NotificationStack | motion.span  |  | {"kind":"container","tag":"motion.button","attributes":{"aria-expanded":"isExpandedValue"}}; {"kind":"repeat","expression":"visibleItems"}; earlier return: !… |

## frontend/components/motion/overflow-actions.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 255:13 OverflowActions | ActionButton  | onAction=handleAction | {"kind":"repeat","expression":"primaryActions"} |
| 285:17 OverflowActions | ActionButton  | onAction=handleAction | {"kind":"branch","expression":"open","branch":"true"}; {"kind":"container","tag":"motion.div","attributes":{"aria-hidden":"!open"}}; {"kind":"repeat","expres… |
| 306:11 OverflowActions | motion.button  | onClick=() =&gt; setIsExpanded(!isExpanded); type="button" | aria-expanded=open; {"kind":"branch","expression":"hasOverflow","branch":"true"} |
| 390:7 ActionButton | button  | onClick=(event) =&gt; onAction(item, event); type="button" | disabled=item.disabled; spread: item.attributes |

## frontend/components/motion/popover-morph.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 137:5 MorphPopover | window.addEventListener  | "keydown", onKey | earlier return: !open |
| 138:5 MorphPopover | window.addEventListener  | "pointerdown", onPointer | earlier return: !open |
| 247:20 MorphPopoverContent | MorphPopoverSurface  |  | {"kind":"logical","expression":"ctx.open","operator":"&&"}; earlier return: !portalReady; spread: props |
| 396:7 MorphPopoverSurface | motion.div children |  |  |

## frontend/components/motion/popover-position.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 76:5 usePopoverPortalPosition | window.addEventListener  | "scroll", update, true | earlier return: !active |
| 77:5 usePopoverPortalPosition | window.addEventListener  | "resize", update | earlier return: !active |

## frontend/components/motion/popover.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 420:7 Popover | div children |  | spread: props; spread: hoverHandlers |
| 725:11 PopoverContent | div children |  | earlier return: !portalReady; spread: props; spread: hoverHandlers |

## frontend/components/motion/preview-rail.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 133:5 PreviewRail | motion.div  | onBlur=(event) =&gt; { // Both tick sources leave with the focus: a tap does not always land // focus, but when it does, tabbing away must not strand the car… |  |
| 152:7 PreviewRail | nav  | onPointerLeave=(event) =&gt; { // A touch pointer leaves on lift, which would clear the tick the tap // just chose — that one is cleared by the outside tap i… |  |
| 250:13 PreviewRail | a itemContent | onPointerEnter=handlePointerEnter; onPointerDown=handlePointerDown; onPointerCancel=dropGesture; onKeyDown=dropGesture; onFocus=(event) =&gt; handleFocus(eve… | {"kind":"repeat","expression":"items"}; {"kind":"branch","expression":"item.href","branch":"true"} |
| 273:13 PreviewRail | button itemContent | onPointerEnter=handlePointerEnter; onPointerDown=handlePointerDown; onPointerCancel=dropGesture; onKeyDown=dropGesture; onFocus=(event) =&gt; handleFocus(eve… | {"kind":"repeat","expression":"items"}; {"kind":"branch","expression":"item.href","branch":"false"} |

## frontend/components/motion/radio.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 83:9 RadioGroup | div children |  | spread: props |
| 137:7 RadioGroupItem | motion.button  | onClick=(event) =&gt; { props.onClick?.(event); if (!event.defaultPrevented && !disabled) setValue(value); }; type="button" | disabled=disabled; spread: props |

## frontend/components/motion/range-slider.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 76:5 RangeSlider | div  |  | spread: trackProps |
| 106:7 RangeSlider | motion.div  |  | spread: sliderProps |

## frontend/components/motion/select.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 177:5 Select | window.addEventListener  | "keydown", onKey | earlier return: !open |
| 178:5 Select | window.addEventListener  | "pointerdown", onPointer | earlier return: !open |
| 247:5 SelectTrigger | motion.button children | onClick=() =&gt; ctx.setOpen(!ctx.open); type="button" | disabled=ctx.disabled; aria-expanded=ctx.open |
| 386:5 SelectContent | motion.div  |  | aria-hidden=!open |
| 448:7 SelectItem | button children | onClick=() =&gt; ctx.select(value); type="button" | disabled=disabled |

## frontend/components/motion/shared-layout-bg.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 130:7 SharedLayoutBg | motion.ul renderedChildren | onMouseLeave=handleMouseLeave | {"kind":"branch","expression":"as === \"ul\"","branch":"true"}; spread: (props as HTMLMotionProps&lt;"ul"&gt;) |
| 140:7 SharedLayoutBg | motion.div renderedChildren | onMouseLeave=handleMouseLeave | {"kind":"branch","expression":"as === \"ul\"","branch":"false"}; spread: (props as HTMLMotionProps&lt;"div"&gt;) |

## frontend/components/motion/slide-action-button.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 179:5 SlideActionButton | div  |  | spread: rest |
| 218:7 SlideActionButton | motion.button  | onClick=activate; onDragEnd=() =&gt; { if (x.get() &gt;= maxDistance * threshold) complete(); else moveTo(0); }; onKeyDown=handleKeyDown; type="button" | disabled=disabled; spread: thumbProps |

## frontend/components/motion/sortable-list.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 254:7 SortableList | div  |  | spread: rest |
| 277:9 SortableList | span announcement |  |  |
| 297:5 SortableListGroup | Reorder.Group  | onReorder=context.reorder | spread: props |
| 332:7 SortableListItem | Reorder.Item children | onDragStart=(event, info) =&gt; { setDragging(true); context.beginDrag(); onDragStart?.(event, info); }; onDragEnd=(event, info) =&gt; { setDragging(false); … | spread: props |
| 382:5 SortableListHandle | button  | onPointerDown=(event) =&gt; { onPointerDown?.(event); if (!event.defaultPrevented && !unavailable && event.button === 0) { event.currentTarget.focus({ preven… | disabled=unavailable; spread: props |
| 442:10 SortableListItemContent | div  |  | spread: props |
| 455:5 SortableListUndo | button  | onClick=(event) =&gt; { onClick?.(event); if (!event.defaultPrevented) context.undo(); }; type="button" | disabled=disabled &#124;&#124; context.disabled &#124;&#124; !context.canUndo; spread: props |

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
| 101:9 Tabs | motion.div children |  | spread: props |
| 174:5 TabsList | viewport.addEventListener  | "scroll", measure, { passive: true } | earlier return: !root &#124;&#124; !viewport &#124;&#124; !list |
| 240:9 TabsList | button  | onClick=() =&gt; scroll(-1); type="button" | disabled=!edges.left; {"kind":"logical","expression":"edges.overflow","operator":"&&"} |
| 244:7 TabsList | motion.div  | onFocusCapture=(event) =&gt; { if (event.target instanceof HTMLElement && event.target.getAttribute("role") === "tab") reveal(event.target); } |  |
| 256:9 TabsList | div children |  | spread: props |
| 267:9 TabsList | button  | onClick=() =&gt; scroll(1); type="button" | disabled=!edges.right; {"kind":"logical","expression":"edges.overflow","operator":"&&"} |
| 293:7 TabsTrigger | button children | onClick=(event) =&gt; { onClick?.(event); if (!event.defaultPrevented) setValue(value); }; type="button" | {"kind":"branch","expression":"variant === \"underline\"","branch":"true"}; spread: props |
| 340:7 TabsTrigger | button children | onClick=(event) =&gt; { onClick?.(event); if (!event.defaultPrevented) setValue(value); }; type="button" | earlier return: variant === "underline"; spread: props |
| 381:7 TabsContent | motion.div children |  | hidden=true; {"kind":"branch","expression":"!active","branch":"true"}; spread: props |
| 387:5 TabsContent | motion.div children |  | earlier return: !active; spread: props |

## frontend/components/motion/tooltip-surface.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 28:5 TooltipSurface | motion.span children |  | spread: props |

## frontend/components/motion/tooltip.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 260:7 TooltipRoot | document.addEventListener  | "pointermove", onMove | earlier return: !to |
| 330:5 TooltipRoot | el.addEventListener  | "pointerenter", onEnter | earlier return: anchorRef &#124;&#124; !trigger |
| 331:5 TooltipRoot | el.addEventListener  | "pointerleave", onLeave | earlier return: anchorRef &#124;&#124; !trigger |
| 332:5 TooltipRoot | el.addEventListener  | "pointerdown", onDown | earlier return: anchorRef &#124;&#124; !trigger |
| 333:5 TooltipRoot | el.addEventListener  | "pointercancel", tap.drop | earlier return: anchorRef &#124;&#124; !trigger |
| 334:5 TooltipRoot | el.addEventListener  | "click", onClick | earlier return: anchorRef &#124;&#124; !trigger |
| 335:5 TooltipRoot | el.addEventListener  | "keydown", onKey | earlier return: anchorRef &#124;&#124; !trigger |
| 336:5 TooltipRoot | el.addEventListener  | "focusin", onFocusIn | earlier return: anchorRef &#124;&#124; !trigger |
| 337:5 TooltipRoot | el.addEventListener  | "focusout", onFocusOut | earlier return: anchorRef &#124;&#124; !trigger |
| 371:5 TooltipRoot | window.addEventListener  | "blur", close | earlier return: !open &#124;&#124; anchorRef &#124;&#124; !trigger |
| 523:5 TooltipTrigger | button children | type="button" | earlier return: asChild; spread: props; spread: aria |
| 594:11 TooltipContent | TooltipPositioner  | onDismiss=close | {"kind":"branch","expression":"open && !empty","branch":"true"}; earlier return: typeof document === "undefined" |
| 608:15 TooltipContent | TooltipSurface children | onPointerEnter=onContentEnter; onPointerLeave=onContentLeave | aria-hidden=asLabel &#124;&#124; undefined; {"kind":"branch","expression":"open && !empty","branch":"true"}; earlier return: typeof document === "undefined" |
| 650:37 Tooltip | TooltipRoot  |  | {"kind":"branch","expression":"!(\"content\" in props)","branch":"true"}; spread: props |
| 664:5 Tooltip | TooltipRoot  |  | earlier return: !("content" in props); earlier return: !root.anchorRef && !isValidElement(children); spread: root |

## frontend/components/motion/tooltip/grace.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 85:3 watchModality | window.addEventListener  | "keydown", () =&gt; (modality = "keyboard"), true | earlier return: listening &#124;&#124; typeof window === "undefined" |
| 86:3 watchModality | window.addEventListener  | "pointerdown", () =&gt; (modality = "pointer"), true | earlier return: listening &#124;&#124; typeof window === "undefined" |

## frontend/components/motion/tooltip/use-position.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 171:5 useTooltipPosition | window.addEventListener  | "scroll", onScroll, true | earlier return: !open &#124;&#124; !anchor &#124;&#124; !floating |
| 216:5 useTooltipPointer | anchor.addEventListener  | "pointerenter", point as EventListener, { passive: true } | earlier return: !anchor &#124;&#124; !followCursor |
| 217:5 useTooltipPointer | anchor.addEventListener  | "pointermove", point as EventListener, { passive: true } | earlier return: !anchor &#124;&#124; !followCursor |
| 218:5 useTooltipPointer | anchor.addEventListener  | "pointerdown", point as EventListener, { passive: true } | earlier return: !anchor &#124;&#124; !followCursor |
| 219:5 useTooltipPointer | anchor.addEventListener  | "pointerleave", leave | earlier return: !anchor &#124;&#124; !followCursor |
| 220:5 useTooltipPointer | anchor.addEventListener  | "pointercancel", leave | earlier return: !anchor &#124;&#124; !followCursor |
| 221:5 useTooltipPointer | anchor.addEventListener  | "keydown", keyboard | earlier return: !anchor &#124;&#124; !followCursor |
| 222:5 useTooltipPointer | anchor.addEventListener  | "focusin", focus | earlier return: !anchor &#124;&#124; !followCursor |

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

## frontend/components/review-period-control.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 23:5 ReviewPeriodControl | RadioGroup  | onValueChange=(next) =&gt; onChange(next === "weekly" ? "weekly" : "daily") |  |

## frontend/components/review/review-batch-owner.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 222:11 ReviewBatchToolbar | Button frontendText(locale, "ADMIN_REVIEW_BATCH_SELECT_ALL") | onClick=batch.selectAllPage; type="button" | disabled=frozen &#124;&#124; rows.length === 0 |
| 223:11 ReviewBatchToolbar | Button frontendText(locale, "ADMIN_REVIEW_BATCH_CLEAR") | onClick=batch.clear; type="button" | disabled=frozen &#124;&#124; selectedOnPage === 0 |
| 227:11 ReviewBatchToolbar | Button frontendText(locale, "ADMIN_REVIEW_BATCH_REJECT") | onClick=() =&gt; batch.setDecision("reject"); type="button" | disabled=frozen |
| 228:11 ReviewBatchToolbar | Button frontendText(locale, "ADMIN_REVIEW_BATCH_REQUEST_REVISION") | onClick=() =&gt; batch.setDecision("request_revision"); type="button" | disabled=frozen |
| 233:13 ReviewBatchToolbar | Select  | onChange=(event) =&gt; batch.setReasonCode(event.target.value) | disabled=frozen; {"kind":"branch","expression":"batch.decision === \"reject\"","branch":"true"} |
| 240:11 ReviewBatchToolbar | Textarea  | onChange=(event) =&gt; batch.setNote(event.target.value) | disabled=frozen |
| 244:11 ReviewBatchToolbar | Button frontendText(locale, "ADMIN_REVIEW_BATCH_ACTION_LABEL") | onClick=batch.send; type="button" | disabled=selectedOnPage === 0 |
| 249:26 ReviewBatchToolbar | p batch.notice |  | {"kind":"logical","expression":"batch.notice","operator":"&&"} |
| 264:5 ReviewBatchResults | Alert  |  | {"kind":"branch","expression":"state.kind === \"rejected\"","branch":"true"} |
| 292:11 ReviewBatchResults | Button frontendText(locale, "ADMIN_REVIEW_BATCH_RETRY_FAILED").replace("{count}", String(failed)) | onClick=onRetryFailed; type="button" | {"kind":"logical","expression":"failed &gt; 0","operator":"&&"}; earlier return: state.kind === "rejected"; earlier return: state.kind !== "done" |

## frontend/components/review/review-chunk-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 99:35 ReviewChunkPanel | p report.message |  | {"kind":"branch","expression":"report.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"report.kind === \"error\"","branch":"true"} |
| 109:35 ReviewChunkPanel | p chunks.message |  | {"kind":"branch","expression":"chunks.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"chunks.kind === \"error\"","branch":"true"} |
| 121:17 ReviewChunkPanel | Button frontendText(locale, chunk.status === "active" ? "ADMIN_CHUNK_DISABLE" : "ADMIN_CHUNK_ENABLE") | onClick=() =&gt; void setStatus(chunk, chunk.status === "active" ? "disabled" : "active"); type="button" | disabled=pendingChunk !== null; {"kind":"branch","expression":"chunks.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"chunks.kind ===… |
| 132:40 ReviewChunkPanel | Button frontendText(locale, "ADMIN_CHUNK_LOAD_MORE") | onClick=loadMore; type="button" | {"kind":"branch","expression":"chunks.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"chunks.kind === \"error\"","branch":"false"}; {… |
| 136:16 ReviewChunkPanel | p notice |  | {"kind":"logical","expression":"notice","operator":"&&"} |

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
| 35:19 ReviewDecisionControls | ReviewDecisionEditor  |  | {"kind":"branch","expression":"drafts","branch":"true"}; spread: props |
| 36:50 ReviewDecisionControls | ReviewDecisionControls  |  | {"kind":"branch","expression":"drafts","branch":"false"}; spread: props |
| 56:5 ReviewDecisionEditor | window.addEventListener  | "beforeunload", warn |  |
| 126:33 ReviewDecisionEditor | ReviewDecisionForm  | onChange=setDetails; onCancel=() =&gt; requestChoice(null); onSubmit=submit; action=selected | disabled=locked &#124;&#124; valid &#124;&#124; drafts.confirming; {"kind":"container","tag":"div","attributes":{"aria-hidden":"valid &#124;&#124; undefined"… |
| 129:5 ReviewDecisionEditor | ConfirmAction  | onCancel=cancel; onConfirm=confirm | open=valid |
| 143:10 ReviewDecisionForm | form  | onSubmit=(event) =&gt; { event.preventDefault(); if (!disabled && valid) onSubmit({ reasonCode, note }); } |  |
| 146:7 ReviewDecisionForm | Select  | onChange=(event) =&gt; onChange({ ...details, reasonCode: event.target.value as ReviewNoteInput["reasonCode"] }) | disabled=disabled; {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"action === \"reject\"","operator":"&&"} |
| 147:9 ReviewDecisionForm | option frontendText(locale, "ADMIN_REVIEW_REASON_NOT_RELEVANT") |  | {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"action === \"reject\"","operator":"&&"}; {"kind":"container","tag":"Select… |
| 148:9 ReviewDecisionForm | option frontendText(locale, "ADMIN_REVIEW_REASON_DUPLICATE") |  | {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"action === \"reject\"","operator":"&&"}; {"kind":"container","tag":"Select… |
| 149:9 ReviewDecisionForm | option frontendText(locale, "ADMIN_REVIEW_REASON_UNSAFE") |  | {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"action === \"reject\"","operator":"&&"}; {"kind":"container","tag":"Select… |
| 154:7 ReviewDecisionForm | Textarea  | onChange=(event) =&gt; onChange({ ...details, note: event.target.value }) | disabled=disabled; {"kind":"container","tag":"form","attributes":{}} |
| 161:7 ReviewDecisionForm | Button frontendText(locale, action === "reject" ? "ADMIN_REVIEW_CONFIRM_REJECT" : "ADMIN_REVIEW_CONFIRM_REVISION") | type="submit" | disabled=disabled &#124;&#124; !valid; {"kind":"container","tag":"form","attributes":{}} |
| 164:7 ReviewDecisionForm | Button frontendText(locale, "ADMIN_REVIEW_CANCEL") | onClick=onCancel; type="button" | disabled=disabled; {"kind":"container","tag":"form","attributes":{}} |
| 176:12 ReviewDecisionFeedback | Alert  |  | {"kind":"branch","expression":"state.kind === \"success\"","branch":"true"} |
| 187:36 ReviewDecisionFeedback | Button frontendText(locale, "ADMIN_REVIEW_RETRY_SAME") | onClick=onRetry; type="button" | {"kind":"logical","expression":"state.recovery === \"retry\"","operator":"&&"}; earlier return: state.kind === "success"; earlier return: state.kind !== "error" |
| 188:105 ReviewDecisionFeedback | Button frontendText(locale, "ADMIN_REVIEW_RELOAD") | onClick=onReload; type="button" | {"kind":"logical","expression":"(state.recovery === \"reload\" &#124;&#124; (state.recovery === \"retry\" && allowUnknownReload && onReload))","operator":"&&… |

## frontend/components/review/review-drafts.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 63:22 ReviewDraftProvider | div  |  | {"kind":"branch","expression":"recordBlocked","branch":"true"} |
| 65:7 ReviewDraftProvider | button frontendText(locale, "REVIEW_NOTE_DRAFT_RECORD_DISCARD") | onClick=discardRecord; type="button" | {"kind":"branch","expression":"recordBlocked","branch":"true"} |
| 67:21 ReviewDraftProvider | p recordNotice |  | {"kind":"branch","expression":"recordNotice","branch":"true"} |

## frontend/components/review/review-source-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 167:9 ReviewSourcePanel | Button frontendText(locale, "ADMIN_REPARSE_OPEN") | onClick=open; type="button" | {"kind":"branch","expression":"source.kind === \"idle\"","branch":"true"} |
| 174:11 ReviewSourcePanel | Button frontendText(locale, "COMMON_RETRY") | onClick=open; type="button" | {"kind":"branch","expression":"source.kind === \"idle\"","branch":"false"}; {"kind":"branch","expression":"source.kind === \"loading\"","branch":"false"}; {"… |
| 178:11 ReviewSourcePanel | Button frontendText(locale, pending === "reparse" ? "ADMIN_REPARSE_RUNNING" : "ADMIN_REPARSE_RUN") | onClick=() =&gt; void runReparse(source.value.sourceVersionId); type="button" | disabled=pending !== null; {"kind":"branch","expression":"source.kind === \"idle\"","branch":"false"}; {"kind":"branch","expression":"source.kind === \"loadi… |
| 194:13 ReviewSourcePanel | Textarea  | onChange=(event) =&gt; setCandidateDraft(event.target.value) | disabled=pending !== null &#124;&#124; job.status !== "indexed"; {"kind":"branch","expression":"source.kind === \"idle\"","branch":"false"}; {"kind":"branch"… |
| 199:15 ReviewSourcePanel | Button frontendText(locale, "ADMIN_REPARSE_SAVE_CANDIDATE") | onClick=() =&gt; void saveCandidate(); type="button" | disabled=pending !== null &#124;&#124; job.status !== "indexed" &#124;&#124; candidateDraft.length === 0; {"kind":"branch","expression":"source.kind === \"id… |
| 204:15 ReviewSourcePanel | Button frontendText(locale, "ADMIN_REPARSE_RUN_AGAIN") | onClick=() =&gt; { publishOperation.current = null; void runReparse(job.baseSourceVersionId); }; type="button" | disabled=pending !== null &#124;&#124; job.status === "indexed"; {"kind":"branch","expression":"source.kind === \"idle\"","branch":"false"}; {"kind":"branch"… |
| 209:15 ReviewSourcePanel | Button frontendText(locale, "ADMIN_REPARSE_PROMOTE") | onClick=() =&gt; void promote(); type="button" | disabled=pending !== null &#124;&#124; job.status !== "indexed"; {"kind":"branch","expression":"source.kind === \"idle\"","branch":"false"}; {"kind":"branch"… |
| 214:15 ReviewSourcePanel | Button frontendText(locale, "ADMIN_REPARSE_PUBLISH") | onClick=() =&gt; void publish(); type="button" | disabled=pending !== null &#124;&#124; job.status !== "indexed" &#124;&#124; promotion === null; {"kind":"branch","expression":"source.kind === \"idle\"","br… |
| 238:22 ReviewSourcePanel | p notice |  | {"kind":"branch","expression":"source.kind === \"idle\"","branch":"false"}; {"kind":"branch","expression":"source.kind === \"loading\"","branch":"false"}; {"… |

## frontend/components/shell/app-shell.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 130:11 AppShell | span unreadState.kind === "ready" ? unreadState.unread : unreadState.kind === "loading" ? "…" : "—" |  | {"kind":"repeat","expression":"collaborationLinks"}; {"kind":"branch","expression":"link.path === \"/notifications\"","branch":"true"} |
| 137:7 AppShell | a locale.t("SHELL_SKIP_MAIN") | href="#main-content" |  |
| 138:7 AppShell | AnimatedSidebarProvider  | onOpenChange=(next) =&gt; setCollapsed(!next) | open=!collapsed |
| 158:13 AppShell | Button  | onClick=() =&gt; setCollapsed((value) =&gt; !value); type="button" | aria-expanded=!collapsed; {"kind":"container","tag":"AnimatedSidebarProvider","attributes":{"open":"!collapsed"}} |
| 163:13 AppShell | NavGroup  | onNavigate=navigate; onToggle=(id) =&gt; setExpanded((value) =&gt; ({ ...value, [id]: !value[id] })) | {"kind":"container","tag":"AnimatedSidebarProvider","attributes":{"open":"!collapsed"}} |
| 164:40 AppShell | NavGroup  | onNavigate=navigate; onToggle=(id) =&gt; setExpanded((value) =&gt; ({ ...value, [id]: !value[id] })) | {"kind":"container","tag":"AnimatedSidebarProvider","attributes":{"open":"!collapsed"}}; {"kind":"logical","expression":"adminRoutes.length &gt; 0","operator… |
| 167:93 AppShell | AccountMenu  | onActiveMenuChange=setActiveMenu; onThemeChange=changeTheme; onNavigate=navigate; onLogout=onLogout | {"kind":"container","tag":"AnimatedSidebarProvider","attributes":{"open":"!collapsed"}}; {"kind":"branch","expression":"collapsed","branch":"true"} |
| 168:81 AppShell | AccountMenu  | onActiveMenuChange=setActiveMenu; onThemeChange=changeTheme; onNavigate=navigate; onLogout=onLogout | {"kind":"container","tag":"AnimatedSidebarProvider","attributes":{"open":"!collapsed"}}; {"kind":"branch","expression":"collapsed","branch":"false"} |
| 172:70 AppShell | Breadcrumb  | onNavigate=navigate | {"kind":"container","tag":"AnimatedSidebarProvider","attributes":{"open":"!collapsed"}} |
| 174:13 AppShell | CommandPalette  | onNavigate=navigate; onToggleTheme=toggleTheme; onLogout=onLogout | {"kind":"container","tag":"AnimatedSidebarProvider","attributes":{"open":"!collapsed"}} |
| 186:76 AppShell | Button locale.t("COMMON_RETRY") | onClick=notificationSummary.retry | {"kind":"container","tag":"AnimatedSidebarProvider","attributes":{"open":"!collapsed"}}; {"kind":"logical","expression":"notificationsLinkVisible && unreadSt… |
| 188:13 AppShell | Popover  | onOpenChange=(open) =&gt; setActiveMenu(open ? "language" : null) | open=activeMenu === "language"; {"kind":"container","tag":"AnimatedSidebarProvider","attributes":{"open":"!collapsed"}} |
| 190:17 AppShell | Button  | type="button" | {"kind":"container","tag":"AnimatedSidebarProvider","attributes":{"open":"!collapsed"}}; {"kind":"container","tag":"Popover","attributes":{"open":"activeMenu… |
| 192:45 AppShell | PopoverContent  |  | {"kind":"container","tag":"AnimatedSidebarProvider","attributes":{"open":"!collapsed"}}; {"kind":"container","tag":"Popover","attributes":{"open":"activeMenu… |
| 193:17 AppShell | button locale.t("SHELL_LANGUAGE_EN") | onClick=() =&gt; { locale.setLocale("en"); setActiveMenu(null); }; type="button" | {"kind":"container","tag":"AnimatedSidebarProvider","attributes":{"open":"!collapsed"}}; {"kind":"container","tag":"Popover","attributes":{"open":"activeMenu… |
| 194:17 AppShell | button locale.t("SHELL_LANGUAGE_ZH_CN") | onClick=() =&gt; { locale.setLocale("zh-CN"); setActiveMenu(null); }; type="button" | {"kind":"container","tag":"AnimatedSidebarProvider","attributes":{"open":"!collapsed"}}; {"kind":"container","tag":"Popover","attributes":{"open":"activeMenu… |
| 199:148 AppShell | MobileNavigation  | onNavigate=navigate; onActiveMenuChange=setActiveMenu; onThemeChange=changeTheme; onLogout=onLogout | {"kind":"container","tag":"AnimatedSidebarProvider","attributes":{"open":"!collapsed"}} |
| 216:36 NavGroup | NavNode  | onNavigate=onNavigate; onToggle=onToggle | {"kind":"repeat","expression":"nodes"} |
| 237:29 NavNode | Button  | onClick=(event) =&gt; event.preventDefault(); type="button" | aria-disabled="true" |
| 241:9 NavNode | AnimatedSidebarMenuButton label | onSelect=(event) =&gt; { event.preventDefault(); onNavigate(path); }; href=path | {"kind":"branch","expression":"path && unavailable","branch":"false"}; {"kind":"branch","expression":"path","branch":"true"} |
| 242:9 NavNode | AnimatedSidebarMenuButton label | onSelect=() =&gt; onToggle(node.id) | {"kind":"branch","expression":"path && unavailable","branch":"false"}; {"kind":"branch","expression":"path","branch":"false"} |
| 243:10 NavNode | AnimatedSidebarMenuItem  |  |  |
| 246:45 NavNode | Button  | onClick=() =&gt; onToggle(node.id); type="button" | aria-expanded=expanded[node.id] ?? false; {"kind":"logical","expression":"hasChildren && path && !collapsed","operator":"&&"} |
| 248:111 NavNode | NavNode  | onNavigate=onNavigate; onToggle=onToggle | {"kind":"logical","expression":"hasChildren && open","operator":"&&"}; {"kind":"container","tag":"AnimatedSidebarMenuSub","attributes":{"open":"true"}}; {"ki… |
| 314:23 Breadcrumb | BreadcrumbLink locale.t("NAV_HOME") | onClick=(event) =&gt; { event.preventDefault(); onNavigate?.("/"); }; href="/" |  |
| 322:33 NavIcon | Checks  |  | {"kind":"branch","expression":"path === \"/tasks\"","branch":"true"}; spread: props |
| 323:34 NavIcon | Kanban  |  | {"kind":"branch","expression":"path === \"/boards\"","branch":"true"}; earlier return: path === "/tasks"; spread: props |
| 324:41 NavIcon | Bell  |  | {"kind":"branch","expression":"path === \"/notifications\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; spread: … |
| 325:36 NavIcon | ChatCircle  |  | {"kind":"branch","expression":"path === \"/messages\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier retur… |
| 326:33 NavIcon | ChartLine  |  | {"kind":"branch","expression":"path === \"/graph\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 327:28 NavIcon | House  |  | {"kind":"branch","expression":"path === \"/\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: path … |
| 328:37 NavIcon | BookOpen  |  | {"kind":"branch","expression":"path === \"/knowledge\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier retu… |
| 329:34 NavIcon | UploadSimple  |  | {"kind":"branch","expression":"path === \"/submit\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return:… |
| 330:34 NavIcon | MagnifyingGlass  |  | {"kind":"branch","expression":"path === \"/search\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return:… |
| 331:33 NavIcon | Sparkle  |  | {"kind":"branch","expression":"path === \"/agent\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 332:42 NavIcon | Files  |  | {"kind":"branch","expression":"path === \"/my-submissions\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier… |
| 333:33 NavIcon | Target  |  | {"kind":"branch","expression":"path === \"/goals\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 334:36 NavIcon | FolderSimple  |  | {"kind":"branch","expression":"path === \"/projects\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier retur… |
| 335:36 NavIcon | CalendarBlank  |  | {"kind":"branch","expression":"path === \"/calendar\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier retur… |
| 336:33 NavIcon | CalendarBlank  |  | {"kind":"branch","expression":"path === \"/today\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 337:33 NavIcon | Timer  |  | {"kind":"branch","expression":"path === \"/focus\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 338:34 NavIcon | Check  |  | {"kind":"branch","expression":"path === \"/review\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return:… |
| 339:33 NavIcon | ShieldCheck  |  | {"kind":"branch","expression":"path === \"/admin\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: … |
| 340:45 NavIcon | NotePencil  |  | {"kind":"branch","expression":"path === \"/admin/submissions\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earl… |
| 341:40 NavIcon | Stack  |  | {"kind":"branch","expression":"path === \"/admin/assets\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier r… |
| 342:49 NavIcon | Trash  |  | {"kind":"branch","expression":"path === \"/admin/knowledge/trash\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; … |
| 343:41 NavIcon | UsersThree  |  | {"kind":"branch","expression":"path === \"/admin/members\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier … |
| 344:39 NavIcon | ShieldCheck  |  | {"kind":"branch","expression":"path === \"/admin/roles\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier re… |
| 345:39 NavIcon | DotsThree  |  | {"kind":"branch","expression":"path === \"/admin/menus\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier re… |
| 346:40 NavIcon | Stack  |  | {"kind":"branch","expression":"path === \"/admin/spaces\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier r… |
| 347:39 NavIcon | Scroll  |  | {"kind":"branch","expression":"path === \"/admin/audit\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier re… |
| 348:43 NavIcon | ChartLine  |  | {"kind":"branch","expression":"path === \"/admin/analytics\"","branch":"true"}; earlier return: path === "/tasks"; earlier return: path === "/boards"; earlie… |
| 349:10 NavIcon | DotsThree  |  | earlier return: path === "/tasks"; earlier return: path === "/boards"; earlier return: path === "/notifications"; earlier return: path === "/messages"; earli… |
| 403:10 AccountMenu | Popover  | onOpenChange=(next) =&gt; onActiveMenuChange(next ? menuId : null) | open=open |
| 405:7 AccountMenu | Button  | onKeyDown=(event) =&gt; { if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return; event.preventDefault(); focusOnOpen.current = event.key === "Arro… | {"kind":"container","tag":"Popover","attributes":{"open":"open"}} |
| 415:14 AccountMenu | PopoverContent  | onKeyDown=onMenuKeyDown | {"kind":"container","tag":"Popover","attributes":{"open":"open"}}; {"kind":"logical","expression":"open","operator":"&&"} |
| 417:7 AccountMenu | button locale.t("SHELL_SETTINGS") | onClick=selectSettings; type="button" | {"kind":"container","tag":"Popover","attributes":{"open":"open"}}; {"kind":"logical","expression":"open","operator":"&&"} |
| 420:9 AccountMenu | button locale.t("SHELL_THEME_LIGHT") / selectedThemeIndicator("light") | onClick=() =&gt; selectTheme("light"); type="button" | {"kind":"container","tag":"Popover","attributes":{"open":"open"}}; {"kind":"logical","expression":"open","operator":"&&"} |
| 421:9 AccountMenu | button locale.t("SHELL_THEME_DARK") / selectedThemeIndicator("dark") | onClick=() =&gt; selectTheme("dark"); type="button" | {"kind":"container","tag":"Popover","attributes":{"open":"open"}}; {"kind":"logical","expression":"open","operator":"&&"} |
| 422:9 AccountMenu | button locale.t("SHELL_THEME_SYSTEM") / selectedThemeIndicator("system") | onClick=() =&gt; selectTheme("system"); type="button" | {"kind":"container","tag":"Popover","attributes":{"open":"open"}}; {"kind":"logical","expression":"open","operator":"&&"} |
| 424:23 AccountMenu | p logoutError |  | {"kind":"container","tag":"Popover","attributes":{"open":"open"}}; {"kind":"logical","expression":"open","operator":"&&"}; {"kind":"logical","expression":"lo… |
| 425:7 AccountMenu | button logoutPending ? locale.t("SHELL_LOGGING_OUT") : locale.t("SHELL_LOGOUT") | onClick=onLogout; type="button" | disabled=logoutPending; {"kind":"container","tag":"Popover","attributes":{"open":"open"}}; {"kind":"logical","expression":"open","operator":"&&"} |
| 434:10 MobileNavigation | Sheet  | onOpenChange=setOpen | open=open |
| 434:52 MobileNavigation | details  |  | open=open; {"kind":"container","tag":"Sheet","attributes":{"open":"open"}} |
| 434:102 MobileNavigation | summary locale.t("SHELL_OPEN_NAVIGATION") | onClick=(event) =&gt; { event.preventDefault(); setOpen((current) =&gt; !current); } | {"kind":"container","tag":"Sheet","attributes":{"open":"open"}}; {"kind":"container","tag":"details","attributes":{"open":"open"}} |
| 434:953 MobileNavigation | Button  | type="button" | disabled=true; aria-disabled="true"; {"kind":"container","tag":"Sheet","attributes":{"open":"open"}}; {"kind":"container","tag":"details","attributes":{"open… |
| 434:1464 MobileNavigation | motion.a  | onClick=(event) =&gt; { event.preventDefault(); setOpen(false); onNavigate(path); }; href=path | {"kind":"container","tag":"Sheet","attributes":{"open":"open"}}; {"kind":"container","tag":"details","attributes":{"open":"open"}}; {"kind":"repeat","express… |
| 434:2356 MobileNavigation | AccountMenu  | onActiveMenuChange=onActiveMenuChange; onThemeChange=onThemeChange; onNavigate=(path) =&gt; { setOpen(false); onNavigate(path); }; onLogout=onLogout | {"kind":"container","tag":"Sheet","attributes":{"open":"open"}}; {"kind":"container","tag":"details","attributes":{"open":"open"}} |

## frontend/components/shell/command-palette.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 92:5 CommandPalette | Button  | onClick=() =&gt; setPaletteOpen(true); type="button" |  |
| 96:5 CommandPalette | Button  | onClick=() =&gt; setPaletteOpen(true); type="button" |  |
| 97:5 CommandPalette | BeuiCommandPalette  | onOpenChange=setPaletteOpen | open=open |

## frontend/components/shell/context-rail.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 34:7 ContextRail | Button  | onClick=onClose; type="button" |  |
| 37:32 ContextRail | a !collapsed && frontendText(locale, module.labelKey) | onClick=(event) =&gt; go(event, module.entryPath); href=module.entryPath | {"kind":"repeat","expression":"modules"} |
| 39:296 ContextRail | a frontendText(locale, route.labelKey) | onClick=(event) =&gt; go(event, route.path); href=route.path | {"kind":"logical","expression":"!collapsed && children.length &gt; 0","operator":"&&"}; {"kind":"repeat","expression":"children"} |
| 40:37 ContextRail | ButtonLink frontendText(locale, "SHELL_OPEN_MODULE") | onClick=(event) =&gt; go(event, currentModule.entryPath); href=currentModule.entryPath | {"kind":"logical","expression":"!collapsed && currentModule","operator":"&&"} |
| 47:60 ContextRail | Button frontendText(locale, "SHELL_OPEN_CONTEXT") | onClick=() =&gt; setMobileOpen(true); type="button" |  |
| 48:5 ContextRail | Sheet  | onOpenChange=setMobileOpen | open=mobileOpen |

## frontend/components/snapshot-target-detail.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 46:10 SnapshotTargetDetail | Dialog  | onOpenChange=open =&gt; {if (!open) onClose();} | open=true |
| 48:213 SnapshotTargetDetail | Button frontendText(locale, "TODAY_DETAIL_RETRY") | onClick=() =&gt; setRetry(value =&gt; value + 1) | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"bran… |
| 49:5 SnapshotTargetDetail | Button frontendText(locale, "TODAY_DETAIL_CLOSE") | onClick=onClose | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}} |

## frontend/components/submissions/submission-comments-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 28:21 SubmissionCommentsPanel | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry; type="button" | {"kind":"container","tag":"Card","attributes":{"aria-busy":"state.kind === \"loading\" ? \"true\" : undefined"}}; {"kind":"logical","expression":"state.kind … |

## frontend/components/submissions/submission-target-picker.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 20:31 SubmissionTargetPicker | div  |  | {"kind":"logical","expression":"view.kind === \"error\"","operator":"&&"} |
| 22:7 SubmissionTargetPicker | button text("SUBMIT_TARGET_RETRY") | onClick=() =&gt; actions.retry(); type="button" | {"kind":"logical","expression":"view.kind === \"error\"","operator":"&&"} |
| 25:34 SubmissionTargetPicker | p text("SUBMIT_TARGET_STORED_MISSING") |  | {"kind":"logical","expression":"view.storedTargetMissing","operator":"&&"} |
| 28:7 SubmissionTargetPicker | Select  | onChange=(event) =&gt; actions.selectSpace(event.target.value) | disabled=spaces.length === 0 |
| 29:32 SubmissionTargetPicker | option space.name |  | {"kind":"container","tag":"Select","attributes":{"disabled":"spaces.length === 0"}}; {"kind":"repeat","expression":"spaces"} |
| 34:7 SubmissionTargetPicker | Select  | onChange=(event) =&gt; actions.selectCollection(event.target.value === "" ? null : event.target.value) | disabled=view.spaceId === null &#124;&#124; !collectionsReady |
| 35:9 SubmissionTargetPicker | option text("SUBMIT_TARGET_COLLECTION_NONE") |  | {"kind":"container","tag":"Select","attributes":{"disabled":"view.spaceId === null &#124;&#124; !collectionsReady"}} |
| 36:62 SubmissionTargetPicker | option collection.name |  | {"kind":"container","tag":"Select","attributes":{"disabled":"view.spaceId === null &#124;&#124; !collectionsReady"}}; {"kind":"logical","expression":"collect… |
| 40:68 SubmissionTargetPicker | div  |  | {"kind":"logical","expression":"view.spaceId !== null && view.collections.kind === \"error\"","operator":"&&"} |
| 42:7 SubmissionTargetPicker | button text("SUBMIT_TARGET_COLLECTION_RETRY") | onClick=() =&gt; actions.retryCollections(); type="button" | {"kind":"logical","expression":"view.spaceId !== null && view.collections.kind === \"error\"","operator":"&&"} |
| 45:34 SubmissionTargetPicker | button text("SUBMIT_TARGET_MORE_COLLECTIONS") | onClick=() =&gt; actions.loadMoreCollections(); type="button" | {"kind":"logical","expression":"view.collections.hasMore","operator":"&&"} |
| 48:7 SubmissionTargetPicker | Select  | onChange=(event) =&gt; actions.selectVisibility(event.target.value === "admin_only" ? "admin_only" : "shared") |  |
| 49:9 SubmissionTargetPicker | option text("SUBMIT_TARGET_SHARED") |  |  |
| 50:9 SubmissionTargetPicker | option text("SUBMIT_TARGET_ADMIN_ONLY") |  |  |
| 53:28 SubmissionTargetPicker | button text("SUBMIT_TARGET_MORE_SPACES") | onClick=() =&gt; actions.loadMoreSpaces(); type="button" | {"kind":"logical","expression":"view.hasMoreSpaces","operator":"&&"} |

## frontend/components/timeline-create-form.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 51:5 TimelineCreateForm | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 132:39 TimelineCreateForm | p frontendText(locale, "PLANNING_CREATE_STORAGE_BLOCKED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"phase… |
| 132:116 TimelineCreateForm | Button frontendText(locale, "PLANNING_CREATE_STORAGE_RETRY") | onClick=reloadStored; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","… |
| 133:31 TimelineCreateForm | p frontendText(locale, "PLANNING_CREATE_UNKNOWN") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"phase… |
| 133:100 TimelineCreateForm | Button frontendText(locale, "PLANNING_CREATE_RETRY") | onClick=() =&gt; void submit(); type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","… |
| 134:35 TimelineCreateForm | p frontendText(locale, "PLANNING_CREATE_READ_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"phase… |
| 134:108 TimelineCreateForm | Button frontendText(locale, "PLANNING_CREATE_READ_RETRY") | onClick=() =&gt; { if (phaseRef.current === "read-failed") void readback(); }; type="button" | disabled=pending; {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","… |
| 135:15 TimelineCreateForm | p frontendText(locale, "PROJECT_TIMELINE_ACTION_FAILED") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"phase === \"writing\" &#124;&#124; phase === \"reading\""}}; {"kind":"logical","expression":"error… |
| 142:25 TimelineCreateForm | div  |  | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 142:168 TimelineCreateForm | Button frontendText(locale, "TIMELINE_DRAFT_RECORD_DISCARD") | onClick=discardRecord; type="button" | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 143:24 TimelineCreateForm | p recordNotice |  | {"kind":"logical","expression":"recordNotice","operator":"&&"} |
| 147:11 TimelineCreateForm | Select  | onChange=(event) =&gt; draft.edit("kind", event.currentTarget.value as ProjectTimelineKind) | disabled=locked; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |
| 148:13 TimelineCreateForm | option frontendText(locale, "PROJECT_TIMELINE_KIND_MEETING") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; {"kind":"container","tag":"Select","attributes":{"disabled":"locked"}} |
| 149:13 TimelineCreateForm | option frontendText(locale, "PROJECT_TIMELINE_KIND_DECISION") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; {"kind":"container","tag":"Select","attributes":{"disabled":"locked"}} |
| 150:13 TimelineCreateForm | option frontendText(locale, "PROJECT_TIMELINE_KIND_ACTION") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; {"kind":"container","tag":"Select","attributes":{"disabled":"locked"}} |
| 151:13 TimelineCreateForm | option frontendText(locale, "PROJECT_TIMELINE_KIND_MILESTONE") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; {"kind":"container","tag":"Select","attributes":{"disabled":"locked"}} |
| 154:9 TimelineCreateForm | Input  | onChange=(event) =&gt; draft.edit("title", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |
| 155:9 TimelineCreateForm | Textarea  | onChange=(event) =&gt; draft.edit("body", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |
| 158:11 TimelineCreateForm | Input  | onChange=(event) =&gt; draft.edit("startsAt", event.currentTarget.value); type="datetime-local" | disabled=locked; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |
| 162:11 TimelineCreateForm | Input  | onChange=(event) =&gt; draft.edit("dueAt", event.currentTarget.value); type="datetime-local" | disabled=locked; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |
| 164:40 TimelineCreateForm | Button frontendText(locale, "PROJECT_TIMELINE_CREATE") | onClick=() =&gt; void submit(); type="button" | disabled=locked &#124;&#124; !title.trim() &#124;&#124; !onCreate; {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}} |

## frontend/components/timeline-item-editor.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 69:5 TimelineItemEditor | owner.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, committed |  |
| 70:5 TimelineItemEditor | owner.addEventListener  | "beforeunload", warn |  |
| 112:23 TimelineItemEditor | Button frontendText(locale, "PROJECT_TIMELINE_EDIT") | onClick=() =&gt; { if (!alive.current &#124;&#124; current.current &#124;&#124; blocked()) return; const item = liveProps.current.item; const fields = { titl… | disabled=pending; {"kind":"branch","expression":"!editor","branch":"true"} |
| 122:10 TimelineItemEditor | div  | onKeyDown=event =&gt; { if (event.key === "Escape" && !event.defaultPrevented && !decisionRef.current) { event.preventDefault(); event.stopPropagation(); req… | earlier return: !editor |
| 127:109 TimelineItemEditor | Select  | onChange=event =&gt; edit("kind", event.currentTarget.value as ProjectTimelineItem["kind"]) | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; earlier return: !editor |
| 128:86 TimelineItemEditor | option frontendText(locale, &#96;PROJECT_TIMELINE_KIND_${value.toUpperCase()}&#96;) |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; {"kind":"repeat","expression":"([\"meeting\", \"decision\", \"action_item\", \"mile… |
| 130:110 TimelineItemEditor | Input  | onChange=event =&gt; edit("title", event.currentTarget.value) | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; earlier return: !editor |
| 131:123 TimelineItemEditor | Textarea  | onChange=event =&gt; edit("body", event.currentTarget.value) | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; earlier return: !editor |
| 132:110 TimelineItemEditor | Input  | onChange=event =&gt; edit("startsAt", event.currentTarget.value); type="datetime-local" | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; earlier return: !editor |
| 133:108 TimelineItemEditor | Input  | onChange=event =&gt; edit("dueAt", event.currentTarget.value); type="datetime-local" | {"kind":"container","tag":"fieldset","attributes":{"disabled":"locked"}}; earlier return: !editor |
| 135:20 TimelineItemEditor | p frontendText(locale, "PROJECT_TIMELINE_ACTION_FAILED") |  | {"kind":"logical","expression":"saveFailed","operator":"&&"}; earlier return: !editor |
| 136:15 TimelineItemEditor | p frontendText(locale, "PROJECT_TIMELINE_EDIT_STALE") |  | {"kind":"logical","expression":"stale","operator":"&&"}; earlier return: !editor |
| 137:17 TimelineItemEditor | p frontendText(locale, "PROJECT_TIMELINE_EDIT_INVALID") |  | {"kind":"logical","expression":"invalid","operator":"&&"}; earlier return: !editor |
| 138:33 TimelineItemEditor | Button frontendText(locale, "PROJECT_TIMELINE_EDIT_SAVE") | onClick=() =&gt; void save(); type="button" | disabled=locked &#124;&#124; invalid &#124;&#124; stale; earlier return: !editor |
| 138:192 TimelineItemEditor | Button frontendText(locale, "PROJECT_TIMELINE_EDIT_CANCEL") | onClick=requestClose; type="button" | disabled=locked; earlier return: !editor |
| 139:5 TimelineItemEditor | ConfirmAction  | onCancel=cancelDecision; onConfirm=confirmDecision | open=decision !== null; earlier return: !editor |

## frontend/components/today-target-detail.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 5:10 TodayTargetDetail | SnapshotTargetDetail  |  | spread: props |

## frontend/components/ui/alert.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 57:5 Alert | BeuiAlert icon / close |  | spread: props |
| 66:3 AlertTitle | BeuiAlertTitle  |  | spread: props |
| 73:3 AlertDescription | BeuiAlertDescription  |  | spread: props |
| 85:3 AlertClose | BeuiAlertClose  |  | spread: props |

## frontend/components/ui/applied-filters.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 29:5 AppliedFilters | div  |  | earlier return: filters.length === 0 |
| 33:11 AppliedFilters | button  | onClick=filter.onRemove; type="button" | {"kind":"repeat","expression":"filters"}; earlier return: filters.length === 0 |
| 36:7 AppliedFilters | Button clearLabel | onClick=onClear | earlier return: filters.length === 0 |

## frontend/components/ui/badge.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 38:3 Badge | AnimatedBadge  |  | spread: props |

## frontend/components/ui/button.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 40:5 Button | BeuiButton  | type=type | spread: (props as BeuiButtonProps) |

## frontend/components/ui/checkbox.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 16:10 Checkbox | input  | type="checkbox" | spread: props |

## frontend/components/ui/confirm-action.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 31:10 ConfirmAction | Dialog  | onOpenChange=(next) =&gt; { if (!next) onCancel(); } | open=open |
| 32:5 ConfirmAction | DialogContent  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |
| 36:9 ConfirmAction | Button cancelLabel | onClick=onCancel | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |
| 38:13 ConfirmAction | HoldActionButton confirmLabel | onActivate=onConfirm; onHoldComplete=onConfirm; type="horizontal" | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}}; {"kind":"branch","expression":"destructive","branch":"true"} |
| 48:13 ConfirmAction | Button confirmLabel | onClick=onConfirm | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}}; {"kind":"branch","expression":"destructive","branch":"false"} |

## frontend/components/ui/date-range-input.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 76:10 DateRangeInput | DateRangePicker  | onValueChange=(next) =&gt; onChange({ from: next?.from ?? "", to: next?.to ?? "" }) | disabled=disabled |
| 85:5 DateRangeInput | RangeControl  | onChange=onChange | disabled=disabled; {"kind":"container","tag":"DateRangePicker","attributes":{"disabled":"disabled"}} |
| 118:5 RangeControl | button  | onClick=() =&gt; setOpen(!open); type="button" | aria-expanded=open; disabled=disabled; spread: triggerProps |
| 133:14 RangeControl | div  | onKeyDown=(event) =&gt; { if (event.key !== "Escape") return; event.preventDefault(); event.stopPropagation(); setOpen(false); } | {"kind":"logical","expression":"open","operator":"&&"} |
| 149:13 RangeControl | button texts.clear | onClick=() =&gt; onChange({ from: "", to: "" }); type="button" | disabled=disabled &#124;&#124; !stated; {"kind":"logical","expression":"open","operator":"&&"} |

## frontend/components/ui/dialog.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 99:7 DialogContent | MorphingModal children | onClose=() =&gt; onOpenChange?.(false) | {"kind":"branch","expression":"variant === \"morph\"","branch":"true"}; earlier return: !open |
| 113:5 DialogContent | CenterMorphModal  | onOpenChange=(next) =&gt; { if (!next) onOpenChange?.(false); } | open=true; earlier return: !open; earlier return: variant === "morph" |
| 131:99 DialogTitle | h2  |  | spread: props |

## frontend/components/ui/expandable-tabs.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 36:5 ExpandableTabs | div  |  |  |
| 40:11 ExpandableTabs | motion.button  | onClick=() =&gt; onValueChange(active ? null : item.id); type="button" | {"kind":"repeat","expression":"items"} |

## frontend/components/ui/filter-disclosure.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 58:7 FilterDisclosure | Button  | onClick=() =&gt; setOpen(true); type="button" | aria-expanded=open; earlier return: !mobile |
| 77:14 FilterDisclosure | Sheet  | onOpenChange=setOpen | open=true; {"kind":"logical","expression":"open","operator":"&&"}; earlier return: !mobile |

## frontend/components/ui/filter-select.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 37:7 FilterSelect | Combobox  | onValueChange=onChange | disabled=disabled |
| 44:19 FilterSelect | button  | type="button" | disabled=disabled; {"kind":"container","tag":"Combobox","attributes":{"disabled":"disabled"}} |

## frontend/components/ui/focus-scope.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 40:5 useFocusScope | root.addEventListener  | "keydown", onKeyDown | earlier return: !active &#124;&#124; !root &#124;&#124; typeof document === "undefined" |

## frontend/components/ui/input.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 35:5 Input | input  | type=type | spread: props |

## frontend/components/ui/label.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 11:37 Label | label  |  | spread: props |

## frontend/components/ui/page-state.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 23:35 PageState | Alert children |  | {"kind":"branch","expression":"kind === \"degraded\"","branch":"true"}; earlier return: kind === "loading"; earlier return: kind === "empty" |
| 24:10 PageState | Alert children |  | earlier return: kind === "loading"; earlier return: kind === "empty"; earlier return: kind === "degraded" |

## frontend/components/ui/pagination.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 44:145 PaginationContent | ol  |  | spread: props |
| 47:118 PaginationItem | li  |  | spread: props |
| 51:187 PaginationLink | Button  | type=type | spread: props |
| 54:103 PaginationEllipsis | span … |  | aria-hidden="true"; spread: props |
| 56:151 PaginationPrevious | PaginationLink  |  | spread: props |
| 59:147 PaginationNext | PaginationLink  |  | spread: props |
| 69:10 Pagination | nav  |  | earlier return: !safePageCount; spread: props |
| 70:5 Pagination | PaginationPrevious  | onClick=() =&gt; onPageChange?.(previousPage) | disabled=disabled &#124;&#124; safeCurrentPage &lt;= 1; earlier return: !safePageCount |
| 73:37 Pagination | PaginationLink token | onClick=() =&gt; onPageChange?.(token) | disabled=disabled &#124;&#124; token &gt; lastAllowedPage; {"kind":"repeat","expression":"tokens"}; {"kind":"branch","expression":"token === \"ellipsis\"","b… |
| 74:5 Pagination | PaginationNext  | onClick=() =&gt; onPageChange?.(safeCurrentPage + 1) | disabled=disabled &#124;&#124; safeCurrentPage &gt;= lastAllowedPage; earlier return: !safePageCount |

## frontend/components/ui/select.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 16:135 Select | select children |  | spread: props |
| 19:113 SelectOption | option  |  | spread: props |

## frontend/components/ui/sheet.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 59:17 SheetContent | div children |  | earlier return: !open |
| 63:12 SheetContent | BottomSheet scope | onOpenChange=(next) =&gt; { onOpenChange?.(next); } | open=true; {"kind":"branch","expression":"side === \"bottom\"","branch":"true"}; earlier return: !open |
| 66:5 SheetContent | Drawer scope | onOpenChange=(next) =&gt; { onOpenChange?.(next); } | open=true; earlier return: !open; earlier return: side === "bottom" |
| 72:95 SheetHeader | div  |  | spread: props |
| 73:98 SheetTitle | h2  |  | spread: props |
| 76:10 SheetClose | button  | onClick=(event) =&gt; { onClick?.(event); if (!event.defaultPrevented) onOpenChange?.(false); }; type="button" | spread: props |

## frontend/components/ui/skeleton.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 18:3 Skeleton | div  |  | aria-busy="true"; spread: props |

## frontend/components/ui/summary-row.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 33:21 SummaryRow | Button frontendText(locale, expanded ? "COMMON_COLLAPSE" : "COMMON_EXPAND") | onClick=() =&gt; setExpanded((current) =&gt; !current); type="button" | aria-expanded=expanded; {"kind":"logical","expression":"overflowing","operator":"&&"} |

## frontend/components/ui/tabs.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 67:5 Tabs | MotionTabs children | onValueChange=setValue | spread: props |
| 73:10 TabsList | MotionTabsList  | onKeyDown=(event) =&gt; { onKeyDown?.(event); if (event.defaultPrevented) return; const action = tabsKeyAction(event.key, context.orientation); if (!action) … | spread: props |
| 103:10 TabsTrigger | MotionTabsTrigger  |  | disabled=disabled; aria-disabled=disabled ? "true" : undefined; spread: props |
| 121:10 TabsContent | MotionTabsContent  |  | spread: props |

## frontend/components/ui/textarea.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 13:5 Textarea | textarea  |  | spread: props |

## frontend/components/ui/tooltip.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 44:10 TooltipProvider | BeuiTooltipProvider  |  | spread: props |
| 48:10 Tooltip | BeuiTooltip  |  | spread: props |
| 52:10 TooltipTrigger | BeuiTooltipTrigger  |  | spread: props |
| 56:10 TooltipContent | BeuiTooltipContent  |  | spread: props |

## frontend/components/ui/typed-confirm-action.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 52:10 TypedConfirmAction | Dialog  | onOpenChange=(next) =&gt; { if (!next) onCancel(); } | open=open |
| 53:5 TypedConfirmAction | DialogContent  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |
| 60:7 TypedConfirmAction | Input  | onChange=(event) =&gt; setTyped(event.target.value) | disabled=pending; {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |
| 63:9 TypedConfirmAction | Button cancelLabel | onClick=onCancel | disabled=pending; {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |
| 64:9 TypedConfirmAction | SlideActionButton confirmLabel | onActivate=confirm; onComplete=confirm | disabled=blocked; {"kind":"container","tag":"Dialog","attributes":{"open":"open"}} |

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

## frontend/features/environments/environment-files-surface.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 26:37 EnvironmentFiles | section  |  | aria-busy=vm.status === 'preparing'; {"kind":"branch","expression":"vm.status !== 'ready'","branch":"true"} |
| 30:7 EnvironmentFiles | Button t('ENV_FILES_CLOSE') | onClick=onClose; type="button" | earlier return: vm.status !== 'ready' |
| 34:7 EnvironmentFiles | Button t('ENV_START_VM') | type="button" | disabled=true; aria-disabled="true"; earlier return: vm.status !== 'ready' |

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
| 25:96 EnvironmentsPage | p frontendText(locale,'ENV_FORBIDDEN') |  | {"kind":"branch","expression":"!routeAccessAllowed(session,{capability:null,requiredPermission:'workspace.vm'})","branch":"true"} |
| 40:39 EnvironmentRuntimeNotice | div  |  | {"kind":"branch","expression":"vm.status==='unavailable'","branch":"true"}; earlier return: vm.status==='preparing' |
| 110:5 EnvironmentView | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 140:214 EnvironmentView | p t('ENV_ACCOUNT_CLOSED') |  | {"kind":"branch","expression":"state.closed","branch":"true"} |
| 143:93 EnvironmentView | Button t('ENV_CREATE') | onClick=()=&gt;{if(alive.current && !operationBlocked() && !draft.isConfirming() && !editRef.current && !removeRef.current)setCreateOpen(true);}; type="button" | aria-expanded=createOpen; disabled=blocked; earlier return: state.closed |
| 144:37 EnvironmentView | div  |  | {"kind":"logical","expression":"(state.error &#124;&#124; localError)","operator":"&&"}; earlier return: state.closed |
| 145:31 EnvironmentView | div  |  | {"kind":"logical","expression":"state.recoveryBlocked","operator":"&&"}; earlier return: state.closed |
| 147:7 EnvironmentView | Button t('ENV_RECHECK_RECOVERY') | onClick=()=&gt;void run(()=&gt;manager.recheckRecovery()) | disabled=state.writing; {"kind":"logical","expression":"state.recoveryBlocked","operator":"&&"}; earlier return: state.closed |
| 151:45 EnvironmentView | Button t('ENV_LOOKUP_RESULT') | onClick=()=&gt;void run(()=&gt;manager.lookup()) | disabled=state.writing; {"kind":"logical","expression":"state.pending","operator":"&&"}; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.wri… |
| 151:180 EnvironmentView | Button t('ENV_RETRY_WRITE') | onClick=()=&gt;void run(()=&gt;manager.retry()) | disabled=state.writing; {"kind":"logical","expression":"state.pending","operator":"&&"}; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.wri… |
| 153:25 EnvironmentView | div  |  | {"kind":"logical","expression":"state.confirmed","operator":"&&"}; earlier return: state.closed |
| 160:5 EnvironmentView | Dialog  | onOpenChange=open=&gt;{if(!open)setCreateOpen(false);} | open=createOpen; earlier return: state.closed |
| 162:25 EnvironmentView | div  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; {"kind":"logical","expression":"recordBlocked","operator":"&&"}; earlier return: stat… |
| 162:147 EnvironmentView | Button t('ENV_DRAFT_RECORD_DISCARD') | onClick=discardRecord; type="button" | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; {"kind":"logical","expression":"recordBlocked","operator":"&&"}; earlier return: stat… |
| 163:24 EnvironmentView | p recordNotice |  | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; {"kind":"logical","expression":"recordNotice","operator":"&&"}; earlier return: state… |
| 164:7 EnvironmentView | form  | onSubmit=event=&gt;{event.preventDefault();if(!alive.current &#124;&#124; operationBlocked() &#124;&#124; draft.isConfirming() &#124;&#124; editRef.current &… | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; earlier return: state.closed |
| 165:9 EnvironmentView | Input  | onChange=value=&gt;draft.edit('name',value) | disabled=blocked; {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; {"kind":"container","tag":"form","attributes":{}}; earlier return: … |
| 166:113 EnvironmentView | MotionSelect  | onValueChange=value=&gt;draft.edit('type',value==='temporary'?'temporary':'personal') | disabled=blocked; {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; {"kind":"container","tag":"form","attributes":{}}; earlier return: … |
| 167:9 EnvironmentView | Input  | onChange=value=&gt;draft.edit('taskId',value) | disabled=blocked; {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; {"kind":"container","tag":"form","attributes":{}}; earlier return: … |
| 168:66 EnvironmentView | Button t('ENV_CANCEL') | onClick=()=&gt;setCreateOpen(false); type="button" | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; {"kind":"container","tag":"form","attributes":{}}; earlier return: state.closed |
| 168:198 EnvironmentView | Button t('ENV_CREATE') | type="submit" | disabled=blocked &#124;&#124; !title.trim(); {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}}; {"kind":"container","tag":"form","attrib… |
| 171:53 EnvironmentView | FilterSelect  | onChange=value=&gt;void run(()=&gt;manager.load(1,value as ''&#124;EnvironmentType)) | disabled=state.loading &#124;&#124; state.writing; earlier return: state.closed |
| 171:390 EnvironmentView | Button t('ENV_REFRESH') | onClick=()=&gt;void run(()=&gt;manager.load()) | disabled=state.loading &#124;&#124; state.writing; earlier return: state.closed |
| 172:5 EnvironmentView | AppliedFilters  | onClear=()=&gt;void run(()=&gt;manager.load(1,'')) | earlier return: state.closed |
| 174:7 EnvironmentView | DataTable  | onPageChange=goToPage; onPageSizeChange=changePageSize; onLoadMore=loadMore | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.loading"}}; earlier return: state.closed |
| 191:141 EnvironmentView | Button t('ENV_FILES') | onClick=()=&gt;{if(alive.current)setSelected(item);} | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.loading"}}; earlier return: state.closed |
| 191:272 EnvironmentView | Button t('ENV_RENAME') | onClick=()=&gt;{if(alive.current && !operationBlocked() && !draft.isConfirming() && !editRef.current && !removeRef.current){editRef.current=item;setEdit(item… | disabled=blocked; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.loading"}}; earlier return: state.closed |
| 191:528 EnvironmentView | Button t('ENV_DELETE') | onClick=()=&gt;{if(alive.current && !operationBlocked() && !draft.isConfirming() && !editRef.current && !removeRef.current){removeRef.current=item;setRemove(… | disabled=blocked; {"kind":"container","tag":"div","attributes":{"aria-busy":"state.loading"}}; earlier return: state.closed |
| 196:21 EnvironmentView | EnvironmentFiles  | onClose=()=&gt;setSelected(null) | {"kind":"logical","expression":"selectedRow","operator":"&&"}; earlier return: state.closed |
| 197:14 EnvironmentView | EnvironmentRenameDialog  | onName=reportRename; onClose=()=&gt;{if(editRef.current===edit){editRef.current=null;setEdit(null);setRenameSeed(null);if(!recordBlocked)persistEnvironmentDr… | {"kind":"logical","expression":"edit","operator":"&&"}; earlier return: state.closed |
| 198:5 EnvironmentView | Dialog  | onOpenChange=open=&gt;{if(!open)closeRemove();} | open=!!remove; earlier return: state.closed |
| 198:378 EnvironmentView | Button t('ENV_DELETE') | onClick=()=&gt;{const item=removeRef.current;if(!alive.current &#124;&#124; !item &#124;&#124; operationBlocked() &#124;&#124; draft.isConfirming())return;cl… | disabled=blocked; {"kind":"container","tag":"Dialog","attributes":{"open":"!!remove"}}; earlier return: state.closed |
| 198:704 EnvironmentView | Button t('ENV_CANCEL') | onClick=closeRemove | {"kind":"container","tag":"Dialog","attributes":{"open":"!!remove"}}; earlier return: state.closed |

## frontend/features/environments/files/asset-import-panel.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 25:37 VmAssetImportPanel | Checkbox  | onChange=e=&gt;setUploadAck(e.target.checked) | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"canUpload","operator":"&&"}; earlier r… |
| 26:7 VmAssetImportPanel | Button t('Upload / retry identical file','上传 / 重试同一文件') | onClick=()=&gt;void model.upload(uploadAck) | disabled=busy&#124;&#124;!uploadAck&#124;&#124;flow?.error==='storage'; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logi… |
| 31:7 VmAssetImportPanel | Button t('Read server status (no replay)','回读服务端状态（不重放）') | onClick=()=&gt;void model.refresh() | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.intent","operator":"&&"}; earlie… |
| 33:9 VmAssetImportPanel | Button t('Start / retry parsing','启动 / 重试解析') | onClick=()=&gt;void model.parse() | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.intent","operator":"&&"}; {"kind… |
| 34:9 VmAssetImportPanel | Button t('Cancel pending server asset','取消服务端待处理资产') | onClick=()=&gt;void model.cancel() | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.intent","operator":"&&"}; {"kind… |
| 36:33 VmAssetImportPanel | Button t('Release failed local intent (keeps server asset)','解除失败的本地意图（保留服务端资产）') | onClick=()=&gt;void model.releaseFailed() | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.intent","operator":"&&"}; {"kind… |
| 37:36 VmAssetImportPanel | Button t('Read parsed content for review','读取解析内容供确认') | onClick=()=&gt;void model.previewParsed() | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.intent","operator":"&&"}; {"kind… |
| 40:9 VmAssetImportPanel | Button t('Retry original review submission','重试原审核提交') | onClick=()=&gt;void model.retrySubmission() | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.intent","operator":"&&"}; {"kind… |
| 43:20 VmAssetImportPanel | pre state.parsed.markdown |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.parsed","operator":"&&"}; earlier return: state… |
| 45:58 VmAssetImportPanel | Input  | onChange=e=&gt;setTitle(e.target.value) | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"editable","operator":"&&"}; earlier re… |
| 46:99 VmAssetImportPanel | Input  | onChange=e=&gt;setSpace(e.target.value) | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"editable","operator":"&&"}; earlier re… |
| 47:68 VmAssetImportPanel | Select  | onChange=e=&gt;setVisibility(e.target.value as 'shared'&#124;'admin_only') | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"editable","operator":"&&"}; earlier re… |
| 47:180 VmAssetImportPanel | option t('Shared','共享') |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"editable","operator":"&&"}; {"kind":"container","tag"… |
| 47:230 VmAssetImportPanel | option t('Administrators only','仅管理员') |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"editable","operator":"&&"}; {"kind":"container","tag"… |
| 48:37 VmAssetImportPanel | Checkbox  | onChange=e=&gt;setReviewAck(e.target.checked) | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"editable","operator":"&&"}; earlier re… |
| 49:7 VmAssetImportPanel | Button t('Submit parsed content for review','提交解析内容审核') | onClick=()=&gt;void model.submit({title,target:{requestedSpaceId:space,requestedCollectionId:null,requestedVisibility:visibility},acknowledged:reviewAck}) | disabled=busy&#124;&#124;!reviewAck&#124;&#124;!title.trim()&#124;&#124;!space.trim(); {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}… |
| 51:34 VmAssetImportPanel | p state.error==='ASSET_STORAGE_NOT_CONFIGURED'?t('Object storage is disabled. No asset will be uploaded; this cannot fall back to direct publication.','对象存储未启用… |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"(state.error&#124;&#124;flow?.error)","operator":"&&"… |
| 52:32 VmAssetImportPanel | p t('Review submission received','已收到审核提交记录') / : / flow.submissionId |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.kind==='submitted'","operator":"&&"}; earlier r… |
| 53:31 VmAssetImportPanel | p t('Server cancellation confirmed','服务端已确认取消') |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.kind==='canceled'","operator":"&&"}; earlier re… |
| 54:31 VmAssetImportPanel | p t('Local failed intent released; server asset retained','已解除失败的本地意图，服务端资产仍保留') |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"flow?.kind==='released'","operator":"&&"}; earlier re… |
| 55:5 VmAssetImportPanel | a t('My submissions','我的提交') | href="/my-submissions" | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; earlier return: state.kind==='idle' |
| 56:12 VmAssetImportPanel | Button t('Stop waiting (not server cancellation)','停止等待（不撤销服务端操作）') | onClick=()=&gt;model.stop() | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"busy","operator":"&&"}; earlier return: state.kind===… |
| 57:5 VmAssetImportPanel | Button t('Close (keep pending recovery metadata)','关闭（保留未决恢复元数据）') | onClick=()=&gt;model.close() | disabled=busy; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; earlier return: state.kind==='idle' |

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
| 19:12 KnowledgeImportPanel | p t('Waiting for receipt…','等待回执…') |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"busy","operator":"&&"}; earlier return: state.kind===… |
| 22:7 KnowledgeImportPanel | pre state.preview.draft.content |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.preview","operator":"&&"}; earlier return: stat… |
| 23:49 KnowledgeImportPanel | Input  | onChange=e=&gt;setTitle(e.target.value) | disabled=!editable; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.preview","operator":"&&"}; … |
| 24:99 KnowledgeImportPanel | Input  | onChange=e=&gt;setSpace(e.target.value) | disabled=!editable; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.preview","operator":"&&"}; … |
| 25:98 KnowledgeImportPanel | Select  | onChange=e=&gt;setVisibility(e.target.value as 'shared'&#124;'admin_only') | disabled=!editable; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.preview","operator":"&&"}; … |
| 25:215 KnowledgeImportPanel | option t('Shared','共享') |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.preview","operator":"&&"}; {"kind":"container",… |
| 25:265 KnowledgeImportPanel | option t('Administrators only','仅管理员') |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.preview","operator":"&&"}; {"kind":"container",… |
| 26:49 KnowledgeImportPanel | Checkbox  | onChange=e=&gt;setAck(e.target.checked) | disabled=!editable; {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.preview","operator":"&&"}; … |
| 27:18 KnowledgeImportPanel | Button t('Confirm submission for review','确认提交审核') | onClick=()=&gt;void model.confirm({title,target:{requestedSpaceId:space,requestedCollectionId:null,requestedVisibility:visibility},acknowledged:ack}) | disabled=!ack&#124;&#124;!title.trim()&#124;&#124;!space.trim(); {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","e… |
| 29:19 KnowledgeImportPanel | p state.error==='IMPORT_OUTCOME_UNKNOWN'?t('Outcome unknown. Check My submissions, or explicitly retry the same key and original payload. Closing the session c… |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.error","operator":"&&"}; earlier return: state.… |
| 30:30 KnowledgeImportPanel | Button t('Retry original submission','重试原提交') | onClick=()=&gt;void model.retry() | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.kind==='unknown'","operator":"&&"}; earlier ret… |
| 31:32 KnowledgeImportPanel | p t('Submission record received; inspect its review status:','已收到提交记录，请查看审核状态：') / state.receipt?.id |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"state.kind==='submitted'","operator":"&&"}; earlier r… |
| 32:58 KnowledgeImportPanel | a t('My submissions','我的提交') | href="/my-submissions" | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"(state.kind==='unknown'&#124;&#124;state.kind==='subm… |
| 33:37 KnowledgeImportPanel | Button t('Close','关闭') | onClick=()=&gt;model.close() | {"kind":"container","tag":"section","attributes":{"aria-busy":"busy"}}; {"kind":"logical","expression":"!busy&&state.kind!=='unknown'","operator":"&&"}; earl… |

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
| 80:5 useAdminRolesController | owner.addEventListener  | "beforeunload", warn |  |

## frontend/lib/asset-upload-transport.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 26:7 xhrUploadRequester | init.signal?.addEventListener  | "abort", abort, { once: true } | earlier return: init.signal?.aborted |

## frontend/lib/hooks/use-dismiss.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 67:3 consumeActivation | window.addEventListener  | "click", swallow, true |  |
| 68:3 consumeActivation | window.addEventListener  | "pointerdown", restart, true |  |
| 69:3 consumeActivation | window.addEventListener  | "pointercancel", restart, true |  |
| 70:3 consumeActivation | window.addEventListener  | "keydown", release, true |  |
| 112:5 useDismiss | window.addEventListener  | "keydown", onKey | earlier return: !open |
| 113:5 useDismiss | window.addEventListener  | "pointerdown", onPointer, true | earlier return: !open |

## frontend/lib/hooks/use-hover-capable.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 18:5 useHoverCapable | mq.addEventListener  | "change", update | earlier return: typeof window === "undefined" &#124;&#124; !window.matchMedia |

## frontend/lib/hooks/use-modal-scope.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 87:5 useModalScope | document.addEventListener  | "focusin", onFocus | earlier return: !open &#124;&#124; !root.current &#124;&#124; !panel.current |
| 88:5 useModalScope | document.addEventListener  | "keydown", onKey | earlier return: !open &#124;&#124; !root.current &#124;&#124; !panel.current |

## frontend/lib/hooks/use-touch-capable.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 26:5 useTouchCapable | mq?.addEventListener  | "change", update | earlier return: typeof window === "undefined" |

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
| 123:41 useSavedViews | ConfirmAction  | onCancel=cancelDelete; onConfirm=confirmDelete | open=deletion !== null |

## frontend/lib/use-submission-draft.ts

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 430:5 useSubmissionDraft | window.addEventListener  | "pagehide", flush | earlier return: !enabled |
| 431:5 useSubmissionDraft | document.addEventListener  | "visibilitychange", onHidden | earlier return: !enabled |

## frontend/lib/use-toast.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 28:7 ToastProvider | AnimatedToastStack  | onDismiss=stack.dismissToast |  |

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
| 35:16 AdminDashboardPage | Button frontendText(locale, "ADMIN_METRIC_REFRESH") | onClick=onRefresh | disabled=pending |
| 44:43 AdminDashboardPage | p frontendText(locale, "ADMIN_METRIC_LOADING") |  | {"kind":"repeat","expression":"cards"}; {"kind":"container","tag":"Card","attributes":{"aria-busy":"metric.kind === \"loading\""}}; {"kind":"logical","expres… |
| 49:41 AdminDashboardPage | div  |  | {"kind":"repeat","expression":"cards"}; {"kind":"container","tag":"Card","attributes":{"aria-busy":"metric.kind === \"loading\""}}; {"kind":"logical","expres… |
| 50:15 AdminDashboardPage | Button frontendText(locale, "COMMON_RETRY") | onClick=() =&gt; onRetry(key) | {"kind":"repeat","expression":"cards"}; {"kind":"container","tag":"Card","attributes":{"aria-busy":"metric.kind === \"loading\""}}; {"kind":"logical","expres… |
| 53:43 AdminDashboardPage | ButtonLink frontendText(locale, "ADMIN_METRIC_OPEN") | href=href | {"kind":"repeat","expression":"cards"}; {"kind":"container","tag":"Card","attributes":{"aria-busy":"metric.kind === \"loading\""}}; {"kind":"logical","expres… |
| 62:40 AdminDashboardPage | p frontendText(locale, "ADMIN_SUMMARY_LOADING") |  | {"kind":"container","tag":"Card","attributes":{"aria-busy":"trend.kind === \"loading\""}}; {"kind":"logical","expression":"trend.kind === \"loading\"","opera… |
| 64:38 AdminDashboardPage | div  |  | {"kind":"container","tag":"Card","attributes":{"aria-busy":"trend.kind === \"loading\""}}; {"kind":"logical","expression":"trend.kind === \"error\"","operato… |
| 66:13 AdminDashboardPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetryTrend | {"kind":"container","tag":"Card","attributes":{"aria-busy":"trend.kind === \"loading\""}}; {"kind":"logical","expression":"trend.kind === \"error\"","operato… |
| 87:43 AdminDashboardPage | p frontendText(locale, "ADMIN_SUMMARY_LOADING") |  | {"kind":"container","tag":"Card","attributes":{"aria-busy":"activity.kind === \"loading\""}}; {"kind":"logical","expression":"activity.kind === \"loading\"",… |
| 89:41 AdminDashboardPage | div  |  | {"kind":"container","tag":"Card","attributes":{"aria-busy":"activity.kind === \"loading\""}}; {"kind":"logical","expression":"activity.kind === \"error\"","o… |
| 91:13 AdminDashboardPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetryActivity | {"kind":"container","tag":"Card","attributes":{"aria-busy":"activity.kind === \"loading\""}}; {"kind":"logical","expression":"activity.kind === \"error\"","o… |
| 110:88 AdminDashboardPage | ButtonLink frontendText(locale, labelKey) | href=href | {"kind":"logical","expression":"links.length &gt; 0","operator":"&&"}; {"kind":"repeat","expression":"links"} |

## frontend/pages/admin/admin-dashboard-route.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 120:10 DashboardMetrics | AdminDashboardPage  | onRetry=load; onRetryTrend=loadSummary; onRetryActivity=loadSummary; onRefresh=refresh |  |

## frontend/pages/admin/admin-forbidden-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 10:10 AdminForbiddenPage | section  |  |  |

## frontend/pages/admin/analytics-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 15:17 AdminAnalyticsPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRefresh; type="button" | disabled=pending |
| 20:132 AdminAnalyticsPage | Select  | onChange=(event) =&gt; onDaysChange?.(Number(event.target.value)) | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending &#124;&#124; state.kind === \"loading\" &#124;&#124; undefined"}} |
| 20:296 AdminAnalyticsPage | option frontendText(locale, "ADMIN_ANALYTICS_RANGE_CUSTOM").replace("{days}", String(days)) |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending &#124;&#124; state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"logical","… |
| 20:413 AdminAnalyticsPage | option frontendText(locale, "ADMIN_ANALYTICS_RANGE_7") |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending &#124;&#124; state.kind === \"loading\" &#124;&#124; undefined"}} |
| 20:489 AdminAnalyticsPage | option frontendText(locale, "ADMIN_ANALYTICS_RANGE_14") |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending &#124;&#124; state.kind === \"loading\" &#124;&#124; undefined"}} |
| 20:567 AdminAnalyticsPage | option frontendText(locale, "ADMIN_ANALYTICS_RANGE_30") |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending &#124;&#124; state.kind === \"loading\" &#124;&#124; undefined"}} |
| 20:654 AdminAnalyticsPage | Button frontendText(locale, "ADMIN_ANALYTICS_REFRESH") | onClick=onRefresh; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-busy":"pending &#124;&#124; state.kind === \"loading\" &#124;&#124; undefined"}} |
| 25:33 AdminAnalyticsPage | p frontendText(locale, "ADMIN_ANALYTICS_STALE") |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending &#124;&#124; state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","e… |
| 29:158 AdminAnalyticsPage | div retry |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending &#124;&#124; state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","e… |
| 29:316 AdminAnalyticsPage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending &#124;&#124; state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","e… |
| 64:10 DailyChart | div  |  | earlier return: rows.length === 0 |

## frontend/pages/admin/asset-queue-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 39:16 AssetQueuePage | FilterSelect  | onChange=(value) =&gt; onStatusChange?.(value as "" &#124; AdminAssetStatus) | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}} |
| 39:463 AssetQueuePage | AppliedFilters  | onClear=() =&gt; onStatusChange?.("") | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}} |
| 46:159 AssetQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"loading","branch":"false"}; … |
| 47:29 AssetQueuePage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"loading","branch":"false"}; … |
| 47:191 AssetQueuePage | Button frontendText(locale, "ADMIN_ASSET_RETRY_RECORD_DISCARD") | onClick=onDiscardRecord; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"loading","branch":"false"}; … |
| 47:378 AssetQueuePage | p previewError &#124;&#124; retryError &#124;&#124; localError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"loading","branch":"false"}; … |
| 47:519 AssetQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"loading","… |
| 47:700 AssetQueuePage | div frontendText(locale, "ADMIN_ASSET_READ_REQUIRED") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"loading","branch":"false"}; … |
| 47:812 AssetQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"loading","… |
| 47:956 AssetQueuePage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"loading","branch":"false"}; … |
| 64:206 AssetQueuePage | Button previewLoading ? frontendText(locale, "ADMIN_ASSET_PREVIEW_LOADING") : frontendText(locale, "ADMIN_ASSET_PREVIEW") | onClick=() =&gt; onPreview?.(asset.id) | disabled=pending &#124;&#124; previewLoading; {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"bran… |
| 64:553 AssetQueuePage | Button frontendText(locale, "ADMIN_ASSET_RETRY") | onClick=() =&gt; request(asset) | disabled=!onRetry &#124;&#124; pending &#124;&#124; forbidden &#124;&#124; pendingIds.includes(asset.id); {"kind":"container","tag":"section","attributes":{"… |
| 66:145 AssetQueuePage | ConfirmAction  | onCancel=cancel; onConfirm=confirm | open=valid |

## frontend/pages/admin/audit-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 14:28 AuditPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry; type="button" | disabled=pending; {"kind":"logical","expression":"onRetry","operator":"&&"} |
| 19:16 AuditPage | FilterSelect  | onChange=(value) =&gt; onActionChange?.(value) | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-busy":"pending &#124;&#124; state.kind === \"loading\" &#124;&#124; undefined"}} |
| 20:5 AuditPage | AppliedFilters  | onClear=() =&gt; onActionChange?.("") | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending &#124;&#124; state.kind === \"loading\" &#124;&#124; undefined"}} |
| 29:20 AuditPage | div retry |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending &#124;&#124; state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","e… |
| 30:5 AuditPage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending &#124;&#124; state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","e… |
| 55:15 AuditPage | a label | href=&#96;${base}/${encodeURIComponent(id)}&#96; | {"kind":"container","tag":"section","attributes":{"aria-busy":"pending &#124;&#124; state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","e… |

## frontend/pages/admin/create-role-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 56:5 AdminRoleCreatePage | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 84:7 AdminRoleCreatePage | Button ← / frontendText(locale, "ADMIN_ROLES_LIST") | onClick=back; type="button" |  |
| 87:22 AdminRoleCreatePage | div  |  | {"kind":"logical","expression":"draftBlocked","operator":"&&"} |
| 87:158 AdminRoleCreatePage | Button frontendText(locale, "ADMIN_ROLE_DRAFT_RECORD_DISCARD") | onClick=discardDraft; type="button" | {"kind":"logical","expression":"draftBlocked","operator":"&&"} |
| 88:21 AdminRoleCreatePage | p draftNotice |  | {"kind":"logical","expression":"draftNotice","operator":"&&"} |
| 90:7 AdminRoleCreatePage | Input  | onChange=(value) =&gt; draft.edit("newKey", value) | disabled=locked |
| 91:7 AdminRoleCreatePage | Input  | onChange=(value) =&gt; draft.edit("newName", value) | disabled=locked |
| 92:7 AdminRoleCreatePage | Input  | onChange=(value) =&gt; draft.edit("newMask", value) | disabled=locked |
| 93:250 AdminRoleCreatePage | Checkbox  | onCheckedChange=() =&gt; toggle(key) | disabled=locked; {"kind":"repeat","expression":"permissionGroups"}; {"kind":"repeat","expression":"group.keys"} |
| 94:21 AdminRoleCreatePage | p saveError |  | {"kind":"logical","expression":"saveError","operator":"&&"} |
| 96:9 AdminRoleCreatePage | Button saving ? frontendText(locale, "ADMIN_ROLES_SAVING") : frontendText(locale, "ADMIN_ROLES_CREATE") | onClick=() =&gt; { void submit(); }; type="button" | disabled=locked &#124;&#124; !onCreate &#124;&#124; !newKey &#124;&#124; !newName |
| 97:9 AdminRoleCreatePage | Button frontendText(locale, "COMMON_CANCEL") | onClick=back; type="button" | disabled=locked |
| 100:23 AdminRoleCreatePage | div  |  | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 100:178 AdminRoleCreatePage | Button frontendText(locale, "ADMIN_ROLES_RECORD_DISCARD") | onClick=onDiscardRecord; type="button" | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 101:64 AdminRoleCreatePage | p frontendText(locale, "ADMIN_ROLES_READ_REQUIRED") |  | {"kind":"logical","expression":"(readRequired &#124;&#124; saveError)","operator":"&&"} |
| 101:174 AdminRoleCreatePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=readPending; {"kind":"logical","expression":"(readRequired &#124;&#124; saveError)","operator":"&&"} |
| 101:323 AdminRoleCreatePage | Button frontendText(locale, "ADMIN_ROLES_RETRY_WRITE") | onClick=onRetryWrite; type="button" | disabled=readPending; {"kind":"logical","expression":"(readRequired &#124;&#124; saveError)","operator":"&&"}; {"kind":"logical","expression":"onRetryWrite",… |

## frontend/pages/admin/duplicate-queue-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 61:152 DuplicateQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kind === \"loading\"",… |
| 63:33 DuplicateQueuePage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kind === \"loading\"",… |
| 63:200 DuplicateQueuePage | Button frontendText(locale, "ADMIN_DUPLICATE_RECORD_DISCARD") | onClick=onDiscardDecisionRecord; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kind === \"loading\"",… |
| 64:22 DuplicateQueuePage | p localError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kind === \"loading\"",… |
| 65:24 DuplicateQueuePage | p frontendText(locale, "ADMIN_DUPLICATE_READ_REQUIRED") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kind === \"loading\"",… |
| 66:55 DuplicateQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=pending &#124;&#124; Boolean(pendingId); {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"… |
| 67:7 DuplicateQueuePage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"container","tag":"section","attributes":{"aria-hidden":"valid &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kind === \"loading\"",… |
| 111:5 DuplicateQueuePage | ConfirmAction  | onCancel=cancel; onConfirm=confirm | open=valid |

## frontend/pages/admin/knowledge-item-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 38:17 KnowledgeItemPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry; type="button" | disabled=pending |
| 52:9 KnowledgeItemPage | ItemBody  | onTrash=onTrash; onRollback=onRollback | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; pending &#124;&#124; undefined"}}; {"kind":"branch","e… |
| 54:23 KnowledgeItemPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; pending &#124;&#124; undefined"}}; {"kind":"logical","… |
| 56:7 KnowledgeItemPage | Button frontendText(locale, "ADMIN_TRASH_DISCARD") | onClick=onDiscardOperation; type="button" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; pending &#124;&#124; undefined"}}; {"kind":"logical","… |
| 58:5 KnowledgeItemPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; pending &#124;&#124; undefined"}} |
| 61:39 KnowledgeItemPage | p frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_WRITE_REFUSED") / feedback.message ? &#96; (${feedback.message})&#96; : "" |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; pending &#124;&#124; undefined"}}; {"kind":"logical","… |
| 64:9 KnowledgeItemPage | Button frontendText(locale, "ADMIN_TRASH_RETRY") | onClick=onRetryOperation; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; pending &#124;&#124; undefined"}}; {… |
| 68:9 KnowledgeItemPage | Button frontendText(locale, "ADMIN_TRASH_DISCARD") | onClick=onDiscardOperation; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; pending &#124;&#124; undefined"}}; {… |
| 71:17 KnowledgeItemPage | p phase / … |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; pending &#124;&#124; undefined"}}; {"kind":"logical","… |
| 110:17 ItemBody | Button rollbackLabel | onClick=() =&gt; onRollback?.(previousRevisionId); type="button" | disabled=locked; {"kind":"branch","expression":"previousRevisionId === null","branch":"false"}; {"kind":"logical","expression":"canWrite","operator":"&&"} |
| 116:11 ItemBody | Button frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_TRASH") | onClick=onTrash; type="button" | disabled=locked; {"kind":"logical","expression":"canWrite","operator":"&&"} |

## frontend/pages/admin/knowledge-item-route.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 14:10 AdminKnowledgeItemRoute | KnowledgeItemSession  |  | spread: props |
| 135:10 KnowledgeItemSession | KnowledgeItemPage  | onRetry=() =&gt; { void read(); }; onTrash=() =&gt; { void write("trash"); }; onRollback=(revisionId) =&gt; { void write("rollback", revisionId); }; onRetryO… |  |

## frontend/pages/admin/members-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 134:16 MembersPage | FilterSelect  | onChange=(value) =&gt; onStatusFilterChange?.(value as "" &#124; "active" &#124; "disabled") | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}} |
| 135:5 MembersPage | AppliedFilters  | onClear=() =&gt; onStatusFilterChange?.("") | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}} |
| 142:159 MembersPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"branch","expressi… |
| 144:29 MembersPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"branch","expressi… |
| 144:195 MembersPage | Button frontendText(locale, "ADMIN_MEMBER_STATUS_RECORD_DISCARD") | onClick=onDiscardStatusRecord; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"branch","expressi… |
| 145:52 MembersPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"branch","expressi… |
| 145:275 MembersPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":… |
| 146:5 MembersPage | Tabs  | onValueChange=changeTab | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"branch","expressi… |
| 148:9 MembersPage | TabsTrigger frontendText(locale, "ADMIN_MEMBERS_TITLE") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"branch","expressi… |
| 149:9 MembersPage | TabsTrigger frontendText(locale, "ADMIN_INVITATION_LIST_TITLE") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"branch","expressi… |
| 152:9 MembersPage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"branch","expressi… |
| 171:534 MembersPage | Button actionLabel | onClick=() =&gt; requestStatusConfirmation(member) | disabled=itemPending &#124;&#124; forbidden &#124;&#124; !onStatusChange; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation … |
| 182:13 MembersPage | Button frontendText(locale, "ADMIN_INVITATION_ADD") | onClick=() =&gt; setAddOpen(true); type="button" | aria-expanded=addOpen; disabled=pending &#124;&#124; invitationWritePending &#124;&#124; forbidden &#124;&#124; !onIssueInvitation; {"kind":"container","tag"… |
| 184:31 MembersPage | p invitationError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"branch","expressi… |
| 187:170 MembersPage | Button frontendText(locale, copied ? "ADMIN_INVITATION_CODE_COPIED" : "ADMIN_INVITATION_CODE_COPY") | onClick=() =&gt; void copyCode(issuedInvitation.code); type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"branch","expressi… |
| 188:28 MembersPage | p frontendText(locale, "ADMIN_INVITATION_CODE_COPY_FAILED") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"branch","expressi… |
| 193:15 MembersPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefined"}}; {"kind":"branch","expressi… |
| 193:132 MembersPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadInvitationsRetry; type="button" | disabled=invitationWritePending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; addOpen &#124;&#124; undefin… |
| 195:487 MembersPage | Button frontendText(locale, "ADMIN_INVITATION_REVOKE") | onClick=() =&gt; requestRevokeConfirmation(invitation) | disabled=invitationWritePending &#124;&#124; pending &#124;&#124; forbidden &#124;&#124; !onRevokeInvitation; {"kind":"container","tag":"section","attributes… |
| 203:5 MembersPage | Dialog  | onOpenChange=(next) =&gt; { if (!next) setAddOpen(false); } | open=addOpen |
| 204:7 MembersPage | DialogContent  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"addOpen"}} |
| 208:11 MembersPage | Input  | onChange=(value) =&gt; setEmail(value); type="email" | disabled=pending &#124;&#124; invitationWritePending &#124;&#124; forbidden &#124;&#124; !onIssueInvitation; {"kind":"container","tag":"Dialog","attributes":… |
| 211:11 MembersPage | Button frontendText(locale, "COMMON_CANCEL") | onClick=() =&gt; setAddOpen(false); type="button" | {"kind":"container","tag":"Dialog","attributes":{"open":"addOpen"}} |
| 212:11 MembersPage | Button frontendText(locale, "ADMIN_INVITATION_GENERATE") | onClick=requestInviteConfirmation; type="button" | disabled=!email.trim() &#124;&#124; pending &#124;&#124; invitationWritePending &#124;&#124; forbidden &#124;&#124; !onIssueInvitation; {"kind":"container","… |
| 216:5 MembersPage | ConfirmAction  | onCancel=cancelConfirmation; onConfirm=confirmAction | open=validConfirmation |

## frontend/pages/admin/menu-editor.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 61:197 MenuEditor | Select  | onChange=event =&gt; formDraft.edit(name, event.target.value) |  |
| 61:321 MenuEditor | option choice.label |  | {"kind":"repeat","expression":"choices"} |
| 62:66 MenuEditor | Input  | onChange=value =&gt; formDraft.edit(name, value); type=name === "position" ? "number" : "text" |  |
| 64:12 MenuEditor | Dialog  | onOpenChange=(next) =&gt; { if (!next) requestCancel(); } | open=true |
| 64:82 MenuEditor | DialogContent  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; spread: (menu ? { "data-menu-edit-dialog": "" } : { "data-menu-create-dialog": "" }) |
| 66:5 MenuEditor | form  | onSubmit=async event =&gt; { event.preventDefault(); if (!alive.current &#124;&#124; disabled &#124;&#124; submitting.current &#124;&#124; confirmationRef.cu… | aria-hidden=validConfirmation &#124;&#124; undefined; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}} |
| 87:16 MenuEditor | Switch  | onCheckedChange=checked =&gt; formDraft.edit("visible", checked ? "true" : "false") | disabled=disabled; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfi… |
| 90:17 MenuEditor | p text("ADMIN_MENUS_INVALID") |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124… |
| 91:38 MenuEditor | Button text(menu ? "ADMIN_MENUS_SAVE_FULL" : "ADMIN_MENUS_CREATE_SUBMIT") | type="submit" | disabled=disabled; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfi… |
| 91:157 MenuEditor | Button text("ADMIN_MENUS_CANCEL") | onClick=requestCancel; type="button" | disabled=pending; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfir… |
| 93:28 MenuEditor | ConfirmAction  | onCancel=cancelConfirmation; onConfirm=confirmAction | open=validConfirmation |

## frontend/pages/admin/menus-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 22:38 AdminMenusPage | ReadyMenus  |  | {"kind":"branch","expression":"state.kind === \"ready\"","branch":"true"}; spread: { locale, onLoadRetry, onUpdate, onDelete, onCreate, pendingId, error, wri… |
| 26:127 AdminMenusPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 98:5 ReadyMenus | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 123:40 ReadyMenus | div  |  | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 123:200 ReadyMenus | Button frontendText(locale, "ADMIN_MENUS_RECORD_DISCARD") | onClick=onDiscardRecord; type="button" | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 123:394 ReadyMenus | p error &#124;&#124; frontendText(locale, "ADMIN_MENUS_READ_REQUIRED") |  | {"kind":"logical","expression":"(error &#124;&#124; readRequired)","operator":"&&"} |
| 123:527 ReadyMenus | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=readPending; {"kind":"logical","expression":"(error &#124;&#124; readRequired)","operator":"&&"}; {"kind":"logical","expression":"onLoadRetry","oper… |
| 127:25 ReadyMenus | Button frontendText(locale, "ADMIN_MENUS_CREATE") | onClick=() =&gt; setEditor({}); type="button" | aria-expanded=Boolean(editor) && !editor?.menu; disabled=busy &#124;&#124; Boolean(editor) &#124;&#124; countMenus(menus) &gt;= 200; {"kind":"container","tag… |
| 129:22 ReadyMenus | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftBlocked","… |
| 129:163 ReadyMenus | Button frontendText(locale, "ADMIN_MENU_DRAFT_RECORD_DISCARD") | onClick=discardDraft; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftBlocked","… |
| 130:21 ReadyMenus | p draftNotice |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftNotice","o… |
| 131:16 ReadyMenus | MenuEditor  | onFields=reportFields; onCancel=() =&gt; { setEditor(null); setLive(null); }; onSave=async input =&gt; { const saved = editor.menu ? await onUpdate?.(editor.… | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"editor","operat… |
| 136:13 ReadyMenus | ConfirmAction  | onCancel=cancelConfirmation; onConfirm=confirmAction | open=validConfirmation |
| 154:18 menuBranch | MenuNodeActions  |  | spread: props |
| 211:624 MenuNodeActions | input  | onChange=(event) =&gt; rowDraft.edit("position", event.target.value); type="number" | disabled=menu.isSystem &#124;&#124; busy |
| 211:863 MenuNodeActions | Button frontendText(locale, "ADMIN_MENUS_SAVE") | onClick=() =&gt; { const value = rowDraft.current.current.position; const position = Number(value); if (value.trim() && Number.isSafeInteger(position) && pos… | disabled=menu.isSystem &#124;&#124; busy &#124;&#124; position === menu.position &#124;&#124; !rowDraft.fields.position.trim() &#124;&#124; !Number.isSafeInt… |

## frontend/pages/admin/recycle-bin-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 81:17 RecycleBinPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry; type="button" | disabled=pending |
| 91:23 RecycleBinPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 93:7 RecycleBinPage | Button frontendText(locale, "ADMIN_TRASH_DISCARD") | onClick=onDiscardOperation; type="button" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 95:22 RecycleBinPage | p recordNotice |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 96:5 RecycleBinPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 98:40 RecycleBinPage | Button frontendText(locale, "ADMIN_TRASH_RETRY") | onClick=onRetryOperation; type="button" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 101:41 RecycleBinPage | a formatText(locale, "ADMIN_TRASH_OPEN_RESTORED", { id: feedback.knowledgeItemId }) | onClick=(event) =&gt; { if (!onOpenItem &#124;&#124; event.defaultPrevented &#124;&#124; event.button !== 0 &#124;&#124; event.metaKey &#124;&#124; event.ctr… | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 123:11 RecycleBinPage | a frontendText(locale, "ADMIN_TRASH_OPEN_ITEM") | onClick=(event) =&gt; { if (!onOpenItem &#124;&#124; event.defaultPrevented &#124;&#124; event.button !== 0 &#124;&#124; event.metaKey &#124;&#124; event.ctr… | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 147:13 RecycleBinPage | Button restoring ? frontendText(locale, "ADMIN_TRASH_RESTORING") : frontendText(locale, "ADMIN_TRASH_RESTORE") | onClick=() =&gt; onRestore?.(item.id); type="button" | disabled=writesLocked; {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch",… |
| 153:15 RecycleBinPage | Input  | onChange=(event) =&gt; onPurgeConfirmChange?.(item.id, event.target.value) | disabled=writesLocked; {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch",… |
| 155:28 RecycleBinPage | p frontendText(locale, "ADMIN_TRASH_PURGE_CONFIRM_MISMATCH") |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 156:15 RecycleBinPage | Button frontendText(locale, "ADMIN_TRASH_PURGE") | onClick=() =&gt; { if (canPurge) onPurge?.(item.id); }; type="button" | disabled=!canPurge; {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","ex… |
| 161:15 RecycleBinPage | Button frontendText(locale, "ADMIN_TRASH_PURGE") | type="button" | disabled=true; {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","express… |
| 168:7 RecycleBinPage | Button frontendText(locale, "ADMIN_LOAD_MORE") | onClick=onLoadMore; type="button" | disabled=writesLocked; {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch",… |

## frontend/pages/admin/recycle-bin-route.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 171:10 RecycleBinRoute | RecycleBinPage  | onPurgeConfirmChange=(knowledgeItemId, value) =&gt; setPurgeConfirm((previous) =&gt; ({ ...previous, [knowledgeItemId]: value })); onRetry=() =&gt; { void re… |  |

## frontend/pages/admin/review-detail-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 39:92 ReviewDetailPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 40:9 ReviewDetailPage | ButtonLink frontendText(locale, "ADMIN_REVIEW_BACK") | onClick=(event) =&gt; { if (!onBack &#124;&#124; event.defaultPrevented &#124;&#124; event.button !== 0 &#124;&#124; event.metaKey &#124;&#124; event.ctrlKey… | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 53:31 ReviewDetailPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 53:201 ReviewDetailPage | Button frontendText(locale, "ADMIN_REVIEW_DECISION_RECORD_DISCARD") | onClick=onDiscardDecisionRecord; type="button" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 54:30 ReviewDetailPage | p decisionRecordNotice |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 55:5 ReviewDetailPage | ReviewDecisionFeedback  | onRetry=onRetryDecision; onReload=onRetry | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 57:7 ReviewDetailPage | ReviewDecisionControls  | onDecision=onDecision | disabled=reviewDecisionLocked(decisionState); {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefine… |

## frontend/pages/admin/review-detail-route.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 44:5 ReviewDetailSession | window.addEventListener  | "beforeunload", warn |  |
| 157:10 ReviewDetailSession | ReviewDetailPage  | onBack=() =&gt; writeWorkspaceHistory("push", "/admin/submissions"); onRetry=() =&gt; { void read(); }; onRetryDecision=() =&gt; { if (decisionState.kind ===… |  |

## frontend/pages/admin/review-queue-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 30:17 ReviewQueuePage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry; type="button" | disabled=pending |
| 45:9 ReviewQueuePage | Checkbox  | onChange=() =&gt; allSelected ? batch.clear() : batch.selectAllPage() | disabled=batch.freeze &#124;&#124; batchRows.length === 0; {"kind":"branch","expression":"batchEnabled","branch":"true"} |
| 49:40 ReviewQueuePage | Checkbox  | onChange=() =&gt; batch.toggle(item.id) | disabled=batch.freeze; {"kind":"branch","expression":"batchEnabled","branch":"true"} |
| 54:9 ReviewQueuePage | a item.title?.trim() &#124;&#124; frontendText(locale, "ADMIN_REVIEW_UNTITLED") | onClick=(event) =&gt; { if (!onOpenDetail &#124;&#124; event.defaultPrevented &#124;&#124; event.button !== 0 &#124;&#124; event.metaKey &#124;&#124; event.c… |  |
| 65:14 ReviewQueuePage | ReviewDecisionControls  | onDecision=onReview ? (action, details) =&gt; onReview(item.id, action, details) : undefined | disabled=disabled |
| 77:31 ReviewQueuePage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 77:201 ReviewQueuePage | Button frontendText(locale, "ADMIN_REVIEW_DECISION_RECORD_DISCARD") | onClick=onDiscardDecisionRecord; type="button" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 78:5 ReviewQueuePage | ReviewDecisionFeedback  | onRetry=onRetryDecision; onReload=onReloadDecision | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 79:22 ReviewQueuePage | p localError |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 81:5 ReviewQueuePage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 97:22 ReviewQueuePage | ReviewBatchResults  | onRetryFailed=batch.retryFailed | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |

## frontend/pages/admin/role-detail-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 49:152 AdminRoleDetailPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 50:169 AdminRoleDetailPage | Button frontendText(locale, "ADMIN_ROLES_LIST") | onClick=onBack; type="button" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 51:9 AdminRoleDetailPage | RolePermissionEditor  | onBack=onBack; onLoadRetry=onLoadRetry; onSave=props.onSave; onAssignMember=props.onAssignMember; onUnassignMember=props.onUnassignMember; onDiscardRecord=pr… | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 80:5 RolePermissionEditor | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 147:22 RolePermissionEditor | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftBlocked","… |
| 147:158 RolePermissionEditor | Button frontendText(locale, "ADMIN_ROLE_DRAFT_RECORD_DISCARD") | onClick=discardDraft; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftBlocked","… |
| 148:21 RolePermissionEditor | p draftNotice |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftNotice","o… |
| 150:7 RolePermissionEditor | Button ← / frontendText(locale, "ADMIN_ROLES_LIST") | onClick=() =&gt; (onBack ? onBack() : writeWorkspaceHistory("push", "/admin/roles")); type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}} |
| 153:713 RolePermissionEditor | Checkbox  | onChange=() =&gt; toggle(key) | disabled=(role.isSystem && !canGrantWorkbench(key)) &#124;&#124; locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &… |
| 154:179 RolePermissionEditor | p frontendText(locale, "ADMIN_ROLES_DIRTY_MEMBERSHIP") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"dirtyPermission… |
| 154:535 RolePermissionEditor | Button frontendText(locale, "ADMIN_ROLES_UNASSIGN_MEMBER") | onClick=() =&gt; requestConfirmation({ kind: "unassign", memberId: id }); type="button" | disabled=locked &#124;&#124; dirtyPermissions &#124;&#124; !onUnassignMember; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmat… |
| 154:1000 RolePermissionEditor | Input  | onChange=(event) =&gt; setMemberId(event.target.value) | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression"… |
| 154:1236 RolePermissionEditor | Button frontendText(locale, "ADMIN_ROLES_ASSIGN_MEMBER") | onClick=() =&gt; requestConfirmation({ kind: "assign", memberId: memberId.trim() }); type="button" | disabled=locked &#124;&#124; dirtyPermissions &#124;&#124; !onAssignMember &#124;&#124; !memberId.trim() &#124;&#124; assignedMemberIds.includes(memberId.tri… |
| 155:21 RolePermissionEditor | p saveError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"saveError","ope… |
| 156:7 RolePermissionEditor | Button saving ? frontendText(locale, "ADMIN_ROLES_SAVING") : frontendText(locale, "ADMIN_ROLES_SAVE") | onClick=() =&gt; requestConfirmation({ kind: "save" }); type="button" | disabled=(role.isSystem && !systemWorkbenchGrant) &#124;&#124; locked &#124;&#124; !onSave; {"kind":"container","tag":"section","attributes":{"aria-hidden":"… |
| 158:13 RolePermissionEditor | ConfirmAction  | onCancel=cancelConfirmation; onConfirm=() =&gt; { void confirmAction(); } | open=validConfirmation |
| 162:99 RolePermissionEditor | div  |  | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 162:254 RolePermissionEditor | Button frontendText(locale, "ADMIN_ROLES_RECORD_DISCARD") | onClick=onDiscardRecord; type="button" | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 162:447 RolePermissionEditor | p frontendText(locale, "ADMIN_ROLES_READ_REQUIRED") |  | {"kind":"logical","expression":"(readRequired &#124;&#124; saveError)","operator":"&&"} |
| 162:557 RolePermissionEditor | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=readPending; {"kind":"logical","expression":"(readRequired &#124;&#124; saveError)","operator":"&&"} |
| 162:706 RolePermissionEditor | Button frontendText(locale, "ADMIN_ROLES_RETRY_WRITE") | onClick=onRetryWrite; type="button" | disabled=readPending; {"kind":"logical","expression":"(readRequired &#124;&#124; saveError)","operator":"&&"}; {"kind":"logical","expression":"onRetryWrite",… |

## frontend/pages/admin/roles-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 22:16 AdminRolesPage | Button frontendText(locale, "ADMIN_ROLES_CREATE") | onClick=() =&gt; writeWorkspaceHistory("push", "/admin/roles/new"); type="button" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}} |
| 24:152 AdminRolesPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |
| 39:13 AdminRolesPage | a role.name | onClick=(event) =&gt; { event.preventDefault(); writeWorkspaceHistory("push", adminRoleDetailPath(role.id)); }; href=adminRoleDetailPath(role.id) | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\" &#124;&#124; undefined"}}; {"kind":"branch","expression":"state.kin… |

## frontend/pages/admin/spaces-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 37:46 SpacesPage | SpacesEditor  |  | {"kind":"branch","expression":"!props.loading && !props.error","branch":"true"}; spread: props |
| 41:130 SpacesPage | Button frontendText(props.locale, "COMMON_RETRY") | onClick=props.onLoadRetry; type="button" | {"kind":"container","tag":"section","attributes":{"aria-busy":"props.loading &#124;&#124; undefined"}}; {"kind":"branch","expression":"props.loading","branch… |
| 99:5 SpacesEditor | window.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave |  |
| 140:112 SpacesEditor | Button frontendText(locale, "ADMIN_CREATE_SPACE") | onClick=openCreate; type="button" | aria-expanded=createOpen; disabled=locked &#124;&#124; Boolean(target); {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&… |
| 140:338 SpacesEditor | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"recordBlocked","oper… |
| 140:494 SpacesEditor | Button frontendText(locale, "ADMIN_SPACE_RECORD_DISCARD") | onClick=onDiscardRecord; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"recordBlocked","oper… |
| 140:645 SpacesEditor | p recordNotice |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"recordNotice","opera… |
| 140:734 SpacesEditor | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftBlocked","opera… |
| 140:889 SpacesEditor | Button frontendText(locale, "ADMIN_SPACE_DRAFT_RECORD_DISCARD") | onClick=discardDraft; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftBlocked","opera… |
| 140:1042 SpacesEditor | p draftNotice |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"draftNotice","operat… |
| 140:1127 SpacesEditor | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"needsRead","operator… |
| 140:1203 SpacesEditor | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadRetry; type="button" | disabled=pending; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"ne… |
| 140:1338 SpacesEditor | Dialog  | onOpenChange=(next) =&gt; { if (!next) requestCloseCreate(); } | open=createOpen; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}} |
| 140:1426 SpacesEditor | DialogContent  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"container","tag":"Dialog","attributes":{"op… |
| 140:1724 SpacesEditor | form  | onSubmit=submit | aria-busy=createState === "pending" ? "true" : undefined; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefine… |
| 140:1850 SpacesEditor | Input  | onChange=(value) =&gt; createDraft.edit("name", value) | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"container","tag":"Dialog",… |
| 140:2046 SpacesEditor | Input  | onChange=(value) =&gt; createDraft.edit("slug", value) | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"container","tag":"Dialog",… |
| 140:2341 SpacesEditor | Button createState === "pending" ? frontendText(locale, "ADMIN_SPACE_CREATING") : frontendText(locale, "ADMIN_SPACE_CREATE") | type="submit" | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"container","tag":"Dialog",… |
| 140:2509 SpacesEditor | Button frontendText(locale, "ADMIN_SPACE_CANCEL") | onClick=requestCloseCreate; type="button" | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"container","tag":"Dialog",… |
| 140:2702 SpacesEditor | p frontendText(locale, "ADMIN_SPACE_CREATE_ERROR") |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"container","tag":"Dialog","attributes":{"op… |
| 140:2871 SpacesEditor | RecordEditor  | onFields=reportFields; onCancel=() =&gt; { seedTarget.current = null; seedFields.current = null; setLive(null); setTarget(null); }; onSave=async command =&gt… | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"target && onManage",… |
| 140:3957 SpacesEditor | Button frontendText(locale, "ADMIN_SPACE_EDIT") / : / space.name | onClick=() =&gt; setTarget({ kind: "space", space }); type="button" | aria-expanded=target?.kind === "space" && target.space.id === space.id; disabled=locked &#124;&#124; createOpen &#124;&#124; Boolean(target) &#124;&#124; spa… |
| 140:4327 SpacesEditor | Button frontendText(locale, "ADMIN_TAGS_OPEN") / : / space.name | onClick=() =&gt; setTagsFor(tagsFor === space.id ? null : space.id); type="button" | aria-expanded=tagsFor === space.id; disabled=locked &#124;&#124; createOpen &#124;&#124; Boolean(target) &#124;&#124; space.readOnly &#124;&#124; space.kind … |
| 140:4652 SpacesEditor | Button frontendText(locale, "ADMIN_COLLECTION_CREATE") / : / space.name | onClick=() =&gt; setTarget({ kind: "create-collection", space }); type="button" | aria-expanded=target?.kind === "create-collection" && target.space.id === space.id; disabled=locked &#124;&#124; createOpen &#124;&#124; Boolean(target) &#12… |
| 140:5559 SpacesEditor | Button frontendText(locale, "ADMIN_COLLECTION_EDIT") / : / collection.name | onClick=() =&gt; setTarget({ kind: "collection", space, collection }); type="button" | aria-expanded=target?.kind === "collection" && target.collection?.id === collection.id; disabled=locked &#124;&#124; createOpen &#124;&#124; Boolean(target) … |
| 140:6011 SpacesEditor | Button frontendText(locale, "ADMIN_LOAD_MORE") / : / space.name | onClick=() =&gt; onLoadCollections?.(space.id); type="button" | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"branch","expression":"spac… |
| 140:6368 SpacesEditor | Button frontendText(locale, "ADMIN_LOAD_MORE") | onClick=onLoadMore; type="button" | disabled=locked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"nex… |
| 140:6537 SpacesEditor | Button frontendText(locale, "ADMIN_TAGS_CLOSE") | onClick=() =&gt; setTagsFor(null); type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validDiscard &#124;&#124; undefined"}}; {"kind":"logical","expression":"tagsFor","operator":… |
| 140:6751 SpacesEditor | ConfirmAction  | onCancel=cancelDiscard; onConfirm=confirmDiscard | open=validDiscard |
| 213:12 RecordEditor | Dialog  | onOpenChange=(next) =&gt; { if (!next) requestCancel(); } | open=true |
| 213:82 RecordEditor | DialogContent  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}} |
| 215:5 RecordEditor | form  | onSubmit=submit | aria-hidden=validConfirmation &#124;&#124; undefined; aria-busy=pending &#124;&#124; undefined; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}} |
| 216:7 RecordEditor | Input  | onChange=value =&gt; set("name", value) | disabled=busy; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmat… |
| 217:35 RecordEditor | Input  | onChange=value =&gt; set("slug", value) | disabled=busy; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmat… |
| 218:7 RecordEditor | Input  | onChange=value =&gt; set("description", value) | disabled=busy; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmat… |
| 219:7 RecordEditor | Input  | onChange=value =&gt; set("position", value); type="number" | disabled=busy; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmat… |
| 220:102 RecordEditor | Select  | onChange=event =&gt; set("status", event.currentTarget.value) | disabled=busy; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmat… |
| 220:233 RecordEditor | option frontendText(locale, "ADMIN_MENUS_ACTIVE") |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124… |
| 220:309 RecordEditor | option frontendText(locale, "ADMIN_MENUS_DISABLED") |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124… |
| 221:160 RecordEditor | Select  | onChange=event =&gt; set("parentId", event.currentTarget.value) | disabled=busy; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmat… |
| 221:295 RecordEditor | option frontendText(locale, "ADMIN_COLLECTION_ROOT") |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124… |
| 221:443 RecordEditor | option frontendText(locale, "ADMIN_COLLECTION_CURRENT_PARENT") / : / draft.parentId |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124… |
| 221:583 RecordEditor | option item.name |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124… |
| 222:72 RecordEditor | Button frontendText(locale, "ADMIN_RECORD_SAVE") | type="submit" | disabled=busy; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmat… |
| 222:162 RecordEditor | Button frontendText(locale, "ADMIN_SPACE_CANCEL") | onClick=requestCancel; type="button" | disabled=busy; {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmat… |
| 222:328 RecordEditor | p frontendText(locale, "ADMIN_RECORD_SAVE_ERROR") |  | {"kind":"container","tag":"Dialog","attributes":{"open":"true"}}; {"kind":"container","tag":"form","attributes":{"aria-hidden":"validConfirmation &#124;&#124… |
| 224:28 RecordEditor | ConfirmAction  | onCancel=cancelConfirmation; onConfirm=confirm | open=validConfirmation |

## frontend/pages/agent-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 84:7 AgentPage | PromptInput  | onValueChange=(value) =&gt; onQuestionChange?.(value); onSubmit=() =&gt; onSubmit?.(); onStop=onCancel | disabled=state.kind === "loading" &#124;&#124; feedbackBlocked |
| 100:37 AgentPage | AgentSourceControls  | onStartScope=onStartScope | disabled=state.kind === "loading" &#124;&#124; feedbackBlocked; {"kind":"logical","expression":"onStartScope && sourceDraft","operator":"&&"} |
| 101:625 AgentPage | Button frontendText(locale, "AGENT_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"cancelled\"","branch":"false"};… |
| 101:877 AgentPage | Button frontendText(locale, "AGENT_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"cancelled\"","branch":"false"};… |
| 101:1029 AgentPage | AgentRefusal  | onRetry=onRetry | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"cancelled\"","branch":"false"};… |
| 109:10 AgentRefusal | div  |  |  |
| 112:17 AgentRefusal | Button frontendText(locale, "AGENT_RETRY") | onClick=onRetry | {"kind":"logical","expression":"onRetry","operator":"&&"} |
| 134:7 AgentSourceControls | Select  | onValueChange=(value) =&gt; { draft.edit("kind", value as AgentScope["kind"]); draft.edit("ids", ""); setInvalid(false); } | disabled=disabled &#124;&#124; draft.applicationPending; {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicati… |
| 144:108 AgentSourceControls | Input  | onChange=(event) =&gt; draft.edit("ids", event.currentTarget.value) | {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}}; {"kind":"logical","expression":"kind !== \"… |
| 146:17 AgentSourceControls | p frontendText(locale, "AGENT_SCOPE_INVALID") |  | {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}}; {"kind":"logical","expression":"invalid","o… |
| 147:5 AgentSourceControls | Button frontendText(locale, "AGENT_SCOPE_APPLY") | onClick=apply; type="button" | disabled=disabled; {"kind":"container","tag":"fieldset","attributes":{"disabled":"disabled &#124;&#124; draft.applicationPending"}} |

## frontend/pages/boards/boards-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 40:29 BoardsPage | Button frontendText(locale, "BOARDS_MOVE_RECORD_DISCARD") | onClick=onDiscardRecord | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 45:9 BoardsPage | Button frontendText(locale, "BOARDS_MOVE_CHECK") | onClick=onCheckMove | disabled=recovering; {"kind":"logical","expression":"unknownMove","operator":"&&"} |
| 46:9 BoardsPage | Button frontendText(locale, "BOARDS_MOVE_RETRY") | onClick=onRetryMove | disabled=recovering; {"kind":"logical","expression":"unknownMove","operator":"&&"} |
| 50:22 BoardsPage | p actionNotice |  | {"kind":"logical","expression":"actionNotice","operator":"&&"} |
| 67:41 BoardsPage | BoardColumn  | onRetry=onRetry; onLoadMore=onLoadMore; onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onStatusChange=onStatusChange | {"kind":"container","tag":"SortableList","attributes":{"disabled":"true"}}; {"kind":"repeat","expression":"BOARD_STATUSES"} |
| 89:108 BoardColumn | Button frontendText(locale, "BOARDS_RETRY") | onClick=() =&gt; onRetry(status) | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"} |
| 90:32 BoardColumn | ReadyColumn  | onRetry=onRetry; onLoadMore=onLoadMore; onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onStatusChange=onStatusChange | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"} |
| 112:7 ReadyColumn | div  | onKeyDown=(event) =&gt; { if (writeLocked &#124;&#124; event.target !== event.currentTarget) return; if (event.key !== "ArrowLeft" && event.key !== "ArrowRig… |  |
| 122:7 ReadyColumn | Select  | onChange=(event) =&gt; onStatusChange(task, event.currentTarget.value as BoardTargetStatus) | disabled=writeLocked |
| 129:124 ReadyColumn | Button frontendText(locale, "BOARDS_RETRY") | onClick=() =&gt; onRetry(status) | {"kind":"logical","expression":"state.loadError","operator":"&&"} |
| 131:7 ReadyColumn | DataTable  | onPageChange=onPageChange ? (page: number) =&gt; onPageChange(status, page) : undefined; onPageSizeChange=onPageSizeChange ? (pageSize: SupportedPageSize) =&… | {"kind":"container","tag":"div","attributes":{"aria-busy":"state.pending &#124;&#124; undefined"}} |

## frontend/pages/calendar-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 45:33 CalendarPage | Dialog  | onOpenChange=next =&gt; { if (!next) setCreateOpen(false); } | open=createOpen |
| 46:5 CalendarPage | DialogContent  |  | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}} |
| 49:29 CalendarPage | CalendarCreateForm  | onCreate=onCreate; onCreateReadback=onCreateReadback; onCreateDenied=onCreateDenied; onCreateLock=locked =&gt; { setCreateComposerLocked(locked); onCreateLoc… | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}} |
| 50:62 CalendarPage | Button frontendText(locale, "COMMON_CANCEL") | onClick=() =&gt; setCreateOpen(false); type="button" | {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}} |
| 58:16 CalendarPage | Button frontendText(locale, "CALENDAR_CREATE_TITLE") | onClick=() =&gt; setCreateOpen(true); type="button" | aria-expanded=createOpen; disabled=createBlocked |
| 60:32 CalendarPage | CalendarRangeFilter  | onChange=next =&gt; { if (!controlsPending && !confirmation.isOpen()) onRangeChange(next); } | {"kind":"logical","expression":"range && onRangeChange","operator":"&&"} |
| 61:21 CalendarPage | div actionError |  | {"kind":"logical","expression":"actionError","operator":"&&"} |
| 62:77 CalendarPage | Button frontendText(locale, "CALENDAR_RETRY") | onClick=onRetry; type="button" | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"} |
| 62:306 CalendarPage | DataTable  | onPageChange=onPageChange ? changePage : undefined; onPageSizeChange=onPageSizeChange ? changePageSize : undefined; onLoadMore=onLoadMore ? loadMore : undefined | {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"} |
| 81:164 CalendarPage | Button  | onClick=() =&gt; confirmation.request(event); type="button" | disabled=controlsPending; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"loading… |

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
| 70:2669 FocusPage | FocusTaskPicker  | onSelect=task =&gt; {if (!editable()) return; draft.edit("taskId", task.id); draft.edit("taskTitle", task.title);}; onDenied=() =&gt; {draft.reset(); setPick… | {"kind":"container","tag":"Dialog","attributes":{"open":"picking"}}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 70:2917 FocusPage | Input  | onChange=(event) =&gt; draft.edit("title", event.currentTarget.value) | disabled=controlsPending; {"kind":"container","tag":"Dialog","attributes":{"open":"picking"}}; earlier return: state.kind === "loading"; earlier return: stat… |
| 70:3153 FocusPage | Button frontendText(locale, "FOCUS_START_ACTION") | onClick=() =&gt; { if (!editable() &#124;&#124; !draft.current.current.taskId &#124;&#124; !onStart) return; const input = draft.current.current; starting.cu… | disabled=controlsPending &#124;&#124; !taskId; {"kind":"container","tag":"Dialog","attributes":{"open":"picking"}}; earlier return: state.kind === "loading";… |

## frontend/pages/goals-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 44:68 GoalsPage | Dialog  | onOpenChange=next =&gt; { if (!next) setCreateOpen(false); } | open=createOpen; {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"} |
| 45:5 GoalsPage | DialogContent  |  | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}} |
| 48:29 GoalsPage | PlanningCreateForm  | onCreate=onCreate; onCreateReadback=onCreateReadback; onCreateDenied=onCreateDenied; onCreateLock=locked =&gt; { setCreateComposerLocked(locked); onCreateLoc… | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}} |
| 49:62 GoalsPage | Button frontendText(locale, "COMMON_CANCEL") | onClick=() =&gt; setCreateOpen(false); type="button" | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}} |
| 57:16 GoalsPage | Button frontendText(locale, "GOALS_CREATE_TITLE") | onClick=() =&gt; setCreateOpen(true); type="button" | aria-expanded=createOpen; disabled=createBlocked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open && state.kind === … |
| 59:21 GoalsPage | div actionError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open && state.kind === \"ready\" &#124;&#124; undefined"}}; {"kind":"logi… |
| 61:80 GoalsPage | Button frontendText(locale, "GOALS_RETRY") | onClick=onRetry | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open && state.kind === \"ready\" &#124;&#124; undefined"}}; {"kind":"bran… |
| 62:9 GoalsPage | DataTable  | onPageChange=onPageChange ? changePage : undefined; onPageSizeChange=onPageSizeChange ? changePageSize : undefined; onLoadMore=onLoadMore | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open && state.kind === \"ready\" &#124;&#124; undefined"}}; {"kind":"bran… |
| 80:347 GoalsPage | RangeSlider  | onValueChange=(value) =&gt; { if (!statusConfirmation.isOpen()) onProgressChange?.(goal, value); } | disabled=statusConfirmation.open &#124;&#124; createLocked &#124;&#124; pending &#124;&#124; goal.status === "archived"; {"kind":"container","tag":"section",… |

## frontend/pages/graph-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 99:5 GraphPage | window.addEventListener  | "beforeunload", warn |  |
| 207:47 GraphPage | div  |  | aria-busy=action.status === "checking"; {"kind":"branch","expression":"recoveryAuthorized","branch":"true"}; {"kind":"logical","expression":"action && action… |
| 210:7 GraphPage | Button frontendText(locale, "GRAPH_ACTION_CHECK_RESULT") | onClick=checkGraphAction | disabled=action.status === "checking"; {"kind":"branch","expression":"recoveryAuthorized","branch":"true"}; {"kind":"logical","expression":"action && action.… |
| 211:7 GraphPage | Button frontendText(locale, "GRAPH_ACTION_RETRY") | onClick=() =&gt; runGraphAction(action) | disabled=action.status === "checking"; {"kind":"branch","expression":"recoveryAuthorized","branch":"true"}; {"kind":"logical","expression":"action && action.… |
| 212:28 GraphPage | p frontendText(locale, "GRAPH_ACTION_QUERY_UNCONFIRMED") |  | {"kind":"branch","expression":"recoveryAuthorized","branch":"true"}; {"kind":"logical","expression":"action && action.status !== \"running\"","operator":"&&"… |
| 214:39 GraphPage | p frontendText(locale, "GRAPH_ACTION_CONFIRMED").replace("{id}", outcome.clientKey) |  | {"kind":"branch","expression":"recoveryAuthorized","branch":"true"}; {"kind":"logical","expression":"outcome?.status === \"success\"","operator":"&&"} |
| 260:13 GraphPage | Input  | onChange=(event) =&gt; onQueryChange?.(event.currentTarget.value) |  |
| 261:13 GraphPage | FilterSelect  | onChange=(value) =&gt; onLensChange?.(value as GraphLens) |  |
| 262:13 GraphPage | FilterSelect  | onChange=(value) =&gt; onTemporalRangeChange?.(value as GraphTemporalRange) |  |
| 263:13 GraphPage | FilterSelect  | onChange=(value) =&gt; onChangeKindChange?.(value as NonNullable&lt;GraphPageProps["changeKind"]&gt;) |  |
| 269:38 GraphPage | AppliedFilters  | onClear=clearFilters | {"kind":"logical","expression":"state.kind !== \"forbidden\"","operator":"&&"} |
| 270:23 GraphPage | div  |  | {"kind":"logical","expression":"viewBlocked","operator":"&&"} |
| 270:197 GraphPage | Button frontendText(locale, "GRAPH_VIEW_RECORD_DISCARD") | onClick=onDiscardView | {"kind":"logical","expression":"viewBlocked","operator":"&&"} |
| 271:22 GraphPage | p viewNotice |  | {"kind":"logical","expression":"viewNotice","operator":"&&"} |
| 272:25 GraphPage | div  |  | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 274:9 GraphPage | Button frontendText(locale, "GRAPH_ACTION_RECORD_DISCARD") | onClick=() =&gt; { if (memberId && discardBlockedGraphAction(memberId)) setRecordBlocked(false); } | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 277:81 GraphPage | p frontendText(locale, outcome.status === "rejected" ? "GRAPH_ACTION_REJECTED" : outcome.status === "not_recorded" ? "GRAPH_ACTION_NOT_RECORDED" : "GRAPH_ACTIO… |  | {"kind":"logical","expression":"state.kind !== \"forbidden\" && outcome && outcome.status !== \"success\"","operator":"&&"} |
| 279:102 GraphPage | Button frontendText(locale, "GRAPH_RETRY") | onClick=onRetry | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"} |
| 280:114 GraphPage | Button frontendText(locale, "GRAPH_RETRY") | onClick=onRetry | {"kind":"logical","expression":"state.kind === \"forbidden\"","operator":"&&"} |
| 282:9 GraphPage | Button frontendText(locale, "GRAPH_RETRY") | onClick=onRetry | {"kind":"logical","expression":"state.kind === \"empty\"","operator":"&&"} |
| 285:9 GraphPage | GraphSuggestionsPanel  | onGenerate=onGenerateSuggestions | {"kind":"logical","expression":"filteredSnapshot && state.kind !== \"empty\"","operator":"&&"} |
| 286:44 GraphPage | div  |  | {"kind":"logical","expression":"filteredSnapshot && state.kind !== \"empty\"","operator":"&&"}; {"kind":"logical","expression":"snapshot && snapshot.truncate… |
| 291:29 GraphPage | Button frontendText(locale, "GRAPH_MORE") | onClick=onLoadMore; type="button" | disabled=morePending; {"kind":"logical","expression":"filteredSnapshot && state.kind !== \"empty\"","operator":"&&"}; {"kind":"logical","expression":"snapsho… |
| 294:23 GraphPage | div  |  | {"kind":"logical","expression":"filteredSnapshot && state.kind !== \"empty\"","operator":"&&"}; {"kind":"logical","expression":"moreError","operator":"&&"} |
| 296:26 GraphPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadMore; type="button" | {"kind":"logical","expression":"filteredSnapshot && state.kind !== \"empty\"","operator":"&&"}; {"kind":"logical","expression":"moreError","operator":"&&"}; … |
| 299:11 GraphPage | GraphCanvas  | onSelect=setSelectedId; onClearSelection=() =&gt; setSelectedId(null) | {"kind":"logical","expression":"filteredSnapshot && state.kind !== \"empty\"","operator":"&&"} |
| 305:197 GraphPage | Button frontendText(locale, "GRAPH_DRILL_DOWN_EXIT") | onClick=() =&gt; onRootIdChange?.(null); type="button" | {"kind":"logical","expression":"filteredSnapshot && state.kind !== \"empty\"","operator":"&&"}; {"kind":"branch","expression":"rootId","branch":"true"} |
| 307:92 GraphPage | Button frontendText(locale, "GRAPH_DRILL_DOWN_ENTER") | onClick=() =&gt; onRootIdChange?.(selectedNode.id); type="button" | {"kind":"logical","expression":"filteredSnapshot && state.kind !== \"empty\"","operator":"&&"}; {"kind":"branch","expression":"rootId","branch":"false"}; {"k… |
| 310:13 GraphPage | GraphInspector  | onClose=() =&gt; setSelectedId(null); onAction=selectedNode && (!action &#124;&#124; action.node.id === selectedNode.id) ? () =&gt; runGraphAction(action ?? … | {"kind":"logical","expression":"filteredSnapshot && state.kind !== \"empty\"","operator":"&&"} |
| 318:13 GraphPage | GraphEvidencePanel  | onDenied=onDenied | {"kind":"logical","expression":"filteredSnapshot && state.kind !== \"empty\"","operator":"&&"} |
| 433:10 GraphRoute | GraphPage  | onDenied=denyRead; onRootIdChange=setRootId; onLoadMore=loadMore; onGenerateSuggestions=generateSuggestions; onQueryChange=setQuery; onLensChange=setLens; on… |  |
| 439:269 GraphSuggestionsPanel | Button frontendText(locale, state.kind === "loading" ? "GRAPH_SUGGESTIONS_LOADING" : "GRAPH_SUGGESTIONS_GENERATE") | onClick=onGenerate | disabled=state.kind === "loading" |
| 441:34 GraphSuggestionsPanel | p frontendText(locale, "GRAPH_SUGGESTIONS_ERROR") |  | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"} |

## frontend/pages/home-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 62:163 HomePage | button frontendText(locale, "COMMON_RETRY") | onClick=onRetry; type="button" | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; {"kind":"logical","expression":"state.retryable !== false","operator":"&&"}; earli… |
| 68:18 HomePage | div  |  | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: !("summary" in state) |
| 68:91 HomePage | button frontendText(locale, "COMMON_RETRY") | onClick=onRetry; type="button" | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: !("summary" in state) |
| 87:13 HomePage | a frontendText(locale, "WORKBENCH_QUICK_SUBMIT") | href="/submit" | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: !("summary" in state) |
| 88:13 HomePage | a frontendText(locale, "WORKBENCH_QUICK_AI") | href="/agent" | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: !("summary" in state) |
| 98:13 HomePage | a frontendText(locale, "WORKBENCH_OPEN_TASKS") | href="/tasks" | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: !("summary" in state) |
| 111:13 HomePage | a frontendText(locale, "HOME_OPEN_KNOWLEDGE") | href="/knowledge" | earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: !("summary" in state) |
| 119:23 HomePage | a  | href=&#96;/knowledge/${encodeURIComponent(item.id)}&#96; | {"kind":"branch","expression":"unavailable.has(\"knowledge\")","branch":"false"}; {"kind":"branch","expression":"summary.recentKnowledge.length","branch":"tr… |
| 127:19 HomePage | div  |  | {"kind":"branch","expression":"unavailable.has(\"knowledge\")","branch":"false"}; {"kind":"branch","expression":"state.recentMoreError","branch":"true"}; ear… |
| 129:42 HomePage | button frontendText(locale, "COMMON_RETRY") | onClick=onLoadMoreRecent; type="button" | {"kind":"branch","expression":"unavailable.has(\"knowledge\")","branch":"false"}; {"kind":"branch","expression":"state.recentMoreError","branch":"true"}; {"k… |
| 132:19 HomePage | button frontendText(locale, "KNOWLEDGE_LOAD_MORE") | onClick=onLoadMoreRecent; type="button" | disabled=state.recentPending; {"kind":"branch","expression":"unavailable.has(\"knowledge\")","branch":"false"}; {"kind":"branch","expression":"state.recentMo… |
| 149:38 HomePage | a content | href=item.href | {"kind":"branch","expression":"unavailable.has(\"activity\")","branch":"false"}; {"kind":"branch","expression":"summary.recentActivity.length","branch":"true… |
| 160:49 HomePage | a frontendText(locale, action.labelKey) | href=action.href | {"kind":"repeat","expression":"summary.quickActions"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error"; earlier return: !("s… |
| 174:409 LegacyHomePage | a frontendText(locale, "HOME_QUICK_SUBMIT") | href="/submit" |  |
| 174:1147 LegacyHomePage | a  | href=&#96;/knowledge/${encodeURIComponent(item.id)}&#96; | {"kind":"branch","expression":"recent.length","branch":"true"}; {"kind":"repeat","expression":"recent"} |
| 174:1759 LegacyHomePage | a frontendText(locale, "HOME_OPEN_KNOWLEDGE") | href="/knowledge" |  |
| 174:1893 LegacyHomePage | a frontendText(locale, "HOME_OPEN_SEARCH") | href="/search" |  |
| 174:2021 LegacyHomePage | a frontendText(locale, "HOME_OPEN_AGENT") | href="/agent" |  |

## frontend/pages/inbox-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 46:16 InboxPage | Button frontendText(locale, "INBOX_CAPTURE_TITLE") | onClick=() =&gt; setCaptureOpen(true); type="button" | aria-expanded=captureOpen; spread: (captureLocked ? { "data-inbox-capture-pending": "" } : {}) |
| 48:21 InboxPage | div actionError |  | {"kind":"logical","expression":"actionError","operator":"&&"} |
| 50:7 InboxPage | FilterSelect  | onChange=value =&gt; { const next = (value &#124;&#124; undefined) as InboxStatus &#124; undefined; guard(() =&gt; onFilterChange(next)); } | disabled=controlsPending |
| 64:5 InboxPage | AppliedFilters  | onClear=() =&gt; guard(() =&gt; onFilterChange(undefined)) |  |
| 71:80 InboxPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"} |
| 72:9 InboxPage | DataTable  | onPageChange=page =&gt; guard(() =&gt; onPageChange?.(page)); onPageSizeChange=pageSize =&gt; guard(() =&gt; onPageSizeChange?.(pageSize)); onLoadMore=onLoad… | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"} |
| 89:430 InboxPage | a item.sourceUrl | href=item.sourceUrl | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 91:201 InboxPage | Button frontendText(locale, "INBOX_OPEN_TASK") | onClick=() =&gt; guard(() =&gt; onOpenTask?.(item)); type="button" | disabled=controlsPending; {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error… |
| 91:478 InboxPage | Button item.status === "archived" ? frontendText(locale, "INBOX_RESTORE") : frontendText(locale, "INBOX_ARCHIVE") | onClick=() =&gt; confirmation.request(item, "status"); type="button" | disabled=controlsPending; {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error… |
| 91:902 InboxPage | Button frontendText(locale, "INBOX_PROMOTE_TASK") | onClick=() =&gt; confirmation.request(item, "task"); type="button" | disabled=controlsPending; {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error… |
| 95:32 InboxPage | Dialog  | onOpenChange=next =&gt; { if (!next) setCaptureOpen(false); } | open=captureOpen; {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"} |
| 96:5 InboxPage | DialogContent  |  | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"container","tag":"Dialog","attributes":{"open":"captureOpen"}} |
| 99:29 InboxPage | InboxCreateForm  | onCreate=onCreate; onCreateReadback=onCreateReadback; onCreateDenied=onCreateDenied; onCreateLock=locked =&gt; { setCaptureLocked(locked); onCreateLock?.(loc… | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"container","tag":"Dialog","attributes":{"open":"captureOpen"}} |
| 100:62 InboxPage | Button frontendText(locale, "COMMON_CANCEL") | onClick=() =&gt; setCaptureOpen(false); type="button" | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"container","tag":"Dialog","attributes":{"open":"captureOpen"}} |

## frontend/pages/knowledge-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 40:5 KnowledgePage | AppliedFilters  | onClear=() =&gt; onFilterChange?.({}) |  |
| 42:135 KnowledgePage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; {"ki… |
| 43:26 KnowledgePage | div  |  | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 43:130 KnowledgePage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 43:263 KnowledgePage | ReviewPanel  | onRetry=onRetryReview; onPeriodChange=onReviewPeriodChange; onDiscardPeriod=onDiscardPeriod | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 43:504 KnowledgePage | SectionUnread  | onRetry=onRetrySections | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 43:610 KnowledgePage | ToReadPanel  | onLoadMore=onLoadMoreFavorites | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 43:814 KnowledgePage | SectionUnread  | onRetry=onRetrySections | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 43:987 KnowledgePage | SectionUnread  | onRetry=onRetrySections | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 43:1097 KnowledgePage | RecentResearchPanel  | onLoadMore=onLoadMoreResearch | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 43:1309 KnowledgePage | SectionUnread  | onRetry=onRetrySections | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 43:1407 KnowledgePage | PrivateNotesPanel  | onLoadMore=onLoadMoreNotes | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 43:1599 KnowledgePage | SectionUnread  | onRetry=onRetrySections | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 43:1703 KnowledgePage | ActivityPanel  | onLoadMore=onLoadMoreActivity | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 43:1848 KnowledgePage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"} |
| 43:2474 KnowledgePage | a item.title?.trim() &#124;&#124; frontendText(locale, "KNOWLEDGE_UNTITLED") | href=&#96;/knowledge/${encodeURIComponent(item.id)}&#96; | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"} |
| 43:3555 KnowledgePage | KnowledgeShareButton  |  | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"} |
| 51:25 SectionMore | div  |  | {"kind":"branch","expression":"moreError","branch":"true"} |
| 51:230 SectionMore | Button frontendText(locale, "COMMON_RETRY") | onClick=onLoadMore; type="button" | {"kind":"branch","expression":"moreError","branch":"true"}; {"kind":"logical","expression":"onLoadMore","operator":"&&"} |
| 53:10 SectionMore | Button frontendText(locale, "KNOWLEDGE_LOAD_MORE") | onClick=onLoadMore; type="button" | disabled=morePending; earlier return: moreError; earlier return: !nextCursor &#124;&#124; !onLoadMore |
| 57:10 SectionUnread | div  |  |  |
| 57:257 SectionUnread | Button frontendText(locale, "KNOWLEDGE_SECTION_RETRY") | onClick=onRetry; type="button" | {"kind":"logical","expression":"onRetry","operator":"&&"} |
| 61:346 ToReadPanel | a  | href=&#96;/knowledge/${encodeURIComponent(item.id)}&#96; | {"kind":"repeat","expression":"items"} |
| 61:975 ToReadPanel | SectionMore  | onLoadMore=onLoadMore |  |
| 65:494 ReviewPanel | ReviewPeriodControl  | onChange=(next) =&gt; onPeriodChange?.(next) | disabled=periodBlocked |
| 65:813 ReviewPanel | div  |  | {"kind":"logical","expression":"periodBlocked","operator":"&&"} |
| 65:971 ReviewPanel | Button frontendText(locale, "REVIEW_PERIOD_RECORD_DISCARD") | onClick=onDiscardPeriod; type="button" | {"kind":"logical","expression":"periodBlocked","operator":"&&"} |
| 65:1134 ReviewPanel | p periodNotice |  | {"kind":"logical","expression":"periodNotice","operator":"&&"} |
| 65:1404 ReviewPanel | p frontendText(locale, "KNOWLEDGE_REVIEW_ERROR") |  | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"} |
| 65:1521 ReviewPanel | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry; type="button" | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"}; {"kind":"logical","expression":"onRetry","operator":"&&"} |
| 65:1778 ReviewPanel | a  | href=&#96;/knowledge/${encodeURIComponent(item.knowledgeItemId)}&#96; | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"branch","expression":"state.data.items.length","branch":"true"}; {"kind"… |
| 69:222 ActivityPanel | a  | href=item.resourceType === "knowledge" ? &#96;/knowledge/${encodeURIComponent(item.resourceId)}&#96; : item.resourceType === "task" ? "/tasks" : item.resourc… | {"kind":"repeat","expression":"items"} |
| 69:802 ActivityPanel | p frontendText(locale, "KNOWLEDGE_SECTION_UNREAD") |  | {"kind":"logical","expression":"moreError","operator":"&&"} |
| 69:930 ActivityPanel | Button frontendText(locale, "KNOWLEDGE_ACTIVITY_LOAD_MORE") | onClick=onLoadMore | {"kind":"logical","expression":"nextCursor","operator":"&&"} |
| 73:234 RecentKnowledgePanel | a  | href=&#96;/knowledge/${encodeURIComponent(item.id)}&#96; | {"kind":"repeat","expression":"items"} |
| 77:964 RecentResearchPanel | a frontendText(locale, "KNOWLEDGE_RESEARCH_OPEN") | href=&#96;/knowledge/${encodeURIComponent(item.knowledgeItemId)}?researchRunId=${encodeURIComponent(item.id)}&#96; | {"kind":"repeat","expression":"items"} |
| 77:1225 RecentResearchPanel | SectionMore  | onLoadMore=onLoadMore |  |
| 81:235 PrivateNotesPanel | a  | href=&#96;/knowledge/${encodeURIComponent(note.knowledgeItemId)}&#96; | {"kind":"repeat","expression":"notes"} |
| 81:884 PrivateNotesPanel | SectionMore  | onLoadMore=onLoadMore |  |

## frontend/pages/knowledge-reader-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 47:10 KnowledgeReaderPage | KnowledgeReaderSessionPage  |  | spread: props |
| 111:50 KnowledgeReaderSessionPage | p frontendText(locale, "KNOWLEDGE_READER_FAVORITE_UNCONFIRMED") |  | {"kind":"logical","expression":"favoritePhase === \"unknown\"","operator":"&&"} |
| 111:203 KnowledgeReaderSessionPage | p frontendText(locale, "KNOWLEDGE_READER_FAVORITE_STORAGE") |  | {"kind":"logical","expression":"favoritePhase === \"blocked\"","operator":"&&"} |
| 111:453 KnowledgeReaderSessionPage | Button frontendText(locale, "KNOWLEDGE_READER_FAVORITE_CHECK") | onClick=() =&gt; void onCheckFavorite() | disabled=favoritePhase === "checking" &#124;&#124; favoritePhase === "saving"; {"kind":"logical","expression":"(favoriteError &#124;&#124; favoritePhase === … |
| 111:683 KnowledgeReaderSessionPage | p frontendText(locale, "KNOWLEDGE_READER_FAVORITE_UNKNOWN") |  | {"kind":"logical","expression":"favoriteError","operator":"&&"} |
| 111:932 KnowledgeReaderSessionPage | Button favorite ? frontendText(locale, "KNOWLEDGE_READER_UNFAVORITE") : frontendText(locale, "KNOWLEDGE_READER_FAVORITE") | onClick=() =&gt; void onToggleFavorite() | disabled=favoritePhase !== "idle"; aria-busy=favoritePhase === "saving"; {"kind":"logical","expression":"typeof favorite === \"boolean\" && !favoriteError &&… |
| 111:1313 KnowledgeReaderSessionPage | Button diffState.kind === "loading" ? frontendText(locale, "KNOWLEDGE_READER_COMPARING") : frontendText(locale, "KNOWLEDGE_READER_COMPARE") | onClick=onCompare | disabled=diffState.kind === "loading"; {"kind":"logical","expression":"normalizedRevision.previousRevisionId && onCompare","operator":"&&"} |
| 111:1592 KnowledgeReaderSessionPage | a frontendText(locale, "MESSAGES_DISCUSS") | href=contextDiscussionHref({ kind: "knowledge", id: normalizedRevision.knowledgeItemId }) | {"kind":"logical","expression":"normalizedRevision.knowledgeItemId","operator":"&&"} |
| 111:1845 KnowledgeReaderSessionPage | a frontendText(locale, "KNOWLEDGE_READER_ASK") | href="/agent?scope=items&knowledgeItemId=" + encodeURIComponent(normalizedRevision.knowledgeItemId) |  |
| 114:130 KnowledgeReaderSessionPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"} |
| 116:11 KnowledgeReaderSessionPage | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 119:5 KnowledgeReaderSessionPage | ExpandableTabs  | onValueChange=setMobilePanel | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 125:9 KnowledgeReaderSessionPage | ReaderOutlinePanel  | onSelectChunk=setSelectedChunkId | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 147:9 KnowledgeReaderSessionPage | SourcePanel  | onSelectChunk=setSelectedChunkId | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 148:9 KnowledgeReaderSessionPage | ReaderNotePanel  | onTitleChange=(value) =&gt; note.edit("title", value); onBodyChange=(value) =&gt; note.edit("body", value); onSave=saveNote; onCheck=() =&gt; void note.check… | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 149:43 KnowledgeReaderSessionPage | BacklinkPanel  | onRetry=onRetryBacklinks | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 150:42 KnowledgeReaderSessionPage | RelatedKnowledgePanel  | onRetry=onRetryRelated | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 171:10 ReaderSection | Card  |  | spread: cardProps |
| 191:13 ReaderSectionToggle | Button  | type="button" |  |
| 200:655 ReaderNotePanel | p frontendText(locale, "KNOWLEDGE_NOTE_DISCARD_ERROR") |  | {"kind":"logical","expression":"discardError","operator":"&&"} |
| 200:778 ReaderNotePanel | div  |  | {"kind":"logical","expression":"phase === \"unknown\"","operator":"&&"} |
| 200:851 ReaderNotePanel | Button frontendText(locale, "KNOWLEDGE_NOTE_CHECK") | onClick=onCheck | {"kind":"logical","expression":"phase === \"unknown\"","operator":"&&"} |
| 200:1013 ReaderNotePanel | div  |  | {"kind":"logical","expression":"phase === \"storage-error\"","operator":"&&"} |
| 200:1116 ReaderNotePanel | Button frontendText(locale, "KNOWLEDGE_NOTE_CHECK") | onClick=onRetryLoad | {"kind":"logical","expression":"phase === \"storage-error\"","operator":"&&"} |
| 200:1287 ReaderNotePanel | div  |  | {"kind":"logical","expression":"phase === \"load-error\"","operator":"&&"} |
| 200:1363 ReaderNotePanel | Button frontendText(locale, "COMMON_RETRY") | onClick=onRetryLoad | {"kind":"logical","expression":"phase === \"load-error\"","operator":"&&"} |
| 200:1628 ReaderNotePanel | input  | onChange=(event) =&gt; onTitleChange(event.currentTarget.value) | readOnly=shared &#124;&#124; locked |
| 200:2101 ReaderNotePanel | Textarea  | onChange=(event) =&gt; onBodyChange(event.currentTarget.value) | readOnly=shared &#124;&#124; locked |
| 200:2359 ReaderNotePanel | span statusLabel |  | {"kind":"logical","expression":"!shared","operator":"&&"} |
| 200:2460 ReaderNotePanel | Button status === "saving" ? frontendText(locale, "KNOWLEDGE_NOTE_SAVING") : frontendText(locale, "KNOWLEDGE_NOTE_SAVE") | onClick=onSave | disabled=locked &#124;&#124; status === "saving"; {"kind":"logical","expression":"!shared","operator":"&&"} |
| 200:2859 ReaderNotePanel | div  |  | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.phase === \"unknown\"","operator":"&&"} |
| 200:2938 ReaderNotePanel | Button frontendText(locale, "KNOWLEDGE_NOTE_CHECK") | onClick=() =&gt; void sharing.check() | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.phase === \"unknown\"","operator":"&&"} |
| 200:3133 ReaderNotePanel | div  |  | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.phase === \"storage-error\"","operator":"&&"} |
| 200:3242 ReaderNotePanel | Button frontendText(locale, "KNOWLEDGE_NOTE_CHECK") | onClick=sharing.retryLoad | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.phase === \"storage-error\"","operator":"&&"} |
| 200:3433 ReaderNotePanel | Button frontendText(locale, "COMMON_RETRY") | onClick=sharing.retryLoad | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.phase === \"load-error\"","operator":"&&"} |
| 200:3691 ReaderNotePanel | Select  | onChange=(event) =&gt; sharing.select(event.currentTarget.value) | disabled=sharing.locked; {"kind":"logical","expression":"!shared","operator":"&&"} |
| 200:3914 ReaderNotePanel | option frontendText(locale, "KNOWLEDGE_NOTE_SHARE_SELECT") |  | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"container","tag":"Select","attributes":{"disabled":"sharing.locked"}} |
| 200:4101 ReaderNotePanel | option member.email |  | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"container","tag":"Select","attributes":{"disabled":"sharing.locked"}}; {"kind":"repeat","… |
| 200:4177 ReaderNotePanel | Button frontendText(locale, "KNOWLEDGE_NOTE_SHARE_ACTION") | onClick=() =&gt; sharing.request("share") | disabled=sharing.locked &#124;&#124; !recipientMemberId; {"kind":"logical","expression":"!shared","operator":"&&"} |
| 200:4893 ReaderNotePanel | button frontendText(locale, "KNOWLEDGE_NOTE_SHARE_REVOKE") | onClick=() =&gt; sharing.request("revoke", share); type="button" | disabled=sharing.locked; {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"branch","expression":"(sharing.phase === \"loading\" &#124;&#124… |
| 200:5124 ReaderNotePanel | p frontendText(locale, "KNOWLEDGE_NOTE_SHARE_ERROR") |  | {"kind":"logical","expression":"!shared","operator":"&&"}; {"kind":"logical","expression":"sharing.error","operator":"&&"} |
| 212:7 ReaderOutlinePanel | FileTree  | onValueChange=onSelectChunk | {"kind":"branch","expression":"headings.length === 0","branch":"false"} |
| 233:11 RelatedKnowledgePanel | p frontendText(locale, "KNOWLEDGE_RELATED_UNREAD") |  | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earl… |
| 233:130 RelatedKnowledgePanel | Button frontendText(locale, "KNOWLEDGE_RELATED_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; {"ki… |
| 236:170 RelatedKnowledgePanel | a  | href=&#96;/knowledge/${encodeURIComponent(item.id)}&#96; | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 245:11 BacklinkPanel | p frontendText(locale, "KNOWLEDGE_BACKLINKS_UNREAD") |  | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earl… |
| 245:132 BacklinkPanel | Button frontendText(locale, "KNOWLEDGE_BACKLINKS_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; {"ki… |
| 248:66 BacklinkPanel | a  | href="/knowledge/" + encodeURIComponent(item.id) | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 269:29 SourcePanel | a frontendText(locale, "KNOWLEDGE_READER_DOWNLOAD") | href=downloadHref | {"kind":"logical","expression":"downloadHref","operator":"&&"} |
| 272:144 SourcePanel | div  |  | {"kind":"branch","expression":"revision.chunks.length === 0","branch":"false"} |
| 272:278 SourcePanel | button  | onClick=() =&gt; onSelectChunk(chunk.id); type="button" | {"kind":"branch","expression":"revision.chunks.length === 0","branch":"false"}; {"kind":"repeat","expression":"revision.chunks"} |
| 272:1103 SourcePanel | div  |  | {"kind":"logical","expression":"selectedChunk","operator":"&&"} |
| 296:38 RevisionDiffPanel | p frontendText(locale, "KNOWLEDGE_READER_DIFF_ERROR") |  | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |

## frontend/pages/login-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 42:21 LoginPage | p error |  | {"kind":"logical","expression":"error","operator":"&&"} |
| 44:15 LoginPage | Button frontendText(locale, "LOGIN_GITHUB") | onClick=() =&gt; { window.location.href = "/auth/github"; } | {"kind":"branch","expression":"githubEnabled","branch":"true"} |
| 47:11 LoginPage | form  | onSubmit=(event) =&gt; { event.preventDefault(); void onCodeSubmit(); } | aria-busy=pending &#124;&#124; undefined |
| 49:27 LoginPage | p formError |  | {"kind":"container","tag":"form","attributes":{"aria-busy":"pending &#124;&#124; undefined"}}; {"kind":"logical","expression":"formError","operator":"&&"} |
| 50:130 LoginPage | Input  | onChange=(event) =&gt; setEmail(event.target.value); type="email" | disabled=pending; {"kind":"container","tag":"form","attributes":{"aria-busy":"pending &#124;&#124; undefined"}} |
| 51:128 LoginPage | Input  | onChange=(event) =&gt; setCode(event.target.value); type="text" | disabled=pending; {"kind":"container","tag":"form","attributes":{"aria-busy":"pending &#124;&#124; undefined"}} |
| 52:13 LoginPage | StatefulButton frontendText(locale, "LOGIN_CODE_SUBMIT") | type="submit" | disabled=!canSubmit; {"kind":"container","tag":"form","attributes":{"aria-busy":"pending &#124;&#124; undefined"}} |

## frontend/pages/messages/messages-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 37:103 MessagesPage | Button frontendText(locale, "MESSAGES_RETRY") | onClick=onRetry | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"} |
| 46:9 MessagesPage | Button frontendText(locale, "MESSAGES_RETRY") | onClick=onRetry | {"kind":"logical","expression":"state.kind === \"revoked\"","operator":"&&"} |
| 47:9 MessagesPage | ButtonLink frontendText(locale, "MESSAGES_BACK") | href="/messages" | {"kind":"logical","expression":"state.kind === \"revoked\"","operator":"&&"} |
| 55:49 MessagesPage | ButtonLink frontendText(locale, "MESSAGES_OPEN_CONTEXT") | href=discussionContextHref({ kind: thread.contextKind, id: thread.contextId }) | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"container","tag":"div","attributes":{"aria-busy":"pending &#124;&#124; u… |
| 55:230 MessagesPage | ButtonLink frontendText(locale, "MESSAGES_OPEN_THREAD") | href=threadDiscussionHref(thread.id) | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"container","tag":"div","attributes":{"aria-busy":"pending &#124;&#124; u… |
| 59:5 MessagesPage | DiscussionCursorPagination  | onPrevious=onPrevious; onNext=() =&gt; state.nextCursor && onNext(state.nextCursor); onLimitChange=onLimitChange | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"} |

## frontend/pages/messages/thread-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 69:40 ThreadPage | div  |  | {"kind":"branch","expression":"recordBlocked","branch":"true"} |
| 69:150 ThreadPage | Button frontendText(locale, "MESSAGES_DRAFT_RECORD_DISCARD") | onClick=discardRecord; type="button" | {"kind":"branch","expression":"recordBlocked","branch":"true"} |
| 70:22 ThreadPage | p recordNotice |  | {"kind":"branch","expression":"recordBlocked","branch":"false"}; {"kind":"branch","expression":"recordNotice","branch":"true"} |
| 122:45 ThreadPage | a state.thread.contextId | href=discussionContextHref({ kind: state.thread.contextKind, id: state.thread.contextId }) | {"kind":"branch","expression":"state.kind === \"ready\"","branch":"true"} |
| 124:9 ThreadPage | a frontendText(locale, "MESSAGES_BACK") | href="/messages" |  |
| 125:9 ThreadPage | Button frontendText(locale, "MESSAGES_REFRESH") | onClick=onRefresh | disabled=pending |
| 131:110 ThreadPage | Button frontendText(locale, "MESSAGES_RETRY") | onClick=onRetry | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"} |
| 137:11 ThreadPage | Button frontendText(locale, "MESSAGES_RETRY") | onClick=onRetry | {"kind":"logical","expression":"state.kind === \"revoked\"","operator":"&&"} |
| 138:11 ThreadPage | ButtonLink frontendText(locale, "MESSAGES_BACK") | href="/messages" | {"kind":"logical","expression":"state.kind === \"revoked\"","operator":"&&"} |
| 145:900 ThreadPage | Button frontendText(locale, "MESSAGES_REPLY") | onClick=() =&gt; selectReply(message) | disabled=locked; {"kind":"logical","expression":"state.kind === \"ready\" && !recoveryBlocked","operator":"&&"}; {"kind":"container","tag":"div","attributes"… |
| 147:5 ThreadPage | DiscussionCursorPagination  | onPrevious=onPrevious; onNext=() =&gt; state.nextCursor && onNext(state.nextCursor); onLimitChange=onLimitChange | {"kind":"logical","expression":"state.kind === \"ready\" && !recoveryBlocked","operator":"&&"} |
| 148:5 ThreadPage | DiscussionComposer  | onLookup=onLookup ? checkResult : undefined; onBodyChange=(value) =&gt; draft.edit("body", value); onCancelReply=() =&gt; selectReply(null); onSubmit=submit | {"kind":"logical","expression":"state.kind === \"ready\" && !recoveryBlocked","operator":"&&"} |
| 165:10 DiscussionComposer | form  | onSubmit=(event) =&gt; void onSubmit(event) |  |
| 166:202 DiscussionComposer | button frontendText(locale, "MESSAGES_CANCEL_REPLY") | onClick=onCancelReply; type="button" | disabled=locked; {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"replyTo","operator":"&&"} |
| 168:197 DiscussionComposer | Button frontendText(locale, status === "checking" ? "MESSAGES_CHECKING_RESULT" : "MESSAGES_CHECK_RESULT") | onClick=() =&gt; void onLookup(); type="button" | disabled=status === "pending" &#124;&#124; status === "checking"; {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"operatio… |
| 170:5 DiscussionComposer | Textarea  | onChange=(event) =&gt; onBodyChange(event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"form","attributes":{}} |
| 171:158 DiscussionComposer | Button status === "pending" ? frontendText(locale, "MESSAGES_SENDING") : frontendText(locale, status === "error" ? "MESSAGES_RETRY_SEND" : "MESSAGES_SEND") | type="submit" | disabled=status === "pending" &#124;&#124; status === "checking" &#124;&#124; !body.trim(); {"kind":"container","tag":"form","attributes":{}} |
| 192:349 DiscussionCursorPagination | Select  | onChange=(event) =&gt; onLimitChange(Number(event.currentTarget.value) as 20 &#124; 50) | disabled=pending |
| 192:615 DiscussionCursorPagination | Button labels.previousLabel | onClick=onPrevious; type="button" | disabled=pending &#124;&#124; page &lt;= 1 |
| 192:773 DiscussionCursorPagination | Button labels.nextLabel | onClick=onNext; type="button" | disabled=pending &#124;&#124; !hasNext |

## frontend/pages/my-submissions-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 55:16 MySubmissionsPage | ButtonLink frontendText(locale, "SUBMIT_TITLE") | onClick=(event) =&gt; { event.preventDefault(); writeWorkspaceHistory("push", "/submit"); }; href="/submit" |  |
| 65:24 MySubmissionsPage | AppliedFilters  | onClear=() =&gt; applyRange({ from: "", to: "" }) | {"kind":"logical","expression":"!range.invalid","operator":"&&"} |
| 68:141 MySubmissionsPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"branch","expression":"range.invalid","branch":"false"}; {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branc… |
| 69:26 MySubmissionsPage | div  |  | {"kind":"branch","expression":"range.invalid","branch":"false"}; {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branc… |
| 69:130 MySubmissionsPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"branch","expression":"range.invalid","branch":"false"}; {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branc… |
| 70:23 MySubmissionsPage | div resubmitError |  | {"kind":"branch","expression":"range.invalid","branch":"false"}; {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branc… |
| 71:15 MySubmissionsPage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"branch","expression":"range.invalid","branch":"false"}; {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branc… |
| 80:18 MySubmissionsPage | div  |  | {"kind":"branch","expression":"range.invalid","branch":"false"}; {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branc… |
| 123:7 SubmissionRangeFilter | DateRangeInput  | onChange=setDraft | disabled=pending |
| 130:7 SubmissionRangeFilter | Button frontendText(locale, "CALENDAR_RANGE_APPLY") | onClick=() =&gt; { if (invalid) return; applyRange(draft); }; type="button" | disabled=pending &#124;&#124; invalid |
| 132:17 SubmissionRangeFilter | p frontendText(locale, "SUBMISSIONS_RANGE_INVALID") |  | {"kind":"logical","expression":"invalid","operator":"&&"} |
| 155:10 resubmitAction | button frontendText(locale, "SUBMISSIONS_RESUBMIT") | onClick=() =&gt; onResubmit(item); type="button" | earlier return: mark; earlier return: item.status !== "revision_requested"; earlier return: !onResubmit &#124;&#124; !submissionResubmitSource(item) |

## frontend/pages/notifications/notifications-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 97:7 NotificationsPage | FilterSelect  | onChange=(value) =&gt; onFilterChange({ ...filters, read: readFilter(value) }) | disabled=pending |
| 98:7 NotificationsPage | FilterSelect  | onChange=(value) =&gt; onFilterChange({ ...filters, eventType: eventFilter(value) }) | disabled=pending |
| 102:15 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_MARK_VISIBLE_READ") | onClick=() =&gt; onMarkVisibleRead(visibleUnreadIds) | disabled=actionsDisabled &#124;&#124; visibleUnreadIds.length === 0; {"kind":"logical","expression":"ready","operator":"&&"} |
| 103:5 NotificationsPage | AppliedFilters  | onClear=() =&gt; onFilterChange({}) |  |
| 106:29 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_UPDATE_RECORD_DISCARD") | onClick=onDiscardRecord | {"kind":"logical","expression":"recordBlocked","operator":"&&"} |
| 113:9 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_RETRY") | onClick=onRetry | {"kind":"logical","expression":"revokedTarget","operator":"&&"} |
| 117:192 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_RETRY") | onClick=onRetry | {"kind":"logical","expression":"state.kind === \"recovery\"","operator":"&&"} |
| 118:108 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_RETRY") | onClick=onRetry | {"kind":"logical","expression":"state.kind === \"error\"","operator":"&&"} |
| 119:120 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_RETRY") | onClick=onRetry | {"kind":"logical","expression":"state.kind === \"forbidden\"","operator":"&&"} |
| 123:9 NotificationsPage | div  | onScroll=onFeedScroll | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"branch","expression":"state.items.length === 0","branch":"false"} |
| 137:27 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_OPEN") | onClick=() =&gt; onOpen(item.id) | disabled=actionsDisabled; {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"branch","expression":"state.items.length === 0… |
| 138:44 NotificationsPage | Button frontendText(locale, "NOTIFICATIONS_MARK_READ") | onClick=() =&gt; onMarkRead(item.id) | disabled=actionsDisabled; {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"branch","expression":"state.items.length === 0… |
| 148:67 NotificationsPage | DataPagination  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"branch","expression":"state.items.length === 0","branch":"false"}; {"kin… |
| 154:23 NotificationsPage | p statusText |  | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"branch","expression":"state.items.length === 0","branch":"false"}; {"kin… |

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
| 45:68 ProjectsPage | Dialog  | onOpenChange=next =&gt; { if (!next) setCreateOpen(false); } | open=createOpen; {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"} |
| 46:5 ProjectsPage | DialogContent  |  | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}} |
| 49:29 ProjectsPage | PlanningCreateForm  | onCreate=onCreate; onCreateReadback=onCreateReadback; onCreateDenied=onCreateDenied; onCreateLock=locked =&gt; { setCreateComposerLocked(locked); onCreateLoc… | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}} |
| 50:62 ProjectsPage | Button frontendText(locale, "COMMON_CANCEL") | onClick=() =&gt; setCreateOpen(false); type="button" | {"kind":"logical","expression":"state.kind === \"ready\"","operator":"&&"}; {"kind":"container","tag":"Dialog","attributes":{"open":"createOpen"}} |
| 58:16 ProjectsPage | Button frontendText(locale, "PROJECTS_CREATE_TITLE") | onClick=() =&gt; setCreateOpen(true); type="button" | aria-expanded=createOpen; disabled=createBlocked; {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open && state.kind === … |
| 60:21 ProjectsPage | div actionError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open && state.kind === \"ready\" &#124;&#124; undefined"}}; {"kind":"logi… |
| 63:80 ProjectsPage | Button frontendText(locale, "PROJECTS_RETRY") | onClick=onRetry | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open && state.kind === \"ready\" &#124;&#124; undefined"}}; {"kind":"bran… |
| 64:9 ProjectsPage | DataTable  | onPageChange=onPageChange ? changePage : undefined; onPageSizeChange=onPageSizeChange ? changePageSize : undefined; onLoadMore=listBlocked ? undefined : onLo… | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open && state.kind === \"ready\" &#124;&#124; undefined"}}; {"kind":"bran… |
| 90:892 ProjectsPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.open && state.kind === \"ready\" &#124;&#124; undefined"}}; {"kind":"bran… |
| 90:1018 ProjectsPage | Button frontendText(locale, "PROJECTS_SUMMARY_RETRY") | onClick=() =&gt; onRetrySummary?.(project); type="button" | disabled=listBlocked &#124;&#124; summaryPending.includes(project.id); {"kind":"container","tag":"section","attributes":{"aria-hidden":"statusConfirmation.op… |

## frontend/pages/search-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 138:25 SearchPage | div  |  | {"kind":"logical","expression":"composerBlocked","operator":"&&"} |
| 138:187 SearchPage | Button frontendText(locale, "SEARCH_COMPOSER_RECORD_DISCARD") | onClick=onDiscardComposer; type="button" | {"kind":"logical","expression":"composerBlocked","operator":"&&"} |
| 139:24 SearchPage | p composerNotice |  | {"kind":"logical","expression":"composerNotice","operator":"&&"} |
| 143:7 SearchPage | form  | onSubmit=(event) =&gt; { event.preventDefault(); onSubmit?.(); } |  |
| 144:137 SearchPage | Input  | onChange=(event) =&gt; onQueryChange?.(event.currentTarget.value) | disabled=queryLocked; {"kind":"container","tag":"form","attributes":{}} |
| 145:9 SearchPage | Button frontendText(locale, "SEARCH_SUBMIT") | type="submit" | disabled=!onSubmit &#124;&#124; queryLocked; {"kind":"container","tag":"form","attributes":{}} |
| 148:55 SearchPage | p savedViewError |  | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"savedViewError && !savedViewRecordBlo… |
| 149:36 SearchPage | div  |  | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"savedViewRecordBlocked","operator":"&&"} |
| 149:155 SearchPage | Button frontendText(locale, "SEARCH_SAVED_VIEW_RECORD_DISCARD") | onClick=onDiscardSavedViewRecord; type="button" | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"savedViewRecordBlocked","operator":"&&"} |
| 150:30 SearchPage | Button frontendText(locale, "SEARCH_SAVED_VIEW_CHECK") | onClick=onCheckSavedView; type="button" | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"savedViewUnknown","operator":"&&"} |
| 152:26 SearchPage | form  | onSubmit=(event) =&gt; { event.preventDefault(); const name = savedViewName.trim(); if (controlledName === undefined && !name) return; onSaveView(name); } | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"onSaveView","operator":"&&"} |
| 153:13 SearchPage | Input  | onChange=(event) =&gt; setSavedViewName(event.currentTarget.value) | disabled=savedViewPending; {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"onSaveView… |
| 154:13 SearchPage | Button frontendText(locale, "SEARCH_SAVE_VIEW") | type="submit" | disabled=savedViewPending &#124;&#124; !savedViewName.trim(); {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind"… |
| 156:36 SearchPage | div  |  | {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"!!savedViews?.length","operator":"&&"} |
| 157:293 SearchPage | button view.name | onClick=() =&gt; onApplyView?.(view); type="button" | disabled=savedViewPending; {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"!!savedVie… |
| 157:471 SearchPage | button × | onClick=() =&gt; onDeleteView?.(view.id); type="button" | disabled=savedViewPending &#124;&#124; !onDeleteView; {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logica… |
| 158:34 SearchPage | Button frontendText(locale, viewsExpanded ? "COMMON_COLLAPSE" : "COMMON_EXPAND") | onClick=() =&gt; setViewsExpanded((current) =&gt; !current); type="button" | aria-expanded=viewsExpanded; {"kind":"logical","expression":"(savedViews &#124;&#124; onSaveView)","operator":"&&"}; {"kind":"logical","expression":"!!savedV… |
| 171:40 SearchPage | form  | onSubmit=(event) =&gt; { event.preventDefault(); if (commitFilters()) close(); } | {"kind":"logical","expression":"onFilterChange","operator":"&&"} |
| 172:9 SearchPage | FilterSelect  | onChange=(value) =&gt; setDraft((current) =&gt; ({ ...current, kind: value })) | disabled=queryLocked; {"kind":"logical","expression":"onFilterChange","operator":"&&"}; {"kind":"container","tag":"form","attributes":{}} |
| 173:131 SearchPage | Input  | onChange=(event) =&gt; setDraft((current) =&gt; ({ ...current, authorId: event.currentTarget.value })) | disabled=queryLocked; {"kind":"logical","expression":"onFilterChange","operator":"&&"}; {"kind":"container","tag":"form","attributes":{}} |
| 174:9 SearchPage | DateRangeInput  | onChange=(next) =&gt; setDraft((current) =&gt; ({ ...current, publishedFrom: next.from, publishedTo: next.to })) | disabled=queryLocked; {"kind":"logical","expression":"onFilterChange","operator":"&&"}; {"kind":"container","tag":"form","attributes":{}} |
| 189:9 SearchPage | Button frontendText(locale, "SEARCH_FILTERS_APPLY") | type="submit" | disabled=queryLocked; {"kind":"logical","expression":"onFilterChange","operator":"&&"}; {"kind":"container","tag":"form","attributes":{}} |
| 190:25 SearchPage | p filterError |  | {"kind":"logical","expression":"onFilterChange","operator":"&&"}; {"kind":"container","tag":"form","attributes":{}}; {"kind":"logical","expression":"filterEr… |
| 193:24 SearchPage | AppliedFilters  | onClear=() =&gt; onFilterChange({ tagIds: [] }) | {"kind":"logical","expression":"onFilterChange","operator":"&&"} |
| 195:133 SearchPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"} |
| 197:24 SearchPage | div  |  | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 197:128 SearchPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |
| 199:9 SearchPage | DataTable  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange; onLoadMore=onLoadMore | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"} |
| 215:160 SearchPage | a result.title?.trim() &#124;&#124; frontendText(locale, "SEARCH_UNTITLED") | href=result.href | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"} |
| 217:409 SearchPage | a frontendText(locale, "SEARCH_ASK_RESULT") | href=&#96;/agent?scope=items&knowledgeItemId=${encodeURIComponent(result.knowledgeItemId)}&#96; | {"kind":"branch","expression":"state.kind === \"loading\"","branch":"false"}; {"kind":"branch","expression":"state.kind === \"error\"","branch":"false"}; {"k… |

## frontend/pages/settings-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 57:1240 SettingsPage | Button frontendText(locale, mode === "light" ? "SHELL_THEME_LIGHT" : mode === "dark" ? "SHELL_THEME_DARK" : "SHELL_THEME_SYSTEM") | onClick=() =&gt; chooseTheme(mode); type="button" | disabled=save.kind === "saving"; {"kind":"repeat","expression":"([\"light\", \"dark\", \"system\"] as ThemeMode[])"} |
| 57:1937 SettingsPage | Select  | onChange=(event) =&gt; chooseLanguage(event.target.value) | disabled=save.kind === "saving" |
| 57:2058 SettingsPage | option frontendText(locale, "SHELL_LANGUAGE_ZH_CN") |  | {"kind":"container","tag":"Select","attributes":{"disabled":"save.kind === \"saving\""}} |
| 57:2135 SettingsPage | option frontendText(locale, "SHELL_LANGUAGE_EN") |  | {"kind":"container","tag":"Select","attributes":{"disabled":"save.kind === \"saving\""}} |
| 57:2390 SettingsPage | p frontendText(locale, "SETTINGS_SAVING") |  | {"kind":"logical","expression":"save.kind === \"saving\"","operator":"&&"} |
| 57:2521 SettingsPage | p frontendText(locale, "SETTINGS_SAVED") |  | {"kind":"logical","expression":"save.kind === \"saved\"","operator":"&&"} |
| 57:2652 SettingsPage | div  |  | {"kind":"logical","expression":"save.kind === \"failed\"","operator":"&&"} |
| 57:2800 SettingsPage | Button frontendText(locale, "COMMON_RETRY") | onClick=retrySave; type="button" | {"kind":"logical","expression":"save.kind === \"failed\"","operator":"&&"} |

## frontend/pages/submit-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 97:106 SubmitPage | a frontendText(locale, "SUBMIT_CHECK_SUBMISSIONS") | href="/my-submissions" | {"kind":"logical","expression":"recovery?.invalid","operator":"&&"} |
| 101:58 SubmitPage | Button frontendText(locale, pending ? "SUBMIT_BUTTON_PENDING" : "SUBMIT_RETRY") | onClick=recovery?.onRetry; type="button" | disabled=pending; {"kind":"logical","expression":"unresolved && !recovery?.invalid","operator":"&&"} |
| 101:232 SubmitPage | a frontendText(locale, "SUBMIT_CHECK_SUBMISSIONS") | href="/my-submissions" | {"kind":"logical","expression":"unresolved && !recovery?.invalid","operator":"&&"} |
| 114:72 SubmitPage | Button frontendText(locale, "SUBMIT_RESUBMIT_STATUS_RETRY") | onClick=onResubmitStatusRetry; type="button" | {"kind":"logical","expression":"resubmitting","operator":"&&"}; {"kind":"logical","expression":"resubmitted","operator":"&&"}; {"kind":"logical","expression"… |
| 115:33 SubmitPage | Button frontendText(locale, "SUBMIT_RESUBMIT_START_OVER") | onClick=onResubmitRestart; type="button" | {"kind":"logical","expression":"resubmitting","operator":"&&"}; {"kind":"logical","expression":"resubmitted","operator":"&&"}; {"kind":"logical","expression"… |
| 116:31 SubmitPage | Button frontendText(locale, "SUBMIT_RESUBMIT_CANCEL") | onClick=onResubmitLeave; type="button" | {"kind":"logical","expression":"resubmitting","operator":"&&"}; {"kind":"logical","expression":"resubmitted","operator":"&&"}; {"kind":"logical","expression"… |
| 121:5 SubmitPage | form  | onSubmit=(event) =&gt; { event.preventDefault(); if (!submitBlocked) onSubmit?.(draft); } | aria-busy=pending ? "true" : undefined |
| 125:100 SubmitPage | Input  | onChange=(event) =&gt; onDraftChange?.({ title: event.currentTarget.value }) | {"kind":"container","tag":"form","attributes":{"aria-busy":"pending ? \"true\" : undefined"}} |
| 126:98 SubmitPage | Select  | onChange=(event) =&gt; onDraftChange?.({ mode: event.currentTarget.value as SubmissionDraft["mode"] }) | {"kind":"container","tag":"form","attributes":{"aria-busy":"pending ? \"true\" : undefined"}} |
| 127:11 SubmitPage | option frontendText(locale, "SUBMIT_CONTENT_LABEL") |  | {"kind":"container","tag":"form","attributes":{"aria-busy":"pending ? \"true\" : undefined"}} |
| 127:87 SubmitPage | option frontendText(locale, "SUBMIT_MARKDOWN_LABEL") |  | {"kind":"container","tag":"form","attributes":{"aria-busy":"pending ? \"true\" : undefined"}} |
| 127:168 SubmitPage | option frontendText(locale, "SUBMIT_CODE_LABEL") |  | {"kind":"container","tag":"form","attributes":{"aria-busy":"pending ? \"true\" : undefined"}} |
| 129:204 SubmitPage | Textarea  | onChange=(event) =&gt; onDraftChange?.({ content: event.currentTarget.value }) | {"kind":"container","tag":"form","attributes":{"aria-busy":"pending ? \"true\" : undefined"}} |
| 136:135 SubmitPage | Button frontendText(locale, recheckReasons[draftSave.reason ?? "error"] === true ? "SUBMIT_DRAFT_RECHECK" : "SUBMIT_DRAFT_RETRY") | onClick=onDraftRetry; type="button" | {"kind":"container","tag":"form","attributes":{"aria-busy":"pending ? \"true\" : undefined"}}; {"kind":"logical","expression":"draftSave","operator":"&&"}; {… |
| 137:32 SubmitPage | Button frontendText(locale, "SUBMIT_DRAFT_DISCARD") | onClick=() =&gt; setDiscardConfirm(true); type="button" | disabled=draftSave.kind === "saving" &#124;&#124; discarding; {"kind":"container","tag":"form","attributes":{"aria-busy":"pending ? \"true\" : undefined"}}; … |
| 141:26 SubmitPage | Button frontendText(locale, pending ? "SUBMIT_BUTTON_PENDING" : resubmitting ? "SUBMIT_RESUBMIT_SUBMIT" : "SUBMIT_BUTTON") | type="submit" | disabled=submitDisabled; {"kind":"container","tag":"form","attributes":{"aria-busy":"pending ? \"true\" : undefined"}}; {"kind":"logical","expression":"!resu… |
| 144:30 SubmitPage | SubmissionCommentsPanel  | onRetry=comments.onRetry | {"kind":"logical","expression":"resubmit && comments","operator":"&&"} |
| 145:26 SubmitPage | ConfirmAction  | onCancel=() =&gt; setDiscardConfirm(false); onConfirm=() =&gt; { setDiscardConfirm(false); onDraftDiscard?.(); } | open=discardConfirm; {"kind":"logical","expression":"discardAvailable","operator":"&&"} |

## frontend/pages/tasks/task-editor.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 111:5 TaskEditor | owner.addEventListener  | WORKSPACE_LOCATION_CHANGE_EVENT, committed |  |
| 117:5 TaskEditor | owner.addEventListener  | "beforeunload", preventUnload |  |
| 272:22 TaskEditor | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"recordBlocked","branch":"true"} |
| 272:104 TaskEditor | button t("TASKS_DRAFT_RECORD_DISCARD") | onClick=discardRecord; type="button" | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"recordBlocked","branch":"true"} |
| 273:21 TaskEditor | p recordNotice |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"recordNotice","branch":"true"} |
| 274:14 TaskEditor | p t("TASKS_SAVING") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"busy","operator":"&&"} |
| 275:17 TaskEditor | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"unknown","operator":"&&"} |
| 276:7 TaskEditor | Button t("TASKS_CHECK_WRITE") | onClick=() =&gt; void check() | disabled=busy; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"unknown","operator":"… |
| 277:7 TaskEditor | Button t("TASKS_RETRY_WRITE") | onClick=() =&gt; { if (intent.current) void perform(intent.current, true); } | disabled=busy; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"unknown","operator":"… |
| 279:16 TaskEditor | p t(notice) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"notice","operator":"&&"} |
| 280:15 TaskEditor | p t("TASKS_ACTION_FAILED") / t("TASKS_INVALID_FORM") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"logical","expression":"error","operator":"&&"} |
| 281:16 TaskEditor | p t("TASKS_LOADING") |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"true"} |
| 281:112 TaskEditor | div  |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 281:165 TaskEditor | Button t("TASKS_RELOAD_DETAIL") | onClick=() =&gt; void read() | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 282:7 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); save(); } | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 283:58 TaskEditor | Input  | onChange=(event) =&gt; edit("fields", { ...currentDraft.current.fields, title: event.currentTarget.value }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 284:58 TaskEditor | Input  | onChange=(event) =&gt; edit("fields", { ...currentDraft.current.fields, notes: event.currentTarget.value }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 285:61 TaskEditor | Select  | onChange=(event) =&gt; edit("fields", { ...currentDraft.current.fields, priority: event.currentTarget.value }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 285:316 TaskEditor | option t(taskPriorityKey(priority)) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 286:56 TaskEditor | Input  | onChange=(event) =&gt; edit("fields", { ...currentDraft.current.fields, dueAt: event.currentTarget.value }); type="datetime-local" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 288:9 TaskEditor | Button t(taskId ? "TASKS_SAVE" : "TASKS_CREATE") | type="submit" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 291:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); if (!locked) { const next = currentDraft.current.status; void perform({ clean: ["status"], op: { op: "status… | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 292:43 TaskEditor | Select  | onChange=(event) =&gt; edit("status", event.currentTarget.value as TaskItem["status"]) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 292:255 TaskEditor | option t(taskStatusKey(value)) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 293:11 TaskEditor | Button t("TASKS_SAVE_STATUS") | type="submit" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 295:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); const progress = currentDraft.current.progress; const next = Number(progress); if (!locked && progress !== "… | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 296:45 TaskEditor | Input  | onChange=(event) =&gt; edit("progress", event.currentTarget.value); type="number" | disabled=locked &#124;&#124; ["done", "canceled"].includes(detail.task.status); {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; … |
| 297:11 TaskEditor | Button t("TASKS_SAVE_PROGRESS") | type="submit" | disabled=locked &#124;&#124; ["done", "canceled"].includes(detail.task.status); {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; … |
| 299:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); saveTags(); } | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 300:41 TaskEditor | Input  | onChange=(event) =&gt; edit("tags", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 301:11 TaskEditor | Button t("TASKS_SAVE_TAGS") | type="submit" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 303:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); const id = currentDraft.current.knowledgeId.trim(); if (!locked && id) void perform({ clean: ["knowledgeId"]… | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 304:38 TaskEditor | Input  | onChange=(event) =&gt; edit("knowledgeId", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 305:11 TaskEditor | Button t("TASKS_LINK_ADD") | type="submit" | disabled=locked &#124;&#124; detail.links.length &gt;= 5; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"b… |
| 307:254 TaskEditor | Button t("TASKS_LINK_REMOVE") | onClick=() =&gt; void perform({ op: { op: "unlink", taskId, linkId: link.id, expectedUpdatedAt: detail.task.updatedAt } }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 308:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); const title = currentDraft.current.subtaskTitle.trim(); const position = nextSubtaskPosition(subtasks); if (… | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 309:44 TaskEditor | Input  | onChange=(event) =&gt; edit("subtaskTitle", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 310:11 TaskEditor | Button t("TASKS_SUBTASK_ADD") | type="submit" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 312:226 TaskEditor | Select  | onChange=(event) =&gt; { const status = event.currentTarget.value as TaskSubtask["status"]; if (status !== item.status) void perform({ op: { op: "subtask-upd… | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 312:698 TaskEditor | option t(taskStatusKey(status)) |  | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 312:831 TaskEditor | Button item.status === "done" ? t("TASKS_SUBTASK_REOPEN") : t("TASKS_SUBTASK_DONE") | onClick=() =&gt; void perform({ op: { op: "subtask-update", taskId, subtaskId: item.id, title: item.title, status: item.status === "done" ? "todo" : "done", … | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 312:1292 TaskEditor | Button t("TASKS_SUBTASK_REMOVE") | onClick=() =&gt; void perform({ op: { op: "subtask-delete", taskId, subtaskId: item.id, expectedUpdatedAt: item.updatedAt } }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 313:9 TaskEditor | form  | onSubmit=(event) =&gt; { event.preventDefault(); const dependsOnTaskId = currentDraft.current.dependsOnTaskId.trim(); if (locked &#124;&#124; !/^[A-Za-z0-9][… | {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"false"}; {"kind":"… |
| 314:44 TaskEditor | Input  | onChange=(event) =&gt; edit("dependsOnTaskId", event.currentTarget.value) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 315:11 TaskEditor | Button t("TASKS_DEPENDENCY_ADD") | type="submit" | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 317:208 TaskEditor | Button t("TASKS_DEPENDENCY_REMOVE") | onClick=() =&gt; void perform({ op: { op: "dependency-remove", taskId, dependsOnTaskId: item.dependsOnTaskId, expectedUpdatedAt: detail.task.updatedAt } }) | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}}; {"kind":"branch","expression":"reading","branch":"f… |
| 320:5 TaskEditor | Button t("TASKS_CLOSE") | onClick=close | disabled=locked; {"kind":"container","tag":"div","attributes":{"aria-busy":"busy &#124;&#124; reading"}} |
| 323:7 TaskEditor | Sheet  | onOpenChange=(open) =&gt; { if (!open) close(); } | open=true; {"kind":"branch","expression":"taskId","branch":"true"} |
| 324:7 TaskEditor | Dialog  | onOpenChange=(open) =&gt; { if (!open) close(); } | open=true; {"kind":"branch","expression":"taskId","branch":"false"} |
| 326:5 TaskEditor | ConfirmAction  | onCancel=cancelDiscard; onConfirm=discard | open=confirmingDiscard |

## frontend/pages/tasks/tasks-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 122:16 TasksPage | div  |  |  |
| 123:9 TasksPage | ButtonLink frontendText(locale, "MESSAGES_DISCUSS") | href=contextDiscussionHref({ kind: "task", id: task.id }) |  |
| 124:20 TasksPage | Button frontendText(locale, "TASKS_EDIT") | onClick=() =&gt; onOpen(task.id) | disabled=Boolean(actionPendingId); {"kind":"logical","expression":"onOpen","operator":"&&"} |
| 125:9 TasksPage | Button statusAction | onClick=() =&gt; { if (!confirmationRef.current) onStatusChange?.(task.id, task.status === "done" ? "todo" : "done"); } | disabled=validConfirmation &#124;&#124; actionPendingId != null |
| 126:9 TasksPage | Button frontendText(locale, "TASKS_DELETE") | onClick=() =&gt; requestDelete(task) | disabled=validConfirmation &#124;&#124; deleteBlocked |
| 135:28 TasksPage | Button frontendText(locale, "TASKS_NEW") | onClick=onCreate | disabled=Boolean(actionPendingId); {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"log… |
| 138:7 TasksPage | Input  | onChange=(event) =&gt; onTextFilterChange?.({ ...filters, q: event.currentTarget.value &#124;&#124; undefined }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}} |
| 139:7 TasksPage | FilterSelect  | onChange=(value) =&gt; onFilterChange?.({ ...filters, status: (value &#124;&#124; undefined) as TaskStatus &#124; undefined }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}} |
| 140:7 TasksPage | FilterSelect  | onChange=(value) =&gt; onFilterChange?.({ ...filters, priority: (value &#124;&#124; undefined) as TaskPriority &#124; undefined }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}} |
| 141:7 TasksPage | Input  | onChange=(event) =&gt; onTextFilterChange?.({ ...filters, tag: event.currentTarget.value &#124;&#124; undefined }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}} |
| 142:7 TasksPage | FilterSelect  | onChange=(value) =&gt; onFilterChange?.({ ...filters, due: (value &#124;&#124; undefined) as TaskFilterState["due"] }) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}} |
| 144:5 TasksPage | AppliedFilters  | onClear=() =&gt; onFilterChange?.({}) | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}} |
| 146:78 TasksPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"state.kind === … |
| 148:21 TasksPage | div actionError |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"state.kind === … |
| 149:24 TasksPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"state.kind === … |
| 149:132 TasksPage | Button frontendText(locale, "SEARCH_RETRY") | onClick=onRetry; type="button" | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"state.kind === … |
| 154:7 TasksPage | TodoList  | onEndReached=!desktop && !localLoadError && state.pagination.page &lt; state.pagination.totalPages ? onLoadMore : undefined | aria-busy=pending &#124;&#124; undefined; {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kin… |
| 168:55 TasksPage | DataPagination  | onPageChange=onPageChange; onPageSizeChange=onPageSizeChange | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"state.kind === … |
| 169:25 TasksPage | p listStatusText |  | {"kind":"container","tag":"section","attributes":{"aria-hidden":"validConfirmation &#124;&#124; undefined"}}; {"kind":"logical","expression":"state.kind === … |
| 171:13 TasksPage | ConfirmAction  | onCancel=cancelDelete; onConfirm=confirmDelete | open=validConfirmation |

## frontend/pages/today-page.tsx

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 21:123 TodayPage | Button frontendText(locale, "TODAY_RETRY") | onClick=onRetry | {"kind":"branch","expression":"state.kind === \"error\"","branch":"true"}; earlier return: state.kind === "loading" |
| 26:842 TodayPage | TodayLink frontendText(locale, "TODAY_TASKS_ALL") | href="/tasks?due=today&page=1&pageSize=20" | earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 26:1154 TodayPage | Button task.title | onClick=() =&gt; onOpen?.({kind: "task", id: task.id}) | {"kind":"branch","expression":"snapshot.tasks.items.length","branch":"true"}; {"kind":"repeat","expression":"snapshot.tasks.items.slice(0, 10)"}; earlier ret… |
| 26:1577 TodayPage | TodayLink frontendText(locale, "TODAY_CALENDAR_ALL") | href=calendarHref | {"kind":"logical","expression":"calendarHref","operator":"&&"}; earlier return: state.kind === "loading"; earlier return: state.kind === "error" |
| 26:1869 TodayPage | Button event.title | onClick=() =&gt; onOpen?.({kind: "calendar", id: event.id}) | {"kind":"branch","expression":"snapshot.calendar.length","branch":"true"}; {"kind":"repeat","expression":"snapshot.calendar.slice(0, 10)"}; earlier return: s… |
| 32:10 TodayLink | a children | onClick=event =&gt; { if (event.button !== 0 &#124;&#124; event.metaKey &#124;&#124; event.ctrlKey &#124;&#124; event.altKey &#124;&#124; event.shiftKey) ret… |  |

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
| 21:15 WorkbenchReviewPage | Button frontendText(locale, "REVIEW_REFRESH") | onClick=onRetry | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 23:9 WorkbenchReviewPage | ReviewPeriodControl  | onChange=(next) =&gt; onPeriodChange?.(next) | disabled=periodBlocked; {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}} |
| 33:23 WorkbenchReviewPage | div  |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"periodBlocked","operator":"&&"} |
| 33:176 WorkbenchReviewPage | Button frontendText(locale, "REVIEW_PERIOD_RECORD_DISCARD") | onClick=onDiscardPeriod | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"periodBlocked","operator":"&&"} |
| 34:22 WorkbenchReviewPage | p periodNotice |  | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"periodNotice","operator":"&&"} |
| 36:78 WorkbenchReviewPage | Button frontendText(locale, "REVIEW_RETRY") | onClick=onRetry | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"state.kind === \"error\"","oper… |
| 46:9 WorkbenchReviewPage | ListCard  | onOpen=onOpen; href="/tasks?status=done&page=1&pageSize=20" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 47:9 WorkbenchReviewPage | ListCard  | onOpen=onOpen; href="/tasks?due=overdue&page=1&pageSize=20" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 48:9 WorkbenchReviewPage | ListCard  | onOpen=onOpen; href="/tasks?status=blocked&page=1&pageSize=20" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 49:9 WorkbenchReviewPage | ListCard  | onOpen=onOpen; href="/inbox?status=inbox&page=1&pageSize=20" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 50:9 WorkbenchReviewPage | ListCard  | onOpen=onOpen; href="/projects?status=active&page=1&pageSize=20" | {"kind":"container","tag":"section","attributes":{"aria-busy":"state.kind === \"loading\""}}; {"kind":"logical","expression":"s","operator":"&&"} |
| 58:58 ListCard | a frontendText(locale, "REVIEW_VIEW_ALL") | onClick=event =&gt; { if (event.button !== 0 &#124;&#124; event.metaKey &#124;&#124; event.ctrlKey &#124;&#124; event.altKey &#124;&#124; event.shiftKey) ret… |  |
| 61:228 ListCard | Button item.title | onClick=() =&gt; onOpen?.({kind:item.kind,id:item.id}) | {"kind":"branch","expression":"items.length","branch":"true"}; {"kind":"repeat","expression":"items.slice(0,10)"} |

## frontend/public/sw.js

| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |
| --- | --- | --- | --- |
| 4:1 &lt;module&gt; | self.addEventListener  | "install", (event) =&gt; { event.waitUntil(caches.open(CACHE).then((cache) =&gt; cache.addAll(SHELL)).then(() =&gt; self.skipWaiting())); } |  |
| 7:1 &lt;module&gt; | self.addEventListener  | "activate", (event) =&gt; { event.waitUntil(self.clients.claim()); } |  |
| 10:1 &lt;module&gt; | self.addEventListener  | "fetch", (event) =&gt; { const request = event.request; const url = new URL(request.url); if (request.method !== "GET" &#124;&#124; url.origin !== self.locat… |  |

