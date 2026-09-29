# Device authorization core (not yet a runnable connector)

This directory is separate from the handshake-only `connector-probe`. It does not
listen on a port, forward packets, configure host networking or read credentials.
The formal loopback transport is the next LC-006.3 step; LC-007 supplies egress.

## Trusted assembly

- The operator chooses one exact HTTPS workbench origin and an installed policy.
  Public Ed25519 keys (active plus optional retiring key) are installed out of
  band. Never accept a key, issuer URL, policy or identity from a browser message.
- Construct `createConnectorConsumeClient({issuerOrigin: allowedOrigin})` and pass
  it to `createConnectorDevice`. The client sends only to the fixed
  `/api/connector/consume` path, with no cookies, redirects or automatic retries.
  TLS validation is the platform default. The optional fetch/clock ports support
  embedding and local integration tests; web messages must never control them.
- Each device instance generates a new connectorId. Obtain that public identifier
  through the authenticated local-control protocol before asking the workbench
  to reserve a server-authoritative environment generation and issue a ticket.
- `issuePairing()` is for the **local operator only**. Its 256-bit code lasts
  30 seconds, permits at most five attempts, and is one-use across all channels.
  Only its hash is retained. Do not put the code or server ticket in URLs, logs,
  disk, browser storage, telemetry or diagnostics.
- The transport must enforce exact Host and Origin, loopback-only binding, a
  bounded JSON first frame, no binary/control frames before authorization, and
  bounded connection/buffer counts. It calls `open(origin, callbacks)`, then
  `connect({pairingCode, ticket})`. Do not accept browser member/runtime fields.
- DNS/egress must not start until `connect()` returns true. Before every later
  DNS, connect or data operation, call `isActive()`; a delayed timer cannot extend
  access. Register each owned stream/pending DNS cancellation using `track()`
  before exposing it, unregister on normal close, and never exceed eight resources.
- `getLease()` returns an immutable active lease receipt (no bearer ticket). Send
  its leaseId to the browser so it can request renewal through its authenticated
  workbench session; it cannot grant authority by itself.
- `renewalDue` asks the browser for a new server-issued renewal ticket; it is not
  permission to extend a timer. `renew(ticket)` must succeed via signature and
  live server consumption. The old expiry remains armed while renewal is pending.
- Socket close, logout/account/environment/runtime change or explicit local
  revocation calls the channel's `close()`. Process exit calls device `close()`.
  Both release resources and invalidate pending acknowledgments. Server-side
  revocation is learned at the next consumption/renewal; offline instantaneous
  revocation is **not** claimed. Every lease has an independent hard deadline.
- Consumption has a five-second deadline. An unknown result closes the channel
  and burns that ticket locally; recovery needs explicit new-generation issuance.
  The replay cache is bounded (256 default, max 1024) and never evicts unexpired
  entries to make space. No guest commands are automatically replayed.

## Verification boundary

`npm run test:browser-vm:connector-authorization` includes real Ed25519 signatures,
local pairing/replay/lease/resource controller tests and fixed-client request
contracts. The default real device timer is also exercised, not just a fake clock.
`test/worker/connector-authorizations.test.ts` bridges the actual consumption
client to real `createApp` HTTP Request/Response and local D1. This verifies the
server/device authorization contract and revocation response, **not** an actual
HTTPS socket, production policy/key configuration, loopback WebSocket framing,
TCP forwarding, VM networking or product UI. Those remaining gates stay open.
