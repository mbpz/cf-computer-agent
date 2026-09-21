# 真实 Worker 入口的本地维护接入设计

日期：2026-09-19。分支：`codex/admin-audit-recovery`。

状态：用户于 2026-09-20 确认进入 R02，书面规格获准；已形成[实施计划](../plans/2026-09-20-maintenance-entry-integration.md)。R02 已完成[本地实现验证](../../operations/evidence/2026-09-20-maintenance-entry.md)，2026-09-21 R03 五个子项已[本地实现验证](../../operations/evidence/2026-09-21-maintenance-r03-completion.md)，R04 尚未实施；不是已部署或完整维护安全声明。用户后续已授权提交，精确版本见计划及 Git 记录。

依据：[入口审计](../../operations/evidence/2026-09-19-maintenance-entry-audit.md)、[已有维护设计](../../operations/d1-backup-maintenance-design.md)、[R01–R25 执行清单](../../operations/2026-09-19-remaining-work-checklist.md)。

## 1. 目标、范围和完成边界

本规格只覆盖 R02–R04 的一个本地接入子项目：让既有协调器/生命周期适配器保护真实 createApp 和 Cron 工作链，并让独立 harness 使用合成资源验证。R01 在书面规格审阅和实施计划形成后才能关闭。

不新增或启用生产维护 binding，不新增生产控制路由，不运行真实备份/迁移，不提交、合并、推送或部署。不改变认证/业务权限、分页、幂等、迁移 SQL 或已有业务错误的公开语义。维护异常日志只允许请求/许可标识和固定原因码，不包含 SQL、参数、cookie、令牌或私有正文。

本地接入不能证明全写者冻结，也不能解决协调器容量、孤儿许可和跨存储一致性。R05/R06 独立设计，R07 完整组合故障矩阵、R08 候选门禁仍需顺序执行。

## 2. 决策与替代方案

采用共用入口工厂，生产保留 legacy 模式，独立 harness 显式 guarded 模式。优点是验证真实接线且不触及生产配置；代价是必须证明两种模式没有业务分叉和测试替身绕过。

不采用逐路由手动准入：容易遗漏鉴权隐式写、GET 副作用、Cron。暂不新增生产 binding/控制入口：会提前进入未批准的控制面和发布范围。

审计后新增的具体设计是**请求级存储操作观察器**。只观察 HTTP 状态码会漏掉 repository/service 内部捕获的原始失败；把所有 400/403 都标为不确定又会制造大量孤儿许可。该观察器与后台/流生命周期追踪组合，不能单独当成完整排空证明。

## 3. 组件与接线

| 组件 | 单一职责与契约 |
| --- | --- |
| 新 `src/worker-entry.ts` | createWorkerEntry 显式选择 legacy/guarded，共用 HTTP 与资产 Cron 工作体；导入 createApp/资产服务，不反向导入 index |
| `src/index.ts` | 保留 KnowledgeBase/AgentSession 导出；默认使用 legacy 工厂，不出现生产维护 binding 或按环境猜测的自动启用 |
| `src/maintenance/lifecycle.ts` | 每次准入一个作用域；root、后台、并行分支、生产者、响应流共同计数；封闭之后拒绝新工作 |
| 新 `src/maintenance/d1.ts` | 每请求 D1 facade，在业务 catch 前观察原始调用；不解析 SQL，不负责业务鉴权或重试 |
| `src/app.ts` 及现有存储调用边界 | 显式传入可选工作作用域；有作用域时观察原始任务，无作用域时保持 legacy 行为；不能保存为模块级可变状态 |
| `tools/maintenance/worker.ts` 和专项测试 | 调用同一个 guarded 入口工厂；仅本地协调器、合成 D1/DO/R2/AI；禁止远程绑定 |

### HTTP

guarded 入口先获取许可，并把作用域完成 Promise 注册到真实宿主 ctx.waitUntil；只有成功后才构建请求级服务和调用真实 app。缺失/失联/无效许可或宿主注册失败均拒绝，HTTP 503，应用体不执行；宿主注册失败且许可可能存在时不补偿清零。

请求级 app 使用该作用域和包装后的 env.DB；若传入 sessionDatabase 覆盖，先确定实际数据库再包装，不能保留裸覆盖绕行。可在准入后创建请求专用 createApp 实例，legacy 模式保持原有复用行为。请求与请求之间不共享作用域或带作用域的 services。

传给 app 的 ExecutionContext 适配器必须把 waitUntil 交给作用域，并按原接收者绑定转发实际使用的宿主能力；禁止以对象 spread 假设复制原型方法。宿主 ctx.waitUntil(scope.done) 由入口直接注册，不能递归进入作用域的 waitUntil。

对所有业务 HTTP 路径准入，包括 /auth、API、静态资源；关闭时统一 503、不查询登录态、不创建服务。此处不新增健康检查或维护控制豁免。legacy/guarded 的开放正常响应契约保持一致。

### Cron

同一工厂抽取当前 processDue(3) 工作体。guarded 模式在 ORIGINALS 检查、数据库和服务构建前准入；关闭时跳过工作体、零 D1/R2/AI 调用。已开始 Cron 持有许可至完整处理链结束；逐项 catch 不消除原始存储失败。不增加业务重试、并发调度或新 Cron。

## 4. 作用域与完成判定

- 延用已有 root 计数、嵌套工作计数和封闭机制；新工作必须在执行 factory 前登记。每个 complete 只对应原许可 id/epoch，不增设超时释放或 RPC 自动重试。
- 增加显式不确定性标记能力（固定原因码），供 app 内部的未知异常和原始存储结果异常使用；它只保留许可，不改变公开响应。计数归零仍不能消除该标记。
- 正常校验、权限拒绝、未找到及已知业务冲突，若没有原始存储失败或未完成工作，允许按正常生命周期结束；不能把所有 AppError 或所有非 2xx 一概标为不确定。
- 原始 D1/存储传输拒绝、异常结果、未解释的内部异常、流错误/取消和工作结果不明，保守保留许可。若 D1 约束异常被映射为业务冲突，本阶段也不按字符串放行；这会牺牲可用性，R06 的人工处置设计完成前不得启用生产。
- app 吞掉未知异常转成响应时，须先标记作用域；外层 guard 不能仅凭收到 Response 判断成功。已知纯 provider 超时遵循第 7 节，不冒充 D1 未确认写入。
- 永不“等待超时后清 active”；complete 响应丢失也不自动重试或补偿。诊断输出区分 WORK_UNCERTAIN 与 COMPLETION_UNCONFIRMED。

作用域内部接口除现有 run/waitUntil 外，需提供 `assertOpen(): void`（同步确认未封闭，供 prepare/bind 等使用）和 `markUncertain(reason): void`（固定枚举原因，不接收原始敏感异常）。这两个方法不增加或复活许可；封闭后的调用不能启动副作用。若发现迟到调用，记录协议违规并使测试失败，不把它当成支持的使用方式。

宿主 waitUntil 只是运行时生命周期登记，不是持久化任务队列或无限执行承诺。宿主终止、失联、注册后工作未真正结束时，协调器已有许可继续保留；不能因本地 Promise 不再运行而推断安全排空。

## 5. D1 facade 契约（R03）

采用显式数据库/statement facade，不对平台对象做任意通用 Proxy，不修改原生对象，不改变原调用的 this。

1. 支持 prepare、bind、first 的两种重载、run、all、raw 的两种重载及数据库 batch。每个执行方法在原生调用前登记；同步抛错与 Promise 拒绝均被观察，原值/拒绝仍交给业务调用方。返回值不附带维护字段。
2. prepare/bind 保持惰性；statement 只持有内部原生句柄和作用域归属，不向业务暴露裸数据库/句柄。封闭后的 prepare/bind/执行全部拒绝，原生方法调用次数为零。
3. batch 只接受来自同一 facade 的 statement；先验证全部归属，再一次性调用原生 batch，不拆分、不重复执行、不改变事务语义。其他请求、其他数据库或裸 statement 均在原生调用前拒绝。
4. 不猜测读写：first/all/raw 也进入追踪。所有原始执行拒绝保守标记；成功返回 null、零 changes、空 rows 本身不是失败。防御性检测运行时不符合声明的失败结果（例如 success:false），标记不确定但不以强制改写业务返回掩盖原证据。
5. 当前应用不需要的 exec、withSession、dump 在 guarded facade 上明确拒绝，不能默默透传。先测试确认无真实接线调用依赖这些方法；后续新增使用需扩展接口和测试，不以类型强转绕过。
6. env.DB 和 sessionDatabase 都应用同一规则；同一请求重复使用相同原生 DB 时复用同一 facade，避免 audit/batch statement 错判。不能跨请求复用。
7. 观察查询 Promise 只能证明查询本身；它不能替代业务 continuation、并行分支和流生产者的独立登记。即使晚到代码被 facade 拒绝，仍应把逃逸注册缺陷留作失败测试，不能声称设计允许 detached 写者。

## 6. 后台、并行与流（R03/R04）

成员 last_seen、session cleanup、automation nonce cleanup 在自身 catch 前登记原始 Promise；原有吞错日志/响应行为保留，不能只登记最终成功 Promise。选用 scope.run(factory) 时登记发生在查询启动前。无作用域时继续使用原宿主 waitUntil 语义。

嵌套 waitUntil 必须在父任务结束前登记；父任务持有计数期间允许追加子任务，完成后不能重新打开作用域。对 library/Today/WorkbenchReview/publication 等 I/O 并行分支分别持有完整链，即便 Promise.all 提前拒绝，兄弟任务仍被等待。纯计算摘要不需要新增存储追踪。

Agent 流必须将整个 pump/最终持久化作为单独 factory 在启动前登记。controller.error 只能通知消费者，不能把原始生产者失败转成维护成功；失败既通知流，也传给作用域观察者。结束必须等 completeTurn/terminateTurn 返回或明确失败，不仅等 body EOF。

取消标记断连并登记、等待 reader.cancel Promise，移除 detached `void cancel`；避免取消链与生产者互相等待造成死锁。消费者取消仍保守保留许可，即使 cancel 返回，也不据此清零。生产者最终落库/终止失败同样保留；测试覆盖客户端不消费、正常 EOF、错误、取消与迟到生产者。不能用超时解决未消费流所持许可。

## 7. 超时、DO、VFS 与 R2（R04）

Promise.race 不当作取消证据。当前纯 AI provider/纯解析尾部不自行持有 D1/R2/DO 写入 continuation；若调用方的 timeout 失败处理和最终存储工作均已结束，且没有存储不确定性，可结束请求作用域。必须用可控迟到 Promise 验证超时后不会执行 success 分支的写入。保留现有外部 abort/timeout 行为，不为了排空无限等待没有写入能力的 provider。

凡原始异步任务包含存储调用或可写 continuation，登记完整原始任务，不能只登记 race 包装。Asset processRecord 的 claim、对象读取/正文读取、解析、put、markSucceeded 或 delete/markFailed 全链必须在请求/Cron 作用域内。

在已有 typed 调用边界观察原始 R2 get/put/delete、KnowledgeBase RPC、AgentSession RPC，以及工作区操作；业务校验先执行，原始存储调用在转换错误/补偿 catch 前登记。工作区读取有建目录/恢复副作用，不能豁免。使用专用小型观察 helper 和现有端口，不实现泛用 Env/namespace 自动代理；绑定获取本身不能触发未登记副作用。

跨存储传输失败保留不确定性；原生 RPC 成功返回的明确领域拒绝可交业务处理，但不能冲掉此前标记。调用方收到拒绝不能证明远端已回滚。D1 facade 只围住本请求 D1，不能阻止其他 Worker、DO 实例或旧版本直接写；这些不在本地覆盖证明内。

不新增 DO alarm，不改业务状态恢复策略，不承诺 DO/VFS/R2 与 D1 原子一致。若未来审计发现 DO 内部直接 D1 写入或自主后台写，先更新设计和清单，不能由 HTTP 许可顺带认定已覆盖。

## 8. 预计改动面与顺序

| 检查点 | 预计文件 / 内容 | 退出标准 |
| --- | --- | --- |
| R02 | 新 worker-entry；index；tools/maintenance 的入口/config/env/真实入口测试 | 开放模式真实应用兼容、关闭时真实 HTTP/Cron 零副作用、生产配置不变；不能宣称全生命周期安全 |
| R03 | maintenance/d1 与 lifecycle；app；members/service；identity/session、automation；I/O 并行分支所在服务/路由；专项测试 | 原始失败、session 覆盖、batch 归属、嵌套及并发分支、正常业务拒绝矩阵通过 |
| R04 | routes/agent；knowledge/workspace-repository、published-content；assets/service；共享存储观察 helper；超时/流/跨存储测试 | 所列流和存储尾部无未登记写入能力；纯 provider 尾部分类有负向证据 |

这是设计改动面，不是可直接照抄执行的实施计划；书面规格获准后由 writing-plans 展开精确步骤和命令。发现必要新增文件可以在同一职责内展开，新增生产能力则必须另行确认。每个检查点先验证再勾选，不跳到 R07/R08 或 R09。

## 9. 本地验收矩阵

| 场景 | 必须观察到的结果 |
| --- | --- |
| 关闭、协调器缺失/拒绝/失联、宿主 waitUntil 注册失败 | HTTP 503 / Cron 不工作；认证、服务构建、业务 D1/R2/AI/DO 计数为零（不含准入协调器自己的 RPC/存储）；不自动清许可 |
| legacy 与 guarded 开放正常请求 | 真实路由、认证、业务返回、headers/cookie 与原行为一致；无测试专用业务分支 |
| 正常 400/403/404、零 rows/changes | 响应契约不变，无原始失败时能结束许可 |
| 原始 D1 拒绝后被 catch/映射为冲突或结果数组 | 业务响应保留；维护许可不释放；不发生自动重试 |
| first/run/all/raw/batch、bind 参数、sessionDatabase 覆盖 | 每次原生执行一次；封闭后、跨作用域 statement、未支持 API 均在原生调用前拒绝 |
| 慢查询/嵌套后台/并行一个先失败 | 所有已登记子链结束前不能排空；失败不被兄弟成功抹掉 |
| 已开始 Cron / R2 cleanup catch / DO RPC 拒绝 | 等待完整任务链；不确定性保留；结果数组成功不冒充全成功 |
| 流 EOF、cancel、error、消费者不读、生产者迟到 | 响应与生产者均独立持有；取消/错误保留许可；无 detached cancel，无死锁 |
| 纯 provider 超时后迟到成功/失败 | 不发生 success continuation 写入；业务失败处理按原语义结束；无未处理拒绝 |
| 具有写入 continuation 的合成 race | 原始任务结束前不释放；迟到写仍被追踪，不能套用纯 provider 豁免 |
| 协调器重启/complete 结果不明 | 保留持久化计数和既有失败闭锁，不重试/TTL 清理 |

harness 必须沿真实入口、真实服务和真实本地 D1；只在外部资源/时间/故障处使用合成替身。所有 env.AI（包括资产转换器）、OAuth fetch、R2、DO、静态资源都必须本地绑定或明确替身；默认拒绝意外出站，不仅依赖 remoteBindings:false。禁止注入真正凭证。

每阶段记录新增测试及命令退出结果。已有维护 28 / 备份 21 项是历史基线，不预填未来通过数。R08 再执行精确候选完整类型、测试、构建和迁移/交付合同；文档测试不能替代这些门禁。

## 10. 自检与下一步

已检查：无未定占位；方向确认与书面规格审阅分开；正常业务错误/原始存储失败分开；R02 局部接入不冒充 R03/R04 完成；纯 provider 尾部不误报 D1 写者；生产默认路径、绑定和授权边界清晰。

2026-09-20 用户确认进入 R02，本文包括“原始存储失败保守保留许可”的取舍已获准；实施计划形成后 R01 关闭，R02 已本地实现验证。2026-09-21 R03 本地实现及回归完成，下一项为 R04，尚未开始。控制鉴权、容量/孤儿处理和生产操作不随本规格获准而自动授权。
