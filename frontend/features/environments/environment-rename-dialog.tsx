import { useEffect, useRef, useState } from 'react';
import type { EnvironmentMetadata } from '../../../shared/environments';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog';
import { ConfirmAction } from '../../components/ui/confirm-action';
import { frontendText, type LocaleRuntime } from '../../lib/i18n';
import { useCreateDraft } from '../../lib/use-create-draft';
import type { EnvironmentManager } from './environment-manager';

/** The mounted editor owns the original target/version, never a refreshed row. */
export function EnvironmentRenameDialog({item,manager,locale,onClose}:{item:EnvironmentMetadata;manager:EnvironmentManager;locale:LocaleRuntime;onClose:()=>void}) {
  const initial=useRef({name:item.name}),alive=useRef(true),sending=useRef(false);
  const discardRef=useRef<{name:string}|null>(null),[discard,setDiscard]=useState<{name:string}|null>(null);
  const [invalid,setInvalid]=useState(false);
  const t=(key:string)=>frontendText(locale,key);
  const operationBlocked=()=>{const state=manager.getSnapshot();return state.closed || state.writing || state.recoveryBlocked || !!state.pending;};
  const draft=useCreateDraft(initial.current,initial.current,()=>operationBlocked() || sending.current || !!discardRef.current,locale,()=>false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const cancelDiscard=()=>{discardRef.current=null;setDiscard(null);};
  const cancel=()=>{
    if(!alive.current || operationBlocked() || sending.current || discardRef.current || draft.isConfirming())return;
    if(draft.current.current.name === initial.current.name){onClose();return;}
    const snapshot={...draft.current.current};discardRef.current=snapshot;setDiscard(snapshot);
  };
  const confirmDiscard=()=>{
    const snapshot=discardRef.current;
    if(!alive.current || !snapshot || operationBlocked() || sending.current || snapshot.name !== draft.current.current.name)return;
    cancelDiscard();onClose();
  };
  const save=async()=>{
    if(!alive.current || operationBlocked() || sending.current || discardRef.current || draft.isConfirming())return;
    sending.current=true;setInvalid(false);
    try {
      const request=manager.rename(item,draft.current.current.name);
      // Only release the editor once the manager actually owns the frozen intent.
      // Invalid input has no intent and must leave the user's draft visible.
      if(manager.getSnapshot().pending?.kind === 'rename')onClose();
      await request;
    } catch {if(alive.current)setInvalid(true);}
    finally {sending.current=false;}
  };
  return <>
    <Dialog open onOpenChange={open=>{if(!open)cancel();}}><DialogContent aria-labelledby="environment-rename-title">
      <DialogTitle id="environment-rename-title">{t('ENV_RENAME')}</DialogTitle>
      <form className="mt-3 space-y-3" onSubmit={event=>{event.preventDefault();void save();}}>
        <label>{t('ENV_NAME')}<Input required maxLength={120} value={draft.fields.name} disabled={!!discard || draft.confirming || operationBlocked()} onChange={event=>draft.edit('name',event.target.value)} /></label>
        {invalid && <p role="alert">{t('ENV_INVALID_INPUT')}</p>}
        <div className="flex gap-2"><Button type="submit" disabled={!!discard || draft.confirming || operationBlocked() || !draft.fields.name.trim()}>{t('ENV_SAVE')}</Button><Button type="button" variant="outline" onClick={cancel}>{t('ENV_CANCEL')}</Button></div>
      </form>
    </DialogContent></Dialog>
    <ConfirmAction open={!!discard} title={t('CREATE_DISCARD_TITLE')} description={t('CREATE_DISCARD_IMPACT')} cancelLabel={t('TASKS_KEEP_EDITING')} confirmLabel={t('TASKS_DISCARD_CONFIRM')} onCancel={cancelDiscard} onConfirm={confirmDiscard} />
    {draft.confirmation}
  </>;
}
