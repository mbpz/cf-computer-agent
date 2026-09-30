const systemClock = {monotonicNow: () => performance.now(), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id)};

/** One account/environment owns one lifecycle. This is local coordination,
 * NOT authorization: the server and connector must independently validate tickets.
 * open() returns {ready: Promise, close()} synchronously, owns cancellation during
 * asynchronous authorization, and reports termination via onClose. No commands,
 * tickets or snapshot bytes are retained, and nothing automatically reconnects.
 */
export function createVmNetworkLifecycle({events, onState = () => {}, clock = systemClock} = {}) {
 let current, epoch = 0, generation = 0, disposed = false, tearingDown = false;
 let state = Object.freeze({status:'offline',reason:'initial',epoch});
 const publish = (status, reason) => {
  state = Object.freeze({status,reason,epoch});
  try { onState(state); } catch { /* Presentation cannot retain network authority. */ }
 };
 const removeListeners = () => {
  events?.removeEventListener('offline', offline);
  events?.removeEventListener('pagehide', pagehide);
 };
 function closeResource(resource) {
  try { resource?.close(); }
  catch { disposed=true;removeListeners();publish('closed','cleanup-failed'); }
 }
 function end(reason, terminal = false) {
  if (disposed || tearingDown) return;
  disposed=terminal;tearingDown=true;
  const attempt=current;current=undefined;
  if (terminal) removeListeners();
  if (attempt) {
   clock.clearTimer(attempt.timer);
   // Invalidate callbacks before abort/close (both may synchronously re-enter).
   attempt.controller.abort();
   attempt.reject(new Error('NETWORK_CANCELLED'));
   closeResource(attempt.resource);
  }
  tearingDown=false;
  if (state.reason !== 'cleanup-failed') publish(disposed?'closed':'offline',reason);
 }
 function connect({runtimeId, generation: next, open} = {}) {
  const reject = code => Promise.reject(new Error(code));
  if(disposed)return reject('NETWORK_CLOSED');
  if(current||tearingDown)return reject('NETWORK_BUSY');
  if(typeof runtimeId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(runtimeId)||!Number.isSafeInteger(next)||next<1||typeof open!=='function')return reject('INVALID_BINDING');
  if(next<=generation)return reject('STALE_GENERATION');
  generation=next;
  const attempt={controller:new AbortController(),resource:undefined,timer:undefined,deadline:clock.monotonicNow()+10000};
  const result=new Promise((resolve,reject)=>{attempt.resolve=resolve;attempt.reject=reject;});
  current=attempt;epoch++;publish('connecting','explicit-connect');
  if(current!==attempt)return result;
  attempt.timer=clock.setTimer(()=>{if(current===attempt)end('connection-timeout');},10000);
  try {
   attempt.resource=open({signal:attempt.controller.signal,onClose:()=>{if(current===attempt)end('connector-closed');}});
   if(!attempt.resource||typeof attempt.resource.close!=='function'||typeof attempt.resource.ready?.then!=='function')throw new Error('INVALID_RESOURCE');
   attempt.resource.ready.then(()=>{
    if(current!==attempt)return;
    if(clock.monotonicNow()>=attempt.deadline){end('connection-timeout');return;}
    clock.clearTimer(attempt.timer);attempt.timer=undefined;
    publish('connected','authorized');
    if(current===attempt)attempt.resolve(state);
   },()=>{if(current===attempt)end('connection-failed');});
   if(current!==attempt)closeResource(attempt.resource);
  } catch {if(current===attempt)end('connection-failed');}
  return result;
 }
 const offline=()=>end('browser-offline');
 const pagehide=()=>end('page-hidden',true);
 events?.addEventListener('offline',offline);
 events?.addEventListener('pagehide',pagehide);
 return Object.freeze({connect,disconnect:()=>end('user-disconnect'),beforeRestore:()=>end('snapshot-restore'),dispose:()=>end('disposed',true),get state(){return state;}});
}
