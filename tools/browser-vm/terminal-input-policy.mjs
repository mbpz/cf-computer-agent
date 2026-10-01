// UI consent only; the serial transport still enforces its own byte/content bounds.
// No navigator.clipboard access, output parsing, command rewriting or auto-send.
const RISKY=/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/;
export function approveTerminalText(text,confirm) {
  if(typeof text!=='string'||text.length>4096)return false;
  if(!RISKY.test(text))return true;
  // Escape hidden direction/control characters too, not just JSON's C0 escapes.
  const preview=JSON.stringify(text).replace(new RegExp(RISKY.source,'g'),char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
  try{return typeof confirm==='function'&&confirm('输入包含多行或控制字符，可能执行多条命令。请核对转义文本。\nMultiline/control input may execute multiple commands. Review escaped text:\n'+preview+'\n确认继续？ Continue?')===true;}catch{return false;}
}
export function guardTerminalPaste(input,confirm) {
  const listener=event=>{
    let text;try{text=event.clipboardData?.getData('text/plain');}catch{/* Unknown clipboard data must not silently insert. */}
    if(!approveTerminalText(text,confirm))event.preventDefault();
  };
  input.addEventListener('paste',listener);
  return ()=>input.removeEventListener('paste',listener);
}
