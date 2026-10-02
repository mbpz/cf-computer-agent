# A05 管理员菜单页共享离页保护（本地）

日期：2026-10-02；基线 `6cbc633`；分支 `codex/functional-checklist-completion`。

## 本轮交付

- 菜单创建、编辑及各行排序草稿接入共享导航守卫。取消放弃或最终准入被其他守卫拒绝均保留输入；只有实际导航提交才重置。beforeunload 注册警告，不宣称能阻止强制退出。
- 创建/编辑提交使用同步字段快照，离页确认期间不允许保存或叠加本地取消确认；保留既有菜单变更、禁用、隐藏、删除的精确影响确认。操作确认未决时不得离页。
- `AdminMenusRoute` 持有同步 pending/unknown 锁，编辑器因403等拒绝卸载后仍阻止普通导航并警告刷新。显式只读恢复成功后沿用已有协议释放锁；不自动重发写入，不把放弃草稿当作未知写入失败证明。
- 服务端列表刷新保留独立未提交的排序草稿；对已确认提交的排序尝试，在权威读回后同步服务端位置。恢复其他行操作不会吞掉独立排序草稿，已消费的尝试也不会反复清新输入。
- 修正菜单页非ready分支的类型收窄，消除该组件一条既有严格DOM诊断；没有扩大到其他页面。

## 验证

- 首轮行为RED：两文件 **13失败/83通过**，随后修复导航与未决锁；首轮GREEN尝试暴露一项既有排序恢复回归（95通过/1失败），针对已提交尝试与独立草稿分别处理后恢复通过。
- 共新增 **15项**，覆盖创建/编辑/排序取消与最终拒绝、动作确认互斥、列表刷新草稿保留、pending/unknown/403编辑器卸载、排序恢复边界。最终两文件97项，扩大 **79文件1774/1774** 全部通过。
- 项目类型与菜单两组件严格DOM检查通过；UI构建（含VM静态隔离）通过；双语测试 **13/13**，静态校验 **434 keys / 55 placeholders / 6 files** 及硬编码检查通过。
- 附加全App严格DOM检查仍有 **31条既有诊断**，相较前轮32条仅减少菜单页一条；去行列号后的诊断身份无新增，不是全App类型全绿。

### 复验入口

```sh
rtk proxy npx vitest run test/unit/frontend-admin-menu-confirmation.test.tsx test/unit/frontend-admin-menu-recovery.test.tsx test/unit/admin-menus-page.test.tsx
rtk proxy npx tsc --ignoreConfig --noEmit --strict --jsx react-jsx --moduleResolution bundler --module esnext --target es2022 --lib es2022,dom,dom.iterable --skipLibCheck frontend/pages/admin/menus-page.tsx frontend/pages/admin/menu-editor.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy node scripts/functional-checklist-audit.mjs
```

本机日志 `/tmp/a05-menus-leave-*.log`；扩大回归精确命令 `/tmp/a05-menus-leave-regression-command.txt`。临时日志不作为跨机器持久制品。

## 边界与下一步

仅本地实现及mock fetch/DOM验证。未push、发布、远程迁移、手动读取/上传秘密文件或调用真实AI；未新增加密、备份或付费服务。

管理员未知写入锁仍仅覆盖挂载期，本轮没有增加跨原生刷新/强制退出的持久日志或服务端幂等协议。只读核对不证明某次未知写入成功。原生键盘/触摸、完整浏览器版本、强制离页及真实双身份验收仍开放。

范围内 **29 / 已关闭5 / 剩余24**。A05、R2-008及导航Task 4不关闭。下一允许管理员空间页草稿/未决写入共享离页保护；本地工作没有外部阻塞。
