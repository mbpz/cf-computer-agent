import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { EnvironmentMetadata, EnvironmentType } from '../../../shared/environments';
import type { SessionSnapshot } from '../../contracts/api';
import { DataTable } from '../../components/data-table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/motion/input';
import { AppliedFilters } from '../../components/ui/applied-filters';
import { FilterSelect } from '../../components/ui/filter-select';
import { PageHeader } from '../../components/ui/page-header';
import { Select as MotionSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/motion/select';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog';
import { frontendText, type LocaleRuntime } from '../../lib/i18n';
import { useCreateDraft } from '../../lib/use-create-draft';
import { routeAccessAllowed } from '../../lib/route-access';
import { useAccountNetworkOwner } from './account-network-boundary';
import { EnvironmentVmProvider, useEnvironmentVm } from './environment-vm-provider';
import { EnvironmentFiles } from './environment-files-surface';
import { EnvironmentRenameDialog } from './environment-rename-dialog';
import { getEnvironmentManager, type EnvironmentManager } from './environment-manager';
import { blankEnvironmentCreate, discardBlockedEnvironmentDraft, environmentCreateIsBlank, loadEnvironmentDraft, persistEnvironmentDraft, type EnvironmentCreateFields, type EnvironmentRenameFields } from './environment-draft';
import { WORKSPACE_LOCATION_CHANGE_EVENT } from '../../lib/workspace-location';
import type { SupportedPageSize } from '../../lib/numbered-page';

export function EnvironmentsPage({locale,session}: {locale:LocaleRuntime;session:SessionSnapshot}) {
  if (!routeAccessAllowed(session,{capability:null,requiredPermission:'workspace.vm'})) return <p data-environments-forbidden role="alert">{frontendText(locale,'ENV_FORBIDDEN')}</p>;
  return <AccountEnvironments locale={locale} />;
}
function AccountEnvironments({locale}:{locale:LocaleRuntime}) {
  const owner=useAccountNetworkOwner();
  const [manager,setManager]=useState<EnvironmentManager | null>(null);
  useEffect(()=>{const next=getEnvironmentManager(owner);setManager(next);if(!owner.signal.aborted)void next.load();},[owner]);
  return manager ? <EnvironmentVmProvider><EnvironmentView manager={manager} locale={locale} /></EnvironmentVmProvider> : <section className="mx-auto flex max-w-5xl flex-col space-y-6 lg:h-full lg:min-h-0"><PageHeader title={frontendText(locale,'NAV_ENVIRONMENTS')} description={frontendText(locale,'ENV_METADATA_ONLY')} /><p aria-busy="true">{frontendText(locale,'ENV_LOADING')}</p></section>;
}
/** The runtime object exists independently of any environment being started, so
 * its state is reported once for the page instead of per row. */
function EnvironmentRuntimeNotice({locale}:{locale:LocaleRuntime}) {
  const vm=useEnvironmentVm();
  const t=(key:string)=>frontendText(locale,key);
  if(vm.status==='preparing')return <div data-environments-runtime="preparing" aria-busy="true" className="rounded-md border p-4"><p>{t('ENV_RUNTIME_PREPARING')}</p></div>;
  if(vm.status==='unavailable')return <div data-environments-runtime="unavailable" data-environments-runtime-unavailable role="alert" className="rounded-md border p-4"><p>{t('ENV_RUNTIME_UNAVAILABLE')}</p></div>;
  return <div data-environments-runtime="ready" className="rounded-md border p-4"><p>{t('ENV_RUNTIME_READY')}</p></div>;
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
  // The selected environment only drives the file surface; it never starts a VM.
  const [selected,setSelected]=useState<EnvironmentMetadata|null>(null);
  const [localError,setLocalError]=useState(false);
  // A blocked composer record cannot be discarded from a hidden surface, so its
  // dialog starts open exactly like the pending-write recovery entry point.
  const [createOpen,setCreateOpen]=useState(()=>composer.kind==='blocked');
  const blocked=operationBlocked() || draft.confirming;
  // The manager still replaces one server page per `load(page)`; the surface keeps
  // every page it has read so `onLoadMore` appends instead of swapping the list.
  const [pages,setPages]=useState<readonly {page:number;items:readonly EnvironmentMetadata[]}[]>([]);
  const loadedFilter=useRef(state.filter);
  useEffect(()=>{
    if(loadedFilter.current===state.filter)return;
    loadedFilter.current=state.filter;
    setPages([]);
  },[state.filter]);
  useEffect(()=>{
    // A failed or blocked read rewrites `items` to [] from the same snapshot, so it
    // is only ever appended once it has settled cleanly for its own page. A settled
    // empty window is instead proof of absence: the rows the cache still holds for
    // that page and every page after it are gone from the server, so a confirmed
    // delete evicts them rather than leaving the deleted row on screen while the
    // pagination already reports nothing left to read.
    if(state.loading || state.closed || state.error)return;
    const page=state.pagination.page;
    setPages(current=>{
      if(state.items.length===0){
        const kept=current.filter(entry=>entry.page<page);
        return kept.length===current.length?current:kept;
      }
      if(current.some(entry=>entry.page===page && entry.items===state.items))return current;
      return [...current.filter(entry=>entry.page<page),{page,items:state.items}].sort((a,b)=>a.page-b.page);
    });
  },[state.loading,state.closed,state.error,state.items,state.pagination.page]);
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
  const loadMore=()=>{if(state.writing)return;const next=state.pagination.page+1;if(next>500)return;void run(()=>manager.load(next));};
  // The manager reads one page at a time, so a desktop page change replaces the
  // window while the mobile feed keeps appending rows up to the same 500-page cap.
  const goToPage=(page:number)=>{if(state.writing || !Number.isSafeInteger(page) || page<1 || page>500 || page===state.pagination.page)return;setPages([]);void run(()=>manager.load(page,state.filter,state.pagination.pageSize));};
  const changePageSize=(pageSize:SupportedPageSize)=>{if(state.writing || pageSize===state.pagination.pageSize)return;setPages([]);void run(()=>manager.load(1,state.filter,pageSize));};
  const rows=pages.flatMap(entry=>entry.items);
  // A row that left the loaded pages keeps its last verified identity rather than
  // silently retargeting another environment.
  const selectedRow=selected ? rows.find(row=>row.id===selected.id) ?? selected : null;
  if(state.closed)return <section data-environments-page className="mx-auto flex max-w-5xl flex-col space-y-6 lg:h-full lg:min-h-0"><PageHeader title={t('NAV_ENVIRONMENTS')} description={t('ENV_METADATA_ONLY')} /><p data-environments-closed role="alert">{t('ENV_ACCOUNT_CLOSED')}</p></section>;
  return <section data-environments-page className="mx-auto flex max-w-5xl flex-col space-y-6 lg:h-full lg:min-h-0">
    {draft.confirmation}
    <PageHeader title={t('NAV_ENVIRONMENTS')} description={t('ENV_METADATA_ONLY')} actions={<Button type="button" data-environment-create-open aria-haspopup="dialog" aria-expanded={createOpen} disabled={blocked} onClick={()=>{if(alive.current && !operationBlocked() && !draft.isConfirming() && !editRef.current && !removeRef.current)setCreateOpen(true);}}>{t('ENV_CREATE')}</Button>} />
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
    <Dialog open={createOpen} onOpenChange={open=>{if(!open)setCreateOpen(false);}}><DialogContent aria-labelledby="environment-create-title" data-environment-create-dialog className="max-h-[90dvh] overflow-y-auto">
      <DialogTitle id="environment-create-title">{t('ENV_CREATE')}</DialogTitle>
      {recordBlocked && <div role="alert" data-environment-draft-blocked className="mt-3 space-y-2 text-sm"><p>{t('ENV_DRAFT_RECORD_BLOCKED')}</p><Button type="button" variant="outline" onClick={discardRecord}>{t('ENV_DRAFT_RECORD_DISCARD')}</Button></div>}
      {recordNotice && <p role="alert" className="mt-3 text-sm">{recordNotice}</p>}
      <form data-environment-create className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event=>{event.preventDefault();if(!alive.current || operationBlocked() || draft.isConfirming() || editRef.current || removeRef.current)return;const input={...draft.current.current};void run(async()=>{const request=manager.create({...input,type:input.type as EnvironmentType});const pending=manager.getSnapshot().pending;if(pending?.kind==='create'){submitted.current={operationId:pending.operationId,fields:{name:input.name,type:input.type as EnvironmentType,taskId:input.taskId}};if(!recordBlocked)persistEnvironmentDraft(scope.origin,scope.memberId,{create:blank,rename:null});}await request;if(alive.current)setCreateOpen(false);});}}>
        <Input label={t('ENV_NAME')} name="name" required maxLength={120} value={title} disabled={blocked} onChange={value=>draft.edit('name',value)} />
        <div className="flex flex-col gap-1.5"><span className="px-1 text-sm font-medium">{t('ENV_TYPE')}</span><MotionSelect value={type} disabled={blocked} onValueChange={value=>draft.edit('type',value==='temporary'?'temporary':'personal')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="personal">{t('ENV_PERSONAL')}</SelectItem><SelectItem value="temporary">{t('ENV_TEMPORARY')}</SelectItem></SelectContent></MotionSelect></div>
        <Input label={t('ENV_TASK')} name="taskId" maxLength={128} value={taskId} disabled={blocked} onChange={value=>draft.edit('taskId',value)} />
        <div className="flex gap-2 sm:col-span-2 sm:justify-end"><Button type="button" variant="outline" data-environment-create-cancel onClick={()=>setCreateOpen(false)}>{t('ENV_CANCEL')}</Button><Button type="submit" disabled={blocked || !title.trim()}>{t('ENV_CREATE')}</Button></div>
      </form>
    </DialogContent></Dialog>
    <div className="flex flex-wrap items-end gap-3"><FilterSelect label={t('ENV_FILTER')} ariaLabel={t('ENV_FILTER')} value={state.filter} disabled={state.loading || state.writing} onChange={value=>void run(()=>manager.load(1,value as ''|EnvironmentType))} options={[{value:'',label:t('ENV_ALL')},{value:'personal',label:t('ENV_PERSONAL')},{value:'temporary',label:t('ENV_TEMPORARY')}]} /><Button variant="outline" disabled={state.loading || state.writing} onClick={()=>void run(()=>manager.load())}>{t('ENV_REFRESH')}</Button></div>
    <AppliedFilters ariaLabel={t('COMMON_APPLIED_FILTERS')} clearLabel={t('COMMON_CLEAR_FILTERS')} filters={state.filter ? [{id:'type',label:`${t('ENV_FILTER')}: ${t(state.filter==='personal'?'ENV_PERSONAL':'ENV_TEMPORARY')}`,onRemove:()=>void run(()=>manager.load(1,''))}] : []} onClear={()=>void run(()=>manager.load(1,''))} />
    <div aria-busy={state.loading} className="flex flex-col lg:min-h-0 lg:flex-1">
      <DataTable
        locale={locale}
        rows={rows}
        rowId={item=>item.id}
        ariaLabel={t('NAV_ENVIRONMENTS')}
        emptyState={<p>{t('ENV_EMPTY')}</p>}
        loading={state.loading}
        pagination={state.pagination}
        onPageChange={goToPage}
        onPageSizeChange={changePageSize}
        fill
        hasMore={!state.loading && !state.writing && !state.error && state.pagination.page<state.pagination.totalPages && state.pagination.page<500}
        onLoadMore={loadMore}
        rowHeight={88}
        columns={[
          { key:'name', header:t('ENV_NAME'), cellClassName:'whitespace-normal', cell:item=><div data-environment-id={item.id} className="min-w-0"><h2 className="break-words font-medium">{item.name}</h2>{item.taskId && <p className="break-all text-xs">{t('ENV_TASK')}: {item.taskId}</p>}</div> },
          { key:'status', header:t('ENV_TYPE'), width:'40%', cellClassName:'whitespace-normal', cell:item=><span className="text-sm text-muted-foreground">{t(item.type==='personal'?'ENV_PERSONAL':'ENV_TEMPORARY')} · {t('ENV_NOT_RUNNING')}</span> },
          { key:'actions', header:t('ENV_COLUMN_ACTIONS'), align:'right', width:'300px', cell:item=><div className="flex justify-end gap-2"><Button data-environment-files-open variant="outline" onClick={()=>{if(alive.current)setSelected(item);}}>{t('ENV_FILES')}</Button><Button data-environment-rename variant="outline" disabled={blocked} onClick={()=>{if(alive.current && !operationBlocked() && !draft.isConfirming() && !editRef.current && !removeRef.current){editRef.current=item;setEdit(item);}}}>{t('ENV_RENAME')}</Button><Button data-environment-delete variant="destructive" disabled={blocked} onClick={()=>{if(alive.current && !operationBlocked() && !draft.isConfirming() && !editRef.current && !removeRef.current){removeRef.current=item;setRemove(item);}}}>{t('ENV_DELETE')}</Button></div> },
        ]}
      />
    </div>
    <EnvironmentRuntimeNotice locale={locale} />
    {selectedRow && <EnvironmentFiles environment={selectedRow} locale={locale} onClose={()=>setSelected(null)} />}
    {edit && <EnvironmentRenameDialog key={`${edit.id}:${edit.version}`} item={edit} manager={manager} locale={locale} initialName={renameSeed?.environmentId===edit.id?renameSeed.name:undefined} onName={reportRename} onClose={()=>{if(editRef.current===edit){editRef.current=null;setEdit(null);setRenameSeed(null);if(!recordBlocked)persistEnvironmentDraft(scope.origin,scope.memberId,{create:environmentCreateIsBlank(asCreate())?blank:asCreate(),rename:null});}}} />}
    <Dialog open={!!remove} onOpenChange={open=>{if(!open)closeRemove();}}><DialogContent aria-labelledby="environment-delete-title"><DialogTitle id="environment-delete-title">{t('ENV_DELETE')}</DialogTitle><p className="mt-3 break-words">{remove?.name}</p><p className="my-3 text-sm">{t('ENV_DELETE_CONFIRM')}</p><div className="flex gap-2"><Button data-environment-confirm-delete variant="destructive" disabled={blocked} onClick={()=>{const item=removeRef.current;if(!alive.current || !item || operationBlocked() || draft.isConfirming())return;closeRemove();void run(()=>manager.remove(item));if(selected?.id===item.id)setSelected(null);}}>{t('ENV_DELETE')}</Button><Button variant="outline" onClick={closeRemove}>{t('ENV_CANCEL')}</Button></div></DialogContent></Dialog>
  </section>;
}
