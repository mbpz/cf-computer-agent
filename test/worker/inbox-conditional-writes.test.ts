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
describe("inbox conditional archive and restore", () => {
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS);
    for (const owner of ["a", "b"]) {
      await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', '2026-01-01', '2026-01-01')").bind(owner, owner, `${owner}@test.example`).run();
      const members = new MembersRepository(env.DB); tokens[owner] = (await new SessionService(env.DB, members, { waitUntil: () => undefined }).create((await members.findByIdentitySubject(owner))!)).token;
    }
    await env.DB.batch(Array.from({ length: 47 }, (_, i) => env.DB.prepare("INSERT INTO inbox_items (id, member_id, client_key, kind, content, status, created_at, updated_at) VALUES (?, ?, ?, 'text', ?, ?, 1, 1)").bind(`i-${String(i).padStart(3, "0")}`, i < 43 ? "a" : "b", `key-${i}`, `Private ${i}`, i === 42 ? "archived" : "inbox")));
  });
  const version = new Date(1).toISOString();
  it("archives, reads back, restores and rejects replay of an old version", async () => {
    const first = await http("/api/inbox/i-000", "PATCH", { status: "archived", expectedUpdatedAt: version });
    expect(first.status).toBe(200);
    const archived = await first.json<any>();
    expect(archived.status).toBe("archived"); expect(Date.parse(archived.updatedAt)).toBeGreaterThan(1);
    expect(await (await http("/api/inbox/i-000")).json()).toEqual(archived);
    expect((await http("/api/inbox/i-000", "PATCH", { status: "inbox", expectedUpdatedAt: version })).status).toBe(409);
    const restored = await http("/api/inbox/i-000", "PATCH", { status: "inbox", expectedUpdatedAt: archived.updatedAt });
    expect(restored.status).toBe(200); expect((await restored.json<any>()).status).toBe("inbox");
  });
  it.each([undefined, null, 123, "bad", "2026-09-28", "2026-09-28T00:00:00Z"])("rejects invalid version %s without a write", async expectedUpdatedAt => {
    const response = await http("/api/inbox/i-000", "PATCH", { status: "archived", expectedUpdatedAt });
    expect(response.status).toBe(400); expect((await response.json<any>()).error.code).toBe("INBOX_VERSION_INVALID");
    expect((await (await http("/api/inbox/i-000")).json<any>()).updatedAt).toBe(version);
  });
  it("isolates owner before validating the version and rejects untrusted fields", async () => {
    expect((await http("/api/inbox/i-000", "PATCH", { status: "archived" }, "b")).status).toBe(404);
    expect((await http("/api/inbox/missing", "PATCH", { status: "archived" })).status).toBe(404);
    expect((await http("/api/inbox/i-000", "PATCH", { status: "archived", expectedUpdatedAt: version, memberId: "b" })).status).toBe(400);
    expect((await http("/api/inbox/i-000?memberId=b", "PATCH", { status: "archived", expectedUpdatedAt: version })).status).toBe(400);
  });
  it("has one winner for concurrent equal-version HTTP writes, including same-state writes", async () => {
    const results = await Promise.all(["archived", "inbox"].map(status => http("/api/inbox/i-000", "PATCH", { status, expectedUpdatedAt: version })));
    expect(results.map(x => x.status).sort()).toEqual([200, 409]);
  });
  it("advances monotonically with a clock behind the persisted version", async () => {
    const repository = new InboxRepository(env.DB);
    const service = new InboxService(repository, { now: () => new Date(0) });
    const archived = await service.updateStatus("a", "i-000", "archived", version);
    expect(archived.updatedAt).toBe(new Date(2).toISOString());
    const same = await service.updateStatus("a", "i-000", "archived", archived.updatedAt);
    expect(same.updatedAt).toBe(new Date(3).toISOString());
    await expect(service.updateStatus("a", "i-000", "inbox", version)).rejects.toMatchObject({ status: 409, code: "INBOX_VERSION_CONFLICT" });
    expect(await repository.updateStatus("a", "i-000", "inbox", 4, 1)).toBeNull();
    expect(await repository.updateStatus("b", "i-000", "inbox", 4, 3)).toBeNull();
    expect((await service.get("a", "i-000")).status).toBe("archived");
  });
  it("rejects status writes after promotion", async () => {
    await env.DB.prepare("UPDATE inbox_items SET status = 'promoted' WHERE id = 'i-000'").run();
    expect((await http("/api/inbox/i-000", "PATCH", { status: "archived", expectedUpdatedAt: version })).status).toBe(422);
  });
});
