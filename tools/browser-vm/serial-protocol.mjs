function validateId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{16}$/.test(id)) throw new Error('Invalid probe operation ID');
}

/** For fixed developer probes, not a public command execution interface. */
export function encodeProbeCommand(command, id) {
  validateId(id);
  if (typeof command !== 'string' || !command.trim() || /[\x00-\x1f\x7f]/.test(command)) {
    throw new Error('Invalid probe command');
  }
  return `printf '\\036BEGIN:${id}\\037'; ( ${command} ); vm_probe_rc=$?; printf '\\036END:${id}:%s\\037' "$vm_probe_rc"\n`;
}

export function parseProbeReply(buffer, id) {
  validateId(id);
  const begin = `\x1eBEGIN:${id}\x1f`;
  const start = buffer.indexOf(begin);
  if (start === -1) return null;
  const tail = buffer.slice(start + begin.length);
  const match = new RegExp(`\x1eEND:${id}:([0-9]{1,3})\x1f`).exec(tail);
  if (!match || Number(match[1]) > 255) return null;
  return { output: tail.slice(0, match.index).replaceAll('\r\n', '\n'), exitCode: Number(match[1]) };
}
