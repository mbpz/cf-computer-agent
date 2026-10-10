# 知识卡片系统分享：本地操作生命周期

日期：2026-10-10。基线 `f8cc71d7`，分支 `codex/functional-checklist-completion`。

## 范围与真实缺口

推进 A05 的知识卡片可见分享操作，不关闭父项：原30、范围29、关闭5、开放24，D08排除。沿用既有 `shareKnowledgeItem`，不新增公开分享权限、服务端写入、自动重试或外网代理。

原组件只有 idle/shared/unavailable，没有同步占用或 pending。原10条组件用例实际 RED 为6失败/4通过；审查再次复现（6文件186项中的6个失败均为此新增测试）。迟到目标用例当时的失败是 pending/disabled 断言，不能据此声称已证明跨目标泄漏。原页面已按 item.id 为卡片设 key，成员切换也卸载旧页面。

## 实现及边界

- 在确认对话框及首次 await 之前同步保存本次 owner，同事件重复点击不再次确认或调用 navigator.share。
- pending 时按钮禁用、aria-busy=true，显示中英文等待文案；新操作开始立即清除旧成功/失败提示。
- 调用时冻结当前 item.id、标题与同源地址；同目标刷新不改变已经交给系统的 payload，不解开正在进行的锁。
- 成功、取消、失败仅由当前 owner 结算；失败后允许用户显式重新操作。卸载清除本地 owner，旧回调不更新已卸载实例。
- 卸载只放弃本地回调，**不能关闭或取消操作系统分享面板**；不提供跨实例全局系统面板锁。取消不是成功；API缺失显示不可用，不退化为服务端写入。
- 这是设备分享 UI，不是有操作编号的服务端业务写入；不虚构可精确查询的 OS 分享结果。

## 当前源码候选映射

源码索引仍为270文件、1180候选、110未自动归属；`/knowledge`保持67候选。卡片4项如下，替代列表证据中该文件的历史坐标；其余列表映射仍沿用原证据。候选包括展示节点，不是4个独立业务动作。

| 当前坐标（frontend/components/knowledge/knowledge-card.tsx） | 意义/触发 | handler及证据 |
| --- | --- | --- |
| 29:39 | 标题链接，卡片存在时可见 | 同源知识阅读导航；接收者权限仍由阅读API校验 |
| 29:534 | 分享按钮；pending禁用 | share → shareKnowledgeItem → confirm/navigator.share；生命周期测试与system-share测试 |
| 29:859 | shared结果提示 | 仅当前owner成功后显示，无独立动作 |
| 29:1008 | unavailable提示 | 仅当前owner失败后显示，无独立动作 |

## 验证

- 原10项由6失败/4通过转为10/10；随后增加StrictMode与中文取消回归，共12项。使用真实组件及分享适配器，仅替换浏览器平台API，不声称调用了真实系统面板。
- 扩大知识/图谱/阅读器分页/复习周期/分享回归：28文件303/303，日志 `/private/tmp/knowledge-share-expanded.log`。
- 测试文件严格DOM类型检查发现happy-dom未声明confirm属性，改用Object.defineProperty设置测试平台接口后通过；未放宽类型配置。
- i18n契约13/13；操作源码索引和领域快照校验通过。
- 当前产品与测试代码的完整 `npm run check` 已退出0：unit358文件5101/5101，Worker69文件1161/1161，landing97/97；Worker/前端/landing类型、构建、产物密钥扫描、legacy审计及Wrangler dry-run通过。日志 `/private/tmp/knowledge-share-full-check.log`。测试含预期负向异常输出及工具警告，不称零警告。
- 最终夹具及文档同步后复验：分享组件与适配器2文件14/14（`/private/tmp/knowledge-share-final-focused.log`）；索引/App/清单/交付/成熟度5文件72/72（`/private/tmp/knowledge-share-doc-contracts.log`）；清单29/5/24、索引、领域快照及git diff --check通过。本地check不替代D07整个功能候选的最终验收。

## 剩余与下一步

真实系统面板、原生键盘/触控、真实双身份旅程仍待验；A05/B07/D05/D06不关闭。未push、部署或迁移，独立VM预览未更新。下一步继续核对阅读器可见操作与请求恢复边界，已有测试覆盖先复用，不新增无关功能。
