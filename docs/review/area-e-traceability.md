# Area E — 需求可追溯性与门禁真实性

审计对象：`/Users/doug/ai/system/cf-computer-agent`，`main` HEAD `4d00e381b49772867ce545c6fe6e8a91164e2dff`（2026-10-18 22:21:42 +0800，`fix(auth): let legacy code-login members set a password`）。审计开始时 `git status --porcelain` 为空（本报告写入后仅新增 `docs/review/` 未跟踪文件）。

边界：只读审计。除本文件外未写源码/测试/迁移/脚本/文档；未读取 `.dev.vars`/`SECRETS_FILE`；未联网、未部署、未提交；未运行全量门禁（`npm run check`/`npm test`/`npm run build`），仅运行任务允许的脚本级门禁与只读静态核对。

## 覆盖与方法

| # | 检查 | 复算方式 | 退出码 | 结果摘要 |
| --- | --- | --- | --- | --- |
| 1 | 账本表格解析与四维统计 | 内联 Node 解析（见 1.1） | 0 | 99 atoms；四维计数见下 |
| 2 | 账本证据路径存在性 | 内联 Node `fs.existsSync`（见 1.2） | 0 | 363 个 distinct 文件型路径，362 存在，1 缺失 |
| 3 | README/ROADMAP/账本/审计/路由/缺口矩阵 markdown 本地链接 | 内联 Node 解析 `](path)` | 0 | README 17/17、ROADMAP 43/43、ledger 10/10、completion-audit 127/127、route-inventory 4/4、gap-matrix 1/1 均存在 |
| 4 | 路由/页面/能力三方对照 | 内联 Node 正则 + 源码阅读 | 0 | 静态 31、参数化分支 8、页面模式 38、成熟度记录 39、`renderPage` case 40/40 |
| 5 | 迁移台账 | 目录列表 + `node scripts/verify-m1-migrations.mjs --files` | 0 | 78 个文件，0001–0078 连续无重复 |
| 6 | 功能清单实算 | `node scripts/functional-checklist-audit.mjs` | 0 | 30 原始 / 29 范围内 / 12 已关闭 / 17 未关闭 |
| 7 | 交付状态契约 | `npm run verify:delivery-status` | 0 | 30/30 pass |
| 8 | 成熟度契约 | `npm run verify:workbench-maturity` | 0 | 15/15 pass |
| 9 | 领域审计 | `npm run audit:workbench-domain` | **1** | `workbench-knowledge-reader: mutation declarations must map one-to-one to generated facts`，多出 `DELETE /api/knowledge/:id/artifacts/:id` |
| 10 | 领域审计测试 | `node --test scripts/workbench-domain-audit.test.mjs` | **1** | 20 个用例 ✖（均源于同一 manifest 红灯）；含 `checked evidence document exactly matches the deterministic generator` 失败（`scripts/workbench-domain-audit.test.mjs:523`） |
| 11 | 前端操作清点 | `node scripts/frontend-operation-inventory.mjs --check` | 0 | `475 source files, 1760 source operation candidates; not runtime acceptance` |
| 12 | i18n | `node scripts/verify-i18n.mjs` | 0 | keys=434 / placeholders=55 / files=6；hardcoded-copy pass |
| 13 | WCAG 合同 | `node scripts/wcag-contract.mjs` | 0 | 无输出（通过） |
| 14 | 合并契约快测 | `node --test scripts/delivery-status-contract.test.mjs scripts/workbench-maturity-contract.test.mjs` | 0 | 45/45 pass |
| 15 | 文档日期/计数声明 | `grep`/源码阅读 | 0 | 差异见“路由/迁移/文档差异表” |

### 1.1 账本解析与统计复算脚本

```bash
node --input-type=module <<'EOF'
import fs from 'node:fs';
const txt = fs.readFileSync('docs/product/delivery-status-ledger.md','utf8');
const lines = txt.split('\n');
// 逐字符切分：`\|` 视为字面管道，避免长行/转义/代码 span 破坏列
function splitRow(line){const cells=[];let cur='';for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='\\'&&line[i+1]==='|'){cur+='|';i++;continue;}if(ch==='|'){cells.push(cur);cur='';continue;}cur+=ch;}cells.push(cur);return cells.slice(1,-1).map(s=>s.trim());}
const rows=[];
for(let i=0;i<lines.length;i++){const l=lines[i];if(!l.startsWith('|')||/^\|\s*---/.test(l)||/^\|\s*ID\s*\|/.test(l))continue;const c=splitRow(l);if(c.length!==10)continue;rows.push({line:i+1,id:c[0],impl:c[3],ver:c[4],rel:c[5],acc:c[6],ev:c[8],note:c[9]});}
const order=['done','partial','pending','n/a'];
const dims=[['implementation','impl'],['verification','ver'],['release','rel'],['acceptance','acc']];
console.log('atoms', rows.length);
for(const [name,key] of dims){
  const m={}; for(const r of rows) m[r[key]]=(m[r[key]]||0)+1;
  console.log(name, order.map(o=>`${o}=${m[o]||0}`).join(' '));
}
EOF
```

输出（本审计实跑）：

```text
atoms 99
implementation done=79 partial=8 pending=12 n/a=0
verification done=83 partial=3 pending=13 n/a=0
release done=0 partial=29 pending=70 n/a=0
acceptance done=1 partial=9 pending=89 n/a=0
```

说明：该输出与 `ROADMAP.md:49` 的结构化摘要、以及 `npm run verify:delivery-status` 中 `assertRoadmapMaturitySummary` 的机器对照结果一致。

### 1.2 证据路径存在性复算脚本

```bash
node --input-type=module <<'EOF'
import fs from 'node:fs';
const txt=fs.readFileSync('docs/product/delivery-status-ledger.md','utf8');
const lines=txt.split('\n');
function splitRow(line){const c=[];let cur='';for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='\\'&&line[i+1]==='|'){cur+='|';i++;continue;}if(ch==='|'){c.push(cur);cur='';continue;}cur+=ch;}c.push(cur);return c.slice(1,-1).map(s=>s.trim());}
const rows=[];for(let i=0;i<lines.length;i++){const l=lines[i];if(!l.startsWith('|')||/^\|\s*---/.test(l)||/^\|\s*ID\s*\|/.test(l))continue;const c=splitRow(l);if(c.length!==10)continue;rows.push(c);}
const evRe=/`([^`]+)`/g; const fileTok=/^(?:src|test|docs|migrations|scripts|frontend|shared|config|tools|public|design)\/[^\s`]+$/;
const seen=new Set(); let checked=0; const missing=[];
for(const r of rows){let m;while((m=evRe.exec(r[8]))){const p=m[1].trim();if(!fileTok.test(p)||seen.has(p))continue;seen.add(p);checked++;if(!fs.existsSync(p))missing.push([p,r[0]]);}}
console.log({checked,missing});
EOF
```

输出：`checked=363`，`missing=[['test/unit/frontend-menu-keyboard.test.tsx','WB-A11Y']]`。

## 结论摘要

1. **账本四维计数真实且被门禁强制。** 实算 `atoms=99`；`implementation done/partial/pending/n/a = 79/8/12/0`；`verification = 83/3/13/0`；`release = 0/29/70/0`；`acceptance = 1/9/89/0`，与 `ROADMAP.md:49` 的结构化摘要逐项一致；`scripts/delivery-status-contract.test.mjs` 的 `assertRoadmapMaturitySummary`（约 `:2379-2409`）在 `npm run verify:delivery-status` 中把 ROADMAP 摘要与账本逐项比对，30/30 通过。因此“99 atoms / 79-8-12”等数字当前可信。
2. **“全量本地门禁”并不覆盖两个真实门禁，且其中一个在 HEAD 是红的。** `npm run check` = `vendor:check && types:check && typecheck && typecheck:landing && npm test && build`（`package.json:34`），`npm test` = `test:smoke && test:unit && test:worker`（`package.json:13`）；`test:smoke` 只追加 `verify:delivery-status`（`package.json:14`），**不包含** `verify:workbench-maturity`（`package.json:52`）与 `audit:workbench-domain`（`package.json:53`）。而 HEAD 上 `npm run audit:workbench-domain` 退出 1（见结论 3），`scripts/workbench-domain-audit.test.mjs` 退出 1。即：文档所称“完整 check 通过”与“领域审计通过”不是同一次门禁，HEAD 当前状态并非全绿。
3. **领域审计失败可精确定位到一次漏登记。** `7ef7055a`（2026-10-18 11:24，studio 产物保留）新增了后端 `DELETE /api/knowledge/:id/artifacts/:id`（`src/routes/library.ts:610-627`）与前端调用（`frontend/lib/studio-artifacts-data.ts:69,85`），但该 commit 的文件清单**不含** `shared/workbench-maturity-capabilities.ts`。该文件 `:1278` 的 `apiPaths` 缺少 `/api/knowledge/:id/artifacts` 与 `/api/knowledge/:id/artifacts/:id`，`:1282` 的 `mutations` 缺少对应 delete 声明；manifest 最后变更仍是 `90de4151`（2026-10-16 23:14）。同时，生成证据 `docs/operations/evidence/2026-09-26-workbench-functional-domain-audit.md` 最后提交也是 `90de4151`，即使补声明后 `--check` 仍需重新生成该文件。
4. **交付门禁不校验“实现/验证证据路径是否存在”。** `assertRowContract`（`scripts/delivery-status-contract.test.mjs:2142-2158`）对 `实现/验证/发布/验收` 任一 `done` 只要求“证据非空”；只有 release/acceptance 的 `dated-file` 会被 `existsSync` 检查（`:2160-2178`）。因此 `WB-A11Y`（`docs/product/delivery-status-ledger.md:53`）引用已被删除的 `test/unit/frontend-menu-keyboard.test.tsx` 时 `verify:delivery-status` 仍 30/30 通过。该测试文件由 `496425af`（2026-10-18 14:32，beUI 全页面改造）删除；`frontend/components/motion/popover.tsx:16` 注释仍引用它。
5. **路由与迁移的文档计数系统性滞后。** 实际：`WORKSPACE_ROUTE_CAPABILITIES` 31 条静态路由 + `frontend/app-routes.ts` 8 个分支（其中 `/admin/knowledge/trash` 与静态表重复）= 38 个页面模式，成熟度 manifest 39 条记录（trash 路径被 `workbench-admin-recycle-bin` 与 `workbench-admin-knowledge-trash` 两条记录同时拥有）。文档仍写 28+4=32（`docs/product/2026-09-12-personal-workbench-route-inventory.md:11`）、README “32-route”（`README.md:24`）、ROADMAP “32 个页面对账”（`ROADMAP.md:27`）、完成审计 “33”（`:56`、`:75`）、前端操作证据 “34 个业务入口”（`docs/product/frontend-operation-inventory-evidence.md:10`）。迁移实际 78 个连续文件，但 ROADMAP/README/完成审计仍多处写 `count=61`（`ROADMAP.md:11`、`README.md:23`、`docs/product/2026-09-12-personal-workbench-completion-audit.md:16,351-353`）。
6. **代码里存在账本/成熟度清单都未登记的功能模块。** 完全无账本 atom 的包括 `src/maintenance`（维护协调器，仅存在于账本页首散文补充 `:5`）、`src/research`（研究运行 API）、`src/tags`、`src/review-comments`、`src/admin-summary`、`src/operations`、`src/indexing`；`src/evaluation` 有 `EVAL-001` 但该 atom 为 `pending`（`ledger:46`），代码只被单测引用；`src/goal-tasks` 无专用 atom，且 `GL-001` 备注仍写“目标与项目/任务关联…pending”（`ledger:67`），但 `migrations/0053_goal_tasks.sql`、`src/goal-tasks`、`routes/goal-tasks.ts`、测试与 `src/app.ts:451,514` 接线均已存在。反向未发现“账本声称已实现但证据中源码路径缺失”：363 个证据路径仅上述 1 个缺失，31 个 `shared route:` 标记 31/31 能在路由表中找到。

## 账本统计

解析口径：`docs/product/delivery-status-ledger.md` 表体行（跳过表头与 `---` 分隔行），按未转义 `|` 切成 10 列；`ID/功能/优先级/实现/验证/发布/验收/依赖/证据/备注`。共 **99 atoms = 94 个带编号 ID 行（含 `P4-001`、`WB-GR-001`、`GATE-M0/M1`）+ 5 个命名 atom 行（`WB-PAGE`、`WB-SCROLL`、`WB-ENVIRONMENTS`、`WB-SETTINGS`、`WB-A11Y`，位于主表后半段、仍是同一张 10 列表）**；解析按表行统计而非 ID 形态过滤，故不会把命名 atom 漏算，也不会误报“应为 94”。99 个 ID 唯一、无重复；依赖图无环（由 `verify:delivery-status` 的 `assertDependencyGraph` 验证通过）。

| 维度 | 实算 done | partial | pending | n/a | 文档/门禁声明 | 一致性 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| atoms | 99 | — | — | — | `ROADMAP.md:49` `atoms=99` | 一致（门禁强制） |
| implementation | 79 | 8 | 12 | 0 | `ROADMAP.md:49` 同 | 一致（门禁强制） |
| verification | 83 | 3 | 13 | 0 | `ROADMAP.md:49` 同 | 一致（门禁强制） |
| release | 0 | 29 | 70 | 0 | `ROADMAP.md:49` 同 | 一致（门禁强制） |
| acceptance | 1 | 9 | 89 | 0 | `ROADMAP.md:49` 同 | 一致（门禁强制） |

补充核对：

| 检查 | 结果 | 明细 |
| --- | --- | --- |
| implementation=done 但 verification≠done | 0 条 | — |
| verification=done 但证据无 `test/` 路径 | 5 条 | `OPS-002`、`OPS-004`、`OPS-006`、`GATE-M0`、`GATE-M1`（均为交付/门禁原子，证据为 docs/scripts 而非测试文件；属证据类型差异，非必然缺陷） |
| implementation=done 但证据无 `src/frontend/shared` 路径 | 8 条 | `WB-A11Y`（仅测试/脚本）、`OPS-001/002/003/004/006`（migrations/scripts/docs）、`GATE-M0/M1`（dated evidence）。均为跨切面/交付原子 |
| evidence 为 `-` 的原子 | 10 条 | `RET-001/002/003`、`EVAL-001`、`TSK-009`、`NTF-006`、`BRD-007`、`MSG-006`、`OPS-010`、`OPS-011`，全部 four-dim `pending`，属诚实未实现 |
| `shared route:` 标记 | 31 条 | 31/31 命中 `WORKSPACE_ROUTE_CAPABILITIES` 静态路径；参数化深链（`/knowledge/:id`、`/messages/:id` 等）不在账本 route 标记中，而由 maturity manifest 的 `ledgerIds` 绑定 |
| 证据中 `migrations/*.sql` 引用 | 0 缺失 | 账本引用的迁移文件全部存在 |

### implementation=done 行的代码/测试真实性核对

对 79 条 `implementation=done` 行逐条抽取证据列中的代码路径（`src|frontend|shared`）与 83 条 `verification=done` 行中的测试路径（`test/**/*.{ts,tsx,mjs}`，注意 `.tsx` 必须优先于 `.ts` 匹配，否则会把 `.tsx` 误截成 `.ts` 产生假缺失）：

| 指标 | 数值 | 明细 |
| --- | ---: | --- |
| implementation=done 行引用的代码路径 | 194 条 | `fs.existsSync` 全部存在（0 缺失） |
| implementation=done 且含 ≥1 代码路径 | 71/79 | 其余 8 条为交付/跨切面原子 |
| 其中仅有 docs 证据（无代码/迁移/脚本/测试路径） | 4 条 | `OPS-002`、`OPS-004`、`GATE-M0`、`GATE-M1`（证据/gate 原子，属合理类型） |
| 无代码路径但有 migrations/scripts/test | 4 条 | `OPS-001`、`OPS-003`（migrations）、`OPS-006`（scripts）、`WB-A11Y`（tests+script） |
| verification=done 行引用的测试路径 | 186 条 | 185 存在；**1 缺失**：`WB-A11Y` → `test/unit/frontend-menu-keyboard.test.tsx`（已被 `496425af` 删除） |
| verification=done 且含 ≥1 测试路径 | 78/83 | 其余 5 条为交付/门禁原子（`OPS-002/004/006`、`GATE-M0/M1`），证据为 docs/scripts |

结论：`implementation=done` 的代码路径真实存在（194/194）；`verification=done` 的测试路径 185/186 存在，唯一缺失行就是 `WB-A11Y`。但这一真实性是**本次人工静态核对**得出，`verify:delivery-status` 本身不做该校验（见结论 4）。

## 证据缺失清单

文件型证据路径共 363 个 distinct（来自证据列反引号 token，区间 `src|test|docs|migrations|scripts|frontend|shared|config|tools|public|design`）。缺失清单（前 50 上限未用满）：

| # | 缺失路径 | 引用 atom | 事实 |
| --- | --- | --- | --- |
| 1 | `test/unit/frontend-menu-keyboard.test.tsx` | `WB-A11Y`（`ledger:53`） | 文件已由 `496425af`（2026-10-18 14:32）删除；工作树无此文件；`frontend/components/motion/popover.tsx:16` 仍以其行号作注释引用。门禁未拦截：`verify:delivery-status` 不检查验证证据路径存在性 |

其它证据完整性事实：

- `release evidence:` 标记 29 处、distinct 文件 4 个：`docs/operations/evidence/m1-release-2026-08-23.md`、`workspace-rbac-release-2026-08-27.md`、`workspace-rbac-release-2026-08-28.md`、`2026-10-18-studio-artifact-production-acceptance.md`，全部存在。
- `acceptance evidence:` 标记 10 处、distinct 文件 3 个：`m1-release-2026-08-23.md`、`2026-10-18-kb011-production-rollback-acceptance.md`、`2026-10-18-studio-artifact-production-acceptance.md`，全部存在。
- 结论：**不存在 dated-file 缺失的 release/acceptance 行**；唯一“证据不存在”是验证维度引用的一个测试文件。
- 文档链接：README/ROADMAP/ledger/completion-audit/route-inventory/gap-matrix 的本地 markdown 链接均存在（0 缺失）。

## 路由/迁移/文档差异表

| 项目 | 代码/脚本事实 | 文档声称 | 差异 |
| --- | --- | --- | --- |
| 静态路由表 | `shared/workspace-route-capabilities.ts` 31 条（全部 `ready`；含 `admin-recycle-bin` → pageKind `admin-knowledge-trash`） | 路由文档 “28 个静态路由”（`route-inventory.md:11`） | +3（`/graph`、`/environments`、`/admin/knowledge/trash`） |
| 参数化/固定深链 | `frontend/app-routes.ts` 8 个分支（`knowledge-reader`、`message-thread`、`project-timeline`、`admin-submission-detail`、`admin-knowledge-trash`(与静态重复)、`admin-knowledge-item`、`admin-role-new`、`admin-role-detail`） | 路由文档 “4 个参数化路由，共 32 个登录后页面模式”（`:11`）；完成审计 “33 个 ready 路由”（`:56`）；closure 对账 “33 个 ready 页面能力”（`2026-09-28-functional-closure-reconciliation.md:14`）；前端操作证据 “34 个业务入口” | 实际页面模式 31+7=**38**；成熟度 manifest **39** 条记录（trash 双记录） |
| 页面渲染 | `frontend/app.tsx` `renderPage` 40 个 case；`PageKind` 40 个取值（`WorkspacePageKind` 34 + 5 参数化 page kind + `not-found`）；缺失 case 0 | — | 无“能力表有但无页面渲染”；7 个参数化 page kind 不在 `WORKSPACE_ROUTE_CAPABILITIES`（该表定位为可导航静态入口），但均在 maturity manifest 有记录与 `ledgerIds` |
| 能力→API | maturity manifest 39 条 domain 记录共 191 条 `apiPaths`；启发式对照 `src/routes/*.ts` 的 regex/exact 分发，0 条完全找不到（“能力表有但无 API”=0）；31 条静态能力均有 ledger `shared route` 标记 | — | — |
| 能力表未覆盖的 API | 服务端存在但 maturity manifest 未登记的路径族：`/api/agent/sessions/*`（KB-009 有 atom）、`/api/capture/*`（CAP-001 有 atom）、`/api/admin/maintenance/*`（无 atom）、`/api/admin/knowledge/:id/operations/:id`、`/api/admin/knowledge/:id/revisions/:id/chunks/rebuild-report` | 账本/成熟度清单无对应能力记录 | code → ledger/maturity 追溯断点；其中 `DELETE /api/knowledge/:id/artifacts/:id` 是本次领域审计红灯的直接原因 |
| 迁移文件数 | 78 个文件，编号 0001–0078 连续、无重复、无缺号；`node scripts/verify-m1-migrations.mjs --files` → `[pass] migration-files count=78`；`scripts/m1-release-contract.test.mjs:261` 断言 `count=78`，并在 `:105-106` pin 了 0077/0078 哈希 | ROADMAP `count=61`（`:11`）；README “migration-file count 61”（`:23`）；完成审计 `count=61`（`:16,351,352,353`）；native matrix “0001–0061”（`2026-10-11-native-matrix-evidence.md:15`） | 文档滞后 17 个迁移（0078 vs 61）。注意：`npm run check` 内嵌的 `m1-release-contract.test.mjs` 已按 78 更新，故门禁本身不因此失败 |
| forward-only / 只追加 | 文件列表 append-only 成立（0001–0078 连续、哈希 pin）。但 git 历史显示 7 个迁移曾被原地修改：`0003`、`0004`、`0028`、`0032`、`0034`、`0036`、`0037`（`git log --diff-filter=M --name-status -- migrations`）；7 个文件含 `DROP TABLE`（`0003`、`0004`、`0048`、`0049`、`0050`、`0077`、`0078`）；`0078_password_auth.sql` 删除 `email_login_codes`（`0077` 新建）与 `member_login_invitations`（`0063` 建立、`0077` 重建） | ROADMAP “所有 D1 migration 只追加且必须可恢复”（`:57`）；README “forward-only migrations” | 若“只追加”指 SQL 只新增对象，则与 7 个含 DROP 的文件不符；若指文件名只新增，则成立（原地修改均发生在各自部署候选之前/同一候选内，未发现“已部署后又改写”的直接证据；当前文件哈希由门禁 pin） |
| README 入口声明 | `src/routes/auth.ts:97` 存在 `POST /auth/register`；`migrations/0078_password_auth.sql` 建密码列/唯一邮箱索引；账本 `IDN-007` 明写“开放注册”（`ledger:29`） | README 首段 “Access is invitation-only”（`:3`）；ROADMAP “不做公开注册”（`:57`） | 同一 README 后文又写 “New members can also self-register with an email and password.”（`:39`）——文档内部及与代码矛盾 |
| recovery code / email verification | HEAD 代码无 recovery code（`9711c32d` 曾加、`977509fe` 已改为 email+新密码直接重置、`4d00e381` 调整 legacy code 账户）；`0077` 邮箱验证码表被 `0078` 删除；`src/` 无 `email_login_codes` 引用 | README “There is no recovery code, no email verification, no email-based reset”（`:39`） | “无 recovery code/无邮箱验证”与 HEAD 代码一致；但同一句又描述“A forgotten password is replaced directly from its registered email and a new password”，与“no email-based reset”措辞冲突（账本 `IDN-007` 亦写“邮箱 + 新密码直接重置”） |
| 文档更新时间 | HEAD 2026-10-18；账本行 `KB-011/KB-013/IDN-007/beUI 补充` 更新到 2026-10-18（`ledger:29,41,42,135`） | 账本 “更新时间：2026-09-23”（`:9`）、“合并状态（2026-09-23）”（`:3`）；ROADMAP “更新时间：2026-09-23”（`ROADMAP.md:3`） | 两个权威/排期文档的头部时间戳未随 10-18 提交更新 |
| 功能父项计数 | `node scripts/functional-checklist-audit.mjs` → 29 in scope / 12 completed / 17 remaining（`A03,A04,B03,B06,B07,C01,C03,C04,C07,D03,D05,D06`） | 完成审计 “当前为 29 / 12 / 17”（`completion-audit:23`）；同文档 `:14`、`:16` 仍写 “关闭 5 / 待关闭 24”“计数29/5/24”；ROADMAP `:7,:9,:11` 三处写 29/5/24 | 数据源（canonical checkbox）与 `:23` 一致；`:14/:16` 与 ROADMAP 三处为滞后计数（脚本只强制校验 `## 当前计数` 一节，故不被门禁拦截）。注意：这是功能 checklist 父项计数，与账本四维计数无关；账本四维与 `ROADMAP.md:49` 一致 |
| 缺口矩阵 | `docs/product/workbench-product-maturity-gap-matrix.md` 实际 81 行（39 manifest + 42 domain；23 P0 / 57 P1 / 1 P2），与文内汇总表 `:111-116` 一致，`verify:workbench-maturity` 的 gap-summary 契约通过 | 文内多处历史“当前实算 74/73/78”为带日期的历史快照（`:105,:132,:134`），最新 `:136` 为 81 | 最新数据一致；但知识衍生写入缺口（如 `DELETE /api/knowledge/:id/artifacts/:id`）未入矩阵/清单，与领域审计红灯同源 |

## 门禁实测结果

| 命令 | 退出码 | 关键输出 |
| --- | --- | --- |
| `git log -1` / `git status --porcelain` | 0 | HEAD `4d00e381`（2026-10-18 22:21:42 +0800）；工作树干净 |
| `node scripts/functional-checklist-audit.mjs` | 0 | `originalTotal:30, inScope:29, completed:12, remaining:17`；completedIds 12 个；excludedIds `["D08"]` |
| `npm run verify:delivery-status` | 0 | `tests 30 / pass 30 / fail 0`；含 `route coverage uses exact structured route markers`、`delivery status ledger reconciles documentation status claims` 等 |
| `npm run verify:workbench-maturity` | 0 | `tests 15 / pass 15 / fail 0`；含 `every visible ready route has one maturity capability record`、`R0 atoms bind exact capabilities, ledger rows, dimensions, and evidence classes` |
| `npm run audit:workbench-domain` | **1** | `AssertionError [ERR_ASSERTION]: workbench-knowledge-reader: mutation declarations must map one-to-one to generated facts`；diff 中 `actual` 多出 `'DELETE /api/knowledge/:id/artifacts/:id'`；栈：`scripts/workbench-domain-audit.mjs:120 canonicalRuntimeEvidence` ← `:533` ← `:937 runCli` |
| `node --test scripts/workbench-domain-audit.test.mjs` | **1** | 20 个用例 ✖（`every maturity capability has one conservative domain audit record`、`every declared operation has one generated fact for its owning capability` 等，均因同一 manifest 漏登记扩散）；末尾断言 `1 !== 0` 位于 `scripts/workbench-domain-audit.test.mjs:523`（该用例 spawn `scripts/workbench-domain-audit.mjs --check` 并要求 status 0） |
| `node scripts/frontend-operation-inventory.mjs --check` | 0 | `--check: 475 source files, 1760 source operation candidates; not runtime acceptance` |
| `node scripts/verify-i18n.mjs` | 0 | `[pass] i18n keys=434 placeholders=55 files=6`；`[pass] i18n-hardcoded-copy ast=typescript html=dom` |
| `node scripts/wcag-contract.mjs` | 0 | 无输出 |
| `node scripts/verify-m1-migrations.mjs --files` | 0 | `[pass] migration-files count=78` |
| `node --test scripts/delivery-status-contract.test.mjs scripts/workbench-maturity-contract.test.mjs` | 0 | `tests 45 / pass 45 / fail 0` |

补充门禁事实：

- `npm run check`（`package.json:34`）链路：`vendor:check → types:check → typecheck → typecheck:landing → npm test → build`；`npm test`（`:13`）链路：`test:smoke → test:unit → test:worker`；`test:smoke`（`:14`）末尾含 `npm run verify:delivery-status`（`:51`）。链路中没有 `verify:workbench-maturity`（`:52`）、`audit:workbench-domain`（`:53`）、`audit:frontend-operations`（`:66`）。因此“`npm run check` 退出 0”不能推出“成熟度/领域审计通过”，而 HEAD 上领域审计确实失败。
- `scripts/workbench-domain-audit.test.mjs` 未被任何 `npm` 脚本引用（仅 `package.json:53` 引用审计本体），故该失败不会进入 `npm test`。
- `verify:delivery-status` 的 30/30 通过**不**校验实现/验证证据路径存在性；它只校验列值合法性、done 维度证据非空、n/a 理由、release/acceptance 的 dated+scoped 证据文件存在性、依赖图、route 覆盖、文档语言边界（`scripts/delivery-status-contract.test.mjs:2142-2178,475-497`）。

## 未登记/缺失功能清单

### A. 代码有、账本/成熟度清单无登记（追溯断点）

| 模块 | 代码/接线事实 | 账本 atom | maturity/domain manifest | 结论 |
| --- | --- | --- | --- | --- |
| `src/maintenance` | `MaintenanceControlService`（`src/app.ts:128`）；`/api/admin/maintenance/begin-drain|resume|status|capacity`；设计/证据见 `docs/operations/evidence/2026-09-19-maintenance-coordinator.md` | 无 atom；仅 `ledger:5-8` 页首补充散文 | 无 records | 完全未登记 |
| `src/research` | `ResearchRepository`（`src/app.ts:119`）；`/api/knowledge/:id/research-runs*` 一组端点（`src/routes/library.ts:469-536`） | 无 atom（`KB-012` 备注仅顺带提“研究运行”保留语义，`ledger:41`） | knowledge-reader record 的 apiPaths 含 research-runs 写入；无独立能力/缺口记录 | 功能有代码+API，无需求原子 |
| `src/tags` | `TagsRepository/TagsService`（`src/app.ts:68-69`）；`/api/admin/tags`、提交/草稿标签读取 | 仅有任务侧“标签”在 `TSK-003/004/005`（`ledger:57-59`），知识/管理标签无 atom（`src/tags` 在账本引用数 0） | admin-spaces record 含 `/api/admin/tags`；无独立 capability | 部分未登记（任务标签有 atom，知识标签无） |
| `src/review-comments` | `ReviewCommentsRepository/Service`（`src/app.ts:129-130`）；submission/admin 评论端点 | 无 atom（账本无“评论”字样，`src/review-comments` 引用 0） | admin-submission-detail record 含 comments 端点 | 有代码+API，无需求原子 |
| `src/admin-summary` | `AdminSummaryRepository`（`src/app.ts:25`）；`/api/admin/summary` | `ADM-001` 覆盖“管理概览”功能（`ledger:94` 附近），但证据不含 `src/admin-summary` | workbench-admin record | 功能有 atom，模块路径未登记 |
| `src/operations` | `AdminOperationReceipts`（`src/app.ts:30`） | `GOV-001`/`ADM-009` 描述回执语义，无模块路径 | 各 record 以 migrations 绑定回执表 | 功能有 atom，模块路径未登记 |
| `src/indexing` | `buildIndexDocument` 被 `src/publication/repository.ts:8`、`src/library/repository.ts:2`、`src/ops/index-rebuild-plan.ts:1` 使用 | 无 atom 路径；`KB-004` 覆盖“发布/索引”语义 | publication/library 相关 record | 功能有 atom，模块路径未登记 |
| `src/evaluation` | 4 个指标模块（citation/retrieval/permission/synthetic）；仅被 `test/unit/*` 引用，`src/` 与 `frontend/` 无 import | `EVAL-001` 为 **pending**（`ledger:46`） | 无 record | 代码存在但未接线；账本 pending 与“已有可测指标实现”并存（可理解为评测工具先行，非产品功能） |
| `src/goal-tasks` | `GoalTasksRepository/Service`（`src/app.ts:451,514`）；`migrations/0053_goal_tasks.sql`；`/api/goals/:id/tasks*`；`test/worker/goal-tasks.test.ts` | 无专用 atom；`GL-001`（`ledger:67`）备注称“目标与项目/任务关联…仍 pending”，`PRJ-001` 仅描述项目侧关联 | workbench-goals record 的 apiPaths/mutations 含 goals↔tasks 且判 proven | 代码+证据已存在，账本备注仍称关联 pending：账本备注口径与代码/manifest 不一致 |
| `src/agent` 会话 API | `/api/agent/sessions*`（`session-do`、turns/tools/messages/stream） | `KB-009` 有 atom 且 `done/done`（`ledger:38`） | maturity `workbench-agent` record 的 apiPaths 只列 `/api/knowledge/chat*`，**未列** `/api/agent/sessions*` | atom 存在但 maturity manifest 漏登记该 API |
| `src/capture` | `CaptureRepository/CaptureClassificationService`（`src/app.ts:92-93`）；`/api/capture*` | `CAP-001` 有 atom 且 `done/done`（`ledger:73`） | 无 capture capability record；捕获端点未进任何 apiPaths | atom 存在但 maturity manifest 漏登记 |

### B. 账本声称已实现但证据/代码缺失

| 检查 | 结果 |
| --- | --- |
| 证据列中 `src/frontend/shared/migrations` 路径存在性 | 362/363 存在；唯一缺失为验证维度测试文件（`WB-A11Y`），见“证据缺失清单” |
| `shared route:` 标记 → 路由表 | 31/31 命中 |
| 证据 `migrations/*.sql` → 实际文件 | 0 缺失 |
| 账本 `done` 行但无任何实现路径（仅 docs/scripts/migrations） | 8 条交付/跨切面原子（`WB-A11Y`、`OPS-001/002/003/004/006`、`GATE-M0/M1`），属证据类型差异；未发现普通产品 atom 以纯文档声明实现 |
| 参数化深链的账本绑定 | `/knowledge/:id`→`KB-006`、`/messages/:id`→`MSG-002/004`、`/projects/:id/timeline`→`P4-001`、`/admin/submissions/:id`→`ADM-002`、`/admin/roles/new|:id`→`ADM-006`、`/admin/knowledge/:id`→`ADM-012`、`/admin/knowledge/trash`→`ADM-012`：maturity manifest `ledgerIds` 均可解析到账本行 |

## 局限与未覆盖

1. 未运行 `npm run check` / `npm test` / `npm run build`（任务禁止）；因此无法独立证明“其余门禁在 HEAD 全绿”。已证明的是：本次允许运行的所有契约/静态门禁中仅 `audit:workbench-domain`（及其自身证据测试）为红，其余（delivery 30/30、maturity 15/15、清单、i18n、清点、wcag、迁移 78）均为绿，且该红门禁不在 `npm run check` 链路。
2. 证据路径检查只验证“文件存在”，不验证内容语义是否支撑该 atom 的 scope（账本自身也声明 scope 语义需评审者复核，`ledger` “判定边界”段）。
3. API 对照为启发式：对 maturity manifest 的 191 条 `apiPaths`，用 `src/routes/*.ts` 的 regex 字面量与 `url.pathname ===` 精确串做归一化匹配，未做完整 AST 路由推导；未能匹配者已人工复核为 exact 分发，故“0 缺失”是弱验证结论。
4. 未逐条打开 363 个证据文件核对日期/内容；未检查 `tools/`、`design/`、`test/fixtures` 的漂移；未审计 secrets/生产配置。
5. 未执行浏览器/Workerd/真实 D1 验证；release/acceptance 维度只能引用账本已有 dated evidence，未做生产复核。
6. 模块→atom 映射基于账本中的路径字符串（`src/<module>`）与功能描述关键词；像 `KB-004` 覆盖 indexing、`ADM-009` 覆盖 operations receipts 这类“功能有 atom、模块路径未登记”仅按路径字符串判定，可能低估语义覆盖。
7. 本报告所有数字/时间均取自 HEAD `4d00e381` 工作树；工作树后续变更会使结果失效。
