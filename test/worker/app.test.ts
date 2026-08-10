/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { reset, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { SEED_NOTES } from "../fixtures/seed-notes";

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

  it("allows concurrent first writes to create the deployed workspace directories", async () => {
    const requests = ["first", "second"].map((id) => api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ id, title: `${id} note`, tags: [], content: `${id} content` }),
    }));

    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);

    const notes = await api("/api/notes");
    const data = await notes.json<{ notes: Array<{ id: string }> }>();
    expect(data.notes.map((note) => note.id)).toEqual(expect.arrayContaining(["first", "second"]));
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
