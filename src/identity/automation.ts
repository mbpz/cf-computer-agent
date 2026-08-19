import { fixedLengthBytesEqual, verifyAutomationToken, type AuthEnvironment } from "../auth";
import { AppError, readBoundedBodyBytes } from "../http";

const MAX_TIMESTAMP_SKEW_SECONDS = 300;
const NONCE_RETENTION_SECONDS = MAX_TIMESTAMP_SKEW_SECONDS + 1;
const MIN_NONCE_BYTES = 16;
const MAX_NONCE_BYTES = 64;
const MIN_NONCE_ENCODED_LENGTH = 22;
const MAX_NONCE_ENCODED_LENGTH = 86;
const LOWER_HEX_HMAC = /^[0-9a-f]{64}$/u;
const CANONICAL_TIMESTAMP = /^(?:0|[1-9]\d{0,15})$/u;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;
const encoder = new TextEncoder();

export interface AutomationEnvironment extends AuthEnvironment {
  AUTOMATION_CLIENT_ID?: string;
  AUTOMATION_SECRET?: string;
}

export interface AutomationAuthenticatorOptions {
  now?: () => Date;
  waitUntil: (promise: Promise<unknown>) => void;
}

export interface VerifiedAutomationRequest {
  bodyBytes: Uint8Array;
}

interface AutomationHeaders {
  clientId: string;
  timestampText: string;
  nonce: string;
  signature: Uint8Array;
}

export class AutomationAuthenticator {
  private readonly now: () => Date;
  private readonly waitUntil: (promise: Promise<unknown>) => void;

  constructor(
    private readonly db: D1Database,
    private readonly environment: AutomationEnvironment,
    options: AutomationAuthenticatorOptions,
  ) {
    if (typeof options.waitUntil !== "function") throw new TypeError("waitUntil is required");
    this.now = options.now || (() => new Date());
    this.waitUntil = options.waitUntil;
  }

  async verify(request: Request, maxBodyBytes: number): Promise<VerifiedAutomationRequest> {
    const configuration = this.configuration();
    const headers = readAutomationHeaders(request);
    if (headers.clientId !== configuration.clientId) throw authenticationRequired();

    const validationNow = this.currentTime();
    const timestamp = parseTimestamp(headers.timestampText);
    if (timestamp === undefined || !isTimestampAccepted(timestamp, validationNow)) {
      throw authenticationRequired();
    }
    if (!isCanonicalNonce(headers.nonce)) throw authenticationRequired();

    const bodyBytes = await readBoundedBodyBytes(request, maxBodyBytes);
    const signatureValid = await verifyHmac(
      configuration.secret,
      canonicalRequest(request, headers.timestampText, headers.nonce, await sha256Hex(bodyBytes)),
      headers.signature,
    );
    if (!signatureValid) throw authenticationRequired();
    await verifyAutomationToken(request, { APP_TOKEN: configuration.appToken });

    const claimNow = this.currentTime();
    if (!isTimestampAccepted(timestamp, claimNow)) throw authenticationRequired();
    const claimNowSeconds = Math.floor(claimNow.getTime() / 1_000);
    const expiresAt = new Date(
      (Math.max(claimNowSeconds, timestamp) + NONCE_RETENTION_SECONDS) * 1_000,
    ).toISOString();
    const claim = await this.db.prepare(
      `INSERT INTO automation_nonces (client_id, nonce, expires_at)
       VALUES (?, ?, ?)
       ON CONFLICT(client_id, nonce) DO NOTHING`,
    ).bind(configuration.clientId, headers.nonce, expiresAt).run();
    if (claim.meta.changes === 0) throw replayRejected();
    if (claim.meta.changes !== 1) throw new Error("Automation nonce did not persist");

    this.scheduleExpiredCleanup(claimNow.toISOString());
    return { bodyBytes };
  }

  private configuration(): { clientId: string; secret: string; appToken: string } {
    const clientId = this.environment.AUTOMATION_CLIENT_ID;
    const secret = this.environment.AUTOMATION_SECRET;
    const appToken = this.environment.APP_TOKEN;
    if (!clientId || !secret || !appToken) {
      throw new AppError("AUTH_MISCONFIGURED", "Authentication is not configured", 503);
    }
    return { clientId, secret, appToken };
  }

  private currentTime(): Date {
    const now = this.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Automation clock is invalid");
    return now;
  }

  private scheduleExpiredCleanup(now: string): void {
    const cleanup = this.db.prepare(
      `DELETE FROM automation_nonces
       WHERE rowid IN (
         SELECT rowid FROM automation_nonces
         WHERE expires_at <= ?
         ORDER BY expires_at ASC, client_id ASC, nonce ASC
         LIMIT 50
       )`,
    ).bind(now).run()
      .then(() => undefined)
      .catch(() => { console.warn("expired automation nonce cleanup failed"); });
    this.waitUntil(cleanup);
  }
}

export function requestFromVerifiedBytes(request: Request, bodyBytes: Uint8Array): Request {
  if (request.method === "GET" || request.method === "HEAD") return new Request(request);
  return new Request(request, { body: ownedArrayBuffer(bodyBytes) });
}

function readAutomationHeaders(request: Request): AutomationHeaders {
  const clientId = request.headers.get("x-automation-id");
  const timestampText = request.headers.get("x-automation-timestamp");
  const nonce = request.headers.get("x-automation-nonce");
  const signatureText = request.headers.get("x-automation-signature");
  const authorization = request.headers.get("authorization");
  if (clientId === null || timestampText === null || nonce === null || signatureText === null || authorization === null) {
    throw authenticationRequired();
  }
  const signature = decodeLowerHex(signatureText);
  if (!signature) throw authenticationRequired();
  return { clientId, timestampText, nonce, signature };
}

function parseTimestamp(value: string): number | undefined {
  if (!CANONICAL_TIMESTAMP.test(value)) return undefined;
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) ? timestamp : undefined;
}

function isTimestampAccepted(timestamp: number, now: Date): boolean {
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  return Math.abs(timestamp - nowSeconds) <= MAX_TIMESTAMP_SKEW_SECONDS;
}

function isCanonicalNonce(value: string): boolean {
  if (value.length < MIN_NONCE_ENCODED_LENGTH || value.length > MAX_NONCE_ENCODED_LENGTH) return false;
  if (!BASE64URL.test(value)) return false;
  try {
    const bytes = decodeBase64Url(value);
    return bytes.byteLength >= MIN_NONCE_BYTES
      && bytes.byteLength <= MAX_NONCE_BYTES
      && encodeBase64Url(bytes) === value;
  } catch {
    return false;
  }
}

function canonicalRequest(
  request: Request,
  timestamp: string,
  nonce: string,
  bodyHash: string,
): string {
  const url = new URL(request.url);
  return [request.method.toUpperCase(), `${url.pathname}${url.search}`, timestamp, nonce, bodyHash].join("\n");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes)));
  return encodeLowerHex(digest);
}

async function verifyHmac(secret: string, canonical: string, supplied: Uint8Array): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(canonical)));
    return fixedLengthBytesEqual(supplied, expected);
  } catch {
    throw authenticationRequired();
  }
}

function decodeLowerHex(value: string): Uint8Array | undefined {
  if (!LOWER_HEX_HMAC.test(value)) return undefined;
  return Uint8Array.from({ length: value.length / 2 }, (_unused, index) => (
    Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  ));
}

function encodeLowerHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const decoded = atob(`${base64}${"=".repeat((4 - base64.length % 4) % 4)}`);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function encodeBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function authenticationRequired(): AppError {
  return new AppError("AUTH_REQUIRED", "Authentication required", 401);
}

function replayRejected(): AppError {
  return new AppError("AUTOMATION_REPLAY", "Automation request was already used", 409);
}
