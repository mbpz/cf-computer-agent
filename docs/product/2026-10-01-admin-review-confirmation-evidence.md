# A05 / R2-008：审核决定确认与备注草稿保护

日期：2026-10-01。基线 `a0f5612`，分支 `codex/functional-checklist-completion`。

## 本轮交付

- [x] 审核队列及详情的 publish/reject/request_changes 接入共享 ConfirmAction；弹层显示投稿标题/ID、决定的实际影响，驳回/修改同时显示准确原因及备注。提交前取消零 POST；队列发布取消亦不额外 GET 预览。
- [x] 核对 publication service/repository：发布按当前申请的目标/可见范围创建修订，不承诺索引已就绪；驳回和修改分别记录 rejected/revision_requested、备注和审计，并不删除原投稿/附件。队列仍在显式确认后读取发布参数，后端保留目标校验、状态冲突及精确重放约束；本轮没有扩大可见范围，也没有改变发布协议。
- [x] 双击确认同步消费一次；队列多个行共用确认锁，不能同批次打开两个决定弹层或替换已捕获目标。
- [x] 原读取快照、目标变化、加载、pending、未知/冲突锁、终态、失权、无处理器与卸载使旧确认失效；正式路由按成员/角色/权限作用域重新挂载。
- [x] 未保存备注或仅原因更改，在 Cancel/切换决定时需要显式放弃；取消放弃保留输入，放弃本身零写入。放弃后若选择发布，仍需独立发布确认且焦点重新落在取消按钮，不能继承上一步确认焦点。
- [x] 确认取消/Escape 保留备注，UTF-8 超限先阻断。保留 pending/未知结果的不可编辑草稿与显式同一操作精确重试，不以新确认绕过未知写锁；400 校验失败可编辑、409 只读恢复、401/403 清空、迟到回执隔离和索引结果分离继续通过既有路由测试。

## TDD 与验证

新增组件测试24项，路由测试2项，共26项。首轮21项在旧实现运行：18项因直接写入/缺少确认或草稿保护失败，3项既有行为通过；实现后通过。追加多行互斥测试观察到2个弹层而非1个，加入队列锁后通过。焦点断言先观察到从放弃草稿进入发布时仍停留在 Submit decision，按决定阶段重新挂载弹层后通过。

既有路由测试显式增加最终确认步骤，并保留原来的网络次数、精确重放 body、权限清理、回读及迟到响应断言；同批次双击测试追加最终确认前零 POST。

```sh
rtk proxy npx vitest run test/unit/frontend-review-confirmation.test.tsx test/unit/frontend-review-detail-route.test.tsx test/unit/frontend-review-detail.test.tsx test/unit/frontend-moderation-pagination-routes.test.tsx test/unit/frontend-admin-pages.test.tsx test/unit/frontend-review-detail-data.test.ts test/unit/frontend-admin-review-data.test.ts test/unit/frontend-focus-scope.test.tsx test/unit/frontend-auth-boundary.test.ts test/unit/frontend-app-routes.test.ts test/unit/publication-service.test.ts test/worker/m1-publication.test.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy npm run audit:functional-checklist
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy git diff --check
```

联合 **12 文件 325/325**；项目 typecheck、UI 构建及 VM 模块隔离、i18n **13/13** 和静态扫描通过；清单审计 **9/9**。保留既有 Vite 大 chunk 警告和 Workerd AI binding 提示。Worker 发布测试中，删除后断言内容不存在会输出 `WorkspaceFsError: no such file ...knowledge-purge-m3...`（对应 `m1-publication.test.ts` 的删除后拒绝读取断言），测试退出0，不宣称日志零告警。这些是 React/happy-dom/模拟 Response 与本地 Worker/D1 证据，不是原生浏览器或生产验收。

## 未完成与边界

- **29 范围内 / 5 完成 / 24 未完成**，A05/R2-008 父项不关闭。
- 仅保护审核表单内 Cancel/决定切换；队列分页、详情跳转、全站路由离开/刷新时的 dirty 保护仍需统一接线，不能宣称全站未保存输入已受保护。
- 原生键盘/触控/双身份全旅程与生产验收仍开放；设备锁定后未有新的人工解锁确认，不绕过锁定。本地下一步允许继续 A05 其余业务页的危险操作及 dirty/pending 核查。
- 仅本地代码、验证、文档及提交；没有 push/部署、远程迁移、真实 AI 调用、GitHub 网络重试、SECRETS_FILE 读取、备份或加密，独立验收预览未变。
