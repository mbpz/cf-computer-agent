# 精确候选完整门禁证据（本地）

日期：2026-10-11（本地运行；`npm run check` 于本地 16:19:54 起跑）；分支 `codex/functional-checklist-completion`。

- 候选提交：`06a89a85d8357f5ac24e66673a97fe141b02624f` — `feat(knowledge): recover unresolved favorite writes across refresh and tabs`。
- 分支相对 `origin/codex/functional-checklist-completion` **领先 2 个未推送提交**：`d1296e5b`（`feat(knowledge): retry reader sections independently and make favorite writes replayable`）与候选 `06a89a85`；最后一个已推送基点 `a7e16c10`。
- 起跑时 `git status --porcelain` 为空；候选门禁在测试源码固定的工作树上运行，本文档及父 checklist 的结果是门禁之后回填。

## 已执行命令与观察结果

全部命令在本仓库根目录、本地执行，未连接远程、未读取或上传 secrets、未做远程迁移或部署。

| 命令 | 观察到的结果 |
| --- | --- |
| `git rev-parse HEAD` | `06a89a85d8357f5ac24e66673a97fe141b02624f` |
| `git log --oneline -1` | `06a89a85 feat(knowledge): recover unresolved favorite writes across refresh and tabs` |
| `git status --porcelain` | 空（起跑时） |
| `git rev-list --count origin/codex/functional-checklist-completion..HEAD` | `2` |
| `npm run check` | **退出码 0**（完整日志 `/private/tmp/cf-d07-candidate-check.log`） |
| `node scripts/verify-m1-migrations.mjs --files` | `[pass] migration-files count=61`，退出 0 |
| `npm run audit:functional-checklist` | inScope 29 / completed 5 / remaining 24；completedIds A03/A04/B03/C07/D03；excludedIds D08 |
| `npm run verify:delivery-status` | `tests 30`，`pass 30`，`fail 0`，退出 0 |
| `npm run verify:workbench-maturity` | `tests 15`，`pass 15`，`fail 0`，退出 0 |
| `node scripts/workbench-domain-audit.mjs --check` | `domain audit evidence is current`，退出 0 |
| `node scripts/frontend-operation-inventory.mjs --check` | `271 source files, 1189 source operation candidates; not runtime acceptance`，退出 0 |

### `npm run check` 分阶段明细（退出码 0）

- `vendor:check`：`markdown-it@15.0.0` `8d0f6aca…e83abc`、`dompurify@3.4.14` `c2f26ea4…c6e3e6`。
- `types:check`（`wrangler types --check --env-file config/types.env`）：`✨ Types at worker-configuration.d.ts are up to date.`
- `typecheck` Worker / 前端 / landing：三段 `tsc` 均无错误。
- `test:smoke`（node --test 13 个 smoke 契约文件）：`tests 79`、`pass 79`、`fail 0`。
- `test:i18n`：`tests 13`、`pass 13`、`fail 0`；`verify:i18n` → `[pass] i18n keys=434 placeholders=55 files=6` 与 `[pass] i18n-hardcoded-copy ast=typescript html=dom`。
- `verify:delivery-status`：`tests 30`、`pass 30`、`fail 0`。
- `test:unit`：**Test Files 361 passed (361)**，**Tests 5199 passed (5199)**。
- `test:worker`：**Test Files 70 passed (70)**，**Tests 1178 passed (1178)**。
- `build`：`build:ui`（vite 4868 modules，保留既有大 chunk 警告）+ `verify:browser-vm:build` 静态模块隔离（`verifiedChunks 3`，`deferredVmChunks []`）通过；`verify:landing` `tests 97`、`pass 97`、`fail 0`；`build:secrets` → `[pass] build secret scan: frontend/dist`；`build:legacy-audit` → `[pass] legacy UI rollback files retained; frontend source/dist has no legacy references (4 files)`；`wrangler deploy --dry-run` → `--dry-run: exiting now.`（**不是部署**）。

### 日志异常归因

- 日志中未出现 `window is not defined`、`Unhandled`、`not wrapped in act` 或 `ReferenceError`（grep 计数 0）。
- 日志含 3 行 `uncaught exception` 输出，归为 2 条不同消息：`WorkspaceFsError: no such file: /workspace/published/default/knowledge-purge-m3/revision-purge-m3.md`（1 行）与 `Error: Invalid pending note journal`（同一 stack 输出 2 行）。两条消息对应既有负向测试路径（purge 后文件确实不存在、坏 journal 精确错误），与 `2026-10-10-functional-gate-reconciliation-evidence.md` 中已独立复现的归因一致；未拦截或删除错误输出。
- 保留既有 AI 绑定与工具更新提示，不声称零警告。

## 关闭边界与明确非声明

- 本记录绑定候选 `06a89a85d8357f5ac24e66673a97fe141b02624f` 的完整本地门禁。
- **未发布、未部署、未做远程 D1 迁移**；`wrangler deploy --dry-run` 不是部署，未更新独立 VM 预览，未读取/上传 secrets。
- **不替代功能完成后的最终候选门禁**：D07 的关闭条件是功能完成后的精确候选完整门禁，当前候选门禁不是功能完成证明。
- **不替代 D04/D05/D06 的原生/真实身份验收**：VM 正式生命周期、真实 admin/contributor/第二成员旅程、原生尺寸/语言/主题/键盘/触控矩阵均仍开放。
- 原 30 父项、D08 排除后范围 **29 / 已关闭 5 / 未关闭 24** 不变；D07 父项保持开放。
- 本轮只做门禁运行与文档同步，**未改源码或测试**；未翻转任何 checkbox，未改变 29/5/24 计数。
