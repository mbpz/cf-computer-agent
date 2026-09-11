// Deliberately accepts only a port, not a URL or destination host.
export function connectProbe({ port, token, onState, WebSocketImpl = globalThis.WebSocket, timeoutMs = 15_000, sessionMs = 65_000 }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid probe inputs');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('Invalid timeout');
  if (!Number.isInteger(sessionMs) || sessionMs < 1 || sessionMs > 65_000) throw new Error('Invalid session lifetime');
  let ws; let timer; let done = false; let ready = false;
  const listeners = [];
  const finish = state => {
    if (done) return;
    done = true; token = ''; clearTimeout(timer);
    for (const [name, handler] of listeners) ws.removeEventListener(name, handler);
    try { ws?.close(); } catch { /* The browser may already have closed the transport. */ }
    onState(state);
  };
  const session = { cancel: () => finish('cancelled') };
  const listen = (name, handler) => { listeners.push([name, handler]); ws.addEventListener(name, handler); };
  onState('connecting');
  try {
    ws = new WebSocketImpl(`ws://127.0.0.1:${port}/probe`);
    listen('open', () => {
      try { ws.send(JSON.stringify({ type: 'probe-authenticate', token })); token = ''; }
      catch { finish('connection-unavailable'); }
    });
    listen('message', event => {
      let result;
      try { result = typeof event.data === 'string' && event.data.length < 256 ? JSON.parse(event.data) : null; } catch { /* Reject below. */ }
      if (ready || !result || Object.keys(result).sort().join(',') !== 'forwarding,type,version' || result.type !== 'probe-ready' || result.version !== 1 || result.forwarding !== false) return finish('protocol-error');
      ready = true; clearTimeout(timer);
      timer = setTimeout(() => finish('offline'), sessionMs);
      onState('ready');
    });
    listen('error', () => finish(ready ? 'offline' : 'connection-unavailable'));
    listen('close', event => finish(ready ? 'offline' : event.code === 1008 ? 'pairing-rejected' : 'connection-unavailable'));
    timer = setTimeout(() => finish('timed-out'), timeoutMs);
  } catch { finish('connection-unavailable'); }
  return session;
}
