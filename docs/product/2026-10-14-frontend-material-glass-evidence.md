# 2026-10-14 前端毛玻璃材质层（参考 Apple 材质）本地证据

基线：`1c943fbd`（本轮交互动效层提交）。本轮为本地源码与本地验证，**未部署、未远程迁移、未读取或写入任何密钥**，不构成生产发布或签名浏览器验收。

## 1. 目标与既有约束

目标：整体外观改为参考 Apple 的毛玻璃／材质语言，覆盖登录后工作台与匿名落地页。

仓库既有限制决定了实现手段：

- `frontend/styles/token-contract.ts` 声明 `forbidDecorativeGradients: true`——**不使用任何渐变**；
- `scripts/wcag-contract.mjs` 对 `:root` / `.dark` 的 6 组 token 对要求 ≥4.5:1；
- 动效层已有 `prefers-reduced-motion` 兜底，材质需再加 `prefers-reduced-transparency`。

因此深度只由四件事构成：`backdrop-filter`（模糊 + 饱和）、半透明表面色、1px 发丝内高光、柔和投影。

## 2. 材质系统

`frontend/styles/globals.css` 新增（var 间接引用，暗色主题复用同一组定义，仅高光与投影在 `.dark` 覆盖）：

| Token | 亮色 | 暗色 |
| --- | --- | --- |
| `--material-blur` | `24px` | 同 |
| `--material-saturate` | `180%` | 同 |
| `--material-chrome` | `color-mix(in oklab, var(--card) 72%, transparent)` | 同（随 `--card` 变化） |
| `--material-panel` | 82% | 同 |
| `--material-surface` | 88% | 同 |
| `--material-highlight` | 白 62% | 白 11% |
| `--material-shadow` | 浅投影 | 更深投影 |

三档 `@utility`：`material-chrome`（壳层 chrome）、`material-panel`（浮层）、`material-surface`（内容卡片）。放在 Tailwind 的 utilities 层，因此既有 `focus-visible:ring-*` 仍以更高优先级在聚焦时替换材质投影。

两处回退：`prefers-reduced-transparency: reduce` 时模糊归零、表面转为不透明；`@supports not (backdrop-filter)` 时表面转为不透明（避免半透明底把文字压在未处理的内容上）。

## 3. 变更清单

| 位置 | 之前 | 现在 |
| --- | --- | --- |
| `components/ui/card.tsx` | `bg-card` + `shadow-sm` | `material-surface` |
| `components/ui/dialog.tsx` | `bg-background` + `shadow-lg` | `material-panel` |
| `components/ui/sheet.tsx` | `bg-background` + `shadow-lg` | `material-panel` |
| `components/ui/dropdown-menu.tsx` | `bg-popover` + `shadow-md` | `material-panel` |
| `components/ui/tooltip.tsx` | `bg-popover` + `shadow-md` | `material-panel` |
| `components/shell/app-shell.tsx` 顶栏 | `bg-background/95` + `backdrop-blur` | `material-chrome` |
| `components/shell/app-shell.tsx` 侧栏 | `bg-card` | `material-chrome` |
| `pages/workbench-landing/workbench-landing.css` 页头 | 静态、无背景 | 粘性 + 玻璃 chrome（74% + `blur(22px)`） |
| 同上 浮层面板 | 不透明 `var(--card)` | 84% + `blur(32px)` + 内高光 + 深投影 |
| `pages/home-page.tsx` 三段卡片 | 无稳定定位钩子 | 新增 `data-home-section="tasks\|knowledge\|activity"` |

命令面板沿用上一批的 `portal`（它本来就渲染在顶栏内，顶栏的 `backdrop-filter` 会让它成为固定后代的包含块）。

表中最后一项是配套修正：`test/unit/frontend-home-route.test.tsx` 原先用 `.closest(".bg-card")` 定位首屏三段卡片，即把 Card 的背景类名当成了定位契约；类名换成 `material-surface` 后该定位失效。改为查询新增的 `data-home-section`，同时保留“本地化标题必须位于同段内部”的原判据——行为断言（错误态不回退成 0 或空）不变。

## 4. 对比度与可读性

表面不透明度取 72–88%，文字仍是深色字压近白表面、浅色字压近黑表面，与改动前同一组 token 的组合关系不变；`verify:wcag` 保持通过。落地页浮层保留原有的 44% 黑色遮罩，表面 84% 不透明。

## 5. 验证（本轮实际运行）

- `npm run check` 退出 0：unit 366 文件 / 5235 用例、Worker 71 文件 / 1200 用例、smoke 84、i18n 13、delivery 30、landing 97，构建/密钥扫描/legacy 审计通过。
- `npm run verify:wcag` 通过。
- 编译产物核对：三档 `material-*` 与两条回退规则均出现在产物 CSS 中。
- 受管 Blink（真实渲染）读取的计算样式：

| 表面 | 背景 | backdrop-filter | 投影 |
| --- | --- | --- | --- |
| 顶栏 / 侧栏 | `oklab(…) / 0.72` | `blur(24px) saturate(1.8)` | — |
| 命令面板 | `… / 0.82` | `blur(33.6px) saturate(1.8)` | inset 白 11% + 双层柔和投影 |
| 卡片（暗色） | `… / 0.88` | `blur(14.4px) saturate(1.8)` | 同上 |
| 卡片（亮色） | `oklab(1 0 0) / 0.88` | 同上 | inset 白 62% |
| 落地页页头 | `… / 0.74` | `blur(22px) saturate(1.8)` | `position: sticky; top: 0; z-index: 30` |
| 落地页浮层 | `… / 0.84` | `blur(32px) saturate(1.8)` | inset 白 55% + 深投影 |

落地页滚动到 `scrollY = 593` 时页头仍位于 `top: 0` 且模糊生效，内容从其下方穿过。

生成物对账：索引仍为 283 文件 / 1211 候选 / 115 未归属；仅 `frontend/components/ui/card.tsx` 因类名替换需要更新指纹（坐标与语义未变）。

## 6. 未验证 / 边界

- **本会话不具备读图能力**，因此以上全部结论来自计算样式、产物规则与合同测试，**没有逐像素或人眼判读观感**。观感需要人工复核。
- 未在真实 Safari / 真机复核；`backdrop-filter` 在 WebKit 需要 `-webkit-` 前缀（已同时书写），但未实测。
- 未做 `prefers-reduced-transparency` 的运行时模拟（当前浏览器后端未暴露该模拟），该回退以“产物规则存在 + 标准媒体查询语义”为准。
- 性能未量化：材质只落在壳层、浮层与卡片三档，未用于长列表的每一行；未做帧率或合成层测量。
- 未部署、未 push、无签名浏览器或原生验收。
