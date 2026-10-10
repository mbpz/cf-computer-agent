# A01 未归属源码候选逐项人工对账

基线：`eb4781fb`，分支 `codex/functional-checklist-completion`。
范围：源码人工对账；不是运行时验收。

本记录保留原索引的全部 110 个未归属坐标，逐项记录条件与行为；不修改生成器的 root、不删除未归属项，也不把 source ID 当成业务操作编号。坐标会随代码移动变化，只用于审计。原索引仍为 270 文件 / 1165 候选 / 110 未归属。分类结果是人工追溯，不是引入了 110 个新功能。

## 分类结果与下一步

| 分类 | 候选数 | 已确认的源码含义 | 尚需完成 |
| --- | ---: | --- | --- |
| app-boundary | 8 | App 外层、history fault 与账户 owner 已有正式消费 | 跨路由、真实身份/退出、导航故障旅程 |
| public-dynamic | 4 | landing 动态导入的 WebGL 生命周期 | 原生浏览器可见性、超时、context loss 与回退验收 |
| background | 3 | Service Worker 生命周期，不是可见控件 | 真实浏览器注册/缓存/离线行为 |
| unmounted-ui | 11 | ContextRail / CardFooter / Tabs 无当前正式消费者 | 按实际需求保留或接线；不得直接认定缺失业务 |
| vm-not-mounted | 84 | VM 工厂、文件面板、导入、快照或惰性网络路径未进入正式 UI | 沿既有 G0 边界完成正式接线及身份/生命周期验收 |

A01、A02、A05、D04 仍开放。源码人工分类覆盖这 110 项，但 A01 还缺每页实际可见性、动态 HTML/门户/第三方控件和触发状态的呈现核验；A02 还缺全操作到服务端授权/持久化及运行证据的闭合。禁止把文档行数、指纹或绿色测试当作上述父项验收通过。

下表“条件”与组内共同守卫叠加。状态提示、role、option、props 转发和监听器均保留；不是每一行都对应一次用户操作。未挂载项的条件均是假设调用者接线之后的源码条件，不能误读为当前正式页面已可用。

## `frontend/app.tsx`（3）

入口为 [source:frontend/main.tsx] 的 App。App 先处理 sessionError、匿名首页/登录、会话加载，再挂载 AccountNetworkBoundary、AppShell、HistoryNavigationNotice。属于全局外层，不在以业务 root symbol 为起点的图中。SettingsPage 行是 props/spread 边界，不是新的保存动作。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/app.tsx:211:75` | app-boundary | 已认证会话通过外层守卫；AppShell 内部触发导航/退出 | navigate 写入 workspace history；logout(owner) 执行账户退出，具体按钮与 pending 仍由 AppShell 控制。 |
| `frontend/app.tsx:238:39` | app-boundary | renderPage 进入 settings 且存在 session | 将 locale、member email/role 传入 SettingsPage；没有新增网络写入。 |
| `frontend/app.tsx:739:250` | app-boundary | 路由 fallback 返回 NotFoundPage | 返回首页链接 href=/；需继续验证带脏草稿时的实际导航行为。 |

## `frontend/components/history-navigation-notice.tsx`（2）

App 外层挂载：[source:frontend/app.tsx]。无 fault 时返回 null；故障消息和重试按钮是同一故障状态的两个源码候选，不是两个业务功能。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/history-navigation-notice.tsx:11:10` | app-boundary | 已登录 App 挂载且 history fault 非空 | role=alert 呈现历史导航故障；无写接口。 |
| `frontend/components/history-navigation-notice.tsx:13:5` | app-boundary | 同上且 retrying 为 false 时点击 | retryWorkspaceHistory；等待期间禁用按钮，finally 清除 pending；失败仍不视为导航完成。 |

## `frontend/components/shell/context-rail.tsx`（6）

当前第一方 frontend 源码未发现 ContextRail 的消费；不能由名称推定 AppShell 已挂载。下面是如果挂载后的条件，不是已在产品显示的证明。无需将已有 AppShell 导航再造一套；是否恢复这个组件要由需求决定。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/shell/context-rail.tsx:33:7` | unmounted-ui | 若组件挂载，共用 rail content 展示关闭控件 | onClose 回调；父组件负责 collapsed 状态。 |
| `frontend/components/shell/context-rail.tsx:36:32` | unmounted-ui | 若组件挂载，按可见 modules 循环 | go(event,module.entryPath)；使用传入 onNavigate 或浏览器链接。 |
| `frontend/components/shell/context-rail.tsx:38:296` | unmounted-ui | 若挂载且未折叠，children 非空 | 对每个子路由执行 go(event,route.path)。 |
| `frontend/components/shell/context-rail.tsx:39:37` | unmounted-ui | 若挂载且未折叠，currentModule 存在 | go(event,currentModule.entryPath) 打开当前模块。 |
| `frontend/components/shell/context-rail.tsx:46:60` | unmounted-ui | 若挂载，移动触发器可见时点击 | setMobileOpen(true)，打开 Sheet。 |
| `frontend/components/shell/context-rail.tsx:47:5` | unmounted-ui | 若挂载，Sheet 的打开状态改变 | setMobileOpen；关闭/焦点行为需真实组件旅程验收。 |

## `frontend/components/ui/card.tsx`（1）

Card 的其他导出有正式消费者，不代表 CardFooter 有消费者。仅 CardFooter 候选未归属；检查当前 frontend 未发现其消费。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/ui/card.tsx:13:85` | unmounted-ui | 若未来挂载 CardFooter 并传入 div props | 通用容器转发 props/children；不能因为 spread 就计为独立用户动作。 |

## `frontend/components/ui/tabs.tsx`（4）

当前 frontend 未发现此 Tabs 模块消费；不将 role=tab 的可复用实现当作当前可见产品页面。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/ui/tabs.tsx:35:93` | unmounted-ui | 若 Tabs 根组件挂载 | Provider 提供 value、orientation 等上下文；div 转发 props。 |
| `frontend/components/ui/tabs.tsx:40:10` | unmounted-ui | 若 TabsList 挂载且键盘动作未被 preventDefault | 按方向及 Home/End 选择未禁用 tab，调用 setValue 并移动焦点；当前为自动激活。 |
| `frontend/components/ui/tabs.tsx:66:10` | unmounted-ui | 若 TabsTrigger 挂载、点击未被阻止且未 disabled | context.setValue(value)；受控状态由调用者负责。 |
| `frontend/components/ui/tabs.tsx:74:10` | unmounted-ui | 若 TabsContent 挂载且其 value 为 active | 显示对应 panel；非 active 使用 hidden；这是语义/焦点候选而非写操作。 |

## `frontend/features/environments/account-network-owner.mjs`（2）

[source:frontend/features/environments/account-network-boundary.tsx] 在已验证 member 的 layout effect 创建 owner，并在卸载/账户切换 dispose；App 实际挂载此 boundary。只建立生命周期注册表，不启动 VM 或连接器。network(environmentId) 仍为惰性工厂。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/account-network-owner.mjs:23:3` | app-boundary | 已认证账户 owner 创建且 BroadcastChannel 可用 | 监听同 origin/member 的 invalidate 提示并 dispose；消息不是删除/授权凭证。 |
| `frontend/features/environments/account-network-owner.mjs:45:3` | app-boundary | owner 创建且传入 window events | pagehide 清理账户 owner、通道和已有网络实例；effect 清理也走 dispose。 |

## `frontend/features/environments/account-network.mjs`（3）

仅由 owner.network(environmentId) 惰性创建；当前 frontend 未找到该方法的实际调用。owner 本身已接线不代表这个实例已创建。内部 lifecycle 未传 events，因此其可选 DOM listeners 不应又算一套已激活监听。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/account-network.mjs:16:5` | vm-not-mounted | 显式网络连接流程调用 cancellable，传入未终止 signal | abort 拒绝等待的异步操作，取消后拒绝迟到结果。 |
| `frontend/features/environments/account-network.mjs:164:3` | vm-not-mounted | 未来 network 工厂被调用且 events 存在 | offline 停止当前网络；不自动重连。 |
| `frontend/features/environments/account-network.mjs:165:3` | vm-not-mounted | 未来 network 工厂被调用且 events 存在 | pagehide 终止实例；不保留可复用旧会话。 |

## `frontend/features/environments/account-vm-runtime.mjs`（1）

[source:tools/browser-vm/runtime-owner-browser.mjs] 显式创建此 runtime；正式前端只在未消费的 authenticated-vm-runtime 组合中引用。该 harness 并非产品环境路由。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/account-vm-runtime.mjs:63:3` | vm-not-mounted | 显式创建 runtime 后，owner.signal 被终止 | cancel(ACCOUNT_CLOSED) 并退订；创建 runtime 不等于自动 boot。 |

## `frontend/features/environments/authenticated-vm-runtime.ts`（1）

当前 frontend 未找到 createAuthenticatedVmRuntime 调用；G0 通过后才允许正式挂载。组合的 beforeStart 每次先校验 /api/session 和环境元数据，不回退缓存授权。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/authenticated-vm-runtime.ts:43:9` | vm-not-mounted | 未来显式 start/restore 进入 beforeStart，合并 signal 被取消/超时 | 拒绝 authority 查询等待；401/403 撤销 owner，finally 清计时器/监听器；未成功校验不读本地 VM bytes。 |

## `frontend/features/environments/connector-session.mjs`（1）

由 [source:frontend/features/environments/account-network.mjs] 在显式 connect/open 中创建，继承该工厂尚未被正式页面调用的边界。不是浏览器打开页面即联网。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/connector-session.mjs:24:2` | vm-not-mounted | 显式创建连接器会话并取得 lifecycle signal | abort 执行会话清理；不能把监听器注册当作握手、外网转发或设备授权成功。 |

## `frontend/features/environments/files/asset-import-panel.tsx`（23）

由 FilesPanel 在 assetImporter 存在时挂载；模型要求 submission.memberId 非空。共同条件为 state.kind 非 idle；busy 合并模型和 workflow 状态。harness 未传 submission，不能因导入此文件就宣称 UI 可用。A02 的下游为 [source:frontend/features/environments/files/asset-import.ts] 和既有 asset-workflow。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/files/asset-import-panel.tsx:24:37` | vm-not-mounted | canUpload 为真且未 busy，用户确认原文件 | setUploadAck；仅修改明确上传确认状态。 |
| `frontend/features/environments/files/asset-import-panel.tsx:25:7` | vm-not-mounted | canUpload、已 uploadAck、未 busy 且无 storage 错误 | model.upload，重试固定同一文件/意图；不自动解析。 |
| `frontend/features/environments/files/asset-import-panel.tsx:30:7` | vm-not-mounted | flow.intent 存在且未 busy | model.refresh 回读服务端状态，不重放写入。 |
| `frontend/features/environments/files/asset-import-panel.tsx:32:9` | vm-not-mounted | job 为 queued 或 failed_retryable 且未 busy | model.parse 显式启动/重试解析。 |
| `frontend/features/environments/files/asset-import-panel.tsx:33:9` | vm-not-mounted | job 为 queued 或 failed_retryable 且未 busy | model.cancel 请求取消服务端待处理资产。 |
| `frontend/features/environments/files/asset-import-panel.tsx:35:33` | vm-not-mounted | job 为 failed_terminal 且未 busy | releaseFailed 解除失败本地意图，保留服务端资产。 |
| `frontend/features/environments/files/asset-import-panel.tsx:36:36` | vm-not-mounted | job 为 succeeded、尚无 review 且未 busy | previewParsed 回读已解析内容。 |
| `frontend/features/environments/files/asset-import-panel.tsx:39:9` | vm-not-mounted | review 已锁定且未 busy | retrySubmission 重试原审核载荷，不使用当前编辑字段。 |
| `frontend/features/environments/files/asset-import-panel.tsx:42:20` | vm-not-mounted | state.parsed 存在 | 可聚焦 pre 显示字面解析 Markdown；不是执行 HTML 或提交动作。 |
| `frontend/features/environments/files/asset-import-panel.tsx:44:58` | vm-not-mounted | parsed 存在且无 review、未 busy | 更新本地审核标题。 |
| `frontend/features/environments/files/asset-import-panel.tsx:45:99` | vm-not-mounted | parsed 存在且无 review、未 busy | 更新 requestedSpaceId；服务端仍需校验目标权限。 |
| `frontend/features/environments/files/asset-import-panel.tsx:46:68` | vm-not-mounted | parsed 存在且无 review、未 busy | 更新本地 shared/admin_only 请求范围。 |
| `frontend/features/environments/files/asset-import-panel.tsx:46:180` | vm-not-mounted | 审核范围 Select 可编辑 | shared 选项；最终范围仍受服务端审核约束。 |
| `frontend/features/environments/files/asset-import-panel.tsx:46:230` | vm-not-mounted | 审核范围 Select 可编辑 | admin_only 选项；不代表已发布或权限提升。 |
| `frontend/features/environments/files/asset-import-panel.tsx:47:37` | vm-not-mounted | parsed 存在且无 review、未 busy | 更新明确审核确认 reviewAck。 |
| `frontend/features/environments/files/asset-import-panel.tsx:48:7` | vm-not-mounted | editable、reviewAck、标题/空间非空且未 busy | model.submit 固定目标与 acknowledged；请求审核而非发布。 |
| `frontend/features/environments/files/asset-import-panel.tsx:50:34` | vm-not-mounted | state.error 或 flow.error 非空 | role=alert 显示错误与未确认结果；对象存储不可用时不上传，也不退化为直接发布。 |
| `frontend/features/environments/files/asset-import-panel.tsx:51:32` | vm-not-mounted | flow.kind 为 submitted | role=status 显示 submissionId；不当作发布完成。 |
| `frontend/features/environments/files/asset-import-panel.tsx:52:31` | vm-not-mounted | flow.kind 为 canceled | role=status 显示服务端取消已确认；不同于停止本地等待。 |
| `frontend/features/environments/files/asset-import-panel.tsx:53:31` | vm-not-mounted | flow.kind 为 released | role=status 显示失败本地意图已解除，服务端资产仍保留。 |
| `frontend/features/environments/files/asset-import-panel.tsx:54:5` | vm-not-mounted | 非 idle 的资产面板内点击我的提交 | href=/my-submissions 导航；读取结果与权限仍由目标页面负责。 |
| `frontend/features/environments/files/asset-import-panel.tsx:55:12` | vm-not-mounted | busy 时用户点击停止等待 | model.stop；只停止本地等待，不宣称撤销服务端处理。 |
| `frontend/features/environments/files/asset-import-panel.tsx:56:5` | vm-not-mounted | 非 idle 且未 busy，用户关闭 | model.close；保留成员未决恢复元数据。 |

## `frontend/features/environments/files/files-panel.tsx`（34）

实际消费者是 [source:tools/browser-vm/runtime-owner-browser.mjs]，其仅传 runtime/locale，未传 submission；因而该 harness 不提供两个导入模型。正式 [source:frontend/features/environments/environments-page.tsx] 未挂载 FilesPanel。FileView 的共同条件为 state.available；blocked=busy、editor、文本导入打开或资产导入打开。各行额外条件如下；所有选项/提示也保留，不把每行等同用户动作。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/files/files-panel.tsx:27:129` | vm-not-mounted | binding 与当前 runtime/member/requester 全部一致 | 向 FileView 传递 manager/importer/assetImporter 和剩余 props；旧绑定不渲染。 |
| `frontend/features/environments/files/files-panel.tsx:73:7` | vm-not-mounted | 文件可用、未 blocked 且非根目录 | manager.load 父目录第 1 页。 |
| `frontend/features/environments/files/files-panel.tsx:74:7` | vm-not-mounted | 文件可用且未 blocked | manager.load 刷新当前目录，不重放前次写入。 |
| `frontend/features/environments/files/files-panel.tsx:75:7` | vm-not-mounted | 文件可用且未 blocked | openModal(mkdir)；这里只打开新建目录确认框。 |
| `frontend/features/environments/files/files-panel.tsx:76:41` | vm-not-mounted | 文件可用、未 blocked 且用户选择至少一个文件 | 清空 input 后 manager.upload(files)，批量逐项处理。 |
| `frontend/features/environments/files/files-panel.tsx:77:22` | vm-not-mounted | 正在 busy 且未 cancelling | manager.cancel；只取消未发送工作，不宣称回滚已发送写入。 |
| `frontend/features/environments/files/files-panel.tsx:79:41` | vm-not-mounted | prepared.epoch 等于当前 epoch | role=status 呈现本地下载已准备及字节数。 |
| `frontend/features/environments/files/files-panel.tsx:79:58` | vm-not-mounted | 同一 epoch 的 prepared URL 存在，用户点击链接 | 浏览器 download 保存 Blob；不等于已取得原生落盘验收。 |
| `frontend/features/environments/files/files-panel.tsx:80:21` | vm-not-mounted | state.error 非空 | role=alert 显示映射错误或原错误码；不触发自动重试。 |
| `frontend/features/environments/files/files-panel.tsx:81:5` | vm-not-mounted | 文件可用时常驻状态区域 | 显示 notice 或 Working 状态，无独立操作。 |
| `frontend/features/environments/files/files-panel.tsx:83:23` | vm-not-mounted | 没有 openDownload 或原生保存能力 | 呈现流式保存不可用提示；不得伪装可流式落盘。 |
| `frontend/features/environments/files/files-panel.tsx:87:40` | vm-not-mounted | entry.type 为 directory 且未 blocked | manager.load 子目录第 1 页。 |
| `frontend/features/environments/files/files-panel.tsx:88:37` | vm-not-mounted | entry 为 file、未 blocked 且 bytes 不超过 1 MiB | manager.open 文本编辑；开始前清空另存名称。 |
| `frontend/features/environments/files/files-panel.tsx:88:198` | vm-not-mounted | entry 为 file、未 blocked 且 bytes 不超过 20 MiB | manager.download 后 receive 创建 Blob URL 或调用注入回调。 |
| `frontend/features/environments/files/files-panel.tsx:88:359` | vm-not-mounted | entry 为 file、未 blocked 且 openDownload 存在 | manager.downloadTo，显式调用保存选择器/注入 sink。 |
| `frontend/features/environments/files/files-panel.tsx:88:562` | vm-not-mounted | entry 为非空 file、不超过 128 KiB、importer 存在且未 blocked | importer.select 冻结文本快照；尚未提交审核。 |
| `frontend/features/environments/files/files-panel.tsx:88:789` | vm-not-mounted | entry 为非空 file、不超过 20 MiB、assetImporter 存在且未 blocked | assetImporter.select 冻结原文件；尚未上传。 |
| `frontend/features/environments/files/files-panel.tsx:89:58` | vm-not-mounted | entry 为 file 或 directory 且未 blocked | openModal(rename,entry.name)，不立即重命名。 |
| `frontend/features/environments/files/files-panel.tsx:89:162` | vm-not-mounted | entry 为 file 或 directory 且未 blocked | openModal(remove,entry.name)，不立即删除。 |
| `frontend/features/environments/files/files-panel.tsx:93:7` | vm-not-mounted | 未 blocked 且 page 大于 1 | manager.load 同目录上一页。 |
| `frontend/features/environments/files/files-panel.tsx:95:7` | vm-not-mounted | 未 blocked 且 page 小于 pages | manager.load 同目录下一页。 |
| `frontend/features/environments/files/files-panel.tsx:96:7` | vm-not-mounted | 未 blocked，改变每页数量 | manager.load 当前目录第 1 页，页大小为 20/50/100。 |
| `frontend/features/environments/files/files-panel.tsx:96:224` | vm-not-mounted | 分页 Select 按 20/50/100 循环选项 | options 依附父 Select；不是三个独立 API。 |
| `frontend/features/environments/files/files-panel.tsx:99:23` | vm-not-mounted | assetImporter 存在且未 blocked | recover 回读当前成员未决资产，不自动重放上传。 |
| `frontend/features/environments/files/files-panel.tsx:102:7` | vm-not-mounted | editor 存在且未 busy | manager.edit 更新编辑草稿；不直接写客体文件。 |
| `frontend/features/environments/files/files-panel.tsx:103:45` | vm-not-mounted | editor 存在、dirty、无 conflict 且未 busy | manager.save，使用已有编辑版本校验。 |
| `frontend/features/environments/files/files-panel.tsx:104:9` | vm-not-mounted | editor 存在且未 busy，明确点击丢弃重读 | manager.open 当前名称；这是显式丢弃草稿操作。 |
| `frontend/features/environments/files/files-panel.tsx:105:9` | vm-not-mounted | editor 存在且未 busy，明确点击关闭 | manager.closeEditor 并清空副本名称。 |
| `frontend/features/environments/files/files-panel.tsx:106:43` | vm-not-mounted | editor 存在且未 busy，改变副本名称 | setSaveName；仅更新本地表单状态。 |
| `frontend/features/environments/files/files-panel.tsx:107:7` | vm-not-mounted | editor 存在、未 busy 且副本名非空 | manager.saveAs 后清空副本名；不覆盖原文件。 |
| `frontend/features/environments/files/files-panel.tsx:110:5` | vm-not-mounted | modal.epoch 等于当前 epoch | Dialog 可见；onOpenChange 关闭时清空 modal/name。 |
| `frontend/features/environments/files/files-panel.tsx:112:141` | vm-not-mounted | 确认框已打开且 action 非 remove | 名称输入更新本地 name，用于 mkdir/rename。 |
| `frontend/features/environments/files/files-panel.tsx:113:35` | vm-not-mounted | 确认框打开、未 busy，非删除时名称非空 | confirm 再核对 epoch，关闭框后分派 mkdir/rename/remove。 |
| `frontend/features/environments/files/files-panel.tsx:113:178` | vm-not-mounted | 确认框打开，用户点击取消 | 清空 modal/name；不调用文件写入。 |

## `frontend/features/environments/files/knowledge-import-panel.tsx`（14）

由 FilesPanel 在 importer 存在时挂载；共同条件为非 idle。editable 仅 kind=preview，busy 为 reading/sending。下游 [source:frontend/features/environments/files/knowledge-import.ts] 使用 createSubmission，不自行发布；未知状态保留原载荷/键。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/files/knowledge-import-panel.tsx:18:12` | vm-not-mounted | kind 为 reading 或 sending | role=status 显示等待回执，不是提交成功。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:21:7` | vm-not-mounted | state.preview 存在 | 可聚焦 pre 呈现冻结文件的字面内容，不随之后 VM 编辑改变。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:22:49` | vm-not-mounted | preview 存在且 editable | 更新本地标题；unknown/sending 状态不可改写原意图。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:23:99` | vm-not-mounted | preview 存在且 editable | 更新请求空间 ID；服务端决定是否允许。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:24:98` | vm-not-mounted | preview 存在且 editable | 更新请求可见范围；不是已发布范围。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:24:215` | vm-not-mounted | preview 内的范围 Select 可编辑 | shared 选项，继承父 Select 禁用状态。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:24:265` | vm-not-mounted | preview 内的范围 Select 可编辑 | admin_only 选项，继承父 Select 禁用状态。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:25:49` | vm-not-mounted | preview 存在且 editable | 用户确认内容/目标/无密钥，更新 ack。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:26:18` | vm-not-mounted | editable 且 ack、标题和空间非空 | model.confirm 冻结 draft/target/key 并提交审核。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:28:19` | vm-not-mounted | state.error 存在 | role=alert 显示未知/格式/校验错误，不自动重放。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:29:30` | vm-not-mounted | kind 为 unknown，用户显式点击 | model.retry 使用原键和原载荷。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:30:32` | vm-not-mounted | kind 为 submitted | role=status 显示 receipt.id 及查看审核状态提示；不是发布成功。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:31:58` | vm-not-mounted | kind 为 unknown 或 submitted | href=/my-submissions 查询提交；不是精确操作编号查询的替代证明。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:32:37` | vm-not-mounted | 非 busy 且 kind 非 unknown | model.close；unknown 状态不提供丢弃原意图的关闭按钮。 |

## `frontend/features/environments/files/stream-download.mjs`（2）

[source:frontend/features/environments/files/file-manager.mjs] 的 downloadTo 调用 writeFileDownload；依赖用户选择 sink 和真实 runtime.file。文件面板尚未正式挂载，所以此 helper 不构成正式下载功能验收。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/files/stream-download.mjs:15:3` | vm-not-mounted | 显式流式保存且传入 signal，signal abort | abortSink 并停止后续读取；不收集整个文件到 Blob。 |
| `frontend/features/environments/files/stream-download.mjs:22:42` | vm-not-mounted | 每次等待磁盘写入时 signal abort | 拒绝本次写入等待；finally 清监听/释放下载租期，只有 sink.close 成功才算 committed。 |

## `frontend/features/environments/network-lifecycle.mjs`（2）

由 account-network 创建时未传 events，下面两个可选事件注册不会由该路径激活；其他显式调用者若传 events 才启用。不能把 optional listener AST 当成实际已注册。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/network-lifecycle.mjs:67:2` | vm-not-mounted | 创建 lifecycle 且显式传入 events，随后 offline | end(browser-offline)，取消当前尝试，不自动重连。 |
| `frontend/features/environments/network-lifecycle.mjs:68:2` | vm-not-mounted | 创建 lifecycle 且显式传入 events，随后 pagehide | end(page-hidden,true)，终止实例并清监听。 |

## `frontend/features/environments/storage/checkpoints.mjs`（2）

[source:tools/browser-vm/runtime-owner-browser.mjs] 和 [source:tools/browser-vm/checkpoint-recovery-browser.mjs] 创建 store；正式前端未找到 createCheckpointStore 调用。此为成员/环境本地 IndexedDB 快照，不是新增备份或加密要求。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/storage/checkpoints.mjs:49:42` | vm-not-mounted | checkpoint transaction 已创建且传入 signal，取消发生 | abort 对应 IndexedDB transaction；不将发出请求视为提交完成。 |
| `frontend/features/environments/storage/checkpoints.mjs:128:3` | vm-not-mounted | checkpoint store 已创建，账户 owner 被终止 | close 清理事务/连接；物理擦除证明不由此得出。 |

## `frontend/features/environments/storage/reconcile-checkpoints.ts`（1）

当前 frontend 未找到 reconcileAccountCheckpoints 调用。与 checkpoints 必须同 owner.scope；只基于服务端 tombstones 删除本地副本，不以分页缺项推断删除。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/storage/reconcile-checkpoints.ts:30:80` | vm-not-mounted | 未来显式对账读取 /api/environments/tombstones；signal/timeout 取消 | Promise.race 拒绝等待；finally 清理；401/403 撤销 owner。 |

## `frontend/lib/workspace-location.ts`（1）

[source:frontend/components/history-navigation-notice.tsx] 通过 useSyncExternalStore 订阅 fault；这是跨路由外层消息机制，不是未接线的业务页。这里只登记未归属的 fault 监听，已归属的 location-change 不重复计算。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/lib/workspace-location.ts:63:3` | app-boundary | HistoryNavigationNotice 订阅，owner 发出 WORKSPACE_HISTORY_FAULT_EVENT | listener 更新 fault snapshot；取消订阅移除监听器。 |

## `frontend/pages/workbench-landing/workbench-scene-runtime.ts`（4）

[source:frontend/pages/workbench-landing/workbench-scene.tsx] 在可见且自动策略允许或显式手动请求时动态 import，再调用 createWorkbenchScene；预算到期、卸载和失败均取消。外层消费者链为 [source:frontend/pages/workbench-landing/public-workbench-page.tsx]。AST 静态 import 图遗漏不意味着未接线；WebGL canvas 是 aria-hidden 且 pointerEvents=none，不是四个可点击业务功能。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/pages/workbench-landing/workbench-scene-runtime.ts:50:3` | public-dynamic | 场景启动并进入 loadModel，options.signal 被取消 | 中止模型加载/解析等待，清理迟到资源。 |
| `frontend/pages/workbench-landing/workbench-scene-runtime.ts:127:5` | public-dynamic | 模型就绪并建立 canvas，收到 webglcontextlost | contextLost 进入失败/清理路径，交给外层显示回退。 |
| `frontend/pages/workbench-landing/workbench-scene-runtime.ts:260:5` | public-dynamic | 场景成功初始化，document visibilitychange | 停止不可见帧或恢复允许绘制的场景，不触发网络写入。 |
| `frontend/pages/workbench-landing/workbench-scene-runtime.ts:262:5` | public-dynamic | 场景成功初始化，options.signal 被取消 | dispose 释放渲染、监听器及模型资源。 |

## `frontend/public/sw.js`（3）

[source:frontend/main.tsx] 在 navigator 支持 serviceWorker 时注册 /sw.js，失败 catch 不证明注册成功。三个监听是后台生命周期，不计作三个可见按钮；真实浏览器缓存行为仍需验收。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/public/sw.js:4:1` | background | Service Worker install | 缓存 shell 资源后 skipWaiting；不缓存 /api 私有响应的证据需结合 fetch 路径。 |
| `frontend/public/sw.js:7:1` | background | Service Worker activate | clients.claim 接管当前来源客户端。 |
| `frontend/public/sw.js:10:1` | background | fetch 为同源 GET 且非 /api/、/auth/ | navigation 网络优先失败回退 index；脚本/样式/字体/图片缓存优先；其他请求不接管。 |

## A02 接口/持久化追溯边界

本批没有改变这些实现，也没有运行其所有业务验收。下面记录已核对的直接调用层，避免下一轮重新从候选猜测；现有测试位置是待执行入口，不是本轮通过证据。

| 范围 | 直接调用及副作用 | 后续核验入口 |
| --- | --- | --- |
| App / history | navigate、retryWorkspaceHistory、logoutAccount；浏览器 history 与账户生命周期，不是业务表写入 | `test/unit/frontend-workspace-history-traversal.test.ts`；需重跑真实跨路由/身份行为 |
| VM 网络 | account-network 按 environmentId 构造 /api/environments/ 下授权请求；连接器独立验证授权；owner 只负责本地失效 | `scripts/browser-vm-account-network.test.mjs`、`scripts/browser-vm-account-network-integration.test.mjs`；当前无正式 network() caller |
| 客体文件 | file-manager -> runtime.file，文件协议/RPC；stream-download 顺序写用户 sink，无 Cloudflare 文件上传 | `scripts/browser-vm-file-panel.test.mjs`、`scripts/browser-vm-stream-download.test.mjs`；原生文件选择器/落盘仍另验 |
| 文本审核 | knowledge-import -> createSubmission(original.draft, original.key, requester, signal, original.target)；原键/载荷重试，不自动发布 | `scripts/browser-vm-knowledge-import.test.mjs`；补正式 member/能力/会话注入后再验服务端身份 |
| 资产审核 | asset-import -> loadAssetAvailability/createAssetWorkflow；原文件读 VM，解析预览 GET /api/assets/:id/preview；上传/解析/提交由既有 workflow 负责 | `scripts/browser-vm-asset-import.test.mjs`；不得将 preview fixture 当成解析服务验收 |
| VM 启动/恢复 | authenticated runtime 在读 bytes 前 GET /api/session、/api/environments/:id；checkpoint 为成员/环境 IndexedDB | `scripts/browser-vm-runtime-checkpoint.test.mjs`；正式 UI G0 尚未放行 |
| 删除快照对账 | reconcile -> GET /api/environments/tombstones 分页；命中墓碑后撤销对应环境、停止对应 runtime、提交本地 remove | `scripts/browser-vm-checkpoint-reconcile.test.mjs`；不能从列表缺项删本地快照 |

## 验证范围与维护

- 新增两条文档契约：全部未归属 ID 必须恰好一次且有分类/条件/行为；记录的源码及 caller 证据必须与指纹一致。文档缺失时 8 条旧测试通过、2 条新测试失败；补齐后 `node --test scripts/frontend-operation-inventory.test.mjs` 10/10 通过。与 frontend-typecheck-contract、functional-checklist-audit、workbench-maturity-contract 联合运行 37/37 通过。这是文档/源码门禁，不是业务旅程回归。
- 指纹仅阻止已审查文件无声变化，不证明上述自然语言正确，也不能发现所有新消费路径。新增模块或调用者时仍应重新追溯静态/动态/类型引用，而不是只更新摘要值。
- 现有 AST 索引保持原样；`audit:frontend-operations` 仍要求它和当前源码一致。文档契约已并入原有 inventory 测试，不新增独立“完成率”。
- 本批无产品运行行为修改、无 push/部署/迁移、未读取密钥。没有增加备份/加密门槛，也没有更新独立预览。

### 审查文件及 caller 指纹

- `frontend/app.tsx`: `96f409ace80fe0586b649c758164166cab407506c69bdf560a48541d4f8edbfb`
- `frontend/components/history-navigation-notice.tsx`: `ceb53e78c925c68b07324cbf6cfe3015010d0483418f3e29507f678e232f1ad6`
- `frontend/components/shell/context-rail.tsx`: `99da1cfcc11d4ff7e9adb18e38b2d9d286759e2ab3826315b3ba25d1a05ae5e0`
- `frontend/components/ui/card.tsx`: `bb7f77ce45ee3fec21e25739c61d547900498a0117d3e12101e8932eae204b41`
- `frontend/components/ui/tabs.tsx`: `1db24d455b581eae7de2ed76e1aa6cc01d0370fa8b9b221fca4d78207cdc9a77`
- `frontend/features/environments/account-network-boundary.tsx`: `9835f50b5387cc2173e47a5dd4c4f85e0f64ec419d88926578b262bf971716b2`
- `frontend/features/environments/account-network-owner.mjs`: `06943c97426e9b8df13e267ff0f668bbc2e3c80445905d2ac3a76591593f735f`
- `frontend/features/environments/account-network.mjs`: `9e954525f93dc3b37b5d3d5b7755ad4c6c9d1ef56d6312337072299d9680501b`
- `frontend/features/environments/account-vm-runtime.mjs`: `5cfd8db87089437abd4e0c2edcc667b973ee4e57f9a0806886e7dcf326ff3c8d`
- `frontend/features/environments/authenticated-vm-runtime.ts`: `f81bc382e47709dd818a3209b5974c53f87487821bebea8ab3112c2f687c4bf2`
- `frontend/features/environments/connector-session.mjs`: `4bea623fd47128568d112e9cfa26ecdc90f114a6572e536b08d49f4537cc5269`
- `frontend/features/environments/environments-page.tsx`: `b9a626762b79a193fd1c34da4ea5b296576c475164118c105d2beabe092b9359`
- `frontend/features/environments/files/asset-import-panel.tsx`: `b0f3b4bd5e1c31d8e19d3a38162029551812e7e53bb69268a6fc4ee6e612000f`
- `frontend/features/environments/files/asset-import.ts`: `9f8dcf9fef963647f1bbc5af57e3f0716af2d39064b9212fcbeec3adb2dee6a8`
- `frontend/features/environments/files/file-manager.mjs`: `2721e8e7abecd3dda95765eecb055f7bf3272942f1933807a07bba83a7df5ea6`
- `frontend/features/environments/files/files-panel.tsx`: `e0a5072b60577a35ab42baea628be67e695fe65bd0def4bf363bd3bfc0668dd9`
- `frontend/features/environments/files/knowledge-import-panel.tsx`: `6722421e98b118c7462324b5536b913bc478025b7d119e35c56671cf94010aab`
- `frontend/features/environments/files/knowledge-import.ts`: `bce2bebe39eb4f17650b35b4a020f51f757ba5594b6e178a4a44f98b45028abd`
- `frontend/features/environments/files/stream-download.mjs`: `b491973525cb44aefce8a265490471e947931c2380b605d15b37226ca7295943`
- `frontend/features/environments/network-lifecycle.mjs`: `0e40ef5fc54547a8eb8769598176d1bdae454d99a4e62a143981b7f545d89e06`
- `frontend/features/environments/storage/checkpoints.mjs`: `0f3e6fdf0a47455748cc139f7b811ca87be00a144c8a3c25433c26647c085722`
- `frontend/features/environments/storage/reconcile-checkpoints.ts`: `465fc694b89e3da4750a3ee7b46ee41a141fbdc9dff3631ea4454d47f32ff636`
- `frontend/lib/workspace-location.ts`: `b77ff862964645fe25610e09f79b8409740f72a85a5685d934adc7e0ff60b92d`
- `frontend/main.tsx`: `8a56e4c9f5df8e80312df681a99b6f31457b752d9d94ad000e37f6a666ae1f62`
- `frontend/pages/workbench-landing/public-workbench-page.tsx`: `c13e87b8d2bfc67ff1bded4f95f3b2bd9f3f4a8cd9f99eba3f67ce8f5e2ba8e2`
- `frontend/pages/workbench-landing/workbench-scene-runtime.ts`: `a1e4fd7990e6d5a80265496307d7c032115d91f3bac7a753952fc5c3970c794c`
- `frontend/pages/workbench-landing/workbench-scene.tsx`: `78d8320376b3f6d1cb22254cbb01a638c73498000d11c7dd33a7d4e2db2604d2`
- `frontend/public/sw.js`: `082532f5be99a67e9d755f9407d59e46359f0b247de2473400c20c229f7080d5`
- `tools/browser-vm/checkpoint-recovery-browser.mjs`: `06a498590a0c6e00c9cf5c91dff81de7a6aa3b01c4c9768aa718ebc0de3d9efe`
- `tools/browser-vm/runtime-owner-browser.mjs`: `e5973069f711204d6ad79f011be6772e9243d403b6bb1ebd515ff361537c4c90`
