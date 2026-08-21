# Reverse-proxy boundary

The supported hardened topology is Tailscale Serve on the same host proxying to
Fastify on loopback. Configure `TRUSTED_PROXY_MODE=loopback` and
`TAILSCALE_TRUST_SERVE_PROXY=true` only for that topology. Direct backend access
must remain loopback-only.

Do not use a generic remote reverse proxy, broad proxy CIDR, wildcard host,
wildcard credentialed CORS, or caller-controlled forwarding/Tailscale headers.
If a different proxy chain is required, review it and add exact spoofing tests
before deployment.
