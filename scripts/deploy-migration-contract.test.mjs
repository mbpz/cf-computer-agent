import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const scripts = manifest.scripts ?? {};

const runbookUrl = new URL('../docs/operations/2026-10-11-deploy-d1-migrations-runbook.md', import.meta.url);
const runbook = await readFile(runbookUrl, 'utf8').catch(() => null);

test('release applies pending remote migrations before deploying the Worker', () => {
  const release = scripts.release;
  assert.equal(typeof release, 'string', 'package.json must define a "release" script');
  const migrateIndex = release.indexOf('db:migrate:remote');
  const deployIndex = release.indexOf('deploy');
  assert.notEqual(migrateIndex, -1, '"release" must run npm run db:migrate:remote');
  assert.notEqual(deployIndex, -1, '"release" must run the deploy command after migrating');
  assert.ok(
    migrateIndex < deployIndex,
    `"release" must apply migrations before deploying; got: ${release}`,
  );
});

test('migration scripts target D1 with the matching environment flag', () => {
  const remote = scripts['db:migrate:remote'];
  const local = scripts['db:migrate:local'];
  assert.equal(typeof remote, 'string', 'package.json must define "db:migrate:remote"');
  assert.equal(typeof local, 'string', 'package.json must define "db:migrate:local"');
  assert.ok(remote.includes('d1 migrations apply'), `"db:migrate:remote" must run "d1 migrations apply"; got: ${remote}`);
  assert.ok(remote.includes('--remote'), `"db:migrate:remote" must pass --remote; got: ${remote}`);
  assert.ok(local.includes('d1 migrations apply'), `"db:migrate:local" must run "d1 migrations apply"; got: ${local}`);
  assert.ok(local.includes('--local'), `"db:migrate:local" must pass --local; got: ${local}`);
});

test('runbook documents the dashboard deploy command, verification, and rollback', () => {
  assert.ok(runbook !== null, 'docs/operations/2026-10-11-deploy-d1-migrations-runbook.md must exist');
  assert.ok(runbook.includes('npm run release'), 'runbook must document the dashboard deploy command "npm run release"');
  assert.ok(runbook.includes('d1 migrations list'), 'runbook must document the "d1 migrations list" verification command');
  assert.ok(runbook.includes('time-travel restore'), 'runbook must document the Time Travel rollback command');
  assert.ok(
    runbook.includes('FTS5') && runbook.includes('virtual tables'),
    'runbook must document the FTS5 virtual-table export limitation that forces Time Travel recovery',
  );
});

test('the smoke suite runs this deploy migration contract test', () => {
  const smoke = scripts['test:smoke'];
  assert.equal(typeof smoke, 'string', 'package.json must define "test:smoke"');
  assert.ok(
    smoke.includes('scripts/deploy-migration-contract.test.mjs'),
    `"test:smoke" must include scripts/deploy-migration-contract.test.mjs; got: ${smoke}`,
  );
});
