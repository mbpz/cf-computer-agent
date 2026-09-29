# LC-007 Connector Egress Implementation Plan

> 执行方式：沿用已批准架构和顺序执行授权，使用 executing-plans + test-driven-development；不使用子代理。

**Goal:** 正式连接器在真实成员授权后，提供目标固定、可取消、有背压和资源上限的 TCP 流；不沿用开发探针身份或合成 IP 映射。

**Architecture:** 独立 destination-policy 负责精确域名/端口及 A/AAAA 地址验证；streams 负责已授权 channel 下的 DNS/拨号/读写/释放；最后由正式 WebSocket adapter 接入，重用设备硬租约的资源注册。默认系统 DNS/直接 TCP，不读取或更改代理、浏览器设置或信任根。数据面不终止客体 TLS。

**Tech Stack:** 已安装 Node、node:dns/promises、node:net、ws、Node test runner；无新增依赖。

**Spec:** `../specs/2026-09-11-browser-vm-local-connector-design.md` 第5节和LC-007；LC-006已完成本地授权验收。

## Global Constraints

- 域名只允许 dl-cdn.alpinelinux.org / github.com / api.github.com；规范小写 ASCII，拒绝URL、地址字面量、尾点、用户信息、百分号和未知字段。端口仅80/443，其他目标先明确验证批准，不能自动扩展。
- 独立请求解析 A/AAAA，混合含私网/保留/映射答案失败关闭；IPv6仅2000::/3内非特殊用途。保守拒绝全部IANA特殊用途段（包含全球可达特殊服务），不把globally-reachable等同业务允许。
- 只拨验证后的单个地址，不二次DNS解析、不自动尝试不同地址/代理/镜像。解析最多5秒、拨号最多5秒、空闲最多15秒，取消实际结束本次Resolver和socket。
- 每授权通道最多8流（含DNS/拨号等待），每帧最多16KiB，发送窗口16帧，上行最多256KiB/流，下行每流最多一个待发送块；会话64MiB/100000帧硬上限。限额不是跨设备/全账户额度证明。
- 授权释放立即销毁登记资源；异步DNS/连接/写回执不能复活关闭流。原始票据、正文、终端内容或主机配置不进入日志。
- 真实公网资源/VM软件安装归LC-008～010，产品账户生命周期归LC-011/012/015，未验收不勾选。此轮仅本地测试与提交，无push/部署/远程迁移。

## 1. 精确目的地址与可取消DNS

Files: `tools/browser-vm/connector/destination-policy.mjs`, `scripts/browser-vm-connector-destination.test.mjs`.

Interface: `createDestinationResolver({createResolver?, clock?}={})` 返回 `resolve({hostname,port}, signal): Promise<Readonly<{hostname,address,family,port}>>`。工厂参数是可信宿主测试接口，不接受网页配置。`isPublicDestinationAddress(address)`验证地址，不授予域名权限。

- [x] RED：允许三域名/80/443；大小写规范化；IP/URL/未知域名/字段先于DNS拒绝；私网、保留、IPv6映射和混合答案失败；A或AAAA ENODATA可用另一族，错误/超时/取消无结果且cancel调用；快照不可变。
- [x] GREEN：按独立Resolver实现有界Promise race及finally清理，无DNS缓存、无替代解析器。真实Node Resolver回环UDP实测确认cancel使本实例两族pending查询以ECANCELLED结束。
- [x] Mutation：移除某特殊段或混合结果拒绝必须被固定样本检测；恢复后重跑。

## 2. 授权绑定TCP资源管理

Files: `tools/browser-vm/connector/streams.mjs`, `scripts/browser-vm-connector-streams.test.mjs`.

Interface: `createConnectorStreams({authority,resolveDestination?,dial?,clock?,onReady,onData,onCredit,onClose})` 返回 `open(id,target)`, `write(id,bytes)`, `closeStream(id)`, `close()`。authority只消费现有`isActive/track/close`接口，不接受浏览器成员ID。回调均不含凭据；onData的Promise表示下游发送完成。

- [x] RED：未授权不DNS；取消等待后不拨号；只拨已验证字面地址；第9流拒绝；租约释放/连接失败/5秒连接超时/15秒空闲销毁；16帧窗口和write(false)/drain不无限积压；下游完成前pause；close后的异步回执无复活；调用异常失败关闭。
- [x] GREEN：同步占位和authority.track，再执行DNS；为每流安装独立abort、connect/idle timer及socket释放。固定地址dial且禁止lookup；资源关闭幂等。流ID递增不复用，预算在异步前检查。
- [x] 真实本地TCP字节/释放验收（仅测试transport将已核验公共目标替换成本机fixture，不声称真实公网拨号）；完整既有授权/VM回归。

第2节验收（2026-09-30本地）：新增29项，完整VM263/263、六套Worker217/217、类型/语法检查通过。流数含DNS等待；16帧窗口包含未拨号/未drain/未完成write回调的全部上行数据。onReady报告**剩余**额度，不重新赠送已消耗的16帧。下行采用paused/readable模式，每次主动read至多16KiB，前次onData完成后才继续；实际Node TCP合并读取可能超过highWaterMark，不能把该阈值当作协议帧上限，256KiB回环测试已证明修复。流管理层64MiB为双向TCP载荷累计，100000帧包含逻辑open/ready/data/credit/close通知与未知close请求；第3节还须在WebSocket入口/出口统计完整控制与线协议帧，不能用模块预算代替传输层检查。

本机TCP接到真实设备签名/硬租约核心，硬到期、续租拒绝、设备停止均导致真实peer close；该组消费ACK为明确受控fixture，不等于真实Worker/D1→TCP全链。五项临时变异（不注册资源、忽略drain、下行提前读取、拨主机名、漏计下载流量）均被检出并还原。未接server.mjs/VM数据面，forwarding:false保持，LC-007父项继续开放。

## 3. 正式WebSocket接线与全链

Files: `tools/browser-vm/connector/server.mjs`、正式客户端适配及相应测试（接线前对照已有WISP v1和v86契约）。

- [ ] 在ready后显式启用数据协议，消息用途区分授权JSON和数据帧；未授权/renew失败/close不能发出DNS或TCP。版本/帧大小/方向/credit严格校验，不沿用开发relay的ticket或合成地址信任。
- [ ] 把已验证域名目的地接到streams；仍维持精确Host/Origin、有界socket和控制页。只在数据平面真正可用时报告forwarding能力；关闭/硬到期释放所有实际TCP资源。
- [ ] 真实Worker/D1→WebSocket→DNS政策→TCP fixture的全链正常/恶意/背压/取消测试；不得用两套局部测试合并宣称全链。补齐后评估LC-007关闭，下一步LC-008。

## 来源核对（2026-09-30本地）

本轮通过IANA官方IPv4/IPv6 Special-Purpose Registries CSV核对特殊段（包括192.31.196/24、192.52.193/24、192.175.48/24、2620:4f:8000::/48、3fff::/20），未依赖网页更新时间声明。Node v24.14.1的Resolver行为以真实回环UDP验收为准：A+AAAA/ENODATA解析成功；主动取消时两个真实c-ares请求均ECANCELLED。未发出公网DNS/业务流量；net socket背压验收留待第2节。

第1节结果：16项目的地址/DNS测试，三项临时变异（放行特殊IPv6段、只检查首答案、取消独立截止检查）均被检出，文件已还原。该模块尚未接入正式WebSocket，不报告forwarding，也不关闭LC-007。
