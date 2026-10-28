# One-backend integration acceptance · 2026-10-28

**Decision: BLOCKED for production deployment and new APK release.** Source integration is locally testable; hosted acceptance is outstanding. The integration branch was pushed to the public Athena repository after a changed-file scan found no confidential PDFs, credentials, private keys, tokens, or secret patterns. Nothing was deployed, migrated in Neon, imported, invited, or released.

## Baselines and preservation

- Athena isolated worktree: `/tmp/athena-secure-reader-one-backend`, branch `integration/secure-reader-one-backend`, based on `90c77ecceb35682e0b64bcc512b8d83ae23a78d1` (`origin/main` and latest GitHub production deployment ref at investigation time). Original `/workspace/personalassistant` stayed at `7ee28be9de093a0446dfbe95b7145278b9087ea9` with 63 pre-existing changed paths and was not overwritten.
- Reader workspace: `/workspace/athena-secure-reader`, baseline `aa42c01cda2ac1d7bd3c94c271405fc87e8f51ff`, originally clean. Android and release workflow changes are committed as `bfd3797d689c8099a49702c164d243f1d3fdcf64` on the private `integration/athena-one-backend-v0.2` branch.
- Athena is public by explicit owner authorization; Reader remains private. The Athena integration is published only on `integration/secure-reader-one-backend`, not merged into `main`.

## Verified locally

| Check                                                       | Result                     | Scope                                                                                                                                                                                                                |
| ----------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Athena API typecheck and build                              | Passed                     | New route module, bootstrap and admin UI build; Node 22.16, pnpm 11.17                                                                                                                                               |
| Targeted ESLint                                             | Passed                     | New Reader source and changed API entry points                                                                                                                                                                       |
| Integrated disposable PostgreSQL 18 tests                   | 8 passed                   | Existing Athena health, Reader-only auth, default-deny grants, ADMIN upload, Founder denial, one-use/concurrent tickets, revocation, restart, emergency-stop denial and persisted audit; rendering adapter is mocked |
| Fresh additive migration                                    | Passed                     | Nine Reader tables, no cross-schema foreign keys, unrelated fixture row unchanged                                                                                                                                    |
| Upstream Reader backend tests                               | 27 passed                  | Real synthetic PDF rendering and upstream Reader behaviors in disposable PostgreSQL 18                                                                                                                               |
| Upstream Reader typecheck, lint, build and dependency audit | Passed                     | Dependency audit reported zero known advisories at test time                                                                                                                                                         |
| Athena production dependency audit                          | Failed                     | 10 pre-existing advisories: 1 high, 4 moderate, 5 low; affected packages include Zod, Fastify and fast-uri. Patches require a separately reviewed dependency update and regression run.                              |
| Android JVM tests and debug APK                             | 10 passed; debug APK built | SDK 36, JDK 21, package `org.athena.reader`, versionCode 2, version `0.2.0-preview`, min SDK 26; test APK SHA-256 `f8b4e268628bd061eece2364fb62c85ba9aa346164c0d1dcbdb7024422dd8605`                                 |
| Reader source security check                                | Passed                     | Static source/artifact invariants, not a runtime penetration test                                                                                                                                                    |

The first Android build attempt failed because `/workspace` had no free space. A copy on `/tmp` built successfully; the original repository was preserved. The original Reader repository's `pnpm security:check` wrapper could not run because the workspace filesystem was full, but its underlying source-check script passed directly. The Reader repository's full tests/build ran from a temporary copy with no repository metadata; the security script there could not run `git ls-files`, so its failure is not a source-security result.

Athena's full test suite: 1502 passed, 92 skipped, 6 failed. The failures matched existing environment-sensitive areas: one macOS application discovery expectation on Linux; one Python 3.10 image-builder test requiring `hashlib.file_digest` (Python 3.11+); four corpus tests referring to a missing founder-local macOS file. They were not suppressed. The first full ESLint run exhausted Node's default heap; an 8 GiB rerun is recorded separately. No new Reader-targeted test failed.

Full Athena ESLint passed with an 8 GiB Node heap and one existing React Fast Refresh warning. The full Prettier check failed with formatting drift in 574 existing files; the new Reader files and changed Athena entry points were formatted. The production-package rehearsal (`pnpm deploy --legacy --prod`) retained the built Reader admin HTML/assets and PDF worker entry point.

Athena's `pnpm --filter @alexa-control/api security:check` wrapper could not complete because pnpm attempted a production reinstall without a TTY. Its source-invariant script passed directly. The production dependency audit failed with the existing 10 advisories; nothing was suppressed or marked accepted. These are independent release gates.

## Hosted and release blockers

1. Current public Athena API responds 200 at `https://personalassistant-production-269b.up.railway.app/health` and 404 at `https://personalassistant-production-269b.up.railway.app/api/secure-reader/health` and `/api/secure-reader/admin.html`. Reader is **not deployed**.
2. `railway status --json` returns `Unauthorized. Please login with railway login`. Production variables, migrations, volume, storage and deploy rights could not be inspected. Do not request a second Railway or Neon resource; reauthenticate the existing Railway project when ready.
3. The Reader's production PDF-processing gate remains active. Existing Railway volume persistence and privacy could not be confirmed; no independent no-network PDF sandbox was accepted. The current child process is not a sufficient production parser boundary. A separate public Reader server is not proposed.
4. The additive migration has not been tested against a disposable clone of the live Neon schema or applied to Neon. Athena's new image rejects pending migrations, and the old image rejects the newer ledger version after application. A migration-compatible rollback image must be prepared and tested. The main checkout's uncommitted migration numbering must be reconciled.
5. No verified TLS mail delivery, Reader administrator bootstrap, real account, document import, or hosted session/revocation test occurred. The seven confidential PDFs were unavailable and remain unimported.
6. `v0.2.0-preview` release workflow is prepared but gated on a live ready Reader health endpoint and unauthorized document-list denial. No signed v0.2 APK or GitHub prerelease exists yet. The existing protected preview signing identity remains in GitHub Actions; no key was printed or copied.

## Next gate

Restore authorized access to the **existing** Railway service, inspect its storage/volume and current Neon migration state, and select a persistent private PDF store plus an independently verified renderer sandbox that can run without a second public API. Test those with synthetic PDFs in a disposable environment. Only after that can the migration, module activation, admin bootstrap, signed APK workflow and deployed health/page checks be reviewed for execution.
