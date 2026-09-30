import { encodeProbeCommand, parseProbeReply } from '../serial-protocol.mjs';

// Developer-only fixed commands. The timer never treats a partial download as success.
export function runGuestCommand(machine, text) {
 // Only this fixed package installation gets a longer, bounded budget.
 const timeoutMs = text === 'apk add --no-cache git curl' ? 600000 : 90000;
 const id = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
 return new Promise((resolve, reject) => {
  let output = '', settled = false;
  const finish = (error, result) => {
   if (settled) return;
   settled = true;
   clearTimeout(timer);
   machine.remove_listener('serial0-output-byte', receive);
   if (error) reject(error); else resolve(result);
  };
  const receive = byte => {
   output += String.fromCharCode(byte);
   if (output.length > 131072) return finish(Error('Guest output limit exceeded'));
   const result = parseProbeReply(output, id);
   if (result) finish(null, result);
  };
  const timer = setTimeout(() => finish(Error('Guest command timeout: ' + text + '\n' + output.slice(-8000))), timeoutMs);
  machine.add_listener('serial0-output-byte', receive);
  try { machine.serial0_send(encodeProbeCommand(text, id)); } catch (error) { finish(error); }
 });
}
