#!/usr/bin/env node
/**
 * LOCAL ONLY — drive the contributor's ALLOWED create/read journeys against a locally
 * running `wrangler dev`, and prove the writes stay owner-scoped.
 *
 * The sibling `check-local-authorization.mjs` proves the DENIAL side (contributor 403 on
 * admin surfaces, cross-member reads isolated). This script proves the missing half: for the
 * flows a `role-contributor` mask (`0x1600c3` = bits 0,1,6,7,17,18,20) actually permits,
 * the write SUCCEEDS and a SECOND member cannot read it back.
 *
 * It reads `.wrangler/acceptance-sessions.json` (written by seed-local-members.mjs), talks
 * only to the local dev server, never contacts a remote Worker/D1, never deploys, never
 * migrates, and never reads a secret or `.dev.vars`. A green run is a local smoke test, not
 * D05/D06/D04/D08 acceptance.
 *
 * Flows exercised (endpoints verified in the source; see the header of each block):
 *   A. Submission draft  — POST /api/submissions/drafts, GET /api/submissions/drafts/:id,
 *                          GET /api/submissions/mine  (member scope: own only).
 *   B. Inbox item        — POST /api/inbox, GET /api/inbox/:id, GET /api/inbox.
 *   C. Task              — POST /api/tasks, GET /api/tasks/:id, GET /api/tasks.
 *
 * Every write is sent with the canonical `Origin` (src/app.ts:204-206 -> requireSameOrigin)
 * so a 2xx is a real authorization success and not an accidental CSRF bypass; without it
 * every unsafe member method is rejected 403 and the whole check would be meaningless.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SESSIONS_FILE = resolve(REPO_ROOT, ".wrangler", "acceptance-sessions.json");
const BASE_URL = process.env.ACCEPTANCE_BASE_URL || "http://127.0.0.1:8787";
const CANONICAL_ORIGIN = "https://memory.crgmhrc.asia";
const COOKIE_NAME = "__Host-memory-session";

const results = [];

function record(group, label, expected, actual, pass) {
  results.push({ group, label, expected, actual, pass: pass === undefined ? expected === actual : pass });
}

async function request(path, options = {}) {
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
  const text = await response.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = null; }
  }
  return { status: response.status, json, text };
}

function loadSessions() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(SESSIONS_FILE, "utf8"));
  } catch (error) {
    throw new Error(`cannot read ${SESSIONS_FILE}; run seed-local-members.mjs first (${error instanceof Error ? error.message : String(error)})`);
  }
  const byId = new Map((raw.members || []).map((member) => [member.id, member]));
  for (const id of ["acceptance-contributor-1", "acceptance-contributor-2"]) {
    if (!byId.has(id)) throw new Error(`missing seeded member ${id} in ${SESSIONS_FILE}; re-run seed-local-members.mjs`);
  }
  return byId;
}

function pageItems(body) {
  return body && typeof body === "object" && Array.isArray(body.items) ? body.items : [];
}

/** An active, non-legacy, writable space is required by the draft INSERT
 * (src/submissions/repository.ts:95-117, WHERE EXISTS ... kind != 'legacy' AND read_only = 0
 * AND status = 'active'). Discover one through the contributor-readable GET /api/spaces
 * rather than hard-coding an id, so the script does not depend on a specific fixture row. */
async function discoverActiveSpace(token) {
  const response = await request("/api/spaces", { token });
  if (response.status !== 200) throw new Error(`GET /api/spaces returned ${response.status}, cannot discover a writable space`);
  const space = pageItems(response.json).find((item) => item && item.kind !== "legacy" && item.readOnly !== true && item.status === "active");
  if (!space) throw new Error("no active writable (non-legacy) space found in GET /api/spaces");
  return space.id;
}

function printTable() {
  const width = Math.max(...results.map((r) => r.label.length));
  console.log(`Contributor positive-path journey against ${BASE_URL}\n`);
  for (const r of results) {
    const mark = r.pass ? "PASS" : "FAIL";
    const detail = r.pass ? String(r.expected) : `expected ${r.expected}, got ${r.actual}`;
    console.log(`${mark}  ${r.label.padEnd(width)}  ${detail}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    const groupWidth = Math.max(...failed.map((r) => r.group.length));
    console.error("FAIL: mismatches:");
    for (const r of failed) console.error(`  ${r.group.padEnd(groupWidth)}  ${r.label}: expected ${r.expected}, got ${r.actual}`);
    process.exitCode = 1;
    return;
  }
  console.log("PASS: contributor allowed flows succeeded and every created object stayed owner-scoped.");
}

async function main() {
  const members = loadSessions();
  const contributor = members.get("acceptance-contributor-1").token;
  const contributor2 = members.get("acceptance-contributor-2").token;
  const runTag = Date.now().toString(36);
  const spaceId = await discoverActiveSpace(contributor);
  console.log(`Discovered writable space: ${spaceId}\n`);

  // ---- Flow A: Submission draft (src/routes/member.ts:363-390, 431-441) ----------------
  // POST requires submission:create (bit 6); GET draft / GET mine require submission:read-own
  // (bit 7). createDraft persists the submitter_id and findOwnedDraft filters by it.
  const draftBody = {
    requestedSpaceId: spaceId,
    kind: "text",
    title: `acceptance-contributor journey ${runTag}`,
    content: `synthetic local draft ${runTag}`,
  };
  const draftCreate = await request("/api/submissions/drafts", { method: "POST", token: contributor, origin: CANONICAL_ORIGIN, body: draftBody });
  record("submission-draft", "contributor-1 POST /api/submissions/drafts", 201, draftCreate.status);
  const draftId = draftCreate.json && typeof draftCreate.json.id === "string" ? draftCreate.json.id : null;
  if (!draftId) {
    record("submission-draft", "draft response carried an id", "string id", JSON.stringify(draftCreate.json));
    printTable();
    return;
  }
  const draftOwn = await request(`/api/submissions/drafts/${encodeURIComponent(draftId)}`, { token: contributor });
  record("submission-draft", `contributor-1 GET /api/submissions/drafts/${draftId}`, 200, draftOwn.status);
  record("submission-draft", "contributor-1 draft read back the created id", draftId, draftOwn.json && draftOwn.json.id);
  const draftOther = await request(`/api/submissions/drafts/${encodeURIComponent(draftId)}`, { token: contributor2 });
  record("submission-draft", `contributor-2 GET draft ${draftId} (owner isolation)`, 404, draftOther.status);
  const mineOwn = await request("/api/submissions/mine", { token: contributor });
  record("submission-draft", "contributor-1 GET /api/submissions/mine", 200, mineOwn.status);
  record("submission-draft", "contributor-1 mine contains the draft", true, pageItems(mineOwn.json).some((item) => item && item.id === draftId));
  const mineOther = await request("/api/submissions/mine", { token: contributor2 });
  record("submission-draft", "contributor-2 GET /api/submissions/mine", 200, mineOther.status);
  record("submission-draft", "contributor-2 mine excludes the draft", false, pageItems(mineOther.json).some((item) => item && item.id === draftId));

  // ---- Flow B: Inbox item (src/routes/inbox.ts:22-45, 68-72) ---------------------------
  // Route-level requireCapability(principal, "tasks:use") (bit 20). findOwned filters by
  // member_id (src/inbox/repository.ts:39-41); listNumbered by member_id too (47-51).
  const inboxBody = { clientKey: `acceptance-journey-${runTag}`, kind: "text", content: `synthetic local inbox ${runTag}` };
  const inboxCreate = await request("/api/inbox", { method: "POST", token: contributor, origin: CANONICAL_ORIGIN, body: inboxBody });
  record("inbox", "contributor-1 POST /api/inbox", 201, inboxCreate.status);
  const inboxId = inboxCreate.json && inboxCreate.json.item && typeof inboxCreate.json.item.id === "string" ? inboxCreate.json.item.id : null;
  if (!inboxId) {
    record("inbox", "inbox response carried item.id", "string id", JSON.stringify(inboxCreate.json));
    printTable();
    return;
  }
  const inboxOwn = await request(`/api/inbox/${encodeURIComponent(inboxId)}`, { token: contributor });
  record("inbox", `contributor-1 GET /api/inbox/${inboxId}`, 200, inboxOwn.status);
  record("inbox", "contributor-1 inbox read back the created id", inboxId, inboxOwn.json && inboxOwn.json.id);
  const inboxOther = await request(`/api/inbox/${encodeURIComponent(inboxId)}`, { token: contributor2 });
  record("inbox", `contributor-2 GET inbox ${inboxId} (owner isolation)`, 404, inboxOther.status);
  const inboxListOther = await request("/api/inbox", { token: contributor2 });
  record("inbox", "contributor-2 GET /api/inbox", 200, inboxListOther.status);
  record("inbox", "contributor-2 inbox list excludes the item", false, pageItems(inboxListOther.json).some((item) => item && item.id === inboxId));

  // ---- Flow C: Task (src/routes/tasks.ts:23-36, 135-140; src/tasks/service.ts:90-92) ----
  // Route-level requireCapability(principal, "tasks:use") (bit 20). get() -> requireOwned
  // filters by member_id and throws TASK_NOT_FOUND 404 for another member (service.ts:393-396).
  // The body MUST carry a client-generated `id`: normalizeTaskCreate rejects an empty id with
  // TASK_INVALID 400 (validId requires /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/, service.ts:401-407,504-506),
  // which is why the frontend always sends `crypto.randomUUID()` (frontend/lib/tasks-data.ts:80-84).
  const taskBody = { id: crypto.randomUUID(), title: `acceptance-contributor journey task ${runTag}` };
  const taskCreate = await request("/api/tasks", { method: "POST", token: contributor, origin: CANONICAL_ORIGIN, body: taskBody });
  record("task", "contributor-1 POST /api/tasks", 201, taskCreate.status);
  const taskId = taskCreate.json && taskCreate.json.task && typeof taskCreate.json.task.id === "string" ? taskCreate.json.task.id : null;
  if (!taskId) {
    record("task", "task response carried task.id", "string id", JSON.stringify(taskCreate.json));
    printTable();
    return;
  }
  const taskOwn = await request(`/api/tasks/${encodeURIComponent(taskId)}`, { token: contributor });
  record("task", `contributor-1 GET /api/tasks/${taskId}`, 200, taskOwn.status);
  record("task", "contributor-1 task read back the created id", taskId, taskOwn.json && taskOwn.json.task && taskOwn.json.task.id);
  const taskOther = await request(`/api/tasks/${encodeURIComponent(taskId)}`, { token: contributor2 });
  record("task", `contributor-2 GET task ${taskId} (owner isolation)`, 404, taskOther.status);
  const taskListOther = await request("/api/tasks", { token: contributor2 });
  record("task", "contributor-2 GET /api/tasks", 200, taskListOther.status);
  record("task", "contributor-2 task list excludes the task", false, pageItems(taskListOther.json).some((item) => item && item.id === taskId));

  printTable();
}

main().catch((error) => {
  console.error("check-local-contributor-journey failed.");
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Ensure `npx wrangler dev --port 8787` is running and seed-local-members.mjs has been run.");
  process.exitCode = 1;
});
