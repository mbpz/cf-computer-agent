import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";

const smokePath = new URL("./smoke.mjs", import.meta.url).pathname;

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
  const server = createServer((request, response) => {
    let requestBody = "";
    request.on("data", (chunk) => { requestBody += chunk; });
    request.on("end", () => {
      const authorized = request.headers.authorization === "Bearer local-smoke-token";
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
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test("rejects HTTP without an explicit loopback-only opt-in", async () => {
  const result = await runSmoke({
    MEMORY_GARDEN_BASE_URL: "http://127.0.0.1:1",
    MEMORY_GARDEN_TOKEN: "local-smoke-token",
    MEMORY_GARDEN_ALLOW_HTTP_LOCAL: "",
  });

  assert.equal(result.code, 1);
  assert.match(result.output, /\[fail\] configuration status=invalid request_id=missing elapsed_ms=0/);
});

test("allows an opted-in loopback mock and redacts sensitive output", async () => {
  const server = await startSmokeServer();
  try {
    const result = await runSmoke({
      MEMORY_GARDEN_BASE_URL: server.baseUrl,
      MEMORY_GARDEN_TOKEN: "local-smoke-token",
      MEMORY_GARDEN_ALLOW_HTTP_LOCAL: "true",
    });

    assert.equal(result.code, 0);
    assert.match(result.output, /\[pass\] chat-with-citations/);
    assert.doesNotMatch(result.output, /local-smoke-token/);
    assert.doesNotMatch(result.output, /Remote smoke verification note/);
  } finally {
    await server.close();
  }
});
