# B02 — 成员作用域离线提交草稿：本地实施记录

日期：2026-09-13。状态：**实现与本地自动化验证完成；真实双账号及生产验收未完成**。

## 范围与版本

- 对应 `2026-09-12-member-scoped-submission-drafts.md` 计划的 Task 1 / Task 2；仅覆盖全站完成度审计中的 B02。
- 工作分支：`codex/member-scoped-submission-drafts`，基于 `e46c512` 的独立 worktree。
- 初次实施未提交或合并；用户于 2026-09-13 追加授权后，提交为 `ebc557c`，合入包含 Shell / 品牌修复 `937ea87` 的本地 main，合并提交 `6f9d325`。
- 合并后已同步 README、Roadmap、增量审计、路由矩阵与原计划状态；没有推送、部署或创建 Cloudflare 资源。
- 首次 main 全量验证被既有 README 契约的旧文案断言阻断：产品定位已改为 first core module，分页说明不再声称 fully localized。同步两条兼容断言后，28 条文档契约及完整 npm test 均通过；未放松发布/验收完成声明的门禁。

## 原子 checklist

- [x] 所有草稿 load / save / clear 入口要求显式 `memberId`，不保留全局兼容签名。
- [x] 页面身份只接自已认证 `session.member.id`，不用邮箱、URL 或表单推断成员。
- [x] v2 键为 `personal-workbench:offline-submission-draft:v2:${encodeURIComponent(memberId)}`。
- [x] 双成员读取、保存、清除相互独立；空草稿仅清除当前成员键。
- [x] 不读取、认领、迁移或删除旧的无归属 v1 草稿。
- [x] 非法身份不接触存储；损坏 JSON / 非法结构仅清理当前成员记录。
- [x] 仅持久化并返回 mode / title / content；不写认证信息或额外属性。
- [x] 保留标题 512 UTF-8 bytes、正文 131072 UTF-8 bytes 边界，覆盖中文及超限场景。
- [x] 存储不可用时不抛错中断页面；覆盖页面已有草稿继续编辑与在线提交。
- [x] SubmitRoute 内以成员键控表单生命周期，覆盖 A → B → A 及卸载后重新进入。
- [x] 卸载 / 成员切换取消旧请求；成功和失败均检查请求身份，忽略不遵守 AbortSignal 的迟到结果。
- [x] 同步请求锁阻止同一时刻重复提交；失败后可以显式重试，不自动重发。
- [x] 成功只清理当前提交且未继续编辑的草稿；提交期间发生的新编辑继续保留。
- [x] 保留现有 validation / error / success 及相似内容提示语义。
- [x] 以真实 React 路由、DOM form / select 事件、受控 fetch Promise 和真实 Response 验证，不替换提交组件、存储模块或 createSubmission。
- [x] 检查所有草稿调用点、定向回归、项目 typecheck、完整 npm test（含 UI 构建）。
- [ ] 在真实浏览器执行同源 A → 退出 → B → 退出 → A 恢复验收。本轮仅使用测试身份，未使用第二个真实账号。
- [x] 按追加授权合入本地 main，重跑集成验证并同步总审计；不代表已推送或发布。
- [ ] 生产部署与验收；等待单独授权。

## 失败再通过证据

1. 修改前基线：存储 / 提交数据 / 提交展示共 3 个文件、17 条测试通过。
2. 首次回归红灯：新增的成员存储与真实 `/submit` 初始身份测试均失败（2 failed / 3 passed）。成员 B 应显示 `private B`，旧页面实际显示 `unknown owner`。
3. 加入作用域存储与身份接线后：17 条存储测试及 1 条初始路由测试通过。
4. 生命周期回归：补足异步 Response 消费等待后，9 条中 6 条行为失败、3 条通过；失败涉及成员切换、迟到成功/失败、离页后清草稿、新编辑被清空、双事件发出 2 个请求。初版测试的异步等待不足不是产品红灯证据，已修正。
5. 加入键控生命周期、取消/身份 guard、同步锁及新编辑保护后：4 个文件、40 条通过。
6. 最后增补恢复、存储失效及手动重试，运行计划要求的 5 个文件：**144 passed / 0 failed**，其中存储 17 条、成员路由 12 条。没有把这些 fixture 身份测试描述为真实账号登录验收。

最终定向命令：

```bash
rtk proxy npx --no-install vitest run test/unit/offline-submission-draft.test.ts test/unit/frontend-submit-owner-route.test.tsx test/unit/frontend-submission-data.test.ts test/unit/frontend-submit-pages.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx
rtk proxy npm run typecheck
rtk proxy git diff --check
```

扩展验证：`rtk proxy npm test` 退出码 0，依次执行 smoke / i18n / delivery contracts、unit、UI 构建、Worker 回归；Worker 阶段为 39 个文件、575 条通过。完整运行先于最后新增的 3 条测试，新增测试及关联页面随后已由最终 144 条定向回归覆盖。现有 typecheck 受仓库 tsconfig 范围限制，不等同于独立的全前端严格类型检查。

测试启动有既有 AI binding 提示及二进制资产 `.text()` 警告；测试配置为 `remoteBindings: false`。本轮未调用远程 AI 或执行部署。

合并后追加验证（2026-09-13）：`npm test` 全链退出码 0，包含 smoke / i18n / delivery、unit、UI 构建和 Worker（39 files / 575 passed）；`npm run typecheck` 退出码 0。合并前分支也重跑了完整 `npm test` 并通过，覆盖最终追加测试。主工作区 Wrangler 日志提示自动加载 `.dev.vars`，未手动查看或输出其内容；此验证不能描述为未加载本地配置。Worker 的损坏 journal 负向用例仍输出预期异常，不能将通过描述成无警告、无错误日志。

## 变更文件

- `frontend/lib/offline-submission-draft.ts`：成员命名空间与存储边界。
- `frontend/app.tsx`：session 身份接线、成员表单及异步生命周期。
- `test/unit/offline-submission-draft.test.ts`：成员隔离、数据边界和存储异常。
- `test/unit/frontend-submit-owner-route.test.tsx`：真实路由回归。
- 本文：本批 checklist、证据及未验收范围。

## 保持开放的产品边界

- B01 跨重试 / 刷新稳定幂等身份未在本批实现。取消客户端请求不意味着服务器回滚；网络不确定时手动重试仍受 B01 缺口影响。
- localStorage 按成员命名不是加密，不提供对同源恶意脚本、开发者工具或本机其他使用者的存储保密性。
- 不改变发布 visibility、附件开关、服务端草稿 API、知识问答会话或其他尚未完善功能；全站完成度不能随 B02 一并关闭。
