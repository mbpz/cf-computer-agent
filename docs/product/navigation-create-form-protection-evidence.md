# A05 创建表单离页保护：本地证据

日期：2026-10-02。基线：`aaa0212`，分支：`codex/functional-checklist-completion`。

## 范围与关闭边界

- 五个创建入口：收件箱、目标、项目、日程、项目时间线（四个组件）。
- 新增共享 `useCreateDraft`：同步字段 ref、草稿版本确认、默认保留编辑、确认单次消费；最终导航提交前不清草稿。
- 创建写入、未知结果、读回和存储故障阶段禁止应用导航；不会将未决 intent 当作可丢弃草稿，也不会自动重发 POST。
- 同事件输入→提交读取最新字段；确认打开时旧编辑/提交回调不可穿透。成功读回后统一恢复空白字段（包含类型选择）。
- `beforeunload` 覆盖 dirty 与未决阶段；组件卸载清理 guard/listener，旧确认失效。这里只是 DOM 事件回归，**不是五个页面的原生刷新/离开验收**。
- 只用创建表单自己的 phase 拦截导航。父页面的通用 pending 仍锁定输入，但不据此冒充已有编辑、关联或状态操作的完整离页保护；这些入口属于后续逐页审计。

原始30项，D08排除，范围内29项：**5完成 / 24未关闭**。A05和R2-008仍开放。

## RED → GREEN

1. 先新增30条行为测试：未实现保护时30/30失败，复现 dirty 导航直接 committed、未决写入可离开以及卸载警告缺失。首次沙箱运行因监听/日志权限失败，不算行为RED；获准重跑才获得上述RED。
2. 接入共享hook与四组件后30/30通过。
3. 扩为60条（每入口12条）：所有字段/选择/时间与复原、同事件编辑与提交、取消保留、确认双击、多guard最终阻止、写入/unknown/读回、重挂载未知intent/读回失败恢复、卸载后陈旧确认。
4. 创建与恢复联合：7文件219/219；共享导航与页面：24文件609/609；相邻状态/确认/冲突/关联/编辑：11文件285/285。各组有重叠，不可直接相加。
5. 最终去重合并回归：**41文件1053/1053通过**（不是全仓测试）。

临时原始日志（不纳入版本库）：`/tmp/a05-create-forms-red.log`、`/tmp/a05-create-forms-green.log`、`/tmp/a05-create-forms-expanded3.log`、`/tmp/a05-create-forms-full2.log`、`/tmp/a05-create-forms-actions2.log`、`/tmp/a05-create-forms-final.log`。

## 为什么调整旧测试导航辅助函数

旧测试的 `history.pushState({}, ...)` + 人工 `popstate` 不带运行时拥有的历史状态；存在注册guard时，已有history策略会将其视为未知边界并fail-closed。不能为让测试通过而弱化该生产策略。

- 普通分页、路由离开和迟到响应测试改走 `writeWorkspaceHistory`，并断言 `committed`，防止未真正离开却误判成功。原有写计数、恢复标记、readback与陈旧响应断言保留。
- 创建未决期间普通导航必须断言 `blocked`。为了继续验证强制销毁后的迟到响应/恢复，添加测试专用 `forceRemountAppAt`，明确卸载App再挂载、保留同一浏览器sessionStorage；不是浏览器刷新或原生强制离开证据，也不是生产旁路。
- 已有真正的历史状态驱动测试不改成上述快捷辅助函数。

## 复现命令

```sh
rtk proxy npx vitest run test/unit/frontend-create-form-navigation.test.tsx
rtk proxy npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --jsx react-jsx --module ESNext --moduleResolution bundler --target ES2022 --lib ES2023,DOM,DOM.Iterable --esModuleInterop --allowSyntheticDefaultImports frontend/lib/use-create-draft.tsx frontend/components/inbox-create-form.tsx frontend/components/planning-create-form.tsx frontend/components/calendar-create-form.tsx frontend/components/timeline-create-form.tsx test/unit/frontend-create-form-navigation.test.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
```

受影响hook/form严格DOM类型、项目typecheck、UI构建与VM隔离、双语测试13/13及静态检查通过。项目typecheck不等于全App严格DOM检查；上轮记录的35条全App基线诊断没有在本轮被解决，不能升级为全前端类型无错。清单契约9/9通过，审计再次确认29/5/24，`git diff --check`通过。

### 最终41文件合并命令

```sh
rtk proxy npx vitest run \
  test/unit/frontend-admin-analytics-route.test.tsx \
  test/unit/frontend-admin-pagination-routes.test.tsx \
  test/unit/frontend-agent-cancellation-route.test.tsx \
  test/unit/frontend-boards-route.test.tsx \
  test/unit/frontend-calendar-cancel-confirmation.test.tsx \
  test/unit/frontend-calendar-numbered-pages.test.tsx \
  test/unit/frontend-calendar-write-journeys.test.tsx \
  test/unit/frontend-create-form-navigation.test.tsx \
  test/unit/frontend-cutover-contract.test.ts \
  test/unit/frontend-discussion-route.test.tsx \
  test/unit/frontend-focus-task-selection.test.tsx \
  test/unit/frontend-goal-tasks.test.tsx \
  test/unit/frontend-home-route.test.tsx \
  test/unit/frontend-inbox-action-confirmation.test.tsx \
  test/unit/frontend-inbox-create.test.tsx \
  test/unit/frontend-inbox-numbered-pages.test.tsx \
  test/unit/frontend-inbox-promotion-recovery.test.tsx \
  test/unit/frontend-inbox-status-recovery.test.tsx \
  test/unit/frontend-logout.test.ts \
  test/unit/frontend-moderation-pagination-routes.test.tsx \
  test/unit/frontend-notifications-route.test.tsx \
  test/unit/frontend-planning-conflicts.test.tsx \
  test/unit/frontend-planning-create-recovery.test.tsx \
  test/unit/frontend-planning-create-reload.test.tsx \
  test/unit/frontend-planning-numbered-pages.test.tsx \
  test/unit/frontend-planning-status-confirmation.test.tsx \
  test/unit/frontend-planning-write-recovery.test.tsx \
  test/unit/frontend-project-relations-reload.test.tsx \
  test/unit/frontend-project-timeline-conflicts.test.tsx \
  test/unit/frontend-project-timeline-recovery.test.tsx \
  test/unit/frontend-reader-pagination-routes.test.tsx \
  test/unit/frontend-shell.test.tsx \
  test/unit/frontend-task-editor-route.test.tsx \
  test/unit/frontend-tasks-data.test.ts \
  test/unit/frontend-tasks-route.test.tsx \
  test/unit/frontend-timeline-edit.test.tsx \
  test/unit/frontend-timeline-numbered-pages.test.tsx \
  test/unit/frontend-timeline-reload.test.tsx \
  test/unit/frontend-workspace-history-traversal.test.ts \
  test/unit/frontend-workspace-location.test.tsx \
  test/unit/frontend-workspace-navigation-gate.test.ts
```

## 尚未完成 / 下一步

继续A05逐页核查已有内容编辑、关联操作及其他页面的dirty/pending/重复提交和弹层边界。完整键盘/触控、完整浏览器版本、真实双账号和剩余原生验收门禁仍开放。本轮无浏览器原生验收，无push、部署、远端迁移、密钥操作或付费AI调用；测试启动显示的AI绑定警告不构成AI请求或生产证据。
