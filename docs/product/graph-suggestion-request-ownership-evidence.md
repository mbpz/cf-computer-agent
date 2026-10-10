# 图谱建议请求所有权与撤权清理（本地）

日期：2026-10-10。基线：`d1d7939d`，分支 `codex/functional-checklist-completion`。

## 范围与确认的缺陷

A05 的重复点击、异步状态和授权边界本地修复，不是新的知识生命周期策略。

原 `GraphRoute.generateSuggestions` 仅设置 React loading 状态，没有同步请求所有权，也未把 loader 已支持的 AbortSignal 传入：

- 同一事件内双击会发送两次建议请求。
- 建议 GET 的 401/403 只显示普通错误，未撤下已有私有图谱。
- 已完成建议未随图谱刷新清除；未完成建议没有取消或迟到结果校验。权限撤销后恢复、范围变化或卸载时，旧结果可能重新显示。

这些是本地页面测试确认的缺陷，不声称已观察到生产数据泄露。

## 修复约束

- 使用 ref 同步占有一次建议请求；ready/truncated 且当前 graph read 未撤销时才允许发起。
- 请求携带 AbortSignal，结果同时核对 controller 身份、read generation 和 aborted 状态。
- 每次图谱读取重新开始时清除旧建议；读取 effect 清理时取消建议，不在卸载 cleanup 写 React state。
- 图谱读取、动作/精确查询或建议返回 401/403 时统一撤销当前读取、取消建议并清屏。
- 旧请求的成功、拒绝、普通失败和 finally 均不能覆盖或释放新请求。
- 普通建议失败仍局限于面板；只有用户再次点击才重试。挂载/重挂载/范围变化不自动请求建议。
- 不改变图谱写入的操作编号、sessionStorage 未决意图和同编号重试/精确查询语义。

取消是浏览器请求及 UI 所有权边界，不保证已到达服务端的 AI 计算被终止，也不是服务端 exactly-once 或持久幂等实现。

## 测试证据

新增 14 项建议生命周期测试，保存在 `test/unit/frontend-graph-page.test.tsx`：

| 场景 | 数量 | 结果 |
| --- | ---: | --- |
| 同事件双击 | 1 | 只发一次请求 |
| 建议 401/403 | 2 | 清屏，恢复不带旧错误 |
| 图谱撤权后恢复，已完成/未完成建议 | 2 | 旧建议不复现 |
| 图谱动作撤权 | 1 | 取消建议，丢弃迟到成功 |
| 范围变化后旧成功/403/503 | 3 | 不覆盖当前图谱或面板 |
| 旧成功/403/503 在新请求进行中到达 | 3 | 不释放新请求，不接受旧结果 |
| 卸载/重挂载 | 1 | 取消、不自动重放 |
| 普通 503 与明确手动重试 | 1 | 页面保留且不会自动重试 |

原始 11 项先得到 **10 失败 / 1 通过**的行为 RED，修复后 **11/11**；3 项新旧请求交错回归随后加入，不能声称它们也经历同一 RED。测试 transport 特意忽略 abort，使迟到回执身份校验独立于取消是否生效。最早一次 sandbox `listen EPERM` 属基础设施失败，不计为行为 RED。

扩大图谱与导航回归：**10 文件 / 250 项通过**；最终页面单文件 **66/66**，四组清单/成熟度/交付/清点契约 **64/64**。全部新增 fetch 都使用 mock，没有请求真实建议端点或 AI。项目 Worker/前端类型、受影响页面测试的独立严格 DOM 类型、UI 构建及 VM 静态隔离、操作清点和领域审计通过。独立测试类型检查同时修正同文件既有 view helper 的 mock 参数类型声明，不改变运行行为。UI 构建仍提示既有的大于 500 kB chunk。

复现命令：

```sh
rtk proxy npx vitest run test/unit/frontend-graph-page.test.tsx test/unit/frontend-graph-actions.test.ts test/unit/frontend-graph-data.test.ts test/unit/frontend-graph-a11y.test.tsx test/unit/frontend-graph-canvas.test.tsx test/unit/frontend-graph-evidence.test.tsx test/unit/frontend-graph-inspector.test.tsx test/unit/frontend-workspace-navigation-gate.test.ts test/unit/frontend-workspace-location.test.tsx test/unit/frontend-workspace-history-traversal.test.ts
rtk proxy npm run typecheck
rtk proxy npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --lib ES2022,DOM,DOM.Iterable --types node,vite/client --skipLibCheck --strict test/unit/frontend-graph-page.test.tsx
rtk proxy npm run audit:frontend-operations
rtk proxy npm run audit:workbench-domain
rtk proxy npm run build:ui
rtk proxy node --test scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs scripts/delivery-status-contract.test.mjs scripts/frontend-operation-inventory.test.mjs
```

诊断日志：`/private/tmp/graph-suggestion-ownership-{red,green,regression,contracts}.log`。临时日志不作为唯一长期证据，行为断言保存在测试中。

## 未关闭边界

- A05 父项仍开放；仅增加本地修复子项。
- 清单 30 原始项，排除 D08 后 29 项：5 完成 / 24 未完成。
- 不等同于原生浏览器、真实双账号、正式 VM 或生产验收；不包含全仓最终门禁。
- 本次没有 push、部署、迁移或生产写入。LC-01/LC-02 待明确批准，不在本次实现范围。
