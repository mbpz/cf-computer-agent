import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createRawServer } from "node:net";
import test from "node:test";

const smokePath = new URL("./smoke.mjs", import.meta.url).pathname;
const wranglerPath = new URL("../wrangler.jsonc", import.meta.url);
const githubOAuthSetupPath = new URL("../docs/operations/github-oauth-setup.md", import.meta.url);
const smokeRunbookPath = new URL("../docs/operations/smoke-test.md", import.meta.url);
const credentials = {
  AUTOMATION_CLIENT_ID: "local-automation-client-id",
  AUTOMATION_SECRET: "local-automation-secret",
  APP_TOKEN: "local-app-token",
};

function runSmoke(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [smokePath], {
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
}

function localEnvironment(baseUrl, overrides = {}) {
  return {
    MEMORY_GARDEN_BASE_URL: baseUrl,
    MEMORY_GARDEN_ALLOW_HTTP_LOCAL: "true",
    ...credentials,
    ...overrides,
  };
}

function verifySignedRequest(request, body) {
  const clientId = request.headers["x-automation-id"];
  const timestamp = request.headers["x-automation-timestamp"];
  const nonce = request.headers["x-automation-nonce"];
  const signature = request.headers["x-automation-signature"];
  assert.equal(clientId, credentials.AUTOMATION_CLIENT_ID);
  assert.equal(request.headers.authorization, `Bearer ${credentials.APP_TOKEN}`);
  assert.match(timestamp, /^(?:0|[1-9]\d{0,15})$/u);
  assert.ok(Math.abs(Number(timestamp) - Math.floor(Date.now() / 1_000)) <= 10);
  assert.match(nonce, /^[A-Za-z0-9_-]{22}$/u);
  assert.equal(Buffer.from(nonce, "base64url").byteLength, 16);
  assert.match(signature, /^[0-9a-f]{64}$/u);
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const canonical = [request.method, request.url, timestamp, nonce, bodyHash].join("\n");
  assert.equal(signature, createHmac("sha256", credentials.AUTOMATION_SECRET).update(canonical).digest("hex"));
}

async function startSmokeServer({ requestId = "0123456789abcdef" } = {}) {
  const notes = [];
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => { chunks.push(chunk); });
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      requests.push({ headers: { ...request.headers }, method: request.method, url: request.url, body });
      let authorized = true;
      try { verifySignedRequest(request, body); } catch { authorized = false; }
      const send = (status, value) => {
        response.writeHead(status, { "content-type": "application/json", "x-request-id": requestId });
        response.end(JSON.stringify(value));
      };
      if (!authorized) return send(401, { error: { code: "AUTH_REQUIRED" } });
      if (request.url === "/api/health") return send(200, { ok: true });
      if (request.method === "POST" && request.url === "/api/notes") {
        const note = JSON.parse(body.toString("utf8"));
        notes.push(note);
        return send(201, { note });
      }
      if (request.method === "GET" && request.url === "/api/notes") return send(200, { notes });
      if (request.method === "GET" && request.url.startsWith("/api/search")) return send(200, { hits: notes });
      if (request.method === "POST" && request.url === "/api/chat") return send(200, { answer: "Verified [1]", sources: notes });
      return send(404, { error: { code: "NOT_FOUND" } });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Smoke mock did not bind a TCP port");
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

async function startRedirectTarget() {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ ...request.headers });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Redirect target did not bind a TCP port");
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

async function startRedirectSource(targetUrl) {
  const server = createServer((_request, response) => { response.writeHead(302, { location: targetUrl }); response.end(); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Redirect source did not bind a TCP port");
  return { baseUrl: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

async function startRawRequestIdServer(requestId) {
  const server = createRawServer((socket) => {
    socket.once("data", () => { socket.end(`HTTP/1.1 500 Internal Server Error\r\nContent-Type: application/json\r\nx-request-id: ${requestId}\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}`); });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Raw request-ID server did not bind a TCP port");
  return { baseUrl: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

test("rejects HTTP without an explicit loopback-only opt-in", async () => {
  const result = await runSmoke({ ...localEnvironment("http://127.0.0.1:1"), MEMORY_GARDEN_ALLOW_HTTP_LOCAL: "" });
  assert.equal(result.code, 1);
  assert.match(result.output, /\[fail\] configuration status=invalid request_id=missing elapsed_ms=0/);
});

test("disables production and preview workers.dev URLs", async () => {
  const configuration = JSON.parse(await readFile(wranglerPath, "utf8"));
  assert.equal(configuration.workers_dev, false);
  assert.equal(configuration.preview_urls, false);
  assert.deepEqual(configuration.d1_databases, [{
    binding: "DB",
    database_name: "memory-garden-control-plane",
    database_id: "653c9e43-c7ad-45b8-a109-bc144843bee7",
    migrations_dir: "migrations",
  }]);
  assert.deepEqual(configuration.durable_objects.bindings, [{ name: "KNOWLEDGE", class_name: "KnowledgeBase" }]);
  assert.deepEqual(configuration.migrations, [{ tag: "v1", new_sqlite_classes: ["KnowledgeBase"] }]);
  assert.equal(configuration.assets.binding, "ASSETS");
  assert.equal(configuration.assets.run_worker_first, true);
});

test("documents GitHub OAuth and signed automation without Access credentials", async () => {
  const [setup, smokeRunbook] = await Promise.all([
    readFile(githubOAuthSetupPath, "utf8"),
    readFile(smokeRunbookPath, "utf8"),
  ]);

  assert.match(setup, /https:\/\/memory\.crgmhrc\.asia\/auth\/github\/callback/u);
  assert.match(setup, /Homepage URL: `https:\/\/memory\.crgmhrc\.asia`/u);
  for (const setting of [
    "GITHUB_OAUTH_CLIENT_ID",
    "GITHUB_OAUTH_CLIENT_SECRET",
    "BOOTSTRAP_ADMIN_EMAIL",
    "ALLOWED_MEMBER_EMAILS",
    "AUTOMATION_CLIENT_ID",
    "AUTOMATION_SECRET",
    "APP_TOKEN",
  ]) {
    assert.match(setup, new RegExp(`rtk npx wrangler secret put ${setting}`, "u"));
  }
  assert.match(smokeRunbook, /AUTOMATION_CLIENT_ID/u);
  assert.match(smokeRunbook, /AUTOMATION_SECRET/u);
  assert.match(smokeRunbook, /APP_TOKEN/u);
  assert.doesNotMatch(`${setup}\n${smokeRunbook}`, /CF-Access-Client|ACCESS_TEAM_DOMAIN|ACCESS_AUD|cdn-cgi\/access/u);
});

test("fails before the network when any automation credential is missing", async () => {
  const server = await startSmokeServer();
  try {
    for (const missingCredential of ["AUTOMATION_CLIENT_ID", "AUTOMATION_SECRET", "APP_TOKEN"]) {
      const result = await runSmoke(localEnvironment(server.baseUrl, { [missingCredential]: "" }));
      assert.equal(result.code, 1, missingCredential);
      assert.match(result.output, /\[fail\] configuration status=invalid request_id=missing elapsed_ms=0/);
    }
    assert.equal(server.requests.length, 0);
  } finally { await server.close(); }
});

test("rejects redirects before any automation credential reaches the target", async () => {
  const target = await startRedirectTarget();
  const source = await startRedirectSource(`${target.baseUrl}/redirect-target`);
  try {
    const result = await runSmoke(localEnvironment(source.baseUrl));
    assert.equal(result.code, 1);
    assert.match(result.output, /\[fail\] health-authorized status=network request_id=missing/);
    assert.deepEqual(target.requests, []);
    assert.doesNotMatch(result.output, /local-automation-client-id|local-automation-secret|local-app-token/);
  } finally { await source.close(); await target.close(); }
});

test("redacts configured credentials reflected through request IDs", async () => {
  for (const credential of Object.values(credentials)) {
    for (const requestId of [credential, `prefix-${credential}-suffix`]) {
      const server = await startRawRequestIdServer(requestId);
      try {
        const result = await runSmoke(localEnvironment(server.baseUrl));
        assert.equal(result.code, 1);
        assert.doesNotMatch(result.output, /local-automation-client-id|local-automation-secret|local-app-token/);
        assert.match(result.output, /request_id=invalid/);
      } finally { await server.close(); }
    }
  }
});

test("signs every legacy request over its exact body bytes and redacts credentials", async () => {
  const server = await startSmokeServer();
  try {
    const result = await runSmoke(localEnvironment(server.baseUrl));
    assert.equal(result.code, 0);
    assert.match(result.output, /\[pass\] chat-with-citations/);
    assert.doesNotMatch(result.output, /local-automation-client-id|local-automation-secret|local-app-token/);
    assert.doesNotMatch(result.output, /Remote smoke verification note/);
    assert.equal(server.requests.length, 5);
    assert.deepEqual(server.requests.slice(0, 3).map((request) => request.url), ["/api/health", "/api/notes", "/api/notes"]);
    assert.match(server.requests[3].url, /^\/api\/search\?q=smoke-/u);
    assert.equal(server.requests[4].url, "/api/chat");
    assert.ok(server.requests.every((request) => !request.url.startsWith("/api/admin/")));
    assert.ok(server.requests.every((request) => request.headers["x-automation-signature"]));
  } finally { await server.close(); }
});
