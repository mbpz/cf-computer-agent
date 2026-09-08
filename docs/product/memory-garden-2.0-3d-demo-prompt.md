# Memory Garden 2.0 3D 工作台演示提示词

## 产品意图

3D 页面是匿名访客看到的酷炫 Landing Page，用自动演示解释“个人工作台 SaaS”是什么。它不是登录后的业务主界面，不承载真实业务操作，不读取真实用户数据，不成为工作台的首屏性能依赖。登录后仍进入 2D 工作台。

## 中文提示词

```text
设计 Memory Garden 2.0 的 3D Landing Page。产品是面向 5–20 人私有团队的个人工作台 SaaS，AI 知识库只是其中一个模块。页面不是游戏，也不是元宇宙，而是通过一段自动演示让访客在几十秒内理解工作台的完整形态。

整体风格参考 Cloudflare Dashboard、Linear、Notion 和现代生产力工具：克制、清晰、专业、轻量，支持浅色和深色主题。避免赛博朋克、霓虹灯、复杂城市和无意义的装饰。

场景中心是 Today Hub，代表个人工作台。页面通过时间线自动演示“收集 → 整理 → 理解 → 规划 → 执行 → 协作 → 复盘”。周围分布：
- Inbox Dock：未整理的信息、链接、文件和临时想法；
- Knowledge Garden：知识、文档、笔记、引用和长期记忆；
- Goals Mountain：目标、季度重点和关键结果；
- Project District：正在进行的项目、成员、风险和时间线；
- Task Orbit：待办、进行中、阻塞和已完成任务；
- AI Observatory：摘要、建议、研究报告和自动化；
- Collaboration Room：评论、审核、讨论、会议和团队活动；
- Asset Library：模板、链接、代码片段和文件；
- Admin Control Tower：成员、角色、菜单、统计和审计；只作为管理员能力的概念展示。

颜色只表达业务状态。最近活跃对象使用柔和光晕，阻塞任务使用清晰但不刺眼的警示色，已归档对象使用低饱和度。知识节点、任务节点、项目节点和活动节点应有明确的形状区别。

交互包括：自动播放、暂停、跳过、重播、进度提示、点击热点显示功能卡片和明确的 GitHub 登录 CTA。桌面端可使用等距视角、拖拽旋转和滚轮缩放；移动端采用预设镜头，不要求自由漫游。低性能设备、WebGL 不可用或减少动态效果模式自动切换到静态海报和 2D 流程说明。

3D Landing Page 使用构建期静态演示数据，不读取真实业务对象，不创建访客业务数据，不调用额外付费服务。用户必须能够跳过演示并直接进入真实 GitHub 登录；登录后的所有核心工作必须在 2D 工作台中完成。
```

## 英文提示词

```text
Design a cinematic 3D landing page for Memory Garden 2.0, a private Personal Workbench SaaS for teams of 5–20 people. The AI knowledge base is one module inside the product, not the whole product. This is not a game and not a metaverse product.

Use a calm, professional, lightweight visual direction inspired by Cloudflare Dashboard, Linear, Notion, and modern productivity software. Support light and dark themes. Avoid cyberpunk neon, decorative cities, or visual complexity without meaning.

Place a Today Hub in the center. The page should automatically demonstrate the sequence “capture → organize → understand → plan → execute → collaborate → reflect”. Around it, create these zones:
- Inbox Dock for unprocessed notes, links, files, and ideas;
- Knowledge Garden for documents, notes, citations, and long-term memory;
- Goals Mountain for goals, quarterly priorities, and key results;
- Project District for active projects, members, risks, and timelines;
- Task Orbit for todo, doing, blocked, and completed tasks;
- AI Observatory for summaries, recommendations, reports, and automations;
- Collaboration Room for comments, reviews, discussions, meetings, and team activity;
- Asset Library for templates, links, code snippets, and files;
- Admin Control Tower for members, roles, menus, analytics, and audit events.

Use color only to communicate business state. Recently active objects may have a soft glow. Blocked tasks should use a clear but restrained warning color. Archived objects should be low-saturation. Use distinct shapes for knowledge, task, project, and activity nodes.

Required interactions: autoplay, pause, skip, replay, progress indicator, hotspot cards, and a clear GitHub login CTA. Desktop may support an isometric camera, drag to orbit, and scroll to zoom. Mobile should use preset camera shots instead of requiring free navigation. Automatically fall back to a static poster and 2D flow explanation on low-performance devices, WebGL failure, or reduced-motion mode.

Use build-time static demo data only. Do not read real user data, do not create visitor business records, and do not call paid external services. Every core workflow must remain fully usable in the authenticated 2D workbench without 3D.
```
