# Maintenance Entry Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 顺序完成 R02–R04 的本地真实入口接入；最初仅批准 R02，用户随后要求提交并进入下一步，当前推进 R03，R04 不随本次继续而启动。
**Architecture:** `index.ts` 显式选择 legacy；独立本地 harness 显式选择 guarded。两者共用 `createApp` 和 `AssetService.processDue(3)`，不复制业务路由。维护准入先于所有业务绑定读取和服务构建。
**Tech Stack:** TypeScript、Workers ExecutionContext、Vitest/workerd、本地 D1/R2/SQLite Durable Object。
**Spec:** [已确认规格](../specs/2026-09-19-maintenance-entry-integration-design.md)。用户于 2026-09-20 确认进入 R02；R01 的书面审批与计划前置条件据此完成。

**Status (2026-09-21):** R02 本地实现与验证完成，见[执行证据](../../operations/evidence/2026-09-20-maintenance-entry.md)，现已提交至 `546aab52bc4710064edf082e8cd2ee8f6236cf0d`（前置日历提交 `dfc9590`），并合入 main 的 `df69af8`；原工作区已快进到该基线。R03 前三项已核验：DB/sessionDatabase/Cron 接线红测 5 failed / 2 passed，实现及缓存回归后 maintenance 5 files / 93 tests passed，见[接线证据](../../operations/evidence/2026-09-21-maintenance-d1-wiring.md)。第 4、5 项尚未完成，R03 整体仍开放，R04 尚未开始。本轮变更未提交、未推送、未部署。

## Global Constraints

- 现有隔离工作区 `codex/admin-audit-recovery` 原地执行；保护既有未提交变更，不委派、不 push/deploy。用户后续明确授权将已提交分支合入 main，现已核验合并提交 `df69af8`；后续提交仍须先完成相应验证，不提交未验证实现。继续 R03 前将该工作区快进到合并后的 main，若未提交改动阻碍快进则停止，不丢弃或覆盖。
- 不改 `wrangler.jsonc`、生成 Env、迁移或生产 binding；不读 secrets，不连接生产资源，不备份真实数据。
- harness `remoteBindings: false`，独立配置而非加载生产 Wrangler；本地 D1/R2/DO，AI 和静态资源端口为合成值，意外出站请求失败。
- 每步先观察行为测试正确失败，再实现，再回归。完成标记必须有当前命令结果；R02 不代表 R03/R04 的原始存储失败、生产者或跨存储安全。
- 全部 shell 经 `rtk`；编辑用 `apply_patch`。正常校验响应不改变，维护关闭响应统一 503/no-store/Retry-After。

## R02.1 — 共用入口与本地接线

Files: 新增 `src/worker-entry.ts`；修改 `src/index.ts`、`tools/maintenance/worker.ts`、`env.ts`、`vitest.config.ts`；新增 `tools/maintenance/entry.test.ts`。

- [x] 基线：`npm run test:ops:maintenance`，记录原 28 项。监听权限不足时申请本地 workerd 权限，不改测试绕过。
- [x] 先通过 `SELF.fetch` 写关闭真实入口测试：本地协调器 `beginDrain` 后 `/boards`、`/auth/session`、`/api/auth/providers` 应为 503。目前 harness 404 应使测试失败。
- [x] 添加带判别联合的工厂：

```ts
type EntryOptions = { mode: 'legacy'; dependencies?: AppDependencies }
  | { mode: 'guarded'; dependencies?: AppDependencies;
      maintenance: (env: Env) => MaintenanceClient };
export function createWorkerEntry(options: EntryOptions): Required<Pick<ExportedHandler<Env>, 'fetch' | 'scheduled'>>;
```

  legacy 复用 app；guarded 在 guard 的 handler 内创建请求专用 app。惰性 client 的 acquire 内调用 provider，以便 provider 抛错/缺失也走既有 fail-closed。仅绑定一次 client 并将 complete 交回同一对象，不能用 complete 再创建另一客户端。
- [x] 显式 ExecutionContext adapter：`waitUntil(p) => scope.waitUntil(p)`；`passThroughOnException()` 用原 ctx 接收者；props/exports/cache/access/tracing 通过 getter 读取原 ctx。不 spread ctx。宿主 `ctx.waitUntil(scope.done)` 在业务开始前只注册一次。
- [x] 将旧 Cron 工作体原样提取到共用函数：没有 ORIGINALS 时 skip，有则 await `processDue(3)`。guarded 的所有 ORIGINALS/DB/AI 读取都位于 `guardScheduled` 内。
- [x] `index.ts` 保留 DO 导出，仅将旧 fetch/Cron 替换为 `createWorkerEntry({mode:'legacy'})`。测试 harness 从 index 复用 DO 类，工厂不能反向 import index。
- [x] 本地 harness 映射 SYNTHETIC_DB、SYNTHETIC_ORIGINALS；配置本地 KNOWLEDGE/AGENT_SESSIONS；静态资源和 AI 使用确定的合成端口。控制器只用测试进程的 RPC；不新增 HTTP 控制面。

## R02.2 — 真实业务行为与边界测试

Files: `tools/maintenance/entry.test.ts`（必要时抽取同目录 fixtures）。不 mock createApp、AssetService 或 repository。

- [x] 关闭状态用带计数的业务 Env getter 覆盖 DB/ORIGINALS/AI/KNOWLEDGE/AGENT_SESSIONS/ASSETS 和认证配置，HTTP/Cron 均不得读取；真实 harness 上另验证 503。
- [x] provider 抛错、缺失 client、acquire 拒绝和畸形 permit 均拒绝工作；host waitUntil 注册抛错必须 503、零业务读取，已有许可不得完成。
- [x] 比较 legacy/open guarded 的静态、auth provider 与拒绝响应契约（忽略随机 requestId）；本地迁移后真实 telemetry POST 入库，关闭后同一请求零新增记录。
- [x] 使用真实 AssetService 建 4 个本地文本作业，Cron 一次最多处理 3 个；第二次处理余项。检查真实 D1 状态与 R2 产物。
- [x] 延迟合成 R2 get，Cron 已开始时 beginDrain 应保留 active；放行后处理完整链，才归零。验证无 ORIGINALS 的既有 skip 不读取 DB/AI。
- [x] 用真实登录/session 请求触发 app 的 waitUntil；宿主只登记 scope.done，响应消费和后台完成后许可归零。原始吞错安全不计入本项。
- [x] 运行专项全量、应用/专项 tsc、应用既有回归和文档合同，保存具体命令/结果。确认 index 仍 legacy、生产配置未变；不能用 source-only 测试代替以上行为测试。

## R02.3 — 记录与停点

Files: 新增 `docs/operations/evidence/2026-09-20-maintenance-entry.md`；更新顺序 checklist、规格状态、ROADMAP、delivery ledger 引言。

- [x] 保存红/绿验证、当前 HEAD + 未提交候选的代码摘要、未覆盖范围；保持交付总账四维状态不变。
- [x] 只有上述证据齐全才勾选 R02；恢复检查点为 2 关闭/23 剩余，下一项 R03 尚未执行。本轮停在这里。

## R03 — 后台与原始 D1 生命周期（后续独立执行）

Files: 新增 `src/maintenance/d1.ts`、`tools/maintenance/d1.test.ts`；修改 `src/maintenance/lifecycle.ts`、`src/worker-entry.ts`、`src/app.ts`，以及 `src/members/service.ts`、`src/identity/session.ts`、`src/identity/automation.ts` 和审计列出的并行服务边界。

### 执行记录与当前停点（2026-09-20 至 2026-09-21）

- 合并已核验：用户完成 main 合并提交 `df69af8`（父提交 `c2d9f63`、`546aab5`），main 工作区干净。代理读取 `/tmp/cf-admin-postmerge-20260920.log`，合并后 smoke 56/56、i18n 13/13、交付合同 30/30、unit 2113/2113、Worker 656/656、maintenance 45/45、备份 21/21 均通过。45 项仅对应已合入版本，不包含下列未提交的 4 项 lifecycle 测试或 D1 测试。
- 原工作区 5 个未提交文件仍保留。代理尝试 `git merge --ff-only main` 因审批超时未启动；随后用户终端成功快进 `546aab5..df69af8`，输出已核验。不把合并后的回归当作 R03 完成证据。
- 用户回传 maintenance 基线：3 files / 45 tests passed，12:50:06 开始，耗时 2.18s；这是用户终端结果，不是本轮代理执行结果。
- 首项已完成：`tools/maintenance/lifecycle.test.ts` 新增 4 项行为测试，覆盖开放期 assertOpen、completion RPC 返回前封闭、markUncertain 保留原业务响应、标记后仍等待已有子任务。既有原始拒绝被捕获后保留许可的测试保持不变。
- RED 已核验：用户终端 13:08:39 运行的完整日志 `/tmp/cf-r03-lifecycle-red-20260920.log` 已由代理读取；22 项中原有 18 项通过，新增 4 项失败。封闭检查报 `saved.assertOpen is not a function`；其余三项在缺失接口调用后被 guard 转为 500，而预期为 200/409/200。与当前缺失实现吻合，不是导入或启动错误。
- `src/maintenance/lifecycle.ts` 已补最小实现：新增 assertOpen、markUncertain 和固定原因码类型；标记不改变任务计数，已有子任务仍被等待，计数归零后不释放不确定许可；封闭后拒绝标记，不复活作用域。尚未修改真实业务接线。
- 当前验证：`npm run typecheck`、`npx --no-install tsc --noEmit --project tools/maintenance/tsconfig.json` 和 `git diff --check` 均 exit 0。直接调用工作区 `./node_modules/.bin/tsc` 因该路径不存在失败，随后通过已有 npm 依赖解析执行专项 tsc，未安装新依赖。
- GREEN 已核验：用户终端 18:42:21 运行的完整日志 `/tmp/cf-r03-lifecycle-green-20260920.log` 已由代理读取；3 files / 49 tests passed，耗时 2.26s，包含新增 4 项 lifecycle 测试。该结果对应新增 D1 测试之前的 maintenance 套件，不代表 D1 facade 已完成。
- 第二项 RED 已核验：新增 `tools/maintenance/d1.test.ts`，覆盖本地真实 D1 正常语义、原始同步/异步失败、失败/畸形结果、未 await 查询追踪、batch 归属、封闭后零原生调用和不支持接口。用户回传 22:30:11 的完整终端输出（日志路径 `/tmp/cf-r03-d1-red-20260920.log`）：36 项中 34 failed / 2 passed，耗时 957ms。两个正常数据库语义测试通过，其余失败对应原始 DB 占位缺少追踪和拒绝保护，不是启动或导入失败。
- `src/maintenance/d1.ts` 已替换为显式包装实现：原生句柄保存在私有 WeakMap；prepare/bind 保持惰性；执行前登记 scope，保留返回值和错误；run/all/batch 的失败或畸形结果标记不确定；batch 拒绝外来句柄；封闭后全部接口拒绝，exec/withSession/dump 明确不支持。尚未接入真实业务入口。
- 实现后 `npm run typecheck` 与 `npx --no-install tsc --noEmit --project tools/maintenance/tsconfig.json` 均 exit 0。代理尝试运行 maintenance 全套测试时自动权限审批超时，进程未启动；随后用户终端执行，代理已读取 `/tmp/cf-r03-d1-green-20260920.log`：22:40:13 开始，耗时 2.68s，4 files / 85 tests passed，D1 的 36 项全部通过。此结果不包含之后新增的接线测试。
- 第三项 RED 已核验：代理读取用户执行的 `/tmp/cf-r03-entry-d1-red-20260920.log`，07:37:31 开始，耗时 1.31s，7 项中 5 failed / 2 passed。五项失败均为原始 D1 失败被业务映射或补偿后，预期 active=1/DRAINING，实际 active=0/DRAINED；HTTP 状态、session 响应和 Cron 补偿断言已通过。连续请求与关闭准入前不读取 sessionDatabase 两项通过。独立 harness 的 `SYNTHETIC_SESSION_DB` 仅为本地异库覆盖测试，生产配置和生成 Env 未修改。
- 第三项实现：guard handler 内为每次 HTTP/Cron 创建独立 WeakMap；实际 DB 和 sessionDatabase 覆盖按原生数据库身份共用 facade。惰性 getter 不提前读取业务绑定，原 env/dependencies 不被修改，legacy 分支保持原行为；未修改 `src/app.ts`。
- 第三项 GREEN：初次完整 maintenance 5 files / 92 tests passed。新增第八项真实成员状态变更 + 审计原子 batch 测试后，专项通过；临时禁用缓存时该测试失败（预期 200、实际 500），恢复缓存后完整 maintenance 5 files / 93 tests passed（07:44:32，4.81s）。反向验证改动已撤回。
- 当前勾选 R03 前三子项；恢复总计仍为 2 关闭 / 23 剩余。下一项为成员/session/nonce catch 前原始任务及并行 continuation 登记；不以当前 D1 接线代替完整后台链证明。验证命令、结果与边界见接线证据。当前变更未提交，R03 整体未完成。

- [x] 先红测 `assertOpen`、`markUncertain`（固定码），吞错原始拒绝仍保留许可、sealed 后零原生调用；扩展 WorkScope，不允许复活。
- [x] 先测试后添加 D1/statement facade：prepare/bind 惰性，first/run/all/raw 重载、batch 同 facade 归属检查；exec/withSession/dump 明确拒绝，成功 null/空 rows 不误报。
- [x] guard handler 内包装实际 DB 和 sessionDatabase 覆盖；同请求同 DB 复用 facade，跨请求不复用。失败 `success:false` 保留原返回同时标记不确定。
- [ ] 在成员/session/nonce 自身 catch 前登记 raw Promise，业务响应保留；并行服务每分支持有完整 continuation，Promise.all 首次拒绝不释放兄弟。
- [ ] 本地 D1 集成验证失败被映射成正常响应仍保留、正常 400/403/404 可完成、嵌套 waitUntil 与迟到调用；全量回归留证后才勾选 R03。

## R04 — 流、取消、超时和跨存储（后续独立执行）

Files: `src/agent/service.ts` 及审计定位的流/timeout 边界、`src/assets/service.ts`、知识发布/VFS/RPC typed 边界、`src/maintenance/lifecycle.ts`，新增 `tools/maintenance/stream.test.ts` / `storage.test.ts`。

- [ ] 对真实 agent pump 写可控迟到测试，EOF 前/后最终落库完成才能释放；启动前登记整个生产者 factory，controller.error 不吞原始失败。
- [ ] cancel 链独立登记且等待 reader.cancel，不用 detached void，不让生产者互等；消费者取消保留许可，覆盖不消费和迟到生产者。
- [ ] 分类所有 race：纯 AI 尾部无写 continuation 可结束；有可写 continuation 的原始任务完整登记。可控迟到结果不得启动 success 写入。
- [ ] typed R2/DO/VFS helper 在补偿/转换 catch 前观察；原始失败保留，明确领域拒绝保持业务语义。不使用通用 Env proxy，不承诺跨存储原子性。
- [ ] 真实合成资源故障回归+证据后才勾选 R04；R05/R06/R07 仍独立，不借本阶段开放生产。
