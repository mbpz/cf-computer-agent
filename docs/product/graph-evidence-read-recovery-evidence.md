# 图谱引用读取：故障恢复与撤权清屏证据

日期：2026-10-10。基线：`1f162a7b`，分支 `codex/functional-checklist-completion`。

## 范围及确认的缺陷

属于 A05 已批准的异步状态/权限边界核对，并沿用 `docs/superpowers/plans/2026-09-17-wb-gr-evidence-action-plan.md` 的证据读取约束。不新增 API，不改变知识生命周期或图谱写入语义。

原 GraphEvidencePanel 将网络、503、无效回执以及 401/403 全部显示成没有授权证据；没有手动重试，401/403 不通知路由撤下既有图谱。Promise.all 的先到 404 还可能掩盖后到的 403。无选择的 idle 状态在 effect 执行后被误改为 gap。

## 实现边界

- 保持现有数据链：所选节点引用 ID → GraphEvidencePanel → loadGraphCitation → `/api/knowledge/citations/:id` → 当前成员授权的知识读取。404 仍表示不可访问/缺失，不泄露目标存在性。
- 401/403 逐请求立即处理：取消同批读取、通知 GraphRoute 清屏。无需等待另一个未结束的引用请求；旧 scope/卸载后晚到的拒绝不能撤销新页面。
- 其他故障显示中英文通用错误，不显示服务端敏感消息。全部失败均为 404 才显示 gap；404 与普通故障混合时仍显示可重试错误。
- 只在显式点击后重试同一组引用；ref 同步占有请求，合并同事件重复点击。改变选择和卸载会取消读取，回调同时检查 controller 身份及 aborted 状态。
- 区分未选择（idle）和已选择但没有引用（gap），去重相同引用 ID。
- 普通结果聚合使用 allSettled；本次未新增超时策略。401/403 不受 sibling pending 阻塞。
- 不改变图谱操作编号、未决写入记录、同编号安全重试或精确查询结果；没有新的后台重试或写请求。

## 测试证据

新增 15 项行为覆盖：组件 13 项、路由 2 项。组件现有 17 项，路由现有 68 项。

| 场景 | 新增数 | 断言 |
| --- | ---: | --- |
| 无选择及 effect 后状态 | 1 | idle，不请求引用 |
| 网络、503、无效回执 | 3 | 错误不伪装 gap；显式重试，同事件双击只读一次 |
| 401/403 与 pending sibling | 2 | 立即撤权回调、取消同批读取 |
| 先 404、后 403 | 1 | 不掩盖后到的授权拒绝 |
| 切换选择后旧成功/拒绝/故障 | 3 | 不覆盖新引用，不撤销新页面 |
| 混合 404/503 | 1 | 显示故障而非缺失 |
| 卸载后的拒绝 | 1 | 取消且不触发旧撤权回调 |
| 重复 ID 与取消选择 | 1 | 一次读取、清除旧内容并回到 idle |
| 路由引用 401/403 | 2 | 整体图谱及操作入口清除 |

初次测试的异步 flush 辅助不足，后续将 React commit/effect 与 Promise 链等待分开；这些测试框架时序失败不作为产品缺陷证据。稳定后的同一组 85 项测试对基线源码执行负向对照：临时恢复仅 GraphEvidencePanel 和 GraphPage 两个文件至 HEAD，得到 **11 失败 / 74 通过**，finally 恢复工作区实现。随后同组 **85/85** 通过。未声称所有新增用例在基线均失败。

提交前扩大到图谱、导航及 Worker 引用回归：**11 文件 / 271 项**通过；Worker 引用测试使用 mock 服务，不能视作真实 D1 或真实身份验收。所有建议/引用请求使用测试 transport，没有调用真实 AI 或付费服务。

Worker/前端类型及两个受影响测试的独立严格 DOM 类型检查通过；i18n 契约 13/13，键/占位符校验通过；操作清点为 270 源文件 / 1175 候选，领域审计与源码一致。UI 构建和 VM 静态隔离通过，仍有既有的大 chunk 提示。

完整 check 首轮在 smoke 阶段 **78/79**：`scripts/frontend-app-contract.test.mjs` 仍要求不带 signal 的 `loadGraphSuggestions(fetch)`，与上一提交已验证的取消接线冲突。已将该断言收紧为要求 `loadGraphSuggestions(fetch, controller.signal)`，保留其成员授权、GET-only 和手动提升断言；该文件 **8/8** 通过。这是静态契约同步，不是删除失败断言或回退取消功能。完整门禁的终态单独记录，不以 smoke 单文件通过替代。

### 完整本地候选门禁终态

修正上述契约后，`npm run check` **exit 0**：vendor 检查、生成类型一致性、Worker/前端/landing 类型、smoke **79/79**、i18n **13/13**、delivery **30/30**、unit **356 文件 / 5052 项**、Worker **69 文件 / 1161 项**、landing **97/97**，以及完整构建、公开产物凭据扫描、legacy 审计和 Wrangler **dry-run** 均通过。未执行真实 deploy。

日志 `/private/tmp/functional-candidate-20261010-graph-evidence-check-green.log` 未匹配 `Unhandled`、`not wrapped in act` 或 `window is not defined`。保留的 WorkspaceFs missing-file 与 Invalid pending note journal 输出对应既有负向测试路径；本轮核对 `test/worker/m1-publication.test.ts` 的 purge 后不存在断言及 `test/worker/app.test.ts` 的坏 journal 精确错误断言，与 `2026-10-10-functional-gate-reconciliation-evidence.md` 已独立复现的归因一致。不声称日志没有任何异常输出。

四组父项/成熟度/交付/操作清点契约 **64/64** 通过。canonical checklist 的 126 个本地证据链接均存在；文件存在不等于其功能验收已通过。测试源码在完整 check 前固定，之后只回填文档结果；D07 最终功能候选条件仍未满足，不能关闭父项。

复现命令：

```sh
rtk proxy npx vitest run test/unit/frontend-graph-page.test.tsx test/unit/frontend-graph-actions.test.ts test/unit/frontend-graph-data.test.ts test/unit/frontend-graph-a11y.test.tsx test/unit/frontend-graph-canvas.test.tsx test/unit/frontend-graph-evidence.test.tsx test/unit/frontend-graph-inspector.test.tsx test/unit/frontend-workspace-navigation-gate.test.ts test/unit/frontend-workspace-location.test.tsx test/unit/frontend-workspace-history-traversal.test.ts test/worker/graph-evidence.test.ts
rtk proxy npm run typecheck
rtk proxy npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --lib ES2022,DOM,DOM.Iterable --types node,vite/client --skipLibCheck --strict test/unit/frontend-graph-evidence.test.tsx test/unit/frontend-graph-page.test.tsx
rtk proxy npm run verify:i18n
rtk proxy npm run test:i18n
rtk proxy npm run audit:frontend-operations
rtk proxy npm run audit:workbench-domain
rtk proxy npm run build:ui
rtk proxy npm run check
rtk proxy node --test scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs scripts/delivery-status-contract.test.mjs scripts/frontend-operation-inventory.test.mjs
```

诊断日志：`/private/tmp/graph-evidence-recovery-baseline-red.log`、`/private/tmp/graph-evidence-recovery-green.log`、`/private/tmp/graph-evidence-close-regression.log`；长期行为证据以已提交测试为准，临时日志不是唯一证明。

## 未关闭的边界

A05 仅增加本地修复子项，父项保持开放。清单仍为原始 30 / 排除 D08 / 范围 29 / 关闭 5 / 未关闭 24。本次不证明全仓门禁、原生浏览器、真实双身份、键盘/触控、VM 或生产验收完成。历史图谱计划中未验证的其他 checkbox 不批量关闭。

仅本地验证和提交；无 push、merge、部署、迁移或生产写入。生命周期设计 LC-01/LC-02 的实施批准边界不变。

本轮复核原生验收工具：`rtk proxy orca status --json` 返回可执行文件不存在；MCP resources 仅有 Open Design 上下文，当前工具集合没有可操作浏览器的接口。未绕行其他控制路径，也未把用户打开的预览 URL 当作验收结果。VM 总计划尾部仍要求原生 VM-029/VM-033 验收后才继续相应正式集成，不能由本轮 DOM 测试放行。
