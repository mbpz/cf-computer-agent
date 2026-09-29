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

- [x] 在ready后显式启用数据协议，消息用途区分授权JSON和数据帧；未授权/renew失败/close不能发出DNS或TCP。版本/帧大小/方向/credit严格校验，不沿用开发relay的ticket或合成地址信任。
- [x] 把已验证域名目的地接到streams；仍维持精确Host/Origin、有界socket和控制页。只在数据平面真正可用时报告forwarding能力；关闭/硬到期释放所有实际TCP资源。
- [x] 真实Worker/D1→WebSocket→DNS政策→TCP fixture的全链正常/恶意/背压/取消测试；不得用两套局部测试合并宣称全链。服务端全链子项通过，不代替下项正式VM客户端。
- [x] 正式VM客户端适配：锁定v86原生WISP会发送IP目的地址且自动重连，必须适配域名策略、授权JSON/二进制分流、租约和显式重建；不能借用探针合成IP表/开发ticket。真实客体链验收后再评估LC-007关闭及进入LC-008。
  - [x] 独立浏览器兼容正式授权传输：一次配对/成员ticket、明确start-egress及初始窗口后可用、JSON/二进制分流、一次可取消续租、硬截止与有界流/帧/消息预算；真实Worker/D1→该客户端→TCP fixture正常、续租拒绝、取消全链。
  - [x] 客体DNS/域名适配与v86接线（报文级验收，不代表真实Linux客体）：不得直接把原生IP CONNECT送到连接器，不复制探针IP表，不启用原生自动重连/无界congested_buffer。
  - [x] 真实客体→正式客户端→正式连接器全链、关闭/重建/恢复验收（本地受控目标）。


第3节服务端验收（2026-09-30本地）：授权ready仍为forwarding:false；显式start-egress/wisp-v1成功后才发送egress-ready和初始16帧窗口，续租报告同一通道状态。TCP connect不额外重置credit。默认解析/拨号维持目的地址政策，不接受浏览器配置或探针IP。

新增严格WISP codec与原始WebSocket流量计，按实际帧（含空续帧、掩码、控制/JSON、upgrade head）及双向字节计数，缓冲最多14字节头部；ws负责协议合法性验证。出口计入发送回调积压且等待完成，真实暂停浏览器→上游TCP停写→恢复16MiB逐字节验收通过。修复同批非法帧后CONNECT先DNS的异步拒绝竞态，以及提前安装data监听导致upgrade head在ws接收器安装前被消费的流动竞态。

最新完整VM284/284、相关Worker217/217、checklist9/9、类型与语法/diff检查通过；本次增加6项codec/预算、2项真实原始传输、13项真实Worker/D1数据链测试。五项临时变异（漏原始计量、异步拒绝、漏字节预算、不等待下行发送、升级时不暂停）均检出并已还原。正式VM客户端仍未接入，LC-007父项/D04/G0不勾选；无push/生产部署/远程迁移/公网目标拨号。

## 来源核对（2026-09-30本地）

本轮通过IANA官方IPv4/IPv6 Special-Purpose Registries CSV核对特殊段（包括192.31.196/24、192.52.193/24、192.175.48/24、2620:4f:8000::/48、3fff::/20），未依赖网页更新时间声明。Node v24.14.1的Resolver行为以真实回环UDP验收为准：A+AAAA/ENODATA解析成功；主动取消时两个真实c-ares请求均ECANCELLED。未发出公网DNS/业务流量；net socket背压验收留待第2节。

第1节结果：16项目的地址/DNS测试，三项临时变异（放行特殊IPv6段、只检查首答案、取消独立截止检查）均被检出，文件已还原。该模块尚未接入正式WebSocket，不报告forwarding，也不关闭LC-007。


第3节客户端授权传输验收（2026-09-30本地）：新增浏览器兼容`connector/egress-client.mjs`，不是对原生v86网络适配器的接线声明。只打开指定127.0.0.1端口/connector，一次连接，凭据仅首个JSON；ready与egress-ready不单独宣称数据可用，必须等初始stream-0信用窗口。授权JSON不进入onFrame。独立维护最多8流/16帧窗口、单帧16KiB、单调ID、原生bufferedAmount及完整消息层64MiB/100000上限，无应用排队或自动重连；浏览器无法观察原始WS分片，服务端wire meter仍为实际线协议预算。

续租由产品层传入的`renewTicket(lease, signal)`一次获取新成员ticket；传输层不处理cookie或固定API以外的身份替代。5秒覆盖取票与ACK，任何不确定结果关闭且取消，不重试，旧硬租约不提前延长。冻结lease快照，验证leaseId/逐次revision/有效期/forwarding；系统时钟前跳后回拨仍按每次观测重锚单调时间，防止延后此前接受的新lease。关闭忽略晚到取票或网络事件。新测试24项及真实链3项；fresh完整VM311/311、Worker217/217、checklist9/9、tsc/语法/browser平台ESM打包/diff通过。六项变异（去掉到期、abort、目的域限制、credit扣减、单调推进、消息预算）均被检出还原。仅关闭本段子项，不关闭LC-007/D04/G0，无push或公网/真实VM联网声明。


### 3.1 客体DNS接线所需正式契约（实施中）

v86原生WISP把客体TCP目标变成IP，static DNS把任意名称都指向同一私网地址；不能作为正式域名身份。先实现授权通道上的有界`resolve-destination`/`destination-resolved`控制消息：只查询三个允许域名，由宿主现有系统Resolver执行完整A+AAAA/混合地址政策，返回已验证的单个IPv4地址。明确只服务当前IPv4客体的A查询；不开放通用DNS/任意递归/替代DoH，也不把探针203.0.113地址复制进产品。

DNS请求带单调requestId，最多3个在途，登记到现有最多8个授权资源；5秒期限、取消/租约到期清理、迟到回答不得写回。结果只证明本次域名与地址的关联，不授予裸IP拨号；每个后续CONNECT仍发送域名，由现有streams重新独立解析/固定目标。VM适配器还必须处理DNS名称/IP歧义和有界关联有效期，关闭/重建清空，不允许直接把任意IP反向当作授权域名。浏览器发送/接收计量包含这些控制消息；正式浏览器客户端API取代手造JSON。

- [x] 正式授权DNS控制面和客户端请求/回答/超时/取消，真实Worker/D1链证明无授权/非法目标不DNS。
- [x] v86客体DNS报文、关联表、TCP接线、无自动重连/无界队列（真实V86实例、注入报文验收）。
- [x] 实际客体请求穿过上述完整正式链（启动Alpine，以本机HTTP受控目标验收）。

第3.1节DNS控制面验收（2026-09-30本地）：完成`dns.mjs`、浏览器/宿主共享的canonical-public-IPv4政策以及`client.resolve()`，接入正式server而非探针。6项DNS单元、3项客户端DNS及8项真实Worker/D1链新增通过；每个等待中的DNS必须使用独立track回调，避免Set去重导致共享8资源计数失真。真实链证明单次DNS答复不拨号，后续域名CONNECT重新独立DNS后才接入真实TCP；未授权/control-only/非法同批请求DNS为0，取消确实停止解析，续租等待不提前延长租约。

fresh完整VM **328/328**，0失败/取消/跳过，约41秒；checklist9/9、tsc --noEmit、browser ESM打包（12364bytes）、语法/diff检查通过。四项变异（漏资源登记、漏独立deadline、放开域名、客户端放开地址）均被检出并恢复，恢复后DNS+客户端33/33。本轮未重跑Worker六套217项；其既有结果不当作本轮新证据。只关闭DNS控制面子项，客体报文/关联表/v86接线与真实客体全链仍待完成，LC-007/D04/G0保持开放。无push、部署、远程迁移或公网业务拨号。


### 3.2 固定v86适配（实施中）

本地已核验锁定的v86 0.5.458+gd96be77：暂停构造`relay_url:fetch`不会开WebSocket；其net-send动态调用实例send，tcp-connection有实例作用域的默认HTTP fetch回调。正式接线必须在运行前移除该实例默认HTTP处理，禁用fetch/connect入口，保留其本地ARP/DHCP/TCP状态机；所有DNS独立截获，不能落入static/DoH。使用真实已安装V86实例的以太网输入输出验收，不以伪造TCPConnection对象代替接口契约。

- [x] 校验有界IPv4/ARP/DHCP/DNS/TCP报文；DNS只调用正式client.resolve，A记录30秒，AAAA空答复/未知名拒绝，不开放任意UDP。
- [x] 地址关联最多3项，期限/名称变更/冲突严格处理；CONNECT只发关联域名、80/443；无直接IP授权、原生WISP重连或HTTP fetch旁路。
- [x] WISP与真实v86 TCP连接双向接线，最多8流、有界上/下行队列、信用窗口、关闭清理；暂停安装和单次实例生命周期。
- [x] 真实客体→正式Worker/D1链完成启动后同链验收，不由报文级验收替代。

第3.2节报文级验收（2026-09-30 03:47）：真实V86实例15项；同一实际Worker/D1→正式client/connector→真实V86网络栈→本地TCP验收新增1项，完整VM344/344，0失败/取消/跳过，42.1秒。checklist9/9、tsc/browser ESM/语法/diff检查通过；5项策略变异检出并恢复（下载容量须同时移除显式检查与native ring上限才突破双层防线）。上游CLOSE必须保留ring等待客体ACK，不可立即release截断；客体FIN必须排完信用队列再CLOSE。慢客体超256KiB会失败关闭，不宣称端到端读取背压。CPU暂停且以太网报文来自测试夹具，无Linux启动/公网目标/产品UI验收，最后一项及LC-007父项继续开放。详见2026-09-28-vm-resumption-evidence.md本轮记录。


### 3.3 LC-007 本地验收关闭（2026-09-30 04:07）

新增显式 `test:browser-vm:connector-linux`，缺固定资产报错，不跳过冒充通过。
完整Alpine启动，DHCP/DNS/wget穿过真实Worker/D1→正式client→connector→本机HTTP。
成功请求、恶意目标不拨号、旧流真实peer关闭、快照恢复默认离线、显式新generation/ticket、
新请求成功、旧POST及未完下载不重放、硬租约到期后客体请求失败全部通过（1/1，38.3秒）。
共享授权夹具从原集成套件提取，原测试行为不变。完整快速VM回归344/344通过。

LC-007原始范围为DNS/目标限制/地址固定/背压/资源回收的正常和恶意测试；此前已有
上行credit/drain、受控慢下游背压和有界失败关闭验证，本次补齐真实客体同链。
不把LC-008公网资源、LC-009/010真实浏览器安装/git、LC-011/012/015产品生命周期
倒加成LC-007关闭门槛。LC-007关闭，下一步LC-008；D04/G0及其他父项仍开放。
受控DNS和最终loopback路由不是公网TLS验收，慢客体下载上限仍为失败关闭而非读取驱动背压。
