import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";

const smokePath = new URL("./smoke.mjs", import.meta.url).pathname;
const wranglerPath = new URL("../wrangler.jsonc", import.meta.url);

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

async function startSmokeServer() {
  const notes = [];
  const requests = [];
  const server = createServer((request, response) => {
    let requestBody = "";
    request.on("data", (chunk) => { requestBody += chunk; });
    request.on("end", () => {
      requests.push({
        authorization: request.headers.authorization,
        clientId: request.headers["cf-access-client-id"],
        clientSecret: request.headers["cf-access-client-secret"],
        method: request.method,
        url: request.url,
      });
      const authorized = request.headers.authorization === "Bearer local-smoke-token"
        && request.headers["cf-access-client-id"] === "local-access-client-id"
        && request.headers["cf-access-client-secret"] === "local-access-client-secret";
      const send = (status, value) => {
        response.writeHead(status, { "content-type": "application/json", "x-request-id": `mock-${request.method}` });
        response.end(JSON.stringify(value));
      };
      if (request.url === "/api/health") return authorized ? send(200, { ok: true }) : send(401, { error: { code: "AUTH_REQUIRED" } });
      if (!authorized) return send(401, { error: { code: "AUTH_REQUIRED" } });
      if (request.method === "POST" && request.url === "/api/notes") {
        const note = JSON.parse(requestBody);
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
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test("rejects HTTP without an explicit loopback-only opt-in", async () => {
  const result = await runSmoke({
    MEMORY_GARDEN_BASE_URL: "http://127.0.0.1:1",
    MEMORY_GARDEN_ACCESS_CLIENT_ID: "local-access-client-id",
    MEMORY_GARDEN_ACCESS_CLIENT_SECRET: "local-access-client-secret",
    MEMORY_GARDEN_TOKEN: "local-smoke-token",
    MEMORY_GARDEN_ALLOW_HTTP_LOCAL: "",
  });

  assert.equal(result.code, 1);
  assert.match(result.output, /\[fail\] configuration status=invalid request_id=missing elapsed_ms=0/);
});

test("disables production and preview workers.dev URLs", async () => {
  const configuration = JSON.parse(await readFile(wranglerPath, "utf8"));

  assert.equal(configuration.workers_dev, false);
  assert.equal(configuration.preview_urls, false);
});

test("fails before the network when any automation credential is missing", async () => {
  const server = await startSmokeServer();
  try {
    for (const missingCredential of [
      "MEMORY_GARDEN_ACCESS_CLIENT_ID",
      "MEMORY_GARDEN_ACCESS_CLIENT_SECRET",
      "MEMORY_GARDEN_TOKEN",
    ]) {
      const result = await runSmoke({
        MEMORY_GARDEN_BASE_URL: server.baseUrl,
        MEMORY_GARDEN_ACCESS_CLIENT_ID: "local-access-client-id",
        MEMORY_GARDEN_ACCESS_CLIENT_SECRET: "local-access-client-secret",
        MEMORY_GARDEN_TOKEN: "local-smoke-token",
        MEMORY_GARDEN_ALLOW_HTTP_LOCAL: "true",
        [missingCredential]: "",
      });

      assert.equal(result.code, 1, missingCredential);
      assert.match(result.output, /\[fail\] configuration status=invalid request_id=missing elapsed_ms=0/);
    }
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});

test("sends every automation credential only to legacy paths and redacts them", async () => {
  const server = await startSmokeServer();
  try {
    const result = await runSmoke({
      MEMORY_GARDEN_BASE_URL: server.baseUrl,
      MEMORY_GARDEN_ACCESS_CLIENT_ID: "local-access-client-id",
      MEMORY_GARDEN_ACCESS_CLIENT_SECRET: "local-access-client-secret",
      MEMORY_GARDEN_TOKEN: "local-smoke-token",
      MEMORY_GARDEN_ALLOW_HTTP_LOCAL: "true",
    });

    assert.equal(result.code, 0);
    assert.match(result.output, /\[pass\] chat-with-citations/);
    assert.doesNotMatch(result.output, /local-smoke-token/);
    assert.doesNotMatch(result.output, /local-access-client-id/);
    assert.doesNotMatch(result.output, /local-access-client-secret/);
    assert.doesNotMatch(result.output, /Remote smoke verification note/);
    assert.ok(server.requests.some((request) => request.url === "/api/health"));
    assert.ok(server.requests.some((request) => request.url === "/api/notes"));
    assert.ok(server.requests.some((request) => request.url?.startsWith("/api/search?q=smoke-")));
    assert.ok(server.requests.some((request) => request.url === "/api/chat"));
    assert.ok(server.requests.every((request) => (
      request.authorization === "Bearer local-smoke-token"
      && request.clientId === "local-access-client-id"
      && request.clientSecret === "local-access-client-secret"
    )));
    assert.ok(server.requests.every((request) => !request.url.startsWith("/api/admin/")));
  } finally {
    await server.close();
  }
});
