# D04 — VM 顺序续作与当前准入状态

日期：2026-09-28 UTC（Asia/Shanghai 为 2026-09-29）；基线 `codex/functional-checklist-completion` / `97be261`。本次没有修改 VM 业务代码、启动真实 Linux、下载镜像、连接公网中继或部署。

## 按原计划恢复，不重新发明 VM

执行入口为 `docs/superpowers/plans/2026-09-09-browser-linux-vm.md` 与 `docs/superpowers/plans/2026-09-11-browser-vm-local-connector-probe.md`。前者明确 **G0 未通过不得接正式页面**；后者要求有效 HTTPS 页面在桌面 Chrome/Edge 默认安全配置下完成握手及允许/拒绝/撤回、停止等矩阵。历史内置浏览器握手不替代目标浏览器验收。

| D04 子能力 | 已有代码/证据 | 剩余关闭条件 |
| --- | --- | --- |
| 历史与元数据 | `src/routes/environments.ts`、`src/environments/`：认证成员归属、vm:use、数字分页、幂等操作回执、版本条件更新、墓碑与运行事件；元数据 API 不等于实际启动/停止 | 实际 runtime 接线、跨标签实例所有权、账户撤权/退出、完整原生旅程 |
| 启动/停止与终端 | `tools/browser-vm/terminal-session.mjs`、terminal client/worker 与 serial 协议：诊断 Worker、超时/取消/停止、受限 UTF-8 输入、输出丢失报告与不自动重放 | 正式 shadcn UI、ANSI/编辑/尺寸、登录账户生命周期；串口诊断不是正式终端 |
| 保存/恢复与存储 | probe-checkpoint、recovery-core/worker/browser 有开发快照校验与恢复诊断；`frontend/features/environments/deletion-reconciler.ts` 有独立清理协议 | 当前正式持久化适配未接线；原子写入、容量/失败恢复与设备副本清理仍待完成。按用户当前不加密、不备份决定，不以新增加密/备份要求阻塞；仍不能把未做的存储标为完成 |
| 联网 | 开发 relay 与 `connector-probe/` 有回环握手、来源/一次性码约束；已有独立 HTTPS 预览的历史记录 | LC-002–005 目标浏览器准入及后续成员/环境/代次授权；真实客体 apk/Git/API 和断线新授权。不得用本地协议测试冒充公网成功，不切换远程代理 |
| 正式入口 | 当前无正式环境页面；现有 README 明确 G0 harness 非产品 | G0 通过后按原计划推进，不能先挂诊断页进生产菜单来降低 checklist 计数 |

## 本轮本地验证

```sh
rtk proxy npm run test:browser-vm
rtk proxy npm run test:browser-vm:recovery-page
rtk proxy npm run test:browser-vm:direct-download
rtk proxy npx vitest run test/worker/environments.test.ts test/unit/environment-deletion-reconciler.test.ts
```

结果：快速 **120/120**、恢复页 **10/10**、下载协议 **15/15**、本地 D1/清理协调器 **110/110**，共 **255/255**，均无 skipped。使用本地回环测试与测试数据库；没有执行 `test:browser-vm:linux`、`test:browser-vm:network`，不声称真实 Linux/外网本轮重新验收。

## 当时的原生阻塞（2026-09-28 UTC 观测，后续状态见下文）

调用原生控制工具 `cua.getState()`，返回 native apps 错误：Mac 已锁定，自动解锁未成功，需用户手动解锁。可用浏览器清单只有无标签的内置浏览器，无法据此获得桌面 Chrome/Edge 的版本、权限或交互证据。

此后停止原生控制，不尝试其他浏览器/自动化控制绕过锁屏，也不沿用以前的锁屏记录作为本轮事实。没有点击浏览器权限、启动常驻连接器、设置系统代理/证书或重新发布预览。

下一步：用户手动解锁 Mac 后，重新发现桌面 Chrome/Edge 与当前 HTTPS 预览，再按原计划做准入；任何权限提示按既有授权边界处理。完成准入后再进入正式运行时/UI 接线。D04 仍开放，D05/D06 的原生身份/设备验收也未完成。

当前 **29 范围内 / 5 已关闭 / 24 未关闭**。D03 对账已关闭不代表知识业务全部交付，D04 本地回归通过不代表 G0 通过。无 push、远程迁移、部署或生产写入。


## 2026-09-29 Asia/Shanghai 后续更新

用户已解锁并明确选择自带浏览器。手动配对后，实际页面确认握手成功且配对输入为空；停止临时组件后页面显示离线，进程正常退出，端口 `52891` 无监听。详细顺序与证据边界见[连接器准入记录](../../design/browser-vm/local-connector-probe-evidence.md)。上文锁屏阻塞和等待解锁的下一步为历史状态，不再适用。

当前完成的是自带浏览器 HTTPS 到本机组件的连接验证，不是 VM 联网。仍须补齐原计划目标浏览器默认安全配置/权限与负向准入矩阵；未经范围调整，不把自带浏览器成功视为替代这些条件。G0 未通过，正式 VM 页面接线尚不允许进入；D04 继续开放。当前计数仍为 **29 范围内 / 5 已关闭 / 24 未关闭**。本次没有重复运行上文 255 项测试，也没有生产变更。


## 2026-09-29 桌面矩阵后续更新

经明确授权后完成 Chrome 154.0.8037.58 / Edge 152.0.4191.53 的完整版本、默认相关检查、策略、有效证书及握手/权限/生命周期矩阵，关闭探针 LC-002/003/004；详细计时和未用码过期/重放拒绝见[准入记录](../../design/browser-vm/local-connector-probe-evidence.md)。先前仅有自带浏览器的限制不再适用。Chrome153 的历史权限操作与154结果分列，未由代理更新浏览器。

重要实测限制：撤回浏览器权限后既有连接不会立即断开；浏览器提示重载，重载后新连接被阻止。正式授权需独立撤销与有界租期，不把该行为写成即时撤权通过。

本轮新鲜回环连接器 18/18、checklist 审计测试 9/9；父项计数仍为 **29 范围内 / 5 已关闭 / 24 未关闭**。同日补齐 LC-005：原 HTTPS 测试页、虚构码、不匹配精确允许来源，Chrome 控制台 HTTP 403，Edge 通用错误与同次服务端 upgrade/403 诊断对应；missing/null Origin 仍只保留协议层证据。第一连接准入门完成，下一步允许 LC-006 本地正式授权契约。G0/D04 继续开放，正式 VM UI/联网尚未完成。仅文档更新和临时探针验收，无 push/部署/迁移。


## 2026-09-29 LC-006.1 本地授权字段契约

第一连接准入门完成后，按新细化计划顺序实现 `shared/connector-authorization.ts`：精确 HTTPS 来源、成员/环境/连接器/runtime/代次/策略绑定，connect/renew 用途隔离与 leaseId，60 秒最大票据时间窗、无过期宽限，拒绝字段注入/类型强转并返回不可变独立快照。它只校验字段，**不会认证主体、验证签名或授予网络能力**。

TDD 缺失模块 RED 后实现，独立 14/14；VM 本地全套 134/134、定向 TypeScript 检查通过。临时副本的五种关键突变均使断言失败，发现并补强了 connect/lease 的同值畸形测试。计划与确切命令见 `../superpowers/plans/2026-09-29-browser-vm-connector-authorization.md`。下一步 LC-006.2 权威签发/签名，LC-006.3 消费/续租/撤销仍未实现，不勾选 LC-006 或 G0/D04。父项 29/5/24；无 push、部署、迁移、生产密钥或外网转发。


## 2026-09-29 LC-006.2 权威签发 HTTP 本地接线

新增 `0057_connector_authorizations.sql`、服务端授权仓库/服务/路由：认证会话派生成员及 session hash；服务端分配 runtimeId/代次；SQL 在写入时核对当前环境归属、角色位、会话和策略。浏览器运行报告不创建授权。预留/签发/撤销使用同一 operationId 命名空间的原子幂等收据；同代最多一张 connect 票据，丢失响应恢复不会延长时间。收据只存未签名 claims，不持久化票据或原始 cookie。签发后再次核验权威状态。

新增真实 Worker/D1→HTTP→签名验证集成 **27/27**，与既有环境/签名合计 **123/123**；VM 本地回归 **146/146**，完整 TypeScript 检查通过。缺表和缺路由的 RED 已观察，再实现 GREEN。确切命令和边界见 LC-006 授权计划。

LC-006.2 本地子步骤完成，下一步允许 LC-006.3：设备配对双校验、原子消费、租期/续租与撤销释放。当前签名不等于连接许可，服务端状态撤销不等于连接器流已关闭。默认生产无签名/策略配置，不开放签发；没有 push、生产部署或远程迁移。**父项 29 / 完成 5 / 剩余 24**，LC-006、G0、D04 仍开放。


## LC-006.3 服务端单次消费与续租后续进展

本地运行记录跨至2026-09-30：在0057签发基础上新增0058租约/消费账本。连接器消费端点不使用浏览器cookie，基于固定公钥、D1保存的精确签发收据和实时会话/角色/策略验证票据。初始/续租票据均只消费一次；相同请求重试也不返回可再次启用连接的许可。续租绑定原连接consumerId、leaseId、revision，并在有效租约内30秒后签发；已过期租约不能凭尚未过期续租票据复活。

授权测试由27扩至49/49；六套真实Worker/D1回归211/211、VM146/146，类型检查通过。去掉唯一消费、租约期限、连接绑定的三种临时突变均被测试检出并已还原。设备侧配对与断流仍未实现，不勾选LC-006.3整体或LC-006/G0/D04。下一步允许设备端协议接线；父项仍29/5/24。没有生产推送、部署、远程迁移或外网转发。


## LC-006.3 设备授权核心后续进展

本地运行记录2026-09-30：设备核心已实现256位一次性配对、30秒/5次限制、签名双校验、自生成启动及通道身份、有界防重放缓存、最多60秒硬租期与30秒续租通知。固定消费客户端无环境凭据、不跟随跳转、不重试，响应/耗时有界；未知结果关闭并保留消费痕迹。租期到达、撤销或晚到响应不能复活，资源释放回调故障隔离。真实默认定时器也已测试。

新增设备/客户端30项通过；真实本地Worker/D1桥接新增6项，覆盖完整签发消费续租及角色/会话/撤销/代次变化后关闭，授权55/55、相关六套217/217；VM176/176、类型检查通过。移除配对单次性、缓存限制、硬定时器的三种临时突变均触发断言，源码还原。桥接不是真实HTTPS/WebSocket协议，尚无TCP转发或生产密钥配置。

下一步允许实现正式回环WebSocket/本机控制协议与真实连接释放测试。LC-006.3完整项、LC-006/G0/D04仍开放；父项29/5/24。不push、不部署、不远程迁移、不扩展为加密或备份任务。


## LC-006.3 正式回环协议后续进展

本地运行记录2026-09-30：已新增独立正式回环服务及本机控制页。仅127.0.0.1、精确Host/Origin、零体本机配对/停止、有界socket/帧/缓冲，签名和固定服务端消费后才回ready，明确forwarding:false。配对/票据不进入URL/输出收据；并发帧、错误签名、重放、未知结果、续租过期与停止均关闭实际socket，未实现TCP外网转发。

真实socket测试21/21；控制页状态4/4（先RED修正导航恢复）；三种临时防护突变均被断言检出并已恢复。自带浏览器本机控制页以键盘操作确认停止状态、禁用控件、清空码值，临时进程退出0且标签关闭；初次未命中目标的指针操作及到期后的未知结果不记为成功。没有改浏览器安全设置。新鲜VM回归201/201、六套Worker217/217、类型检查通过；checklist9/9及30/29/5/24。

**关键证据缺口仍保留**：本轮socket使用受控消费响应；既有真实Worker/D1测试是独立的createApp桥接，并未与socket全链贯通。下一步只在本地搭建这条完整签发/配对/消费/续租/撤权链，再评估LC-006关闭；不得合并两组局部测试结果虚报端到端成功。不push、不部署、不做远程迁移，不读取生产签名密钥。父项仍29/5/24，D04/G0/LC-006保持开放。


## LC-006 完整授权契约关闭（2026-09-30 本地）

真实Workerd/createApp/SessionService/D1/临时Ed25519签发 → 正式回环WebSocket → 设备双校验 → 固定消费客户端 → 真实D1消费/续租形成同一条验收链，新增17/17。角色、会话、成员、环境、策略、撤销和代次变化拒绝续租并关闭实际socket；数据库提交后ACK丢失不误报成功、不自动重试；并发单消费、重启旧票据拒绝、主动断开/停止及60秒上限通过。移除replay检查的临时突变被第二次消费409断言检出并恢复。新鲜VM218/218、相关Worker217/217及类型/语法检查通过。

本地测试只通过dispatchFetch把配置中的规范来源路由到本地Workerd，拒绝全部外网；未读取Wrangler或生产签名私钥，测试入口不参与生产构建。租期采用受控时钟，已有真实默认定时器socket用例另行回归。此证据关闭LC-006本地授权契约，**下一步LC-007**；不宣称真实HTTPS消费链路/证书、TCP拨号、VM联网或产品账户生命周期通过。D04/G0及LC-007～015继续开放，总清单范围29/完成5/剩余24。没有push/部署/远程迁移或主机网络安全配置更改。


## LC-007 目的地址与可取消DNS子项（2026-09-30 本地）

新增正式连接器独立destination-policy模块（不复用开发探针合成IP）：精确三个域名、80/443、ASCII小写规范、拒绝URL/IP/额外字段；每请求独立A/AAAA，无缓存，检查全部最多32个答案，任一非公网/特殊段/族不匹配即拒绝。仅返回一个冻结字面地址，无替代地址自动重试。5秒总期限同时使用定时器和完成时单调时间检查，取消/失败/成功都释放本实例Resolver、定时器及abort监听。任意上游诊断不返回页面。

TDD先观察缺失实现，再空接口10项行为失败，完整实现通过；追加真实Node v24.14.1回环UDP验收及边界测试，共16/16。真实A查询/AAAA ENODATA产出公共地址固定值；阻塞的两个真实c-ares查询主动取消均ECANCELLED，未发出外部DNS或业务TCP。IANA官方CSV只读核对特殊段；读取官方登记表不是业务联网验收。三个临时变异（漏掉AS112 IPv6段、只检查首答案、去掉完成时截止检查）都导致断言失败，并已逐字还原。

2026-09-30 01:56 CST新鲜完整VM回归234/234（含上一轮真实Worker/D1→WebSocket链17项）、tsc --noEmit及两个新文件语法检查通过。日志：`/private/tmp/connector-destination-vm-regression.log`；突变日志：`/private/tmp/connector-destination-mutation-{special-prefix,mixed-answers,deadline}.log`。本轮未单独重跑全部Worker217项，不把旧结果写作新鲜验证。

只关闭[LC-007细化计划](../superpowers/plans/2026-09-30-browser-vm-connector-egress.md)第1节，不关闭LC-007父项。正式WebSocket仍forwarding:false；下一步第2节授权绑定TCP流资源管理，再第3节同链接线。D04/G0继续开放：原始30、范围29、已关闭5、未关闭24。无push/部署/远程迁移/生产写入/系统代理或信任根更改；当前无新增阻塞，允许继续既定本地实现。


## LC-007 授权绑定TCP资源管理子项（2026-09-30 本地）

新增正式streams模块：现有authority.isActive/track/close作为唯一授权来源，同步占位和注册后才解析DNS，最多8流含等待；只拨已核验字面地址，禁用二次lookup/自动地址族回退，无代理或备用地址重试。5秒连接与15秒空闲均有独立定时器和完成时截止检查。关闭先撤销authority，资源释放幂等；取消、晚到DNS/connect/write/send回执不能恢复旧流，旧流迟到发送失败也不会杀死后来的健康流。

上行16帧/16KiB窗口，在DNS/连接/drain/write回执期间总计最多256KiB，write(false)停止继续写socket，只有全部窗口写完且drain后才补充。onReady只报告剩余额度，不重复赠送等待期间已经消耗的窗口。下行保持paused/readable模式，每次主动读取至多16KiB，onData发送完成才读下一块；实际256KiB TCP发送证明不能把highWaterMark当作native chunk上限，最初直接处理data事件的实现被真实测试检出并修正。双向载荷累计64MiB、逻辑帧100000硬上限跨流保持，未知close和失败连接的close通知均计数；完整WebSocket线协议/授权控制帧预算属于下一步。

新增29/29，覆盖受控慢DNS/socket/write(false)/迟到回执、双向和小帧预算、真实本机TCP字节/256KiB分块，以及真实签名设备核心→TCP的硬租约到期、续租拒绝和停止断流。该设备组明确使用本地受控消费ACK与时钟；不能替代Worker/D1或HTTPS全链，不宣称公网或VM联网。临时移除资源注册、drain门槛、下行单次读取门槛、固定IP拨号和下载计量，五项突变均被断言检出并逐字还原。

2026-09-30 02:17 CST新鲜VM263/263、六套Worker217/217、tsc --noEmit、两个新文件语法检查通过。Worker负向日志中的Invalid pending note journal来自原有拒绝测试，不是新增失败。日志`/private/tmp/connector-streams-vm-regression.log`、`/private/tmp/connector-streams-worker-regression.log`及`/private/tmp/connector-streams-mutation-*.log`。真实TCP监听/连接由测试清理，进程正常退出。

关闭LC-007细化计划第2节；第3节正式WebSocket接线与真实Worker/D1→WebSocket→DNS→TCP同链仍待完成。server.mjs未改变，forwarding:false保持，D04/G0/LC-007继续开放。原始30/范围29/已关闭5/未关闭24；当前无新阻塞，允许继续第3节。本轮仅本地代码、测试、证据和提交，无push/部署/远程迁移/生产写入/主机网络安全配置修改。


## LC-007 正式服务端数据面与真实授权全链子项（2026-09-30 本地）

- 前一子项已本地提交 `a577875`（授权绑定TCP资源管理）。本次实现 `connector/wire.mjs` 并接入正式 `server.mjs`，不是探针relay；控制页说明与README同步更新。
- 实际成员Session/权限→D1 generation/ticket签发→Ed25519→配对→真实consume/lease→WebSocket显式start-egress→完整目的地址政策→实际TCP fixture在同一测试链运行。授权ready仍forwarding:false，显式启用后为true；续租不更换TCP或重赠送credit。普通网页消息不能替换宿主resolver/dial。
- 测试DNS只返回固定公共地址，拨号前断言该字面量/族/端口/禁止自动家族回退，再显式替换为回环fixture。没有生产密钥、生产D1、真实公网目标或实际VM联网声明。正式v86适配仍待实现：当前原生适配器发送IP，不能用开发探针地址映射代替正式契约。
- 同链覆盖正常双向字节、无授权/仅控制通道禁止二进制、重复/错误协商、客户端CONTINUE拒绝、探针IP不解析、10KiB JSON上限、硬租约/续租拒绝/停止实际断流、DNS取消与晚到答案、DNS等待期间17帧越界、256KiB下行分块、完整16帧credit更新和真实续租保留连接。
- 真实浏览器侧WebSocket暂停读（本机ws测试客户端，非人工浏览器验收）使上游TCP写入实际阻塞；恢复后16MiB固定字节完整收回。不是只测试mock的pause调用。
- 两个真实RED缺陷已修复：(1) 同一个TCP批次中非法帧抛出的异步拒绝尚未执行，后续CONNECT已先触发DNS；现同步关闭，DNS=0；(2) 提前添加data监听使upgrade head在ws接收器注册前被消费，正常分片变成1002；现安装期间暂停，接收器/消息监听齐备后恢复，空分片计量以1008关闭。
- 原始WebSocket计量覆盖输入实际字节及帧（含空续帧、mask、控制/JSON、HTTP upgrade head）；只缓存最多14字节头部，ws仍是协议验证器。双向64MiB/100000帧预算预留关闭帧，出口保守计头部；send回调与bufferedAmount双重限积压。独立流模块的载荷/逻辑帧预算仍保留。
- 五项临时变异：去掉原始meter、去掉同步decode拒绝、去掉字节预算、不等待下行发送、升级时不暂停，全部检出并逐项恢复。修订测试等待逻辑后，不等待发送变异明确报Connector closed before binary reply，漏meter明确报Raw fragment budget did not close the socket，而不是用全套测试的超时作为通过依据。
- fresh `npm run test:browser-vm` **284/284**，0失败/取消/跳过；新增6项wire、2项原始传输、13项完整授权数据链。六套Worker **217/217**；`tsc --noEmit`、两生产模块`node --check`、`git diff --check`通过；checklist审计测试9/9。日志 `/private/tmp/connector-wire-vm-regression.log`、`/private/tmp/connector-wire-worker-regression.log`；变异日志 `/private/tmp/connector-wire-mutation-{raw-meter,sync-close,wire-bytes,backpressure,upgrade-head}.log`。
- 总清单仍原始30 / 范围29 / 完成5 / 剩余24（D08排除）。本次只关闭LC-007服务端接线/同链子项；LC-007、D04/G0及LC-008～015继续开放。下一步正式VM客户端与真实客体链验收；无外部阻塞，允许继续，不新增加密/备份门槛。仅本地提交，不push/部署/迁移，不改浏览器/证书/代理/自启动。


## LC-007 正式客户端授权传输子项（2026-09-30 本地）

- 承接服务端提交`25073cf`，新增`tools/browser-vm/connector/egress-client.mjs`。采用现有正式配对/成员ticket/真实consume协议；不使用探针ticket、合成IP表、浏览器安全配置变化或全局WebSocket替换。
- 精确指定本机端口，只创建一次socket；首个JSON发送凭据后清空模块保存引用。ready→显式start-egress→egress-ready→stream-0信用窗口齐备后才触发onReady；全部授权/续租JSON在客户端消费，onFrame只收到验证过的二进制副本。
- 一次可取消renewTicket回调，取票与ACK合计5秒；保持旧硬到期直至验证相同leaseId/递增revision/期限/forwarding的新ACK。迟到取票、暂停定时器、时钟回拨、未知结果、错误方向/帧、重复授权、无信用/第9流/原生发送缓冲越界均关闭；不自动重连、重放凭据或无限排队。
- 新RED回归揭示：只保留创建时的wall/monotonic锚，时钟前跳后接受的新lease会被后续回拨延迟。改为每次观测重锚并继续单调推进，真实失败断言true!=false已转绿。另修复集成测试自身的时间安排：续租前后保持TCP活动，避免16秒空闲触发已有15秒idle门槛遮蔽续租验收。
- 客户端限制三精确域名/80或443、8流/16信用窗口/16KiB DATA/单调流ID，控制消息不超过10KiB。64MiB/100000为完整消息层保守上限，包含已关闭流的晚到消息；原始WebSocket分片预算仍由server wire meter负责，不夸大浏览器可见性。
- 新增24项传输单测及3项真实链：实际Worker/D1签发/consume→正式客户端→正式连接器→受控公共DNS政策→回环TCP fixture；同一流正常续租、取消DNS晚到不拨号、禁用policy续租关闭真实peer。该链为Node ws提供浏览器EventTarget接口，**不是自带浏览器或真实客体验收**；没有真实公网目标拨号。
- 六项临时变异（硬到期、abort、目标限制、credit扣减、单调时间推进、消息预算）全部被检出并逐字恢复；日志`/private/tmp/connector-client-mutation-*.log`。新增模块已做browser平台ESM打包，无Node依赖、无新增npm依赖。
- fresh完整VM **311/311**（0失败/取消/跳过，约34秒），六套Worker **217/217**（约7.5秒），checklist审计测试 **9/9**；tsc --noEmit、node --check、browser ESM bundle、git diff --check通过。日志`/private/tmp/connector-client-vm-regression.log`与`/private/tmp/connector-client-worker-regression.log`。预期负向日志CONNECTOR_AUTHORIZATION_UNAVAILABLE及既有Invalid pending note journal不是测试失败。
- 清单原始30 / 范围29 / 已完成5 / 剩余24，D08排除；仅关闭细化计划中的客户端授权传输子项，LC-007/D04/G0未关闭。下一步客体DNS/域名映射、v86流量适配/明确重建，再做真实客体链验收。无外部阻塞，允许继续。仅本地修改和提交，无push/部署/迁移/生产数据操作；未新增加密或备份任务。


## 2026-09-30：LC-007 正式授权DNS控制面完成，客体接线待续

- 在显式egress授权通道新增`resolve-destination`/`destination-resolved`，只接受三个精确域名；共享完整A+AAAA目的政策，返回单个canonical public IPv4。IPv6-only不能冒充当前IPv4客体DNS成功，无DoH/通用递归/探针合成表。
- 单调requestId、最多3个pending、与TCP共享8个authority资源，独立5秒截止/abort/租约释放。每次track使用唯一回调，完成只释放自己的槽位；非法同批消息同步撤销，迟到答复不能复活。
- 浏览器正式客户端新增Promise `resolve()`，冻结返回值，严格关联ID/域名/地址，控制消息不进入WISP回调；关闭/超时拒绝所有pending且不重试。DNS结果不赋予裸IP权限，每次TCP域名CONNECT仍独立重新解析/固定目标。
- 新增6项DNS、3项客户端DNS、8项真实Worker/D1集成：从正式客户端取DNS后再开真实本地TCP，共两次独立DNS；取消真实resolver、未授权/control-only/非法批量不DNS；取续租票及服务端消费等待期间依旧遵守旧lease。
- fresh VM **328/328**，0失败/取消/跳过（约41秒），checklist **9/9**；tsc --noEmit、node --check、browser ESM bundle **12364bytes**、git diff --check通过。四项临时变异均检出并还原，恢复后DNS/客户端 **33/33**。日志`/private/tmp/connector-dns-vm-regression.log`、`/private/tmp/connector-dns-integration.log`、`/private/tmp/connector-dns-mutation-{resource,deadline,domain,client-address}.log`。
- 本轮没有重跑六套Worker217项，不把旧结果当作新验证。仍无真实VM联网、公网业务访问或生产验收；下一步v86客体DNS报文/有界关联表/TCP接线。总表仍30原始/29范围/5完成/24剩余，仅关闭DNS控制面子项，不关闭LC-007/D04/G0；无push/部署/迁移。


## 2026-09-30 03:47：LC-007 固定v86报文适配及正式同链接线

- 新增`guest-network.mjs`：只接受暂停的新v86 fetch/static实例，移除实例默认HTTP回调并禁用native fetch/connect/probe；不替换全局WebSocket、不启用原生WISP自动重连。实际ARP/DHCP/TCP仍使用已安装v86状态机。
- 校验Ethernet/IPv4/TCP/UDP/DNS边界及校验和；本地DHCP限router/broadcast和客体MAC，DNS仅router:53、三精确域名。正式resolve的A结果保留30秒，AAAA空答复，未知名拒绝；替换/过期/同址歧义不能扩大域名权限。TCP只提交关联域名80/443，每次服务端再独立解析。
- 8流、独立16帧credit、每流256KiB/256块上传队列及256KiB下载ring，15秒idle和延迟timer前校验。慢客体超上限失败关闭；**尚非按客体读取进度的下载背压**。客体FIN先排完已收上行，服务端CLOSE先排完已收下行，显式取消立即清理且抑制迟到答复。
- TDD实际发现并修复：错误调用不存在的ring.clear；服务端CLOSE立即release截断已收数据；独立idle期限遗漏；off-router DHCP误入本地响应。真实固定V86、独立报文夹具15项绿；没有用伪造TCPConnection替代实现。
- 新增一条**同链**：真实v86 Ethernet→正式client→真实Worker/D1签发/consume→正式connector→公共地址政策解析→本机TCP。DNS及随后CONNECT各解析一次，来回字节及取消真实peer关闭通过。CPU暂停、夹具注入报文和受控最终地址，**不是Linux启动、公网目标、自带浏览器或生产验收**。
- 五项最终变异（关联期限、idle、native HTTP回调、双层下载容量防线、跨流credit误归属）均检出并恢复。单独移除显式容量检查仍由native ring上限拦截，不误称该单层变异检出；移除两层后测试确实失败。
- 变异恢复后fresh VM **344/344**，0失败/取消/跳过，42.1秒；checklist测试 **9/9**，审计29范围/5完成/24剩余；tsc --noEmit、node --check、browser ESM bundle（12.5KiB）、git diff --check通过。日志`/private/tmp/connector-guest-vm-regression.log`、`/private/tmp/connector-guest-unit.log`、`/private/tmp/connector-guest-mutation-*.log`。未重跑独立六套Worker217项，不使用旧结果替代本轮验证。
- 仅关闭细化计划的报文适配子项；LC-007/D04/G0仍开放，LC-008至015尚未越级。下一步真实Linux客体同链及关闭/重建/恢复，产品生命周期接线仍未完成。仅本地代码/提交，无push、部署、远程迁移或生产凭据操作；无新增加密/备份范围。


## 2026-09-30 04:07：LC-007 真实Alpine正式链/恢复验收关闭

- 新增独立 `npm run test:browser-vm:connector-linux`；固定镜像资产缺失会失败，不以skip计为成功。共享真实Worker/D1授权夹具提取到 `scripts/helpers/connector-authority-fixture.mjs`，既有集成用例行为不变。
- 资产来自Alpine官方CDN ISO与v86官方copy.sh BIOS；ISO内提取kernel/initrd，全部六项大小/SHA-256通过仓库固定清单校验。资产只在 `/private/tmp/memory-garden-formal-guest/{boot,iso}`，无新增依赖或宿主安装。GitHub raw BIOS下载连接失败后使用v86官方源；未更改代理、证书根或安全设置。
- Node运行真实v86/Alpine CPU与用户态，客体DHCP/DNS/wget经过正式客户端、实际Worker/D1签发和消费、正式连接器及实际本机HTTP socket。DNS返回固定公网地址，dial先断言已固定目的/端口/族/禁用自动选族，再映射本机服务；不是公网TLS或自带浏览器验收。
- 成功POST；客体私网IP、8080端口、未知域名拒绝且无新增拨号。下载进行中真实保存checkpoint并关闭旧peer；恢复到无网络machine后wget失败、无自动WebSocket；显式取得新runtime generation和ticket后恢复请求成功。旧下载退出码1，原POST只出现一次，请求严格为POST /once、GET /hold、GET /after；两条授权WebSocket、三次TCP、D1消费两次。虚拟时钟推进硬租约后channel关闭，客体新请求失败，无额外拨号。
- 调试初期失败均保留边界：客体未启用eth0导致udhcpc失败，修复测试初始化；resolver注入参数误写导致系统DNS被调用，但固定地址断言在任何外部TCP前拒绝。改为正确createResolver后最终验收使用受控DNS、无宿主DNS/公网TCP。不把失败尝试描述成成功，也不声称所有尝试均无系统DNS。
- fresh增强真实Linux **1/1**，0失败/取消/跳过，38.3秒；完整快速VM **344/344**，0失败/取消/跳过，41.9秒；checklist **9/9**、实际审计29范围/5完成/24剩余、tsc --noEmit、两新增模块node --check、git diff --check通过。日志 `/private/tmp/connector-linux-recovery.log`、`/private/tmp/connector-linux-vm-regression.log`。未重新执行独立Worker217项，不把旧证据算成本轮新结果。
- 按原始范围关闭LC-007（DNS/目标/固定地址/背压与资源回收正常恶意验收）；保留慢客体超256KiB失败关闭而非读取驱动背压的限制。LC-011仅获得部分恢复证据，不提前关闭。下一步LC-008公网资源稳定直连，LC-009/010真实浏览器apk/git及后续产品生命周期仍未完成。
- 主清单原始30/范围29/完成5/剩余24，D08排除；连接器子清单7/15完成、8项剩余。D04/G0父项保持开放。无当前外部阻塞，可继续LC-008。仅本地修改和提交，未push/部署/远程迁移，未读生产秘密，未新增加密/备份门槛。


## 2026-09-30 04:14：LC-008 宿主直连验收关闭，进入LC-009

- 上一轮为实际进展：本地提交3443cde，LC-007关闭；本轮开始工作区干净，按序进入LC-008，未重开已验收子项。
- 对现有五类固定公开资源执行两轮默认地址+两轮IPv4；main索引提取git/curl版本与大小后各两轮IPv4下载。共24/24、33,994,406字节，exit0/HTTP200/TLS verify0/proxy_used0/无跳转，字节完整；静态资源重复摘要一致。rootfs固定摘要、API仓库身份、Git服务广告均核对。
- 完整逐请求DNS、远端IP、TLS/状态/字节/SHA-256及耗时收据归档 `design/browser-vm/2026-09-30-host-direct-downloads.json`；方法、命令与边界见同名md。不含任何秘密，下载正文只留临时目录，不安装宿主软件、不改网络/CA/安全设置。
- 主checklist仍原始30/范围29/完成5/剩余24，D08排除；连接器8/15完成，LC-009～015共7项剩余。D04/G0保持开放。未将宿主下载当作浏览器VM、签名安装、依赖解析或完整Git克隆验收。
- 下一步LC-009使用自带浏览器真实Alpine与正式授权连接；目前无外部阻塞。仅本地证据/清单与提交，无push/部署/迁移/生产配置变更。

## 2026-09-30：LC-011本地生命周期所有者与真实Linux验收

- 从d97a9ae继续；尊重用户跳过GitHub，不重装APK、不访问GitHub或改变网络设置。
- 新增frontend/features/environments/network-lifecycle.mjs及connector-session.mjs，实际Linux链路使用这两个模块而非测试内手工持有网络。明确连接才授权；取消、断网、页面离开、连接器关闭、快照恢复均撤销网络；迟到授权不得开socket，旧代次回调不得影响新连接；不保留凭据或客体命令，不自动重连，不销毁VM。
- 单测24/24，代次/迟到回调/单调期限/迟到授权/网络清理五项变异全部检出并还原；完整快速VM395/395，0失败/取消/跳过，46.3秒。
- 真实Worker/D1→正式WS→真实Alpine：snapshot-restore、download-cancel、browser-offline三项3/3，117.8秒。各仅2个WS、3个请求、2次D1消费、1次POST，旧peer关闭、旧下载退出1；显式新代次可请求，在线事件不自动重连；末尾测试租约到期和真实连接器server.close。
- 受控DNS固定地址映射本机HTTP，Node驱动真实v86/Alpine；不是公网TLS或实际浏览器正式页面验收。浏览器事件由EventTarget模拟，产品页面尚未引用新模块。
- 初始集成发现服务端为新generation分配新runtimeId，修正生命周期按环境而非runtimeId拒绝旧代次；测试误用server.stop导致一次失败，修正close后最终完整重跑通过。受限监听权限按审批重跑，无安全旁路。
- tsc --noEmit及两模块浏览器ESM打包通过；TS配置不覆盖新增mjs，不能宣称新增模块已静态类型检查。checklist9/9、审计29/5/24通过。日志/private/tmp/lc011-fast-vm.log与/private/tmp/lc011-linux-final.log，持久化摘要design/browser-vm/2026-09-30-network-lifecycle.json。
- LC-011只关闭已验证子步骤，正式运行时接线/真实浏览器矩阵仍开放；连接器9完成、1用户跳过未通过、5待完成。主清单29范围/5完成/24未完成。无外部阻塞，可继续正式接线；未push/发布/迁移/修改生产秘密，不增加加密或备份门槛。


## 2026-09-30：LC-011账户API网络运行时接线

- 从d039de8继续；用户跳过GitHub仍有效，不诊断公网Git、不修改VPN/代理、不重装APK。
- 新增frontend/features/environments/account-network.mjs：固定同源current→reserve→ticket→renewal，Cookie鉴权，服务端分配runtimeId/generation，客户端不发送memberId。手动设备/端口/一次性码，无自动配对、持久化或写请求自动重试。取消覆盖授权准备/连接期；10秒总期限含API耗时，响应体16KiB限制，错误不输出服务端正文或票据。
- 24/24账户单测；credentials、代次、账户epoch、响应预算、总期限五项行为变异均检出并还原。初版响应预算测试仅用无效JSON，变异未检出；改为合法超长JSON后才证实预算断言生效。总期限迟到ready测试曾检出缺陷，已修复，不将初始失败记作通过。
- 真实Worker/D1会话API/签名/消费/续租3/3，含账户变化不续租、实际DELETE后404拒绝重连。fixture仅替换浏览器fetch/Origin/Cookie边界；初次非授权监听测试中断，不计通过；授权重跑和修正测试删除路径后通过。
- 真实Alpine三组改用账户网络运行时，不再由测试手工预留/签发/续租：snapshot-restore/download-cancel/browser-offline，最终3/3、115.4秒。各2个WS、3个请求、2次消费、1次原POST；旧peer关闭、旧下载退出1，新显式连接可请求，末尾租约过期/连接器退出断网。DNS与HTTP目标受控映射本机，没有访问真实GitHub。
- 最终完整快速VM422/422、0失败/取消/跳过，49.4秒；checklist9/9、实际审计29范围/5完成/24剩余；tsc --noEmit、浏览器ESM打包40526字节及diff检查通过。mjs不在TS静态类型覆盖范围。日志/private/tmp/lc011-account-fast.log、/private/tmp/lc011-account-linux-final.log；持久化收据design/browser-vm/2026-09-30-account-network.json。
- 正式页面尚未引用账户网络模块，立即退出登录/切换账户的VM资源所有者接线及实际浏览器矩阵未完成；当前只在请求/续租/attach边界拒绝过期账户，不能声称即时登出撤销验收。LC-011/012保持开放，连接器9完成、1用户跳过未通过、5待完成，主29/5/24不变。
- 无外部阻塞，可继续正式页面/账户VM所有者接线。仅本地实现、验证与提交，不push/发布/远程迁移、不读取生产秘密，不加密或备份设新门槛。


## 2026-09-30：LC-011/012正式App账户网络边界

- 从e11402a继续，新增account-network-owner和React AccountNetworkBoundary，正式App已包裹该边界；上下文按member和本地epoch隔离。owner只管网络，不冒充VM引擎/存储所有者。默认不发起连接，不保存配对码。
- 本标签退出登录在POST之前dispose全部网络和授权准备；即使HTTP失败也不恢复旧owner。沿用POST退出后GET session确认AUTH_REQUIRED的既有语义。账户切换、卸载、pagehide立即失效；StrictMode effect重放创建新的有效owner。HTTP开发壳可渲染但network仍拒绝非HTTPS。
- TDD：缺模块RED后完成实现；真实DOM测试发现HTTP开发壳崩溃并修正。会话匿名fixture改为真实AUTH_REQUIRED；App集成测试用真实React/HappyDOM及actual App，不使用假App。6项owner+8项DOM全部通过；移除owner abort、固定epoch两个变异均由断言检出，恢复后23/23（含9项checklist）通过。
- 真实Worker/D1+正式WebSocket 5/5，新增owner dispose及removeEnvironment立即关闭实际WS、30秒后无续租、旧handle不可复用两项。removeEnvironment仅接口验收，尚未连接删除UI；不宣称服务端票据已撤销或跨标签即时注销。
- 完整快速VM438/438，0失败/取消/跳过，49782.47ms；App结构契约8/8；既有配置tsc --noEmit通过，另以--ignoreConfig对新增TSX/类型声明/logout helper严格检查通过（首次显式文件命令TS5112后按提示修正）。mjs本体仍是行为测试不是静态类型检查。
- npm run build:ui通过，保留大于500kB分块提示；未运行读取秘密的总build命令。没有本轮重跑真实Alpine或原生浏览器验收，不借用前轮结果声称本轮新增边界已完成该矩阵。日志/private/tmp/account-boundary-vm-tests.log、/private/tmp/account-boundary-build.log；摘要design/browser-vm/2026-09-30-account-boundary.json。
- 主清单29范围/5完成/24未完成；连接器9完成、1用户跳过未通过、5待完成。下一步正式环境页及VM资源所有者接线；无外部阻塞。GitHub按用户要求跳过，不重装APK、不配置VPN、不push/发布/迁移、不读取生产秘密。


## 2026-10-01：正式环境元数据页面（D04 / LC-012/015子项）

- 从6d6b932继续已有成员环境设计，正式App接入/environments及workspace.vm权限；补双语字段与受权限过滤的本地fallback导航，不新增角色授权、生产菜单种子或远程迁移。现有G0限制继续约束VM运行功能，本轮只开放既有独立元数据API。
- 新增账户所属数据管理器：固定同源路径、同源cookie、不发送memberId、10秒deadline、响应成员/结构/版本校验、20条分页和类型筛选，拒绝过时读取。创建/改名/删除各分配独立operationId；未知结果保留确切body，禁新写入且仅手动重试。意图跨路由卸载保留，但账户关闭立即丢弃并清屏；不声称跨硬刷新持久化。
- 真正React页面已接新建、重命名、删除确认与重试，删除先removeEnvironment再请求；失败不恢复旧网络。明确标注只有记录，不冒充运行中VM、不自动联网、不声称物理清除本地存储。
- 新增16项行为测试包含实际App/HappyDOM CRUD及权限拒绝、路由往返保留重试、冲突不静默重基、分页校验、账户取消；实际Worker/D1链验证创建响应丢失后相同body重试只有一行、改名递增版本、删除产生version3墓碑，以及跨成员mutation不能改数据。全部仅本地临时DB，出站网络拒绝，无生产请求。
- RED阶段的输入事件失败来自测试先于DOM导入ReactDOM，修正测试初始化后通过；补充反例发现未限制创建收据version1、错误把10k查询窗口当总量上限，两项修正后通过。分页仍遵守服务端page<=500限制。
- 完整快速VM454/454（0失败/取消/跳过，50125.8875ms）；App/checklist/i18n契约30/30；限定当前根目录的3文件路由/locale29/29。第一次默认Vitest配置包含其他worktree，已用显式include重跑，只采用当前根目录结果。既有tsc和新增TS/TSX严格显式检查通过，i18n verifier通过，build:ui通过（>500kB分块警告）。未执行读取秘密的总build。
- 摘要design/browser-vm/2026-10-01-environments-page.json；完整VM日志/private/tmp/memory-garden-environment-vm-tests.log。无本轮原生浏览器/真实Linux复跑，无push/部署/迁移。主清单仍29范围/5完成/24未完成，连接器9完成/1用户跳过未通过/5待完成；D04/G0不关闭。无外部阻塞，下一步账户所属VM运行资源接线；不重新追查GitHub、不重装APK、不增备份/加密门槛。


## 2026-10-01：账户所属 VM 运行资源（D04 / LC-011/012 子项）

- 基线 `f7cd550`。新增账户VM所有者，复用元数据删除与账户退出的同一owner失效路径；独立本地页接真实Alpine终端Worker。无自动启动、重试命令或联网。锁仅约束同来源/浏览器配置文件，不声称跨来源或设备互斥。
- 固定Web Lock使用ifAvailable拒绝竞争；启动中取消立即拒绝等待，旧输出/回执不能复活状态。输出限65536个UTF-16码元，失效同步清空；确认Worker清理完成后才释放锁，清理失败保留锁直到显式成功重试。
- TDD发现并修复“booting观察者取消后仍分配Worker”；11/11所有者测试通过。完整回归还发现旧network无效ID错误码不兼容，保留INVALID_SCOPE后完整快速VM **466/466**（0失败/取消/跳过，49,867.278ms）。相关运行/服务器 **20/20**、App/checklist/i18n **30/30**；项目与新声明严格类型检查、UI构建通过（已有大chunk告警）。
- 实际Alpine Node Worker测试 **1/1**（51,776.056ms），4个Worker全部收到退出事件；验证真实UTF-8文件写读、内核6.18.35-0-virt、前台命令Ctrl+C、停止/重启、删除环境、运行中/启动中退出账户及锁最终释放。第一次测试的命令输出断言和Node事件适配错误已修正；中断失败运行不计入通过。
- 内置浏览器两个同来源标签：首标签真实启动并执行uname/验收标记；第二标签VM_BUSY；首标签停止清空输出后，第二标签成功启动；诊断账户退出显示closed且清空输出、禁用启动/发送。未点击浏览器删除按钮；删除路径证据来自上述真实Node Worker。临时标签与本地服务器已关闭，截图/private/tmp/runtime-owner-account-closed.png。
- 收据 `design/browser-vm/2026-10-01-runtime-owner.json`，日志路径在收据中。仅开发镜像/诊断身份，无正式登录或完整Chrome/Edge矩阵、生产镜像交付、push/部署/迁移，也没有重试GitHub或重装APK。
- 主清单仍 **29范围 / 5完成 / 24未完成**；连接器 **9完成 / 1用户跳过未通过 / 5待完成**。独立本地运行资源已接通，但正式App运行按钮仍未开放；快照/文件UI、跨Worker联网桥接与G0完整验收继续，不能据此关闭D04或LC-011/012。没有阻止继续本地实现的外部阻塞。


## 2026-10-01：真实共享文件与有界 Worker RPC（D04 / VM-028 子项）

- 基线f646c08；按批准文件规范补齐内存9p数据通路：共享根路径与符号链接保护、分页20/50/100、严格UTF-8文本1 MiB、上传20 MiB、无覆盖创建/改名、非递归删除及内存空间检查。编辑版本同时校验节点身份/元数据和原始字节，避免客体修改被覆盖。
- 文件操作暂停CPU并等待既有异步FS调用收敛；单请求在途，失败不重放。账户退出/环境删除立即拒绝进行中的文件请求，迟到结果不可返回旧账户；关闭不恢复VM。失败暂停不擅自恢复未知运行状态。
- 真实Alpine验证UI→客体、客体→UI/CAS冲突、保存/改名/下载、链接边界、分页及关闭。补充实际已打开文件删除负例发现v86拒绝UNLINKED读取，已修复为FILE_IN_USE前置拒绝，客体继续读、关闭后删除均通过；不更改上游引擎、不吞掉错误。已无引用的文件删除回收内存，未知fid表保守不释放。
- 聚焦32/32、完整快速VM477/477（50.4秒）、checklist9/9；最终实际文件测试1/1（18.2秒）且Worker退出。本轮账户运行生命周期真实4个Worker回归通过，时间点早于最终仅删除行为修正，未将它冒充修正后的复跑。项目类型、新声明严格类型及UI构建通过（既有大包警告）。沙箱中断不计通过，完整快速回归经监听器权限批准后重跑通过。
- 收据 `design/browser-vm/2026-10-01-shared-files.json`。本轮未作原生浏览器文件面板验收；当前下载RPC上限20 MiB，较大文件流式下载、正式文件面板/批量取消、知识提交、持久存储/完整512 MiB恢复仍待完成。共享内存预算128 MiB不是浏览器持久配额保障，也不是客体写入上限。
- 主清单 **29范围 / 5完成 / 24未完成**；连接器 **9完成 / 1用户跳过未通过 / 5待完成**。只关闭本地文件数据通路子项，VM-028/D04/G0继续开放。下一项文件面板与取消/编辑交互，无外部阻塞、允许继续；无push、部署、远程迁移、生产秘密读取、GitHub重试或APK重装。


## 2026-10-01：共享文件面板（D04 / VM-028 子项）

- 基线 `e1ed3eb`。新增账户/epoch所有的易失文件控制器与同一可复用中英文shadcn面板；独立本地验收页连接真实Alpine Worker。正式App运行页仍受G0约束，没有暗中开放运行按钮。
- 支持20/50/100数字分页、目录操作、确认删除、顺序批量上传逐项结果；取消仅停止未发送工作，等待已发送回执，不重放或声称回滚。1 MiB UTF-8编辑，客体并发修改触发CAS冲突并保留草稿，明确重载或无覆盖另存。当前上传/下载仍限20 MiB，不冒充大文件流式下载。
- 账户/环境失效清空正文、列表、弹窗与结果，撤销Blob URL；运行对象替换和epoch变化防止旧视图/旧下载链接泄漏。TDD发现环境切换弹窗残留并修复；原生检查发现独立页内联CSS受CSP阻止，改为同源静态CSS，无unsafe-inline。
- 新增控制器/真实React组件12/12，最终快速VM **490/490**（0失败/取消/跳过，50,386.331ms）；项目类型、新组件严格类型和UI构建通过（已有大chunk告警）。沙箱内停滞运行不计通过，经监听权限批准后最终整套复跑通过。
- 自带浏览器真实Alpine：26文件按20显示20+6，改50显示26；客体并发改写后保存产生FILE_CONFLICT且保留草稿，另存副本后终端确认原件和副本各自内容；退出诊断账户变为closed并清空终端与面板。没有通过原生UI执行删除、改名、上传，它们的证据仅为控制器/组件测试。
- 点击显式“保存到本机”后，原生自动化下载事件超时，但本机 `/Users/doug/Downloads/acceptance.txt` 确认存在：2026-10-01T01:36:05+08:00新写入、18字节、内容 `verified-download\n`，SHA256 `a043a2ee144a1f0ed7356a35d4c2673d4e2067c7d5c6dbe0a65397222ceeac6b`。以实际落盘核验为依据，不把事件超时记成通过。截图 `/private/tmp/vm-file-panel-verified.png`。最终仅运行对象/epoch渲染保护晚于原生bundle启动，覆盖来自最终490项回归和严格类型，不声称这些最后保护已原生复跑。
- 收据 `design/browser-vm/2026-10-01-file-panel.json`。主清单仍 **29范围 / 5完成 / 24未完成**，连接器 **9完成 / 1用户跳过未通过 / 5待完成**。关闭本地文件面板子项，不关闭VM-028/D04/G0；下一项较大文件流式下载，无阻止继续本地开发的外部阻塞。知识提交、持久存储/完整恢复、Worker联网桥接与生产矩阵保留。无push、部署、迁移、生产秘密读取、GitHub重试或APK重装。


## 2026-10-01：大文件分块流式保存（D04 / VM-028 本地实现子项）

- 基线65b49c1；begin/chunk/end下载租期固定1 MiB最大块，严格顺序offset和一次在途。客体暂停保持同一文件视图；end或30秒空闲释放后恢复，账户关闭不复活。复用现有Worker传输，没有整文件复制/Blob集合或后台重试。
- 面板在用户手势内打开系统保存选择器；逐块await写入、进度和取消、账户epoch失效abort。失败只请求abort，不承诺所有磁盘适配器可回滚；已完成明文导出不会随退出删除。能力缺失明确禁用流式保存，保留≤20 MiB原有下载。正式App运行仍受G0约束。
- TDD先分别观察未知RPC、缺失写入器、缺失manager方法/面板按钮失败，再实现；适配器11/11，写入器/控制器/面板21/21。最终完整快速VM **502/502**（0失败/取消/跳过，50,106.78ms），项目和组件严格类型、UI构建（已有大chunk告警）、checklist9/9通过。
- 最终实际Alpine Node Worker文件链 **1/1**（19,752.92ms）：客体生成24 MiB+11字节，旧20 MiB RPC拒绝；25次磁盘写入、最大1 MiB，实际落盘SHA256 `a58588d4de0b66b8d271eba168493ebe3a6eb13b40c454c8dc546b0a9c0a9a38` 与客体一致。成功/取消后客体继续执行；取消只取首块、退出账户中止且不close提交，所有Worker已退出。临时落盘测试自行清理，不是原生选择器验收。
- 内置浏览器真实Alpine生成同内容stream-native.bin，列表显示25165835字节、普通下载禁用、流式保存可点；点击进入处理。检查原生保存窗口时工具报告Mac锁屏，停止原生验收、未绕过；不声称保存成功，无最终截图。独立本地服务器已停止。需解锁后补原生保存，其他本地实现不被此阻止。
- 收据 `design/browser-vm/2026-10-01-stream-download.json`。主清单 **29范围 / 5完成 / 24未完成**，连接器 **9完成 / 1用户跳过未通过 / 5待完成**。只关闭本地分块实现子项，不关闭VM-028/D04；下一项知识提交，之后持久化/恢复及Worker联网/G0。无push、部署、迁移、生产秘密读取、GitHub重试、APK重装或新增备份/加密任务。
