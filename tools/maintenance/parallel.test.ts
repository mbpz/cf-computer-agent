import { applyD1Migrations, reset } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { guardFetch, type Completion } from '../../src/maintenance/lifecycle';
import { createD1Facade } from '../../src/maintenance/d1';
import { AppError } from '../../src/http';
import { TodayService } from '../../src/today/service';
import { TasksService } from '../../src/tasks/service';
import { TasksRepository } from '../../src/tasks/repository';
import { InboxService } from '../../src/inbox/service';
import { InboxRepository } from '../../src/inbox/repository';
import { ProjectsService } from '../../src/projects/service';
import { ProjectsRepository } from '../../src/projects/repository';
import { CalendarService } from '../../src/calendar/service';
import { CalendarRepository } from '../../src/calendar/repository';
import { WorkbenchReviewService } from '../../src/workbench-review/service';
import { WorkbenchReviewRepository } from '../../src/workbench-review/repository';
import { FocusService } from '../../src/focus/service';
import { FocusRepository } from '../../src/focus/repository';
import { parallelWork } from '../../src/maintenance/work';
import { GraphProjectionService } from '../../src/graph/service';
import { GraphProjectionRepository } from '../../src/graph/repository';
import { LibraryService } from '../../src/library/service';
import { LibraryRepository } from '../../src/library/repository';
import { MIGRATIONS } from '../../test/fixtures/d1';
import { env } from './env';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}

describe('complete parallel continuations', () => {
  beforeEach(async () => { await reset(); await applyD1Migrations(env.SYNTHETIC_DB, MIGRATIONS); });

  it.each((['today', 'review'] as const).flatMap(service => [400, 403, 404, 500].map(status => ({ service, status }))))('keeps a delayed $service branch open after a sibling fails ($status)', async ({ service, status }) => {
    const g = env.MAINTENANCE.getByName(crypto.randomUUID());
    const background: Promise<Completion>[] = [];
    const started = deferred(); const resume = deferred(); const finished = deferred();
    let continuationError: unknown; let aggregate: Promise<unknown> = Promise.resolve();
    const failure = status === 500 ? new Error('synthetic upstream failure') : new AppError('SYNTHETIC', 'Synthetic denial', status);
    const response = await guardFetch(g, task => background.push(task), async workScope => {
      const scopedDb = createD1Facade(env.SYNTHETIC_DB, workScope);
      // Fault/delay injection at the repository I/O boundary; all successful reads use real D1.
      class DelayedTasks extends TasksRepository {
        override async list(...args: Parameters<TasksRepository['list']>) {
          started.resolve(); await resume.promise;
          try { return await super.list(...args); }
          catch (error) { continuationError = error; throw error; }
          finally { finished.resolve(); }
        }
        override async summary(): ReturnType<TasksRepository['summary']> { throw failure; }
      }
      const services = {
        tasks: new TasksService(new DelayedTasks(scopedDb)),
        inbox: new InboxService(new InboxRepository(env.SYNTHETIC_DB)),
        projects: new ProjectsService(new ProjectsRepository(env.SYNTHETIC_DB)),
        calendar: new CalendarService(new CalendarRepository(env.SYNTHETIC_DB)),
      };
      // Isolate branch lifetime from the caller's lifetime (the early-rejection case).
      const now = () => new Date('2026-09-21T00:00:00Z');
      aggregate = (service === 'today' ? new TodayService(services, now, workScope).get('missing-member')
        : new WorkbenchReviewService(new WorkbenchReviewRepository(env.SYNTHETIC_DB), {
          ...services, focus: new FocusService(new FocusRepository(env.SYNTHETIC_DB)),
        }, now, workScope).get('missing-member', 'daily')).catch(error => error);
      await started.promise;
      return new Response(null, { status: 204 });
    });
    expect(response.status).toBe(204);
    try {
      expect(await g.status()).toMatchObject({ active: 1 });
    } finally {
      resume.resolve(); await finished.promise; await aggregate; await Promise.all(background);
    }
    expect(continuationError).toBeUndefined();
    expect(await aggregate).toBe(failure);
    expect(await g.status()).toMatchObject({ active: status === 500 ? 1 : 0 });
  });

  it('waits for siblings before finally disposes resources, preserving the first error', async () => {
    const g = env.MAINTENANCE.getByName(crypto.randomUUID());
    const background: Promise<Completion>[] = [];
    const resume = deferred(); const started = deferred();
    const first = new AppError('SYNTHETIC', 'Synthetic denial', 404);
    let disposed = false; let usableAtEnd = false;
    const responsePromise = guardFetch(g, task => background.push(task), async scope => {
      try {
        await parallelWork(scope, [
          async () => { throw first; },
          async () => { started.resolve(); await resume.promise; usableAtEnd = !disposed; throw new Error('later upstream error'); },
        ]);
        return new Response(null, { status: 204 });
      } catch (error) {
        expect(error).toBe(first);
        return new Response(null, { status: 404 });
      } finally { disposed = true; }
    });
    await started.promise;
    try { expect(await g.status()).toMatchObject({ active: 1 }); expect(disposed).toBe(false); }
    finally { resume.resolve(); }
    expect((await responsePromise).status).toBe(404);
    expect(usableAtEnd).toBe(true); expect(disposed).toBe(true);
    await expect(Promise.all(background)).resolves.toEqual([{ released: false, reason: 'WORK_UNCERTAIN' }]);
  });

  it.each(['graph', 'library'] as const)('keeps the complete %s repository branch alive between I/O calls', async kind => {
    await env.SYNTHETIC_DB.prepare(`INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at)
      VALUES ('branch-member', 'github:branch', 'branch@example.test', 'contributor', 'active', '2026-09-21', '2026-09-21')`).run();
    const g = env.MAINTENANCE.getByName(crypto.randomUUID()); const background: Promise<Completion>[] = [];
    const resume = deferred(); const started = deferred(); const finished = deferred();
    const failure = new AppError('SYNTHETIC', 'Synthetic denial', 404);
    let tailError: unknown; let aggregate: Promise<unknown> = Promise.resolve();
    await guardFetch(g, task => background.push(task), async scope => {
      const db = createD1Facade(env.SYNTHETIC_DB, scope);
      class DelayedGraph extends GraphProjectionRepository {
        override async listKnowledge(): ReturnType<GraphProjectionRepository['listKnowledge']> { throw failure; }
        override async listTasks(...args: Parameters<GraphProjectionRepository['listTasks']>) {
          started.resolve(); await resume.promise;
          try { return await super.listTasks(...args); }
          catch (error) { tailError = error; throw error; }
          finally { finished.resolve(); }
        }
      }
      class DelayedLibrary extends LibraryRepository {
        override async findRevision(...args: Parameters<LibraryRepository['findRevision']>) {
          if (args[2] === 'early') throw failure;
          started.resolve(); await resume.promise;
          try { return await super.findRevision(...args); }
          catch (error) { tailError = error; throw error; }
          finally { finished.resolve(); }
        }
      }
      aggregate = (kind === 'graph'
        ? new GraphProjectionService(new DelayedGraph(db, {}, scope), { workScope: scope })
          .get('branch-member', { scope: 'workspace', rootId: null, depth: 1, types: [], limit: 20 })
        : new LibraryService(new DelayedLibrary(db), { read: async () => { throw new Error('UNEXPECTED_CONTENT_READ'); } }, undefined, scope)
          .diff({ memberId: 'branch-member', role: 'contributor' }, 'missing-knowledge', 'early', 'delayed'))
        .catch(error => error);
      await started.promise;
      return new Response(null, { status: 204 });
    });
    try { expect(await g.status()).toMatchObject({ active: 1 }); }
    finally { resume.resolve(); await finished.promise; await aggregate; await Promise.all(background); }
    expect(tailError).toBeUndefined(); expect(await aggregate).toBe(failure);
    expect(await g.status()).toMatchObject({ active: 0 });
  });

  it('preserves legacy fail-fast behavior without a scope', async () => {
    const resume = deferred(); let finished = false;
    const failure = new Error('synthetic first error');
    const result = parallelWork(undefined, [async () => { throw failure; }, async () => { await resume.promise; finished = true; }]);
    try { await expect(result).rejects.toBe(failure); expect(finished).toBe(false); }
    finally { resume.resolve(); await resume.promise; }
    expect(finished).toBe(true);
  });

  it('releases successful and empty parallel work and preserves result ordering', async () => {
    const g = env.MAINTENANCE.getByName(crypto.randomUUID()); const background: Promise<Completion>[] = [];
    const response = await guardFetch(g, task => background.push(task), async scope => {
      expect(await parallelWork(scope, [])).toEqual([]);
      expect(await parallelWork(scope, [async () => 'first', async () => 2])).toEqual(['first', 2]);
      return new Response(null, { status: 204 });
    });
    expect(response.status).toBe(204);
    await expect(Promise.all(background)).resolves.toEqual([{ released: true }]);
  });
});
