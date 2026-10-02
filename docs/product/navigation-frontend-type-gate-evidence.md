# Full frontend type gate — local evidence

基线 `bba363a`，既有分支 `codex/functional-checklist-completion`。承接导航 Task 4 验证要求；修复前端类型覆盖缺口，不新增功能父项、不发布。

## 发现与实现

此前 `npm run typecheck` 仅使用根 `tsconfig.json`，未把全部前端 `.tsx` 纳入检查。额外 App 入口检查曾保留 28 项诊断；它缺少 Vite 环境声明，也未包含未从 App 引用的组件，不能代替完整前端门禁。

- 新增 `tsconfig.frontend.json`，继承严格模式与 noEmit，使用 DOM/DOM.Iterable 和仓库已有 Vite client 声明。覆盖当前全部 **229** 个第一方前端 `.ts`/`.tsx` 文件（包含声明文件），不排除报错组件、不新增依赖、不降低检查等级。
- `npm run typecheck` 同时执行原 Worker/项目检查和完整前端检查；原 `check` 自动包含新门禁。新增 `test:frontend-types`，并纳入已有 smoke 测试入口。
- 收窄知识/搜索过滤器联合类型；修正 React effect 清理返回值、Tabs ref 初值、资产加载状态联合类型、审核原因的已存在类型、看板取消状态回调及回滚匹配布尔值。
- 提交路由明确要求会话；阅读器关联/反向引用/差异子组件明确处理 idle；图谱先验证加载模块为可调用工厂及容器存在，保留语义列表回退。
- 完整覆盖额外发现 ContextRail 未解构 `onNavigate` 导致点击时报 ReferenceError，补实际 DOM 回归并修复。该组件并未在当前 App 壳中启用，不声称修改了已上线导航外观。

## RED / GREEN

1. 新完整配置在未修改生产代码时报告 **27 项**实际诊断，日志 `/tmp/frontend-type-gate-red.log`。与旧 App 检查范围不同：Vite 声明消除4项环境诊断，完整组件覆盖新发现3项。
2. ContextRail 新 DOM 用例先运行受到监听 EPERM；获得本地测试授权后真实运行，1失败/1通过，并出现缺失 onNavigate 的 ReferenceError，日志 `/tmp/frontend-context-rail-red.log`。不将 EPERM 算行为 RED。
3. 修复后 `npm run typecheck`（Worker + 全前端）通过。没有 any 化、ts-ignore、关闭严格模式或删除失败组件。
4. 门禁合约3/3：检查解析后配置逐一覆盖真实前端文件、默认命令同时保留 Worker 和前端、隔离临时 TSX 中的 nullability 错误确实被拒绝且不生成 JS。临时夹具在 finally 清理。
5. DOM 定向4文件51/51；图谱补直接导出工厂及3种畸形模块回退，ContextRail覆盖有/无导航回调。日志 `/tmp/frontend-type-gate-targeted.log`。

6. 扩大 **181 文件 3227/3227**，退出0：`npx vitest run test/unit/frontend-*.test.ts test/unit/frontend-*.test.tsx test/unit/discussions-service.test.ts test/worker/discussions.test.ts`，日志 `/tmp/frontend-type-gate-wide.log`。
7. `npm run typecheck`、`npm run typecheck:landing`、`npm run test:frontend-types`、`npm run test:i18n`（13/13）、`node --test scripts/frontend-app-contract.test.mjs`（8/8）通过，日志 `/tmp/frontend-type-gate-contracts.log`。
8. `npm run build:ui`（含静态VM隔离）、`npm run verify:i18n`、`npm run verify:workbench-maturity`（15/15）、`npm run audit:workbench-domain`、`node --test scripts/functional-checklist-audit.test.mjs`（9/9）及 `npm run audit:functional-checklist` 通过，日志 `/tmp/frontend-type-gate-gates.log`。

上述 shell 命令实际均经 `rtk proxy` 执行。旧证据中的全App类型诊断保留为历史记录，当前正式前端门禁已通过；不再把那28项历史诊断报告为当前阻塞。

## 清单与边界

原30、D08排除；范围内29、已关闭5、仍开放24。A05/R2-008、导航Task 4及D07仍开放。类型门禁与本地DOM/Worker测试不等于真实浏览器历史/刷新/键盘/触控、身份切换或VM验收。无本地外部阻塞；允许继续现有清单的剩余导航所有者/恢复边界，原生验收另行取证。

未push、部署、远程迁移或读取/上传生产密钥；用户独立预览不变。本轮不执行包含生产密钥构建步骤的完整 `npm run check`，实际执行的安全本地门禁单独列明。
