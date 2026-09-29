// Explicit development harness commands; no production secrets/config or deployment.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { ALPINE_ISO_ARTIFACTS, verifyImageBytes } from '../tools/browser-vm/alpine-iso.mjs';
const [action,arg]=process.argv.slice(2);
if(action==='build'&&arg){
 const out=resolve(arg);await mkdir(out,{recursive:true});
 for(const name of ['browser','worker'])await build({entryPoints:[`tools/browser-vm/acceptance/${name}.mjs`],outfile:join(out,name+'.js'),bundle:true,platform:'browser',format:'esm',logLevel:'silent',plugins:[{name:'pinned-engine-module',setup(b){b.onResolve({filter:/^v86$/},()=>({path:'./engine.mjs',external:true}));}}]});
 await writeFile(join(out,'engine.mjs'),await readFile('node_modules/v86/build/libv86.mjs'));
 await writeFile(join(out,'index.html'),await readFile('tools/browser-vm/acceptance/index.html'));
 await writeFile(join(out,'_headers'),"/*\n  Cache-Control: no-store\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src http://127.0.0.1:* ws://127.0.0.1:*; base-uri 'none'; frame-ancestors 'none'; form-action 'none'\n");
 console.log('Static acceptance files built at '+out+'; not deployed. No images or credentials included.');
}else if(action==='serve'&&arg){
 const assets=process.env.BROWSER_VM_PROBE_ASSETS,isoAssets=process.env.BROWSER_VM_PROBE_ISO_ASSETS;
 if(!assets||!isoAssets)throw Error('Explicit BROWSER_VM_PROBE_ASSETS and BROWSER_VM_PROBE_ISO_ASSETS required');
 const verifiedAssets=new Map();for(const a of ALPINE_ISO_ARTIFACTS){const path=join(a.location==='engine'?resolve('node_modules/v86/build'):a.location==='boot'?assets:isoAssets,a.name);verifiedAssets.set(a.role,await verifyImageBytes(await readFile(path),a));}
 const {startBrowserAcceptance}=await import('./helpers/connector-browser-harness.mjs');
 const server=await startBrowserAcceptance({allowedOrigin:arg,verifiedAssets});
 console.log('Local operator page: '+server.url+'/');console.log('Only approved preview origin: '+arg);console.log('Ephemeral test authority; no public dial until explicit browser start. Ctrl+C to stop. Maximum lifetime 20 minutes.');
 const timer=setTimeout(stop,20*60*1000);async function stop(){clearTimeout(timer);await server.close();process.exit(0);}process.once('SIGINT',stop);process.once('SIGTERM',stop);
}else throw Error('Usage: node scripts/browser-vm-connector-acceptance.mjs build OUTPUT_DIR | serve EXACT_HTTPS_ORIGIN');
