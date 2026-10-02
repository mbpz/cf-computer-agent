# 审核备注草稿跨行卸载与错误清屏保留证据

日期：2026-10-02。基线：`c1b65e2`。本轮属于 A05 / R2-008 / 导航计划 Task 4 的本地子任务，未关闭父项。

## 实现与边界

- `ReviewDraftProvider` 复用共享 `useCreateDraft` 的最终准入协议，由路由挂载生命周期持有按submission ID隔离的备注与原因、动作类型。只记录非默认输入；空的退回修改表单不误报dirty。
- 审核队列回读移除行、权限清屏，以及详情403/404/普通读取错误，不再通过子组件卸载清空独立草稿。重新获准读取同一对象后恢复原动作与输入，不转移到其他对象。
- 权限清屏期间没有草稿明文DOM；草稿所有者只显示通用离页确认。可取消离页保留，或在实际获准导航后放弃；最后准入被其他守卫拒绝时仍保留。
- 未知提交仍由路由和动作守卫阻止离开，不可通过草稿丢弃解除。明确匹配回执或该未知操作的受权终态核对只清理其对应对象的草稿，不影响其他行的独立备注。
- 另一审核者导致的终态回读不静默删除本人的未提交输入；备注留在当前路由内存，可通过明确离页确认放弃。此时不允许对终态继续提交审核决定。
- 详情404且有独立草稿时提供读取重试入口。强制身份卸载/目标切换创建新草稿所有者，不把旧会话备注带入新会话。
- 单独渲染审核控件时采用局部所有者以保持现有组件契约；正式路由使用较长的会话生命周期。没有修改全局草稿/导航协议或增加持久存储。

## TDD 与验证

- 首轮修改实现前：7失败、52通过；失败明确覆盖缺行/拒绝访问后草稿消失、他人处理终态时丢弃独立草稿、提交一个对象后其他行草稿消失，以及详情403/404/500清屏。
- 追加最终导航准入拒绝、未知结果不可丢弃、空白表单、会话/对象隔离与详情终态边界，总计新增13项。
- 最终定向回归：4文件、96/96通过（明确boolean函数类型修正后重跑）；清单审计测试9/9，清单仍29项、已关闭5项、未关闭24项。
- 扩大回归：97文件、2231/2231通过，包含导航、管理审核及本地Worker/D1既有回归。
- 项目typecheck通过；新增草稿所有者、共享控件、详情路由/页严格DOM类型检查通过。曾发现守卫ref推断为字面量false，添加明确boolean函数类型后重新检查通过。
- UI构建及VM静态模块隔离通过；既有大bundle警告不隐藏。双语13/13、434 keys / 55 placeholders / 6 files通过，无新增文案键。
- 全App附加严格DOM检查仍失败：28条既有诊断，与前轮忽略行列号比较完全一致，不能记为全绿。

## 复验入口

```sh
rtk proxy npx vitest run test/unit/frontend-review-leave.test.tsx test/unit/frontend-review-queue-leave.test.tsx test/unit/frontend-review-detail-route.test.tsx test/unit/frontend-review-confirmation.test.tsx
rtk proxy npx tsc --ignoreConfig --noEmit --strict --jsx react-jsx --moduleResolution bundler --module esnext --target es2022 --lib es2022,dom,dom.iterable --skipLibCheck frontend/components/review/review-drafts.tsx frontend/components/review/review-decision-controls.tsx frontend/pages/admin/review-detail-route.tsx frontend/pages/admin/review-detail-page.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy node scripts/functional-checklist-audit.mjs
```

本机日志 `/tmp/a05-review-draft-*.log`；扩大命令沿用 `/tmp/a05-review-regression-command.txt`。临时日志不是跨机器持久制品。测试框架自动加载本地绑定，未手动读取/上传秘密，未调用真实AI；未push、部署或远程迁移。

## 剩余与下一允许步骤

主清单29范围内、5关闭、24开放；A05/R2-008及导航Task 4整体开放。本轮只证明当前路由挂载内存保留，不证明浏览器刷新/强制关闭后持久恢复，也不证明原生键盘/触摸/真实身份验收。

下一核查审核评论面板的独立输入、提交去重、迟到回执和未知写入离页保护。当前代码 `frontend/components/review/review-comments-panel.tsx` 仍以组件useState保存评论正文，异步save尚无会话归属校验或同步提交token；这是已有功能缺口，不计入本轮完成。下一本地实现无外部阻塞。
