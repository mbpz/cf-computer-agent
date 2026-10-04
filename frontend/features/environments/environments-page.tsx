import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { EnvironmentMetadata, EnvironmentType } from '../../../shared/environments';
import type { SessionSnapshot } from '../../contracts/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog';
import { frontendText, type LocaleRuntime } from '../../lib/i18n';
import { useCreateDraft } from '../../lib/use-create-draft';
import { routeAccessAllowed } from '../../lib/route-access';
import { useAccountNetworkOwner } from './account-network-boundary';
import { EnvironmentRenameDialog } from './environment-rename-dialog';
import { getEnvironmentManager, type EnvironmentManager } from './environment-manager';
import { blankEnvironmentCreate, discardBlockedEnvironmentDraft, environmentCreateIsBlank, loadEnvironmentDraft, persistEnvironmentDraft, type EnvironmentCreateFields, type EnvironmentRenameFields } from './environment-draft';
import { WORKSPACE_LOCATION_CHANGE_EVENT } from '../../lib/workspace-location';

export function EnvironmentsPage({locale,session}: {locale:LocaleRuntime;session:SessionSnapshot}) {
  if (!routeAccessAllowed(session,{capability:null,requiredPermission:'workspace.vm'})) return <p data-environments-forbidden role="alert">{frontendText(locale,'ENV_FORBIDDEN')}</p>;
  return <AccountEnvironments locale={locale} />;
}
function AccountEnvironments({locale}:{locale:LocaleRuntime}) {
  const owner=useAccountNetworkOwner();
  const [manager,setManager]=useState<EnvironmentManager | null>(null);
  useEffect(()=>{const next=getEnvironmentManager(owner);setManager(next);if(!owner.signal.aborted)void next.load();},[owner]);
  return manager ? <EnvironmentView manager={manager} locale={locale} /> : <p aria-busy="true">{frontendText(locale,'ENV_LOADING')}</p>;
}
function EnvironmentView({manager,locale}:{manager:EnvironmentManager;locale:LocaleRuntime}) {
  const scope=useAccountNetworkOwner().scope;
  const state=useSyncExternalStore(manager.subscribe,manager.getSnapshot);
  const t=(key:string)=>frontendText(locale,key);
  const blank=blankEnvironmentCreate();
  const [composer]=useState(()=>manager.getSnapshot().pending ? {kind:'empty' as const} : loadEnvironmentDraft(scope.origin,scope.memberId));
  const [recordBlocked,setRecordBlocked]=useState(composer.kind==='blocked');
  const [recordNotice,setRecordNotice]=useState<string>();
  const [renameSeed,setRenameSeed]=useState<EnvironmentRenameFields | null>(composer.kind==='ready' ? composer.draft.rename : null);
  const [renameName,setRenameName]=useState<string | null>(renameSeed?.name ?? null);
  const reportRename=(name:string)=>setRenameName(current=>current===name?current:name);
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const operationBlocked=()=>{const value=manager.getSnapshot();return value.closed || value.writing || value.recoveryBlocked || !!value.pending;};
  const editRef=useRef<EnvironmentMetadata|null>(null),removeRef=useRef<EnvironmentMetadata|null>(null);
  const submitted=useRef<{operationId:string;fields:EnvironmentCreateFields}|null>(null);
  const initialCreate=composer.kind==='ready'?composer.draft.create:blank;
  const draft=useCreateDraft(initialCreate,blank,()=>operationBlocked() || !!removeRef.current,locale,()=>!!editRef.current || !!removeRef.current);
  const {name:title,type,taskId}=draft.fields;
  const [edit,setEdit]=useState<EnvironmentMetadata|null>(null),[remove,setRemove]=useState<EnvironmentMetadata|null>(null);
  const [localError,setLocalError]=useState(false);
  const blocked=operationBlocked() || draft.confirming;
  const asCreate=(): EnvironmentCreateFields => ({name:draft.current.current.name,type:draft.current.current.type==='temporary'?'temporary':'personal',taskId:draft.current.current.taskId});
  const remembered=(): {create: EnvironmentCreateFields; rename: EnvironmentRenameFields | null} => {
    const create=asCreate();
    const rename=edit && renameName!==null && renameName!==edit.name ? {environmentId:edit.id,name:renameName} : !edit && renameSeed ? renameSeed : null;
    return {create: environmentCreateIsBlank(create) ? blank : create, rename};
  };
  useEffect(()=>{
    if(recordBlocked || state.pending || state.closed)return;
    const saved=persistEnvironmentDraft(scope.origin,scope.memberId,remembered());
    setRecordNotice(saved?undefined:frontendText(locale,'ENV_DRAFT_NOT_RECORDED'));
  },[draft.fields.name,draft.fields.type,draft.fields.taskId,renameName,renameSeed,edit,recordBlocked,state.pending,state.closed,scope.origin,scope.memberId,locale]);
  useEffect(()=>{
    const clearOnLeave=()=>{if(!recordBlocked && !manager.getSnapshot().pending){persistEnvironmentDraft(scope.origin,scope.memberId,{create:blank,rename:null});setRenameSeed(null);}};
    window.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT,clearOnLeave);
    return()=>window.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT,clearOnLeave);
  },[recordBlocked,scope.origin,scope.memberId,manager]);
  useEffect(()=>{
    if(!renameSeed || editRef.current || state.pending || state.loading || state.closed)return;
    const item=state.items.find(row=>row.id===renameSeed.environmentId);
    if(!item)return;
    editRef.current=item;setEdit(item);
  },[state.items,state.loading,state.pending,state.closed,renameSeed]);
  const discardRecord=()=>{if(recordBlocked && discardBlockedEnvironmentDraft(scope.origin,scope.memberId)){setRecordBlocked(false);setRecordNotice(undefined);setRenameSeed(null);}};
  useEffect(()=>{
    if(state.closed){editRef.current=null;removeRef.current=null;submitted.current=null;setEdit(null);setRemove(null);draft.checkpoint(blank);draft.reset();return;}
    const intent=submitted.current;
    if(intent && !state.pending && state.confirmed?.kind==='create' && state.confirmed.operationId===intent.operationId){
      // A receipt settles only its own submitted draft, never newer local input.
      if(JSON.stringify(draft.current.current)===JSON.stringify(intent.fields)){draft.checkpoint(blank);draft.reset();}
      submitted.current=null;
    }
  },[state.closed,state.pending,state.confirmed]);
  const closeRemove=()=>{removeRef.current=null;setRemove(null);};
  const run=async(action:()=>Promise<void>)=>{if(!alive.current || draft.isConfirming())return;setLocalError(false);try{await action();}catch{if(alive.current && !manager.getSnapshot().closed)setLocalError(true);}};
  if(state.closed)return <section data-environments-closed role="alert">{t('ENV_ACCOUNT_CLOSED')}</section>;
  return <section data-environments-page className="mx-auto max-w-5xl space-y-6">
    {draft.confirmation}
    <header><h1 className="text-2xl font-semibold">{t('NAV_ENVIRONMENTS')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('ENV_METADATA_ONLY')}</p></header>
    {(state.error || localError) && <div role="alert" className="rounded-md border p-4"><p>{t(localError?'ENV_INVALID_INPUT':`ENV_${state.error}`)}</p></div>}
    {state.recoveryBlocked && <div className="space-y-3 rounded-md border p-4" role="alert">
      <p>{t('ENV_RECOVERY_BLOCKED')}</p>
      <Button data-environment-recheck-recovery disabled={state.writing} onClick={()=>void run(()=>manager.recheckRecovery())}>{t('ENV_RECHECK_RECOVERY')}</Button>
    </div>}
    {state.pending && <div className="space-y-3 rounded-md border p-4" aria-busy={state.writing}>
      <p>{t('ENV_OPERATION_ID')}: <code data-environment-operation-id className="break-all">{state.pending.operationId}</code></p>
      <div className="flex flex-wrap gap-3"><Button data-environment-lookup disabled={state.writing} onClick={()=>void run(()=>manager.lookup())}>{t('ENV_LOOKUP_RESULT')}</Button><Button data-environment-retry variant="outline" disabled={state.writing} onClick={()=>void run(()=>manager.retry())}>{t('ENV_RETRY_WRITE')}</Button></div>
    </div>}
    {state.confirmed && <div data-environment-confirmed-result role="status" className="space-y-2 rounded-md border p-4">
      <p>{t('ENV_CONFIRMED_RESULT')}</p>
      <p>{t('ENV_OPERATION_ID')}: <code className="break-all">{state.confirmed.operationId}</code></p>
      <p>{t(state.confirmed.kind === 'create' ? 'ENV_CREATE' : state.confirmed.kind === 'rename' ? 'ENV_RENAME' : 'ENV_DELETE')} · <code className="break-all">{state.confirmed.environmentId}</code> · {t('ENV_VERSION')} {state.confirmed.version}</p>
      {state.confirmed.name && <p>{t('ENV_NAME')}: {state.confirmed.name}</p>}
      {state.confirmed.deletedAt && <p>{t('ENV_DELETED_AT')}: {state.confirmed.deletedAt}</p>}
    </div>}
    <Card><CardHeader><CardTitle>{t('ENV_CREATE')}</CardTitle></CardHeader><CardContent>
      {recordBlocked && <div role="alert" data-environment-draft-blocked className="mb-3 space-y-2 text-sm"><p>{t('ENV_DRAFT_RECORD_BLOCKED')}</p><Button type="button" variant="outline" onClick={discardRecord}>{t('ENV_DRAFT_RECORD_DISCARD')}</Button></div>}
      {recordNotice && <p role="alert" className="mb-3 text-sm">{recordNotice}</p>}
      <form data-environment-create className="grid gap-3 sm:grid-cols-2" onSubmit={event=>{event.preventDefault();if(!alive.current || operationBlocked() || draft.isConfirming() || editRef.current || removeRef.current)return;const input={...draft.current.current};void run(async()=>{const request=manager.create({...input,type:input.type as EnvironmentType});const pending=manager.getSnapshot().pending;if(pending?.kind==='create'){submitted.current={operationId:pending.operationId,fields:{name:input.name,type:input.type as EnvironmentType,taskId:input.taskId}};if(!recordBlocked)persistEnvironmentDraft(scope.origin,scope.memberId,{create:blank,rename:null});}await request;});}}>
        <label className="space-y-1 text-sm">{t('ENV_NAME')}<Input name="name" required maxLength={120} value={title} disabled={blocked} onChange={event=>draft.edit('name',event.target.value)} /></label>
        <label className="space-y-1 text-sm">{t('ENV_TYPE')}<Select name="type" value={type} disabled={blocked} onChange={event=>draft.edit('type',event.target.value==='temporary'?'temporary':'personal')}><option value="personal">{t('ENV_PERSONAL')}</option><option value="temporary">{t('ENV_TEMPORARY')}</option></Select></label>
        <label className="space-y-1 text-sm">{t('ENV_TASK')}<Input name="taskId" maxLength={128} value={taskId} disabled={blocked} onChange={event=>draft.edit('taskId',event.target.value)} /></label>
        <Button type="submit" className="self-end" disabled={blocked || !title.trim()}>{t('ENV_CREATE')}</Button>
      </form>
    </CardContent></Card>
    <div className="flex flex-wrap items-end gap-3"><label className="text-sm">{t('ENV_FILTER')}<Select aria-label={t('ENV_FILTER')} value={state.filter} disabled={state.loading || state.writing} onChange={event=>void run(()=>manager.load(1,event.target.value as ''|EnvironmentType))}><option value="">{t('ENV_ALL')}</option><option value="personal">{t('ENV_PERSONAL')}</option><option value="temporary">{t('ENV_TEMPORARY')}</option></Select></label><Button variant="outline" disabled={state.loading || state.writing} onClick={()=>void run(()=>manager.load())}>{t('ENV_REFRESH')}</Button></div>
    <div aria-busy={state.loading} aria-live="polite" className="space-y-3">
      {state.loading ? <p>{t('ENV_LOADING')}</p> : state.items.length===0 ? <p>{t('ENV_EMPTY')}</p> : state.items.map(item=><Card key={item.id} data-environment-id={item.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><h2 className="break-words font-medium">{item.name}</h2><p className="text-sm text-muted-foreground">{t(item.type==='personal'?'ENV_PERSONAL':'ENV_TEMPORARY')} · {t('ENV_NOT_RUNNING')}</p>{item.taskId && <p className="break-all text-xs">{t('ENV_TASK')}: {item.taskId}</p>}</div><div className="flex gap-2"><Button data-environment-rename variant="outline" disabled={blocked} onClick={()=>{if(alive.current && !operationBlocked() && !draft.isConfirming() && !editRef.current && !removeRef.current){editRef.current=item;setEdit(item);}}}>{t('ENV_RENAME')}</Button><Button data-environment-delete variant="destructive" disabled={blocked} onClick={()=>{if(alive.current && !operationBlocked() && !draft.isConfirming() && !editRef.current && !removeRef.current){removeRef.current=item;setRemove(item);}}}>{t('ENV_DELETE')}</Button></div></CardContent></Card>)}
    </div>
    <nav aria-label={t('ENV_PAGINATION')} className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={state.loading || state.writing || state.pagination.page<=1} onClick={()=>void run(()=>manager.load(state.pagination.page-1))}>{t('ENV_PREVIOUS')}</Button><span>{t('ENV_PAGE')} {state.pagination.page} / {Math.max(1,state.pagination.totalPages)} · {state.pagination.total}</span><Button variant="outline" disabled={state.loading || state.writing || state.pagination.page>=state.pagination.totalPages || state.pagination.page>=500} onClick={()=>void run(()=>manager.load(state.pagination.page+1))}>{t('ENV_NEXT')}</Button></nav>
    {edit && <EnvironmentRenameDialog key={`${edit.id}:${edit.version}`} item={edit} manager={manager} locale={locale} initialName={renameSeed?.environmentId===edit.id?renameSeed.name:undefined} onName={reportRename} onClose={()=>{if(editRef.current===edit){editRef.current=null;setEdit(null);setRenameSeed(null);if(!recordBlocked)persistEnvironmentDraft(scope.origin,scope.memberId,{create:environmentCreateIsBlank(asCreate())?blank:asCreate(),rename:null});}}} />}
    <Dialog open={!!remove} onOpenChange={open=>{if(!open)closeRemove();}}><DialogContent aria-labelledby="environment-delete-title"><DialogTitle id="environment-delete-title">{t('ENV_DELETE')}</DialogTitle><p className="mt-3 break-words">{remove?.name}</p><p className="my-3 text-sm">{t('ENV_DELETE_CONFIRM')}</p><div className="flex gap-2"><Button data-environment-confirm-delete variant="destructive" disabled={blocked} onClick={()=>{const item=removeRef.current;if(!alive.current || !item || operationBlocked() || draft.isConfirming())return;closeRemove();void run(()=>manager.remove(item));}}>{t('ENV_DELETE')}</Button><Button variant="outline" onClick={closeRemove}>{t('ENV_CANCEL')}</Button></div></DialogContent></Dialog>
  </section>;
}
