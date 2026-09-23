import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';
import { CONTROL_TOKEN } from './control-fixtures';

export default defineConfig({
  plugins: [cloudflareTest({
    main: './tools/maintenance/worker.ts',
    remoteBindings: false,
    miniflare: {
      compatibilityDate: '2026-08-08',
      compatibilityFlags: ['nodejs_compat'],
      bindings: { MAINTENANCE_CONTROL_TOKEN: CONTROL_TOKEN },
      d1Databases: {
        SYNTHETIC_DB: 'maintenance-synthetic-only',
        SYNTHETIC_SESSION_DB: 'maintenance-session-synthetic-only',
      },
      r2Buckets: { SYNTHETIC_ORIGINALS: 'maintenance-synthetic-only' },
      // Resource bindings are local; any accidental public fetch is an error.
      outboundService: () => { throw new Error('UNEXPECTED_OUTBOUND'); },
      durableObjects: {
        MAINTENANCE: { className: 'MaintenanceCoordinator', useSQLite: true },
        KNOWLEDGE: { className: 'KnowledgeBase', useSQLite: true },
        AGENT_SESSIONS: { className: 'AgentSession', useSQLite: true },
      },
    },
  })],
  test: {
    include: ['tools/maintenance/*.test.ts'], fileParallelism: false,
    provide: { d1Migrations: await readD1Migrations('migrations') },
  },
});
