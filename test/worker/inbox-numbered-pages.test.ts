/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { InboxRepository } from "../../src/inbox/repository";
import { InboxService } from "../../src/inbox/service";
const tokens: Record<string, string> = {};
async function http(path = "/api/inbox?page=1&pageSize=20", method = "GET", body?: unknown, owner = "a") {
  const context = createExecutionContext();
  const response = await createApp().fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { method, headers: { cookie: `__Host-memory-session=${tokens[owner] ?? ""}`, origin: "https://memory.crgmhrc.asia", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context); return response;
}
describe("inbox numbered pages through authenticated HTTP", () => {
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS);
    for (const owner of ["a", "b"]) {
      await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', '2026-01-01', '2026-01-01')").bind(owner, owner, `${owner}@test.example`).run();
      const members = new MembersRepository(env.DB); tokens[owner] = (await new SessionService(env.DB, members, { waitUntil: () => undefined }).create((await members.findByIdentitySubject(owner))!)).token;
    }
    await env.DB.batch(Array.from({ length: 47 }, (_, i) => env.DB.prepare("INSERT INTO inbox_items (id, member_id, client_key, kind, content, status, created_at, updated_at) VALUES (?, ?, ?, 'text', ?, ?, 1, 1)").bind(`i-${String(i).padStart(3, "0")}`, i < 43 ? "a" : "b", `key-${i}`, `Private ${i}`, i === 42 ? "archived" : "inbox")));
  });
  async function read(query: string, owner = "a") { const response = await http(`/api/inbox?${query}`, "GET", undefined, owner); expect(response.status).toBe(200); return response.json<any>(); }
  it("uses exact owned filtered counts and stable nonoverlapping pages", async () => {
    const pages = await Promise.all([1, 2, 3].map(page => read(`page=${page}&pageSize=20&status=inbox`)));
    expect(pages[1].pagination).toEqual({ page: 2, pageSize: 20, total: 42, totalPages: 3 });
    expect(pages[0].items[0].id).toBe("i-041"); expect(pages[1].items[0].id).toBe("i-021"); expect(pages[2].items.map((x: any) => x.id)).toEqual(["i-001", "i-000"]);
    expect(new Set(pages.flatMap(p => p.items.map((x: any) => x.id))).size).toBe(42);
    expect((await read("page=1&pageSize=100", "b")).pagination.total).toBe(4);
  });
  it.each([20, 50, 100])("accepts size %i and keeps requested empty pages", async size => {
    const page = await read(`page=2&pageSize=${size}&status=archived`, "b");
    expect(page).toEqual({ items: [], pagination: { page: 2, pageSize: size, total: 0, totalPages: 0 } });
  });
  it.each(["page=0", "page=1.2", "page=-1", "page=501&pageSize=20", "page=1&pageSize=21", "page=1&page=2", "page=1&cursor=abc", "page=1&limit=20", "page=1&status=invalid", "page=1&status=inbox&status=archived", "page=1&memberId=b"])("rejects malformed or mixed query %s", async query => { expect((await http(`/api/inbox?${query}`)).status).toBe(400); });
  it("preserves legacy opaque cursor consumers and defaults numbered size", async () => {
    const first = await read("limit=20"), second = await read(`limit=20&cursor=${encodeURIComponent(first.nextCursor)}`);
    expect(first.pagination).toBeUndefined(); expect(second.items).toHaveLength(20); expect(second.items[0].id).not.toBe(first.items[0].id);
    expect((await read("page=1")).pagination).toEqual({ page: 1, pageSize: 20, total: 43, totalPages: 3 });
  });
  it("requires member authentication", async () => { expect((await http(undefined, "GET", undefined, "missing")).status).toBe(401); });
  it("validates direct service pagination and status before querying", async () => {
    const service = new InboxService(new InboxRepository(env.DB));
    await expect(service.listNumbered("a", {}, { page: 0 })).rejects.toMatchObject({ status: 400 });
    await expect(service.listNumbered("a", { status: "invalid" as never }, {})).rejects.toMatchObject({ status: 400 });
  });
});
