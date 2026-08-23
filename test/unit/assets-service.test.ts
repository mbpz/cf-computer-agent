// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AssetService, type AssetRepositoryPort } from "../../src/assets/service";
import type { AssetRecord, ParseJobRecord } from "../../src/assets/types";

function repository(): AssetRepositoryPort & { assets: AssetRecord[]; jobs: ParseJobRecord[] } {
  const store = {
    assets: [] as AssetRecord[],
    jobs: [] as ParseJobRecord[],
    async findByIdempotency(ownerId: string, idempotencyKey: string) {
      const asset = store.assets.find((item) => item.ownerId === ownerId && item.idempotencyKey === idempotencyKey);
      return asset ? { asset, job: store.jobs.find((item) => item.assetId === asset.id)! } : null;
    },
    async insertAssetWithJob(asset: AssetRecord, job: ParseJobRecord) {
      store.assets.push(asset);
      store.jobs.push(job);
    },
    async findOwned(ownerId: string, assetId: string) {
      const asset = store.assets.find((item) => item.ownerId === ownerId && item.id === assetId);
      return asset ? { asset, job: store.jobs.find((item) => item.assetId === asset.id)! } : null;
    },
  };
  return store;
}

function bucket() {
  const objects = new Map<string, ArrayBuffer>();
  return {
    objects,
    put: async (key: string, body: ArrayBuffer) => { objects.set(key, body); },
    delete: async (key: string) => { objects.delete(key); },
  } as unknown as R2Bucket & { objects: Map<string, ArrayBuffer> };
}

describe("AssetService", () => {
  it("stores a bounded private object and queues exactly one parse job", async () => {
    let sequence = 0;
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, {
      id: () => `asset-${++sequence}`,
      now: () => new Date("2026-08-23T00:00:00.000Z"),
    });

    const result = await service.create({
      ownerId: "member-1",
      originalName: "guide.pdf",
      contentType: "application/pdf",
      bytes: new TextEncoder().encode("pdf-bytes").buffer,
      idempotencyKey: "upload-key-1",
    });

    expect(result.asset).toMatchObject({
      id: "asset-1",
      ownerId: "member-1",
      originalName: "guide.pdf",
      contentType: "application/pdf",
      byteSize: 9,
      status: "ready",
    });
    expect(result.asset.objectKey).toBe("staging/asset-1");
    expect(result.job).toMatchObject({ assetId: "asset-1", status: "queued", attempts: 0 });
    expect(originals.objects.has("staging/asset-1")).toBe(true);
  });

  it("replays the same asset without writing a second R2 object", async () => {
    let sequence = 0;
    const db = repository();
    const originals = bucket();
    const service = new AssetService(originals, db, { id: () => `asset-${++sequence}` });
    const input = {
      ownerId: "member-1", originalName: "notes.txt", contentType: "text/plain",
      bytes: new TextEncoder().encode("notes").buffer, idempotencyKey: "same-key",
    };

    const first = await service.create(input);
    const replay = await service.create(input);

    expect(replay).toEqual(first);
    expect(db.assets).toHaveLength(1);
    expect(originals.objects).toHaveLength(1);
  });

  it("rejects an empty body", async () => {
    const service = new AssetService(bucket(), repository());
    await expect(service.create({
      ownerId: "member-1", originalName: "empty.txt", contentType: "text/plain",
      bytes: new ArrayBuffer(0), idempotencyKey: "key",
    })).rejects.toMatchObject({ code: "ASSET_EMPTY", status: 400 });
  });

  it.each([
    ["bad/name.txt", "text/plain", "ASSET_NAME_INVALID", 400],
    ["notes.bin", "application/x-unknown", "ASSET_TYPE_UNSUPPORTED", 415],
  ])("rejects invalid upload metadata %s", async (originalName, contentType, code, status) => {
    const service = new AssetService(bucket(), repository());
    await expect(service.create({
      ownerId: "member-1", originalName, contentType,
      bytes: new TextEncoder().encode("body").buffer, idempotencyKey: "key",
    })).rejects.toMatchObject({ code, status });
  });

  it("deletes the R2 object when the D1 insert fails", async () => {
    const originals = bucket();
    const db = repository();
    db.insertAssetWithJob = async () => { throw new Error("d1 unavailable"); };
    const service = new AssetService(originals, db);

    await expect(service.create({
      ownerId: "member-1", originalName: "notes.txt", contentType: "text/plain",
      bytes: new TextEncoder().encode("body").buffer, idempotencyKey: "key",
    })).rejects.toMatchObject({ code: "ASSET_PERSISTENCE_UNAVAILABLE", status: 503, retryable: true });
    expect(originals.objects.size).toBe(0);
  });
});
