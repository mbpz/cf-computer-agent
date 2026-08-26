export interface SyntheticProbePlan {
  baseUrl: string;
  fixture: { marker: string; title: string; content: string };
  maxRequests: number;
  rateLimit: { windowMs: number; maxRuns: number };
  cleanup: { required: true; strategy: "admin-purge-after-retention" };
}

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const SAFE_MARKER = /^[a-z0-9-]{1,32}$/u;

/**
 * Builds a production-probe plan without performing network I/O. The plan is
 * intentionally useful only with an explicitly authorised runner: fixture
 * text is deterministic and non-sensitive, requests are bounded, and cleanup
 * is a required part of the returned plan.
 */
export function buildSyntheticProbePlan(input: {
  baseUrl: string;
  runId: string;
  maxRequests?: number;
  windowMs?: number;
}): SyntheticProbePlan {
  const url = parseProductionBaseUrl(input.baseUrl);
  if (!SAFE_MARKER.test(input.runId)) throw new Error("SYNTHETIC_RUN_ID_INVALID");
  const maxRequests = input.maxRequests ?? 6;
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 8) throw new Error("SYNTHETIC_REQUEST_BOUND_INVALID");
  const windowMs = input.windowMs ?? DEFAULT_WINDOW_MS;
  if (!Number.isSafeInteger(windowMs) || windowMs < 60_000 || windowMs > 24 * 60 * 60 * 1000) throw new Error("SYNTHETIC_WINDOW_INVALID");
  const marker = `memory-garden-probe-${input.runId}`;
  const fixture = {
    marker,
    title: `Synthetic verification ${marker}`,
    content: `Synthetic verification fixture ${marker}. No secrets or personal data are included.`,
  };
  assertSafeSyntheticText(fixture.title);
  assertSafeSyntheticText(fixture.content);
  return {
    baseUrl: url.toString().replace(/\/$/u, ""),
    fixture,
    maxRequests,
    rateLimit: { windowMs, maxRuns: 1 },
    cleanup: { required: true, strategy: "admin-purge-after-retention" },
  };
}

export function assertSafeSyntheticText(value: string): void {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) throw new Error("SYNTHETIC_FIXTURE_INVALID");
  if (/(?:bearer\s+|gh[opsu]_|app[_-]?token|client[_-]?secret|private\s+key|-----begin|oauth\s+code|session\s+cookie)/iu.test(value)
    || /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u.test(value)) {
    throw new Error("SYNTHETIC_FIXTURE_SENSITIVE");
  }
}

export function createProbeRateLimiter(options: { windowMs: number; maxRuns?: number; now?: () => number }): { tryAcquire(): boolean } {
  const maxRuns = options.maxRuns ?? 1;
  if (!Number.isSafeInteger(options.windowMs) || options.windowMs < 60_000 || !Number.isSafeInteger(maxRuns) || maxRuns < 1) throw new Error("SYNTHETIC_RATE_LIMIT_INVALID");
  const now = options.now ?? (() => Date.now());
  let windowStart = -1;
  let runs = 0;
  return {
    tryAcquire() {
      const timestamp = now();
      if (!Number.isFinite(timestamp)) throw new Error("SYNTHETIC_CLOCK_INVALID");
      if (windowStart < 0 || timestamp - windowStart >= options.windowMs) { windowStart = timestamp; runs = 0; }
      if (runs >= maxRuns) return false;
      runs += 1;
      return true;
    },
  };
}

function parseProductionBaseUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("SYNTHETIC_BASE_URL_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.hostname.endsWith("workers.dev")) {
    throw new Error("SYNTHETIC_BASE_URL_INVALID");
  }
  return url;
}
