// Strict TCP-only WISP v1 subset. Authorization/renewal remain separate JSON.
// No probe tickets, synthetic IP mappings, UDP, redirects or destination lookup here.
const invalid = () => { throw new Error('Invalid connector frame'); };
const validId = (id, zero = false) => Number.isInteger(id) && id >= (zero ? 0 : 1) && id <= 0xffff_ffff;
export function decodeClientFrame(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 6 || bytes.length > 16 * 1024 + 5) return invalid();
  const id = bytes.readUInt32LE(1);
  if (!validId(id)) return invalid();
  if (bytes[0] === 1) {
    if (bytes.length < 9 || bytes.length > 261 || bytes[5] !== 1) return invalid();
    const name = bytes.subarray(8);
    if (!name.every(b => b < 128) || !/^[A-Za-z0-9.-]+$/u.test(name.toString('ascii'))) return invalid();
    return { type: 'connect', id, target: { hostname: name.toString('ascii'), port: bytes.readUInt16LE(6) } };
  }
  if (bytes[0] === 2) return { type: 'data', id, data: bytes.subarray(5) };
  // The pinned client sends reason 2 (voluntary). No peer-provided reason is echoed.
  if (bytes[0] === 4 && bytes.length === 6 && bytes[5] === 2) return { type: 'close', id };
  return invalid();
}
function frame(type, id, body, zero = false) {
  if (!validId(id, zero)) return invalid();
  const bytes = Buffer.alloc(5 + body.length);
  bytes[0] = type; bytes.writeUInt32LE(id, 1); body.copy(bytes, 5); return bytes;
}
export function encodeContinue(id, credits) {
  if (!Number.isInteger(credits) || credits < 1 || credits > 16) return invalid();
  const body = Buffer.alloc(4); body.writeUInt32LE(credits); return frame(3, id, body, true);
}
export function encodeData(id, body) {
  if (!Buffer.isBuffer(body) || body.length < 1 || body.length > 16384) return invalid();
  return frame(2, id, body);
}
export const encodeClose = id => frame(4, id, Buffer.from([2]));

/** Raw inbound WebSocket meter, installed before ws receives socket bytes.
 * Includes masks, fragmented/empty frames, control frames and JSON; buffers only
 * a 14-byte header and skips payload without decoding/copying it. ws remains the
 * protocol validator. Output uses unfragmented ws.send with <=10 header octets.
 * Reserve 139 octets and one frame for termination. Rejection is irreversible.
 */
export function createWireBudget() {
  let bytes = 0, frames = 0, denied = false, have = 0, need = 2, skip = 0;
  const header = Buffer.alloc(14), MAX = 64*1024*1024;
  const charge = (size, count) => {
    if (denied || !Number.isSafeInteger(size) || size < 0 || bytes + size > MAX-139
      || frames + count > 99999) { denied = true; return false; }
    bytes += size; frames += count; return true;
  };
  function inbound(chunk) {
    if (!Buffer.isBuffer(chunk) || !charge(chunk.length,0)) { denied=true; return false; }
    let offset = 0;
    while(offset < chunk.length) {
      if (skip) { const n=Math.min(skip,chunk.length-offset); skip-=n; offset+=n; continue; }
      const n=Math.min(need-have,chunk.length-offset);
      chunk.copy(header,have,offset,offset+n); have+=n; offset+=n;
      if (have < need) continue;
      if (need === 2) {
        if (!charge(0,1)) return false;
        const short=header[1]&127;
        need=2+(short===126?2:short===127?8:0)+(header[1]&128?4:0);
        if(have<need) continue;
      }
      const short=header[1]&127;
      const length=short===127?header.readBigUInt64BE(2):BigInt(short===126?header.readUInt16BE(2):short);
      if(length>BigInt(MAX)) { denied=true; return false; }
      skip=Number(length); have=0; need=2;
    }
    return true;
  }
  return Object.freeze({ inbound, outbound: size => {
    if (!Number.isSafeInteger(size) || size < 0) { denied=true; return false; }
    return charge(size+10,1);
  } });
}
