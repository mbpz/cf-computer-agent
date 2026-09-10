import { encodeProbeCommand, parseProbeReply } from './serial-protocol.mjs';

const encoder = new TextEncoder();

// Local G0 session, not the authenticated product runtime. The caller supplies
// the verified Alpine profile. No networking, persistence or automatic replay.
export function createTerminalSession({ createMachine, bootTimeoutMs = 30_000 }) {
  if (typeof createMachine !== 'function' || !Number.isSafeInteger(bootTimeoutMs) || bootTimeoutMs <= 0) {
    throw new Error('Engine factory and positive boot deadline required');
  }
  const machine = createMachine();
  let state = 'booting';
  let closing;
  const pending = new Set();
  const ring = new Uint8Array(65_536);
  let cursor = 0;
  let size = 0;
  let droppedBytes = 0;
  const output = byte => {
    if (state === 'closed') return;
    ring[cursor] = byte;
    cursor = (cursor + 1) % ring.length;
    if (size < ring.length) size++;
    else droppedBytes++;
  };
  machine.add_listener('serial0-output-byte', output);
  const deadline = performance.now() + bootTimeoutMs;

  function wait(event, select, act) {
    return new Promise((resolve, reject) => {
      if (state === 'closed') { reject(new Error('Terminal closed')); return; }
      let timer;
      let finished = false;
      const finish = (error, value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        machine.remove_listener(event, receive);
        pending.delete(cancel);
        if (error) reject(error);
        else resolve(value);
      };
      const cancel = () => finish(new Error('Terminal closed'));
      const receive = data => {
        try {
          const value = select(data);
          if (value !== null) finish(null, value);
        } catch (error) { finish(error); }
      };
      pending.add(cancel);
      machine.add_listener(event, receive);
      timer = setTimeout(() => finish(new Error('Terminal boot timed out')), Math.max(0, deadline - performance.now()));
      try { Promise.resolve(act?.()).catch(error => finish(error)); }
      catch (error) { finish(error); }
    });
  }
  function serial(select, act) {
    let text = '';
    return wait('serial0-output-byte', byte => {
      text += String.fromCharCode(byte);
      if (text.length > 65_536) throw new Error('Terminal boot output limit exceeded');
      return select(text);
    }, act);
  }
  function send(text) { machine.serial_send_bytes(0, encoder.encode(text)); }
  function close() {
    if (closing) return closing;
    state = 'closed';
    for (const cancel of [...pending]) cancel();
    machine.remove_listener('serial0-output-byte', output);
    ring.fill(0);
    size = 0;
    droppedBytes = 0;
    // The page also forcibly terminates the owning Worker. This bound keeps
    // cooperative cleanup from indefinitely blocking error/cancellation paths.
    closing = (async () => {
      let timer;
      try {
        await Promise.race([
          Promise.resolve().then(() => machine.destroy()),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Terminal shutdown timed out')), 1000); }),
        ]);
      } finally { clearTimeout(timer); }
    })();
    return closing;
  }
  const ready = (async () => {
    try {
      await wait('emulator-ready', () => true);
      await serial(text => text.includes('localhost login: ') ? true : null, () => machine.run());
      await serial(text => text.includes('localhost:~# ') ? true : null, () => send('root\n'));
      const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, '0')).join('');
      const result = await serial(text => parseProbeReply(text, id), () => send(encodeProbeCommand(
        'modprobe 9pnet_virtio && modprobe 9p && mkdir -p /mnt/work && mount -t 9p -o trans=virtio,version=9p2000.L host9p /mnt/work', id,
      )));
      if (result.exitCode !== 0) throw new Error('Terminal shared filesystem setup failed');
      if (state === 'closed') throw new Error('Terminal closed');
      state = 'ready';
    } catch (error) {
      await close().catch(() => {});
      throw error;
    }
  })();
  return {
    ready,
    get state() { return state; },
    write(text) {
      if (state !== 'ready') throw new Error(state === 'closed' ? 'Terminal closed' : 'Terminal not ready');
      if (typeof text !== 'string' || !text.length || text.length > 4096 || text.includes('\0')) throw new Error('Invalid terminal input');
      const bytes = encoder.encode(text);
      if (bytes.length > 4096) throw new Error('Terminal input exceeds 4096 bytes');
      machine.serial_send_bytes(0, bytes);
    },
    drain() {
      const bytes = new Uint8Array(size);
      const start = (cursor - size + ring.length) % ring.length;
      const first = Math.min(size, ring.length - start);
      bytes.set(ring.subarray(start, start + first));
      if (first < size) bytes.set(ring.subarray(0, size - first), first);
      const result = { bytes, droppedBytes };
      size = 0;
      droppedBytes = 0;
      return result;
    },
    close,
  };
}
