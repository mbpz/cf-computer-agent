# 管理员去重队列共享离页及单项只读恢复 — 本地证据

日期：2026-10-02。基线：`282628f`。分支：`codex/functional-checklist-completion`。

## 本地完成范围

- Associate / Keep separate / Reject 的现有精确确认接共享守卫；同事件点击后导航不可丢弃确认，取消或确认后才释放。beforeunload警告不代替原生刷新验收。
- 路由独立持有实际POST与未知结果集合。401/403立即隐藏私有数据，但不能清空未知意图；语言切换触发的GET拒绝也不能提前清掉仍在执行的POST。已失效作用域的回执/详情读取不会污染新视图。
- 区分结果锁与行操作锁：有效POST终态回执可以释放离页，不因后续列表失败永久锁住；已确认行仍不能被陈旧pending列表重新启用。
- 新增 `GET /api/admin/duplicates/:id`，沿用 `submission:read-all` 权限、身份/状态校验、严格ID和无查询参数约束；非GET为405、缺项404。仅查询现有表，不改schema、不增加审计、不调用决定写入。
- 显式重试先读pending列表，缺少原项时再读受权详情；严格核对submission ID及canonical submission/source/version三元组。pending可恢复操作，终态保留行锁。读取的是**当前状态**，并不证明原POST成功或由同一管理员完成；从不自动重发POST。
- 单项读取失败、404、401/403、畸形回执或canonical不符均保留未知锁。没有写入的只读失败不限制离页；未知结果可直接只读核对，不必允许带锁分页来寻找已消失项。
- 保留现有同批去重、空页单次回退、手动读取合并、权限拒绝清屏及陈旧请求抑制。

## TDD与验证

1. 单项API先RED：3种终态用例均因404失败；实现后3/3通过，覆盖pending/终态、无重复审计、身份权限、非法ID/查询和方法限制。
2. 页面缺项恢复先RED：3种终态用例均未发起详情GET；实现后恢复文件33/33通过。
3. 离页测试先RED：5失败/51通过；已确认回执及无写入只读错误对照原本通过，不记为修复缺陷。
4. 追加语言切换GET403与在途POST竞态先RED：本应阻止的提前重读发生。修复为仅实际POST结束才能释放其token，权限清屏不删除执行记录。
5. 本轮总计新增**33项**。首轮前后端目标6文件230/230；新增竞态及最终代码包含于最终扩大**89文件2094/2094全部通过**。
6. `npm run typecheck`、去重组件附加严格DOM类型、`build:ui`及VM静态构建隔离通过。
7. 双语测试13/13；静态检查434 keys / 55 placeholders / 6 files，硬编码文案检查通过。
8. 全App附加严格DOM检查：31降至28条，删除了去重页3条既有收窄诊断；去行列号后无新增诊断。**附加全App检查仍未通过**，不与项目typecheck混淆。
9. 清单脚本测试9/9；29范围内、5关闭、24剩余。A05、R2-008和导航Task 4父项仍开放。

### 测试边界调整

旧直接pushState+伪popstate不再等同获准导航，普通导航改走共享入口；已有浏览器前后测试显式交付恢复与重放完成。确认未取消不得换页；原“POST在途时离开再回来”改为明确的强制会话卸载/重挂载迟到回执测试，不重新放行未决普通离页。另验证模拟原生到达→恢复原条目且无重放。原早到读解锁场景改为不允许在途POST启动查询恢复，并追加真实语言重读拒绝竞态。

### 复验入口

```sh
rtk proxy npx vitest run test/unit/frontend-admin-duplicate-confirmation.test.tsx test/unit/frontend-admin-duplicate-recovery.test.tsx test/unit/frontend-admin-duplicates.test.ts test/unit/frontend-moderation-pagination-routes.test.tsx test/worker/m1-api.test.ts test/worker/submissions.test.ts
rtk proxy npx tsc --ignoreConfig --noEmit --strict --jsx react-jsx --moduleResolution bundler --module esnext --target es2022 --lib es2022,dom,dom.iterable --skipLibCheck frontend/pages/admin/duplicate-queue-page.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy node scripts/functional-checklist-audit.mjs
```

本机日志 `/tmp/a05-duplicate-*.log`，最终扩大回归 `/tmp/a05-duplicate-regression-final.log`；精确命令 `/tmp/a05-duplicate-regression-command.txt`。临时日志不作为跨机器持久制品。

## 未完成边界及下一步

本轮仅本地DOM/mock-fetch与本地Worker/D1测试，模拟历史驱动不是原生浏览器人工验收。未知决定意图仍只在当前挂载内存中，跨刷新/强制关闭持久恢复未完成。原生完整浏览器版本、键盘/触摸、真实身份验收及其他页面仍开放。

下一允许管理员审核队列确认、草稿及未决决定共享离页核查；本地无外部阻塞。未push、部署、远程迁移、手动读取/上传秘密文件、调用真实AI或添加付费服务；不增加备份/加密范围。
