# 原生 4×2×2 矩阵与 `<html lang>` 缺陷修复（本地）

日期：2026-10-11；分支 `codex/functional-checklist-completion`；基线 `b99bcd5468ac7665c704c290df302e9a6d672b1d`（本地未推送）。

## 范围与结论边界

本记录如实登记一次**真无头 Chrome（CDP）** 驱动本地栈得到的原生矩阵观察（320/375/768/1280 × `zh-CN`/`en` × 浅/深共 16 格），并记录本轮唯一确认缺陷 **`<html lang>` 不随所选语言更新** 的修复与前后测量。

本记录**不翻转任何 checkbox**：功能清单原 30 父项、D08 排除后范围 29、关闭 5、开放 24 不变。本记录**不构成 D05/D06/D04 任何验收**：会话是**合成本地会话**（非真实身份），本地透传代理只是**测试 harness（非产品代码）**，浏览器是 **`--user-data-dir` 隔离在 `/tmp` 的无头 Chrome**。**未 push、未部署、未 `wrangler ... --remote`、未远程迁移 D1、未写入 secrets**。

> 本记录接续并部分取代 [2026-10-11 原生浏览器验收环境阻塞](./2026-10-11-native-acceptance-blocker.md)。阻塞记录中被判为不可达的 4 个宽度，本轮改用真无头 Chrome/CDP 后**确已按请求宽度驱动**；阻塞记录本身不删除，其“cmux/WKWebView 掩码不可驱动”的结论仍对该后端成立。

## 本地栈（精确）

- `wrangler dev` 监听 `127.0.0.1:8787`，本地 D1 迁移 **0001–0061**（`migration-files count=61`）。
- 本机 D1 植入**合成本地会话**：`members` 行（role admin）＋ `auth_sessions` 行，`token_hash` = 43 字符 base64url token 的 SHA-256 十六进制。**不是真实账户/身份**。
- 本地透传代理监听 `127.0.0.1:8788`，转发至 `:8787` 并注入 `__Host-memory-session` cookie；该代理**仅为本地 harness，非产品组件**。
- 真无头 Chrome 经 **CDP** 连接该代理，`--user-data-dir` 隔离在 `/tmp`；视口用真实 emulation（非伪造 `innerWidth`）。

## 16 格矩阵（逐格实测）

每格 `window.innerWidth` 等于请求宽度（emulation 真实生效）；`nav a[href^='/']` 计数恒为 **22**；`documentElement.scrollWidth - innerWidth`：320/375 → **-15**、768 → **-15**、1280 → **0**（无横向溢出）；侧栏导航盒：1280 → **231×647**（停靠），320/375/768 → **0×0**（抽屉默认闭合）。

| 语言 | 主题 | 宽度 | innerWidth | scrollWidth−innerWidth | nav 链接 | 侧栏盒 | `body` 背景 | `body` 前景 |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| zh-CN | light | 320 | 320 | -15 | 22 | 0×0 | `oklch(0.985 0.004 255)` | `oklch(0.22 0.025 255)` |
| zh-CN | light | 375 | 375 | -15 | 22 | 0×0 | `oklch(0.985 0.004 255)` | `oklch(0.22 0.025 255)` |
| zh-CN | light | 768 | 768 | -15 | 22 | 0×0 | `oklch(0.985 0.004 255)` | `oklch(0.22 0.025 255)` |
| zh-CN | light | 1280 | 1280 | 0 | 22 | 231×647 | `oklch(0.985 0.004 255)` | `oklch(0.22 0.025 255)` |
| zh-CN | dark | 320 | 320 | -15 | 22 | 0×0 | `oklch(0.17 0.02 255)` | `oklch(0.93 0.01 255)` |
| zh-CN | dark | 375 | 375 | -15 | 22 | 0×0 | `oklch(0.17 0.02 255)` | `oklch(0.93 0.01 255)` |
| zh-CN | dark | 768 | 768 | -15 | 22 | 0×0 | `oklch(0.17 0.02 255)` | `oklch(0.93 0.01 255)` |
| zh-CN | dark | 1280 | 1280 | 0 | 22 | 231×647 | `oklch(0.17 0.02 255)` | `oklch(0.93 0.01 255)` |
| en | light | 320 | 320 | -15 | 22 | 0×0 | `oklch(0.985 0.004 255)` | `oklch(0.22 0.025 255)` |
| en | light | 375 | 375 | -15 | 22 | 0×0 | `oklch(0.985 0.004 255)` | `oklch(0.22 0.025 255)` |
| en | light | 768 | 768 | -15 | 22 | 0×0 | `oklch(0.985 0.004 255)` | `oklch(0.22 0.025 255)` |
| en | light | 1280 | 1280 | 0 | 22 | 231×647 | `oklch(0.985 0.004 255)` | `oklch(0.22 0.025 255)` |
| en | dark | 320 | 320 | -15 | 22 | 0×0 | `oklch(0.17 0.02 255)` | `oklch(0.93 0.01 255)` |
| en | dark | 375 | 375 | -15 | 22 | 0×0 | `oklch(0.17 0.02 255)` | `oklch(0.93 0.01 255)` |
| en | dark | 768 | 768 | -15 | 22 | 0×0 | `oklch(0.17 0.02 255)` | `oklch(0.93 0.01 255)` |
| en | dark | 1280 | 1280 | 0 | 22 | 231×647 | `oklch(0.17 0.02 255)` | `oklch(0.93 0.01 255)` |

**主题实测**：浅色 → `<html>` 无 `dark` 类，`body` 背景 `oklch(0.985 0.004 255)`、前景 `oklch(0.22 0.025 255)`；深色 → `<html>` 含 `dark`，背景 `oklch(0.17 0.02 255)`、前景 `oklch(0.93 0.01 255)`；四个宽度一致。

**语言副本实测**：`zh-CN` → `跳到主要内容 … 打开导航 … 个人工作台 你的工作台`；`en` → `Skip to main content … Open navigation … Personal Workbench`。

## 键盘（1280，en）

前十个 Tab 停靠点：`A:Skip to main content` → `BUTTON:Collapse sidebar` → `A:Home` → `A:Work graph` → `A:Today` → `A:Focus` → `A:Review` → `A:AI knowledge base` → `BUTTON:AI knowledge base collapse` → `A:Knowledge search`。跳转链接位于首位；前十停靠点内未见焦点陷阱。

## 抽屉（320，en）——核实非缺陷

移动端导航是原生 `<details>`，其 `<summary>` 文案为 `Open navigation`。点击 summary 置 `details[open]` 并展开其中 `<nav>`（**239×1096**，含 **25** 个可见链接）；按 Escape 关闭（`details[open]` 移除），再次点击可重开。

记录风险以免误判：首个探针查询 `document.querySelector("nav")`，命中的是**隐藏的停靠侧栏**（0×0）；可用的抽屉导航是 `<details>` **内部**的那一个。因此**不得**据首个探针写成“移动导航无法打开”。

## 缺陷：`<html lang>` 不随语言

**原生实测（修复前）**：`localStorage["memory-garden-locale"] = "zh-CN"` 时页面渲染中文，但 `document.documentElement.lang` 恒为 `"en"`（`en` 时亦为 `"en"`）。根因：`frontend/index.html` 静态 `lang="en"`，前端无任何代码更新它（唯一消费者 `frontend/pages/workbench-landing/workbench-scene.tsx` 把它当作 3D 场景语言回退）。

**修复（本地）**：在 `frontend/lib/i18n.ts` 增加同一 locale 运行时驱动的 `documentLanguageForLocale`（内部 locale → BCP-47，`en`→`en`、`zh-CN`→`zh-CN`，大小写不敏感，非字符串/未知/外来输入安全回退 `en`）、`applyDocumentLanguage`（无 document 或 document 读取/写入抛错时静默返回 `false`，不抛错）与 `syncDocumentLanguage`（初始应用一次并订阅后续变更，返回退订）。`frontend/app.tsx` 在既有 locale 运行时创建处新增 `useEffect(() => syncDocumentLanguage(locale, document), [locale])`；公开落地页 `frontend/pages/workbench-landing/public-workbench-page.tsx` **接收 App 通过 props 传入的同一运行时（`App.tsx:185`）**，同样以 `useEffect(() => syncDocumentLanguage(locale, document), [locale])` 应用。落地页未创建自己的运行时，落地页 effect 与 App effect 对**同一个**运行时各订阅一次、写入同一值，因此**幂等**且**不存在第二套映射**；语言来源仍是 navigator 语言 + 已存 locale。

**原生实测（修复后，真无头 Chrome/CDP，`npm run build:ui` 后同一本地栈）**：
- 存量 `localStorage["memory-garden-locale"] = "zh-CN"` 挂载：`document.documentElement.lang` = **`"zh-CN"`**（修复前为 `"en"`）；正文副本样本 `跳到主要内容 个人工作台 AI 知识库 工作区`。
- 经外壳语言菜单切换（点击 `[data-menu-id='language'] > button`，再点 `English` 的 `menuitemradio`）：`document.documentElement.lang` = **`"en"`**，`localStorage["memory-garden-locale"]` = **`"en"`**；副本样本 `Skip to main content Per…`。
- 修复后矩阵抽查（同一修复产物）：320×640 + zh-CN + dark → `innerWidth` 320、`scrollWidth - innerWidth` `-15`、22 导航链接、`html.classList` 含 `dark`、`body` 背景 `oklch(0.17 0.02 255)`、`lang` `zh-CN`；1280×800 + en + light → `innerWidth` 1280、溢出 0、22 导航链接、无 `dark` 类、`body` 背景 `oklch(0.985 0.004 255)`、`lang` `en`。

**原生实测（修复后，公开落地页；同一无头 Chrome，另经 `:8789` 未认证透传代理使公开落地页渲染）**：
- 落地页语言控件是原生 `select[aria-label="切换语言"]`，选项 `en`（English）/`zh-CN`（简体中文）。
- 存量 `localStorage["memory-garden-locale"] = "zh-CN"` 挂载：`document.documentElement.lang` = **`"zh-CN"`**，`select.value` = **`"zh-CN"`**；副本样本 `个人工作台 English 简体中文 登录工作台 让你的知识，成为每天的行动力。`
- 将 select 驱动到 `en`（设值 + 派发冒泡 `change`）：`lang` = **`"en"`**，`localStorage["memory-garden-locale"]` = **`"en"`**；副本样本 `Personal Workbench English 简体中文 Log in to yo…`
- 再驱动回 `zh-CN`：`lang` = **`"zh-CN"`**，locale **`"zh-CN"`**；副本样本 `个人工作台 English 简体中文 登录工作台…`
- 结论：公开落地页的文档语言现随其自身选择器双向跟随（原生验证）；工作台路径另行验证（存量 zh-CN 挂载 → `zh-CN`，外壳菜单切换 → `en`）。

**确定性证据（本地）**：`documentLanguageForLocale` 映射 `en`→`en`、`zh-CN`→`zh-CN`、`ZH-CN`→`zh-CN`、`fr`/`""`/`null`/`undefined`/数字/对象→`en`；App 挂载 harness 以存量 locale `zh-CN` 挂载后 `document.documentElement.lang === "zh-CN"`，经外壳语言菜单切换后为 `"en"`；落地页以存量 `zh-CN` 挂载后为 `"zh-CN"`，落地页语言选择器切换后为 `"en"`；无 document 或 document 抛错时 `applyDocumentLanguage`/`syncDocumentLanguage` 均不抛错且不破坏其它订阅者。定向证据：`test/unit/frontend-i18n.test.ts`、`test/unit/frontend-document-language.test.tsx`、`test/unit/frontend-workbench-landing-page.test.tsx`。

## 跨标签页 `storage` 投递（原生边界）

同一 Chrome profile 同源两个活动标签页：在标签 A 写入精确键 `memory-garden:reader-favorite-intent:v1:member-native-admin:knowledge-native-1`，标签 B 收到真实 `storage` 事件（`{ key: <该键>, newValue: <写入的 JSON 记录 {v,member,item,intent:{id,desired}}>, oldValue: null, storageArea: localStorage }`）；移除该键后标签 B 再收一次事件（`newValue: null`，`oldValue` 为先前记录）。存储确为共享（写入标签可读、移除后读取标签为 `null`）。

**边界**：**空闲/冻结**标签不会追溯处理 `storage` 事件——仅当监听标签在写入时**正在运行**才观察到投递。阅读器页面的端到端反应（挂载 + 显式核对）仍以确定性测试为准，而非本原生探针。

## 触控/指针矩阵（375/320，本地）

本批在同一真无头 Chrome/CDP 本地栈上，对 **375×812** 与 **320×812** 两档补充**真实触控输入**观察（此前键盘之外的触控矩阵未测，见“明确非声明”）。触控经 CDP `Emulation.setTouchEmulationEnabled`（`maxTouchPoints: 5`）启用，触摸事件经 `Input.dispatchTouchEvent` 派发；会话仍是**合成本地会话**（非真实设备、非真实身份），代理仍是本地 harness。

**布局（640→375/320）**：移动端导航是原生 `<details><summary>打开导航</summary>`；summary 盒在 375 为 **360×44**、在 320 为 **305×44**；抽屉展开后其中 `<nav>` 为 **239×1096**，含 **25** 个可见链接。

**真实触摸输入**：在 summary 中心派发 touchStart/touchEnd，捕获监听器记录到 `touchstart: 1, pointerdown: 1, mousedown: 1, click: 1`，并置 `details[open] = true`——即抽屉可由**真实触摸事件**（touch→兼容鼠标序列）操作，而非仅合成鼠标点击。

**目标尺寸实测（375，抽屉展开时）**：抽屉链接 25 个 × 最小边 **40px**（min 40、max 40；低于 24px 者 **0**；低于 44px 者 **25**）；summary **360×44**；其余可见控件：命令面板 **36×36**、语言 **32×40**、抽屉关闭（关闭导航）**25×36**、账户菜单 **286×52**。

**解读（如实登记，不作裁定）**：**没有**任一实测控件低于 WCAG 2.5.8 AA 的 24×24 CSS px 下限；但**若干**低于 44×44 的**最佳实践**建议（抽屉链接 40、关闭 25×36、命令面板 36×36、语言 32×40）。这是**实测观察**，**不是** WCAG AA 失败结论，也不给出通过/未通过裁定——该裁定由仓库自有的 `scripts/wcag-contract.test.mjs` 作出，本轮未由其作任何判定。

**harness 事故（一行留痕）**：首次尝试似在登录检查处挂起；根因为本地 `wrangler dev` 进程崩溃（在并发运行 `wrangler d1 execute` 打同一本地 D1 时，反复 `POST /api/telemetry/pageview` 返回 403，触发 wrangler internal error）叠加一个陈旧 service worker 继续投递 SPA；重启 dev server、经 `navigator.serviceWorker.getRegistrations()` 注销 service worker 并清空 caches 后，检查干净跑完。另记：**重新施加视口 emulation 必须发生在启用触控之后**，否则一次 reload 会把 `innerWidth` 打回窗口宽度（1400），使抽屉看起来是隐藏的。

## 明确非声明

- 会话为**合成本地会话**，**不是真实身份**；透传代理**只是本地 harness，不是产品代码**；浏览器为 **`/tmp` 隔离 `--user-data-dir` 的无头 Chrome**。
- 本记录**不构成 D05/D06/D04 验收**，不替代真实账户旅程，也不替代用户目标桌面浏览器（Chrome/Edge）上的验收。
- 16 格矩阵为**本地合成会话 + 真无头 Chrome**；不证明真实成员/权限旅程，也不证明触控矩阵（本批次只测键盘）。
- 触控矩阵（375/320）为 **CDP 触控 emulation（`setTouchEmulationEnabled`/`dispatchTouchEvent`）驱动 + 合成本地会话**，**不是真机、不是真实身份**，同样**不构成 D05/D06/D04 验收**；目标尺寸与低于 44×44 的项仅为实测登记，**未**由 `scripts/wcag-contract.test.mjs` 作通过/未通过裁定。
- `<html lang>` 的工作台值与公开落地页值均已为**原生**修复后实测（见上）。
- 未发布、未部署、未 `wrangler ... --remote`、未远程迁移、未写入 secrets；父项计数 29/5/24（D08 排除）不变，未翻转任何 checkbox。
