const start = document.querySelector('#start');
const grant = document.querySelector('#grant');
const cancel = document.querySelector('#cancel');
const status = document.querySelector('#status');
const output = document.querySelector('#evidence');
let worker;
let deadline;

function finish(message) {
  clearTimeout(deadline);
  worker?.terminate();
  worker = undefined;
  start.disabled = false;
  grant.disabled = true;
  cancel.disabled = true;
  status.textContent = message;
}
start.addEventListener('click', () => {
  if (worker) return;
  output.textContent = '';
  start.disabled = true;
  cancel.disabled = false;
  status.textContent = '正在启动真实 Linux';
  let current;
  try { current = new Worker('/recovery-worker.mjs', { type: 'module' }); }
  catch { finish('失败：无法创建 Linux Worker，可重试'); return; }
  worker = current;
  deadline = setTimeout(() => finish('失败：恢复验证超时'), 120_000);
  current.addEventListener('error', () => { if (worker === current) finish('失败：Linux Worker 错误'); });
  current.addEventListener('messageerror', () => { if (worker === current) finish('失败：消息错误'); });
  current.addEventListener('message', ({ data }) => {
    if (worker !== current) return;
    if (data?.type === 'progress') status.textContent = `验证阶段：${data.stage}`;
    else if (data?.type === 'offline-ready') {
      output.textContent = JSON.stringify(data.evidence, null, 2);
      status.textContent = '已验证离线恢复，等待显式新授权';
      grant.disabled = false;
    } else if (data?.type === 'result') {
      output.textContent = JSON.stringify(data.evidence, null, 2);
      finish('通过：本机 HTTP 恢复验证（不代表公网验收）');
    } else {
      if (data?.diagnostic) output.textContent = JSON.stringify(data.diagnostic, null, 2);
      finish(`失败：${data?.message ?? '无效结果'}`);
    }
  });
  current.postMessage({ type: 'run' });
});
grant.addEventListener('click', () => {
  if (!worker || grant.disabled) return;
  grant.disabled = true;
  status.textContent = '正在申请新授权';
  worker.postMessage({ type: 'fresh-grant' });
});
cancel.addEventListener('click', () => finish('已取消，Worker 已终止'));
window.addEventListener('pagehide', () => finish('页面已离开，Worker 已终止'));
