/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";

const ORIGIN = "https://memory.crgmhrc.asia";
type Created = { environment: { id: string; memberId: string; name: string; type: string; taskId: string | null; version: number } };

describe("private browser environment metadata HTTP/D1 contract", () => {
  let a = "";
  let b = "";
  let denied = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    const now = new Date().toISOString();
    for (const id of ["a", "b", "denied"]) {
      await env.DB.prepare(
        "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?)",
      ).bind(`member-${id}`, `subject-${id}`, `${id}@example.test`, now, now).run();
    }
    // An explicit test-only grant: existing tasks/default roles must not grant VM access.
    await env.DB.prepare(
      "INSERT INTO roles (id, key, name, allow_bits, status, is_system, created_at, updated_at) VALUES ('test-vm', 'test-vm', 'VM', '0x200000', 'active', 0, ?, ?)",
    ).bind(now, now).run();
    await env.DB.prepare("INSERT INTO role_members (role_id, member_id, created_at) VALUES ('test-vm', 'member-a', ?), ('test-vm', 'member-b', ?)").bind(now, now).run();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => new Date() });
    a = (await sessions.create((await members.findByIdentitySubject("subject-a"))!)).token;
    b = (await sessions.create((await members.findByIdentitySubject("subject-b"))!)).token;
    denied = (await sessions.create((await members.findByIdentitySubject("subject-denied"))!)).token;
  });

  it.each(["personal", "temporary"])("creates %s metadata without claiming a Linux runtime is running", async (type) => {
    const response = await create(a, { type });
    expect(response.status).toBe(201);
    const body = await response.json() as Created;
    expect(body.environment).toMatchObject({ memberId: "member-a", name: "研究环境", type, taskId: null, version: 1 });
    expect(body.environment.id).toMatch(/^[a-f0-9-]{36}$/u);
    expect(body.environment).not.toHaveProperty("status");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const detail = await api(`/api/environments/${body.environment.id}`, a);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual(body);
  });

  it("returns the original result for concurrent identical operation IDs and writes one receipt", async () => {
    const responses = await Promise.all([create(a), create(a), create(a)]);
    expect(responses.map((response) => response.status)).toEqual([201, 201, 201]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM browser_environments").first("n")).toBe(1);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM environment_operation_receipts").first("n")).toBe(1);
  });

  it("conflicts on concurrent different content rather than applying the losing request", async () => {
    const responses = await Promise.all([create(a, { name: "first" }), create(a, { name: "second" })]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const winner = await responses.find((response) => response.status === 201)!.json() as Created;
    expect(await (await api(`/api/environments/${winner.environment.id}`, a)).json()).toEqual(winner);
    expect(await responses.find((response) => response.status === 409)!.json()).toMatchObject({ error: { code: "ENVIRONMENT_OPERATION_CONFLICT", retryable: false } });
  });

  it("keeps identical operation IDs independent for separate members and hides details", async () => {
    const left = await (await create(a)).json() as Created;
    const right = await (await create(b)).json() as Created;
    expect(left.environment.id).not.toBe(right.environment.id);
    expect((await api(`/api/environments/${left.environment.id}`, b)).status).toBe(404);
    expect((await api("/api/environments/00000000-0000-4000-8000-000000000000", b)).status).toBe(404);
    expect(await (await api("/api/environments", b)).json()).toMatchObject({ items: [right.environment], pagination: { total: 1 } });
  });

  it("binds an owned task and detaches on task deletion without deleting the environment", async () => {
    await seedTask("own-task", "member-a");
    const created = await (await create(a, { taskId: "own-task" })).json() as Created;
    expect(created.environment.taskId).toBe("own-task");
    await env.DB.prepare("DELETE FROM tasks WHERE id = 'own-task'").run();
    expect(await (await api(`/api/environments/${created.environment.id}`, a)).json()).toMatchObject({ environment: { id: created.environment.id, taskId: null } });
    // Receipt replay is the original result even after a linked resource has gone.
    expect(await (await create(a, { taskId: "own-task" })).json()).toEqual(created);
  });

  it.each(["foreign-task", "missing-task"])("does not consume operation IDs for inaccessible task %s", async (taskId) => {
    await seedTask("foreign-task", "member-b");
    const response = await create(a, { taskId });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "ENVIRONMENT_TASK_NOT_FOUND", retryable: false } });
    expect((await create(a)).status).toBe(201);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM environment_operation_receipts").first("n")).toBe(1);
  });

  it("rolls back the creation receipt when the metadata write fails", async () => {
    await env.DB.exec("CREATE TRIGGER reject_environment BEFORE INSERT ON browser_environments BEGIN SELECT RAISE(ABORT, 'test rejected metadata'); END;");
    expect((await create(a)).status).toBe(500);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM environment_operation_receipts").first("n")).toBe(0);
    await env.DB.exec("DROP TRIGGER reject_environment");
    expect((await create(a)).status).toBe(201);
  });

  it("paginates tied timestamps stably and scopes type filters and totals to the member", async () => {
    const rows = Array.from({ length: 23 }, (_, index) => env.DB.prepare(
      "INSERT INTO browser_environments (id, member_id, name, type, version, created_at, updated_at) VALUES (?, ?, 'seed', ?, 1, 1000, 1000)",
    ).bind(`env-${String(index).padStart(2, "0")}`, index === 22 ? "member-b" : "member-a", index === 21 ? "temporary" : "personal"));
    await env.DB.batch(rows);
    const page1 = await (await api("/api/environments?type=personal&page=1&pageSize=20", a)).json() as { items: { id: string }[] };
    expect(page1.items).toHaveLength(20);
    expect(page1.items[0]?.id).toBe("env-20");
    expect(page1.items[19]?.id).toBe("env-01");
    expect(await (await api("/api/environments?type=personal&page=2&pageSize=20", a)).json()).toMatchObject({ items: [{ id: "env-00" }], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } });
    expect(await (await api("/api/environments?type=personal&page=3&pageSize=20", a)).json()).toEqual({ items: [], pagination: { page: 3, pageSize: 20, total: 21, totalPages: 2 } });
    for (const size of [50, 100]) {
      expect(await (await api(`/api/environments?pageSize=${size}`, a)).json()).toMatchObject({ pagination: { total: 22, pageSize: size, totalPages: 1 } });
    }
  });

  it.each(["page=0", "page=1&page=2", "pageSize=10", "pageSize=20&pageSize=50", "page=501", "cursor=bad", "memberId=member-b", "type=cloud", "type=personal&type=temporary"])("rejects invalid list query %s", async (query) => {
    expect((await api(`/api/environments?${query}`, a)).status).toBe(400);
  });

  it.each([
    { memberId: "member-b" }, { id: "client-selected-id" }, { command: "echo secret" },
    { type: "cloud" }, { name: " " }, { name: "x".repeat(121) }, { operationId: "" },
    { operationId: "a".repeat(129) }, { taskId: 12 }, { taskId: "" },
  ])("rejects malformed or unexpected create fields %j", async (input) => {
    expect((await create(a, input)).status).toBe(400);
  });

  it("normalizes whitespace and omitted nullable fields for operation replays", async () => {
    const first = await create(a, { name: "  研究环境  " });
    expect(first.status).toBe(201);
    expect(await (await create(a, { taskId: null })).json()).toEqual(await first.json());
    expect((await create(a, { type: "temporary" })).status).toBe(409);
  });

  it("requires an explicit VM grant even for an existing task user or administrator", async () => {
    expect((await api("/api/environments", "")).status).toBe(401);
    expect((await api("/api/environments", denied)).status).toBe(403);
    await env.DB.prepare("UPDATE members SET role = 'admin' WHERE id = 'member-denied'").run();
    expect((await api("/api/environments", denied)).status).toBe(403);
    await env.DB.prepare("UPDATE roles SET status = 'disabled' WHERE id = 'test-vm'").run();
    expect((await api("/api/environments", a)).status).toBe(403);
  });

  it("rejects a correctly signed automation identity at the VM boundary", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomUUID().replaceAll("-", "");
    const encoder = new TextEncoder();
    const hash = await crypto.subtle.digest("SHA-256", encoder.encode(""));
    const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const canonical = ["GET", "/api/environments", timestamp, nonce, hex(hash)].join("\n");
    const key = await crypto.subtle.importKey("raw", encoder.encode("fake-automation-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const request = new Request(`${ORIGIN}/api/environments`, { headers: {
      authorization: "Bearer worker-test-token", "x-automation-id": "fake-automation-client-id",
      "x-automation-timestamp": timestamp, "x-automation-nonce": nonce,
      "x-automation-signature": hex(await crypto.subtle.sign("HMAC", key, encoder.encode(canonical))),
    } });
    const context = createExecutionContext();
    const response = await createApp().fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
    await waitOnExecutionContext(context);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN", retryable: false } });
  });

  it("blocks new metadata reads when the authenticated member is disabled", async () => {
    const created = await (await create(a)).json() as Created;
    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = 'member-a'").run();
    for (const path of [`/api/environments/${created.environment.id}`, "/api/environments"]) {
      const response = await api(path, a);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "MEMBER_DISABLED", retryable: false } });
    }
  });

  it("rejects cross-origin mutations and does not reserve their operation IDs", async () => {
    const forged = await create(a, {}, "https://evil.example");
    expect(forged.status).toBe(403);
    expect((await create(a)).status).toBe(201);
  });

  it("rejects query fields and unsupported methods on detail routes", async () => {
    const body = await (await create(a)).json() as Created;
    expect((await api(`/api/environments/${body.environment.id}?memberId=member-b`, a)).status).toBe(400);
    const patch = await api(`/api/environments/${body.environment.id}`, a, { method: "PUT", body: "{}" });
    expect(patch.status).toBe(405);
    expect(patch.headers.get("allow")).toBe("GET, PATCH, DELETE");
  });

  const mutate = (id: string, token: string, input: Record<string, unknown>, method = "PATCH") =>
    api(`/api/environments/${id}`, token, { method, body: JSON.stringify(input) });
  const report = (id: string, token: string, fields: Record<string, unknown> = {}, origin = ORIGIN) =>
    api(`/api/environments/${id}/operations`, token, { method: "POST", body: JSON.stringify({
      eventId: "event-1", runtimeId: "runtime-a", generation: 1, eventIndex: 1, event: "started", ...fields,
    }) }, origin);

  it("records browser-reported facts without changing metadata version or claiming runtime truth", async () => {
    const created = await (await create(a)).json() as Created;
    const response = await report(created.environment.id, a);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json() as { event: { receivedAt: string } };
    expect(body).toMatchObject({ event: { environmentId: created.environment.id, eventId: "event-1", runtimeId: "runtime-a", generation: 1, eventIndex: 1, event: "started" } });
    expect(Number.isFinite(Date.parse(body.event.receivedAt))).toBe(true);
    expect(await (await api(`/api/environments/${created.environment.id}`, a)).json()).toEqual(created);
    const history = await (await api(`/api/environments/${created.environment.id}/operations`, a)).json() as { items: Record<string, unknown>[] };
    expect(history.items[0]).toMatchObject({ kind: "environment.lifecycle", operationId: "event-1", source: "browser_report", lifecycle: { runtimeId: "runtime-a", generation: 1, eventIndex: 1, event: "started" } });
    expect(Object.keys(history.items[0]!).sort()).toEqual(["createdAt", "environmentId", "kind", "lifecycle", "operationId", "sequence", "source"]);
  });

  it("deduplicates concurrent reports and binds event IDs to the member-wide operation namespace", async () => {
    const { environment } = await (await create(a)).json() as Created;
    const replies = await Promise.all([report(environment.id, a), report(environment.id, a)]);
    expect(replies.map((r) => r.status)).toEqual([200, 200]);
    expect(await replies[0]!.json()).toEqual(await replies[1]!.json());
    expect((await report(environment.id, a, { event: "paused" })).status).toBe(409);
    expect((await report(environment.id, a, { eventId: "create-1" })).status).toBe(409);
    expect((await create(a, { operationId: "event-1" })).status).toBe(409);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM environment_operation_receipts").first("n")).toBe(2);
  });

  it("rejects old generations and occupied positions, but keeps controller incarnations independent", async () => {
    const { environment } = await (await create(a)).json() as Created;
    const first = await report(environment.id, a);
    expect(first.status).toBe(200);
    const original = await first.json();
    expect((await report(environment.id, a, { eventId: "new-gen", generation: 2, event: "restored" })).status).toBe(200);
    for (const fields of [{ generation: 1, eventIndex: 99 }, { generation: 2, eventIndex: 1 }]) {
      const stale = await report(environment.id, a, { eventId: "stale", ...fields });
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({ error: { code: "ENVIRONMENT_EVENT_STALE", retryable: false } });
    }
    expect((await report(environment.id, a, { eventId: "stale", generation: 2, eventIndex: 2, event: "paused" })).status).toBe(200);
    expect((await report(environment.id, a, { eventId: "other-runtime", runtimeId: "runtime-b", event: "failed" })).status).toBe(200);
    expect(await (await report(environment.id, a)).json()).toEqual(original);
    expect(await env.DB.prepare("SELECT generation, event_index FROM environment_runtime_heads WHERE runtime_id = 'runtime-a'").first()).toEqual({ generation: 2, event_index: 2 });
  });

  it("accepts only one concurrent report for a runtime position", async () => {
    const { environment } = await (await create(a)).json() as Created;
    const responses = await Promise.all([report(environment.id, a), report(environment.id, a, { eventId: "other-event" })]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await responses.find((r) => r.status === 409)!.json()).toMatchObject({ error: { code: "ENVIRONMENT_EVENT_STALE" } });
  });

  it.each(["started", "restored", "paused", "resumed", "checkpoint_saved", "stopped", "failed"])("accepts bounded %s facts without interpreting them as executable instructions", async (event) => {
    const { environment } = await (await create(a)).json() as Created;
    expect((await report(environment.id, a, { event })).status).toBe(200);
    expect(await (await api(`/api/environments/${environment.id}`, a)).json()).toMatchObject({ environment: { version: 1 } });
  });

  it("does not record a persistent checkpoint for a temporary environment", async () => {
    const { environment } = await (await create(a, { type: "temporary" })).json() as Created;
    const response = await report(environment.id, a, { event: "checkpoint_saved" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "ENVIRONMENT_PERSISTENCE_UNSUPPORTED" } });
    expect((await report(environment.id, a)).status).toBe(200);
  });

  it.each([{ event: "execute" }, { command: "secret" }, { output: "secret" }, { memberId: "member-b" },
    { generation: 0 }, { generation: 1.5 }, { eventIndex: 0 }, { eventIndex: Number.MAX_SAFE_INTEGER },
    { eventId: "" }, { runtimeId: "" }, { runtimeId: "x".repeat(129) }, { operationId: "other" }, { receivedAt: "forged" },
  ])("rejects malformed or sensitive report fields %j", async (fields) => {
    const { environment } = await (await create(a)).json() as Created;
    expect((await report(environment.id, a, fields)).status).toBe(400);
  });

  it("enforces owner, permission, session and origin checks on event reports", async () => {
    const { environment } = await (await create(a)).json() as Created;
    expect((await report(environment.id, b)).status).toBe(404);
    expect((await report("missing", b)).status).toBe(404);
    expect((await report(environment.id, denied)).status).toBe(403);
    expect((await report(environment.id, "")).status).toBe(401);
    expect((await report(environment.id, a, {}, "https://evil.example")).status).toBe(403);
    expect((await report(environment.id, a)).status).toBe(200);
  });

  it("rolls back a report receipt when its ordering head fails to persist", async () => {
    const { environment } = await (await create(a)).json() as Created;
    await env.DB.exec("CREATE TRIGGER reject_runtime_head BEFORE INSERT ON environment_runtime_heads BEGIN SELECT RAISE(ABORT, 'injected failure'); END;");
    expect((await report(environment.id, a)).status).toBe(500);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM environment_operation_receipts").first("n")).toBe(1);
    await env.DB.exec("DROP TRIGGER reject_runtime_head;");
    expect((await report(environment.id, a)).status).toBe(200);
  });

  it("preserves old report replies after deletion without recreating ordering heads", async () => {
    const { environment } = await (await create(a)).json() as Created;
    const first = await report(environment.id, a);
    expect(first.status).toBe(200);
    const original = await first.json();
    expect((await mutate(environment.id, a, { operationId: "delete", version: 1 }, "DELETE")).status).toBe(200);
    expect(await (await report(environment.id, a)).json()).toEqual(original);
    expect((await report(environment.id, a, { eventId: "new-after-delete", eventIndex: 2 })).status).toBe(404);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM environment_runtime_heads").first("n")).toBe(0);
  });

  it("lists only owned deletion markers with strict append-stable numbered pagination", async () => {
    for (let index = 0; index < 23; index++) {
      const token = index === 22 ? b : a;
      const { environment } = await (await create(token, { operationId: `create-${index}` })).json() as Created;
      expect((await mutate(environment.id, token, { operationId: `delete-${index}`, version: 1 }, "DELETE")).status).toBe(200);
    }
    const path = "/api/environments/tombstones";
    const first = await api(path, a);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    const page1 = await first.json() as { items: { environmentId: string }[] };
    expect(page1.items).toHaveLength(20);
    expect(Object.keys(page1.items[0]!).sort()).toEqual(["deletedAt", "environmentId", "version"]);
    const { environment } = await (await create(a, { operationId: "append" })).json() as Created;
    await mutate(environment.id, a, { operationId: "append-delete", version: 1 }, "DELETE");
    const page2 = await (await api(`${path}?page=2`, a)).json() as { items: { environmentId: string }[] };
    expect(page2).toMatchObject({ pagination: { page: 2, pageSize: 20, total: 23, totalPages: 2 } });
    expect(page2.items).toHaveLength(3);
    expect(page2.items[2]!.environmentId).toBe(environment.id);
    expect(new Set([...page1.items, ...page2.items].map((row) => row.environmentId)).size).toBe(23);
    for (const size of [50, 100]) expect(await (await api(`${path}?pageSize=${size}`, a)).json()).toMatchObject({ pagination: { pageSize: size, total: 23 } });
    expect(await (await api(path, b)).json()).toMatchObject({ pagination: { total: 1 } });
    for (const query of ["page=0", "page=1&page=2", "pageSize=10", "memberId=member-b", "cursor=1", "page=501"]) expect((await api(`${path}?${query}`, a)).status).toBe(400);
    expect((await api(path, denied)).status).toBe(403);
    expect((await api(path, "")).status).toBe(401);
    expect((await api(path, a, { method: "DELETE" })).status).toBe(405);
  });

  it("updates only submitted fields and replays the original response after subsequent changes", async () => {
    await seedTask("task-one", "member-a");
    const { environment: initial } = await (await create(a, { taskId: "task-one" })).json() as Created;
    const input = { operationId: "edit-1", version: 1, name: "  新名称  " };
    const first = await mutate(initial.id, a, input);
    expect(first.status).toBe(200);
    const original = await first.json();
    expect(original).toMatchObject({ environment: { name: "新名称", taskId: "task-one", version: 2, type: "personal" } });
    expect((await mutate(initial.id, a, { operationId: "edit-2", version: 2, taskId: null })).status).toBe(200);
    expect(await (await mutate(initial.id, a, input)).json()).toEqual(original);
    expect(await (await api(`/api/environments/${initial.id}`, a)).json()).toMatchObject({ environment: { version: 3, taskId: null, name: "新名称" } });
  });

  it("serializes competing versions and leaves the rejected operation available for corrected retry", async () => {
    const { environment } = await (await create(a)).json() as Created;
    const inputs = [{ operationId: "left", version: 1, name: "left" }, { operationId: "right", version: 1, name: "right" }];
    const responses = await Promise.all(inputs.map((input) => mutate(environment.id, a, input)));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = responses.findIndex((r) => r.status === 409);
    expect(await responses[loser]!.json()).toMatchObject({ error: { code: "ENVIRONMENT_VERSION_CONFLICT", retryable: false } });
    expect((await mutate(environment.id, a, { ...inputs[loser], version: 2 })).status).toBe(200);
  });

  it("deduplicates concurrent patches without repeating the version increment", async () => {
    const { environment } = await (await create(a)).json() as Created;
    const input = { operationId: "edit", version: 1, name: "once" };
    const responses = await Promise.all([mutate(environment.id, a, input), mutate(environment.id, a, input)]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(await responses[0]!.json()).toEqual(await responses[1]!.json());
    expect(await (await api(`/api/environments/${environment.id}`, a)).json()).toMatchObject({ environment: { version: 2 } });
  });

  it("rejects conflicting concurrent content under one update operation ID", async () => {
    const { environment } = await (await create(a)).json() as Created;
    const responses = await Promise.all(["left", "right"].map((name) => mutate(environment.id, a, { operationId: "edit", version: 1, name })));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await responses.find((r) => r.status === 409)!.json()).toMatchObject({ error: { code: "ENVIRONMENT_OPERATION_CONFLICT" } });
    expect(await (await api(`/api/environments/${environment.id}`, a)).json()).toEqual(await responses.find((r) => r.status === 200)!.json());
  });

  it("allows only one winning mutation when edit and delete race on the same version", async () => {
    const { environment } = await (await create(a)).json() as Created;
    const [edit, deletion] = await Promise.all([
      mutate(environment.id, a, { operationId: "edit", version: 1, name: "race" }),
      mutate(environment.id, a, { operationId: "delete", version: 1 }, "DELETE"),
    ]);
    expect([edit, deletion].filter((r) => r.status === 200)).toHaveLength(1);
    const live = await api(`/api/environments/${environment.id}`, a);
    if (edit.status === 200) {
      expect(deletion.status).toBe(409);
      expect(await live.json()).toMatchObject({ environment: { version: 2, name: "race" } });
      expect(await env.DB.prepare("SELECT count(*) AS n FROM environment_tombstones").first("n")).toBe(0);
    } else {
      expect(edit.status).toBe(404);
      expect(live.status).toBe(404);
      expect(await env.DB.prepare("SELECT count(*) AS n FROM environment_tombstones").first("n")).toBe(1);
    }
    expect(await env.DB.prepare("SELECT count(*) AS n FROM environment_operation_receipts").first("n")).toBe(2);
  });

  it("binds an operation to its kind and target across create, update and delete", async () => {
    const { environment } = await (await create(a)).json() as Created;
    const other = await (await create(a, { operationId: "create-2" })).json() as Created;
    for (const method of ["PATCH", "DELETE"]) {
      const response = await mutate(environment.id, a, { operationId: "create-1", version: 1, ...(method === "PATCH" ? { name: "no" } : {}) }, method);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: "ENVIRONMENT_OPERATION_CONFLICT" } });
    }
    expect((await mutate(environment.id, a, { operationId: "edit", version: 1, name: "yes" })).status).toBe(200);
    expect((await mutate(other.environment.id, a, { operationId: "edit", version: 1, name: "yes" })).status).toBe(409);
    expect((await create(a, { operationId: "edit" })).status).toBe(409);
  });

  it("hides foreign targets and rejects missing or foreign task links without consuming an operation", async () => {
    const { environment } = await (await create(a)).json() as Created;
    await seedTask("foreign", "member-b");
    await seedTask("own", "member-a");
    for (const method of ["PATCH", "DELETE"]) {
      const input = { operationId: `foreign-${method}`, version: 1, ...(method === "PATCH" ? { name: "no" } : {}) };
      expect((await mutate(environment.id, b, input, method)).status).toBe(404);
      expect((await mutate("missing", b, input, method)).status).toBe(404);
      expect((await mutate(environment.id, denied, input, method)).status).toBe(403);
    }
    for (const taskId of ["foreign", "missing"]) {
      const response = await mutate(environment.id, a, { operationId: "link", version: 1, taskId });
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: "ENVIRONMENT_TASK_NOT_FOUND" } });
    }
    expect((await mutate(environment.id, a, { operationId: "link", version: 1, taskId: "own" })).status).toBe(200);
  });

  it("invalidates stale versions when a linked task is deleted", async () => {
    await seedTask("own", "member-a");
    const { environment } = await (await create(a, { taskId: "own" })).json() as Created;
    await env.DB.prepare("DELETE FROM tasks WHERE id = 'own'").run();
    expect(await (await api(`/api/environments/${environment.id}`, a)).json()).toMatchObject({ environment: { taskId: null, version: 2 } });
    expect((await mutate(environment.id, a, { operationId: "stale", version: 1, name: "stale" })).status).toBe(409);
  });

  it.each([
    {}, { version: 0, name: "a" }, { version: 1.5, name: "a" }, { version: Number.MAX_SAFE_INTEGER, name: "a" },
    { version: 1, name: "" }, { version: 1, type: "temporary" }, { version: 1, memberId: "member-b" },
    { version: 1, taskId: 1 }, { version: 1, command: "secret" }, { version: 1, name: null },
  ])("rejects malformed patch %j", async (fields) => {
    const { environment } = await (await create(a)).json() as Created;
    expect((await mutate(environment.id, a, { operationId: "invalid", ...fields })).status).toBe(400);
  });

  it("atomically deletes metadata, retains a minimal tombstone and replays without resurrection", async () => {
    const created = await (await create(a)).json() as Created;
    const id = created.environment.id;
    const edit = { operationId: "edit", version: 1, name: "edited" };
    const edited = await (await mutate(id, a, edit)).json();
    const input = { operationId: "delete", version: 2 };
    const responses = await Promise.all([mutate(id, a, input, "DELETE"), mutate(id, a, input, "DELETE")]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const deleted = await responses[0]!.json() as { tombstone: { environmentId: string; version: number; deletedAt: string } };
    expect(await responses[1]!.json()).toEqual(deleted);
    expect(deleted).toMatchObject({ tombstone: { environmentId: id, version: 3 } });
    expect(Number.isFinite(Date.parse(deleted.tombstone.deletedAt))).toBe(true);
    expect(await env.DB.prepare("SELECT member_id, environment_id, version FROM environment_tombstones").first()).toEqual({ member_id: "member-a", environment_id: id, version: 3 });
    expect((await api(`/api/environments/${id}`, a)).status).toBe(404);
    expect((await api(`/api/environments/${id}/operations`, a)).status).toBe(404);
    expect(await (await api("/api/environments", a)).json()).toMatchObject({ items: [], pagination: { total: 0 } });
    expect(await (await create(a)).json()).toEqual(created);
    expect(await (await mutate(id, a, edit)).json()).toEqual(edited);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM browser_environments").first("n")).toBe(0);
    expect((await mutate(id, a, { operationId: "new-delete", version: 3 }, "DELETE")).status).toBe(404);
  });

  it("rejects stale or malformed deletion and foreign-origin mutations", async () => {
    const { environment } = await (await create(a)).json() as Created;
    expect((await mutate(environment.id, a, { operationId: "delete", version: 2 }, "DELETE")).status).toBe(409);
    expect((await mutate(environment.id, a, { operationId: "delete", version: 1, force: true }, "DELETE")).status).toBe(400);
    for (const method of ["PATCH", "DELETE"]) {
      const body = { operationId: "forged", version: 1, ...(method === "PATCH" ? { name: "no" } : {}) };
      expect((await api(`/api/environments/${environment.id}`, a, { method, body: JSON.stringify(body) }, "https://evil.example")).status).toBe(403);
    }
    expect((await mutate(environment.id, a, { operationId: "delete", version: 1 }, "DELETE")).status).toBe(200);
  });

  it.each(["PATCH", "DELETE"])("rolls back the %s receipt and tombstone when entity mutation fails", async (method) => {
    const { environment } = await (await create(a)).json() as Created;
    const action = method === "PATCH" ? "UPDATE" : "DELETE";
    await env.DB.exec(`CREATE TRIGGER reject_environment_mutation BEFORE ${action} ON browser_environments BEGIN SELECT RAISE(ABORT, 'injected failure'); END;`);
    const input = { operationId: "retryable-after-rollback", version: 1, ...(method === "PATCH" ? { name: "saved" } : {}) };
    expect((await mutate(environment.id, a, input, method)).status).toBe(500);
    await env.DB.exec("DROP TRIGGER reject_environment_mutation;");
    expect(await env.DB.prepare("SELECT count(*) AS n FROM environment_operation_receipts").first("n")).toBe(1);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM environment_tombstones").first("n")).toBe(0);
    expect(await (await api(`/api/environments/${environment.id}`, a)).json()).toMatchObject({ environment: { version: 1 } });
    expect((await mutate(environment.id, a, input, method)).status).toBe(200);
  });

  it("paginates owner-scoped operation facts by sequence without exposing stored response bodies", async () => {
    const { environment } = await (await create(a)).json() as Created;
    await create(b);
    await create(a, { operationId: "other-environment" });
    for (let version = 1; version <= 21; version++) {
      expect((await mutate(environment.id, a, { operationId: `edit-${version}`, version, name: `private-${version}` })).status).toBe(200);
    }
    const path = `/api/environments/${environment.id}/operations`;
    const response = await api(path, a);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json() as { items: { sequence: number; operationId: string }[] };
    expect(body.items).toHaveLength(20);
    expect(body.items[0]).toMatchObject({ operationId: "edit-21", kind: "environment.update", environmentId: environment.id });
    expect(Object.keys(body.items[0]!).sort()).toEqual(["createdAt", "environmentId", "kind", "operationId", "sequence"]);
    expect(body.items[0]!.sequence).toBeGreaterThan(body.items[19]!.sequence);
    expect(await (await api(`${path}?page=2`, a)).json()).toMatchObject({ items: [{ operationId: "edit-1" }, { operationId: "create-1" }], pagination: { total: 22, totalPages: 2, page: 2, pageSize: 20 } });
    for (const size of [50, 100]) expect(await (await api(`${path}?pageSize=${size}`, a)).json()).toMatchObject({ pagination: { pageSize: size, total: 22 } });
    for (const query of ["page=0", "page=1&page=2", "pageSize=10", "pageSize=20&pageSize=50", "memberId=member-b", "page=501"]) {
      expect((await api(`${path}?${query}`, a)).status).toBe(400);
    }
    expect((await api(path, b)).status).toBe(404);
    expect((await api(path, denied)).status).toBe(403);
    expect(await (await api(`${path}?page=3`, a)).json()).toMatchObject({ items: [], pagination: { total: 22, totalPages: 2, page: 3 } });
  });

  it("preserves existing receipts and ordered deletion markers across the lifecycle migration", async () => {
    await reset();
    const index = MIGRATIONS.findIndex((migration) => migration.name.startsWith("0040_"));
    expect(index).toBeGreaterThan(0);
    await applyD1Migrations(env.DB, MIGRATIONS.slice(0, index));
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-a', 'subject-a', 'a@example.test', 'contributor', 'active', ?, ?)").bind(now, now).run();
    for (const [operation, kind, sequence] of [["old-edit", "environment.update", 8], ["old-delete", "environment.delete", 19]] as const) {
      await env.DB.prepare("INSERT INTO environment_operation_receipts (sequence, member_id, operation_id, kind, request_hash, environment_id, claim_id, response_json, created_at) VALUES (?, 'member-a', ?, ?, ?, 'old-environment', ?, ?, 1000)")
        .bind(sequence, operation, kind, "a".repeat(64), `claim-${operation}`, JSON.stringify({ preserved: operation })).run();
    }
    await env.DB.prepare("INSERT INTO environment_tombstones (member_id, environment_id, version, deleted_at) VALUES ('member-a', 'newer', 5, 2000), ('member-a', 'older', 3, 1000)").run();
    const before = await env.DB.prepare("SELECT * FROM environment_operation_receipts ORDER BY sequence").all();
    await applyD1Migrations(env.DB, MIGRATIONS.slice(index));
    const after = await env.DB.prepare("SELECT * FROM environment_operation_receipts ORDER BY sequence").all();
    expect(after.results).toEqual(before.results.map((row) => ({ ...row, lifecycle_json: null })));
    const markers = await env.DB.prepare("SELECT environment_id, version, deleted_at, sequence FROM environment_tombstones ORDER BY sequence").all();
    expect(markers.results).toEqual([
      { environment_id: "older", version: 3, deleted_at: 1000, sequence: 1 },
      { environment_id: "newer", version: 5, deleted_at: 2000, sequence: 2 },
    ]);
    await env.DB.prepare("INSERT INTO environment_tombstones (member_id, environment_id, version, deleted_at) VALUES ('member-a', 'appended', 2, 500)").run();
    expect(await env.DB.prepare("SELECT sequence FROM environment_tombstones WHERE environment_id = 'appended'").first("sequence")).toBe(3);
  });

  it("preserves pre-upgrade creation replies and promotes them to the shared operation namespace", async () => {
    // Rebuild only the disposable test database at the preceding migration.
    await reset();
    const index = MIGRATIONS.findIndex((migration) => migration.name.startsWith("0039_"));
    expect(index).toBeGreaterThan(0);
    await applyD1Migrations(env.DB, MIGRATIONS.slice(0, index));
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-a', 'subject-a', 'a@example.test', 'contributor', 'active', ?, ?)").bind(now, now).run();
    await env.DB.prepare("INSERT INTO roles (id, key, name, allow_bits, status, is_system, created_at, updated_at) VALUES ('test-vm', 'test-vm', 'VM', '0x200000', 'active', 0, ?, ?)").bind(now, now).run();
    await env.DB.prepare("INSERT INTO role_members (role_id, member_id, created_at) VALUES ('test-vm', 'member-a', ?)").bind(now).run();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => new Date() });
    a = (await sessions.create((await members.findByIdentitySubject("subject-a"))!)).token;
    const original = { environment: { id: "legacy-environment", memberId: "member-a", name: "研究环境", type: "personal", taskId: null, version: 1, createdAt: now, updatedAt: now } };
    // Frozen pre-upgrade normalized create digest, not obtained from production helpers.
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode('{"kind":"environment.create","memberId":"member-a","name":"研究环境","type":"personal","taskId":null}'));
    const hash = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("INSERT INTO browser_environments (id, member_id, name, type, version, created_at, updated_at) VALUES ('legacy-environment', 'member-a', '研究环境', 'personal', 1, ?, ?)").bind(Date.parse(now), Date.parse(now)).run();
    await env.DB.prepare("INSERT INTO environment_create_receipts (member_id, operation_id, request_hash, environment_id, response_json, created_at) VALUES ('member-a', 'create-1', ?, 'legacy-environment', ?, ?)").bind(hash, JSON.stringify(original), Date.parse(now)).run();
    await applyD1Migrations(env.DB, MIGRATIONS.slice(index));
    const replay = await create(a);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(original);
    expect((await mutate("legacy-environment", a, { operationId: "create-1", version: 1, name: "no" })).status).toBe(409);
    expect(await (await api("/api/environments/legacy-environment/operations", a)).json()).toMatchObject({ items: [{ operationId: "create-1", kind: "environment.create" }], pagination: { total: 1 } });
  });
});

function create(token: string, input: Record<string, unknown> = {}, origin = ORIGIN): Promise<Response> {
  return api("/api/environments", token, {
    method: "POST", body: JSON.stringify({ operationId: "create-1", name: "研究环境", type: "personal", ...input }),
  }, origin);
}

async function api(path: string, token: string, init: RequestInit = {}, origin = ORIGIN): Promise<Response> {
  const headers = new Headers({ origin, "content-type": "application/json" });
  if (token) headers.set("cookie", `__Host-memory-session=${token}`);
  const context = createExecutionContext();
  const response = await createApp().fetch!(new Request(`${ORIGIN}${path}`, { ...init, headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}

async function seedTask(id: string, memberId: string): Promise<void> {
  await env.DB.prepare("INSERT INTO tasks (id, member_id, title, status, progress, priority, created_at, updated_at) VALUES (?, ?, 'Task', 'todo', 0, 'medium', 1000, 1000)").bind(id, memberId).run();
}
