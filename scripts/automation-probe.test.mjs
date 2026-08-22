import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";

const probePath = new URL("./automation-probe.mjs", import.meta.url).pathname;
const credentials = {
  AUTOMATION_CLIENT_ID: "probe-client-id",
  AUTOMATION_SECRET: "probe-valid-secret",
  APP_TOKEN: "probe-app-token",
};
const recoveryBody = Buffer.from('{"limit":1}');

function redactedRequestId(value) {
  return `sha256-${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function runProbe(baseUrl, overrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [probePath], {
      env: {
        ...process.env,
        MEMORY_GARDEN_BASE_URL: baseUrl,
        MEMORY_GARDEN_ALLOW_HTTP_LOCAL: "true",
        ...credentials,
        ...overrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
}

async function startProbeServer(statuses = [401, 403], requestIds = ["bad-hmac-id", "admin-denied-id"]) {
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => { chunks.push(chunk); });
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      requests.push({ method: request.method, url: request.url, headers: { ...request.headers }, body });
      const index = requests.length - 1;
      response.writeHead(statuses[index] ?? 500, {
        "content-type": "application/json",
        "x-request-id": requestIds[index] ?? "unexpected-request",
      });
      response.end('{"secret":"response-body-must-not-be-logged"}');
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Probe mock did not bind");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function expectedSignature(request) {
  const timestamp = request.headers["x-automation-timestamp"];
  const nonce = request.headers["x-automation-nonce"];
  const bodyHash = createHash("sha256").update(request.body).digest("hex");
  const canonical = [request.method, request.url, timestamp, nonce, bodyHash].join("\n");
  return createHmac("sha256", credentials.AUTOMATION_SECRET).update(canonical).digest("hex");
}

function assertCommonSignedHeaders(request) {
  assert.equal(request.headers.authorization, `Bearer ${credentials.APP_TOKEN}`);
  assert.equal(request.headers["x-automation-id"], credentials.AUTOMATION_CLIENT_ID);
  assert.match(request.headers["x-automation-timestamp"], /^(?:0|[1-9]\d{0,15})$/u);
  assert.ok(Math.abs(Number(request.headers["x-automation-timestamp"]) - Math.floor(Date.now() / 1_000)) <= 10);
  assert.match(request.headers["x-automation-nonce"], /^[A-Za-z0-9_-]{22}$/u);
  assert.equal(Buffer.from(request.headers["x-automation-nonce"], "base64url").byteLength, 16);
  assert.match(request.headers["x-automation-signature"], /^[0-9a-f]{64}$/u);
}

test("makes exactly one invalid health request and one valid M1 admin request", async () => {
  const server = await startProbeServer();
  try {
    const result = await runProbe(server.baseUrl);
    assert.equal(result.code, 0, result.output);
    assert.equal(server.requests.length, 2);
    const [invalidHealth, validAdmin] = server.requests;
    assert.deepEqual(
      server.requests.map(({ method, url, body }) => ({ method, url, body: body.toString("utf8") })),
      [
        { method: "GET", url: "/api/health", body: "" },
        { method: "POST", url: "/api/admin/publications/recover", body: recoveryBody.toString("utf8") },
      ],
    );
    assertCommonSignedHeaders(invalidHealth);
    assertCommonSignedHeaders(validAdmin);
    assert.notEqual(invalidHealth.headers["x-automation-signature"], expectedSignature(invalidHealth));
    assert.equal(validAdmin.headers["x-automation-signature"], expectedSignature(validAdmin));
    assert.notEqual(invalidHealth.headers["x-automation-nonce"], validAdmin.headers["x-automation-nonce"]);
    assert.match(result.output, new RegExp(`^\\[pass\\] invalid-signature-health status=401 request_id=${redactedRequestId("bad-hmac-id")} elapsed_ms=\\d+$`, "mu"));
    assert.match(result.output, new RegExp(`^\\[pass\\] automation-admin-forbidden status=403 request_id=${redactedRequestId("admin-denied-id")} elapsed_ms=\\d+$`, "mu"));
    assert.doesNotMatch(result.output, /bad-hmac-id|admin-denied-id/u);
    assert.doesNotMatch(result.output, /probe-client-id|probe-valid-secret|probe-app-token|response-body-must-not-be-logged|\{"limit":1\}/u);
  } finally { await server.close(); }
});

test("fails after the one health request on every status except exactly 401", async () => {
  for (const status of [200, 403, 500]) {
    const server = await startProbeServer([status]);
    try {
      const result = await runProbe(server.baseUrl);
      assert.equal(result.code, 1, `status=${status} ${result.output}`);
      assert.equal(server.requests.length, 1);
      assert.match(result.output, new RegExp(`^\\[fail\\] invalid-signature-health status=${status} `, "mu"));
    } finally { await server.close(); }
  }
});

test("fails when the valid signed M1 admin request is not exactly 403", async () => {
  for (const status of [200, 401, 404, 500]) {
    const server = await startProbeServer([401, status]);
    try {
      const result = await runProbe(server.baseUrl);
      assert.equal(result.code, 1, `status=${status} ${result.output}`);
      assert.equal(server.requests.length, 2);
      assert.match(result.output, new RegExp(`^\\[fail\\] automation-admin-forbidden status=${status} `, "mu"));
    } finally { await server.close(); }
  }
});

test("fails on network errors and redirects without forwarding credentials", async () => {
  const target = await startProbeServer();
  const source = createServer((_request, response) => {
    response.writeHead(302, { location: `${target.baseUrl}/redirected` });
    response.end();
  });
  await new Promise((resolve) => source.listen(0, "127.0.0.1", resolve));
  const address = source.address();
  if (!address || typeof address === "string") throw new Error("Redirect mock did not bind");
  try {
    const redirected = await runProbe(`http://127.0.0.1:${address.port}`);
    assert.equal(redirected.code, 1);
    assert.match(redirected.output, /^\[fail\] invalid-signature-health status=network request_id=missing/mu);
    assert.equal(target.requests.length, 0);
    assert.doesNotMatch(redirected.output, /probe-client-id|probe-valid-secret|probe-app-token/u);

    const unavailable = await runProbe("http://127.0.0.1:1");
    assert.equal(unavailable.code, 1);
    assert.match(unavailable.output, /^\[fail\] invalid-signature-health status=network request_id=missing/mu);

    const tlsFailure = await runProbe(`https://127.0.0.1:${address.port}`);
    assert.equal(tlsFailure.code, 1);
    assert.match(tlsFailure.output, /^\[fail\] invalid-signature-health status=network request_id=missing/mu);
  } finally {
    await new Promise((resolve, reject) => source.close((error) => error ? reject(error) : resolve()));
    await target.close();
  }
});

test("fails before the network on missing credentials and redacts reflected request IDs", async () => {
  for (const credential of Object.values(credentials)) {
    const reflected = await startProbeServer([401], [`prefix-${credential}-suffix`]);
    try {
      const result = await runProbe(reflected.baseUrl);
      assert.equal(result.code, 1);
      assert.match(result.output, /request_id=invalid/u);
      assert.doesNotMatch(result.output, /probe-client-id|probe-valid-secret|probe-app-token/u);
    } finally { await reflected.close(); }
  }

  const server = await startProbeServer();
  try {
    const requestsBefore = server.requests.length;
    const missing = await runProbe(server.baseUrl, { AUTOMATION_SECRET: "" });
    assert.equal(missing.code, 1);
    assert.match(missing.output, /^\[fail\] configuration status=invalid request_id=missing elapsed_ms=0$/mu);
    assert.equal(server.requests.length, requestsBefore);
  } finally { await server.close(); }
});
