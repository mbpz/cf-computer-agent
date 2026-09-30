import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
import { Dialog, DialogContent, DialogTitle } from '../../../components/ui/dialog';
import type { AccountVmRuntime } from '../account-vm-runtime.mjs';
import { createFileManager, type FileManager } from './file-manager.mjs';

type Props = { runtime: AccountVmRuntime; locale?: 'en' | 'zh-CN'; onDownload?: (name: string, bytes: Uint8Array) => void };
/** Shared with the isolated acceptance harness; mounting never starts a VM or network. */
export function FilesPanel({ runtime, ...props }: Props) {
  const [binding, setBinding] = useState<{runtime: AccountVmRuntime; manager: FileManager} | null>(null);
  useEffect(() => { const value = createFileManager(runtime); setBinding({runtime, manager:value}); return () => value.dispose(); }, [runtime]);
  return binding?.runtime === runtime ? <FileView manager={binding.manager} {...props} /> : null;
}
function FileView({ manager, locale = 'en', onDownload }: Omit<Props, 'runtime'> & { manager: FileManager }) {
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  const [modal, setModal] = useState<{ action: 'mkdir' | 'rename' | 'remove'; name: string; epoch: number } | null>(null);
  const [name, setName] = useState('');
  const [saveName, setSaveName] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const [prepared, setPrepared] = useState<{url: string; name: string; bytes: number; epoch: number} | null>(null);
  const titleId = useId();
  const zh = locale === 'zh-CN';
  const t = (en: string, cn: string) => zh ? cn : en;
  const clearUrls = () => { for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear(); };
  useEffect(() => { setModal(null); setName(''); setSaveName(''); if (upload.current) upload.current.value = ''; clearUrls(); setPrepared(null); if (state.available) void manager.load(); }, [manager, state.available, state.epoch]);
  useEffect(() => clearUrls, []);
  const receive = (filename: string, bytes: Uint8Array) => {
    if (onDownload) return onDownload(filename, bytes);
    clearUrls();
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }));
    urls.current.add(url); setPrepared({url, name: filename, bytes: bytes.byteLength, epoch: state.epoch});
  };
  const blocked = state.busy || !!state.editor;
  const openModal = (action: 'mkdir' | 'rename' | 'remove', filename = '') => { setName(action === 'rename' ? filename : ''); setModal({ action, name: filename, epoch: state.epoch }); };
  const confirm = () => { if (!modal || modal.epoch !== state.epoch) return; const { action, name: original } = modal; setModal(null); if (action === 'mkdir') void manager.mkdir(name); else if (action === 'rename') void manager.rename(original, name); else void manager.remove(original); setName(''); };
  const messages: Record<string, string> = {
    FILE_CONFLICT: t('The guest changed this file. Keep your draft: reload explicitly or save a new copy.', '虚拟机已更改此文件。草稿已保留：请明确重新加载，或另存为新文件。'),
    WRITE_DONE: t('Write confirmed.', '写入已确认。'), WRITE_DONE_CANCELLED: t('Write confirmed before cancellation; not rolled back.', '取消前的写入已确认，不会回滚。'),
    WRITE_DONE_REFRESH_FAILED: t('Write confirmed; refresh failed. Refresh the list, do not repeat the write.', '写入已确认，但刷新失败。请刷新列表，不要重复写入。'),
    CANCEL_REQUESTED: t('Cancelling unsent work; waiting for the current receipt.', '停止尚未发送的操作，等待当前回执。'),
    BATCH_DONE: t('Batch finished. Check each file result.', '批量操作已结束，请检查逐项结果。'), BATCH_CANCELLED: t('Unsent files cancelled; confirmed writes are retained.', '未发送的文件已取消，已确认的写入保留。'),
  };
  if (!state.available) return <section className="vm-files rounded-lg border p-4"><h2>{t('Shared files', '共享文件')}</h2><p>{t('Start an environment to access its shared files.', '启动环境后可访问其共享文件。')}</p></section>;
  return <section className="vm-files space-y-4 rounded-lg border p-4" aria-label={t('Shared files', '共享文件')}>
    <header><h2 className="text-lg font-semibold">{t('Shared files', '共享文件')}</h2><p className="text-sm text-muted-foreground">/mnt/work{state.path === '/' ? '' : state.path}</p></header>
    <p className="text-sm">{t('UTF-8 editor ≤ 1 MiB. Upload and bounded download ≤ 20 MiB per file; up to 100 uploads per batch. Cancellation does not roll back sent operations.', 'UTF-8 文本编辑 ≤ 1 MiB；单文件上传与限额下载 ≤ 20 MiB，每批最多 100 个上传。取消不会回滚已发送的操作。')}</p>
    <div className="flex flex-wrap gap-2">
      <Button disabled={blocked || state.path === '/'} onClick={() => void manager.load(state.path.slice(0, state.path.lastIndexOf('/')) || '/', 1)}>{t('Up', '上一级')}</Button>
      <Button disabled={blocked} onClick={() => void manager.load()}>{t('Refresh', '刷新')}</Button>
      <Button disabled={blocked} onClick={() => openModal('mkdir')}>{t('New folder', '新建文件夹')}</Button>
      <label>{t('Upload files', '上传文件')}<Input ref={upload} type="file" multiple disabled={blocked} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) void manager.upload(files); }} /></label>
      {state.busy && <Button disabled={state.cancelling} onClick={() => manager.cancel()}>{t('Cancel unsent work', '取消未发送操作')}</Button>}
    </div>
    {prepared?.epoch === state.epoch && <p role="status"><a className="underline" href={prepared.url} download={prepared.name}>{t('Save to this device', '保存到本机')} · {prepared.name}</a> ({prepared.bytes} {t('bytes ready', '字节已就绪')})</p>}
    {state.error && <p role="alert">{messages[state.error] || t('Operation failed', '操作失败')} <code>{state.error}</code></p>}
    <p role="status" aria-live="polite">{messages[state.notice] || (state.busy ? t('Working…', '处理中…') : '')}</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>{t('Name', '名称')}</th><th>{t('Type', '类型')}</th><th>{t('Bytes', '字节')}</th><th>{t('Actions', '操作')}</th></tr></thead><tbody>
      {state.entries.map(entry => <tr key={entry.name} data-file-entry><td>{entry.name}</td><td>{entry.type}</td><td>{entry.bytes}</td><td className="flex flex-wrap gap-2">
        {entry.type === 'directory' && <Button disabled={blocked} onClick={() => void manager.load((state.path === '/' ? '' : state.path) + '/' + entry.name, 1)}>{t('Open', '打开')}</Button>}
        {entry.type === 'file' && <><Button data-file-edit disabled={blocked || entry.bytes > 1048576} onClick={() => { setSaveName(''); void manager.open(entry.name); }}>{t('Edit', '编辑')}</Button><Button data-file-download disabled={blocked || entry.bytes > 20971520} onClick={() => void manager.download(entry.name, receive)}>{t('Download', '下载')}</Button></>}
        {['file', 'directory'].includes(entry.type) && <><Button disabled={blocked} onClick={() => openModal('rename', entry.name)}>{t('Rename', '重命名')}</Button><Button data-file-remove variant="destructive" disabled={blocked} onClick={() => openModal('remove', entry.name)}>{t('Remove', '删除')}</Button></>}
      </td></tr>)}
    </tbody></table>{!state.entries.length && <p>{t('No files in this directory.', '目录暂无文件。')}</p>}</div>
    <nav className="flex items-center gap-2" aria-label={t('File pagination', '文件分页')}>
      <Button disabled={blocked || state.page <= 1} onClick={() => void manager.load(state.path, state.page - 1)}>{t('Previous', '上一页')}</Button>
      <span>{state.page} / {state.pages} · {state.total}</span>
      <Button disabled={blocked || state.page >= state.pages} onClick={() => void manager.load(state.path, state.page + 1)}>{t('Next', '下一页')}</Button>
      <Select aria-label={t('Files per page', '每页文件数')} value={state.pageSize} disabled={blocked} onChange={event => void manager.load(state.path, 1, Number(event.target.value) as 20 | 50 | 100)}>{[20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</Select>
    </nav>
    {state.editor && <div className="space-y-2 rounded border p-3"><h3>{state.editor.name}{state.editor.dirty ? ' *' : ''}</h3>
      <Textarea aria-label={t('File contents', '文件内容')} rows={12} maxLength={1048576} value={state.editor.text} disabled={state.busy} onChange={event => manager.edit(event.target.value)} />
      <div className="flex flex-wrap gap-2"><Button data-file-save disabled={state.busy || state.editor.conflict || !state.editor.dirty} onClick={() => void manager.save()}>{t('Save', '保存')}</Button>
        <Button data-file-reload disabled={state.busy} onClick={() => void manager.open(state.editor!.name)}>{t('Reload (discard draft)', '重新加载（丢弃草稿）')}</Button>
        <Button disabled={state.busy} onClick={() => { manager.closeEditor(); setSaveName(''); }}>{t('Discard draft / close', '丢弃草稿 / 关闭')}</Button></div>
      <label>{t('New copy name', '副本新名称')}<Input disabled={state.busy} value={saveName} onChange={event => setSaveName(event.target.value)} /></label>
      <Button data-file-save-as disabled={state.busy || !saveName.trim()} onClick={() => { void manager.saveAs(saveName); setSaveName(''); }}>{t('Save as new file', '另存为新文件')}</Button>
    </div>}
    {!!state.results.length && <ul aria-label={t('Upload results', '上传结果')}>{state.results.map((result, index) => <li key={index}>{result.name} — {result.status} {result.error}</li>)}</ul>}
    <Dialog open={modal?.epoch === state.epoch} onOpenChange={open => { if (!open) { setModal(null); setName(''); } }}><DialogContent aria-labelledby={titleId}>
      <DialogTitle id={titleId}>{modal?.action === 'remove' ? t('Confirm removal', '确认删除') : modal?.action === 'rename' ? t('Rename', '重命名') : t('New folder', '新建文件夹')}</DialogTitle>
      {modal?.action === 'remove' ? <p>{t('Remove this file or empty directory?', '删除此文件或空目录？')} {modal.name}</p> : <label>{t('Name', '名称')}<Input autoFocus value={name} onChange={event => setName(event.target.value)} /></label>}
      <div className="flex gap-2"><Button data-file-confirm disabled={state.busy || (modal?.action !== 'remove' && !name.trim())} onClick={confirm}>{t('Confirm', '确认')}</Button><Button onClick={() => { setModal(null); setName(''); }}>{t('Cancel', '取消')}</Button></div>
    </DialogContent></Dialog>
  </section>;
}
