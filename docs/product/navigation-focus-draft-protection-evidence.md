# A05 专注未提交草稿离页保护（本地）

日期：2026-10-02。基线 `fff9a75`；分支 `codex/functional-checklist-completion`。

## 实现与边界

FocusPage 将标题、任务 ID 与任务展示标题纳入共享 useCreateDraft。未提交草稿离页需要确认；取消保留内容，实际导航提交后才清空。第二守卫拒绝时不得提前丢失草稿。同步引用确保同事件修改/启动读取最新标题，确认期间及启动后的迟到编辑不得改写提交。

- 选择任务本身也是草稿。预检 GET 本身不持写锁，但已有草稿需确认舍弃后才能离开并中止请求。
- 预检失败保留标题、清理失效任务选择；已确认创建会话后清理草稿，避免结束会话后出现残留标题和虚假离页警告。
- FocusRoute 的未决意图守卫继续独立生效：预检转为写入后，旧草稿确认不能绕过写锁；读回完成后旧决定也不能再次导航。
- 不改变 API、存储格式、服务端授权、幂等或重试策略。没有新增部署、远程迁移、生产变更或付费 AI 调用。

## 验证

首次4项新增行为测试全部失败，复现标题/选择丢失、同步确认未保留与同事件提交旧标题缺口；修复后共新增8项测试，并将原预检离页测试调整为先确认草稿舍弃再断言请求中止。

- 定向8文件 **224/224通过**（Focus 7文件及 frontend-create-form-navigation）。
- 扩大回归 **50文件1254/1254通过**，沿用 navigation-focus-write-protection-evidence.md 的完整50文件命令；不是全仓测试。
- FocusPage 独立严格 DOM 类型、项目 typecheck、build:ui/VM隔离通过。
- 双语测试 **13/13通过**；静态校验434 keys / 55 placeholders / 6 files通过。
- 清单契约 **9/9通过**，清单审计 **29/5/24**，git diff --check通过。父项 A05/R2-008 与 Task 4 保持开放。

测试覆盖：标题同事件离页与取消；仅任务选择与单次确认；确认期间编辑/启动隔离；同事件最新标题提交；后置守卫拒绝保留；预检转写入后旧确认隔离；启动后迟到编辑和完成后的空表单；预检失败保留标题。

## 复现命令

```sh
rtk proxy npx vitest run test/unit/frontend-focus-task-selection.test.tsx test/unit/frontend-focus-action-confirmation.test.tsx test/unit/frontend-focus-create-intent.test.ts test/unit/frontend-focus-data.test.ts test/unit/frontend-focus-page.test.tsx test/unit/frontend-focus-scope.test.tsx test/unit/frontend-focus-transition-intent.test.ts test/unit/frontend-create-form-navigation.test.tsx
rtk proxy npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --jsx react-jsx --module ESNext --moduleResolution bundler --target ES2022 --lib ES2023,DOM,DOM.Iterable --esModuleInterop --allowSyntheticDefaultImports frontend/pages/focus-page.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
```

## 清单与后续

原始30项 / D08排除 / 范围内29项 / 完成5项 / 未关闭24项。此处只关闭局部实施子项，不关闭父项；继续核查其他页面草稿/未决写入及危险操作。合成 DOM/beforeunload 不代替原生浏览器键盘触控、刷新关闭、完整版本或真实双身份验收。本地续行无外部阻塞，允许下一项；未 push/发布/远程迁移。
