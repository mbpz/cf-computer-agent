import { SELF, reset, applyD1Migrations, createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from './env';
import { authorizedMaintenance } from './control-client';
import { localEnvironment } from './resources';
import { createWorkerEntry } from '../../src/worker-entry';
import type { MaintenanceClient } from '../../src/maintenance/contracts';
import { AssetService } from '../../src/assets/service';
import { AssetsRepository } from '../../src/assets/repository';
import { SessionService } from '../../src/identity/session';
import { MembersRepository } from '../../src/members/repository';
import { MIGRATIONS } from '../../test/fixtures/d1';
import localWorker from './worker';

const ORIGIN = 'https://memory.crgmhrc.asia';
function incoming(url: string, init?: RequestInit) {
  return new Request(url, init) as Request<unknown, IncomingRequestCfProperties<unknown>>;
}
async function scheduledLocalWorker() {
  const ctx = createExecutionContext();
  await localWorker.scheduled(createScheduledController({ cron: '*/5 * * * *' }), env, ctx);
  await waitOnExecutionContext(ctx);
}
function gate() { return authorizedMaintenance(env.MAINTENANCE.getByName(crypto.randomUUID())); }
function guarded(client: MaintenanceClient) { return createWorkerEntry({ mode: 'guarded', maintenance: () => client }); }
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}
function forbiddenEnvironment() {
  const reads: string[] = [];
  const value = Object.create(null);
  for (const key of ['DB', 'ORIGINALS', 'AI', 'ASSETS', 'KNOWLEDGE', 'AGENT_SESSIONS',
    'GITHUB_OAUTH_CLIENT_ID', 'GITHUB_OAUTH_CLIENT_SECRET', 'APP_TOKEN']) {
    Object.defineProperty(value, key, { get() { reads.push(key); throw new Error(`BUSINESS_READ:${key}`); } });
  }
  return { value: value as Env, reads };
}
function failingD1(message: string): D1Database {
  return {
    prepare() { throw new Error(message); },
    batch: async () => { throw new Error(message); },
    exec: async () => { throw new Error(message); },
    withSession() { throw new Error(message); },
    dump: async () => { throw new Error(message); },
  } as unknown as D1Database;
}
function withDatabase(base: Env, database: D1Database): Env {
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property === 'DB') return database;
      return Reflect.get(target, property, receiver);
    },
  });
}
function telemetry(path: string) {
  return incoming(`${ORIGIN}/api/telemetry/pageview`, {
    method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ path }),
  });
}
async function seedMember() {
  await applyD1Migrations(env.SYNTHETIC_DB, MIGRATIONS);
  await env.SYNTHETIC_DB.prepare(`INSERT INTO members
    (id, access_sub, email, role, status, created_at, updated_at)
    VALUES ('entry-member', 'github:entry', 'entry@example.test', 'contributor', 'active', ?, ?)`)
    .bind('2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z').run();
}
async function seedAsset(index: number) {
  return new AssetService(env.SYNTHETIC_ORIGINALS, new AssetsRepository(env.SYNTHETIC_DB)).create({
    ownerId: 'entry-member', originalName: `entry-${index}.txt`, contentType: 'text/plain',
    bytes: new TextEncoder().encode(`Synthetic maintenance document ${index}.`).buffer,
    idempotencyKey: `entry-asset-${index}`,
  });
}

describe('real maintenance entry', () => {
  beforeEach(async () => { await reset(); });

  it('denies static, auth and API requests at the local Worker entry when drained', async () => {
    await authorizedMaintenance(env.MAINTENANCE.getByName('local-entry')).beginDrain('entry-closed', 0);
    for (const path of ['/boards', '/auth/session', '/api/auth/providers']) {
      const response = await SELF.fetch(`https://example.test${path}`);
      expect(response.status, path).toBe(503);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Retry-After')).toBe('60');
      await response.text();
    }
  });

  it('rejects all HTTP paths and Cron before reading any business binding', async () => {
    const g = gate(); await g.beginDrain('zero-business', 0);
    const worker = guarded(g); const blocked = forbiddenEnvironment(); const ctx = createExecutionContext();
    for (const path of ['/boards', '/auth/session', '/api/auth/providers', '/api/telemetry/pageview']) {
      const response = await worker.fetch(incoming(`${ORIGIN}${path}`), blocked.value, ctx);
      expect(response.status).toBe(503); await response.text();
    }
    await worker.scheduled(createScheduledController(), blocked.value, ctx);
    expect(blocked.reads).toEqual([]);
    expect(await g.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
  });

  it.each(['provider-throws', 'missing-client', 'missing-acquire', 'missing-complete', 'acquire-rejects', 'wrong-id', 'bad-epoch'])(
    'fails closed for %s in both entry methods', async fault => {
      let completes = 0;
      const provider = (): MaintenanceClient => {
        if (fault === 'provider-throws') throw new Error('synthetic provider failure');
        if (fault === 'missing-client') return undefined as unknown as MaintenanceClient;
        const client = {
          async acquire(id: string) {
            if (fault === 'acquire-rejects') throw new Error('synthetic transport failure');
            return { id: fault === 'wrong-id' ? 'other' : id, epoch: fault === 'bad-epoch' ? -1 : 0 };
          },
          async complete() { completes++; return { phase: 'OPEN' as const, epoch: 0, window: null, active: 0 }; },
        };
        if (fault === 'missing-acquire') Object.assign(client, { acquire: undefined });
        if (fault === 'missing-complete') Object.assign(client, { complete: undefined });
        return client;
      };
      const worker = createWorkerEntry({ mode: 'guarded', maintenance: provider });
      const blocked = forbiddenEnvironment(); const ctx = createExecutionContext();
      const response = await worker.fetch(incoming(`${ORIGIN}/boards`), blocked.value, ctx);
      expect(response.status).toBe(503); await response.text();
      await worker.scheduled(createScheduledController(), blocked.value, ctx);
      expect(blocked.reads).toEqual([]); expect(completes).toBe(0);
      await waitOnExecutionContext(ctx);
    },
  );

  it('retains the permit and starts no business work when host registration throws', async () => {
    const g = gate(); const blocked = forbiddenEnvironment(); let registrations = 0;
    const ctx = Object.create(createExecutionContext());
    ctx.waitUntil = () => { registrations++; throw new Error('host registration rejected'); };
    const response = await guarded(g).fetch(incoming(`${ORIGIN}/boards`), blocked.value, ctx);
    expect(response.status).toBe(503); await response.text();
    expect(registrations).toBe(1); expect(blocked.reads).toEqual([]);
    expect(await g.beginDrain('registration-failed', 0)).toMatchObject({ active: 1, phase: 'DRAINING' });
  });

  it('preserves legacy static, provider, auth rejection and validation contracts when open', async () => {
    await seedMember(); const g = gate(); const appEnv = localEnvironment(env);
    const legacy = createWorkerEntry({ mode: 'legacy' }); const open = guarded(g);
    for (const request of [incoming(`${ORIGIN}/boards`), incoming(`${ORIGIN}/api/auth/providers`),
      incoming(`${ORIGIN}/api/session`), incoming(`${ORIGIN}/auth/logout`), telemetry('invalid-path')]) {
      const responses = [];
      for (const worker of [legacy, open]) {
        const ctx = createExecutionContext();
        const response = await worker.fetch(request.clone() as typeof request, appEnv, ctx);
        const text = await response.text(); await waitOnExecutionContext(ctx);
        const headers = Object.fromEntries(response.headers); delete headers['x-request-id'];
        const body = response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
        if (body && typeof body === 'object') { delete body.requestId; if (body.error) delete body.error.requestId; }
        responses.push({ status: response.status, headers, body });
      }
      expect(responses[1]).toEqual(responses[0]);
    }
    expect(await g.status()).toMatchObject({ active: 0 });
  });

  it('runs real telemetry SQL while open and denies a second write after drain', async () => {
    await seedMember(); const g = gate(); const worker = guarded(g); const appEnv = localEnvironment(env);
    const ctx = createExecutionContext(); const response = await worker.fetch(telemetry('/entry-open'), appEnv, ctx);
    expect(response.status).toBe(202); await expect(response.json()).resolves.toMatchObject({ ok: true });
    await waitOnExecutionContext(ctx);
    expect(await env.SYNTHETIC_DB.prepare('SELECT path FROM site_visit_events').all()).toMatchObject({ results: [{ path: '/entry-open' }] });
    expect(await g.beginDrain('http-written', 0)).toMatchObject({ active: 0, phase: 'DRAINED' });
    const denied = await worker.fetch(telemetry('/entry-denied'), appEnv, createExecutionContext());
    expect(denied.status).toBe(503); await denied.text();
    expect(await env.SYNTHETIC_DB.prepare('SELECT COUNT(*) AS n FROM site_visit_events').first('n')).toBe(1);
  });

  it('routes real session background work through one host registration and the original receiver', async () => {
    await seedMember(); const members = new MembersRepository(env.SYNTHETIC_DB);
    const token = (await new SessionService(env.SYNTHETIC_DB, members, { waitUntil: () => undefined })
      .create((await members.findById('entry-member'))!)).token;
    await env.SYNTHETIC_DB.prepare(`INSERT INTO auth_sessions
      (token_hash, member_id, created_at, expires_at, last_seen_at)
      VALUES ('expired-entry-session', 'entry-member', ?, ?, ?)`)
      .bind('2020-01-01T00:00:00.000Z', '2020-01-02T00:00:00.000Z', '2020-01-01T00:00:00.000Z').run();
    const g = gate(); const native = createExecutionContext(); let registrations = 0;
    // Native-like prototype methods must not disappear through object spreading.
    class HostContext {
      waitUntil(p: Promise<unknown>) { expect(this).toBe(host); registrations++; native.waitUntil(p); }
    }
    const host = new HostContext();
    const response = await guarded(g).fetch(incoming(`${ORIGIN}/api/session`, {
      headers: { cookie: `__Host-memory-session=${token}` },
    }), localEnvironment(env), host as ExecutionContext);
    expect(response.status).toBe(200);
    expect(await g.beginDrain('session-body', 0)).toMatchObject({ active: 1, phase: 'DRAINING' });
    await expect(response.json()).resolves.toMatchObject({ member: { id: 'entry-member' } });
    await waitOnExecutionContext(native);
    expect(registrations).toBe(1);
    expect(await env.SYNTHETIC_DB.prepare("SELECT token_hash FROM auth_sessions WHERE token_hash = 'expired-entry-session'").first()).toBeNull();
    expect(await g.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
  });

  it('keeps the business error response while preserving a raw D1 failure as uncertain work', async () => {
    await seedMember();
    const members = new MembersRepository(env.SYNTHETIC_DB);
    const token = (await new SessionService(env.SYNTHETIC_DB, members, { waitUntil: () => undefined })
      .create((await members.findById('entry-member'))!)).token;
    const g = gate(); const ctx = createExecutionContext();
    const response = await guarded(g).fetch(incoming(`${ORIGIN}/api/session`, {
      headers: { cookie: `__Host-memory-session=${token}` },
    }), withDatabase(localEnvironment(env), failingD1('D1_DOWN')), ctx);
    expect(response.status).toBe(500);
    await response.text();
    await waitOnExecutionContext(ctx);
    expect(await g.beginDrain('d1-failure', 0)).toMatchObject({ active: 1, phase: 'DRAINING' });
    expect(await g.status()).toMatchObject({ active: 1, phase: 'DRAINING' });
  });

  it('keeps concurrent request scopes separate and completes through each admitted client', async () => {
    const first = gate(); const second = gate(); let lookups = 0;
    const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => ++lookups === 1 ? first : second });
    const ctx1 = createExecutionContext(); const ctx2 = createExecutionContext();
    const response1 = await worker.fetch(incoming(`${ORIGIN}/boards`), localEnvironment(env), ctx1);
    const response2 = await worker.fetch(incoming(`${ORIGIN}/boards`), localEnvironment(env), ctx2);
    expect(await first.beginDrain('first', 0)).toMatchObject({ active: 1 });
    expect(await second.beginDrain('second', 0)).toMatchObject({ active: 1 });
    await response1.text(); await waitOnExecutionContext(ctx1);
    expect(await first.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
    expect(await second.status()).toMatchObject({ active: 1, phase: 'DRAINING' });
    await response2.text(); await waitOnExecutionContext(ctx2);
    expect(await second.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
    expect(lookups).toBe(2);
  });

  it('runs the real bounded Cron sweep through the local Worker with D1 and R2', async () => {
    await seedMember(); const assets = await Promise.all([0, 1, 2, 3].map(seedAsset));
    await scheduledLocalWorker();
    const succeeded = () => env.SYNTHETIC_DB.prepare("SELECT COUNT(*) AS n FROM parse_jobs WHERE status = 'succeeded'").first('n');
    expect(await succeeded()).toBe(3);
    await scheduledLocalWorker();
    expect(await succeeded()).toBe(4);
    for (const { asset } of assets) {
      expect(await (await env.SYNTHETIC_ORIGINALS.get(`parsed/${asset.id}.md`))?.text()).toContain('Synthetic maintenance document');
    }
    const g = authorizedMaintenance(env.MAINTENANCE.getByName('local-entry'));
    expect(await g.beginDrain('cron-closed', 0)).toMatchObject({ active: 0, phase: 'DRAINED' });
    await seedAsset(4);
    await scheduledLocalWorker();
    expect(await succeeded()).toBe(4);
    expect(await env.SYNTHETIC_DB.prepare("SELECT COUNT(*) AS n FROM parse_jobs WHERE status = 'queued'").first('n')).toBe(1);
  });

  it('holds an already started real Cron chain until its R2 and D1 work completes', async () => {
    await seedMember(); const { asset } = await seedAsset(0); const g = gate();
    const entered = deferred(); const release = deferred(); const bucket = env.SYNTHETIC_ORIGINALS;
    const delayed = {
      async get(key: string) { entered.resolve(); await release.promise; return bucket.get(key); },
      put: bucket.put.bind(bucket), delete: bucket.delete.bind(bucket),
    } as unknown as R2Bucket;
    const appEnv = { ...localEnvironment(env), ORIGINALS: delayed };
    const running = guarded(g).scheduled(createScheduledController(), appEnv, createExecutionContext());
    await entered.promise;
    try {
      expect(await g.beginDrain('cron-running', 0)).toMatchObject({ active: 1, phase: 'DRAINING' });
      expect((await new AssetsRepository(env.SYNTHETIC_DB).findById(asset.id))?.job.status).toBe('processing');
    } finally { release.resolve(); await running; }
    expect((await new AssetsRepository(env.SYNTHETIC_DB).findById(asset.id))?.job.status).toBe('succeeded');
    expect(await bucket.get(`parsed/${asset.id}.md`)).not.toBeNull();
    expect(await g.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
  });

  it('preserves the optional-storage Cron skip in both modes without reading D1 or AI', async () => {
    const g = gate();
    for (const worker of [createWorkerEntry({ mode: 'legacy' }), guarded(g)]) {
      const blocked = forbiddenEnvironment();
      const appEnv = Object.create(blocked.value);
      Object.defineProperty(appEnv, 'ORIGINALS', { value: undefined });
      await worker.scheduled(createScheduledController(), appEnv, createExecutionContext());
      expect(blocked.reads).toEqual([]);
    }
    expect(await g.status()).toMatchObject({ active: 0 });
  });
});
