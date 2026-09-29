// Development-only browser acceptance service. Never imported by production.
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fixture, pair } from './connector-authority-fixture.mjs';
import { ALPINE_ISO_ARTIFACTS } from '../../tools/browser-vm/alpine-iso.mjs';

export async function startBrowserAcceptance({allowedOrigin,verifiedAssets}) {
 const parsed=new URL(allowedOrigin);
 if(parsed.protocol!=='https:'||parsed.origin!==allowedOrigin||!(verifiedAssets instanceof Map))throw Error('Explicit HTTPS origin and verified assets required');
 const roles=new Set(ALPINE_ISO_ARTIFACTS.map(a=>a.role));
 for(const [role,bytes] of verifiedAssets)if(!roles.has(role)||!(bytes instanceof Uint8Array))throw Error('Invalid fixed asset');
 const capability=randomBytes(32).toString('base64url'), key=Buffer.from(capability), cleaners=[], sockets=new Set();
 let url,host,started=false,stopped=false,initializing,authority,closing;
 const exactHeader=(req,name,value)=>req.rawHeaders.filter((_,i)=>i%2===0&&req.rawHeaders[i].toLowerCase()===name).length===1&&req.headers[name]===value;
 function authorized(req){const value=req.headers['x-harness-key'];return typeof value==='string'&&Buffer.byteLength(value)===43&&timingSafeEqual(Buffer.from(value),key);}
 async function readBody(req){let body='';for await(const part of req){body+=part.toString('utf8');if(Buffer.byteLength(body)>512)throw Object.assign(Error('Too large'),{status:413});}return body;}
 const server=createServer((req,res)=>{void handle(req,res).catch(error=>{if(!res.destroyed){res.writeHead(error.status??503);res.end();}});});
 server.maxConnections=12;server.maxHeadersCount=24;server.headersTimeout=5000;server.requestTimeout=5000;server.timeout=5000;
 server.on('connection',socket=>{sockets.add(socket);socket.on('error',()=>{});socket.once('close',()=>sockets.delete(socket));});
 async function handle(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'; form-action 'none'");
  const end=(status,body='')=>{res.writeHead(status);res.end(body);};
  if(stopped||!exactHeader(req,'host',host))return end(403);
  if(req.url==='/'&&req.method==='GET'){
   if(req.headers.origin!==undefined)return end(403);
   res.setHeader('Content-Type','text/html; charset=utf-8');
   return end(200,`<!doctype html><html lang="zh"><meta charset="utf-8"><title>VM 验收本机控制</title><h1>仅开发验收</h1><p>仅将临时能力值输入你已批准的 HTTPS 验收页；不要发送到聊天或写入URL。</p><label>本机地址<input readonly value="${url}"></label><label>临时能力值<input type="password" readonly value="${capability}"></label><p>Ctrl+C 停止本机服务；无开机自启。</p></html>`);
  }
  if(!exactHeader(req,'origin',allowedOrigin))return end(403);
  const path=req.url;
  const assetRole=path?.startsWith('/asset/')?path.slice(7):undefined;
  if(!['/start','/renew'].includes(path)&&!roles.has(assetRole))return end(404);
  if(req.method==='OPTIONS'){
   const method=req.headers['access-control-request-method'];const requested=(req.headers['access-control-request-headers']??'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
   if(!['GET','POST'].includes(method)||requested.some(h=>!['content-type','x-harness-key'].includes(h)))return end(403);
   res.setHeader('Access-Control-Allow-Origin',allowedOrigin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET, POST');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Harness-Key');return end(204);
  }
  if(!authorized(req))return end(403);
  res.setHeader('Access-Control-Allow-Origin',allowedOrigin);res.setHeader('Vary','Origin');
  if(assetRole){if(req.method!=='GET')return end(405);const bytes=verifiedAssets.get(assetRole);if(!bytes)return end(404);res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Length',bytes.byteLength);return end(200,bytes);}
  if(req.method!=='POST'||req.headers['content-type']!=='application/json')return end(405);
  // Read under explicit bound without iterator-destroying the socket before 413.
  const declared=Number(req.headers['content-length']??0);if(declared>512){res.setHeader('Connection','close');return end(413);}
  const body=await readBody(req);
  if(path==='/start'){
   if(body!=='')return end(400);if(started)return end(409);started=true;
   initializing=fixture({after:fn=>cleaners.push(fn)},undefined,{allowedOrigin,realtime:true});
   authority=await initializing;if(stopped)return end(503);
   const config={url:authority.server.url.replace('http:','ws:')+'/connector',ticket:authority.ticket,pairingCode:await pair(authority)};
   res.setHeader('Content-Type','application/json');return end(201,JSON.stringify(config));
  }
  let data;try{data=JSON.parse(body);}catch{return end(400);}
  if(!data||typeof data!=='object'||Object.keys(data).length!==1||typeof data.leaseId!=='string'||data.leaseId.length>128||!data.leaseId.length)return end(400);
  if(!authority||stopped)return end(409);
  const ticket=await authority.renewal(data.leaseId);res.setHeader('Content-Type','application/json');return end(201,JSON.stringify({ticket}));
 }
 server.listen(0,'127.0.0.1');await once(server,'listening');host=`127.0.0.1:${server.address().port}`;url=`http://${host}`;
 function close(){if(closing)return closing;stopped=true;closing=(async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));await initializing?.catch(()=>{});for(const fn of cleaners.reverse())await fn();})();return closing;}
 return {url,capability,close};
}
