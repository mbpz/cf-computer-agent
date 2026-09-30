import {writeFileDownload} from './stream-download.mjs';
import { FILE_ERRORS, TEXT_LIMIT, UPLOAD_LIMIT, validFileResult } from '../../../../tools/browser-vm/file-protocol.mjs';
const encoder = new TextEncoder();
const cleanError = error => FILE_ERRORS.has(error?.message) ? error.message : 'FILE_OPERATION_FAILED';
function namePath(directory,name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[/\\\x00-\x1f\x7f]/.test(name) || encoder.encode(name).length > 255) throw Error('INVALID_PATH');
  return (directory === '/' ? '' : directory)+'/'+name;
}
const empty = (available, epoch=0) => ({available,epoch,path:'/',page:1,pageSize:20,total:0,pages:1,entries:[],editor:null,results:[],download:null,busy:false,cancelling:false,error:'',notice:''});
/** Volatile account/runtime-owned file UI state. Never persists content or tokens.
 * Cancellation stops unsent work; sent mutations settle once, never replay/rollback.
 */
export function createFileManager(runtime) {
  let identity=runtime.getSnapshot().environmentId, available=runtime.getSnapshot().status==='running', generation=0, current, disposed=false;
  let state=Object.freeze(empty(available));const listeners=new Set();
  const publish=patch=>{state=Object.freeze({...state,...patch});for(const fn of listeners)fn();};
  const live=token=>!disposed&&available&&token===current&&token.generation===generation;
  const wanted=token=>live(token)&&!token.cancelled;
  const unsubscribe=runtime.subscribe(()=>{
    const next=runtime.getSnapshot(), ready=next.status==='running';
    if (ready===available&&next.environmentId===identity) return;
    current?.abort.abort();generation++;identity=next.environmentId;available=ready;current=undefined;
    publish(empty(ready,generation));
  });
  async function call(input) {
    const result=await runtime.file(input);
    if (!validFileResult(input,result)) throw Error('FILE_OPERATION_FAILED');
    return result;
  }
  async function run(fn) {
    if(disposed||!available||current)return;
    const token={generation,cancelled:false,abort:new AbortController()};current=token;publish({busy:true,cancelling:false,error:'',notice:'',download:null});
    try {await fn(token);}catch(error){if(live(token))publish({error:cleanError(error)});}
    finally {if(live(token)){current=undefined;publish({busy:false,cancelling:false});}}
  }
  async function refresh(token,path=state.path,page=state.page,pageSize=state.pageSize) {
    const result=await call({op:'list',path,page,pageSize});
    if(wanted(token))publish({...result});
  }
  async function written(token) {
    if(!live(token))return;
    publish({notice:token.cancelled?'WRITE_DONE_CANCELLED':'WRITE_DONE'});
    if(token.cancelled)return;
    try{await refresh(token);}catch(error){if(live(token))publish({notice:'WRITE_DONE_REFRESH_FAILED',error:cleanError(error)});}
  }
  function mutation(input) {return run(async token=>{await call(input());await written(token);});}
  const manager={
    getSnapshot:()=>state,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    load(path=state.path,page=state.page,pageSize=state.pageSize){return run(token=>refresh(token,path,page,pageSize));},
    mkdir(name){return mutation(()=>({op:'mkdir',path:namePath(state.path,name)}));},
    rename(name,destination){return mutation(()=>({op:'rename',path:namePath(state.path,name),destination:namePath(state.path,destination)}));},
    remove(name){return mutation(()=>({op:'remove',path:namePath(state.path,name)}));},
    open(name){return run(async token=>{
      const path=namePath(state.path,name);publish({editor:null});const result=await call({op:'readText',path});
      if(wanted(token))publish({editor:{path,name,...result,dirty:false,conflict:false}});
    });},
    edit(text){if(!available||disposed||current||!state.editor)return;
      if(typeof text!=='string'||text.length>TEXT_LIMIT||encoder.encode(text).length>TEXT_LIMIT){publish({error:'FILE_TOO_LARGE'});return;}
      publish({editor:{...state.editor,text,dirty:true},error:''});
    },
    closeEditor(){if(!current&&!disposed)publish({editor:null,error:''});},
    save(){if(!state.editor||state.editor.conflict)return Promise.resolve();
      const editor=state.editor;
      return run(async token=>{
        try{await call({op:'saveText',path:editor.path,version:editor.version,text:editor.text});}
        catch(error){if(live(token)&&error?.message==='FILE_CONFLICT')publish({editor:{...editor,conflict:true}});throw error;}
        if(live(token))publish({editor:null});await written(token);
      });
    },
    saveAs(name){if(!state.editor)return Promise.resolve();const text=state.editor.text;
      return run(async token=>{await call({op:'upload',path:namePath(state.path,name),bytes:encoder.encode(text)});if(live(token))publish({editor:null});await written(token);});
    },
    download(name,receive){return run(async token=>{const {bytes}=await call({op:'download',path:namePath(state.path,name)});if(wanted(token))receive(name,bytes);});},
    downloadTo(name,openSink){return run(async token=>{
      publish({download:null});
      try {
        await writeFileDownload({file:call,path:namePath(state.path,name),openSink,signal:token.abort.signal,
          onProgress:download=>{if(wanted(token))publish({download});}});
        if(live(token))publish({notice:'DOWNLOAD_DONE'});
      } catch(error) {
        if(live(token)&&error?.message==='DOWNLOAD_CANCELLED'){publish({notice:'DOWNLOAD_CANCELLED'});return;}
        throw error;
      }
    });},
    upload(selected){return run(async token=>{
      const files=Array.from(selected);if(!files.length||files.length>100)throw Error('INVALID_FILE');
      const directory=state.path;const results=files.map(file=>({name:String(file.name).slice(0,255),status:'pending',error:''}));
      const report=()=>{if(live(token))publish({results:results.map(x=>({...x}))});};report();
      for(let i=0;i<files.length;i++){
        if(!live(token))return;
        if(token.cancelled){for(let j=i;j<results.length;j++)results[j].status='cancelled';report();break;}
        const file=files[i];results[i].status='running';report();
        try{
          const path=namePath(directory,file.name);
          if(!Number.isSafeInteger(file.size)||file.size<0||file.size>UPLOAD_LIMIT)throw Error('FILE_TOO_LARGE');
          const buffer=await file.arrayBuffer();if(!live(token))return;
          if(token.cancelled){results[i].status='cancelled';report();continue;}
          if(!(buffer instanceof ArrayBuffer)||buffer.byteLength!==file.size||buffer.byteLength>UPLOAD_LIMIT)throw Error('INVALID_FILE');
          await call({op:'upload',path,bytes:new Uint8Array(buffer)});results[i].status='done';
        }catch(error){results[i].status='failed';results[i].error=cleanError(error);}
        report();
      }
      if(!live(token))return;
      publish({notice:token.cancelled?'BATCH_CANCELLED':'BATCH_DONE'});
      if(!token.cancelled){try{await refresh(token);}catch(error){if(live(token))publish({error:cleanError(error)});}}
    });},
    cancel(){if(current){current.cancelled=true;current.abort.abort();publish({cancelling:true,notice:'CANCEL_REQUESTED'});}},
    dispose(){if(disposed)return;disposed=true;current?.abort.abort();generation++;current=undefined;available=false;unsubscribe();publish(empty(false,generation));listeners.clear();},
  };
  return Object.freeze(manager);
}
