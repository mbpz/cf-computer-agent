import { useEffect, useState, useSyncExternalStore } from 'react';
import type { EnvironmentMetadata, EnvironmentType } from '../../../shared/environments';
import type { SessionSnapshot } from '../../contracts/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog';
import { frontendText, type LocaleRuntime } from '../../lib/i18n';
import { routeAccessAllowed } from '../../lib/route-access';
import { useAccountNetworkOwner } from './account-network-boundary';
import { getEnvironmentManager, type EnvironmentManager } from './environment-manager';

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
  const state=useSyncExternalStore(manager.subscribe,manager.getSnapshot);
  const t=(key:string)=>frontendText(locale,key);
  const [title,setTitle]=useState(''),[type,setType]=useState<EnvironmentType>('personal'),[taskId,setTaskId]=useState('');
  const [edit,setEdit]=useState<{item:EnvironmentMetadata;name:string}|null>(null),[remove,setRemove]=useState<EnvironmentMetadata|null>(null);
  const [localError,setLocalError]=useState(false);
  const blocked=state.closed || state.writing || state.recoveryBlocked || !!state.pending;
  useEffect(()=>{if(state.closed){setEdit(null);setRemove(null);setTitle('');setTaskId('');}},[state.closed]);
  const run=async(action:()=>Promise<void>,after?:()=>void)=>{setLocalError(false);try{await action();if(!manager.getSnapshot().pending && !manager.getSnapshot().error)after?.();}catch{setLocalError(true);}};
  if(state.closed)return <section data-environments-closed role="alert">{t('ENV_ACCOUNT_CLOSED')}</section>;
  return <section data-environments-page className="mx-auto max-w-5xl space-y-6">
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
      <form data-environment-create className="grid gap-3 sm:grid-cols-2" onSubmit={event=>{event.preventDefault();void run(()=>manager.create({name:title,type,taskId}),()=>{setTitle('');setTaskId('');});}}>
        <label className="space-y-1 text-sm">{t('ENV_NAME')}<Input name="name" required maxLength={120} value={title} disabled={blocked} onChange={event=>setTitle(event.target.value)} /></label>
        <label className="space-y-1 text-sm">{t('ENV_TYPE')}<Select name="type" value={type} disabled={blocked} onChange={event=>setType(event.target.value as EnvironmentType)}><option value="personal">{t('ENV_PERSONAL')}</option><option value="temporary">{t('ENV_TEMPORARY')}</option></Select></label>
        <label className="space-y-1 text-sm">{t('ENV_TASK')}<Input name="taskId" maxLength={128} value={taskId} disabled={blocked} onChange={event=>setTaskId(event.target.value)} /></label>
        <Button type="submit" className="self-end" disabled={blocked || !title.trim()}>{t('ENV_CREATE')}</Button>
      </form>
    </CardContent></Card>
    <div className="flex flex-wrap items-end gap-3"><label className="text-sm">{t('ENV_FILTER')}<Select aria-label={t('ENV_FILTER')} value={state.filter} disabled={state.loading || state.writing} onChange={event=>void run(()=>manager.load(1,event.target.value as ''|EnvironmentType))}><option value="">{t('ENV_ALL')}</option><option value="personal">{t('ENV_PERSONAL')}</option><option value="temporary">{t('ENV_TEMPORARY')}</option></Select></label><Button variant="outline" disabled={state.loading || state.writing} onClick={()=>void run(()=>manager.load())}>{t('ENV_REFRESH')}</Button></div>
    <div aria-busy={state.loading} aria-live="polite" className="space-y-3">
      {state.loading ? <p>{t('ENV_LOADING')}</p> : state.items.length===0 ? <p>{t('ENV_EMPTY')}</p> : state.items.map(item=><Card key={item.id} data-environment-id={item.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><h2 className="break-words font-medium">{item.name}</h2><p className="text-sm text-muted-foreground">{t(item.type==='personal'?'ENV_PERSONAL':'ENV_TEMPORARY')} · {t('ENV_NOT_RUNNING')}</p>{item.taskId && <p className="break-all text-xs">{t('ENV_TASK')}: {item.taskId}</p>}</div><div className="flex gap-2"><Button data-environment-rename variant="outline" disabled={blocked} onClick={()=>setEdit({item,name:item.name})}>{t('ENV_RENAME')}</Button><Button data-environment-delete variant="destructive" disabled={blocked} onClick={()=>setRemove(item)}>{t('ENV_DELETE')}</Button></div></CardContent></Card>)}
    </div>
    <nav aria-label={t('ENV_PAGINATION')} className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={state.loading || state.writing || state.pagination.page<=1} onClick={()=>void run(()=>manager.load(state.pagination.page-1))}>{t('ENV_PREVIOUS')}</Button><span>{t('ENV_PAGE')} {state.pagination.page} / {Math.max(1,state.pagination.totalPages)} · {state.pagination.total}</span><Button variant="outline" disabled={state.loading || state.writing || state.pagination.page>=state.pagination.totalPages || state.pagination.page>=500} onClick={()=>void run(()=>manager.load(state.pagination.page+1))}>{t('ENV_NEXT')}</Button></nav>
    <Dialog open={!!edit} onOpenChange={open=>{if(!open)setEdit(null);}}><DialogContent aria-labelledby="environment-rename-title"><DialogTitle id="environment-rename-title">{t('ENV_RENAME')}</DialogTitle>{edit && <form className="mt-3 space-y-3" onSubmit={event=>{event.preventDefault();const value=edit;setEdit(null);void run(()=>manager.rename(value.item,value.name));}}><label>{t('ENV_NAME')}<Input required maxLength={120} value={edit.name} onChange={event=>setEdit({...edit,name:event.target.value})} /></label><div className="flex gap-2"><Button type="submit" disabled={blocked || !edit.name.trim()}>{t('ENV_SAVE')}</Button><Button type="button" variant="outline" onClick={()=>setEdit(null)}>{t('ENV_CANCEL')}</Button></div></form>}</DialogContent></Dialog>
    <Dialog open={!!remove} onOpenChange={open=>{if(!open)setRemove(null);}}><DialogContent aria-labelledby="environment-delete-title"><DialogTitle id="environment-delete-title">{t('ENV_DELETE')}</DialogTitle><p className="mt-3 break-words">{remove?.name}</p><p className="my-3 text-sm">{t('ENV_DELETE_CONFIRM')}</p><div className="flex gap-2"><Button data-environment-confirm-delete variant="destructive" disabled={blocked} onClick={()=>{const item=remove;setRemove(null);if(item)void run(()=>manager.remove(item));}}>{t('ENV_DELETE')}</Button><Button variant="outline" onClick={()=>setRemove(null)}>{t('ENV_CANCEL')}</Button></div></DialogContent></Dialog>
  </section>;
}
