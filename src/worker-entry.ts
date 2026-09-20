import { createApp, type AppDependencies } from './app';
import { WorkersAiMarkdownConverter } from './assets/ai-markdown';
import { WorkersAiImageConverter } from './assets/ai-image';
import { AssetsRepository } from './assets/repository';
import { AssetService } from './assets/service';
import type { MaintenanceClient } from './maintenance/contracts';
import { guardFetch, guardScheduled, type WorkScope } from './maintenance/lifecycle';

type EntryOptions = { mode: 'legacy'; dependencies?: AppDependencies }
  | { mode: 'guarded'; dependencies?: AppDependencies; maintenance: (env: Env) => MaintenanceClient };
type WorkerEntry = Required<Pick<ExportedHandler<Env>, 'fetch' | 'scheduled'>>;

/** Shared business entry; guarded mode is local-only until later release gates. */
export function createWorkerEntry(options: EntryOptions): WorkerEntry {
  if (options.mode === 'legacy') {
    const app = createApp(options.dependencies);
    return { fetch: app.fetch!, scheduled: (_controller, env) => sweepAssets(env) };
  }
  return {
    fetch(request, env, ctx) {
      return guardFetch(lazyClient(() => options.maintenance(env)), promise => ctx.waitUntil(promise), async scope => {
        // Admission and host registration precede even service construction.
        const app = createApp(scopedDependencies(options.dependencies, env, scope));
        return await app.fetch!(request, scopedEnvironment(env, scope), scopedContext(ctx, scope));
      });
    },
    async scheduled(_controller, env) {
      await guardScheduled(lazyClient(() => options.maintenance(env)), async scope => sweepAssets(scopedEnvironment(env, scope), scope));
    },
  };
}

/** Provider lookup runs inside admission's catch; never silently use legacy. */
function lazyClient(provider: () => MaintenanceClient): MaintenanceClient {
  let client: MaintenanceClient;
  return {
    async acquire(id) {
      client = provider();
      if (!client || typeof client.acquire !== 'function' || typeof client.complete !== 'function') {
        throw new Error('MAINTENANCE_CLIENT_INVALID');
      }
      return await client.acquire(id);
    },
    async complete(permit) { return await client.complete(permit); },
  };
}

function scopedDependencies(dependencies: AppDependencies | undefined, env: Env, scope: WorkScope): AppDependencies {
  const current = dependencies || {};
  return {
    ...current,
    sessionDatabase: current.sessionDatabase
      ? scope.wrapDatabase(current.sessionDatabase)
      : undefined,
    workScope: scope,
    onBackgroundFailure: reason => {
      try {
        scope.markUncertain(reason);
      } catch {
        // A late failure after sealing is already represented by the tracked promise.
      }
    },
  };
}

function scopedEnvironment(env: Env, scope: WorkScope): Env {
  return new Proxy(env, {
    get(target, property, receiver) {
      if (property === 'DB') return scope.wrapDatabase(Reflect.get(target, property, receiver) as D1Database);
      return Reflect.get(target, property, receiver);
    },
  });
}

function scopedContext(ctx: ExecutionContext, scope: WorkScope): ExecutionContext {
  return {
    waitUntil: promise => scope.waitUntil(promise),
    passThroughOnException: () => ctx.passThroughOnException(),
    get exports() { return ctx.exports; },
    get props() { return ctx.props; },
    get cache() { return ctx.cache; },
    get access() { return ctx.access; },
    get tracing() { return ctx.tracing; },
  };
}

async function sweepAssets(env: Env, scope?: WorkScope): Promise<void> {
  if (!env.ORIGINALS) {
    console.log('asset parse sweep skipped: binary storage is not configured');
    return;
  }
  const result = await new AssetService(env.ORIGINALS, new AssetsRepository(env.DB), {
    markdownConverter: new WorkersAiMarkdownConverter(env.AI),
    imageConverter: new WorkersAiImageConverter(env.AI),
    onFailure: () => scope?.markUncertain('BACKGROUND_WORK_FAILED'),
  }).processDue(3);
  console.log('asset parse sweep complete', result);
}
