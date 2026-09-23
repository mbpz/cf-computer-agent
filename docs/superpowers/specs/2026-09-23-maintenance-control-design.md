# R05 — 本地维护控制面的授权与重放防护设计

日期：2026-09-23。

状态：用户已确认聊天中的架构方向——独立运维控制入口、专用凭证、协调器二次校验、仅本地验证、不加后台按钮。本文将该方向细化为可执行契约；**书面规格待用户审阅，尚无实施计划或 R05 实现/测试完成声明**。

基线：`codex/admin-audit-recovery` 的 `8d396dee654a665ea2f975213b6b746da75dfe25`，R01–R04 已关闭。[恢复清单](../../operations/2026-09-19-remaining-work-checklist.md)仍为 **25 项，4 关闭、21 剩余**。本设计提交不关闭 R05。

## 1. 目标、范围与选择

目标：在独立本地 harness 中证明，未持有运维凭证的调用者不能关闸或开闸；授权控制请求不依赖业务 session、不写业务存储；窗口和 epoch 错配、旧命令和失联不能绕过已有状态机。

采用：独立 HTTP adapter → 专用凭证验证 → 固定实例的协调器 RPC 二次校验。控制流在业务准入之前分流，不获取业务 permit，不进入 createApp；普通 HTTP/Cron 继续原有 guarded 路径。控制接口必须在 OPEN/DRAINING/DRAINED 都可达，否则关闸会把恢复入口一起封住。

已比较的方案：

- 管理员 API/session 方案：`main` 的 `ea9f9c58c03e489f2a342788ea700a052aa5ee5c` 已有 `src/maintenance/control.ts` 等实现，可审阅复用错误映射和能力校验思想；但其业务管理员入口与本轮确认的独立运维入口不同，不直接合并或计为本分支完成。
- 仅内部 RPC：边界较小，但不验证实际运维 HTTP 请求的鉴权和分流，不作为 R05 的完整交付。

不包含：生产控制路由/绑定/secret 设置、后台按钮、管理员权限扩展、容量清理和孤儿强制释放、自动恢复/迁移/备份、审计平台、全局停写证明。R06/R07/R08/R09 保持独立。全程本地合成资源、不委派、不推送或合并、不读本地 secrets。

## 2. 信任边界与凭证

### 2.1 调用者与秘密

- 业务 cookie、成员角色、管理员身份、window、epoch 都不是控制凭证。客户端提供一个专用 Bearer 凭证；仅凭 cookie 的请求必须拒绝。
- 本地独立资源增加 `MAINTENANCE_CONTROL_TOKEN`，不修改生成的应用 Env 或生产 Wrangler。测试夹具只提供公开标注的合成值；实际凭证不出现在源码、URL、正文、错误、快照或日志中。
- 本规格采用规范的 32 字节值之无填充 base64url 编码（43 个字符、可往返规范解码）。生产若将来启用，必须使用安全随机生成值；校验格式不声称能验证熵，生成/注入/轮换属于另行批准的生产工作。
- 请求 Authorization 只接受单一 Bearer 值（scheme 大小写不敏感）；拒绝多值、逗号合并、异常长度、额外字段及非规范编码。不从 query/body/cookie 回退读取凭证。
- 验证采用固定长度字节的常量时间比较原语；实现前核对本地运行时支持，不能以普通字符串相等代替。每次控制尝试、包括幂等重试，都重新鉴权；不缓存一次授权结果供后续请求使用。

### 2.2 双层校验

HTTP adapter 验证调用者后，向协调器的 `beginDrain(window, epoch, capability)` / `resume(window, epoch, capability)` 传递该次已验证的能力值；协调器用自己的配置再次校验，再验证参数和进入同步状态事务。不允许 adapter 只看到有效管理员 cookie 就代填运维 secret。

`MaintenanceClient.acquire/complete` 保持原签名，业务代码不接收控制 secret。内部 `status()` 仍服务于协调器及可信本地测试，HTTP status 必须经过 adapter 鉴权。可信内部 namespace/RPC 调用方以及部署配置控制者不属于本阶段防御的恶意调用者；不宣称凭此隔离已控制 Worker 的攻击者。

缺失或不合格的配置使控制面不可用，不降级放行。它不把独立的 guarded 业务入口静默切回 legacy，也不改变已有许可、epoch 或窗口。配置轮换在本阶段仅验证新配置实例拒绝旧凭证；不承诺存活 DO 实例自动热更新或生产密钥已轮换。

## 3. 入口与协议

在 `tools/maintenance/worker.ts` 的本地 fetch 外层接入独立 adapter，先处理保留路径，再调用原业务入口。控制操作固定指向与该 harness HTTP/Cron 相同的 `local-entry` 实例；客户端不能选择 DO 名称、数据库或其他 target。

| 路径 | 方法 | 参数 | 成功结果 |
| --- | --- | --- | --- |
| `/__ops/maintenance/status` | GET | 无 query、无正文 | 200，`{ ok: true, snapshot }` |
| `/__ops/maintenance/begin-drain` | POST | JSON `{ window, epoch }` | 200，同上 |
| `/__ops/maintenance/resume` | POST | JSON `{ window, epoch }` | 200，同上 |

- `snapshot` 只含现有 `phase/epoch/window/active`；合法 phase 是 OPEN/DRAINING/DRAINED，绝不新增 FROZEN。
- 控制 namespace 的根路径及其子路径被 adapter 独占；未知控制路径 404、不支持方法 405（带 Allow），不得落回业务 app 或页面。相邻但不属于该 namespace 的业务路径不被劫持。
- 未知控制路径直接返回 404。已知路径依次检查控制配置、请求凭证、方法、Origin，再检查 query 和正文形状；失败即停止。配置或鉴权失败时不读取正文、不解析业务 session、不实例化协调器 client。路由/方法拒绝同样不得触发业务 IO。
- 不接受任何 query 参数。POST 仅接受 `application/json`（允许 charset 参数），流式限额 1 KiB，不能只信 Content-Length；超限 413，无法解析/读取 400，Content-Type 不符 415。请求体只允许 window 与 epoch 两个字段。
- window 为 `[A-Za-z0-9_-]{1,128}`；epoch 为非负安全整数，不接受字符串数字、分数或隐式转换。参数不合格时不得调用协调器。
- 本接口仅供运维客户端，不开放 CORS；含 Origin 的请求拒绝 403，OPTIONS 不提供预检许可。Cookie 不授予权限，不调用 cookie/session 服务；缺少 Origin 本身也不构成授权，Bearer 仍是必需条件。
- 所有控制响应均为受限 JSON（错误为 `{ ok: false, code }`），带 `Cache-Control: no-store`；无重定向，不反射 Authorization/原始异常/请求正文，不自动重试。

错误契约：凭证缺失/非法/不匹配为 401；配置、namespace/client 不可用或 RPC 未确认为 503；参数错误 400；窗口/epoch 冲突或存在 active work 为 409。上述路由、方法、Origin、大小及媒体类型错误使用各自状态码。协调器返回非预期形状视作 503，不据其修改本地状态。

## 4. 状态机与幂等语义

保留现有同步事务与持久状态模型，不引入独立 HTTP 内存锁或第二份 epoch。能力校验失败时控制表和 permits 不发生改变。

| 操作与状态 | 结果 |
| --- | --- |
| OPEN，beginDrain 的 epoch 匹配 | 关闭准入、记录 window；按 active 返回 DRAINING/DRAINED |
| 已关闭，相同 window/epoch 再 beginDrain | 不重复改变状态，返回实时 snapshot |
| window 冲突或 epoch 过期 | 拒绝；状态不变 |
| 相同 window/epoch 的 resume，但 active > 0 | 拒绝；不强制完成、不删除任何 permit |
| 相同 window/epoch 的 resume，active = 0 | 开闸、epoch 精确加一、保存最后恢复窗口 |
| 刚完成该 resume 且仍 OPEN，重复原始参数 | 不再递增 epoch，返回当前 snapshot |
| 已进入后续关闭窗口，再重放旧 resume | 拒绝，不能重新开闸，即使重复使用相同 window 文本 |

“重复命令结果一致”指状态变更幂等，而非 JSON 每个字段冻结：后台完成可能使 active 或 phase 变化，读到最新 snapshot 是正常行为。epoch 不能溢出安全整数；有异常或未确认的业务 permit 就没有 active=0 的前提。

协调器重启后仍按持久 epoch/window/resumed_window 判断，不依赖 HTTP 进程缓存。并发 begin/resume 由原有同步事务排序；测试明确交错后的状态，不假设网络返回顺序等于执行顺序。

## 5. 失联、重放及写入边界

控制 RPC 抛错可能发生在事务提交之后。adapter 返回 503 只表示未确认，不能宣称操作未执行、服务仍关闭或已恢复。不得自动反向补偿、强制开闸、重新读取 epoch 后拼出“新的重试命令”。运维者先用授权 status 核实；必要时重送同一 window/epoch，后续窗口的旧请求仍被事务拒绝。

本阶段重放防护保护窗口/epoch 状态不被旧操作回滚，并保证相同操作不重复推进。它不是一次性网络消息协议，不阻止持有有效运维密钥者构造新命令，也不保护已经泄露的密钥。将来生产使用须有安全传输、密钥分发与吊销流程；这些不在本轮部署或验收范围。

控制 adapter 不构造 app、Member/Session/AuditService，不访问业务 D1/R2/Knowledge/Agent 绑定，不登记业务 waitUntil。允许的持久写入仅为被授权协调器原有控制事务；本阶段不增加业务审计表写入，避免形成未受控写者。测试区分“拒绝时零控制调用/业务 IO”与“授权时可写协调器控制状态”。

## 6. 拟修改边界及 main 差异

以下是设计责任划分，不是已创建的实现：

- `src/maintenance/control-auth.ts`：凭证格式与比较，仅纯校验/密码原语，无业务依赖。
- `src/maintenance/control-http.ts`：固定路由、早期鉴权、限额解析、调用与受限响应映射。通过惰性 provider 获取指定协调器，禁止接受任意 target。
- `src/maintenance/contracts.ts`：增加独立控制 client 接口，不扩散到业务 `MaintenanceClient`。
- `src/maintenance/coordinator.ts`：控制 RPC 增加必需 capability，保持同步事务及许可机制；测试显式传入合成 capability，不提供“测试免鉴权”后门。
- `tools/maintenance/worker.ts`、`resources.ts`、`vitest.config.ts`：仅本地入口与合成配置。harness README 修正接线描述，清楚区分本地控制与生产入口。
- `tools/maintenance/*test.ts`：新增 HTTP 控制测试，更新既有直接控制 RPC 调用及旧“没有控制路由”断言，保留任意非控制路径的拒绝断言；不得降低 R02–R04 的原始失败和完整尾部要求。

不修改 `src/index.ts` 的 legacy 选择、`src/app.ts`、`src/routes/admin.ts`、生产 Wrangler/生成 Env/迁移，不将 main 的容量 API 顺便带入 R05。main 的 `control.ts` 与本方案分开评估，未来合并须显式处理两套入口/授权契约，不承诺当前可以无冲突合并或直接发布。

## 7. 必须取得的本地证据

| 测试组 | 通过条件 |
| --- | --- |
| 未授权与配置 | 缺失/错值/合并 header/畸形值/仅 cookie 被拒绝；缺失配置 503；零业务 IO，未授权请求不调用协调器、不读 body |
| 请求边界 | 错路径/方法/query/Origin/type/body/字段/超限均按契约拒绝，无状态改变；正文读取失败不泄露原始错误 |
| 二次校验 | 绕过 adapter 的直接错误 capability RPC 也被拒绝；HTTP 与 DO 配置不匹配不改状态 |
| 正常与关闭中控制 | 真实本地 HTTP 关闸，业务 HTTP 503、Cron 不入业务；关闭期间授权 status/resume 可达，许可数不会因控制请求增加 |
| 未完成工作 | 真实已登记 D1/R2/DO 尾部或不确定 permit 保持 active，resume 409；完成的正常工作清零后才可恢复 |
| 幂等与跨窗口 | 重复关闸/恢复、不同 window、旧 epoch、重复 window 文本、epoch 上界；旧命令不改后续窗口，恢复只递增一次 |
| 并发及重启 | 同时控制/准入、相反命令交错、DO 重启后重复/旧命令；持久状态与许可不丢失 |
| 回复丢失 | 分别模拟 begin/resume 已提交后丢回复，503 不触发补偿或自动重试；授权 status 揭示实际状态，原始重试不重复推进 |
| 数据与泄露 | 业务绑定访问计数为零；响应/捕获日志不含合成 secret、Authorization、cookie、原始异常或 body |
| 回归 | R02–R04 既有维护测试仍通过；应用测试和两套类型检查通过；生产配置及 legacy 入口无差异 |

采用真实本地 SQLite DO、合成 D1/R2 与可控 promise 门闩，不以 sleep/TTL 推断完成。先取得正确的行为 RED，再 GREEN；错误凭证检查或 epoch 防护的临时回退应被负向测试检出，回退不进入提交。

关闭 R05 前需完整记录候选、命令退出码、测试结果与限制，并同步 checklist/roadmap/ledger；控制方案已确认或文档已提交均不能替代这些证据。未确认测试按未知处理，不复用 R04 的 247 项旧结果声称新控制实现通过。

## 8. 当前设计进度与下一门槛

- [x] 审阅恢复分支和 main 的相关控制实现，保持分支证据独立。
- [x] 用户确认独立运维入口、专用凭证、协调器二次校验及仅本地范围。
- [x] 完成本文，并自审无占位、状态机/鉴权顺序一致、职责与测试边界明确。
- [ ] 用户审阅本文的详细协议与边界。
- [ ] 审阅通过后使用 writing-plans 形成实施计划。
- [ ] 顺序实现、回归和留证后关闭 R05。

这些是 R05 内部设计/交付步骤，不改变恢复父项统计：**4/25 完成，21 项未完成**。产品清单仍为 30 个未关闭父项，与恢复主线重叠不相加。本文待审阅期间暂停在设计门槛，不执行实现、生产变更或 R06。
