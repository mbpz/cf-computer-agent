# A05 注销防重与身份历史边界（本地）

日期：2026-10-02。基线：`439f68e`；分支：`codex/functional-checklist-completion`。

## 已完成的有限切片

- 真实 App 的同批次双击注销行为 RED：预期 1 次 POST，实际 2 次。React state 尚未提交，旧 handler 可重入。
- 使用同步 ref 先预留注销，再设置渲染 pending；失败释放预留，允许显式重试；成功不释放已结束会话的预留。保持原有服务端注销后 session=401 才切换匿名界面的规则。
- 新增真实 App 回归：同批双击只发一次；503 后显式重试一次；注销后的 session 验证未返回时仍锁定；401 后移除私有内容/账户并中止旧读取。
- 本地夹具增加合成匿名/成员 B 状态及私有读取身份计数，所有 API 都是合成应答，无后端转发、真实账号操作或真实 OAuth。
- 原生测试发现夹具在回退至根路径时重新种入历史并截断 Forward。新增 arrivalType 门禁，仅明确 navigate 到夹具根入口时种入；reload/back_forward/unknown 保留原历史。此缺陷属于夹具，不是生产历史运行时。

## 原生内置浏览器证据

见 `navigation-logout-identity-events.json`，包含原始可见 UI 与计数，不删去失败中间状态。

| 实测场景 | 结果与证据边界 |
| --- | --- |
| 成员 A 注销 | POST=1，进入匿名根页面，旧账户/任务移除；原 documentId 不变 |
| 匿名 Back 到旧 /inbox，Forward 回 / | Back 显示登录页；Forward 显示公共页；没有新增私有读取；发布依次 2、3 |
| 新 document 模拟成员 B | /tasks 只显示 B 邮箱和 B 合成任务；读取身份只有 B；historyLength=4 |
| B Back 至旧根条目，再至旧 /inbox | URL/accepted 一致，根入口未重新种历史；/inbox 请求身份为 B；旧 A 内容未恢复 |
| B Forward 经根回 /tasks | 原 Forward 条目仍可达；新 document 显示 B 任务；historyLength=4 |
| 修正空页夹具后 reload /inbox | 根历史不重种，收集箱显示正常空态及 B 身份；historyLength=4，写入 0 |

边界：根页 home API 未模拟，因此 B 返回根页面有加载错误；公共 3D 资源也未作验收。最初空收集箱夹具错误地返回 totalPages=1，现修正为 0。此前历史 document 的两条 inbox 观察仍为错误界面（包括命名 corrected-pagination 的观察，不能视为通过）；最后显式 reload 的新 document 才实测正常空态。这里不声称已验证 BFCache；观察到 documentId 改变的返回属于新 document。

截图：`/tmp/a05-logout-back-anonymous.png`、`/tmp/a05-member-b-private-task.png`、`/tmp/a05-member-b-old-inbox.png`。所有身份为 example.test 合成测试身份。

## 验证记录

- 注销行为 RED：`/tmp/a05-logout-duplicate-red.log`，17 通过/1 失败（2 POST vs 1）。修复后针对性 3 文件 50/50：`/tmp/a05-logout-green.log`。
- 首次修复后测试中的菜单开闭和禁用目标断言不符合实际组件契约；更正测试，不将该测试书写问题计为产品修复。
- 根入口 arrivalType 行为 RED：3 失败/5 通过 → 8/8；`/tmp/a05-root-arrival-red.log`、`/tmp/a05-root-arrival-green.log`。
- 完整导航回归 **23 文件 549/549**，不是全仓测试：`/tmp/a05-logout-full.log`。
- 项目 typecheck、build:ui（含 VM 构建隔离）、i18n 13/13、verify:i18n 通过：`/tmp/a05-logout-final-checks.log`。保留已有大 chunk 与 AI binding 配置警告；未调用真实 AI。
- 额外的 App 依赖图严格 DOM 类型检查 **未通过**：当前 35 条诊断；从 HEAD 提取 frontend/shared/src/test 所需文件、使用同一 node_modules 和命令，基线也为 35 条，忽略行号偏移后的诊断多重集完全相同、无新增。日志 `/tmp/a05-strict-current.log`、`/tmp/a05-strict-baseline.log`。这不是严格前端类型门禁已通过，也不将既有问题隐去。首次基线快照漏 shared/src 的 98 条诊断已废弃。
- Node 清单契约 9/9 + 夹具 8/8 = **17/17**；清单脚本确认 **29 范围内 / 5 完成 / 24 未完成**。

## 尚未完成与下一步

A05、R2-008、Task 4 父项继续开放。这里仅补足本地合成身份历史及注销防重；真实双账号/服务端授权、完整浏览器版本、键盘/触控、强制离开及其余页面 pending/dirty/危险操作审计未被替代。

下一步允许继续逐页审计，优先核对尚未接入共享离开保护的编辑/提交页面；不重复索要已有本地实施许可。当前没有阻止该本地工作的外部条件。严格前端类型既有诊断需单独收敛，不宣称全目标完成。

本轮临时验收 tab 已关闭；本地 Vite PID 17603 已核对并停止，用户原预览页未改。

未 push、部署、远程迁移或更新独立预览。生产状态不变。
