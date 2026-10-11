#!/usr/bin/env node
/**
 * LOCAL ONLY — drive the HTTP authorization / isolation matrix against a locally running
 * `wrangler dev` for the synthetic members seeded by seed-local-members.mjs.
 *
 * Reads `.wrangler/acceptance-sessions.json` (written by the seed script). Asserts the
 * expected statuses for the session endpoint, every admin read endpoint (contributor 403
 * vs admin 200), the write boundary (contributor 403 vs admin 201, sent with the app's
 * canonical Origin so the 403 is authorization and not CSRF), and the member-scoped
 * favorite 404. Exits non-zero on any mismatch.
 *
 * It talks only to the local dev server; it never contacts a remote Worker/D1, deploys, or
 * reads a secret. A green run is a local smoke test, not D05/D06/D04/D08 acceptance.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SESSIONS_FILE = resolve(REPO_ROOT, ".wrangler", "acceptance-sessions.json");
const BASE_URL = process.env.ACCEPTANCE_BASE_URL || "http://127.0.0.1:8787";
const CANONICAL_ORIGIN = "https://memory.crgmhrc.asia";
const COOKIE_NAME = "__Host-memory-session";
const BOGUS_TOKEN = "B".repeat(43);

const ADMIN_READ_ENDPOINTS = [
  "/api/admin/menus",
  "/api/admin/members",
  "/api/admin/roles",
  "/api/admin/spaces",
  "/api/admin/assets",
  "/api/admin/duplicates",
  // pageSize must be one of supportedPageSizes = [20, 50, 100] (src/pagination.ts);
  // pageSize=10 is rejected with 400 before authorization is even considered.
  "/api/admin/audit-events?page=1&pageSize=20",
  "/api/admin/analytics/overview?days=7&page=1&pageSize=20",
  "/api/admin/submissions?page=1&pageSize=20",
];

const results = [];

function record(group, label, expected, actual) {
  results.push({ group, label, expected, actual, pass: expected === actual });
}

async function status(path, options = {}) {
  const headers = {};
  if (options.token) headers.Cookie = `${COOKIE_NAME}=${options.token}`;
  if (options.origin) headers.Origin = options.origin;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(new URL(path, BASE_URL), {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: "manual",
    });
  } catch (error) {
    throw new Error(`request to ${BASE_URL}${path} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return response.status;
}

function loadSessions() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(SESSIONS_FILE, "utf8"));
  } catch (error) {
    throw new Error(`cannot read ${SESSIONS_FILE}; run seed-local-members.mjs first (${error instanceof Error ? error.message : String(error)})`);
  }
  const byId = new Map((raw.members || []).map((member) => [member.id, member]));
  for (const id of ["acceptance-admin", "acceptance-contributor-1", "acceptance-contributor-2"]) {
    if (!byId.has(id)) throw new Error(`missing seeded member ${id} in ${SESSIONS_FILE}; re-run seed-local-members.mjs`);
  }
  return byId;
}

async function main() {
  const members = loadSessions();
  const admin = members.get("acceptance-admin").token;
  const contributor = members.get("acceptance-contributor-1").token;
  const contributor2 = members.get("acceptance-contributor-2").token;

  // Session endpoint.
  record("session", "admin GET /api/session", 200, await status("/api/session", { token: admin }));
  record("session", "contributor-1 GET /api/session", 200, await status("/api/session", { token: contributor }));
  record("session", "contributor-2 GET /api/session", 200, await status("/api/session", { token: contributor2 }));
  record("session", "no cookie GET /api/session", 401, await status("/api/session", {}));
  record("session", "bogus 43-char token GET /api/session", 401, await status("/api/session", { token: BOGUS_TOKEN }));

  // Admin read surface: contributor denied, admin allowed.
  for (const endpoint of ADMIN_READ_ENDPOINTS) {
    record("admin-read", `contributor ${endpoint}`, 403, await status(endpoint, { token: contributor }));
    record("admin-read", `admin ${endpoint}`, 200, await status(endpoint, { token: admin }));
  }

  // Write boundary, sent with the canonical Origin so a 403 is authorization, not CSRF.
  const menuBody = {
    key: `acceptance-probe-${Date.now().toString(36)}`,
    labelKey: "NAV_HOME",
    groupName: "workspace",
    position: 999,
    requiredBits: "0x0",
  };
  record("write", "contributor POST /api/admin/menus (canonical Origin)", 403,
    await status("/api/admin/menus", { method: "POST", token: contributor, origin: CANONICAL_ORIGIN, body: menuBody }));
  record("write", "admin POST /api/admin/menus (canonical Origin)", 201,
    await status("/api/admin/menus", { method: "POST", token: admin, origin: CANONICAL_ORIGIN, body: menuBody }));

  // Member-scoped favorite write against an unreadable item must not disclose existence.
  record("member-scope", "contributor PUT /api/knowledge/<unreadable>/favorite", 404,
    await status("/api/knowledge/acceptance-unreadable-item/favorite", {
      method: "PUT",
      token: contributor,
      origin: CANONICAL_ORIGIN,
      body: { operationId: `acceptance-probe-${Date.now().toString(36)}` },
    }));

  // Compact PASS/FAIL table.
  const width = Math.max(...results.map((r) => r.label.length));
  console.log(`Authorization matrix against ${BASE_URL}\n`);
  for (const r of results) {
    const mark = r.pass ? "PASS" : "FAIL";
    const detail = r.pass ? String(r.expected) : `expected ${r.expected}, got ${r.actual}`;
    console.log(`${mark}  ${r.label.padEnd(width)}  ${detail}`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.error(`FAIL: ${failed.length} mismatch(es).`);
    process.exitCode = 1;
    return;
  }
  console.log("PASS: all authorization/isolation checks matched.");
}

main().catch((error) => {
  console.error("check-local-authorization failed.");
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Ensure `npx wrangler dev --port 8787` is running and seed-local-members.mjs has been run.");
  process.exitCode = 1;
});
