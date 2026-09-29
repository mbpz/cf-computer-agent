# Formal connector authorization transport (no egress yet)

This directory is separate from the handshake-only `connector-probe`. The trusted
`startConnectorServer` assembly now listens on an ephemeral loopback port and
exposes the formal authorization protocol. It does **not** forward packets,
configure host networking, read credential files or install a background service.
There is no production key loader/product launcher yet. LC-007 supplies egress.

## Trusted assembly

- The operator chooses one exact HTTPS workbench origin and an installed policy.
  Public Ed25519 keys (active plus optional retiring key) are installed out of
  band. Never accept a key, issuer URL, policy or identity from a browser message.
- `startConnectorServer({allowedOrigin, policyVersion, verificationKeys, port?})`
  assembles `createConnectorConsumeClient({issuerOrigin: allowedOrigin})` and
  `createConnectorDevice`, returning `{url, close}`. The optional port defaults
  to OS allocation; there is no host override or port scan. The client sends
  only to the fixed `/api/connector/consume` path, with no cookies, redirects or automatic retries.
  TLS validation is the platform default. The optional fetch/clock ports support
  embedding and local integration tests; web messages must never control them.
- Each device instance generates a new connectorId. Obtain that public identifier
  through the guarded local-control protocol before asking the workbench
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
- Socket close, explicit disconnect and local stop close the owned channels.
  The future product client must also disconnect on logout/account/environment/
  runtime change; this UI wiring is not implemented here. The embedding launcher
  must call the returned `close()` during graceful shutdown. Closing releases
  resources and invalidates pending acknowledgments. Server-side
  revocation is learned at the next consumption/renewal; offline instantaneous
  revocation is **not** claimed. Every lease has an independent hard deadline.
- Consumption has a five-second deadline. An unknown result closes the channel
  and burns that ticket locally; recovery needs explicit new-generation issuance.
  The replay cache is bounded (256 default, max 1024) and never evicts unexpired
  entries to make space. No guest commands are automatically replayed.

## Version 1 wire and local-control protocol

The listener binds only `127.0.0.1`. All requests require exactly one matching
Host; upgrades require exactly one matching allowed HTTPS Origin. Cookies,
Authorization, URL parameters and subprotocol selection are rejected on upgrade.
No CORS headers, configurable paths, credential URLs or general file serving.
The local control page has no external assets and cannot be framed.

- `GET /`: local operator page; does not generate a code automatically.
- `GET /identity`: public `{version:1,connectorId,allowedOrigin,policyVersion,forwarding:false}`.
- `POST /pair`: zero body, exact **local control** Origin (not the remote
  workbench Origin), `Content-Type: application/json`. Returns the one-use
  pairing receipt. Concurrent issuance while hashing returns 409. New issuance
  invalidates the previous unused code. The page clears its display at expiry,
  navigation and stop; clearing display alone is not server-side revocation.
- `POST /stop`: same guards, stops the whole instance, invalidates pending pairing
  and closes all channels. The page clears secrets even when the result is
  unknown; it never converts a failed request into a successful-stop claim.
- `WS /connector`: exact remote Origin plus the following JSON text protocol.
  Origin is a browser boundary, **not** a replacement for pairing/signatures.

Browser to connector:
```json
{"type":"authenticate","version":1,"pairingCode":"ONE_USE_CODE","ticket":"SIGNED_CONNECT_TICKET"}
{"type":"renew","version":1,"ticket":"SIGNED_RENEWAL_TICKET"}
{"type":"disconnect","version":1}
```
No extra fields/identity claims, out-of-order or concurrent authorization frames.
Disconnect is also permitted during pending consumption and cancels it. Binary,
DNS/connect/data messages, ping and pong are not part of this version and close
the socket. The probe-authenticate/probe-ready protocol remains separate.

Connector to browser after successful signature **and live server consumption**:
```json
{"type":"ready","version":1,"forwarding":false,"lease":{"leaseId":"ID","revision":1,"expiresAtMs":123456,"renewAfterMs":120000}}
{"type":"renewal-needed","version":1,"leaseId":"ID","revision":1}
{"type":"renewed","version":1,"forwarding":false,"lease":{"leaseId":"ID","revision":2,"expiresAtMs":153456,"renewAfterMs":150000}}
```
The timestamps above illustrate the receipt shape, not executable authorization.
Neither signed tickets nor pairing codes are echoed. The leaseId/revision lets
an authenticated browser request renewal from the workbench; it is not itself a
capability. The device's retained binding and the server still govern authority.

Bounds: 16 TCP connections, 4 upgraded channels (including pending/closing), 10KiB
message payload, 32 buffered non-empty fragments, 64 receive chunks, 4KiB outgoing
queue. Compression/automatic pong are disabled. The existing five-second auth/
consumption deadlines and independently armed lease deadline apply to actual
sockets. Close 1000 is explicit disconnect, 1001 is component shutdown, 1008 is
policy/authorization/expiry rejection; parser-level invalid/oversize frames can
have standard protocol close codes. No reason string exposes credentials.
Uncooperative peers/incomplete HTTP are force-closed after 100ms during shutdown.
A busy explicit port fails rather than replacing another process.

The optional programmatic `fetch`/`clock` inputs are trusted test/embed ports,
not web request fields. Production assembly must leave HTTPS validation enabled,
use the fixed issuer and install approved public keys. No synthetic keys or
successful fixture consumption responses are installed by this module.

## Verification boundary

`npm run test:browser-vm:connector-authorization` includes real Ed25519 signatures,
local pairing/replay/lease/resource controller tests, fixed-client request
contracts and real loopback HTTP/WebSocket transport tests. Real default timers
also expire an actual socket without virtual time advancement. Control page
state tests use a small DOM harness, not a full browser.

The focused socket suite still uses controlled issuer responses. The additional
`scripts/browser-vm-connector-integration.test.mjs` runs the actual application,
session service, signer and D1 in local Workerd, connected to this real WebSocket
server through the fixed consume client. Its 17 cases verify issuance, pairing,
one-time consumption, renewal, live authority changes, lost committed responses,
concurrency, restart and actual socket closure without fake successful ACKs.
The test-only Worker entry is never included by the production entry or Wrangler.
Keys and sessions are ephemeral; all outbound network requests are rejected.
The canonical hostname is routed locally using Miniflare dispatchFetch, **not**
accessed over the internet. These integration lease tests use a controlled clock;
separate core/socket cases exercise default real timers.

LC-006's local authorization-contract acceptance is complete. This does not prove
production policy/key installation, real HTTPS consumption transport/certificates,
TCP forwarding, VM networking or product UI/account lifecycle. LC-007 is next;
LC-007–015 and D04/G0 remain open.

The built-in browser locally loaded this operator page and confirmed the stop
status, disabled controls and empty code display; the temporary component exited.
This is not a new remote HTTPS/Chrome/Edge admission or VM-network acceptance.
