import type { AccountVmRuntime } from '../account-vm-runtime.mjs';
import { apiFetch, type Fetcher } from '../../../lib/api';
import { loadAssetAvailability } from '../../../lib/asset-availability';
import { assetUploadModel } from '../../../components/assets/asset-upload-model';
import { assetContentType } from '../../../lib/asset-upload-data';
import { createAssetWorkflow, type AssetWorkflowState } from '../../../lib/asset-upload-workflow';
import { describeAssetFile, type AssetIntent, type AssetIntentStorage } from '../../../lib/asset-upload-intent';
import { validateSubmissionTarget, type SubmissionTarget } from '../../../lib/submission-data';

export type VmAssetState = Readonly<{
  kind: 'idle' | 'reading' | 'preview' | 'workflow' | 'error'; busy: boolean; error?: string;
  selected?: Readonly<{path: string; file: AssetIntent['file']}>;
  flow?: AssetWorkflowState;
  parsed?: Readonly<{assetId: string; markdown: string}>;
}>;
type Confirmation = { title: string; target: SubmissionTarget; acknowledged: boolean };
const size = (value: string) => new TextEncoder().encode(value).length;
const MAX_BYTES = 20 * 1024 * 1024;
function selectedName(path: string) {
  if (typeof path !== 'string' || !path.startsWith('/') || size(path)>2048 || /[\\\x00-\x1f\x7f]/u.test(path)) throw Error('IMPORT_PATH_INVALID');
  const parts=path.slice(1).split('/');
  if(parts.some(part=>!part || part.startsWith('.') || /^(?:id_(?:rsa|dsa|ecdsa|ed25519)|credentials?|secrets?|private[-_]key)(?:[._-]|$)/iu.test(part))) throw Error('IMPORT_SENSITIVE_PATH');
  const name=parts.at(-1)!;
  if(assetUploadModel({enabled:true,file:{name,size:1},maxBytes:MAX_BYTES}).kind!=='idle') throw Error('IMPORT_TYPE_UNSUPPORTED');
  return name;
}
/** Selected bytes are volatile. Only existing member-scoped asset metadata/review intents
 * persist. Every mutation is explicit; re-entry/availability/readback never replays a POST. */
export function createVmAssetImport({runtime,memberId,requester=fetch,storage}: {
  runtime: AccountVmRuntime; memberId: string; requester?: Fetcher; storage?: AssetIntentStorage;
}) {
  let state: VmAssetState=Object.freeze({kind:'idle',busy:false});
  let file: File|undefined, workflow: ReturnType<typeof createAssetWorkflow>|undefined;
  let disposed=false, generation=0, active: AbortController|undefined;
  let identity=runtime.getSnapshot().environmentId, status=runtime.getSnapshot().status;
  const listeners=new Set<()=>void>();
  const emit=(patch: Partial<VmAssetState>)=>{state=Object.freeze({...state,...patch});for(const fn of listeners)fn();};
  const running=()=>!disposed&&!!memberId.trim()&&runtime.getSnapshot().status==='running';
  const live=(epoch:number,signal:AbortSignal)=>running()&&generation===epoch&&!signal.aborted;
  function reset(){generation++;active?.abort();active=undefined;workflow?.dispose();workflow=undefined;file=undefined;state=Object.freeze({kind:'idle',busy:false});for(const fn of listeners)fn();}
  const unsubscribe=runtime.subscribe(()=>{const next=runtime.getSnapshot();if(next.environmentId!==identity||next.status!==status){identity=next.environmentId;status=next.status;reset();}});
  async function run(action:(signal:AbortSignal,epoch:number)=>Promise<void>){
    if(!running()||active)return;
    const controller=new AbortController(),epoch=generation;active=controller;emit({busy:true,error:undefined});
    try{await action(controller.signal,epoch);}catch(error){if(live(epoch,controller.signal))emit({kind:workflow?'workflow':'error',error:error instanceof Error&&['ASSET_STORAGE_NOT_CONFIGURED','IMPORT_PATH_INVALID','IMPORT_SENSITIVE_PATH','IMPORT_TYPE_UNSUPPORTED','IMPORT_FILE_INVALID','IMPORT_CONFIRMATION_REQUIRED','IMPORT_PREVIEW_REQUIRED','IMPORT_PREVIEW_INVALID'].includes(error.message)?error.message:'IMPORT_REQUEST_FAILED'});}
    finally{if(active===controller){active=undefined;emit({busy:false});}}
  }
  async function available(signal:AbortSignal){
    const value=await loadAssetAvailability({requester,signal});
    if(!value.storageEnabled)throw Error('ASSET_STORAGE_NOT_CONFIGURED');
    return Math.min(MAX_BYTES,value.maxBytes);
  }
  function ensureWorkflow(maxBytes:number,epoch:number){
    if(workflow)return workflow;
    workflow=createAssetWorkflow({memberId,maxBytes,storage,requester,uploadRequester:requester,onChange:flow=>{
      if(!disposed&&generation===epoch){
        // Successful terminal receipts release the volatile original and parsed preview.
        const terminal=['submitted','canceled','released'].includes(flow.kind);
        if(terminal)file=undefined;
        emit({kind:'workflow',flow,...(terminal?{selected:undefined,parsed:undefined}:{})});
      }
    }});
    emit({flow:workflow.state()});return workflow;
  }
  async function gate(signal:AbortSignal,epoch:number){const maxBytes=await available(signal);return live(epoch,signal)?ensureWorkflow(maxBytes,epoch):undefined;}
  const model={
    getSnapshot:()=>state,subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
    select(path:string){return run(async(signal,epoch)=>{
      // Resolve any existing local intent through recover/close first, never replace it implicitly.
      if(state.selected||workflow)return;
      const name=selectedName(path);emit({kind:'reading'});
      const maxBytes=await available(signal);if(!live(epoch,signal))return;
      const result=await runtime.file({op:'readSubmissionAsset',path,maxBytes});if(!live(epoch,signal))return;
      if(!('bytes' in result)||!(result.bytes instanceof Uint8Array)||!result.bytes.length||result.bytes.length>maxBytes)throw Error('IMPORT_FILE_INVALID');
      const snapshot=new File([new Uint8Array(result.bytes)],name);
      const typed=new File([snapshot],name,{type:assetContentType(snapshot)});
      if(assetUploadModel({enabled:true,file:typed,maxBytes}).kind!=='idle')throw Error('IMPORT_FILE_INVALID');
      const description=await describeAssetFile(typed,typed.type);if(!live(epoch,signal))return;
      file=typed;ensureWorkflow(maxBytes,epoch);emit({kind:'preview',selected:Object.freeze({path,file:Object.freeze(description)})});
    });},
    recover(){return run(async(signal,epoch)=>{const current=await gate(signal,epoch);if(current){emit({kind:'workflow'});await current.refresh();}});},
    upload(acknowledged:boolean){return run(async(signal,epoch)=>{
      if(acknowledged!==true||!file||!state.selected)throw Error('IMPORT_CONFIRMATION_REQUIRED');
      const maxBytes=await available(signal);if(!live(epoch,signal))return;
      if(file.size>maxBytes)throw Error('IMPORT_FILE_INVALID');
      await ensureWorkflow(maxBytes,epoch).select(file);
    });},
    refresh(){return run(async(signal,epoch)=>{const current=await gate(signal,epoch);await current?.refresh();});},
    parse(){return run(async(signal,epoch)=>{const current=await gate(signal,epoch);if(current){emit({parsed:undefined});await current.parse();}});},
    cancel(){return run(async(signal,epoch)=>{const current=await gate(signal,epoch);await current?.cancel();});},
    releaseFailed(){return run(async(signal,epoch)=>{const current=await gate(signal,epoch);await current?.releaseFailed();});},
    previewParsed(){return run(async(signal,epoch)=>{
      emit({parsed:undefined});const current=await gate(signal,epoch);if(!current)return;
      await current.refresh();if(!live(epoch,signal))return;
      const record=current.state().record;if(record?.job.status!=='succeeded')throw Error('IMPORT_PREVIEW_REQUIRED');
      const value=await apiFetch<{assetId:string;originalName:string;markdown:string}>(`/api/assets/${record.asset.id}/preview`,{method:'GET',requester,signal});
      if(!live(epoch,signal))return;
      if(!value||value.assetId!==record.asset.id||value.originalName!==record.asset.originalName||typeof value.markdown!=='string'||!value.markdown.trim()||size(value.markdown)>131072)throw Error('IMPORT_PREVIEW_INVALID');
      emit({parsed:Object.freeze({assetId:value.assetId,markdown:value.markdown})});
    });},
    submit(value:Confirmation){return run(async(signal,epoch)=>{
      // A persisted review may only be replayed explicitly, not edited into a new payload.
      if(workflow?.state().intent?.review)return;
      if(value.acknowledged!==true||typeof value.title!=='string'||!value.title.trim()||value.title.trim().length>200||size(value.title.trim())>512)throw Error('IMPORT_CONFIRMATION_REQUIRED');
      const target=validateSubmissionTarget(value.target),title=value.title.trim();
      if(!state.parsed||state.parsed.assetId!==workflow?.state().record?.asset.id)throw Error('IMPORT_PREVIEW_REQUIRED');
      const current=await gate(signal,epoch);await current?.submit(title,target);
    });},
    retrySubmission(){return run(async(signal,epoch)=>{
      const review=workflow?.state().intent?.review;if(!review)return;
      const current=await gate(signal,epoch);await current?.submit(review.title,review.target);
    });},
    stop(){if(!disposed)reset();},
    close(){if(!disposed&&!active)reset();},
    dispose(){disposed=true;unsubscribe();reset();listeners.clear();},
  };
  return model;
}
export type VmAssetImport=ReturnType<typeof createVmAssetImport>;
