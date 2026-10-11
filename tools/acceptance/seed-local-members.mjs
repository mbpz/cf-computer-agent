#!/usr/bin/env node
/**
 * LOCAL ONLY — seed synthetic members into the local D1 for the acceptance kit.
 *
 * Creates 1 synthetic admin + 2 synthetic contributors, their `role_members` links and
 * one fresh `auth_sessions` row each (token_hash = SHA-256 hex of a 43-char base64url
 * token, matching src/identity/session.ts). Idempotent for the DB state: existing
 * sessions for the seeded members are replaced.
 *
 * Writes go through `npx wrangler d1 execute memory-garden-control-plane --local`, so
 * this never touches a remote D1, never deploys and never reads a secret or `.dev.vars`.
 * Tokens are synthetic and only meaningful on the local stack. The token|hash pairs are
 * persisted to `.wrangler/acceptance-sessions.json` (gitignored); they are printed to
 * stdout, never written into the repository.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATABASE = "memory-garden-control-plane";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SESSIONS_FILE = resolve(REPO_ROOT, ".wrangler", "acceptance-sessions.json");
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MEMBERS = [
  { id: "acceptance-admin", role: "admin", roleId: "role-admin", email: "acceptance-admin@example.invalid" },
  { id: "acceptance-contributor-1", role: "contributor", roleId: "role-contributor", email: "acceptance-contributor-1@example.invalid" },
  { id: "acceptance-contributor-2", role: "contributor", roleId: "role-contributor", email: "acceptance-contributor-2@example.invalid" },
];

function sqlText(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/gu, "''")}'`;
}

function newSessionToken() {
  const token = randomBytes(32).toString("base64url");
  if (token.length !== 43) throw new Error(`unexpected token length ${token.length}`);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

function d1Execute(sql) {
  return execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DATABASE, "--local", "--command", sql, "--json"],
    { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function main() {
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  const records = MEMBERS.map((member) => ({ ...member, ...newSessionToken() }));
  const seedIds = records.map((member) => member.id).map(sqlText).join(", ");

  const statements = [];
  for (const member of records) {
    statements.push(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at, last_seen_at)
       VALUES (${sqlText(member.id)}, ${sqlText(member.id)}, ${sqlText(member.email)}, ${sqlText(member.role)}, 'active', ${sqlText(createdAt)}, ${sqlText(createdAt)}, ${sqlText(createdAt)})
       ON CONFLICT(id) DO UPDATE SET role = excluded.role, status = 'active', updated_at = excluded.updated_at`,
    );
    statements.push(
      `INSERT OR REPLACE INTO role_members (role_id, member_id, created_at)
       VALUES (${sqlText(member.roleId)}, ${sqlText(member.id)}, ${sqlText(createdAt)})`,
    );
  }
  // Replace any previous synthetic sessions so re-running yields fresh tokens.
  statements.push(`DELETE FROM auth_sessions WHERE member_id IN (${seedIds})`);
  for (const member of records) {
    statements.push(
      `INSERT INTO auth_sessions (token_hash, member_id, created_at, expires_at, last_seen_at)
       VALUES (${sqlText(member.tokenHash)}, ${sqlText(member.id)}, ${sqlText(createdAt)}, ${sqlText(expiresAt)}, ${sqlText(createdAt)})`,
    );
  }

  d1Execute(statements.join(";\n"));

  mkdirSync(dirname(SESSIONS_FILE), { recursive: true });
  writeFileSync(
    SESSIONS_FILE,
    `${JSON.stringify({
      database: DATABASE,
      generatedAt: createdAt,
      expiresAt,
      cookieName: "__Host-memory-session",
      members: records.map((member) => ({
        id: member.id,
        role: member.role,
        roleId: member.roleId,
        token: member.token,
        tokenHash: member.tokenHash,
        cookie: `__Host-memory-session=${member.token}`,
      })),
    }, null, 2)}\n`,
    { mode: 0o600 },
  );

  console.log(`Seeded ${records.length} synthetic members into local D1 "${DATABASE}".`);
  for (const member of records) {
    console.log(`\n- ${member.id}  (role=${member.role}, ${member.roleId})`);
    console.log(`  token:  ${member.token}`);
    console.log(`  Cookie: __Host-memory-session=${member.token}`);
  }
  console.log(`\nSessions persisted to ${SESSIONS_FILE} (gitignored; synthetic local tokens only).`);
  console.log("Reminder: synthetic members are NOT a substitute for real-identity (D05) acceptance.");
}

try {
  main();
} catch (error) {
  const stderr = error && typeof error === "object" && "stderr" in error && error.stderr ? String(error.stderr) : "";
  console.error("seed-local-members failed.");
  if (stderr) console.error(stderr.trim());
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Ensure the local D1 is migrated (`npm run db:migrate:local`) and `wrangler dev` is not running.");
  process.exitCode = 1;
}
