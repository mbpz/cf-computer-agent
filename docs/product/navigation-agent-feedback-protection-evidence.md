# A05 Agent 反馈未决写入保护（本地）

日期：2026-10-02；基线 `d2f4520`；分支 `codex/functional-checklist-completion`。

## 实现与边界

- AgentConversationRoute 持有同步会话反馈锁，接入现有导航与 beforeunload 守卫。反馈 POST 发起前锁定，只有 conversationId/rating/citationIds 全部匹配的回执才释放；网络错误、503、401/403 和不匹配回执均保留锁。
- 未决反馈阻止普通离页、发起新问题、来源重启和问题放弃；发送中/未知 UI 保持可见，未知只允许显式重试原始反馈，不提供普通丢弃逃生口，也不自动重放。问题/来源确认或来源应用期间不能开始反馈。
- 子组件使用同步 pending/saved/mounted 引用，防双击、保存后旧回调再发及卸载后回调。路由同时检查同步 conversationIdRef，来源重启与旧反馈点击发生在同一事件时也拒绝旧写入。
- 反馈结算不清除未提交问题/来源草稿；会话/成员强制重挂载后的旧回执不修改新成员锁。
- 重试沿用现有 POST 和原始 rating/citationIds；后端已有 `(conversation_id, member_id)` 冲突更新逻辑，本轮未改接口或数据库。
- 本轮仅保护当前文档内的路由/组件生命周期。未新增反馈持久化日志；强制刷新或关闭后恢复、真正身份切换和原生浏览器强制离开仍不冒充已验收。测试中的强制 root.render 仅证明旧回调隔离。

## RED 与验证

第一轮行为 RED：12失败/50通过，复现导航未锁、反馈期间问题替换、确认期间反馈以及保存/卸载后旧回调。实现后62/62通过。再补3个边界回归；随后新增同事件来源重启测试得到1失败/65通过，修正同步会话身份检查。

最终新增16项测试；定向8文件250/250通过。最终扩大50文件1309/1309通过，无未捕获异常；不是全仓测试。

- 受影响 AgentFeedback/AgentPage 独立严格 DOM 类型检查、项目 typecheck、build:ui/VM隔离通过。
- 单独全App严格DOM检查仍在其他区域报错，本轮修改的Agent区域无诊断；不声称全App严格检查通过。
- 双语13/13；静态434keys/55placeholders/6files通过。
- 清单契约9/9，审计29/5/24通过；git diff --check通过。

## 复现命令

```sh
rtk proxy npx vitest run test/unit/frontend-agent-cancellation-route.test.tsx test/unit/frontend-agent-data.test.ts test/unit/frontend-agent-turn-intent.test.ts test/unit/frontend-user-read-pages.test.tsx test/unit/frontend-create-form-navigation.test.tsx test/unit/frontend-workspace-location.test.tsx test/unit/frontend-workspace-navigation-gate.test.ts test/unit/frontend-workspace-history-traversal.test.ts
rtk proxy npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --jsx react-jsx --module ESNext --moduleResolution bundler --target ES2022 --lib ES2023,DOM,DOM.Iterable --esModuleInterop --allowSyntheticDefaultImports frontend/components/agent/agent-feedback.tsx frontend/pages/agent-page.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
```

扩大回归沿用 `navigation-focus-write-protection-evidence.md` 的完整50文件命令；不是全仓测试。网络边界使用测试替身，未执行真实AI调用。

## 清单与下一步

原始30项 / D08排除 / 29范围内 / 5完成 / 24未关闭。A05/R2-008与Task 4整体保持开放。下一允许继续剩余逐页草稿/写入核查，以及尚未验收的原生/身份门禁；本地实现无外部阻塞。未push、发布、远端迁移或读取生产密钥，不将本地合成DOM测试当作生产证据。
