# Private networking

Production uses a tailnet-only Tailscale Serve HTTPS endpoint in front of the
Fastify API bound to loopback. Public Funnel exposure is unsupported.

Connectivity is only the outer gate:

`Tailscale → HTTPS → session → trusted device/signature → network verifier → policy → approval`

Tailnet membership never replaces owner login, device trust, signatures, policy,
or recent authentication. Policy approval never creates execution capability.

## Verification modes

- `unknown`: explicit local-development fail-closed mode.
- `tailscale`: production mode. A direct `100.64.0.0/10` or
  `fd7a:115c:a1e0::/48` socket address is resolved through LocalAPI `whois`.
  Loopback proxy identity headers are accepted only when
  `TAILSCALE_TRUST_SERVE_PROXY=true`.
- `test`: dependency-injected tests only; production validation rejects it.

Ordinary LAN addresses, host/origin headers, cookies, and caller-supplied
forwarding headers are never proof of Tailscale membership. Ambiguous or
unavailable verification returns `UNKNOWN` or `UNAVAILABLE` and policy denies.

See [`deploy/tailscale/README.md`](../deploy/tailscale/README.md) for operator
steps and the illustrative least-privilege grants file.

Agent poll, claim, start and result requests also require device signatures and
`PRIVATE_NETWORK`. The Mac remains outbound-only; it opens no listener.
