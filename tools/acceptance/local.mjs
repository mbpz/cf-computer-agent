import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PERMISSION_BITS } from "../../src/authorization/permission-bitmap.ts";
import { hashPassword } from "../../src/password/hash.ts";
import { digest, requireThat, uuid } from "./evidence.mjs";

export const repo = fileURLToPath(new URL("../../", import.meta.url));
const configFile = join(repo, "config/acceptance/wrangler.jsonc");
const databaseName = "memory-garden-local-acceptance";
const fixtureVersion = "batch-v1";
const profiles = new Set(["pagination", "recovery"]);
const expectedConfig = {
  name: databaseName, workers_dev: false, preview_urls: false, main: "../../src/index.ts",
  compatibility_date: "2026-07-26", compatibility_flags: ["nodejs_compat"],
  d1_databases: [{ binding: "DB", database_name: databaseName, database_id: "1c81f616-d687-4c85-b2e9-22c383d4b29a", migrations_dir: "../../migrations" }],
  durable_objects: { bindings: [
    { name: "KNOWLEDGE", class_name: "KnowledgeBase" }, { name: "AGENT_SESSIONS", class_name: "AgentSession" }, { name: "MAINTENANCE", class_name: "MaintenanceCoordinator" },
  ] },
  migrations: [
    { tag: "v1", new_sqlite_classes: ["KnowledgeBase"] }, { tag: "v2", new_sqlite_classes: ["AgentSession"] }, { tag: "v3", new_sqlite_classes: ["MaintenanceCoordinator"] },
  ],
  assets: { directory: "../../frontend/dist", binding: "ASSETS", run_worker_first: true }, vars: { ALLOW_INSECURE_LOCAL: "false" },
};
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
export async function preflight() {
  requireThat(await realpath(configFile) === await realpath(repo) + "/config/acceptance/wrangler.jsonc", "Refusing a redirected local config");
  const files = await readdir(dirname(configFile));
  requireThat(!files.some((name) => /^\.(?:dev\.vars|env)(?:\.|$)/u.test(name)), "Refusing developer environment files in the local acceptance config directory");
  const parsed = JSON.parse(await readFile(configFile, "utf8"));
  const snapshot = JSON.stringify(canonical(parsed));
  requireThat(snapshot === JSON.stringify(canonical(expectedConfig)), "Local config differs from the reviewed allowlist; no resource operations performed");
  return { target: "engineering", remote: false, bindingSha256: digest(snapshot), database: databaseName };
}

async function base() { return join(await realpath(tmpdir()), `memory-garden-acceptance-${process.getuid()}`); }
async function privateDirectory(path) {
  const stat = await lstat(path);
  requireThat(stat.isDirectory() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0, "Expected a private owned run directory");
}
function writePrivate(path, value) { return writeFile(path, value, { flag: "wx", mode: 0o600 }); }
function readJson(path) { return readFile(path, "utf8").then(JSON.parse); }
function assertRunId(runId) { requireThat(typeof runId === "string" && uuid.test(runId), "Expected an exact local run UUID"); }
function privateEnv(path) {
  return {
    HOME: path, TMPDIR: path, PATH: process.env.PATH ?? "/usr/bin:/bin", NODE_ENV: "development",
    WRANGLER_SEND_METRICS: "false", WRANGLER_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
  };
}
export function spawnWrangler(path, args) {
  return spawn(process.execPath, [join(repo, "node_modules/wrangler/bin/wrangler.js"), ...args,
    "--config", configFile, "--env-file", join(path, "local.env"), "--local", "--persist-to", join(path, "state")],
  { cwd: path, env: privateEnv(path), stdio: ["ignore", "pipe", "pipe"] });
}
async function wrangler(path, args) {
  const child = spawnWrangler(path, args);
  let out = ""; let err = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { out += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { err += chunk; });
  const code = await new Promise((done, reject) => { child.once("error", reject); child.once("close", done); });
  requireThat(code === 0, `Local Wrangler ${args.slice(0, 2).join(" ")} failed (${code}): ${err.trim().split("\n").find((line) => /error/i.test(line)) || "see isolated run logs"}`);
  return out;
}
const quoted = (value) => `'${String(value).replaceAll("'", "''")}'`;
const insert = (table, columns, values) => `INSERT INTO ${table} (${columns.join(",")}) VALUES (${values.map(quoted).join(",")});`;
const reviewerMask = `0x${((1n << BigInt(PERMISSION_BITS["knowledge:review"])) | (1n << BigInt(PERMISSION_BITS["submission:read-all"]))).toString(16)}`;
const aliases = { admin: "admin", reviewer: "contributor", contributor: "contributor", denied: "contributor" };
function identifiers(runId, profile) {
  const prefix = `acc-${runId}`;
  return {
    members: Object.fromEntries(Object.keys(aliases).map((alias) => [alias, `${prefix}-${alias}`])),
    pagination: Array.from({ length: profile === "pagination" ? 121 : 0 }, (_, index) => `${prefix}-page-${String(121 - index).padStart(3, "0")}`),
    recovery: profile === "recovery" ? [`${prefix}-recovery-a`, `${prefix}-recovery-b`] : [], control: `${prefix}-control`, role: `${prefix}-role-reviewer`,
  };
}

async function seed(path, runId, profile) {
  const ids = identifiers(runId, profile);
  const now = "2026-01-01T00:00:00.000Z";
  const lines = [];
  const credentials = [];
  for (const [alias, role] of Object.entries(aliases)) {
    const id = ids.members[alias];
    const email = `${id}@example.test`;
    const password = randomBytes(24).toString("base64url");
    lines.push(insert("members", ["id", "access_sub", "email", "role", "status", "created_at", "updated_at", "password_hash"], [id, `password:${email}`, email, role, "active", now, now, await hashPassword(password)]));
    credentials.push({ alias, email, password });
  }
  const mask = reviewerMask;
  lines.push(insert("roles", ["id", "key", "name", "allow_bits", "status", "is_system", "created_at", "updated_at"], [ids.role, ids.role, "Acceptance delegated reviewer", mask, "active", 0, now, now]));
  lines.push(insert("role_members", ["role_id", "member_id", "created_at"], [ids.role, ids.members.reviewer, now]));
  const content = "# Acceptance fixture\n\nSynthetic note.\n";
  for (const id of [...ids.pagination, ...ids.recovery, ids.control]) {
    const pagination = ids.pagination.includes(id);
    const stamp = pagination ? "2026-03-01T00:00:00.000Z" : "2026-02-01T00:00:00.000Z";
    const title = `Acceptance ${id.slice(41)}`;
    lines.push(insert("submissions", ["id", "submitter_id", "requested_space_id", "kind", "status", "title", "content", "created_at", "updated_at", "requested_visibility"], [id, ids.members.contributor, "default", "markdown", id === ids.control ? "draft" : "review_pending", title, content, stamp, stamp, "shared"]));
    if (id === ids.control) continue;
    const sourceId = `source-${id}`;
    lines.push(insert("sources", ["id", "owner_id", "space_id", "kind", "title", "created_at", "updated_at"], [sourceId, ids.members.contributor, "default", "markdown", title, stamp, stamp]));
    lines.push(insert("source_versions", ["id", "source_id", "submission_id", "ordinal", "content", "content_sha256", "parser_version", "created_at"], [`version-${id}`, sourceId, id, 1, content, digest(content), "m1-v1", stamp]));
  }
  const sql = join(path, "seed.sql");
  await writePrivate(sql, lines.join("\n"));
  try { await wrangler(path, ["d1", "execute", databaseName, "--file", sql, "--yes", "--json"]); }
  finally { await rm(sql, { force: true }); }
  await writePrivate(join(path, "credentials.json"), JSON.stringify(credentials));
}

export async function localRows(path, sql) {
  const raw = await wrangler(path, ["d1", "execute", databaseName, "--command", sql, "--json"]);
  const [{ results, success }] = JSON.parse(raw);
  requireThat(success && Array.isArray(results), "Local D1 query did not succeed");
  return results;
}

export async function prepare(profile) {
  requireThat(profiles.has(profile), "Expected pagination or recovery profile");
  const { bindingSha256 } = await preflight();
  const root = await base();
  await mkdir(root, { recursive: true, mode: 0o700 });
  await privateDirectory(root);
  const runId = randomUUID();
  const stage = await mkdtemp(join(root, ".preparing-"));
  const path = join(root, runId);
  // Publish the recovery handle before running migrations. Failed prepares can still be cleaned by ID.
  await writePrivate(join(stage, "run.json"), JSON.stringify({ runId, fixtureVersion, bindingSha256, profile }));
  await writePrivate(join(stage, "local.env"), "# Deliberately empty. No Cloudflare, email or OAuth credentials.\n");
  await writePrivate(join(stage, "active"), `${process.pid}\n`);
  await rename(stage, path);
  try {
    await wrangler(path, ["d1", "migrations", "apply", databaseName]);
    await seed(path, runId, profile);
    await writePrivate(join(path, "ready"), "ready\n");
  } catch (error) { throw new Error(`Prepare failed; use clean ${runId}. ${error.message}`); }
  finally { await rm(join(path, "active")); }
  return { target: "engineering", fixtureVersion, profile, runId, credentialsFile: join(path, "credentials.json") };
}

async function runPath(runId, { allowMissing = false, disposing = false } = {}) {
  const { bindingSha256 } = await preflight();
  assertRunId(runId);
  const root = await base();
  const path = join(root, disposing ? `.disposing-${runId}` : runId);
  try { await privateDirectory(root); await privateDirectory(path); }
  catch (error) { if (allowMissing && error.code === "ENOENT") return null; throw error; }
  const manifest = await readJson(join(path, "run.json"));
  requireThat(manifest.runId === runId && manifest.fixtureVersion === fixtureVersion && manifest.bindingSha256 === bindingSha256 && profiles.has(manifest.profile), "Run ownership or binding fingerprint mismatch");
  return { path, profile: manifest.profile };
}

export async function withRun(runId, callback) {
  const { path, profile } = await runPath(runId);
  const lease = join(path, "active");
  await writePrivate(lease, `${process.pid}\n`);
  try {
    await lstat(join(path, "ready"));
    return await callback(path, identifiers(runId, profile), profile);
  } finally { await rm(lease); }
}

export async function serve(runId) {
  return withRun(runId, async (path) => {
    await lstat(join(repo, "frontend/dist/index.html"));
    const child = spawnWrangler(path, ["dev", "--ip", "127.0.0.1", "--port", "8787", "--show-interactive-dev-session=false"]);
    const terminate = () => child.kill("SIGTERM");
    process.once("SIGINT", terminate);
    process.once("SIGTERM", terminate);
    child.stdout.pipe(process.stdout, { end: false });
    child.stderr.pipe(process.stderr, { end: false });
    try {
      const { code, signal } = await new Promise((done, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => done({ code, signal }));
      });
      requireThat(code === 0 || signal === "SIGTERM" || signal === "SIGINT", `Local Worker exited with status ${code}`);
      return { runId, status: "stopped" };
    } finally {
      process.removeListener("SIGINT", terminate);
      process.removeListener("SIGTERM", terminate);
    }
  });
}

export async function verify(runId) {
  return withRun(runId, async (path, ids, profile) => {
    const members = await localRows(path, "SELECT id, role, status, password_hash IS NOT NULL AS hasPassword FROM members ORDER BY id");
    const roleMemberships = await localRows(path, "SELECT r.id AS roleId, r.allow_bits AS mask, r.status, rm.member_id AS memberId FROM role_members rm JOIN roles r ON r.id = rm.role_id");
    requireThat(roleMemberships.length === 1 && roleMemberships[0].roleId === ids.role && roleMemberships[0].memberId === ids.members.reviewer && roleMemberships[0].mask === reviewerMask && roleMemberships[0].status === "active", "Delegated role membership differs");
    const submissions = await localRows(path, "SELECT id, status FROM submissions ORDER BY created_at DESC, id DESC");
    const versions = await localRows(path, "SELECT submission_id AS id FROM source_versions ORDER BY submission_id");
    requireThat(members.length === 4 && members.every((row) => row.status === "active" && row.hasPassword === 1 && Object.entries(ids.members).some(([alias, id]) => id === row.id && row.role === aliases[alias])), "Fixture member set differs");
    const pending = submissions.filter((row) => row.status === "review_pending").map((row) => row.id);
    const expectedPending = [...ids.pagination, ...[...ids.recovery].reverse()];
    requireThat(JSON.stringify(pending) === JSON.stringify(expectedPending) && submissions.length === expectedPending.length + 1 && submissions.at(-1).id === ids.control && submissions.at(-1).status === "draft", "Fresh fixture queue/control differs");
    requireThat(JSON.stringify(versions.map((row) => row.id)) === JSON.stringify([...expectedPending].sort()), "Fixture source versions differ");
    const page2 = Object.fromEntries([50, 100].map((size) => [size, { count: pending.slice(size, size * 2).length, idsSha256: digest(JSON.stringify(pending.slice(size, size * 2))) }]));
    return { runId, fixtureVersion, profile, pending: pending.length, paginationFixtures: ids.pagination.length, recoveryFixtures: ids.recovery.length, page2, controlStatus: "draft" };
  });
}

export async function clean(runId) {
  const run = await runPath(runId, { allowMissing: true });
  if (run === null) {
    // A prior cleanup may have stopped after atomically quarantining the directory.
    const discarded = await runPath(runId, { allowMissing: true, disposing: true });
    if (discarded === null) return { runId, status: "absent", deleted: false };
    // Never infer ownership from a matching tombstone filename alone.
    await rm(discarded.path, { recursive: true, force: true });
  } else {
    const lease = join(run.path, "active");
    // Do not delete a sandbox being prepared or used by an active run.
    await writePrivate(lease, `${process.pid}\n`);
    const tomb = join(await base(), `.disposing-${runId}`);
    try { await rename(run.path, tomb); }
    catch (error) { await rm(lease); throw error; }
    await rm(tomb, { recursive: true, force: true });
  }
  await verifyClean(runId);
  return { runId, status: "absent", deleted: true };
}

export async function verifyClean(runId) {
  await preflight();
  assertRunId(runId);
  const root = await base();
  let entries;
  try { await privateDirectory(root); entries = await readdir(root); }
  catch (error) { if (error.code !== "ENOENT") throw error; entries = []; }
  requireThat(!entries.some((name) => name === runId || name === `.disposing-${runId}`), "Owned run directory or cleanup tombstone remains");
  return { runId, status: "absent" };
}
