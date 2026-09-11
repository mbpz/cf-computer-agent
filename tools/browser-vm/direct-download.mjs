import { ALPINE_FILE, ALPINE_BYTES, verifyAlpineArchive } from './alpine-artifact.mjs';

// Fixed public probes only. This is not a URL proxy or transparent VM networking.
export const DOWNLOAD_TARGETS = Object.freeze([
  { id: 'alpine-main', label: 'Alpine main 索引', url: 'https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86/APKINDEX.tar.gz', maxBytes: 4 * 1024 * 1024 },
  { id: 'alpine-community', label: 'Alpine community 索引', url: 'https://dl-cdn.alpinelinux.org/alpine/v3.24/community/x86/APKINDEX.tar.gz', maxBytes: 8 * 1024 * 1024 },
  { id: 'alpine-rootfs', label: 'Alpine 根文件系统（固定摘要）', url: `https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86/${ALPINE_FILE}`, maxBytes: ALPINE_BYTES },
  { id: 'github-api', label: 'GitHub 公共仓库 API', url: 'https://api.github.com/repos/octocat/Hello-World', maxBytes: 1024 * 1024 },
  { id: 'github-git', label: 'GitHub Git 协议入口', url: 'https://github.com/octocat/Hello-World.git/info/refs?service=git-upload-pack', maxBytes: 1024 * 1024 },
].map(Object.freeze));

export async function downloadDirect({ targetId, fetchImpl = globalThis.fetch, timeoutMs = 30_000, signal, onProgress = () => {} }) {
  const target = DOWNLOAD_TARGETS.find(item => item.id === targetId);
  if (!target) throw new Error('Invalid download target');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000) throw new Error('Invalid download deadline');
  const started = performance.now();
  const controller = new AbortController();
  let receivedBytes = 0;
  let response;
  let reader;
  let stopped;
  let rejectStop;
  const interruption = new Promise((_, reject) => { rejectStop = reject; });
  // A pre-aborted signal can reject before the first race attaches its handler.
  interruption.catch(() => {});
  const fail = code => Object.assign(new Error(code), { code, diagnostic: {
    targetId, code, receivedBytes, elapsedMs: Math.round(performance.now() - started),
    status: response?.status, responseType: response?.type,
  } });
  const stop = code => {
    if (stopped) return;
    stopped = code;
    controller.abort();
    rejectStop(fail(code));
  };
  const cancel = () => stop('canceled');
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => stop('timeout'), timeoutMs);
  const bounded = operation => {
    if (stopped) throw fail(stopped);
    return Promise.race([operation, interruption]);
  };
  try {
    if (signal?.aborted) cancel();
    if (stopped) throw fail(stopped);
    response = await bounded(fetchImpl(target.url, {
      method: 'GET', mode: 'cors', credentials: 'omit', redirect: 'error',
      referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal,
    }));
    if (['opaque', 'opaqueredirect'].includes(response.type)) throw fail('unreadable-response');
    if (response.status !== 200 || response.redirected) throw fail('http-error');
    const declared = Number(response.headers.get('content-length'));
    if (declared > target.maxBytes) throw fail('size-limit');
    if (!response.body) throw fail('incomplete-body');
    reader = response.body.getReader();
    const chunks = [];
    while (true) {
      const { value, done } = await bounded(reader.read());
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > target.maxBytes) throw fail('size-limit');
      chunks.push(value);
      onProgress({ targetId, receivedBytes });
    }
    // Fetch can decompress HTTP bodies; Content-Length then describes encoded bytes.
    // Only compare it for binary archive probes, not JSON/Git transfer encodings.
    if (!receivedBytes || (targetId.startsWith('alpine-') && declared > 0
      && !response.headers.get('content-encoding') && receivedBytes !== declared)) throw fail('incomplete-body');
    const bytes = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const digest = await bounded(crypto.subtle.digest('SHA-256', bytes));
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    let integrity = 'hash-recorded-only';
    let apiRepository;
    if (targetId === 'alpine-rootfs') {
      try { await bounded(verifyAlpineArchive(bytes)); }
      catch (error) { if (stopped) throw fail(stopped); throw fail('integrity-mismatch'); }
      integrity = 'pinned-sha256-verified';
    }
    if (targetId === 'github-api') {
      try { apiRepository = JSON.parse(new TextDecoder().decode(bytes)).full_name; } catch { /* handled below */ }
      if (apiRepository !== 'octocat/Hello-World') throw fail('content-mismatch');
    }
    if (stopped) throw fail(stopped);
    return { targetId, url: target.url, status: response.status, responseType: response.type,
      bytes: receivedBytes, sha256, integrity, apiRepository, elapsedMs: Math.round(performance.now() - started),
      transport: 'browser-fetch-direct', downloadCompleted: true, vmNetworkVerified: false };
  } catch (error) {
    controller.abort();
    // Do not await cancellation: a broken producer must not bypass the deadline.
    try { (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); } catch { /* already closed */ }
    throw stopped ? fail(stopped) : error?.diagnostic ? error : fail('network-or-cors');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    try { reader?.releaseLock(); } catch { /* canceled read */ }
  }
}
