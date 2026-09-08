# AI Knowledge Workbench 3D Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将匿名根路径变为等距 3D AI 知识工作室，用完全公开的示例演示知识收集、阅读、带引用问答和行动管理，保留可靠登录入口。

**Architecture:** Blender MCP 制作原创资产，Three.js 独立延迟模块呈现场景；React 纯状态机驱动 HTML 演示和模型反馈。先交付无需 WebGL 的完整流程，再连接模型，沿用现有认证、静态资源服务和工作台界面。

**Tech Stack:** 现有 React/Vite/TypeScript、项目 shadcn 风格 UI、Vitest/Happy DOM、Node 内建测试；新增锁定 `three@0.180.0`、`@types/three@0.180.0`；本地 Blender 与缓存的 Blender MCP。

**Spec:** `docs/superpowers/specs/2026-09-07-ai-workbench-3d-landing-design.md`（2026-09-07 用户书面批准）。

## Global Constraints

### 2026-09-08（UTC）执行同步

本地证据见 `design/workbench-landing/local-acceptance.md`。用户要求“先提交下然后继续”，因此原 Task 1–8 的逐任务提交改为共享工作树的一次检查点 `523d555` 与后续复核修复提交；下面勾选的提交步骤表示对应代码已纳入这些提交，不表示执行过每条示例 commit 命令。9.2 表示完整门禁已运行并记录失败，不是全绿；9.4–9.6 保留部分待验收。未获合并或部署授权。

实现裁定：Task 7 动画写入 runtime 文件；`SceneSnapshot` 增加兼容的可选 `cycleId`（默认 0），page 单一 reducer 仅在 start/replay 递增。Task 5 测试夹具的错误必须包含 `retryable:false`；认证 harness 仅增加可选 pre-render `configureBrowser` 回调，网络拦截只在本测试安装。Task 8 另增加 build-only `scripts/workbench-landing-provenance.mjs` 和最小 Vite 插件注册，用真实模块来源、产物摘要与实测源资产校验分包，不靠 chunk 名称证明隔离。

- 仅匿名根路径 `/` 改用新展示页；匿名其他路径、会话错误、已登录路径维持现有行为。
- 模型不烘焙必须阅读的文字；界面支持 `en` 和 `zh-CN`，保持现有 shadcn 风格。
- 所有资料、回答、引用、任务及消息是人工编写虚构样例；显示“示例演示 · 不读取你的个人数据”。
- 不新增注册、公开 AI 请求、访客上传、业务 API 写入、交互遥测、自动执行任务或通用私信。
- 不改全局 `run_worker_first`，不放宽 `/api/*` 的鉴权，不新增 D1 表、R2、Workers AI、KV、Queue 或第三方模型生成 API。
- 单个公开 GLB 文件不超过 2 MiB；每个 poster 不超过 250 KiB。
- 导出场景不超过 60,000 三角形；交互时常规绘制调用目标不超过 80。
- 新增 3D 执行代码独立分包，gzip 目标不超过 250 KiB，不进入登录后工作台的启动依赖。
- 桌面像素比上限 1.5，移动端上限 1；纹理单边不超过 1024；优先使用材质颜色和静态接触阴影。
- 模型加载超过 8 秒停止当前尝试并切换 poster；由用户明确重试，不无限循环请求。
- 基准桌面目标 60 fps，参考手机目标 30 fps；必须记录设备和真实运行证据，不将截图或测试替身当作帧率验收。
- 建模场景为 `MG_Workbench_Landing`，保留原场景及所有未知对象；公开导出只能包含本任务资产。
- 使用本地 MCP 客户端时设置 `BLENDER_MCP_DISABLE_TELEMETRY=1`；不修改全局用户遥测偏好，不读取/上传 `SECRETS_FILE`。
- 所有 shell 命令以 `rtk` 开头，代码及文档编辑使用 `apply_patch`；Blender 自身保存/导出是资产生成，不用 shell 写二进制文件。
- 只做本地实现和验证；部署、推送、合并及签名账号线上验收需要另外授权。

---

## 0. 执行基线与依赖证据

工作分支：`codex/ai-workbench-3d-landing`，规格提交 `0209ce0`。保留用户未跟踪的 `.DS_Store`、`.pnpm-store/` 及其他无关改动；实现执行开始时用 `git status` 重新核对，不能沿用旧快照判断干净。

2026-09-07 已只读查询 npm registry，两个指定版本存在且许可证为 MIT。它们是本计划的固定版本，不声称为最新版本：

```text
three@0.180.0
sha512-o+qycAMZrh+TsE01GqWUxUIKR1AL0S8pq7zDkYOQw8GqfX8b8VoCKYUoHbhiX5j+7hr8XsuHDVU6+gkQJQKg9w==
@types/three@0.180.0
sha512-ykFtgCqNnY0IPvDro7h+9ZeLY+qjgUWv+qEvUt84grhenO60Hqd4hScHE7VTB9nOQ/3QM8lkbNE+4vKjEpUxKg==
```

本轮只查询，未安装依赖。Task 6 安装后检查 lockfile 和现有构建是否兼容；若存在安全或兼容阻碍，记录证据并重新选择，不静默升级其他包。

现有关键约束：`vitest.config.ts` 为唯一测试配置；node 单测使用文件头 `// @vitest-environment node`。根 `tsconfig.json` 没有覆盖大部分前端 TSX；新增专用类型检查。`frontend/components/ui/focus-scope.tsx` 有焦点循环/Esc/恢复逻辑，但 `Dialog` 和 `Sheet` 没有完整遮罩和滚动锁。新增展示区面板在自身范围补齐，不全局改写已有弹层。

## 1. 文件职责地图

以下 Create 路径为计划产物，不表示现已存在。模块统一放在 `frontend/pages/workbench-landing/`，下文简称 `L/`，该别名不用于实际 shell 命令。

| 路径 | 状态 | 单一职责 |
| --- | --- | --- |
| `scripts/blender-mcp-client.mjs` | Create | 有超时和清理的本地 stdio MCP 客户端及有限 CLI |
| `scripts/blender-mcp-client.test.mjs` | Create | 初始化、工具错误、取消与退出协议测试 |
| `scripts/blender/workbench-landing.py` | Create | 幂等创建本任务 Blender 场景并导出 |
| `scripts/workbench-landing-assets.mjs` | Create | GLB 节点、体积、三角形、纹理及来源报告检查 |
| `scripts/workbench-landing-assets.test.mjs` | Create | 用人工构造 GLB 测试资产检查器失败分支 |
| `design/workbench-landing/workbench.blend` | Create | 可编辑源模型，不发布到网站 |
| `design/workbench-landing/asset-report.json` | Create | 实际导出参数、对象/材质/体积及原场景保留证据 |
| `frontend/assets/workbench-landing/workbench.glb` | Create | 唯一公开模型 |
| `frontend/assets/workbench-landing/poster-desktop.webp` | Create | 桌面静态降级图 |
| `frontend/assets/workbench-landing/poster-mobile.webp` | Create | 移动端静态降级图 |
| `L/workbench-demo-data.ts` | Create | 样例资料、段落、问题、引用及辅助内容 |
| `L/workbench-demo-state.ts` | Create | 纯 reducer、明确事件及步骤 |
| `L/workbench-copy.ts` | Create | 使用现有 LocaleRuntime 的本地双语文案目录 |
| `L/workbench-feature-panel.tsx` | Create | 单面板、引用子视图、遮罩和可访问行为 |
| `L/public-workbench-page.tsx` | Create | HTML 体验、登录和组件组合 |
| `L/workbench-scene-config.ts` | Create | 节点契约、镜头、预算、URL 与热点 |
| `L/workbench-scene-policy.ts` | Create | 静态模式、减少动态、数据节省策略 |
| `L/workbench-scene-runtime.ts` | Create | WebGL 资源、模型、镜头和按需帧循环 |
| `L/workbench-scene.tsx` | Create | 运行时动态导入、8 秒超时、poster、重试及清理 |
| `L/workbench-landing.css` | Create | 仅 `data-workbench-landing` 范围的布局和样式 |
| `tsconfig.landing.json` | Create | 新前端模块的 DOM/TSX 类型检查 |
| `frontend/app.tsx` | Modify | 仅增加匿名根路径分支 |
| `scripts/frontend-app-contract.test.mjs` | Modify | 更新明确区分根路径/深链接的源码契约 |
| `scripts/workbench-landing-build.test.mjs` | Create | 实际构建 manifest、分包及资源校验 |
| `package.json`, `package-lock.json` | Modify | 固定依赖及接入新增检查命令 |
| `test/unit/frontend-workbench-landing-*.test.ts[x]` | Create | 下文列出的数据、状态、UI、路由、运行时和生命周期测试 |
| `test/worker/assets.test.ts` | Modify | 实际导出资产与 API 鉴权回归 |
| `docs/operations/evidence/2026-09-07-workbench-3d-landing.md` | Create | 本地检查、截图、性能及未完成验收证据 |

不修改共享工作台成熟度清单、通知/任务业务服务或数据库。Task 9 可在 README 增加一条准确的本地交付说明，不声明已部署。

## 2. 共享类型与功能契约

Task 3 定义以下类型，Task 4–7 按原名使用，不另造第二套状态：

```ts
export type DemoStep = "overview" | "capture" | "library" | "answer" | "action" | "complete";
export type FeatureId = "capture" | "library" | "answer" | "action" | "updates";
export interface DemoState {
  step: DemoStep;
  activeFeature: FeatureId | null;
  citationId: string | null;
  captured: boolean;
  taskDone: boolean;
  paused: boolean;
}
export type DemoEvent =
  | { type: "start" } | { type: "capture" } | { type: "next" }
  | { type: "open"; feature: FeatureId } | { type: "close" }
  | { type: "citation"; id: string } | { type: "citation-back" }
  | { type: "complete-task" } | { type: "replay" }
  | { type: "pause"; value: boolean };
export interface DemoSource {
  id: string; title: string; paragraphs: readonly { id: string; text: string }[];
}
export interface DemoCitation { id: string; sourceId: string; paragraphId: string }
export interface DemoContent {
  sources: readonly DemoSource[];
  question: string; answer: string; citations: readonly DemoCitation[];
  taskTitle: string; notification: string; discussion: string;
}
```

Task 6 的运行时契约（类型与 DOM 无关的配置放在 config，不从 runtime 导入以免提前拉入 Three.js）：

```ts
export interface SceneSnapshot {
  feature: FeatureId | null; captured: boolean; taskDone: boolean;
  citationId: string | null; paused: boolean; reduceMotion: boolean; dark: boolean;
}
export interface WorkbenchSceneHandle {
  update(snapshot: SceneSnapshot): void;
  setVisible(value: boolean): void;
  dispose(): void;
}
export interface SceneOptions {
  host: HTMLElement; modelUrl: string; signal: AbortSignal;
  onFailure(reason: "context-lost" | "render-error"): void;
}
export function createWorkbenchScene(options: SceneOptions): Promise<WorkbenchSceneHandle>;
```

HTML 热点按钮驱动 `feature` 和镜头，画布本身标记为装饰、`pointer-events: none`，不拦截触摸滚动。热点不必依赖 raycaster；所有真实交互可通过 DOM 验收。

## Task 1: 可测试的本地 Blender MCP 调用桥

**Files:** Create `scripts/blender-mcp-client.mjs`, `scripts/blender-mcp-client.test.mjs`。

**Interfaces:** Consumes Node `child_process.spawn` 及当前配置的 `/opt/homebrew/bin/uvx --offline blender-mcp`。Produces `callBlenderTool({name, arguments, timeoutMs, signal}, {spawn}?) → Promise<CallToolResult>`；结果至少含 `isError?: boolean`, `content?: {type:string,text?:string}[]`。CLI 仅支持 `scene`、`screenshot --output <absolute-path>`、`execute --file <repo-script> --timeout-ms <integer>`；不能将任意第三方命令当作子进程执行。

- [x] **1.1 写协议红测。** 使用 Node EventEmitter/PassThrough fake child，发送分块 JSON 行，检查以下核心行为；补齐 init error、缺失工具、服务早退、超时、工具返回 `isError:true` 和取消后不再回调的独立用例。

```js
const fake = fakeMcpProcess({ tools: ["get_scene_info"], result: { isError: false, content: [] } });
await callBlenderTool({ name: "get_scene_info", arguments: { user_prompt: "确认" }, timeoutMs: 1000 }, { spawn: fake.spawn });
assert.deepEqual(fake.methods, ["initialize", "notifications/initialized", "tools/list", "tools/call"]);
assert.equal(fake.spawnOptions.env.BLENDER_MCP_DISABLE_TELEMETRY, "1");
assert.equal(fake.closed, true);
```

`fakeMcpProcess` 是此测试文件定义的本地工厂，返回 `{spawn, methods, spawnOptions, closed}`，按传入结果生成真实 JSON-RPC 响应；不能让它调用生产解析函数，以免自证。

- [x] **1.2 运行红测。** `rtk proxy node --test scripts/blender-mcp-client.test.mjs`；预期因模块不存在失败，记录与语法或环境失败的区别。
- [x] **1.3 实现桥及 CLI。** 使用请求 ID 映射，不假定日志等于响应；初始化后发现目标工具，再按其 schema 调用；将进程 stderr 保留为有界诊断，不打印环境值。JSON 行缓冲最大 8 MiB，超过时明确失败。结束时关闭 stdin、SIGTERM，并设置两秒兜底 SIGKILL（仅限自身启动的子进程）。清理必须幂等，删除 AbortSignal 监听及所有计时器。

```js
const command = "/opt/homebrew/bin/uvx";
const args = ["--offline", "blender-mcp"];
const env = { ...process.env, BLENDER_MCP_DISABLE_TELEMETRY: "1" };
// execute 的 code 仅从明确传入且位于 scripts/blender 内的文件读取。
const request = { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: toolArgs } };
```

截图读取 `get_viewport_screenshot` 实际 schema 和 image content；客户端把解码图片写入指定输出目录，不将 base64 倾倒进日志。执行入口使用 `execute_blender_code`；发现错误正文也判失败，不只检查 transport 成功。

- [x] **1.4 运行绿测并调用真实只读工具。** 重跑 1.2；再 `rtk proxy node scripts/blender-mcp-client.mjs scene`，记录场景、对象名、MCP 版本，不修改场景。遇沙箱 socket/cache 阻碍按权限流程重试，不偷偷改端口或启动第二个 Blender。
- [x] **1.5 提交。** `rtk git add scripts/blender-mcp-client.mjs scripts/blender-mcp-client.test.mjs`；`rtk git commit -m "feat: add bounded Blender MCP asset client"`。

## Task 2: 原创工作室模型、导出与可复现验收

**Files:** Create `scripts/blender/workbench-landing.py`, `scripts/workbench-landing-assets.mjs`, `scripts/workbench-landing-assets.test.mjs`, `design/workbench-landing/workbench.blend`, `design/workbench-landing/asset-report.json`, `frontend/assets/workbench-landing/{workbench.glb,poster-desktop.webp,poster-mobile.webp}`。

**Interfaces:** Consumes Task 1 CLI。Produces七个稳定根节点及两个 poster；`inspectLandingGlb(buffer) → {triangles,nodeNames,maxTextureDimension}` 与 `verifyLandingAssets(root) → AssetReport`，后者从真实文件读取尺寸、字节数，失败抛出具体约束名。`AssetReport` 的公开字段为 `{modelBytes:number, triangles:number, nodeNames:string[], maxTextureDimension:number, posters:{path:string,bytes:number,width:number,height:number}[]}`；Blender额外导出场景保留证据，与检查器结果分别记录，不能混用自报计数。

- [x] **2.1 写资产检查红测并运行。** 用测试文件内 `makeGlb({nodes,primitiveCount,indicesCount,mode})` 工厂按 glTF 2.0 header/chunk 对齐生成最小 JSON/BIN 缓冲；工厂不调用检查器。

```js
assert.throws(() => inspectLandingGlb(Buffer.from("bad")), /GLB_HEADER/);
assert.throws(() => inspectLandingGlb(makeGlb({ nodes: [], primitiveCount: 1, indicesCount: 3, mode: 4 })), /MISSING_NODE/);
assert.throws(() => inspectLandingGlb(makeGlb({ nodes: requiredNodes, primitiveCount: 1, indicesCount: 180003, mode: 4 })), /TRIANGLE_BUDGET/);
```

运行 `rtk proxy node --test scripts/workbench-landing-assets.test.mjs`，预期模块缺失；另测损坏 chunk、越界 accessor、外链纹理、缺失 BIN、非法 primitive mode、材质未知私人 extras、WebP 超预算。

- [x] **2.2 实现资产检查器。** GLB 仅接受 mode 4（三角形），按场景中 mesh 实例数量累计 index accessor count/3（无索引用 POSITION count/3）；拒绝外部资源 URI，仅允许导出报告中声明的本任务元数据。节点要求 `MG_Desk/MG_Inbox/MG_Library/MG_Query/MG_Board/MG_Updates/MG_Assistant`。从图片头读取尺寸，不信任报告的自报数值。实现后重跑 2.1。
- [x] **2.3 真实建模前保存截图及场景清单。** 使用 Task 1 scene/screenshot，在 `design/workbench-landing/` 保存参考截图；读取全部场景及任务命名是否冲突。未知同名资产导致停止，不删除。记录默认场景对象名称、变换和材质引用用于建模后比对。
- [x] **2.4 建立安全场景脚本。** 首次创建任务 scene/collection 并设置所有权标签，重复执行只更新带标签对象；不使用全局全选删除。用脚本自身所在仓库根解析固定输出，不接受从模型属性读出的路径。

```python
import bpy
OWNER = "memory-garden-landing-v1"
NAME = "MG_Workbench_Landing"
scene = bpy.data.scenes.get(NAME)
if scene is not None and scene.get("mg_owner") != OWNER:
    raise RuntimeError("UNOWNED_SCENE_COLLISION")
if scene is None:
    scene = bpy.data.scenes.new(NAME)
    scene["mg_owner"] = OWNER
```

- [x] **2.5 制作工作台。** 统一 Blender Z-up 坐标、米制，桌面 8×5×0.3，桌面顶为 z=0；深石墨底座、暖白背板、柔光 area light。几何使用 bevel box/cylinder，细分不超过2级，倒角段数3。创建正交 overview 相机看向台面中心，投影尺度约10，先检查完整台面可见。
- [x] **2.6 制作三个核心站点。** `MG_Inbox` 中心(-2.5,-1.0,0.2)，包含托盘及三张独立卡片；`MG_Library` 中心(-1.5,1.3,0)，包含书架和六册书及展开板；`MG_Query` 中心(1.2,0.9,0)，包含显示器和三张引用卡。指定 `MG_CaptureCard` 为资料动画节点，`MG_CitationCard` 为引用强调节点；在根清单之外单独验证它们存在。
- [x] **2.7 制作辅助区域。** `MG_Board` 中心(2.5,1.4,0)，四列靠材质区分，独立 `MG_TaskCard`；`MG_Updates` 中心(2.7,-0.9,0.2)；`MG_Assistant` 中心(0.1,-1.5,0.4)，用球/圆柱/盒体组合，不需要骨骼。知识/问答在画面上占主体，截图检查遮挡后仅在任务场景微调位置。
- [x] **2.8 保存与导出。** 用 `bpy.data.libraries.write(str(blend_path), {scene}, fake_user=True, compress=True)` 仅保存本任务scene及其依赖到独立 `.blend`，不用保存全部场景的操作，也不更改原文件保存路径。若输出已存在，必须从本任务报告确认归属后才覆盖。GLB导出上下文限定任务 scene 和集合，`use_selection` 仅选择其中的可见几何，不导出原场景。保留 glTF 坐标转换，浏览器用节点世界坐标定位热点，不照抄 Blender Z-up 数值。关闭 extras 导出、摄像机和灯光导出；浏览器自建轻量光照。
- [x] **2.9 生成 poster。** 正交 overview 渲染桌面1600×1000、移动端900×1100；渲染完成导出 WebP，调整质量直到每张不超过250 KiB。用 Blender 的场景渲染与图像保存 API 生成，不引入付费图片服务。Task1 execute CLI 的超时可显式提高到180秒，通过 exec session 每次最多等待30秒并继续向用户报告进度。
- [x] **2.10 验证与提交。** 通过 MCP 检查/截图建模结果，重跑脚本确认对象数不增长；导出后比对原场景快照未变；运行 `rtk proxy node scripts/workbench-landing-assets.mjs --check`。报告所有真实指标和源文件大小（源 `.blend` 不受网页预算限制，但不得误放进前端）。只暂存本 Task Files 中的产物并提交 `feat: create AI knowledge studio assets`。

## Task 3: 双语样例与纯演示状态机

**Files:** Create `frontend/pages/workbench-landing/workbench-demo-data.ts`, `workbench-demo-state.ts`, `workbench-copy.ts`；Create `test/unit/frontend-workbench-landing-data.test.ts`, `test/unit/frontend-workbench-landing-state.test.ts`。

**Interfaces:** Produces §2 类型，`demoContent(locale: FrontendLocale): DemoContent`、`initialDemoState(): DemoState`、`demoReducer(state,event): DemoState`；文案模块提供 `landingText(locale: LocaleRuntime,key: LandingCopyKey): string`，不扩展现有 LocaleRuntime 接口。

- [x] **3.1 写红测。** 每个测试文件使用 node 环境注释，导入实际公开函数；校验两个语言版本的 source/paragraph/citation ID 完全一致，引用实际指向正文段落。

```ts
it("requires capture and task action before guided progression", () => {
  let s = demoReducer(initialDemoState(), { type: "start" });
  expect(s.step).toBe("capture");
  expect(demoReducer(s, { type: "next" }).step).toBe("capture");
  s = demoReducer(s, { type: "capture" });
  expect(demoReducer(s, { type: "next" }).step).toBe("library");
});
it("keeps source citations resolvable in both languages", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    const data = demoContent(locale);
    for (const c of data.citations) {
      expect(data.sources.find(s => s.id === c.sourceId)?.paragraphs.some(p => p.id === c.paragraphId)).toBe(true);
    }
  }
});
```

- [x] **3.2 运行红测。** `rtk npx vitest run test/unit/frontend-workbench-landing-data.test.ts test/unit/frontend-workbench-landing-state.test.ts`；预期缺失模块失败。
- [x] **3.3 实现固定样例。** 两份文档分别为“项目资料整理约定/Project filing guide”和“每周回顾方法/Weekly review method”，每篇三段；稳定ID `filing-guide/p1..p3`、`weekly-review/p1..p3`。固定问题“如何把零散的项目资料变成下一步行动？”，回答明确先保留来源、再阅读归纳、最后人工创建待办；引用 `cite-filing` 指向 `filing-guide/p2`，`cite-review` 指向 `weekly-review/p2`。任务为“整理本周项目资料”；通知和讨论均围绕这张示例任务，无真人姓名或私人数据。
- [x] **3.4 实现 reducer。** `start/replay` 均重置到 capture、打开 capture 热点；capture仅置本地captured；next遵循 overview→capture→library→answer→action→complete，capture和action各自需captured/taskDone；complete的next不变。next将activeFeature设为新步骤同名热点（complete则为null）并清空citationId。open只改activeFeature且清空citationId，close只关闭面板且保留步骤；citation只有有效ID可进入；complete-task仅在action步骤或action热点时置true；pause只改paused。无fetch、Date、随机数或storage调用。
- [x] **3.5 完成绿测及边界测试。** 覆盖invalid citation、重复事件、close后step不变、replay重置、直接热点探索不推进引导、暂停和语言切换不重置。重跑3.2以及 `rtk npm run verify:i18n`；本地双语目录由新增data测试穷举key，避免现有扫描未覆盖形成漏检。
- [x] **3.6 提交。** 仅暂存本 Task 五个源/测试文件，`rtk git commit -m "feat: add deterministic bilingual knowledge demo"`。

## Task 4: 可访问 HTML 首页和单一功能面板

**Files:** Create `L/public-workbench-page.tsx`, `L/workbench-feature-panel.tsx`, `L/workbench-landing.css`；Create `test/unit/frontend-workbench-landing-page.test.tsx`, `test/unit/frontend-workbench-landing-panel.test.tsx`。

**Interfaces:** Consumes Task3 reducer/content；Produces `PublicWorkbenchPage({locale, githubEnabled=true}: {locale:LocaleRuntime;githubEnabled?:boolean})` 和 `WorkbenchFeaturePanel({locale,state,dispatch}: {locale:LocaleRuntime;state:DemoState;dispatch:React.Dispatch<DemoEvent>})`。此任务不导入Three.js；场景区先显示 Task2 poster（模型任务未完成时测试使用fixture URL，不能把fixture当最终资产）。

- [x] **4.1 写渲染与交互红测。** 复用已有Happy DOM初始化方式；本组件测试自行 createRoot，清理所有globals与root，不修改认证harness来迁就组件。

```tsx
const html = renderToStaticMarkup(<PublicWorkbenchPage locale={createLocaleRuntime({ navigatorLanguage: "zh-CN" })} />);
expect(html).toContain("示例演示");
expect(html).toContain('href="/auth/github"');
expect(html).toContain("体验知识之旅");
expect(html).not.toContain("<canvas");
```

交互测试点击实际 `button[data-feature="answer"]`，再点击真实引用按钮，断言对应原文段落可见；不要仅断言函数被调用。为关闭按钮、Escape、遮罩、内部点击、Tab循环、焦点返回、body overflow恢复各写独立用例。

- [x] **4.2 运行红测。** `rtk npx vitest run test/unit/frontend-workbench-landing-page.test.tsx test/unit/frontend-workbench-landing-panel.test.tsx`。
- [x] **4.3 实现 HTML 页面。** 用现有 Button/Card 排版、常驻登录 `<a href="/auth/github">`、邀请说明、五个DOM热点、start/next/replay按钮和常显演示标签；next依据状态禁用并给出明确提示。GitHub不可用时显示真实不可用文字，不渲染有效登录链接。引用正文只作为React文本渲染，不用 `dangerouslySetInnerHTML`。
- [x] **4.4 实现单面板。** 复用 `useFocusScope`，onEscape使用useCallback保持稳定，避免每次状态变化重设焦点。遮罩关闭用 `event.target === event.currentTarget`；内部面板包含标题/说明关联id与显式close按钮。打开时保存body overflow，清理时恢复原值；引用在面板内部切换视图并聚焦标题，返回时恢复引用触发按钮。桌面右侧面板、移动端底部sheet，最大高度 `calc(100dvh - 1rem)`，内部纵向滚动。

```tsx
<div data-landing-overlay onClick={e => { if (e.target === e.currentTarget) dispatch({ type: "close" }); }}>
  <section ref={focusRef} role="dialog" aria-modal="true" aria-labelledby="landing-panel-title" tabIndex={-1}>
    <h2 id="landing-panel-title">{title}</h2>
    <button type="button" onClick={() => dispatch({ type: "close" })}>{closeLabel}</button>
  </section>
</div>
```

- [x] **4.5 实现语言和布局。** 使用已有LocaleRuntime切换，组件订阅语言更新不重置reducer；语言选择使用原生select配合shadcn视觉以避免再造弹窗。Theme沿用现有document dark class，本期不新增主题菜单。对320px宽屏和200%缩放保留原生滚动，不固定正文高度，不将文案放进canvas。
- [x] **4.6 绿测与提交。** 重跑4.2和现有 `test/unit/frontend-login.test.tsx`；确保测试卸载后没有滚动锁残留。仅暂存本 Task 文件，提交 `feat: add accessible public knowledge studio experience`。

## Task 5: 匿名根路径接入及网络边界回归

**Files:** Modify `frontend/app.tsx`, `scripts/frontend-app-contract.test.mjs`；Create `test/unit/frontend-workbench-landing-routing.test.tsx`；Reuse `test/helpers/authenticated-app-harness.tsx` 的 `mountApp`/`waitForApp`，不修改其清理逻辑。

**Interfaces:** Consumes Task4 PublicWorkbenchPage；Produces匿名`/`新分支及对其他分支的显式回归证据。

- [x] **5.1 写路由红测。** 将session mock返回 `Response.json({error:{code:"AUTH_REQUIRED",message:"Authentication required",retryable:false}}, {status:401})`，该错误码来自已核对的 `frontend/lib/session-state.ts`；等待最终元素，不在初始loading main出现时提前断言。

```tsx
const calls: string[] = [];
const app = await mountApp({ url: "https://app.test/", fetch: async (input) => {
  const path = String(input); calls.push(path);
  if (path === "/api/session") return Response.json({ error: { code: "AUTH_REQUIRED", message: "Authentication required", retryable: false } }, { status: 401 });
  if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });
  throw new Error(`UNEXPECTED_REQUEST:${path}`);
}});
try { await waitForApp(() => Boolean(app.container.querySelector("[data-workbench-landing]"))); }
finally { await app.unmount(); }
expect(calls.every(p => ["/api/session", "/api/telemetry/pageview"].includes(p))).toBe(true);
```

上述代码仅是初始路由红测骨架，不代表最终网络隔离测试。最终实现归一化 string/URL/Request、精确匹配同源和 method，并通过 pre-render `configureBrowser` 拦截 window.fetch/beacon/XHR；被拒绝的请求在抛错前记录，最终断言位于 awaited unmount 之后。

另测匿名`/knowledge/example`仍是data-login-page、session500仍带alert且无展示页、登录后`/`渲染原shell。遍历全部演示按钮和引用时加入fetch拒绝业务写入断言；静态资源请求与session/pageview单独分类，不能对任意`/api/`一概放行。
- [x] **5.2 运行红测。** `rtk npx vitest run test/unit/frontend-workbench-landing-routing.test.tsx`，预期匿名根路径缺少新标记。
- [x] **5.3 修改最小分支。** 在原sessionError分支之后、原匿名fallback之前接入公开页：

```tsx
if (anonymous && pathname === "/") return <PublicWorkbenchPage locale={locale} />;
if (anonymous) return <LoginPage locale={locale} />;
```

此处可静态导入HTML页面，但不得从页面顶层导入3D runtime。保留sessionError与已有加载状态及pageview effect。更新源码契约测试，分别验证根路径和其他匿名路径，不简单删除旧LoginPage断言。
- [x] **5.4 绿测并回归。** 重跑5.2；`rtk proxy node --test scripts/frontend-app-contract.test.mjs`；`rtk npx vitest run test/unit/frontend-login.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx`。另外断言401且code为其他值仍进入异常状态，不能让展示页修改认证错误分类。
- [x] **5.5 提交。** 仅暂存本 Task 三个文件，提交 `feat: route anonymous home to public knowledge studio`。

## Task 6: 可取消的 Three.js 运行时与加载策略

**Files:** Create `L/workbench-scene-config.ts`, `L/workbench-scene-policy.ts`, `L/workbench-scene-runtime.ts`, `tsconfig.landing.json`；Modify `package.json`, `package-lock.json`；Create `test/unit/frontend-workbench-landing-policy.test.ts`, `test/unit/frontend-workbench-landing-runtime.test.ts`。

**Interfaces:** Produces §2 `createWorkbenchScene`/handle/types，`shouldAutoLoadScene({reduceMotion,saveData,staticMode}): boolean`；Consumes Task2真实GLB节点。config只使用类型导入，不引用Three.js，导出 `LANDING_MODEL_URL` 与两个poster URL、`REQUIRED_ROOTS` 和预算常量。

- [x] **6.1 写策略与生命周期红测。** 策略表覆盖三个静态条件各自成立及全部false；runtime测试mock WebGLRenderer、GLTFLoader和帧调度，不mock待验证的dispose/abort逻辑。

```ts
expect(shouldAutoLoadScene({ reduceMotion: true, saveData: false, staticMode: false })).toBe(false);
expect(shouldAutoLoadScene({ reduceMotion: false, saveData: false, staticMode: false })).toBe(true);
const handle = await createWorkbenchScene({ host, modelUrl: "/fixture.glb", signal: controller.signal, onFailure });
handle.dispose(); handle.dispose();
expect(renderer.dispose).toHaveBeenCalledTimes(1);
expect(host.querySelectorAll("canvas")).toHaveLength(0);
```

`host/controller/onFailure/renderer`由此测试的beforeEach创建。补齐load失败、abort在fetch前/parse中/resolve后、缺失节点、contextlost、隐藏后取消帧、恢复后重新渲染；每个mock断言都绑定可观察生命周期，不以假渲染器证明视觉质量。
- [x] **6.2 运行红测并安装锁定依赖。** `rtk npx vitest run test/unit/frontend-workbench-landing-policy.test.ts test/unit/frontend-workbench-landing-runtime.test.ts`；确认缺失模块后执行 `rtk npm install --save-exact three@0.180.0` 和 `rtk npm install --save-dev --save-exact @types/three@0.180.0`。校验lockfile版本/integrity，并记录安装产生的安全告警；不执行自动audit fix。
- [x] **6.3 配置局部类型检查。** `tsconfig.landing.json`内容采用：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": ["vite/client"], "noEmit": true },
  "include": ["frontend/pages/workbench-landing/**/*.ts", "frontend/pages/workbench-landing/**/*.tsx"]
}
```

package新增 `typecheck:landing = tsc --project tsconfig.landing.json`，接入现有check的类型检查之后；测试运行时文件仍用node环境，不能靠Vite转译代替类型检查。
- [x] **6.4 实现受控资源加载。** 在runtime内导入 `three` 和 `three/addons/loaders/GLTFLoader.js`；fetch model带signal，检查response.ok再parseAsync arrayBuffer。parse不支持取消时，完成后检查signal，若已取消立刻释放模型，不能把它挂到已卸载host。任一初始化阶段失败均释放此前创建的资源。

```ts
const response = await fetch(options.modelUrl, { signal: options.signal });
if (!response.ok) throw new Error(`MODEL_HTTP_${response.status}`);
const bytes = await response.arrayBuffer();
const gltf = await loader.parseAsync(bytes, new URL(".", new URL(options.modelUrl, location.href)).href);
if (options.signal.aborted) { disposeObject(gltf.scene); throw new DOMException("Aborted", "AbortError"); }
```

`disposeObject(root)`在本runtime定义，遍历geometry、material与texture，用Set去重后释放。所有子资源必须由Task2检查器保证内嵌；不允许GLB暗中请求外域纹理。
- [x] **6.5 建立镜头和帧循环。** 使用OrthographicCamera、简单半球/方向光、无动态阴影和后处理；以`Box3.setFromObject()`算整体中心和适配宽高，避免硬编码Blender坐标。ResizeObserver更新投影和像素比；相机过渡300–450ms，每次update覆盖上一目标，静止无循环；visible=false或paused=true取消RAF。保留最后snapshot，恢复时按其绘制一次。
- [x] **6.6 完善失败与清理。** canvas监听webglcontextlost时preventDefault并调用onFailure，再交由外层静态降级；dispose幂等释放observer/listener/RAF/renderer及canvas。dark更新背景与材质色调，不重载模型。只统计实际`renderer.info.render.calls/triangles`作为后续浏览器证据。
- [x] **6.7 绿测与提交。** 重跑6.1测试、`rtk npm run typecheck:landing`、`rtk npm run build:ui`。仅暂存本Task文件，提交 `feat: add bounded on-demand workbench scene runtime`。

## Task 7: 3D 接入、动画联动与全路径静态降级

**Files:** Create `L/workbench-scene.tsx`；Modify `L/public-workbench-page.tsx`, `L/workbench-landing.css`；Create `test/unit/frontend-workbench-landing-scene.test.tsx`；Extend Task4 page测试。

**Interfaces:** Produces `WorkbenchScene({snapshot}: {snapshot:SceneSnapshot})`；ConsumesTask6 handle和policy，Task3 state通过page映射snapshot。DOM热点仍由page维护，scene只负责视觉，不产生第二份业务状态。

- [x] **7.1 写红测。** 注入/mock动态模块和matchMedia/IntersectionObserver/fetch；使用fake timers验证8秒超时，仅以真实加载状态推进UI。

```tsx
vi.useFakeTimers();
const view = await mountSceneWithPendingRuntime();
await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
expect(view.container.querySelector("[data-scene-status=timeout]")).not.toBeNull();
expect(view.container.querySelector("picture")).not.toBeNull();
expect(view.abortSignal.aborted).toBe(true);
await view.unmount();
vi.useRealTimers();
```

`mountSceneWithPendingRuntime`由该测试定义，创建真实组件/root并返回container、传入runtime的abortSignal及清理函数。补齐静态模式不导入runtime、手动启用、重试只产生一次新请求、过时promise完成不会插canvas、StrictMode重挂载、离开页面清理、语言切换不重建renderer。
- [x] **7.2 运行红测。** `rtk npx vitest run test/unit/frontend-workbench-landing-scene.test.tsx`。
- [x] **7.3 实现scene wrapper。** 初始picture和文字可见；符合策略且进入视口时才 `import("./workbench-scene-runtime")`，设置独立AbortController和8秒总加载计时器（包含import等待）。状态为poster/loading/ready/error/timeout/static；错误和静态路径共用HTML体验，只有主动重试才新建attempt。visibilitychange及IntersectionObserver共同决定可见性，不能互相覆盖导致后台继续渲染。
- [x] **7.4 接入动画。** state.captured驱动MG_CaptureCard从托盘外移动到托盘内，taskDone驱动MG_TaskCard移至第四列；保存原始局部变换，replay按其复位，不连续叠加偏移。feature聚焦使用节点世界包围盒中心；引用面板已打开时强调MG_CitationCard，机器人只做一次短转向。pause/reduceMotion立即呈现终态，不运行循环待机动画。
- [x] **7.5 实现用户控制与主题响应。** “静态模式/加载3D/暂停动画”使用可访问DOM按钮；静态选择保存在当前挂载状态，不写storage。减少动态或数据节省默认静态，主动加载后仍保留减少动态限制。监听document主题class变化调用handle.update，不重建renderer。布局保持320px到桌面不溢出、触摸可原生滚动。
- [x] **7.6 绿测与提交。** 重跑7.1及Task3–5测试，`rtk npm run typecheck:landing`。只暂存本Task文件，提交 `feat: connect interactive studio with reliable static fallback`。

## Task 8: 实际构建资产、安全边界与自动预算门禁

**Files:** Create `scripts/workbench-landing-build.test.mjs`；Modify `package.json`, `test/worker/assets.test.ts`；Extend `scripts/workbench-landing-assets.test.mjs`。

**Interfaces:** Consumes真实Vite manifest及输出GLB/WebP。Produces `verify:landing = node --test scripts/blender-mcp-client.test.mjs scripts/workbench-landing-assets.test.mjs scripts/workbench-landing-build.test.mjs`；检查器保证本地检查不需要运行Blender。build相关检查接在build:ui之后，不让测试读取陈旧dist。

- [x] **8.1 写构建契约红测。** 从`frontend/dist/manifest.json`解析JS静态import图和dynamicImports，断言启动静态闭包内无Three.js runtime chunk，并计算动态场景闭包中新增JS（排除初始共享模块）的gzip总和。不得只测单个入口文件以漏掉其子chunk。

```js
const graph = await loadBuildGraph("frontend/dist/manifest.json");
assert.equal(graph.initialStaticKeys.has(graph.sceneRuntimeKey), false);
assert.ok(graph.sceneExclusiveGzipBytes <= 250 * 1024, "SCENE_JS_BUDGET");
assert.ok(graph.modelBytes <= 2 * 1024 * 1024, "GLB_BUDGET");
```

`loadBuildGraph(manifestPath)`在该脚本定义，读取实际磁盘内容，解析manifest的imports/dynamicImports，循环引用用visited去重；找不到对应源入口或模型时明确失败。覆盖所有新动态分包，不能因为键名改变跳过检查。若Vite合并chunk导致不能证明隔离，应调整局部打包边界并重新验证，不删除断言。
- [x] **8.2 运行失败基线。** `rtk npm run build:ui` 后 `rtk proxy node --test scripts/workbench-landing-build.test.mjs`，实际预算未达成则记录具体字节，不将预算失败当环境问题。
- [x] **8.3 扩展Worker资源测试。** 使用构建manifest取得真实hash路径，通过SELF.fetch读取；GLB检查200、二进制响应类型和glTF magic，poster检查WebP文件头；未知资产404，不应回退成HTML。GLB允许有效二进制MIME `model/gltf-binary` 或 `application/octet-stream`，不接受text/html；loader按二进制解析。API匿名401、贡献者管理API403沿用原断言，检查公开模型不改变它们。
- [x] **8.4 接入命令。** 将asset checker和MCP客户端单测加入verify:landing，build图测试需在build:ui之后运行。在现有build命令中build:ui后追加verify:landing，其后保留secrets/legacy/dry-run步骤；node单测全部用合成fixture，不会意外启动Blender或联网。
- [x] **8.5 绿测并提交。** `rtk npm run build:ui`、`rtk npm run verify:landing`、`rtk npx vitest run test/worker/assets.test.ts`。若资源大小不达标返回Task2简化模型后重验。只暂存本Task文件，提交 `test: enforce landing assets and runtime budgets`。

## Task 9: 浏览器验收、证据同步和交付

**Files:** Create `docs/operations/evidence/2026-09-07-workbench-3d-landing.md`；Modify本计划、已批准规格的checklist；README仅追加准确的本地交付入口说明。截图输出`docs/operations/evidence/workbench-3d-landing/`，不能包含账号、私人资料或原场景路径。

**Interfaces:** Consumes前8任务真实产物与命令输出；Produces逐条规格映射的本地实现/验证状态。无实现或验证证据的条目保留未勾选，S6所有发布项继续未完成。

- [x] **9.1 新增缺漏回归并运行。** 复查未被自动测试覆盖的超时、无WebGL、lang切换、GitHub不可用、关闭面板焦点位置；将发现的问题先变为对应Task测试的失败用例，修复后运行该文件，不以截图替代回归测试。
- [x] **9.2 运行完整本地门禁。** `rtk npm run check`，额外执行 `rtk npm run verify:workbench-maturity` 与 `rtk npm run audit:workbench-domain`。记录准确提交/工作树差异与完整exit status。loopback/Workerd沙箱错误按批准流程在沙箱外重跑原命令；不要执行deploy或远程migration。既有审计问题必须标明为既有/新引入，不能顺手改成通过。
- [x] **9.3 启动本地演示与只读浏览器检查。** 使用可用浏览器技能并完整读取其SKILL.md，启动`rtk npm run dev:ui -- --host 127.0.0.1`。浏览器仅为本地演示mock匿名session与现有pageview，禁止修改生产鉴权；随后用本地Wrangler实际资源路径复核。记录mock覆盖边界，不能把Vite开发预览当Worker验收。
- [ ] **9.4 检查桌面/窄屏和双语。** 桌面1440×900、窄屏390×844与最窄320px；分别完成六步演示、五个热点、引用查看、重播、语言切换；键盘Tab/Shift+Tab/Esc、外部点击/内部点击、200%缩放。检查中英文标题不截断、画布不拦滚动、登录始终可达。只验证登录链接目标，不触发线上OAuth。
- [ ] **9.5 检查失败与资源清理。** 浏览器阻断GLB、延迟超过8秒、关闭WebGL、模拟减少动态和saveData，验证poster与HTML仍可用；切换页面反复挂载十次，确认canvas、监听及GPU资源不持续增长；后台/离屏不持续提交帧。开发StrictMode的观察与生产build预览分别记录。
- [ ] **9.6 记录性能与视觉证据。** 通过实际renderer信息记录draw calls/triangles，记录动画中帧率、分辨率、设备型号、浏览器、像素比、冷启动资源字节。桌面60fps/手机30fps是目标，无法接入真手机则S5-06保留部分待验收，不能使用桌面mobile emulation冒充真机通过。保存overview、问答引用、移动端面板、静态降级截图。
- [x] **9.7 文档更新与提交。** 在证据文件分别列实现、自动测试、浏览器观察、性能、发布五个状态；逐项勾选规格，缺证据不勾选。执行`rtk git diff --check`，提交仅本次相关文件 `docs: record local 3D landing acceptance evidence`；实际commit hash写入后续交付说明，避免文档自引用自身hash。
- [x] **9.8 交付。** 列出.blend/.glb/poster、可运行首页、测试结果及未验收项；明确未部署。审阅发现重要问题先修复并回归，不自动合并或开始S6。

## 3. 规格覆盖映射与完成边界

| 规格条目 | 计划负责人任务 | 完成证据 |
| --- | --- | --- |
| S0-01–S0-04 | 已完成的设计阶段 | 用户确认、源码核对、只读MCP结果、书面批准 |
| S0-05 | 本计划 | 文件/接口/命令/版本/覆盖自检 |
| S1-01–S1-05 | Task 3，Task 4 | 双语数据、引用及reducer/DOM测试 |
| S1-06 | Task 5 | 演示全流程网络拒绝断言 |
| S2-01–S2-02 | Task 1，Task 2 | MCP截图、独立scene及原场景比对 |
| S2-03–S2-09 | Task 2 | 七个节点、造型、相机与实际预览 |
| S2-10–S2-12 | Task 2，Task 8 | 可重现脚本、GLB/poster真实文件与检查器 |
| S3-01–S3-02 | Task 5 | 匿名根路径/深链接/错误/已登录回归 |
| S3-03–S3-07 | Task 4，Task 9 | HTML完整体验、双语、焦点/键盘/移动滚动 |
| S4-01–S4-02 | Task 6，Task 7 | 独立runtime、节点契约、DOM热点 |
| S4-03–S4-04 | Task 7 | 镜头覆盖、资料/引用/任务复位动画 |
| S4-05–S4-07 | Task 6，Task 7，Task 9 | 策略、失败、清理测试与浏览器实证 |
| S5-01–S5-03 | Task 3–8 | 所有局部测试、网络与Worker鉴权 |
| S5-04–S5-06 | Task 9 | 浏览器、截图、实际性能预算；无真机则保留缺口 |
| S5-07–S5-08 | Task 9 | 完整本地门禁及带限制的交付汇总 |
| S6-01–S6-04 | 不执行 | 需后续发布授权，保持未完成 |

本计划自检要求：所有49个规格ID都能归属上表；§2函数与Task接口名一致；不存在以“适当处理”替代明确失败行为的步骤；所有任务有失败基线、绿测和独立提交边界。Task1/2需要Blender连接，CI只运行其无外部服务单测和产物检查。Task3/4可在建模出现可恢复问题时独立推进，但任何替代资产必须标为临时，不算Task2完成。

执行方式待用户选择：当前任务内逐项执行，或授权子代理按任务实现并进行阶段审阅。计划完成不代表获得自动推送、部署或并行代理授权。
