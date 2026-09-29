/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type AppDependencies } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { createConnectorAuthorizationVerifier, type ConnectorAuthorizationBinding } from "../../shared/connector-authorization";
import { MIGRATIONS } from "../fixtures/d1";

const ORIGIN = "https://memory.crgmhrc.asia";
type Authority = { runtimeId: string; generation: number; connectorId: string; origin: string; policyVersion: string; state: "active" | "revoked" };
type Ticket = { ticket: string };
let a = "", b = "", denied = "", now = 0;
let dependencies: AppDependencies;
let pair: CryptoKeyPair;

async function api(path: string, token = a, body?: unknown, options = dependencies) {
  const ctx = createExecutionContext();
  const response = await createApp(options).fetch!(new Request(ORIGIN + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin: ORIGIN, cookie: `__Host-memory-session=${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}
const base = "/api/environments/env-a";
const reserve = (body: Record<string, unknown> = {}, token = a) => api(base + "/connector-authority", token,
  { operationId: "reserve-1", connectorId: "connector-1", expectedGeneration: 0, ...body });
const issue = (authority: Authority, body: Record<string, unknown> = {}, token = a, options = dependencies) => api(base + "/connector-tickets", token,
  { operationId: "ticket-1", runtimeId: authority.runtimeId, generation: authority.generation, ...body }, options);
const revoke = (authority: Authority, body: Record<string, unknown> = {}) => api(base + "/connector-authority/revoke", a,
  { operationId: "revoke-1", runtimeId: authority.runtimeId, generation: authority.generation, ...body });
async function active() {
  const response = await reserve(); expect(response.status).toBe(201);
  return (await response.json() as { authority: Authority }).authority;
}
function binding(authority: Authority): ConnectorAuthorizationBinding {
  return { purpose: "connect", origin: ORIGIN, connectorId: "connector-1", memberId: "member-a", environmentId: "env-a",
    runtimeId: authority.runtimeId, generation: authority.generation, policyVersion: authority.policyVersion, leaseId: null };
}
const count = (table: string) => env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first("n");

beforeEach(async () => {
  await reset(); await applyD1Migrations(env.DB, MIGRATIONS);
  now = Date.now();
  const timestamp = new Date(now).toISOString();
  for (const id of ["a", "b", "denied"]) await env.DB.prepare(
    "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?)",
  ).bind(`member-${id}`, `subject-${id}`, `${id}@example.test`, timestamp, timestamp).run();
  await env.DB.prepare("INSERT INTO roles (id, key, name, allow_bits, status, is_system, created_at, updated_at) VALUES ('test-vm', 'test-vm', 'VM', '0x200000', 'active', 0, ?, ?)").bind(timestamp, timestamp).run();
  await env.DB.prepare("INSERT INTO role_members (role_id, member_id, created_at) VALUES ('test-vm','member-a',?),('test-vm','member-b',?)").bind(timestamp, timestamp).run();
  await env.DB.prepare("INSERT INTO browser_environments (id, member_id, name, type, version, created_at, updated_at) VALUES ('env-a','member-a','A','personal',1,?,?),('env-b','member-b','B','personal',1,?,?)").bind(now, now, now, now).run();
  const sessions = new SessionService(env.DB, new MembersRepository(env.DB), { waitUntil: () => undefined });
  a = (await sessions.create((await new MembersRepository(env.DB).findById("member-a"))!)).token;
  b = (await sessions.create((await new MembersRepository(env.DB).findById("member-b"))!)).token;
  denied = (await sessions.create((await new MembersRepository(env.DB).findById("member-denied"))!)).token;
  pair = await crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"]) as CryptoKeyPair;
  dependencies = { connectorAuthorization: { origin: ORIGIN, policyVersion: "policy-1", signingKey: { keyId: "test-key", privateKey: pair.privateKey }, verificationKeys: [{ keyId: "test-key", publicKey: pair.publicKey }], now: () => now } };
  await env.DB.prepare("INSERT INTO connector_authorization_policy (singleton, origin, policy_version, enabled) VALUES (1, ?, 'policy-1', 1)").bind(ORIGIN).run();
});

describe("connector authority: real session → HTTP → D1 → signed ticket", () => {
  it("allocates server runtime identity and signs only current authoritative claims without storing the bearer ticket", async () => {
    expect(await (await api(base + "/connector-authority")).json()).toEqual({ authority: null });
    const authority = await active();
    expect(authority).toEqual({ runtimeId: expect.stringMatching(/^[a-f0-9-]{36}$/u), generation: 1,
      connectorId: "connector-1", origin: ORIGIN, policyVersion: "policy-1", state: "active" });
    const response = await issue(authority); expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { ticket } = await response.json() as Ticket;
    const verify = createConnectorAuthorizationVerifier([{ keyId: "test-key", publicKey: pair.publicKey }]);
    expect(await verify(ticket, binding(authority), () => now)).toMatchObject({ ...binding(authority), version: 1, issuedAtMs: now, expiresAtMs: now + 60_000 });
    const receipts = await env.DB.prepare("SELECT * FROM connector_authorization_receipts").all();
    expect(receipts.results).toHaveLength(2);
    expect(JSON.stringify(receipts.results)).not.toContain(ticket);
    expect(JSON.stringify(receipts.results)).not.toContain(a);
  });

  it("concurrent retry of the same reserve/issue returns one runtime and one identical ticket", async () => {
    const reservations = await Promise.all([reserve(), reserve(), reserve()]);
    expect(reservations.map((r) => r.status)).toEqual([201, 201, 201]);
    const bodies = await Promise.all(reservations.map((r) => r.json() as Promise<{ authority: Authority }>));
    expect(bodies[1]).toEqual(bodies[0]); expect(bodies[2]).toEqual(bodies[0]);
    const issued = await Promise.all([issue(bodies[0]!.authority), issue(bodies[0]!.authority), issue(bodies[0]!.authority)]);
    expect(issued.map((r) => r.status)).toEqual([201, 201, 201]);
    const tickets = await Promise.all(issued.map((r) => r.json()));
    expect(tickets[1]).toEqual(tickets[0]); expect(tickets[2]).toEqual(tickets[0]);
    expect(await count("connector_authority_heads")).toBe(1);
    expect(await count("connector_authorization_receipts")).toBe(2);
  });

  it("different concurrent reserve intents cannot both advance the same expected generation", async () => {
    const results = await Promise.all([reserve(), reserve({ operationId: "reserve-2" })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await count("connector_authorization_receipts")).toBe(1);
  });

  it("same operation with changed content conflicts without replacing its original authority", async () => {
    const authority = await active();
    expect((await reserve({ connectorId: "other" })).status).toBe(409);
    expect((await reserve({ expectedGeneration: 1 })).status).toBe(409);
    expect(await (await reserve()).json()).toEqual({ authority });
    expect((await issue(authority, { operationId: "reserve-1" })).status).toBe(409);
  });

  it("a different ticket operation cannot mint another connect ticket in the same generation", async () => {
    const authority = await active();
    const responses = await Promise.all([issue(authority), issue(authority, { operationId: "ticket-2" })]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await count("connector_authorization_receipts")).toBe(2);
  });

  it("dropped response recovery returns the existing ticket without extending its lifetime", async () => {
    const authority = await active();
    const lost = await issue(authority); expect(lost.status).toBe(201); await lost.body?.cancel();
    now += 30_000;
    const recovered = await issue(authority); expect(recovered.status).toBe(201);
    const { ticket } = await recovered.json() as Ticket;
    const verify = createConnectorAuthorizationVerifier([{ keyId: "test-key", publicKey: pair.publicKey }]);
    expect(await verify(ticket, binding(authority), () => now)).toMatchObject({ issuedAtMs: now - 30_000, expiresAtMs: now + 30_000 });
    expect(await count("connector_authorization_receipts")).toBe(2);
  });

  it("foreign and missing environments are indistinguishable 404s for an authorized member", async () => {
    const authority = await active();
    expect((await api(base + "/connector-authority", b)).status).toBe(404);
    expect((await reserve({}, b)).status).toBe(404);
    expect((await issue(authority, {}, b)).status).toBe(404);
    expect((await api("/api/environments/missing/connector-authority", b)).status).toBe(404);
  });

  it("requires a real session and explicit VM permission", async () => {
    expect((await reserve({}, "")).status).toBe(401);
    expect((await reserve({}, denied)).status).toBe(403);
  });

  it("rejects request-supplied identity, policy, time, purpose, origin or signing authority", async () => {
    for (const key of ["memberId", "runtimeId", "generation", "policyVersion", "origin", "issuedAtMs", "expiresAtMs", "keyId", "sessionHash"]) {
      expect((await reserve({ [key]: "override" })).status).toBe(400);
    }
    const authority = await active();
    for (const key of ["memberId", "connectorId", "policyVersion", "origin", "issuedAtMs", "expiresAtMs", "purpose", "leaseId", "ticketId"]) {
      expect((await issue(authority, { [key]: "override" })).status).toBe(400);
    }
  });

  it("client lifecycle reports cannot establish an authoritative networking runtime", async () => {
    expect((await api(base + "/operations", a, { eventId: "event-1", runtimeId: "browser-runtime", generation: 99, eventIndex: 1, event: "started" })).status).toBe(200);
    expect(await (await api(base + "/connector-authority")).json()).toEqual({ authority: null });
    expect((await issue({ runtimeId: "browser-runtime", generation: 99 } as Authority)).status).toBe(409);
    expect((await active()).generation).toBe(1);
  });

  it("replacing the runtime invalidates old issue and reserve replays without signing old claims", async () => {
    const first = await active(); expect((await issue(first)).status).toBe(201);
    const replacement = await reserve({ operationId: "reserve-2", expectedGeneration: 1 }); expect(replacement.status).toBe(201);
    const next = (await replacement.json() as { authority: Authority }).authority;
    expect(next.generation).toBe(2); expect(next.runtimeId).not.toBe(first.runtimeId);
    expect((await issue(first)).status).toBe(409); expect((await reserve()).status).toBe(409);
    expect((await issue(next, { operationId: "ticket-2" })).status).toBe(201);
  });

  it("revocation is idempotent and cannot revoke a newer generation", async () => {
    const first = await active(); expect((await issue(first)).status).toBe(201);
    expect((await revoke(first)).status).toBe(200); expect((await revoke(first)).status).toBe(200);
    expect((await issue(first)).status).toBe(409);
    const next = (await (await reserve({ operationId: "reserve-2", expectedGeneration: 1 })).json() as { authority: Authority }).authority;
    expect((await revoke(first, { operationId: "revoke-2" })).status).toBe(409);
    expect((await issue(next, { operationId: "ticket-2" })).status).toBe(201);
  });

  it.each(["role", "assignment", "bits"])("current %s revocation blocks even an existing ticket replay", async (kind) => {
    const authority = await active(); expect((await issue(authority)).status).toBe(201);
    if (kind === "role") await env.DB.prepare("UPDATE roles SET status = 'disabled' WHERE id = 'test-vm'").run();
    if (kind === "assignment") await env.DB.prepare("DELETE FROM role_members WHERE member_id = 'member-a'").run();
    if (kind === "bits") await env.DB.prepare("UPDATE roles SET allow_bits = '0x100000' WHERE id = 'test-vm'").run();
    expect((await issue(authority)).status).toBe(403);
    // Losing permission must not prevent the owner from stopping an old grant.
    expect((await revoke(authority)).status).toBe(200);
  });

  it("switching session cannot reuse the previous session's grant or receipt", async () => {
    const authority = await active(); expect((await issue(authority)).status).toBe(201);
    const sessions = new SessionService(env.DB, new MembersRepository(env.DB), { waitUntil: () => undefined });
    const next = (await sessions.create((await new MembersRepository(env.DB).findById("member-a"))!)).token;
    expect((await issue(authority, {}, next)).status).toBe(409);
    expect((await reserve({}, next)).status).toBe(409);
  });

  it("deleted sessions and disabled members cannot issue again", async () => {
    const authority = await active(); expect((await issue(authority)).status).toBe(201);
    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = 'member-a'").run();
    expect((await issue(authority)).status).toBe(403);
    await env.DB.prepare("UPDATE members SET status = 'active' WHERE id = 'member-a'").run();
    await env.DB.prepare("DELETE FROM auth_sessions WHERE member_id = 'member-a'").run();
    expect((await issue(authority)).status).toBe(401);
  });

  it("authoritative policy changes prevent old deployments or grants from issuing", async () => {
    const authority = await active(); expect((await issue(authority)).status).toBe(201);
    await env.DB.prepare("UPDATE connector_authorization_policy SET policy_version = 'policy-2'").run();
    expect((await issue(authority)).status).toBe(503);
    const updated = { ...dependencies, connectorAuthorization: { ...dependencies.connectorAuthorization!, policyVersion: "policy-2" } };
    expect((await issue(authority, {}, a, updated)).status).toBe(409);
    await env.DB.prepare("UPDATE connector_authorization_policy SET enabled = 0").run();
    expect((await reserve({ operationId: "reserve-2", expectedGeneration: 1 })).status).toBe(503);
  });

  it("deleted environments cannot revive receipts and cascade away current authority", async () => {
    const authority = await active(); expect((await issue(authority)).status).toBe(201);
    await env.DB.prepare("DELETE FROM browser_environments WHERE id = 'env-a'").run();
    expect((await issue(authority)).status).toBe(404); expect((await reserve()).status).toBe(404);
    expect(await count("connector_authority_heads")).toBe(0);
    expect(await count("connector_authorization_receipts")).toBe(2);
  });

  it("expired tickets are not reissued with new timestamps or a different operation key", async () => {
    const authority = await active(); expect((await issue(authority)).status).toBe(201);
    now += 60_000;
    expect((await issue(authority)).status).toBe(409);
    expect((await issue(authority, { operationId: "ticket-2" })).status).toBe(409);
    expect(await count("connector_authorization_receipts")).toBe(2);
  });

  it("key-id rotation cannot silently resign a saved receipt under a new key", async () => {
    const authority = await active(); expect((await issue(authority)).status).toBe(201);
    const changed = { ...dependencies, connectorAuthorization: { ...dependencies.connectorAuthorization!, signingKey: { keyId: "next-key", privateKey: pair.privateKey } } };
    expect((await issue(authority, {}, a, changed)).status).toBe(409);
    expect(await count("connector_authorization_receipts")).toBe(2);
  });

  it("missing signer or policy fails closed without creating state", async () => {
    const body = { operationId: "reserve-1", connectorId: "connector-1", expectedGeneration: 0 };
    expect((await api(base + "/connector-authority", a, body, {})).status).toBe(503);
    await env.DB.prepare("DELETE FROM connector_authorization_policy").run();
    expect((await reserve()).status).toBe(503);
    expect(await count("connector_authorization_receipts")).toBe(0);
  });

  it("a failed transaction never leaves a receipt that reports an uncreated authority", async () => {
    await env.DB.exec("CREATE TRIGGER fail_authority BEFORE INSERT ON connector_authority_heads BEGIN SELECT RAISE(ABORT, 'test rollback'); END;");
    expect((await reserve()).status).toBe(500);
    expect(await count("connector_authorization_receipts")).toBe(0);
    await env.DB.exec("DROP TRIGGER fail_authority;");
    expect((await reserve()).status).toBe(201);
    expect(await count("connector_authorization_receipts")).toBe(1);
  });
  it("caps a ticket at the live session expiry and refuses later receipt recovery", async () => {
    const authority = await active();
    const expiresAt = Math.floor((now + 25_000) / 1000) * 1000;
    await env.DB.prepare("UPDATE auth_sessions SET expires_at = ? WHERE member_id = 'member-a'")
      .bind(new Date(expiresAt).toISOString()).run();
    const response = await issue(authority); expect(response.status).toBe(201);
    const { ticket } = await response.json() as Ticket;
    const verify = createConnectorAuthorizationVerifier([{ keyId: "test-key", publicKey: pair.publicKey }]);
    expect(await verify(ticket, binding(authority), () => now)).toMatchObject({ expiresAtMs: expiresAt });
    now = expiresAt;
    expect((await issue(authority)).status).toBe(401);
  });

  it("permits owner revocation with no signer and disabled policy, but never for a foreign member", async () => {
    const authority = await active();
    await env.DB.prepare("UPDATE connector_authorization_policy SET enabled = 0").run();
    const body = { operationId: "revoke-offline", runtimeId: authority.runtimeId, generation: authority.generation };
    expect((await api(base + "/connector-authority/revoke", b, body, {})).status).toBe(404);
    expect((await api(base + "/connector-authority/revoke", a, body, {})).status).toBe(200);
    expect((await env.DB.prepare("SELECT state FROM connector_authority_heads").first())?.state).toBe("revoked");
  });

  it("rejects invalid trusted signing configuration before creating any receipt", async () => {
    const body = { operationId: "reserve-1", connectorId: "connector-1", expectedGeneration: 0 };
    const config = dependencies.connectorAuthorization!;
    for (const override of [
      { origin: "http://memory.crgmhrc.asia" }, { origin: ORIGIN + "/" }, { policyVersion: "" },
      { signingKey: { keyId: "test-key", privateKey: pair.publicKey } },
      { signingKey: { keyId: "", privateKey: pair.privateKey } },
    ]) {
      expect((await api(base + "/connector-authority", a, body,
        { connectorAuthorization: { ...config, ...override } })).status).toBe(503);
    }
    expect(await count("connector_authority_heads")).toBe(0);
    expect(await count("connector_authorization_receipts")).toBe(0);
  });

  it("bounds ids and generations and rejects query parameters without changing state", async () => {
    for (const body of [{ expectedGeneration: -1 }, { expectedGeneration: 0.5 },
      { expectedGeneration: Number.MAX_SAFE_INTEGER }, { connectorId: "" }, { connectorId: "x".repeat(129) },
      { operationId: "wrong value" }, { operationId: null }]) {
      expect((await reserve(body)).status).toBe(400);
    }
    expect((await api(base + "/connector-authority?unexpected=1")).status).toBe(400);
    expect(await count("connector_authority_heads")).toBe(0);
  });

  async function issued(authority: Authority) {
    const response = await issue(authority); expect(response.status).toBe(201);
    const { ticket } = await response.json() as Ticket;
    const payload = JSON.parse(atob(ticket.split(".")[1]!.replace(/-/gu, "+").replace(/_/gu, "/")));
    return { ticket, ticketId: payload.ticketId as string };
  }
  async function consume(credential: { ticket: string; ticketId: string }, consumerId = "channel-1", extraHeaders = {}, options = dependencies) {
    const ctx = createExecutionContext();
    const response = await createApp(options).fetch!(new Request(ORIGIN + "/api/connector/consume", {
      method: "POST", headers: { "content-type": "application/json", ...extraHeaders },
      body: JSON.stringify({ ...credential, consumerId }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, ctx);
    await waitOnExecutionContext(ctx); return response;
  }
  async function connected() {
    const authority = await active(), credential = await issued(authority);
    const response = await consume(credential); expect(response.status).toBe(201);
    const { lease } = await response.json() as { lease: { leaseId: string; expiresAtMs: number; renewAfterMs: number; revision: number } };
    return { authority, credential, lease };
  }
  const renew = (authority: Authority, leaseId: string, operationId = "renew-1", token = a) => api(base + "/connector-renewals", token,
    { operationId, runtimeId: authority.runtimeId, generation: authority.generation, leaseId });
  async function renewalTicket(authority: Authority, leaseId: string, operationId = "renew-1") {
    const response = await renew(authority, leaseId, operationId); expect(response.status).toBe(201);
    const { ticket } = await response.json() as Ticket;
    return { ticket, ticketId: JSON.parse(atob(ticket.split(".")[1]!.replace(/-/gu, "+").replace(/_/gu, "/"))).ticketId as string };
  }

  it("atomically consumes a real ticket once across concurrent consumers without cookie authentication", async () => {
    const authority = await active(), credential = await issued(authority);
    const responses = await Promise.all([consume(credential), consume(credential, "channel-2"), consume(credential)]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    const success = responses.find((r) => r.status === 201)!;
    expect(await success.json()).toMatchObject({ lease: { revision: 1, expiresAtMs: now + 60_000, renewAfterMs: now + 30_000 } });
    expect(await count("connector_ticket_consumptions")).toBe(1);
    expect(await count("connector_leases")).toBe(1);
    const stored = await env.DB.prepare("SELECT * FROM connector_ticket_consumptions").all();
    expect(JSON.stringify(stored.results)).not.toContain(credential.ticket);
    expect((await consume(credential, "restarted-channel")).status).toBe(409);
  });

  it("verifies the signature and fixed public key before consuming a saved receipt", async () => {
    const credential = await issued(await active());
    expect((await consume({ ...credential, ticket: credential.ticket.slice(0, -8) + "AAAAAAAA" })).status).toBe(403);
    expect((await consume({ ...credential, ticketId: "missing-ticket" })).status).toBe(403);
    const config = dependencies.connectorAuthorization!;
    expect((await consume(credential, "channel-1", {}, { connectorAuthorization: { ...config, verificationKeys: [] } })).status).toBe(503);
    expect(await count("connector_ticket_consumptions")).toBe(0);
    expect((await consume(credential)).status).toBe(201);
  });

  it("does not use ambient Origin or cookies as connector consumer authentication", async () => {
    const credential = await issued(await active());
    expect((await consume(credential, "channel-1", { origin: ORIGIN })).status).toBe(403);
    expect((await consume(credential, "channel-1", { cookie: `__Host-memory-session=${a}` })).status).toBe(403);
    expect(await count("connector_ticket_consumptions")).toBe(0);
  });

  it.each(["role", "session", "member", "policy", "environment", "revoke", "generation"])("rejects a valid signed ticket after live %s changes", async (change) => {
    const authority = await active(), credential = await issued(authority);
    if (change === "role") await env.DB.prepare("DELETE FROM role_members WHERE member_id = 'member-a'").run();
    if (change === "session") await env.DB.prepare("DELETE FROM auth_sessions WHERE member_id = 'member-a'").run();
    if (change === "member") await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = 'member-a'").run();
    if (change === "policy") await env.DB.prepare("UPDATE connector_authorization_policy SET enabled = 0").run();
    if (change === "environment") await env.DB.prepare("DELETE FROM browser_environments WHERE id = 'env-a'").run();
    if (change === "revoke") expect((await revoke(authority)).status).toBe(200);
    if (change === "generation") expect((await reserve({ operationId: "next", expectedGeneration: 1 })).status).toBe(201);
    expect((await consume(credential)).status).toBeGreaterThanOrEqual(400);
    expect(await count("connector_ticket_consumptions")).toBe(0);
  });

  it("renews after 30 seconds with the same live session, and consumes each revision just once", async () => {
    const { authority, lease } = await connected();
    expect((await renew(authority, lease.leaseId)).status).toBe(409);
    now += 30_000;
    const ticket = await renewalTicket(authority, lease.leaseId);
    expect(await renewalTicket(authority, lease.leaseId)).toEqual(ticket);
    expect((await renew(authority, lease.leaseId, "another-renew")).status).toBe(409);
    const responses = await Promise.all([consume(ticket), consume(ticket)]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await responses.find((r) => r.status === 201)!.json()).toMatchObject({ lease: {
      leaseId: lease.leaseId, revision: 2, expiresAtMs: now + 60_000, renewAfterMs: now + 30_000,
    } });
    now += 30_000;
    expect((await consume(await renewalTicket(authority, lease.leaseId, "renew-2"))).status).toBe(201);
    expect((await consume(ticket)).status).toBe(409);
  });

  it("refuses to consume a renewal on another channel or a wrong lease", async () => {
    const { authority, lease } = await connected(); now += 30_000;
    expect((await renew(authority, "wrong-lease")).status).toBe(409);
    expect((await renew(authority, lease.leaseId, "renew-1", b)).status).toBe(404);
    const ticket = await renewalTicket(authority, lease.leaseId);
    expect((await consume(ticket, "channel-2")).status).toBe(409);
    expect((await consume(ticket)).status).toBe(201);
  });

  it("never revives an expired lease using an unexpired renewal ticket", async () => {
    const { authority, lease } = await connected(); now += 30_000;
    const ticket = await renewalTicket(authority, lease.leaseId);
    now = lease.expiresAtMs;
    expect((await consume(ticket)).status).toBe(409);
    expect((await renew(authority, lease.leaseId, "renew-new")).status).toBe(409);
    expect((await env.DB.prepare("SELECT revision FROM connector_leases").first())?.revision).toBe(1);
  });

  it("unknown consumption response is not retried into another grant, and explicit new generation replaces it", async () => {
    const authority = await active(), credential = await issued(authority);
    const lost = await consume(credential); expect(lost.status).toBe(201); await lost.body?.cancel();
    expect((await consume(credential)).status).toBe(409);
    const replacement = await reserve({ operationId: "next-reservation", expectedGeneration: 1 });
    const next = (await replacement.json() as { authority: Authority }).authority;
    const nextTicketResponse = await issue(next, { operationId: "next-ticket" });
    const { ticket } = await nextTicketResponse.json() as Ticket;
    const ticketId = JSON.parse(atob(ticket.split(".")[1]!.replace(/-/gu, "+").replace(/_/gu, "/"))).ticketId;
    expect((await consume({ ticket, ticketId }, "new-channel")).status).toBe(201);
    expect(await count("connector_leases")).toBe(1);
  });

  it("consumption and lease creation roll back together on failure", async () => {
    const credential = await issued(await active());
    await env.DB.exec("CREATE TRIGGER fail_lease BEFORE INSERT ON connector_leases BEGIN SELECT RAISE(ABORT, 'test'); END;");
    expect((await consume(credential)).status).toBe(500);
    expect(await count("connector_ticket_consumptions")).toBe(0);
    await env.DB.exec("DROP TRIGGER fail_lease;");
    expect((await consume(credential)).status).toBe(201);
  });

  it.each(["revoke", "session", "policy", "generation"])("does not consume a renewal after %s invalidates live authority", async (change) => {
    const { authority, lease } = await connected(); now += 30_000;
    const ticket = await renewalTicket(authority, lease.leaseId);
    if (change === "revoke") expect((await revoke(authority)).status).toBe(200);
    if (change === "session") await env.DB.prepare("DELETE FROM auth_sessions WHERE member_id = 'member-a'").run();
    if (change === "policy") await env.DB.prepare("UPDATE connector_authorization_policy SET enabled = 0").run();
    if (change === "generation") expect((await reserve({ operationId: "next", expectedGeneration: 1 })).status).toBe(201);
    expect((await consume(ticket)).status).toBeGreaterThanOrEqual(400);
    expect(await count("connector_ticket_consumptions")).toBe(1);
    expect((await env.DB.prepare("SELECT revision FROM connector_leases").first())?.revision).toBe(1);
  });

  it("keeps renewal operations in the same member namespace as reserve/issue/revoke", async () => {
    const { authority, lease } = await connected(); now += 30_000;
    for (const op of ["reserve-1", "ticket-1"]) expect((await renew(authority, lease.leaseId, op)).status).toBe(409);
    await renewalTicket(authority, lease.leaseId, "renew-unique");
    expect((await revoke(authority, { operationId: "renew-unique" })).status).toBe(409);
    expect((await reserve({ operationId: "renew-unique", expectedGeneration: 1 })).status).toBe(409);
    expect((await issue(authority, { operationId: "renew-unique" })).status).toBe(409);
  });

  it("rejects a valid signature when the signed ticket is not the exact saved issuance receipt", async () => {
    const credential = await issued(await active());
    const [header, payload] = credential.ticket.split(".");
    const claims = JSON.parse(atob(payload!.replace(/-/gu, "+").replace(/_/gu, "/")));
    claims.ticketId = "different-signed-id";
    const input = header + "." + btoa(JSON.stringify(claims)).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
    const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", pair.privateKey, new TextEncoder().encode(input)));
    const ticket = input + "." + btoa(String.fromCharCode(...signature)).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
    expect((await consume({ ticket, ticketId: credential.ticketId })).status).toBe(403);
    expect(await count("connector_ticket_consumptions")).toBe(0);
  });

  it("uses current session expiry on consumption, not just the earlier signed deadline", async () => {
    const credential = await issued(await active());
    await env.DB.prepare("UPDATE auth_sessions SET expires_at = ? WHERE member_id = 'member-a'")
      .bind(new Date(now + 20_000).toISOString()).run();
    expect((await consume(credential)).status).toBe(409);
    expect(await count("connector_leases")).toBe(0);
  });

});
