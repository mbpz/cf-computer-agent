import assert from 'node:assert/strict';
import test from 'node:test';
import { createTerminalSession } from '../tools/browser-vm/terminal-session.mjs';

// Only the external emulator boundary is replaced. Session state, deadlines,
// serial framing, byte encoding and output bounds are exercised unchanged.
class Engine {
  listeners = new Map();
  inputs = [];
  destroyed = 0;
  constructor({ boot = true } = {}) {
    this.boot = boot;
    queueMicrotask(() => this.emit('emulator-ready'));
  }
  add_listener(name, fn) { const set = this.listeners.get(name) ?? new Set(); set.add(fn); this.listeners.set(name, set); }
  remove_listener(name, fn) { this.listeners.get(name)?.delete(fn); }
  emit(name, value) { for (const fn of [...(this.listeners.get(name) ?? [])]) fn(value); }
  output(text) { for (const byte of new TextEncoder().encode(text)) this.emit('serial0-output-byte', byte); }
  run() { if (this.boot) queueMicrotask(() => this.output('localhost login: ')); }
  serial_send_bytes(port, bytes) {
    assert.equal(port, 0);
    const input = new TextDecoder().decode(bytes);
    this.inputs.push(input);
    if (input === 'root\n') queueMicrotask(() => this.output('localhost:~# '));
    const id = /BEGIN:([a-f0-9]{16})/.exec(input)?.[1];
    if (id) queueMicrotask(() => this.output(`\x1eBEGIN:${id}\x1f\x1eEND:${id}:0\x1flocalhost:~# `));
  }
  async destroy() { this.destroyed++; }
}

test('terminal refuses input before boot and after close; user bytes are sent once without a command wrapper', async () => {
  const engine = new Engine();
  const session = createTerminalSession({ createMachine: () => engine });
  assert.throws(() => session.write('uname\n'), /ready/i);
  await session.ready;
  engine.inputs.length = 0;
  session.write('printf "个人 Linux"\n');
  session.write('\x03');
  assert.deepEqual(engine.inputs, ['printf "个人 Linux"\n', '\x03']);
  await session.close();
  assert.throws(() => session.write('again\n'), /closed/i);
  await session.close();
  assert.equal(engine.destroyed, 1);
  assert.equal(engine.listeners.get('serial0-output-byte').size, 0);
});

test('oversized UTF-8 input is rejected before guest execution, never truncated into a different command', async () => {
  const engine = new Engine();
  const session = createTerminalSession({ createMachine: () => engine });
  await session.ready;
  const before = engine.inputs.length;
  for (const value of ['', null, '\0', '字'.repeat(1366)]) assert.throws(() => session.write(value));
  assert.equal(engine.inputs.length, before);
  session.write('x'.repeat(4096));
  assert.equal(engine.inputs.at(-1).length, 4096);
  await session.close();
});

test('slow consumers retain only the newest 64 KiB and receive an explicit dropped-byte count', async () => {
  const engine = new Engine();
  const session = createTerminalSession({ createMachine: () => engine });
  await session.ready;
  session.drain();
  engine.output('x'.repeat(70_000) + 'END');
  const output = session.drain();
  assert.equal(output.bytes.length, 65_536);
  assert.equal(output.droppedBytes, 4467);
  assert.equal(new TextDecoder().decode(output.bytes).slice(-3), 'END');
  assert.deepEqual(session.drain(), { bytes: new Uint8Array(), droppedBytes: 0 });
  await session.close();
});

test('close cancels a boot waiter and late serial bytes cannot resurrect the session', async () => {
  const engine = new Engine({ boot: false });
  const session = createTerminalSession({ createMachine: () => engine });
  const rejected = assert.rejects(session.ready, /closed/i);
  await session.close();
  await rejected;
  engine.output('localhost login: ');
  assert.equal(engine.inputs.length, 0);
  assert.equal(session.state, 'closed');
});

test('missing real login prompt times out, destroys the engine and never reports ready', async () => {
  const engine = new Engine({ boot: false });
  const session = createTerminalSession({ createMachine: () => engine, bootTimeoutMs: 15 });
  await assert.rejects(session.ready, /timed out/i);
  assert.equal(session.state, 'closed');
  assert.equal(engine.destroyed, 1);
});
