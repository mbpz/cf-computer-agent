import { applyD1Migrations, reset } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { guardFetch, type Completion } from '../../src/maintenance/lifecycle';
import { MembersRepository } from '../../src/members/repository';
import { MembersService } from '../../src/members/service';
import { SessionService } from '../../src/identity/session';
import { AutomationAuthenticator } from '../../src/identity/automation';
import { MIGRATIONS } from '../../test/fixtures/d1';
import { env } from './env';

const NOW = new Date('2026-09-21T00:00:00.000Z');
const now = () => NOW;
const email = 'background@example.test';
const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');

async function signedRequest(): Promise<Request> {
  const timestamp = String(NOW.getTime() / 1000);
  const nonce = 'AAECAwQFBgcICQoLDA0ODw';
  const body = '{}';
  const digest = hex(await crypto.subtle.digest('SHA-256', encoder.encode(body)));
  const key = await crypto.subtle.importKey('raw', encoder.encode('synthetic-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = hex(await crypto.subtle.sign('HMAC', key, encoder.encode(['POST', '/api/notes', timestamp, nonce, digest].join('\n'))));
  return new Request('https://synthetic.test/api/notes', { method: 'POST', body, headers: {
    authorization: 'Bearer synthetic-token', 'x-automation-id': 'synthetic-client',
    'x-automation-timestamp': timestamp, 'x-automation-nonce': nonce, 'x-automation-signature': signature,
  } });
}

describe('raw background continuation observation', () => {
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.SYNTHETIC_DB, MIGRATIONS);
    await env.SYNTHETIC_DB.prepare(`INSERT INTO members
      (id, access_sub, email, role, status, created_at, updated_at)
      VALUES ('background-member', 'github:123', ?, 'contributor', 'active', ?, ?)`)
      .bind(email, NOW.toISOString(), NOW.toISOString()).run();
  });

  it.each((['member', 'session', 'nonce'] as const).flatMap(kind => [
    { kind, tracking: true, fail: true },
    { kind, tracking: true, fail: false },
    { kind, tracking: false, fail: true },
  ]))('observes $kind background completion (tracking=$tracking, fail=$fail) without the D1 facade', async ({ kind, tracking, fail }) => {
    const db = env.SYNTHETIC_DB;
    const members = new MembersRepository(db);
    const member = (await members.findById('background-member'))!;
    const token = (await new SessionService(db, members, { now, waitUntil: () => undefined }).create(member)).token;
    await db.prepare(`INSERT INTO auth_sessions (token_hash, member_id, created_at, expires_at, last_seen_at)
      VALUES ('expired', 'background-member', '2020-01-01', '2020-01-02', '2020-01-01')`).run();
    await db.prepare("INSERT INTO automation_nonces (client_id, nonce, expires_at) VALUES ('expired', 'expired', '2020-01-01')").run();
    const table = { member: 'members', session: 'auth_sessions', nonce: 'automation_nonces' }[kind];
    const operation = kind === 'member' ? 'UPDATE' : 'DELETE';
    if (fail) await db.prepare(`CREATE TRIGGER reject_background BEFORE ${operation} ON ${table}
      BEGIN SELECT RAISE(ABORT, 'synthetic background failure'); END`).run();
    const g = env.MAINTENANCE.getByName(crypto.randomUUID());
    const background: Promise<Completion>[] = [];
    const response = await guardFetch(g, task => background.push(task), async workScope => {
      const options = { now, workScope: tracking ? workScope : undefined, waitUntil: (task: Promise<unknown>) => workScope.waitUntil(task) };
      if (kind === 'member') {
        await new MembersService(members, { ALLOWED_MEMBER_EMAILS: email, BOOTSTRAP_ADMIN_EMAIL: email }, options)
          .resolveGitHubLogin({ email, subject: 'github:123', githubUserId: '123' });
      } else if (kind === 'session') {
        await new SessionService(db, members, options).resolve(new Request('https://synthetic.test/api/session', {
          headers: { cookie: `__Host-memory-session=${token}` },
        }));
      } else {
        await new AutomationAuthenticator(db, { APP_TOKEN: 'synthetic-token', AUTOMATION_CLIENT_ID: 'synthetic-client',
          AUTOMATION_SECRET: 'synthetic-secret' }, options).verify(await signedRequest(), 1024);
      }
      return new Response('business success');
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('business success');
    const retained = tracking && fail;
    await expect(Promise.all(background)).resolves.toEqual([retained ? { released: false, reason: 'WORK_UNCERTAIN' } : { released: true }]);
    expect(await g.beginDrain('raw-background', 0)).toMatchObject({ active: retained ? 1 : 0, phase: retained ? 'DRAINING' : 'DRAINED' });
    if (kind === 'member') {
      expect(await db.prepare("SELECT last_seen_at FROM members WHERE id = 'background-member'").first('last_seen_at'))
        .toBe(fail ? null : NOW.toISOString());
    } else {
      const key = kind === 'session' ? 'token_hash' : 'client_id';
      expect(await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${key} = 'expired'`).first('n')).toBe(fail ? 1 : 0);
    }
  });
});
