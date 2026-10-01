// Dedicated LOCAL test host. Not imported by the production Worker/probe server.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyImageBundle } from './image-bundle.mjs';
import { ALPINE_ISO_ARTIFACTS } from './alpine-iso.mjs';
const here=fileURLToPath(new URL('.',import.meta.url));
export async function startImageAcceptanceServer({directory,artifacts=ALPINE_ISO_ARTIFACTS}) {
  await verifyImageBundle({directory,artifacts});
  const index=JSON.parse(await readFile(join(directory,'image-bundle.json')));
  const images=new Map(index.files.filter(f=>f.path.startsWith('image-chunks/')).map(f=>['/'+f.path,join(directory,f.path)]));
  const iso=artifacts.find(a=>a.role==='iso');
  if(!iso)throw Error('Acceptance requires an approved ISO');
  const manifest=JSON.parse(await readFile(images.get(`/image-chunks/${iso.sha256}/manifest.json`)));
  if(manifest.chunks.length<2)throw Error('Acceptance needs at least two ISO chunks');
  const faultPath=manifest.chunks[1].path,firstPath=manifest.chunks[0].path;
  const modules=['image-acceptance-browser.mjs','image-acceptance-worker.mjs','image-acceptance-core.mjs','image-acceptance-boot.mjs','alpine-iso.mjs','chunked-image.mjs','terminal-session.mjs','probe-checkpoint.mjs','shared-files.mjs','file-protocol.mjs','serial-protocol.mjs'];
  const files=new Map(modules.map(name=>['/'+name,[join(here,name),'text/javascript; charset=utf-8']]));
  files.set('/',[join(here,'image-acceptance.html'),'text/html; charset=utf-8']);
  files.set('/engine/libv86.mjs',[resolve(here,'../../node_modules/v86/build/libv86.mjs'),'text/javascript']);
  let url,armed=false,interruptions=0,requests=0;const counts={},timers=new Set();
  const inspect=()=>({armed,interruptions,requests,counts:{...counts},faultPath,firstPath,productionAcceptance:false});
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store, no-transform');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    if(`http://${req.headers.host}`!==url || (req.headers.origin && req.headers.origin!==url)){req.resume();res.writeHead(403).end();return;}
    if(req.url==='/fault/interrupt') {
      req.resume();
      if(req.method!=='POST'){res.writeHead(405,{Allow:'POST'}).end();return;}
      if(req.headers.origin!==url){res.writeHead(403).end();return;}
      if(req.headers['transfer-encoding'] || (req.headers['content-length'] && req.headers['content-length']!=='0')){res.writeHead(400).end();return;}
      if(armed){res.writeHead(409).end();return;}
      armed=true;res.writeHead(204).end();return;
    }
    if(!images.has(req.url)&&!files.has(req.url)&&req.url!=='/inspect'){req.resume();res.writeHead(404).end();return;}
    if(!['GET','HEAD'].includes(req.method)){req.resume();res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
    if(req.url==='/inspect') {
      const body=JSON.stringify(inspect());res.writeHead(200,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)});res.end(req.method==='HEAD'?undefined:body);return;
    }
    try {
      const isImage=images.has(req.url),[path,type]=isImage?[images.get(req.url),'application/octet-stream']:files.get(req.url);
      const bytes=await readFile(path);
      if(isImage&&req.method==='GET'){requests++;counts[req.url]=(counts[req.url]??0)+1;}
      res.writeHead(200,{'Content-Type':type,'Content-Length':bytes.length});
      if(req.method==='HEAD'){res.end();return;}
      if(isImage&&armed&&req.url===faultPath) {
        armed=false;interruptions++;res.flushHeaders();res.write(bytes.subarray(0,Math.max(1,Math.floor(bytes.length/2))));
        const timer=setTimeout(()=>{timers.delete(timer);res.destroy();},40);timers.add(timer);return;
      }
      res.end(bytes);
    } catch {if(!res.headersSent)res.writeHead(500);res.end();}
  });
  await new Promise((ready,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',ready);});
  url=`http://127.0.0.1:${server.address().port}`;
  return {url,inspect,close:async()=>{for(const timer of timers)clearTimeout(timer);timers.clear();await new Promise(done=>{server.close(done);server.closeAllConnections();});}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const server=await startImageAcceptanceServer({directory:process.argv[2]});console.log(`Local image acceptance (offline guest): ${server.url}`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();process.exit(0);});
}
