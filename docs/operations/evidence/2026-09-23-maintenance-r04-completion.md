# R04.5 — 本地跨存储故障矩阵与收口

执行日期：2026-09-23（执行机 Asia/Shanghai）。本证据仅覆盖[获准规格](../../superpowers/specs/2026-09-19-maintenance-entry-integration-design.md)的 R02–R04 本地接入范围，不替代 R07 完整控制组合矩阵、R08 发布候选门禁或 R09 生产写者证明。

## 1. 候选与授权

- 隔离工作树：`/Users/doug/ai/system/cf-computer-agent/.worktrees/admin-audit-recovery`，分支 `codex/admin-audit-recovery`。
- 起始干净 HEAD：`786c8c92e3b550d3d8af6299180e87a9ee5b73be`（R04.4）。候选为该基线加本证据同提交的测试/文档差异；提交后以 `git log -1 --format=%H -- docs/operations/evidence/2026-09-23-maintenance-r04-completion.md` 定位精确对象，避免自引用 commit hash。
- 用户要求“有需要提交的提交下，然后进入下一个任务”。本轮新增 `tools/maintenance/cross-storage.test.ts`，更新状态文档；无最终运行时代码、生产 Wrangler、生成 Env、依赖或迁移差异。
- 不委派、不 push、不 merge main、不部署、不读取 secrets、不运行真实数据备份。独立 maintenance harness 使用 `remoteBindings: false` 和本地合成 D1/R2/SQLite DO，拒绝意外出站请求。

## 2. 新增 10 项跨边界回归

### 真实 HTTP/Cron → R2 → D1 → 补偿（8 项）

HTTP 与 Cron 各覆盖 success、D1 completion failure、R2 put 回复丢失、补偿 delete 回复丢失。HTTP 使用真实鉴权和资产处理路由，Cron 使用真实 `processDue` 工作链；不以服务层模拟响应代替入口。

- 使用真实本地原文/解析对象与 parse_jobs。D1 失败由 SQLite trigger 在成功状态更新时 `RAISE(ABORT)`，不是预先抛错的 repository mock。
- R2 实际完成 put 后才延迟或拒绝回复：断言解析对象已存在、job 仍 processing、许可 active=1/DRAINING，第二次入口请求 503，根任务未完成。
- 故障路径等待实际 delete 完成但尚未确认的补偿尾部：解析对象已删除，job 仍 processing，许可仍保留；释放门闩后才完成失败状态写入。
- 最终检查原文保留、对象/任务状态、attempts=1、put=1、delete 为 0 或 1，无自动重试。成功才 active=0/DRAINED；其余即使 HTTP 200/Cron 正常返回也 active=1/DRAINING。

### 响应消费后 → 真实 Knowledge DO/VFS → D1（2 项）

使用 guard 与真实 request-scoped published-content 适配器组合，覆盖 success/lost-reply；此处是合成根响应，不冒充真实发布 HTTP 路由验收。

- 在根响应返回前登记完整 continuation，响应消费后才放行真实 DO commit；另一个真实 reader 验证 VFS 内容已落盘。
- RPC 回复未放行时，D1 receipt 仍为 0、scope 未完成、active=1。成功确认后才写 D1 receipt 并释放。
- 模拟远端已经提交但回复丢失，调用方 catch 后仍 `WORK_UNCERTAIN`，D1 receipt=0，许可不释放；远端持久化内容存在，明确“拒绝不等于回滚”。
- 全部调度使用可控 promise 门闩，无 sleep/TTL；等待和 dispose 在 finally 中清理。

## 3. 获准规格第 9 节矩阵映射

以下路径均相对仓库，测试均在本轮完整 maintenance 命令中重跑。表中“覆盖”是限定模型下的证据，不是任意故障或全部生产写者保证。

| 规格场景 | 测试文件（`tools/maintenance/`） | 可观察证据 |
| --- | --- | --- |
| 缺失/非法配置、协调器失败时 fail-closed | `entry.test.ts`, `lifecycle.test.ts` | HTTP 503/Cron 不进入业务，业务绑定访问及写入计数为零 |
| legacy/guarded 正常语义相同 | `entry.test.ts`, `parallel.test.ts`, `entry-completion.test.ts` | 正常响应、鉴权/cookie、legacy 对照不被维护语义改变 |
| 正常 400/403/404 和合法空结果 | `entry-completion.test.ts`, `parallel.test.ts`, `d1.test.ts` | 领域响应保持、没有原始不确定性时完成许可 |
| 原始 D1 失败被捕获 | `d1.test.ts`, `entry-d1.test.ts`, `background.test.ts`, `cross-storage.test.ts` | 原始失败/异常结果在转换前观察，正常外层返回仍保留 |
| D1 方法、绑定、覆盖、归属与封闭 | `d1.test.ts`, `entry-d1.test.ts`, `entry-completion.test.ts` | 同请求同 DB facade、跨请求隔离、sealed 后零原生调用 |
| 慢查询、嵌套后台、并行早退 | `lifecycle.test.ts`, `background.test.ts`, `parallel.test.ts`, `entry-completion.test.ts` | 根响应不代表完成，完整兄弟/子 continuation 结束前不清零 |
| Cron、R2 补偿、DO 拒绝和跨存储尾部 | `entry.test.ts`, `storage.test.ts`, `cross-storage.test.ts` | 真实存储状态与许可并查；写入后失去确认也不按失败回滚推断安全 |
| EOF/cancel/error/未消费/迟到生产者 | `stream.test.ts`, `lifecycle.test.ts` | 真实 Agent producer 最终落库、独立 reader.cancel 和流生命周期分别等待 |
| 纯 provider 迟到结果不得触发写入 | `timeout.test.ts` | 超时后释放迟到 AI 结果，不再读取输出或启动 success 写入 |
| 有可写 continuation 的 race | `timeout.test.ts`, `cross-storage.test.ts` | 全链在 scope 内先登记；响应结束后存储工作仍持有许可 |
| 协调器重启、失联或完成未确认 | `coordinator.test.ts`, `lifecycle.test.ts` | 持久许可恢复、不确定完成不自动重试或以 TTL 清零 |

静态复核：HTTP/Cron 实际 DB/sessionDatabase 的惰性 facade；资产 claim/get/body/parse/put/mark-success 与 catch 中 delete/mark-failed；Knowledge request adapter/typed RPC/VFS 读写观察；Agent 登记完整 pump/取消/最终落库；lifecycle 根任务、封闭与单次 complete。既有 typed helper 与 scope 满足本矩阵，本轮未新增运行时包装或测试专用生产开关。

限制保留：timeout 分类仍以[第 3 子项证据](2026-09-22-maintenance-r04-timeout.md)为准，14 个 timeout/race、3 个 abort-only 边界分类不等于每个 provider 的真实集成验收；RTF 当前 HTTP 不可达路径是适配器测试，research 可写 race 的合成链不冒充整个聊天/研究端到端流程。DO/VFS 内部失败及领域拒绝的细分见[第 4 子项证据](2026-09-23-maintenance-r04-storage.md)。本轮不增加自主 alarm/后台写者，不假设未来新增写者自动受控。

## 4. 故障敏感性验证

首次新文件执行 08:12:13 遇到 TypeScript `as` 换行语法错误，0 项执行；修正夹具语法后 08:12:49 为 8 passed。该语法错误不是产品行为 RED。

| 临时回退（验证后立即恢复） | 执行时间 | 实际结果（退出 1） | 检出的错误 |
| --- | --- | --- | --- |
| `worker-entry` 转发原生 D1，绕过 facade | 08:13:46 | 2 failed / 6 passed | HTTP/Cron 的 D1 失败被业务 catch 后错误 active=0/DRAINED |
| 解析 R2 put 不传 workScope 观察原始结果 | 08:14:37 | 2 failed / 6 passed | HTTP/Cron 写入后确认丢失被补偿掩盖，错误释放 |
| Knowledge RPC 不传 observer | 08:18:11 | 1 failed / 1 passed / 8 skipped | 远端已落盘但回复丢失，catch 后错误 released=true |

前两项命令：`rtk proxy npm run test:ops:maintenance -- tools/maintenance/cross-storage.test.ts`；第三项加 `-t post-response`。新增 DO/VFS 两项后，08:16:55 十项全部通过；第三次回退已恢复后才运行最终完整 maintenance 247 项。临时生产源码变异不进入候选 diff。

## 5. 最终本地验证

所有命令在本隔离工作树执行。`npm test` 聚合命令的权限审查超时，进程没有启动，因此不记录为通过；改为分别执行其三个脚本。

| 命令（均以 `rtk proxy` 执行） | 实际结果 |
| --- | --- |
| `npm run test:ops:maintenance`（08:21:43） | 12 files / 247 tests passed，13.46s，退出 0（基线 11 files / 237） |
| `npm run test:smoke` | 全脚本退出 0，包含 i18n 和 delivery contract；不以未完整展示的烟测计数代替退出结果 |
| `npm run test:unit`（08:22:03） | 229 files / 2113 tests passed，97.71s，退出 0 |
| `npm run test:worker`（08:26:56） | 47 files / 656 tests passed，19.24s，退出 0；pretest UI 构建通过 |
| `npx --no-install tsc --noEmit` | 退出 0 |
| `npx --no-install tsc --noEmit -p tools/maintenance/tsconfig.json` | 退出 0 |

日志保留已知 AI binding 警告、UI 大 chunk 警告、二进制 body 文本读取警告和删除后读取 VFS 的负向日志；测试 runner 最终均无失败，不把日志描述成零警告。未执行可能装载 secrets 的 `npm run check`，未重跑备份工具测试。

文档更新后 `npm run verify:delivery-status` 为 30/30 passed、退出 0；`git diff --check` 退出 0。只读断言核对 R01–R25 连续顺序、4 关闭/21 开放、R04 五个已完成子项以及 6 份文档的 109 个相对链接，全部通过。最终候选仅为新增测试和本证据、五份状态文档，共 7 个文件；无临时运行时变异残留。

## 6. 关闭边界及下一项

- [x] R04.1 真实生产者/最终落库（`57cca2e`）。
- [x] R04.2 独立取消链（`8c01dc3`）。
- [x] R04.3 timeout/race 分类（`2a367d5`）。
- [x] R04.4 typed R2/DO/VFS 原始失败（`786c8c9`）。
- [x] R04.5 本规格范围跨存储合成故障矩阵及回归留证（本证据同提交）。

据此关闭 R04 父项。[恢复主清单](../2026-09-19-remaining-work-checklist.md)共 **25 项，R01–R04 共 4 项关闭，21 项剩余**；下一项 **R05 控制面授权与重放防护，须独立设计确认，尚未实施**。产品清单仍 30 个开放父项，与恢复主线重叠，不相加，不提升交付四维状态。

R05/R06 独立控制设计、R07 完整组合矩阵、R08 精确候选门禁仍开放。`DRAINED` 仅指登记工作清零，不是 `FROZEN`；不承诺 D1/R2/DO 原子快照、不证明全版本/外部写者停写。生产入口仍 `legacy`、生产维护未启用，本轮不推送、不合并、不部署、不迁移、不执行生产验收。
