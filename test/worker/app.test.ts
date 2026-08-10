/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { createExecutionContext, env, evictDurableObject, reset, SELF } from "cloudflare:test";
import { getWorkspace, type WorkspaceClient } from "@cloudflare/computer";
import { beforeEach, describe, expect, it } from "vitest";
import { SEED_NOTES } from "../fixtures/seed-notes";
import { createApp } from "../../src/app";
import { APP_CONFIG } from "../../src/config";
import { type AnswerAi } from "../../src/ai/answer-service";
import { WorkspaceRepository } from "../../src/knowledge/workspace-repository";

const api = (path: string, init: RequestInit = {}) => SELF.fetch(`https://example.test${path}`, {
  ...init,
  headers: {
    authorization: "Bearer worker-test-token",
    "content-type": "application/json",
    ...init.headers,
  },
});

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

async function openWorkspace(): Promise<WorkspaceClient> {
  const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName(APP_CONFIG.workspaceName));
  return getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
}

describe("Worker application", () => {
  beforeEach(async () => {
    await reset();
  });

  it("requires authentication for API requests", async () => {
    const response = await SELF.fetch("https://example.test/api/health");

    expect(response.status).toBe(401);
    expectProtectedResponse(response);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "AUTH_REQUIRED" } });
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
    await expect(created.json()).resolves.toMatchObject({ note: { id: "compat-note", tags: [] } });

    const updated = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ id: "compat-note", title: "兼容笔记", tags: "not-an-array", content: "更新后的内容" }),
    });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ note: { id: "compat-note", tags: [] } });

    const search = await api(`/api/search?q=${encodeURIComponent("更新后的内容")}`);
    await expect(search.json()).resolves.toMatchObject({ hits: [{ id: "compat-note" }] });
  });

  it("runs a public Durable Object commit against its local workspace", async () => {
    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName(APP_CONFIG.workspaceName));

    await expect(stub.commitNote({ id: "direct-rpc", title: "Direct RPC", content: "local workspace write" }))
      .resolves.toMatchObject({ note: { id: "direct-rpc", title: "Direct RPC" }, created: true });

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
    const app = createApp();
    const brokenEnv = {
      ...env,
      KNOWLEDGE: {
        idFromName(): never {
          throw new Error("raw-internal-repository-detail");
        },
      },
    } as unknown as Env;

    const response = await app.fetch!(incomingRequest("https://example.test/api/notes", {
      headers: { authorization: "Bearer worker-test-token" },
    }), brokenEnv, createExecutionContext());
    const body = await expectError(response, 500, "INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("raw-internal-repository-detail");
  });

  it("maps a locally mocked AI failure to a retryable API error", async () => {
    const failingAi: AnswerAi = {
      async run(): Promise<never> {
        throw new Error("local AI mock failure");
      },
    };
    const app = createApp();
    const localEnv = { ...env, AI: failingAi } as unknown as Env;
    const headers = { authorization: "Bearer worker-test-token", "content-type": "application/json" };

    const create = await app.fetch!(incomingRequest("https://example.test/api/notes", {
      method: "POST",
      headers,
      body: JSON.stringify({ id: "ai-source", title: "AI source", content: "local source" }),
    }), localEnv, createExecutionContext());
    expect(create.status).toBe(201);

    const response = await app.fetch!(incomingRequest("https://example.test/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({ question: "local source" }),
    }), localEnv, createExecutionContext());
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
});
