import { applyD1Migrations, createExecutionContext, createScheduledController, reset, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createWorkerEntry } from '../../src/worker-entry';
import type { AppDependencies } from '../../src/app';
import { SessionService } from '../../src/identity/session';
import { MembersRepository } from '../../src/members/repository';
import { AssetService } from '../../src/assets/service';
import { AssetsRepository } from '../../src/assets/repository';
import { MIGRATIONS } from '../../test/fixtures/d1';
import { env } from './env';
import { localEnvironment } from './resources';

const ORIGIN = 'https://memory.crgmhrc.asia';
function incoming(path: string, init?: RequestInit) {
  return new Request(`${ORIGIN}${path}`, init) as Request<unknown, IncomingRequestCfProperties<unknown>>;
}
function telemetry(path: string) {
  return incoming('/api/telemetry/pageview', {
    method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  });
}
function gate() { return env.MAINTENANCE.getByName(crypto.randomUUID()); }
async function seedMember(db: D1Database) {
  await applyD1Migrations(db, MIGRATIONS);
  await db.prepare(`INSERT INTO members
    (id, access_sub, email, role, status, created_at, updated_at)
    VALUES ('wiring-member', 'github:wiring', 'wiring@example.test', 'contributor', 'active', ?, ?)`)
    .bind('2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z').run();
}

describe('guarded entry D1 wiring', () => {
  beforeEach(async () => { await reset(); });

  it('retains a real env.DB failure after the application converts it to an HTTP response', async () => {
    await seedMember(env.SYNTHETIC_DB);
    await env.SYNTHETIC_DB.prepare(`CREATE TRIGGER reject_pageview BEFORE INSERT ON site_visit_events
      BEGIN SELECT RAISE(ABORT, 'synthetic pageview failure'); END`).run();
    const g = gate(); const ctx = createExecutionContext();
    const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g });
    const response = await worker.fetch(telemetry('/wiring-failed'), localEnvironment(env), ctx);
    expect(response.status).toBe(500);
    await response.text(); await waitOnExecutionContext(ctx);
    expect(await env.SYNTHETIC_DB.prepare('SELECT COUNT(*) AS n FROM site_visit_events').first('n')).toBe(0);
    expect(await g.beginDrain('http-d1-failure', 0)).toMatchObject({ active: 1, phase: 'DRAINING' });
  });

  it.each(['default', 'same-db-override', 'distinct-db-override'] as const)(
    'retains swallowed session cleanup failure with %s while preserving the successful session response', async mode => {
      await seedMember(env.SYNTHETIC_DB);
      const sessionDb = mode === 'distinct-db-override' ? env.SYNTHETIC_SESSION_DB : env.SYNTHETIC_DB;
      if (mode === 'distinct-db-override') await seedMember(sessionDb);
      const members = new MembersRepository(sessionDb);
      const token = (await new SessionService(sessionDb, members, { waitUntil: () => undefined })
        .create((await members.findById('wiring-member'))!)).token;
      await sessionDb.prepare(`INSERT INTO auth_sessions
        (token_hash, member_id, created_at, expires_at, last_seen_at)
        VALUES ('expired-wiring-session', 'wiring-member', ?, ?, ?)`)
        .bind('2020-01-01T00:00:00.000Z', '2020-01-02T00:00:00.000Z', '2020-01-01T00:00:00.000Z').run();
      await sessionDb.prepare(`CREATE TRIGGER reject_expired_cleanup BEFORE DELETE ON auth_sessions
        WHEN OLD.token_hash = 'expired-wiring-session'
        BEGIN SELECT RAISE(ABORT, 'synthetic session cleanup failure'); END`).run();
      const g = gate(); const ctx = createExecutionContext();
      const dependencies: AppDependencies = mode === 'default' ? {} : { sessionDatabase: sessionDb };
      const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g, dependencies });
      const response = await worker.fetch(incoming('/api/session', {
        headers: { cookie: `__Host-memory-session=${token}` },
      }), localEnvironment(env), ctx);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ member: { id: 'wiring-member' } });
      await waitOnExecutionContext(ctx);
      expect(await sessionDb.prepare("SELECT COUNT(*) AS n FROM auth_sessions WHERE token_hash = 'expired-wiring-session'").first('n')).toBe(1);
      expect(await g.beginDrain('session-d1-failure', 0)).toMatchObject({ active: 1, phase: 'DRAINING' });
    },
  );

  it('does not reuse a sealed database facade for the next request on the same Worker', async () => {
    await seedMember(env.SYNTHETIC_DB);
    const g = gate(); const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g });
    const appEnv = localEnvironment(env);
    for (const path of ['/wiring-first', '/wiring-second']) {
      const ctx = createExecutionContext();
      const response = await worker.fetch(telemetry(path), appEnv, ctx);
      expect(response.status).toBe(202); await response.text(); await waitOnExecutionContext(ctx);
      expect(await g.status()).toMatchObject({ active: 0 });
    }
    expect((await env.SYNTHETIC_DB.prepare('SELECT path FROM site_visit_events ORDER BY path').all()).results)
      .toEqual([{ path: '/wiring-first' }, { path: '/wiring-second' }]);
  });

  it('shares one facade across member and audit repositories for an atomic status update', async () => {
    await seedMember(env.SYNTHETIC_DB);
    await env.SYNTHETIC_DB.prepare(`INSERT INTO members
      (id, access_sub, email, role, status, created_at, updated_at)
      VALUES ('wiring-admin', 'github:wiring-admin', 'admin@example.test', 'admin', 'active', ?, ?)`)
      .bind('2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z').run();
    const members = new MembersRepository(env.SYNTHETIC_DB);
    const token = (await new SessionService(env.SYNTHETIC_DB, members, { waitUntil: () => undefined })
      .create((await members.findById('wiring-admin'))!)).token;
    const g = gate(); const ctx = createExecutionContext();
    const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g,
      dependencies: { sessionDatabase: env.SYNTHETIC_DB } });
    const response = await worker.fetch(incoming('/api/admin/members/wiring-member/status', {
      method: 'PATCH', headers: { origin: ORIGIN, 'content-type': 'application/json',
        cookie: `__Host-memory-session=${token}` }, body: JSON.stringify({ status: 'disabled' }),
    }), localEnvironment(env), ctx);
    const body = await response.json(); await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ member: { id: 'wiring-member', status: 'disabled' } });
    expect((await members.findById('wiring-member'))?.status).toBe('disabled');
    expect((await env.SYNTHETIC_DB.prepare(`SELECT actor_id, resource_id FROM audit_events
      WHERE action = 'member.status_updated'`).all()).results)
      .toEqual([{ actor_id: 'wiring-admin', resource_id: 'wiring-member' }]);
    expect(await g.beginDrain('shared-database-batch', 0)).toMatchObject({ active: 0, phase: 'DRAINED' });
  });

  it('retains a real Cron D1 failure even when asset compensation and the bounded sweep succeed', async () => {
    await seedMember(env.SYNTHETIC_DB);
    const repository = new AssetsRepository(env.SYNTHETIC_DB);
    const { asset } = await new AssetService(env.SYNTHETIC_ORIGINALS, repository).create({
      ownerId: 'wiring-member', originalName: 'wiring.txt', contentType: 'text/plain',
      bytes: new TextEncoder().encode('Synthetic wiring document.').buffer,
      idempotencyKey: 'wiring-asset',
    });
    await env.SYNTHETIC_DB.prepare(`CREATE TRIGGER reject_parse_success BEFORE UPDATE ON parse_jobs
      WHEN NEW.status = 'succeeded'
      BEGIN SELECT RAISE(ABORT, 'synthetic parse persistence failure'); END`).run();
    const g = gate(); const ctx = createExecutionContext();
    const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g });
    await worker.scheduled(createScheduledController(), localEnvironment(env), ctx);
    await waitOnExecutionContext(ctx);
    expect((await repository.findById(asset.id))?.job.status).toBe('failed_retryable');
    expect(await env.SYNTHETIC_ORIGINALS.get(`parsed/${asset.id}.md`)).toBeNull();
    expect(await g.beginDrain('cron-d1-failure', 0)).toMatchObject({ active: 1, phase: 'DRAINING' });
  });

  it('does not read a sessionDatabase override before closed admission rejects the request', async () => {
    const g = gate(); await g.beginDrain('closed-session-binding', 0);
    let reads = 0;
    const dependencies: AppDependencies = {
      get sessionDatabase(): D1Database { reads++; throw new Error('SESSION_BINDING_READ'); },
    };
    const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g, dependencies });
    const response = await worker.fetch(incoming('/api/session'), localEnvironment(env), createExecutionContext());
    expect(response.status).toBe(503); await response.text();
    expect(reads).toBe(0);
    expect(await g.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
  });
});
