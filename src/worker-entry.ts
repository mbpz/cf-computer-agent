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
        const app = createApp(options.dependencies);
        return await app.fetch!(request, env, scopedContext(ctx, scope));
      });
    },
    async scheduled(_controller, env) {
      await guardScheduled(lazyClient(() => options.maintenance(env)), async () => sweepAssets(env));
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

async function sweepAssets(env: Env): Promise<void> {
  if (!env.ORIGINALS) {
    console.log('asset parse sweep skipped: binary storage is not configured');
    return;
  }
  const result = await new AssetService(env.ORIGINALS, new AssetsRepository(env.DB), {
    markdownConverter: new WorkersAiMarkdownConverter(env.AI),
    imageConverter: new WorkersAiImageConverter(env.AI),
  }).processDue(3);
  console.log('asset parse sweep complete', result);
}
