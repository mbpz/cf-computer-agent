import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const script=await readFile(new URL('../tools/browser-vm/image-acceptance-browser.mjs',import.meta.url),'utf8');
function fixture({constructError=false}={}) {
  const element=(action)=>({dataset:{action},disabled:false,textContent:'',listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},click(){this.listeners.click?.();}});
  const buttons=['interrupt','resume'].map(element),cancel=element(),status=element(),results=element(),workers=[],timers=[];
  const document={querySelectorAll:()=>buttons,querySelector:s=>({'#cancel':cancel,'#status':status,'#results':results}[s])};
  const window={addEventListener(){}};
  class Worker {constructor(){if(constructError)throw Error('worker disabled');workers.push(this);}terminate(){this.terminated=true;}postMessage(data){this.sent=data;}}
  runInNewContext(script,{document,window,Worker,navigator:{userAgent:'test'},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}});
  return {buttons,cancel,status,results,workers,timers};
}
test('late success after timeout cannot turn an unaccepted run into a pass',()=>{
  const f=fixture();f.buttons[0].click();const w=f.workers[0];
  f.timers[0]();assert.match(f.status.textContent,/超时/);assert.equal(w.terminated,true);
  w.onmessage({data:{ok:true,receipt:{result:'booted'}}});
  assert.match(f.status.textContent,/超时/);assert.equal(f.results.textContent,'');
});
test('Worker construction failure restores controls and never claims acceptance',()=>{
  const f=fixture({constructError:true});assert.doesNotThrow(()=>f.buttons[0].click());
  assert.match(f.status.textContent,/未验收/);assert.ok(f.buttons.every(b=>!b.disabled));
});
test('explicit cancel ignores late receipts, and each action creates one fresh Worker',()=>{
  const f=fixture();f.buttons[0].click();f.buttons[1].click();assert.equal(f.workers.length,1);
  f.cancel.click();f.workers[0].onmessage({data:{ok:true,receipt:{result:'booted'}}});assert.match(f.status.textContent,/取消/);
  f.buttons[1].click();assert.equal(f.workers.length,2);
  f.workers[1].onmessage({data:{ok:true,receipt:{result:'expected-failure',booted:false}}});
  assert.match(f.status.textContent,/预期拒绝/);assert.equal(f.workers[1].terminated,true);
});
