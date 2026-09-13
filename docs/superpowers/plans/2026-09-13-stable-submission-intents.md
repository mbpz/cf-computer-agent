# Stable Submission Intents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in this session. Do not dispatch subagents without user authorization. Steps use checkbox syntax for tracking.

**Goal:** 同一次知识提交在失败、离页和刷新后复用相同幂等键与请求内容，不把未知结果当成未提交。

**Architecture:** 将成员作用域提交意图与可编辑草稿分开保存。首次 POST 前持久化不可变快照；页面恢复后只展示手动重试入口。复用现有 D1 成员作用域幂等重放，不引入新接口或数据库。

**Tech Stack:** React、TypeScript、现有 shadcn Alert/Button、localStorage、Vitest/happy-dom、现有 Worker 测试。

**Spec:** 用户于 2026-09-13 确认当前对话中的 B01 四条方案：提交前保存成员键及快照；失败/刷新手动复用；未知结果保留原提交，新编辑不覆盖，先确认旧结果再提交新内容；存储不可用明确提示。对应 `docs/product/2026-09-12-personal-workbench-completion-audit.md` B01。

## Global Constraints

- 成员身份仅来自 session.member.id；不改变 visibility、目标空间、附件或 B02 草稿结构。
- 请求快照仅包含 mode/title/content；固定目标仍由现有 createSubmission 生成。幂等记录只允许 version/key/draft，不保存凭证或任意属性。
- 标题最多 512 UTF-8 bytes、正文最多 131072 UTF-8 bytes，幂等键匹配 `[A-Za-z0-9_-]{16,128}`。
- 失败、AbortSignal、非法响应不证明服务端未写入；不清意图、不换键、不自动重发。
- 已确认成功后只清匹配的意图；新编辑保留。已有不同/损坏的持久化意图不得静默覆盖。
- 存储不可用时允许当前页面内存重试，但明确刷新恢复不受保证；localStorage 不是加密。
- 保留成员键控生命周期、同步请求锁和迟到响应 guard。不会将本批描述为跨标签原子事务或设备级保密。
- 不新增依赖或 Cloudflare 资源，不推送、部署、迁移；真实账号浏览器验收单独记录。

## Task 1 — 可恢复意图与显式请求身份

**Files:** 新建 `frontend/lib/submission-intent.ts`、`test/unit/submission-intent.test.ts`；修改 `frontend/lib/submission-data.ts`、`frontend/components/submissions/submission-form-model.ts`、`test/unit/frontend-submission-data.test.ts`、`test/unit/frontend-submit-pages.test.tsx`。

**Interfaces:**
```ts
type SubmissionIntent = { version: 1; key: string; draft: SubmissionDraft };
type IntentLoad = { kind: 'empty' | 'unavailable' | 'invalid' }
  | { kind: 'ready'; intent: SubmissionIntent };
createSubmissionIntent(draft: SubmissionDraft): SubmissionIntent;
loadSubmissionIntent(memberId: string, storage?: StoragePort): IntentLoad;
saveSubmissionIntent(memberId: string, intent: SubmissionIntent, storage?: StoragePort): boolean;
clearSubmissionIntent(memberId: string, key: string, storage?: StoragePort): boolean;
createSubmission(draft: SubmissionDraft, key: string, requester?: Fetcher, signal?: AbortSignal);
```

- [x] 1. 添加真实路由红灯：失败后重新挂载、点击提交，断言两次 POST 的 key/body 相等且恢复时不自动发送。
```ts
expect(attempts).toHaveLength(1); // remount, before explicit retry
await submit();
expect(attempts[1]).toEqual(attempts[0]);
```
- [x] 2. 运行 `rtk proxy npx --no-install vitest run test/unit/frontend-submit-owner-route.test.tsx`，记录不同随机 key 的行为失败。
- [x] 3. 添加存储测试，使用 Map 实现 StoragePort；A 保存、B 不可读，坏 JSON 保留并返回 invalid，清除错误 key 不删除旧记录，set/get/remove 抛错返回不可用，额外字段不持久化。
```ts
expect(saveSubmissionIntent('a', intent, store)).toBe(true);
expect(loadSubmissionIntent('b', store)).toEqual({ kind: 'empty' });
expect(clearSubmissionIntent('a', 'another-key-00001', store)).toBe(false);
expect(loadSubmissionIntent('a', store)).toEqual({ kind: 'ready', intent });
```
- [x] 4. 实现独立存储模块：键 `personal-workbench:submission-intent:v1:${encodeURIComponent(memberId)}`；读取检查版本、key、草稿边界；仅复制白名单字段；保存前检查已有记录，只接受 empty 或完全相同记录；清理前比较 key。异常返回 false/unavailable，不删除未知数据。
- [x] 5. createSubmission 改为显式 key 参数，网络前校验。createIdempotencyKey 使用安全随机；无 crypto 时抛错而非生成全零 key。数据测试调用均传固定合法 key。
```ts
headers: { 'content-type': 'application/json', 'idempotency-key': key }
```
- [x] 6. 跑存储、提交数据和表单模型定向测试；用固定 key 两次调用确认实际 RequestInit 内容一致；空/非法 key、无随机源必须在网络前失败。

## Task 2 — 手动恢复交互与成员生命周期

**Files:** `frontend/app.tsx`、`frontend/pages/submit-page.tsx`、`frontend/lib/i18n.ts`、`test/unit/frontend-submit-owner-route.test.tsx`、`test/unit/frontend-submit-pages.test.tsx`。

**Interfaces:** SubmitPage 增加可选 `recovery` 状态（待确认意图标题、存储降级/损坏提示、onRetry）；保留现有草稿和 state/onSubmit/onDraftChange。

- [x] 1. 加路由测试：未知结果时修改 mode，重试 body 保持原 mode；旧成功后保留新 mode，新提交使用新 key；409 保留旧身份；成员切换不恢复其他成员意图；存储失败提示且重试仍同 key。
- [x] 2. 页面初始通过 loadSubmissionIntent 读取，useRef 保存意图/请求同步权威。首次提交先 validate，再 create/save，最后 POST；pending 时不能进入第二次提交。
```ts
const selected = intentRef.current ?? createSubmissionIntent(nextDraft);
intentRef.current = selected;
const result = await createSubmission(selected.draft, selected.key, fetch, controller.signal);
```
- [x] 3. 碰到存储中已有意图时先恢复，不发送编辑后的新内容；损坏记录显示阻断提示和我的提交入口。pending 意图展示标题及“重试上次提交”按钮，禁用新内容提交但允许继续编辑；重试按钮显式调用原快照。
- [x] 4. 成功只清当前 intent key；如果当前草稿仍等于发送时草稿则清空，否则保留新编辑。失败/取消/离页保留意图，成员切换后迟到结果不写状态或存储。
- [x] 5. 增加中英文文案：未知结果、手动重试、当前编辑已保留、存储不可用、损坏记录与冲突检查；不引入另一个弹出层，不显示原始异常或正文。
- [x] 6. 跑路由、页面、i18n 和 maturity 定向回归；记录真实 DOM/Response 测试，不把 fixture 说成真实浏览器验收。

## Task 3 — 服务端重放证据与交付状态

**Files:** `test/worker/submissions.test.ts`、B01 evidence 文档、总审计、Roadmap、路由矩阵。

- [x] 1. 核对现有 worker 用例：同成员相同 key 返回相同 submission/source/version，异内容冲突，并发一次写入。补充同 key 跨成员独立创建测试，不以 mock 仓库证明 D1。
```ts
expect(first.submission.submitterId).toBe('member-a');
expect(second.submission.submitterId).toBe('member-b');
expect(first.submission.id).not.toBe(second.submission.id);
```
- [x] 2. 执行 `rtk proxy npx --no-install vitest run test/worker/submissions.test.ts`；只在实际暴露后端缺陷时修改服务端，不改迁移。
- [x] 3. 执行 `rtk proxy npm test`（包含 UI build）、`rtk proxy npm run typecheck`、`rtk proxy git diff --check`；保留既有 tsconfig 前端范围限制说明。
- [x] 4. 总审计仅标 B01 本地实现/自动化验证，真实浏览器刷新/双账号验收及 release 仍开放；记录红绿结果、文件与命令。主分支不自动合并或推送。

## 当前基线

分支 `codex/stable-submission-intents`，基于 main `3431145`；四个关联测试文件 43 条通过。没有复制 `.dev.vars`，使用已有安装依赖。

## 交付结果

本地实施与自动化子项完成，证据见 [B01 记录](../../product/2026-09-13-stable-submission-intents-evidence.md)。最终 `npm test` 通过：unit 1858、Worker 576，另包含 smoke/i18n/delivery-status 与 UI build。定向联合 88 tests、成熟度路由 101 tests 通过；typecheck、typecheck:landing、diff 检查通过。真实浏览器/移动端/发布验收仍列在总审计未完成子项中；本分支不自动合并或推送。
