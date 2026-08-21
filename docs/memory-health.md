# Memory Health

Memory health summarizes cognitive data quality for owner review.

## Metrics

- total items;
- low-confidence items;
- stale items;
- conflict count;
- embedding coverage;
- archived and pinned controls.

## Validation

The `memory:health` and `memory:validate` CLI commands read the same service
surface as the API. They report bounded metadata and do not execute cleanup,
delete records, or mutate source systems.

## Failure model

Unknown owner scope, inconsistent state, unavailable source stores, or invalid
payloads fail closed. Health diagnostics must not include secrets, raw vectors,
raw content dumps, or sensitive action arguments.
