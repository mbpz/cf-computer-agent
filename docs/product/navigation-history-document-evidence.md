# A05 / R2-008 — 刷新与跨文档验收增量

2026-10-02；基线 `1006e58`。**29范围内 / 5完成 / 24未完成**；A05/R2-008仍开放。

## 本次变更

- 修复本地夹具每次加载无条件重建 `/inbox → /tasks` 历史的缺陷。只有保留给启动的 `/` 且无查询串才种入两条历史；`/tasks`、其查询串、`/inbox`、`/?preserve=1` 到达不改写历史。该根地址是夹具启动入口，不用于首页重载验收。
- 新增独立HTML跨document目标；通过普通链接离开/返回，不走App共享writer。
- 夹具显示每document随机标识、PerformanceNavigationTiming.type及history.length。API全部为合成应答，既不访问后端，也不存储真实用户数据。
- 补两个fallback新控制器epoch回归：带guard时旧epoch条目不可推断delta、保持accepted并失败关闭；无guard时允许自然浏览器到达并只发布一次。
- 不改生产运行时代码、不改变浏览器安全设置、不使用外部预览。

## 原生浏览器证据

使用用户指定的内置浏览器，本地127.0.0.1:61008。以下是真实App、真实浏览器历史、合成API数据；不是happy-dom的事件模拟。

| 场景 | 实际结果 |
| --- | --- |
| 干净Tasks刷新 | documentId从815d7601…变为416ff8bb…，arrivalType=reload，historyLength保持3，URL仍/tasks，发布0/写0/目标读取0 |
| 刷新后Back/Forward | 原历史可达，Back在同一新document进入/inbox，发布1/写0/读取1；Forward回/tasks |
| 无草稿跨document离开/返回 | 普通链接到独立HTML，返回后documentId变为558ed7c8…，arrivalType=navigate，不重新种入历史 |
| 脏草稿跨document Back、刷新 | 各捕获一组原生beforeunload opening/closed事件，closed.result=false；仍原document、/tasks及草稿，写/发布/目标读取都为0 |
| 合成保存成功后跨document Back | 编辑器关闭后正常到达独立HTML；观察窗口无新增beforeunload事件，未留下幽灵监听器 |
| pending写入时刷新、跨document Back | 两组beforeunload事件均取消，documentId仍7bb1b7a4…、原标题及保存锁保持；写1/发布0/目标读取0，没有重复提交 |
| unknown写入时刷新、跨document Back | 独立tab两组beforeunload事件均取消，documentId仍13189936…、原标题及结果未知锁保持；写1/发布0/目标读取0，没有自动重试 |
| 另一新document刷新后dirty Back | documentId cb295371…、arrivalType=reload。URL恢复/tasks后才显示离开决定，默认继续编辑，未发布/未读取目标 |
| 决定待决时再次Back | 旧决定失效，恢复编辑器及原草稿；没有重复提示、发布或读取。再Back重新获得单一决定 |
| 确认丢弃后精确重放，再Forward | /inbox时累计发布1/写0/读取1；Forward回/tasks后发布2/写0/读取1；historyLength保持3 |

六组原生事件的实测摘要保存在 `navigation-history-document-events.json`，来自CDP Page事件而非应用自报。原始暂存：`/tmp/a05-document-dirty-pending-events.json`、`/tmp/a05-document-unknown-events.json`。每组均有hasBrowserHandler=true、type=beforeunload与closed.result=false。这里证明**浏览器触发提醒并取消后保留状态**，不声称人工看见/点击了原生对话框；也没有确认强制离开，不能推导强制离开后草稿能恢复。

截图：`/tmp/a05-document-pending-retained.png`、`/tmp/a05-document-unknown-retained.png`、`/tmp/a05-document-reload-admitted.png`。原先运行时证据中“没有取得beforeunload对话框”的限制保留为历史快照，本次以新增CDP实测补足事件层证据。

## 测试与校验

- 夹具种历史规则：行为RED 4失败/1通过 → GREEN5/5。日志 `/tmp/a05-history-document-fixture-red.log`、`/tmp/a05-history-document-fixture-green.log`。
- 新epoch两项是追加现有行为的回归，不是产品缺陷RED。初跑2失败/27通过来自测试误把URL对象当字符串；更正使用href、等待异步失败及实际restore-failed枚举后通过，不以该测试书写错误宣称修复生产问题。
- 历史核心、gate、location、真实任务编辑器与TasksRoute：**5文件179/179**，退出0；`/tmp/a05-history-document-regression.log`。
- 提交前完整导航回归：**23文件547/547**，退出0；`/tmp/a05-history-document-full-final.log`。覆盖范围与上轮运行时23文件一致，新增两项epoch回归；不是全仓测试。
- 项目typecheck、夹具启动helper独立严格类型、位置测试及其DOM依赖严格类型通过。扩展到测试文件的类型检查发现既有Timeout模拟转换和history.state直接属性访问问题，仅修正测试类型/断言形式，行为不变；失败及通过日志分别为`/tmp/a05-history-document-dom-types.log`与`/tmp/a05-history-document-dom-types-green.log`。
- build:ui及VM构建隔离、i18n13/13、verify:i18n通过；`/tmp/a05-history-document-final-checks.log`。保留既有大chunk警告与Vitest绑定配置警告；未直接读取/上传秘密文件或调用真实AI。
- 清单审计29/5/24、清单契约9/9通过；`/tmp/a05-history-document-audit.log`、`/tmp/a05-history-document-checklist-tests.log`。
- 验收临时tab已关闭，原用户预览tab未改；本轮Vite进程已停止。

## 仍开放的范围与下一步

- 原生keyboard快捷键发送后没有发生历史变化，不能记作键盘验收成功；touch手势与真正并发的快速遍历没有完成。本次验证的是**决定待决期间再次Back**，不是所有时序组合。
- 浏览器CDP Browser.getVersion不受当前工具支持；只读页面求值无法取得navigator.userAgentData。仍只有reduced UA Chrome/154.0.0.0，不能冒充完整版本。
- fallback跨epoch为端口回归，不是另一浏览器原生覆盖；原生取消离开不等于BFCache、强制离开/关闭窗口或注销身份旅程全覆盖。
- A05还要求逐页弹层/危险操作/表单状态审计。本次只收敛任务编辑器的document边界，不关闭父项或全功能目标。

无生产变更，无push、部署、远程迁移、真实AI请求。下一步可继续原计划的其余原生矩阵及逐页功能审计，不需要重复批准；当前工具对键盘/完整版本的证据限制单列，不能据此阻止其他可执行事项。
