import type { AccountVmRuntime } from '../account-vm-runtime.mjs';
import type { Fetcher } from '../../../lib/api';
import { createSubmission, validateSubmissionTarget, type SubmissionTarget } from '../../../lib/submission-data';
import { createIdempotencyKey, type SubmissionDraft } from '../../../components/submissions/submission-form-model';

export type ImportPreview = Readonly<{path: string; bytes: number; version: string; draft: Readonly<SubmissionDraft>}>;
export type ImportState = Readonly<{kind: 'idle'|'reading'|'preview'|'sending'|'unknown'|'submitted'|'error'; preview?: ImportPreview; error?: string; receipt?: {id: string};}>;
type Confirmation = {title: string; target: SubmissionTarget; acknowledged: boolean};
const modes: Record<string, SubmissionDraft['mode']> = {txt:'text',csv:'text',md:'markdown',markdown:'markdown',json:'code',yaml:'code',yml:'code',js:'code',ts:'code',tsx:'code',jsx:'code',py:'code',sh:'code',css:'code',html:'code',svg:'code',xml:'code'};
const bytes = (text: string) => new TextEncoder().encode(text).length;
function selectedMode(path: string) {
  if (typeof path !== 'string' || !path.startsWith('/') || bytes(path)>2048 || /[\\\x00-\x1f\x7f]/u.test(path)) throw Error('IMPORT_PATH_INVALID');
  const parts=path.slice(1).split('/');
  if(parts.some(part=>!part || part.startsWith('.') || /^(?:id_(?:rsa|dsa|ecdsa|ed25519)|credentials?|secrets?|private[-_]key)(?:[._-]|$)/iu.test(part))) throw Error('IMPORT_SENSITIVE_PATH');
  const name=parts.at(-1)!;
  const extension=name.split('.').at(-1)!.toLowerCase();
  if(!Object.hasOwn(modes,extension)) throw Error('IMPORT_TYPE_UNSUPPORTED');
  const mode=modes[extension]!;
  return {name,mode};
}
/** Explicit, volatile import. Never walks the environment, executes markup, or persists bytes.
 * The runtime is account-owned; owner changes abort requests and invalidate receipts.
 * Unknown POST outcomes lock the original intent until explicit retry/session disposal.
 */
export function createKnowledgeImport({runtime,requester=fetch}: {runtime: AccountVmRuntime; requester?: Fetcher}) {
  let state: ImportState=Object.freeze({kind:'idle'}), disposed=false, generation=0;
  let active: AbortController|undefined;
  let identity=runtime.getSnapshot().environmentId, status=runtime.getSnapshot().status;
  let intent: {key:string;draft:SubmissionDraft;target:SubmissionTarget}|undefined;
  const listeners=new Set<()=>void>();
  const emit=(next:ImportState)=>{state=Object.freeze(next);for(const fn of listeners)fn();};
  const running=()=>!disposed&&runtime.getSnapshot().status==='running';
  const live=(epoch:number,controller:AbortController)=>running()&&generation===epoch&&!controller.signal.aborted;
  const unsubscribe=runtime.subscribe(()=>{
    const next=runtime.getSnapshot();if(next.environmentId===identity&&next.status===status)return;
    identity=next.environmentId;status=next.status;generation++;active?.abort();active=undefined;intent=undefined;emit({kind:'idle'});
  });
  async function send(){
    if(!intent||!running()||active)return;
    const original=intent,epoch=generation,controller=new AbortController();active=controller;
    emit({...state,kind:'sending',error:undefined});
    try {
      const receipt=await createSubmission(original.draft,original.key,requester,controller.signal,original.target);
      if(live(epoch,controller))emit({kind:'submitted',receipt:Object.freeze({id:receipt.id})});
    } catch {
      // An error/abort is not proof that the server did not create a submission.
      if(live(epoch,controller))emit({...state,kind:'unknown',error:'IMPORT_OUTCOME_UNKNOWN'});
    } finally {if(active===controller)active=undefined;}
  }
  return {
    getSnapshot:()=>state,subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
    async select(path:string){
      if(!running()||active||intent)return;
      const epoch=generation,controller=new AbortController();active=controller;emit({kind:'reading'});
      try {
        const {name,mode}=selectedMode(path);
        const result=await runtime.file({op:'readSubmissionText',path});
        if(!live(epoch,controller))return;
        if(!('text' in result)||typeof result.text!=='string'||!('version' in result)||typeof result.version!=='string'||!result.version)throw Error('IMPORT_FILE_INVALID');
        const size=bytes(result.text);
        if(!size||size>131072)throw Error('IMPORT_SIZE_INVALID');
        if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(result.text))throw Error('IMPORT_BINARY_CONTENT');
        if(/-----BEGIN (?:[A-Z0-9 ]*PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----/u.test(result.text))throw Error('IMPORT_PRIVATE_KEY');
        const preview=Object.freeze({path,bytes:size,version:result.version,draft:Object.freeze({mode,title:name,content:result.text})});
        emit({kind:'preview',preview});
      } catch(error){if(live(epoch,controller))emit({kind:'error',error:error instanceof Error&&/^IMPORT_[A-Z_]+$/u.test(error.message)?error.message:'IMPORT_READ_FAILED'});}
      finally {if(active===controller)active=undefined;}
    },
    async confirm(value:Confirmation){
      if(!running()||active||intent||state.kind!=='preview'||!state.preview)return;
      try {
        if(value.acknowledged!==true||typeof value.title!=='string'||!value.title.trim()||value.title.trim().length>200)throw Error('IMPORT_CONFIRMATION_REQUIRED');
        const target=Object.freeze(validateSubmissionTarget(value.target));
        intent={key:createIdempotencyKey(),draft:Object.freeze({...state.preview.draft,title:value.title.trim()}),target};
      } catch {emit({...state,error:'IMPORT_CONFIRMATION_REQUIRED'});return;}
      await send();
    },
    async retry(){if(state.kind==='unknown')await send();},
    close(){if(disposed||active||state.kind==='unknown')return;intent=undefined;emit({kind:'idle'});},
    dispose(){disposed=true;generation++;active?.abort();active=undefined;intent=undefined;unsubscribe();state=Object.freeze({kind:'idle'});listeners.clear();},
  };
}
export type KnowledgeImport = ReturnType<typeof createKnowledgeImport>;
