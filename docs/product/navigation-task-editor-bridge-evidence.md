# A05 共享导航 Task 3：任务编辑器桥接本地证据

基线 `9d126ca`；沿用已批准的共享导航设计与本地实现/验证/提交授权。无 push、部署、远程迁移、秘密文件读取或真实 AI 调用。

## 已实现范围

- TasksRoute 与 InboxRoute 共用的 TaskEditor 注册每 window 离开保护；当前草稿由输入处理器同步更新，写入锁/冻结 intent 也同步读取，不等待 React render。
- 标题、备注、优先级、到期日、状态、进度、标签、知识关联输入均受保护。dirty 默认保留，Escape 取消导航；明确放弃后只执行原导航一次。
- 本地关闭确认与导航确认互斥。pending/unknown 不显示可绕过写入锁的丢弃选项；同事件保存→导航也拒绝。
- 接受一个确认不等于丢弃草稿：只有共享位置层真正提交并发布事件后才关闭编辑器；另一保护最终拒绝时仍保留原草稿。
- 注销/卸载/失权沿用明确的安全清理边界；401/403 清除所有编辑器草稿字段并注销保护；旧确认不能授权新页面。原来31项编辑器测试保留并通过。
- beforeunload 使用挂载期监听器读取即时草稿/intent，避免输入后、React 刷新前的空窗。此为本地事件测试，不是原生浏览器刷新验收。
- 复用现有 ConfirmAction 双语文字，无需修改 i18n.ts；测试和静态文案校验均通过。

## RED → GREEN 与回归

1. 首次 RED：37项中6失败、31通过；收件箱夹具缺少协议字段，修正夹具后重跑仍6失败/31通过，此次6个均为真实缺口：应 deferred/blocked 的导航实际 committed。
2. 实现后 GREEN：37/37。
3. 扩展到49项编辑器测试（增加真实 App 侧栏、八类输入、clean、本地确认互斥和部分表单基线）。首次8文件回归195通过/1失败：测试误把账户菜单设置项当作侧栏锚点；改为真实收件箱侧栏入口后 **8文件196/196**。
4. 完整受影响回归 **22文件490/490**。包括 gate/location、editor/tasks/data、inbox及promotion、calendar/planning/timeline、notifications/discussion/boards、reader/admin/moderation分页、analytics/agent、home/logout/cutover/shell。
5. `npm run typecheck`、编辑器独立严格DOM类型检查、`npm run build:ui`及VM构建隔离通过。
6. `npm run test:i18n` **13/13**，`npm run verify:i18n`通过。
7. 清单审计测试 **9/9**，权威父项计数 **29范围内 / 5完成 / 24未完成**。`git diff --check`通过。

日志（本机临时文件，非永久发布证据）：`/tmp/a05-editor-bridge-red2.log`、`/tmp/a05-editor-bridge-green.log`、`/tmp/a05-editor-bridge-regression2.log`、`/tmp/a05-editor-bridge-full-regression.log`、`/tmp/a05-editor-bridge-types.log`、`/tmp/a05-editor-bridge-dom-types.log`、`/tmp/a05-editor-bridge-build.log`、`/tmp/a05-editor-bridge-i18n-test.log`、`/tmp/a05-editor-bridge-i18n-verify.log`。

## 未完成与下一步

共享计划 Task 1–3 本地完成，Task 4（历史后退/前进适配、获准位置订阅、未知条目/连续遍历/刷新与原生证据）仍开放。当前 popstate 仍是原始订阅，不能声称已经保护浏览器后退/前进。

A05 与 R2-008 父项不勾选，其他页面表单及原生键盘/触控/双身份验收也不由此次子项替代。下一步允许继续 Task 4，无需重复设计批准。本地后续实现无已知阻塞；独立 VM 预览及生产未变更。
