import { CONTROL_TOKEN } from './control-fixtures';
import type { Snapshot } from '../../src/maintenance/contracts';

/** Synthetic-only capability. Production control is intentionally not wired. */
export const LOCAL_CONTROL_TOKEN = CONTROL_TOKEN;

type RawControlClient = {
  beginDrain(window: string, epoch: number, capability: string): PromiseLike<Snapshot>;
  resume(window: string, epoch: number, capability: string): PromiseLike<Snapshot>;
};

type AuthorizedControlClient<T extends RawControlClient> = Omit<T, 'beginDrain' | 'resume'> & {
  beginDrain(window: string, epoch: number): PromiseLike<Snapshot>;
  resume(window: string, epoch: number): PromiseLike<Snapshot>;
};

/** Adds the synthetic capability at the test boundary; callers never get a raw control client. */
export function authorizedMaintenance<T extends RawControlClient>(
  client: T,
): AuthorizedControlClient<T> {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === 'beginDrain') {
        return (window: string, epoch: number) => target.beginDrain(window, epoch, LOCAL_CONTROL_TOKEN);
      }
      if (property === 'resume') {
        return (window: string, epoch: number) => target.resume(window, epoch, LOCAL_CONTROL_TOKEN);
      }
      return Reflect.get(target, property, receiver);
    },
  }) as unknown as AuthorizedControlClient<T>;
}
