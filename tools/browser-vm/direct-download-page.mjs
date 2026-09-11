import { downloadDirect } from './direct-download.mjs';

export function bindDownloadPage({ document, window, runDownload = downloadDirect }) {
  const targets = [...document.querySelectorAll('button[data-target]')];
  const cancel = document.getElementById('cancel');
  const status = document.getElementById('status');
  const result = document.getElementById('result');
  let active;
  let epoch = 0;
  const busy = value => {
    targets.forEach(button => { button.disabled = value; });
    cancel.disabled = !value;
  };
  const stop = () => {
    if (!active) return;
    epoch++;
    active.abort();
    active = undefined;
    status.textContent = '已取消；可以重新选择下载。';
    result.textContent = JSON.stringify({ code: 'canceled', vmNetworkVerified: false }, null, 2);
    busy(false);
  };
  cancel.addEventListener('click', stop);
  window.addEventListener('pagehide', stop);
  busy(false);
  for (const button of targets) button.addEventListener('click', async () => {
    if (active) return;
    const run = ++epoch;
    const controller = new AbortController();
    active = controller;
    busy(true);
    status.textContent = '正在从本浏览器直接下载，最长 30 秒……';
    result.textContent = '';
    try {
      const evidence = await runDownload({ targetId: button.dataset.target, signal: controller.signal,
        onProgress: progress => {
          if (run === epoch) status.textContent = `正在下载：已接收 ${progress.receivedBytes} 字节……`;
        } });
      if (run !== epoch) return;
      status.textContent = '浏览器已完整读取响应；不代表 VM 已联网或软件已安装。';
      result.textContent = JSON.stringify(evidence, null, 2);
    } catch (error) {
      if (run !== epoch) return;
      status.textContent = '下载未完成。network-or-cors 表示网络或跨域限制，不能仅凭此错误确定原因。';
      result.textContent = JSON.stringify(error.diagnostic ?? { code: 'download-failed' }, null, 2);
    } finally {
      if (run === epoch) { active = undefined; busy(false); }
    }
  });
}
