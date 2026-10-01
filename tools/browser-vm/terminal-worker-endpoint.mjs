import { isCheckpointEnvelope } from './probe-checkpoint.mjs';
import { FILE_ERRORS, copyFileRequest } from './file-protocol.mjs';
// One disposable Worker owns one session. Monotonic request IDs reject replay;
// output is pull-based so a suspended page cannot accumulate Worker messages.
export function attachTerminalWorker(port, prepareSession) {
  let state = 'idle';
  let sequence = 0;
  let session;
  let filePending = false, checkpointPending = false;
  function fail(error) {
    if (state === 'closed') return;
    state = 'closed';
    port.removeEventListener('message', receive);
    port.postMessage({ type: 'failure', message: (error instanceof Error ? error.message : 'Terminal failed').slice(0, 512) });
    Promise.resolve().then(() => session?.close()).catch(() => {}).finally(() => port.close());
  }
  async function start(id, checkpoint) {
    try {
      if(checkpoint!==undefined&&!isCheckpointEnvelope(checkpoint))throw Error('Invalid checkpoint');
      session = await prepareSession(checkpoint);
      // A canceled asset load can still produce a booting session. Closing it
      // rejects readiness; always observe that promise, including this branch.
      session.ready.catch(() => {});
      if (state === 'closed') { await session.close(); return; }
      await session.ready;
      if (state === 'closed') return;
      state = 'ready';
      port.postMessage({ type: 'ready', id, ...(session.imageLoad === undefined ? {} : {imageLoad:session.imageLoad}) });
    } catch (error) { fail(error); }
  }
  async function file(id, input) {
    if (filePending || checkpointPending) { port.postMessage({type:'file-result',id,error:'FILES_BUSY'}); return; }
    filePending = true;
    try {
      const value = await session.file(copyFileRequest(input));
      if (state === 'ready') port.postMessage({type:'file-result',id,value}, value?.bytes instanceof Uint8Array ? [value.bytes.buffer] : []);
    } catch (error) {
      if (state === 'ready') port.postMessage({type:'file-result',id,error:FILE_ERRORS.has(error?.message) ? error.message : 'FILE_OPERATION_FAILED'});
    } finally { filePending = false; }
  }
  async function checkpoint(id) {
    if(filePending||checkpointPending){port.postMessage({type:'checkpoint-result',id,error:'FILES_BUSY'});return;}
    checkpointPending=true;
    try {
      const value=await session.checkpoint();if(!isCheckpointEnvelope(value))throw Error('Invalid checkpoint');
      if(state==='ready')port.postMessage({type:'checkpoint-result',id,value},[value.state]);
    } catch {
      if(session?.state==='closed'){fail(Error('CHECKPOINT_SESSION_FAILED'));return;}
      if(state==='ready')port.postMessage({type:'checkpoint-result',id,error:'CHECKPOINT_SAVE_FAILED'});
    } finally {checkpointPending=false;}
  }
  function receive({ data }) {
    try {
      if (!Number.isSafeInteger(data?.id) || data.id <= sequence) throw new Error('Invalid or repeated terminal request');
      sequence = data.id;
      if (data.type === 'start' && state === 'idle') {
        state = 'booting';
        void start(data.id, data.checkpoint);
      } else if (data.type === 'input' && state === 'ready') {
        if(checkpointPending)throw Error('Terminal checkpoint pending');
        session.write(data.text);
        port.postMessage({ type: 'accepted', id: data.id });
      } else if(data.type==='checkpoint' && state==='ready') {
        void checkpoint(data.id);
      } else if (data.type === 'file' && state === 'ready') {
        void file(data.id, data.input);
      } else if (data.type === 'poll' && state === 'ready') {
        const { bytes, droppedBytes } = session.drain();
        port.postMessage({ type: 'output', id: data.id, bytes, droppedBytes }, [bytes.buffer]);
      } else throw new Error('Invalid terminal state or request');
    } catch (error) { fail(error); }
  }
  port.addEventListener('message', receive);
}
