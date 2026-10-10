# 导航 Task 4 本地历史边界覆盖矩阵

日期：2026-10-10。源码基线 `a2cd2234`，分支 `codex/functional-checklist-completion`。

## 范围与结论

按既有获准导航计划收尾本地覆盖，不新增导航策略、依赖或产品行为。本次仅修改 `test/helpers/workspace-history-driver.tsx` 与 `test/unit/frontend-workspace-location.test.tsx`，以及计划/证据。helper 的 `arrive(index, emitEvents = true)` 允许模拟实际条目已改变但事件尚未送达；原调用默认行为不变，不把产品准入策略放进驱动器。

Task 4 的本地测试覆盖子项可以关闭：原始 RED 实施证据、现有边界回归及本次事件时序矩阵已逐项对齐。**不把每个补充回归说成新产品缺陷 RED，不关闭 Task 4 整体或原生验收。**

## 要求到可执行证据

| 计划要求 | 当前可执行证据 | 失败检测/历史证据 |
| --- | --- | --- |
| accepted-position 订阅 | location 测试：原始浏览器到达未获准目标时，`readWorkspaceLocation` 保持原路由且订阅不发布 | runtime 证据中的订阅 RED；本次把读取替换为原始 `window.location` 后 8 条行为断言失败 |
| Back/Forward 确认与取消 | 新增 native/fallback × Back/Forward × accept/cancel 八例；两次消费同一决定、到达前不发布、取消不重放 | core 中确认/取消 RED；本次重复发布变异被检测 |
| 重复遍历与旧决定 | core 的恢复中第二目标/提示中再次遍历；新增 native/fallback 两例使旧决定失效，精确恢复后才允许新导航 | core 历史 RED；新用例是对现有行为的回归 |
| 未知/失效条目 | location 的无 Navigation API 未知条目、原生 anchor 身份被替换、恢复超时与显式 retry；core 未知目标不猜 delta | core/runtime 历史失败关闭证据；新增 finished 身份不匹配反例 |
| reload/document 边界 | location 的带/不带 guard 两项 fallback 新 epoch；Node 夹具八例覆盖初始入口与 reload/back_forward/unknown 不重种历史 | document 夹具原 RED 4 失败；epoch 两例原本就是回归，不冒充 RED |
| 会话边界 | location 的 native/fallback 注销后排队旧 replay 不发布；core dispose 与迟到失败；扩大集含 logout 与身份消费者 | runtime 的两项旧会话 RED；模拟会话不是真实双账号验收 |
| 事件去重与完成时序 | 新增 finished 在无事件但真实身份匹配时可对账；迟到事件不二次发布；身份不符时保持锁与故障；八例重复到达/hashchange | 本次取消身份校验或双重 publish 的变异均失败 |

历史来源：`navigation-history-traversal-core-evidence.md`、`navigation-history-runtime-evidence.md`、`navigation-history-document-evidence.md`。这些文件的“尚未接线”等段落是其当时基线，不覆盖后续运行时接入结果。

## 本次新增与负向控制

新增 **12** 项 location 回归：八例方向/决策组合、两例提示期间再次遍历、两例原生 finished 时序。location 文件现为 46 项；导航核心、location、gate 合计 **112/112**。

已有实现初跑即通过；随后临时注入三个错误，每次均在 finally 中恢复原文，再验证生产源码无 diff：

| 临时错误 | 选择的用例 | 结果 |
| --- | --- | --- |
| finished 不再核对实际条目身份 | wrong identity | 1 失败 / 45 筛选跳过；错误地未进入 restore-failed |
| accepted-location 读取改成原始 window.location | browser boundary matrix | 8 失败 / 2 通过 / 36 跳过；错误地读到未获准目的地 |
| accepted publish 调两次 | matrix 与 finished reconciliation | 5 失败 / 6 通过 / 35 跳过；订阅次数错误 |

这些是测试有效性的**故障注入控制**，不是当前版本的产品缺陷或已提交修复。生产源码恢复后再运行回归，没有保留任何注入代码。

## 验证

- 已启动的扩大回归已收取终态：**64 文件 / 1282 项通过，exit 0**，无未处理异常或 act 警告匹配。选择范围是全部 history driver 消费者，加 workspace/task/inbox/shell/notification/message/pagination/history/logout 名称匹配的 unit 文件；不是全仓验证，也不是 native 浏览器。
- 提交前重跑导航三文件：112/112。
- 项目 Worker/前端类型、受影响测试和 helper 的独立严格 DOM 类型通过。
- UI 构建与 VM 静态隔离通过；已有 >500 kB chunk 提示不属于本次新增。
- i18n 13/13；434 keys / 55 placeholders 校验通过。
- frontend operation audit：270 源文件 / 1171 候选；domain audit 与源码一致。静态清点不是运行时穷尽。
- Node 夹具和四组清单/交付/成熟度/清点契约：**72/72 通过，exit 0**。日志 `/private/tmp/functional-review-final-contracts.log`。

扩大回归的可复现选择（当前为 64 文件）：

```sh
rtk proxy python3 - <<'PYTEST'
from pathlib import Path
import re, subprocess
files = sorted(str(p) for p in Path('test/unit').glob('*.test.*')
    if 'workspace-history-driver' in p.read_text()
    or re.search(r'frontend-.*(workspace|task|inbox|shell|notification|message|pagination|history|logout)', p.name))
print('selected files:', len(files), flush=True)
raise SystemExit(subprocess.call(['npx', 'vitest', 'run', *files]))
PYTEST
rtk proxy npx vitest run test/unit/frontend-workspace-history-traversal.test.ts test/unit/frontend-workspace-location.test.tsx test/unit/frontend-workspace-navigation-gate.test.ts
rtk proxy node --test scripts/navigation-history-fixture.test.mjs scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs scripts/delivery-status-contract.test.mjs scripts/frontend-operation-inventory.test.mjs
```

诊断日志：`/private/tmp/navigation-matrix-regression.log`、`/private/tmp/navigation-matrix-final.log`、`/private/tmp/navigation-matrix-mutant-{identity,accepted,duplicate}.log`。临时日志不是唯一长期证据，具体断言保存在测试中。

## 剩余边界

原始 30 / D08 排除 / 范围 29 / 完成 5 / 剩余 24。A05 父项不关闭。Task 4 原生 keyboard/touch、完整浏览器版本、强制离开与真实身份旅程仍开放；没有新的原生验收结果，没有以 happy-dom 代替浏览器。

本次不是全量 npm run check，也没有 push、merge、部署、远程迁移或生产写入；未读取/上传 SECRETS_FILE。任务软删除的保留期限与旧接口兼容仍待批准，与本次导航本地子项关闭无关。
