import assert from 'node:assert/strict';
import test from 'node:test';
import { runProbe } from './probe.mjs';

// Explicit opt-in: downloaded development images are not production assets.
const assets = process.env.BROWSER_VM_PROBE_ASSETS;
const isoAssets = process.env.BROWSER_VM_PROBE_ISO_ASSETS;

test('verified complete Alpine ISO boots its own kernel and restores files in a new engine', {
  skip: (!assets || !isoAssets) && 'Set BROWSER_VM_PROBE_ASSETS and BROWSER_VM_PROBE_ISO_ASSETS',
  timeout: 120_000,
}, async () => {
  const evidence = await runProbe({ assets, isoAssets, image: 'alpine-iso' });
  assert.match(evidence.kernel, /^Linux version 6\.18\.35-0-virt /);
  assert.equal(evidence.alpine.release, '3.24.1');
  assert.equal(evidence.alpine.restoredRelease, '3.24.1');
  assert.equal(evidence.alpine.restoredPackageManager, evidence.alpine.packageManager);
  assert.equal(evidence.hostToGuest, 'vm-host-to-guest');
  assert.equal(evidence.guestToHost, 'vm-guest-to-host');
  assert.equal(evidence.restoredSharedFile, 'vm-guest-to-host');
  assert.equal(evidence.restoredPrivateFile, 'vm-private-memory-file');
  assert.equal(evidence.restoredCommandOutput, 'vm-restored-shell');
  assert.equal(evidence.commandFailureExitCode, 23);
  assert.equal(evidence.checkpoint.digestVerified, true);
  assert.equal(evidence.checkpoint.identitySource, 'verified-boot-bytes+declared-engine-module');
  assert.match(evidence.checkpoint.identity.imageVersion, /^alpine-virt-3\.24\.1-x86@[a-f0-9]{64}$/);
  assert.equal(evidence.bootArtifacts.length, 6);
  assert.equal(evidence.networkVerified, false);
  assert.equal(evidence.executionHost, 'node');
  console.log(JSON.stringify({ image: 'alpine-iso', bootMs: evidence.bootMs, snapshotBytes: evidence.snapshotBytes }));
});

test('real Linux exchanges files and restores them in a new engine instance', {
  skip: !assets && 'Set BROWSER_VM_PROBE_ASSETS to the development BIOS/kernel directory',
  timeout: 120_000,
}, async () => {
  const evidence = await runProbe({ assets });
  assert.equal(evidence.architecture, 'i686');
  assert.match(evidence.kernel, /^Linux version /);
  assert.match(evidence.guestTools, /^sh=\//m);
  for (const name of ['git', 'apk', 'openssl']) assert.match(evidence.guestTools, new RegExp(`^${name}=[^\\n]*$`, 'm'));
  assert.match(evidence.guestDate, /^20\d{2}-\d{2}-\d{2}T/);
  assert.equal(typeof evidence.caBundlePresent, 'boolean');
  assert.equal(evidence.hostToGuest, 'vm-host-to-guest');
  assert.equal(evidence.guestToHost, 'vm-guest-to-host');
  assert.equal(evidence.restoredSharedFile, 'vm-guest-to-host');
  assert.equal(evidence.restoredPrivateFile, 'vm-private-memory-file');
  assert.equal(evidence.restoredCommandOutput, 'vm-restored-shell');
  assert.equal(evidence.commandFailureExitCode, 23);
  assert.ok(evidence.snapshotBytes > 0);
  assert.ok(evidence.snapshotBytes <= 512 * 1024 * 1024);
  assert.equal(evidence.checkpoint.digestVerified, true);
  assert.equal(evidence.checkpoint.compatibilityVerified, true);
  assert.match(evidence.checkpoint.sha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.executionHost, 'node');
  assert.equal(evidence.networkVerified, false);
});

test('real Linux runs pinned Alpine userspace and restores its package manager', {
  skip: !assets && 'Set BROWSER_VM_PROBE_ASSETS; the pinned Alpine archive must also be present',
  timeout: 120_000,
}, async () => {
  const evidence = await runProbe({ assets, alpine: true });
  assert.equal(evidence.alpine.release, '3.24.1');
  assert.match(evidence.alpine.packageManager, /^apk-tools .*compiled for x86/m);
  assert.equal(evidence.alpine.restoredRelease, '3.24.1');
  assert.equal(evidence.alpine.restoredPackageManager, evidence.alpine.packageManager);
  assert.equal(typeof evidence.alpine.caBundlePresent, 'boolean');
  assert.equal(evidence.networkVerified, false);
});
