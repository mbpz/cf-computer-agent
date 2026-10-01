import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';
const source=await readFile(new URL('../tools/browser-vm/browser.mjs',import.meta.url),'utf8');
const html=await readFile(new URL('../tools/browser-vm/index.html',import.meta.url),'utf8');
import * as policy from '../tools/browser-vm/terminal-input-policy.mjs';
async function fixture(t,{approve=false,write=async()=>{}}={}){
  const window=new Window();t.after(()=>window.happyDOM.abort());window.document.body.innerHTML=html;
  const document=window.document,writes=[],prompts=[];let callbacks;
  const connection={state:'ready',ready:Promise.resolve(),async write(value){writes.push(value);await write(value);},close(){this.state='closed';callbacks.onClosed(Error('Terminal closed'));}};
  window.confirm=message=>{prompts.push(message);return typeof approve==='function'?approve(connection):approve;};
  runInNewContext(source.replace(/^import .*;$/gm,''),{...policy,window,document,navigator:window.navigator,AbortController,performance,setTimeout,clearTimeout,setInterval,clearInterval,runWorkerProbe:()=>{throw Error('not used');},connectTerminal:options=>{callbacks=options;return connection;}});
  const node=id=>document.getElementById(id);node('terminal-start').click();await tick();
  return {window,document,node,writes,prompts,connection,output:text=>callbacks.onOutput(text)};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function paste(f,text){const event=new f.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:type=>type==='text/plain'?text:''}});f.node('terminal-input').dispatchEvent(event);return event;}
test('ordinary explicit input is sent exactly once with one final newline',async t=>{const f=await fixture(t);f.node('terminal-input').value='echo 中文';f.node('terminal-send').click();await tick();assert.deepEqual(f.writes,['echo 中文\n']);assert.equal(f.prompts.length,0);assert.equal(f.node('terminal-input').value,'');});
test('canceling multiline confirmation preserves draft and sends nothing',async t=>{const f=await fixture(t);f.node('terminal-input').value='echo safe\necho unexpected';f.node('terminal-send').click();await tick();assert.deepEqual(f.writes,[]);assert.equal(f.prompts.length,1);assert.equal(f.node('terminal-input').value,'echo safe\necho unexpected');});
test('accepted multiline input uses an escaped exact preview and is not rewritten',async t=>{const f=await fixture(t,{approve:true});f.node('terminal-input').value='echo one\necho two\n';f.node('terminal-send').click();await tick();assert.deepEqual(f.writes,['echo one\necho two\n']);assert.equal(f.prompts.length,1);assert.ok(f.prompts[0].includes('echo one\\necho two\\n'));});
test('control, bidi and Unicode line-separator input cannot silently execute',async t=>{const f=await fixture(t);for(const char of ['\t','\x00','\x03','\x1b','\x7f','\x85','\u2028','\u2029','\u202e','\u2066']){f.node('terminal-input').value='echo'+char+'x';f.node('terminal-send').click();await tick();}assert.deepEqual(f.writes,[]);assert.equal(f.prompts.length,10);});
test('risky paste requires confirmation before default insertion and never sends',async t=>{const f=await fixture(t);assert.equal(paste(f,'echo one\necho two').defaultPrevented,true);assert.equal(paste(f,'echo one').defaultPrevented,false);assert.deepEqual(f.writes,[]);assert.equal(f.prompts.length,1);});
test('closing a session while confirmation is open cannot submit to stale terminal',async t=>{const f=await fixture(t,{approve:connection=>{connection.close();return true;}});f.node('terminal-input').value='echo one\necho two';f.node('terminal-send').click();await tick();assert.deepEqual(f.writes,[]);assert.equal(f.connection.state,'closed');});
test('pending input is not duplicated, failed writes preserve draft, and Ctrl+C is explicit',async t=>{let reject;const pending=new Promise((_,r)=>{reject=r;});const f=await fixture(t,{write:()=>pending});f.node('terminal-input').value='echo one';f.node('terminal-send').click();f.node('terminal-send').click();assert.deepEqual(f.writes,['echo one\n']);reject(Error('unavailable'));await tick();assert.equal(f.node('terminal-input').value,'echo one');assert.match(f.node('terminal-status').textContent,/未发送/);f.node('terminal-interrupt').click();await tick();assert.deepEqual(f.writes,['echo one\n','\x03']);assert.equal(f.prompts.length,0);});
test('untrusted markup, OSC clipboard and links remain literal terminal output',async t=>{const f=await fixture(t);let opened=0;f.window.open=()=>{opened++;};const payload='<img src=x onerror=alert(1)>\x1b]52;c;c2VjcmV0\x07\x1b]8;;https://example.invalid\x07link';f.output(payload);assert.equal(f.node('terminal-output').value,payload);assert.equal(f.node('terminal-output').children.length,0);assert.equal(opened,0);assert.deepEqual(f.writes,[]);});

test('accepted paste still needs separate send confirmation and does not auto-send',async t=>{const f=await fixture(t,{approve:true});assert.equal(paste(f,'echo one\necho two').defaultPrevented,false);assert.deepEqual(f.writes,[]);f.node('terminal-input').value='echo one\necho two';f.window.confirm=()=>false;f.node('terminal-send').click();await tick();assert.deepEqual(f.writes,[]);});
test('missing or failing confirmation and excessive input fail closed',()=>{assert.equal(policy.approveTerminalText('a\nb'),false);assert.equal(policy.approveTerminalText('a\nb',()=>{throw Error('denied');}),false);let calls=0;assert.equal(policy.approveTerminalText('x'.repeat(4097),()=>{calls++;return true;}),false);assert.equal(calls,0);assert.equal(policy.approveTerminalText('a\nb',()=>1),false);});
const ownerSource=await readFile(new URL('../tools/browser-vm/runtime-owner-browser.mjs',import.meta.url),'utf8');
const ownerHtml=await readFile(new URL('../tools/browser-vm/runtime-owner.html',import.meta.url),'utf8');
async function ownerFixture(t,{approve=false,write=async()=>{}}={}){
  const window=new Window();t.after(()=>window.happyDOM.abort());const document=window.document;document.body.innerHTML=ownerHtml;
  const owner={signal:new AbortController().signal},writes=[],prompts=[];let snapshot={status:'running',output:'',reason:''};
  const runtime={getSnapshot:()=>snapshot,subscribe:()=>()=>{},write:async value=>{writes.push(value);await write(value);},stop:async()=>{snapshot={...snapshot,status:'idle'};}};
  window.confirm=message=>{prompts.push(message);return typeof approve==='function'?approve(runtime):approve;};
  const inputSource=process.env.TERMINAL_OWNER_BASELINE?await readFile(process.env.TERMINAL_OWNER_BASELINE,'utf8'):ownerSource;
  await runInNewContext('(async()=>{'+inputSource.replace(/^import .*;$/gm,'')+'})()',{...policy,window,document,location:{origin:'http://localhost'},React:{createElement:()=>({})},createRoot:()=>({render(){},unmount(){}}),FilesPanel:()=>{},mountCheckpointControls:()=>()=>{},createAccountNetworkOwner:()=>owner,createAccountVmRuntime:()=>runtime,createCheckpointStore:()=>({}),alpineCheckpointIdentity:async()=>({}),connectTerminal:()=>{throw Error('no VM needed for UI boundary test');}});
  return {window,document,runtime,writes,prompts,node:id=>document.getElementById(id)};
}
test('account-owned terminal rejects control input and keeps its unsent draft',async t=>{const f=await ownerFixture(t);f.node('command').value='echo\x1b[31m';f.node('send').click();await tick();assert.deepEqual(f.writes,[]);assert.equal(f.prompts.length,1);assert.equal(f.node('command').value,'echo\x1b[31m');});
test('account-owned terminal confirms paste before single-line input normalization',async t=>{const f=await ownerFixture(t);const event=new f.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:()=> 'one\ntwo'}});f.node('command').dispatchEvent(event);assert.equal(event.defaultPrevented,true);assert.deepEqual(f.writes,[]);});
test('account-owned terminal does not duplicate pending writes or discard failed drafts',async t=>{let reject;const pending=new Promise((_,r)=>{reject=r;});const f=await ownerFixture(t,{write:()=>pending});f.node('command').value='echo safe';f.node('send').click();f.node('send').click();assert.deepEqual(f.writes,['echo safe\n']);reject(Error('unavailable'));await tick();assert.equal(f.node('command').value,'echo safe');assert.match(f.node('result').textContent,/失败/);assert.equal(f.node('send').disabled,false);});
test('account-owned terminal rechecks runtime after confirmation',async t=>{const f=await ownerFixture(t,{approve:runtime=>{void runtime.stop();return true;}});f.node('command').value='echo\x1b[31m';f.node('send').click();await tick();assert.deepEqual(f.writes,[]);});
test('account-owned terminal successful confirmed write clears only the original draft',async t=>{const f=await ownerFixture(t,{approve:true});f.node('command').value='echo\x1b[31m';f.node('send').click();await tick();assert.deepEqual(f.writes,['echo\x1b[31m\n']);assert.equal(f.node('command').value,'');assert.equal(f.prompts.length,1);});

test('a late acknowledged write cannot clear a draft after the terminal has closed',async t=>{let resolve;const pending=new Promise(r=>{resolve=r;});const f=await fixture(t,{write:()=>pending});f.node('terminal-input').value='echo keep';f.node('terminal-send').click();f.connection.close();resolve();await tick();assert.equal(f.node('terminal-input').value,'echo keep');assert.match(f.node('terminal-status').textContent,/停止/);});
