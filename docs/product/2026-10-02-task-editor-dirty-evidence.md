# A05 / R2-008 任务编辑器草稿保护本地证据

日期：2026-10-02（Asia/Shanghai）。基线：`d032ae4`；分支：`codex/functional-checklist-completion`。

## 实际完成

- 任务新建/编辑关闭与 Escape 接入共享 ConfirmAction；显示草稿标题及现有任务 ID，明确仅丢弃未保存输入，不提交写入、不删除已保存数据。默认继续编辑，确认层之外的编辑器 inert/aria-hidden。
- 标题、备注、优先级、日期、状态、进度、标签和关联知识输入都参与 dirty 比较。未修改或恢复原值不误警告；dirty 注册 beforeunload，并在清洁/卸载后移除。此为事件处理验证，不是原生浏览器提示框验收。
- 确认同步占位，阻止同批次表单提交；每次确认有独立对象身份，先消费再关闭。取消后重新打开相同草稿，旧确认回调也不能关闭新弹窗；新编辑器不受旧按钮影响。
- 原 busy/unknown 写锁优先，不允许用“丢弃草稿”绕过不确定写入；显式原意图重试与权限拒绝清理保留。
- 修复子表单保存后的隐性草稿丢失：只推进已确认保存子表单的基线，读回按各子表单基线合并，保留其他未保存输入。成功写后读失败只重试 GET，并继续保护剩余草稿；未知结果不推进基线。

## 测试证据

新增 **16项真实 TasksRoute 测试**，另更新原非法标签 Escape 测试为显式丢弃后才关闭。

- 关闭/刷新 RED：27项中11失败、16通过；实现后27/27。
- 跨子表单 RED：30项中2失败、28通过，分别复现状态保存丢失标题草稿和读恢复丢失进度草稿；修复后30/30。
- 同草稿重开旧回调 RED：31项中1失败、30通过；改为决定对象身份校验。
- 最终联合 **9文件167/167**；任务编辑器31/31。项目typecheck、UI构建及VM隔离检查、i18n合同13/13与静态扫描通过。

```sh
rtk proxy npx vitest run test/unit/frontend-task-editor-route.test.tsx test/unit/frontend-tasks-page.test.tsx test/unit/frontend-task-delete-confirmation.test.tsx test/unit/frontend-tasks-route.test.tsx test/unit/frontend-tasks-data.test.ts test/unit/frontend-focus-scope.test.tsx test/unit/tasks-service.test.ts test/worker/tasks.test.ts test/unit/frontend-focus-action-confirmation.test.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
rtk proxy git diff --check
```

本机日志：`/tmp/a05-task-dirty-{red,green,partial-red,partial-green,stale-red,final,typecheck,build,i18n,i18n-static,audit-test,audit}.log`。

## 剩余范围与下一项

**29范围内 / 5完成 / 24未完成**。A05/R2-008父项仍开放，16个新增测试不是16个父任务关闭。

下一允许推进全局路由离开保护：`frontend/lib/workspace-location.ts` 当前直接改写 history，Shell 导航与 popstate 不经过编辑器 close。需覆盖显式导航、后退/前进及 pending/unknown，不能以本轮页内关闭或 beforeunload 代替；其他页面 dirty 与原生键盘/触控/双身份验收仍开放。

仅本地 React/happy-dom模拟网络及本地Worker/D1证据。未push、部署、远程迁移、读取/上传SECRETS_FILE或真实AI调用；未访问或绕过锁定浏览器，独立预览未更新。保留既有构建大chunk/AI binding告警。项目typecheck不覆盖全部frontend TSX，不宣称完整前端类型验收。本地下一步无阻塞，goal保持active。
