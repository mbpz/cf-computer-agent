# 管理员审核队列共享离页与未知结果保护证据

日期：2026-10-02。分支：`codex/functional-checklist-completion`。基线：`bcdb716`。

## 范围与结果

本轮是 A05 / R2-008 / 导航计划 Task 4 的本地实现子项，并非父项或完整目标验收。主清单仍为 **29范围内、5关闭、24未关闭**。

- 审核发布/拒绝/退回及丢弃确认接共享离页守卫；同事件导航、刷新/关页提示不绕过确认。
- 拒绝/退回备注与原因使用同步草稿引用。取消离页保留输入，只有最终获准并提交的导航才重置草稿；动作切换仍使用既有丢弃协议。未知结果不可通过“丢弃草稿”解除。
- 同一对象的新读取快照使旧确认失效，但保留未提交备注；对象切换或终态清理对应草稿。共享控件同时用于队列和详情，**不代表详情路由在控件被权限清屏卸载后也已受保护**。
- 队列路由持有预览/POST实际执行token和冻结操作意图；普通分页、详情跳转、共享离页以及模拟原生前后退不能绕过未决写入。语言更换只更换读控制器，不清除决定记录。
- 401/403隐藏私密列表，但不删除未决POST或未知意图；在途POST期间显式读取入口不会抢跑。延迟发布预览在并发权限拒绝后不会继续POST。
- 未知结果既保留原有“显式原样重试决定”，也允许独立“重新读取当前状态”。后者只GET：先列表，缺少原对象时读取现有受权详情并验证对象ID。published/rejected/revision_requested解除未知锁；pending、404、拒绝访问、畸形或不匹配详情均不解除。
- 当前终态不证明本人的原始POST成功，可能来自其他审核者；不从pending分页缺行推断成功，不自动重发决定。
- 有效匹配写入回执解除结果不确定性，即使随后读取失败；行操作仍遵守既有已处理限制。空页回退在React提交确认状态后单次执行，避免陈旧行级pending守卫拒绝合法修正。
- 强制会话卸载使迟到预览、回执及详情读取失效，不污染新挂载。

## TDD与验证

1. 新增两个离页测试文件。修正测试中的确认按钮定位后，在实现前真实RED：14失败、4通过；失败涉及确认/草稿离页、同对象备注回读、未知记录及只读核对入口。
2. 追加未知草稿不可丢弃、模拟原生回退恢复且不重放、匹配回执后的读取失败、延迟预览与鉴权竞争。共新增 **22项**。
3. 目标回归发现合法空页回退被旧pending控件阻止，改为提交后效果修正；未削弱未决离页限制。
4. 最终扩大 **97文件、2206/2206通过**，涵盖现有导航/管理员/审核详情与本地Worker/D1回归。
5. `npm run typecheck`通过；审核控件、队列页、详情页的独立严格DOM类型检查通过。
6. `npm run build:ui`及VM静态模块隔离检查通过。仍有既有大bundle警告；构建检查不等于运行时联网或生产验收。
7. 双语测试13/13；静态文案检查434 keys / 55 placeholders / 6 files通过，没有新增文案key。
8. 附加全App严格DOM检查仍为28条既有诊断，去行列号归一化后无新增；**该附加检查仍失败**，与项目typecheck分开记录。
9. 主清单脚本测试9/9通过；实际审计29范围内、5关闭、24未关闭。`git diff --check`通过，不将新增测试数计为主清单关闭数。

### 测试边界调整

普通导航改用共享入口，不把直接pushState加伪popstate当作获准导航。原“在途操作直接换页”的陈旧回执测试改为显式强制会话卸载/重挂载；确认弹窗必须取消后才能换页。干净历史遍历测试交付模拟驱动的恢复/重放完成。这些是DOM/mock-fetch和模拟历史证据，不是原生浏览器人工验收。

### 复验入口

```sh
rtk proxy npx vitest run test/unit/frontend-review-leave.test.tsx test/unit/frontend-review-queue-leave.test.tsx test/unit/frontend-review-confirmation.test.tsx test/unit/frontend-review-detail-route.test.tsx test/unit/frontend-moderation-pagination-routes.test.tsx
rtk proxy npx tsc --ignoreConfig --noEmit --strict --jsx react-jsx --moduleResolution bundler --module esnext --target es2022 --lib es2022,dom,dom.iterable --skipLibCheck frontend/components/review/review-decision-controls.tsx frontend/pages/admin/review-queue-page.tsx frontend/pages/admin/review-detail-page.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy node scripts/functional-checklist-audit.mjs
```

本机最终回归日志 `/tmp/a05-review-regression.log`，精确扩大命令 `/tmp/a05-review-regression-command.txt`；RED、类型、构建、双语等日志 `/tmp/a05-review-*.log`。临时日志并非跨机器持久制品。测试框架自动加载本地绑定，不曾手动读取/上传秘密文件或调用真实AI。

## 未完成边界及下一步

- 下一允许审核详情路由级pending/unknown及权限清屏保护；并核对队列读取移除行时，其他独立未提交备注的保留/放弃流程。本轮只证明同对象仍挂载的读取替换保留备注。
- 未知决定意图仍只在当前挂载内存中；跨刷新、强制关闭后的持久恢复未完成。
- 完整原生浏览器版本、真实键盘/触摸、真实身份及剩余页面仍待验收。A05、R2-008、导航Task 4与完整goal保持开放。
- 本地下一步没有外部阻塞。不新增备份/加密、付费服务；未push、部署或远程迁移。
