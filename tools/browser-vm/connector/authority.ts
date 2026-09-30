import {
  createConnectorAuthorizationVerifier, createConnectorDeviceVerifier,
  type ConnectorAuthorizationClaims, type ConnectorVerificationKey,
} from "../../../shared/connector-authorization.ts";

export interface ConnectorClock {
  wallNow(): number;
  monotonicNow(): number;
  setTimer(callback: () => void, delayMs: number): unknown;
  clearTimer(handle: unknown): void;
}
export interface ConsumeInput { ticket: string; ticketId: string; consumerId: string }
interface Lease { leaseId: string; revision: number; expiresAtMs: number; renewAfterMs: number }
interface DeviceOptions {
  allowedOrigin: string;
  policyVersion: string;
  verificationKeys: readonly ConnectorVerificationKey[];
  // Trusted transport to the fixed issuer endpoint, never a browser callback/ACK.
  consume(input: ConsumeInput, signal: AbortSignal): Promise<unknown>;
  clock?: ConnectorClock;
  replayLimit?: number;
}
interface ChannelCallbacks { release(): void; renewalDue(): void }

const realClock: ConnectorClock = {
  wallNow: () => Date.now(), monotonicNow: () => performance.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function fields(value: unknown, names: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).length === names.length && names.every(name => {
    const d = descriptors[name]; return d && d.enumerable && "value" in d;
  });
}
const hash = async (text: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
const sameBytes = (a: Uint8Array, b: Uint8Array) => {
  let different = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
  return different === 0;
};
const ignoreFailure = (release: () => void) => { try { release(); } catch { /* Never prevent releasing other owned resources. */ } };

/** In-memory device authority, not a listener or network forwarder.
 * The adapter must check Host/Origin and framing before open(), expose issuePairing
 * only to the local operator, and check isActive() before every DNS/stream action.
 * A new instance is a new process identity; nothing is restored from disk.
 */
export function createConnectorDevice(options: DeviceOptions) {
  const { allowedOrigin, policyVersion, consume } = options;
  if (new URL(allowedOrigin).origin !== allowedOrigin || !allowedOrigin.startsWith("https://") || !id(policyVersion)
    || typeof consume !== "function") throw new Error("Invalid connector configuration");
  const limit = options.replayLimit ?? 256;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1024) throw new Error("Invalid replay bound");
  const clock = options.clock ?? realClock;
  const startWall = clock.wallNow(), startMono = clock.monotonicNow();
  let lastNow = startWall;
  const now = () => {
    // Monotonic elapsed time still expires leases when the host wall clock rolls back.
    const value = Math.max(lastNow, clock.wallNow(), Math.floor(startWall + clock.monotonicNow() - startMono));
    if (!integer(value)) throw new Error("Invalid clock");
    return lastNow = value;
  };
  const connectorId = crypto.randomUUID();
  const verifyConnect = createConnectorDeviceVerifier(options.verificationKeys, { origin: allowedOrigin, connectorId, policyVersion });
  const verifyRenew = createConnectorAuthorizationVerifier(options.verificationKeys);
  let stopped = false, pairEpoch = 0;
  let pendingPair: { hash: Uint8Array; expiresAt: number; attempts: number } | undefined;
  const replay = new Map<string, number>();
  const channels = new Set<() => void>();

  async function issuePairing() {
    if (stopped) throw new Error("Connector stopped");
    const epoch = ++pairEpoch;
    pendingPair = undefined;
    const pairingCode = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
      .replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
    const expiresAtMs = now() + 30_000;
    const digest = await hash(pairingCode);
    if (stopped || epoch !== pairEpoch || now() >= expiresAtMs) throw new Error("Pairing canceled");
    pendingPair = { hash: digest, expiresAt: expiresAtMs, attempts: 0 };
    return Object.freeze({ pairingCode, expiresAtMs, allowedOrigin, connectorId });
  }
  async function claimPair(code: unknown) {
    const pending = pendingPair;
    if (!pending || now() >= pending.expiresAt || pending.attempts >= 5) { pendingPair = undefined; return false; }
    pending.attempts++;
    if (typeof code !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(code)) return false;
    const digest = await hash(code);
    if (stopped || pendingPair !== pending || now() >= pending.expiresAt || !sameBytes(digest, pending.hash)) return false;
    pendingPair = undefined; // Synchronous claim after async hash: one winner only.
    return true;
  }
  function claimTicket(claims: ConnectorAuthorizationClaims) {
    const time = now();
    for (const [ticketId, expiry] of replay) if (expiry <= time) replay.delete(ticketId);
    if (replay.has(claims.ticketId) || replay.size >= limit || time >= claims.expiresAtMs) return false;
    replay.set(claims.ticketId, claims.expiresAtMs); // Keep even after a failed/unknown consume; never retry.
    return true;
  }

  function open(origin: string, callbacks: ChannelCallbacks) {
    if (stopped || origin !== allowedOrigin || channels.size >= 4) throw new Error("Channel rejected");
    // Snapshot adapter callbacks; web messages can never supply these functions.
    const release = callbacks.release, renewalDue = callbacks.renewalDue;
    if (typeof release !== "function" || typeof renewalDue !== "function") throw new Error("Invalid channel adapter");
    let phase: string = "waiting";
    const consumerId = crypto.randomUUID();
    let bound: Readonly<ConnectorAuthorizationClaims> | undefined, lease: Lease | undefined;
    let expiryTimer: unknown, renewTimer: unknown, timeoutTimer: unknown;
    let abort: AbortController | undefined, cancelPending: (() => void) | undefined;
    const resources = new Set<() => void>();
    const clearTimers = () => {
      for (const t of [expiryTimer, renewTimer, timeoutTimer]) if (t !== undefined) clock.clearTimer(t);
      expiryTimer = renewTimer = timeoutTimer = undefined;
    };
    const close = () => {
      if (phase === "closed") return;
      phase = "closed";
      clearTimers(); abort?.abort(); cancelPending?.();
      channels.delete(close);
      for (const dispose of resources) ignoreFailure(dispose);
      resources.clear(); bound = undefined; lease = undefined;
      ignoreFailure(release);
    };
    channels.add(close);
    expiryTimer = clock.setTimer(close, 5_000); // Unauthenticated sockets cannot live indefinitely.
    function isActive() {
      if (phase !== "active" && phase !== "renewing") return false;
      if (!lease || now() >= lease.expiresAtMs) { close(); return false; }
      return true;
    }
    function acceptAck(value: unknown, claims: ConnectorAuthorizationClaims): Lease | undefined {
      if (!fields(value, ["lease"]) || !fields(value.lease, ["leaseId", "revision", "expiresAtMs", "renewAfterMs"])) return;
      const ack = value.lease, time = now();
      if (!id(ack.leaseId) || !integer(ack.revision) || ack.revision !== (lease ? lease.revision + 1 : 1)
        || (lease && ack.leaseId !== lease.leaseId)
        || !integer(ack.expiresAtMs) || ack.expiresAtMs > claims.expiresAtMs || ack.expiresAtMs <= time
        || !integer(ack.renewAfterMs) || ack.renewAfterMs < claims.issuedAtMs || ack.renewAfterMs > time + 30_000) return;
      return { leaseId: ack.leaseId, revision: ack.revision, expiresAtMs: ack.expiresAtMs, renewAfterMs: ack.renewAfterMs };
    }
    async function authorize(ticket: unknown, renewal: boolean) {
      try {
        const time = now();
        if (renewal && (!lease || time < lease.renewAfterMs)) throw new Error("Renewal not due");
        const expected = bound && lease ? {
          purpose: "renew" as const, origin: bound.origin, connectorId: bound.connectorId,
          memberId: bound.memberId, environmentId: bound.environmentId, runtimeId: bound.runtimeId,
          generation: bound.generation, policyVersion: bound.policyVersion, leaseId: lease.leaseId,
        } : undefined;
        const claims = renewal && expected ? await verifyRenew(ticket, expected, now) : await verifyConnect(ticket, now);
        if (!claims || phase === "closed" || (renewal && !isActive()) || !claimTicket(claims)) throw new Error("Authorization rejected");
        abort = new AbortController();
        const canceled = new Promise<never>((_, reject) => { cancelPending = () => reject(new Error("Authorization canceled")); });
        timeoutTimer = clock.setTimer(close, 5_000);
        const signal = abort.signal;
        const response = await Promise.race([Promise.resolve().then(() => {
          if (signal.aborted) throw new Error("Authorization canceled");
          return consume({ ticket: ticket as string, ticketId: claims.ticketId, consumerId }, signal);
        }), canceled]);
        if (phase === "closed" || (renewal && !isActive()) || now() >= claims.expiresAtMs) throw new Error("Late authorization");
        const accepted = acceptAck(response, claims);
        if (!accepted) throw new Error("Invalid lease");
        clearTimers(); cancelPending = undefined; abort = undefined;
        bound = claims; lease = accepted; phase = "active";
        expiryTimer = clock.setTimer(close, accepted.expiresAtMs - now());
        if (accepted.renewAfterMs < accepted.expiresAtMs) {
          const scheduleRenewal = () => {
            renewTimer = clock.setTimer(() => {
              if (!isActive()) return;
              // Local timers can wake early; never send an early protocol notification.
              // Re-arm only the wakeup, without moving the independent hard expiry.
              if (now() < accepted.renewAfterMs) { scheduleRenewal(); return; }
              try { renewalDue(); } catch { close(); }
            }, Math.max(1, Math.ceil(accepted.renewAfterMs - now())));
          };
          scheduleRenewal();
        }
        return true;
      } catch { close(); return false; }
    }
    return Object.freeze({
      async connect(input: unknown) {
        if (phase !== "waiting") { close(); return false; }
        phase = "connecting";
        if (!fields(input, ["pairingCode", "ticket"]) || !await claimPair(input.pairingCode) || phase === "closed") { close(); return false; }
        return authorize(input.ticket, false);
      },
      async renew(ticket: unknown) {
        if (phase !== "active" || !isActive()) { close(); return false; }
        phase = "renewing";
        return authorize(ticket, true);
      },
      isActive, close,
      getLease(): Readonly<Lease> | undefined {
        return isActive() && lease ? Object.freeze({ ...lease }) : undefined;
      },
      track(dispose: () => void) {
        if (!isActive() || typeof dispose !== "function" || resources.size >= 8) throw new Error("Resource rejected");
        resources.add(dispose);
        return () => { resources.delete(dispose); };
      },
    });
  }
  return Object.freeze({ connectorId, issuePairing, open, close() {
    if (stopped) return;
    stopped = true; pairEpoch++; pendingPair = undefined;
    for (const close of [...channels]) close();
    replay.clear();
  } });
}
