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

## 当前原生阻塞（本轮重新观测）

调用原生控制工具 `cua.getState()`，返回 native apps 错误：Mac 已锁定，自动解锁未成功，需用户手动解锁。可用浏览器清单只有无标签的内置浏览器，无法据此获得桌面 Chrome/Edge 的版本、权限或交互证据。

此后停止原生控制，不尝试其他浏览器/自动化控制绕过锁屏，也不沿用以前的锁屏记录作为本轮事实。没有点击浏览器权限、启动常驻连接器、设置系统代理/证书或重新发布预览。

下一步：用户手动解锁 Mac 后，重新发现桌面 Chrome/Edge 与当前 HTTPS 预览，再按原计划做准入；任何权限提示按既有授权边界处理。完成准入后再进入正式运行时/UI 接线。D04 仍开放，D05/D06 的原生身份/设备验收也未完成。

当前 **29 范围内 / 5 已关闭 / 24 未关闭**。D03 对账已关闭不代表知识业务全部交付，D04 本地回归通过不代表 G0 通过。无 push、远程迁移、部署或生产写入。
