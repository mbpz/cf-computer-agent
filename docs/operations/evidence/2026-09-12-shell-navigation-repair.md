# Shell 导航与账户交互修复 — 2026-09-12

范围：登录态工作台的共享 Shell；保留现有 shadcn 风格，不新增后端服务、Cloudflare 资源或部署。以下勾选表示本地实现/验证完成，不表示已提交或线上验收通过。

## 原子 Checklist

- [x] SHELL-01 复现账户菜单 pointerdown → trigger blur → click 时菜单提前卸载：设置、主题、退出三个 RED 用例。
- [x] SHELL-02 共享 Dropdown 移除瞬时 blur 关闭；外部 pointerdown 与实际外部 focusin 关闭，并取消失效的排队检查。
- [x] SHELL-03 保持 Escape、方向键、外部点击及账户/语言菜单互斥行为，运行键盘回归。
- [x] SHELL-04 修复 focus scope 对回调引用变化的误重置；命令按钮获得焦点后，重新渲染不抢回焦点。
- [x] SHELL-05 移除 Shell 内与标准菜单重复的 ModuleNavigation，保留权限过滤后的单一左侧导航。
- [x] SHELL-06 移除右侧 ContextRail 渲染，主内容获得剩余宽度；保留原组件文件，不删除其他页面能力。
- [x] SHELL-07 紧凑化侧栏头部，折叠按钮补充提示与固定尺寸。
- [x] SHELL-08 顶部任务、看板、通知、消息使用可区分图标；桌面图文、窄屏图标，保留名称及激活态。
- [x] SHELL-09 命令面板支持可见翻译文案搜索，补充受权限约束的看板入口。
- [x] SHELL-10 命令输入与结果列表关联，活动项滚入视野；输入框处理方向键/Enter，按钮保留原生激活。
- [x] SHELL-11 命令主题切换依据当前实际深浅色；退出 pending 时隐藏重复退出命令。
- [x] SHELL-12 语言菜单呈现单选状态与选中标记，外部点击关闭。
- [x] SHELL-13 运行自动回归、构建、国际化与额外前端严格类型检查。
- [x] SHELL-14 本地静态组件页浏览器验收桌面/窄屏账户、主题、命令搜索、外部关闭与退出回调。
- [x] SHELL-15 删除三个临时验收源码/配置文件，停止两个临时服务，恢复浏览器视口。
- [ ] SHELL-16 授权后提交/发布，再用真实登录会话验证设置页面、退出接口和生产导航。

## 根因与修复边界

账户菜单原实现监听 wrapper blur，排队读取 activeElement；浏览器指针激活过程中焦点暂时回到 body，可在 click 前卸载菜单，导致动作未执行。改为实际外部指针/焦点事件关闭，不在中间 blur 状态做判断。

焦点作用域原 effect 依赖每次 render 新建的 onEscape，造成反复清理/恢复焦点。现在 ref 保存最新回调，仅在打开/关闭时管理作用域。

导航重复来自 ModuleNavigation、标准 NavGroup 与右侧 ContextRail 同时渲染。现在保留标准菜单和顶部四个协作快捷入口；未实施页面的 coming-soon/权限边界继续保留，不将不可用业务功能宣称完成。

## 自动验证

最终结果：10 个测试文件、91 项通过。

```sh
rtk proxy npx vitest run test/unit/workspace-shell.test.tsx test/unit/frontend-menu-keyboard.test.tsx test/unit/frontend-shell.test.tsx test/unit/command-palette.test.ts test/unit/frontend-focus-scope.test.tsx test/unit/frontend-logout.test.ts test/unit/frontend-navigation-data.test.ts test/unit/frontend-responsive.test.tsx test/unit/frontend-a11y.test.tsx test/unit/ui-shell.test.ts
rtk proxy npm run typecheck
rtk proxy npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --lib ES2022,DOM,DOM.Iterable --strict --skipLibCheck frontend/components/shell/app-shell.tsx frontend/components/shell/command-palette.tsx frontend/components/ui/dropdown-menu.tsx frontend/components/ui/focus-scope.tsx
rtk proxy npm run build:ui
rtk proxy npm run verify:i18n
rtk proxy git diff --check
```

默认 typecheck 未覆盖多数前端 TSX，故额外直接检查此次 Shell/UI 文件及其依赖；不是完整前端全量类型检查。国际化检查通过 434 keys / 55 placeholders / 6 files。构建通过，但仍提示大于 500 kB 的 chunk（主入口约 978 kB 未 gzip），体积分包不属于本次修复。

## 本地浏览器验收

使用真实 AppShell 组件和固定演示会话，阻断后端请求；没有获取真实凭据、调用退出 API 或修改线上数据。

- 桌面：账户设置点击进入 `/settings`；深色切换生效；命令面板按可见中文“打开 AI 知识库”过滤，Enter 导航至 `/knowledge`；语言菜单点击外部关闭。
- 窄屏：导航抽屉可打开，底部账户菜单可操作；浅色切换生效；退出按钮触发演示退出回调；DOM 测得 clientWidth 与 scrollWidth 均为 360，无横向溢出。
- 截图检查：单一左侧导航，没有右侧辅助菜单；窄屏顶部显示四个独立协作图标。
- 开发模式临时页面曾遇到 React 预构建实例错误，改为静态构建页面完成以上验收；未宣称开发模式问题已修复。

真实生产域名登录验收尚未进行，本轮未提交、推送或部署。

## 增量：个人工作台产品定位

- [x] 移除侧栏、登录页与未登录展示页的 Memory Garden 品牌展示，使用“个人工作台 / Personal Workbench”。
- [x] 明确 AI 知识库为核心模块，任务、看板连接知识与行动；首页和登录介绍不再以团队知识库为主语。
- [x] 同步浏览器标题、PWA 安装名称、系统分享兜底标题与 README 定位。
- [x] 保留内部包名、数据库、会话与存储标识，避免品牌调整影响已有数据。
- [x] 增量验证：7 个相关 UI/模型测试文件 69 项通过；Worker 静态页面路由 2 项通过（其余 30 项未选中）；build:ui、verify:i18n、git diff --check 通过。

此增量为文案和品牌呈现调整，未增加业务功能，未提交、推送或部署。
