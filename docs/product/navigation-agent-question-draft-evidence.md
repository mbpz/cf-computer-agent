# A05 未提交问题离页保护（本地）

日期：2026-10-02。基线 `e278d78`；分支 `codex/functional-checklist-completion`。

## 实现与边界

- AgentConversationRoute 使用共享 useCreateDraft，问题编辑同步读取；同事件编辑后导航会确认，编辑后提交使用最新问题。
- 默认保留输入；取消确认或其他守卫最终拒绝均不清空草稿。只有导航实际提交后才丢弃；确认单次消费，期间迟到输入/提交不执行。
- 新增 checkpoint 保存已提交基线但保留显示值，避免把输入框中已提交的问题误判为草稿。重试旧问题不覆盖新的未提交问题。
- POST 进行中输入禁用；既有 pending、内存意图及当前成员恢复记录锁继续阻止离页，不能用草稿丢弃确认绕过。
- 来源重启如果会丢弃问题先确认，取消不改 URL/问题；存储保存失败的错误页仍保留可用的离页确认。
- 本轮只保护问题文本，不声称来源选择本身的未应用草稿或反馈写入已保护。没有改变 API、授权、日志格式和重试语义。

## 验证

新增10项行为测试，先观察 **10失败/28跳过**，实现后问答与共享表单 **2文件98/98通过**。测试环境补齐 HTMLElement，并将导航造成的 React 更新纳入 act；最终重跑无先前异步 scheduler 的 window 未定义异常。

- 扩大回归：**50文件1276/1276通过**，无未捕获异常（不是全仓测试）。
- use-create-draft 与 AgentPage 独立严格 DOM 类型检查、项目 typecheck、build:ui/VM隔离通过。不声称独立全App严格DOM检查通过。
- 双语测试13/13、静态434keys/55placeholders/6files通过。
- 清单契约9/9、清单审计29/5/24及 git diff --check 通过。
- 本轮使用合成 DOM 与正式导航入口，不算原生浏览器、真实身份或生产验收；未 push、部署、远程迁移或调用真实 AI。

## 复现

```sh
rtk proxy npx vitest run test/unit/frontend-agent-cancellation-route.test.tsx test/unit/frontend-create-form-navigation.test.tsx
rtk proxy npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --jsx react-jsx --module ESNext --moduleResolution bundler --target ES2022 --lib ES2023,DOM,DOM.Iterable --esModuleInterop --allowSyntheticDefaultImports frontend/lib/use-create-draft.tsx frontend/pages/agent-page.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
```

扩大回归沿用 `navigation-focus-write-protection-evidence.md` 完整50文件命令。

## 清单与下一步

原始30项，D08排除，范围内29项，完成5项，未关闭24项。A05/R2-008及Task 4整体继续开放；本地无外部阻塞，下一允许核查来源选择草稿与反馈写入，再按既定清单完成其他逐页与原生/身份门禁。
