# Authentication, device identity, and pairing

## Current implementation boundary

Phase 2.1 establishes identity and trust. It does not grant execution authority.
An authenticated owner or trusted device still cannot open applications, access
workspaces, execute commands, invoke Codex, automate a browser, access sensors,
or control the operating system.

Server users, sessions, devices, pairing intents, nonces, and audit records are
stored in memory for development. They disappear when the API restarts. The Mac
agent keeps its private `CryptoKey` in main-process memory only; it must pair
again after restart. This is deliberately safer than inventing unreviewed
durable secret storage, but it is not production-ready.

## Password authentication

The first owner can bootstrap an account only when
`AUTH_ALLOW_OWNER_BOOTSTRAP=true`. Production mode forces bootstrap off even if
the variable is set.

Passwords:

- Require 12–128 characters.
- Require uppercase, lowercase, number, and symbol.
- Cannot contain the email username.
- Are hashed with Argon2id.
- Are never returned, logged, audited, or placed in browser-readable storage.

Login uses a dummy Argon2id hash when an email is unknown to reduce
username-enumeration timing differences. Error messages do not reveal whether
an account exists.

Google OAuth has only a status and fail-closed placeholder. No OAuth URL,
credential exchange, profile request, or external call exists.

## Session model

Successful registration or login creates a 256-bit random token. The browser
receives it only in an `HttpOnly`, `SameSite=Strict` cookie. The development API
stores only its SHA-256 hash.

Sessions contain an ID, owner ID, creation/expiry/last-seen timestamps,
revocation timestamp, source IP, and bounded user-agent string. Logout and
explicit session revocation take effect immediately. Expired, revoked, missing,
or owner-disabled sessions fail authentication.

Production cookies are marked `Secure`. Deployment must keep the dashboard and
API same-site or explicitly redesign and review cookie and CSRF controls.
State-changing browser routes also require the configured dashboard `Origin`.

## Pairing ceremony

```text
Authenticated owner dashboard
        │
        ├─ creates five-minute one-time pairing code
        │
        ▼
Mac-agent isolated main process
        │
        ├─ generates Ed25519 key pair with Node WebCrypto
        ├─ retains private CryptoKey in memory
        └─ sends pairing code + device metadata + public JWK only
                         │
                         ▼
                    API stores PENDING device
                         │
                         ├─ returns random polling token
                         ▼
Owner compares fingerprint and approves
                         │
                         ▼
                    Device becomes TRUSTED
```

Pairing codes are random, hashed server-side, expire after five minutes by
default, and are consumed once. The polling token is independently random and
stored only as a hash. Approval and revocation require an authenticated owner
session and trusted browser origin.

The API computes the public-key fingerprint; the agent computes the same
fingerprint locally. The owner should compare it before approval. The public
key is not returned in device-list responses.

## Signed request protocol

Phase 2.1 provides a verification-only route. It never executes the payload.
The signed envelope includes:

- `commandId`
- `deviceId`
- `issuedAt`
- `expiresAt`
- `nonce`
- JSON `payload`
- `signature`
- `signatureAlgorithm` fixed to `Ed25519`
- `protocolVersion` fixed to `1`

The canonical message excludes `signature`, recursively sorts object keys, and
serialises only JSON values. Verification binds the full envelope, including
the device, expiry, nonce, payload, algorithm, and protocol version.

Requests are rejected when the device is unknown or not `TRUSTED`, the device
does not belong to the authenticated owner, the timestamp is outside the
configured tolerance, expiry has passed, signature verification fails, or the
nonce has already been consumed. Nonces are consumed only after a valid
signature and are retained through envelope expiry.

The verification response always states `executionAllowed: false`.

Phase 2.2 policy simulation consumes authenticated owner context but does not
change this protocol or treat identity as authority. Device trust,
signed-envelope verification, network verification, policy authorization, and
future execution remain separate layers.

## Network verification

`NetworkVerifier` supports `UNKNOWN`, `PRIVATE_NETWORK`, `PUBLIC_NETWORK`, and
`UNAVAILABLE`. The Phase 2.1 implementation always returns `UNKNOWN`. Middleware
for private-network enforcement exists and fails closed unless the state is
`PRIVATE_NETWORK`; no route can use network uncertainty to enable execution.

## Audit events

The development audit store records registration, login success/failure,
logout, session revocation, pairing intent/request, device approval/revocation,
invalid signatures, replay rejection, and other request denials. Records
contain timestamp, user/device IDs when known, IP, outcome, bounded reason, and
request ID. They exclude passwords, cookie tokens, pairing tokens, pairing
codes, signatures, and key material. Phase 2.2 adds bounded governance metadata
such as record IDs, decision codes, risk, approval requirements, and action
digests; complete action arguments are excluded.

## Production work still required

- Reviewed persistent database schema and migrations.
- Encrypted, access-controlled durable Mac private-key storage that does not
  expose a generic Keychain capability to the assistant.
- Real Google OAuth with state, PKCE, nonce, account linking, and callback
  validation.
- Tailscale-backed network verification.
- Distributed or durable session, nonce, rate-limit, and audit storage.
- Passkeys, account recovery, lockout policy, email verification, and key
  rotation.
- Production TLS, reverse-proxy, cookie-domain, backup, and incident-response
  configuration.

# Phase 2.3 identity lifecycle

Sessions now have idle and absolute expiry plus persistent revocation. CSRF and
recent-auth grants are invalidated with their session. High-risk approval uses
purpose-bound password re-authentication. The Mac Ed25519 private key persists
through Electron secure storage and never crosses preload IPC or reaches the
API. Missing or corrupt keys require explicit reset and re-pairing.
