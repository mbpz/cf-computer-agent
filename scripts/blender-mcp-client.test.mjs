import assert from 'node:assert/strict';
import { EventEmitter, getEventListeners } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import nodeTest from 'node:test';
import * as client from './blender-mcp-client.mjs';

const test = (name, fn) => nodeTest(name, { timeout: 5000 }, fn);

// Independent wire peer: never imports production framing or parsing helpers.
function fakeMcpProcess(options = {}) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  const fake = { child, methods: [], requests: [], kills: [], closed: false };
  fake.close = () => {
    if (fake.closed) return;
    fake.closed = true;
    child.exitCode = 0;
    child.emit('exit', 0, null);
    child.emit('close', 0, null);
  };
  child.kill = (signal) => {
    fake.kills.push(signal);
    if (!options.ignoreTerm || signal === 'SIGKILL') fake.close();
    return true;
  };
  fake.send = (message) => {
    const bytes = Buffer.from(`${JSON.stringify(message)}\n`);
    // Includes splits inside UTF-8 sequences and multiple chunks per JSON line.
    for (let i = 0; i < bytes.length; i += 7) child.stdout.write(bytes.subarray(i, i + 7));
  };
  let incoming = '';
  child.stdin.on('data', (chunk) => {
    incoming += chunk.toString();
    while (incoming.includes('\n')) {
      const end = incoming.indexOf('\n');
      const request = JSON.parse(incoming.slice(0, end));
      incoming = incoming.slice(end + 1);
      fake.methods.push(request.method);
      fake.requests.push(request);
      queueMicrotask(() => {
        if (options.onRequest?.(request, fake) === false) return;
        if (request.id === undefined) return;
        let result;
        if (request.method === 'initialize') {
          result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'Blender', version: 'fixture-1' } };
        } else if (request.method === 'tools/list') {
          result = { tools: (options.tools ?? ['get_scene_info']).map((tool) => typeof tool === 'string'
            ? { name: tool, inputSchema: { type: 'object', properties: { user_prompt: { type: 'string', default: '' } } } }
            : tool) };
        } else if (request.method === 'tools/call') {
          result = options.result ?? { isError: false, content: [{ type: 'text', text: '确认 scene' }] };
        }
        child.stdout.write('local log, not JSON\n');
        fake.send({ jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info', data: 'log' } });
        fake.send({ jsonrpc: '2.0', id: 9999, result: { ignored: true } });
        fake.send({ jsonrpc: '2.0', id: request.id, result });
      });
    }
  });
  fake.spawn = (command, args, spawnOptions) => {
    Object.assign(fake, { command, args, spawnOptions });
    return child;
  };
  return fake;
}

test('chunked JSON-RPC handshake discovers and calls a tool with per-process telemetry disabled', async () => {
  const fake = fakeMcpProcess();
  const originalTelemetry = process.env.BLENDER_MCP_DISABLE_TELEMETRY;
  const result = await client.callBlenderTool({ name: 'get_scene_info', arguments: { user_prompt: '确认' }, timeoutMs: 1000 }, { spawn: fake.spawn });
  assert.deepEqual(result, { isError: false, content: [{ type: 'text', text: '确认 scene' }], mcp: { protocolVersion: '2024-11-05', serverInfo: { name: 'Blender', version: 'fixture-1' } } });
  assert.deepEqual(fake.methods, ['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
  assert.deepEqual(fake.requests.at(-1).params, { name: 'get_scene_info', arguments: { user_prompt: '确认' } });
  assert.deepEqual(fake.requests.filter((r) => r.id !== undefined).map((r) => r.id), [1, 2, 3]);
  assert.equal(fake.command, '/opt/homebrew/bin/uvx');
  assert.deepEqual(fake.args, ['--offline', 'blender-mcp']);
  assert.equal(fake.spawnOptions.env.BLENDER_MCP_DISABLE_TELEMETRY, '1');
  assert.equal(process.env.BLENDER_MCP_DISABLE_TELEMETRY, originalTelemetry);
  assert.equal(fake.spawnOptions.shell, false);
  assert.equal(fake.closed, true);
  assert.equal(fake.child.stdin.writableEnded, true);
  assert.deepEqual(fake.kills, ['SIGTERM']);
});

test('initialize RPC error rejects without discovery or call and closes the child', async () => {
  const fake = fakeMcpProcess({ onRequest(request, peer) {
    if (request.method === 'initialize') {
      peer.send({ jsonrpc: '2.0', id: request.id, error: { code: -32603, message: 'init refused' } });
      return false;
    }
  } });
  await assert.rejects(client.callBlenderTool({ name: 'get_scene_info' }, { spawn: fake.spawn }), /init refused/);
  assert.deepEqual(fake.methods, ['initialize']);
  assert.equal(fake.closed, true);
});

test('missing tool rejects before tools/call', async () => {
  const fake = fakeMcpProcess({ tools: ['some_other_tool'] });
  await assert.rejects(client.callBlenderTool({ name: 'get_scene_info' }, { spawn: fake.spawn }), /Tool not found: get_scene_info/);
  assert.equal(fake.methods.includes('tools/call'), false);
  assert.equal(fake.closed, true);
});

test('early process exit rejects with bounded stderr diagnostics', async () => {
  const fake = fakeMcpProcess({ onRequest(request, peer) {
    if (request.method === 'initialize') {
      peer.child.stderr.write('x'.repeat(80_000) + 'connection unavailable');
      peer.close();
      return false;
    }
  } });
  await assert.rejects(client.callBlenderTool({ name: 'get_scene_info' }, { spawn: fake.spawn }), (error) => {
    assert.match(error.message, /exited.*connection unavailable/s);
    assert.ok(Buffer.byteLength(error.message) < 17_000);
    return true;
  });
  assert.deepEqual(fake.kills, []);
});

test('a silent server times out and cleans up', async () => {
  const fake = fakeMcpProcess({ onRequest: () => false });
  await assert.rejects(client.callBlenderTool({ name: 'get_scene_info', timeoutMs: 20 }, { spawn: fake.spawn }), /timed out/);
  assert.equal(fake.closed, true);
  assert.deepEqual(fake.kills, ['SIGTERM']);
});

test('abort removes its listener and ignores all later protocol callbacks', async () => {
  const controller = new AbortController();
  const fake = fakeMcpProcess({ onRequest(request) {
    if (request.method === 'initialize') controller.abort();
    return false;
  } });
  let settlements = 0;
  const promise = client.callBlenderTool({ name: 'get_scene_info', signal: controller.signal }, { spawn: fake.spawn });
  promise.then(() => { settlements++; }, () => { settlements++; });
  await assert.rejects(promise, { name: 'AbortError' });
  fake.send({ jsonrpc: '2.0', id: 1, result: { capabilities: { tools: {} } } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settlements, 1);
  assert.deepEqual(fake.methods, ['initialize']);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  assert.equal(fake.child.stdout.listenerCount('data'), 0);
  assert.deepEqual(fake.kills, ['SIGTERM']);
});

test('an already aborted call never starts a child', async () => {
  const fake = fakeMcpProcess();
  await assert.rejects(client.callBlenderTool({ name: 'get_scene_info', signal: AbortSignal.abort() }, { spawn: fake.spawn }), { name: 'AbortError' });
  assert.equal(fake.command, undefined);
});

test('spawn and stdin errors reject instead of escaping as unhandled events', async () => {
  for (const emitter of ['child', 'stdin']) {
    const fake = fakeMcpProcess({ onRequest(request, peer) {
      if (request.method === 'initialize') {
        (emitter === 'child' ? peer.child : peer.child.stdin).emit('error', new Error(`broken ${emitter}`));
        return false;
      }
    } });
    await assert.rejects(client.callBlenderTool({ name: 'get_scene_info' }, { spawn: fake.spawn }), new RegExp(`broken ${emitter}`));
    assert.equal(fake.closed, true);
  }
});

test('SIGTERM-resistant child receives SIGKILL only after the two-second grace period', async () => {
  const fake = fakeMcpProcess({ ignoreTerm: true });
  const started = performance.now();
  await client.callBlenderTool({ name: 'get_scene_info' }, { spawn: fake.spawn });
  assert.ok(performance.now() - started >= 1900);
  assert.ok(performance.now() - started < 4000);
  assert.deepEqual(fake.kills, ['SIGTERM', 'SIGKILL']);
  assert.equal(fake.closed, true);
  assert.equal(fake.child.listenerCount('close'), 0);
});

test('JSON line limit rejects more than 8 MiB, including a newline in the same chunk', async () => {
  for (const suffix of ['', '\n']) {
    const fake = fakeMcpProcess({ onRequest(request, peer) {
      if (request.method === 'initialize') {
        peer.child.stdout.write('x'.repeat(8 * 1024 * 1024 + 1) + suffix);
        return false;
      }
    } });
    await assert.rejects(client.callBlenderTool({ name: 'get_scene_info', timeoutMs: 100 }, { spawn: fake.spawn }), /8 MiB/);
    assert.equal(fake.closed, true);
  }
});

test('isError true is a failure even when JSON-RPC succeeds', async () => {
  const fake = fakeMcpProcess({ result: { isError: true, content: [{ type: 'text', text: 'Blender refused' }] } });
  await assert.rejects(client.callBlenderTool({ name: 'get_scene_info' }, { spawn: fake.spawn }), /Blender refused/);
  assert.equal(fake.closed, true);
});

test('error bodies and safe-mode rejection fail even without isError', async () => {
  for (const text of ['Error executing code: bad script', 'Error getting scene info: socket closed', '{"error":"no scene"}', 'Traceback (most recent call last):\nValueError: broken', 'Rejected by safe mode - forbidden']) {
    const fake = fakeMcpProcess({ result: { content: [{ type: 'text', text }] } });
    await assert.rejects(client.callBlenderTool({ name: 'get_scene_info' }, { spawn: fake.spawn }), /Blender tool failed/);
  }
});

test('discovered schema supplies defaults and rejects missing, wrong-type and unknown arguments', async () => {
  const tool = { name: 'get_viewport_screenshot', inputSchema: { type: 'object', properties: { max_size: { type: 'integer', default: 1000 }, user_prompt: { type: 'string' } }, required: ['user_prompt'] } };
  const fake = fakeMcpProcess({ tools: [tool] });
  await client.callBlenderTool({ name: tool.name, arguments: { user_prompt: 'screenshot' } }, { spawn: fake.spawn });
  assert.deepEqual(fake.requests.at(-1).params.arguments, { max_size: 1000, user_prompt: 'screenshot' });
  for (const args of [{}, { user_prompt: 3 }, { user_prompt: 'screenshot', max_size: 1.5 }, { user_prompt: 'screenshot', filepath: '/tmp/wrong.png' }]) {
    const invalid = fakeMcpProcess({ tools: [tool] });
    await assert.rejects(client.callBlenderTool({ name: tool.name, arguments: args }, { spawn: invalid.spawn }), /schema|argument/i);
    assert.equal(invalid.methods.includes('tools/call'), false);
  }
});

test('tool discovery follows pagination before declaring a tool missing', async () => {
  const fake = fakeMcpProcess({ onRequest(request, peer) {
    if (request.method === 'tools/list' && !request.params.cursor) {
      peer.send({ jsonrpc: '2.0', id: request.id, result: { tools: [], nextCursor: 'page2' } });
      return false;
    }
  } });
  await client.callBlenderTool({ name: 'get_scene_info' }, { spawn: fake.spawn });
  assert.deepEqual(fake.requests.filter((r) => r.method === 'tools/list').map((r) => r.params), [{}, { cursor: 'page2' }]);
});

test('invalid timeout values are rejected before spawning, not silently clamped by Node', async () => {
  for (const timeoutMs of [0, -1, 1.5, Infinity, NaN, 2147483648, '100']) {
    const fake = fakeMcpProcess();
    await assert.rejects(client.callBlenderTool({ name: 'get_scene_info', timeoutMs }, { spawn: fake.spawn }), /timeoutMs/);
    assert.equal(fake.command, undefined);
  }
});

const repoRoot = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const cliPath = path.join(repoRoot, 'scripts/blender-mcp-client.mjs');
function captureOutput() {
  let text = '';
  return { write(chunk) { text += chunk; }, get text() { return text; } };
}

test('scene CLI prints text and negotiated MCP version without image base64', async () => {
  const fake = fakeMcpProcess({ result: { content: [{ type: 'text', text: '{"name":"Scene","objects":[{"name":"Cube"}]}' }, { type: 'image', mimeType: 'image/png', data: 'DO_NOT_PRINT_BASE64' }] } });
  const stdout = captureOutput();
  await client.runCli(['scene'], { spawn: fake.spawn, stdout });
  assert.match(stdout.text, /Scene/);
  assert.match(stdout.text, /Cube/);
  assert.match(stdout.text, /2024-11-05/);
  assert.match(stdout.text, /fixture-1/);
  assert.equal(stdout.text.includes('DO_NOT_PRINT_BASE64'), false);
  assert.equal(fake.requests.at(-1).params.name, 'get_scene_info');
});

test('CLI rejects unsupported commands, inline code, relative screenshot outputs and invalid execute timeouts', async () => {
  for (const argv of [[], ['bash', '-c', 'true'], ['scene', '--command', 'sh'], ['screenshot', '--output', 'relative.png'], ['execute', '--code', 'print(1)'], ['execute', '--file', 'scripts/blender/a.py'], ['execute', '--file', 'scripts/blender/a.py', '--timeout-ms', '1.5'], ['execute', '--file', 'scripts/blender/a.py', '--timeout-ms', '1e3'], ['scene', 'extra']]) {
    const fake = fakeMcpProcess();
    await assert.rejects(client.runCli(argv, { spawn: fake.spawn, stdout: captureOutput() }), /Usage|absolute|timeout/i);
    assert.equal(fake.command, undefined);
  }
});

function scriptFs({ resolved = `${repoRoot}/scripts/blender/build.py`, source = 'from __future__ import annotations\nfrom pathlib import Path\nprint(Path(__file__).resolve().parents[2])\n' } = {}) {
  const reads = [];
  return {
    reads,
    async realpath(filename) { return filename === repoRoot ? repoRoot : resolved; },
    async stat() { return { isFile: () => true, size: Buffer.byteLength(source) }; },
    async readFile(filename) { reads.push(filename); return source; },
  };
}

test('execute reads the resolved in-repo script and provides a working __file__ namespace', async () => {
  const fake = fakeMcpProcess({ tools: [{ name: 'execute_blender_code', inputSchema: { type: 'object', properties: { code: { type: 'string' }, user_prompt: { type: 'string', default: '' } }, required: ['code'] } }] });
  const fs = scriptFs();
  await client.runCli(['execute', '--file', 'scripts/blender/build.py', '--timeout-ms', '1000'], { spawn: fake.spawn, fs, stdout: captureOutput() });
  assert.deepEqual(fs.reads, [`${repoRoot}/scripts/blender/build.py`]);
  const request = fake.requests.at(-1);
  assert.equal(request.params.name, 'execute_blender_code');
  // Runs the submitted Python locally, not in Blender. This fixture is read-only.
  const output = execFileSync('/usr/bin/python3', ['-c', request.params.arguments.code], { encoding: 'utf8', timeout: 2000 });
  assert.equal(output.trim(), repoRoot);
});

test('execute rejects traversal, sibling-prefix and symlink escapes before reading source or spawning', async () => {
  for (const [file, resolved] of [
    ['scripts/blender/../../package.json', `${repoRoot}/package.json`],
    ['scripts/blender-evil/a.py', `${repoRoot}/scripts/blender-evil/a.py`],
    ['/tmp/a.py', '/tmp/a.py'],
    ['scripts/blender/link.py', '/tmp/outside.py'],
    ['scripts/blender/linked-dir/a.py', `${repoRoot}/scripts/blender-evil/a.py`],
    ['scripts/blender', `${repoRoot}/scripts/blender`],
  ]) {
    const fake = fakeMcpProcess();
    const fs = scriptFs({ resolved });
    await assert.rejects(client.runCli(['execute', '--file', file, '--timeout-ms', '1000'], { spawn: fake.spawn, fs, stdout: captureOutput() }), /scripts\/blender/);
    assert.deepEqual(fs.reads, []);
    assert.equal(fake.command, undefined);
  }
});

test('screenshot decodes actual image content locally using discovered defaults, without logging base64', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=';
  const fake = fakeMcpProcess({ tools: [{ name: 'get_viewport_screenshot', inputSchema: { type: 'object', properties: { max_size: { type: 'integer', default: 1000 }, user_prompt: { type: 'string', default: '' } } } }], result: { content: [{ type: 'image', mimeType: 'image/png', data: png }] } });
  const writes = [];
  const directories = [];
  const fs = { async mkdir(...args) { directories.push(args); }, async writeFile(...args) { writes.push(args); } };
  const stdout = captureOutput();
  await client.runCli(['screenshot', '--output', '/tmp/bridge-shot/nested/scene.png'], { spawn: fake.spawn, fs, stdout });
  assert.deepEqual(directories, [['/tmp/bridge-shot/nested', { recursive: true }]]);
  assert.equal(writes[0][0], '/tmp/bridge-shot/nested/scene.png');
  assert.deepEqual(writes[0][1], Buffer.from(png, 'base64'));
  assert.deepEqual(writes[0][2], { flag: 'wx' });
  assert.equal(fake.requests.at(-1).params.arguments.max_size, 1000);
  assert.equal(Object.hasOwn(fake.requests.at(-1).params.arguments, 'filepath'), false);
  assert.equal(stdout.text.includes(png), false);
  assert.match(stdout.text, /scene.png/);
});

test('screenshot rejects missing or corrupt images without creating files', async () => {
  for (const content of [[], [{ type: 'text', text: 'no image' }], [{ type: 'image', mimeType: 'image/png', data: '%%%' }]]) {
    const fake = fakeMcpProcess({ tools: ['get_viewport_screenshot'], result: { content } });
    let writes = 0;
    const fs = { async mkdir() { writes++; }, async writeFile() { writes++; } };
    await assert.rejects(client.runCli(['screenshot', '--output', '/tmp/bridge-shot.png'], { spawn: fake.spawn, fs, stdout: captureOutput() }), /image|base64/i);
    assert.equal(writes, 0);
  }
});

test('screenshot cancellation during directory creation prevents file writes and success output', async () => {
  const controller = new AbortController();
  const fake = fakeMcpProcess({ tools: ['get_viewport_screenshot'], result: { content: [{ type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' }] } });
  const operations = [];
  const fs = {
    async mkdir() { operations.push('mkdir'); controller.abort(); },
    async writeFile() { operations.push('writeFile'); },
  };
  const stdout = captureOutput();
  await assert.rejects(client.runCli(['screenshot', '--output', '/tmp/bridge-aborted.png'], {
    spawn: fake.spawn, fs, stdout, signal: controller.signal,
  }), { name: 'AbortError' });
  assert.deepEqual(operations, ['mkdir']);
  assert.equal(stdout.text, '');
  assert.deepEqual(fake.kills, ['SIGTERM']);
});

test('screenshot cancellation during file output suppresses subsequent success output', async () => {
  const controller = new AbortController();
  const fake = fakeMcpProcess({ tools: ['get_viewport_screenshot'], result: { content: [{ type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' }] } });
  const operations = [];
  const fs = {
    async mkdir() { operations.push('mkdir'); },
    async writeFile() { operations.push('writeFile'); controller.abort(); },
  };
  const stdout = captureOutput();
  await assert.rejects(client.runCli(['screenshot', '--output', '/tmp/bridge-aborted.png'], {
    spawn: fake.spawn, fs, stdout, signal: controller.signal,
  }), { name: 'AbortError' });
  assert.deepEqual(operations, ['mkdir', 'writeFile']);
  assert.equal(stdout.text, '');
});

test('screenshot cancellation between tool settlement and CLI continuation starts no output work', async () => {
  const controller = new AbortController();
  const fake = fakeMcpProcess({ tools: ['get_viewport_screenshot'], result: { content: [{ type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' }] } });
  const kill = fake.child.kill;
  fake.child.kill = (signal) => {
    const killed = kill(signal);
    // Let the tool's post-cleanup continuation settle, then abort before
    // runCli's awaiting continuation can start any filesystem operation.
    queueMicrotask(() => queueMicrotask(() => controller.abort()));
    return killed;
  };
  const operations = [];
  const fs = {
    async mkdir() { operations.push('mkdir'); },
    async writeFile() { operations.push('writeFile'); },
  };
  const stdout = captureOutput();
  await assert.rejects(client.runCli(['screenshot', '--output', '/tmp/bridge-aborted.png'], {
    spawn: fake.spawn, fs, stdout, signal: controller.signal,
  }), { name: 'AbortError' });
  assert.deepEqual(operations, []);
  assert.equal(stdout.text, '');
  assert.deepEqual(fake.kills, ['SIGTERM']);
});

test('actual CLI entrypoint rejects arbitrary child commands with nonzero exit status', () => {
  const result = spawnSync(process.execPath, [cliPath, 'bash', '-c', 'true'], { encoding: 'utf8', timeout: 2000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage/);
});

test('abort between initialize response and continuation sends no initialized notification', async () => {
  const controller = new AbortController();
  const fake = fakeMcpProcess({ onRequest(request, peer) {
    if (request.method !== 'initialize') return;
    peer.send({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'Blender', version: '1' } } });
    controller.abort();
    return false;
  } });
  await assert.rejects(client.callBlenderTool({ name: 'get_scene_info', signal: controller.signal }, { spawn: fake.spawn }), { name: 'AbortError' });
  assert.deepEqual(fake.methods, ['initialize']);
});

test('abort after the final response rejects before public settlement and cleans up once', async () => {
  const controller = new AbortController();
  const fake = fakeMcpProcess({ onRequest(request, peer) {
    if (request.method !== 'tools/call') return;
    peer.send({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: 'ok' }] } });
    controller.abort();
    return false;
  } });
  let settlements = 0;
  const promise = client.callBlenderTool({ name: 'get_scene_info', signal: controller.signal }, { spawn: fake.spawn });
  promise.then(() => { settlements++; }, () => { settlements++; });
  await assert.rejects(promise, { name: 'AbortError' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settlements, 1);
  assert.deepEqual(fake.kills, ['SIGTERM']);
  assert.equal(fake.closed, true);
  assert.equal(fake.child.stdin.writableEnded, true);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  assert.equal(fake.child.listenerCount('close'), 0);
  for (const stream of [fake.child.stdin, fake.child.stdout, fake.child.stderr]) {
    assert.equal(stream.destroyed, true);
    assert.equal(stream.listenerCount('error'), 0);
  }
  assert.equal(fake.child.stdout.listenerCount('data'), 0);
});

test('abort during asynchronous cleanup rejects after closure and leaves no cleanup timer', async () => {
  const controller = new AbortController();
  const fake = fakeMcpProcess({ ignoreTerm: true });
  let notifyCleanup;
  const cleanupStarted = new Promise((resolve) => { notifyCleanup = resolve; });
  const kill = fake.child.kill;
  fake.child.kill = (signal) => { const killed = kill(signal); notifyCleanup(); return killed; };
  let settlements = 0;
  const promise = client.callBlenderTool({ name: 'get_scene_info', timeoutMs: 50, signal: controller.signal }, { spawn: fake.spawn });
  promise.then(() => { settlements++; }, () => { settlements++; });
  await cleanupStarted;
  assert.equal(settlements, 0);
  assert.equal(fake.closed, false);
  controller.abort();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settlements, 0);
  fake.close();
  await assert.rejects(promise, { name: 'AbortError' });
  assert.equal(settlements, 1);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  assert.equal(fake.child.listenerCount('close'), 0);
  assert.equal(fake.child.stdout.destroyed, true);
  // Outlive both the 50 ms request deadline and the 2 s cleanup fallback.
  await new Promise((resolve) => setTimeout(resolve, 2100));
  assert.equal(settlements, 1);
  assert.deepEqual(fake.kills, ['SIGTERM']);
});

test('screenshot abort after its final response or during cleanup starts no writes or success output', async () => {
  for (const phase of ['final-response', 'cleanup-wait']) {
    const controller = new AbortController();
    const fake = fakeMcpProcess({ tools: ['get_viewport_screenshot'], onRequest(request, peer) {
      if (request.method !== 'tools/call') return;
      peer.send({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' }] } });
      if (phase === 'final-response') controller.abort();
      return false;
    } });
    if (phase === 'cleanup-wait') {
      fake.child.kill = (signal) => {
        fake.kills.push(signal);
        setImmediate(() => { controller.abort(); fake.close(); });
        return true;
      };
    }
    const operations = [];
    const fs = {
      async mkdir() { operations.push('mkdir'); },
      async writeFile() { operations.push('writeFile'); },
    };
    const stdout = captureOutput();
    await assert.rejects(client.runCli(['screenshot', '--output', '/tmp/bridge-aborted.png'], {
      spawn: fake.spawn, fs, stdout, signal: controller.signal,
    }), { name: 'AbortError' });
    assert.deepEqual(operations, [], phase);
    assert.equal(stdout.text, '', phase);
    assert.deepEqual(fake.kills, ['SIGTERM']);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    assert.equal(fake.child.listenerCount('close'), 0);
    assert.equal(fake.child.stdout.listenerCount('data'), 0);
  }
});

test('repeated discovery cursors fail instead of looping indefinitely', async () => {
  let pages = 0;
  const fake = fakeMcpProcess({ onRequest(request, peer) {
    if (request.method === 'tools/list' && ++pages <= 2) {
      peer.send({ jsonrpc: '2.0', id: request.id, result: { tools: [], nextCursor: 'loop' } });
      return false;
    }
  } });
  await assert.rejects(client.callBlenderTool({ name: 'get_scene_info' }, { spawn: fake.spawn }), /pagination|cursor/i);
  assert.equal(pages, 2);
  assert.equal(fake.methods.includes('tools/call'), false);
});

test('an unsupported negotiated protocol stops before tool discovery', async () => {
  const fake = fakeMcpProcess({ onRequest(request, peer) {
    if (request.method === 'initialize') {
      peer.send({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: 'future-unsupported', capabilities: { tools: {} } } });
      return false;
    }
  } });
  await assert.rejects(client.callBlenderTool({ name: 'get_scene_info' }, { spawn: fake.spawn }), /protocol/i);
  assert.deepEqual(fake.methods, ['initialize']);
});

test('exactly 8 MiB lines and coalesced smaller lines remain valid transport input', async () => {
  const fake = fakeMcpProcess({ onRequest(request, peer) {
    if (request.method === 'initialize') {
      peer.child.stdout.write('x'.repeat(8 * 1024 * 1024) + '\n');
      peer.child.stdout.write(('y'.repeat(1024 * 1024) + '\n').repeat(9));
    }
  } });
  const result = await client.callBlenderTool({ name: 'get_scene_info' }, { spawn: fake.spawn });
  assert.equal(result.isError, false);
  assert.equal(fake.closed, true);
});

test('actual execute CLI rejects an outside script from a different cwd before launching MCP', () => {
  const result = spawnSync(process.execPath, [cliPath, 'execute', '--file', cliPath, '--timeout-ms', '1000'], { cwd: '/tmp', encoding: 'utf8', timeout: 2000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /inside scripts\/blender/);
  assert.equal(result.stdout, '');
});

test('execute timeout reaches the MCP lifecycle and bounds a silent execute call', async () => {
  const fake = fakeMcpProcess({ tools: [{ name: 'execute_blender_code', inputSchema: { type: 'object', properties: { code: { type: 'string' }, user_prompt: { type: 'string' } }, required: ['code'] } }], onRequest(request) {
    if (request.method === 'tools/call') return false;
  } });
  await assert.rejects(client.runCli(['execute', '--file', 'scripts/blender/build.py', '--timeout-ms', '20'], { spawn: fake.spawn, fs: scriptFs(), stdout: captureOutput() }), /timed out after 20 ms/);
  assert.deepEqual(fake.kills, ['SIGTERM']);
});

test('cleanup has a deadline even if the owned child emits no exit or close after SIGKILL', async () => {
  const fake = fakeMcpProcess();
  let unrefs = 0;
  fake.child.unref = () => { unrefs++; };
  fake.child.kill = (signal) => { fake.kills.push(signal); return false; };
  const started = performance.now();
  await client.callBlenderTool({ name: 'get_scene_info' }, { spawn: fake.spawn });
  assert.ok(performance.now() - started < 4000);
  assert.deepEqual(fake.kills, ['SIGTERM', 'SIGKILL']);
  assert.equal(unrefs, 1);
  assert.equal(fake.child.stdout.destroyed, true);
  assert.equal(fake.child.listenerCount('close'), 0);
});
