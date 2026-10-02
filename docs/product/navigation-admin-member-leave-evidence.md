# 管理员成员状态共享离页保护 — 本地证据

日期：2026-10-02。基线：`8251d8b`。分支：`codex/functional-checklist-completion`。

## 已完成的本地范围

- 成员启用/停用动作确认注册共享守卫；必须先取消或提交，普通导航不能丢弃确认。同步ref覆盖同React事件点击→离页，beforeunload发出警告；卸载后旧确认不能提交，守卫清理。
- 路由持有实际执行中的PATCH和未知结果集合，401/403仍立即隐藏私有成员列表，但不删除其他正在执行的请求。拒绝视图、GET失败和缺行都不能绕过未知结果锁。
- 有效PATCH回执已由API层校验成员ID、目标状态与contributor身份：它可以解除结果未知锁，但操作按钮仍服从现有后续GET行回读锁。成功后成员从筛选列表消失不应永久困住用户，也不将缺行当成未知PATCH的成功证明。
- 未知结果允许由本路由发起的只读筛选/分页去寻找原行，实际PATCH执行中不允许查询切换。同步查询准入不清锁、不绕过其他守卫、不授权延迟离页；原生卸载仍警告。只有PATCH结束后启动、且包含该行的成功GET才解除未知锁；无重发或后台写重试。
- 保留确认快照、同批去重、空页单次回退、迟到请求抑制、真实API解码器以及角色/状态按钮约束。

## TDD与回归

1. 先仅加测试，两个目标首轮 **10失败 / 55通过**：离页绕过确认和pending/unknown、拒绝后并发PATCH记录丢失均为行为RED；3个只读失败对照原本通过，不计修复缺陷。
2. 最小实现后，旧路由测试的直接pushState+伪popstate不再等价于获准导航。测试改走共享导航入口，确认未取消不得改变查询；原先“带pending离开再回来”改为强制会话卸载后的迟到回执隔离，未将未决普通离页重新放行。
3. 原“旧GET不能释放行锁”验收保留：用并发403后的显式恢复GET制造真实的在途写/早到读交叉，而不是绕过新守卫。另补模拟原生历史到达→恢复锚点，以及其他守卫拒绝查询/恢复读失败不清锁两项。
4. 共新增 **15项**；成员确认及管理员分页路由两个目标 **67/67**，包含于扩大 **84文件 / 1928项全部通过**。
5. `npm run typecheck`、成员组件附加严格DOM类型、`build:ui`及VM隔离检查通过。
6. 双语测试 **13/13**；静态验证 **434 keys / 55 placeholders / 6 files**，硬编码文案检查通过。
7. 全App附加严格DOM检查仍 **31条既有诊断**；去行列号后的诊断身份无新增。项目类型检查通过不代表该附加检查全绿。
8. 清单脚本测试 **9/9**；范围内29、关闭5、剩余24。A05、R2-008与导航Task 4整体仍开放。

### 复验入口

```sh
rtk proxy npx vitest run test/unit/frontend-admin-member-confirmation.test.tsx test/unit/frontend-admin-pagination-routes.test.tsx test/unit/members-service.test.ts
rtk proxy npx tsc --ignoreConfig --noEmit --strict --jsx react-jsx --moduleResolution bundler --module esnext --target es2022 --lib es2022,dom,dom.iterable --skipLibCheck frontend/pages/admin/members-page.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy node scripts/functional-checklist-audit.mjs
```

本机日志 `/tmp/a05-members-leave-*.log`；扩大回归精确命令 `/tmp/a05-members-leave-regression-command.txt`。临时日志不作为跨机器持久制品。

## 未完成边界及下一步

本轮是本地DOM/mock-fetch与本地测试证据，历史测试使用测试驱动模拟到达，不是原生浏览器人工验收。未知结果只读恢复表示已看到当前状态，不证明那次PATCH一定成功。管理员未知意图跨刷新/强制退出的持久恢复未实现；真实双身份、完整浏览器版本、键盘/触摸验收仍开放。

下一允许继续管理员去重队列动作确认及未知决定共享离页核查；本地没有外部阻塞。未push、发布、远程迁移、手动读取/上传秘密文件或调用真实AI；未增加备份、加密或付费服务。
