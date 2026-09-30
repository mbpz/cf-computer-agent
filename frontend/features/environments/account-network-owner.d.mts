export interface AccountNetworkScope { readonly origin: string; readonly memberId: string; readonly sessionEpoch: number; }
export interface AccountNetworkHandle {
  readonly state: Readonly<{status: string; reason: string}>;
  connect(input: {port: number; connectorId: string; pairingCode: string}): Promise<Readonly<{status: string; reason: string}>>;
  attach(machine: unknown): void;
  disconnect(): void;
  beforeRestore(): void;
  dispose(): void;
}
export interface AccountNetworkOwner {
  readonly scope: AccountNetworkScope;
  readonly signal: AbortSignal;
  assertEnvironment(environmentId: string): void;
  onEnvironmentRemoved(listener: (environmentId: string) => void): () => void;
  disconnectEnvironment(environmentId: string): void;
  network(environmentId: string): AccountNetworkHandle;
  removeEnvironment(environmentId: string): void;
  dispose(): void;
}
export function createAccountNetworkOwner(options: {
  origin: string; memberId: string; events?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  requester?: typeof fetch; NativeWebSocket?: typeof WebSocket;
  clock?: {monotonicNow(): number; wallNow(): number; setTimer(fn: () => void, ms: number): unknown; clearTimer(id: unknown): void};
}): AccountNetworkOwner;
