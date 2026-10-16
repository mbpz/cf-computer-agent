/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { AdminSummaryRepository } from "../../src/admin-summary/repository";
import { AuditRepository } from "../../src/audit/repository";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";

// The trend window is the last 7 UTC days ending on 2026-08-28, inclusive.
const NOW = "2026-08-28T12:00:00.000Z";
const WINDOW_START = "2026-08-22T00:00:00.000Z";
const WINDOW_END = "2026-08-29T00:00:00.000Z";
const TREND_DAYS = ["2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"];
const HASH = "a".repeat(64);

interface TrendPoint { day: string; submissions: number; publications: number; }
interface ActivityEvent {
  id: string; actorKind: string; actorId: string | null; action: string;
  resourceType: string; resourceId: string | null; metadata: unknown; createdAt: string;
}
interface SummaryBody { trend: TrendPoint[]; activity: ActivityEvent[]; }
interface AuditEventRow {
  id: string; actor_kind: string; actor_id: string | null; action: string;
  resource_type: string; resource_id: string | null; metadata: string; created_at: string;
}

let admin = "";
let contributor = "";

describe("administration dashboard summary", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
        ('summary-admin', 'subject-summary-admin', 'summary-admin@example.test', 'admin', 'active', ?, ?),
        ('summary-contributor', 'subject-summary-contributor', 'summary-contributor@example.test', 'contributor', 'active', ?, ?)`,
    ).bind(NOW, NOW, NOW, NOW).run();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
    admin = (await sessions.create((await members.findById("summary-admin"))!)).token;
    contributor = (await sessions.create((await members.findById("summary-contributor"))!)).token;
    await seedBusinessRows();
    await seedAuditEvents();
  });

  it("returns a real seven-day trend that sums to the same-window totals and the newest audit rows", async () => {
    const body = await summaryBody(admin);

    expect(body.trend).toEqual([
      { day: "2026-08-22", submissions: 0, publications: 0 },
      { day: "2026-08-23", submissions: 1, publications: 0 },
      { day: "2026-08-24", submissions: 1, publications: 0 },
      { day: "2026-08-25", submissions: 0, publications: 0 },
      { day: "2026-08-26", submissions: 1, publications: 2 },
      { day: "2026-08-27", submissions: 0, publications: 0 },
      { day: "2026-08-28", submissions: 3, publications: 1 },
    ]);
    expect(body.trend.map((point) => point.day)).toEqual(TREND_DAYS);
    await expect(groupedTotals("submissions", "created_at")).resolves.toEqual(new Map([
      ["2026-08-23", 1], ["2026-08-24", 1], ["2026-08-26", 1], ["2026-08-28", 3],
    ]));

    // The day buckets are the business tables, not an estimate: they reconcile to
    // the same window the guarded SQL query reads.
    const submittedInWindow = await scalar("SELECT COUNT(*) AS total FROM submissions WHERE created_at >= ? AND created_at < ?", WINDOW_START, WINDOW_END);
    const publishedInWindow = await scalar("SELECT COUNT(*) AS total FROM revisions WHERE published_at >= ? AND published_at < ?", WINDOW_START, WINDOW_END);
    expect(body.trend.reduce((sum, point) => sum + point.submissions, 0)).toBe(submittedInWindow);
    expect(body.trend.reduce((sum, point) => sum + point.publications, 0)).toBe(publishedInWindow);
    expect(submittedInWindow).toBe(6);
    expect(publishedInWindow).toBe(3);

    const newest = await env.DB.prepare(
      `SELECT id, actor_kind, actor_id, action, resource_type, resource_id, metadata, created_at
       FROM audit_events ORDER BY created_at DESC, id DESC LIMIT 5`,
    ).all<AuditEventRow>();
    expect(body.activity).toEqual(newest.results.map((row) => ({
      id: row.id, actorKind: row.actor_kind, actorId: row.actor_id, action: row.action,
      resourceType: row.resource_type, resourceId: row.resource_id, metadata: JSON.parse(row.metadata), createdAt: row.created_at,
    })));
    expect(body.activity).toHaveLength(5);
    expect(body.activity[0]?.id).toBe("audit-07");
    expect(body.activity.map((event) => event.id)).not.toContain("audit-01");
  });

  it("reconciles card totals and the summary after a real decision write through the worker HTTP path", async () => {
    const before = await summaryBody(admin);
    expect(before.activity.map((event) => event.action)).not.toContain("submission.rejected");
    expect(await cardPendingTotal()).toBe(2);
    expect(await cardPendingTotal()).toBe(await scalar("SELECT COUNT(*) AS total FROM submissions WHERE status = 'review_pending'"));

    const decision = await api("/api/admin/submissions/submission-pending-1/reject", admin, {
      method: "POST",
      body: JSON.stringify({ reasonCode: "duplicate", note: "Already covered elsewhere" }),
    });
    expect(decision.status).toBe(200);

    const pending = await scalar("SELECT COUNT(*) AS total FROM submissions WHERE status = 'review_pending'");
    expect(pending).toBe(1);
    // After the write, re-entering /admin re-reads the tables: the card projection
    // and the summary both equal direct queries instead of a cached total.
    expect(await cardPendingTotal()).toBe(pending);
    expect(await cardAssetTotal()).toBe(await scalar("SELECT COUNT(*) AS total FROM assets a JOIN parse_jobs j ON j.asset_id = a.id"));
    expect(await cardMemberTotal()).toBe(await scalar("SELECT COUNT(*) AS total FROM members"));
    const after = await summaryBody(admin);
    expect(after.activity[0]).toMatchObject({ action: "submission.rejected", resourceType: "submission", resourceId: "submission-pending-1" });
    expect(after.activity).toHaveLength(5);
    expect(await scalar("SELECT COUNT(*) AS total FROM audit_events WHERE action = 'submission.rejected'")).toBe(1);
  });

  it("rejects replayed query fields, anonymous reads and non-GET methods", async () => {
    expect((await api("/api/admin/summary", admin, { method: "POST" })).status).toBe(405);
    const badQuery = await api("/api/admin/summary?days=7", admin);
    expect(badQuery.status).toBe(400);
    await expect(badQuery.json()).resolves.toMatchObject({ error: { code: "REQUEST_QUERY_INVALID" } });
    expect((await api("/api/admin/summary", contributor)).status).toBe(403);
    expect((await api("/api/admin/summary")).status).toBe(401);
  });

  it.each(["rejected", "failed", "missing", "bad-total", "extra-day", "duplicate-day", "absent-activity"])(
    "fails closed for a %s batch instead of inventing a zero summary",
    async (failure) => {
      const wrapped = new Proxy(env.DB, {
        get(target, key) {
          if (key === "batch") return async (statements: D1PreparedStatement[]) => {
            if (failure === "rejected") throw new Error("D1 unavailable");
            const results = await target.batch<Record<string, unknown>>(statements);
            if (failure === "failed") Object.assign(results[0], { success: false });
            if (failure === "missing") results.pop();
            if (failure === "bad-total") results[0].results = [{ day: "2026-08-28", total: "3" }];
            if (failure === "extra-day") results[0].results = [{ day: "2026-08-21", total: 1 }];
            if (failure === "duplicate-day") results[0].results = [{ day: "2026-08-28", total: 1 }, { day: "2026-08-28", total: 1 }];
            if (failure === "absent-activity") Object.assign(results[2], { results: null });
            return results;
          };
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const snapshot = new AdminSummaryRepository(wrapped, new AuditRepository(wrapped), () => new Date(NOW)).snapshot();
      if (failure === "rejected") await expect(snapshot).rejects.toThrow("D1 unavailable");
      else await expect(snapshot).rejects.toMatchObject({ code: "ADMIN_SUMMARY_RESULT_INVALID", status: 500 });
    },
  );
});

async function seedBusinessRows(): Promise<void> {
  await env.DB.prepare("INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at) VALUES ('space-summary', 'summary', 'Summary', '', 'shared', 'active', 3, 0, ?, ?)").bind(NOW, NOW).run();
  await env.DB.prepare(
    `INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, created_at, updated_at) VALUES
      ('submission-pending-1', 'summary-contributor', 'space-summary', NULL, 'markdown', 'review_pending', 'Pending one', '# One', '2026-08-28T01:00:00.000Z', '2026-08-28T01:00:00.000Z'),
      ('submission-pending-2', 'summary-contributor', 'space-summary', NULL, 'markdown', 'review_pending', 'Pending two', '# Two', '2026-08-28T02:00:00.000Z', '2026-08-28T02:00:00.000Z'),
      ('submission-decided', 'summary-contributor', 'space-summary', NULL, 'markdown', 'rejected', 'Decided', '# Decided', '2026-08-24T05:00:00.000Z', '2026-08-24T05:00:00.000Z'),
      ('submission-outside', 'summary-contributor', 'space-summary', NULL, 'markdown', 'rejected', 'Outside', '# Outside', '2026-08-21T05:00:00.000Z', '2026-08-21T05:00:00.000Z'),
      ('submission-published-a', 'summary-contributor', 'space-summary', NULL, 'markdown', 'published', 'Published A', '# A', '2026-08-23T05:00:00.000Z', '2026-08-23T05:00:00.000Z'),
      ('submission-published-b', 'summary-contributor', 'space-summary', NULL, 'markdown', 'published', 'Published B', '# B', '2026-08-26T05:00:00.000Z', '2026-08-26T05:00:00.000Z'),
      ('submission-published-c', 'summary-contributor', 'space-summary', NULL, 'markdown', 'published', 'Published C', '# C', '2026-08-28T05:00:00.000Z', '2026-08-28T05:00:00.000Z'),
      ('submission-published-outside', 'summary-contributor', 'space-summary', NULL, 'markdown', 'published', 'Published outside', '# D', '2026-08-21T06:00:00.000Z', '2026-08-21T06:00:00.000Z')`,
  ).run();

  // The review preview joins source_versions, so every submission that a real
  // decision touches owns one source version of its own.
  const seeded: Array<[string, string, string, string | null, string]> = [
    ["source-pending-1", "version-pending-1", "submission-pending-1", null, "2026-08-28T01:00:00.000Z"],
    ["source-pending-2", "version-pending-2", "submission-pending-2", null, "2026-08-28T02:00:00.000Z"],
    ["source-a", "version-a", "submission-published-a", "knowledge-a", "2026-08-26T03:00:00.000Z"],
    ["source-b", "version-b", "submission-published-b", "knowledge-b", "2026-08-26T04:00:00.000Z"],
    ["source-c", "version-c", "submission-published-c", "knowledge-c", "2026-08-28T04:00:00.000Z"],
    ["source-d", "version-d", "submission-published-outside", "knowledge-d", "2026-08-21T04:00:00.000Z"],
  ];
  for (const [sourceId, versionId, submissionId, knowledgeItemId, publishedAt] of seeded) {
    await env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES (?, 'summary-admin', 'space-summary', NULL, 'markdown', ?, ?, ?)").bind(sourceId, versionId, publishedAt, publishedAt).run();
    await env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES (?, ?, ?, 1, ?, ?, 'm1-v1', ?)").bind(versionId, sourceId, submissionId, `# ${versionId}`, HASH, publishedAt).run();
    if (knowledgeItemId === null) continue;
    await env.DB.prepare("INSERT INTO knowledge_items (id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at) VALUES (?, 'space-summary', NULL, NULL, 'active', 'indexed', ?, ?)").bind(knowledgeItemId, publishedAt, publishedAt).run();
    await env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES (?, ?, ?, ?, ?, ?, '[]', 'shared', 'summary-admin', ?)").bind(versionId, knowledgeItemId, versionId, `/published/${versionId}.md`, HASH, versionId, publishedAt).run();
    await env.DB.prepare("UPDATE knowledge_items SET current_revision_id = ? WHERE id = ?").bind(versionId, knowledgeItemId).run();
  }

  await env.DB.prepare("INSERT INTO assets (id, owner_id, object_key, original_name, content_type, byte_size, content_sha256, idempotency_key, status, created_at, updated_at) VALUES ('asset-summary', 'summary-contributor', 'summary/object.txt', 'summary.txt', 'text/plain', 12, ?, 'summary-key', 'ready', ?, ?)").bind(HASH, NOW, NOW).run();
  await env.DB.prepare("INSERT INTO parse_jobs (id, asset_id, status, attempts, created_at, updated_at) VALUES ('job-summary', 'asset-summary', 'succeeded', 1, ?, ?)").bind(NOW, NOW).run();
}

async function seedAuditEvents(): Promise<void> {
  const login = JSON.stringify({ role: "contributor" });
  const created = JSON.stringify({ kind: "markdown", requestedSpaceId: "space-summary" });
  const published = JSON.stringify({ submissionId: "submission-published-a", revisionId: "version-a", visibility: "shared" });
  const updated = JSON.stringify({ previousAllowBits: "0x0", allowBits: "0x0" });
  const rows: Array<[string, string, string, number, string]> = [
    ["audit-01", "member.login", "member", 1, login],
    ["audit-02", "member.login", "member", 2, login],
    ["audit-03", "submission.created", "submission", 3, created],
    ["audit-04", "submission.created", "submission", 4, created],
    ["audit-05", "knowledge.published", "knowledge", 5, published],
    ["audit-06", "knowledge.published", "knowledge", 6, published],
    ["audit-07", "role.updated", "role", 7, updated],
  ];
  for (const [id, action, resourceType, second, metadata] of rows) {
    const createdAt = `2026-08-28T00:00:${String(second).padStart(2, "0")}.000Z`;
    await env.DB.prepare("INSERT INTO audit_events (id, actor_kind, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, 'member', 'summary-admin', ?, ?, NULL, ?, ?)")
      .bind(id, action, resourceType, metadata, createdAt).run();
  }
}

async function summaryBody(token: string): Promise<SummaryBody> {
  const response = await api("/api/admin/summary", token);
  expect(response.status).toBe(200);
  const raw: unknown = await response.json();
  if (!raw || typeof raw !== "object" || !("trend" in raw) || !("activity" in raw)
    || !Array.isArray(raw.trend) || !Array.isArray(raw.activity)) {
    throw new Error("Summary response is malformed");
  }
  return { trend: raw.trend, activity: raw.activity };
}

async function groupedTotals(table: "submissions" | "revisions", column: "created_at" | "published_at"): Promise<Map<string, number>> {
  const rows = await env.DB.prepare(`SELECT substr(${column}, 1, 10) AS day, COUNT(*) AS total FROM ${table} WHERE ${column} >= ? AND ${column} < ? GROUP BY day`).bind(WINDOW_START, WINDOW_END).all<{ day: string; total: number }>();
  return new Map(rows.results.map((row) => [row.day, row.total]));
}

async function scalar(sql: string, ...values: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql).bind(...values).first<{ total: number }>();
  if (!row) throw new Error("Expected one counting row");
  return row.total;
}

async function cardPendingTotal(): Promise<number> {
  return paginationTotal(await api("/api/admin/submissions?page=1&pageSize=20&status=review_pending", admin));
}

async function cardAssetTotal(): Promise<number> {
  return paginationTotal(await api("/api/admin/assets?page=1&pageSize=20", admin));
}

async function cardMemberTotal(): Promise<number> {
  return paginationTotal(await api("/api/admin/members?page=1&pageSize=20", admin));
}

async function paginationTotal(response: Response): Promise<number> {
  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("pagination" in body)) throw new Error("Card response has no pagination");
  const pagination = body.pagination;
  if (!pagination || typeof pagination !== "object" || !("total" in pagination) || typeof pagination.total !== "number") {
    throw new Error("Card response has no numeric total");
  }
  return pagination.total;
}

async function api(path: string, token?: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("cookie", `__Host-memory-session=${token}`);
  if (!headers.has("origin")) headers.set("origin", "https://memory.crgmhrc.asia");
  const request = new Request(`https://memory.crgmhrc.asia${path}`, { ...init, headers });
  const context = createExecutionContext();
  const response = await createApp({ analyticsNow: () => new Date(NOW) }).fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}
