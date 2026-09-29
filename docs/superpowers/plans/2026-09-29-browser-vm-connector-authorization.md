# LC-006 本机连接器授权契约实施计划

> 执行：使用 executing-plans + test-driven-development，当前 `codex/functional-checklist-completion` 分支顺序实施，不使用子代理。

**Goal:** 在 LC-002～005 的真实 HTTPS 准入完成后，建立成员/环境/运行代次/连接器隔离的正式授权链；本地单元测试不等于已接通生产或 VM 联网。

**Architecture:** 工作台从已认证主体及服务端环境状态派生授权，连接器信任固定签名公钥及本机配对绑定，而不信任浏览器声称的身份。共享字段契约只负责拒绝错误形状/绑定/时间窗，绝不单独授予权限；签名、原子消费、租期和真实路由分别接入。

**Tech Stack:** 现有 TypeScript、Node test runner、Workers/D1 测试环境；不新增包、不读取生产密钥。

**Spec:** `docs/superpowers/specs/2026-09-11-browser-vm-local-connector-design.md` 第 4 节。

## 全局约束

- 一次性票据最多 60 秒，连接租期最多 60 秒，30 秒续租待完整验收；退出、代次变化和删除后旧授权不能复用。
- 绑定精确 HTTPS 来源、connectorId、memberId、environmentId、runtimeId、generation、policyVersion；connect 与 renew 不可互换，renew 额外绑定 leaseId。
- memberId 必须来自认证上下文，当前环境/代次/策略必须来自服务端权威状态；客户端报告不是证明实际运行的权威。
- 原始凭据不进入 URL、日志、持久化。没有明文共享服务端签名密钥到浏览器或连接器。
- 本计划不启动外网拨号，不新增生产导航，不 push/部署/迁移，不改探针协议。后续 LC-007～015 依次执行。

## LC-006.1 共享字段与上下文绑定（本地完成）

文件：新增 `shared/connector-authorization.ts`，新增 `scripts/browser-vm-connector-authorization.test.mjs`；package.json 增加独立测试入口并并入现有 VM 本地回归。

接口：`readConnectorAuthorizationClaims(value: unknown, expected: ConnectorAuthorizationBinding, nowMs: number): Readonly<ConnectorAuthorizationClaims> | undefined`。输入必须是 JSON 形状，拒绝未知字段、类型强转、无效标识、非规范 HTTPS origin 和超时/未来签发；不宽限过期。返回独立不可变值。**此函数不是签名验证器，不可用其返回值直接允许联网。**

- [x] RED：合法 connect/renew 样本与绑定/时间窗契约测试，确认缺失模块导致失败。
- [x] GREEN：最小共享字段校验；所有绑定逐项匹配，续租绑定 leaseId。
- [x] 验证：未知/缺失字段，跨成员/环境/连接器/代次/策略/来源，目的混淆，票据时长边界及输入修改隔离；定向类型检查和现有探针回归。
- [x] 同步台账；本地提交承载本计划及实现，LC-006 父项继续开放。

## LC-006.2 服务端权威授权与签名

目标文件在实施前对齐现有 `src/environments/{service,repository,lifecycle-repository}.ts`、身份/权限及路由模式；服务端签名选择及 key-id/轮换信任契约在此步细化。不得复用开发探针票据作正式授权。

- [x] RED/GREEN：认证主体派生身份、环境归属不存在/跨成员为 404、权限撤销/环境删除/代次或策略变化拒绝签发；请求字段不得覆盖权威绑定。
- [x] RED/GREEN：固定允许算法和信任 key-id，篡改/未知密钥/错误用途/超时拒绝；本地临时测试密钥，未配置时失败关闭。2026-09-29 完成低层签名器与验签器，不代表权威签发路由已接通。
- [x] Workers/D1→路由→真实验证器集成测试；路由幂等与未知结果不得静默重复产生有效票据。

## LC-006.3 原子消费、租期与撤销

- [x] 服务端消费/续租子切片：0058、本地 HTTP/D1 实时校验与消费 CAS、原连接租约绑定、未知结果不重试。不是设备侧完整验收，下面三项仍开放。
- [x] 设备授权核心子切片：内存配对/固定公钥双校验、有界缓存、租约硬定时器、固定服务端消费客户端；真实 Worker/D1 本地集成通过。正式回环 WebSocket 接线和实际流释放仍待验收，不提前关闭完整设备链。

- [x] 正式回环传输子切片：固定 Host/Origin、本机控制端点及有界 WebSocket；实际 socket 配对/续租/取消/到期关闭与控制页验证完成。消费响应仍为该套测试的受控 fixture，完整 Worker/D1→WebSocket 授权链继续待验收。

- [ ] RED/GREEN：设备侧一次性配对与签名授权双校验、并发单次消费、连接器重启旧票据失效、有界 replay 缓存。
- [ ] RED/GREEN：30 秒续租、60 秒硬上限；续租重新验证权威状态，失联/撤权/代次变化/错误 leaseId 不能延长旧会话；显式撤销释放流。
- [ ] 使用真实 Worker/D1 和连接器协议完成完整授权链验证后才勾选 LC-006，随后进入 LC-007；不以纯共享契约测试替代。

## LC-006.1 实测证据（2026-09-29）

- RED：模块未创建时，`node --test scripts/browser-vm-connector-authorization.test.mjs` 报预期 `ERR_MODULE_NOT_FOUND`，不记为已实现。
- GREEN：本机 Node 24.14.1 直接载入可擦除类型的 TypeScript；共享字段契约 14/14。全体 VM 本地回归 134/134（含这 14 项），不含真实公网 Linux 门禁。
- 定向类型检查：`./node_modules/.bin/tsc --ignoreConfig --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck shared/connector-authorization.ts` 退出 0。
- 在临时副本中去除绑定比较、允许恰好到期、扩大有效期、允许 connect 携带 lease、去除 freeze，5 种突变均导致断言失败。第一轮发现 connect/lease 测试仅靠绑定不匹配拒绝，已补双方同值但不合法的断言后重跑；不是用匹配错误掩盖字段校验遗漏。
- Checklist 审计测试 9/9，实算父项仍 29/5/24。仅新增共享契约及本地测试；没有签名、票据消费、续租撤销、服务端路由或转发接线。**LC-006 不关闭，下一步 LC-006.2。**


## LC-006.2 签名子切片与信任契约（2026-09-29）

实现：`src/environments/connector-signing.ts`（仅服务端低层签名器）、`shared/connector-authorization.ts`（字段契约 + 本机可用的公钥验签器）。没有新 HTTP 路由、迁移、Worker 配置或网络拨号。

- 固定 Ed25519，compact JWS protected header 严格为 `alg=EdDSA`、`typ=memory-garden-connector+jws` 及固定格式 `kid`；固定规范 JSON/无 padding base64url，拒绝重复 JSON key、未知字段、算法替换、嵌入密钥或密钥 URL，输入最多 8192 字符，签名固定 64 字节。
- 签名器仅接受服务端传入的不可导出私钥；不生成默认密钥，不接受公钥充当签名密钥。私钥加载/部署尚未接入，不读取生产密钥。测试密钥由运行时临时生成，不持久化。
- 验签器的公钥必须经连接器受信配置提供，不能从浏览器/票据取得；最多 active + retiring 两把，重复 kid 或无配置拒绝全部票据。配置创建时快照；替换验证器并移除旧公钥后旧 kid 不能再验证。公钥分发、轮换发布与既有会话撤销仍需后续正式接线，不把公钥验签等同即时服务端撤权。
- connect/renew 目的、leaseId 及全部 scope 匹配；验签/签名异步操作结束后再次检查时钟，不接受运算期间过期的票据。Ed25519 同一 key/claims 的结果确定，但**不是路由幂等实现**：下一步必须持久化并重用同一授权收据及 key-id，不能未知结果后另造 ticketId。
- 现有 `environment_runtime_heads` 来自浏览器生命周期报告，明确不能直接充当授权状态。下一个接线切片要建立服务端控制的授权代次/撤销状态，认证主体派生成员，环境归属 404，再以 D1 原子收据与真实 HTTP 集成证明；不得直接把请求 claims 传给签名器。

实测：

- RED：Node 验签测试先因缺失导出失败；Workers 测试经监听许可后因缺失签名模块失败。初次沙箱 `listen EPERM` 是环境失败，不记成业务 RED 或测试通过。
- GREEN：Node 字段/签名 26/26（原字段 14 + 新签名 12）；全体 VM 本地回归 146/146。Workers 签名 7/7，联合现有环境 HTTP/D1 回归 **2 文件 96/96**。这里是两个相邻测试套件，**尚非权威签发 HTTP→D1→签名的集成证明**。
- 完整 `tsc --noEmit` 退出 0。临时副本分别绕过签名结果、放开算法、未知 kid 回落到任意已知 key、跳过异步后的过期校验，4 个突变均被拒绝测试检出；未改正式源码执行突变。
- VM 全回归首次沙箱监听 EPERM 后获准原命令重跑通过。Workers 使用既有测试配置，运行器提示 AI binding warning；签名测试只调用本机 WebCrypto，环境回归仅本地 D1，不调用 AI、远程迁移或部署。
- 本次只关闭 LC-006.2 的签名子项；权威状态/签发路由/幂等及 LC-006.3 仍开放。功能父项仍 29/5/24，LC-006、D04、VM-006/G0 均未关闭。


## LC-006.2 权威状态/HTTP 接线切片（2026-09-29，本地完成）

服务端分配 `runtimeId` 与单调 `generation` 的**联网授权保留位**，不声称 Linux 已启动。前端后续必须使用该运行身份；已有客户端生命周期水位不创建、更新或恢复此授权。一个环境只保留一个当前授权代次，替换必须携带当前代次做 CAS；未知响应只能用同 operationId 读取原收据，不创建新代次。

- 本地新迁移：独立 policy singleton（默认无行即关闭）、authority heads、统一 reserve/connect/revoke 收据；不应用到远端。
- 真实已登录主体派生成员和会话散列，拥有环境才可见；签发时 D1 重新检查当前成员、会话、显式 VM 角色授权和受信策略。角色快照需在写入 SQL 中比对，不能只靠请求开始时权限位。
- reserve 的 connectorId 是待配对对象选择，不代表已配对；origin/policy 来自受信配置与 D1 策略，runtimeId/generation 来自服务端。POST 只允许明确字段；connect 请求仅接受操作键和预期运行身份，不能指定 claims、成员、策略、有效期或签名键。
- 每个代次最多一张 connect 收据；只存规范 claims 和 key-id，不存签名票据或原始会话凭据。重复请求返回同签名；到期、替代、撤销、策略/会话变化或签名 key-id 变化不重新签出新票据。重新联网需要显式 reserve 新代次。
- GET/POST `/api/environments/:id/connector-authority`、POST `.../connector-tickets`、POST `.../connector-authority/revoke`；撤销不要求仍有 VM 权限，以便所有者停用。默认无受信签名配置时签发失败关闭；本轮由真实应用构造依赖在本地测试供给临时密钥，不启用生产密钥配置。
- 本切片覆盖权威状态与首次 connect 签发；连接器消费、联网租约/续期以及前端使用服务端运行身份仍归 LC-006.3/后续接线。已有票据的离线验签不会自动获知撤销，不能据此宣称即时断流已实现。


### LC-006.2 权威 HTTP 本地验证证据（2026-09-29）

- TDD RED：先建立真实 session→`createApp.fetch`→D1→验签集成测试。缺表时 23 项失败；添加 `0057` 后 22 失败/1 通过，失败点为尚不存在的 HTTP 路由。随后才实现仓库、服务和路由。
- 新增授权测试最终 **27/27**；加既有环境 89 项、低层 Worker 签名 7 项，共 **123/123**。包含并发同意图幂等、不同意图 CAS、跨请求种类的 operationId 冲突、丢失响应恢复且不延长 TTL、同代仅一个 connect 票据、撤销/替代代次、删除/策略/成员/角色/会话变更、严格字段边界、签名配置缺失/无效、短会话到期上限、事务回滚。
- `rtk proxy ./node_modules/.bin/vitest run test/worker/connector-authorizations.test.ts test/worker/connector-signing.test.ts test/worker/environments.test.ts`：123/123，0 skipped。
- `rtk proxy npm run test:browser-vm`：146/146，0 skipped；`rtk proxy ./node_modules/.bin/tsc --noEmit` 退出 0。
- 只在本地测试数据库应用 `0057`。生产默认不配置 signer、不种入策略，签发保持关闭；没有 push、远程迁移、部署、读取/上传生产签名密钥。运行器已有 AI binding 警告，但本切片测试没有调用 AI。
- LC-006.2 子步骤本地实现/集成验证完成；**LC-006 父项仍未完成**。下一步 LC-006.3 为实际设备配对双校验、原子消费/有界防重放、续租与撤销释放；当前撤销仅更新服务端授权状态，不代表已释放尚未实现的连接器流。离线验签不能自行获知最新撤销，后续消费/续租必须查实时权威状态。


### 2026-09-30 本地扩展回归与提交前检查

- 跨过午夜后的首次 session/app/migrations 回归为 64 通过、2 失败。两项迁移查询计划测试硬编码 `idx_tasks_id_member`，而现有 `0053` 已提供等价的 `idx_tasks_member_id_unique(member_id,id)`。临时基线测试排除 `0057` 后，两项仍以相同原因失败（仅选择这两项执行，另 26 项跳过）；证明不是新授权表造成，临时文件已删除。
- 修正这两处断言，仅接受两个已知双列等值索引计划；仍不接受单列前缀或全表扫描，未更改业务查询或既有索引。
- `rtk proxy ./node_modules/.bin/vitest run test/worker/session.test.ts test/worker/app.test.ts test/worker/migrations.test.ts test/worker/connector-authorizations.test.ts test/worker/connector-signing.test.ts test/worker/environments.test.ts`：**6 套、189/189，0 skipped**，退出 0。
- `rtk proxy ./node_modules/.bin/tsc --noEmit`、`rtk proxy git diff --check` 退出 0；checklist 测试 9/9、审计仍为原始30/范围29/完成5/剩余24。


## LC-006.3 服务端消费/租期切片（本地运行记录 2026-09-30，本切片完成）

- 连接器将已固定公钥验证的票据发送到固定工作台 HTTPS `/api/connector/consume`；该路由只接受 POST JSON 中的 ticketId/ticket/consumerId，不使用浏览器 cookie，不接受 Origin/Cookie，不从请求选择信任密钥或回调 URL。服务端再次使用配置公钥验签，并从 D1 的原始签发收据派生全部绑定，重新检查实时会话、角色、环境和策略。
- 消费为 D1 原子单次操作，重复请求（即使同 consumerId）409；未知消费结果必须关闭连接，不自动重试。消费收据没有原始票据，跨连接器重启仍防重放。consumerId 是未来连接器产生、保存在内存的每连接随机身份，不来自网页身份声明。
- 初始 leaseId 服务端生成；租约到期不晚于签名票据/会话截止时间。每租约 revision 仅一张续租票据；30 秒后才能请求续租，续租必须仍有活动租约/原会话/当前代次。消费续租时 CAS 原 revision，绝不到期复活或用晚到票据覆盖新租约。
- 新增本地迁移0058。成员续租路由保持真实 session、vm:use、same-origin、严格字段和幂等要求；统一 operationId 不与预留/签发/撤销发生语义碰撞。配置缺公钥时消费关闭，不把签名私钥导出成公钥。
- 本切片先用真实 Worker HTTP/D1/签名完成服务端链验证。设备本地配对、回环协议/定时断流、真实连接器集成仍是后续本项工作；不会仅凭服务端用例关闭 LC-006.3/LC-006 或声称真实联网。


### LC-006.3 服务端消费/续租验证证据

- RED：新增测试先运行，缺消费路由/租约表导致15失败，原有27通过。未把 AUTH_REQUIRED/缺表当成功。
- GREEN：新增22项含参数化测试，授权共 **49/49**；真实临时 Ed25519 密钥与真实 createApp/D1，不用 mock 代替签名或事务。验证初始/续租并发一次消费、同原连接绑定、短会话更新、撤销/角色/会话/策略/删除/代次变化、错误签名、无公钥配置、精确签发收据匹配、原子回滚和丢失响应拒绝重试。
- 续租签发重试仍返回同一未消费收据；每个 revision 仅一张续租票据，和0057操作共用成员级 operationId 命名空间。消费重复为409而不是返回旧许可；未知消费结果必须关闭并经显式新代次授权恢复。不会自动重放客体命令。
- 三次临时突变分别去掉消费唯一性、允许过期租约消费续租、允许跨连接续租，均出现预期断言失败，随后源码全部恢复。
- 最终命令：`rtk proxy ./node_modules/.bin/vitest run test/worker/connector-authorizations.test.ts test/worker/connector-signing.test.ts test/worker/environments.test.ts test/worker/session.test.ts test/worker/app.test.ts test/worker/migrations.test.ts`；6套 **211/211**。`rtk proxy npm run test:browser-vm` **146/146**；完整 TypeScript、diff 检查通过。
- 不新增公网拨号、远程迁移/部署/推送；0058仅应用于本地测试库。配置仍默认关闭。下一步设备侧配对/固定服务端消费客户端/有界缓存/定时断流，再做真实协议集成；不得据此勾选完整 LC-006.3 或父项。


## LC-006.3 设备授权核心与固定消费客户端（本地运行记录2026-09-30）

- 新增 `tools/browser-vm/connector/authority.ts`、`consume-client.ts`，不修改 `connector-probe`、不启动常驻进程或外网转发。设备启动随机 connectorId，channel 自生 consumerId；只接受配对码及签名票据，不接受浏览器 member/runtime 声明。成员/运行代次来自已验证的签名，origin/connectorId/policyVersion 则来自本机固定配置。
- 本机配对凭据256位、30秒、最多5次尝试，旋转即撤销，异步摘要后同步竞争消费，只有一个赢家；仅保留摘要。已验签 ticketId 消费前进入有界缓存，即使请求超时/响应丢失也不移除，缓存满拒绝新票据而不淘汰未过期项。
- 固定 HTTPS 消费端点无 cookie/Origin/Authorization，禁止自动跟随重定向（manual + 仅接受201）、不重试；响应最多4096字节/4096个分块，5秒超时/取消。空分块洪泛先RED再补有界读取，避免仅字节上限被空块绕过。固定公钥验证仍复用严格 canonical JWS。默认没有安装真实 issuer/key 配置，不宣称已上线。
- 租约按服务端ACK及签名截止时间取界，30秒通知续租、独立到期定时器，续租过程中保留旧期限。最多4通道、每通道8个受管资源；关闭逐个释放，某个释放回调抛错不妨碍其他资源。时钟回拨不会延长租期；延迟执行的定时器也不能让 `isActive()` 放行。晚到 ACK/错误lease或revision/撤销/超时不能复活。
- RED：新模块缺失先失败；补充同步 transport throw 测试后发现未处理 canceled Promise，修正为先注册 race 再调用 transport，随后通过。真实 Worker 桥接发现 Workerd 不支持 Request.redirect=error，改用同样不跟随跳转的manual并拒绝所有非201；不改变失败关闭语义。新增测试的错误 sessions 表名修为真实 auth_sessions，完整重跑后才记通过。
- 设备25项 + 客户端5项 = **30/30**；含默认真实定时器短租约自动关闭测试。新增6项真实 Worker/D1→设备核心测试，授权合计 **55/55**，六套回归 **217/217**。客户端通过只读有效租约收据取得续租leaseId，集成不靠直接查D1绕过真实客户端协议。集成的 fetch 是本地 createApp 桥接，不是实际HTTPS网络或WebSocket，不以此替代协议准入。
- 临时去掉配对单次消费、缓存防重放/容量限制、硬到期定时器，各自均触发断言失败，源码均恢复。配对并发测试使用不同有效签名票据，防止被 ticket 防重放意外遮蔽。
- VM 本地全套 **176/176**；完整 TypeScript 检查通过。tsconfig 仅为 noEmit 项目增加 allowImportingTsExtensions，让 Node24 原生TS模块及 Worker 集成统一检查；没有引入依赖或构建副作用。
- 下一步：正式仅回环 Host/Origin/有界帧 WebSocket adapter、本机控制协议、真实 socket 关闭/续租消息及 Worker授权链集成；这之前 LC-006.3/LC-006/G0/D04 仍开放。主清单范围29/完成5/剩余24。没有push、生产部署、远程迁移、实际公网拨号或读取生产签名密钥。


## LC-006.3 正式回环传输与本机控制（本地运行记录2026-09-30）

- 新增 `tools/browser-vm/connector/server.mjs` 及独立本机控制页，不改 `connector-probe`。程序化可信装配固定 issuer客户端/公钥/策略，绑定127.0.0.1；没有生产配置加载器、常驻安装、端口扫描或转发。`/identity`仅公开设备标识，`/pair`及`/stop`只允许精确本机Origin、JSON、零请求体。Host/Origin重复、额外请求体、凭据URL、未知文件/路径、升级Cookie/Authorization/subprotocol均拒绝。
- `/connector`版本1消息为authenticate/renew/disconnect及ready/renewal-needed/renewed；只有签名和实时消费都成功才返回lease收据，始终forwarding:false，不回显票据/配对码。pending同步占位，重入拒绝，取消可中断消费，晚到ACK不产生ready。旧租期在续租期间保持硬关闭；退出及不回应close的socket有界清理。
- 限制16条TCP、4条升级通道、10KiB消息、32个有内容的缓冲分片、64接收块、4KiB发送队列；禁用压缩及自动pong。本版本不提供ping/pong或二进制/拨号协议，收到就关闭，避免误认成网络数据面。
- TDD：先写socket测试，缺模块ERR_MODULE_NOT_FOUND为RED；首次监听EPERM属沙箱权限而非实现失败，获准重跑。补充控制页pagehide后恢复测试先RED，再修正pageshow重启显式配对按钮；停止/导航期间晚到配对码不回显，失败不自动重试。最终socket **21/21**、页面状态 **4/4**。
- 三次临时突变：移除升级Origin检查使非法升级成功；取消分片限制使有效分片授权意外ready；打开自动pong导致未授权回应。均触发具体断言失败并恢复。分片用例使用完整有效授权JSON，防止畸形JSON拒绝遮蔽限制缺失。
- 自带浏览器实测本机控制页：初次指针操作未对应目标，不记停止成功；该临时实例到期退出。另启临时固定拒绝消费实例，使用明确按钮键盘操作，页面显示“已停止连接器”，配对/停止按钮禁用且配对码为空，进程退出0；测试标签已关闭。没有修改安全设置或访问生产。无凭据的停止截图存于临时验收文件，不提交配对码/截图中的测试凭据。此项不代替正式HTTPS浏览器网络验收。
- 新鲜最终回归：`rtk proxy npm run test:browser-vm` **201/201**；`rtk proxy ./node_modules/.bin/vitest run test/worker/connector-authorizations.test.ts test/worker/connector-signing.test.ts test/worker/environments.test.ts test/worker/session.test.ts test/worker/app.test.ts test/worker/migrations.test.ts` **217/217、6套、0 skipped**。既有日志损坏负例仍输出其预期journal异常，运行器AI绑定警告不表示这些测试调用AI。完整TypeScript及diff检查通过；checklist测试9/9、审计30/29/5/24。
- **证明边界**：本轮实际HTTP/WebSocket对接真实设备核心/固定消费客户端，但消费响应是fixture；既有Worker/D1桥接没有经过本轮真实socket。不可把两套分开的测试当作完整端到端授权链。下一步在真实Worker/D1与正式WebSocket之间完成签发→配对→消费→续租/撤权/未知结果全链验证，之后才评估LC-006.3/LC-006关闭和LC-007。D04/G0继续开放，主清单完成5/范围29/剩余24，没有push、部署、远程迁移、公网拨号或生产密钥读取。
