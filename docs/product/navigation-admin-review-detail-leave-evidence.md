# 管理员审核详情路由级离页保护证据

日期：2026-10-02。基线：`5256748`。范围：导航计划 Task 4 / A05 / R2-008 的审核详情路由子项；仅本地实现、测试和提交，不代表生产或原生浏览器验收。

## 实现

- 路由持有实际POST token与冻结操作意图，注册共享离页守卫及beforeunload。权限拒绝、404或读取失败卸载编辑器时，不因此清除未决操作。
- 将写入归属从读取generation分离到挂载生命周期和精确token。更换locale/requester只清理旧读取，不取消、重发或遗忘实际POST；有POST时不启动新的读取。强制身份卸载使迟到回执失效。
- 有效匹配回执清除未知意图。401/403清除私密内容但保留未知意图；权限恢复后可继续只读核对，不把鉴权失败当成原写入没有提交的证明。
- 未知反馈同时提供显式原样重试和只读当前状态核对。只读核对复用受权单项详情GET与精确ID验证；只有published/rejected/revision_requested解除未知锁。pending、拒绝访问、404、畸形和不匹配ID均不能解除。
- 未知操作遇404保留“重试”读取入口，避免只能看到被守卫拒绝的返回链接。没有未决操作的普通404不改变既有行为。
- 同对象背景读取保持已挂载表单，语言对象更换后保留未提交备注与未知操作的原始备注。错误/权限清屏后的独立未提交备注保存不在本项完成范围。
- 读取与写入有同步ref互斥，连点只读重试合并，读取中不允许重新POST。终态GET只证明当前状态，不冒充本人的原操作成功。

## 验证

- 先追加8项测试，修改实现前：8失败、25通过。失败覆盖POST401/403后导航漏出、locale更换丢失在途归属和未知状态缺少只读核对入口。
- 修复后追加同事件POST/离页竞争、只读核对合并及阻止重发、冻结备注原样重试、同对象未提交备注保留、强制身份卸载迟到拒绝响应保护；总计新增12项。
- 目标3文件69/69通过（审核详情路由、详情展示、审核确认）；不是原生浏览器证据。
- 扩大回归97文件、2218/2218通过，沿用前轮97文件范围，覆盖共享导航、管理路由和本地Worker/D1回归。
- 项目typecheck、详情路由/详情页严格DOM类型检查通过；UI构建与VM静态模块隔离通过，既有大bundle警告保留。
- 双语测试13/13和静态检查434 keys / 55 placeholders / 6 files通过，无新增文案键。
- 附加全App严格DOM检查仍失败：28条既有诊断，忽略行列号后与上一轮诊断完全一致，不宣称此检查通过。

## 复验

```sh
rtk proxy npx vitest run test/unit/frontend-review-detail-route.test.tsx test/unit/frontend-review-detail.test.tsx test/unit/frontend-review-confirmation.test.tsx
rtk proxy npx tsc --ignoreConfig --noEmit --strict --jsx react-jsx --moduleResolution bundler --module esnext --target es2022 --lib es2022,dom,dom.iterable --skipLibCheck frontend/pages/admin/review-detail-route.tsx frontend/pages/admin/review-detail-page.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy node scripts/functional-checklist-audit.mjs
```

本机RED及验证日志 `/tmp/a05-review-detail-*.log`；扩大回归命令复用 `/tmp/a05-review-regression-command.txt`。临时日志并非跨机器持久制品。测试框架加载本地绑定；未手动读取/上传秘密文件，未调用真实AI。

## 剩余与下一步

主清单29项、5关闭、24开放；父项A05/R2-008及导航Task 4不关闭。下一允许核对审核队列刷新移除行时独立未提交备注的保留/放弃流程，以及详情错误清屏时独立草稿的生命周期。未知意图跨刷新/强制关闭持久恢复、原生键盘/触摸/完整浏览器版本、真实身份验收和其余页面仍开放。没有阻止下一项本地工作的外部条件；未push、部署或远程迁移。
