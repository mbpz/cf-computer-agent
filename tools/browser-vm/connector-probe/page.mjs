import { connectProbe } from './client.mjs';

const labels = {
  connecting: '正在连接；如浏览器提示本地网络权限，请自行选择。',
  ready: '握手成功；仅验证连接，不提供外网转发。',
  offline: '连接已离线。需要手动生成新配对码后重新连接。',
  cancelled: '已断开 / 取消，不会自动重试。',
  'pairing-rejected': '握手被拒绝：检查配对码是否有效并重新生成。',
  'connection-unavailable': '连接不可用，浏览器未提供足够原因。请核对组件、端口和浏览器的权限 / 安全诊断，不据此判断具体原因。',
  'protocol-error': '响应不符合握手协议，连接已关闭。',
  'timed-out': '等待超时，连接已关闭；不会自动重试。',
};

export function bindProbePage({ document, window, connect = connectProbe }) {
  const elements = Object.fromEntries(['port', 'credential', 'connect', 'cancel', 'status', 'context'].map(id => [id, document.getElementById(id)]));
  let active; let epoch = 0;
  elements.cancel.disabled = true;
  elements.context.textContent = `页面来源：${window.location.origin}\n浏览器标识（不替代完整版本验收）：${window.navigator.userAgent}\nHTTPS 安全上下文：${window.location.protocol === 'https:' && window.isSecureContext ? '是，仍需确认有效证书和默认安全配置' : '否，不计准入验收'}`;
  const stop = () => { active?.cancel(); active = undefined; epoch++; elements.credential.value = ''; };
  elements.cancel.addEventListener('click', stop);
  window.addEventListener('pagehide', stop);
  elements.connect.addEventListener('click', () => {
    const token = elements.credential.value.trim();
    const port = Number(elements.port.value);
    stop(); const run = epoch;
    try {
      active = connect({ port, token, onState(state) {
        if (run !== epoch) return;
        elements.status.textContent = labels[state] ?? '未知响应，停止验收。';
        const live = state === 'connecting' || state === 'ready';
        elements.connect.disabled = live;
        elements.cancel.disabled = !live;
      } });
    } catch {
      elements.status.textContent = '请填写有效端口和一次性配对码。';
      elements.connect.disabled = false;
      elements.cancel.disabled = true;
    }
  });
  return { elements, stop };
}

if (typeof document !== 'undefined') bindProbePage({ document, window });
