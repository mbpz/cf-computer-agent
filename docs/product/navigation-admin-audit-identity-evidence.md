# 审计记录缺少动作、操作人或时间不当成不可用（本地）

基线：`8d1d4d15`，分支 `codex/functional-checklist-completion`。
归属：D02，不关闭这个父项。

## 发现的问题

审计记录没有动作时，显示“Action unavailable”，操作人和时间仍在。没有操作者种类和编号时，显示“Actor unavailable”，动作和时间仍在。没有时间时，显示“Date unavailable”，动作和操作人仍在。动作不在服务端允许的审计动作里时，页面把这个陌生词当成动作。

## 实际变更

动作不在服务端审计动作列表里、操作者种类不是 member、automation 或 system、或时间不是非空字符串时，页面说明审计不可用。编号若出现，必须是非空字符串；明确为 null 时显示操作者种类。动作、操作人和时间都明确时仍显示。

## 验证

缺少动作的用例先失败：页面显示“Action unavailable”和 member-a。缺少操作者的用例先失败：页面显示 maintenance.drain_started 和“Actor unavailable”。缺少时间的用例先失败：页面显示 member-a 和“Date unavailable”。陌生动作 banana 的用例先失败：页面显示 banana 和 member-a。修复后这四种都说明审计不可用，原文不出现。明确的维护动作仍显示动作、member-a 和时间。操作者编号明确为 null、种类为 system 时，显示 system，不显示操作者不可用。这条路径与审计分页和成熟度路由相关合计 211/211。前端类型、文案静态检查、操作清点（270 个文件、1165 个候选，不是运行验收）和清单审计通过。清单仍是原 30、范围内 29、关闭 5、开放 24。

## 边界

这只覆盖审计列表读取。不关闭 D02。没有数据库迁移。未执行远程迁移、部署或 push。没有在已登录浏览器里走通这条路径。
