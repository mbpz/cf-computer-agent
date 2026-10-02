# 审核评论草稿与未决写入归属证据

日期：2026-10-02。基线：`acd295a`。仅本地实现/验证，A05 / R2-008 / 导航Task 4子任务，不关闭父项。

## 已检查的实际接口约束

- `src/routes/admin-review.ts` 的评论POST只传正文给service，无幂等键。
- `src/review-comments/service.ts` 每次create生成新的随机ID；normalizeBody及目标访问检查发生在repository.create之前。
- `src/review-comments/repository.ts` 的列表最多返回100条，且正文允许重复。不管列表中出现同文、列表为空还是对象暂时不可读，都不是某次POST失败/成功的证明。
- 本轮不修改服务端契约，不重放非幂等POST。可靠恢复仍为明确剩余功能，不用永久锁替代完成标准。

## 本轮实现

- 新增 `ReviewCommentsProvider`，由详情的对象/会话挂载生命周期持有草稿、同步写入token及离页守卫，编辑器因错误/权限卸载不清掉它们。独立面板也有同协议所有者。
- 普通草稿采用共享两阶段导航确认：取消、其他守卫最终拒绝保留输入；实际获准导航才清空。确认期间禁止编辑/发写；beforeunload提示。
- POST捕获同步最新正文，同事件重复点击只发一次，pending和unknown冻结编辑并阻止导航，无自动重发或显式重复提交入口。
- 匹配submissionId、服务端trim后正文且无supersedesCommentId的新建回执才释放；网络错误、通用4xx/5xx、回执缺失/不匹配均unknown。精确 `REVIEW_COMMENT_INVALID`400 / `REVIEW_COMMENT_NOT_FOUND`404是当前service写前拒绝，可在重新获准后纠正重提。
- 评论GET只展示受权当前目标，畸形列表信封报错、丢弃异目标行，旧读取无效。失败/重新读取时清空展示，不把私有正文放到错误提示；成功授权恢复原草稿。
- 依赖替换不取消实际写的归属；旧对象写回调、旧GET与强制卸载无权污染新的目标。StrictMode独立面板复挂载通过。
- unknown可只读重新加载列表，但相同正文也不能解除锁，界面中英双语明确尚无可靠恢复入口。不触碰production数据或秘密。

## TDD与验证

- 首轮RED：16失败、4通过，真实失败包括双POST、错误回执清草稿、错误卸载失去保护以及跨目标迟到响应。
- 追加4项畸形GET信封先RED再修正。新增32项测试（23项路由/面板、9项数据契约），涵盖最终导航拒绝、同事件输入、未知后同文列表、403清屏、StrictMode及过期GET。
- 清单审计测试9/9，实际计数29/5/24；`git diff --check`通过。
- 最终定向3文件76/76通过。
- 扩大回归100文件2267/2267通过，包含导航/审核及既有本地Worker/D1回归。
- `npm run typecheck`、评论owner/面板/详情路由独立strict DOM检查通过。
- `npm run build:ui`及VM静态隔离通过；仍有既有大bundle提示。
- `npm run test:i18n`13/13；`npm run verify:i18n`434 keys/55 placeholders/6files及硬编码检查通过，增加一对评论未知文案。
- 附加全App strict DOM仍28条既有诊断，与基线忽略行列号的诊断集合一致；不宣称全App strict检查通过。

## 复验命令

```sh
rtk proxy npx vitest run test/unit/frontend-review-comment-owner.test.tsx test/unit/frontend-review-comments.test.ts test/unit/frontend-review-detail-route.test.tsx
rtk proxy npm run typecheck
rtk proxy npx tsc --ignoreConfig --noEmit --strict --jsx react-jsx --moduleResolution bundler --module esnext --target es2022 --lib es2022,dom,dom.iterable --skipLibCheck frontend/components/review/review-comments-owner.tsx frontend/components/review/review-comments-panel.tsx frontend/pages/admin/review-detail-route.tsx
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy node scripts/functional-checklist-audit.mjs
```

扩大命令保存在本机 `/tmp/a05-comment-regression-command.txt`，日志 `/tmp/a05-comment-*.log`。临时文件不是跨机器持久制品；本地测试框架自动加载绑定提示不等于调用真实AI，没有手动读取/上传秘密。

## 剩余与下一步

主清单29范围内、5关闭、24开放。下一本地实现服务端幂等创建和精确操作查询/安全重试协议，保持session身份绑定、重复正文不合并、跨成员/跨对象不泄漏；先做行为RED与服务/Worker验证，再接前端恢复。本轮内存保护不承诺跨刷新、强制关闭或重启后的恢复。原生键盘/触摸/真实身份验收仍未完成。无本地外部阻塞，未push、部署或远程迁移。
