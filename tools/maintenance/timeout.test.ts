import { applyD1Migrations, createExecutionContext, createScheduledController, reset, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkerEntry } from '../../src/worker-entry';
import { AssetService } from '../../src/assets/service';
import { AssetsRepository } from '../../src/assets/repository';
import { WorkersAiMarkdownConverter } from '../../src/assets/ai-markdown';
import * as sourceParser from '../../src/sources/parser';
import { MembersRepository } from '../../src/members/repository';
import { SessionService } from '../../src/identity/session';
import { ResearchRepository } from '../../src/research/repository';
import { ResearchReportService } from '../../src/ai/research-report-service';
import { CitedAnswerService } from '../../src/ai/cited-answer-service';
import { SourceSummaryService } from '../../src/ai/source-summary-service';
import { FaqService } from '../../src/ai/faq-service';
import { TimelineService } from '../../src/ai/timeline-service';
import { BriefService } from '../../src/ai/brief-service';
import { ComparisonService } from '../../src/ai/comparison-service';
import { MindmapService } from '../../src/ai/mindmap-service';
import { FlashcardService } from '../../src/ai/flashcard-service';
import { QuizService } from '../../src/ai/quiz-service';
import { GraphSuggestionService } from '../../src/graph/ai-suggestions';
import type { CitationSource, SearchHit } from '../../src/library/types';
import { createD1Facade } from '../../src/maintenance/d1';
import { guardFetch, type Completion } from '../../src/maintenance/lifecycle';
import { MIGRATIONS } from '../../test/fixtures/d1';
import { env } from './env';
import { localEnvironment } from './resources';

const ORIGIN = 'https://memory.crgmhrc.asia';
const NOW = '2026-09-22T00:00:00.000Z';
const owner = { memberId: 'timeout-member', role: 'contributor' as const };
const source: CitationSource = { citationId: 'timeout-citation', knowledgeItemId: 'timeout-knowledge', revisionId: 'timeout-revision',
  chunkId: 'timeout-chunk', title: 'Launch latency evidence', headingPath: [], startLine: 1, endLine: 1,
  body: 'Launch latency requires an independent test window.', publishedAt: NOW };
const hit: SearchHit = { ...source, spaceId: 'default', collectionId: null, excerpt: source.body,
  matchedFields: ['body'], highlights: [], score: -0.0000038 };
const pureProviders: Array<{ name: string; invoke: (ai: { run: () => Promise<unknown> }) => Promise<unknown> }> = [
  { name: 'cited-answer', invoke: ai => new CitedAnswerService(ai).answer(owner, 'launch latency', [hit]) },
  { name: 'source-summary', invoke: ai => new SourceSummaryService(ai).summarize(owner, source.knowledgeItemId, [source]) },
  { name: 'faq', invoke: ai => new FaqService(ai).generate(owner, source.knowledgeItemId, [source]) },
  { name: 'timeline', invoke: ai => new TimelineService(ai).generate(owner, source.knowledgeItemId, [source]) },
  { name: 'brief', invoke: ai => new BriefService(ai).generate(owner, source.knowledgeItemId, [source]) },
  { name: 'comparison', invoke: ai => new ComparisonService(ai).compare(owner, source.knowledgeItemId,
    [source, { ...source, citationId: 'second-citation', chunkId: 'second-chunk' }]) },
  { name: 'mindmap', invoke: ai => new MindmapService(ai).generate(owner, source.knowledgeItemId, [source]) },
  { name: 'flashcard', invoke: ai => new FlashcardService(ai).generate(owner, source.knowledgeItemId, [source]) },
  { name: 'quiz', invoke: ai => new QuizService(ai).generate(owner, source.knowledgeItemId, [source]) },
  { name: 'graph-suggestions', invoke: ai => new GraphSuggestionService(ai).suggest({
    rootId: null, depth: 2, truncated: false,
    nodes: [
      { id: 'task:t', kind: 'task', label: 'Review evidence', status: 'todo', href: null, metadata: {} },
      { id: 'knowledge:k', kind: 'knowledge', label: 'Evidence', status: 'active', href: null, metadata: {} },
    ],
    edges: [{ id: 'e', source: 'task:t', target: 'knowledge:k', kind: 'references', label: 'Evidence', weight: 1, citationIds: [source.citationId] }],
  }) },
];
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Control only application timeout callbacks; never fake the clock used by
// workerd, RPC, sessions or the coordinator. Every native handle is cleaned up.
function controlledTimeouts() {
  const native = globalThis.setTimeout;
  const callbacks = new Map<number, () => void>();
  const handles: ReturnType<typeof setTimeout>[] = [];
  const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
    if (delay !== 5_000 && delay !== 10_000) return native(callback, delay, ...args);
    const handle = native(() => undefined, 60_000);
    handles.push(handle);
    callbacks.set(delay, () => { clearTimeout(handle); callback(...args); });
    return handle;
  });
  return {
    fire(delay: number) {
      const callback = callbacks.get(delay);
      expect(callback, `application timer ${delay} must have been registered`).toBeTypeOf('function');
      callback!();
    },
    close() { for (const handle of handles) clearTimeout(handle); spy.mockRestore(); },
  };
}

async function seedMember() {
  await applyD1Migrations(env.SYNTHETIC_DB, MIGRATIONS);
  await env.SYNTHETIC_DB.prepare(`INSERT INTO members
    (id, access_sub, email, role, status, created_at, updated_at)
    VALUES (?, 'github:timeout', 'timeout@example.test', 'contributor', 'active', ?, ?)`)
    .bind(owner.memberId, NOW, NOW).run();
  const members = new MembersRepository(env.SYNTHETIC_DB);
  return (await new SessionService(env.SYNTHETIC_DB, members, { waitUntil: () => undefined })
    .create((await members.findById(owner.memberId))!)).token;
}

const assetCases = (['http', 'cron'] as const).flatMap(entry =>
  (['image-provider', 'outer-parser'] as const).flatMap(boundary =>
    (['resolve', 'reject'] as const).map(late => ({ entry, boundary, late }))));

describe('timeout boundaries with real local storage', () => {
  beforeEach(async () => { await reset(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it.each(pureProviders.flatMap(service => (['resolve', 'reject'] as const).map(late => ({ ...service, late }))))(
    '$name ignores provider $late after timeout without reading its result', async ({ invoke, late }) => {
      const provider = deferred<unknown>(); const called = deferred(); const timers = controlledTimeouts();
      let resultReads = 0;
      const result = { get response() { resultReads++; return '{}'; } };
      const operation = invoke({ run: () => { called.resolve(); return provider.promise; } });
      const rejected = expect(operation).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
      try {
        expect(await Promise.race([called.promise.then(() => 'provider'), operation.then(() => 'returned', () => 'rejected')])).toBe('provider');
        timers.fire(5_000); await rejected;
        if (late === 'resolve') provider.resolve(result); else provider.reject(new Error('late provider failure'));
        await provider.promise.catch(() => undefined);
        await expect(operation).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
        expect(resultReads).toBe(0);
      } finally { provider.resolve(result); timers.close(); await rejected; }
    },
  );

  it.each(assetCases)('$entry / $boundary / late $late does not escape into successful storage', async ({ entry, boundary, late }) => {
    const token = await seedMember();
    const repository = new AssetsRepository(env.SYNTHETIC_DB);
    const { asset } = await new AssetService(env.SYNTHETIC_ORIGINALS, repository).create({
      ownerId: owner.memberId, originalName: 'late.png',
      contentType: 'image/png', idempotencyKey: 'late-asset',
      bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]).buffer,
    });
    const provider = deferred<unknown>(); const called = deferred();
    const parserStarted = deferred();
    const parsed: Array<ReturnType<typeof sourceParser.parseSource>> = [];
    const parseSource = sourceParser.parseSource;
    vi.spyOn(sourceParser, 'parseSource').mockImplementation(input => {
      const operation = parseSource(input); parsed.push(operation); parserStarted.resolve(); return operation;
    });
    const cleanupStarted = deferred(); const allowCleanup = deferred();
    const bucket = env.SYNTHETIC_ORIGINALS;
    const storage: R2Bucket = Object.create(bucket, {
      get: { value: bucket.get.bind(bucket) }, put: { value: bucket.put.bind(bucket), configurable: true },
      delete: { value: async (key: string | string[]) => {
        cleanupStarted.resolve(); await allowCleanup.promise; await bucket.delete(key);
      } },
    });
    await expect(storage.get(asset.objectKey)).resolves.not.toBeNull();
    const successWrites = vi.spyOn(storage, 'put');
    const appEnv: Env = Object.create(localEnvironment(env), {
      ORIGINALS: { value: storage },
      AI: { value: { run: () => { called.resolve(); return provider.promise; } } },
    });
    const g = env.MAINTENANCE.getByName(crypto.randomUUID());
    const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g });
    const ctx = createExecutionContext(); const timers = controlledTimeouts();
    const pending = entry === 'cron'
      ? worker.scheduled(createScheduledController(), appEnv, ctx)
      : worker.fetch(new Request(`${ORIGIN}/api/assets/${asset.id}`, {
        method: 'POST', headers: { origin: ORIGIN, cookie: `__Host-memory-session=${token}` },
      }) as Request<unknown, IncomingRequestCfProperties<unknown>>, appEnv, ctx);
    try {
      expect(await Promise.race([
        called.promise.then(() => 'provider'), cleanupStarted.promise.then(() => 'cleanup-before-provider'),
        Promise.resolve(pending).then(() => 'entry-returned-before-provider'),
      ])).toBe('provider');
      timers.fire(boundary === 'outer-parser' ? 10_000 : 5_000);
      await cleanupStarted.promise;
      expect((await repository.findById(asset.id))?.job.status).toBe('processing');
      expect(await g.beginDrain('timeout-cleanup', 0)).toMatchObject({ active: 1, phase: 'DRAINING' });
      allowCleanup.resolve();
      const response = await pending;
      if (response) { expect(response.status).toBe(200); await response.text(); }
      await waitOnExecutionContext(ctx);
      expect((await repository.findById(asset.id))?.job).toMatchObject({
        status: 'failed_retryable',
        lastErrorCode: boundary === 'outer-parser' ? 'ASSET_PARSE_TIMEOUT' : 'ASSET_AI_PARSE_FAILED',
      });
      // The provider is still pending, but can no longer reach success writes.
      expect(await g.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
      if (late === 'resolve') provider.resolve({ response: JSON.stringify({ text: 'Synthetic late image evidence.', confidence: 0.99 }) });
      else provider.reject(new Error('late provider failure'));
      await provider.promise.catch(() => undefined);
      // The outer parser loser still performs real parsing/hash work. Await
      // that work before inspecting storage; a round trip alone is not a fence.
      if (boundary === 'outer-parser' && late === 'resolve') {
        await parserStarted.promise; await Promise.all(parsed);
      }
      expect(await bucket.get(`parsed/${asset.id}.md`)).toBeNull();
      expect(successWrites).not.toHaveBeenCalled();
      expect((await repository.findById(asset.id))?.job.status).toBe('failed_retryable');
      expect(await g.status()).toMatchObject({ active: 0, phase: 'DRAINED' });
    } finally {
      allowCleanup.resolve(); provider.resolve({ response: 'cleanup' }); timers.close();
      const response = await pending;
      if (response && !response.bodyUsed) await response.text();
      await waitOnExecutionContext(ctx);
      await Promise.all(successWrites.mock.results.filter(result => result.type === 'return').map(result => result.value));
    }
  });

  // RTF reaches the adapter directly, but AssetService.isRichAsset currently
  // rejects it. Do not claim this is an HTTP/Cron-reachable provider branch.
  it.each(['resolve', 'reject'] as const)('markdown adapter ignores late provider %s', async late => {
    const provider = deferred<unknown>(); const called = deferred(); const timers = controlledTimeouts();
    const conversion = new WorkersAiMarkdownConverter({ run: () => { called.resolve(); return provider.promise; } })
      .toMarkdown({ name: 'late.rtf', blob: new Blob(['{\\rtf1 Synthetic source.}'], { type: 'application/rtf' }) });
    const result = expect(conversion).rejects.toMatchObject({ code: 'ASSET_AI_PARSE_FAILED' });
    try {
      await called.promise; timers.fire(5_000); await result;
      if (late === 'resolve') provider.resolve({ response: '# Valid late document\nSynthetic evidence.' });
      else provider.reject(new Error('late provider failure'));
      await provider.promise.catch(() => undefined);
      await expect(conversion).rejects.toMatchObject({ code: 'ASSET_AI_PARSE_FAILED' });
    } finally { provider.resolve({ response: 'cleanup' }); timers.close(); await result; }
  });

  it.each(['http', 'cron'] as const)('on-time asset result actually writes parsed R2 and D1 through %s', async entry => {
    const token = await seedMember(); const repository = new AssetsRepository(env.SYNTHETIC_DB);
    const { asset } = await new AssetService(env.SYNTHETIC_ORIGINALS, repository).create({
      ownerId: owner.memberId, originalName: 'control.png', contentType: 'image/png', idempotencyKey: 'control-asset',
      bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]).buffer,
    });
    const appEnv: Env = Object.create(localEnvironment(env), { AI: { value: {
      run: async () => ({ response: JSON.stringify({ text: 'Synthetic late image evidence.', confidence: 0.99 }) }),
    } } });
    const g = env.MAINTENANCE.getByName(crypto.randomUUID()); const ctx = createExecutionContext();
    const worker = createWorkerEntry({ mode: 'guarded', maintenance: () => g });
    if (entry === 'cron') await worker.scheduled(createScheduledController(), appEnv, ctx);
    else {
      const response = await worker.fetch(new Request(`${ORIGIN}/api/assets/${asset.id}`, {
        method: 'POST', headers: { origin: ORIGIN, cookie: `__Host-memory-session=${token}` },
      }) as Request<unknown, IncomingRequestCfProperties<unknown>>, appEnv, ctx);
      expect(response.status).toBe(200); await response.text();
    }
    await waitOnExecutionContext(ctx);
    expect((await repository.findById(asset.id))?.job.status).toBe('succeeded');
    expect(await (await env.SYNTHETIC_ORIGINALS.get(`parsed/${asset.id}.md`))?.text()).toContain('Synthetic late image evidence.');
    expect(await g.beginDrain('asset-on-time', 0)).toMatchObject({ active: 0, phase: 'DRAINED' });
  });

  it.each(['success', 'failure'] as const)('tracks an entire writable race loser through late %s', async outcome => {
    await seedMember();
    const g = env.MAINTENANCE.getByName(crypto.randomUUID());
    const start = deferred(); const timeout = deferred(); const late = deferred();
    const tasks: Promise<Completion>[] = [];
    const responseTask = guardFetch(g, task => tasks.push(task), async scope => {
      const db = createD1Facade(env.SYNTHETIC_DB, scope);
      const original = scope.run(async () => {
        start.resolve(); await late.promise;
        await db.prepare("UPDATE members SET email = 'late@example.test' WHERE id = ?").bind(owner.memberId).run();
        if (outcome === 'failure') throw new Error('late original failure');
      });
      await Promise.race([original, timeout.promise]).catch(() => undefined);
      return new Response(null, { status: 504 });
    });
    await start.promise; timeout.reject(new Error('synthetic deadline'));
    const response = await responseTask;
    try {
      expect(response.status).toBe(504);
      expect(await g.beginDrain('writable-race', 0)).toMatchObject({ active: 1, phase: 'DRAINING' });
      expect(await env.SYNTHETIC_DB.prepare('SELECT email FROM members WHERE id = ?').bind(owner.memberId).first('email'))
        .toBe('timeout@example.test');
    } finally { late.resolve(); await Promise.all(tasks); }
    expect(await env.SYNTHETIC_DB.prepare('SELECT email FROM members WHERE id = ?').bind(owner.memberId).first('email'))
      .toBe('late@example.test');
    expect(await Promise.all(tasks)).toEqual([outcome === 'success'
      ? { released: true } : { released: false, reason: 'WORK_UNCERTAIN' }]);
    expect(await g.status()).toMatchObject(outcome === 'success'
      ? { active: 0, phase: 'DRAINED' } : { active: 1, phase: 'DRAINING' });
  });

  it.each(['on-time', 'late-report', 'late-quota'] as const)('research report keeps persistence outside the provider race: %s', async mode => {
    await seedMember();
    await env.SYNTHETIC_DB.prepare(`INSERT INTO knowledge_items
      (id, space_id, status, search_status, created_at, updated_at)
      VALUES ('timeout-knowledge', (SELECT id FROM spaces LIMIT 1), 'active', 'indexed', ?, ?)`).bind(NOW, NOW).run();
    const repository = new ResearchRepository(env.SYNTHETIC_DB);
    await repository.createRun({ id: 'timeout-research', ownerMemberId: owner.memberId, knowledgeItemId: 'timeout-knowledge',
      goal: 'Synthetic research', createdAt: NOW,
      plan: { spaceIds: [], collectionIds: [], knowledgeItemIds: [], completion: ['Report'], steps: ['Read evidence'], subquestions: [] } });
    await repository.approveRun(owner, 'timeout-research');
    const valid = { response: JSON.stringify({ title: 'Synthetic report', insufficientEvidence: false,
      sections: [{ heading: 'Conclusion', body: 'A bounded conclusion.', citationIds: [source.citationId] }] }) };
    const provider = deferred<unknown>(); const called = deferred(); const timers = controlledTimeouts();
    const g = env.MAINTENANCE.getByName(crypto.randomUUID()); const tasks: Promise<Completion>[] = [];
    const pending = guardFetch(g, task => tasks.push(task), async scope => {
      const service = new ResearchReportService(new ResearchRepository(createD1Facade(env.SYNTHETIC_DB, scope)),
        { run: () => { called.resolve(); return provider.promise; } });
      try {
        const report = await service.generate(owner, 'timeout-research', [source]);
        return Response.json(report);
      } catch (error) {
        expect(error).toMatchObject({ code: 'AI_UNAVAILABLE' });
        return new Response(null, { status: 503 });
      }
    });
    try {
      await called.promise;
      if (mode === 'on-time') provider.resolve(valid); else timers.fire(5_000);
      const response = await pending; expect(response.status).toBe(mode === 'on-time' ? 200 : 503);
      await response.text(); expect(await Promise.all(tasks)).toEqual([{ released: true }]);
      expect(await g.beginDrain('research-race', 0)).toMatchObject({ active: 0, phase: 'DRAINED' });
      if (mode === 'late-report') provider.resolve(valid);
      if (mode === 'late-quota') provider.reject(new Error('quota exceeded'));
      await provider.promise.catch(() => undefined);
      expect(await env.SYNTHETIC_DB.prepare('SELECT COUNT(*) AS n FROM research_reports').first('n')).toBe(mode === 'on-time' ? 1 : 0);
      expect(await repository.findRun(owner, 'timeout-research')).toMatchObject({ quotaState: 'available', quotaDeferredUntil: null });
    } finally {
      provider.resolve(valid); timers.close();
      const response = await pending; if (!response.bodyUsed) await response.text();
      await Promise.all(tasks);
    }
  });
});
