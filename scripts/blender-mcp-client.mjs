import { spawn as spawnProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fsPromises from 'node:fs/promises';

const abortError = () => Object.assign(new Error('Blender MCP call aborted'), { name: 'AbortError' });
function checkAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function schemaArguments(schema, supplied) {
  if (schema?.type !== 'object' || !schema.properties) throw new Error('Unsupported tool input schema');
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new Error('Tool arguments must be an object');
  const args = { ...supplied };
  for (const key of Object.keys(args)) {
    if (!Object.hasOwn(schema.properties, key)) throw new Error(`Unknown tool argument: ${key}`);
  }
  for (const [key, property] of Object.entries(schema.properties)) {
    if (!Object.hasOwn(args, key) && Object.hasOwn(property, 'default')) args[key] = property.default;
    if (!Object.hasOwn(args, key)) {
      if (schema.required?.includes(key)) throw new Error(`Missing required tool argument: ${key}`);
      continue;
    }
    const value = args[key];
    const valid = property.type === 'integer' ? Number.isSafeInteger(value)
      : property.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
        : property.type === 'string' || property.type === 'boolean' ? typeof value === property.type
          : false;
    if (!valid) throw new Error(`Tool argument ${key} does not match supported schema type ${property.type}`);
  }
  return args;
}

function checkToolResult(result) {
  const texts = (result?.content ?? []).filter((item) => item.type === 'text').map((item) => item.text ?? '');
  const errorBody = texts.some((text) => {
    if (/^\s*(?:Error\b|Traceback \(|Rejected by safe mode\b|[\w.]+(?:Error|Exception):)/m.test(text)) return true;
    try {
      const body = JSON.parse(text);
      return body && (Boolean(body.error) || body.status === 'error' || body.success === false);
    } catch { return false; }
  });
  if (result?.isError || errorBody) throw new Error(`Blender tool failed: ${texts.join('\n').slice(0, 4096) || 'isError=true'}`);
  return result;
}

/** One stdio MCP session, owned exclusively by this call. */
export async function callBlenderTool({ name, arguments: toolArgs = {}, timeoutMs = 30_000, signal }, { spawn = spawnProcess } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) throw new Error('timeoutMs must be an integer from 1 to 2147483647');
  checkAborted(signal);
  const child = spawn('/opt/homebrew/bin/uvx', ['--offline', 'blender-mcp'], {
    env: { ...process.env, BLENDER_MCP_DISABLE_TELEMETRY: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });
  const pending = new Map();
  const decoder = new StringDecoder('utf8');
  let nextId = 0;
  let buffer = '';
  let lineBytes = 0;
  let stderr = Buffer.alloc(0);
  let failure;
  let cleaning = false;
  let exited = false;
  let closed = false;
  let finishCleanup;
  let cleanupPromise;
  let killTimer;
  const fail = (error) => {
    if (cleaning || failure) return;
    failure = error;
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  };
  const onError = (error) => fail(error);
  const onStderr = (chunk) => { stderr = Buffer.from(Buffer.concat([stderr, Buffer.from(chunk).subarray(-16 * 1024)]).subarray(-16 * 1024)); };
  const onExit = (code, exitSignal) => {
    exited = true;
    fail(new Error(`Blender MCP exited (code ${code}, signal ${exitSignal})${stderr.length ? `: ${stderr.toString('utf8')}` : ''}`));
  };
  const onClose = (code, exitSignal) => {
    closed = true;
    onExit(code, exitSignal);
    finishCleanup?.();
  };
  const onAbort = () => fail(abortError());
  child.on('error', onError);
  child.on('exit', onExit);
  child.on('close', onClose);
  child.stdin.on('error', onError);
  child.stdout.on('error', onError);
  child.stderr.on('error', onError);
  child.stderr.on('data', onStderr);
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => fail(new Error(`Blender MCP timed out after ${timeoutMs} ms`)), timeoutMs);
  const onData = (chunk) => {
    if (cleaning || failure) return;
    let start = 0;
    while (start < chunk.length) {
      const end = chunk.indexOf(10, start);
      const part = chunk.subarray(start, end === -1 ? chunk.length : end);
      lineBytes += part.length;
      if (lineBytes > 8 * 1024 * 1024) { fail(new Error('MCP JSON line exceeds 8 MiB')); return; }
      buffer += decoder.write(part);
      if (end === -1) return;
      const line = buffer + decoder.end();
      buffer = '';
      lineBytes = 0;
      start = end + 1;
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message?.jsonrpc !== '2.0' || !pending.has(message.id)) continue;
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`MCP ${message.error.code}: ${message.error.message}`));
      else waiter.resolve(message.result);
    }
  };
  child.stdout.on('data', onData);
  const send = (message) => {
    if (failure) throw failure;
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  };
  const request = (method, params) => new Promise((resolve, reject) => {
    if (failure) { reject(failure); return; }
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    try { send({ id, method, params }); } catch (error) { fail(error); }
  });
  const cleanup = () => {
    if (cleanupPromise) return cleanupPromise;
    cleaning = true;
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
    child.stdout.removeListener('data', onData);
    pending.clear();
    cleanupPromise = new Promise((resolve) => {
      let finished = false;
      finishCleanup = () => {
        if (finished) return;
        finished = true;
        clearTimeout(killTimer);
        child.removeListener('error', onError);
        child.removeListener('exit', onExit);
        child.removeListener('close', onClose);
        child.stderr.removeListener('data', onStderr);
        for (const stream of [child.stdin, child.stdout, child.stderr]) {
          stream.removeListener('error', onError);
          stream.destroy();
        }
        resolve();
      };
      if (closed) { finishCleanup(); return; }
      killTimer = setTimeout(() => {
        if (!exited) {
          try { child.kill('SIGKILL'); } catch { /* Ownership never extends beyond child. */ }
        }
        // Do not let a missing OS close event keep the CLI alive indefinitely.
        if (!closed) child.unref?.();
        finishCleanup();
      }, 2000);
      try { child.stdin.end(); } catch { /* Continue terminating the owned child. */ }
      if (!exited) {
        try { child.kill('SIGTERM'); } catch { /* SIGKILL deadline remains active. */ }
      }
    });
    return cleanupPromise;
  };
  let response;
  try {
    const initialized = await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'bounded-blender-mcp-client', version: '1.0.0' } });
    if (initialized?.protocolVersion !== '2024-11-05') throw new Error('Unsupported MCP protocol version');
    send({ method: 'notifications/initialized' });
    let tool;
    let cursor;
    const seenCursors = new Set();
    do {
      const listed = await request('tools/list', cursor ? { cursor } : {});
      tool = listed.tools.find((entry) => entry.name === name);
      cursor = listed.nextCursor;
      if (!tool && cursor) {
        if (seenCursors.has(cursor) || seenCursors.size >= 100) throw new Error('Invalid or excessive tools/list pagination cursor');
        seenCursors.add(cursor);
      }
    } while (!tool && cursor);
    if (!tool) throw new Error(`Tool not found: ${name}`);
    const result = checkToolResult(await request('tools/call', { name, arguments: schemaArguments(tool.inputSchema, toolArgs) }));
    response = { ...result, mcp: { protocolVersion: initialized.protocolVersion, serverInfo: initialized.serverInfo } };
  } finally {
    await cleanup();
  }
  // The final response can race with abort, including while cleanup is awaited.
  // Decide success only after that last await; the signal retains cancellation
  // even after cleanup removes the event listener.
  checkAborted(signal);
  if (failure) throw failure;
  return response;
}

const usage = 'Usage: scene | screenshot --output <absolute-path> | execute --file <repo-script> --timeout-ms <integer>';
const repoRoot = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');

function cliOptions(argv) {
  const [command, ...rest] = argv;
  const allowed = { scene: [], screenshot: ['--output'], execute: ['--file', '--timeout-ms'] };
  if (!Object.hasOwn(allowed, command) || rest.length !== allowed[command].length * 2) throw new Error(usage);
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!allowed[command].includes(rest[i]) || Object.hasOwn(options, rest[i]) || !rest[i + 1] || rest[i + 1].startsWith('--')) throw new Error(usage);
    options[rest[i]] = rest[i + 1];
  }
  if (command === 'screenshot' && !path.isAbsolute(options['--output'])) throw new Error('Screenshot --output must be an absolute path');
  if (command === 'execute' && (!/^[0-9]+$/.test(options['--timeout-ms']) || Number(options['--timeout-ms']) < 1 || Number(options['--timeout-ms']) > 2_147_483_647)) throw new Error('Invalid --timeout-ms: expected integer from 1 to 2147483647');
  return { command, options };
}

async function scriptCode(filename, fs) {
  const root = await fs.realpath(repoRoot);
  const allowed = path.join(root, 'scripts', 'blender');
  const inside = (candidate) => {
    const relative = path.relative(allowed, candidate);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  const requested = path.resolve(root, filename);
  if (!inside(requested)) throw new Error('Execute file must be inside scripts/blender');
  const resolved = await fs.realpath(requested);
  if (!inside(resolved)) throw new Error('Execute realpath must remain inside scripts/blender');
  const stat = await fs.stat(resolved);
  if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error('Execute requires a regular script file no larger than 8 MiB');
  const source = await fs.readFile(resolved, 'utf8');
  // A separate namespace preserves future imports and makes __file__ available
  // inside functions as well as at module scope. No local Python is spawned.
  return `exec(compile(${JSON.stringify(source)}, ${JSON.stringify(resolved)}, "exec"), dict(globals(), __file__=${JSON.stringify(resolved)}, __name__="__main__"))`;
}

/** Testable CLI boundary; only the fixed uvx command can be spawned. */
export async function runCli(argv, { spawn = spawnProcess, stdout = process.stdout, signal, fs = fsPromises } = {}) {
  const { command, options } = cliOptions(argv);
  const args = { user_prompt: command };
  if (command === 'execute') args.code = await scriptCode(options['--file'], fs);
  const name = { scene: 'get_scene_info', screenshot: 'get_viewport_screenshot', execute: 'execute_blender_code' }[command];
  const result = await callBlenderTool({ name, arguments: args, timeoutMs: command === 'execute' ? Number(options['--timeout-ms']) : 30_000, signal }, { spawn });
  checkAborted(signal);
  if (command === 'screenshot') {
    const image = result.content?.find((item) => item.type === 'image');
    if (!image || typeof image.data !== 'string' || !image.mimeType?.startsWith('image/')) throw new Error('Screenshot returned no image content');
    if (!image.data.length || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.data)) throw new Error('Screenshot returned invalid base64 image');
    const bytes = Buffer.from(image.data, 'base64');
    if (bytes.toString('base64') !== image.data) throw new Error('Screenshot returned noncanonical base64 image');
    const output = options['--output'];
    await fs.mkdir(path.dirname(output), { recursive: true });
    checkAborted(signal);
    await fs.writeFile(output, bytes, { flag: 'wx' });
    checkAborted(signal);
    stdout.write(`${JSON.stringify({ output, bytes: bytes.length, mimeType: image.mimeType, mcp: result.mcp }, null, 2)}\n`);
  } else {
    stdout.write(`${JSON.stringify({ isError: result.isError, content: result.content?.filter((item) => item.type === 'text').map(({ type, text }) => ({ type, text })), mcp: result.mcp }, null, 2)}\n`);
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.on('SIGINT', abort);
  process.on('SIGTERM', abort);
  try {
    await runCli(process.argv.slice(2), { signal: controller.signal });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}
