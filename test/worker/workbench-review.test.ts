/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";

describe("workbench review route", () => {
  let token = "";
  beforeEach(async () => {
    await reset(); vi.useFakeTimers({ now: new Date("2026-09-09T10:00:00.000Z") });
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('review-a', 'subject-review-a', 'review-a@example.test', 'contributor', 'active', ?, ?)").bind("2026-09-09T10:00:00.000Z", "2026-09-09T10:00:00.000Z").run();
    const members = new MembersRepository(env.DB); const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined }); token = (await sessions.create((await members.findByIdentitySubject("subject-review-a"))!)).token; (globalThis as { __reviewToken?: string }).__reviewToken = token;
  });
  it("returns a private deterministic snapshot and rejects unknown query keys", async () => {
    const first = await api("/api/workbench/review?period=weekly");
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ period: "weekly", periodKey: "2026-W37" });
    expect((await api("/api/workbench/review?period=weekly&x=1")).status).toBe(400);
  });
});
async function api(path: string): Promise<Response> { const context = createExecutionContext(); const response = await createApp().fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { headers: { cookie: `__Host-memory-session=${(globalThis as { __reviewToken?: string }).__reviewToken ?? ""}`, origin: "https://memory.crgmhrc.asia" } }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context); await waitOnExecutionContext(context); return response; }
