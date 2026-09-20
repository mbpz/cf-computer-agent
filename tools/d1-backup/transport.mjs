import { fail, LIMITS, validateIdentity } from './core.mjs';

const DEFAULTS={maxResponseBytes:2*1024*1024,maxRequests:5000,timeoutMs:30_000,totalMs:20*60_000};
function readQuery(sql) {
  if(typeof sql!=='string' || Buffer.byteLength(sql)>LIMITS.maxSqlBytes || /;|--|\/\*/.test(sql)) fail('READ_QUERY_REJECTED');
  if(/^PRAGMA (?:table_list|table_xinfo\("[A-Za-z_][A-Za-z0-9_]*"\))$/.test(sql)) return;
  // Defense in depth for collector-generated SQL, not an interface for arbitrary user SQL.
  if(!/^SELECT\s/.test(sql) || /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|ATTACH|DETACH|VACUUM|PRAGMA|load_extension|writefile|readfile)\b/i.test(sql)) fail('READ_QUERY_REJECTED');
}
export function createReadSource(options) {
  const {identity,token,fetch:fetcher=globalThis.fetch}=options;
  validateIdentity(identity);
  if(typeof token!=='string' || !token.length || /[\r\n]/.test(token)) fail('READ_TOKEN_REQUIRED');
  const limits={...DEFAULTS};
  for(const key of Object.keys(DEFAULTS)) if(options[key]!==undefined) {
    if(!Number.isSafeInteger(options[key]) || options[key]<1 || options[key]>DEFAULTS[key]) fail('INVALID_LIMIT');
    limits[key]=options[key];
  }
  const pinned=Object.freeze({...identity});
  const endpoint=`https://api.cloudflare.com/client/v4/accounts/${pinned.accountId}/d1/database/${pinned.databaseId}/query`;
  const deadline=Date.now()+limits.totalMs;
  let requests=0;
  return Object.freeze({identity:pinned,async query(sql) {
    readQuery(sql);
    if(requests>=limits.maxRequests || Date.now()>=deadline) fail('READ_BUDGET_EXCEEDED');
    requests++;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),Math.min(limits.timeoutMs,deadline-Date.now()));
    let reader;
    try {
      const response=await fetcher(endpoint,{
        method:'POST',redirect:'error',signal:controller.signal,
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({sql}),
      });
      if(!response.ok || response.redirected || !response.body || Number(response.headers.get('content-length')??0)>limits.maxResponseBytes) fail('RESPONSE');
      reader=response.body.getReader();
      const chunks=[];
      let bytes=0;
      while(true) {
        const part=await reader.read();
        if(part.done) break;
        bytes+=part.value.byteLength;
        if(bytes>limits.maxResponseBytes) fail('RESPONSE');
        chunks.push(part.value);
      }
      const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const result=payload.result?.[0];
      if(payload.success!==true || !Array.isArray(payload.result) || payload.result.length!==1 || (payload.errors?.length??0)!==0 || result?.success!==true || result.meta?.rows_written!==0 || result.meta?.changed_db!==false || !Array.isArray(result.results)) fail('RESPONSE');
      return result.results;
    } catch {
      controller.abort();
      if(reader) await reader.cancel().catch(()=>{});
      fail('READ_REQUEST_FAILED'); // Never print provider bodies, SQL, token, row values or causes.
    } finally {
      clearTimeout(timeout);
      reader?.releaseLock();
    }
  }});
}
