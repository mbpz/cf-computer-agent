import type { FileRequest, FileResult } from '../../../tools/browser-vm/file-protocol.mjs';
import type { AccountNetworkOwner } from './account-network-owner.mjs';
export const VM_RUNTIME_LOCK: string;
export interface RuntimeEnvironment { readonly id: string; readonly memberId: string; readonly type: 'personal' | 'temporary'; }
export interface VmRuntimeSnapshot {
  readonly status: 'idle' | 'acquiring' | 'booting' | 'running' | 'stopping' | 'failed' | 'closed';
  readonly environmentId: string | null; readonly output: string; readonly reason: string;
}
export interface VmSession { readonly ready: Promise<void>; file?(input: FileRequest): Promise<FileResult>; write(text: string): Promise<void>; close(): void | Promise<void>; }
export interface AccountVmRuntime {
  getSnapshot(): VmRuntimeSnapshot; subscribe(listener: () => void): () => void;
  file(input: FileRequest): Promise<FileResult>;
  start(environment: RuntimeEnvironment): Promise<void>; stop(): Promise<void>; write(text: string): Promise<void>;
}
export function createAccountVmRuntime(options: {
  owner: AccountNetworkOwner; locks?: Pick<LockManager, 'request'> | null; bootTimeoutMs?: number;
  createSession(options: {environment: RuntimeEnvironment; onOutput(text: string): void; onClosed(): void}): VmSession;
}): AccountVmRuntime;
