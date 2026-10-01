import { createAccountNetworkOwner } from "../../frontend/features/environments/account-network-owner.mjs";
import { createCheckpointStore } from "../../frontend/features/environments/storage/checkpoints.mjs";
import { sealCheckpoint } from "./probe-checkpoint.mjs";

const identity = {engineVersion:"diagnostic-v1",imageVersion:"synthetic-not-guest",memoryBytes:268435456,filesystem:"ram-root+in-memory-9p+readonly-iso"};
const environment = {id:crypto.randomUUID(),memberId:"diagnostic-"+crypto.randomUUID(),type:"personal"};
const results = [], buttons = [...document.querySelectorAll("main > button")];
let stage=0, activeWorker, closed=false;
const activePairs=new Set();
const encode = text => sealCheckpoint(new TextEncoder().encode(text).buffer, identity);
const text = value => new TextDecoder().decode(value.checkpoint.state);
function require(condition, message) {if(!condition) throw Error(message);}
function pair(options={}) {
  const owner=createAccountNetworkOwner({origin:location.origin,memberId:environment.memberId});
  const store=createCheckpointStore({owner,identity,...options});
  const value={owner,store,close(){store.close();owner.dispose();activePairs.delete(value);}};
  activePairs.add(value);return value;
}
async function retained() {
  const p=pair();
  try {
    const head=await p.store.load(environment),old=await p.store.load(environment,{revision:1});
    require(head?.revision===2 && text(head)==="committed-two", "head changed");
    require(text(old)==="committed-one", "retained generation lost");
    return {head:2,older:1,verifiedBytes:true};
  } finally {p.close();}
}
async function seed() {
  const p=pair();
  try {
    await p.store.save(environment,await encode("committed-one"),{expectedRevision:0});
    await p.store.save(environment,await encode("committed-two"),{expectedRevision:1});
  } finally {p.close();}
  return retained();
}
async function crash() {
  const worker=new Worker("/checkpoint-recovery-worker.mjs",{type:"module"});activeWorker=worker;
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error("worker preparation timeout")),15000);
      worker.onerror=()=>{clearTimeout(timer);reject(Error("worker failed before prepared boundary"));};
      worker.onmessage=({data})=>{clearTimeout(timer);if(data.kind==="uncommitted-writes-queued")resolve();else reject(Error("unexpected worker receipt: "+data.kind));};
      worker.postMessage({environment,identity});
    });
    worker.terminate();activeWorker=undefined;
    return {workerTerminated:true,...await retained(),browserProcessCrash:false};
  } finally {worker.terminate();activeWorker=undefined;}
}
async function revoke() {
  const receipts=[];
  for(const mode of ["cancel","revoke"]) {
    const p=pair(),controller=new AbortController(),original=IDBObjectStore.prototype.put;
    let injected=false, failure;
    try {
      const candidate=await encode("must-not-commit");
      IDBObjectStore.prototype.put=function(...args){
        const result=original.apply(this,args);
        if(this.name==="states"&&!injected){injected=true;queueMicrotask(()=>mode==="cancel"?controller.abort():p.owner.revoke());}
        return result;
      };
      try {await p.store.save(environment,candidate,{expectedRevision:2,signal:controller.signal});}
      catch(error) {failure=error.message;}
      require(injected && /^(CHECKPOINT_CANCELLED|CHECKPOINT_TRANSACTION_FAILED|ACCOUNT_CLOSED|CHECKPOINT_CLOSED)$/.test(failure??""), "pending write did not reject");
    } finally {IDBObjectStore.prototype.put=original;p.close();}
    receipts.push({mode,failure,...await retained()});
  }
  return receipts;
}
async function quota() {
  // Optimistic preflight intentionally allows the write through to native IDB.
  // No synthetic QuotaExceededError here: the browser must reject the real write.
  const p=pair({estimate:async()=>({quota:2**31,usage:0})});
  const bytes=new Uint8Array(262144);
  for(let start=0;start<bytes.length;start+=65536)crypto.getRandomValues(bytes.subarray(start,start+65536));
  let failure;
  try {
    try {await p.store.save(environment,await sealCheckpoint(bytes.buffer,identity),{expectedRevision:2});}
    catch(error){failure=error.message;}
    require(failure==="CHECKPOINT_QUOTA", "native quota rejection not observed; diagnostic data only, start a new run if committed");
  } finally {p.close();}
  return {failure,attemptedBytes:262144,quotaSource:"native IndexedDB; preflight deliberately optimistic",...await retained()};
}
async function retry() {
  const p=pair();
  try {
    const receipt=await p.store.save(environment,await encode("explicit-retry-three"),{expectedRevision:2});
    require(receipt.revision===3,"wrong retry revision");
  } finally {p.close();}
  const reopened=pair();
  try {
    const head=await reopened.store.load(environment),old=await reopened.store.load(environment,{revision:2});
    require(head?.revision===3&&text(head)==="explicit-retry-three"&&text(old)==="committed-two","retry not durable");
    return {head:3,older:2,verifiedBytes:true,automaticRetry:false};
  } finally {reopened.close();}
}
function render(){document.querySelector("#skip-quota").disabled=closed||stage!==3;buttons.forEach((button,index)=>{button.disabled=closed||index!==stage;});document.querySelector("#report").textContent=JSON.stringify({productionAcceptance:false,syntheticState:true,results},null,2);}
for(const [index,action] of [seed,crash,revoke,quota,retry].entries()) buttons[index].onclick=async()=>{
  buttons.forEach(button=>{button.disabled=true;});document.querySelector("#skip-quota").disabled=true;document.querySelector("#status").textContent="执行中";
  try {const evidence=await action();results.push({test:action.name,status:"passed",evidence});stage++;document.querySelector("#status").textContent=stage===5?`${results.filter(row=>row.status==="passed").length}/5 本地存储边界通过；未执行项不算完成，不代表全部 VM 验收`:"本项通过；等待下一项显式操作";}
  catch(error){results.push({test:action.name,status:"failed",reason:error.message});document.querySelector("#status").textContent="失败（未验收）："+error.message;}
  render();
};
document.querySelector("#skip-quota").onclick=()=>{
  if(stage!==3||closed)return;
  results.push({test:"quota",status:"not-run",reason:"工具不支持安全的按来源配额模拟；未填满磁盘"});stage++;
  document.querySelector("#status").textContent="原生配额失败未验收；继续独立的显式重试检查";render();
};
addEventListener("pagehide",()=>{closed=true;activeWorker?.terminate();for(const p of activePairs)p.close();});
render();
