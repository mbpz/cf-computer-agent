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
  for (const id of ["asset-owner", "asset-other"]) {
    const member = await members.insert({
      id,
      identitySubject: `github:${id}`,
      email: `${id}@example.test`,
      role: "contributor",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const service = new SessionService(env.DB, members, { now: () => new Date(now), waitUntil: () => undefined });
    sessions.set(id, (await service.create(member)).token);
  }
});

describe("M2 asset upload boundary", () => {
  it("persists a private R2 original and queued D1 parse job", async () => {
    const response = await memberApi("asset-owner", "/api/assets", {
      method: "POST",
      headers: {
        "content-type": "application/pdf",
        "x-asset-name": "guide.pdf",
        "idempotency-key": "asset-upload-1",
      },
      body: "pdf-bytes",
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
    const object = await env.ORIGINALS.get(body.asset.objectKey);
    expect(object).not.toBeNull();
    await expect(object!.text()).resolves.toBe("pdf-bytes");

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
    await expect(env.ORIGINALS.list()).resolves.toMatchObject({ objects: [{ key: firstBody.asset.objectKey }] });

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
    await expect(env.ORIGINALS.get(`parsed/${uploaded.asset.id}.md`)).resolves.not.toBeNull();
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
});

async function memberApi(memberId: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("cookie", `__Host-memory-session=${sessions.get(memberId)}`);
  if (!headers.has("origin")) headers.set("origin", APP_CONFIG.canonicalOrigin);
  const request = new Request(`https://example.test${path}`, { ...init, headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>;
  const context = createExecutionContext();
  const response = await createApp().fetch!(request, localEnv(), context);
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
