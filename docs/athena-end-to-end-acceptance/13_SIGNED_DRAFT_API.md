# Signed engineering draft API

2026-10-27 · E2E-1 · Backend metadata scope only.

## Contract and authority

`POST /api/v1/device/engineering-drafts` accepts the existing `SignedCommandEnvelope`, verified by the existing session/device/signature/nonce middleware. Required guards: authenticated owner, current authorized company, exact trusted Origin, CSRF, trusted registered device, valid signature/expiry/nonce, and verified private-network state. A signature grants no repository or execution permission. `X-Company-Id` is an authenticated company selection and must match the signed company; it is never trusted as authority by itself.

Example signed **payload only**, using synthetic IDs:

```json
{
  "operation": "engineering_draft_create",
  "companyId": "11111111-1111-4111-8111-111111111111",
  "request": {
    "repositoryId": "22222222-2222-4222-8222-222222222222",
    "request": "Add normalizeLabel with focused whitespace and Unicode tests.",
    "acceptanceCriteria": ["Whitespace is normalized and letters are preserved."],
    "constraints": ["Change no dependencies or deployment configuration."],
    "idempotencyKey": "stable-owner-draft-operation-id"
  }
}
```

The company/repository must actually be registered and authorized. This example is not an executable request or a credential. Canonicalize/sign the complete existing envelope using the trusted device's existing key; do not put keys, cookies, CSRF tokens or signatures in documentation or logs.

The strict shared `EngineeringDraftCreateOperationSchema` reuses the existing normalized software-objective request. Only an existing repository is accepted; new-project roots are null and previews are false. Extra identity, trust, approval, risk, command, environment, dispatch or execution fields are rejected. Input retains existing bounded brief/criteria/constraint limits, a 128 KB HTTP body ceiling and bounded route rate. No model is invoked for draft creation.

## Storage, policy and idempotency

`EngineeringDraftService` is a narrow ingress adapter for existing services, not a second engineering engine. It requires current PostgreSQL migrations; a non-durable API returns 503 instead of using memory.

1. Validate current owner/session/device/company/membership/repository/workspace/stop state and signed-envelope lifetime. Evaluate the finite registered `engineering.draft.create` tool through the existing policy engine. Its source-owned risk is read-only metadata, with session approval baseline and workspace-read scope; stronger policy/approval requirements deny. Policy evaluation/audit persist independently of a later business rollback.
2. Lock the existing owner/company/business-key namespace using `PostgresDatabase.transaction`. Use the existing delivery unique constraint and a SHA-256 of the complete normalized canonical request plus owner/company binding. Different canonical criteria, constraints, repository, brief, deadline or name under the same key conflict.
3. Hold shared authority/registry row locks, revalidate current records and the exact policy tool/workspace snapshots, then use `EngineeringDeliveryService.create` and `EngineeringManagerService.create` in server-owned draft mode. Objective, delivery, digest and required completion audit commit atomically. Storage/audit failure or expiry observed before commit rolls the metadata back.
4. Persist an objective with `draftOnly: true`, status `DRAFT`, zero reasoning/model work and zero tasks. Persist the delivery with status `DRAFT` and immutable `draftRequestDigest`. Return `executionState: "NOT_STARTED"`. Legacy run/resume/pause/recover/instruction/preview/integration paths deny this marker. Reading and canceling metadata remain allowed.

A retry after a lost acknowledgment must use a **new signed envelope** with the same business key and canonical content. Reusing the envelope remains a replay denial. Valid fresh retries return the same objective/delivery; new business keys express distinct intentions and are not globally deduplicated by prose similarity. Revalidation happens even when the draft already exists. A canceled draft remains canceled on retry. Draft cancellation returns after metadata updates, before preview/native controls or terminal-work continuation listeners.

Concurrent revoke/stop updates serialize against creation under PostgreSQL locks: an update committed first denies creation; creation already holding the authority lock commits before the waiting revocation can commit. Future requests then deny. This defines a database authorization ordering for inert metadata, not instantaneous distributed native termination. No external effect occurs on either side.

## Response and errors

Success is HTTP 200 for both first creation and equivalent retry. `EngineeringDraftResponseSchema` returns current operation/policy IDs, request digest, `NOT_STARTED`, and owner/company-scoped delivery/objective records. Cancellation retries return the same IDs with `CANCELLED` records and the immutable draft marker. No signing material or raw provider output is returned.

| Outcome                                                                               | HTTP behavior                                     |
| ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Invalid payload, extra authority fields or malformed envelope                         | 400                                               |
| Missing/expired identity                                                              | Existing 401/403 boundary                         |
| Scope, trust, current permissions, stop or policy denied                              | 403 or existing non-disclosing not-found boundary |
| Signed replay, changed-content key conflict or changed policy snapshot                | 409                                               |
| Oversized request / exceeded route budget                                             | 413 / 429                                         |
| Non-durable composition, unready storage, inconsistent state or audit/storage failure | 503; never success                                |

## Schema and rollback

No new table, column or SQL migration is needed: existing statuses are text and metadata is JSON; the existing owner/company/idempotency unique constraint remains in force. New shared metadata fields default old records to non-draft semantics. Existing regression and fresh disposable migrations are rerun. API/shared-reader upgrades must be coordinated: older strict readers may reject new fields/statuses. Do not remove a draft marker or reinterpret a draft as runnable to make an older binary work. Stop new submissions and retain inert records/audit when rolling back.

## Next dependency

Wire Android's existing signing/session/company/CSRF facilities to this finite endpoint with a stable business key across timeout/retry and a truthful “saved; execution not started” view. Obtain supported SDK build/unit and real-device signature evidence. Do not send drafts through the old auto-driving engineering-create path as a fallback. Reviewed activation, exact approvals, trusted Mac dispatch and cancellation/revocation receipts remain a separate later slice.
