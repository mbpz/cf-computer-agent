// One disposable Worker owns one session. Monotonic request IDs reject replay;
// output is pull-based so a suspended page cannot accumulate Worker messages.
export function attachTerminalWorker(port, prepareSession) {
  let state = 'idle';
  let sequence = 0;
  let session;
  function fail(error) {
    if (state === 'closed') return;
    state = 'closed';
    port.removeEventListener('message', receive);
    port.postMessage({ type: 'failure', message: (error instanceof Error ? error.message : 'Terminal failed').slice(0, 512) });
    Promise.resolve().then(() => session?.close()).catch(() => {}).finally(() => port.close());
  }
  async function start(id) {
    try {
      session = await prepareSession();
      // A canceled asset load can still produce a booting session. Closing it
      // rejects readiness; always observe that promise, including this branch.
      session.ready.catch(() => {});
      if (state === 'closed') { await session.close(); return; }
      await session.ready;
      if (state === 'closed') return;
      state = 'ready';
      port.postMessage({ type: 'ready', id });
    } catch (error) { fail(error); }
  }
  function receive({ data }) {
    try {
      if (!Number.isSafeInteger(data?.id) || data.id <= sequence) throw new Error('Invalid or repeated terminal request');
      sequence = data.id;
      if (data.type === 'start' && state === 'idle') {
        state = 'booting';
        void start(data.id);
      } else if (data.type === 'input' && state === 'ready') {
        session.write(data.text);
        port.postMessage({ type: 'accepted', id: data.id });
      } else if (data.type === 'poll' && state === 'ready') {
        const { bytes, droppedBytes } = session.drain();
        port.postMessage({ type: 'output', id: data.id, bytes, droppedBytes }, [bytes.buffer]);
      } else throw new Error('Invalid terminal state or request');
    } catch (error) { fail(error); }
  }
  port.addEventListener('message', receive);
}
