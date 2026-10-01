import { apiFetch, ApiRequestError, type Fetcher } from '../../lib/api';
import { parseSessionPayload } from '../../contracts/api';
import { parseEnvironmentMetadata } from './environment-manager';
import { createAccountVmRuntime } from './account-vm-runtime.mjs';

type Options = Omit<Parameters<typeof createAccountVmRuntime>[0], 'beforeStart'> & {
  requester?: Fetcher; timeoutMs?: number;
};

/** Authenticated composition boundary. G0 must pass before formal UI mounting.
 * Every explicit start/restore verifies current server authority before reading
 * local bytes or allocating a Worker. An offline/error response never falls back
 * to cached authority, and missing metadata never authorizes snapshot deletion.
 */
export function createAuthenticatedVmRuntime({requester, timeoutMs = 10000, ...options}: Options) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw Error('INVALID_TIMEOUT');
  const {owner} = options;
  return createAccountVmRuntime({...options, async beforeStart({environment, signal}) {
    owner.assertEnvironment(environment.id);
    const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(), timeoutMs);
    const cancel = AbortSignal.any([signal, owner.signal, deadline.signal]);
    let abort = () => {};
    const current = () => {
      if (cancel.aborted) throw Error('CANCELLED');
      owner.assertEnvironment(environment.id);
    };
    async function verify() {
      current();
      const init = {method:'GET', requester, signal:cancel, redirect:'error', cache:'no-store'} as const;
      const session = parseSessionPayload(await apiFetch<unknown>('/api/session', init));
      current();
      if (session.member.id !== owner.scope.memberId || !session.capabilities.includes('vm:use')) {
        owner.revoke();throw Error('ACCOUNT_AUTHORITY_CHANGED');
      }
      const response = await apiFetch<{environment:unknown}>(`/api/environments/${environment.id}`, init);
      current();
      const metadata = parseEnvironmentMetadata(response?.environment, owner.scope.memberId);
      if (metadata.id !== environment.id || metadata.type !== environment.type) throw Error('ENVIRONMENT_CHANGED');
    }
    try {
      await Promise.race([verify(), new Promise<never>((_,reject) => {
        abort = () => reject(Error('CANCELLED'));
        cancel.addEventListener('abort', abort, {once:true});
        if (cancel.aborted) abort();
      })]);
      current();
    } catch (error) {
      if (error instanceof ApiRequestError && [401,403].includes(error.status)) owner.revoke();
      throw error;
    } finally {
      clearTimeout(timer);cancel.removeEventListener('abort', abort);
    }
  }});
}
