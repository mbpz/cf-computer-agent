# 审核评论唯一操作编号与精确恢复证据

日期：2026-10-02。基线：`3c64a8e`。用户确认“唯一操作编号＋同编号安全重试＋精确查询结果”。本次为 A05 / R2-008 / 导航 Task 4 的本地子项，不关闭父项。

## 实现契约

- 前端首次提交生成 UUIDv4，冻结编号和规范化正文；同步引用阻止重复点击。未知结果只允许显式重试原编号/原正文，不自动重试、不切换为新编号。
- 新增 `PUT /api/admin/submissions/:submissionId/comments/requests/:operationId`；`GET` 同路径精确读取。响应为 HTTP 200、`operation: { version: 1, operationId, submissionId, comment }`。仅 GET 允许 `comment: null`；空结果不是原 PUT 未提交的证明，保留未知锁和冻结草稿。
- 服务端从当前会话取得 memberId，检查审核能力、管理员身份和目标访问；SHA-256 对版本、成员、目标及 UUID 编码，生成独立命名空间的评论主键。现有 D1 主键冲突约束原子决定胜者，`ON CONFLICT(id) DO NOTHING` 后读取原记录；相同编号不同正文返回409，不覆盖回执。
- 无新表或迁移；现有 append-only 评论记录即回执。后续编辑新增记录，不改变原操作回执。查询按精确主键，不靠正文、最新评论或100条列表窗口猜测。
- 客户端严格匹配版本、编号、目标、正文、新建记录和有效时间；拒绝202/204等非协议响应、错目标、编辑回执及畸形数据。接口不存在也不回退旧POST。
- 查询/重试权限失败隐藏私有内容、保留未知操作；旧目标/旧读取回执不能修改当前目标。重试的写前拒绝不能否定原请求可能已提交，故仍保留编号。
- 面板提供“重试同一评论”，重新读取会精确核对待决操作；草稿输入上限4000，服务端按Unicode码点验证现有SQLite约束。中英文文案同步。

## 验证

- RED：服务/Worker首轮3项失败（尚无协议）；客户端协议14项失败（尚无函数）；所有者适配后的首轮18失败/9通过，之后实现协议及修正旧POST夹具。
- 定向5文件119/119通过：前端所有者29、客户端协议14、既有评论数据11、服务3、完整M1 Worker API62。
- D1实际并发4个同编号请求仅1行；不同正文409；编辑后查回原始回执；不同编号同文可新建。按项目唯一管理员约束先转移角色再验证成员隔离，不放宽生产约束；目标隔离、列表窗口外精确查询、禁用成员拒绝均通过。
- 最终扩大回归101文件2291/2291通过，覆盖工作台导航、审核、草稿、评论与既有Worker/D1链路（包含完整M1 API及submissions）。
- 项目typecheck、owner/面板/详情路由独立strict DOM、UI构建/VM静态隔离全部通过；双语13/13及434 keys/55 placeholders/6 files校验通过。保留既有bundle大小提示。
- 全App附加strict DOM仍28条诊断，与上轮日志完全相同，不记全绿。
- 成熟度契约仍13/14：ready的`environments`缺成熟度记录，是既有独立问题。本轮不隐藏路由或降低契约以通过。
- 清单审计9/9；实际29范围内、5关闭、24开放（原30，D08排除）。

## 复验命令

```sh
rtk proxy npx vitest run test/unit/frontend-review-comment-owner.test.tsx test/unit/frontend-review-comment-operation.test.ts test/unit/frontend-review-comments.test.ts test/unit/review-comments-service.test.ts test/worker/m1-api.test.ts
rtk proxy npm run typecheck
rtk proxy npx tsc --ignoreConfig --noEmit --strict --jsx react-jsx --moduleResolution bundler --module esnext --target es2022 --lib es2022,dom,dom.iterable --skipLibCheck frontend/components/review/review-comments-owner.tsx frontend/components/review/review-comments-panel.tsx frontend/pages/admin/review-detail-route.tsx
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy node scripts/functional-checklist-audit.mjs
```

## 明确边界与下一步

本次恢复是页面会话内的精确恢复；编号和冻结正文仍仅保存在内存，不能承诺强制刷新、关闭浏览器或重新登录后恢复。后续跨刷新持久恢复需要独立实现/验收，原生离页与真实身份验收仍开放。服务端回执依赖评论及所属投稿仍存在，不承诺删除后无限期去重。未push、部署、远程迁移、读传生产秘密或触发真实AI；不修改用户已排除的备份/加密范围。A05/R2-008/导航Task 4仍开放，允许继续其余本地工作。
