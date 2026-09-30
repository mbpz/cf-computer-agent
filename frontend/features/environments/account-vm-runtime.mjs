// Web Locks are origin/profile scoped, not a cross-device or cross-origin lease.
export const VM_RUNTIME_LOCK = 'memory-garden-vm-runtime-v1';
const OUTPUT_LIMIT = 65536;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Account-owned, explicitly started VM. Factory must synchronously return its
 * cancellable resource handle; asynchronous initialization belongs in ready.
 * No images, credentials, output or commands are persisted by this owner.
 */
export function createAccountVmRuntime({ owner, locks = globalThis.navigator?.locks, createSession, bootTimeoutMs = 60000 }) {
  if (!owner?.signal || typeof createSession !== 'function' || !Number.isFinite(bootTimeoutMs) || bootTimeoutMs <= 0) throw new Error('INVALID_RUNTIME');
  let current;
  let snapshot = Object.freeze({ status: owner.signal.aborted ? 'closed' : 'idle', environmentId: null, output: '', reason: '' });
  const listeners = new Set();
  function publish(patch) {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    for (const listener of listeners) { try { listener(); } catch { /* Rendering cannot prevent resource cleanup. */ } }
  }
  function live(run) { return current === run && !run.cancelled && !owner.signal.aborted; }
  function invalidate(run, reason) {
    if (run.cancelled) return;
    run.cancelled = true;
    for (const request of run.files) request.reject(new Error('VM_NOT_RUNNING'));
    run.files.clear();
    clearTimeout(run.timer);
    run.started.reject(new Error(reason));
    publish({ status: 'stopping', output: '', reason });
    // Disconnect only an existing network handle; stopping never creates one.
    try { owner.disconnectEnvironment(run.environment.id); } catch { /* Worker still must terminate. */ }
  }
  function cleanup(run) {
    if (run.creating) return; // Synchronous factory may re-enter through callbacks.
    if (run.cleanup) return run.cleanup;
    run.cleanup = Promise.resolve().then(() => run.session?.close()).then(() => {
      run.release.resolve();
    }, () => {
      run.cleanup = undefined;
      publish({ status: 'failed', reason: 'CLEANUP_FAILED', output: '' });
      // Fail closed: retain the lock. Only an explicit later stop retries cleanup.
      throw new Error('CLEANUP_FAILED');
    });
    return run.cleanup;
  }
  function halt(run, reason) {
    invalidate(run, reason);
    const cleaning = cleanup(run);
    return (cleaning ?? run.factoryDone.promise.then(() => cleanup(run))).then(() => run.lockTask);
  }
  function cancel(reason) {
    if (current) void halt(current, reason).catch(() => {});
    else if (owner.signal.aborted) publish({ status: 'closed', output: '', environmentId: null });
  }
  const unsubscribe = owner.onEnvironmentRemoved(id => { if (current?.environment.id === id) cancel('ENVIRONMENT_REMOVED'); });
  owner.signal.addEventListener('abort', () => { cancel('ACCOUNT_CLOSED'); unsubscribe(); }, { once: true });

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async start(environment) {
      if (!environment || environment.memberId !== owner.scope.memberId || !['personal', 'temporary'].includes(environment.type)) throw new Error('INVALID_ENVIRONMENT');
      owner.assertEnvironment(environment.id);
      if (!locks?.request) throw new Error('LOCKS_UNAVAILABLE');
      if (current) throw new Error('VM_BUSY');
      const run = { environment: Object.freeze({ ...environment }), started: deferred(), release: deferred(), factoryDone: deferred(), cancelled: false, creating: false, files: new Set() };
      current = run;
      publish({ status: 'acquiring', environmentId: environment.id, output: '', reason: '' });
      // Start through a microtask so even a throwing lock implementation is caught.
      run.lockTask = Promise.resolve().then(() => locks.request(VM_RUNTIME_LOCK, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (run.cancelled) return;
        if (!lock) throw new Error('VM_BUSY');
        publish({ status: 'booting' });
        if (run.cancelled) return;
        run.creating = true;
        try {
          run.session = createSession({
            environment: run.environment,
            onOutput(text) { if (live(run) && typeof text === 'string') publish({ output: (snapshot.output + text).slice(-OUTPUT_LIMIT) }); },
            onClosed() { if (live(run)) void halt(run, 'WORKER_CLOSED').catch(() => {}); },
          });
          if (!run.session || typeof run.session.close !== 'function' || typeof run.session.write !== 'function' || !run.session.ready?.then) throw new Error('INVALID_SESSION');
        } catch {
          invalidate(run, 'BOOT_FAILED');
        } finally {
          run.creating = false;
          run.factoryDone.resolve();
        }
        if (run.cancelled) void cleanup(run).catch(() => {});
        else run.timer = setTimeout(() => { void halt(run, 'BOOT_TIMEOUT').catch(() => {}); }, bootTimeoutMs);
        Promise.resolve(run.session?.ready).then(() => {
          if (!live(run)) return;
          clearTimeout(run.timer);
          publish({ status: 'running' });
          run.started.resolve();
        }, () => { if (live(run)) void halt(run, 'BOOT_FAILED').catch(() => {}); });
        await run.release.promise;
      })).catch(error => {
        if (!run.cancelled) {
          const reason = error?.message === 'VM_BUSY' ? 'VM_BUSY' : 'LOCK_FAILED';
          invalidate(run, reason);
        }
      }).finally(() => {
        if (current !== run) return;
        current = undefined;
        publish({ status: owner.signal.aborted ? 'closed' : 'idle', environmentId: null, output: '' });
      });
      return run.started.promise;
    },
    async stop() {
      if (current) await halt(current, 'STOPPED');
      else if (owner.signal.aborted) publish({ status: 'closed', output: '', environmentId: null });
    },
    async file(input) {
      const run = current;
      if (!run || !live(run) || snapshot.status !== 'running') throw new Error('VM_NOT_RUNNING');
      if (typeof run.session.file !== 'function') throw new Error('UNSUPPORTED_FILESYSTEM');
      const request = deferred();
      run.files.add(request);
      // Observe late settlement, but invalidate immediately even if a faulty
      // session never settles. Never expose an old account's result or replay it.
      Promise.resolve().then(() => {
        if (!live(run)) throw new Error('VM_NOT_RUNNING');
        return run.session.file(input);
      }).then(value => {
        if (live(run)) request.resolve(value);
        else request.reject(new Error('VM_NOT_RUNNING'));
      }, error => request.reject(live(run) ? error : new Error('VM_NOT_RUNNING')));
      try { return await request.promise; }
      finally { run.files.delete(request); }
    },
    async write(text) {
      const run = current;
      if (!run || !live(run) || snapshot.status !== 'running') throw new Error('VM_NOT_RUNNING');
      try { await run.session.write(text); }
      catch { throw new Error(live(run) ? 'INPUT_FAILED' : 'VM_NOT_RUNNING'); }
      if (!live(run)) throw new Error('VM_NOT_RUNNING');
    },
  });
}
