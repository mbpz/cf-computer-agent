import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const productionEntry = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
const workerConfig = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

test('production entry is wired through the guarded maintenance coordinator', () => {
  assert.match(productionEntry, /export \{ MaintenanceCoordinator \} from ["']\.\/maintenance\/coordinator["'];/);
  assert.match(productionEntry, /mode:\s*["']guarded["']/);
  assert.match(productionEntry, /env\.MAINTENANCE\.getByName\(["']production["']\)/);
});

test('wrangler declares the production maintenance durable object and migration', () => {
  const bindings = workerConfig.durable_objects?.bindings ?? [];
  assert.ok(bindings.some(binding => binding.name === 'MAINTENANCE' && binding.class_name === 'MaintenanceCoordinator'));
  assert.ok(workerConfig.migrations?.some(migration => migration.tag === 'v3'
    && migration.new_sqlite_classes?.includes('MaintenanceCoordinator')));
});
