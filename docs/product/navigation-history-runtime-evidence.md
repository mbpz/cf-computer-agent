# A05 / R2-008 — 浏览器历史运行时接入证据

2026-10-02；基线 `20b4038`；本地代码、模拟端口回归及内置浏览器夹具验证。不是生产或全浏览器验收。

## 清单与实施范围

原始30项，D08按用户范围排除：**29范围内 / 5完成 / 24未完成**。A05、R2-008保持开放；本次关闭其“共享历史运行时与获准位置订阅”实施子项，不关闭逐页审计或完整原生矩阵。

- 新增 `workspace-browser-history.ts`：Navigation API按sameDocument/key/id/url验证真实位置；无此API时使用本document epoch内的已知history.state位置。只计算已验证的delta，不猜测未知历史步数。
- 原始currententrychange/popstate/hashchange只交给适配器；App位置、查询、hash读取及订阅均观察accepted位置。恢复/重放期间显式writer禁止写入，旧显式确认也必须重新检查可用性。
- 当前草稿留在原位置，恢复完成后才询问；确认后精确重放，实际到达且最终guard重验通过才发布。重复事件不重复发布，finished promise不能单独作为验收。
- 恢复10秒超时、条目失效或未知位置保持草稿及获准视图，展示双语恢复提示和显式重试入口。禁止建议在pending/unknown时直接刷新。
- 成功注销先撤销旧控制器，记录浏览器已排队但不可撤销的命令。迟到旧身份到达不得发布到新会话，原生与fallback各有回归。

## 行为 RED 与回归

| 阶段 | 结果 / 日志 |
| --- | --- |
| 实际位置订阅尚未接线 | RED 4失败/15通过；`/tmp/a05-history-runtime-red.log` |
| 初始适配器接线 | GREEN 19/19；`/tmp/a05-history-runtime-green1.log` |
| 旧显式确认与恢复竞态 | RED 1失败/19通过；可用性重验后4文件135/135；`/tmp/a05-history-old-explicit-red.log`、`/tmp/a05-history-runtime-green2.log` |
| 未验证位置的可见提示 | RED 1失败/78通过 → GREEN79/79；`/tmp/a05-history-fault-ui-red.log`、`/tmp/a05-history-fault-ui-green.log` |
| 注销后迟到重放 | 原生/fallback RED2失败/22通过 → 位置+编辑器81/81；`/tmp/a05-history-logout-queued-red.log`、`/tmp/a05-history-logout-queued-green.log` |
| 恢复超时、失效原生身份补充验证 | 位置27/27；`/tmp/a05-history-runtime-boundaries-final.log` |
| 最终导航/路由回归 | **23文件545/545**，退出0；`/tmp/a05-history-runtime-full-final2.log` |

最终23文件包括历史核心、gate、位置、编辑器、Tasks、Inbox、Calendar、Planning、Timeline、Notifications、Discussion、Boards、Reader/Admin/Moderation分页、Analytics、Agent取消、Home、Logout、Cutover、Shell、Tasks data、Inbox恢复。不是全仓测试。

首轮完整回归13失败/529通过没有略过：happy-dom 20.11.6的HistoryItemList.replace会截断forward条目，fallback写位置标记暴露此模拟缺陷。新增仅负责浏览器动作/事件的可控driver，四个分页/任务路由套件使用它，不包含生产准入逻辑；初始化spy计数在被测操作前清空。原来靠“URL/身份未变的裸popstate”强制重读的任务测试改用获准的同URL replace，保留撤权后私有数据不得复活的原断言。DOM端口证据不冒充原生浏览器证据。日志 `/tmp/a05-history-runtime-full.log`、`/tmp/a05-history-runtime-boundary-green2.log` 保留失败及修复过程。

## 内置浏览器原生验证

本地夹具 `design/navigation/2026-10-02-history-runtime.{html,tsx,config.mjs}`，仅监听127.0.0.1:61008；真实App/编辑器模块与原生history，API全部为合成fixture、不会转发。无Worker插件，无新依赖，不加载生产secrets。该夹具不是生产bundle/后端验收。

| 操作 | 实际观察 |
| --- | --- |
| 新建草稿后原生Back | URL恢复/tasks，编辑器保留，默认焦点继续编辑；发布0、写0、Inbox读取0 |
| 继续编辑，再Back并放弃修改 | 只在确认到达后进入/inbox；发布1、写0、Inbox读取1 |
| 原生Forward | 回到/tasks；累计发布2、写0、Inbox读取1 |
| 写结果未知后Back | 草稿及unknown锁定保留；无丢弃提示，发布/写入/目标读取计数不增加 |
| 独立页面pending写入后Back | /tasks与编辑器保留；发布0、写1、Inbox读取0；未重复写入 |
| pending时尝试reload | 调用后仍保留原草稿及计数，但未取得beforeunload对话框；**仅记录观察，不记刷新原生提醒验收通过** |

截图：`/tmp/a05-native-history-unknown-retained.jpg`、`/tmp/a05-native-history-pending-retained.jpg`。截图是本机临时证据，未公开上传。

夹具模式需在打开模态前选择；模态打开时外部模式按钮不可用。unknown场景尝试切成功模式没有生效，随后用户式显式重试仍unknown（写计数从1到2），因此不声称本轮验证了unknown恢复成功。此明确重试不是Back产生的重复写入。

浏览器仅取得reduced UA Chrome/154.0.0.0，不当作完整版本证据；未更改安全设置。没有用DOM模拟代替以上原生按钮动作。

## 其他门禁与剩余边界

- 项目typecheck、独立严格DOM类型（含新适配器/提示/driver）、build:ui及VM构建隔离通过；保留既有大chunk警告。
- test:i18n13/13、verify:i18n通过；`/tmp/a05-history-runtime-checks-final.log`。
- 清单审计与契约单独复核，父项计数不因子项实施变化而变化。
- Vitest启动仍打印现有binding配置提示；未直接读取/上传secret文件，测试未调用AI。无push、部署、迁移或独立预览更新。

仍开放：刷新后历史epoch/跨文档离开、真实键盘/触控与连续按钮矩阵、完整浏览器版本/身份旅程、逐页其余弹层审计。当前fixture每次加载会重新种入历史，不能拿它证明刷新后的原历史恢复。下一步应补专用跨document/刷新夹具与验收，不重复设计批准；无外部阻塞。全部功能目标尚未完成。
