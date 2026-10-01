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
 * Persistence is optional and delegated to the account-scoped checkpoint store.
 * Full checkpoints can contain guest credentials/data; callers must disclose this.
 */
export function createAccountVmRuntime({ owner, locks = globalThis.navigator?.locks, createSession, checkpoints, autoSaveMs = 300000, bootTimeoutMs = 60000 }) {
  if (!owner?.signal || typeof createSession !== 'function' || !Number.isFinite(bootTimeoutMs) || bootTimeoutMs <= 0) throw new Error('INVALID_RUNTIME');
  if (!Number.isSafeInteger(autoSaveMs) || autoSaveMs < 0) throw new Error('INVALID_RUNTIME');
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
    clearTimeout(run.autoTimer);
    run.operation.abort();
    run.cancelWait.resolve();
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

  function scheduleSave(run) {
    clearTimeout(run.autoTimer);
    if (autoSaveMs && checkpoints && live(run) && run.environment.type === 'personal') {
      run.autoTimer = setTimeout(() => {
        if (live(run)) void runtime.save().catch(() => {}).finally(() => { if (live(run)) scheduleSave(run); });
      }, autoSaveMs);
    }
  }
  const runtime = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async start(environment, {restore = false, revision} = {}) {
      if (!environment || environment.memberId !== owner.scope.memberId || !['personal', 'temporary'].includes(environment.type)) throw new Error('INVALID_ENVIRONMENT');
      owner.assertEnvironment(environment.id);
      if (typeof restore !== 'boolean' || revision !== undefined && (!restore || !Number.isSafeInteger(revision) || revision < 1 || revision >= Number.MAX_SAFE_INTEGER)) throw Error('INVALID_RESTORE');
      if (restore && environment.type !== 'personal') throw Error('PERSISTENCE_PERSONAL_ONLY');
      if (restore && !checkpoints) throw Error('CHECKPOINT_STORAGE_UNAVAILABLE');
      if (!locks?.request) throw new Error('LOCKS_UNAVAILABLE');
      if (current) throw new Error('VM_BUSY');
      const run = { environment: Object.freeze({ ...environment }), started: deferred(), release: deferred(), factoryDone: deferred(), cancelled: false, creating: false, files: new Set(), operation: new AbortController(), cancelWait: deferred(), revision: 0 };
      current = run;
      publish({ status: 'acquiring', environmentId: environment.id, output: '', reason: '', savedAt: undefined, restoredRevision: undefined });
      // Start through a microtask so even a throwing lock implementation is caught.
      run.lockTask = Promise.resolve().then(() => locks.request(VM_RUNTIME_LOCK, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (run.cancelled) return;
        if (!lock) throw new Error('VM_BUSY');
        let restored;
        if (restore) {
          publish({status:'restoring'});
          owner.disconnectEnvironment(environment.id);
          try {
            restored = await Promise.race([
              checkpoints.load(run.environment, {revision,signal:run.operation.signal}),
              run.cancelWait.promise.then(() => {throw Error('VM_NOT_RUNNING');}),
            ]);
            if (!restored) throw Error('CHECKPOINT_NOT_FOUND');
            run.revision = restored.headRevision;
            if (!live(run)) return;
            publish({savedAt:restored.savedAt,restoredRevision:restored.revision});
          } catch (error) {
            if (live(run)) invalidate(run, error?.message === 'CHECKPOINT_NOT_FOUND' ? 'CHECKPOINT_NOT_FOUND' : 'CHECKPOINT_RESTORE_FAILED');
            await cleanup(run);return;
          }
        }
        publish({ status: 'booting' });
        if (run.cancelled) return;
        run.creating = true;
        try {
          run.session = createSession({
            environment: run.environment,
            ...(restored ? {checkpoint:restored.checkpoint} : {}),
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
          scheduleSave(run);
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
    async save() {
      const run = current;
      if (!run || !live(run) || snapshot.status !== 'running') throw Error('VM_NOT_RUNNING');
      if (run.environment.type !== 'personal') throw Error('PERSISTENCE_PERSONAL_ONLY');
      if (!checkpoints || typeof run.session.checkpoint !== 'function') throw Error('CHECKPOINT_STORAGE_UNAVAILABLE');
      if (run.files.size) throw Error('VM_BUSY');
      const request = deferred();run.files.add(request);clearTimeout(run.autoTimer);
      publish({status:'saving',reason:''});
      Promise.resolve().then(async () => {
        if (!live(run)) throw Error('VM_NOT_RUNNING');
        const checkpoint = await run.session.checkpoint();
        if (!live(run)) throw Error('VM_NOT_RUNNING');
        const receipt = await checkpoints.save(run.environment, checkpoint, {expectedRevision:run.revision,signal:run.operation.signal});
        if (!live(run)) throw Error('VM_NOT_RUNNING');
        run.revision=receipt.revision;publish({savedAt:receipt.savedAt});return receipt;
      }).then(receipt=>request.resolve(receipt),error=>{
        const reason = !live(run) ? 'VM_NOT_RUNNING' : ['CHECKPOINT_CONFLICT','CHECKPOINT_QUOTA'].includes(error?.message) ? error.message : 'CHECKPOINT_SAVE_FAILED';
        if(live(run)) publish({reason});request.reject(Error(reason));
      });
      try {return await request.promise;}
      finally {run.files.delete(request);if(live(run)){publish({status:'running'});scheduleSave(run);}}
    },
    async saveAndStop() {
      const run=current;
      const receipt=await runtime.save();
      if(current!==run || !live(run)) throw Error('VM_NOT_RUNNING');
      await runtime.stop();return receipt;
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
  };
  return Object.freeze(runtime);
}
