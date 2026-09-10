import { runWorkerProbe } from './probe-worker-client.mjs';
import { connectTerminal } from './terminal-client.mjs';

const button = document.querySelector('#run');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
const cancel = document.querySelector('#cancel');
const alpine = document.querySelector('#alpine');
const network = document.querySelector('#network');
const image = document.querySelector('#image');
const terminalStart = document.querySelector('#terminal-start');
function syncOptions() {
  const iso = image.value === 'alpine-iso';
  alpine.disabled = iso;
  if (iso) alpine.checked = false;
  network.disabled = !iso && !alpine.checked;
  if (network.disabled) network.checked = false;
}
alpine.addEventListener('change', syncOptions);
image.addEventListener('change', syncOptions);
let controller;
cancel.addEventListener('click', () => controller?.abort());
window.addEventListener('pagehide', () => controller?.abort());

button.addEventListener('click', async () => {
  if (button.disabled) return;
  button.disabled = true;
  terminalStart.disabled = true;
  alpine.disabled = true;
  image.disabled = true;
  network.disabled = true;
  cancel.disabled = false;
  controller = new AbortController();
  let pageTicks = 0;
  let lastTick = performance.now();
  let maxPageTickGapMs = 0;
  const phases = new Map();
  const visibility = [{ state: document.visibilityState, elapsedMs: 0 }];
  const startedAt = performance.now();
  const visibilityChanged = () => visibility.push({ state: document.visibilityState, elapsedMs: Math.round(performance.now() - startedAt) });
  document.addEventListener('visibilitychange', visibilityChanged);
  const heartbeat = setInterval(() => {
    const now = performance.now();
    maxPageTickGapMs = Math.max(maxPageTickGapMs, now - lastTick);
    lastTick = now;
    pageTicks++;
  }, 100);
  status.textContent = 'Linux 正在启动并验证，请保留此页面…';
  result.textContent = '';
  try {
    const evidence = await runWorkerProbe({ signal: controller.signal, image: image.value, alpine: alpine.checked, network: network.checked,
      onProgress: progress => {
        phases.set(progress.stage, progress);
        const labels = { boot: '启动 Linux', packages: '安装软件包', git: 'HTTPS Git 拉取', api: 'HTTPS API 请求' };
        status.textContent = `${labels[progress.stage]}：${progress.status}，${progress.elapsedMs} ms`;
        result.textContent = JSON.stringify({ phases: [...phases.values()], pageTicks, maxPageTickGapMs: Math.round(maxPageTickGapMs), visibility }, null, 2);
      },
    });
    const checks = [
      evidence.architecture === 'i686', evidence.kernel.startsWith('Linux version '),
      evidence.hostToGuest === 'vm-host-to-guest', evidence.guestToHost === 'vm-guest-to-host',
      evidence.restoredSharedFile === 'vm-guest-to-host',
      evidence.restoredPrivateFile === 'vm-private-memory-file',
      evidence.restoredCommandOutput === 'vm-restored-shell', evidence.commandFailureExitCode === 23,
      evidence.snapshotBytes > 0 && evidence.snapshotBytes <= 512 * 1024 * 1024,
      !network.checked || evidence.networkVerified === true,
      (!alpine.checked && image.value !== 'alpine-iso') || (evidence.alpine?.release === '3.24.1' && evidence.alpine?.restoredRelease === '3.24.1'
        && evidence.alpine?.packageManager.startsWith('apk-tools ')
        && evidence.alpine?.packageManager === evidence.alpine?.restoredPackageManager),
      image.value !== 'alpine-iso' || (evidence.kernel.startsWith('Linux version 6.18.35-0-virt ')
        && evidence.bootArtifacts?.length === 6 && evidence.checkpoint?.digestVerified === true),
    ];
    result.textContent = JSON.stringify({ ...evidence, pageTicks, maxPageTickGapMs: Math.round(maxPageTickGapMs), visibility, userAgent: navigator.userAgent }, null, 2);
    status.textContent = checks.every(Boolean)
      ? (network.checked ? '本地 Linux 与受控联网验证通过；正式产品集成尚未验收。' : '本地 Linux 验证通过；联网与正式产品集成尚未验收。')
      : '验证失败：结果不符合预期。';
  } catch (error) {
    status.textContent = error?.name === 'AbortError' ? '验证已取消，Linux Worker 已终止。' : '验证失败，未标记为可用。';
    result.textContent = JSON.stringify({ error: error instanceof Error ? error.message : String(error), phases: [...phases.values()], pageTicks, maxPageTickGapMs: Math.round(maxPageTickGapMs), visibility }, null, 2);
  } finally {
    button.disabled = false;
    terminalStart.disabled = false;
    cancel.disabled = true;
    image.disabled = false;
    syncOptions();
    controller = undefined;
    clearInterval(heartbeat);
    document.removeEventListener('visibilitychange', visibilityChanged);
  }
});

const terminalStop = document.querySelector('#terminal-stop');
const terminalStatus = document.querySelector('#terminal-status');
const terminalOutput = document.querySelector('#terminal-output');
const terminalInput = document.querySelector('#terminal-input');
const terminalSend = document.querySelector('#terminal-send');
const terminalInterrupt = document.querySelector('#terminal-interrupt');
let terminal;
let sending = false;
function terminalControls() {
  const active = terminal && terminal.state !== 'closed';
  const ready = active && terminal.state === 'ready';
  terminalStart.disabled = Boolean(active || controller);
  terminalStop.disabled = !active;
  terminalInput.disabled = !ready;
  terminalSend.disabled = !ready || sending;
  terminalInterrupt.disabled = !ready || sending;
  button.disabled = Boolean(active || controller);
}
terminalStart.addEventListener('click', async () => {
  if (terminalStart.disabled) return;
  terminalOutput.value = '';
  terminalInput.value = '';
  terminalStatus.textContent = '正在验证资源并启动完整 Alpine…';
  const connection = connectTerminal({
    onOutput: text => {
      const combined = terminalOutput.value + text;
      terminalOutput.value = combined.length > 65_536
        ? '[较早输出已从显示中移除 / earlier output removed]\n' + combined.slice(-65_000) : combined;
      terminalOutput.scrollTop = terminalOutput.scrollHeight;
    },
    onClosed: error => {
      terminalStatus.textContent = error.message === 'Terminal closed'
        ? '交互 Linux 已停止，未保存的内容已丢弃。' : `交互 Linux 已终止：${error.message}`;
      terminalControls();
    },
  });
  terminal = connection;
  terminalControls();
  try {
    await connection.ready;
    terminalStatus.textContent = '离线 Linux 已就绪，可输入真实命令。';
    terminalControls();
    terminalInput.focus();
  } catch { terminalControls(); }
});
terminalStop.addEventListener('click', () => terminal?.close());
window.addEventListener('pagehide', () => terminal?.close());
document.querySelector('#terminal-clear').addEventListener('click', () => { terminalOutput.value = ''; });
async function sendInput(interrupt = false) {
  if (!terminal || terminal.state !== 'ready' || sending) return;
  const text = interrupt ? '\x03' : terminalInput.value;
  if (!text.length) return;
  const submitted = !interrupt && !text.endsWith('\n') ? text + '\n' : text;
  const connection = terminal;
  sending = true;
  terminalControls();
  try {
    await connection.write(submitted);
    if (!interrupt && terminalInput.value === text) terminalInput.value = '';
    if (connection.state === 'ready') terminalStatus.textContent = '输入已交给 Linux；请从输出判断执行结果。';
  } catch (error) {
    if (connection.state !== 'closed') terminalStatus.textContent = `输入未发送：${error.message}`;
  } finally { sending = false; terminalControls(); }
}
terminalSend.addEventListener('click', () => void sendInput());
terminalInterrupt.addEventListener('click', () => void sendInput(true));
