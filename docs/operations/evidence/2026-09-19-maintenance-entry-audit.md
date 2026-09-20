# 真实入口维护接入：本地静态审计

日期：2026-09-19。范围：`codex/admin-audit-recovery` 的当前未提交候选；基线 HEAD 为 `cef7625be5432b8925ded08fb483e8f4edb73529`，不是部署版本证明。

结论：现有维护 harness 尚未调用真实应用；真实接入需要入口准入、原始存储操作观察和完整异步生命周期三个层次。仅包装 HTTP 返回值或现有 `waitUntil` 的最终 Promise 不够。本文是 R01 的本地源码审计记录，不是 R07 动态覆盖或 R09 全部生产写者证明。

## 1. 可复查范围

- 检索 `src` 的 207 个 TypeScript 文件，检索入口、`waitUntil`、`Promise.race/all`、定时器、流构造、取消、D1 类型/绑定和 DO 存储调用；对下表调用链做定向阅读。检索命中不是逐文件完整审计或形式化证明。
- `D1Database|D1PreparedStatement|env\.DB|\.DB\.` 命中 42 个文件：应用/入口、session/automation、分页辅助及各领域 repository。请求构造的主要数据库来源是 `env.DB`；`AppDependencies.sessionDatabase` 是必须同时追踪的覆盖入口。
- 读取当前 `worker-configuration.d.ts` 的 D1/ExecutionContext 声明以及独立 harness 配置；不能用宿主类型断言代替实际 Workerd 测试。
- 源码快照摘要：`d9b63ead603816126ed3d25372a0e035a179064f23117e5b2a3e8119a0a31afd`。算法为 SHA-256，按 JS 默认排序排列全部 `src/**/*.ts`、`worker-configuration.d.ts`、`wrangler.jsonc`；依次加入 UTF-8 相对路径、NUL、文件原字节、NUL。它只标识本次审计输入，不覆盖依赖、迁移、全部工作树或部署产物。
- 对官方运行时文档的在线读取未获得可用正文；本次不据此声称核实最新平台限制，也不新增时长、额度、会话或事务保证。具体接口以当前候选声明为设计输入，后续以本地运行时测试验证。

## 2. 入口与生命周期发现

| 源码位置 | 观察到的行为 | 接入要求 / 边界 |
| --- | --- | --- |
| `src/index.ts` 默认导出 | `fetch: app.fetch`；scheduled 创建 AssetService 并 `processDue(3)`，无 ORIGINALS 时跳过 | 准入在服务构建与绑定访问前；Cron 与 HTTP 共用入口工厂。当前尚未接入 |
| `src/app.ts` createApp/createRequestServices | /auth 与 API 构建服务；鉴权可能写数据库；内部 catch 转换响应；静态资源也走此入口 | 不能按 HTTP 方法或响应码决定许可完成；关闭时所有业务 HTTP 均 503 |
| `src/members/service.ts` touchLastSeen、`src/identity/session.ts`、`src/identity/automation.ts` cleanup | 三处把原始 Promise catch 成功后再交给 waitUntil | 在 catch 前注册原始工作，保留现有日志和响应；失败必须留在维护状态里 |
| `src/members/repository.ts` insert/insertWithAudit 等 | 数据库异常可转换为领域冲突 | 数据库调用层观察原始拒绝；不能由最终 409 推断底层成功或安全完成 |
| `src/publication/service.ts` recoverPending、`src/publication/repository.ts` 索引恢复 | 失败可归入结果数组、可恢复状态或被 catch | 成功 HTTP/批处理结果并不表示每项底层操作成功；状态写入本身也可能失败 |
| `src/routes/agent.ts` withPersistedAssistant | ReadableStream.start 内主动拉取并落库；取消时 `void activeReader?.cancel(reason)`；catch 转成流错误 | 显式登记生产者、取消链及最终 completeTurn/terminateTurn；响应 EOF 不是唯一完成依据 |
| `src/agent/tool-runner.ts` | 工具先校验身份、写 D1 审计，再 await 执行；包含草稿写工具 | Agent 不是天然只读；沿用请求作用域，禁止独立不受控调用 |
| `src/assets/service.ts` processRecord/processDue | D1 claim → R2 读取 → 解析 → R2 put → D1 完成；失败时清理/markFailed；逐项 catch | 追踪完整链；R2 失败被 catch 也不能消除不确定性；不声称 D1/R2 原子事务 |
| `src/knowledge/workspace-repository.ts` | read/list 也会 ensureWorkspaceDirectories；getWorkspace 可 recoverWorkspace | “读取”也会写 DO/VFS；观察 RPC/工作区操作，不靠 GET/POST 判断 |
| `src/knowledge/published-content.ts` 与 `src/index.ts` KnowledgeBase | 原始 RPC 结果转换为 AppError；服务内 await 文件操作并 finally dispose | 在错误转换前观察原始 RPC；已返回的领域拒绝与传输结果不明分开；等待完整工作区操作 |
| `src/agent/session-do.ts` | 自身 SQLite 存储维护会话/消息/turn，read 更新 last_seen | 属于 DO 存储，不是 D1；本次检索未发现该类直接使用 DB 或 alarm，不代表外部调用者已全部覆盖 |
| `tools/maintenance/worker.ts` | 目前仅导出协调器，fetch 固定 404 | 既有 28 项专项测试不能充当真实应用接线验收 |

## 3. 并发与超时分类

### 并发

`Promise.all` 命中认证摘要、来源摘要、library 引用读取、Today 聚合、WorkbenchReview 聚合、publication 查询。需区分纯摘要与有数据库/工作区能力的分支：

- `WorkbenchReviewService.get` 聚合成功后还会 `upsert`，不能把整个 GET 路径称为纯读。
- library 读取可能进入工作区；一个分支先拒绝时，其他分支仍须由作用域独立持有，直到各自结束。
- 有 I/O 能力的并行分支须各自登记完整 Promise；仅登记已提前拒绝的 `Promise.all` 不足。纯 crypto/解析且无存储能力的分支无需伪装成 D1 写者。
- 本次 `src` 检索未发现 `setInterval`、`queueMicrotask` 或 `forEach(async ...)`；该静态结果不覆盖依赖内部或未来修改。

### 超时

- `src/ai` 的 timeline/comparison/faq/brief/mindmap/flashcard/quiz/cited-answer/research-report/source-summary：调用点把 AI provider Promise 交给 withTimeout。尤其 research report 的 saveReport 在 race 成功之后，而非 provider Promise 自带的写入 continuation。超时不等于 provider 已停止，但不能据此宣称一定有迟到 D1 写入。
- `src/assets/service.ts` 的 race 包裹 parseSource/parseRichAsset；成功后的 R2 put/D1 markSucceeded 在 race 外；失败分支负责清理和 markFailed。`ai-markdown.ts`、`ai-image.ts` 内另有 provider 超时。
- `src/assets/url-snapshot.ts`、GitHub/WeChat OAuth 的定时器用于 abort 请求，不是定时数据库任务；仍要等待调用方的失败处理链结束。
- R04 必须以迟到的合成 provider 证明不会触发后续写入；若以后把具有写入 continuation 的函数放进 race，则必须跟踪原始完整工作，不能沿用“纯 provider 尾部”的豁免。

## 4. 数据库接口与失败判定

当前候选声明包含数据库 prepare/batch/exec/withSession/dump，以及 statement bind/first/run/all/raw。应用已有执行路径主要用 prepare、bind、first、run、all、batch；DO 的 `storage.sql.exec` 和正则的 `.exec` 不属于 D1 API。

建议 guarded 模式提供请求级显式 D1 适配器，覆盖 statement 执行和 batch，在业务 catch 前保留结果。所有语句执行均观察，不以 SQL 文本或 SELECT 前缀判读写。正常领域拒绝无需永久保留许可，但原始 D1 拒绝即使被映射为冲突，当前仍采取保守保留；R06 未完成前不能自动按错误字符串清除。

`sessionDatabase` 覆盖也必须包装；statement 不能跨请求/数据库混入 batch；封闭作用域之后不能再启动查询。未支持接口在产生原生副作用前明确拒绝，不允许透传裸绑定。详细约束见接入规格。

## 5. 明确未覆盖项

- 本轮没有修改运行时代码、执行故障矩阵或重新运行应用/维护测试；既有测试仅引用既有证据。
- 没有连接生产、读取真实数据或凭证，没有查云端发布版本、所有路由、其他 Worker、外部 API token 的实际使用者。
- 仓库存在迁移/部署命令与备份工具；它们不是应用内许可系统自动控制的写者。仓库无 CI 文件不能推出真实发布平台。
- DO 自身状态、VFS、R2、AI provider、旧部署和外部写者不由 D1 快照自动获得一致性。`DRAINED` 仍只描述该协调器已登记工作，不升级为生产 `FROZEN`。
- 控制面鉴权、容量/孤儿处理分属 R05/R06；发布链与全部生产写者验证属于 R09；既有 Agent 上游失败后的 turn 业务恢复问题不在此文中默认为已修复。

后续：[接入规格](../../superpowers/specs/2026-09-19-maintenance-entry-integration-design.md) → 用户审阅 → 实施计划 → 按 R02/R03/R04 顺序实现；[总清单](../2026-09-19-remaining-work-checklist.md)仍以 R01 为当前游标。
