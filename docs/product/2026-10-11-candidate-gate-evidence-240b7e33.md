# 精确候选完整门禁证据（本地，候选 `240b7e33`）

日期：2026-10-11（本地运行）；分支 `codex/functional-checklist-completion`。

- 候选提交：`240b7e33e7c85ccabe6b2d4ab895bd1c516a3016` — `docs(product): record the multi-member isolation sweep evidence`；`git rev-parse HEAD` 等于该提交。
- 分支状态（实测）：`git branch -vv` 的上游为 `[origin/codex/functional-checklist-completion]`；`git rev-parse origin/codex/functional-checklist-completion` = `240b7e33e7c85ccabe6b2d4ab895bd1c516a3016`，`git rev-list --count origin/codex/functional-checklist-completion..HEAD` = `0`，`git log --oneline origin/codex/functional-checklist-completion..HEAD` 为空，`git branch -r --contains HEAD` 仅列该上游——即本地 ref 与远端跟踪 ref 一致，**无未推送提交**（`refs/remotes/origin/...` reflog 记为 `update by push`）。注：本任务上下文曾称分支领先 origin 7 个提交（基点 `a7e16c10`），但按上述命令与远端跟踪 ref 实测不成立，此处以实测为准。
- 门禁起跑与回填状态：门禁起跑时 `git status --porcelain` 仅含新增未跟踪目录 `tools/acceptance/`（本批本地验收工具箱，**非产品代码**，未接入应用或 `npm run check` 门禁），门禁在该工作树上运行；文档回填后工作树为 ` M docs/product/2026-09-12-personal-workbench-completion-audit.md`、`?? docs/product/2026-10-11-candidate-gate-evidence-240b7e33.md`、`?? tools/acceptance/`（即本文档与父 checklist 的编辑发生在门禁之后）。

## 已执行命令与观察结果

下表门禁/迁移/清单命令均在本仓库根目录、**本地**执行，未读取或上传 secrets、未做远程迁移或部署。（分支状态核查另行执行了只读 `git fetch` / `git ls-remote`，不上传、不改远端，见上文。）

| 命令 | 观察到的结果 |
| --- | --- |
| `git rev-parse HEAD` | `240b7e33e7c85ccabe6b2d4ab895bd1c516a3016` |
| `git log --oneline -1` | `240b7e33 docs(product): record the multi-member isolation sweep evidence` |
| `git status --porcelain` | 起跑时仅 `?? tools/acceptance/` |
| `npm run check` | **退出码 0**（完整日志 `/tmp/cf-acceptance-check.log`） |
| `node scripts/verify-m1-migrations.mjs --files` | `[pass] migration-files count=61`，退出 0 |
| `npm run audit:functional-checklist` | inScope 29 / completed 5 / remaining 24；completedIds A03/A04/B03/C07/D03；excludedIds D08 |

### `npm run check` 分阶段明细（退出码 0）

- `vendor:check`：`markdown-it@15.0.0` `8d0f6aca…e83abc`、`dompurify@3.4.14` `c2f26ea4…c6e3e6`。
- `types:check`（`wrangler types --check --env-file config/types.env`）：`✨ Types at worker-configuration.d.ts are up to date.`
- `typecheck` Worker / 前端 / landing：三段 `tsc` 均无错误。
- `test:smoke`（node --test 13 个 smoke 契约文件）：`tests 79`、`pass 79`、`fail 0`。
- `test:i18n`：`tests 13`、`pass 13`、`fail 0`；`verify:i18n` → `[pass] i18n keys=434 placeholders=55 files=6` 与 `[pass] i18n-hardcoded-copy ast=typescript html=dom`。
- `verify:delivery-status`：`tests 30`、`pass 30`、`fail 0`。
- `test:unit`：**Test Files 362 passed (362)**，**Tests 5206 passed (5206)**。
- `test:worker`：**Test Files 70 passed (70)**，**Tests 1178 passed (1178)**。
- `build`：`build:ui`（vite 4868 modules）+ `verify:browser-vm:build` 静态模块隔离（`verifiedChunks 3`、`deferredVmChunks []`）通过；`verify:landing` `tests 97`、`pass 97`、`fail 0`；`build:secrets` → `[pass] build secret scan: frontend/dist`；`build:legacy-audit` → `[pass] legacy UI rollback files retained; frontend source/dist has no legacy references (4 files)`；`wrangler deploy --dry-run` → `--dry-run: exiting now.`（**不是部署**）。

### 日志异常归因

- 日志中未出现 `window is not defined`、`Unhandled`、`not wrapped in act` 或 `ReferenceError`（grep 计数 0）。
- 日志含 3 行 `uncaught exception` 输出，归为 2 条消息：`WorkspaceFsError: no such file: /workspace/published/default/knowledge-purge-m3/revision-purge-m3.md` 与 `Error: Invalid pending note journal`（同一 stack 输出 2 行）。两条均对应既有负向测试路径（purge 后文件确实不存在、坏 journal 精确错误），与 `2026-10-10-functional-gate-reconciliation-evidence.md` 中已独立复现的归因一致；未拦截或删除错误输出。
- 保留既有 AI 绑定与工具更新提示，不声称零警告。

## 本批新增的本地验收入口（非产品代码）

- `tools/acceptance/`：`README.md`、`seed-local-members.mjs`、`check-local-authorization.mjs`、`cleanup-local-members.mjs`。对本地 `wrangler dev`（`127.0.0.1:8787`）＋本地 D1 合成成员运行授权/隔离矩阵：`/api/session` 合成成员 200、无 cookie/伪造 43 字符 token 401，9 个 admin 读端点 contributor 403／admin 200，规范化 `Origin` 下 `POST /api/admin/menus` contributor 403／admin 201，不可读条目收藏 404，**26/26 通过**（该目录存在时 `npm run check` 仍退出 0；门禁按固定文件清单运行，未枚举或运行该目录）。
- **明确非声明**：合成本地会话**不是真实身份**，该工具箱**不构成 D05/D06/D04/D08 验收**；脚本仅作用于**本地** D1 与本地 dev server，**从不** `--remote`、不部署、不读 `.dev.vars` 或任何 secret；合成 token 仅写入 gitignored 的 `.wrangler/acceptance-sessions.json` 并打印到 stdout。

## 关闭边界与明确非声明

- 本记录绑定候选 `240b7e33e7c85ccabe6b2d4ab895bd1c516a3016` 的完整本地门禁。
- **未发布、未部署、未做远程 D1 迁移**；`wrangler deploy --dry-run` 不是部署，未读取/上传 secrets。
- **不替代功能完成后的最终候选门禁**：D07 的关闭条件是功能完成后的精确候选完整门禁，当前候选门禁不是功能完成证明。
- **不替代 D04/D05/D06 的原生/真实身份验收**：VM 正式生命周期、真实 admin/contributor/第二成员旅程、原生尺寸/语言/主题/键盘/触控矩阵均仍开放。
- 原 30 父项、D08 排除后范围 **29 / 已关闭 5 / 未关闭 24** 不变；D07 父项保持开放。
- 本轮只做门禁运行与文档/工具箱新增，**未改源码、既有测试或迁移**；未翻转任何 checkbox，未改变 29/5/24 计数，未改变任何发布或验收状态。
