# A05 问答未决请求离页保护（本地）

日期：2026-10-02。基线 `14fd10f`；分支 `codex/functional-checklist-completion`。

## 实现与边界

AgentConversationRoute 注册共享导航守卫及 beforeunload。锁定依据为同步 pendingRef、内存 intentRef 和当前成员的持久恢复记录，而不是渲染后的 loading 状态。提交与导航发生在同一事件中也不能越过保护。

- POST进行中、未知/不匹配回执、401/403结果、已恢复但未确认的问题、损坏记录、读取失败与回执后清理失败均阻止普通导航。
- 持久记录意外丢失时内存意图继续锁定。其他成员记录不影响当前成员；强制成员切换会卸载旧守卫，不自动重放。
- 只有已有逻辑完成有效回执验证和日志清理，或用户成功执行显式 Stop/Abandon 后解除。Stop不声称服务端已取消；保留迟到回执隔离和下次会话重建。
- 无成员的预览请求也受同步pending锁保护；只读会话恢复不误锁。
- 不改动API、自动重试、服务端授权、幂等或恢复记录格式。未提交问题/来源输入草稿、反馈写入尚未接入本轮保护，必须继续核查，不能据此关闭问答页或A05父项。

## 验证

首次测试因沙箱回环端口 EPERM 无法启动；同一命令获准后真实执行，**7失败、2通过、15跳过**，失败均为原实现错误放行导航。接入守卫后既有及新增测试24/24通过，再新增401/403、不匹配回执与运行中存储不可读覆盖；共新增12项。

- 问答/意图/数据与共享导航6文件 **135/135通过**。
- 扩大回归 **50文件1266/1266通过**（非全仓）；项目typecheck、build:ui/VM隔离、双语13/13及静态434keys/55placeholders/6files通过。
- 清单契约9/9、清单审计29/5/24、git diff --check通过。
- 不声称全仓测试、独立全App严格DOM类型或原生浏览器验收。合成beforeunload与正式writeWorkspaceHistory调用验证本地逻辑；强制root.render成员替换不是生产身份验收。

## 复现命令

```sh
rtk proxy npx vitest run test/unit/frontend-agent-cancellation-route.test.tsx test/unit/frontend-agent-data.test.ts test/unit/frontend-agent-turn-intent.test.ts test/unit/frontend-workspace-location.test.tsx test/unit/frontend-workspace-navigation-gate.test.ts test/unit/frontend-workspace-history-traversal.test.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
```

扩大回归沿用 `navigation-focus-write-protection-evidence.md` 中完整50文件命令，覆盖App消费者、规划页、专注与共享导航。

## 清单与下一步

原始30项 / D08排除 / 范围内29项 / 完成5项 / 未关闭24项。A05/R2-008与Task 4保持开放。本地无外部阻塞，下一允许补齐未提交问题/来源草稿和反馈写入保护，继续其他逐页与原生/真实身份门禁。未push、部署、远程迁移或调用真实AI；预览和生产不变。
