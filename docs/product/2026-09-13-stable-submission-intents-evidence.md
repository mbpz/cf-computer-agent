# B01：稳定提交身份本地证据

日期：2026-09-13。分支：`codex/stable-submission-intents`，基于 main `3431145`。对应 [实施计划](../superpowers/plans/2026-09-13-stable-submission-intents.md)。本批不是发布或真实浏览器验收报告。

## 实现

- `frontend/lib/submission-intent.ts`：成员作用域 v1 意图存储，只允许 version/key/mode/title/content；标题 512、正文 131072 UTF-8 bytes。保存不覆盖另一笔或损坏记录，清理比较 key。独立于 B02 可编辑草稿。
- `frontend/lib/submission-data.ts`：显式幂等键参数，重试不自行生成新身份；保留现有固定空间/可见性请求契约。
- `frontend/app.tsx`：首次 POST 前保存快照；失败、非法响应、取消/离页后保留；恢复不自动重发。未知结果期间新编辑不覆盖原快照，旧成功不删除新编辑。保留成员键控组件、同步请求锁、AbortSignal 与迟到结果保护。
- `frontend/pages/submit-page.tsx`：使用既有 shadcn Card/Alert/Button 显示待确认提交、手动重试、我的提交入口；双语存储降级/损坏/冲突说明，未确认前禁用新提交。
- 无安全随机源时停止生成身份，不再退化为所有用户共用的全零 key。
- 后端生产代码未改；复用现有 D1 的成员+key 精确重放和原子写入。没有新增服务、依赖、迁移或 Cloudflare 资源。

## 验证记录

- 基线：4 files / 43 tests 通过。
- 红灯：真实 SubmitRoute 失败后重新挂载重试，body 相同但 key 不同；1 failed / 12 passed。无 crypto 用例另复现全零键：1 failed / 10 passed。
- 绿灯联合回归：6 files / 88 tests 通过，涵盖意图存储、成员草稿、页面、实际路由 DOM/Response、显式请求参数与本地 D1。
- D1 新增同 key、同内容跨成员独立创建，再分别重放仍仅有 2 submissions / 2 sources / 2 source_versions / 2 audits；既有同成员异内容 409、并发冲突和精确重放用例保留。
- `npm run typecheck` 通过。现有根 tsconfig 没有直接包含全部 frontend TSX；不把此命令表述为全站前端严格类型检查。
- `npm test` 最终退出 0：smoke 49、i18n 13、delivery-status 28；unit 214 files / 1858 tests；Worker 39 files / 576 tests；包含 UI build。构建保留超过 500 kB 的 chunk 提示，不将其描述为性能验收完成。
- `npm run typecheck:landing`、`git diff --check` 通过。
- 全量首跑曾出现成熟度路由旧断言失败（1 failed / 1857 passed）：旧断言要求失败后新提交按钮 enabled。按已批准的恢复交互改为断言原始重试 enabled、新提交 disabled；定向成熟度回归 101 tests 通过，再执行上述完整绿灯。

测试运行器故障：存储边界用例曾将未配对 UTF-16 surrogate 插入 `%s` 测试名称，触发 Worker pool WebSocket `WS_ERR_INVALID_UTF8`，3 files / 31 tests 完成但整体退出失败。仅将名称改为编号 `%#`，异常输入本身保留；存储 suite 13 tests 随后通过，不把运行器错误计作产品红灯。

## 开放边界

- 真实账号浏览器刷新、退出/重登、键盘和移动端尚未验收；自动化用的是组件重新挂载、浏览器存储 fixture 与真实 Response 对象，不等于物理设备验收。
- localStorage 不是加密或跨标签事务。本批不保证多标签同时首次创建的原子排他，也不提供跨设备共享恢复。
- 存储禁用/写满/清理失败会明确提示；当前页内存重试可用，但不能保证刷新恢复。已确认成功却清理失败时，旧记录可能在刷新后再次显示，重试仍受服务端幂等保护。
- 损坏身份或 409 不自动清除/更换 key；保留原记录并引导核对「我的提交」，不推断未知服务端结果。人工修复流程不在本批范围。
- 附件上传仍为后续 B03–B05；本批不变更上传状态，也不提升其他知识闭环条目的完成度。
- 未推送、未合并本批到 main、未部署、未操作远程数据。

## 下一小批

D02 审计页加载阻断：核对请求控制器返回契约，将当前 gap 断言升级为成功加载、分页、迟到请求保护的行为测试；先复现再修复。
