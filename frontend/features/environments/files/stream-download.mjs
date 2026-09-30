import {validFileResult} from '../../../../tools/browser-vm/file-protocol.mjs';
const cancelled = () => new Error('DOWNLOAD_CANCELLED');
/** Pull one bounded chunk only after the previous disk write settles. No Blob,
 * whole-file collection, network, or retry. The caller opens a user-picked sink.
 * Only successful close commits it; exported files survive account logout.
 */
export async function writeFileDownload({file,path,openSink,signal,onProgress=()=>{}}) {
  let sink, lease, released=false, committed=false, aborting;
  const check=()=>{if(signal?.aborted)throw cancelled();};
  const abortSink=()=>{
    if(sink&&!committed&&!aborting)aborting=Promise.resolve().then(()=>sink.abort()).catch(()=>{});
    return aborting;
  };
  const onAbort=()=>{void abortSink();};
  signal?.addEventListener('abort',onAbort,{once:true});
  async function call(input){const result=await file(input);if(!validFileResult(input,result))throw Error('FILE_OPERATION_FAILED');return result;}
  // A cancelled slow write must not hold the VM indefinitely. Its rejection is
  // still observed; abort() discards the sink while the lease is released.
  function writing(bytes){
    check();
    return new Promise((resolve,reject)=>{
      const stop=()=>reject(cancelled());signal?.addEventListener('abort',stop,{once:true});
      Promise.resolve().then(()=>{check();return sink.write(bytes);}).then(resolve,reject).finally(()=>signal?.removeEventListener('abort',stop));
      if(signal?.aborted)stop();
    });
  }
  try {
    check();sink=await openSink();check();
    if(!sink||!['write','close','abort'].every(key=>typeof sink[key]==='function'))throw Error('FILE_OPERATION_FAILED');
    lease=await call({op:'downloadBegin',path});check();
    let written=0;onProgress({written,total:lease.size});
    while(written<lease.size){
      check();const chunk=await call({op:'downloadChunk',path,token:lease.token,offset:written});check();
      const expected=Math.min(lease.chunkSize,lease.size-written);
      if(chunk.bytes.length!==expected||chunk.done!==(written+expected===lease.size))throw Error('FILE_OPERATION_FAILED');
      await writing(chunk.bytes);check();written+=chunk.bytes.length;onProgress({written,total:lease.size});
    }
    released=true;await call({op:'downloadEnd',path,token:lease.token});check();
    await sink.close();committed=true;
    return {bytes:written,committed:true};
  } catch(error){
    if(signal?.aborted||error?.name==='AbortError')throw cancelled();
    throw error;
  } finally {
    signal?.removeEventListener('abort',onAbort);
    if(lease&&!released)await file({op:'downloadEnd',path,token:lease.token}).catch(()=>{});
    if(!committed)void abortSink();
  }
}
