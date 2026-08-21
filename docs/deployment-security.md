# Deployment security

Use one private HTTPS origin for dashboard and API. Set Fastify to loopback,
place Tailscale Serve in front, allow exactly the tailnet DNS host and HTTPS web
origin, and use a `__Host-` secure cookie. Never place production credentials in
the repository, a frontend `VITE_` variable, a service plist, or an image.

Production startup requires PostgreSQL, current migrations, Tailscale-required
mode, the real verifier, exact hosts/origin, loopback binding, secure cookies,
disabled owner bootstrap, log redaction, and disabled execution. It fails
instead of choosing memory when any prerequisite is missing.

Run:

```text
pnpm install --frozen-lockfile
pnpm db:migrate:deploy
pnpm verify:production-config
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Supply `DATABASE_URL` and other production values through the host environment
or a deployment secret store. Neon connection strings work because the adapter
uses standard PostgreSQL. Review SQL migrations and lockfile changes before
release. Dependency audit findings with a known exploitable path in runtime
code block release; document reviewed exceptions with owner and expiry.

Security headers include a self-only CSP, no framing, no object embedding,
no-referrer, content-type protection, and production HSTS. HSTS is deliberately
off in local HTTP development.

When read-only execution is enabled, production additionally requires
PostgreSQL and a persistent mode-0600 server execution-signing key. Pin its
public `x` value in the Mac-agent environment and treat rotation as a deliberate
re-pair/deployment event. Never place the private key in the frontend or image.
