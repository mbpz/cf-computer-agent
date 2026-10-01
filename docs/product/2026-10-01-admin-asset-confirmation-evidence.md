# A05 / R2-008：附件解析重试确认

日期：2026-10-01。基线 `fb5434d`，分支 `codex/functional-checklist-completion`。

## 本轮范围

- [x] 失败可重试附件的 Retry 不再直接发送写请求；共享 ConfirmAction 显示原文件名/附件 ID 和实际影响，中英文同步。
- [x] 核对 `src/assets/service.ts` 与 `src/assets/repository.ts`：失败解析任务恢复 queued、重置 attempts 和 last_error_code；此请求本身不代表解析成功，也不删除原始附件。保留既有仅 failed_retryable 行开放按钮的 UI 范围，没有扩展终态重试策略。
- [x] 默认取消焦点，确认期间背景 inert；取消无 POST 或新读取。同步消费确认，同批次双击只发一次；另一个行操作不能替换已捕获目标。
- [x] 保存当前读取/过滤/目标快照；换页、过滤、读取替换、pending、目标行锁、失权、错误、卸载使旧确认失效；回到原状态不复活旧确认。正式路由按成员/角色/权限作用域重新挂载。
- [x] 原有未知 POST 回执或已确认 POST 后 GET 失败继续锁行，显式 GET 恢复而非盲目重发；401/403 清除列表及预览，忽略迟到预览/写回执，保留原过滤条件下的空页回退。预览仍是只读操作，无额外重试确认。

## TDD 与验证

新增 17 个组件测试，先在原实现运行：12 项因缺少确认/直接回调失败，5 项既有非重试状态和预览行为通过；实现后 17/17 通过。再新增 4 个真实路由/Response 用例：取消零网络写入，换页/过滤清除确认，等待中的预览被拒绝后清除确认。共新增 21 项。

既有 moderation pagination/recovery 测试仅补充显式确认动作、HTMLElement 环境及提交前零 POST 断言，原有恢复断言保留；同文件的两个重复候选流程也补齐上一轮确认动作，未削弱原有回退或迟到回执断言。

```sh
rtk proxy npx vitest run test/unit/frontend-admin-asset-confirmation.test.tsx test/unit/frontend-moderation-pagination-routes.test.tsx test/unit/frontend-admin-assets-data.test.ts test/unit/frontend-admin-pages.test.tsx test/unit/assets-service.test.ts test/worker/assets.test.ts test/worker/m2-assets.test.ts test/unit/frontend-focus-scope.test.tsx test/unit/frontend-auth-boundary.test.ts test/unit/frontend-app-routes.test.ts test/unit/frontend-admin-duplicate-confirmation.test.tsx test/unit/frontend-admin-space-confirmation.test.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy npm run audit:functional-checklist
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy git diff --check
```

最终联合 **12 文件 329/329**。清单审计 **9/9**、父项计数及 `git diff --check` 通过。类型检查、UI 构建及 VM 静态模块隔离通过；i18n **13/13** 和静态扫描通过。既有 Vite 大 chunk 警告与 Worker 测试读取二进制响应为 text 的告警仍存在，不宣称日志零告警。UI 证据使用 React/happy-dom/模拟 Response，服务和 Worker 使用本地测试数据，不是原生浏览器、真实解析服务或生产验收。

## 剩余边界

- 仍未覆盖审核发布/驳回等其余页面、全站路由离开/刷新 dirty 保护、原生键盘/触控及真实双身份完整旅程。
- **29 范围内 / 5 完成 / 24 未完成**，A05/R2-008 不关闭。下一允许继续 A05 审核队列与详情的危险决策、备注草稿及异步状态核查。
- 设备锁定后的原生验收仍未获新的人工解锁确认，不绕过限制；本地工作可以继续。
- 仅本地实现、验证及提交，没有 push、部署、远程迁移、真实 AI 调用、GitHub 重试、SECRETS_FILE 读取、备份或加密；独立预览不变。
