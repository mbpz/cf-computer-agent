import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
import type { VmAssetImport } from './asset-import';

export function VmAssetImportPanel({model,locale='en'}:{model:VmAssetImport;locale?:'en'|'zh-CN'}) {
  const state=useSyncExternalStore(model.subscribe,model.getSnapshot);
  const [uploadAck,setUploadAck]=useState(false),[reviewAck,setReviewAck]=useState(false);
  const [title,setTitle]=useState(''),[space,setSpace]=useState('default'),[visibility,setVisibility]=useState<'shared'|'admin_only'>('shared');
  const flow=state.flow,review=flow?.intent?.review;
  useEffect(()=>{setUploadAck(false);},[state.selected]);
  useEffect(()=>{setReviewAck(false);setTitle(review?.title??flow?.intent?.file.name??'');setSpace(review?.target?.requestedSpaceId??'default');setVisibility(review?.target?.requestedVisibility??'shared');},[state.parsed,review]);
  const t=(en:string,cn:string)=>locale==='zh-CN'?cn:en;
  if(state.kind==='idle')return null;
  const job=flow?.record?.job.status,busy=state.busy||!!flow?.busy;
  const canUpload=!!state.selected&&(!flow?.intent||['unknown','missing'].includes(flow.kind));
  const editable=!!state.parsed&&!review;
  return <section className="space-y-3 rounded border p-3" aria-label={t('Import selected asset','导入所选资产')} aria-busy={busy}>
    <h3>{t('Selected asset → upload → parse → review (not publication)','所选资产 → 上传 → 解析 → 审核（不会直接发布）')}</h3>
    <p>{t('Only this frozen file is uploaded. No automatic upload or parsing. Closing stops local work, not server processing; pending metadata is retained for this member.','仅上传所选文件快照，不会自动上传或解析。关闭只停止本地操作，不撤销服务端处理；未决元数据按当前成员保留。')}</p>
    {state.selected&&<p className="break-all">{state.selected.path} · {state.selected.file.size} bytes · {state.selected.file.type}<br/>SHA-256: {state.selected.file.sha256}</p>}
    {canUpload&&<>
      <label className="flex gap-2"><input data-vm-asset-upload-ack type="checkbox" checked={uploadAck} disabled={busy} onChange={e=>setUploadAck(e.target.checked)}/>{t('I checked this original file and authorize uploading it; it contains no credentials or secrets. Binary originals are not rendered here.','我已检查原文件，确认不含凭证或密钥，并同意上传。此处不渲染二进制原件。')}</label>
      <Button data-vm-asset-upload disabled={busy||!uploadAck||flow?.error==='storage'} onClick={()=>void model.upload(uploadAck)}>{t('Upload / retry identical file','上传 / 重试同一文件')}</Button>
    </>}
    {flow?.intent&&<div className="space-y-2">
      <p className="break-all">{t('Pending asset','未决资产')}: {flow.intent.file.name} · {flow.intent.file.size} bytes · SHA-256: {flow.intent.file.sha256}</p>
      <p>{t('State','状态')}: {flow.kind} {job}</p>
      <Button disabled={busy} onClick={()=>void model.refresh()}>{t('Read server status (no replay)','回读服务端状态（不重放）')}</Button>
      {(job==='queued'||job==='failed_retryable')&&<>
        <Button data-vm-asset-parse disabled={busy} onClick={()=>void model.parse()}>{t('Start / retry parsing','启动 / 重试解析')}</Button>
        <Button disabled={busy} onClick={()=>void model.cancel()}>{t('Cancel pending server asset','取消服务端待处理资产')}</Button>
      </>}
      {job==='failed_terminal'&&<Button disabled={busy} onClick={()=>void model.releaseFailed()}>{t('Release failed local intent (keeps server asset)','解除失败的本地意图（保留服务端资产）')}</Button>}
      {job==='succeeded'&&!review&&<Button data-vm-asset-preview disabled={busy} onClick={()=>void model.previewParsed()}>{t('Read parsed content for review','读取解析内容供确认')}</Button>}
      {review&&<>
        <p>{t('Original review is locked for retry','重试已锁定原审核内容')}: {review.title} · {review.target?.requestedSpaceId??'default'} / {review.target?.requestedCollectionId??'—'} / {review.target?.requestedVisibility??'shared'}</p>
        <Button data-vm-asset-retry disabled={busy} onClick={()=>void model.retrySubmission()}>{t('Retry original review submission','重试原审核提交')}</Button>
      </>}
    </div>}
    {state.parsed&&<pre data-vm-asset-markdown className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2" tabIndex={0}>{state.parsed.markdown}</pre>}
    {editable&&<>
      <label className="block">{t('Review title','审核标题')}<Input value={title} maxLength={200} disabled={busy} onChange={e=>setTitle(e.target.value)}/></label>
      <label className="block">{t('Requested space ID (server checks access)','目标空间 ID（服务端校验权限）')}<Input data-vm-asset-space value={space} maxLength={200} disabled={busy} onChange={e=>setSpace(e.target.value)}/></label>
      <label className="block">{t('Requested visibility','申请可见范围')}<Select value={visibility} disabled={busy} onChange={e=>setVisibility(e.target.value as 'shared'|'admin_only')}><option value="shared">{t('Shared','共享')}</option><option value="admin_only">{t('Administrators only','仅管理员')}</option></Select></label>
      <label className="flex gap-2"><input data-vm-asset-review-ack type="checkbox" checked={reviewAck} disabled={busy} onChange={e=>setReviewAck(e.target.checked)}/>{t('I reviewed the parsed content and destination; it contains no secrets and may be submitted for review.','我已核对解析内容与目标空间，确认无敏感凭证，同意提交审核。')}</label>
      <Button data-vm-asset-submit disabled={busy||!reviewAck||!title.trim()||!space.trim()} onClick={()=>void model.submit({title,target:{requestedSpaceId:space,requestedCollectionId:null,requestedVisibility:visibility},acknowledged:reviewAck})}>{t('Submit parsed content for review','提交解析内容审核')}</Button>
    </>}
    {(state.error||flow?.error)&&<p role="alert">{state.error==='ASSET_STORAGE_NOT_CONFIGURED'?t('Object storage is disabled. No asset will be uploaded; this cannot fall back to direct publication.','对象存储未启用，不会上传资产，也不会退化为直接发布。'):t('Action not confirmed. Check file limits, permissions and receipt; use readback or explicit retry, never assume a failed request was rolled back.','操作未确认。请检查文件限制、权限和回执，使用回读或明确重试；请求失败不代表服务端已回滚。')} ({state.error??flow?.error})</p>}
    {flow?.kind==='submitted'&&<p role="status">{t('Review submission received','已收到审核提交记录')}: {flow.submissionId}</p>}
    {flow?.kind==='canceled'&&<p role="status">{t('Server cancellation confirmed','服务端已确认取消')}</p>}
    {flow?.kind==='released'&&<p role="status">{t('Local failed intent released; server asset retained','已解除失败的本地意图，服务端资产仍保留')}</p>}
    <a className="underline" href="/my-submissions">{t('My submissions','我的提交')}</a>
    {busy&&<Button data-vm-asset-stop onClick={()=>model.stop()}>{t('Stop waiting (not server cancellation)','停止等待（不撤销服务端操作）')}</Button>}
    <Button disabled={busy} onClick={()=>model.close()}>{t('Close (keep pending recovery metadata)','关闭（保留未决恢复元数据）')}</Button>
  </section>;
}
