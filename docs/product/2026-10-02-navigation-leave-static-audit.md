# A05 / R2-008 路由离开保护静态审计

日期：2026-10-02（Asia/Shanghai）。源码基线：`48a8a17`；分支：`codex/functional-checklist-completion`。

状态：**审计已完成；保护逻辑尚未实现；共享导航方案待用户确认**。这是当前代码的缺口证据，不是已批准设计、运行时复现或浏览器验收。

## 清单边界

本轮重新运行 `npm run audit:functional-checklist`：原始30项、排除D08，范围内29项、已关闭5项、未关闭24项。A05与R2-008仍开放，不新增已完成父项。上一批任务编辑器页内关闭/刷新保护已提交，但不构成全局离开保护。

## 可复现的静态入口统计

扫描 `frontend` 下 `.ts` / `.tsx` 文件，以具名函数调用文本匹配计数；排除 `workspace-location.ts` 两个函数定义。计数是调用点数，不是页面数、功能数或全体跳转入口数，不能识别未来出现的别名调用。

| 调用种类 | 当前数量 | 分布 |
| --- | ---: | --- |
| `writeWorkspaceHistory(...)` | 40 | app.tsx 37；review-detail-route、today-page、workbench-review-page 各1 |
| `subscribeWorkspaceLocation(...)` | 18 | 全部在 app.tsx |
| `window.history.back/forward/go(...)` | 2 | app.tsx 2216、2309，均为消息页的 back |
| `addEventListener("beforeunload", ...)` | 5 | TaskEditor、CalendarCreateForm、InboxCreateForm、PlanningCreateForm、TimelineCreateForm |

复核命令：

```sh
rtk proxy rg -n 'writeWorkspaceHistory|subscribeWorkspaceLocation|history\.(back|forward|go)|beforeunload' frontend --glob '*.ts' --glob '*.tsx'
rtk proxy npm run audit:functional-checklist
rtk proxy git diff --check
```

上述5个刷新保护注册点不代表所有业务表单已受保护；纯链接、OAuth跳转也不包括在40个共享写入调用中。

## 已确认的代码事实与实现约束

1. **共享写入没有导航准入步骤。** `frontend/lib/workspace-location.ts:38-41` 直接执行 pushState/replaceState，然后派发共享事件；返回值为 void。`frontend/app.tsx:162` 的 Shell 回调直接调用该函数。TaskEditor的关闭确认不是这个调用链的一部分。
2. **不能只拦 App 自己的订阅者。** `workspace-location.ts:43-49` 将每个订阅者直接注册到原始 popstate 与共享事件；18个调用点包含页内查询恢复。若只延迟顶层页面切换，其余订阅者仍可能改变页面状态或发起读取。
3. **仅把共享 history 写入变成可取消仍不足够。** TasksRoute在 `app.tsx:1082-1088` 写入前改变 queryRef、取消过滤计时器，写入后无条件更新页面/过滤 state。其他分页入口也存在同类模式。取消导航必须保持 URL、查询引用、界面状态一致，而不是只保住地址栏。
4. **写入前副作用需要单独核对。** Inbox在 `app.tsx:1187-1192`、Calendar在 `app.tsx:1742-1746` 先 invalidate 后写 history。延迟/拒绝导航不能无意取消当前有效读取或使恢复入口失效。
5. **不能将所有 replace 当成用户离开。** app.tsx包含查询规范化 replace、创建会话成功后的目标跳转，以及 `app.tsx:163-178` 注销成功后的清会话与首页 replace。它们需要按原因区分，不能以一个无条件跳过保护的 replace 分支处理，也不能因草稿而阻止失效会话清理。
6. **有共享函数之外的离开入口。** 消息页两个 history.back、Shell Breadcrumb的普通 href、登录页 location.href均需在验收边界中说明。不得用重写共享函数覆盖率代替实际入口覆盖率；OAuth与跨文档离开不自动等同于单页导航。
7. **任务编辑器有不止一个挂载入口。** app.tsx中的 TasksRoute与InboxRoute（收件箱已转任务入口）都渲染TaskEditor；只测TasksRoute不证明全部编辑器入口受保护。
8. **现有任务测试不覆盖新范围。** `frontend-task-editor-route.test.tsx` 已有 beforeunload 事件测试，但本轮文本检查未发现其中存在共享导航或 popstate 测试。旧167项联合回归是上一批证据，本轮没有重跑，不能作为新方案验收结果。

这些是源码审计结论；本轮没有实际操作浏览器后退/前进，没有证明任何浏览器级提示框行为，也没有重新确认设备锁定状态。

## 下一批必须证明的条件（尚未执行）

- dirty时取消显式导航：原页面、输入、URL、查询引用不变；没有业务写请求或目标页加载。
- 明确丢弃后：仅一次目标跳转；旧确认不能放行新的草稿/新的目标。
- 无修改或恢复原值：不误提示；pending/unknown保持原写入与恢复语义。
- 后退/前进：取消后页面与地址一致；确认后到达原请求目标；连续历史操作及未知历史条目不得靠猜测步数处理。
- 同页筛选/分页与规范化replace：取消无局部状态漂移，接受无重复请求/事件；历史恢复不触发无限回退。
- Tasks与Inbox两个编辑器入口、Shell桌面/移动导航、消息页历史返回分别覆盖。
- 权限撤销/会话失效：即时清理私有状态、注销成功后不留下受保护页面；普通主动离开与安全失效不能混用。
- 卸载/换成员/过期回调：注销保护注册、忽略旧决定，不影响下一位成员。
- 原生后退/前进、刷新及键盘/触控需要独立证据；DOM模拟不能替代。

## 待确认范围与交付状态

推荐共享导航保护统一处理准入与位置订阅，再接入任务编辑器；不推荐只在侧栏按钮增加确认（覆盖不足），也不推荐本批一次改造所有表单（与共享机制问题混合，难以逐项验收）。实现需要先明确历史条目恢复、取消前副作用与失效会话优先级，不能只加一个 dirty 标志。

上一批证据中“下一允许推进”表示目标范围内可以继续研究，并不代表本次新增共享接口设计已获批准。当前可以继续文档审阅；运行逻辑变更等待用户确认。此文档未修改产品代码，未push、部署、迁移或更新独立预览，未读取/上传SECRETS_FILE。
