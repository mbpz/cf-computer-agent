# R04.4 — typed R2/DO/VFS 原始失败观察（本地证据）

记录日期：2026-09-23，Asia/Shanghai；实现和专项测试始于 2026-09-22，应用分项回归跨午夜完成。

## 范围与候选

- 用户要求“有需要提交的提交下，然后进入下一个任务”。开始时根目录 main 与隔离工作区均干净，无遗留变更需要提交。
- 在 `codex/admin-audit-recovery` 既有工作区执行；基线 `2a367d5a427cd27f28ff65fb504eb935bf9440c6`（R04.3）。本文件与本轮实现共同构成提交候选，提交身份以包含本文件的 Git 提交为准。
- 只完成[计划](../../superpowers/plans/2026-09-20-maintenance-entry-integration.md)第 4 子项；R04 为 **4/5**，第 5 子项完整故障矩阵及父项收口未完成。恢复主线仍 **3 关闭 / 22 剩余**。
- 未推送、合并 main、部署、迁移、操作生产数据或读取秘密文件。未修改生产 Wrangler、生成 Env、依赖或迁移。生产入口仍显式 legacy。

## 接线与语义

| 边界 | 接线 | 失败与完成规则 |
| --- | --- | --- |
| R2 | `AssetService` 的 get/body、put、delete、head、list | 工厂先交给请求 WorkScope，再执行原生调用；补偿 catch、任务重试分类在观察之后。原始拒绝/同步抛错不能被后续 200 或成功清理掩盖。 |
| HTTP/Cron | 请求服务与 `sweepAssets` 传入同一 WorkScope | guarded 观察原始 R2 工作；legacy 不参与维护许可，沿用现有业务状态与响应。 |
| Knowledge RPC | commitPublishedContent、removePublishedContent、commitNote、recoverWorkspace | 原始 RPC 拒绝独立于成功传输的领域错误。仅正常领域拒绝可释放；不重写其错误码/状态。 |
| Knowledge DO 内部 | 每次 RPC 独立 `captureKnowledgeRpc`，观察 getWorkspace/VFS | 若 VFS 失败被映射成领域结果或被 reconciliation 吞掉，返回内部固定 `storageUncertain: true`；客户端在登记的 RPC 完成前标记不确定。标记不包含私有错误细节、不暴露到 HTTP、不跨调用共享状态。 |
| VFS | 工作区取得、readdir、mkdir、readFile、writeFile、rm | 使用现有 typed port 与原接收者；在转换/补偿 catch 前观察，不包住整段业务验证。已知 EEXIST 即使后续对账成功，也保守保留原始失败。 |
| Agent RPC | create/read/appendMessage/listMessages/startTurn/getTurn/terminateTurn/completeTurn | 观察原始传输；正常领域结果继续走原响应映射。生产者与取消链仍由此前生命周期接线等待。 |
| 封闭后调用 | `StorageObserver.run(factory)` | 复用 WorkScope 的工厂栅栏；不在封闭后启动原生 R2/RPC/VFS 操作。 |

没有通用 Env/binding proxy、没有以 HTTP 状态替代存储结果、没有自动重试或把 `.remote` 异常视为回滚证明。`RpcResult` 仅增加可选内部固定标记，未传递 WorkScope 或可执行 observer 到 RPC。

DO 的本地观察器只记录调用内原始失败；请求端等待 RPC 的完成。当前 Knowledge/Agent 路径未新增 alarm 或 detached 后台任务，也未新增 DO→D1 通道；R2 后续 D1 业务更新仍走原请求的 D1 facade。此处不证明完整外部写者清单或全系统停写，它们仍属后续检查点。

## 先红后绿

- R2：修正合成成员及 cancel 方法名等 fixture 后，2026-09-22 22:55:22 得到有效 RED，6 失败 / 1 通过；吞错后错误释放、同步抛错破坏正常取消响应。接线后 7/7 通过。
- RPC/VFS：修正 RPC 方法不能 `.bind` 的 fixture 后，23:10:51 得到有效 RED，10 失败 / 11 通过；失败均为吞错后仍释放。真实 Knowledge DO 内部 VFS 映射另有 RED：正确 409 结果缺少不确定标记。
- Agent：修正请求体 fixture 后，23:29:49 得到有效 RED，6 个传输错误场景错误释放，6 个正常领域拒绝对照通过。
- 扩展实际 HTTP/Cron 接线矩阵时，4 项初始断言把缺失原件误写成 terminal；核对既有分类器后更正为 `failed_retryable / ASSET_ORIGINAL_MISSING`，未修改业务分类逻辑。这不是实现缺陷或独立 RED 证据。
- 最终新增 `tools/maintenance/storage.test.ts` **50 项**，全部随完整维护回归通过。

覆盖包括：真实本地 R2 对象与 D1 任务状态、R2 同步/异步失败及补偿、读取 body 失败、VFS 映射与 EEXIST 后对账、真实 Knowledge RPC 内部标记及后续调用不污染、4 类 Knowledge RPC × 3 种结果、6 类 Agent RPC × 2 种结果、HTTP/Cron × guarded/legacy × 成功/缺失/失败，以及 detached 原始工作与封闭后零原生调用。

## 最终验证

以下命令均在隔离工作区，经 `rtk proxy` 执行：

| 命令 | 结果 |
| --- | --- |
| `npm run test:ops:maintenance` | 2026-09-22 23:45:22 开始；11 files / **237 tests passed**，退出 0。基线 187 项 + 本轮 50 项。 |
| `npm run test:smoke` | smoke **56/56**、i18n **13/13**、i18n 静态校验及 delivery contract **30/30**，退出 0。 |
| `npm run test:unit` | 2026-09-23 00:02:41 开始；229 files / **2113 tests passed**，退出 0。 |
| `npm run test:worker` | UI 构建前置步骤成功；00:13:56 开始，47 files / **656 tests passed**，退出 0。 |
| `npx tsc --noEmit` | 应用类型检查，退出 0。 |
| `npx tsc --noEmit -p tools/maintenance/tsconfig.json` | 专项类型检查，退出 0。 |
| `npm run verify:delivery-status`（文档更新后） | **30/30**，退出 0。 |
| `git diff --check` 与只读文档断言 | 退出 0；5 份文档 102 个相对链接有效，R01–R25 为 3 关闭 / 22 开放，R04 为 4/5。 |

单一 `npm test` 命令两次权限审查超时，未启动；随后按该脚本的 smoke、unit、worker 三个分项分别运行，全部通过，不把未启动的聚合命令写成已执行。沙箱内 smoke 的 11 项监听错误及 unit 启动错误均为 `listen EPERM 127.0.0.1`（unit 另有 Wrangler 日志目录 EPERM）；获准提升本地测试权限后通过，无需修改测试绕过。

maintenance 使用独立配置、`remoteBindings: false` 和合成 D1/R2/DO，意外公网出站失败。应用分项输出既有 AI-binding 配置警告，未新增 AI 调用或生产操作；UI 构建有既有大 chunk 警告，不是部署。未运行 `npm run check`、secrets 构建或备份工具测试。

## 下一项：R04.5

- [ ] 对照获准规格逐行汇总正常、原始失败、吞错、取消、超时、迟到工作及 sealed 栅栏的真实合成资源证据，标明缺口而非按通过数推断完整。
- [ ] 补齐必要的跨边界故障组合/回归，验证响应已结束与存储工作完成的区别；再次核对没有遗漏可写 continuation。
- [ ] 完成本地门禁和证据后再关闭 R04；R05/R06/R07 及生产接入仍独立审批与验证。

不把 D1-only 备份称为 D1/R2/DO 原子快照，不承诺完整灾备或生产停写。总账实现/验证/发布/验收四维未提升。
