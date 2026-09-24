import { CONTROL_TOKEN } from './control-fixtures';
import { applyD1Migrations, createExecutionContext, createScheduledController, reset, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService } from '../../src/assets/service';
import { AssetsRepository } from '../../src/assets/repository';
import { guardFetch, type Completion, type WorkScope } from '../../src/maintenance/lifecycle';
import { MIGRATIONS } from '../../test/fixtures/d1';
import { env } from './env';
import { getWorkspace, type WorkspaceClient } from '@cloudflare/computer';
import { createPublishedContentReader, createRequestPublishedContent, persistPublishedContent, validatePublishedContentInput } from '../../src/knowledge/published-content';
import { WorkspaceRepository } from '../../src/knowledge/workspace-repository';
import { APP_CONFIG } from '../../src/config';
import { AppError } from '../../src/http';
import * as publishedContent from '../../src/knowledge/published-content';
import { routeAgentApi } from '../../src/routes/agent';
import { AgentToolRunner } from '../../src/agent/tool-runner';
import { MembersRepository } from '../../src/members/repository';
import { localEnvironment } from './resources';
import { createWorkerEntry } from '../../src/worker-entry';
import { SessionService } from '../../src/identity/session';
import { observeStorage } from '../../src/maintenance/storage';
import { ensureDirectory } from '../../src/knowledge/workspace-repository';

const owner = 'storage-member';
const input = { ownerId: owner, originalName: 'storage.md', contentType: 'text/markdown',
  bytes: new TextEncoder().encode('# Local storage evidence').buffer, idempotencyKey: 'storage-evidence' };

async function publication() {
  const markdown = '# VFS storage evidence';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(markdown));
  const contentSha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return { spaceId: 'default', knowledgeItemId: 'storage-item', revisionId: 'storage-revision', markdown, contentSha256 };
}

function dispose(workspace: WorkspaceClient) {
  const symbol = (Symbol as typeof Symbol & { dispose?: symbol }).dispose;
  const handle = workspace as unknown as Record<symbol, unknown>;
  if (symbol && typeof handle[symbol] === 'function') handle[symbol].call(workspace);
}

describe('typed raw storage observation', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.SYNTHETIC_DB, MIGRATIONS);
    await env.SYNTHETIC_DB.prepare(`INSERT INTO members
      (id, access_sub, email, role, status, created_at, updated_at)
      VALUES (?, 'github:storage', 'storage@example.test', 'contributor', 'active', ?, ?)`)
      .bind(owner, '2026-09-22T00:00:00.000Z', '2026-09-22T00:00:00.000Z').run();
  });

  it.each(['resolve', 'reject', 'throw'] as const)('keeps R2 cancellation cleanup %s distinct from business success', async outcome => {
    const bucket = env.SYNTHETIC_ORIGINALS;
    const repository = new AssetsRepository(env.SYNTHETIC_DB);
    const { asset } = await new AssetService(bucket, repository).create(input);
    const storage: R2Bucket = Object.create(bucket, {
      delete: { value: (key: string | string[]) => {
        if (outcome === 'throw') throw new Error('synthetic synchronous R2 failure');
        if (outcome === 'reject') return Promise.reject(new Error('synthetic R2 failure'));
        return bucket.delete(key);
      } },
    });
    const g = env.MAINTENANCE.getByName(crypto.randomUUID());
    const tasks: Promise<Completion>[] = [];
    const response = await guardFetch(g, p => tasks.push(p), async workScope => {
      const options = { workScope };
      await new AssetService(storage, repository, options).cancel(owner, asset.id);
      return new Response(null);
    });
    expect(response.status).toBe(200);
    expect(await Promise.all(tasks)).toEqual([outcome === 'resolve'
      ? { released: true } : { released: false, reason: 'WORK_UNCERTAIN' }]);
    expect(await g.beginDrain('r2-cancel', 0, CONTROL_TOKEN)).toMatchObject({
      phase: outcome === 'resolve' ? 'DRAINED' : 'DRAINING', active: outcome === 'resolve' ? 0 : 1,
    });
    expect(await bucket.head(asset.objectKey)).toEqual(outcome === 'resolve' ? null : expect.anything());
  });

  it.each(['get', 'body', 'put', 'cleanup'] as const)('retains R2 %s failure after parse compensation returns normally', async boundary => {
    const bucket = env.SYNTHETIC_ORIGINALS;
    const repository = new AssetsRepository(env.SYNTHETIC_DB);
    const { asset } = await new AssetService(bucket, repository).create(input);
    const fail = () => Promise.reject(new Error('synthetic raw storage failure'));
    const storage: R2Bucket = Object.create(bucket, {
      get: { value: async (key: string) => {
        if (boundary === 'get') return fail();
        const object = await bucket.get(key);
        return boundary === 'body' && object ? Object.create(object, { arrayBuffer: { value: fail } }) : object;
      } },
      put: { value: boundary === 'put' ? fail : bucket.put.bind(bucket) },
      delete: { value: boundary === 'cleanup' ? fail : bucket.delete.bind(bucket) },
    });
    // A missing original is a known parse rejection. Its failed cleanup is not.
    if (boundary === 'cleanup') await bucket.delete(asset.objectKey);
    const g = env.MAINTENANCE.getByName(crypto.randomUUID());
    const tasks: Promise<Completion>[] = [];
    const response = await guardFetch(g, p => tasks.push(p), async workScope => {
      const options = { workScope };
      expect(await new AssetService(storage, repository, options).processDue()).toEqual({ attempted: 1, succeeded: 0 });
      return new Response(null);
    });
    expect(response.status).toBe(200);
    expect(await Promise.all(tasks)).toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
    expect(await g.beginDrain('r2-parse', 0, CONTROL_TOKEN)).toMatchObject({ phase: 'DRAINING', active: 1 });
    expect(await bucket.head(`parsed/${asset.id}.md`)).toBeNull();
  });

  it.each(['read', 'reconcile'] as const)('observes VFS %s failure before domain error mapping', async boundary => {
    const stub = env.KNOWLEDGE.getByName(crypto.randomUUID());
    const content = await validatePublishedContentInput(await publication());
    expect((await stub.commitPublishedContent(await publication())).ok).toBe(true);
    const workspace = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
    const faulty: WorkspaceClient = Object.create(workspace, { fs: { value: Object.create(workspace.fs, {
      readdir: { value: (path: string) => workspace.fs.readdir(path) },
      readFile: { value: () => Promise.reject(new Error('synthetic VFS transport error')) },
    }) } });
    const g = env.MAINTENANCE.getByName(crypto.randomUUID()); const tasks: Promise<Completion>[] = [];
    try {
      const response = await guardFetch(g, p => tasks.push(p), async scope => {
        const operation = boundary === 'read'
          ? createPublishedContentReader(faulty, scope).read(content.path, content.contentSha256)
          : persistPublishedContent(faulty, content, scope);
        await expect(operation).rejects.toMatchObject({ code: boundary === 'read' ? 'PUBLISHED_CONTENT_CORRUPT' : 'PUBLISHED_CONTENT_CONFLICT' });
        return new Response(null);
      });
      expect(response.status).toBe(200);
      expect(await Promise.all(tasks)).toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
    } finally { dispose(workspace); }
  });

  it('carries a caught internal VFS failure across real Knowledge RPC without changing its domain error', async () => {
    const stub = env.KNOWLEDGE.getByName(crypto.randomUUID());
    const content = await publication();
    expect((await stub.commitPublishedContent(content)).ok).toBe(true);
    const persist = publishedContent.persistPublishedContent;
    const calls = vi.spyOn(publishedContent, 'persistPublishedContent').mockImplementation((workspace, value, observer) => {
      const faulty: WorkspaceClient = Object.create(workspace, { fs: { value: Object.create(workspace.fs, {
        readdir: { value: (path: string) => workspace.fs.readdir(path) },
        readFile: { value: () => Promise.reject(new Error('private synthetic storage details')) },
      }) } });
      return persist(faulty, value, observer);
    });
    const result = await stub.commitPublishedContent(content);
    expect(calls).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ ok: false, error: { code: 'PUBLISHED_CONTENT_CONFLICT', status: 409 }, storageUncertain: true });
    expect(JSON.stringify(result)).not.toContain('private synthetic');
    calls.mockRestore();
    // Evidence is per RPC, not sticky mutable DO state.
    const replay = await stub.commitPublishedContent(content);
    expect(replay.ok).toBe(true);
    expect(replay).not.toHaveProperty('storageUncertain');
    const invalid = await stub.removePublishedContent({ paths: ['../invalid'] });
    expect(invalid).toMatchObject({ ok: false, error: { status: 400 } });
    expect(invalid).not.toHaveProperty('storageUncertain');
  });

  it.each((['commit', 'remove', 'note', 'recover'] as const).flatMap(boundary =>
    (['transport', 'masked-storage', 'domain'] as const).map(outcome => ({ boundary, outcome }))))(
    '$boundary RPC distinguishes $outcome before caller recovery', async ({ boundary, outcome }) => {
      const native = env.KNOWLEDGE.getByName(crypto.randomUUID());
      const method = { commit: 'commitPublishedContent', remove: 'removePublishedContent', note: 'commitNote', recover: 'recoverWorkspace' }[boundary];
      const wrapped = Object.create(native, { [method]: { value: async () => {
        if (outcome === 'transport') throw new Error('synthetic RPC transport error');
        return { ok: false, error: { code: 'KNOWN_CONFLICT', message: 'Known conflict', status: 409, retryable: false },
          ...(outcome === 'masked-storage' ? { storageUncertain: true } : {}) };
      } } });
      const namespace: Env['KNOWLEDGE'] = Object.create(env.KNOWLEDGE, {
        idFromName: { value: env.KNOWLEDGE.idFromName.bind(env.KNOWLEDGE) }, get: { value: () => wrapped },
      });
      const g = env.MAINTENANCE.getByName(crypto.randomUUID()); const tasks: Promise<Completion>[] = [];
      const response = await guardFetch(g, p => tasks.push(p), async scope => {
        const published = createRequestPublishedContent(namespace, 'synthetic', scope);
        const repository = new WorkspaceRepository(namespace, 'synthetic', undefined, scope);
        try {
          const operation = boundary === 'commit' ? published.committer.commit(await publication())
            : boundary === 'remove' ? published.remover.remove([`${APP_CONFIG.publishedRoot}/default/storage-item/storage-revision.md`])
              : boundary === 'note' ? repository.commitNote({}) : repository.list();
          await expect(operation).rejects.toBeInstanceOf(outcome === 'transport' ? Error : AppError);
        } finally { published.dispose(); repository.dispose(); }
        return new Response(null);
      });
      expect(response.status).toBe(200);
      expect(await Promise.all(tasks)).toEqual([outcome === 'domain' ? { released: true } : { released: false, reason: 'WORK_UNCERTAIN' }]);
    },
  );

  it.each((['create', 'read', 'appendMessage', 'listMessages', 'startTurn', 'getTurn'] as const).flatMap(boundary =>
    (['transport', 'domain'] as const).map(outcome => ({ boundary, outcome }))))(
    'Agent $boundary RPC observes $outcome independently of caller recovery', async ({ boundary, outcome }) => {
      const id = env.AGENT_SESSIONS.newUniqueId();
      const native = env.AGENT_SESSIONS.get(id);
      const error = new Error('synthetic Agent transport failure');
      const wrapped = Object.create(native, { [boundary]: { value: async () => {
        if (outcome === 'transport') throw error;
        return { ok: false, error: { code: 'AGENT_SESSION_NOT_FOUND', message: 'Not found', status: 404, retryable: false } };
      } } });
      const namespace: Env['AGENT_SESSIONS'] = Object.create(env.AGENT_SESSIONS, {
        newUniqueId: { value: () => id }, get: { value: () => wrapped },
        idFromString: { value: (value: string) => env.AGENT_SESSIONS.idFromString(value) },
      });
      const suffix = { create: '', read: `/${id}`, appendMessage: `/${id}/messages`, listMessages: `/${id}/messages`,
        startTurn: `/${id}/stream`, getTurn: `/${id}/turns/synthetic-turn` }[boundary];
      const post = ['create', 'appendMessage', 'startTurn'].includes(boundary);
      const url = new URL(`https://example.test/api/agent/sessions${suffix}`);
      const request = new Request(url, { method: post ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json' },
        ...(post ? { body: JSON.stringify(boundary === 'startTurn' ? { question: 'Synthetic question' } : { content: 'Synthetic message' }) } : {}),
      });
      const g = env.MAINTENANCE.getByName(crypto.randomUUID()); const tasks: Promise<Completion>[] = [];
      const response = await guardFetch(g, p => tasks.push(p), async scope => {
        const operation = routeAgentApi(request, url, { requestId: 'storage' },
          { kind: 'member', memberId: owner, role: 'contributor', email: 'storage@example.test', identitySubject: 'github:storage' },
          namespace, localEnvironment(env).AI, new AgentToolRunner(new MembersRepository(env.SYNTHETIC_DB), []), scope);
        if (outcome === 'transport') await expect(operation).rejects.toBe(error);
        else await expect(operation).rejects.toMatchObject({ code: 'AGENT_SESSION_NOT_FOUND', status: 404 });
        return new Response(null);
      });
      expect(response.status).toBe(200);
      expect(await Promise.all(tasks)).toEqual([outcome === 'domain' ? { released: true } : { released: false, reason: 'WORK_UNCERTAIN' }]);
    },
  );

  it.each((['http', 'cron'] as const).flatMap(entry =>
    (['guarded', 'legacy'] as const).flatMap(mode =>
      (['success', 'missing', 'failure'] as const).map(outcome => ({ entry, mode, outcome })))))(
    '$entry $mode entry keeps $outcome R2 observation connected to its request scope', async ({ entry, mode, outcome }) => {
      const bucket = env.SYNTHETIC_ORIGINALS;
      const repository = new AssetsRepository(env.SYNTHETIC_DB);
      const { asset } = await new AssetService(bucket, repository).create(input);
      if (outcome === 'missing') await bucket.delete(asset.objectKey);
      const get = vi.fn((key: string) => outcome === 'failure'
        ? Promise.reject(new Error('synthetic R2 read failure')) : bucket.get(key));
      const storage: R2Bucket = Object.create(bucket, {
        get: { value: get }, put: { value: (key: string, value: string, options?: R2PutOptions) => bucket.put(key, value, options) },
        delete: { value: (key: string | string[]) => bucket.delete(key) },
      });
      const appEnv: Env = Object.create(localEnvironment(env), { ORIGINALS: { value: storage } });
      const g = env.MAINTENANCE.getByName(crypto.randomUUID());
      const worker = createWorkerEntry(mode === 'guarded' ? { mode, maintenance: () => g } : { mode });
      const ctx = createExecutionContext();
      if (entry === 'cron') await worker.scheduled(createScheduledController(), appEnv, ctx);
      else {
        const members = new MembersRepository(env.SYNTHETIC_DB);
        const { token } = await new SessionService(env.SYNTHETIC_DB, members, { waitUntil: () => undefined })
          .create((await members.findById(owner))!);
        const origin = 'https://memory.crgmhrc.asia';
        const response = await worker.fetch(new Request(`${origin}/api/assets/${asset.id}`, {
          method: 'POST', headers: { origin, cookie: `__Host-memory-session=${token}` },
        }) as Request<unknown, IncomingRequestCfProperties<unknown>>, appEnv, ctx);
        expect(response.status).toBe(200);
        await response.text();
      }
      await waitOnExecutionContext(ctx);
      expect(get).toHaveBeenCalledOnce();
      const retained = mode === 'guarded' && outcome === 'failure';
      expect(await g.beginDrain('entry-storage', 0, CONTROL_TOKEN)).toMatchObject({ phase: retained ? 'DRAINING' : 'DRAINED', active: retained ? 1 : 0 });
      expect((await repository.findById(asset.id))?.job).toMatchObject({
        status: outcome === 'success' ? 'succeeded' : 'failed_retryable',
        lastErrorCode: outcome === 'success' ? null : outcome === 'missing' ? 'ASSET_ORIGINAL_MISSING' : 'ASSET_PARSE_RETRYABLE',
      });
    },
  );

  it('observes a real VFS mkdir rejection even when EEXIST reconciliation succeeds', async () => {
    const stub = env.KNOWLEDGE.getByName(crypto.randomUUID());
    const workspace = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
    const faulty: WorkspaceClient = Object.create(workspace, { fs: { value: Object.create(workspace.fs, {
      readdir: { value: (path: string) => workspace.fs.readdir(path) },
      mkdir: { value: async (path: string) => { await workspace.fs.mkdir(path); throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' }); } },
    }) } });
    const g = env.MAINTENANCE.getByName(crypto.randomUUID()); const tasks: Promise<Completion>[] = [];
    try {
      const response = await guardFetch(g, p => tasks.push(p), async scope => {
        await ensureDirectory(faulty, '/', '/storage-race', scope);
        return new Response(null);
      });
      expect(response.status).toBe(200);
      expect(await Promise.all(tasks)).toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
      expect((await workspace.fs.readdir('/')).some(entry => entry.name === 'storage-race')).toBe(true);
    } finally { dispose(workspace); }
  });

  it.each(['resolve', 'reject'] as const)('holds a detached raw storage %s until settlement despite caller catch', async outcome => {
    let resolve!: () => void; let reject!: (error: Error) => void;
    const pending = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    const g = env.MAINTENANCE.getByName(crypto.randomUUID()); const tasks: Promise<Completion>[] = [];
    let settled = false;
    await guardFetch(g, p => tasks.push(p), async scope => {
      void observeStorage(scope, () => pending).catch(() => undefined);
      return new Response(null);
    });
    const completion = Promise.all(tasks).then(result => { settled = true; return result; });
    try {
      expect(await g.beginDrain('pending-storage', 0, CONTROL_TOKEN)).toMatchObject({ phase: 'DRAINING', active: 1 });
      expect(settled).toBe(false);
      if (outcome === 'reject') reject(new Error('synthetic late storage failure')); else resolve();
      expect(await completion).toEqual([outcome === 'resolve' ? { released: true } : { released: false, reason: 'WORK_UNCERTAIN' }]);
    } finally { resolve(); await completion; }
  });

  it('fences late typed R2, RPC and VFS factories without issuing native I/O', async () => {
    const g = env.MAINTENANCE.getByName(crypto.randomUUID()); const tasks: Promise<Completion>[] = [];
    let scope!: WorkScope;
    await guardFetch(g, p => tasks.push(p), async value => { scope = value; return new Response(null); });
    expect(await Promise.all(tasks)).toEqual([{ released: true }]);
    const native = vi.fn(() => Promise.reject(new Error('must not run')));
    const storage: R2Bucket = Object.create(env.SYNTHETIC_ORIGINALS, { list: { value: native } });
    await expect(new AssetService(storage, new AssetsRepository(env.SYNTHETIC_DB), { workScope: scope }).previewOrphans())
      .rejects.toMatchObject({ code: 'ASSET_ORPHAN_STORAGE_UNAVAILABLE' });
    const namespace: Env['KNOWLEDGE'] = Object.create(env.KNOWLEDGE, {
      idFromName: { value: env.KNOWLEDGE.idFromName.bind(env.KNOWLEDGE) }, get: { value: () => ({ commitNote: native }) },
    });
    await expect(new WorkspaceRepository(namespace, 'late', undefined, scope).commitNote({})).rejects.toThrow('SCOPE_CLOSED');
    const stub = env.KNOWLEDGE.getByName(crypto.randomUUID());
    const workspace = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
    try {
      const faulty: WorkspaceClient = Object.create(workspace, { fs: { value: Object.create(workspace.fs, { readFile: { value: native } }) } });
      const content = await validatePublishedContentInput(await publication());
      await expect(createPublishedContentReader(faulty, scope).read(content.path, content.contentSha256))
        .rejects.toMatchObject({ code: 'PUBLISHED_CONTENT_CORRUPT' });
    } finally { dispose(workspace); }
    expect(native).not.toHaveBeenCalled();
  });
});
