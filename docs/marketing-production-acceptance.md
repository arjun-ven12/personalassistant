# Marketing creative production acceptance

## Current result

No reviewed production image, video, or design provider is available for
Marketing campaigns. The current production Universal Tool adapters expose a
governed analytics read plus finite native provider health/focus capabilities;
none declares `image.generate` or `video.generate`. The only remote reviewed
manifest is a read-only DeepWiki contract. Therefore a campaign must keep a
creative deliverable unavailable until this acceptance gate is completed.

The marketing creative route and recovery logic are intentionally not evidence
that a provider is production ready. They select only registered tools, require
a gateway receipt for recovery, and fail closed on missing or indeterminate
outcomes. No provider invocation was performed for this assessment.

## External acceptance prerequisites

1. Implement one finite, server-owned reviewed provider handler for exactly the
   declared creative capability (`image.generate` or `video.generate`). Its
   input and output schemas must remain bounded to the marketing creative
   request and opaque asset reference/media type contract. Do not accept a
   model-selected endpoint, provider ID, path, arbitrary prompt, or arbitrary
   provider arguments.
2. Register the handler in the production Universal Tool adapter factory with a
   reviewed manifest. The provider, tool, review, version, schema digest,
   company scope, health, risk, approval requirement, and credential reference
   must all match at invocation time.
3. Demonstrate provider-side idempotent reconciliation for the exact gateway
   invocation ID. The handler must declare
   `PROVIDER_IDEMPOTENT_RECONCILABLE` and implement bounded receipt recovery.
   A missing, failed, changed-tool, changed-media, or unknown receipt must
   remain blocked for owner review; it must never rerun the write or switch
   providers.
4. Bind a company-scoped credential reference owned by the configured provider
   and verify that it is `READY` through `UniversalCredentialScope`. Configure
   the server-side secret resolver through deployment secret management only.
   Do not put secret values, credential locators, or provider tokens in source,
   logs, campaign records, artifacts, audit metadata, or model context.
5. Run the approved production persistence setup, including the Phase 28.2
   migration and production security validation. Production must not use
   in-memory tool receipts or campaign storage.
6. With an explicitly authorized non-public test account and bounded test
   brief, prove: selection of the one reviewed provider; explicit approval when
   required; one gateway receipt; provider result matching the declared media
   type; persisted opaque asset reference; exact-id receipt recovery after an
   interrupted campaign update; and owner-review blocking for an unknown
   receipt. Record only bounded identifiers, statuses, and digests in the
   acceptance evidence.
7. Keep public publishing and paid activation unavailable. A successful asset
   generation acceptance does not authorize social publishing, ad spend, or
   campaign activation.

## Audit and event boundary

Existing Universal Tool gateway audit events already cover requested,
approved/denied, succeeded, failed, and receipt-backed operations. Marketing
campaign state changes are persisted and audited by the service. Dedicated
realtime campaign events are not a prerequisite for creative-provider
acceptance and should not be introduced as a separate execution path.
