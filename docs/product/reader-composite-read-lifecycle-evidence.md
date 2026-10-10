# 阅读器组合读取：撤权、取消和版本比较归属

日期：2026-10-10；基线 `871a74cd`；分支 `codex/functional-checklist-completion`。

## 范围及复现

推进 A05/A06/B07 的阅读器读取生命周期。canonical原30、范围29、关闭5、开放24，D08排除。没有新建业务模块、变更API/数据库或把原生验收改成mock验收。

`KnowledgeReaderSession` 主正文读取原已有controller和成员/知识/hash key；附属favorite/related/backlinks读取只用generation过滤晚到回调，没有传AbortSignal。附属GET或版本比较401/403仅设置局部错误，仍显示已读取正文和其他私有面板。比较按钮仅依靠React loading状态，同事件两次点击可发出两个GET。

17项真实路由/加载器测试首先为**13失败/4通过**，日志 `/private/tmp/reader-read-red.log`：9项撤权/恢复路径停在正文仍显示断言，3项卸载/切换停在signal未abort断言，1项比较重复GET为2次而非1次。成员/目标隔离已有key保护，后两类切换测试的原失败仅证明未取消请求，不伪称已经复现跨成员数据泄露。第一次GREEN阶段发现一个未走到过的测试按钮文案写错（Retry而实际为Try again），修正测试选择后继续完整验证，不算产品缺陷。

## 已实现

| 读取操作 | 所有者及取消 | 失败/恢复边界 |
| --- | --- | --- |
| 正文或精确引用入口 | 每次effect创建唯一owner；保留原主读取controller/引用校验 | 普通失败显示重试；401/403退休owner并清空整页 |
| 收藏状态 GET | 同owner auxiliary.signal | 普通500仅收藏状态不可用；401/403撤掉正文及全部私有面板 |
| 相关推荐 GET | 同owner auxiliary.signal | 普通500显示非空态错误；撤权同上，不接收迟到结果 |
| 反向引用 GET | 同owner auxiliary.signal | 普通500局部错误；撤权同上 |
| 版本比较 GET | 同owner下独立AbortController；同步保存diff占用 | 同事件重复点击只发1个请求；普通失败允许显式重试；撤权退休整个owner |
| 离页、成员/知识/hash key切换、locale/retry effect清理 | cancel主请求、abort附属及比较请求 | 底层即使忽略abort，旧owner成功/失败也不改变当前页面 |

撤权先退休owner再清UI；不只隐藏一个错误提示。仅显式点击整页重试才能新建owner并重新授权读取；不会自动重发收藏或笔记写入。比较finally只释放原owner的占用，不释放新页面请求。GET正文在服务端可能记录最近访问，本证据只证明前端没有发起新的mutation请求，不将GET统称为服务端无副作用。

修改局限 `frontend/app.tsx` 阅读器session。当前生成索引270文件/1180候选/110未归属，阅读器入口73源码候选数不变。App外层3个未归属候选的行为未变，仅NotFoundPage返回首页坐标739:250移至757:250；已人工复核并更新该文件指纹，不把指纹当作运行验收。

## 验证记录

- 新增 `test/unit/frontend-reader-read-lifecycle.test.tsx` 17项：3附属端点×401/403、diff×401/403、离页取消、成员/目标切换、同事件比较去重、3普通读取失败、比较显式重试、撤权后显式恢复/旧epoch失败。
- 扩大知识列表/阅读器/笔记意图/分享/图谱/复习周期回归：**33文件424/424**，日志 `/private/tmp/reader-read-expanded.log`。使用真实App路由和加载器，Response fixtures替代HTTP；markdown呈现替换为文本节点，不声称真实登录/原生面板/服务端ACL端到端验收。
- `npm run typecheck` Worker/全前端通过；新增TSX用继承正式严格DOM配置的临时tsconfig单独检查通过。
- 源码操作索引已生成；领域快照check通过。五组清单/操作索引/交付状态契约 **72/72**，日志 `/private/tmp/reader-read-doc-contracts.log`；`audit:functional-checklist` 实测原30、范围29、关闭5、开放24。
- 本批 `npm run check` **退出0**，日志 `/private/tmp/reader-read-full-check.log`：vendor、环境类型、Worker/前端/landing类型、smoke/双语/交付契约通过；unit **359文件5118/5118**、Worker **69文件1161/1161**；UI构建、landing验证 **97/97**、构建秘密扫描、legacy审计、Wrangler **dry-run**通过。日志有既有AI绑定及工具更新提示，不声称零警告；dry-run不是部署。
- 最终 `git diff --check` 通过。

## 仍开放

- 收藏**写入**的同步去重、未知结果/回读与迟到回执语义仍须单独核对；本批只处理收藏GET，不声称修复写入。
- 相关/反链普通局部失败的独立重试入口、比较响应from/to身份绑定等需要继续审查；不能从17项读取生命周期用例推断其完成。
- B07真实身份过滤→阅读→引用旅程、D05双身份、D06原生交互矩阵仍待验；A05/A06/B07父项不关闭。
- 未push、部署、迁移或更新独立VM验收预览。下一允许继续阅读器实际剩余恢复/回执边界，不引入新功能。
