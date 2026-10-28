# Existing Railway service deployment runbook (not executed)

The only public origin is `https://personalassistant-production-269b.up.railway.app`. Secure Reader's intended health and administrator URLs are respectively:

- `https://personalassistant-production-269b.up.railway.app/api/secure-reader/health`
- `https://personalassistant-production-269b.up.railway.app/api/secure-reader/admin.html`

Both currently return 404 because the module is not deployed. There is no new Railway service, public domain, or Neon database in this design. The existing `DATABASE_URL` is consumed by Athena's `PostgresDatabase` and shared pool. Never paste it into a second variable or report.

## Required existing-service preflight

1. Reauthenticate Railway access to the existing Athena project; `railway status --json` currently returns unauthorized. Inspect the linked project/service and its deployment revision without printing environment values or credentials.
2. Confirm whether a Railway volume is mounted for the API and whether it is non-public, persistent across redeploys, backed up, and writable by the non-root runtime. The Dockerfile comment alone is not evidence. The current production Reader config requires private S3-compatible object storage; using a confirmed Railway volume would require a separate reviewed storage-policy change and durability tests. Never place originals on ephemeral deployment disk or in Neon as a shortcut.
3. Demonstrate a no-network, resource-limited PDF parser sandbox that runs behind the same public Athena API without exposing another public server. The copied child-process renderer is only a development fixture. Preserve the unconditional production gate until sandbox egress, UID, filesystem, CPU/memory/PID limits, worker cleanup and malicious-PDF tests pass.
4. Verify TLS SMTP delivery and exact same-origin admin URL; configure Reader-specific SMTP and object-store credentials in the existing Railway service's secret store, never in Git or APK. Do not send invitations during preflight.
5. Reconcile Athena's local uncommitted migrations with `origin/main`; create a disposable current-Neon schema fixture and run the complete migration chain. Review backup/restore, additive object diff, migration digest, and startup readiness before touching Neon. Prepare and test a migration-compatible rollback image: the old Athena image rejects a newer migration ledger entry even if the SQL is additive.
6. Review the 10 existing Athena production dependency advisories. Apply compatible patches in a separate bounded change and rerun security and full regression checks. The current host's full suite also has six known environment-sensitive failures, which must be accounted for explicitly.
7. Confirm Athena GitHub visibility. GitHub currently reports Athena public and Reader private; the requested private/private state is not met. Do not push integrated Reader source into public Athena until repository visibility and disclosure policy are resolved.

## Activation sequence after prerequisites pass

1. After the backup and migration-compatible rollback image are verified, apply `apps/api/migrations/0119_secure_reader_namespace.sql` through Athena's existing migration runner immediately before the application rollout. The new image refuses startup while this migration is pending. Never reset Neon.
2. Deploy the reviewed, disabled integration image to the **existing** Railway service only. It should preserve Athena `/health`, `/ready`, authentication and Agent OS routes, and return 503 from Reader health while disabled. Recheck migration status and existing Athena routes.
3. Set `SECURE_READER_ENABLED=true` only after the production gate has been replaced by an evidence-backed acceptance switch, with private persistent storage and isolated renderer configured. A launch failure must leave the prior Athena deployment recoverable.
4. With an operator session on the same service and existing `DATABASE_URL`, run the offline `secure-reader:bootstrap-admin` command with the intended administrator email. It sends a one-time code through TLS SMTP; no public bootstrap route exists. Do not run it until mail delivery and authorization are reviewed.
5. Check Reader `/health` returns `ready`; unauthenticated `/reader/documents` returns 401; Reader bearer cannot reach `/api/auth/session`; admin page loads; synthetic PDF upload, hash receipt, watermarked page, grant, expiry and revocation pass. Confirm no original PDF route or public object URL exists. Check combined rate-limit behavior behind Railway's proxy.
6. Only then trigger the protected `android-one-backend-preview.yml` workflow on Reader `main`. It builds signed `v0.2.0-preview`, verifies metadata and SHA-256, and publishes a prerelease after its live-health gate. No release was published in this run.
7. Import the seven real PDFs through the Chrome admin page one at a time. Compare independent SHA-256 hashes and the server receipts. Keep Founder Governance restricted; never grant it to a READER. Record only metadata and checksums, not PDF bytes or tokens, in acceptance evidence.

## Rollback

Disable `SECURE_READER_ENABLED`, stop any Reader upload/page work, restore the **migration-compatible** Athena rollback image, and verify Athena `/ready` and owner routes. The original image cannot be used after the new ledger entry is applied because its migration verifier rejects unknown future versions. Retain the additive `secure_reader` tables and immutable private objects for reviewed recovery; do not drop schemas or permanently delete originals as an improvised rollback. Revoke Reader sessions and grants if a disclosure concern arises. No live rollback was exercised here.
