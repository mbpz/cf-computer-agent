# A05 管理员角色页共享离页保护（本地）

日期：2026-10-02；基线 `f90ebf4`；分支 `codex/functional-checklist-completion`。

## 本轮交付

- 角色权限、待分配成员输入及新角色 key/name/mask 共用同步草稿状态和既有导航协调器。脏输入触发共享放弃确认；取消或其他守卫最终拒绝保留草稿，只有实际导航提交才重置。beforeunload 注册警告，不宣称能阻止强制关页。
- 角色操作确认与离页确认互斥。角色切换只清权限/成员输入，不清独立的新角色草稿；只读列表刷新更新服务端权限基线，但不吞掉独立未保存的权限编辑。
- `AdminRolesRoute` 持有同步写入/unknown 离页锁；开始请求和离页发生在同一事件中也拦截。编辑器因403拒绝卸载后仍保留锁和刷新警告；显式只读核对成功后沿用既有恢复协议，不将“放弃草稿”当作写入失败证明，也不自动重发。
- 创建读取最新同步字段并阻止同事件重复调用。成功仅清理匹配的创建字段；较新输入、独立成员/权限草稿及新挂载编辑器不会被旧完成回调清空。保留既有保存/分配/移除精确确认及读回协议。
- 将角色页非ready分支改为明确的判别收窄，消除该组件既有两条严格DOM类型错误，没有扩展修复其他页面。

## 验证

- 首轮 **12项行为RED**（两文件46通过/12失败）：五类草稿丢失、其他守卫拒绝、确认互斥、迟到创建清新输入，以及pending/unknown/编辑器卸载时的路由缺锁。
- 修正新增测试辅助函数，使真实403响应及网络reject分支能实际执行；未将辅助函数错误计为产品缺陷。
- 追加 **1项行为RED**：角色列表刷新清掉未保存权限。修复后覆盖保留与实际确认丢弃。
- 共新增 **16项**；角色确认/恢复两文件共 **62项**。最终扩大 **74文件1656/1656** 全部通过，包括共享导航/历史适配器、管理员角色渲染、权限位、私人笔记及先前任务/日历/收件箱等回归。
- `npm run typecheck`、角色页独立严格DOM检查通过；`npm run build:ui`（含VM隔离）、`npm run test:i18n` **13/13**、`npm run verify:i18n` **434 keys / 55 placeholders / 6 files**及硬编码校验通过。
- 附加全App严格DOM检查仍 **32条既有诊断**；相较前轮34条仅减少角色页2条，去行列号后的诊断身份无新增。不是全App类型全绿。
- checklist审计测试 **9/9**；原始30，D08批准排除，范围内 **29 / 已关闭5 / 剩余24**。

### 复验入口

```sh
rtk proxy npx vitest run test/unit/frontend-admin-role-confirmation.test.tsx test/unit/frontend-admin-role-recovery.test.tsx test/unit/admin-roles-page.test.tsx test/unit/frontend-admin-pages.test.tsx test/unit/permission-bitmap.test.ts
rtk proxy npx tsc --ignoreConfig --noEmit --strict --jsx react-jsx --moduleResolution bundler --module esnext --target es2022 --lib es2022,dom,dom.iterable --skipLibCheck frontend/pages/admin/roles-page.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy node scripts/functional-checklist-audit.mjs
```

本机临时日志 `/tmp/a05-roles-leave-*.log`；扩大回归精确74文件命令为 `/tmp/a05-roles-leave-regression-command.txt`。临时日志不作为跨机器持久制品。

## 边界与下一步

仅本地实现及mock fetch/DOM验证。未push、发布、远程迁移、手动读取/上传秘密文件或调用真实AI；运行器自动提示已有绑定，不代表调用外部AI。未新增加密、备份或付费服务。

管理员未知写入仍仅有当前挂载期内存锁，本轮没有跨原生刷新/强制退出持久日志或服务端幂等协议；不得借用私人笔记的持久日志验收来宣称管理员已覆盖。未把只读成功称为某次未知写入成功。原生浏览器行为和真实双身份验收仍开放。

A05、R2-008及导航Task 4不关闭；下一允许管理员菜单页草稿/未决写入接入共享离页保护，然后继续逐页核查。无阻止本地下一项的外部条件。
