# A05 来源选择草稿离页保护（本地）

日期：2026-10-02；基线 `d6811f8`；分支 `codex/functional-checklist-completion`。

## 实现

- 来源类型/标识输入使用共享草稿保护，归属成员/查询键隔离的 AgentConversationRoute。未应用选择在普通离页与 beforeunload 时受保护；取消或最终准入拒绝保留输入，实际导航提交才丢弃。
- 应用来源不是丢弃来源：useCreateDraft.applyNavigation 保留精确快照，只暂时允许该快照通过自身草稿守卫；其余问题草稿/未决写入守卫仍生效。应用期间冻结编辑，beforeunload 仍警告；只有真实 onCommit 才更新基线。
- writeWorkspaceHistory 增加可选 onSettled，提交事件后、取消、拒绝、失效或异常都会单次收尾，防止应用取消后永久放行/锁住来源。既有调用不必改变，导航协调器对取消回调继续保护同步重入。
- 问题与来源确认互斥，确认期间旧输入/提交不能穿过；普通离页须依次确认两种草稿，任一取消均保留两者。
- 使用同步 scopeRef，应用来源与发问同事件时发送最新已应用范围，而不是旧渲染范围。
- 来源草稿不再随问答错误屏卸载而丢失；放弃未决问题后原来源草稿仍在。旧成员组件的编辑/应用回调不能修改新成员或导航。

## RED 与验证

首次来源测试修正了 select 事件模拟后，观察到 **9项行为失败/69通过**（5个来源行为及4个导航收尾）。第一版实现通过后继续加入边界测试，真实观察到 **3失败/45通过**：来源确认期间仍发问、同事件发问使用旧范围、恢复错误卸载丢来源；随后修正路由归属与同步范围。

本轮最终新增17项：来源12项、导航收尾5项。

- 定向问答/意图/数据/静态页面/共享表单/导航/历史：**8文件234/234通过**。
- 扩大回归：**50文件1293/1293通过**，无未捕获异常；不是全仓测试。
- 受影响共享hook、AgentPage、location/gate严格DOM类型检查及项目typecheck通过。单独全App严格DOM检查仍有其他区域错误，不声称通过；本次新增循环推断错误已修正，最终日志中上述修改区域无诊断。
- build:ui及VM隔离通过；双语13/13，静态434keys/55placeholders/6files通过。
- 清单契约9/9、审计29/5/24、git diff --check通过。

## 复现命令

```sh
rtk proxy npx vitest run test/unit/frontend-agent-cancellation-route.test.tsx test/unit/frontend-agent-data.test.ts test/unit/frontend-agent-turn-intent.test.ts test/unit/frontend-user-read-pages.test.tsx test/unit/frontend-create-form-navigation.test.tsx test/unit/frontend-workspace-location.test.tsx test/unit/frontend-workspace-navigation-gate.test.ts test/unit/frontend-workspace-history-traversal.test.ts
rtk proxy npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --jsx react-jsx --module ESNext --moduleResolution bundler --target ES2022 --lib ES2023,DOM,DOM.Iterable --esModuleInterop --allowSyntheticDefaultImports frontend/lib/use-create-draft.tsx frontend/pages/agent-page.tsx frontend/lib/workspace-location.ts frontend/lib/workspace-navigation-gate.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
```

扩大回归沿用 `navigation-focus-write-protection-evidence.md` 的完整50文件命令。

## 未完成与下一步

原始30项 / D08排除 / 29范围内 / 5完成 / 24未关闭。A05/R2-008与Task 4保持开放，来源草稿子项的本地实现已验证；下一允许继续反馈未决写入保护与其余逐页核查。本地无外部阻塞。没有声称原生浏览器/真实身份/生产验收，没有push、部署、远程迁移或真实AI调用。
