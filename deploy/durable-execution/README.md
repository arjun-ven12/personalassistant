# Durable execution deployment

Phase 25.6 defaults to Alexa's PostgreSQL-backed durable state machine and reviewed local Docker sandbox provider.

Before enabling production cross-company services:

1. Apply database migration `0088_phase_25_6_durable_cross_company_execution.sql`.
2. Register a production activity adapter that implements both idempotent `execute` and `reconcile`.
3. Add a centralized scheduler with an atomic execution claim/lease. Do not run uncoordinated parallel workers against the current advance method.
4. Bind service budget reservation and settlement to Agent Economy.
5. Configure the existing company-scoped artifact resolver.
6. Review and install the fixed Docker binary/images if local sandboxing is enabled. Keep network disabled.
7. Optionally register `LiteLLMGatewayProvider` beneath AIRouter with a server-owned HTTPS endpoint, host allowlist, model list, and secret from the existing secret manager.

Temporal, E2B, and LiteLLM services are not deployed by this directory. See `docs/phase-25-6-durable-cross-company-execution.md` for the explicit integration decisions and deferred acceptance items.
