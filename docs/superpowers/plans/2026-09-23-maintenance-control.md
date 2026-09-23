# R05 Maintenance Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 已批准规格要求不委派；本计划在现有恢复 worktree 内顺序执行，不使用 subagent-driven-development。

**Goal:** 在独立本地 harness 证明维护控制经过专用凭证与协调器二次校验，并在重试、重启、失联和业务尾部未完成时保持窗口/epoch 安全边界。

**Architecture:** HTTP adapter 在业务准入之前处理独立运维 namespace，验证配置、请求凭证及形状后才获取固定协调器。协调器控制 RPC 再验证 capability，继续使用现有同步 SQL 状态事务；业务 acquire/complete 不接触控制凭证。

**Tech Stack:** TypeScript、现有 Workerd/Cloudflare Vitest pool、SQLite Durable Object、合成 D1/R2；无新依赖。

**Spec:** [已批准 R05 设计](../specs/2026-09-23-maintenance-control-design.md)。2026-09-23 用户确认书面规格；设计提交 `5d35ab4`。本文是待执行计划，所有执行步骤保持未勾选。

## Global Constraints

- 全程本地合成资源、不委派、不推送或合并、不读本地 secrets。
- 工作目录固定 `/Users/doug/ai/system/cf-computer-agent/.worktrees/admin-audit-recovery`；分支 `codex/admin-audit-recovery`；不在 main 实现，不合并 main 的另一套控制 API。
- 本规格采用规范的 32 字节值之无填充 base64url 编码（43 个字符、可往返规范解码）。
- 请求 Authorization 只接受单一 Bearer 值（scheme 大小写不敏感）；拒绝多值、逗号合并、异常长度、额外字段及非规范编码。不从 query/body/cookie 回退读取凭证。
- `MaintenanceClient.acquire/complete` 保持原签名，业务代码不接收控制 secret。
- 控制操作固定指向与该 harness HTTP/Cron 相同的 `local-entry` 实例；客户端不能选择 DO 名称、数据库或其他 target。
- POST 仅接受 `application/json`（允许 charset 参数），流式限额 1 KiB，不能只信 Content-Length；超限 413，无法解析/读取 400，Content-Type 不符 415。
- window 为 `[A-Za-z0-9_-]{1,128}`；epoch 为非负安全整数，不接受字符串数字、分数或隐式转换。
- 所有控制响应均为受限 JSON（错误为 `{ ok: false, code }`），带 `Cache-Control: no-store`；无重定向，不反射 Authorization/原始异常/请求正文，不自动重试。
- 不修改 `src/index.ts` 的 legacy 选择、`src/app.ts`、`src/routes/admin.ts`、生产 Wrangler/生成 Env/迁移，不将 main 的容量 API 顺便带入 R05。
- 不运行 `npm run check`、部署或读取真实凭证；测试依赖已有本地安装。需要本地监听权限时按审批机制升级，不改测试来绕过沙箱。
- 恢复主线 25 项、4 完成、21 剩余；R05 五个实施步骤不增加父项总数。产品另有 30 个开放父项，重叠不相加。

## 文件与职责

| 文件 | 操作与职责 |
| --- | --- |
| `src/maintenance/control-auth.ts` | 新建；规范凭证解码、固定长度常量时间比较、请求鉴权；无业务依赖 |
| `src/maintenance/contracts.ts` | 增加独立 `MaintenanceControlClient`，不改变业务 client |
| `src/maintenance/coordinator.ts` | 两个控制方法要求 capability；保留事务、permits 和 status |
| `src/maintenance/control-http.ts` | 新建；保留路由、拒绝顺序、限额正文、惰性 provider、受限快照/错误映射 |
| `tools/maintenance/control-fixtures.ts` | 新建；公开合成 token 与 HTTP 请求工厂，仅测试使用 |
| `tools/maintenance/control-auth.test.ts` | 新建；真实本地运行时密码原语及凭证行为 |
| `tools/maintenance/control-http.test.ts` | 新建；协议、无副作用、异常与泄露边界 |
| `tools/maintenance/control-entry.test.ts` | 新建；真实本地 HTTP/Cron 接线、关闭中控制、配置异常 |
| `tools/maintenance/control-recovery.test.ts` | 新建；真实协调器失联重试、重启、并发和跨窗口 |
| `tools/maintenance/resources.ts`、`vitest.config.ts`、`worker.ts`、`README.md` | 仅本地合成配置、接线与信任边界文档 |
| 既有维护测试（Task 2 列出） | 显式 capability 适配，保留原有安全断言 |
| `docs/operations/evidence/2026-09-23-maintenance-r05-completion.md` | 最终才新建；真实命令、结果、候选与限制。跨日则用实际日期 |
| 本规格、计划、恢复 checklist、ROADMAP、交付 ledger | 精确更新游标；只有 Task 5 通过才关闭 R05 |

以下代码块是计划中的契约和测试起点，不是运行时已实现的声明。执行时每个步骤一次动作，先读指定文件再编辑；所有 shell 命令均使用 `rtk`。

### Task 1 / R05.1: 规范凭证与常量时间验证

**Files:** Create `src/maintenance/control-auth.ts`、`tools/maintenance/control-fixtures.ts`、`tools/maintenance/control-auth.test.ts`。

**Interfaces:**
- `assertControlCapability(capability: unknown, configured: unknown): void`；配置不合格抛 `Error('CONTROL_UNAVAILABLE')`，来值不合格/不匹配抛 `Error('CONTROL_UNAUTHORIZED')`。
- `authenticateControlRequest(request: Request, configured: unknown): string`；先校验配置，再解析唯一 Bearer，返回该次请求的 capability。
- 测试夹具导出 `CONTROL_TOKEN`、`OTHER_CONTROL_TOKEN` 及 `controlRequest(action: 'status' | 'begin-drain' | 'resume', payload?: { window: string; epoch: number }, token?: string): Request`。

- [ ] **1. 写本地运行时探针和行为测试。** 先为两个公开函数建立会抛 `CONTROL_UNAVAILABLE` 的最小可导入壳；模块缺失/收集失败不能充当行为 RED。`worker-configuration.d.ts` 当前声明 `crypto.subtle.timingSafeEqual`；以下运行时测试才是可用性门槛，失败时停下核对，不降级为字符串比较。

```ts
import { expect, it } from 'vitest';
import { assertControlCapability, authenticateControlRequest } from '../../src/maintenance/control-auth';
import { CONTROL_TOKEN, OTHER_CONTROL_TOKEN } from './control-fixtures';

it('supports a fixed-length native comparison in this runtime', () => {
  const a = new Uint8Array(32), b = new Uint8Array(32); b[31] = 1;
  expect(crypto.subtle.timingSafeEqual(a, a)).toBe(true);
  expect(crypto.subtle.timingSafeEqual(a, b)).toBe(false);
});
it('accepts only a canonical matching dedicated capability', () => {
  expect(() => assertControlCapability(CONTROL_TOKEN, CONTROL_TOKEN)).not.toThrow();
  expect(() => assertControlCapability(OTHER_CONTROL_TOKEN, CONTROL_TOKEN)).toThrow('CONTROL_UNAUTHORIZED');
  expect(() => assertControlCapability(CONTROL_TOKEN, undefined)).toThrow('CONTROL_UNAVAILABLE');
  const request = new Request('https://local.test/__ops/maintenance/status', {
    headers: { Authorization: `bEaReR ${CONTROL_TOKEN}` },
  });
  expect(authenticateControlRequest(request, CONTROL_TOKEN)).toBe(CONTROL_TOKEN);
});
```

- [ ] **2. 运行 RED。** `rtk proxy npm run test:ops:maintenance -- tools/maintenance/control-auth.test.ts`；记录探针通过、合法凭证被壳拒绝的断言失败。若探针失败，不执行后续实现。
- [ ] **3. 实现无副作用鉴权与合成夹具。** 解码失败返回 null；用规范重编码判定唯一编码，不能仅检查字符串长度。下面是比较核心；公开入口每次都调用它，不缓存授权结论。

```ts
function decodeCanonical32(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '=');
    const canonical = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (binary.length !== 32 || canonical !== value) return null;
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  } catch { return null; }
}
export function assertControlCapability(capability: unknown, configured: unknown): void {
  const expected = decodeCanonical32(configured);
  if (!expected) throw new Error('CONTROL_UNAVAILABLE');
  const actual = decodeCanonical32(capability);
  if (!actual || !crypto.subtle.timingSafeEqual(actual, expected)) throw new Error('CONTROL_UNAUTHORIZED');
}
export function authenticateControlRequest(request: Request, configured: unknown): string {
  if (!decodeCanonical32(configured)) throw new Error('CONTROL_UNAVAILABLE');
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.get('Authorization') ?? '');
  assertControlCapability(match?.[1], configured);
  return match![1];
}
```

夹具值必须注明公开、不可用于生产。`CONTROL_TOKEN = 'A'.repeat(43)`；另一值从 32 个 `1` 字节经相同 base64url 规则生成。`controlRequest` 使用 `https://local.test/__ops/maintenance/${action}`；status 为 GET，其余 POST 且设置 JSON content-type；使用显式 token（默认合成 token），绝不读环境秘密。

- [ ] **4. 补边界测试并运行 GREEN。** 参数表覆盖 undefined/null/非字符串、42/44 字符、`=`、`+`、`/`、非法尾部编码、错值；Header 覆盖空值、Basic、重复 header 的逗号合并、双空格、尾部字段、仅 cookie。合法配置配坏请求为 UNAUTHORIZED；坏配置即使请求合法仍为 UNAVAILABLE。重复调用不能复用上次授权。命令同 RED，另运行 `rtk proxy npm exec tsc -- --project tools/maintenance/tsconfig.json`。
- [ ] **5. 审阅并提交这一单元。** `rtk proxy git diff --check`；仅暂存上述三个文件，提交 `feat(maintenance): add dedicated control capability validation`。这不是 R05 父项完成。

### Task 2 / R05.2: 协调器二次鉴权与旧调用适配

**Files:** Modify `src/maintenance/contracts.ts`、`src/maintenance/coordinator.ts`、`tools/maintenance/resources.ts`、`tools/maintenance/vitest.config.ts`、`tools/maintenance/README.md`；测试包括 `coordinator.test.ts`、`lifecycle.test.ts`、`entry.test.ts`、`entry-completion.test.ts`、`entry-d1.test.ts`、`background.test.ts`、`d1.test.ts`、`stream.test.ts`、`timeout.test.ts`、`storage.test.ts`、`cross-storage.test.ts`（均位于 `tools/maintenance/`）。

**Interfaces:** 消费 Task 1 的 `assertControlCapability` 和公开夹具；新增独立接口：

```ts
export interface MaintenanceControlClient {
  status(): Promise<Snapshot>;
  beginDrain(window: string, epoch: number, capability: string): Promise<Snapshot>;
  resume(window: string, epoch: number, capability: string): Promise<Snapshot>;
}
```

协调器本体仍同步返回 `Snapshot`，DO stub 作为异步 client。`LocalResources` 新增 `MAINTENANCE_CONTROL_TOKEN?: string`，可测试缺失配置；不扩展应用 Env。

- [ ] **1. 写二次鉴权 RED。** 先在 contracts.ts 添加上面的纯类型接口供测试引用（不改变运行时）；在 coordinator 测试中，对真实新 DO 直接调用错误/缺失 capability 的 begin/resume，比较拒绝前后 snapshot；用窄测试类型断言构造非法旧签名调用，不能将正式参数改为 optional。给合法状态机断言显式传 token 后继续保留原测试。

```ts
it('rejects a control capability before validating or changing state', async () => {
  const g = env.MAINTENANCE.getByName(crypto.randomUUID());
  const before = await g.status();
  // RED 阶段旧签名可用窄扩展类型传入第三参；GREEN 删除该过渡断言。
  const controlled = g as unknown as import('../../src/maintenance/contracts').MaintenanceControlClient;
  await expect((async () => controlled.beginDrain('bad window', -1, OTHER_CONTROL_TOKEN))())
    .rejects.toThrow('CONTROL_UNAUTHORIZED');
  expect(await g.status()).toEqual(before);
});
```

- [ ] **2. 运行 RED。** `rtk proxy npm run test:ops:maintenance -- tools/maintenance/coordinator.test.ts`；证明旧方法忽略 capability 或先给出参数错误，不是导入错误。
- [ ] **3. 接入双层校验所需的协调器边界与合成绑定。** 在两个方法的参数校验和事务前加下面核心，构造函数只保存本地配置，不新增异步事务或 HTTP 锁。env 为 unknown 时安全提取；坏配置不在构造函数抛错，避免破坏业务 acquire/complete。保存字段使用私有 `#controlToken`，不新增可 RPC 调用的 secret getter。

```ts
// class field and constructor assignment
#controlToken: unknown;
// after super(ctx, env):
this.#controlToken = typeof env === 'object' && env !== null
  ? (env as { MAINTENANCE_CONTROL_TOKEN?: unknown }).MAINTENANCE_CONTROL_TOKEN : undefined;
// beginDrain(window: string, epoch: number, capability: string): Snapshot
// resume(window: string, epoch: number, capability: string): Snapshot
assertControlCapability(capability, this.#controlToken);
```

`vitest.config.ts` 导入公开 `CONTROL_TOKEN`，在现有 miniflare 配置添加 `bindings: { MAINTENANCE_CONTROL_TOKEN: CONTROL_TOKEN }`。不读取 `.env`；原有 remoteBindings:false、outbound 拒绝和合成存储不变。上列 11 个测试文件导入夹具并仅为维护 RPC 增补 capability；`test/unit` 中其他业务类的 `resume` 不动。

- [ ] **4. 验证 GREEN 和配置错误。** 跑完整 `rtk proxy npm run test:ops:maintenance` 及本地 harness 类型检查。测试重复成功控制仍鉴权、错 capability 不进入任何控制事务、active work 不可强制释放；缺配置时控制失败但业务准入契约不变。新配置实例与旧凭证不匹配的测试用 `runInDurableObject` 中构造新的 `MaintenanceCoordinator(state, syntheticEnv)`，与原实例串行调用，检查持久 snapshot 不变；注明这是配置实例测试，不是生产热轮换证明。不得通过删除 R02–R04 断言获得通过。
- [ ] **5. 更新 README 后提交。** 修正仅 D1/无真实入口的旧介绍，列出现有 D1/R2/DO 与本地 guarded 入口；此刻仍无 HTTP 控制路由，注明 RPC 已授权、HTTP 在 Task 4 接入。`rtk proxy git diff --check`，仅暂存本步骤文件，提交 `feat(maintenance): require capability for coordinator controls`。

### Task 3 / R05.3: 独立 HTTP 协议与早期拒绝

**Files:** Create `src/maintenance/control-http.ts`、`tools/maintenance/control-http.test.ts`。

**Interfaces:** 消费 Task 1 请求鉴权、Task 2 `MaintenanceControlClient`；导出：

```ts
export interface ControlHttpOptions {
  token: unknown;
  coordinator: () => MaintenanceControlClient;
}
export function handleMaintenanceControl(request: Request, options: ControlHttpOptions): Promise<Response | null>;
```

`null` 仅表示非控制 namespace，应进入原业务流程；拒绝控制请求永不返回 null。所有 validator/helper 留在本模块，不向业务层扩散。

- [ ] **1. 写早期拒绝与成功路径 RED。** 建立最小 `return null` 可导入壳，以下测试要求真实 Response、零 provider 调用；body 使用 spy 检查 `getReader` 未调用，避免误把流构造时自动 pull 算作 adapter 读取。

```ts
import { expect, it, vi } from 'vitest';
import { handleMaintenanceControl } from '../../src/maintenance/control-http';
import { CONTROL_TOKEN, controlRequest } from './control-fixtures';
it('rejects a cookie without touching the coordinator or body', async () => {
  const coordinator = vi.fn(() => { throw new Error('MUST_NOT_CALL'); });
  const request = controlRequest('begin-drain', { window: 'one', epoch: 0 });
  request.headers.delete('Authorization'); request.headers.set('Cookie', 'session=synthetic');
  const reader = vi.spyOn(request.body!, 'getReader');
  const response = await handleMaintenanceControl(request, { token: CONTROL_TOKEN, coordinator });
  expect(response?.status).toBe(401);
  expect(coordinator).not.toHaveBeenCalled(); expect(reader).not.toHaveBeenCalled();
});
```

- [ ] **2. 运行 RED。** `rtk proxy npm run test:ops:maintenance -- tools/maintenance/control-http.test.ts`；期望 `undefined` 与 401 的断言差异，随后开始实现。
- [ ] **3. 实现固定路径和受限响应。** 只匹配根 `/__ops/maintenance` 或其 `/` 子路径；相邻 `/__ops/maintenance-extra` 返回 null。路由表和统一响应核心如下，不动态映射任意 RPC 名称。

```ts
const ROOT = '/__ops/maintenance';
const routes = new Map([
  [`${ROOT}/status`, 'GET'], [`${ROOT}/begin-drain`, 'POST'], [`${ROOT}/resume`, 'POST'],
]);
function json(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}
// handleMaintenanceControl 的前缀判断
const url = new URL(request.url);
if (url.pathname !== ROOT && !url.pathname.startsWith(`${ROOT}/`)) return null;
const method = routes.get(url.pathname);
if (!method) return json(404, { ok: false, code: 'CONTROL_NOT_FOUND' });
// 接下来依次：authenticateControlRequest -> method -> Origin -> query -> body -> provider -> RPC。
```

- [ ] **4. 实现限额正文解析与参数判定。** `readControlBody(request): Promise<{window:string;epoch:number}>` 为模块私有函数；content-type 只接受 application/json 及 charset 参数，其他媒体类型 415。读流以字节累计；读取失败返回固定 400，超过 1024 字节立即 413，触发 reader.cancel 并捕获拒绝但不等待可能无限悬挂的取消；最多保留 1024 字节，不回显异常。解码采用 `TextDecoder('utf-8', { fatal: true })`，JSON 解析失败 400。

```ts
// 已取得 reader 后的限额核心；读取失败和 finally 释放锁在同一个 helper 中处理。
const chunks: Uint8Array[] = []; let bytes = 0;
for (;;) {
  const item = await reader.read();
  if (item.done) break;
  bytes += item.value.byteLength;
  if (bytes > 1024) {
    void reader.cancel().catch(() => undefined);
    throw new Error('CONTROL_TOO_LARGE');
  }
  chunks.push(item.value);
}
// 解析后的 value 必须为非 null 对象且非数组，恰有 window/epoch 两个自有字段。
// 分别用规范正则及 Number.isSafeInteger 判定；不作 trim 或 Number(...) 转换。
```

测试必须覆盖无 Content-Length 的多段超限、伪小长度、正好 1024 字节合法 JSON 加空白、1025 字节、空正文、非法 UTF-8、流中途 reject。GET 有正文或任意 query 均 400；因标准 Request 构造器拒绝 GET body，正文反例使用最窄结构替身而不是绕过类型检查修改生产签名。

- [ ] **5. 实现调用与快照/错误过滤。** body 验证后才执行 `options.coordinator()`，status 调 `status()`；两个 mutation 传入请求中已验证 capability，而非另行从配置补值。快照验证 phase 三选一、epoch/active 非负安全整数、window 为 null 或合法 ID；OPEN 对应 null，DRAINING 对应非 null 且 active>0，DRAINED 对应非 null 且 active=0。成功响应显式重建四字段，额外属性不能泄露。

```ts
const allowedErrors: Record<string, number> = {
  CONTROL_UNAUTHORIZED: 401, CONTROL_UNAVAILABLE: 503,
  INVALID_ID: 400, INVALID_EPOCH: 400, CONTROL_BAD_REQUEST: 400,
  CONTROL_TOO_LARGE: 413, CONTROL_MEDIA_TYPE: 415,
  STALE_CONTROL: 409, WINDOW_CONFLICT: 409, ACTIVE_WORK: 409,
};
// 只按已知 Error.message 完整匹配；未知异常统一 CONTROL_UNCONFIRMED / 503。
// 方法错误：405 + Allow；Origin 存在：403；不提供 CORS 或 Retry-After 自动控制建议。
```

RPC 拒绝的真实消息包装在 Task 4 验证；不使用任意 substring 匹配，不返回原始 exception。provider 缺失方法、抛错和畸形快照均 503；任何 503 都不能启动重试或补偿。

- [ ] **6. 跑协议矩阵 GREEN 并提交。** 同 Task 3 RED 命令加 harness 类型检查。矩阵逐项覆盖 404/401/503/405+Allow/403/400/413/415/409/200，组合坏配置+坏 token、坏 token+坏方法证明顺序；OPTIONS 不获 CORS 许可。捕获日志与响应不得含 token/cookie/body/原始异常，授权 provider 恰调用一次、所有前置拒绝为零。暂存两个文件，提交 `feat(maintenance): add isolated control HTTP adapter`。

### Task 4 / R05.4: 接入真实本地 HTTP/Cron 边界

**Files:** Modify `tools/maintenance/worker.ts`、`tools/maintenance/coordinator.test.ts`、`tools/maintenance/README.md`；Create `tools/maintenance/control-entry.test.ts`。

**Interfaces:** 消费 `handleMaintenanceControl`；沿用固定 `resources.MAINTENANCE.getByName('local-entry')`，生产入口和 createWorkerEntry 不改。

- [ ] **1. 写真实 HTTP RED。** 使用现有 SELF/localWorker，而非仅测试 adapter。每个测试前 reset；消费所有 Response body，执行上下文用既有 waitOnExecutionContext 清理。

```ts
it('keeps authenticated controls reachable while business admission is closed', async () => {
  const closed = await SELF.fetch(controlRequest('begin-drain', { window: 'entry-control', epoch: 0 }));
  expect(closed.status).toBe(200); await closed.json();
  const business = await SELF.fetch('https://local.test/boards');
  expect(business.status).toBe(503); await business.text();
  const state = await SELF.fetch(controlRequest('status'));
  expect(await state.json()).toMatchObject({ ok: true, snapshot: { phase: 'DRAINED', active: 0 } });
  const resumed = await SELF.fetch(controlRequest('resume', { window: 'entry-control', epoch: 0 }));
  expect(await resumed.json()).toMatchObject({ ok: true, snapshot: { phase: 'OPEN', epoch: 1 } });
});
```

- [ ] **2. 运行 RED。** `rtk proxy npm run test:ops:maintenance -- tools/maintenance/control-entry.test.ts`；证明保留控制路径尚未接线，而不是 migrations 或 fixture 失败。
- [ ] **3. 接入外层 adapter。** 只将本地 fetch 改为 async 并添加下面分流，scheduled 保留原逻辑；非控制请求不因缺控制 token 被提前拒绝。

```ts
async fetch(request: Request<unknown, IncomingRequestCfProperties<unknown>>, resources: LocalResources, ctx: ExecutionContext) {
  const controlled = await handleMaintenanceControl(request, {
    token: resources.MAINTENANCE_CONTROL_TOKEN,
    coordinator: () => resources.MAINTENANCE.getByName('local-entry'),
  });
  if (controlled !== null) return controlled;
  return entry(resources).fetch(request, localEnvironment(resources), ctx);
}
```

- [ ] **4. 验证接线 GREEN。** 对 localWorker 注入会抛错并计数的业务资源 getter（SYNTHETIC_DB、SYNTHETIC_SESSION_DB、SYNTHETIC_ORIGINALS、KNOWLEDGE、AGENT_SESSIONS），控制请求必须全零。未授权时 MAINTENANCE getter 也不能被读取；合法控制可访问它。关闭后调用真实 scheduled，业务 getters 零读取。缺控制配置不触发业务模式切换；HTTP token 与真实 DO 配置错配拒绝且 snapshot 不变。测试真实 ACTIVE_WORK/STALE_CONTROL RPC 返回 409，未知运输错误返回 503。
- [ ] **5. 更新陈旧断言与 README，提交。** 原 `/maintenance/resume` 404 断言保留，改名为“legacy arbitrary control path stays unavailable”，另断言真正保留路径要求授权；不把任意路径业务拒绝测试删掉。README 写明三路由、capability、1KiB、no-store、失联核实与重试、本地非生产边界。运行完整维护测试、harness 类型检查、`git diff --check`，仅暂存本步骤文件，提交 `feat(maintenance): wire local authenticated control entry`。

### Task 5 / R05.5: 失联、重启、尾部矩阵与父项收口

**Files:** Create `tools/maintenance/control-recovery.test.ts`、完成证据文件；Modify `tools/maintenance/coordinator.test.ts`、`tools/maintenance/cross-storage.test.ts`、本计划、规格、恢复 checklist、ROADMAP、delivery ledger。允许修复 Task 1–4 对应模块的已证实缺陷，不扩大生产或容量范围。

**Interfaces:** 消费前四步公开接口；真实 SQL DO 为事实来源。测试 provider 可包装真实 stub 的回包，但不能用纯内存假状态代替失联/重启证据。

- [ ] **1. 写提交成功但回复丢失的控制测试。** 分别覆盖 begin 和 resume；下面 begin 示例在已实现后可能直接通过，此时用临时破坏自动重试/错误映射取得有针对性的 mutation RED，不宣称原本失败。包装 client 仅位于测试，计数和快照均查询真实 DO。

```ts
it('does not retry a committed begin whose reply was lost', async () => {
  const g = env.MAINTENANCE.getByName(crypto.randomUUID()); let calls = 0;
  const wrapped: MaintenanceControlClient = {
    status: async () => await g.status(),
    beginDrain: async (w, e, c) => { calls++; await g.beginDrain(w, e, c); throw new Error('synthetic lost reply'); },
    resume: async (w, e, c) => await g.resume(w, e, c),
  };
  const response = await handleMaintenanceControl(controlRequest('begin-drain', { window: 'lost', epoch: 0 }), {
    token: CONTROL_TOKEN, coordinator: () => wrapped,
  });
  expect(response?.status).toBe(503); expect(calls).toBe(1);
  expect(await g.status()).toMatchObject({ phase: 'DRAINED', window: 'lost', epoch: 0 });
  const retry = await handleMaintenanceControl(controlRequest('begin-drain', { window: 'lost', epoch: 0 }), {
    token: CONTROL_TOKEN, coordinator: () => g,
  });
  expect(retry?.status).toBe(200);
  expect(await g.status()).toMatchObject({ phase: 'DRAINED', epoch: 0 });
});
```

- [ ] **2. 补重启、并发与窗口矩阵。** 使用既有 `abortAllDurableObjects` 后以同名重新获取 stub；不使用清库的 reset 模拟重启。覆盖已关闭/已恢复的重启后精确重试、相同 window 文本在下一 epoch 重用后旧 resume 被拒、两个并发 resume 仅递增一次、相反命令允许的串行结果；不依赖网络返回顺序。用 runInDurableObject 将 epoch 设到 MAX_SAFE_INTEGER，resume 拒绝且状态不变；所有异常控制断言比较前后持久状态。
- [ ] **3. 补真实尾部 HTTP 恢复门槛。** 在现有 cross-storage 中复用门闩和真实 D1/R2/Knowledge RPC 尾部登记方式；将对应测试的维护 client 固定到 local-entry，用授权 HTTP begin/resume 而非绕过 adapter。D1/R2/DO 各一例：未完成时 resume 409；正常完成并等待 completion 后可恢复；不确定分支即使 promise 已结算仍 active、resume 409。保留独立旧测试，不删除故障原因或仅拿一个手动 acquire 假装已覆盖真实尾部。
- [ ] **4. 执行负向检测并恢复。** 一次只临时旁路一个 capability 校验（HTTP 与 DO 分别验证），再临时旁路 stale epoch 检查；每次指定对应测试应失败，记录测试名/断言/退出码。立即用最小反向补丁还原并重跑 GREEN；不使用 reset --hard、不保存绕过到提交。若负向用例未检出，先修测试再继续。
- [ ] **5. 完整候选验证。** 顺序运行以下命令，逐条保存退出码和实际计数；任何失败/中断不得关闭 R05，也不得复用 R04 的 247 项旧结果。worker 测试的 pretest build:ui 只生成本地 UI 产物，不执行 build:secrets 或发布。

```sh
rtk proxy npm run test:ops:maintenance
rtk proxy npm run test:smoke
rtk proxy npm run test:unit
rtk proxy npm run test:worker
rtk proxy npm exec tsc -- --noEmit
rtk proxy npm exec tsc -- --project tools/maintenance/tsconfig.json
rtk proxy npm run verify:delivery-status
rtk proxy git diff --check
rtk proxy git diff 5d35ab4 -- src/index.ts src/app.ts src/routes/admin.ts wrangler.jsonc worker-configuration.d.ts migrations package.json package-lock.json
```

最后一条必须无差异；本次已核对实际配置文件为 `wrangler.jsonc`、锁文件为 `package-lock.json`。任何新生成或用户文件必须归属清楚，不做 `git add .`。

- [ ] **6. 留证、自审并关闭 R05。** 证据按“基线/提交候选及工作树差异摘要/命令与结果/负向检测及恢复/规格十组矩阵映射/仍未覆盖的生产与 R06–R09”写实。先提交运行时和测试变更 `test(maintenance): verify authenticated control recovery boundaries`，再把该精确提交写入完成证据；文档调整后重跑 delivery 合同与 diff 检查。全部通过才把 R05 父项改 [x]，恢复统计 5/25、20 剩余，并将游标指向 R06 尚未执行。提交 `docs(maintenance): close local R05 with validation evidence`；不自行启动 R06 的新设计或生产操作。

## 覆盖自审与交接

| 规格要求 | 对应步骤 |
| --- | --- |
| §1 独立入口、仅本地及不触业务 | R05.3、R05.4，Global Constraints |
| §2 格式、每次鉴权、二次校验、配置缺失/轮换边界 | R05.1、R05.2、R05.4 |
| §3 路由、验证顺序、1KiB、无 CORS、状态码与快照过滤 | R05.3、R05.4 |
| §4 幂等、窗口/epoch、active、并发/重启/上界 | R05.2、R05.5 |
| §5 失联不补偿、授权 status 核实、零业务 IO | R05.3–R05.5 |
| §6 文件/生产/main 边界 | 文件表、Global Constraints、R05.5 候选差异门禁 |
| §7 十组证据与 §8 完成门槛 | 各步测试、R05.5 完整回归及证据闭合 |

计划自审要求：所有引用接口均在前置步骤定义；状态机只用协调器持久状态；无真实凭证、未定义占位步骤或并行代理；测试结果只在执行后填入证据。文档审阅/提交不能勾选本计划任何执行步骤。

**当前状态：** 书面规格已批准，实施计划已编排，R05.1–R05.5 均未执行；恢复主线仍 **4/25 完成、21 项未完成**。遵循已批准“不委派”，交接方式固定为本会话使用 executing-plans 顺序实施，下一动作是 R05.1 运行时探针与失败测试。
