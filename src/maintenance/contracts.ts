/** A capability for one admitted root and all explicitly tracked descendants. */
export interface Permit { id: string; epoch: number }

/** DRAINED is local registration evidence, NOT a global D1 freeze. */
export interface Snapshot {
  phase: 'OPEN' | 'DRAINING' | 'DRAINED';
  epoch: number;
  window: string | null;
  active: number;
}

export type CapacityAlert = 'NONE' | 'WARNING' | 'CRITICAL' | 'EXHAUSTED';

/** Read-only operator evidence; querying it never releases a permit. */
export interface CapacitySnapshot extends Snapshot {
  records: number;
  tombstones: number;
  capacityLimit: number;
  capacityRemaining: number;
  alert: CapacityAlert;
  requiresManualReview: boolean;
}

export interface MaintenanceClient {
  acquire(id: string): Promise<Permit | null>;
  complete(permit: Permit): Promise<Snapshot>;
}

/** Separate operations capability; business clients never receive the credential. */
export interface MaintenanceControlClient {
  status(): Promise<Snapshot>;
  capacity(): Promise<CapacitySnapshot>;
  beginDrain(window: string, epoch: number, capability: string): Promise<Snapshot>;
  resume(window: string, epoch: number, capability: string): Promise<Snapshot>;
}
