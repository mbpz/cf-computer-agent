import { DurableObject } from 'cloudflare:workers';
import type { Permit, Snapshot } from './contracts';

export class MaintenanceCoordinator extends DurableObject<unknown> {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    ctx.storage.transactionSync(() => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS control (
        singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
        epoch INTEGER NOT NULL, window TEXT, resumed_window TEXT
      )`);
      ctx.storage.sql.exec('INSERT OR IGNORE INTO control VALUES (1, 0, NULL, NULL)');
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS permits (
        id TEXT PRIMARY KEY, epoch INTEGER NOT NULL,
        done INTEGER NOT NULL CHECK(done IN (0, 1))
      )`);
    });
  }

  acquire(id: string): Permit | null {
    validateId(id);
    return this.ctx.storage.transactionSync(() => {
      const state = this.status();
      if (state.phase !== 'OPEN') return null;
      if (this.ctx.storage.sql.exec('SELECT id FROM permits WHERE id = ?', id).toArray().length) {
        throw new Error('PERMIT_REUSED');
      }
      const { count } = this.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM permits').one();
      // Keep replay tombstones. Exhaustion fails closed; never expire an orphan.
      if (count >= 10_000) throw new Error('CAPACITY_EXCEEDED');
      this.ctx.storage.sql.exec('INSERT INTO permits VALUES (?, ?, 0)', id, state.epoch);
      return { id, epoch: state.epoch };
    });
  }

  complete(permit: Permit): Snapshot {
    validateId(permit?.id);
    validateEpoch(permit?.epoch);
    return this.ctx.storage.transactionSync(() => {
      const rows = this.ctx.storage.sql.exec<{ epoch: number }>('SELECT epoch FROM permits WHERE id = ?', permit.id).toArray();
      if (rows.length !== 1 || rows[0].epoch !== permit.epoch) throw new Error('PERMIT_MISMATCH');
      this.ctx.storage.sql.exec('UPDATE permits SET done = 1 WHERE id = ?', permit.id);
      return this.status();
    });
  }

  beginDrain(window: string, epoch: number): Snapshot {
    validateId(window);
    validateEpoch(epoch);
    return this.ctx.storage.transactionSync(() => {
      const state = this.status();
      if (state.epoch !== epoch) throw new Error('STALE_CONTROL');
      if (state.window !== null && state.window !== window) throw new Error('WINDOW_CONFLICT');
      this.ctx.storage.sql.exec('UPDATE control SET window = ? WHERE singleton = 1', window);
      return this.status();
    });
  }

  resume(window: string, epoch: number): Snapshot {
    validateId(window);
    validateEpoch(epoch);
    return this.ctx.storage.transactionSync(() => {
      const state = this.status();
      const { resumed_window } = this.ctx.storage.sql.exec<{ resumed_window: string | null }>(
        'SELECT resumed_window FROM control WHERE singleton = 1',
      ).one();
      // Retry is safe only while still OPEN after precisely this resume.
      if (state.phase === 'OPEN' && state.epoch === epoch + 1 && resumed_window === window) return state;
      if (state.epoch !== epoch) throw new Error('STALE_CONTROL');
      if (state.window !== window) throw new Error('WINDOW_CONFLICT');
      if (state.active !== 0) throw new Error('ACTIVE_WORK');
      validateEpoch(epoch + 1);
      this.ctx.storage.sql.exec('UPDATE control SET epoch = ?, window = NULL, resumed_window = ? WHERE singleton = 1', epoch + 1, window);
      return this.status();
    });
  }

  status(): Snapshot {
    const state = this.ctx.storage.sql.exec<{ epoch: number; window: string | null }>(
      'SELECT epoch, window FROM control WHERE singleton = 1',
    ).one();
    const { active } = this.ctx.storage.sql.exec<{ active: number }>(
      'SELECT COUNT(*) AS active FROM permits WHERE done = 0',
    ).one();
    return { ...state, active, phase: state.window === null ? 'OPEN' : active === 0 ? 'DRAINED' : 'DRAINING' };
  }
}

function validateId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('INVALID_ID');
}

function validateEpoch(epoch: unknown): asserts epoch is number {
  if (typeof epoch !== 'number' || !Number.isSafeInteger(epoch) || epoch < 0) throw new Error('INVALID_EPOCH');
}
