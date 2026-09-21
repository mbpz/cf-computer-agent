# R08 — 维护候选完整回归与评审证据

日期：2026-09-20（Asia/Shanghai）。评审候选为当前本地 `HEAD 6e1934a`；工作树干净，未 push、未部署、未执行生产 smoke/迁移/备份。

## 候选范围

- `90d3034`：维护控制面显式能力授权与重放防护。
- `d7cf8cf`：容量快照、告警阈值、孤儿许可人工退出规则。
- `6e1934a`：真实 Worker 接线合成故障矩阵证据和 checklist 收口。
- 前序 R02–R04 代码/证据提交保持不变；没有读取或上传 `SECRETS_FILE`，没有修改生产 Wrangler binding/Env。

## 完整本地验证

| 检查 | 结果 |
| --- | --- |
| `npm run test:ops:maintenance -- --reporter=dot` | 6 个文件，63/63 通过 |
| `npm run test:ops:d1-backup` | 21/21 通过（合成归档、分页恢复、FTS、类型/约束/来源漂移负向） |
| `npm run typecheck` | 通过 |
| `npx tsc --noEmit --project tools/maintenance/tsconfig.json` | 通过 |
| `npm test` | exit 0；smoke/i18n/delivery、unit、worker 全链路通过 |
| `npm run build` | exit 0；UI、landing 97/97、secret scan、legacy audit、Wrangler dry-run 通过 |
| `npm run verify:delivery-status` | 30/30 通过 |
| `git diff --check` | 通过 |

构建期间 Wrangler 给出 AI binding 远程资源提示及本地日志文件权限警告；dry-run 仍成功退出，未发送部署请求。构建产生的 `frontend/dist` 未进入 Git 工作树。

## 评审结论与边界

本地维护候选满足 R02–R08 的合成验证和文档证据要求；维护入口在生产仍保持 legacy，不能据此声明全写者已停写、生产 `FROZEN`、真实备份或生产发布成功。下一项 R09 需要单独核实实际发布链和全部生产写者，任何远程操作仍需明确批准。
