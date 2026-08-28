/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { APP_CONFIG } from "../../src/config";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { MIGRATIONS } from "../fixtures/d1";

const now = "2026-08-23T00:00:00.000Z";
const sessions = new Map<string, string>();

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, MIGRATIONS);
  const members = new MembersRepository(env.DB);
  for (const id of ["asset-owner", "asset-other", "asset-admin"]) {
    const member = await members.insert({
      id,
      identitySubject: `github:${id}`,
      email: `${id}@example.test`,
      role: id === "asset-admin" ? "admin" : "contributor",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const service = new SessionService(env.DB, members, { now: () => new Date(now), waitUntil: () => undefined });
    sessions.set(id, (await service.create(member)).token);
  }
});

describe("M2 asset upload boundary", () => {
  it("exposes capacity only to administrators and reports free-tier storage as disabled", async () => {
    const contributor = await memberApi("asset-owner", "/api/admin/assets/capacity", undefined, createApp({ assetStorage: null }));
    expect(contributor.status).toBe(403);

    const admin = await memberApi("asset-admin", "/api/admin/assets/capacity", undefined, createApp({ assetStorage: null }));
    expect(admin.status).toBe(200);
    await expect(admin.json()).resolves.toEqual({
      storageEnabled: false,
      usedBytes: null,
      maxBytes: 9 * 1024 * 1024 * 1024,
      warningThresholdBytes: 8 * 1024 * 1024 * 1024,
      warning: false,
    });

    const query = await memberApi("asset-admin", "/api/admin/assets/capacity?limit=1", undefined, createApp({ assetStorage: null }));
    expect(query.status).toBe(400);
    await expect(query.json()).resolves.toMatchObject({ error: { code: "REQUEST_QUERY_INVALID" } });
  });

  it("returns a stable free-tier error before reading or persisting a binary upload", async () => {
    const response = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: {
        "content-type": "application/pdf",
        "x-asset-name": "guide.pdf",
        "idempotency-key": "free-text-mode-upload",
      },
      body: "%PDF-1.7\n",
    }, createApp({ assetStorage: null }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "ASSET_STORAGE_NOT_CONFIGURED",
        retryable: false,
      },
    });
  });

  it("persists a private R2 original and queued D1 parse job", async () => {
    const response = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: {
        "content-type": "application/pdf",
        "x-asset-name": "guide.pdf",
        "idempotency-key": "asset-upload-1",
      },
      body: "%PDF-1.7\n",
    });

    expect(response.status).toBe(201);
    const body = await response.json<{
      asset: { id: string; objectKey: string; status: string; byteSize: number; originalName: string };
      job: { assetId: string; status: string; attempts: number };
      uploadUrl?: string;
    }>();
    expect(body).toMatchObject({
      asset: { status: "ready", byteSize: 9, originalName: "guide.pdf", objectKey: expect.stringMatching(/^staging\//u) },
      job: { status: "queued", attempts: 0 },
    });
    expect(body.job.assetId).toBe(body.asset.id);
    expect(body.uploadUrl).toBeUndefined();
    const object = await testOriginals().get(body.asset.objectKey);
    expect(object).not.toBeNull();
    await expect(object!.text()).resolves.toBe("%PDF-1.7\n");

    const status = await memberApi("asset-owner", `/api/assets/${encodeURIComponent(body.asset.id)}`);
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toEqual(body);
  });

  it("replays an idempotent upload and hides another member's asset", async () => {
    const init: RequestInit = {
      method: "POST",
      headers: { "content-type": "text/plain", "x-asset-name": "notes.txt", "idempotency-key": "asset-upload-2" },
      body: "notes",
    };
    const first = await memberApi("asset-owner", "/api/assets", init);
    const firstBody = await first.json<{ asset: { id: string; objectKey: string } }>();
    const replay = await memberApi("asset-owner", "/api/assets", init);
    expect(replay.status).toBe(201);
    await expect(replay.json()).resolves.toEqual(firstBody);
    await expect(testOriginals().list()).resolves.toMatchObject({ objects: [{ key: firstBody.asset.objectKey }] });

    const hidden = await memberApi("asset-other", `/api/assets/${encodeURIComponent(firstBody.asset.id)}`);
    expect(hidden.status).toBe(404);
  });

  it("rejects unsupported types and bodies beyond the configured bound", async () => {
    const unsupported = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: { "content-type": "application/x-unknown", "x-asset-name": "file.bin", "idempotency-key": "asset-upload-3" },
      body: "body",
    });
    expect(unsupported.status).toBe(415);
    const oversized = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-asset-name": "large.txt", "idempotency-key": "asset-upload-4" },
      body: new Uint8Array(APP_CONFIG.maxAssetBytes + 1),
    });
    expect(oversized.status).toBe(413);

    const forgedMime = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-asset-name": "forged.pdf", "idempotency-key": "asset-upload-forged-mime" },
      body: "not a PDF",
    });
    expect(forgedMime.status).toBe(415);
    await expect(forgedMime.json()).resolves.toMatchObject({ error: { code: "ASSET_TYPE_MISMATCH" } });
  });

  it("processes a text original and exposes the succeeded parse state", async () => {
    const upload = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-asset-name": "notes.txt", "idempotency-key": "asset-parse-1" },
      body: "hello *world*",
    });
    const uploaded = await upload.json<{ asset: { id: string }; job: { status: string } }>();
    expect(uploaded.job.status).toBe("queued");

    const processed = await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}`, { method: "POST" });
    expect(processed.status).toBe(200);
    await expect(processed.json()).resolves.toMatchObject({
      asset: { id: uploaded.asset.id, status: "ready" },
      job: { status: "succeeded", attempts: 1, lastErrorCode: null },
    });
    await expect(testOriginals().get(`parsed/${uploaded.asset.id}.md`)).resolves.not.toBeNull();
  });

  it("atomically pairs a succeeded asset with its review submission", async () => {
    const upload = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-asset-name": "paired.txt", "idempotency-key": "asset-pair-1" },
      body: "paired source content",
    });
    const uploaded = await upload.json<{ asset: { id: string }; job: { status: string } }>();
    await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}`, { method: "POST" });

    const paired = await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "asset-pair-submission-1" },
      body: JSON.stringify({
        requestedSpaceId: "default", requestedCollectionId: null, requestedVisibility: "shared", title: "Paired source",
      }),
    });
    expect(paired.status).toBe(201);
    const body = await paired.json<{ submission: { id: string; assetId?: string; status: string } }>();
    expect(body.submission).toMatchObject({ assetId: uploaded.asset.id, status: "review_pending" });
    await expect(env.DB.prepare("SELECT submission_id FROM assets WHERE id = ?").bind(uploaded.asset.id).first())
      .resolves.toEqual({ submission_id: body.submission.id });
    await expect(env.DB.prepare("SELECT asset_id FROM submissions WHERE id = ?").bind(body.submission.id).first())
      .resolves.toEqual({ asset_id: uploaded.asset.id });

    const replay = await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "asset-pair-submission-1" },
      body: JSON.stringify({
        requestedSpaceId: "default", requestedCollectionId: null, requestedVisibility: "shared", title: "Paired source",
      }),
    });
    expect(replay.status).toBe(201);
    await expect(replay.json()).resolves.toMatchObject({ submission: { id: body.submission.id, assetId: uploaded.asset.id } });

    const conflicting = await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "asset-pair-submission-2" },
      body: JSON.stringify({
        requestedSpaceId: "default", requestedCollectionId: null, requestedVisibility: "shared", title: "Second submission",
      }),
    });
    expect(conflicting.status).toBe(409);
    await expect(conflicting.json()).resolves.toMatchObject({ error: { code: "ASSET_ALREADY_SUBMITTED" } });
  });

  it("does not create a submission while an asset parse is still queued", async () => {
    const upload = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-asset-name": "queued.txt", "idempotency-key": "asset-pair-queued" },
      body: "not ready",
    });
    const uploaded = await upload.json<{ asset: { id: string } }>();
    const response = await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "asset-pair-submission-queued" },
      body: JSON.stringify({
        requestedSpaceId: "default", requestedCollectionId: null, requestedVisibility: "shared", title: "Too soon",
      }),
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ASSET_RESULT_NOT_READY" } });
    await expect(env.DB.prepare("SELECT count(*) AS count FROM submissions WHERE asset_id = ?").bind(uploaded.asset.id).first())
      .resolves.toEqual({ count: 0 });
  });

  it("lets the failed-parse owner submit bounded Markdown as a reviewable alternative", async () => {
    const upload = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: { "content-type": "application/pdf", "x-asset-name": "manual.pdf", "idempotency-key": "asset-alternative-1" },
      body: "%PDF-1.7\n",
    });
    const uploaded = await upload.json<{ asset: { id: string } }>();
    await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}`, { method: "POST" });

    const alternative = await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}/alternative`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "alternative-submission-1" },
      body: JSON.stringify({
        requestedSpaceId: "default", requestedCollectionId: null, requestedVisibility: "shared",
        title: "Manual PDF notes", content: "# Recovered\n\nHuman supplied notes.",
      }),
    });
    expect(alternative.status).toBe(201);
    const body = await alternative.json<{ submission: { id: string; status: string; kind: string } }>();
    expect(body).toMatchObject({ submission: { status: "review_pending", kind: "markdown" } });
    await expect(env.DB.prepare("SELECT content FROM source_versions WHERE submission_id = ?").bind(body.submission.id).first())
      .resolves.toMatchObject({ content: "# Recovered\n\nHuman supplied notes.\n" });

    await expectApiError(memberApi("asset-other", `/api/assets/${uploaded.asset.id}/alternative`, {
      method: "POST",
      headers: { "idempotency-key": "alternative-submission-2" },
      body: JSON.stringify({ requestedSpaceId: "default", title: "Hidden", content: "Hidden" }),
    }), 404, "ASSET_NOT_FOUND");
  });

  it("cancels a queued upload, hides its metadata, and removes the staging object", async () => {
    const upload = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-asset-name": "cancel.txt", "idempotency-key": "asset-cancel-1" },
      body: "cancel me",
    });
    const uploaded = await upload.json<{ asset: { id: string; objectKey: string } }>();

    const cancelled = await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}/cancel`, { method: "POST" });
    expect(cancelled.status).toBe(204);
    await expectApiError(memberApi("asset-owner", `/api/assets/${uploaded.asset.id}`), 404, "ASSET_NOT_FOUND");
    await expect(testOriginals().get(uploaded.asset.objectKey)).resolves.toBeNull();
    await expect(env.DB.prepare("SELECT id FROM assets WHERE id = ?").bind(uploaded.asset.id).first()).resolves.toBeNull();
  });

  it("recovers an unfinished upload by idempotency key after a fresh request", async () => {
    const upload = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-asset-name": "resume.txt", "idempotency-key": "asset-resume-1" },
      body: "resume me",
    });
    const uploaded = await upload.json<{ asset: { id: string }; job: { status: string } }>();

    const resumed = await memberApi("asset-owner", "/api/assets/resume", {
      headers: { "idempotency-key": "asset-resume-1" },
    });
    expect(resumed.status).toBe(200);
    await expect(resumed.json()).resolves.toEqual(uploaded);
    await expect(env.DB.prepare("SELECT count(*) AS count FROM assets WHERE owner_id = 'asset-owner'").first())
      .resolves.toEqual({ count: 1 });

    await expectApiError(memberApi("asset-other", "/api/assets/resume", {
      headers: { "idempotency-key": "asset-resume-1" },
    }), 404, "ASSET_NOT_FOUND");
    await expectApiError(memberApi("asset-owner", "/api/assets/resume", {
      headers: { "idempotency-key": "" },
    }), 400, "ASSET_RESUME_INVALID");
  });

  it("does not cancel an asset that is already processing or parsed", async () => {
    const upload = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-asset-name": "keep.txt", "idempotency-key": "asset-cancel-2" },
      body: "keep me",
    });
    const uploaded = await upload.json<{ asset: { id: string } }>();
    await env.DB.prepare("UPDATE parse_jobs SET status = 'processing' WHERE asset_id = ?").bind(uploaded.asset.id).run();
    await expectApiError(memberApi("asset-owner", `/api/assets/${uploaded.asset.id}/cancel`, { method: "POST" }), 409, "ASSET_CANCEL_CONFLICT");
    await env.DB.prepare("UPDATE parse_jobs SET status = 'succeeded' WHERE asset_id = ?").bind(uploaded.asset.id).run();
    await expectApiError(memberApi("asset-owner", `/api/assets/${uploaded.asset.id}/cancel`, { method: "POST" }), 409, "ASSET_CANCEL_CONFLICT");
  });

  it("rejects alternatives while parsing or after a successful parse", async () => {
    const upload = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-asset-name": "ready.txt", "idempotency-key": "asset-alternative-2" },
      body: "already parsed",
    });
    const uploaded = await upload.json<{ asset: { id: string } }>();
    await expectApiError(memberApi("asset-owner", `/api/assets/${uploaded.asset.id}/alternative`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "alternative-submission-3" },
      body: JSON.stringify({ requestedSpaceId: "default", title: "Too soon", content: "Body" }),
    }), 409, "ASSET_ALTERNATIVE_NOT_ALLOWED");
    await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}`, { method: "POST" });
    await expectApiError(memberApi("asset-owner", `/api/assets/${uploaded.asset.id}/alternative`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "alternative-submission-4" },
      body: JSON.stringify({ requestedSpaceId: "default", title: "Already parsed", content: "Body" }),
    }), 409, "ASSET_ALTERNATIVE_NOT_ALLOWED");
  });

  it("keeps a missing original retryable and recovers after the object returns", async () => {
    const upload = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-asset-name": "recover.txt", "idempotency-key": "asset-recover-1" },
      body: "recover me",
    });
    const uploaded = await upload.json<{ asset: { id: string; objectKey: string } }>();
    await testOriginals().delete(uploaded.asset.objectKey);

    const missing = await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}`, { method: "POST" });
    expect(missing.status).toBe(200);
    await expect(missing.json()).resolves.toMatchObject({
      job: { status: "failed_retryable", lastErrorCode: "ASSET_ORIGINAL_MISSING" },
    });

    await testOriginals().put(uploaded.asset.objectKey, "recover me", { httpMetadata: { contentType: "text/plain" } });
    const recovered = await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}`, { method: "POST" });
    expect(recovered.status).toBe(200);
    await expect(recovered.json()).resolves.toMatchObject({ job: { status: "succeeded", lastErrorCode: null } });
  });

  it("downloads only the owner's original and completed parsed result", async () => {
    const upload = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-asset-name": "notes.txt", "idempotency-key": "asset-download-1" },
      body: "download me",
    });
    const uploaded = await upload.json<{ asset: { id: string } }>();

    const original = await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}/original`);
    expect(original.status).toBe(200);
    expect(original.headers.get("content-type")).toContain("text/plain");
    expect(original.headers.get("content-disposition")).toContain("notes.txt");
    await expect(original.text()).resolves.toBe("download me");

    const notReady = await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}/parsed`);
    expect(notReady.status).toBe(409);
    await expect(notReady.json()).resolves.toMatchObject({ error: { code: "ASSET_RESULT_NOT_READY", retryable: true } });

    await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}`, { method: "POST" });
    const parsed = await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}/parsed`);
    expect(parsed.status).toBe(200);
    expect(parsed.headers.get("content-type")).toContain("text/markdown");
    expect(parsed.headers.get("content-disposition")).toContain("notes.md");
    await expect(parsed.text()).resolves.toContain("download me");

    const hidden = await memberApi("asset-other", `/api/assets/${uploaded.asset.id}/original`);
    expect(hidden.status).toBe(404);
  });

  it("previews normalized Markdown with parser metadata for owners and administrators", async () => {
    const upload = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: { "content-type": "application/json", "x-asset-name": "settings.json", "idempotency-key": "asset-preview-1" },
      body: '{"enabled":true}\n',
    });
    const uploaded = await upload.json<{ asset: { id: string } }>();
    const before = await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}/preview`);
    expect(before.status).toBe(409);
    await expect(before.json()).resolves.toMatchObject({ error: { code: "ASSET_RESULT_NOT_READY", retryable: true } });

    await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}`, { method: "POST" });
    const ownerPreview = await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}/preview`);
    expect(ownerPreview.status).toBe(200);
    await expect(ownerPreview.json()).resolves.toMatchObject({
      assetId: uploaded.asset.id,
      markdown: expect.stringContaining("```json"),
      warnings: [],
      lineCount: expect.any(Number),
      codeMetadata: { language: "json", fileLabel: "settings.json", lineBaseline: 1 },
      parserSchemaVersion: "m1-v2",
    });

    const adminPreview = await memberApi("asset-admin", `/api/admin/assets/${uploaded.asset.id}/preview`);
    expect(adminPreview.status).toBe(200);
    await expect(adminPreview.json()).resolves.toMatchObject({ assetId: uploaded.asset.id, markdown: expect.stringContaining("enabled") });

    const hidden = await memberApi("asset-other", `/api/assets/${uploaded.asset.id}/preview`);
    expect(hidden.status).toBe(404);
  });

  it("lists owner-scoped assets with an opaque cursor and rejects cross-owner replay", async () => {
    for (const [name, key] of [["one.txt", "asset-list-1"], ["two.txt", "asset-list-2"]]) {
      await memberApi("asset-owner", "/api/assets", {
        method: "POST",
        headers: { "content-type": "text/plain", "x-asset-name": name, "idempotency-key": key },
        body: name,
      });
    }
    const first = await memberApi("asset-owner", "/api/assets?limit=1");
    expect(first.status).toBe(200);
    const firstBody = await first.json<{ items: Array<{ asset: { ownerId: string } }>; nextCursor?: string }>();
    expect(firstBody.items).toHaveLength(1);
    expect(firstBody.items[0]?.asset.ownerId).toBe("asset-owner");
    expect(firstBody.nextCursor).toBeTruthy();

    const replay = await memberApi("asset-other", `/api/assets?limit=1&cursor=${encodeURIComponent(firstBody.nextCursor!)}`);
    expect(replay.status).toBe(400);
    await expect(replay.json()).resolves.toMatchObject({ error: { code: "PAGE_INVALID" } });
  });

  it("lets an administrator inspect the parse queue, preview parsed content, and retry a failed job", async () => {
    const upload = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: { "content-type": "application/pdf", "x-asset-name": "broken.pdf", "idempotency-key": "admin-asset-1" },
      body: "%PDF-1.7\n",
    });
    const uploaded = await upload.json<{ asset: { id: string } }>();
    const contributorList = await memberApi("asset-owner", "/api/admin/assets");
    expect(contributorList.status).toBe(403);

    const adminList = await memberApi("asset-admin", "/api/admin/assets?status=queued&page=1&pageSize=20");
    expect(adminList.status).toBe(200);
    const adminBody = await adminList.json<Record<string, unknown>>();
    expect(adminBody).toMatchObject({ items: [{ asset: { id: uploaded.asset.id }, job: { status: "queued" } }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    expect(adminBody).not.toHaveProperty("nextCursor");

    await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}`, { method: "POST" });
    const failedList = await memberApi("asset-admin", "/api/admin/assets?status=failed_terminal&page=1&pageSize=20");
    await expect(failedList.json()).resolves.toMatchObject({ items: [{ asset: { id: uploaded.asset.id }, job: { status: "failed_terminal", attempts: 1, lastErrorCode: "ASSET_PDF_PARSE_UNSUPPORTED" } }] });

    const retry = await memberApi("asset-admin", `/api/admin/assets/${uploaded.asset.id}/retry`, { method: "POST" });
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ job: { status: "queued", attempts: 0 } });

    const previewBefore = await memberApi("asset-admin", `/api/admin/assets/${uploaded.asset.id}/parsed`);
    expect(previewBefore.status).toBe(409);

    const readyUpload = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-asset-name": "ready.txt", "idempotency-key": "admin-asset-ready" },
      body: "admin preview",
    });
    const ready = await readyUpload.json<{ asset: { id: string } }>();
    await memberApi("asset-owner", `/api/assets/${ready.asset.id}`, { method: "POST" });
    const previewAfter = await memberApi("asset-admin", `/api/admin/assets/${ready.asset.id}/parsed`);
    expect(previewAfter.status).toBe(200);
    await expect(previewAfter.text()).resolves.toContain("admin preview");
  });

  it.each(["cursor=legacy", "limit=20", "page=1&page=2", "pageSize=10", "page=501&pageSize=20", "unknown=1", "status=queued&status=processing"])("rejects invalid admin asset pagination query %s", async (query) => {
    await expectApiError(memberApi("asset-admin", `/api/admin/assets?${query}`), 400, "PAGE_INVALID");
  });

  it("keeps orphan preview/reclaim admin-only and validates bounded requests", async () => {
    const contributor = await memberApi("asset-owner", "/api/admin/assets/orphans");
    expect(contributor.status).toBe(403);

    const invalidPrefix = await memberApi("asset-admin", "/api/admin/assets/orphans?prefix=unknown");
    expect(invalidPrefix.status).toBe(400);
    await expect(invalidPrefix.json()).resolves.toMatchObject({ error: { code: "ASSET_ORPHAN_REQUEST_INVALID" } });

    const preview = await memberApi("asset-admin", "/api/admin/assets/orphans?prefix=staging&limit=1");
    expect(preview.status).toBe(200);
    await expect(preview.json()).resolves.toMatchObject({ items: [], scanned: expect.any(Number), truncated: expect.any(Boolean) });

    const reclaim = await memberApi("asset-admin", "/api/admin/assets/orphans/reclaim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keys: ["staging/not-present"] }),
    });
    expect(reclaim.status).toBe(200);
    await expect(reclaim.json()).resolves.toEqual({ deleted: [], skipped: ["staging/not-present"] });
  });
});

async function memberApi(memberId: string, path: string, init: RequestInit = {}, app = createApp()): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("cookie", `__Host-memory-session=${sessions.get(memberId)}`);
  if (!headers.has("origin")) headers.set("origin", APP_CONFIG.canonicalOrigin);
  const request = new Request(`https://example.test${path}`, { ...init, headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>;
  const context = createExecutionContext();
  const response = await app.fetch!(request, localEnv(), context);
  await waitOnExecutionContext(context);
  return response;
}

async function expectApiError(responsePromise: Promise<Response>, status: number, code: string): Promise<void> {
  const response = await responsePromise;
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({ error: { code } });
}

function localEnv(): Env {
  return {
    ...env,
    BOOTSTRAP_ADMIN_EMAIL: "bootstrap-only@example.test",
    ALLOWED_MEMBER_EMAILS: "bootstrap-only@example.test",
    AUTOMATION_CLIENT_ID: "fake-automation-client-id",
    AUTOMATION_SECRET: "fake-automation-secret",
    APP_TOKEN: "worker-test-token",
  } as Env;
}

function testOriginals(): R2Bucket {
  return (env as typeof env & { ORIGINALS: R2Bucket }).ORIGINALS;
}
