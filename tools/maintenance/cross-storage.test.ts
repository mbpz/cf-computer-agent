import { CONTROL_TOKEN } from './control-fixtures';
import { applyD1Migrations, createExecutionContext, createScheduledController, reset, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { AssetService } from '../../src/assets/service';
import { AssetsRepository } from '../../src/assets/repository';
import { MembersRepository } from '../../src/members/repository';
import { SessionService } from '../../src/identity/session';
import { createWorkerEntry } from '../../src/worker-entry';
import { createRequestPublishedContent, validatePublishedContentInput } from '../../src/knowledge/published-content';
import { guardFetch, type Completion } from '../../src/maintenance/lifecycle';
import { createD1Facade } from '../../src/maintenance/d1';
import { MIGRATIONS } from '../../test/fixtures/d1';
import { env } from './env';
import { localEnvironment } from './resources';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}

const owner = 'cross-storage-member';
const cases = (['http', 'cron'] as const).flatMap(entry =>
  (['success', 'd1-failure', 'r2-ack-lost', 'cleanup-ack-lost'] as const).map(outcome => ({ entry, outcome })));

describe('real entry cross-storage completion matrix', () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.SYNTHETIC_DB, MIGRATIONS);
    await env.SYNTHETIC_DB.prepare(`INSERT INTO members
      (id, access_sub, email, role, status, created_at, updated_at)
      VALUES (?, 'github:cross-storage', 'cross-storage@example.test', 'contributor', 'active', ?, ?)`)
      .bind(owner, '2026-09-23T00:00:00.000Z', '2026-09-23T00:00:00.000Z').run();
  });

  // Breaks caught: forwarding raw D1 instead of its facade; bypassing R2 raw
  // observation before catch; finishing Cron at response/put rather than the
  // full compensation chain. Local writes happen BEFORE simulated lost replies.
  it.each(cases)('$entry / $outcome waits for R2 then D1 and compensation without clearing uncertainty', async ({ entry, outcome }) => {
    const db = env.SYNTHETIC_DB;
    const bucket = env.SYNTHETIC_ORIGINALS;
    const repository = new AssetsRepository(db);
    const { asset } = await new AssetService(bucket, repository).create({
      ownerId: owner, originalName: 'cross-storage.md', contentType: 'text/markdown',
      bytes: new TextEncoder().encode('# Cross storage').buffer, idempotencyKey: 'cross-storage',
    });
    const parsedKey = `parsed/${asset.id}.md`;
    if (outcome === 'd1-failure' || outcome === 'cleanup-ack-lost') {
      await db.prepare(`CREATE TRIGGER reject_parse_completion BEFORE UPDATE OF status ON parse_jobs
        WHEN NEW.status = 'succeeded' BEGIN SELECT RAISE(ABORT, 'synthetic D1 completion failure'); END`).run();
    }
    const written = gate(); const allowPut = gate();
    const deleted = gate(); const allowDelete = gate();
    let puts = 0; let deletes = 0;
    const storage: R2Bucket = Object.create(bucket, {
      get: { value: (key: string) => bucket.get(key) },
      put: { value: async (key: string, body: string, options?: R2PutOptions) => {
        puts++;
        const result = await bucket.put(key, body, options);
        written.resolve();
        await allowPut.promise;
        if (outcome === 'r2-ack-lost') throw new Error('synthetic lost put reply');
        return result;
      } },
      delete: { value: async (key: string | string[]) => {
        deletes++;
        await bucket.delete(key);
        deleted.resolve();
        await allowDelete.promise;
        if (outcome === 'cleanup-ack-lost') throw new Error('synthetic lost cleanup reply');
      } },
    });
    const appEnv: Env = Object.create(localEnvironment(env), { ORIGINALS: { value: storage } });
    const coordinator = env.MAINTENANCE.getByName(crypto.randomUUID());
    const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => coordinator });
    const ctx = createExecutionContext();
    const members = new MembersRepository(db);
    const { token } = await new SessionService(db, members, { waitUntil: () => undefined })
      .create((await members.findById(owner))!);
    const origin = 'https://memory.crgmhrc.asia';
    let finished = false;
    const request = async () => {
      if (entry === 'cron') await worker.scheduled(createScheduledController(), appEnv, ctx);
      else {
        const response = await worker.fetch(new Request(`${origin}/api/assets/${asset.id}`, {
          method: 'POST', headers: { origin, cookie: `__Host-memory-session=${token}` },
        }) as Request<unknown, IncomingRequestCfProperties<unknown>>, appEnv, ctx);
        expect(response.status).toBe(200);
        await response.text();
      }
      await waitOnExecutionContext(ctx);
      finished = true;
    };
    const completion = request();
    try {
      await written.promise;
      expect(await bucket.head(parsedKey)).not.toBeNull();
      expect((await repository.findById(asset.id))?.job.status).toBe('processing');
      expect(await coordinator.beginDrain('cross-storage', 0, CONTROL_TOKEN)).toMatchObject({ phase: 'DRAINING', active: 1 });
      expect(finished).toBe(false);
      // Closed admission must deny a second actual HTTP entry, not repeat work.
      const deniedCtx = createExecutionContext();
      const denied = await worker.fetch(new Request(`${origin}/api/assets/${asset.id}`, {
        method: 'POST',
      }) as Request<unknown, IncomingRequestCfProperties<unknown>>, appEnv, deniedCtx);
      expect(denied.status).toBe(503);
      await denied.text(); await waitOnExecutionContext(deniedCtx);
      allowPut.resolve();
      if (outcome !== 'success') {
        await deleted.promise;
        expect(await bucket.head(parsedKey)).toBeNull();
        expect((await repository.findById(asset.id))?.job.status).toBe('processing');
        expect(await coordinator.status()).toMatchObject({ phase: 'DRAINING', active: 1 });
        expect(finished).toBe(false);
      }
    } finally {
      allowPut.resolve(); allowDelete.resolve();
      await completion;
    }
    expect(puts).toBe(1);
    expect(deletes).toBe(outcome === 'success' ? 0 : 1);
    expect((await repository.findById(asset.id))?.job).toMatchObject({
      status: outcome === 'success' ? 'succeeded' : 'failed_retryable', attempts: 1,
    });
    expect(await bucket.head(asset.objectKey)).not.toBeNull();
    expect(await bucket.head(parsedKey)).toEqual(outcome === 'success' ? expect.anything() : null);
    expect(await coordinator.status()).toMatchObject(outcome === 'success'
      ? { phase: 'DRAINED', active: 0 } : { phase: 'DRAINING', active: 1 });
  });

  // A consumed response does not finish a registered Knowledge RPC → D1 tail.
  // The lost-reply case proves that transport rejection is not remote rollback.
  it.each(['success', 'lost-reply'] as const)('holds a post-response real DO/VFS write and D1 continuation through %s', async outcome => {
    await env.SYNTHETIC_DB.prepare('CREATE TABLE cross_storage_receipts (id TEXT PRIMARY KEY)').run();
    const markdown = '# Persisted before RPC reply';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(markdown));
    const contentSha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const input = { spaceId: 'default', knowledgeItemId: 'matrix-item', revisionId: 'matrix-revision', markdown, contentSha256 };
    const validated = await validatePublishedContentInput(input);
    const name = crypto.randomUUID();
    const native = env.KNOWLEDGE.getByName(name);
    const start = gate(); const persisted = gate(); const allowReply = gate();
    let calls = 0;
    const wrapped = Object.create(native, { commitPublishedContent: { value: async () => {
      calls++;
      const result = await native.commitPublishedContent(input);
      if (!result.ok) throw new Error('synthetic publication fixture failed');
      persisted.resolve();
      await allowReply.promise;
      if (outcome === 'lost-reply') throw new Error('synthetic lost Knowledge reply');
      return result;
    } } });
    const namespace: Env['KNOWLEDGE'] = Object.create(env.KNOWLEDGE, {
      idFromName: { value: (value: string) => env.KNOWLEDGE.idFromName(value) },
      get: { value: () => wrapped },
    });
    const coordinator = env.MAINTENANCE.getByName(crypto.randomUUID());
    const tasks: Promise<Completion>[] = [];
    let work!: Promise<void>; let finished = false;
    const response = await guardFetch(coordinator, promise => tasks.push(promise), async scope => {
      const db = createD1Facade(env.SYNTHETIC_DB, scope);
      const content = createRequestPublishedContent(namespace, name, scope);
      work = scope.run(async () => {
        await start.promise;
        try {
          await content.committer.commit(input);
          await db.prepare("INSERT INTO cross_storage_receipts VALUES ('published')").run();
        } catch { /* Existing caller recovery must not erase raw uncertainty. */ }
        finally { content.dispose(); }
      });
      return new Response('accepted');
    });
    const completion = Promise.all(tasks).then(result => { finished = true; return result; });
    const reader = createRequestPublishedContent(env.KNOWLEDGE, name);
    try {
      expect(await response.text()).toBe('accepted');
      expect(await coordinator.beginDrain('post-response-storage', 0, CONTROL_TOKEN)).toMatchObject({ phase: 'DRAINING', active: 1 });
      start.resolve(); await persisted.promise;
      expect(await reader.reader.read(validated.path, contentSha256)).toBe(markdown);
      expect(await env.SYNTHETIC_DB.prepare('SELECT COUNT(*) AS n FROM cross_storage_receipts').first('n')).toBe(0);
      expect(await coordinator.status()).toMatchObject({ phase: 'DRAINING', active: 1 });
      expect(finished).toBe(false);
    } finally {
      start.resolve(); allowReply.resolve();
      await work; reader.dispose();
    }
    expect(await completion).toEqual([outcome === 'success' ? { released: true } : { released: false, reason: 'WORK_UNCERTAIN' }]);
    expect(calls).toBe(1);
    expect(await env.SYNTHETIC_DB.prepare('SELECT COUNT(*) AS n FROM cross_storage_receipts').first('n')).toBe(outcome === 'success' ? 1 : 0);
    expect(await coordinator.status()).toMatchObject(outcome === 'success'
      ? { phase: 'DRAINED', active: 0 } : { phase: 'DRAINING', active: 1 });
  });
});
