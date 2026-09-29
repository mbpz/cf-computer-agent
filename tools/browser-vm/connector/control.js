const pairButton = document.getElementById('pair');
const stopButton = document.getElementById('stop');
const code = document.getElementById('code');
const status = document.getElementById('status');
let timer, epoch = 0, stopped = false, ready = false, visible = true;
function clearCode() { clearTimeout(timer); code.textContent = ''; }
async function post(path) {
  const response = await fetch(path, { method: 'POST', credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) throw new Error('Local control rejected');
  return response.json();
}
fetch('/identity', { credentials: 'omit', cache: 'no-store' }).then(async response => {
  if (!response.ok) throw new Error('Unavailable');
  const identity = await response.json();
  document.getElementById('origin').textContent = identity.allowedOrigin;
  document.getElementById('identity').textContent = identity.connectorId;
  document.getElementById('policy').textContent = identity.policyVersion;
  ready = true;
  if (!stopped && visible) pairButton.disabled = false;
}).catch(() => { status.textContent = '本机组件不可用，请重新启动后访问新的本机地址。'; });
pairButton.addEventListener('click', async () => {
  const current = ++epoch; clearCode(); pairButton.disabled = true;
  try {
    const result = await post('/pair');
    if (current !== epoch || stopped) return;
    code.textContent = result.pairingCode;
    status.textContent = '配对码已生成；仅用于上方指定来源。';
    timer = setTimeout(() => { clearCode(); status.textContent = '配对码显示已清除，需要时请重新生成。'; }, Math.min(30_000, Math.max(0, result.expiresAtMs - Date.now())));
  } catch { if (current === epoch) status.textContent = '生成失败；未自动重试。'; }
  finally { if (current === epoch && !stopped) pairButton.disabled = false; }
});
stopButton.addEventListener('click', async () => {
  stopped = true; epoch++; clearCode(); pairButton.disabled = true; stopButton.disabled = true;
  try { await post('/stop'); status.textContent = '已停止连接器，所有通道已请求关闭。'; }
  catch { status.textContent = '停止结果未知；请在启动组件的终端确认已退出。不要继续使用旧配对码。'; }
});
addEventListener('pagehide', () => { visible = false; epoch++; clearCode(); pairButton.disabled = true; });
addEventListener('pageshow', () => { visible = true; pairButton.disabled = stopped || !ready; });
