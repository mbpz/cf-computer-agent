# A05 / R2-008 导航准入核心本地证据

2026-10-02（Asia/Shanghai），基线 e2a6815，分支 codex/functional-checklist-completion。用户已明确确认共享导航保护方案，本轮不再等待该方案批准。

## 实际实现

新增 `frontend/lib/workspace-navigation-gate.ts`：不依赖React或浏览器的同步导航准入协调器。每次请求同步占位；全部保护先读，pending/unknown的block优先于dirty确认；dirty使用版本绑定和一次性决定；多保护逐一确认，提交前重验所有版本。新目标不能替换当前目标，取消/失效不调用提交回调。

注册变化、卸载与显式invalidate使旧决定失效；重复清理不影响下一位owner。确认、取消、清理、提交均防重入；异常传播但不留下永久占位。注册的保护在invalidate后保留，便于会话边界单独决定注销生命周期。

**此模块尚未接入 workspace-location、TaskEditor 或浏览器history。因此页面跳转保护尚未生效；不是全局导航功能完成。**这是实施计划Task 1的可独立验证结果，后续Task 2–4仍需要实际实现，不以本模块或计划代替。

## RED / GREEN 与回归

- 新增24项核心测试。首次运行因沙箱回环监听/Wrangler日志权限失败，随后按权限流程重跑；模块缺失导致的导入失败不计行为RED。
- 最小接口提供后：**21失败 / 3通过**，复现缺少确认、锁优先、版本失效和重入保护；实现后 **24/24通过**。
- 核心 + 真实TasksRoute任务编辑器 + 任务路由：**3文件87/87通过**。
- 新核心文件独立严格TypeScript检查通过；项目typecheck通过。第一次独立检查要求显式--ignoreConfig，按诊断补参数后通过；不把首次命令失败当成功。
- build:ui与静态VM隔离验证通过；清单校验器9/9、canonical计数29/5/24通过。保留既有AI binding与大chunk告警；没有真实AI调用。本次没有修改双语文案，未新增i18n验收结论。

```sh
rtk proxy npx vitest run test/unit/frontend-workspace-navigation-gate.test.ts test/unit/frontend-task-editor-route.test.tsx test/unit/frontend-tasks-route.test.tsx
rtk proxy npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler frontend/lib/workspace-navigation-gate.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
rtk proxy git diff --check
```

日志：`/tmp/a05-navigation-gate-{red,behavior-red,green,regression,types,project-types,build,audit-tests,counts}.log`。独立严格类型检查仅覆盖新核心文件，项目typecheck不代表全部frontend TSX已严格检查。

## 后续必须完成

按 `docs/superpowers/plans/2026-10-02-navigation-leave-protection.md` 继续：

1. 把协调器接入每个window的共享导航，并把queryRef/invalidate/state副作用移到获准提交内；特殊会话结束路径使旧决定失效。
2. 接入Tasks与Inbox两个TaskEditor入口；精确dirty快照、共享确认、pending/unknown与撤权清理必须保留。
3. 历史遍历适配、未知条目与快速后退/前进、取消后的URL/视图一致性，以及原生浏览器验收。

**29范围内 / 5完成 / 24未完成**；A05/R2-008仍开放。确认阻塞已解除，本地可继续Task 2，无需重复请求相同方案批准。尚未push、部署、远程迁移、读取/上传SECRETS_FILE或更新独立预览；未执行原生浏览器验收。
