# 阅读器收藏写入恢复与比较结果绑定（本地）

日期：2026-10-10；分支 `codex/functional-checklist-completion`；基线 `7f6fef92`。

## 范围与现状

继续A05/A06/B07既有阅读器功能。原30父项、D08排除、本轮29、关闭5、开放24不变。本记录不是父项关闭、发布或真实身份验收。未引入数据库迁移、备份、加密或新业务模块。

原收藏操作仅`setFavorite(next)`后发PUT/DELETE，catch直接回滚，缺少同步防重和未决结果恢复。版本比较仅校验响应结构，没有核对from/to是否等于请求版本。

## 复现与修复

新增首批15项：12项收藏交互/存储/恢复，3项比较版本错配。修复前定向49项中**15失败/34通过**（`/private/tmp/reader-favorite-red.log`），失败包括同事件两次PUT、丢响应后仍可再次切换、401/403正文残留、恢复入口不存在、存储写入失败仍发送HTTP、错误版本对被接受。测试准备时修正已有按钮英文文案及正式导航函数参数，最终RED使用修正后的用例；没有把测试设置错误计为产品缺陷。

- 收藏写入以同步ref phase占用，按钮disabled/aria-busy；当前确认值保留至合法成功回执，不把乐观更新当作提交成功。
- HTTP前保存tab/member/item隔离的本地意图（随机id及绝对desired布尔值），写后读回验证；存储不可用时禁止发写请求。
- PUT成功核对knowledgeItemId；DELETE沿用已存在的成功HTTP契约。网络异常、503、非法回执、清理失败都保留未知意图，不自动重发、不按catch回滚。
- 未决写入、未知结果及记录损坏拦截工作台导航和beforeunload；强制卸载后记录仍保留，其他成员不读取原成员记录。
- “读取当前收藏”只发GET，同事件去重，跟随当前阅读器owner取消/隔离迟到结果。读取失败仍锁定；读到不同状态不能证明原写入失败；读到目标状态后清理原意图并显示当前值。
- 初始收藏GET失败也有独立重读入口，不必卸载正文或笔记编辑器。
- 写入和恢复GET遇到401/403使用整页撤权路径；正文和私有面板清除。重新授权后原未知意图仍需核对，旧写回执不能越过新owner直接解锁。
- 比较响应必须精确匹配请求的fromRevisionId及toRevisionId；错配、反转均拒绝，并在UI显示比较失败而非错误版本内容。

## 编号与结果的诚实边界

`reader-favorite-intent.ts`生成的id只是**本地恢复归属编号**，不是服务端幂等键：现有favorite API未接收该id，也没有按该id查询原操作结果的接口。GET favorite证明的是当前状态，不证明原操作已终结；同一状态可能来自另一写入。**本批不满足、也不宣称完成收藏的“服务端唯一操作编号＋同编号安全重试＋精确查询结果”**。如果此项要适用于收藏，后续仍须服务端操作回执/精确查询设计与验证，不能以这个前端意图替代。

本地意图不是备份、跨标签页锁或跨设备同步。未知且当前状态不同、持续撤权或存储持续损坏时保持阻塞，不提供会丢失未决操作的无条件清除。真实用户对这些恢复路径的可操作性仍需D05/D06验收。

## 验证

- 首次GREEN定向2文件49/49。
- 后续新增10项覆盖恢复401/403、普通恢复失败、成功回执清理失败、其他操作记录不被旧回执清掉、跨成员迟到写拒绝、3类损坏/错绑记录以及UI拒绝错误比较。
- 扩大知识/阅读器/笔记/分享/图谱/复习周期：**33文件449/449**，`/private/tmp/reader-favorite-expanded.log`。
- Worker及前端类型检查通过（`/private/tmp/reader-favorite-types.log`）；新改TSX用继承正式DOM配置的临时tsconfig单独严格检查通过。
- 源码索引271文件/1184候选/110未归属，阅读器77候选（原73）；新增入口及回调属于阅读器。三个App外层未归属候选只移位，无属性或控制流变化；已复核指纹。领域快照check通过。
- 完整本地门禁与最终文档契约运行完成后追加，不借用前一提交的完整check结果。

测试运行真实App路由/加载器/导航守卫，fetch用Response夹具、markdown用文本节点替身；不算原生浏览器、真实双身份、云端D1或生产验收。源码中保留已确认边界说明，避免把当前状态核对写成操作精确查询。

## 下一项

（以下为本批基线记录。）阅读器related/backlinks普通失败当时仍缺独立恢复入口；收藏服务端精确操作语义、真实身份/原生阅读旅程仍开放。A05/A06/B07父项不关闭，未push/部署/迁移/更新VM预览。

## 后续本地增量（2026-10-11）

[阅读器分节重试与收藏服务端操作编号](./2026-10-11-reader-related-backlink-retry-and-favorite-operation-evidence.md)补齐本地实现：related/backlinks 分节独立重试（每节独立 token/abort，只重发自身请求，不重发正文/收藏/diff，401/403 仍整页撤权），以及收藏的**服务端唯一操作编号＋同编号安全重试＋精确查询回执**（新迁移 `0061_knowledge_favorite_operations.sql`；本地意图 id 现作为操作编号传输，未知结果改由精确操作查询落定，布尔 GET 只保留初始读取）。本文件“编号与结果的诚实边界”描述的**当时**缺口已由该增量本地补齐；收藏操作回执不代表当前收藏状态，跨刷新恢复/离页边界实际验收、D05/D06/D07/D08 真实身份与原生旅程仍开放，父项计数不变（29/5/24）。

## 跨刷新/跨标签页增量（2026-10-11）

在原“仅内存 + tab 记录”边界上补齐**同源跨标签/跨刷新可见性**，仍不重放写入、绝不从状态读取落定：

- **介质变更**：`frontend/lib/reader-favorite-intent.ts` 的默认存储由 `window.sessionStorage` 改为 `window.localStorage`，键方案（`memory-garden:reader-favorite-intent:v1:<member>:<item>`）与记录形状（`{v:1,member,item,intent:{id,desired}}`、2048 字节上限、失败关闭校验）**完全不变**；三个函数新增可选注入式存储端口（默认读 `window.localStorage`），与 `submission-intent.ts` 的端口风格一致，并导出 `favoriteIntentKey` 供跨标签匹配/测试。文件头注释已改为：member+target 作用域、同源跨标签共享、仍非跨设备备份、仍非锁。
- **一次性不可见**：变更前写入的 sessionStorage-only 记录**不迁移**，因此变更前遗留的未决记录在新介质下不可见。可接受（尚无发布），**刻意不做旧格式兜底**。
- **跨标签响应**：`KnowledgeReaderSession` 新增 `window.addEventListener("storage", …)`（卸载移除）。处理器只处理 `storageArea` 为本标签 localStorage 的事件（`key === null` 即 `clear()` 亦处理），仅匹配本 member+target 记录键，经 `loadFavoriteIntent` 重读后：`blocked` → 置 blocked；`ready` 且本标签当前 `idle` → 采纳 `{kind:'unknown'}`（不复活已落定记录）；记录变 `empty` 且本标签处于 `unknown` → 丢弃本地意图回 `idle`，**只**重发既有布尔收藏 GET 以显示当前状态。写入中（`saving`）或 owner 已退休/非存活时不响应；全部经既有 owner/attempt 令牌判定，迟到事件不能重绘已退休阅读器。
- **诚实边界（未变）**：跨标签回执仍**只**能由显式 `checkFavorite()` 按操作编号精确查询来落定；记录被清除只证明**该源不再有待决写入**（清除它的标签已核对回执），**不**证明本标签观察到了回执。`empty→idle` 时的布尔 GET 是读取，永远不能落定写入。
- **测试**：新增 `test/unit/frontend-reader-favorite-intent.test.ts` **16 个执行用例**（9 个 `it` 声明，含 2 个 `it.each` 展开 2 例与 7 例；键方案/命名空间、empty/ready/blocked 各损坏形态、overwrite/storage-failed、finish no-op/changed/removal-verified、跨两个 store 实例的可见性）。`frontend-reader-read-lifecycle.test.tsx` 新增 **7 个执行用例**（6 个 `it` 声明，其中 `it.each(["member-b","knowledge-b"])` 展开 2 例）：他标签遗留记录挂载即未决、合成跨标签信号置未决且零写零回执读、异成员/异目标信号被忽略、已落定后的迟到信号不复活、记录被清除后回 idle 且只重发布尔读、核对在途时记录被跨标签损坏后不卡 blocked 且不丢未决意图。RED 先于实现：首次 25 失败 / 46 通过（`/private/tmp/red-fav-crosstab.log`）；补测第 7 例后该例单独 RED 1 失败 / 55 跳过（`/private/tmp/red-fav-midcheck.log`）；最终 GREEN 72/72（`/private/tmp/green-fav-crosstab.log`）。
- **既有断言更新（合法替换而非削弱）**：`frontend-reader-read-lifecycle.test.tsx` 原先直接读写 `browser.sessionStorage` 的 **4 个既有 `it` 声明（5 处引用）** 改为 `browser.localStorage`：配额写失败、清理失败、旧回执不清他人记录各 1 声明，损坏记录 `it.each(["corrupt","wrong-member","wrong-target"])` 展开 3 例，故更替介质的执行用例为 **6 例**；它们钉住的正是本次被替换的介质；其不变量（写次数、无自动重发、跨成员隔离、损坏 fail closed、迟到回执忽略）逐条保留。
- **本地存储的隐私边界**：localStorage 不是加密，也不对同源恶意脚本、开发者工具或本机其他使用者保密；记录按 member+target 键命名，另一成员通过本应用读不到它，但**退出登录或切换成员都不会清除该 key**——本仓源码中该 key 的唯一删除点是 `frontend/lib/reader-favorite-intent.ts` 的 `finishFavoriteIntent`（`removeItem`），全前端无 `localStorage.clear`，也没有针对该 key 的登出/切换清理路径。
- **在途核对期间记录被损坏的边界**：源码阅读曾只**推断**“`checking` 中到达的 blocked 信号不会永久卡住”；现由执行用例 `does not stick blocked or lose the unresolved intent when a cross-tab signal corrupts the record mid-check` 覆盖（替换该源码推断）：handler 确会先置 blocked，但在途精确回执解析后回到 `unknown`（回执错配或 `FAVORITE_INTENT_CHANGED` 降级）或 `idle`，绝不卡在 `blocked`，且不丢内存意图、零写入。
- **源码账本**：`frontend/app.tsx` 新增监听候选，重算 `frontend-operation-inventory.{json,md}`（271 文件 / 1189 候选），未归属仍 110；`frontend-operation-unassigned-review.md` 的 NotFoundPage 坐标 `889:250`→`923:250` 及 app.tsx 指纹同步更新（非仅改哈希绕过契约）。
- **未宣称**：真实双标签页、真实身份/原生浏览器对这条恢复路径的可操作性仍未验收；父项计数不变（29/5/24）。
