# R04.3 — timeout/race 分类与迟到结果证据

日期：2026-09-22。工作区：`codex/admin-audit-recovery`。开始时 HEAD 为 `8c01dc3d667cb55303ecec53257d60b48f230dd0`，工作区干净，无待补提交改动。精确候选为包含本文的 Git 提交。

## 范围与结论

按[顺序清单](../2026-09-19-remaining-work-checklist.md)及[获准实施计划](../../superpowers/plans/2026-09-20-maintenance-entry-integration.md)执行 R04.3。仅本地合成资源；不委派、不推送、不合并 main、不部署、不读 secrets；不改生产配置、生成 Env、迁移和依赖。

本轮提交测试和审计证据，**没有运行时代码改动**。现有 race 的原始败者是 provider 或纯解析，不包含存储 continuation；成功写入在 await race 之后。纯 provider 可以在调用方超时后继续运行，但其结果不能重新进入已退出的成功分支。超时后的补偿、失败状态持久化仍由请求/Cron 根任务等待；不会仅因 provider 超时就提前释放许可。

这不证明所有跨存储原始失败均已被观察，不承诺跨存储原子性，也不意味着后台任务能够无限运行。R04.4 / R04.5 仍开放，生产入口仍 legacy。

## 完整检索与分类

对 `src/**/*.ts` 检索 `Promise.race|withTimeout|setTimeout|AbortSignal.timeout`，逐一追踪传入原始 Promise 及调用方 await/catch：14 个 timeout/race 边界，另有 3 个 abort-only 边界。Graph 使用手写 Promise + timer + then，计入 race 而不是只搜索字面量 `Promise.race`。

| 边界 | 超时后仍可能运行的原始工作 | 写入位置及证据 |
| --- | --- | --- |
| `src/ai/cited-answer-service.ts` | `ai.run`，服务没有存储端口 | `src/routes/library.ts` 先 await answer，成功才 appendTurn，finally 等待 finishTurn；本轮服务级迟到成功/失败测试，不声称新增了真实聊天路由验收 |
| `src/ai/source-summary-service.ts` | `ai.run` | 纯结果解析/引用校验，无存储端口；迟到成功/失败均不读取结果 |
| `src/ai/faq-service.ts` | `ai.run` | 同上 |
| `src/ai/timeline-service.ts` | `ai.run` | 同上 |
| `src/ai/brief-service.ts` | `ai.run` | 同上 |
| `src/ai/comparison-service.ts` | `ai.run` | 同上 |
| `src/ai/mindmap-service.ts` | `ai.run` | 同上 |
| `src/ai/flashcard-service.ts` | `ai.run` | 同上 |
| `src/ai/quiz-service.ts` | `ai.run` | 同上 |
| `src/ai/research-report-service.ts` | `ai.run`，不是整个 generate | resumeQuota 在 race 之前，deferQuota 位于 await 的错误分支，nextVersion/saveReport 在成功之后；真实 ResearchRepository + D1 facade + guardFetch 验证准时保存、迟到报告不保存、迟到 quota 拒绝不改 quota 状态。不是完整研究 HTTP 路由验收 |
| `src/graph/ai-suggestions.ts` | `ai.run`；手写超时 Promise | 只返回需人工确认的建议，不自动 promotion；迟到成功/失败均不读取结果 |
| `src/assets/ai-image.ts` | `ai.run` | 图片结果解析是纯计算；真实 HTTP/Cron 入口各覆盖迟到成功/失败 |
| `src/assets/ai-markdown.ts` | `ai.run` | 本地格式提前返回，AI 分支剩 RTF；当前 AssetService.isRichAsset 不接受 RTF，因此该 provider 分支从当前资产 HTTP/Cron 不可达。独立适配器测试覆盖迟到成功/失败，未扩大格式支持 |
| `src/assets/service.ts` | parseSource / parseRichAsset，含纯转换与内容 hash | claim/get/body 在 race 前；parsed R2 put + markParseSucceeded 在 await 后；delete + markParseFailed 在外层 catch。真实 HTTP/Cron 验证外层超时、补偿 gate、迟到纯解析不启动写入 |

另外，`src/assets/url-snapshot.ts`、`src/identity/github-oauth.ts`、`src/identity/wechat-oauth.ts` 的 timer 仅触发 AbortController，调用方仍 await fetch；不是以 race 超时返回后放走未登记写入。URL 内容读取及 reader.cancel 仍被等待，createFromUrl 后续 create 也在同一 await 链。此处为源码分类，不声称本轮新增了 OAuth/URL 中断故障测试或延长现有 body deadline。

## 回归设计（新增 37 项）

文件：`tools/maintenance/timeout.test.ts`。维护 harness 固定本地 D1/R2/SQLite DO，`remoteBindings: false`，禁止意外出站。真实存储、认证、业务服务、HTTP/Cron 入口和协调器不替换；只控制外部 AI、应用 timer callback 与清理 gate。

- 20 项：9 个纯 AI 服务 + Graph，分别覆盖迟到 resolve/reject。受控触发 5s timer，先确认 AI_UNAVAILABLE，再释放原始 provider；结果 getter 不被读取。
- 8 项：HTTP/Cron × 图片 provider/外层 parser 超时 × 迟到 resolve/reject。清理 R2 delete 未完成时真实 parse_job 仍 processing，协调器 active=1/DRAINING；清理及 D1 失败状态结束后 provider 仍 pending，但 active=0/DRAINED；迟到结果后仍 failed_retryable，parsed 对象不存在且未启动 success put。
- 2 项：Markdown 独立适配器 provider 迟到成功/失败，不假装 RTF 是当前资产入口可达路径。
- 2 项：同一有效图片响应准时完成的 HTTP/Cron 对照，确认真实 parsed R2 内容、D1 succeeded 与许可释放，避免用无效结果制造“无迟到写”的假通过。
- 2 项：合成可写 race 的原始 factory 用 scope.run 完整登记；超时响应已返回仍 active=1，放行后执行真实 D1 写入；成功才释放，迟到原始拒绝保留 WORK_UNCERTAIN。此项验证登记契约，不声称当前业务存在该类 writable race。
- 3 项：真实 ResearchRepository/D1 的准时报告、迟到报告、迟到 quota 拒绝。准时报告真实落库；两个迟到分支不落报告、不修改 quota。

不靠 sleep 判定完成，不 fake workerd/RPC 时钟。只接管已识别的 5000/10000ms 应用 timer，全部 native handle 最终清理。外层迟到成功额外观察并等待真实 parseSource/hash Promise，再结合真实存储回读与原始 put 启动断言；仅查询一次 R2 不是尾部完成屏障。

## 测试有效性与排错记录

基线为 9 files / 150 tests。新增测试初期暴露两个测试前提错误：Object.create 包装的 R2 原生方法未保留 receiver，明确报 Illegal invocation；以及将 RTF 误认为资产入口可达。已分别绑定原生 get/put、把 RTF 改为独立适配器用例，未修改业务格式支持。

由于现有 timeout 边界无需修复，使用临时故障变异证明回归有效：把 parsed R2 put 移入被 race 包住的解析 continuation。最初仅回读存储的断言错误通过；即使等待解析完成，R2 查询仍可能先于已经启动的 put 完成。因此补充不替换原生实现的 put spy，证明“没有启动 success 写入”，而不只证明某次查询没有对象。最终 HTTP/Cron 两项在迟到 put 启动断言正确失败（各 1 次 put）。随即撤销变异，确认 `git diff -- src/assets/service.ts` 为空，再运行 GREEN。未把测试脚手架错误当成产品 RED，也没有遗留临时故障代码。

## 验证命令

所有命令经 `rtk proxy`；回环端口受限时申请提升权限，仍只访问合成资源。

| 命令 | 结果 |
| --- | --- |
| 基线 `npm run test:ops:maintenance` | exit 0，9 files / 150 tests |
| 变异 `npm run test:ops:maintenance -- tools/maintenance/timeout.test.ts -t 'outer-parser.*resolve'` | exit 1，2 项按预期因迟到 put 启动而失败 |
| 恢复后的 `npm run test:ops:maintenance` | exit 0，10 files / 187 tests |
| `npm run typecheck` | exit 0 |
| `npx --no-install tsc --noEmit --project tools/maintenance/tsconfig.json` | exit 0 |
| 完整 `npm test` | exit 0；smoke 56、i18n 13、交付合同 30；unit 229 files / 2113 tests；Worker 47 files / 656 tests；UI build 4766 modules |

完整应用回归首次受 sandbox 回环端口 EPERM 限制，提升权限后完整重跑 exit 0。最终维护专项于 09:06:13 开始，10 files / 187 tests、10.09s，exit 0。日志中的协调器拒绝异常来自预期故障用例；应用构建仍有大 chunk 警告，不作为生产性能验收。本地完整回归日志：`/tmp/cf-r04-timeout-regression-20260922.log`。

文档同步后收尾验证：`npm run verify:delivery-status` 30/30、应用及 maintenance 类型检查、`git diff --check` 均 exit 0。只读 Node 断言核对 R01–R25 连续、3 关闭 / 22 开放、R04 3/5，以及五份文档 97 个相对链接均存在。改动仅含一份专项测试、本文及四份状态文档；生产配置、Env、迁移和运行时代码无差异。

## 收口边界

- [x] R04.1：生产者及最终持久化，`57cca2e`。
- [x] R04.2：独立取消链，`8c01dc3`。
- [x] R04.3：14 个 timeout/race 与 3 个 abort-only 边界分类、37 项新增回归及迟到写变异验证完成；187 项维护专项、完整应用回归通过。
- [ ] R04.4：typed R2/DO/VFS 在补偿/转换 catch 之前观察原始失败。
- [ ] R04.5：完整故障矩阵、证据及 R04 父项收口。

恢复主线仍为 25 项、3 关闭、22 剩余。R04 父项不关闭，不提升产品交付四维状态。RTF 可达性差异作为本轮分类事实记录，没有借此追加不相关修复任务或扩大本次 checklist。
