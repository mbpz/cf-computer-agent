import { createHash, createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";

const baseUrl = process.env.MEMORY_GARDEN_BASE_URL;
const token = process.env.APP_TOKEN;
const automationClientId = process.env.AUTOMATION_CLIENT_ID;
const automationSecret = process.env.AUTOMATION_SECRET;
const mode = process.argv[2] ?? "--all";
const timeoutMs = 20_000;
const recoveryBody = Buffer.from('{"limit":1}');
let origin;

class ProbeFailure extends Error {
  constructor(step, status = "network", requestId = "missing", elapsedMs = 0) {
    super(step);
    this.step = step;
    this.status = status;
    this.requestId = requestId;
    this.elapsedMs = elapsedMs;
  }
}

async function run() {
  if (!["--all", "--invalid-health", "--admin-forbidden"].includes(mode)) {
    throw new Error("Invalid probe mode");
  }
  if (!baseUrl || !automationClientId || !automationSecret || !token) {
    throw new Error("Invalid probe configuration");
  }
  try {
    origin = new URL(baseUrl);
  } catch {
    throw new Error("Invalid probe configuration");
  }
  if (origin.protocol !== "https:" && !(
    origin.protocol === "http:"
    && process.env.MEMORY_GARDEN_ALLOW_HTTP_LOCAL === "true"
    && isLoopbackHost(origin.hostname)
  )) {
    throw new Error("Invalid probe configuration");
  }

  if (mode === "--all" || mode === "--invalid-health") {
    let invalidSecret = randomBytes(32).toString("base64url");
    while (invalidSecret === automationSecret) invalidSecret = randomBytes(32).toString("base64url");
    await exactStatus(
      "invalid-signature-health",
      401,
      () => signedRequest("/api/health", invalidSecret),
    );
  }
  if (mode === "--all" || mode === "--admin-forbidden") {
    await exactStatus(
      "automation-admin-forbidden",
      403,
      () => signedRequest("/api/admin/publications/recover", automationSecret, {
        method: "POST",
        body: recoveryBody,
      }),
    );
  }
}

async function signedRequest(path, signingSecret, init = {}) {
  const url = new URL(path, origin);
  const method = (init.method ?? "GET").toUpperCase();
  const body = init.body === undefined ? Buffer.alloc(0) : Buffer.from(init.body);
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const nonce = randomBytes(16).toString("base64url");
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const canonical = [method, `${url.pathname}${url.search}`, timestamp, nonce, bodyHash].join("\n");
  const signature = createHmac("sha256", signingSecret).update(canonical).digest("hex");
  return fetch(url, {
    method,
    body: body.length === 0 ? undefined : body,
    redirect: "error",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-automation-id": automationClientId,
      "x-automation-timestamp": timestamp,
      "x-automation-nonce": nonce,
      "x-automation-signature": signature,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function exactStatus(step, expectedStatus, request) {
  const started = performance.now();
  let response;
  try {
    response = await request();
  } catch {
    throw new ProbeFailure(step, "network", "missing", elapsed(started));
  }
  const requestId = redactRequestId(response.headers.get("x-request-id"));
  const status = response.status;
  await response.body?.cancel().catch(() => undefined);
  const duration = elapsed(started);
  if (status !== expectedStatus) throw new ProbeFailure(step, status, requestId, duration);
  console.log(formatResult("pass", step, status, requestId, duration));
}

function redactRequestId(value) {
  const credentials = [token, automationClientId, automationSecret];
  if (typeof value !== "string"
    || !/^[A-Za-z0-9_-]{1,128}$/.test(value)
    || credentials.some((credential) => credential && value.includes(credential))) {
    return "invalid";
  }
  return `sha256-${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function isLoopbackHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost"
    || (isIP(normalized) === 4 && normalized.startsWith("127."))
    || normalized === "::1";
}

function elapsed(started) {
  return Math.round(performance.now() - started);
}

function formatResult(result, step, status, requestId, elapsedMs) {
  return `[${result}] ${step} status=${status} request_id=${requestId} elapsed_ms=${elapsedMs}`;
}

try {
  await run();
} catch (error) {
  if (error instanceof ProbeFailure) {
    console.error(formatResult("fail", error.step, error.status, error.requestId, error.elapsedMs));
  } else {
    console.error("[fail] configuration status=invalid request_id=missing elapsed_ms=0");
  }
  process.exitCode = 1;
}
