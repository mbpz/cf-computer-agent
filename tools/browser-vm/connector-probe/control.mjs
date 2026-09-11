const button = document.getElementById('issue');
const output = document.getElementById('token');
const status = document.getElementById('status');
let timer; let epoch = 0; let request;
function clear() { epoch++; clearTimeout(timer); request?.abort(); output.textContent = ''; button.disabled = false; }
document.getElementById('clear').addEventListener('click', clear);
window.addEventListener('pagehide', clear);
button.addEventListener('click', async () => {
  clear(); const run = epoch; button.disabled = true;
  request = new AbortController();
  const deadline = setTimeout(() => request?.abort(), 5000);
  try {
    const response = await fetch('/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: request.signal, cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error('rejected');
    const result = await response.json();
    if (run !== epoch) return;
    output.textContent = result.token;
    status.textContent = `仅用于 ${result.allowedOrigin}，30 秒内有效。`;
    timer = setTimeout(clear, result.expiresInMs);
  } catch { if (run === epoch) status.textContent = '未能生成配对码，请确认本机探针仍在运行。'; }
  finally { clearTimeout(deadline); if (run === epoch) button.disabled = false; }
});
