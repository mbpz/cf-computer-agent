export type StructuredLogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLogEvent {
  level: StructuredLogLevel;
  requestId?: string;
  stage?: string;
  reason?: string;
  code?: string;
  status?: number;
  outcome?: string;
  method?: string;
  path?: string;
  retryable?: boolean;
}

const SAFE_WORD = /^[A-Za-z0-9_.:-]{1,128}$/u;
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const SENSITIVE_MARKER = /(oauth|token|secret|bearer|authorization|password|client[_-]?secret)/iu;

export function buildStructuredLog(level: StructuredLogLevel, input: Record<string, unknown>): StructuredLogEvent {
  const event: StructuredLogEvent = { level };
  const requestId = safeRequestId(input.requestId);
  if (requestId !== undefined) event.requestId = requestId;
  for (const key of ["stage", "reason", "outcome"] as const) {
    const value = safeWord(input[key]);
    if (value !== undefined) event[key] = value;
  }
  const code = safeCode(input.code);
  if (code !== undefined) event.code = code;
  if (typeof input.status === "number" && Number.isInteger(input.status) && input.status >= 100 && input.status <= 599) event.status = input.status;
  if (typeof input.method === "string" && /^[A-Z]{3,12}$/u.test(input.method)) event.method = input.method;
  if (typeof input.path === "string" && /^\/[A-Za-z0-9_./:-]{0,256}$/u.test(input.path)) event.path = input.path;
  if (typeof input.retryable === "boolean") event.retryable = input.retryable;
  return event;
}

export function emitStructuredLog(level: StructuredLogLevel, input: Record<string, unknown>): void {
  const event = buildStructuredLog(level, input);
  if (level === "error") console.error(event);
  else if (level === "warn") console.warn(event);
  else console.log(event);
}

function safeRequestId(value: unknown): string | undefined {
  if (typeof value !== "string" || !SAFE_REQUEST_ID.test(value) || SENSITIVE_MARKER.test(value)) return undefined;
  return value;
}

function safeWord(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_WORD.test(value) ? value : undefined;
}

function safeCode(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{1,63}$/u.test(value) ? value : undefined;
}
