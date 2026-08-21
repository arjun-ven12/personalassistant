# Development

## Requirements

- Node.js 22 or newer (Node 24 is supported).
- pnpm 11.17 or a compatible pnpm 11 release.
- macOS for launching the Electron Mac-agent shell.

No database, Redis, Docker, Tailscale, camera, microphone, Accessibility,
screen-recording permission, OAuth credential, or external API is required.

## Install and configure

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/mac-agent/.env.example apps/mac-agent/.env
```

The examples contain development-only values and no secrets. Keep
`PRIVATE_NETWORK_REQUIRED=true`; verification remains `UNKNOWN` until a later
phase implements Tailscale. `AUTH_ALLOW_OWNER_BOOTSTRAP=true` permits exactly
one in-memory development owner. Production mode forces bootstrap off.

There is no root `.env`. Server identity configuration belongs in
`apps/api/.env`; renderer-safe variables belong in `apps/web/.env`; Mac-agent
configuration belongs in `apps/mac-agent/.env`. No Neon or database URL is used
in Phase 2.2.

## Commands

```bash
pnpm dev
pnpm dev:web
pnpm dev:api
pnpm dev:mac-agent
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format
pnpm format:check
pnpm clean
```

`pnpm dev` starts the API, web dashboard, and Electron agent together. To run
one package directly:

```bash
pnpm --filter @alexa-control/api dev
pnpm --filter @alexa-control/web dev
pnpm --filter @alexa-control/mac-agent dev
```

Default local addresses:

- API: `http://127.0.0.1:3001`
- Web: `http://localhost:5173`
- Mac-agent renderer: `http://127.0.0.1:5174` in development only

## Manual API verification

With the API running:

```bash
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3001/api/system/status
curl http://127.0.0.1:3001/api/security/status
curl -X POST http://127.0.0.1:3001/api/security/emergency-stop
curl -i -X POST http://127.0.0.1:3001/api/security/execution/enable
```

Protected requests require a session cookie. Register the initial development
owner through the web dashboard, then use the browser for status and emergency
stop. The execution-enable request must return HTTP 409 and
`EXECUTION_NOT_AVAILABLE`.

The default governance store starts with emergency stop active and network
verification `UNKNOWN`, so policy simulation fails closed. Tests inject an
in-memory store with the stop inactive and a deterministic private-network
verifier to exercise approval and allow branches. Development code never fakes
`PRIVATE_NETWORK`.

## Mac-agent connection check

Start the API and Mac agent, confirm the configured endpoint in Diagnostics,
then select **Test API connection**. In the dashboard, create a pairing code.
Enter it in the Mac agent, compare the displayed fingerprint with the pending
device, approve it in the dashboard, and select **Check status**. The renderer
does not receive generic network or private-key access from preload.

## Testing and build

`pnpm test` runs Vitest without external services. `pnpm typecheck` checks every
workspace under strict TypeScript. `pnpm lint` applies the shared flat ESLint
configuration. `pnpm build` produces Vite web/renderer assets, the Fastify
server bundle, Electron main/preload bundles, and package declarations.

## Troubleshooting

- **API shown offline:** start `pnpm dev:api`, verify `VITE_API_BASE_URL`, and
  ensure `WEB_ORIGIN` matches the dashboard origin.
- **CORS error:** copy the example environments and avoid mixing `localhost`
  and `127.0.0.1` origins without updating `WEB_ORIGIN`.
- **Electron fails to start:** confirm macOS, reinstall dependencies, and ensure
  ports 5174 and 3001 are free.
- **Environment validation fails:** values are intentionally strict; ports must
  be valid, origins must be URLs, and boolean values are `true` or `false`.
- **Build artifacts appear stale:** run `pnpm clean && pnpm build`.

## Current limitations

The platform has identity, governance, production persistence, Tailscale-aware
network verification, constrained read-only execution, repository intelligence,
human-approved patches, validation profiles, workflow coordination, and Phase 6
integration descriptors.

Phase 6 currently provides connector registry, capability, permission, health,
usage, operation-request, dashboard, audit, and persistence foundations. Phase 7
adds deterministic multi-agent coordination records: specialist registry, task
assignments, immutable messages, shared context, consensus, health, metrics, and
dashboard.

The platform does not perform live OAuth/PAT exchanges, third-party API calls,
Slack sends, Jira updates, Notion writes, CI dispatch, deployments, IDE control,
or independent multi-agent LLM execution. Those require small reviewed adapters
or workers built on the same policy and approval model.

# Phase 2.3 development

The API reads `apps/api/.env` outside production. Keep `STORE_MODE=memory` and
`NETWORK_VERIFIER_MODE=unknown` for explicit local development, or supply a
development PostgreSQL URL and run `pnpm db:migrate`. Tests inject private
network state and mocked Mac secure storage; they never use the developer's
Keychain or Tailscale account. Production never reads a local `.env` file.

## Phase 3 read-only development

Read-only execution is opt-in. Apply `pnpm db:migrate`, set
`READ_ONLY_EXECUTION_ENABLED=true`, and use an ignored
`SERVER_EXECUTION_SIGNING_KEY_PATH`. The API creates a mode-0600 development
key if absent. New Mac agent pairing responses include the public server-key
pin, which the agent stores as non-secret metadata. Automated path tests use
temporary directories and Git tests use temporary repositories; they do not
inspect personal files.

After the API has created the ignored development key, print only its public
pin with `pnpm execution:key:public` only for older development agents that
still rely on `ALEXA_SERVER_EXECUTION_PUBLIC_KEY`. Never copy or expose the
private JWK.
