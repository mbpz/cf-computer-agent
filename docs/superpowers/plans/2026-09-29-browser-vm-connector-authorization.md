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

- [ ] RED/GREEN：认证主体派生身份、环境归属不存在/跨成员为 404、权限撤销/环境删除/代次或策略变化拒绝签发；请求字段不得覆盖权威绑定。
- [x] RED/GREEN：固定允许算法和信任 key-id，篡改/未知密钥/错误用途/超时拒绝；本地临时测试密钥，未配置时失败关闭。2026-09-29 完成低层签名器与验签器，不代表权威签发路由已接通。
- [ ] Workers/D1→路由→真实验证器集成测试；路由幂等与未知结果不得静默重复产生有效票据。

## LC-006.3 原子消费、租期与撤销

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
