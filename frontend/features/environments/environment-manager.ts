import type { EnvironmentMetadata, EnvironmentType } from '../../../shared/environments';
import { apiFetch, ApiRequestError, type Fetcher } from '../../lib/api';
import type { AccountNetworkOwner } from './account-network-owner.mjs';

type Filter = '' | EnvironmentType;
type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
type Intent = Readonly<{kind: 'create' | 'rename' | 'delete'; path: string; method: string; body: string; expected: Record<string, unknown>}>;
type State = Readonly<{items: readonly EnvironmentMetadata[]; pagination: Pagination; filter: Filter; loading: boolean; writing: boolean; pending: Intent | null; error: string | null; closed: boolean}>;
const managers = new WeakMap<AccountNetworkOwner, ReturnType<typeof createManager>>();
/** Keep unknown writes across route unmounts, but never across account lifetimes. */
export function getEnvironmentManager(owner: AccountNetworkOwner, requester?: Fetcher) {
  let manager = managers.get(owner);
  if (!manager) { manager = createManager(owner, requester); managers.set(owner, manager); }
  return manager;
}
const invalid = () => { throw new Error('INVALID_RESPONSE'); };
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
const id = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x);
const integer = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
const date = (x: unknown): x is string => typeof x === 'string' && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
function name(input: unknown): string { if (typeof input !== 'string' || !input.trim() || input.length > 512 || [...input.trim()].length > 120 || /[\u0000-\u001f\u007f]/.test(input)) throw Error('INVALID_INPUT'); return input.trim(); }
export function parseEnvironmentMetadata(value: unknown, memberId: string): EnvironmentMetadata {
  const x = record(value);
  if (!id(x.id) || x.memberId !== memberId || typeof x.name !== 'string' || name(x.name) !== x.name || !['personal','temporary'].includes(String(x.type))
    || !(x.taskId === null || typeof x.taskId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(x.taskId))
    || !integer(x.version) || x.version < 1 || !date(x.createdAt) || !date(x.updatedAt)) return invalid();
  return Object.freeze({...x}) as unknown as EnvironmentMetadata;
}
function createManager(owner: AccountNetworkOwner, requester?: Fetcher) {
  let state: State = Object.freeze({items: [], pagination: {page: 1,pageSize: 20,total: 0,totalPages: 0},filter: '',loading: false,writing: false,pending: null,error: null,closed: false});
  let read: AbortController | undefined;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<State>) => { state = Object.freeze({...state,...patch}); for (const listener of listeners) listener(); };
  const current = () => { if (owner.signal.aborted) throw Error('ACCOUNT_CLOSED'); };
  const close = () => { read?.abort(); publish({closed: true,items: [],pending: null,loading: false,writing: false,error: 'ACCOUNT_CLOSED'}); };
  owner.signal.addEventListener('abort', close, {once: true});
  if (owner.signal.aborted) close();
  async function request(path: string, init: RequestInit, cancel?: AbortSignal) {
    const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(), 10000);
    const signal = AbortSignal.any([owner.signal,deadline.signal,...(cancel ? [cancel] : [])]);
    let abort: () => void = () => {};
    try {
      current();
      return await Promise.race([apiFetch<unknown>(path, {...init,requester,signal,redirect: 'error',cache: 'no-store'}),new Promise<never>((_,reject) => {
        abort = () => reject(Error('CANCELLED')); signal.addEventListener('abort',abort,{once: true}); if (signal.aborted) abort();
      })]);
    } finally { clearTimeout(timer); signal.removeEventListener('abort',abort); }
  }
  function unauthorized(error: unknown) {
    if (error instanceof ApiRequestError && [401,403].includes(error.status)) { owner.revoke(); return true; } return false;
  }
  async function load(page = state.pagination.page, filter: Filter = state.filter) {
    current();
    if (!integer(page) || page < 1 || page > 500 || !['','personal','temporary'].includes(filter)) throw Error('INVALID_INPUT');
    read?.abort(); const attempt = new AbortController(); read = attempt;
    publish({items: [],loading: true,filter,error: state.pending ? state.error : null});
    try {
      const raw = record(await request(`/api/environments?page=${page}&pageSize=20${filter ? `&type=${filter}` : ''}`,{method: 'GET'},attempt.signal));
      current(); if (read !== attempt) return;
      const p = record(raw.pagination);
      if (!Array.isArray(raw.items) || p.page !== page || p.pageSize !== 20 || !integer(p.total) || p.totalPages !== Math.ceil(p.total/20)
        || raw.items.length !== Math.max(0,Math.min(20,p.total-(page-1)*20))) invalid();
      const items = (raw.items as unknown[]).map(x => parseEnvironmentMetadata(x,owner.scope.memberId));
      if (new Set(items.map(x => x.id)).size !== items.length || filter && items.some(x => x.type !== filter)) invalid();
      publish({items:Object.freeze(items),pagination: p as Pagination});
    } catch (error) {
      if (read !== attempt || owner.signal.aborted) return;
      if (!unauthorized(error)) publish({items: [],error: error instanceof ApiRequestError ? 'READ_FAILED' : 'INVALID_RESPONSE'});
    } finally { if (read === attempt && !owner.signal.aborted) publish({loading: false}); }
  }
  async function execute(intent: Intent) {
    current(); if (state.writing) throw Error('WRITE_PENDING');
    read?.abort(); read = undefined;
    publish({pending: intent,writing: true,loading: false,error: null});
    try {
      const result = record(await request(intent.path,{method:intent.method,headers:{'content-type':'application/json'},body:intent.body}));
      current();
      if (intent.kind === 'delete') {
        const x = record(result.tombstone);
        if (x.environmentId !== intent.expected.id || x.version !== intent.expected.version || !date(x.deletedAt)) invalid();
      } else {
        const x = parseEnvironmentMetadata(result.environment,owner.scope.memberId);
        for (const [key,value] of Object.entries(intent.expected)) if (x[key as keyof EnvironmentMetadata] !== value) invalid();
      }
      publish({pending:null,writing:false});
      await load();
    } catch (error) {
      if (owner.signal.aborted) return;
      if (unauthorized(error)) return;
      // Explicit server rejection is not an unknown transport outcome. A stale
      // version must be re-read and confirmed again, never silently rebased.
      if (error instanceof ApiRequestError && [400,404,409,422].includes(error.status)) publish({pending:null,writing:false,items:[],error:'WRITE_REJECTED'});
      else publish({writing:false,error:'WRITE_UNKNOWN'});
    }
  }
  function begin(kind: Intent['kind'],path: string,method: string,body: Record<string,unknown>,expected: Record<string,unknown>) {
    current(); if (state.pending) throw Error('WRITE_PENDING');
    const intent = Object.freeze({kind,path,method,body:JSON.stringify({operationId:crypto.randomUUID(),...body}),expected:Object.freeze(expected)});
    if (kind === 'delete') owner.removeEnvironment(expected.id as string);
    return execute(intent);
  }
  const check = (item: EnvironmentMetadata) => { current(); if (!id(item.id) || item.memberId !== owner.scope.memberId || !integer(item.version) || item.version < 1 || item.version >= Number.MAX_SAFE_INTEGER) throw Error('INVALID_INPUT'); };
  return Object.freeze({getSnapshot: () => state,subscribe: (listener: () => void) => {listeners.add(listener);return () => {listeners.delete(listener);};},load,
    async create(input: {name:string;type:EnvironmentType;taskId?:string}) {
      const title=name(input.name),taskId=input.taskId?.trim() || null;
      if (!['personal','temporary'].includes(input.type) || taskId !== null && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(taskId)) throw Error('INVALID_INPUT');
      return begin('create','/api/environments','POST',{name:title,type:input.type,taskId},{name:title,type:input.type,taskId,version:1});
    },
    async rename(item: EnvironmentMetadata,title:string) {check(item);const value=name(title);return begin('rename',`/api/environments/${item.id}`,'PATCH',{version:item.version,name:value},{id:item.id,version:item.version+1,name:value,type:item.type,taskId:item.taskId});},
    async remove(item: EnvironmentMetadata) {check(item);return begin('delete',`/api/environments/${item.id}`,'DELETE',{version:item.version},{id:item.id,version:item.version+1});},
    async retry() {current();if (!state.pending) throw Error('NO_PENDING_WRITE');return execute(state.pending);},
  });
}
export type EnvironmentManager = ReturnType<typeof getEnvironmentManager>;
