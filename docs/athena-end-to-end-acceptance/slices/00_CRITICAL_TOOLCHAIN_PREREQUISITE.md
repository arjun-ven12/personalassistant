# E2E-0: critical tooling prerequisite

2026-10-27 · Separate bounded prerequisite · No runtime authority changes.

## Why selected before product execution

MCP-1B had actual local/disposable durability evidence but retained critical findings in tools used to test or develop the engineering platform. This is the first implementation slice under the program's safety-prerequisite rule. Mapping proceeds in parallel; real-device execution acceptance does not begin until independently reviewable prerequisite and remaining gates are addressed.

## Exact delta relative to inherited MCP-1B

| File                                                 | Change and reason                                                                                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                       | Pin Vitest **4.1.12** through the parent package, removing the vulnerable tinypool path rather than forcing its major version beneath Vitest 3                                              |
| `pnpm-workspace.yaml`                                | Scope existing concurrently dependency range `shell-quote@^1.8.1` to patched **1.11.0**; no advisory suppressions                                                                           |
| `pnpm-lock.yaml`                                     | Resolve the reviewed parent migration and compatible dependency closure; retain inherited MCP-1B Zod/Fastify/fast-uri fixes                                                                 |
| `apps/api/src/durable-execution/service.test.ts`     | Give an existing mock the precise `CrossCompanyActivityExecutor["execute"]` signature for Vitest 4 typing                                                                                   |
| `apps/api/src/engineering-delivery/service.test.ts`  | Clear setup call history before the two recovery observations. Vitest 4 reuses existing mocks when spied upon; the assertions still require zero completed-task reexecution during recovery |
| `apps/mac-agent/electron/toolchain-security.test.ts` | Four pure-data regressions exercise shell-quote resolved from the actual launcher dependency chain; no shell/process invocation                                                             |

`00_CRITICAL_TOOLCHAIN.patch` contains only this delta relative to the inherited MCP-1B candidate, not all inherited changes relative to GitHub. The inherited candidate remains untouched in its original worktree. `evidence/source-manifest.json` distinguishes these source boundaries.

## Test-first evidence and compatibility

The inherited quoting library rejects **zero of four** advisory newline/CR/U+2028/U+2029 cases; the new regressions require rejection and pass on 1.11.0. The quoted strings are never executed. Typecheck initially exposed one mock-signature issue. The initial full runner migration exposed five recovery-test failures caused by retained setup call history; the two explicit mock clears resolve those without changing runtime code or weakening assertions. Final focused and full results are recorded in the acceptance report.

Current audit: **82 → 76 entries; critical 3 → 0**, with 37 high, 29 moderate and 10 low entries still present. Tinypool is absent from the candidate lockfile; no exploit was run and no universal non-exploitability claim is made. Reaudit at review time because the feed changes.

Primary references: [Vitest 4 migration](https://v4.vitest.dev/guide/migration.html), [tinypool worker-options advisory](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3), [tinypool run-options advisory](https://github.com/advisories/GHSA-85c8-ppgw-ccpr), [shell-quote maintainer advisory](https://github.com/ljharb/shell-quote/security/advisories/GHSA-pqg4-j6r4-53mv). Vitest 4 supports the repository's Node 22 toolchain; changing the test runner can change mock semantics, which is why assertion preservation and full regression are explicit gates.

## Acceptance, resource and rollback requirements

Run frozen dependency installation with scripts disabled, pure-data regression, typecheck/lint, focused recovery tests, whole suite, disposable PostgreSQL regression, API/security/config checks, root build and Android build attempt. Use only the newly owned synthetic PostgreSQL fixture with TCP disabled, never production. No GPU, paid compute, provider account or camera/Accessibility/device permission is needed.

No database migration is required. Rollback reverts this prerequisite's manifest/lock/test delta only and preserves MCP-1B and original local work. Rolling back restores the known critical dependency findings; therefore keep broader execution blocked pending a reviewed alternative. Do not selectively leave assertions relaxed, suppress the audit or force an incompatible tinypool override.

## Residual risk

The whole audit remains failing, especially relevant to Mac client/runtime and packaging review. Existing corpus/platform/Python fixture failures and missing native/Android build environments remain. This prerequisite has passing scoped evidence but does not make the application safe to deploy or certify real Android/Mac behavior.
