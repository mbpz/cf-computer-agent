// Local-only terminal transport. Input acknowledgements mean bytes accepted,
// never command success. Lost acknowledgements fail closed without replay.
export function connectTerminal({
  createWorker = () => new Worker(new URL('./terminal-worker.mjs', import.meta.url), { type: 'module' }),
  onOutput, onClosed, pollMs = 50, requestTimeoutMs = 3000, bootTimeoutMs = 60_000,
} = {}) {
  for (const value of [pollMs, requestTimeoutMs, bootTimeoutMs]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Positive terminal deadlines required');
  }
  let worker;
  let state = 'booting';
  let sequence = 0;
  let pollTimer;
  let decoder = new TextDecoder();
  const requests = new Map();
  function close(error = new Error('Terminal closed')) {
    if (state === 'closed') return;
    state = 'closed';
    clearTimeout(pollTimer);
    if (worker) {
      worker.removeEventListener('message', receive);
      worker.removeEventListener('error', failed);
      worker.removeEventListener('messageerror', failed);
      worker.terminate();
    }
    for (const request of requests.values()) { clearTimeout(request.timer); request.reject(error); }
    requests.clear();
    try { onClosed?.(error); } catch { /* Cleanup cannot depend on UI observers. */ }
  }
  const failed = () => close(new Error('Terminal Worker failed'));
  function request(type, fields, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (state === 'closed') { reject(new Error('Terminal closed')); return; }
      const id = ++sequence;
      const timer = setTimeout(() => close(new Error(`Terminal ${type} timed out; command execution is unknown`)), timeoutMs);
      requests.set(id, { type, resolve, reject, timer });
      try { worker.postMessage({ type, id, ...fields }); }
      catch (error) { close(error); }
    });
  }
  function receive({ data }) {
    if (data?.type === 'failure') { close(new Error(typeof data.message === 'string' ? data.message.slice(0, 512) : 'Terminal failed')); return; }
    const pending = requests.get(data?.id);
    if (!pending || !({ start: 'ready', input: 'accepted', poll: 'output' }[pending.type] === data.type)) {
      close(new Error('Invalid terminal Worker receipt')); return;
    }
    if (data.type === 'output' && (!(data.bytes instanceof Uint8Array) || data.bytes.length > 65_536
      || !Number.isSafeInteger(data.droppedBytes) || data.droppedBytes < 0)) {
      close(new Error('Invalid terminal output')); return;
    }
    clearTimeout(pending.timer);
    requests.delete(data.id);
    if (data.type === 'output') {
      try {
        if (data.droppedBytes) {
          decoder = new TextDecoder();
          onOutput?.(`\n[输出过快，已丢弃 ${data.droppedBytes} 字节 / output truncated]\n`);
        }
        const text = decoder.decode(data.bytes, { stream: true });
        if (text) onOutput?.(text);
      } catch (error) { pending.reject(error); close(error); return; }
    }
    pending.resolve();
  }
  async function poll() {
    try {
      await request('poll', {}, requestTimeoutMs);
      if (state === 'ready') pollTimer = setTimeout(poll, pollMs);
    } catch { /* Request failure already closed the Worker. */ }
  }
  let ready;
  try {
    worker = createWorker();
    worker.addEventListener('message', receive);
    worker.addEventListener('error', failed);
    worker.addEventListener('messageerror', failed);
    ready = request('start', {}, bootTimeoutMs).then(() => {
      if (state === 'closed') throw new Error('Terminal closed');
      state = 'ready';
      void poll();
    });
  } catch (error) { close(error); ready = Promise.reject(error); }
  return {
    ready,
    get state() { return state; },
    async write(text) {
      if (state !== 'ready') throw new Error(state === 'closed' ? 'Terminal closed' : 'Terminal not ready');
      if (typeof text !== 'string' || !text.length || text.length > 4096 || text.includes('\0')
        || new TextEncoder().encode(text).length > 4096) throw new Error('Invalid terminal input (4096 byte maximum)');
      if ([...requests.values()].some(item => item.type === 'input')) throw new Error('Terminal input pending');
      await request('input', { text }, requestTimeoutMs);
    },
    close,
  };
}
