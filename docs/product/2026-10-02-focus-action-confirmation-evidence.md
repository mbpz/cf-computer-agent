# A05 / R2-008 专注结束确认本地证据

日期：2026-10-02（Asia/Shanghai）。基线：`5f67269`；分支：`codex/functional-checklist-completion`。

## 实际完成

- 完成/放弃使用共享 ConfirmAction，显示精确会话标题及 ID、任务 ID、前后状态和真实影响：结束后保留已记录时长、不可恢复，不完成或删除任务；关联日程分别变为 completed/canceled，不删除。没有关联日程时明确说明。
- 默认取消焦点，Escape/遮罩/取消均零写入并返回触发按钮；Tab 环绕、底层 inert。首次决定同步占位，阻止同批次暂停/恢复穿透；确认先消费再交给既有版本化写入链，连续确认只提交一次。
- 会话对象/版本/任务/日程/状态、成员、selectionVersion、pending、loading/error、处理器消失及卸载均使旧决定失效，原状态恢复也不复活。无关通知重渲染保留决定。
- App 只补传 memberId，原 CAS、写前持久化意图、未知结果回执核查及显式恢复流程保留。未知结果不推定成功；原恢复流程仍可在核对回执后显式重试未确认的冻结意图，并非全部场景只读恢复。

## 实测结果

新增 **23项 DOM 测试 + 4项真实 App 路由测试**；既有完成/放弃路由测试改为经过确认，并增强重复点击断言。

- RED：23项中22项失败、1项通过，直接结束会话等缺口可复现；实现后23/23通过。
- 页面及 App 定向阶段77/77：取消和路由离开无 transition POST、无恢复日志；同批次暂停无穿透；确认时保存原始会话/任务/clientKey/action/expectedUpdatedAt，丢失回执保留恢复意图。
- 最终联合 **12文件211/211**，包含服务层、本地 Worker/D1 及专注关联日程修复回归。
- 项目 typecheck、UI构建及VM静态隔离、i18n合同13/13、静态扫描通过。项目tsconfig不覆盖全部frontend TSX，不宣称完整前端类型验收。
- 清单审计及diff检查结果随提交核验；父项数量不以测试数量代替。
- 保留既有大 chunk/AI binding 告警；未调用真实AI。

```sh
rtk proxy npx vitest run test/unit/frontend-focus-action-confirmation.test.tsx test/unit/frontend-focus-task-selection.test.tsx test/unit/frontend-focus-page.test.tsx test/unit/frontend-focus-data.test.ts test/unit/frontend-focus-create-intent.test.ts test/unit/frontend-focus-transition-intent.test.ts test/unit/frontend-focus-scope.test.tsx test/unit/focus-service.test.ts test/worker/focus.test.ts test/worker/focus-calendar-repair-migration.test.ts test/worker/calendar-write-journeys.test.ts test/unit/frontend-calendar-cancel-confirmation.test.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
rtk proxy git diff --check
```

本机日志：`/tmp/a05-focus-confirm-{red,green,routes,final,typecheck,build,i18n,i18n-static,audit-test,audit}.log`。

## 清单边界与下一项

**29范围内 / 5完成 / 24未完成**。A05/R2-008父项继续开放；27项新增测试不代表27个父任务关闭。

下一允许推进任务编辑器未保存草稿保护：`frontend/pages/tasks/task-editor.tsx` 当前只有 busy/unknown 的 beforeunload 防护，普通未保存编辑关闭时不提醒。随后仍需核对跨路由/刷新及全站 dirty、原生键盘/触控/双身份验收。当前本地下一步无阻塞。

仅本地实现、React/happy-dom模拟网络及本地Worker/D1证据。未push、部署、远程迁移、读取/上传SECRETS_FILE、真实AI调用或浏览器锁定绕过；独立预览未更新。goal保持active，不能宣称全部完成。
