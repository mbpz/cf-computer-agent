# 讨论消息：唯一编号、同编号重试与独立精确查询（本地）

基线 `f9891d8`。承接用户“唯一操作编号＋同编号安全重试＋精确查询结果”。上一阶段的扩大回归12项失败已修复；本阶段补齐讨论消息独立只读查询，不再以发送回执校验冒充GET查询。

## 本地子项

- [x] 首次发送生成UUID，未决期间固定正文、目标、回复与提及对象，界面显示操作编号。
- [x] 显式同编号安全重试；查询与发送共用同步互斥门禁，不自动重发、不因查询失败换号。
- [x] 独立精确GET读取原消息回执，不扫描消息列表；仅精确语义匹配才能解除未决状态。
- [ ] 跨刷新/关页持久恢复及真实浏览器/身份验收。编号与草稿所有权目前仍在内存，本地完成不等于发布完成。

## API及权限

新增 `GET /api/discussions/messages/requests?kind=task|knowledge&id=<target>&clientKey=<operation>`。

成员身份仅来自已验证会话。先验证当前目标可见性，再按作者/编号精确读取，并重新检查对应讨论的授权与目标一致性。不可见目标404；其他作者的编号与不存在的编号均不能返回其消息。重复查询参数、伪造memberId、分页参数拒绝400；非GET返回405。服务端和客户端都禁用缓存。

响应为 `{ result: null }` 或 `{ result: { thread, message, created: false } }`。null只表示此刻未查到，不是“操作必然未发生”，不会允许编辑或换号。消息在最新分页之外仍可精确查回。

GET不建讨论、不插消息、不增加序号、不修复参与者、不触发通知。命中证明原消息已经持久化，不证明所有通知副作用已完成；原POST重放仍保留原有副作用修复语义。未改变数据库schema，不需要迁移。

## 客户端所有权

- 发送和查询在调用时复制完整输入，防止调用方或传输期间修改对象改变匹配目标。
- 查询返回对象严格校验结构、日期、目标、编号、正文、回复、提及对象及消息/讨论一致性；读结果不能伪装created:true。
- 空结果、畸形/错语义回执、网络错误、权限拒绝，都保留原未决编号。权限拒绝清屏但不遗忘操作，重新授权后继续原编号。
- 查询中的重复点击、提交或重试不会并发发出。权限epoch变化后的迟到结果不能清空原操作。
- 精确确认后先清草稿/解除门禁，再刷新或归位分页；没有列表扫描、旧POST回退或自动发送。

## 验证

服务/客户端/实际本地Worker新增精确读取测试先3项RED（其余22项通过）；交互与控制器首轮6项RED（原39项通过）。新增传输期间输入突变测试再2项RED后补全输入快照。

最终：

| 范围 | 结果 |
| --- | --- |
| 讨论路由、页面、客户端、服务、实际本地Worker/D1 | 5文件78/78 |
| 扩大前端与讨论服务/Worker | 179文件3198/3198 |
| 审核评论已有唯一编号/精确PUT-GET协议复验 | 5文件119/119 |
| 项目typecheck、讨论组件/客户端独立strict DOM | 通过 |
| UI构建、静态VM入口隔离、双语校验 | 通过 |
| 成熟度契约、领域快照check、功能清单契约 | 15/15、通过、9/9 |

扩大回归比上一阶段3185项增加13项，无跳过既有测试；最终定向与扩大日志无未处理异常/act警告。全App附加strict DOM未复验，不声称历史诊断已消除。HappyDOM与本地Worker不是真实浏览器或线上验收。

```sh
rtk proxy npx vitest run test/unit/frontend-discussion-route.test.tsx test/unit/frontend-messages-page.test.tsx test/unit/frontend-discussions-data.test.ts test/unit/discussions-service.test.ts test/worker/discussions.test.ts
rtk proxy npx vitest run test/unit/frontend-*.test.ts test/unit/frontend-*.test.tsx test/unit/discussions-service.test.ts test/worker/discussions.test.ts
rtk proxy npx vitest run test/unit/frontend-review-comment-owner.test.tsx test/unit/frontend-review-comment-operation.test.ts test/unit/frontend-review-comments.test.ts test/unit/review-comments-service.test.ts test/worker/m1-api.test.ts
rtk proxy npm run typecheck
rtk proxy npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --jsx react-jsx --lib ES2022,DOM,DOM.Iterable frontend/pages/messages/thread-page.tsx frontend/pages/messages/discussion-model.ts frontend/lib/discussions-data.ts
rtk proxy npm run build:ui
rtk proxy npm run verify:i18n
rtk proxy npm run verify:workbench-maturity
rtk proxy npm run audit:workbench-domain
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
```

临时日志 `/tmp/discussion-exact-read-red.log`、`/tmp/discussion-exact-owner-red.log`、`/tmp/discussion-exact-snapshot-red.log`、`/tmp/discussion-exact-final-targeted.log`、`/tmp/discussion-exact-wide-final.log`、`/tmp/discussion-exact-review-protocol.log`、`/tmp/discussion-exact-gates-final.log`，非持久发布证据。

## 清单与下一步

主清单原30、范围内29、关闭5、开放24，D08排除。A05/R2-008与导航Task 4仅关闭以上本地子项，不整体关闭；D07仍未真实VM验收。下一允许按既有导航计划补齐跨刷新恢复与剩余操作所有者，保留未知写入不自动重放的边界。无本地外部阻塞，目标仍进行中。

未push、部署或远程迁移，用户打开的独立验收预览不因本地修改而更新；未扩展备份或加密范围。
