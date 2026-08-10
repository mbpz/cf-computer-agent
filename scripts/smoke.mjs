import { randomUUID } from "node:crypto";

const baseUrl = process.env.MEMORY_GARDEN_BASE_URL;
const token = process.env.MEMORY_GARDEN_TOKEN;
const timeoutMs = 20_000;

let origin;

function authenticatedRequest(path, init = {}) {
  return fetch(new URL(path, origin), {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function unauthenticatedRequest(path, init = {}) {
  return fetch(new URL(path, origin), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

class SmokeFailure extends Error {
  constructor(step, message, status = "network", requestId = "missing", elapsedMs = 0) {
    super(message);
    this.step = step;
    this.status = status;
    this.requestId = requestId;
    this.elapsedMs = elapsedMs;
  }
}

async function check(step, request, assertBody) {
  const started = performance.now();
  let response;
  try {
    response = await request();
  } catch {
    throw new SmokeFailure(step, "request failed", "network", "missing", elapsed(started));
  }

  const requestId = response.headers.get("x-request-id") || "missing";
  const duration = elapsed(started);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new SmokeFailure(step, "response was not valid JSON", response.status, requestId, duration);
  }

  try {
    assertBody(response, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "response assertion failed";
    throw new SmokeFailure(step, message, response.status, requestId, duration);
  }

  console.log(formatResult("pass", step, response.status, requestId, duration));
  return body;
}

function expectStatus(response, expected) {
  if (response.status !== expected) {
    throw new Error(`expected HTTP ${expected}`);
  }
}

function expectObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`expected ${field}`);
  }
  return value;
}

function containsTitle(value, field, title) {
  const container = expectObject(value, field);
  const entries = container[field];
  return Array.isArray(entries) && entries.some((entry) => (
    entry && typeof entry === "object" && entry.title === title
  ));
}

function elapsed(started) {
  return Math.round(performance.now() - started);
}

function formatResult(result, step, status, requestId, elapsedMs) {
  return `[${result}] ${step} status=${status} request_id=${requestId} elapsed_ms=${elapsedMs}`;
}

async function run() {
  if (!baseUrl || !token) {
    throw new Error("MEMORY_GARDEN_BASE_URL and MEMORY_GARDEN_TOKEN are required");
  }

  try {
    origin = new URL(baseUrl);
  } catch {
    throw new Error("MEMORY_GARDEN_BASE_URL must be a valid HTTP(S) URL");
  }
  if (!/^https?:$/.test(origin.protocol)) {
    throw new Error("MEMORY_GARDEN_BASE_URL must be a valid HTTP(S) URL");
  }

  const title = `smoke-${randomUUID()}`;
  const note = {
    title,
    tags: ["smoke"],
    content: `Remote smoke verification note ${title}.`,
  };

  await check("health-unauthorized", () => unauthenticatedRequest("/api/health"), (response) => {
    expectStatus(response, 401);
  });

  await check("health-authorized", () => authenticatedRequest("/api/health"), (response, body) => {
    expectStatus(response, 200);
    if (!expectObject(body, "health response").ok) throw new Error("expected ok=true");
  });

  await check("create-note", () => authenticatedRequest("/api/notes", {
    method: "POST",
    body: JSON.stringify(note),
  }), (response, body) => {
    expectStatus(response, 201);
    if (expectObject(body, "create response").note?.title !== title) {
      throw new Error("created note title was not returned");
    }
  });

  await check("list-notes", () => authenticatedRequest("/api/notes"), (response, body) => {
    expectStatus(response, 200);
    if (!containsTitle(body, "notes", title)) throw new Error("created note was not listed");
  });

  await check("search-notes", () => authenticatedRequest(`/api/search?q=${encodeURIComponent(title)}`), (response, body) => {
    expectStatus(response, 200);
    if (!containsTitle(body, "hits", title)) throw new Error("created note was not found by search");
  });

  await check("chat-with-citations", () => authenticatedRequest("/api/chat", {
    method: "POST",
    body: JSON.stringify({ question: `What is the note titled ${title}?` }),
  }), (response, body) => {
    expectStatus(response, 200);
    const chat = expectObject(body, "chat response");
    if (typeof chat.answer !== "string" || !chat.answer.trim()) throw new Error("chat answer was empty");
    if (!containsTitle(body, "sources", title)) throw new Error("chat response omitted the created source");
  });
}

try {
  await run();
} catch (error) {
  if (error instanceof SmokeFailure) {
    console.error(formatResult("fail", error.step, error.status, error.requestId, error.elapsedMs));
  } else {
    console.error("[fail] configuration status=invalid request_id=missing elapsed_ms=0");
  }
  process.exitCode = 1;
}
