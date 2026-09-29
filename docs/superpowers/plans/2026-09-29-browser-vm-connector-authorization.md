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

## LC-006.1 共享字段与上下文绑定（当前切片）

文件：新增 `shared/connector-authorization.ts`，新增 `scripts/browser-vm-connector-authorization.test.mjs`；package.json 增加独立测试入口并并入现有 VM 本地回归。

接口：`readConnectorAuthorizationClaims(value: unknown, expected: ConnectorAuthorizationBinding, nowMs: number): Readonly<ConnectorAuthorizationClaims> | undefined`。输入必须是 JSON 形状，拒绝未知字段、类型强转、无效标识、非规范 HTTPS origin 和超时/未来签发；不宽限过期。返回独立不可变值。**此函数不是签名验证器，不可用其返回值直接允许联网。**

- [x] RED：合法 connect/renew 样本与绑定/时间窗契约测试，确认缺失模块导致失败。
- [x] GREEN：最小共享字段校验；所有绑定逐项匹配，续租绑定 leaseId。
- [x] 验证：未知/缺失字段，跨成员/环境/连接器/代次/策略/来源，目的混淆，票据时长边界及输入修改隔离；定向类型检查和现有探针回归。
- [x] 同步台账；本地提交承载本计划及实现，LC-006 父项继续开放。

## LC-006.2 服务端权威授权与签名

目标文件在实施前对齐现有 `src/environments/{service,repository,lifecycle-repository}.ts`、身份/权限及路由模式；服务端签名选择及 key-id/轮换信任契约在此步细化。不得复用开发探针票据作正式授权。

- [ ] RED/GREEN：认证主体派生身份、环境归属不存在/跨成员为 404、权限撤销/环境删除/代次或策略变化拒绝签发；请求字段不得覆盖权威绑定。
- [ ] RED/GREEN：固定允许算法和信任 key-id，篡改/未知密钥/错误用途/超时拒绝；本地临时测试密钥，未配置时失败关闭。
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
