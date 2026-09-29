# Formal connector authorization and bounded TCP transport

This directory is separate from the handshake-only `connector-probe`. The trusted
`startConnectorServer` assembly now listens on an ephemeral loopback port and
exposes the formal authorization protocol plus explicitly negotiated, bounded TCP
egress. It does not configure host networking, read credential files, terminate
guest TLS or install a background service. There is no production key loader,
product launcher or formal VM-client adapter yet; LC-007 remains open.

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
Disconnect is also permitted during pending consumption and cancels it. Binary
frames before explicit data negotiation, ping and pong close the socket. The
probe-authenticate/probe-ready protocol remains separate.

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

Bounds: 16 inbound TCP connections, 4 upgraded channels (including pending/closing),
10KiB JSON controls, 16389-byte binary messages (16KiB TCP data plus WISP header),
32 buffered non-empty fragments, 64 receive chunks. Control-only output is capped
at 4KiB; with egress, pending output/send callbacks share a cap of eight maximum
data frames plus 4KiB. There is no application send queue. Compression/automatic pong are disabled. The existing five-second auth/
consumption deadlines and independently armed lease deadline apply to actual
sockets. Close 1000 is explicit disconnect, 1001 is component shutdown, 1008 is
policy/authorization/expiry rejection; parser-level invalid/oversize frames can
have standard protocol close codes. No reason string exposes credentials.
Uncooperative peers/incomplete HTTP are force-closed after 100ms during shutdown.
A busy explicit port fails rather than replacing another process.

The optional programmatic `fetch`/`clock` inputs and `egressTransport`
(`{resolveDestination,dial}`) are trusted test/embed ports,
not web request fields. Production assembly must leave HTTPS validation enabled,
use the fixed issuer and install approved public keys. No synthetic keys or
successful fixture consumption responses are installed by this module.

## Explicit data negotiation

After `ready`, the client can send exactly:
```json
{"type":"start-egress","version":1,"protocol":"wisp-v1"}
```
A consumed active lease is still required. Duplicate/unknown negotiation closes
rather than replacing the stream manager. Server sends JSON `egress-ready` with
`version:1`, `protocol:"wisp-v1"`, `forwarding:true`, then binary WISP CONTINUE on
stream 0 with a 16-frame initial window. No DNS or TCP starts merely by enabling.
Initial `ready` and public `/identity` retain `forwarding:false`: neither implies
an active data plane. Subsequent `renewed` reports the channel's negotiated state.

The TCP-only subset uses type:u8 + streamId:u32LE, CONNECT(type 1) with TCP byte 1,
port:u16LE and ASCII hostname; DATA(type 2) of 1–16384 bytes; client CLOSE(type 4)
with reason 2. Server emits DATA, CONTINUE(type 3, replacement u32LE credits), and
sanitized CLOSE. No UDP, client CONTINUE, ID zero from client, IP mapping, unknown
version or malformed/oversized frame. IDs increase without reuse. Invalid frames
close synchronously before another message in the same TCP chunk can cause DNS.

Each stream inherits the initial window; **TCP connect does not send a new credit**
because pre-connect DATA can already be in flight. Only consuming and draining a
whole window grants another 16. Real socket write callbacks/drain and downstream
WebSocket send completion govern progress. A pending renewal can use only the old
lease until its independent hard deadline; failure destroys all owned streams.

Default egress uses the independent A/AAAA destination policy and a single pinned
literal address, no second lookup, fallback or proxy: only
`dl-cdn.alpinelinux.org`, `github.com`, `api.github.com`, ports 80/443. Special,
private, mapped or mixed DNS answers are denied. Each channel has at most eight
streams including DNS-pending, 5s DNS/connect and 15s stream idle deadlines.

The raw ingress meter runs before ws consumes socket data, including upgrade head,
mask/header bytes, empty continuation frames and JSON. It buffers at most 14 header
bytes, not payloads; ws remains the protocol validator. Both directions share
64MiB/100000 actual-frame upper bounds, reserving a final close frame and charging
outgoing headers conservatively. These are ceilings, not promised usable throughput.
They supplement the TCP manager's payload/logical-message budget.

The installed v86 WISP adapter sends IP literals and schedules reconnects; it is
**not yet compatible** with this domain-only, explicit-authority contract. Do not
reuse the development probe's synthetic IP table or ticket as production authority.
A formal guest DNS/client adapter and lifecycle acceptance are still required.

## Browser authorization transport (not yet a guest network adapter)

`egress-client.mjs` is browser-compatible and has no Node imports. Call
`createConnectorEgressClient({ url, pairingCode, ticket, renewTicket, onReady,
onFrame, onClose })` for one explicit connection to
`ws://127.0.0.1:<port>/connector`. The returned `send(binary)`, `close()` and
`readyState` (0 connecting, 1 ready, 3 closed) never reconnect or queue data.
Constructing a new instance requires explicit product lifecycle authorization;
reusing a consumed ticket does not grant a new connection.

- Initial credentials travel in one JSON message, never the URL. `onFrame`
  receives copied ArrayBuffers containing only validated WISP; authorization
  JSON is consumed internally. `onReady(frozenLease)` fires once, after both the
  egress ACK and the initial 16-credit frame have arrived. Neither callback is a
  claim that a guest VM has been wired. Callbacks are synchronous; throws close.
- `renewTicket(frozenLease, AbortSignal)` is a trusted product API integration
  port, not a webpage-configured issuer or replacement ACK. It must request one
  fresh member-authorized ticket without retrying ambiguous issuance. The client
  calls it once per revision, aborts on ACK/close, and imposes a 5-second combined
  issuance-and-ACK deadline. The old hard lease remains in force until a valid
  ACK. Host clock rollback, including after a forward jump, cannot extend it.
- Only the three exact lower-case domains and ports 80/443 are permitted in TCP
  CONNECT frames. IP literals, UDP, extra streams, stale IDs, over-credit DATA
  and malformed responses close. Each stream has 16 credits, at most eight are
  open, and each DATA is at most 16KiB. `bufferedAmount` has a hard aggregate
  ceiling; there is no client application queue. Server-side policy is still
  independently authoritative.
- A conservative 64MiB/100000 **message-layer** cap includes control and ignored
  replies for retired streams. Browsers do not expose raw WebSocket fragments;
  this is not a substitute for the server's actual wire meter.
- Close, timeout and protocol failure are terminal; late ticket promises cannot
  send or reopen. `onClose()` fires once and receives no credential/error text.
  Guest DNS packet handling and the v86 adapter must still be implemented, including disabling
  its native reconnect and unbounded congestion queue. Do not install this client
  as a transparent WebSocket substitute and assume v86's IP CONNECTs will work.

## Lease-scoped DNS association

After explicit egress negotiation, `client.resolve(hostname)` sends a JSON
`{type:"resolve-destination",version:1,requestId,hostname}`. It returns a Promise
of a frozen `{hostname,address}` snapshot, never a WISP frame. Only the same three
exact lower-case domains are accepted. The server runs the existing full A+AAAA
policy, including rejecting a mixed public/private answer set, and returns one
canonical public IPv4 address. IPv6-only results fail closed for this IPv4 guest
contract; this is not a general recursive DNS service or a DoH fallback.

Each request has a monotonically increasing uint32 ID, a five-second monotonic
deadline, its own abort/resource registration, and no retry. At most three DNS
queries may be pending; they share the authority's eight-resource cap with TCP
streams. Resource exhaustion, malformed controls, unknown names, mismatched or
late answers close the channel and reject all pending client promises. Active
DNS may continue under the old live lease while renewal is pending, never beyond
its hard deadline. Control messages use the existing wire/message budgets.

A DNS answer is only a name association, **not** permission to dial a literal IP.
Every TCP CONNECT must still send the approved domain; streams independently
resolve and pin it again. The guest adapter must implement bounded association
lifetime, ambiguity rejection, packet validation and cleanup on close/rebuild.
Those guest-facing parts remain unimplemented; this control plane does not prove
actual VM networking or authorize the probe's synthetic address table.

## Verification boundary

`npm run test:browser-vm:connector-authorization` includes real Ed25519 signatures,
local pairing/replay/lease/resource controller tests, fixed-client request
contracts and real loopback HTTP/WebSocket transport tests. Real default timers
also expire an actual socket without virtual time advancement. Control page
state tests use a small DOM harness, not a full browser.

The focused socket suite still uses controlled issuer responses. The additional
`scripts/browser-vm-connector-integration.test.mjs` runs the actual application,
session service, signer and D1 in local Workerd, connected to this real WebSocket
server through the fixed consume client. Its authorization cases verify issuance, pairing,
one-time consumption, renewal, live authority changes, lost committed responses,
concurrency, restart and actual socket closure without fake successful ACKs.
The test-only Worker entry is never included by the production entry or Wrangler.
Keys and sessions are ephemeral; all Workerd outbound network requests are rejected.
The canonical hostname is routed locally using Miniflare dispatchFetch, **not**
accessed over the internet. These integration lease tests use a controlled clock;
separate core/socket cases exercise default real timers.

LC-006's local authorization-contract acceptance is complete. This does not prove
production policy/key installation, real HTTPS consumption transport/certificates,
VM networking or product UI/account lifecycle. New same-chain egress cases add the
actual DNS policy and real local TCP: signed D1 consumption, explicit negotiation,
bytes, renewal, expiry/stop/denial destruction, pending DNS cancellation, window
exhaustion, 256KiB framing and paused-browser 16MiB backpressure. Test DNS returns
a fixed public answer and the already-validated dial is intentionally routed to
a loopback fixture. This proves local TCP behavior, not public-target connectivity.
LC-007–015 and D04/G0 remain open until their remaining acceptance work is done.

The built-in browser locally loaded this operator page and confirmed the stop
status, disabled controls and empty code display; the temporary component exited.
This is not a new remote HTTPS/Chrome/Edge admission or VM-network acceptance.

The formal browser transport has 27 deterministic protocol/lifetime/budget/DNS tests.
Three additional real Worker/D1 integration tests use this exact client with a
Node WebSocket implementing the browser EventTarget interface: live renewal on
one TCP connection, canceled pending DNS, and policy-disabled renewal releasing
TCP. Origin injection supplies only what a browser supplies automatically. These
are not in-app-browser or guest-VM acceptance results. Browser-platform ESM
bundling verifies module compatibility, not a deployed browser session.

Eight additional same-chain integration cases exercise formal DNS resolution,
independent re-resolution before TCP, cancellation with late-result suppression,
unauthenticated/control-only/invalid coalesced requests, and DNS during both
client-side issuance and server-side renewal consumption. Six DNS-unit tests
cover shared resource accounting, limits, deadlines and failure cleanup. All
DNS answers and final TCP destinations remain controlled local test fixtures.
