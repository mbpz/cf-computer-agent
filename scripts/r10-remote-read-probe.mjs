import { createReadSource } from '../tools/d1-backup/transport.mjs';

const accountId = process.env.CLOUDFLARE_D1_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const token = process.env.CLOUDFLARE_D1_BACKUP_READ_TOKEN;

if (!accountId || !databaseId || !token) {
  console.error('R10_READ_TOKEN_REQUIRED');
  process.exitCode = 1;
} else {
  try {
    const source = createReadSource({
      identity: { accountId, databaseId },
      token,
      maxRequests: 4,
      maxResponseBytes: 256 * 1024,
      totalMs: 60_000,
    });
    const scalar = await source.query('SELECT 1 AS ok');
    const tables = await source.query('PRAGMA table_list');
    const columns = await source.query('PRAGMA table_xinfo("members")');
    console.log(JSON.stringify({
      mode: 'r10-remote-read-probe',
      accountId,
      databaseId,
      scalarRows: scalar.length,
      tableRows: tables.length,
      memberColumnRows: columns.length,
      writes: 0,
    }));
  } catch (error) {
    console.error(error?.message === 'READ_QUERY_REJECTED' ? error.message : 'R10_READ_PROBE_FAILED');
    process.exitCode = 1;
  }
}
