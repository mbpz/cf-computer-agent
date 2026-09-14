# D01-A 管理概览权威计数：本地证据

日期：2026-09-14。分支：`codex/admin-audit-recovery`，基线：M02 `6c1a1b9`。本记录仅覆盖 D01-A；不表示合并、推送、部署或生产验收。

## 交付范围

管理概览原先由 App 传入三个固定零值，现在由 `AdminDashboardRoute` 复用已有严格数字分页 loader，分别请求第一页 20 行，仅读取 `pagination.total`。不全量拉取、不自动翻页、不新增 Cloudflare 服务、迁移、依赖或统计缓存。

| 卡片 | 授权接口与计数口径 | 本地 D1 回归 |
| --- | --- | --- |
| 待审核 | `/api/admin/submissions?page=1&pageSize=20&status=review_pending`；仅等待审核的提交 | 47 条待审核 + 1 条 published，返回 20 行、total 47 |
| 资产队列 | `/api/admin/assets?page=1&pageSize=20`；assets JOIN parse_jobs，包含全部解析状态 | 61 条解析任务 + 1 条无任务资产，返回 20 行、total 61 |
| 成员 | `/api/admin/members?page=1&pageSize=20`；active 与 disabled 全部成员 | 25 位成员含停用账号，返回 20 行、total 25 |

三个总数各自读取，不承诺跨接口同一事务快照，也不受站点访问日期筛选影响。成员/权限投影变化重新挂载计数状态；入口按 capability 判定，后端仍为实际授权边界。接口只读，重复 GET 回读结果一致；前端同步 pending 锁防重复刷新/重试。

## 运行时与服务端覆盖

- 实际 App：总数与可见行数分离、加载不伪装零值、真实零值 empty、独立错误、单卡重试、双击去重、刷新清除旧数、403 清除旧数及入口、畸形分页 fail closed、离开取消/迟到结果忽略、有限权限不调用成员接口。
- 实际 controller：会话投影收缩后清除已加载的旧数及入口；旧请求终止后的响应不能覆盖新状态。
- 页面：现有 shadcn Card/Button，计数口径和所有状态中英文文案；状态通知与按钮 pending 禁用。
- Worker/D1：真实路由、身份会话、权限与 SQL COUNT，不是模拟服务端 total；普通成员访问三个管理接口均 403，管理员重复读取 total 不变。
- 全路由成熟度：admin 的 loading/empty/error/ready 改为真实支持断言；ready 标记指向响应计数，不再靠静态快捷入口。

## 验证记录

- RED：原 App 对新增七项计数/读取旅程测试全部失败，确认固定零值缺口。
- 初批定向：6 files / 206 tests 通过；覆盖 App、全路由矩阵与 submissions/assets/members Worker 回归。
- 成熟度与域审计初批：36 checks 通过；新的 D01-A 快照已生成，M02/R0 历史文件未改写。
- `npm run typecheck`、`npm run typecheck:landing` 通过；另用严格 TypeScript 单独覆盖 `admin-dashboard-route.tsx` 的 TSX 依赖树，弥补默认配置的覆盖范围。
- 附加检查发现现有 Button 不支持 `asChild`；先增加嵌套 button/link 的失败断言，再改为原生链接复用导出的 `buttonVariants`，保持语义与样式。定向类型检查通过。
- 完整测试首次运行识别两处旧静态页面测试入参未适配；调整为新状态结构后，最终 `npm test` 退出码 0：冒烟 49、国际化 13、交付合同 28、单元 216 files / 1939 tests、Worker 39 files / 577 tests 全部通过，包含补充中文/会话投影与链接语义回归。Worker 故障路径仍会输出异常诊断，测试结果无失败；不将此日志表述为无告警。
- `npm test` 中真实 Vite UI 构建通过；随后 `npm run verify:landing` 96 checks 通过，3D 懒加载及实际资产/构建来源隔离门禁通过，scene-exclusive gzip 为 143328 bytes。
- `npm run audit:workbench-domain` 确认 D01-A 快照与当前源码一致；成熟度/domain/交付合同提交前终检 64 checks 全部通过（23 + 13 + 28）。

## 未完成项与下一步

1. D01-B：站点统计日期筛选、分页与摘要口径一致性；初始错误恢复；跨页写后对账。
2. R6-001 的趋势、排行和活动摘要仍未完成，D01 与 R6-001 父项保持未勾选；32 项能力仍为 partial，83 项缺口/124 个未来原子未因此清零。
3. 未进行真实登录浏览器、移动端/键盘/主题、生产网络或发布验收；自动化 DOM 回归不代替这些证据。
4. 未访问生产数据，未运行远程迁移或部署，不升级交付总账中的 release/acceptance。
