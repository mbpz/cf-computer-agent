import { CONNECTOR_HOSTS, isPublicIpv4Destination } from './destination-common.mjs';

const names = new Set(CONNECTOR_HOSTS), installed = new WeakSet();
const encoder = new TextEncoder();
const LIMIT = 256 * 1024, TTL = 30_000;
const disabled = () => { throw new Error('Native network entry disabled'); };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const view = b => new DataView(b.buffer, b.byteOffset, b.byteLength);
function checksum(b) {
  let sum = 0;
  for (let i = 0; i < b.length; i += 2) sum += (b[i] << 8) + (b[i + 1] || 0);
  while (sum >>> 16) sum = (sum & 65535) + (sum >>> 16);
  return (~sum) & 65535;
}
function transportValid(b, payload) {
  const pseudo = new Uint8Array(12 + payload.length);
  pseudo.set(b.subarray(26,34)); pseudo[9] = b[23]; view(pseudo).setUint16(10,payload.length); pseudo.set(payload,12);
  return checksum(pseudo) === 0;
}
function wisp(type, id, data) {
  const b = new Uint8Array(5 + data.length); b[0] = type; view(b).setUint32(1,id,true); b.set(data,5); return b;
}

/** Attach only to a fresh, paused pinned-v86 fetch adapter. Its local Ethernet/TCP
 * stack is retained, but native fetch/DoH/WISP transports are never used. The owner
 * routes formal-client onFrame here and onClose to close(); it must destroy this
 * adapter at logout/runtime/restore boundaries, never restore its name authority.
 */
export function attachConnectorGuestNetwork({ machine, client, clock = { monotonicNow: () => performance.now() } }) {
  const net = machine?.network_adapter;
  const handlers = net?.bus?.listeners?.['tcp-connection'];
  const owned = handlers?.filter(handler => handler.this_value === net);
  if (!net || installed.has(net) || machine.is_running() || client?.readyState !== 1
    || typeof net.send !== 'function' || typeof net.receive !== 'function' || typeof net.fetch !== 'function'
    || net.on_tcp_connection || net.dns_method !== 'static' || net.id !== 0
    || !same(net.router_ip,new Uint8Array([192,168,86,1])) || !same(net.vm_ip,new Uint8Array([192,168,86,100]))
    || !owned || owned.length !== 1 || Object.keys(net.tcp_conn).length) throw new Error('Fresh paused pinned network adapter required');
  installed.add(net);
  net.bus.unregister('tcp-connection',owned[0].fn);
  net.fetch = disabled; net.connect = disabled; net.tcp_probe = disabled;
  const originalSend = net.send.bind(net), originalDestroy = net.destroy.bind(net);
  const associations = new Map(), streams = new Map();
  let closed = false, nextId = 0, pendingDns = 0;
  const setTimer = clock.setTimer || setTimeout, clearTimer = clock.clearTimer || clearTimeout;
  const originalReceive = net.receive.bind(net);
  net.receive = bytes => { if (!closed) originalReceive(bytes); };
  function live() {
    if (!closed && (client.readyState !== 1 || [...streams.values()].some(record => clock.monotonicNow() >= record.deadline))) close();
    return !closed;
  }
  function touch(record) {
    clearTimer(record.timer); record.deadline = clock.monotonicNow() + 15_000;
    record.timer = setTimer(close,15_000); record.timer?.unref?.();
  }
  function retire(record, notify) {
    if (!streams.delete(record.id)) return;
    clearTimer(record.timer); record.queue.length = 0; record.bytes = 0;
    record.conn.events_handlers = {}; record.conn.send_buffer.remove(record.conn.send_buffer.length); record.conn.release();
    if (notify && live()) client.send(wisp(4,record.id,new Uint8Array([2])));
  }
  function close() {
    if (closed) return;
    closed = true; associations.clear();
    for (const record of [...streams.values()]) retire(record,false);
    client.close();
  }
  net.destroy = () => { close(); originalDestroy(); };
  function cleanNames() { for (const [name,entry] of associations) if (entry.expires <= clock.monotonicNow()) associations.delete(name); }
  function domain(address) {
    cleanNames();
    for (const [name,entry] of associations) if (entry.address === address) return name;
  }
  function flush(record) {
    while (live() && streams.has(record.id) && record.credit && record.queue.length) {
      const bytes = record.queue.shift(); record.bytes -= bytes.length; record.credit--;
      if (!client.send(wisp(2,record.id,bytes))) return close();
    }
    if (live() && record.guestClosed && !record.remoteClosed && !record.queue.length) {
      record.remoteClosed = true;
      if (!client.send(wisp(4,record.id,new Uint8Array([2])))) return close();
      record.conn.close();
    }
  }
  net.on_tcp_connection = (conn, packet) => {
    if (!live()) return;
    const hostname = domain(packet.ipv4.dest.join('.'));
    if (!hostname || ![80,443].includes(conn.sport)) return;
    if (streams.size >= 8 || nextId >= 0xffffffff) return close();
    // Repeated SYN must not orphan a formerly authorized connection/queue.
    for (const previous of streams.values()) if (previous.conn.tuple === conn.tuple) return close();
    const record = { id: ++nextId, conn, credit: 16, queue: [], bytes: 0 };
    streams.set(record.id,record); touch(record); conn.send_buffer.maximum_capacity = LIMIT;
    const target = new Uint8Array(3 + hostname.length); target[0] = 1; view(target).setUint16(1,conn.sport,true); target.set(encoder.encode(hostname),3);
    if (!client.send(wisp(1,record.id,target))) return close();
    conn.on('data',data => {
      if (!live() || !streams.has(record.id)) return;
      if (record.remoteClosed) return close();
      touch(record);
      if (data.length > 16384 || record.bytes + data.length > LIMIT || record.queue.length >= 256) return close();
      record.queue.push(Uint8Array.from(data)); record.bytes += data.length; flush(record);
    });
    conn.on('close',() => retire(record,!record.remoteClosed));
    conn.on('shutdown',() => { record.guestClosed = true; flush(record); });
    conn.accept();
  };
  function dnsReply(b, query, address, rcode = 0) {
    if (!live()) return;
    const size = 12 + query.question.length + (address ? 16 : 0), out = new Uint8Array(42 + size), v = view(out);
    out.set(b.subarray(6,12)); out.set(net.router_mac,6); v.setUint16(12,0x800);
    out[14] = 0x45; v.setUint16(16,out.length-14); out[22] = 64; out[23] = 17;
    out.set(net.router_ip,26); out.set(b.subarray(26,30),30); v.setUint16(24,checksum(out.subarray(14,34)));
    v.setUint16(34,53); v.setUint16(36,view(b).getUint16(34)); v.setUint16(38,8+size);
    v.setUint16(42,query.id); v.setUint16(44,0x8080 | query.rd | rcode); v.setUint16(46,1); v.setUint16(48,address?1:0); out.set(query.question,54);
    if (address) {
      const offset = 54 + query.question.length;
      v.setUint16(offset,0xc00c); v.setUint16(offset+2,1); v.setUint16(offset+4,1); v.setUint32(offset+6,30); v.setUint16(offset+10,4); out.set(address.split('.').map(Number),offset+12);
    }
    net.receive(out);
  }
  function dns(b, bytes) {
    if (bytes.length < 17 || bytes.length > 512) return;
    const v = view(bytes), flags = v.getUint16(2);
    if ((flags & ~0x0100) || v.getUint16(4) !== 1 || v.getUint16(6) || v.getUint16(8) || v.getUint16(10)) return;
    let offset = 12; const labels = [];
    while (offset < bytes.length && bytes[offset]) {
      const length = bytes[offset++];
      if (length > 63 || offset + length > bytes.length) return;
      const label = String.fromCharCode(...bytes.subarray(offset,offset+length));
      if (!/^[A-Za-z0-9-]+$/u.test(label)) return;
      labels.push(label); offset += length;
    }
    if (!labels.length || offset + 5 !== bytes.length || v.getUint16(offset+3) !== 1) return;
    const hostname = labels.join('.').toLowerCase(), type = v.getUint16(offset+1);
    const query = { id: v.getUint16(0), rd: flags & 0x100, question: bytes.slice(12) };
    if (!names.has(hostname)) return dnsReply(b,query,undefined,5);
    if (type !== 1) return dnsReply(b,query,undefined,type === 28 ? 0 : 4);
    if (++pendingDns > 3) return close();
    void (async () => {
      try {
        const answer = await client.resolve(hostname);
        if (!live()) return;
        if (answer?.hostname !== hostname || !isPublicIpv4Destination(answer.address)) return close();
        cleanNames();
        for (const [other,entry] of associations) if (other !== hostname && entry.address === answer.address) return close();
        associations.set(hostname,{address:answer.address,expires:clock.monotonicNow()+TTL});
        dnsReply(b,query,answer.address);
      } catch { close(); } finally { pendingDns--; }
    })();
  }
  net.send = input => {
    if (!live()) return;
    try {
      if (!(input instanceof Uint8Array) || input.length < 14 || input.length > 1514) return;
      const b = Uint8Array.from(input), v = view(b);
      if (!same(b.subarray(6,12),net.vm_mac)) return;
      const kind = v.getUint16(12);
      if (kind === 0x806) {
        if (b.length < 42 || v.getUint16(14) !== 1 || v.getUint16(16) !== 0x800 || b[18] !== 6 || b[19] !== 4 || ![1,2].includes(v.getUint16(20))) return;
        originalSend(b); return;
      }
      if (kind !== 0x800 || b.length < 34 || b[14] !== 0x45 || (v.getUint16(20)&0xbfff) || checksum(b.subarray(14,34))) return;
      const end = 14 + v.getUint16(16);
      if (end > b.length || end < 34) return;
      const payload = b.subarray(34,end), pv = view(payload), guestSource = same(b.subarray(26,30),net.vm_ip);
      if (b[23] === 6) {
        if (!guestSource || payload.length < 20 || (payload[12]>>>4)*4 < 20 || (payload[12]>>>4)*4 > payload.length || !transportValid(b,payload)) return;
        const tuple = `${net.vm_ip.join('.')}:${pv.getUint16(0)}:${b.subarray(30,34).join('.')}:${pv.getUint16(2)}`;
        for (const record of streams.values()) if (record.conn.tuple === tuple) touch(record);
        originalSend(b.subarray(0,end));
        for (const record of [...streams.values()]) if (!net.tcp_conn[record.conn.tuple]) retire(record,!record.remoteClosed);
        return;
      }
      if (b[23] !== 17 || payload.length < 8 || pv.getUint16(4) !== payload.length || (pv.getUint16(6) && !transportValid(b,payload))) return;
      if (pv.getUint16(2) === 53 && guestSource && same(b.subarray(30,34),net.router_ip)) return dns(b.subarray(0,end),payload.subarray(8));
      // DHCP is local configuration only, never a UDP relay or native DNS path.
      if (pv.getUint16(0) === 68 && pv.getUint16(2) === 67 && payload.length >= 248
        && (guestSource || same(b.subarray(26,30),new Uint8Array(4)))
        && (same(b.subarray(30,34),net.router_ip) || same(b.subarray(30,34),new Uint8Array([255,255,255,255])))
        && payload[8] === 1 && payload[9] === 1 && payload[10] === 6
        && same(payload.subarray(36,42),net.vm_mac) && pv.getUint32(244) === 0x63825363) originalSend(b.subarray(0,end));
    } catch { close(); }
  };
  function receive(input) {
    if (!live()) return;
    try {
      const b = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
      if (!(b instanceof Uint8Array) || b.length < 6 || b.length > 16389) return close();
      const id = view(b).getUint32(1,true);
      if (!id && b[0] === 3 && b.length === 9 && view(b).getUint32(5,true) === 16) return;
      const record = streams.get(id); if (!record) return;
      touch(record);
      if (b[0] === 3 && b.length === 9 && view(b).getUint32(5,true) === 16 && !record.credit) { record.credit = 16; flush(record); }
      else if (b[0] === 2) {
        if (record.remoteClosed) return close();
        if (record.conn.send_buffer.length + b.length - 5 > LIMIT) return close();
        record.conn.write(b.subarray(5));
      } else if (b[0] === 4 && b.length === 6 && b[5] === 2) { record.remoteClosed = true; record.queue.length = 0; record.bytes = 0; record.conn.close(); }
      else close();
    } catch { close(); }
  }
  return Object.freeze({ receive, close });
}
