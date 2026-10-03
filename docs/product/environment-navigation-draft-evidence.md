# 环境元数据操作与离页草稿保护（本地）

基线：`cc25c71`，分支 `codex/functional-checklist-completion`。
归属：A05 / R2-008、导航计划 Task 4；D04 仅环境元数据边界，不代表正式 VM 功能验收。

## 实际变更

- 创建草稿采用共享离页门禁；脏输入离页须明确丢弃，取消保留内容，卸载触发警告。
- 未决操作、恢复阻塞和删除确认阻止普通导航；不能通过丢弃草稿消除未知写入。
- 重命名编辑器持有原目标及版本，取消、Escape 和路由离开有明确丢弃确认；非法输入不关闭编辑器，确认期间不接受隐式提交。
- 同步 ref 消费删除确认，陈旧/重复处理器不能发出第二次删除；对话框下层创建输入不能被修改或提交。
- 创建结果按已提交的唯一操作编号结算，直接成功、同编号重试及精确查询共享同一结算规则。只清除原提交草稿，迟到列表刷新不能清除新的本地输入。
- 原操作恢复日志及后端精确查询协议不变；不存在自动换号、自动重发或以列表猜测成功。

## 验证

核心新增七例先失败后修复通过；追加两例覆盖非法重命名/确认期间提交及列表刷新后原版本不被替换。
旧路由测试改为验证“未决操作阻止普通离页”，刷新恢复仍由独立 remount 测试覆盖，没有删除恢复断言。

- `rtk proxy node --test scripts/browser-vm-environments-page.test.mjs scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs scripts/i18n-contract.test.mjs scripts/frontend-operation-inventory.test.mjs`：106/106（环境页 61，合约 45），含实际本地 Worker/D1 幂等写入、精确查询与跨成员拒绝。
- `rtk proxy npm run typecheck`：Worker 和全前端通过。
- `rtk proxy npm run build:ui`：通过，静态 VM 模块隔离通过；保留大 chunk 警告。
- `rtk proxy npm run verify:i18n`、`rtk proxy npm run audit:workbench-domain`：通过。
- `rtk proxy npm run inventory:frontend-operations`、`rtk proxy npm run audit:frontend-operations`：239 文件、1031 静态候选。静态候选不是运行时验收。
- 初次受限环境完整测试停在 Workerd 并已取消，不记通过；授权后完整重跑通过如上。

## 边界及清单

主清单原 30，D08 排除，范围内 29，已关闭 5，开放 24。本次只增加 A05/D04 的本地子项证据，不关闭父项或导航 Task 4。
没有原生浏览器、真实双身份或正式 VM 运行验收；G0 仍限制正式 VM UI。未 push、部署或远程迁移，独立预览未更新。
允许继续剩余导航所有者和操作恢复边界；不能据此声称整体 goal 完成。
