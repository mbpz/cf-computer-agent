/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminOperationReceipts } from "../../src/operations/receipts";
import { routeAdminApi, type AdminRouteServices } from "../../src/routes/admin";
import type { CapacitySnapshot, Snapshot } from "../../src/maintenance/contracts";
import { APP_CONFIG } from "../../src/config";
import { MIGRATIONS } from "../fixtures/d1";

const OPEN: Snapshot = { phase: "OPEN", epoch: 4, window: null, active: 0 };
const DRAINING: Snapshot = { phase: "DRAINING", epoch: 4, window: "mw-2026-10-16", active: 2 };
const RESUME: Snapshot = { phase: "OPEN", epoch: 5, window: null, active: 0 };
const CAPACITY: CapacitySnapshot = { ...OPEN, records: 12, tombstones: 12, capacityLimit: 10_000, capacityRemaining: 9_988, alert: "NONE", requiresManualReview: false };

const principal = {
  kind: "member" as const,
  memberId: "maintenance-admin",
  identitySubject: "github:maintenance-admin",
  email: "maintenance-admin@example.test",
  role: "admin" as const,
};

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, MIGRATIONS);
});

describe("administrator maintenance control", () => {
  function services(beginDrain: (window: string, epoch: number) => Promise<Snapshot>, resume: () => Promise<Snapshot>) {
    // Only the maintenance surfaces are exercised here, so the unrelated route
    // services are left out of the fixture deliberately.
    return {
      maintenance: {
        status: async () => OPEN,
        capacity: async () => CAPACITY,
        beginDrain,
        resume,
      },
      operationReceipts: new AdminOperationReceipts(env.DB),
    } as unknown as AdminRouteServices;
  }

  async function control(path: string, body: unknown, routeServices: AdminRouteServices): Promise<Response | undefined> {
    // Same-origin is part of the control contract, so the call carries the
    // canonical origin the application is configured with.
    const request = new Request(`${APP_CONFIG.canonicalOrigin}/api/admin/maintenance/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP_CONFIG.canonicalOrigin },
      body: JSON.stringify(body),
    });
    return await routeAdminApi(request, new URL(request.url), { requestId: "test" }, principal, routeServices);
  }

  it("refuses to drain or resume without the typed window confirmation", async () => {
    const beginDrain = vi.fn(async () => DRAINING);
    const resume = vi.fn(async () => RESUME);
    const routeServices = services(beginDrain, resume);

    // A missing confirmation field is a malformed control request; a present but
    // non-matching one is the explicit refusal.
    await expect(control("begin-drain", { operationId: "drain-1", window: "mw-2026-10-16", epoch: 4 }, routeServices))
      .rejects.toMatchObject({ code: "MAINTENANCE_REQUEST_INVALID" });
    await expect(control("begin-drain", { operationId: "drain-1", window: "mw-2026-10-16", epoch: 4, confirmation: "mw-other" }, routeServices))
      .rejects.toMatchObject({ code: "MAINTENANCE_CONFIRMATION_REQUIRED" });
    await expect(control("resume", { operationId: "resume-1", window: "mw-2026-10-16", epoch: 4, confirmation: "" }, routeServices))
      .rejects.toMatchObject({ code: "MAINTENANCE_CONFIRMATION_REQUIRED" });
    // A control call also needs its operation identity, and the window itself is bounded.
    await expect(control("begin-drain", { window: "mw-2026-10-16", epoch: 4, confirmation: "mw-2026-10-16" }, routeServices))
      .rejects.toMatchObject({ code: "MAINTENANCE_REQUEST_INVALID" });
    await expect(control("begin-drain", { operationId: "drain-1", window: "bad window", epoch: 4, confirmation: "bad window" }, routeServices))
      .rejects.toMatchObject({ code: "MAINTENANCE_REQUEST_INVALID" });

    expect(beginDrain).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
    const receipts = await env.DB.prepare("SELECT COUNT(*) AS total FROM admin_operation_receipts").first<{ total: number }>();
    expect(receipts?.total).toBe(0);
  });

  it("records one drain under its operation number and replays it instead of draining twice", async () => {
    const beginDrain = vi.fn(async () => DRAINING);
    const routeServices = services(beginDrain, async () => RESUME);
    const body = { operationId: "drain-2", window: "mw-2026-10-16", epoch: 4, confirmation: "mw-2026-10-16" };

    const first = await control("begin-drain", body, routeServices);
    expect(first?.status).toBe(200);
    await expect(first!.json()).resolves.toEqual(DRAINING);

    const replay = await control("begin-drain", body, routeServices);
    expect(replay?.status).toBe(200);
    await expect(replay!.json()).resolves.toEqual(DRAINING);
    // The recorded answer is replayed: the coordinator is not asked to drain again.
    expect(beginDrain).toHaveBeenCalledTimes(1);

    await expect(control("begin-drain", { ...body, window: "mw-2026-10-17", confirmation: "mw-2026-10-17" }, routeServices))
      .rejects.toMatchObject({ code: "ADMIN_OPERATION_CONFLICT" });

    const receipts = await env.DB.prepare("SELECT COUNT(*) AS total FROM admin_operation_receipts WHERE kind = 'maintenance.begin_drain'").first<{ total: number }>();
    expect(receipts?.total).toBe(1);
    const audits = await env.DB.prepare("SELECT action, resource_type, resource_id, metadata FROM audit_events ORDER BY created_at").all<{ action: string; resource_type: string; resource_id: string; metadata: string }>();
    expect(audits.results).toHaveLength(1);
    expect(audits.results[0]).toMatchObject({ action: "maintenance.drain_started", resource_type: "maintenance", resource_id: "production" });
    expect(JSON.parse(audits.results[0]!.metadata)).toEqual({ window: "mw-2026-10-16", epoch: 4 });
  });

  it("records the resume as its own operation and audits it once", async () => {
    const resume = vi.fn(async () => RESUME);
    const routeServices = services(async () => DRAINING, resume);
    const body = { operationId: "resume-2", window: "mw-2026-10-16", epoch: 4, confirmation: "mw-2026-10-16" };

    const first = await control("resume", body, routeServices);
    expect(first?.status).toBe(200);
    await expect(first!.json()).resolves.toEqual(RESUME);
    await control("resume", body, routeServices);
    expect(resume).toHaveBeenCalledTimes(1);

    const audits = await env.DB.prepare("SELECT action, resource_id FROM audit_events").all<{ action: string; resource_id: string }>();
    expect(audits.results).toEqual([{ action: "maintenance.resumed", resource_id: "production" }]);
  });
});
