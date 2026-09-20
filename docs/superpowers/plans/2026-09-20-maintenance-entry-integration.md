# Maintenance Entry Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 顺序完成 R02–R04 的本地真实入口接入；本轮用户仅批准执行 R02。
**Architecture:** `index.ts` 显式选择 legacy；独立本地 harness 显式选择 guarded。两者共用 `createApp` 和 `AssetService.processDue(3)`，不复制业务路由。维护准入先于所有业务绑定读取和服务构建。
**Tech Stack:** TypeScript、Workers ExecutionContext、Vitest/workerd、本地 D1/R2/SQLite Durable Object。
**Spec:** [已确认规格](../specs/2026-09-19-maintenance-entry-integration-design.md)。用户于 2026-09-20 确认进入 R02；R01 的书面审批与计划前置条件据此完成。

**Status (2026-09-20):** R02 与 R03 本地实现和验证完成，分别见[入口证据](../../operations/evidence/2026-09-20-maintenance-entry.md)和[D1 生命周期证据](../../operations/evidence/2026-09-20-maintenance-d1-lifecycle.md)。R03 已提交为 `95bd921`；R04 已完成流/存储最小切片，仍未关闭，未 push、未部署。

## Global Constraints

- 现有隔离工作区 `codex/admin-audit-recovery` 原地执行；保护既有未提交变更，不 merge/push/deploy。R03 候选已形成本地提交，未进入远端。
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
- [x] 只有上述证据齐全才勾选 R02；R02 关闭时恢复检查点为 2 关闭/23 剩余，后续 R03 已另行完成并有独立证据。

## R03 — 后台与原始 D1 生命周期

Files: 新增 `src/maintenance/d1.ts`、`tools/maintenance/d1.test.ts`；修改 `src/maintenance/lifecycle.ts`、`src/worker-entry.ts`、`src/app.ts`，以及 `src/members/service.ts`、`src/identity/session.ts`、`src/identity/automation.ts` 和审计列出的并行服务边界。

- [x] 先红测 `assertOpen`、`markUncertain`（固定码），吞错原始拒绝仍保留许可、sealed 后零原生调用；扩展 WorkScope，不允许复活。
- [x] 先测试后添加 D1/statement facade：prepare/bind 惰性，first/run/all/raw 重载、batch 同 facade 归属检查；exec/withSession/dump 明确拒绝，成功 null/空 rows 不误报。
- [x] guard handler 内包装实际 DB 和 sessionDatabase 覆盖；同请求同 DB 复用 facade，跨请求不复用。失败 `success:false` 保留原返回同时标记不确定。
- [x] 在成员/session/nonce 自身 catch 前登记 raw Promise，业务响应保留；并行服务每分支持有完整 continuation，Promise.all 首次拒绝不释放兄弟。
- [x] 本地 D1 集成验证失败被映射成正常响应仍保留、正常 400/403/404 可完成、嵌套 waitUntil 与迟到调用；全量回归和证据见[D1 生命周期证据](../../operations/evidence/2026-09-20-maintenance-d1-lifecycle.md)。

## R04 — 流、取消、超时和跨存储（后续独立执行）

Files: `src/agent/service.ts` 及审计定位的流/timeout 边界、`src/assets/service.ts`、知识发布/VFS/RPC typed 边界、`src/maintenance/lifecycle.ts`，新增 `tools/maintenance/stream.test.ts` / `storage.test.ts`。

- [ ] 对真实 agent pump 写可控迟到测试，EOF 前/后最终落库完成才能释放；启动前登记整个生产者 factory，controller.error 不吞原始失败。
- [ ] cancel 链独立登记且等待 reader.cancel，不用 detached void，不让生产者互等；消费者取消保留许可，覆盖不消费和迟到生产者。
- [ ] 分类所有 race：纯 AI 尾部无写 continuation 可结束；有可写 continuation 的原始任务完整登记。可控迟到结果不得启动 success 写入。
- [ ] typed R2/DO/VFS helper 在补偿/转换 catch 前观察；原始失败保留，明确领域拒绝保持业务语义。不使用通用 Env proxy，不承诺跨存储原子性。
- [ ] 真实合成资源故障回归+证据后才勾选 R04；R05/R06/R07 仍独立，不借本阶段开放生产。

当前进度（2026-09-20）：已完成 Agent stream pump 的 scope 登记/取消等待和 Asset sweep 失败回传最小切片，见[进行中证据](../../operations/evidence/2026-09-20-maintenance-stream-storage.md)。上述切片不关闭 R04；不消费流、上游 error、迟到 producer 及 typed R2/DO/VFS/RPC 边界仍待完成。
