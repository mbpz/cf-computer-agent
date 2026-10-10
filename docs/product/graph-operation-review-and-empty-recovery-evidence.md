# Graph 操作逐项对账与空结果恢复 — 2026-10-10

基线：`codex/functional-checklist-completion` / `0d06b3ab`；本文包含本轮空结果修复后的源码快照。所属 A01/A02/A05，**不关闭父项**。

## 范围与结论

- 对 `/graph` 的 GraphRoute/GraphPage、画布、检查器、引用面板及建议面板进行源码语义核对；将当前自动索引的 **68 个候选**全部分类，避免把 option、状态文本、组件转发和监听器误算成 68 个独立用户操作。
- 下表记录实际 handler、显示条件、API/权限/存储与测试入口。仅图谱页面本身；AppShell、账户菜单及目标页面自己的操作不在本表中重复计数。列表/图形动态节点按同一模板枚举，不宣称真实账号数据和原生设备的每个实例均已操作。
- 核对发现并修复：服务端图谱结果为空时，`GraphPage` 提前返回，隐藏筛选、视图记录恢复等控制；持久化的知识/时间/变更筛选可在刷新后再次触发该死路。
- **未完成**：全站其他页面的语义映射、原生浏览器/真实身份/键盘触控与主题尺寸验收、最终全功能候选门禁。当前父项仍为 **29 范围内 / 5 已关闭 / 24 未关闭**；D08 独立排除。

## 操作与触发条件

`Gxx` 是本对账的局部编号，不是新增产品任务。测试路径均相对于仓库根；这里的测试是本地自动化，不冒充原生端到端。

| 编号 | 可见入口、触发/禁用条件 | handler / 行为 | API / 存储契约 | 对应测试 |
| --- | --- | --- | --- | --- |
| G01 | 搜索框；ready/truncated/empty | `setQuery` → `filterSnapshot`，按 label/id 本地过滤；不重新 GET | V，非服务器搜索 | `test/unit/frontend-graph-page.test.tsx`：view refresh |
| G02 | 视角 workspace/knowledge/work；ready/truncated/empty | `setLens`；取消旧读和建议、发新读 | R + V；work 发送 types，knowledge 发送 scope | 同文件：empty-result recovery、suggestion scope |
| G03 | 时间 all/7d/30d/90d；同上 | `setTemporalRange`；非 all 计算 from/to 后重读 | R + V | 同文件：empty-result recovery；`frontend-graph-data.test.ts` |
| G04 | 变更 all/added/updated/completed/archived；同上 | `setChangeKind`；非 all 向 API 传 changeKind | R + V | 同文件：empty-result recovery；`frontend-graph-data.test.ts` |
| G05 | error/forbidden/empty 的显式重读按钮；loading 不显示 | `onRetry` → loading + retry 代次；GET，不重放写入 | R；401/403 清屏，仍可显式重读权限 | 同文件：撤权恢复、empty-result recovery |
| G06 | `viewBlocked` 且页面为 ready/truncated/empty | `discardView`；仅明确丢弃无法读取的本标签成员视图记录 | V；不是业务删除，不影响操作编号 | 同文件：view refresh、empty-result recovery |
| G07 | `recordBlocked` 且页面为 ready/truncated/empty | `discardBlockedGraphAction`；显式丢弃损坏本地操作记录后解锁 | I；不撤销服务器操作，也不是其成功证明 | 同文件：action record recovery |
| G08 | 非空结果下图形节点 tap 或语义列表按钮 click | `onSelect` → `setSelectedId`；选中后聚焦检查器、触发相关边引用读取 | 选择仅内存；读取 E | `frontend-graph-canvas.test.tsx`、`frontend-graph-page.test.tsx` |
| G09 | 语义列表节点获得焦点时 | 方向键循环移动焦点；Enter/Space 选择；Escape 清选择 | 仅内存，不写后端；不是“键盘已原生验收” | `frontend-graph-a11y.test.tsx` |
| G10 | 已选中节点检查器关闭按钮 | `onClose` → 清选择；中止旧引用读取 | 无持久化写 | `frontend-graph-inspector.test.tsx`、`frontend-graph-evidence.test.tsx` |
| G11 | 检查器 model.href 可用时的链接 | 原生 anchor 到模型提供的业务页；受工作区导航守卫约束 | 目标页面重新请求/授权；本表不代验目标旅程 | `frontend-graph-inspector.test.tsx`、`frontend-workspace-navigation-gate.test.ts` |
| G12 | 检查器节点为 knowledge/task/project/decision，onAction 存在；记录损坏、running/checking 或成功状态禁用 | `runGraphAction`；knowledge→任务、task→25分钟专注、project→milestone、decision→action_item；无项目上下文则不发送。页面没有类型选择器/确认弹窗，不虚构二级操作 | W + I；首次编号先保存，未决时不创建新编号；四动作/三 POST 端点 | `frontend-graph-actions.test.ts`、`frontend-graph-page.test.tsx`、`test/worker/graph-actions.test.ts` |
| G13 | 未决恢复卡中的“查询结果”；checking 禁用 | `checkGraphAction` / `queryGraphAction`；按原编号及来源精确 GET；404/普通错误不证明未写入 | Q + I；与重试互斥；撤权清屏但保留未决身份 | 同上；`navigation-graph-exact-result-evidence.md` |
| G14 | 未决恢复卡或同节点检查器重试；checking 禁用；运行时无重试卡 | `runGraphAction(action)`；同编号、冻结原节点载荷重试，不按新选择改意图 | W + I；失败仍保留原编号；清本地记录失败不得宣布解除未决 | 同上 |
| G15 | ready/truncated 建议面板生成/再次生成；loading 禁用 | `generateSuggestions` / `loadGraphSuggestions`；同步 controller 锁防同事件重复；切换服务器查询范围或卸载取消，迟到结果不回填 | S；GET 默认 workspace，**不传当前 query/lens/time/change 参数**；卡片仅展示，没有采纳/发布按钮 | `frontend-graph-page.test.tsx`、`test/worker/graph-suggestions.test.ts` |
| G16 | 选中节点后相关边有 citationIds 时自动读取 | `GraphEvidencePanel.read` → 并行去重读取；无选择 idle，无引用 gap；全404为 gap，普通失败为 error，401/403立即撤权 | E；只读，无操作编号 | `frontend-graph-evidence.test.tsx`、`test/worker/graph-evidence.test.ts` |
| G17 | 引用面板普通 error 的重试按钮 | 同一 `read`；请求所有当前引用；同步去重，不自动重试 | E；旧选择/卸载结果无效 | `frontend-graph-evidence.test.tsx` |
| G18 | 引用读取成功后每条标题链接 | 跳转 `/knowledge/{knowledgeItemId}#{citationId}`，ID 编码 | 目标阅读器回读精确引用，不能用图谱显示代替目标授权 | `frontend-graph-evidence.test.tsx`；阅读器旅程仍归 B07/B09 |
| G19 | running/checking/unconfirmed 意图存在时离开/刷新 | 工作区 leave guard 阻止导航；beforeunload 设置警告，卸载释放；撤权释放界面锁但不擅自删除未知写 | I；只保证当前标签存储范围，不承诺关浏览器后保存 | `frontend-graph-page.test.tsx`、history/location/navigation 测试 |
| G20 | 画布布局终止、尺寸/媒体可见性变化 | layoutstop 清计时器；resize/媒体事件创建或销毁图形；语义列表保留 | 内部生命周期，不是用户提交/API | `frontend-graph-canvas.test.tsx` |

## 后端与持久化绑定

| 契约 | handler / API | 权限和持久化边界 |
| --- | --- | --- |
| R | `frontend/lib/graph-data.ts#loadGraph` → `GET /api/graph`；`src/routes/graph.ts#routeGraphApi` → `src/graph/service.ts#GraphProjectionService.get` | `tasks:use` + member principal；从 principal 取得 memberId；`src/graph/repository.ts` 各成员作用域投影查询；只读。服务端授权后才返回节点/边/引用。cursor API 存在，但本页没有翻页按钮，truncated 只是提示。 |
| V | `frontend/lib/graph-view.ts` | `sessionStorage` 按成员键隔离，非默认筛选恢复；默认视图由无记录表示。无法读取时不得默默覆盖；显式 discard 后才恢复保存。不是后台偏好设置，也不是跨标签同步。 |
| I | `frontend/lib/graph-action-intent.ts` | 同标签成员作用域操作记录，冻结 clientKey/node。刷新恢复不自动 POST；持久化失败不得发送新写。移除记录仅是本地恢复状态变更。 |
| W | `frontend/lib/graph-actions.ts#dispatchGraphAction` → `POST /api/tasks`、`POST /api/focus`、`POST /api/projects/{id}/timeline` | `src/routes/tasks.ts`、`focus.ts`、`project-timeline.ts` 均要求 `tasks:use`、member principal。对应 service/repository 使用 memberId；任务关联知识重新授权、专注校验所属任务、时间线校验所属项目。D1 保存业务实体及幂等身份；前端核验回执实体与原编号/来源一致，不接受任意成功 JSON。不是新建图谱写库。 |
| Q | `queryGraphAction` → `GET /api/tasks/{key}`、`GET /api/focus/{key}`、`GET /api/projects/{id}/timeline/{key}` | 同一成员授权链。任务需同编号且有当前可见知识链接；专注核验 taskId/id/clientKey；时间线核验 projectId/id/clientKey。`cache:no-store`；不扫描列表、不拿当前专注替代历史结果。 |
| E | `frontend/lib/graph-evidence.ts#loadGraphCitation` → `GET /api/knowledge/citations/{id}`；`src/routes/library.ts` → `src/library/service.ts#readCitation` | 按当前 LibraryScope 授权，解码 revision/chunk 后 `findCitation`，不返回未授权记录。没有写入；关联 `graph-evidence-read-recovery-evidence.md`。Worker 图谱引用路由测试使用服务 mock，不称为 D1 集成证明。 |
| S | `frontend/lib/graph-suggestions.ts` → `GET /api/graph/suggestions`；`src/routes/graph-suggestions.ts` | `tasks:use` + memberId 的图谱投影；`src/graph/ai-suggestions.ts` 调 AI 生成受约束建议，`promotionRequired:true`，不写入业务关系。本轮测试使用 mock，不调用真实 AI/付费资源。 |

本表不声称任意同编号但不同请求载荷都具有统一冲突语义；G14 承诺的是图谱已冻结意图的同参数安全重试。尚无独立图谱审批/批量修改/删除/导出/建议采纳按钮；不能从 API 或相邻 roadmap 推断 UI 已存在。

## 本轮缺口修复和验证

1. 新增 `graph empty-result recovery` 8 项：三个服务端筛选空结果后的放宽、已保存筛选重新挂载、空态显式重读且不发建议/写请求、空态损坏视图记录丢弃及恢复保存、重读401/403不泄露筛选。
2. 生产源码修改前，单文件 **8 failed / 68 passed**；失败来自空态缺失选择器/重读按钮/记录提示。日志 `/private/tmp/graph-empty-recovery-red.log`。
3. 删除 empty 的提前返回，让 empty 与 ready/truncated 共用筛选和恢复入口；空态显示0节点及显式重读，仍不挂载画布/检查器/建议生成。loading/error/forbidden 分支保持原先隐私边界；不自动重置筛选、不改 API/迁移/操作编号协议。
4. 首次修复回归 **1 failed / 272 passed**：新增测试误要求默认视图写入记录；源码 `blankGraphView` 明确以无记录表示默认值。修正测试为丢弃后无记录、选择7d后可保存；没有改产品存储契约来迎合断言。
5. 最终联合回归 **14 files / 296 passed**，包含前端图谱7文件、导航3文件、Worker图谱/动作/引用/建议4文件；日志 `/private/tmp/graph-empty-recovery-green-final.log`。其中画布独立组件测试与页面内 mock 画布测试分开，不宣称真实渲染验收。
6. Worker/前端 typecheck、单独严格检查本次 TSX 测试通过。操作索引初次 --check 按预期发现源码漂移，显式 --write 后通过：270源文件、1176候选；领域审计通过。其余门禁结果如下。


7. `npm run test:smoke`：79/79，i18n 13/13，delivery 30/30；i18n 校验434 keys/55 placeholders/6 files。首次沙箱运行因 `listen EPERM 127.0.0.1` 中止，申请监听权限后重跑完整同命令退出0，不将失败/未执行阶段记为通过。最终日志 `/private/tmp/graph-empty-smoke.log`。
8. 四套文档/清点契约64/64：functional-checklist-audit、workbench-maturity-contract、delivery-status-contract、frontend-operation-inventory。日志 `/private/tmp/graph-empty-contracts.log`。
9. `npm run build:ui`（含既有静态VM隔离检查）通过；既有 >500kB chunk 提醒仍在，未掩盖。日志 `/private/tmp/graph-empty-build.log`。本轮未运行全量 `npm run check`，因此不更新D07为当前全部门禁完成。
10. 人工映射交叉检查：68个候选ID无重复且与索引集合相等、所列源码指纹匹配、canonical128个相对证据链接均存在；这仅证明映射/链接一致性。`git diff --check`通过。
11. 原生工具复核：`rtk proxy orca status --json` 返回 `orca: No such file or directory`；当前不能执行原生浏览器验收。并非用户机器仍锁定的证据；不绕过安全配置或把本地DOM测试冒充用户自带浏览器。该限制不妨碍继续其他页面的本地源码核对。

没有 push、部署、远程迁移、生产写入或 Secret 同步；不将上一提交的全量 check 结果冒充本次完整候选验证。

## 候选逐项分类快照

下表与本轮生成的 `frontend-operation-inventory.json` 的 `/graph` candidateOperationIds 一一对应；坐标以本轮源码为准。`展示`、`转发`、`通用包装`明确不是额外业务操作。这是源码索引的完备性，不是动态 UI/原生验收的完备性。

| 源码候选（仓库相对路径:行:列） | 分类/映射 |
| --- | --- |
| `frontend/components/graph/graph-canvas.tsx:203:7` | G20 layoutstop |
| `frontend/components/graph/graph-canvas.tsx:247:9` | G08 tap |
| `frontend/components/graph/graph-canvas.tsx:270:7` | G20 media change |
| `frontend/components/graph/graph-canvas.tsx:271:7` | G20 legacy media listener |
| `frontend/components/graph/graph-canvas.tsx:298:7` | G09 |
| `frontend/components/graph/graph-canvas.tsx:330:15` | G08 click |
| `frontend/components/graph/graph-evidence-panel.tsx:71:42` | 引用拒绝展示 |
| `frontend/components/graph/graph-evidence-panel.tsx:72:140` | 引用错误展示 |
| `frontend/components/graph/graph-evidence-panel.tsx:72:206` | G17 |
| `frontend/components/graph/graph-evidence-panel.tsx:74:277` | G18 |
| `frontend/components/graph/graph-inspector.tsx:33:5` | 检查器焦点容器，非操作 |
| `frontend/components/graph/graph-inspector.tsx:40:23` | G10 |
| `frontend/components/graph/graph-inspector.tsx:50:21` | G11 |
| `frontend/components/graph/graph-inspector.tsx:68:15` | G12/G14 |
| `frontend/components/graph/graph-inspector.tsx:83:44` | 写入错误展示 |
| `frontend/components/ui/alert.tsx:11:72` | 通用包装/属性转发；行为由上述调用方决定 |
| `frontend/components/ui/alert.tsx:12:98` | 通用包装/属性转发；行为由上述调用方决定 |
| `frontend/components/ui/alert.tsx:13:106` | 通用包装/属性转发；行为由上述调用方决定 |
| `frontend/components/ui/button.tsx:33:5` | 通用包装/属性转发；行为由上述调用方决定 |
| `frontend/components/ui/card.tsx:5:37` | 通用包装/属性转发；行为由上述调用方决定 |
| `frontend/components/ui/card.tsx:9:85` | 通用包装/属性转发；行为由上述调用方决定 |
| `frontend/components/ui/card.tsx:10:83` | 通用包装/属性转发；行为由上述调用方决定 |
| `frontend/components/ui/card.tsx:12:86` | 通用包装/属性转发；行为由上述调用方决定 |
| `frontend/components/ui/input.tsx:6:5` | 通用包装/属性转发；行为由上述调用方决定 |
| `frontend/components/ui/page-state.tsx:12:10` | 通用包装/属性转发；行为由上述调用方决定 |
| `frontend/components/ui/skeleton.tsx:4:92` | 通用包装/属性转发；行为由上述调用方决定 |
| `frontend/lib/workspace-browser-history.ts:122:3` | G19 共享历史观察，非独立图谱操作 |
| `frontend/lib/workspace-browser-history.ts:123:3` | G19 共享历史观察，非独立图谱操作 |
| `frontend/lib/workspace-browser-history.ts:124:3` | G19 共享历史观察，非独立图谱操作 |
| `frontend/pages/graph-page.tsx:84:5` | G19 |
| `frontend/pages/graph-page.tsx:189:47` | G13/G14 恢复卡展示 |
| `frontend/pages/graph-page.tsx:192:7` | G13 |
| `frontend/pages/graph-page.tsx:193:7` | G14 |
| `frontend/pages/graph-page.tsx:194:28` | 查询未确认展示 |
| `frontend/pages/graph-page.tsx:196:39` | 成功编号展示 |
| `frontend/pages/graph-page.tsx:203:124` | G05 error |
| `frontend/pages/graph-page.tsx:204:118` | G05 forbidden |
| `frontend/pages/graph-page.tsx:220:11` | G01 |
| `frontend/pages/graph-page.tsx:221:11` | G02 |
| `frontend/pages/graph-page.tsx:222:13` | G02 option workspace |
| `frontend/pages/graph-page.tsx:223:13` | G02 option knowledge |
| `frontend/pages/graph-page.tsx:224:13` | G02 option work |
| `frontend/pages/graph-page.tsx:226:11` | G03 |
| `frontend/pages/graph-page.tsx:227:13` | G03 option all |
| `frontend/pages/graph-page.tsx:228:13` | G03 option 7d |
| `frontend/pages/graph-page.tsx:229:13` | G03 option 30d |
| `frontend/pages/graph-page.tsx:230:13` | G03 option 90d |
| `frontend/pages/graph-page.tsx:232:11` | G04 |
| `frontend/pages/graph-page.tsx:233:13` | G04 option all |
| `frontend/pages/graph-page.tsx:234:13` | G04 option added |
| `frontend/pages/graph-page.tsx:235:13` | G04 option updated |
| `frontend/pages/graph-page.tsx:236:13` | G04 option completed |
| `frontend/pages/graph-page.tsx:237:13` | G04 option archived |
| `frontend/pages/graph-page.tsx:241:23` | G06 提示展示 |
| `frontend/pages/graph-page.tsx:241:197` | G06 |
| `frontend/pages/graph-page.tsx:242:22` | V 保存失败展示 |
| `frontend/pages/graph-page.tsx:243:25` | G07 提示展示 |
| `frontend/pages/graph-page.tsx:245:9` | G07 |
| `frontend/pages/graph-page.tsx:248:51` | 写入结果状态展示 |
| `frontend/pages/graph-page.tsx:251:11` | G05 empty |
| `frontend/pages/graph-page.tsx:254:9` | G15 转发 |
| `frontend/pages/graph-page.tsx:255:40` | 截断提示展示，无更多按钮 |
| `frontend/pages/graph-page.tsx:257:11` | G08/G09 转发 |
| `frontend/pages/graph-page.tsx:259:13` | G10/G12/G14 转发 |
| `frontend/pages/graph-page.tsx:267:13` | G16 撤权回调转发 |
| `frontend/pages/graph-page.tsx:358:10` | GraphRoute → GraphPage props 转发 |
| `frontend/pages/graph-page.tsx:364:269` | G15 |
| `frontend/pages/graph-page.tsx:366:34` | 建议失败展示 |

### 已核对入口文件指纹

仅用于识别本文快照，不是测试/权限/运行验收。

- `frontend/components/graph/graph-canvas.tsx` SHA256 `821e75d5da10dcaf3e493e0ab02a6b8a294f4f4e3f622263528326b61eb6d84a`
- `frontend/components/graph/graph-evidence-panel.tsx` SHA256 `3f0180ce554bb0424c403b0ebaa4861a6490b14b69d88c2d75d08f756cf8ad5e`
- `frontend/components/graph/graph-inspector.tsx` SHA256 `2b0e7305b8fda096b2a8534ae883c6bec181c4c71b2ee15b30de0893efb902bc`
- `frontend/components/ui/alert.tsx` SHA256 `4fc7fffcbe1e2251861dc06f20f43adc694a9d6b4ebdf6f1baaf8c78560f0869`
- `frontend/components/ui/button.tsx` SHA256 `6096d0b6bd77d6b86afc174fece69c7d42f82fd625e0866107eba01f423a3c7f`
- `frontend/components/ui/card.tsx` SHA256 `bb7f77ce45ee3fec21e25739c61d547900498a0117d3e12101e8932eae204b41`
- `frontend/components/ui/input.tsx` SHA256 `dbb22945cef6bda3970f578bd9a45a36e51bd4d1802e08e7420b3699400fe1dd`
- `frontend/components/ui/page-state.tsx` SHA256 `535aa3a5f1278f6a4bd53d2ce2632f70ada4fb8cd65e1175ef19e0152bece7d7`
- `frontend/components/ui/skeleton.tsx` SHA256 `542864c96154ccdb4deff7796ba0b22120de0fe371394fbe9e1dc5af0d2d6d10`
- `frontend/lib/workspace-browser-history.ts` SHA256 `288c5afb4f920a740387163bae628da0e622c63bfff983e7830bac68cab39d34`
- `frontend/pages/graph-page.tsx` SHA256 `891da5534ca4c7a9e2637cdfd1baaefc41aa066718bc0872bcc3c0aeb083a52a`


### 2026-10-10 后续审查纠正

上述“loading/error保持原先隐私边界”只描述当时保留的行为，不能作为边界正确的证明。后续3项首次加载RED发现：已存意图在首次授权读取前展示私人标签/编号和操作按钮。本次新增独立授权展示门禁，保存原编号但首次授权成功前隐藏；已授权刷新可恢复、401/403再清屏。见[知识列表与图谱审查修复证据](./knowledge-list-operation-review-and-read-recovery-evidence.md)，不将旧批次绿色测试用于否认新增回归。
