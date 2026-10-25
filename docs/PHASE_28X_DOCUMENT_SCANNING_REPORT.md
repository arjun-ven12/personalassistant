# Phase 28.X — Android documents and scanning

Date: 2026-10-19. Status: **CONDITIONALLY VERIFIED**.

## IMPLEMENTED

- Android Athena → Scan / Documents: external-camera capture, JPEG/PNG import,
  app-private original preview, up to five ordered pages, explicit Use scan, durable
  progress polling, restart-safe pending upload key, retry and duplicate protection.
- Documents list with authenticated thumbnails, title/date/type/pages/OCR/memory
  status, collections, search, original/cleaned image views, raw text, separate
  extractive interpretation, rename/tags, OCR retry, memory controls and JSON sharing.
- Private assets behind a storage interface. PostgreSQL is the authority for records,
  processing leases, settings, upload grants and immutable OCR-run provenance.
  Migration: `0117_phase_28x_document_vault.sql`. Existing company/auth/CSRF/origin,
  audit, memory and company semantic-index infrastructure is reused.
- Finite local provider capabilities: `document.scan.process`, `document.ocr`,
  `document.classify`. Company-specific registration/review/activation uses the
  existing Universal Tool Gateway. Disabled/revoked providers do not silently
  reactivate. Gateway receipts contain temporary opaque result IDs, not OCR text.
- Cleanup: EXIF orientation, conservative rectangular page detection/crop, bounded
  small-angle text deskew, contrast and sharpening, color-preserving scan and
  thumbnail. Originals are never overwritten. Ambiguous boundaries retain the full
  frame and produce a warning. Glare/perspective changes are not guessed.
- Local English OCR: Tesseract.js 7.0.0, bundled English data 1.0.0. No cloud OCR
  credential or language download. Provider interface normalizes text, confidence,
  language, version, timestamps, latency and cost. Timeout is bounded at 40 seconds;
  delayed worker initialization is terminated. OCR_FAILED preserves source/scan.
- Deterministic extractive interpretation, version extractive-1: title/type/tags,
  short source excerpt, dates, explicitly labelled entities and action lines.
  It never substitutes inferred content for raw OCR or executes suggested tasks.
- Memory defaults SUGGEST. OFF and explicitly approved category auto mode are
  supported. Only high-confidence Study/Note content can enter canonical memory;
  automatic mode is further restricted to Study in an approved collection. Receipts,
  unknown categories, detected sensitive content and incomplete/uncertain OCR are
  excluded. At most two sentences/600 characters per page are proposed as useful
  content, with source document/page/asset/OCR-version provenance. Memory indexing
  failure retains the scan and reports FAILED so the owner can retry.
- Approved content uses existing company semantic indexing; search merges private
  lexical matches with the existing hybrid/vector search when available. Vector
  availability is reported honestly; no second vector store or model is introduced.
- Chat: the Documents button sends `Explain document <canonical UUID>` through the
  existing conversation transport. The backend resolves the current company,
  rejects sensitive/incomplete/low-confidence sources, and sends bounded untrusted
  OCR text to the existing AIRouter summarization route. Answers cite document and
  pages. No duplicate image pipeline or tool authority is created.

## Security and retention

- Authenticated owner/company reads and CSRF/trusted-origin/network-checked
  mutations. Upload grants expire after ten minutes, are scope/page-bound, and only
  hashes persist. Grants alone do not authorize upload. Android receives no storage
  or OCR-provider credential.
- JPEG/PNG only: signature, MIME, full raster decode, 6 MiB/16 MP limits; no SVG,
  PDF, animation, remote URL or executable upload. Maximum five pages/document,
  ten processing attempts, four active jobs/API process, one local OCR worker.
- Opaque UUID assets in hashed tenant directories, owner-only permissions,
  exclusive writes and no-follow reads. Per-company storage guard: 256 MiB/2,000
  files; 100 document records. Concurrent API replicas can overshoot the filesystem
  quota by bounded in-flight writes; this is not a provider-enforced disk quota.
- No raw contents in audit or Gateway receipts. Automatic document request logging
  is disabled; bounded error logs omit content and query text. Sensitive OCR is not
  sent to explanation/embedding models or automatically stored as semantic memory.
  Detection is conservative heuristics, **not a guarantee of complete PII detection**.
  Default SUGGEST and owner review remain necessary.
- Delete means **archive**, disclosed in the confirmation dialog, because AGENTS.md
  prohibits permanent deletion. Archived scans/assets become inaccessible through
  ordinary document routes. Derived memories are excluded from active retrieval,
  active graph retrieval filtered, recent linked labels redacted, and semantic vectors cleared/excluded. Existing historical
  audit/timeline retention remains; this is not a permanent-erasure feature.
- Graph label cleanup is bounded to 5,000 recent nodes; older linked nodes remain
  suppressed by the canonical excluded-memory filter, with historical records retained.
- Source data survives processing failures. An interrupted job is manually
  retryable after its five-minute lease expires; no job is marked complete before
  PostgreSQL persistence. Completed replay is inert; archive fences late results.

## LIVE VERIFIED

**No owner phone scan or deployed provider acceptance has been performed.**
The real local OCR engine was exercised against generated printed text; this is
runtime evidence on a synthetic image, not live camera/handwriting acceptance.
Database pipeline tests use labelled fixture OCR through a real Gateway and actual
isolated PostgreSQL schemas. Fixture text is never described as live OCR evidence.

## CONDITIONALLY VERIFIED — validation

| Check | Result |
| --- | --- |
| API + provider + scoped PostgreSQL document tests | PASS — 43 tests in 3 files; actual PostgreSQL document and memory stores, fixture OCR in pipeline tests |
| Memory partial-write rollback/retry check | PASS — 10 document tests rerun; failed semantic indexing rolls back canonical memory writes |
| Real local OCR/cleanup contract tests | PASS — 8 tests, including generated printed text and bounded deskew |
| Android unit tests | PASS — 27 tests, 0 failures/errors/skips |
| Android `assembleDebug` | PASS — debug APK produced |
| Android `assembleDebugAndroidTest` | PASS — instrumented test APK compiles; 5 navigation scenarios, not executed |
| `pnpm typecheck` | PASS — all workspace projects |
| `pnpm lint` | PASS — 0 errors; existing EngineeringCredentialSetup fast-refresh warning |
| `pnpm build` | PASS — API, web and Mac builds; existing bundle-size warning. Final API typecheck/build also passed after the privacy cleanup |
| `pnpm audit --prod` | PASS — no known vulnerabilities |
| Serial full suite with DB explicitly disabled | PASS — 225 files, 1,397 tests; 34 files/85 tests skipped |
| `pnpm test --no-file-parallelism` with test DB enabled | PASS — 255 files / 1,478 tests passed; 4 files / 4 live-provider tests skipped; 554.23 seconds |
| `git diff --check` | PASS |

The first database-enabled full-suite attempt hit a pre-existing setup timeout;
a subsequent focused attempt hit a TLS connection failure before schema creation.
Those interrupted/failed attempts are not acceptance evidence; the final serial database-enabled suite completed cleanly. Successful focused retries above
used actual isolated PostgreSQL schemas and exercised migration 0117. No production
schema or records were mutated. No owner secrets are included in this report.
The four skipped tests are opt-in Gmail, Stripe, live analytics and live remote-tool
acceptance; none is claimed as verified. After the final graph-exclusion ordering
fix, the 10 focused PostgreSQL document tests passed again and API typecheck/build
passed. Android instrumentation compilation succeeded after updating the stale
navigation fixture; no instrumentation test was executed without a device.

## BLOCKED / NOT RUN

- No connected Android device/emulator (`adb devices -l` returned no devices).
  Instrumented navigation (test APK compiled), camera/photo-picker permissions, restart/offline flows,
  system sharing and scenarios A–E must be exercised on a real phone.
- Production migration/deployment and provider activation have not been performed.
  Use the existing reviewed migration-lineage/deploy procedure; do not bypass its
  safeguards. Production asset storage needs a persistent private volume at the
  API working-directory `.local/document-assets` path (or a reviewed adapter), disk
  encryption/access policy and backup/restore verification. Ephemeral container
  storage is not sufficient evidence of durable assets.
- English printed text is the installed OCR capability. Handwriting, mathematical
  notation, table structure, other languages, severe perspective/glare and complex
  whiteboards are best-effort/unsupported quality cases; retain originals and show
  uncertainty. No cloud/multimodal OCR fallback is enabled without separate review.
- No manual four-corner perspective editor or PDF/image-bundle export in this
  implementation. Export currently shares text/metadata JSON and authenticated
  asset references, not publicly readable asset links.
- Vector results require the existing authorized embedding provider/policy; lexical
  document search works independently. Live embedding/model billing and difficult
  photo accuracy remain unmeasured. OCR paid API cost is zero for the local engine;
  hosting/storage cost is UNKNOWN, not zero.
- Provider manifests are registered for up to 100 active companies at API startup;
  a newly created company may need an API configuration refresh before review.
- Whole-page retry is idempotent; byte-range/chunk resumability is not implemented.
  The pending original is app-private; it is not a durable cross-device upload queue.

## Owner/deployment acceptance sequence

1. Review and apply migration 0117 through the existing production migration
   process after resolving any earlier pending lineage/migrations. Verify backup.
2. Configure/verify persistent private asset storage and deploy the reviewed API.
   Verify Linux Sharp/Tesseract dependency availability and no external OCR fetch.
3. Install the new Android APK using the existing Android release procedure.
   Select the intended company; open Athena → Documents → Review local scanning
   provider and explicitly review/enable the three finite local capabilities.
4. Run A study page, B handwritten idea, C three-page paper, D synthetic secret-like
   test document, E Explain this. Verify each source/cleaned/OCR record, page order,
   scoped search, memory suggestion/approval/exclusion and canonical chat reference.
5. Repeat with loss of connectivity/app restart, duplicate submission, expired
   grant, provider unavailable, archival while processing and a different company.
   Confirm no content appears in traces/logs and no cross-company asset access.
6. Record actual accuracy/latency/model cost/storage behavior. Do not replace these
   live results with the generated OCR or fixture pipeline tests.

**ATHENA MOBILE DOCUMENT SCANNING CONDITIONALLY COMPLETE — FIX REMAINING LIVE BLOCKERS**
