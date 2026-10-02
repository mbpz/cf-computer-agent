/** Same-tab recovery only. Never stores credentials and never sends requests. */
export type EnvironmentOperationIntent = Readonly<{
  operationId: string; kind: 'create' | 'rename' | 'delete'; body: string;
  expected: Readonly<Record<string, unknown>>;
}>;
export type EnvironmentOperationStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Loaded = {status:'empty'} | {status:'blocked'} | {status:'ready';intent:EnvironmentOperationIntent};
const object = (x: unknown): x is Record<string,unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const keys = (x: Record<string,unknown>, names: string[]) => Object.keys(x).length === names.length && names.every(k=>Object.hasOwn(x,k));
const target = (x: unknown) => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x);
const version = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 1;
const title = (x: unknown) => typeof x === 'string' && !!x && x.trim() === x && x.length <= 512 && [...x].length <= 120 && !/[\u0000-\u001f\u007f]/.test(x);
const metadata = (x: Record<string,unknown>) => title(x.name) && (x.type === 'personal' || x.type === 'temporary') && (x.taskId === null || typeof x.taskId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(x.taskId));
function parse(value: unknown): EnvironmentOperationIntent {
  if (!object(value) || !keys(value,['operationId','kind','body','expected']) || typeof value.operationId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.operationId)
    || typeof value.body !== 'string' || value.body.length > 4096 || !object(value.expected)) throw Error('INVALID_INTENT');
  const body: unknown=JSON.parse(value.body), expected=value.expected;
  if (!object(body) || body.operationId !== value.operationId) throw Error('INVALID_INTENT');
  if (value.kind === 'create') {
    if (!keys(body,['operationId','name','type','taskId']) || !keys(expected,['name','type','taskId','version']) || !metadata(body)
      || expected.version !== 1 || ['name','type','taskId'].some(k=>expected[k] !== body[k])) throw Error('INVALID_INTENT');
  } else if (value.kind === 'rename' || value.kind === 'delete') {
    if (!target(expected.id) || !version(body.version) || body.version >= Number.MAX_SAFE_INTEGER || expected.version !== body.version+1) throw Error('INVALID_INTENT');
    if (value.kind === 'rename') {
      if (!keys(body,['operationId','version','name']) || !keys(expected,['id','version','name','type','taskId']) || !metadata(expected) || body.name !== expected.name) throw Error('INVALID_INTENT');
    } else if (!keys(body,['operationId','version']) || !keys(expected,['id','version'])) throw Error('INVALID_INTENT');
  } else throw Error('INVALID_INTENT');
  return Object.freeze({operationId:value.operationId,kind:value.kind,body:value.body,expected:Object.freeze({...expected})});
}
export function sameEnvironmentOperation(a: EnvironmentOperationIntent,b: EnvironmentOperationIntent) {
  return a.operationId === b.operationId && a.kind === b.kind && a.body === b.body
    && Object.keys(a.expected).length === Object.keys(b.expected).length && Object.entries(a.expected).every(([k,v])=>b.expected[k] === v);
}
export function createEnvironmentOperationJournal(scope: {origin:string;memberId:string}, supplied?: EnvironmentOperationStorage) {
  const key=`memory-garden:environment-operation:v1:${encodeURIComponent(scope.origin)}:${encodeURIComponent(scope.memberId)}`;
  const storage=()=>supplied ?? window.sessionStorage;
  function load(): Loaded {
    try {
      const raw=storage().getItem(key);if(raw === null)return {status:'empty'};
      if(raw.length > 16384)throw Error('INVALID_INTENT');
      const envelope: unknown=JSON.parse(raw);
      if(!object(envelope) || !keys(envelope,['version','origin','memberId','intent']) || envelope.version !== 1 || envelope.origin !== scope.origin || envelope.memberId !== scope.memberId)throw Error('INVALID_INTENT');
      return {status:'ready',intent:parse(envelope.intent)};
    } catch {return {status:'blocked'};}
  }
  function save(intent: EnvironmentOperationIntent) {
    try {
      parse(intent);const previous=load();
      if(previous.status === 'blocked' || previous.status === 'ready' && !sameEnvironmentOperation(previous.intent,intent))return false;
      storage().setItem(key,JSON.stringify({version:1,origin:scope.origin,memberId:scope.memberId,intent}));
      const next=load();return next.status === 'ready' && sameEnvironmentOperation(next.intent,intent);
    } catch {return false;}
  }
  function clear(intent: EnvironmentOperationIntent) {
    try {
      parse(intent);const previous=load();if(previous.status === 'empty')return true;
      if(previous.status !== 'ready' || !sameEnvironmentOperation(previous.intent,intent))return false;
      storage().removeItem(key);return storage().getItem(key) === null;
    } catch {return false;}
  }
  return Object.freeze({load,save,clear});
}
