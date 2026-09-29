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
