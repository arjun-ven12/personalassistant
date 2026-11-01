# Athena Android document scanning and searchable PDF

Updated 2026-11-01. Status: **BACKEND DEPLOYED — real-phone owner acceptance outstanding.**

## IMPLEMENTED

- Existing external-camera capture and JPEG/PNG import remain in use, with up to
  five ordered pages, 6 MiB/16 MP source limits, private originals, explicit upload,
  idempotency keys, retry, processing leases and owner/company isolation.
- Android page review adds reorder, quarter-turn rotation, removal, replacement,
  rescan and adjustable rectangular crop with preview. Rotation/crop are retained
  as bounded metadata; full-page restoration preserves the source. Editing applies
  to drafts before upload. Originals are never overwritten by cleanup.
- Existing server cleanup retains orientation correction, conservative page crop,
  slight text deskew, contrast/sharpening and original/cleaned thumbnails. Recorded
  manual crop/rotation are applied before OCR. The new offline path applies
  orientation, bounded resolution, manual crop/rotation and modest contrast; it
  does not claim offline perspective correction or automatic deskew.
- Existing bundled-English Tesseract OCR on the API host now retains normalized
  word boxes against the exact cleaned raster. No hidden OCR rotation is applied.
  The shared Zod schemas bound layout, page edits and PDF asset references.
- New bundled Latin ML Kit OCR runs on Android by explicit owner action, without
  uploading scans. Local drafts retain OCR, word geometry, cleaned images and PDF
  through restart. One company-scoped offline draft is supported at a time.
- Both PDF implementations embed the cleaned images in page order and add an
  invisible, selectable Unicode text layer positioned from OCR word bounds.
  Noto Sans is embedded with ToUnicode mapping. Every page must have usable text
  and layout. Missing/invalid geometry, unsupported glyphs or generation failure
  cannot be labelled as a searchable-PDF success. Originals/scans remain available.
- PDF metadata contains title, creation date, page count, OCR language, optional
  tags and document/source ID. It contains no owner/company identity or private
  reasoning. The offline source ID is the draft/idempotency key; synced PDFs use
  the canonical document ID.
- PostgreSQL remains the canonical vault. Existing JSON records store page edits,
  OCR text/layout, private original/cleaned/thumbnail references, PDF reference,
  title/tags/summary and generation error. No second database, vector store,
  upload-to-arbitrary-URL path or SQL migration was added.
- Processing writes PDFs to existing private assets, subject to 32 MiB PDF and
  existing 256 MiB company quotas. Metadata edits regenerate the stored PDF or
  expose a generation error. Existing scans without layout need reprocessing.
- Scoped lexical search covers OCR body text, title/document name, tags and
  summary, excluding technical OCR/layout metadata. Results open the canonical
  document; in-document search filters to matching pages and highlights matches.
  Existing governed memory/semantic search remains unchanged.
- Android details show page thumbnails, original/cleaned views, selectable raw
  text, within-document search and Open PDF / Share PDF / Export PDF actions.
  PDF sharing uses read-only FileProvider content URIs and MIME application/pdf.
  Save/copy uses Android's system document picker. Temporary PDF exports have a
  96 MiB cache quota and expire lazily after 24 hours; completed picker copies
  remove their temporary source.

## Security and privacy

No new model prompts, cloud OCR, arbitrary uploads, execution authority or native
application-control path is introduced. Offline processing stays on-device; upload
is a separate labelled owner action. Online processing still uses the existing
reviewed document Gateway capabilities and trusted mutation guards. Documents,
assets, queries and exports remain owner/company-scoped; archived records cannot
be exported. The existing conservative sensitive-export policy remains on server
PDF downloads. Content is omitted from audit events and Gateway receipts.
Android capture/import results are checked against the company that opened the
picker. Existing approval, emergency-stop and memory safeguards remain unchanged.
Source scanning is intentional owner capture, not background camera streaming.

## Validation

Final command results are recorded below after completion. Synthetic images and
fixture OCR are identified explicitly; they are not phone acceptance evidence.

- Backend PDF and real local OCR/cleanup tests: **11 passed**. A separate PDF.js
  engine extracts Unicode/basic punctuation, verifies both pages and reading
  order, finds search terms, checks metadata/image operators, and raster-compares
  the PDF to the embedded source images. Missing layout and invalid bounds deny.
- PostgreSQL document pipeline/search/export tests: **11 passed**, including
  canonical PDF persistence, OCR/title/tag search, wrong-company denial, sensitive
  export denial and archive fencing. Pipeline OCR is a labelled fixture. This
  suite uses actual isolated PostgreSQL schemas and document migrations through
  0118. Reader migration 0119 creates a fixed global namespace and is deliberately
  outside this schema-isolated document fixture; production migrations are not
  changed. An earlier unscoped repeat failed on that existing namespace collision.
- Android unit tests: **34 passed**, including real PDFBox generation/extraction,
  Unicode/multipage order, invisible text, metadata, missing-layout denial,
  crop/rotation, draft reorder/replace/remove/restart/sealing, FileProvider read
  permissions and export-cache expiration. Robolectric uses synthetic images;
  native ML Kit accuracy is not established by these tests.
- Repository typecheck: **PASS** (all five packages, serial); final API typecheck
  also passed. An earlier low-heap attempt exhausted its 1.5 GiB limit; the
  completed run used 3 GiB.
- Repository build: **PASS**, including copied API font assets. Existing Vite
  runtime-config/bundle-size warnings remain. Generated tracked Mac artifacts
  were restored to their pre-build state and excluded from this release.
- Repository lint: changed API/shared areas pass; full command reaches the web
  app and **FAILS on three pre-existing no-empty-object-type errors** in the
  unrelated untracked apps/web/src/three-jsx.d.ts. The existing fast-refresh
  warning remains. That file is untouched and excluded from the source commit.
- Android lint and assembleDebug: **PASS**; 0 lint errors (63 warnings). APK signature verification passes; package com.alexa.commandcenter.debug, version 0.1.1-debug (code 2), minimum Android 12.
- Whole-repository test suite was not rerun; focused affected-area tests above
  were selected for this change. Existing unrelated workspace edits are excluded
  from the release source commit.

## Hosted deployment — 2026-11-01

Deployment `3c9bbd90-7591-4666-bafa-ed96eb9a02ec` reports SUCCESS on the existing
API service. Source `21ed805f65c0c2e7fd2c517f097ae1e6e9e70a91` was uploaded from
an isolated git archive. Unrelated marketing/web edits were checked against the
previous production revision and excluded; the frontend was not deployed.

The existing migration pre-deploy command and `/app/api/.local` volume mount are
preserved. Production reports 121 applied ledger entries, no pending migrations,
no integrity issues. No new SQL migration is introduced. Production configuration
validation passed. Startup now prepares only the fixed private document asset
directory through the existing container entrypoint pattern, then verifies its
owner/mode, write/read/fsync and probe cleanup as the unprivileged API account.
The new deployment emitted the successful storage-verification message.

Hosted health/readiness return 200; unauthenticated document-list/PDF requests
return 401. Authenticated owner upload, search, PDF download and persistence across
a later restart have NOT been exercised on this production deployment. Provider
approval was not changed. Existing SSH keys and secrets were not changed.
New PDF JSON fields require a schema-compatible rollback; do not blindly revert
to an older strict document schema after new records have been written.

Additional deployment-fix validation: 12 document/PDF/OCR/storage tests and 11
browser-security/Reader configuration tests passed; API typecheck, targeted lint,
build and shell syntax validation passed. Dependency audit reports the existing
10 non-PDF dependency advisories; none is in the added PDF dependencies. These
unrelated dependencies were not changed in this bounded deployment.

## LIVE VERIFIED

No real-phone acceptance is claimed. No Android device/emulator was connected.
Actual API-host Tesseract recognized a generated printed-text image. Backend and
Android PDF engines generated/extracted synthetic multipage PDFs in automated
tests. These are local runtime results, not camera or external-viewer acceptance.

## NOT VERIFIED

Owner-scoped provider activation, production restart persistence of a new scan,
Android camera/picker permission behavior, native ML Kit recognition quality,
connectivity loss during upload, and external-viewer search/select/copy on a phone
remain unverified. The APK is a debug-signed Android 12+ preview, not a
production-signing release. The existing HTTPS API/origin configuration is reused.
The backend is deployed on the existing Railway API service and is compatible
with the published APK. The owner must review/enable the finite local scanning
provider for the intended company if not already enabled. Offline PDF
creation/export remains available separately from explicit upload.

## LIMITATIONS

English/Latin printed text is the supported focus. Handwriting, other scripts,
complex mathematical notation, tables, glare, perspective and unusual page layouts
have no accuracy guarantee. Axis-aligned word boxes approximate text selection;
rotated/curved text and complex reading order need manual source review. Crop is
rectangular, not a four-corner perspective editor. Blank/unsupported pages must be
removed, replaced or rescanned before a searchable PDF can be produced. Multiple
independent offline documents, background sync and byte-range upload resumption
are not implemented. Archive remains the server deletion operation; permanent
source deletion is prohibited. Private backup/disk encryption and durable server
storage remain deployment responsibilities.

Real-phone acceptance: photograph a printed A4 page, clean/OCR, add and reorder a
second page, save/upload, search a phrase, open the exact result, export/share,
open in another PDF viewer, and actually search/select/copy the text there. Repeat
with offline/restart, a sensitive synthetic fixture and a second company. J/K must
work before changing this report to verified complete.

ATHENA MOBILE DOCUMENT SCANNING CONDITIONALLY COMPLETE — FIX REMAINING LIVE/PDF BLOCKERS
