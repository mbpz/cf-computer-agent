# 落地页设计方案（2026-10-15）

依据：`~/.codex/skills/design-taste-frontend/SKILL.md`（tasteskill，反模板化前端技能）。
状态：**审计 + 候选方向 + 目标规格，未经选型；不是已批准实现计划，也不是验收结果。**
模式：**Redesign - Preserve**（技能 §11.A）。保留信息架构、路由、主文案语气与既有品牌取向，只做视觉与体系层面的演进。
范围：仅公开落地页（`/` 的匿名形态）。产品内工作台、管理端与数据密集界面明确不在本方案内（技能 §13 排除），另有并行调研承接。

---

## 1. 设计读取与三档

**Design Read：** 面向中文优先、邀请制、技术型个人知识工作台的公开落地页，采用克制的暖中性 + 单一墨绿语言的非对称分栏形态，沿用仓库既有的 CSS 变量体系（shadcn 风格 token + Motion + Phosphor）。

| 档位 | 取值 | 依据 |
|---|---|---|
| `DESIGN_VARIANCE` | **7** | 现有英雄区已是 `0.9fr / 1.25fr` 非对称分栏（`workbench-landing.css:43`），页脚 1.3fr/1fr；技能预设 Landing (SaaS) = 7，保持不作夸张 |
| `MOTION_INTENSITY` | **6** | 已有滚动揭示 + 按钮弹簧 + 3D 视角巡游（每 6s 换角）；技能预设 SaaS 落地页 = 6，不再加码 |
| `VISUAL_DENSITY` | **4** | 现状区块间距偏松（`padding-block` 2.5-3.5rem，容器 `min(100% - 4rem, 86rem)`）；SaaS 预设 4，但内容量偏少，保持不加密 |

---

## 2. 现状审计（实测，非估计）

### 2.1 结构（DOM 顺序即页面叙事）

| 区块 | 布局家族 | 实测值 |
|---|---|---|
| header（sticky） | 两端对齐单行 | `min-height: 5rem`（80px，正好在技能 80px 上限），`z-index: 30`，backdrop blur 22px + saturate 180% |
| hero | **非对称分栏**：文案 `.9fr` / 3D 工作室 `1.25fr` | `padding-block: 3.5rem 2rem`（顶 56px，远低于 `pt-24` 上限）；网格 gap `clamp(1rem, 3vw, 3rem)` |
| studio（3D） | 媒体块 + 状态行 + 控件 | 海报 `aspect-ratio: 8/5`，圆角 .75rem；canvas `touch-action: pan-y`（纵向滚动不被夺走） |
| demo（引导演示） | 分隔线分组的工具条 | `border-top` 而非卡片；功能按钮 flex 自动分配；进度条 `aria-current="step"` |
| flow（流程说明） | 文本块 | `border-top`，段落 `max-width: 62ch` |
| footer | 非对称双列（1.3fr / 1fr） | `border-top`，`padding-block: 2.5rem 3.5rem` |
| feature panel（受控浮层） | 右侧固定面板 | `width: min(100%, 31rem)`，圆角 .75rem，backdrop blur 32px，内高光 + 着色投影 |

布局家族数：6（分栏 / 媒体块 / 工具条 / 文本块 / 双列 / 浮层），满足技能 §4.7「8 个区块至少 4 个家族」。连续 zigzag 图文分栏：0 次，通过。

### 2.2 类型阶（现状）

| 角色 | 实测 | 备注 |
|---|---|---|
| hero h1 | `clamp(2.3rem, 3.65vw, 3.65rem)`，600，`lh 1.13`，`letter-spacing -.052em`，`max-width: 12ch` | zh-CN 变体：`lh 1.27`，`-.045em`，`max-width: 10em`（CJK 专门调校，值得保留） |
| hero 副文案 | 17px，`lh 1.65`，`color: var(--muted-foreground)`，`max-width: 34ch` | 技能 §4.7 要求 ≤ 20 词 |
| 区块标题 h2 | `clamp(1.4rem, 2vw, 1.9rem)`，600，`lh 1.3`，`-.025em` | |
| 正文 / 说明 | 15px / 14px，`max-width: 62ch` / `65ch` | |
| 状态行 / 眉标类小字 | 13px（scene 状态、demo badge） | |
| 品牌字 | 1.05rem，650，`-.035em` | |
| 字体族 | `font-family: inherit` → 系统栈 `ui-sans-serif, system-ui, ...`（`globals.css:106`） | **全仓无 `@font-face`、无 webfont 请求** |

### 2.3 色彩与 token 归属（本次审计最重要的发现）

- 落地页在 `.workbench-landing` 与 `.dark .workbench-landing` 里**自行声明 13 个色板 token**，全部为 `hsl()`：`--background hsl(40 18% 97%)`、`--primary hsl(166 24% 30%)`、`--ring hsl(166 24% 35%)` 等（浅色）；深色为 `hsl(150 4% 11%)` / `hsl(166 22% 67%)` 等。
- 外壳 token（`globals.css`）为 `oklch()` 且带 `.dark` 覆盖：`--secondary`、`--popover`、`--destructive`、`--radius: 0.55rem`、`--material-*` 系列。
- **`scripts/wcag-contract.mjs` 只解析 `frontend/styles/globals.css` 的 `:root` / `.dark`**，因此落地页这 13 个 token **完全在对比度门禁之外**。这是设计债，也是门禁漏洞。
- 落地页声明了但未使用：`--muted`（无用声明）。
- 单一强调色：墨绿 `hsl(166 24% 30%)`（浅）/ `hsl(166 22% 67%)`（深），符合技能「最多 1 个强调色」，且**未踩 AI 紫**。
- `token-contract.ts:25` 有 `forbidDecorativeGradients: true`，落地页 CSS 中确实零渐变。

### 2.4 形状与材质

- 半径实际三档：控件 `.375rem`、成组容器 `.5rem`、媒体/浮层 `.75rem`；外壳另有 `--radius: 0.55rem`。**存在隐含规则但未成文**。
- 材质：header 与浮层用 `backdrop-filter: blur(22px|32px) saturate(180%)`，并在 `@media (prefers-reduced-transparency: reduce)` 下**降级为实色**（这是本页做得很好的一处，保留）。
- 投影只有浮层一处，且**着色**（`color-mix(in oklab, black 38%, transparent)`），另加 1px 内高光；未滥用纯黑投影。

### 2.5 动效（实测清单）

| 来源 | 值 |
|---|---|
| 视角切换与节点补间 | `transitionMs 380`，缓动为 smoothstep `t*t*(3-2t)`（JS 内联） |
| 视角巡游 | `SCENE_TOUR_INTERVAL_MS 6000` |
| 拖拽后保持循环 | `CONTROL_SETTLE_MS 600`，随后重算一次取景 |
| 相机约束 | damping 0.08，极角 0.55-1.45 rad，缩放 0.6-2.4，禁用平移 |
| 取景余量 | `× 1.16`，下限 `size/20` |
| 加载预算 | 首字节前 30s、字节间隔 15s、总量 120s、轮询 1s |
| 滚动揭示 | `ScrollReveal` 默认 `y 16px`、`blur 8px`、`0.6s`、`EASE_OUT`，`once` |
| 按钮 | `whileTap 0.97`、`whileHover 1.015`、`SPRING_PRESS` |
| 共享缓动/弹簧 token | `frontend/lib/ease.ts`：`EASE_OUT [0.16,1,0.3,1]`、`SPRING_LAYOUT 360/32/0.6`、`SPRING_PRESS 500/30/0.6` 等 9 个 |
| CSS 内动效 | **零** `@keyframes`、零 `animation`、零基础态 `transition`；仅 `:active` 的 1px 位移（瞬时） |

**缺口：`frontend/` 全仓没有 `MotionConfig`**，`ScrollReveal` 与按钮弹簧都未接 `useReducedMotion`。技能 §6.B 把「MOTION_INTENSITY > 3 必须尊重 `prefers-reduced-motion`」列为不可协商项；仓库也**没有任何门禁**强制这一点（只有 CSS 层的降级）。

### 2.6 门禁与平台约束（设计必须服从的硬边界）

| 约束 | 实测要求 |
|---|---|
| 对比度 | `scripts/wcag-contract.mjs`：6 组配对在 `:root` 与 `.dark` 下**比值 < 4.5 直接失败**；token 必须是 `oklch(L C H)`，其他写法被忽略 |
| 焦点可见 | CSS 必须包含 `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px }`（落地页为 4px） |
| CSP | `default-src 'self'`，**未声明 `font-src` / `img-src` / `style-src`**，一律回落到 `'self'`；唯一外部来源是 `static.cloudflareinsights.com`。因此**字体与图片必须自托管**，不可用 Google Fonts、不可用 picsum/unsplash 直链 |
| 资产预算 | 模型 ≤ 2MiB（gzip 孪生 ≤ 320KiB）、海报 ≤ 250KiB、场景独占 JS gzip ≤ 250KiB、三角面 ≤ 60000、贴图 ≤ 1024px、海报尺寸必须为 1600×1000 / 900×1100 |
| 懒加载 | three.js 与场景运行时**不得进入初始静态闭包**；VM 相关模块与二进制同理 |
| 构建产物 | 产出字节必须与源文件逐字节一致（`BUILT_ASSET_MISMATCH`） |
| 其他 | `forbidDecorativeGradients: true`；无预绘制主题脚本，暗色由 JS 在挂载后切换 |

---

## 3. 候选方向（待选型）

三个方向的覆盖面依次递增，均可独立验收；推荐 **B**。

| 方向 | 内容 | 优势 | 代价与风险 |
|---|---|---|---|
| **A. 收敛打磨** | 只做技能 §11.D 前三杠杆：排版刻度收敛 + 间距节奏 + token 归位（`hsl` 转 `oklch` 并纳入对比度门禁）+ 动效补齐（`MotionConfig`、悬停过渡） | 风险最低，全部可被现有门禁验证，不改任何文案与结构 | 观感提升有限，仍是"系统字体 + 暖中性"的普通 SaaS 落地页 |
| **B. 品牌化推进（推荐）** | A + 自托管显示字体（拉丁子集，CJK 仍用系统字体）+ 英雄区文案收敛到 ≤20 词 + 徽标下沉到 demo 区 | 命中收益最高的杠杆（字体先于一切影响首印象），仍不动信息架构 | 两条候选文案需你确认（§5.6）；新增 ≤120KiB 字体预算；需新增字体体积断言 |
| **C. 结构升级** | B + 增加一条横向滚动能力一览（marquee 至多一条）+ 一段真实截图区 | 内容可信度与密度更高，减少"只有 3D、其余是文字"的观感 | 接近技能边界（marquee 上限、禁止假界面）；需要新的真实素材，且 CSP 要求自托管，素材成本最高 |

推荐 B 的理由：把最高收益杠杆（排版）与最低风险项（token、动效、门禁对齐）组合在一个批次里，信息架构、路由与文案语气全部不动，符合技能 §11.C 的保留规则。

---

## 4. 审计结论：保留、升级、补齐

**保留（不动）**：非对称英雄分栏、暖中性 + 墨绿单一强调色、`border-top` 分隔而非卡片、CJK 专门的行高与字距变体、`prefers-reduced-transparency` 降级、3D 工作室作为主视觉、提示气泡式的功能浮层。

**升级（按技能 §11.D 杠杆顺序）**
1. **排版刷新**（收益/风险比最高）：自托管一套显示字体，替换系统栈的「无品牌感」。
2. **间距与节奏**：把区块间距从散落的 2.5-3.5rem 收敛为一套节奏刻度。
3. **色彩体系归位**：13 个 `hsl()` token 转为 `oklch()`，并让对比度门禁覆盖落地页。
4. **动效对齐**：接入 `MotionConfig reducedMotion="user"`，补齐 CSS 过渡（当前基础态零过渡，悬停/焦点状态生硬）。

**补齐（本次新发现）**
5. 预绘制主题脚本，消除暗色闪白（CSP 允许同源脚本，落地方式见 4.10）。
6. 英雄区文案收敛到技能 §4.7 的硬指标（副文案 ≤ 20 词 / ≤ 4 行）。

---

## 5. 目标设计规格

### 5.1 字体（自托管，CSP 兼容）

- 显示字体（标题、品牌字）：**Geist** 或 **Outfit**（技能 §4.1 推荐池；均为开源、可自托管）。不选 Inter（无品牌表达），不选任何衬线（技能对「创意即衬线」的默认倾向有明确禁令）。
- 正文与界面：保留系统栈（CJK 场景下系统字体更稳，且省字节）。
- 交付形式：`@font-face` + `font-display: swap` + 仅 `woff2`，子集化只留拉丁与标点（中文继续用系统字体，避免数 MB 级 CJK 字体）。
- 预算：新增字体总量 ≤ 120KiB（落在 CSP 与懒加载约束内，不进入场景预算）。

### 5.2 色板（统一到 `oklch`，单一强调色）

- 保留落地页的暖中性取向与墨绿强调色（技能 §11.C 品牌保留），**只换色彩语法**，并保持浅/深两套值一一对应。
- 转换后必须满足：`foreground/background`、`muted-foreground/background`、`primary-foreground/primary`、`accent-foreground/accent` 四组在两种主题下 ≥ 4.5:1。
- 删除未使用的 `--muted` 声明。
- 强调色锁定：整页只有墨绿一个强调色（当前 demo badge、进度当前项、功能图标、引用左边框都已符合，无需新增色）。

### 5.3 类型阶（含 CJK 变体，收敛为刻度）

| 角色 | 刻度 | 浅/深通用 |
|---|---|---|
| display（hero h1） | `clamp(2.3rem, 3.65vw, 3.65rem)`，600 | 保留；zh `lh 1.27` / `-.045em` |
| title（h2） | `clamp(1.4rem, 2vw, 1.9rem)`，600 | 保留 |
| lead（hero 副文案） | 17px，`lh 1.65` | 保留 |
| body | 15px | 统一（现状 14/15px 混用收敛为 15px） |
| caption | 13px | 统一（现状 12/13px 收敛为 13px） |

### 5.4 间距与节奏

- 区块纵向：`section-gap = clamp(3rem, 6vw, 5rem)`；区块内：`1rem / 1.5rem / 2.5rem` 三档。
- 容器保持 `min(100% - 4rem, 86rem)`（视图宽裕时接近技能推荐的 1400px 上限）。
- 移动端（< 768px）：容器左右 padding 收为 1.5rem，英雄分栏塌为单列（现状已有该媒体查询，收敛其数值即可）。

### 5.5 形状锁定（成文规则）

| 用途 | 半径 |
|---|---|
| 交互控件（按钮、输入、视图切换项） | 全胶囊（`999px`，beUI `button-base` 的形状语言） |
| 成组容器（视图刻度条、工具栏） | `.5rem` |
| 媒体与浮层（海报、3D 舞台、面板） | `.75rem` |

写入 `workbench-landing.css` 顶部注释，并在评审中作为检查项；不再出现第四种半径。共享的 shadcn 组件（如 `card`、`focus-scope`）自带 `--radius` 系列，属继承而非本页新增。

### 5.6 英雄区规格（技能 §4.7 硬指标）

- 文本元素 ≤ 4：**标题 + 副文案 + 主 CTA + 次 CTA**。现状第 5、6 个元素是 3D 状态行与「示例演示 · 不读取你的个人数据」徽标；两者都是真实功能信息（不是装饰条），保留但下沉：状态行归属 3D 舞台（现状即如此），徽标移到 demo 区块标题行。
- 副文案收敛到 ≤ 20 词 / ≤ 4 行。当前中文副文案约 46 字（两分句），**属超限**，提出以下候选（改动文案需你确认，技能 §11.C 默认不改语气）：
  - 中文（22 字）：`收集资料、整理知识、追问答案，再把它们变成行动。`
  - 英文（15 词）：`Collect sources, shape knowledge, ask questions, and turn every answer into action.`
- h1 保持 ≤ 2 行：现状 `max-width: 12ch` / zh `10em` 已满足（实测桌面 2 行）。
- 顶部 padding 56px，远低于 `pt-24` 上限，保持。

### 5.7 区块计划（布局家族与眉毛配额）

| 区块 | 布局家族 | 眉毛（小写大写距标签） |
|---|---|---|
| hero | 非对称分栏 | 无 |
| studio（3D） | 媒体块 + 控件 | 无 |
| demo | 工具栏 + 进度列表 | 无（现状徽标移入此处作为隐私说明） |
| flow | 文本块 + 分隔线 | 无 |
| footer | 非对称双列 | 无 |

眉毛总数 0，配额上限 `ceil(5/3) = 2`，通过。区块家族 5 种，无重复。**不引入**技能列出的禁止项：区块编号眉毛、滚动提示、装饰性色点、英雄底部装饰字条、图片上的标签药丸、版本号页脚、假界面（本页用真实 3D 与真实海报，符合技能 §4.8）。

### 5.8 动效规格（复用既有 token，只补缺口）

| 动作 | 规格 |
|---|---|
| 区块进入 | `ScrollReveal`：`y 16px`、`blur 8px`、`0.6s`、`EASE_OUT`、`once`（保留） |
| 按钮按下 / 悬停 | `SPRING_PRESS` + `scale 0.97 / 1.015`（保留） |
| 视角切换 | `transitionMs 380` + smoothstep；巡游 6000ms（保留） |
| 悬停 / 焦点过渡 | **新增**：`120ms` `EASE_OUT` 的颜色与背景过渡（当前基础态零过渡） |
| CSS 层 | 新增过渡必须置于 `@media (prefers-reduced-motion: no-preference)` 内，或在 `reduce` 块中显式关闭（现状已有 reduce 块，扩写它） |
| **全局降级** | **新增**：应用根部 `MotionConfig reducedMotion="user"`，使滚动揭示与按钮弹簧在系统偏好为「减少动态」时自动退化为即时状态 |
| 性能 | 只动 `transform` / `opacity`；不新增 `scroll` 监听（技能 §5.D 硬禁）；3D 保持按需懒加载与现有预算 |

### 5.9 组件基准：beUI 优先（按用户指令）

用户指令：**项目内尽可能直接使用 beUI 成熟组件，整体风格样式也按 beUI 设计。** 本节是该指令在公开落地页上的落地表，也是后续工作台 / 管理端的同一基准（后者由并行的 `2026-10-15-authenticated-workspace-design-research.md` 承接）。

仓库现状（实测）：`frontend/components.json` 已配置 `registries["@beui"] = https://beui.dev/r/{name}.json`、`iconLibrary: phosphor`、`cssVariables: true`；实时注册表 143 项（112 组件 + 31 block）；仓库已有 11 个 beUI 组件：`motion/{button/base,loader,number-ticker,scroll-reveal,animated-toast-stack,file-tree,not-found/glitch,table}`、`agents/{agent-progress,citations,code-block}`。

| 需求 | 采用 |
|---|---|
| 全部按钮（英雄区 CTA、暂停、场景加载/重试/静态、引导下一步/重放、功能按钮、面板 8 处） | **beUI `motion/button/base`** 的 `Button`，登录入口用 `ButtonLink`（本次已切换；`variant`/`size` 与既有用法一一对应） |
| 3D 加载中 | **beUI `motion/loader`**（`variant="dots"`，自带 `useReducedMotion`；用 `aria-hidden` 包裹避免与状态行形成嵌套直播区） |
| 滚动揭示 | 已是 beUI `motion/scroll-reveal`（本次实测：减少动态下位移与模糊被移除，只保留纯透明度淡入） |
| 引用 / 表格 / 代码 / 数字滚动 | 已装 beUI `citations`、`table`、`code-block`、`number-ticker`；面板的引用列表可后续换成 `citations` |
| 语言切换 | **beUI `motion/select`**（受控 `value`/`onValueChange`；实测切换后 `document.documentElement.lang` 变为 `zh-CN`）。可访问名由触发器内的 `sr-only` 文本提供，因为该组件不转发 `aria-label` |
| 视角刻度条 | **beUI `motion/tabs`**（`variant="pill"`，受控 `value`/`onValueChange` 直接对接页面 `view` 状态；触发器为 `role="tab"` + `aria-selected`）。触发器文本在 DOM 中成对出现，是组件用于遮罩动画的 `aria-hidden` 克隆，无误读风险 |
| 功能面板 | **beUI `motion/drawer`**（`open`/`onOpenChange`/`side="right"`/`dismissable`），自带 `aside[role="dialog"][aria-modal="true"]`、Esc、遮罩点击关闭、body 滚动锁与 reduced-motion 降级；页面自身的焦点范围与 `inert` 逻辑保留。切换过程中发现并修掉一个既有缺陷：面板自身也有一份 body 滚动锁，它捕获的是 Drawer 已写入的 `hidden`，清理顺序导致**每次关闭后页面被永久锁住**；现由 Drawer 单一负责，测试恢复了「关闭即恢复、卸载即恢复」的完整断言 |
| 引用列表 | **保留自定义按钮列表**：beUI `citations` 的条目渲染为 `<a href>` 且没有单项点击回调，替换会丢掉「点击引用 → 面板切到来源」的演示交互（有测试覆盖）。它是工作台展示真实引用来源时的正确组件，届时替换 |
| 图标 | 统一 Phosphor（`components.json` 的 `iconLibrary`）。已采纳的 beUI 组件里，`tabs` 的 `ChevronLeft/Right` 与 `select` 的 `Check/ChevronDown` 已替换为 Phosphor 的 `CaretLeft/CaretRight`、`Check/CaretDown`，全仓仍只有一套图标族 |
| 令牌 | 沿用仓库既有 shadcn 令牌（beUI 组件本身就基于这些令牌，例如 `bg-card`、`text-muted-foreground`），因此「按 beUI 设计」与现有 `globals.css` 体系一致，不需要第二套主题 |

**形状语言的后果**：beUI 的按钮是胶囊形，故 `--landing-radius-control` 由 `.375rem` 改为 `999px`（§5.5 已同步）。原生 select 与刻度条项随之变为胶囊，视觉语言统一。

### 5.10 状态（技能 §4.5）

| 状态 | 现状 | 目标 |
|---|---|---|
| 3D 加载 | 有：进度百分比、停滞判定、静态回退、重试 | 保留（本次已完成） |
| 3D 失败 | 有：错误文案 + 静态演示 + 重试 | 保留 |
| 静态模式 | 有：`prefers-reduced-motion` / `saveData` 自动降级 | 保留 |
| 主题闪白 | **缺**：暗色在 JS 挂载后应用 | **补**：`frontend/public/theme-boot.js`（同源同步脚本，CSP 允许），在 `<head>` 内读取 `localStorage["memory-garden-theme"]` 并给 `<html>` 打 `dark` 类，主包继续负责后续切换 |

---

## 6. 门禁对齐清单（设计改动必须同时改门禁）

| 门禁 | 需要做的对齐 |
|---|---|
| `scripts/wcag-contract.mjs` | **已实施**：新增 `assertLandingWcagCss` 解析落地页两个 token 块（`light` 与 `dark .workbench-landing`），并修正 `contrastRatio` 未对 sRGB 通道做线性化的问题。修正前该函数会低估所有比值（落地页 8 组里 5 组被误判为不达标）；修正后外壳 6 对 × 2 主题、落地页 4 对 × 2 主题全部通过。`scripts/wcag-contract.test.mjs` 增加落地页断言 |
| `scripts/workbench-landing-assets.test.mjs` | 不变（海报尺寸/体积/模型预算保持） |
| `scripts/workbench-landing-build.test.mjs` | 不变（场景 JS gzip ≤ 250KiB、three 必须懒加载） |
| `frontend/styles/globals.css` 焦点环 | 保持 `:focus-visible` 2px `var(--ring)`（落地页 4px offset 可保留） |
| CSP | 新字体与新图片一律自托管；不新增任何外部来源 |
| 体积 | 字体 ≤ 120KiB，且不进入初始静态闭包的场景预算 |

---

## 7. 实施阶段（每阶段独立可验收）

| 阶段 | 内容 | 验收 |
|---|---|---|
| P0（已完成） | `MotionConfig reducedMotion="user"` + 收敛间距/字号刻度 + 形状规则成文注释 | `npm run typecheck`、落地页单测、`npm run verify:wcag` |
| P1（已完成） | 13 个 token 转 `oklch` + 扩展 `wcag-contract` 覆盖落地页 + 修正对比度数学；`--muted` 保留（共享组件仍经它解析，见 §5 注释） | `npm run verify:wcag` 通过，且新增落地页断言 |
| P2（已完成） | 自托管显示字体 Geist（latin woff2，56.8KiB）+ `font-display: swap` + `<link rel=preload>`；预算与许可由 `workbench-landing-build.test.mjs` 门禁 | `npm run build`、`verify:landing` 100/100、真实浏览器 `document.fonts` 显示 loaded |
| P3（已完成） | 预绘制主题脚本 `frontend/public/theme-boot.js`（同源同步脚本，CSP 允许）+ Service Worker 缓存范围收窄到 `/assets/`（避免旧脚本被永久缓存） | 阻断应用包后 `html.dark` 仍为真；再阻断 boot 脚本则为假 |
| P4（按你的决定不做） | 英雄区文案收敛 | 文案保持原样 |
| P5（进行中） | 交付前预检矩阵逐项复核（见 §8） | 逐项通过 |

---

## 8. 交付前预检矩阵（技能 §14，逐项判定）

| 检查项 | 现状 |
|---|---|
| Design Read 声明、档位有理由 | 通过（§1） |
| 设计系统选型或美学取向诚实标注 | 通过（沿用仓库既有变量体系 + Radix/shadcn 风格控件，非虚构系统） |
| 重审模式与审计 | 通过（§2） |
| 零破折号（页面可见处） | 通过（实测落地页 `workbench-copy.ts` 与页面组件中该字符出现 0 次；中点符号每行至多一次，仅用于隐私说明与示例标注） |
| 页面主题锁定 | 通过（整页同一主题，无区块反色） |
| 单一强调色一致 | 通过（墨绿贯穿） |
| 形状锁定 | 通过（三档已写入 CSS 顶部注释与 §5.5；控件为 beUI 胶囊，成组 `.5rem`，媒体 `.75rem`） |
| 按钮对比度 / CTA 不换行 | 通过（改用 beUI 尺寸档后：`sm` 32px、`md` 40px、`lg` 48px，均高于 WCAG 2.2 AA 的 24px 目标尺寸下限；中文标签均单行，面板内长标签由 `white-space: normal` 显式换行） |
| 衬线纪律 / 高端米金禁忌色板 | 通过（不引入衬线；落地页为暖中性 + 墨绿，非米金+黄铜） |
| 英雄区适配首屏、顶部 padding ≤ pt-24 | 通过（56px；首屏含两个 CTA） |
| 英雄区文本元素 ≤ 4 | 通过（徽标已下沉到 demo 区标题行；实测 `.workbench-hero-copy` 内叶子文本节点 3 个，3D 舞台的状态行与控件归其自身区域） |
| 眉毛配额 | 通过（0 个） |
| 分栏标题禁令 / zigzag 上限 | 通过（无分栏标题，无 zigzag） |
| CTA 意图不重复 | 通过（开始演示 / 探索工作台 / 登录，三个意图） |
| Logo 墙规范 | 不适用（本页无 Logo 墙） |
| Bento 节奏与色面多样性 | 不适用（本页无 bento） |
| 真实图片（禁假界面 / 禁纯文本极简） | 通过（真实 3D 模型 + 真实海报；无 div 假界面） |
| 列表长于 5 项需换组件 | 不适用（进度列表 5 项，功能按钮 5 个） |
| 图片上不叠标签药丸 / 无装饰性图注 | 通过 |
| 版本号页脚 / 状态点 / 滚动提示 / 地区时间条 | 通过（均无） |
| 文案自检（语法与幻觉） | 通过（本次复核中英文案，无破损句） |
| 动效有动机、marquee 至多一条 | 通过（无 marquee） |
| 导航单行、高度 ≤ 80px | 通过（80px 整） |
| `min-h-100dvh` 而非 `h-screen` | 通过 |
| 减少动态覆盖（MOTION > 3 必须） | 通过（根部 `MotionConfig reducedMotion="user"`；实测 `ScrollReveal` 在减少动态下 `transform: none, filter: none`，常规态为 `translateY(16px) + blur(8px)`） |
| 深色模式两套 token 且已测 | 通过（两套均在） |
| 移动端塌陷显式声明 | 通过（767px 媒体查询） |
| 图标来自允许库 | 通过（Phosphor） |
| 无 AI 味默认（Inter / AI 紫 / 三等分卡 / Jane Doe） | 通过 |
| 核心网络指标合理 | 通过（模型已预压缩 186KiB、场景懒加载、海报预留长宽比防抖动） |

---

## 9. 明确不做

- 不改路由、锚点、主导航标签、信息架构。
- 不改文案语气（§5.6 的两条候选文案需你先确认）。
- 不为落地页引入新的设计系统包（不引入 Material / Fluent / Radix Themes 之类，避免与既有变量体系混用，技能 §2「一项目一体系」）。
- 不做产品内工作台与数据密集界面的视觉改造（技能 §13 排除）。
