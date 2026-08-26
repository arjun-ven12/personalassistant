# Public surface classification

The container exposes one Fastify listener. Routes fall into these classes:

| Class                    | Routes                                                                             | Boundary                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Liveness/readiness       | `GET /health`, `GET /ready`, `GET /api/v1/health`                                  | Intentionally public, bounded, no secrets or provider calls                                                                          |
| Owner authentication     | `/api/auth/*`                                                                      | Rate-limited credentials or authenticated session                                                                                    |
| Device pairing           | Pairing request/status routes                                                      | Short-lived one-time code and opaque request token                                                                                   |
| Trusted device transport | Mac execution, voice, discovery, spatial, and `POST /api/v1/device/system-summary` | Trusted registered device, Ed25519 signature, bounded timestamp, expiry, nonce replay rejection, and route-specific device type      |
| Owner API                | Remaining `/api/*` routes                                                          | Authenticated owner session; mutations additionally require exact origin and CSRF, plus recent authentication/approval where defined |

Production configuration denies wildcard credentialed CORS, wildcard hosts,
owner bootstrap, test network verifiers, privileged execution, plaintext public
base URLs, and unbounded proxy trust. Production error responses suppress stack
traces, SQL, filesystem paths, and environment values.
