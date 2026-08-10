# Phase 0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the deployed MVP into a typed, modular, security-hardened Cloudflare Worker with Worker-runtime integration tests and repeatable remote smoke verification, without changing its public knowledge API behavior.

**Architecture:** Keep the existing single `KnowledgeBase` Durable Object and Computer VFS during Phase 0, but isolate it behind `WorkspaceRepository`. Route composition, authentication, HTTP errors, knowledge operations, retrieval, and Workers AI answer generation become focused modules. Static browser assets move out of the Worker source and are served through a Wrangler assets binding; Phase 1 can then replace the compatibility token with Access identity without rewriting application services.

**Tech Stack:** TypeScript 7, Cloudflare Workers, SQLite-backed Durable Objects, `@cloudflare/computer` 0.1.1, Workers AI binding, Wrangler 4, Vitest with `@cloudflare/vitest-pool-workers`, plain HTML/CSS/JavaScript assets.

## Global Constraints

- Preserve `GET /api/health`, `GET /api/notes`, `POST /api/notes`, `GET /api/search`, and `POST /api/chat` request/response compatibility.
- Preserve the deployed Durable Object class name `KnowledgeBase` and migration tag `v1`; never edit the existing migration entry.
- Keep the current single `personal` workspace until Phase 1 introduces D1 and Space sharding.
- Never print, commit, or pass `APP_TOKEN` as a CLI argument; remote verification reads it from `MEMORY_GARDEN_TOKEN`.
- Use constant-time comparison for `APP_TOKEN` and deny API access when a production secret is missing; local no-token access requires explicit `ALLOW_INSECURE_LOCAL=true`.
- Every response carries a request ID; JSON errors expose stable codes and no stack trace.
- Do not claim Cloudflare production maturity from Miniflare or local fixtures.
- Use `rtk` for shell commands, per repository instructions.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | Export Durable Object and compose the Worker handler only |
| `src/app.ts` | Route static assets and `/api/*` requests |
| `src/auth.ts` | Parse Bearer credentials and perform constant-time verification |
| `src/http.ts` | Request context, JSON responses, stable application errors |
| `src/config.ts` | Model ID, limits, workspace name and validated runtime config |
| `src/env.d.ts` | Declaration merge for secrets that Wrangler cannot infer from config |
| `src/knowledge/types.ts` | Note, search and API domain types |
| `src/knowledge/search.ts` | Tokenization and deterministic keyword ranking |
| `src/knowledge/workspace-repository.ts` | All `@cloudflare/computer` RPC/VFS operations |
| `src/knowledge/service.ts` | Note validation, persistence and retrieval orchestration |
| `src/ai/answer-service.ts` | Prompt construction, Workers AI call and result normalization |
| `public/index.html` | Semantic browser shell |
| `public/styles.css` | Responsive product styles |
| `public/app.js` | Browser API client and rendering |
| `test/unit/*.test.ts` | Pure function tests |
| `test/worker/*.test.ts` | Worker, auth, API and DO persistence tests in workerd |
| `test/fixtures/seed-notes.ts` | Deterministic integration data |
| `scripts/smoke.mjs` | Remote production-safe API smoke checks |
| `vitest.config.ts` | Cloudflare Workers Vitest pool configuration |

---

### Task 1: Establish Cloudflare runtime test infrastructure

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `test/fixtures/seed-notes.ts`
- Move: `test/search.test.ts` → `test/unit/search.test.ts`

**Interfaces:**
- Produces: `npm run test:unit`, `npm run test:worker`, and a full `npm run check` gate.
- Produces: `SEED_NOTES: Array<{title: string; tags: string[]; content: string}>`.

- [ ] **Step 1: Install the Workers test pool and pin it in the lockfile**

Run:

```bash
rtk npm install -D @cloudflare/vitest-pool-workers@latest
```

Expected: `package.json` and `package-lock.json` include the resolved package; do not manually guess a version.

- [ ] **Step 2: Add separate unit and Worker test scripts**

Set `package.json` scripts to:

```json
{
  "test": "npm run test:unit && npm run test:worker",
  "test:unit": "vitest run test/unit",
  "test:worker": "vitest run test/worker",
  "typecheck": "tsc --noEmit",
  "build": "wrangler deploy --dry-run",
  "check": "npm run typecheck && npm test && npm run build",
  "smoke": "node scripts/smoke.mjs"
}
```

- [ ] **Step 3: Configure the Workers pool**

Create `vitest.config.ts`:

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    include: ["test/**/*.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            APP_TOKEN: "worker-test-token",
            ALLOW_INSECURE_LOCAL: "false",
          },
        },
      },
    },
  },
});
```

- [ ] **Step 4: Move the existing search test and create shared fixtures**

Create `test/fixtures/seed-notes.ts`:

```ts
export const SEED_NOTES = [
  {
    title: "发布复盘",
    tags: ["项目", "复盘"],
    content: "需求确认不足，测试窗口被压缩。下次在开发前冻结验收标准。",
  },
  {
    title: "学习计划",
    tags: ["学习"],
    content: "每周五回顾知识库中尚未形成链接的笔记。",
  },
] as const;
```

Update the moved test import from `../src/search` to `../../src/search` temporarily; Task 4 will move the implementation.

- [ ] **Step 5: Run the unit test slice**

Run:

```bash
rtk npm run test:unit
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit the test harness**

```bash
rtk git add package.json package-lock.json vitest.config.ts test/unit/search.test.ts test/fixtures/seed-notes.ts
rtk git commit -m "test: add Workers runtime test harness"
```

---

### Task 2: Generate binding types and validate configuration

**Files:**
- Modify: `wrangler.jsonc`
- Replace: `worker-configuration.d.ts`
- Create: `src/env.d.ts`
- Modify: `tsconfig.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: generated `Env` with `KNOWLEDGE`, `AI`, `ASSETS`, and `ALLOW_INSECURE_LOCAL` bindings.
- Produces: one declaration-merged `APP_TOKEN?: string` secret field that Wrangler cannot infer from `wrangler.jsonc`.
- Consumes: Wrangler 4 config schema.

- [ ] **Step 1: Add the static assets binding and explicit local compatibility variable**

Update `wrangler.jsonc` with this top-level asset configuration and non-secret variable:

```jsonc
"assets": {
  "directory": "./public",
  "binding": "ASSETS",
  "run_worker_first": ["/api/*"]
},
"vars": {
  "ALLOW_INSECURE_LOCAL": "false"
}
```

Keep `APP_TOKEN` out of the file.

- [ ] **Step 2: Generate types from Wrangler**

Run:

```bash
rtk npx wrangler types
```

Expected: `worker-configuration.d.ts` is regenerated and includes all configured bindings. If Wrangler emits a different generated filename, pass the repository filename explicitly with `rtk npx wrangler types worker-configuration.d.ts`.

- [ ] **Step 3: Declare only the runtime secret through interface merging**

Create `src/env.d.ts`:

```ts
declare global {
  interface Env {
    APP_TOKEN?: string;
  }
}

export {};
```

Wrangler cannot infer a secret that is intentionally absent from config. Do not redeclare any generated binding in this file.

- [ ] **Step 4: Add a CI type drift check**

Add to `package.json`:

```json
"types:check": "wrangler types --check"
```

Update `check` to begin with `npm run types:check`.

- [ ] **Step 5: Verify generated types and configuration**

Run:

```bash
rtk npm run types:check
rtk npx wrangler deploy --dry-run
```

Expected: both commands exit 0; dry run lists `KNOWLEDGE`, `AI`, and `ASSETS`.

- [ ] **Step 6: Commit configuration typing**

```bash
rtk git add wrangler.jsonc worker-configuration.d.ts src/env.d.ts tsconfig.json .gitignore package.json
rtk git commit -m "chore: generate Worker binding types"
```

---

### Task 3: Introduce stable HTTP errors and constant-time authentication

**Files:**
- Create: `src/http.ts`
- Create: `src/auth.ts`
- Create: `test/unit/auth.test.ts`
- Create: `test/unit/http.test.ts`

**Interfaces:**
- Produces: `AppError`, `jsonResponse`, `errorResponse`, `createRequestContext`.
- Produces: `authorizeRequest(request: Request, env: Pick<Env, "APP_TOKEN" | "ALLOW_INSECURE_LOCAL">): Promise<void>`.

- [ ] **Step 1: Write failing auth tests**

Create `test/unit/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { authorizeRequest } from "../../src/auth";

const request = (token?: string) => new Request("https://example.test/api/health", {
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

describe("authorizeRequest", () => {
  it("accepts the configured token", async () => {
    await expect(authorizeRequest(request("secret"), {
      APP_TOKEN: "secret",
      ALLOW_INSECURE_LOCAL: "false",
    })).resolves.toBeUndefined();
  });

  it("rejects missing and incorrect credentials", async () => {
    const env = { APP_TOKEN: "secret", ALLOW_INSECURE_LOCAL: "false" };
    await expect(authorizeRequest(request(), env)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    await expect(authorizeRequest(request("wrong"), env)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("fails closed when the secret is missing", async () => {
    await expect(authorizeRequest(request(), {
      ALLOW_INSECURE_LOCAL: "false",
    })).rejects.toMatchObject({ code: "AUTH_MISCONFIGURED" });
  });

  it("allows an explicit insecure local mode", async () => {
    await expect(authorizeRequest(request(), {
      ALLOW_INSECURE_LOCAL: "true",
    })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the auth test and confirm the red state**

```bash
rtk npx vitest run test/unit/auth.test.ts
```

Expected: FAIL because `src/auth.ts` does not exist.

- [ ] **Step 3: Implement stable errors and timing-safe equality**

Create `src/http.ts` with:

```ts
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
  }
}

export interface RequestContext { requestId: string }

export const createRequestContext = (request: Request): RequestContext => ({
  requestId: request.headers.get("cf-ray") || crypto.randomUUID(),
});

export function jsonResponse(value: unknown, status = 200, requestId?: string): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
  });
}

export function errorResponse(error: unknown, requestId: string): Response {
  const app = error instanceof AppError
    ? error
    : new AppError("INTERNAL_ERROR", "Internal error", 500, true);
  return jsonResponse({
    error: { code: app.code, message: app.message, retryable: app.retryable, requestId },
  }, app.status, requestId);
}
```

Create `src/auth.ts` with a SHA-256 constant-time comparison so different-length strings do not return early:

```ts
import { AppError } from "./http";

const encoder = new TextEncoder();

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function authorizeRequest(
  request: Request,
  env: Pick<Env, "APP_TOKEN" | "ALLOW_INSECURE_LOCAL">,
): Promise<void> {
  if (!env.APP_TOKEN) {
    if (env.ALLOW_INSECURE_LOCAL === "true") return;
    throw new AppError("AUTH_MISCONFIGURED", "Authentication is not configured", 503);
  }
  const header = request.headers.get("authorization") || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!(await constantTimeEqual(supplied, env.APP_TOKEN))) {
    throw new AppError("AUTH_REQUIRED", "Authentication required", 401);
  }
}
```

- [ ] **Step 4: Add response contract tests**

Test that `errorResponse(new AppError("FORBIDDEN", "Forbidden", 403), "req-1")` returns status 403, header `x-request-id: req-1`, stable JSON, no stack, and security headers.

- [ ] **Step 5: Run the focused and full unit tests**

```bash
rtk npx vitest run test/unit/auth.test.ts test/unit/http.test.ts
rtk npm run test:unit
```

Expected: all tests pass.

- [ ] **Step 6: Commit auth and error contracts**

```bash
rtk git add src/auth.ts src/http.ts test/unit/auth.test.ts test/unit/http.test.ts
rtk git commit -m "feat: harden API authentication and errors"
```

---

### Task 4: Extract knowledge domain and Computer repository

**Files:**
- Create: `src/config.ts`
- Create: `src/knowledge/types.ts`
- Move: `src/search.ts` → `src/knowledge/search.ts`
- Create: `src/knowledge/workspace-repository.ts`
- Create: `src/knowledge/service.ts`
- Modify: `test/unit/search.test.ts`
- Create: `test/unit/knowledge-service.test.ts`

**Interfaces:**
- Produces: `WorkspaceRepository` with `list`, `read`, `save`, and `searchDocuments`.
- Produces: `KnowledgeService.createNote`, `listNotes`, and `search`.
- Consumes: existing Computer VFS paths `/workspace/notes/*` and `/workspace/.memory/index.json` without migration.

- [ ] **Step 1: Define domain types and configuration**

Move `NoteRecord`, `SearchDocument`, and `SearchHit` to `src/knowledge/types.ts`. Create `src/config.ts`:

```ts
export const APP_CONFIG = {
  workspaceName: "personal",
  indexPath: "/workspace/.memory/index.json",
  notesRoot: "/workspace/notes",
  maxNoteBytes: 128 * 1024,
  model: "@cf/meta/llama-3.1-8b-instruct-fp8-fast",
} as const;
```

- [ ] **Step 2: Write failing service tests with a fake repository**

Define a structural repository test double and test these cases:

```ts
it("rejects an empty title", async () => {
  await expect(service.createNote({ title: " ", tags: [], content: "body" }))
    .rejects.toMatchObject({ code: "NOTE_INVALID" });
});

it("preserves createdAt when updating an existing id", async () => {
  const saved = await service.createNote({ id: "one", title: "Updated", tags: [], content: "body" });
  expect(saved.createdAt).toBe("2026-01-01T00:00:00.000Z");
});
```

Inject `now: () => string` and `createId: () => string` so tests do not depend on wall time.

- [ ] **Step 3: Confirm the service tests fail**

```bash
rtk npx vitest run test/unit/knowledge-service.test.ts
```

Expected: FAIL because the service and repository contracts do not exist.

- [ ] **Step 4: Implement the repository boundary**

`WorkspaceRepository` owns `getWorkspace`, `using` disposal, index parsing, ENOENT handling, directory creation and VFS reads/writes. Its public shape is:

```ts
export interface KnowledgeRepository {
  list(): Promise<NoteRecord[]>;
  read(note: NoteRecord): Promise<string | null>;
  save(note: NoteRecord, content: string, nextIndex: NoteRecord[]): Promise<void>;
}

export class WorkspaceRepository implements KnowledgeRepository {
  constructor(private readonly namespace: Env["KNOWLEDGE"], private readonly name: string) {}
  list(): Promise<NoteRecord[]>;
  read(note: NoteRecord): Promise<string | null>;
  save(note: NoteRecord, content: string, nextIndex: NoteRecord[]): Promise<void>;
}
```

Keep the unavoidable Computer package compatibility cast inside one private adapter function, document the upstream type mismatch, and expose no cast to callers.

- [ ] **Step 5: Implement KnowledgeService**

The service validates title/content/tags/size, preserves `createdAt`, updates `updatedAt`, resolves safe IDs, and builds SearchDocuments before calling `searchNotes`. Throw stable `AppError` codes `NOTE_INVALID`, `NOTE_TOO_LARGE`, and `INDEX_CORRUPT`.

- [ ] **Step 6: Run unit tests and typecheck**

```bash
rtk npm run test:unit
rtk npm run typecheck
```

Expected: all unit tests and TypeScript pass.

- [ ] **Step 7: Commit the domain extraction**

```bash
rtk git add src/config.ts src/knowledge test/unit/search.test.ts test/unit/knowledge-service.test.ts
rtk git rm src/search.ts
rtk git commit -m "refactor: isolate Computer knowledge repository"
```

---

### Task 5: Extract Workers AI answer generation

**Files:**
- Create: `src/ai/answer-service.ts`
- Create: `test/unit/answer-service.test.ts`

**Interfaces:**
- Produces: `AnswerService.answer(question: string, sources: SearchHit[]): Promise<{answer: string; sources: SearchHit[]}>`.
- Consumes: `Env["AI"]`, `APP_CONFIG.model`, and validated SearchHits.

- [ ] **Step 1: Write prompt and normalization tests**

Use a fake AI binding and assert:

```ts
it("does not call AI without sources", async () => {
  const result = await service.answer("问题", []);
  expect(result.answer).toContain("没有足够依据");
  expect(ai.calls).toHaveLength(0);
});

it("numbers sources in the model context", async () => {
  await service.answer("共同问题是什么？", [firstHit, secondHit]);
  expect(ai.calls[0].messages[1].content).toContain("[1]");
  expect(ai.calls[0].messages[1].content).toContain("[2]");
});
```

Also test string results, `{response}` results, empty responses, and AI exceptions mapped to `AI_UNAVAILABLE`.

- [ ] **Step 2: Run tests and confirm the red state**

```bash
rtk npx vitest run test/unit/answer-service.test.ts
```

Expected: FAIL because `AnswerService` does not exist.

- [ ] **Step 3: Implement AnswerService**

Move the existing grounded Chinese system prompt and context construction into the class. Limit question length to 4,000 characters, bound source excerpts, and use `APP_CONFIG.model`. Never log the prompt or returned source content.

- [ ] **Step 4: Run the focused and unit suites**

```bash
rtk npx vitest run test/unit/answer-service.test.ts
rtk npm run test:unit
```

Expected: all tests pass.

- [ ] **Step 5: Commit the AI boundary**

```bash
rtk git add src/ai/answer-service.ts test/unit/answer-service.test.ts
rtk git commit -m "refactor: isolate grounded answer service"
```

---

### Task 6: Compose modular API routes and static assets

**Files:**
- Create: `src/app.ts`
- Modify: `src/index.ts`
- Delete: `src/ui.ts`
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`
- Create: `test/worker/api.test.ts`

**Interfaces:**
- Produces: `createApp(): ExportedHandler<Env>`.
- Consumes: `authorizeRequest`, `KnowledgeService`, `WorkspaceRepository`, `AnswerService`, and `env.ASSETS`.

- [ ] **Step 1: Write Worker API contract tests**

Use `SELF` from `cloudflare:test` and cover:

```ts
it("requires authentication", async () => {
  const response = await SELF.fetch("https://example.test/api/health");
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
});

it("creates, lists and searches a note", async () => {
  const create = await api("/api/notes", { method: "POST", body: JSON.stringify(SEED_NOTES[0]) });
  expect(create.status).toBe(201);
  expect((await api("/api/notes")).status).toBe(200);
  const search = await api("/api/search?q=" + encodeURIComponent("测试窗口"));
  expect(await search.json()).toMatchObject({ hits: [{ title: "发布复盘" }] });
});
```

The `api` helper always sets `authorization` and `content-type` and uses a per-test workspace name if the test pool supports isolated storage. Otherwise reset DO storage in `beforeEach` through a test-only binding exposed only under Miniflare.

- [ ] **Step 2: Confirm the API test fails on the old error contract**

```bash
rtk npm run test:worker -- test/worker/api.test.ts
```

Expected: FAIL because the current API uses flat `{error}` and optional no-secret auth.

- [ ] **Step 3: Implement the route composition**

`src/app.ts` must:

1. Create request context.
2. Send non-API requests to `env.ASSETS.fetch(request)`.
3. Authorize every `/api/*` request.
4. Instantiate the repository/service/answer service per request.
5. Dispatch exact method/path pairs; return `METHOD_NOT_ALLOWED` or `NOT_FOUND` otherwise.
6. Catch once at the boundary, log structured metadata without content, and return `errorResponse`.

Keep `src/index.ts` to exports and composition:

```ts
import { DurableObject } from "cloudflare:workers";
import { withWorkspace } from "@cloudflare/computer";
import { createApp } from "./app";

export class KnowledgeBase extends withWorkspace(/* existing v1-compatible setup */) {}

export default createApp();
```

- [ ] **Step 4: Move the UI into static assets**

Split the existing HTML exactly by responsibility:

- `public/index.html`: semantic form and result containers, links to `/styles.css` and `/app.js`.
- `public/styles.css`: existing responsive dark theme.
- `public/app.js`: token storage, API calls, escaping and render functions.

Preserve current user-visible behavior. Change error parsing to prefer `data.error.message` and fall back to `data.error`.

- [ ] **Step 5: Run Worker tests, typecheck and dry build**

```bash
rtk npm run test:worker
rtk npm run typecheck
rtk npm run build
```

Expected: API tests pass; dry run lists static assets and all bindings.

- [ ] **Step 6: Commit routing and assets**

```bash
rtk git add src/index.ts src/app.ts public test/worker/api.test.ts
rtk git rm src/ui.ts
rtk git commit -m "refactor: compose modular Worker API and assets"
```

---

### Task 7: Prove Durable Object persistence and error boundaries

**Files:**
- Create: `test/worker/persistence.test.ts`
- Create: `test/worker/errors.test.ts`
- Modify: `src/knowledge/workspace-repository.ts`
- Modify: `src/app.ts`

**Interfaces:**
- Verifies: the deployed `KnowledgeBase` VFS contract survives stub recreation.
- Verifies: malformed JSON, wrong content type, oversized notes, unknown routes and AI failures have stable errors.

- [ ] **Step 1: Write persistence and failure tests**

Test this sequence:

1. POST a note.
2. Obtain and dispose a workspace RPC client.
3. Obtain a new stub/client for the same `personal` name.
4. Read the index and Markdown content.
5. Assert title, createdAt and body match.

Add API tests for:

- invalid JSON → `INVALID_JSON`, 400;
- missing JSON content type → `UNSUPPORTED_MEDIA_TYPE`, 415;
- body over 128 KiB → `NOTE_TOO_LARGE`, 413;
- unknown API route → `NOT_FOUND`, 404;
- wrong method → `METHOD_NOT_ALLOWED`, 405 with `allow` header;
- repository corruption → `INDEX_CORRUPT`, 500 without raw content;
- AI binding failure → `AI_UNAVAILABLE`, 503, retryable true.

- [ ] **Step 2: Run the new tests and observe failures**

```bash
rtk npx vitest run test/worker/persistence.test.ts test/worker/errors.test.ts
```

Expected: at least invalid JSON and method handling fail until the next step.

- [ ] **Step 3: Implement stable parse and method errors**

Add a bounded JSON helper in `src/http.ts` that checks content-length when present, reads the existing bounded request body, maps `SyntaxError` to `INVALID_JSON`, and rejects wrong media types before parsing. Add route definitions with explicit allowed methods.

- [ ] **Step 4: Run the full local gate**

```bash
rtk npm run check
```

Expected: generated type check, TypeScript, unit tests, Worker tests and Wrangler dry build all exit 0.

- [ ] **Step 5: Commit persistence and error coverage**

```bash
rtk git add src/http.ts src/app.ts src/knowledge/workspace-repository.ts test/worker/persistence.test.ts test/worker/errors.test.ts
rtk git commit -m "test: cover persistence and API failures"
```

---

### Task 8: Add production-safe remote smoke verification and operations docs

**Files:**
- Create: `scripts/smoke.mjs`
- Create: `docs/operations/smoke-test.md`
- Create: `docs/operations/rollback.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: `MEMORY_GARDEN_BASE_URL` and `MEMORY_GARDEN_TOKEN` environment variables.
- Produces: exit 0 only when health, auth rejection, create, list, search and chat checks pass.

- [ ] **Step 1: Implement the smoke script without secret output**

`scripts/smoke.mjs` must:

```js
const baseUrl = process.env.MEMORY_GARDEN_BASE_URL;
const token = process.env.MEMORY_GARDEN_TOKEN;
if (!baseUrl || !token) throw new Error("MEMORY_GARDEN_BASE_URL and MEMORY_GARDEN_TOKEN are required");

const request = (path, init = {}) => fetch(new URL(path, baseUrl), {
  ...init,
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    ...init.headers,
  },
});
```

Use a unique title `smoke-${crypto.randomUUID()}`. Check unauthorized health returns 401, authorized health returns `{ok:true}`, create returns 201, list contains the title, search finds it, and chat returns non-empty `answer` plus sources. Print only step name, status, request ID and elapsed time; never print headers, token, note body or full Agent answer.

- [ ] **Step 2: Document exact safe invocation**

`docs/operations/smoke-test.md` must use interactive secret input:

```bash
read -s MEMORY_GARDEN_TOKEN
export MEMORY_GARDEN_TOKEN
export MEMORY_GARDEN_BASE_URL=https://memory.crgmhrc.asia
rtk npm run smoke
unset MEMORY_GARDEN_TOKEN MEMORY_GARDEN_BASE_URL
```

Document that smoke creates one identifiable note and that Phase 3 will add deletion/cleanup.

- [ ] **Step 3: Document deployment and rollback evidence**

`docs/operations/rollback.md` must require:

1. `rtk npx wrangler versions list` before deployment.
2. `rtk npm run check` locally.
3. `rtk npm run deploy`.
4. `rtk npm run smoke` against workers.dev and the custom domain.
5. `rtk npx wrangler rollback <VERSION_ID>` if smoke fails.
6. Re-run authorized and unauthorized health after rollback.

- [ ] **Step 4: Update product docs and Phase 0 evidence slots**

Update README authentication, local insecure mode, assets, tests and smoke sections. In ROADMAP Phase 0, mark items complete only when the corresponding command has passed; leave remote persistence and provider checks unchecked until captured.

- [ ] **Step 5: Run the complete local gate**

```bash
rtk npm run check
```

Expected: all local checks pass. Do not run deployment without explicit user authorization.

- [ ] **Step 6: Commit operational verification**

```bash
rtk git add scripts/smoke.mjs docs/operations README.md ROADMAP.md package.json
rtk git commit -m "docs: add remote verification runbook"
```

---

## Phase 0 Completion Gate

Run locally:

```bash
rtk npm ci
rtk npm run check
rtk npm audit --omit=dev
rtk git diff --check
```

With explicit deployment authorization, run remotely:

```bash
rtk npm run deploy
read -s MEMORY_GARDEN_TOKEN
export MEMORY_GARDEN_TOKEN
export MEMORY_GARDEN_BASE_URL=https://memory-garden-agent.apples398.workers.dev
rtk npm run smoke
export MEMORY_GARDEN_BASE_URL=https://memory.crgmhrc.asia
rtk npm run smoke
unset MEMORY_GARDEN_TOKEN MEMORY_GARDEN_BASE_URL
```

Record exact command outputs and remaining gaps. Phase 0 is complete only when:

- local full gate passes;
- production unauthorized and authorized paths pass;
- remote create/list/search/chat pass on both domains;
- a separately executed persistence check confirms data survives a later Worker/DO activation;
- no secret appears in shell history, logs, Git diff or test output.
