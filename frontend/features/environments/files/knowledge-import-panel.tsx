import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
import type { KnowledgeImport } from './knowledge-import';

export function KnowledgeImportPanel({model,locale='en'}:{model:KnowledgeImport;locale?:'en'|'zh-CN'}) {
  const state=useSyncExternalStore(model.subscribe,model.getSnapshot);
  const [title,setTitle]=useState(''),[space,setSpace]=useState('default');
  const [visibility,setVisibility]=useState<'shared'|'admin_only'>('shared'),[ack,setAck]=useState(false);
  useEffect(()=>{setTitle(state.preview?.draft.title??'');setSpace('default');setVisibility('shared');setAck(false);},[state.preview]);
  const t=(en:string,cn:string)=>locale==='zh-CN'?cn:en;
  if(state.kind==='idle')return null;
  const editable=state.kind==='preview';
  const busy=state.kind==='reading'||state.kind==='sending';
  return <section className="space-y-3 rounded border p-3" aria-label={t('Submit selected file for review','提交所选文件审核')} aria-busy={busy}>
    <h3>{t('Submit selected file for review — not publication','提交所选文件审核，不会直接发布')}</h3>
    {busy&&<p role="status">{t('Waiting for receipt…','等待回执…')}</p>}
    {state.preview&&<>
      <p>{state.preview.path} · {state.preview.bytes} {t('bytes; frozen snapshot, not subsequent VM changes.','字节；提交此快照，不包含后续 VM 修改。')}</p>
      <pre data-import-preview className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2" tabIndex={0}>{state.preview.draft.content}</pre>
      <label className="block">{t('Title','标题')}<Input data-import-title value={title} maxLength={200} disabled={!editable} onChange={e=>setTitle(e.target.value)}/></label>
      <label className="block">{t('Requested space ID (server checks access)','目标空间 ID（服务端校验权限）')}<Input data-import-space value={space} maxLength={200} disabled={!editable} onChange={e=>setSpace(e.target.value)}/></label>
      <label className="block">{t('Requested visibility; still subject to review','申请可见范围，仍需审核')}<Select value={visibility} disabled={!editable} onChange={e=>setVisibility(e.target.value as 'shared'|'admin_only')}><option value="shared">{t('Shared','共享')}</option><option value="admin_only">{t('Administrators only','仅管理员')}</option></Select></label>
      <label className="flex items-start gap-2"><input data-import-ack type="checkbox" checked={ack} disabled={!editable} onChange={e=>setAck(e.target.checked)}/>{t('I reviewed the exact content, space and visibility; it contains no credentials or secrets. Only this file will be submitted.','我已检查以上完整内容、空间和可见范围，确认不含凭证或密钥。仅提交此文件。')}</label>
      {editable&&<Button data-import-confirm disabled={!ack||!title.trim()||!space.trim()} onClick={()=>void model.confirm({title,target:{requestedSpaceId:space,requestedCollectionId:null,requestedVisibility:visibility},acknowledged:ack})}>{t('Confirm submission for review','确认提交审核')}</Button>}
    </>}
    {state.error&&<p role="alert">{state.error==='IMPORT_OUTCOME_UNKNOWN'?t('Outcome unknown. Check My submissions, or explicitly retry the same key and original payload. Closing the session clears this recovery state, not any server submission.','结果未知。请检查“我的提交”，或明确使用原幂等键和原内容重试。关闭会话会清除本地恢复状态，不会撤销服务端提交。'):state.error==='IMPORT_TYPE_UNSUPPORTED'?t('This format needs the asset upload/parse workflow; it is not enabled in VM import yet.','此格式需要资产上传/解析流程，尚未接入 VM 导入。'):t('Cannot submit. Check the file type, size, sensitive content and confirmation fields.','无法提交。请检查文件类型、大小、敏感内容和确认信息。')}</p>}
    {state.kind==='unknown'&&<Button data-import-retry onClick={()=>void model.retry()}>{t('Retry original submission','重试原提交')}</Button>}
    {state.kind==='submitted'&&<p role="status">{t('Submission record received; inspect its review status:','已收到提交记录，请查看审核状态：')} {state.receipt?.id}</p>}
    {(state.kind==='unknown'||state.kind==='submitted')&&<a href="/my-submissions" className="underline">{t('My submissions','我的提交')}</a>}
    {!busy&&state.kind!=='unknown'&&<Button onClick={()=>model.close()}>{t('Close','关闭')}</Button>}
  </section>;
}
