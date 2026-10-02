# 环境入口成熟度清单补齐（2026-10-02）

## 范围与基线

- 基线 `b4592a0`，分支 `codex/functional-checklist-completion`。
- 修复已可见 `/environments` 未登记成熟度清单的结构缺口，不改产品行为、不隐藏入口、不关闭 VM 功能任务。
- 登记 `workbench-environments` / `WB-ENVIRONMENTS`，分类 `partial`；页面只管理成员私有元数据，不宣称启动 VM。运行时接入、离页草稿保护、跨刷新未知写恢复、发布和真实身份验收仍开放。
- 加入页面/管理器操作根、API 与成员谓词来源、R8-009 缺口归属和四态页面夹具。领域记录不是已完成运行时审计的证明。

## 本轮验证

| 检查 | 结果与范围 |
| --- | --- |
| `npm run verify:workbench-maturity` 初始 | 13/14，精确失败于 ready 路由缺少 environments |
| `npm run verify:workbench-maturity` 最终 | 15/15；包含不得将元数据管理提升为 VM 验收的新增回归 |
| `npx vitest run test/unit/frontend-workbench-maturity-routes.test.tsx` | 151/151，包含环境页真实 App 入口及加载/空态/失败/就绪；Happy DOM 不是原生浏览器验收 |
| `node --test --test-timeout=60000 scripts/browser-vm-environments-page.test.mjs` | 16/16，包含实际本地 Worker/D1 的丢响应同编号重试、私有隔离和删除顺序 |
| `npm run typecheck` | 通过 |
| `npm run audit:functional-checklist` | 原始30，范围内29，关闭5，开放24，D08排除 |
| `git diff --check` | 通过 |

环境专用测试首轮发现公共通知摘要请求未被夹具接住，导致3个既有断言失败；仅补充精确 `/api/notifications/summary` GET 夹具，返回 `{unread:0}`。原有环境请求数量、禁止越权及同编号重试断言没有删除或放宽。首次沙箱内本地 Worker 运行未结束，已取消，不计通过；最终沙箱外本地运行才是上述16/16证据。Vitest首次遭遇 `listen EPERM`，按授权外部重跑后151/151。

## 明确保留的门禁缺口

`npm run audit:workbench-domain` **仍失败**：基线失败于审核评论请求的 `method: write ? "PUT" : "GET"`；补齐环境操作根后首先失败于环境管理器的动态 `{...init, requester, signal, ...}` 请求。审计保持 fail-closed，没有删除根、跳过请求或放宽解析断言；未重写领域审计快照为通过。这是后续本地审计适配任务，不要求外部操作。

当前矩阵102项（34 manifest / 68历史domain；54 P0 / 47 P1 / 1 P2）。领域快照尚未成功重新生成，这个数字不代表动态请求已穷尽。R8主责数从5同步为6；历史R0快照与实施原子数不回填。

讨论页还未接入共享离页保护，且未知发送后编辑会释放原重试编号；本轮仅记录，未改变讨论授权/撤权语义。应在后续独立切片中处理，不能复用本轮证据宣称已修复。

主功能清单仍 **29范围内 / 5关闭 / 24开放**，D07、A05/R2-008与导航Task 4不整体关闭。下一步允许先处理领域审计的有限请求封装解析，再继续讨论页保护。没有push、部署、远程迁移、生产操作或备份/加密范围扩展。本轮不是全门禁通过，也不是目标全部完成。
