/** A capability for one admitted root and all explicitly tracked descendants. */
export interface Permit { id: string; epoch: number }

/** DRAINED is local registration evidence, NOT a global D1 freeze. */
export interface Snapshot {
  phase: 'OPEN' | 'DRAINING' | 'DRAINED';
  epoch: number;
  window: string | null;
  active: number;
}

export interface MaintenanceClient {
  acquire(id: string): Promise<Permit | null>;
  complete(permit: Permit): Promise<Snapshot>;
}
