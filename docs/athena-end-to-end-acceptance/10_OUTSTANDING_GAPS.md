# Outstanding gaps and release gates

## Must resolve before claiming end-to-end acceptance

1. **Actual signed engineering ingress.** General Android objectives are signed; the engineering creation UI currently uses a separate ordinary CSRF-protected delivery request. Reuse existing signing/creation boundaries in E2E-1 and prove one durable, idempotent, non-executing draft from a real phone. Do not claim a bridge already exists.
2. **Real Android and Mac.** This environment is Linux, with no usable Android SDK/ADB environment and no macOS runtime. Android Gradle tasks fail at SDK discovery; root build fails at existing Swift native helpers. No software mock, fixture-signed key or Linux Git test fills this gap.
3. **Registered Mac validation environment and provider readiness.** No reviewed image/profile operation or independent model review was exercised on a trusted Mac. No account was connected or credential inspected. Missing provider/tool/device state must remain a blocker.
4. **Joined cancellation, revocation and uncertain outcomes.** Unit, transport and selected PostgreSQL tests support boundaries. The entire phone/API/worker/Mac chain has not been cut at every effect boundary; no instantaneous global stop or automatic rollback is claimed. Prove actual cancellation acknowledgment and absence of subsequent effect.
5. **Durable create/retry and device-result lineage.** Delivery idempotency exists; the check/create and objective/delivery persistence boundary needs joined crash/concurrent acceptance. Preserve repository and task lease generations, actual receipt IDs and candidate head through restart.
6. **Remaining dependency gate.** Critical inherited test/launcher paths are remediated in this candidate, but 76 audit entries remain, including 37 high. Assess actual paths and compatible parent updates, especially Electron runtime/packaging, before live execution release; no advisory suppression.
7. **Whole regression/platform gate.** Six independently reproducible existing failures remain: four developer-local corpus fixtures, one Mac discovery fixture on Linux, one Python-version-dependent image-builder test. They are not marked passing. Native macOS and Android tasks need supported environments.
8. **Audit provenance.** Two historical source references are absent from merged main and broader historical source hashes are flagged for review. Preserve original local work and original MCP-1B candidate; do not silently include unmerged local features as current GitHub implementation.

## Evidence that is available

The existing manager, Agent OS gateway, workforce assignment/ranking, finite signed execution transport, Mac runtime, registered validation, independent integration review, guarded merge, Android controls and notifications have source and tests. This run adds a separate critical-tooling prerequisite and current local/durable regression evidence. Source presence, a test suite name containing “e2e,” and a status “DONE” do not establish the complete product workflow.

## Next exact slice

**E2E-1: signed, company-bound, existing-repository engineering draft with durable duplicate semantics and no dispatch.** Deliver shared finite schema, reuse of existing signed middleware and delivery/manager creation, Android signing/explicit draft state, exact idempotency binding, denied-state tests, disposable PostgreSQL crash/concurrency tests and one real Android request. No new-project initialization, worker launch, merge, push or deployment. Evaluate origin/CSRF/network composition explicitly; signature verification does not justify weakening existing policy.
