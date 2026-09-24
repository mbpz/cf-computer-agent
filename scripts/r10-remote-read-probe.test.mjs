import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const probe = new URL('./r10-remote-read-probe.mjs', import.meta.url).pathname;

test('R10 probe refuses to make a request without all read-only credentials', async () => {
  const result = await new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLOUDFLARE_D1_ACCOUNT_ID;
    delete env.CLOUDFLARE_D1_DATABASE_ID;
    delete env.CLOUDFLARE_D1_BACKUP_READ_TOKEN;
    const child = spawn(process.execPath, [probe], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'R10_READ_TOKEN_REQUIRED\n');
});
