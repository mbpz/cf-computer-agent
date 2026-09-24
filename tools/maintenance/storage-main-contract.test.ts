import { describe, expect, it } from 'vitest';
import { AssetService, type AssetRepositoryPort } from '../../src/assets/service';
import type { AssetRecord, AssetWithJob, ParseJobRecord } from '../../src/assets/types';

function repository(): AssetRepositoryPort & { assets: AssetRecord[]; jobs: ParseJobRecord[] } {
  const store = { assets: [] as AssetRecord[], jobs: [] as ParseJobRecord[] };
  return {
    ...store,
    async findByIdempotency() { return null; },
    async insertAssetWithJob(asset, job) { store.assets.push(asset); store.jobs.push(job); },
    async findOwned(_owner, id) { return find(id); },
    async findById(id) { return find(id); },
    async cancelOwned() { return null; },
    async listOwned() { return { items: [] }; },
    async listAll() { return { items: [] }; },
    async listAdminPage() { return { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }; },
    async resetParseJob() { return false; },
    async listProcessable() { return store.jobs.map(job => job.assetId); },
    async sumByteSize() { return 0; },
    async isObjectKeyReferenced() { return false; },
    async claimParseJob(id) {
      const job = store.jobs.find(item => item.assetId === id);
      if (!job || job.status !== 'queued') return null;
      job.status = 'processing'; job.attempts += 1; return job;
    },
    async markParseSucceeded(id, now) { const job = store.jobs.find(item => item.assetId === id)!; job.status = 'succeeded'; job.updatedAt = now; },
    async markParseFailed(id, now, code, terminal) { const job = store.jobs.find(item => item.assetId === id)!; job.status = terminal ? 'failed_terminal' : 'failed_retryable'; job.lastErrorCode = code; job.updatedAt = now; },
  } as AssetRepositoryPort & { assets: AssetRecord[]; jobs: ParseJobRecord[] };
  function find(id: string): AssetWithJob | null {
    const asset = store.assets.find(item => item.id === id);
    const job = store.jobs.find(item => item.assetId === id);
    return asset && job ? { asset, job } : null;
  }
}

function bucket() {
  const objects = new Map<string, ArrayBuffer>();
  return {
    objects,
    async put(key: string, body: ArrayBuffer | string) { objects.set(key, typeof body === 'string' ? new TextEncoder().encode(body).buffer : body); },
    async get(key: string) { const body = objects.get(key); return body ? { arrayBuffer: async () => body } : null; },
    async delete(key: string) { objects.delete(key); },
  } as unknown as R2Bucket & { objects: Map<string, ArrayBuffer> };
}

function failingDeleteBucket() {
  const objects = new Map<string, ArrayBuffer>();
  return {
    objects,
    async put(key: string, body: ArrayBuffer | string) { objects.set(key, typeof body === 'string' ? new TextEncoder().encode(body).buffer : body); },
    async get(key: string) { const body = objects.get(key); return body ? { arrayBuffer: async () => body } : null; },
    async delete() { throw new Error('synthetic R2 delete failure'); },
  } as unknown as R2Bucket & { objects: Map<string, ArrayBuffer> };
}

describe('guarded storage tail lifecycle', () => {
  it('reports an unexpected R2/D1 processing failure instead of releasing a sweep', async () => {
    const db = repository(); const originals = bucket(); let failures = 0;
    const service = new AssetService(originals, db, { onFailure: () => { failures += 1; } });
    const asset: AssetRecord = {
      id: 'asset-late-failure', ownerId: 'member', objectKey: 'staging/asset-late-failure', originalName: 'note.txt',
      contentType: 'text/plain', byteSize: 4, contentSha256: 'a'.repeat(64), idempotencyKey: 'late', status: 'ready',
      createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z',
    };
    const job: ParseJobRecord = {
      id: 'job-late-failure', assetId: asset.id, status: 'queued', attempts: 0, lastErrorCode: null,
      createdAt: asset.createdAt, updatedAt: asset.updatedAt,
    };
    db.assets.push(asset); db.jobs.push(job);
    const originalFind = db.findById;
    db.findById = async () => { throw new Error('synthetic D1 failure'); };
    await expect(service.processDue(1)).resolves.toEqual({ attempted: 1, succeeded: 0 });
    expect(failures).toBe(1);
    db.findById = originalFind;
  });

  it('reports a failed compensating delete instead of hiding the cross-storage uncertainty', async () => {
    const db = repository(); let failures = 0;
    db.insertAssetWithJob = async () => { throw new Error('synthetic D1 insert failure'); };
    const service = new AssetService(failingDeleteBucket(), db, { onFailure: () => { failures += 1; } });
    await expect(service.create({
      ownerId: 'member', originalName: 'note.txt', contentType: 'text/plain',
      bytes: new TextEncoder().encode('note').buffer, idempotencyKey: 'compensation',
    })).rejects.toMatchObject({ code: 'ASSET_PERSISTENCE_UNAVAILABLE', status: 503 });
    expect(failures).toBe(1);
  });
});
