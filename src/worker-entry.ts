import { createApp, type AppDependencies } from './app';
import { WorkersAiMarkdownConverter } from './assets/ai-markdown';
import { WorkersAiImageConverter } from './assets/ai-image';
import { AssetsRepository } from './assets/repository';
import { AssetService } from './assets/service';
import type { MaintenanceClient } from './maintenance/contracts';
import { createD1Facade } from './maintenance/d1';
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
        const bindings = scopedBindings(env, options.dependencies, scope);
        const app = createApp(bindings.dependencies);
        return await app.fetch!(request, bindings.env, scopedContext(ctx, scope));
      });
    },
    async scheduled(_controller, env) {
      await guardScheduled(lazyClient(() => options.maintenance(env)), async scope => {
        await sweepAssets(scopedBindings(env, undefined, scope).env, scope);
      });
    },
  };
}

/** Created only after admission, never shared between HTTP requests or Cron runs. */
function scopedBindings(env: Env, dependencies: AppDependencies | undefined, scope: WorkScope): {
  env: Env; dependencies: AppDependencies;
} {
  const databases = new WeakMap<D1Database, D1Database>();
  function database(native: D1Database): D1Database {
    scope.assertOpen();
    let facade = databases.get(native);
    if (!facade) {
      facade = createD1Facade(native, scope);
      databases.set(native, facade);
    }
    return facade;
  }
  // Shadow only D1. Do not spread/eagerly read unrelated bindings: static
  // requests and the optional-storage Cron skip must remain lazy.
  const scopedEnv: Env = Object.create(env, {
    DB: { enumerable: true, get: () => database(env.DB) },
  });
  const scopedDependencies: AppDependencies = Object.create(dependencies ?? null, {
    workScope: { enumerable: true, value: scope },
    sessionDatabase: { enumerable: true, get: () => {
      const override = dependencies?.sessionDatabase;
      return override ? database(override) : undefined;
    } },
  });
  return { env: scopedEnv, dependencies: scopedDependencies };
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

async function sweepAssets(env: Env, workScope?: WorkScope): Promise<void> {
  if (!env.ORIGINALS) {
    console.log('asset parse sweep skipped: binary storage is not configured');
    return;
  }
  const result = await new AssetService(env.ORIGINALS, new AssetsRepository(env.DB), {
    workScope,
    markdownConverter: new WorkersAiMarkdownConverter(env.AI),
    imageConverter: new WorkersAiImageConverter(env.AI),
  }).processDue(3);
  console.log('asset parse sweep complete', result);
}
