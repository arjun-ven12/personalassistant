# Networking

## Planned production path

```text
Android phone / approved browser
              ↓
      Private Tailscale network
              ↓
       Authenticated API server
              ↓
     Registered Mac-agent device
```

Tailscale is not configured in Phase 2.1. `NetworkVerifier` exists but returns
`UNKNOWN`. The API reports private-network status as `not_configured`, and
network-gated execution must deny.

## Required future rules

1. Do not expose the Mac agent directly to the public internet.
2. Do not configure router port forwarding.
3. Use Tailscale for private device connectivity.
4. Restrict access to required ports only.
5. Use device-specific identities or tags.
6. Require API authentication even inside the VPN.
7. Do not treat VPN membership as tool permission.
8. Sign requests with registered device identities.
9. Include expiry, nonce, and replay protection in commands.
10. Reject commands when private-network verification fails.
11. Preserve a local emergency stop when the server is unreachable.
12. Defer Tailscale setup to a later deployment phase.

## Illustrative future access model

This is illustrative only; it is not a production ACL:

```text
Controller device → API port only
Mac agent         → API port only
Other devices     → denied
Public internet   → unreachable
```

A production Tailscale ACL is intentionally absent because device tags and
deployment topology are not final.

## Device requests

Development devices generate a public/private key pair locally and retain the
private key. The server stores only the public key. Signed envelopes carry an
explicit protocol version, issued time, expiry, nonce, payload, signature, and
signature algorithm. Phase 2.1 verifies Ed25519 signatures, trust state,
timestamps, and in-memory nonce uniqueness but never executes the payload.
Durable replay state and Tailscale-backed verification remain future work.

# Phase 2.3 Tailscale boundary

Production uses Tailscale Serve, never public exposure. Direct Tailscale
addresses require LocalAPI identity resolution; Serve identity headers are
accepted only from an explicitly trusted loopback proxy. RFC 1918 addresses,
forwarding headers, host/origin values, and cookies do not establish tailnet
membership. See [private networking](private-networking.md).
