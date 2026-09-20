# R02 — 真实 HTTP/Cron 本地入口接线证据

日期：2026-09-20（Asia/Shanghai）。分支：`codex/admin-audit-recovery`。

## 授权与候选

用户确认“进入 R02”；[书面规格](../../superpowers/specs/2026-09-19-maintenance-entry-integration-design.md)获准，[实施计划](../../superpowers/plans/2026-09-20-maintenance-entry-integration.md)形成后先关闭 R01，再实施 R02。顺序见[恢复 checklist](../2026-09-19-remaining-work-checklist.md)。本证据仅关闭 R02，不关闭 R03/R04 或 R07/R08。

工作区 `.worktrees/admin-audit-recovery`；HEAD `cef7625be5432b8925ded08fb483e8f4edb73529` 加未提交候选。原有迁移/备份/维护协调器等脏工作树保留，未视作本轮新实现。

本轮运行时代码及测试候选为以下 7 个文件，按 JavaScript 字符串排序后逐项 SHA-256 输入 `path + NUL + file bytes + NUL`，聚合摘要：`df8f7fc557b188118df9f357b05cb798dea564e3aa7c5f679c105e7a023b4f0f`。

- `src/index.ts`
- `src/worker-entry.ts`
- `tools/maintenance/entry.test.ts`
- `tools/maintenance/env.ts`
- `tools/maintenance/resources.ts`
- `tools/maintenance/vitest.config.ts`
- `tools/maintenance/worker.ts`

该摘要只定位上述 R02 改动面，不是全仓库构建摘要。R01 历史审计指纹保留，不冒充当前源码指纹。

## 实现与行为证据

- 共用 `createWorkerEntry`：index 明确 legacy，保持 KnowledgeBase/AgentSession 导出；guarded 只由独立 harness 显式启用。工厂不反向导入 index。
- HTTP 在维护准入和宿主生命周期登记完成之后才创建请求 app；所有认证/API/静态路径均受同一入口保护。关闭为 503，含 no-store/Retry-After；绑定 getter 计数证明关闭时不读取业务 DB/R2/AI/DO/ASSETS/认证配置。
- provider 抛错、缺失 client、缺失 acquire/complete、acquire 拒绝、错 id/非法 epoch 均在业务前拒绝。宿主 waitUntil 注册失败保留已获许可，不执行业务、无补偿 complete 或自动重试。
- 显式 ExecutionContext 转发：app 的 waitUntil 进入请求 scope，原 ctx 只登记一次 scope.done；非 waitUntil 能力按原接收者访问，未 spread 原生 ctx。并发两请求测试证明作用域与完成客户端独立。
- 真实 createApp + 本地迁移 D1：telemetry POST 202 实际生成事件，关闸后二次 POST 503、记录数不增；legacy/open guarded 的静态、provider、session 拒绝、logout 方法与输入校验契约一致。带真实 session 的请求返回成员，既有 session 后台清理实际删除过期记录；响应消费和后台完成后归零。
- Cron 原工作体共用并保持 `processDue(3)`、无 ORIGINALS 时 skip。真实 AssetService/repository 配本地 D1/R2：4 项文本作业首轮完成 3、第二轮完成余项，parsed 对象存在；关闭后新作业保持 queued。延迟 R2 get 时 beginDrain 保持 active=1/DRAINING，完整解析落库后才 DRAINED。
- harness 不加载生产 Wrangler，`remoteBindings:false`；独立本地 D1/R2/三个 DO。所有 AI 入口是会拒绝意外调用的合成端口，静态资源为明确的合成首页；意外公开 fetch 由 outboundService 拒绝。Cron 使用已安装库的 `createScheduledController` 调用本地 Worker 默认 scheduled（不是模拟业务工作体，也不是生产定时调度验收）。

## 红灯、修正与最终验证

命令均通过 `rtk proxy` 执行。workerd 需要回环监听：首次 sandbox `EPERM 127.0.0.1` 后获准运行；一次权限审核超时重试成功。没有改变测试以绕过沙箱。

| 检查 | 结果 |
| --- | --- |
| 修改前 `npm run test:ops:maintenance` | 28/28，退出 0 |
| 第一条真实入口测试 | 预期红灯：`/boards` 实际 404、应 503，退出 1；接入后转绿 |
| 缺失 complete 边界测试 | 预期红灯：实际进入业务返回 500、应 503；客户端方法检查后转绿 |
| `npm run test:ops:maintenance` 最终 | 3 文件，45/45（原 28 + 新增 17），退出 0 |
| `npm test` | 完整 smoke/unit/worker 流程退出 0；smoke 51/51、Worker 41 文件 636/636，含前置 UI 构建 |
| `npm run typecheck` | 退出 0 |
| `npx tsc --noEmit --project tools/maintenance/tsconfig.json` | 退出 0 |
| `npm run verify:delivery-status` | 28/28，退出 0 |
| `git diff --check` | 退出 0 |
| 只读候选/文档核对 | 25 项连续、仅 R01/R02 关闭、23 项开放；6 份文档 76 个相对链接有效；7 文件 SHA-256 与上文一致；计划 R03/R04 全部未勾选 |
| `git diff --exit-code -- wrangler.jsonc worker-configuration.d.ts` | 退出 0，生产配置和生成 Env 未变 |

调试记录：初稿测试把 session 写成 `/auth/session`（实际 `/api/session`），比较错误响应未去除嵌套随机 requestId，并误用 SELF.scheduled（已安装 SELF 类型只支持 fetch/connect）。已依据真实路由和安装类型修正；没有增加生产路由。一次完整专项回归发现合成 ASSETS 对所有请求返回 200，使“无 HTTP 控制面”原测试失败；夹具收紧为仅 GET 首页 200，未知路径/POST 404，原测试保持不变后全量通过。

协调器故障注入会打印 ACTIVE_WORK/STALE_CONTROL 等预期拒绝日志，最终无 Vitest 未处理错误。标准应用测试仍有既有 Wrangler AI binding 提示；不能把标准测试的配置提示当成新的生产连接证据。本轮新增的维护 harness 没有远程 AI binding，公共出站被拒绝。

未运行完整 `npm run build`/R08 发布候选门禁；未做浏览器、物理设备或生产验收。备份工具未修改，本轮不以旧 21 项记录冒充重跑。

## 尚未证明与停点

R02 的正常路径归零不证明被 catch 掩盖的原始失败安全。R03 尚未实现 D1 facade、sessionDatabase 覆盖包装、原始后台失败观察及完整并行分支追踪；R04 尚未实现 agent 生产者/取消链、超时分类和跨存储原始失败观察。现有 response-body 追踪也不能代替这些工作。

控制面鉴权、容量/孤儿处理、外部写者/旧版本约束另在 R05/R06/R09。`DRAINED` 仍只证明已登记工作归零，不是生产 FROZEN；不得启用生产维护。

未新增生产 binding、未改 wrangler/generated Env、未读 secrets、未做真实数据导出/恢复/迁移、未 commit/merge/push/deploy。产品总账四维状态保持不变。恢复主线完成 R01/R02，23 项剩余，下一项 R03 尚未开始。
