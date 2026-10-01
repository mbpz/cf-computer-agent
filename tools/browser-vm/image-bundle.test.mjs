import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { V86 } from 'v86';
import { ALPINE_ISO_ARTIFACTS, prepareAlpineIso } from './alpine-iso.mjs';
import { exportImageBundle, verifyImageBundle, createPinnedSourceReader } from './image-bundle.mjs';
import { createChunkedImageReader } from './chunked-image.mjs';
import { createTerminalSession } from './terminal-session.mjs';
const boot=process.env.BROWSER_VM_PROBE_ASSETS, iso=process.env.BROWSER_VM_PROBE_ISO_ASSETS;

test('actual Alpine cold/warm boot from independently hosted disk export',{
  skip:(!boot||!iso)&&'Explicit development BIOS and ISO assets required',timeout:120000,
},async t=>{
  const root=await mkdtemp(join(tmpdir(),'vm-static-bundle-')), output=join(root,'public');
  t.after(()=>rm(root,{recursive:true,force:true}));
  const artifacts=ALPINE_ISO_ARTIFACTS;
  const readAsset=await createPinnedSourceReader({artifacts,roots:{boot,iso,engine:fileURLToPath(new URL('../../node_modules/v86/build/',import.meta.url))}});
  const bundle=await exportImageBundle({output,artifacts,readAsset});
  assert.deepEqual(await verifyImageBundle({directory:output,artifacts}),bundle);
  assert.equal(bundle.files,20);assert.equal(bundle.maxFileBytes,8*1024*1024);
  const index=JSON.parse(await readFile(join(output,'image-bundle.json')));
  const allow=new Set(index.files.filter(f=>f.path.startsWith('image-chunks/')).map(f=>'/'+f.path));
  const headerLines=(await readFile(join(output,'_headers'),'utf8')).trimEnd().split('\n');
  assert.equal(headerLines.shift(),'/image-chunks/*');
  const headers=Object.fromEntries(headerLines.map(line=>{const at=line.indexOf(':');return [line.slice(0,at).trim(),line.slice(at+1).trim()];}));
  // Independent file host: no probe server or on-demand chunk construction.
  // This applies the exported header rule locally; NOT Cloudflare/HTTPS evidence.
  const server=createServer(async(req,res)=>{
    if(req.method!=='GET'||!allow.has(req.url)){res.writeHead(404);res.end();return;}
    try{const bytes=await readFile(join(output,req.url.slice(1)));res.writeHead(200,{...headers,'Content-Length':bytes.length});res.end(bytes);}
    catch{res.writeHead(500);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const stores=new Map();
  // Cache API adapter only, explicitly not native browser persistence evidence.
  const cacheStorage={keys:async()=>[...stores.keys()],delete:async k=>stores.delete(k),open:async k=>{
    if(!stores.has(k))stores.set(k,new Map());const store=stores.get(k);
    return {keys:async()=>[...store.keys()].map(url=>({url})),match:async k=>store.get(k)?.clone(),put:async(k,v)=>store.set(k,v.clone()),delete:async k=>store.delete(k)};
  }};
  const runs=[];
  for(const mode of ['cold','warm']) {
    const read=await createChunkedImageReader({artifacts,origin,cacheStorage,fetchImpl:async(url,init)=>{
      if(mode==='warm')throw Error('Warm boot must not fetch');
      const response=await fetch(url,init);assert.match(response.headers.get('cache-control'),/no-transform/);return response;
    }});
    const started=performance.now(), profile=await prepareAlpineIso({Engine:V86,readAsset:read});
    const session=createTerminalSession({createMachine:()=>profile.createMachine()});
    try {
      await session.ready;session.drain();
      session.write("uname -r; printf '\\nDISK-BUNDLE-BOOT-OK\\n'\n");
      let text='';const decoder=new TextDecoder(),end=performance.now()+10000;
      while(performance.now()<end) {
        const {bytes,droppedBytes}=session.drain();assert.equal(droppedBytes,0);text+=decoder.decode(bytes,{stream:true});
        if(/\r?\n6\.18\.35-0-virt\r?\n\r?\nDISK-BUNDLE-BOOT-OK\r?\n/.test(text))break;
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      assert.match(text,/\r?\n6\.18\.35-0-virt\r?\n\r?\nDISK-BUNDLE-BOOT-OK\r?\n/);
      assert.equal(read.diagnostics.requests,mode==='cold'?18:0);
      assert.equal(read.diagnostics.verifiedImages,6);
      runs.push({mode,...read.diagnostics,elapsedMs:Math.round(performance.now()-started)});
    } finally {await session.close();}
  }
  console.log(JSON.stringify({bundle,runs,kernel:'6.18.35-0-virt',network:'off',nativeBrowserCache:false,hostedHttpsAcceptance:false,productionAcceptance:false}));
});
