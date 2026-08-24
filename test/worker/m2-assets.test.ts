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

    const adminList = await memberApi("asset-admin", "/api/admin/assets?status=queued&limit=20");
    expect(adminList.status).toBe(200);
    await expect(adminList.json()).resolves.toMatchObject({ items: [{ asset: { id: uploaded.asset.id }, job: { status: "queued" } }] });

    await memberApi("asset-owner", `/api/assets/${uploaded.asset.id}`, { method: "POST" });
    const failedList = await memberApi("asset-admin", "/api/admin/assets?status=failed_terminal&limit=20");
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
