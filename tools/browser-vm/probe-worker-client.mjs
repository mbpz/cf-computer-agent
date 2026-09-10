// Development probe only. Each run owns a fresh Worker; no guest state crosses runs.
export function runWorkerProbe({
  createWorker = () => new Worker(new URL('./probe-worker.mjs', import.meta.url), { type: 'module' }),
  signal,
  alpine = false,
  image = 'buildroot',
  network = false,
  timeoutMs = 120_000,
  onProgress,
} = {}) {
  return new Promise((resolve, reject) => {
    if (!['buildroot', 'alpine-iso'].includes(image)) { reject(new Error('Unknown image profile')); return; }
    if (image === 'alpine-iso' && alpine === true) { reject(new Error('ISO and chroot options conflict')); return; }
    if (network === true && alpine !== true && image !== 'alpine-iso') { reject(new Error('Networking verification requires Alpine')); return; }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      reject(new Error('A positive Worker deadline is required'));
      return;
    }
    if (signal?.aborted) { reject(new DOMException('Probe canceled', 'AbortError')); return; }
    let worker;
    let timer;
    let finished = false;
    const finish = (error, evidence) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (worker) {
        worker.removeEventListener('message', receive);
        worker.removeEventListener('error', failed);
        worker.removeEventListener('messageerror', failed);
        worker.terminate();
      }
      if (error) reject(error);
      else resolve(evidence);
    };
    const abort = () => finish(new DOMException('Probe canceled', 'AbortError'));
    const failed = () => finish(new Error('Linux Worker failed to load or communicate'));
    const receive = ({ data }) => {
      if (data?.type === 'progress' && ['boot', 'packages', 'git', 'api'].includes(data.progress?.stage)
        && ['running', 'passed', 'failed'].includes(data.progress?.status)
        && Number.isSafeInteger(data.progress.elapsedMs) && data.progress.elapsedMs >= 0
        && (data.progress.instructions === null || (Number.isSafeInteger(data.progress.instructions) && data.progress.instructions >= 0))) {
        try { onProgress?.(data.progress); } catch (error) { finish(error); }
      } else if (data?.type === 'result' && data.evidence?.executionHost === 'browser-worker') {
        finish(null, data.evidence);
      } else {
        finish(new Error(data?.type === 'failure' && typeof data.message === 'string'
          ? data.message : 'Invalid Linux Worker result'));
      }
    };
    try {
      worker = createWorker();
      worker.addEventListener('message', receive);
      worker.addEventListener('error', failed);
      worker.addEventListener('messageerror', failed);
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => finish(new Error('Linux Worker timed out')), timeoutMs);
      worker.postMessage({ type: 'run-probe', ...(image === 'alpine-iso' ? { image } : {}), ...(alpine === true ? { alpine: true } : {}), ...(network === true ? { network: true } : {}) });
    } catch (error) { finish(error); }
  });
}
