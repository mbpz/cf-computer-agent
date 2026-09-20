import type { MaintenanceClient, Permit } from './contracts';

export interface WorkScope {
  waitUntil(promise: Promise<unknown>): void;
  run<T>(factory: () => Promise<T>): Promise<T>;
}
export type Completion = { released: true } | { released: false; reason: 'WORK_UNCERTAIN' | 'COMPLETION_UNCONFIRMED' };

class TrackedScope implements WorkScope {
  // The root holds one count until the handler and response wrapping finish.
  #pending = 1;
  #failed = false;
  #sealed = false;
  #resolve!: (result: Completion) => void;
  readonly done = new Promise<Completion>(resolve => { this.#resolve = resolve; });

  constructor(private client: MaintenanceClient, private permit: Permit) {}

  waitUntil(promise: Promise<unknown>): void {
    if (this.#sealed) throw new Error('SCOPE_CLOSED');
    this.#pending++;
    // Observe rejection immediately, even if callers catch/ignore their copy.
    void Promise.resolve(promise).then(() => this.#settle(true), () => this.#settle(false));
  }

  run<T>(factory: () => Promise<T>): Promise<T> {
    if (this.#sealed) return Promise.reject(new Error('SCOPE_CLOSED'));
    const promise = Promise.resolve().then(factory);
    this.waitUntil(promise);
    return promise;
  }

  finishRoot(success: boolean): void { this.#settle(success); }

  #settle(success: boolean): void {
    if (!success) this.#failed = true;
    if (--this.#pending !== 0) return;
    this.#sealed = true; // Fence local late factories before the completion RPC.
    if (this.#failed) {
      this.#resolve({ released: false, reason: 'WORK_UNCERTAIN' });
      return;
    }
    void this.#complete();
  }

  async #complete(): Promise<void> {
    try {
      await this.client.complete(this.permit);
      this.#resolve({ released: true });
    } catch {
      // No retry, expiry or compensating deletion for an unknown RPC result.
      this.#resolve({ released: false, reason: 'COMPLETION_UNCONFIRMED' });
    }
  }
}

/** No untracked timers, callbacks or detached producers are allowed in handler. */
export async function guardFetch(
  client: MaintenanceClient,
  background: (promise: Promise<Completion>) => void,
  handler: (scope: WorkScope) => Promise<Response>,
): Promise<Response> {
  const scope = await admit(client);
  if (!scope) return unavailable();
  try {
    // The host must register this with ExecutionContext.waitUntil before work.
    background(scope.done);
  } catch {
    scope.finishRoot(false);
    return unavailable();
  }
  try {
    const response = trackResponse(await handler(scope), scope);
    scope.finishRoot(true);
    return response;
  } catch {
    scope.finishRoot(false);
    return new Response('Request failed', { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function guardScheduled(
  client: MaintenanceClient,
  handler: (scope: WorkScope) => Promise<void>,
): Promise<boolean> {
  const scope = await admit(client);
  if (!scope) return false;
  try {
    await handler(scope);
    scope.finishRoot(true);
  } catch {
    scope.finishRoot(false);
  }
  return (await scope.done).released;
}

async function admit(client: MaintenanceClient): Promise<TrackedScope | null> {
  try {
    const id = crypto.randomUUID();
    const permit = await client.acquire(id);
    if (!permit || permit.id !== id || !Number.isSafeInteger(permit.epoch) || permit.epoch < 0) return null;
    return new TrackedScope(client, permit);
  } catch {
    return null;
  }
}

function unavailable(): Response {
  return new Response('Service temporarily unavailable', {
    status: 503,
    headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' },
  });
}

function trackResponse(response: Response, scope: WorkScope): Response {
  if (response.webSocket) throw new Error('UNSUPPORTED_WEBSOCKET');
  if (!response.body) return response;
  const reader = response.body.getReader();
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const lifetime = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  scope.waitUntil(lifetime);
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) { controller.close(); resolve(); }
        else controller.enqueue(next.value);
      } catch (error) {
        reject(error);
        controller.error(error);
      }
    },
    async cancel(reason) {
      // Cancellation is NOT evidence the producer stopped writing.
      reject(new Error('STREAM_CANCELED'));
      await reader.cancel(reason);
    },
  }, { highWaterMark: 0 });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
