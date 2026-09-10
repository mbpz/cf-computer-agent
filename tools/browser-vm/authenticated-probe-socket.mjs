// Scoped to a disposable probe Worker. Do not replace WebSocket in the product page.
export function createAuthenticatedProbeSocket({ NativeWebSocket, url, ticket, onDisconnect }) {
  if (typeof NativeWebSocket !== 'function' || typeof onDisconnect !== 'function'
    || typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
    throw new Error('Explicit local probe socket and capability required');
  }
  const destination = new URL(url);
  if (destination.protocol !== 'ws:' || destination.hostname !== '127.0.0.1'
    || destination.pathname !== '/relay' || destination.search || destination.hash
    || destination.username || destination.password) throw new Error('Invalid local relay destination');
  let consumed = false;
  return class AuthenticatedProbeSocket extends EventTarget {
    #socket;
    #intentional = false;
    #reported = false;
    #messageListener;
    constructor(requested) {
      if (requested !== url) throw new Error('Relay destination mismatch');
      if (consumed) throw new Error('Local probe capability already consumed');
      consumed = true;
      super();
      this.#socket = new NativeWebSocket(requested);
      this.#socket.addEventListener('open', () => {
        this.#socket.send(JSON.stringify({ type: 'authenticate', ticket }));
        ticket = ''; // No reconnect or credential reuse.
        this.dispatchEvent(new Event('open'));
      }, { once: true });
      const disconnected = () => {
        if (this.#intentional || this.#reported) return;
        this.#reported = true;
        ticket = '';
        onDisconnect(new Error('Authenticated local relay disconnected'));
      };
      this.#socket.addEventListener('message', event => {
        this.dispatchEvent(new MessageEvent('message', { data: event.data }));
      });
      this.#socket.addEventListener('error', () => {
        disconnected();
        this.dispatchEvent(new Event('error'));
      });
      this.#socket.addEventListener('close', () => {
        disconnected();
        this.dispatchEvent(new Event('close'));
      });
    }
    get binaryType() { return this.#socket.binaryType; }
    set binaryType(value) { this.#socket.binaryType = value; }
    get readyState() { return this.#socket.readyState; }
    set onmessage(listener) {
      if (this.#messageListener) this.removeEventListener('message', this.#messageListener);
      this.#messageListener = typeof listener === 'function' ? listener : null;
      if (this.#messageListener) this.addEventListener('message', this.#messageListener);
    }
    get onmessage() { return this.#messageListener; }
    // Pinned v86 assigns onclose to schedule an unauthenticated reconnect.
    // This single-use proof must instead fail and require an explicit new run.
    set onclose(_listener) {}
    get onclose() { return null; }
    send(data) { this.#socket.send(data); }
    close(...args) {
      this.#intentional = true;
      ticket = '';
      return this.#socket.close(...args);
    }
  };
}
