# Alexa cloud runtime

The initial cloud deployment is one portable container. Neon remains the durable
PostgreSQL source of truth and Upstash remains ephemeral Redis coordination.
The container does not host either database and does not execute macOS
capabilities.

## Commands

```text
docker build -t alexa-cloud .
docker run --rm --env-file /secure/alexa-cloud.env alexa-cloud node dist/validate-environment.js
docker run --rm --env-file /secure/alexa-cloud.env alexa-cloud node dist/database.js deploy
docker run --rm -p 3001:3001 --env-file /secure/alexa-cloud.env alexa-cloud
```

Configure the host to terminate HTTPS, forward exactly one proxy hop, and check
`/health` for liveness and `/ready` for readiness. The structured runtime status
is available at `/api/v1/health`. Run migrations as an explicit release step,
not on every application start.

Mount durable storage at `/app/api/.local` so the server execution signing key
survives restarts and rolling deployments. The container creates that directory
for the unprivileged `node` runtime user and never needs root at application
startup.

Required cloud variables are documented in `apps/api/.env.example`. Store all
database, Redis, provider, cookie, and signing secrets in the host's secret
manager. Web and Mac clients select the deployment with `VITE_API_BASE_URL` and
`ALEXA_API_BASE_URL`; no production URL is hard-coded in application code.
