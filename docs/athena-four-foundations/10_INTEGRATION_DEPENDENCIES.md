# Integration dependencies and storage decisions

> Program version 0.1 · 2026-10-26 · INTERNAL REVIEW DRAFT
> Only MCP-1A is authorized for implementation in this run. Other foundations are designs and acceptance plans.

## Existing shared dependencies

| Existing component         | MCP-1A use                                                                | Later foundation use                                                  |
| -------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Shared Zod contracts       | Finite request/discovery/result contracts; no caller trust/risk           | Dataset/artifact/experiment refs and strict configs                   |
| Identity/security/company  | Existing signed session/device/network and scoped registry reads          | Same context before ingestion, promotion or compute                   |
| Workspace registry         | Existing project-resource boundary and read permission                    | Repository rights and explicitly approved artifact/compute scope      |
| Integration registry/store | Company MCP descriptor and explicit grant/revocation                      | Reviewed storage, serving and simulator/provider bindings             |
| Policy/approval/audit      | Existing deterministic decision and safe persistent evidence              | Consequential human promotion/compute/deployment approvals            |
| AIRouter/model registries  | Unchanged; no automatic agent/tool enrollment                             | Approved artifact-serving binding supplies eligible descriptor        |
| Economics                  | Local MCP has zero paid spend with bounded host quotas                    | Training/inference/remote-job reservations and reconciliation         |
| Engineering outcomes       | No source capture in fixture                                              | Rights/human acceptance source adapter for datasets                   |
| PostgreSQL/unit of work    | Existing grants/policy/audit; additive provider vocabulary migration 0111 | Immutable dataset/artifact/experiment transition records as needed    |
| Signed Mac execution       | Unchanged; no new native channel                                          | Any reviewed native serving operation must preserve existing dispatch |

## Dependency additions and excluded infrastructure

MCP SDK version is exact-pinned in the API package/lockfile; it supplies protocol implementation, not authority or credential management. Child launch/buffering is bounded separately. No new database, vector store, graph store, broker, daemon, websocket, production endpoint or generic executor is justified by the first slice.

Model weights, training data and report artifacts need approved storage tokens/checksums; those storage decisions are future prerequisites. Existing source-content restrictions remain in force. New persistent adapters must use existing PostgreSQL patterns and disposable acceptance, never silent in-memory production fallback.

## Open decisions

Select reviewed remote MCP accounts and auth scopes only after local acceptance. Approve dataset rights/human-acceptance policy before ingestion. Choose artifact storage, serving profiles and model licenses before training/hosting. Choose binary problem family/scientific hypothesis before optimization implementation. Define accountable human reviewers and resource ceilings for each later phase.
