/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { createExecutionContext, env, evictDurableObject, reset, runInDurableObject, SELF, waitOnExecutionContext } from "cloudflare:test";
import { getWorkspace, type WorkspaceClient } from "@cloudflare/computer";
import { createLocalJWKSet } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_NOTES } from "../fixtures/seed-notes";
import { createApp } from "../../src/app";
import { APP_CONFIG } from "../../src/config";
import { type AnswerAi } from "../../src/ai/answer-service";
import { WorkspaceRepository } from "../../src/knowledge/workspace-repository";
import { verifyAccessJwt, type AccessEnvironment } from "../../src/identity/access-jwt";
import { ACCESS_AUDIENCE, ACCESS_TEAM_DOMAIN, createAccessJwtFixture, type AccessJwtFixture } from "../fixtures/access-jwt";

let automationAccess: AccessJwtFixture;
let automationAssertion: string;
const api = (path: string, init: RequestInit = {}) => workerApi(path, init);

async function workerApi(path: string, init: RequestInit = {}): Promise<Response> {
  const app = createApp({ verifyAccessJwt: localVerifyAutomationAssertion });
  const context = createExecutionContext();
  const response = await app.fetch!(incomingRequest(`https://example.test${path}`, {
    ...init,
    headers: automationHeaders(init.headers),
  }), localEnv(), context);
  await waitOnExecutionContext(context);
  return response;
}

function automationHeaders(headers?: HeadersInit): Headers {
  return new Headers({
    authorization: "Bearer worker-test-token",
    "cf-access-jwt-assertion": automationAssertion,
    "content-type": "application/json",
    ...Object.fromEntries(new Headers(headers)),
  });
}

function localVerifyAutomationAssertion(request: Request, environment: AccessEnvironment) {
  return verifyAccessJwt(request, environment, { jwks: createLocalJWKSet({ keys: [automationAccess.publicJwk] }) });
}

function localEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...env,
    ACCESS_TEAM_DOMAIN,
    ACCESS_AUD: ACCESS_AUDIENCE,
    BOOTSTRAP_ADMIN_EMAIL: "bootstrap-only@example.test",
    ...overrides,
  } as Env;
}

function expectProtectedResponse(response: Response): void {
  expect(response.headers.get("x-request-id")).toBeTruthy();
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
}

async function expectError(
  response: Response,
  status: number,
  code: string,
): Promise<{ error: { code: string; message: string; retryable: boolean; requestId: string } }> {
  expect(response.status).toBe(status);
  expectProtectedResponse(response);
  const body = await response.json<{ error: { code: string; message: string; retryable: boolean; requestId: string } }>();
  expect(body).toMatchObject({
    error: {
      code,
      requestId: expect.any(String),
    },
  });
  return body;
}

function disposeWorkspace(workspace: WorkspaceClient): void {
  const disposeSymbol = (Symbol as typeof Symbol & { dispose?: symbol }).dispose;
  const disposable = workspace as unknown as Record<symbol, unknown>;
  const dispose = disposeSymbol ? disposable[disposeSymbol] : undefined;
  if (typeof dispose === "function") dispose.call(workspace);
}

function incomingRequest(url: string, init?: RequestInit): Request<unknown, IncomingRequestCfProperties<unknown>> {
  return new Request(url, init) as Request<unknown, IncomingRequestCfProperties<unknown>>;
}

function encodedByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function streamBody(value: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function openWorkspace(): Promise<WorkspaceClient> {
  const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName(APP_CONFIG.workspaceName));
  return getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
}

async function seedPendingJournal(note: Record<string, unknown>, content: string): Promise<void> {
  const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName(APP_CONFIG.workspaceName));
  await runInDurableObject(stub, (_instance, state) => {
    state.storage.sql.exec(
      "INSERT INTO memory_garden_note_journal (workspace, note_json, content) VALUES (?, ?, ?)",
      APP_CONFIG.workspaceName,
      JSON.stringify(note),
      content,
    );
  });
}

async function expectJournalCleared(): Promise<void> {
  const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName(APP_CONFIG.workspaceName));
  const rows = await runInDurableObject(stub, (_instance, state) => state.storage.sql
    .exec<{ workspace: string }>("SELECT workspace FROM memory_garden_note_journal")
    .toArray());
  expect(rows).toEqual([]);
}

describe("Worker application", () => {
  beforeAll(async () => {
    automationAccess = await createAccessJwtFixture();
    automationAssertion = await automationAccess.signService();
  });

  beforeEach(async () => {
    await reset();
  });

  it("requires authentication for API requests", async () => {
    const response = await SELF.fetch("https://example.test/api/health");

    expect(response.status).toBe(401);
    expectProtectedResponse(response);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ACCESS_TOKEN_REQUIRED" } });
  });

  it("initializes deployed workspace paths then creates, lists and searches a note", async () => {
    const create = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify(SEED_NOTES[0]),
    });
    expect(create.status).toBe(201);
    expectProtectedResponse(create);

    const list = await api("/api/notes");
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({ notes: [{ title: "发布复盘" }] });

    const search = await api(`/api/search?q=${encodeURIComponent("测试窗口")}`);
    expect(search.status).toBe(200);
    await expect(search.json()).resolves.toMatchObject({ hits: [{ title: "发布复盘" }] });
  });

  it("preserves legacy create and update statuses while normalizing absent tags", async () => {
    const created = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ id: "compat-note", title: "兼容笔记", content: "首次内容" }),
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json<{ note: { id: string; tags: string[] } }>();
    expect(Object.keys(createdBody)).toEqual(["note"]);
    expect(createdBody).toMatchObject({ note: { id: "compat-note", tags: [] } });

    const updated = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ id: "compat-note", title: "兼容笔记", tags: "not-an-array", content: "更新后的内容" }),
    });
    expect(updated.status).toBe(200);
    const updatedBody = await updated.json<{ note: { id: string; tags: string[] } }>();
    expect(Object.keys(updatedBody)).toEqual(["note"]);
    expect(updatedBody).toMatchObject({ note: { id: "compat-note", tags: [] } });

    const search = await api(`/api/search?q=${encodeURIComponent("更新后的内容")}`);
    const searchBody = await search.json<{ hits: Array<{ id: string }> }>();
    expect(Object.keys(searchBody)).toEqual(["hits"]);
    expect(searchBody).toMatchObject({ hits: [{ id: "compat-note" }] });
  });

  it("keeps supplementary-Unicode generated ids safe and leaves recovery healthy", async () => {
    const title = `a${"\u{10401}".repeat(64)}`;
    const created = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title, tags: [], content: "unicode path body" }),
    });
    expect(created.status).toBe(201);
    const payload = await created.json() as { note: { id: string; path: string } };
    expect([...payload.note.id].length).toBeLessThanOrEqual(64);
    expect(encodedByteLength(payload.note.id)).toBeLessThanOrEqual(APP_CONFIG.maxNoteIdBytes);
    expect(payload.note.id).toMatch(/^[\p{L}\p{N}]+$/u);
    expect(payload.note.path).toBe(`${APP_CONFIG.notesRoot}/${payload.note.id}.md`);

    const listed = await api("/api/notes");
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({ notes: [{ id: payload.note.id }] });

    const followUp = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ id: "after-unicode", title: "After Unicode", content: "healthy" }),
    });
    expect(followUp.status).toBe(201);
  });

  it("runs a public Durable Object commit against its local workspace", async () => {
    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName(APP_CONFIG.workspaceName));

    await expect(stub.commitNote({ id: "direct-rpc", title: "Direct RPC", content: "local workspace write" }))
      .resolves.toMatchObject({ ok: true, value: { note: { id: "direct-rpc", title: "Direct RPC" }, created: true } });

    const listed = await api("/api/notes");
    await expect(listed.json()).resolves.toMatchObject({ notes: [{ id: "direct-rpc" }] });
  });

  it("commits repeated concurrent first writes without losing Durable Object index records", async () => {
    const expectedIds = ["first", "second", "third", "fourth", "fifth", "sixth"];
    for (const ids of [["first", "second"], ["third", "fourth"], ["fifth", "sixth"]]) {
      const responses = await Promise.all(ids.map((id) => api("/api/notes", {
        method: "POST",
        body: JSON.stringify({ id, title: `${id} note`, tags: [], content: `${id} content` }),
      })));
      expect(responses.map((response) => response.status)).toEqual([201, 201]);
    }

    const notes = await api("/api/notes");
    const data = await notes.json<{ notes: Array<{ id: string }> }>();
    expect(data.notes.map((note) => note.id)).toEqual(expect.arrayContaining(expectedIds));

    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName(APP_CONFIG.workspaceName));
    await evictDurableObject(stub);
    const afterEviction = await api("/api/notes");
    const persisted = await afterEviction.json<{ notes: Array<{ id: string }> }>();
    expect(persisted.notes.map((note) => note.id)).toEqual(expect.arrayContaining(expectedIds));
  });

  it("persists note index and Markdown content across Durable Object eviction and a later request", async () => {
    const create = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ id: "durable-note", title: "Durable note", tags: ["durable"], content: "survives activation" }),
    });
    const created = await create.json<{ note: { createdAt: string } }>();
    expect(create.status).toBe(201);

    const initialRepository = new WorkspaceRepository(env.KNOWLEDGE, APP_CONFIG.workspaceName);
    const [initialNote] = await initialRepository.list();
    expect(initialNote).toMatchObject({ id: "durable-note", title: "Durable note", createdAt: created.note.createdAt });
    await expect(initialRepository.read(initialNote!)).resolves.toBe("survives activation");
    initialRepository.dispose();

    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName(APP_CONFIG.workspaceName));
    await evictDurableObject(stub);

    const later = await api(`/api/search?q=${encodeURIComponent("survives activation")}`);
    await expect(later.json()).resolves.toMatchObject({ hits: [{ id: "durable-note", title: "Durable note" }] });

    const recreatedRepository = new WorkspaceRepository(env.KNOWLEDGE, APP_CONFIG.workspaceName);
    const [recreatedNote] = await recreatedRepository.list();
    expect(recreatedNote).toMatchObject({ id: "durable-note", createdAt: created.note.createdAt });
    await expect(recreatedRepository.read(recreatedNote!)).resolves.toBe("survives activation");
    recreatedRepository.dispose();
  });

  it("returns stable parse and routing errors with a request ID", async () => {
    await expectError(await api("/api/notes", { method: "POST", body: "{" }), 400, "INVALID_JSON");
    await expectError(await api("/api/notes", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify(SEED_NOTES[0]),
    }), 415, "UNSUPPORTED_MEDIA_TYPE");
    await expectError(await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Too large", content: "x".repeat(APP_CONFIG.maxNoteBytes + 1) }),
    }), 413, "NOTE_TOO_LARGE");
    await expectError(await api("/api/not-a-route"), 404, "NOT_FOUND");

    const method = await api("/api/notes", { method: "DELETE" });
    await expectError(method, 405, "METHOD_NOT_ALLOWED");
    expect(method.headers.get("allow")).toBe("GET, POST");
  });

  it("accepts exactly 128 KiB of escaped JSON content but rejects one additional byte", async () => {
    const exactContent = `${"\u0001".repeat(APP_CONFIG.maxNoteBytes - 2)}"\\`;
    expect(encodedByteLength(exactContent)).toBe(APP_CONFIG.maxNoteBytes);
    expect(encodedByteLength(JSON.stringify({ id: "utf8-exact", title: "UTF-8 exact", content: exactContent })))
      .toBeLessThanOrEqual(APP_CONFIG.maxJsonRequestBytes);

    const exact = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ id: "utf8-exact", title: "UTF-8 exact", content: exactContent }),
    });
    expect(exact.status).toBe(201);

    const over = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ id: "utf8-over", title: "UTF-8 over", content: `${exactContent}a` }),
    });
    await expectError(over, 413, "NOTE_TOO_LARGE");
  });

  it("enforces a separate exact UTF-8 JSON envelope limit", async () => {
    const base = JSON.stringify({ id: "envelope-exact", title: "Envelope", tags: ["bounded"], content: "x" });
    const exactBody = `${base}${" ".repeat(APP_CONFIG.maxJsonRequestBytes - encodedByteLength(base))}`;
    expect(encodedByteLength(exactBody)).toBe(APP_CONFIG.maxJsonRequestBytes);

    const exact = await api("/api/notes", {
      method: "POST",
      headers: { "content-length": String(encodedByteLength(exactBody)) },
      body: exactBody,
    });
    expect(exact.status).toBe(201);

    const overBody = `${exactBody} `;
    const over = await api("/api/notes", {
      method: "POST",
      headers: { "content-length": String(encodedByteLength(overBody)) },
      body: streamBody(overBody),
    });
    await expectError(over, 413, "REQUEST_TOO_LARGE");
  });

  it("rejects oversized note metadata through the Durable Object RPC", async () => {
    const invalidNotes = [
      { id: "i".repeat(APP_CONFIG.maxNoteIdBytes + 1), title: "Title", content: "body" },
      { title: "Title", tags: ["t".repeat(APP_CONFIG.maxNoteTagBytes + 1)], content: "body" },
      {
        title: "Title",
        tags: Array.from({ length: APP_CONFIG.maxNoteTags }, () => "t".repeat(APP_CONFIG.maxNoteTagBytes)),
        content: "body",
      },
    ];

    for (const note of invalidNotes) {
      await expectError(await api("/api/notes", { method: "POST", body: JSON.stringify(note) }), 400, "NOTE_INVALID");
    }
  });

  it("maps a corrupt index from the note-commit RPC without exposing repository data", async () => {
    const workspace = await openWorkspace();
    await workspace.fs.mkdir("/workspace");
    await workspace.fs.mkdir("/workspace/.memory");
    await workspace.fs.writeFile(APP_CONFIG.indexPath, "raw-corrupt-index");
    disposeWorkspace(workspace);

    const response = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ id: "corrupt-post", title: "Corrupt", content: "no leak" }),
    });
    const body = await expectError(response, 500, "INDEX_CORRUPT");
    expect(JSON.stringify(body)).not.toContain("raw-corrupt-index");
  });

  it("replays an app-owned pending journal before exposing workspace reads after eviction", async () => {
    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName(APP_CONFIG.workspaceName));
    await seedPendingJournal({
      id: "journal-recovery",
      title: "Recovered journal note",
      tags: ["recovery"],
      path: "/workspace/notes/journal-recovery.md",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }, "recovered content");
    await evictDurableObject(stub);

    const response = await api("/api/notes");
    await expect(response.json()).resolves.toMatchObject({ notes: [{ id: "journal-recovery", title: "Recovered journal note" }] });
    await expectJournalCleared();
  });

  it("replays a pending journal after Markdown is written but before the index", async () => {
    const note = {
      id: "journal-markdown",
      title: "Markdown before index",
      tags: ["recovery"],
      path: "/workspace/notes/journal-markdown.md",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await seedPendingJournal(note, "markdown already written");
    const workspace = await openWorkspace();
    await workspace.fs.mkdir("/workspace");
    await workspace.fs.mkdir("/workspace/notes");
    await workspace.fs.writeFile(note.path, "markdown already written");
    disposeWorkspace(workspace);

    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName(APP_CONFIG.workspaceName));
    await evictDurableObject(stub);
    const response = await api("/api/search?q=markdown%20already%20written");
    await expect(response.json()).resolves.toMatchObject({ hits: [{ id: "journal-markdown" }] });
    await expectJournalCleared();
  });

  it("replays idempotently when the index was written before journal deletion", async () => {
    const note = {
      id: "journal-index",
      title: "Index before journal deletion",
      tags: ["recovery"],
      path: "/workspace/notes/journal-index.md",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await seedPendingJournal(note, "index already written");
    const workspace = await openWorkspace();
    await workspace.fs.mkdir("/workspace");
    await workspace.fs.mkdir("/workspace/.memory");
    await workspace.fs.mkdir("/workspace/notes");
    await workspace.fs.writeFile(note.path, "index already written");
    await workspace.fs.writeFile(APP_CONFIG.indexPath, JSON.stringify([note]));
    disposeWorkspace(workspace);

    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName(APP_CONFIG.workspaceName));
    await evictDurableObject(stub);
    const response = await api("/api/notes");
    await expect(response.json()).resolves.toMatchObject({ notes: [{ id: "journal-index" }] });
    await expectJournalCleared();
  });

  it("redacts corrupt repository content from stable errors", async () => {
    const workspace = await openWorkspace();
    await workspace.fs.mkdir("/workspace");
    await workspace.fs.mkdir("/workspace/.memory");
    await workspace.fs.writeFile(APP_CONFIG.indexPath, "raw-secret-index-content");
    disposeWorkspace(workspace);

    const response = await api("/api/notes");
    const body = await expectError(response, 500, "INDEX_CORRUPT");
    expect(JSON.stringify(body)).not.toContain("raw-secret-index-content");
  });

  it("redacts unexpected repository failures behind a stable request-scoped error", async () => {
    const app = createApp({ verifyAccessJwt: localVerifyAutomationAssertion });
    const brokenEnv = {
      ...env,
      KNOWLEDGE: {
        idFromName(): never {
          throw new Error("raw-internal-repository-detail");
        },
      },
    } as unknown as Env;

    const response = await app.fetch!(incomingRequest("https://example.test/api/notes", {
      headers: automationHeaders(),
    }), localEnv({ KNOWLEDGE: brokenEnv.KNOWLEDGE }), createExecutionContext());
    const body = await expectError(response, 500, "INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("raw-internal-repository-detail");
  });

  it("maps a locally mocked AI failure to a retryable API error", async () => {
    const failingAi: AnswerAi = {
      async run(): Promise<never> {
        throw new Error("local AI mock failure");
      },
    };
    const app = createApp({ verifyAccessJwt: localVerifyAutomationAssertion });
    const failingEnv = localEnv({ AI: failingAi as unknown as Ai });
    const headers = automationHeaders();

    const create = await app.fetch!(incomingRequest("https://example.test/api/notes", {
      method: "POST",
      headers,
      body: JSON.stringify({ id: "ai-source", title: "AI source", content: "local source" }),
    }), failingEnv, createExecutionContext());
    expect(create.status).toBe(201);

    const response = await app.fetch!(incomingRequest("https://example.test/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({ question: "local source" }),
    }), failingEnv, createExecutionContext());
    await expect(expectError(response, 503, "AI_UNAVAILABLE")).resolves.toMatchObject({ error: { retryable: true } });
  });

  it("returns JSON for unknown API routes and lets assets handle browser routes", async () => {
    const apiResponse = await api("/api/not-a-route");
    expect(apiResponse.status).toBe(404);
    expectProtectedResponse(apiResponse);
    await expect(apiResponse.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });

    const page = await SELF.fetch("https://example.test/");
    expect(page.status).toBe(200);
    expectProtectedResponse(page);
    await expect(page.text()).resolves.toContain("Memory Garden");

    const stylesheet = await SELF.fetch("https://example.test/styles.css");
    expect(stylesheet.status).toBe(200);
    expectProtectedResponse(stylesheet);
  });

  it("does not encode unexpected journal corruption as a domain error", async () => {
    const sensitiveMarker = "journal-sensitive-marker-do-not-log";
    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName(APP_CONFIG.workspaceName));
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO memory_garden_note_journal (workspace, note_json, content) VALUES (?, ?, ?)",
        APP_CONFIG.workspaceName,
        sensitiveMarker,
        "not-a-secret",
      );
    });
    await evictDurableObject(stub);

    const recoveryError = await stub.recoverWorkspace().catch((error: unknown) => error);
    expect(recoveryError).toBeInstanceOf(Error);
    expect((recoveryError as Error).message).toBe("Invalid pending note journal");
    expect((recoveryError as Error).message).not.toContain(sensitiveMarker);
    expect(Object.prototype.hasOwnProperty.call(recoveryError, "cause")).toBe(false);

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await api("/api/notes");
      const body = await expectError(response, 500, "INTERNAL_ERROR");
      expect(JSON.stringify(body)).not.toContain(sensitiveMarker);
      expect(JSON.stringify(error.mock.calls)).not.toContain(sensitiveMarker);
    } finally {
      error.mockRestore();
    }
  });
});
