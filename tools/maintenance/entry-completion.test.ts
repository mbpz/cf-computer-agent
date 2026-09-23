import { CONTROL_TOKEN } from './control-fixtures';
import { applyD1Migrations, createExecutionContext, reset, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppDependencies } from '../../src/app';
import { AppError } from '../../src/http';
import { SessionService } from '../../src/identity/session';
import type { WorkScope } from '../../src/maintenance/lifecycle';
import { MembersRepository } from '../../src/members/repository';
import { createWorkerEntry } from '../../src/worker-entry';
import { MIGRATIONS } from '../../test/fixtures/d1';
import { env } from './env';
import { localEnvironment } from './resources';

const ORIGIN = 'https://memory.crgmhrc.asia';
function incoming(path: string, init?: RequestInit) {
  return new Request(`${ORIGIN}${path}`, init) as Request<unknown, IncomingRequestCfProperties<unknown>>;
}
function telemetry() {
  return incoming('/api/telemetry/pageview', {
    method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ path: '/completion-test' }),
  });
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}
async function memberToken() {
  await env.SYNTHETIC_DB.prepare(`INSERT INTO members
    (id, access_sub, email, role, status, created_at, updated_at)
    VALUES ('completion-member', 'github:completion', 'completion@example.test', 'contributor', 'active', ?, ?)`)
    .bind('2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z').run();
  const members = new MembersRepository(env.SYNTHETIC_DB);
  return (await new SessionService(env.SYNTHETIC_DB, members, { waitUntil: () => undefined })
    .create((await members.findById('completion-member'))!)).token;
}

// Observe the actual request-local objects via existing dependency/binding
// getters. No replacement app, service, repository, facade or coordinator.
function observedRequest(now: () => Date) {
  let scope!: WorkScope;
  let db!: D1Database;
  const appEnv = localEnvironment(env);
  Object.defineProperty(appEnv, 'KNOWLEDGE', { get(this: Env) {
    db = this.DB;
    return env.KNOWLEDGE;
  } });
  const dependencies: AppDependencies = { get analyticsNow() {
    scope = this.workScope!;
    return now;
  } };
  return { appEnv, dependencies, get scope() { return scope; }, get db() { return db; } };
}

describe('real application completion boundary', () => {
  beforeEach(async () => { await reset(); await applyD1Migrations(env.SYNTHETIC_DB, MIGRATIONS); });

  // Removing the app catch's uncertainty mark must release these permits
  // incorrectly; no D1 failure is injected to mask that missing boundary.
  for (const mode of ['guarded', 'legacy'] as const) {
    it.each(['static', 'construction', 'route', 'typed-5xx', 'non-error'] as const)(
      `${mode} preserves the response for %s failures without mistaking guarded completion for success`, async fault => {
        const g = env.MAINTENANCE.getByName(crypto.randomUUID());
        const appEnv = localEnvironment(env);
        const failure = fault === 'typed-5xx' ? new AppError('SYNTHETIC_INTERNAL', 'Synthetic failure', 503, true)
          : fault === 'non-error' ? { synthetic: true } : new Error('synthetic internal failure');
        let request = telemetry();
        let dependencies: AppDependencies = { analyticsNow: () => { throw failure; } };
        if (fault === 'static') {
          request = incoming('/boards');
          appEnv.ASSETS = { fetch: async () => { throw failure; } } as unknown as Fetcher;
          dependencies = {};
        } else if (fault === 'construction') {
          request = incoming('/auth/session');
          dependencies = { get analyticsNow(): never { throw failure; } };
        }
        const worker = mode === 'guarded'
          ? createWorkerEntry({ mode, maintenance: () => g, dependencies })
          : createWorkerEntry({ mode, dependencies });
        const ctx = createExecutionContext();
        const response = await worker.fetch(request, appEnv, ctx);
        expect(response.status).toBe(fault === 'typed-5xx' ? 503 : 500);
        expect(response.headers.get('cache-control')).toBe('no-store');
        await expect(response.json()).resolves.toMatchObject({ error: {
          code: fault === 'typed-5xx' ? 'SYNTHETIC_INTERNAL' : 'INTERNAL_ERROR', retryable: true,
        } });
        await waitOnExecutionContext(ctx);
        expect(await env.SYNTHETIC_DB.prepare('SELECT COUNT(*) AS n FROM site_visit_events').first('n')).toBe(0);
        expect(await g.beginDrain(`completion-${fault}`, 0, CONTROL_TOKEN)).toMatchObject(mode === 'guarded'
          ? { active: 1, phase: 'DRAINING' } : { active: 0, phase: 'DRAINED' });
      },
    );
  }

  it.each([
    ['/api/tasks?page=0', 400],
    ['/api/admin/members', 403],
    ['/api/tasks/missing-completion-task', 404],
  ] as const)('releases after real member route %s returns the expected %s denial', async (path, status) => {
    const token = await memberToken();
    const g = env.MAINTENANCE.getByName(crypto.randomUUID());
    const ctx = createExecutionContext();
    const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g });
    const response = await worker.fetch(incoming(path, { headers: { cookie: `__Host-memory-session=${token}` } }), localEnvironment(env), ctx);
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await response.json(); await waitOnExecutionContext(ctx);
    expect(await env.SYNTHETIC_DB.prepare("SELECT COUNT(*) AS n FROM auth_sessions WHERE member_id = 'completion-member'").first('n')).toBe(1);
    expect(await g.beginDrain(`known-${status}`, 0, CONTROL_TOKEN)).toMatchObject({ active: 0, phase: 'DRAINED' });
  });

  it.each(['success', 'app-error', 'child-d1-error'] as const)(
    'waits for a nested post-response D1 continuation with %s before deciding completion', async outcome => {
      await env.SYNTHETIC_DB.prepare('CREATE TABLE completion_writes (id TEXT PRIMARY KEY)').run();
      if (outcome === 'child-d1-error') {
        await env.SYNTHETIC_DB.prepare(`CREATE TRIGGER reject_completion_child BEFORE INSERT ON completion_writes
          WHEN NEW.id = 'child' BEGIN SELECT RAISE(ABORT, 'synthetic child failure'); END`).run();
      }
      const parentGate = deferred(); const childGate = deferred(); const registered = deferred();
      let parentTask!: Promise<void>; let childTask!: Promise<void>;
      const observed = observedRequest(() => {
        parentTask = parentGate.promise.then(async () => {
          await observed.db.prepare("INSERT INTO completion_writes VALUES ('parent')").run();
          childTask = childGate.promise.then(async () => {
            await observed.db.prepare("INSERT INTO completion_writes VALUES ('child')").run();
          });
          observed.scope.waitUntil(childTask);
          void childTask.catch(() => undefined); // Business catch cannot erase the raw registration.
          registered.resolve();
        });
        observed.scope.waitUntil(parentTask);
        if (outcome === 'app-error') throw new Error('synthetic error after background registration');
        return new Date('2026-09-21T00:00:00.000Z');
      });
      const g = env.MAINTENANCE.getByName(crypto.randomUUID());
      const ctx = createExecutionContext();
      const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g, dependencies: observed.dependencies });
      const response = await worker.fetch(telemetry(), observed.appEnv, ctx);
      let finished = false;
      const completion = waitOnExecutionContext(ctx).then(() => { finished = true; });
      try {
        expect(response.status).toBe(outcome === 'app-error' ? 500 : 202);
        await response.text();
        expect(await g.beginDrain('nested-completion', 0, CONTROL_TOKEN)).toMatchObject({ active: 1, phase: 'DRAINING' });
        expect(finished).toBe(false);
        parentGate.resolve(); await registered.promise; await parentTask;
        expect((await env.SYNTHETIC_DB.prepare('SELECT id FROM completion_writes ORDER BY id').all()).results).toEqual([{ id: 'parent' }]);
        expect(await g.status()).toMatchObject({ active: 1, phase: 'DRAINING' });
        expect(finished).toBe(false);
      } finally {
        parentGate.resolve(); childGate.resolve();
        await parentTask;
        await childTask.catch(() => undefined);
        await completion;
      }
      expect((await env.SYNTHETIC_DB.prepare('SELECT id FROM completion_writes ORDER BY id').all()).results)
        .toEqual(outcome === 'child-d1-error' ? [{ id: 'parent' }] : [{ id: 'child' }, { id: 'parent' }]);
      expect(await g.status()).toMatchObject(outcome === 'success'
        ? { active: 0, phase: 'DRAINED' } : { active: 1, phase: 'DRAINING' });
    },
  );

  it('rejects late factories and saved D1 handles after real request completion without writes or revival', async () => {
    await env.SYNTHETIC_DB.prepare('CREATE TABLE completion_writes (id TEXT PRIMARY KEY)').run();
    let saved!: D1PreparedStatement;
    const observed = observedRequest(() => {
      saved = observed.db.prepare('INSERT INTO completion_writes VALUES (?)').bind('late');
      return new Date('2026-09-21T00:00:00.000Z');
    });
    const g = env.MAINTENANCE.getByName(crypto.randomUUID());
    const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g, dependencies: observed.dependencies });
    const ctx = createExecutionContext();
    const response = await worker.fetch(telemetry(), observed.appEnv, ctx);
    expect(response.status).toBe(202); await response.text(); await waitOnExecutionContext(ctx);
    expect(await g.beginDrain('late-completion', 0, CONTROL_TOKEN)).toMatchObject({ active: 0, phase: 'DRAINED' });
    expect(() => observed.scope.assertOpen()).toThrow('SCOPE_CLOSED');
    expect(() => observed.scope.waitUntil(Promise.resolve())).toThrow('SCOPE_CLOSED');
    expect(() => observed.scope.markUncertain('APP_UNEXPECTED_ERROR')).toThrow('SCOPE_CLOSED');
    let factoryRan = false;
    await expect(observed.scope.run(async () => { factoryRan = true; })).rejects.toThrow('SCOPE_CLOSED');
    expect(factoryRan).toBe(false);
    expect(() => observed.db.prepare("INSERT INTO completion_writes VALUES ('new-late')")).toThrow('SCOPE_CLOSED');
    expect(() => saved.bind('rebound-late')).toThrow('SCOPE_CLOSED');
    expect(() => saved.run()).toThrow('SCOPE_CLOSED');
    expect(() => observed.db.batch([saved])).toThrow('SCOPE_CLOSED');
    expect(await env.SYNTHETIC_DB.prepare('SELECT COUNT(*) AS n FROM completion_writes').first('n')).toBe(0);
    expect(await env.SYNTHETIC_DB.prepare('SELECT COUNT(*) AS n FROM site_visit_events').first('n')).toBe(1);
    expect(await g.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
  });
});
