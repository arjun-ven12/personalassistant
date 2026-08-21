# Read-only agent protocol

The Mac opens no listener. Its main process polls the fixed
`POST /api/agent/execution` endpoint with a device Ed25519 envelope. The API
verifies persistent trust, private network, timestamp, signature and nonce
before accepting a strict poll, claim, start, heartbeat or result operation.

The server has a separate Ed25519 signing identity. Its private JWK is stored in
a mode-0600 host file outside source control; production requires a persistent
path. New pairing responses include the public `x` value and fingerprint, which
the Mac agent persists as non-secret metadata. Existing development agents may
still pin the public key through `ALEXA_SERVER_EXECUTION_PUBLIC_KEY`. Unexpected
keys fail closed.

Server work binds request, owner, device, workspace, exact arguments, policy,
approval, action digest, expiry, nonce and security-state version. Device
results bind command, request, device, tool, result digest, timestamps,
duration, truncation and a fresh nonce. The API verifies these before an atomic
terminal transition.

Polling returns at most one item and the agent runs one at a time. Poll
responses also carry bounded cancellation hints, and active work sends signed
heartbeats. Revocation cancels outstanding work. Emergency stop returns no work
and rejects claim, start, heartbeat and result. After restart, stale running
work is never reported as successful; it expires or requires a new request.

Server-key rotation is represented by keyed fingerprints and additive database
state. A safe rotation uses a dual-key window: pair or update agents with the
new public pin, keep the old verifier trusted until active requests drain, then
retire the old fingerprint. Rotation must never accept unsigned work or device
results.
