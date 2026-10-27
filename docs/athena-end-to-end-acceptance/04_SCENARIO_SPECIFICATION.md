# Scenario: a small change in an existing disposable repository

## Request and scope

Use a newly created, explicitly disposable, registered TypeScript repository in a dedicated test company. It must contain a tiny library, an existing test harness and reviewed lint/typecheck/test/build profiles. It is not Athena's own repository, a customer repository, a production workspace or a remote deployment target.

Owner request: “Add `normalizeLabel(text: string): string` in the registered library. Trim leading/trailing whitespace, collapse internal whitespace runs to one ASCII space, return an empty string for whitespace-only input, and preserve Unicode letters. Add focused tests. Change only `src/normalizeLabel.ts`, its public export if required, and `test/normalizeLabel.test.ts`.”

Criteria: `"  Athena   engineering  "` becomes `"Athena engineering"`; whitespace-only input becomes `""`; labels such as `"  Αθήνα   東京 "` retain their letters with normalized spacing. Existing tests stay green. No dependency, security policy, generated lockfile, workflow, credential, deployment or unrelated source change is needed. Source paths above are relative criteria within a registered repository, never a request to execute or access an arbitrary host path.

## Preconditions and authority

- Identify exact API/mobile/Mac revisions and signed build identities, Node/runtime/image versions, database migration state and candidate base commit. Use a dedicated test owner/company with no customer data.
- Pair Android and Mac through the existing reviewed trust flow; private keys stay on their devices. Establish known private-network verification and trusted origin/session behavior. Do not use a test/unknown verifier as real-device evidence or expose the API through Funnel.
- Register the repository, local locator and narrowly reviewed command/capability profiles by ID. Give only the required company assignments access; keep the default branch protected and prevent push/deploy capabilities. Do not let the brief choose a root, executable, command, environment or profile contents.
- Provision an existing reviewed, bounded validation environment. Use approved profile IDs for lint/typecheck/test/build, not caller shell strings. Verify available authorized implementation and independent reviewer assignments. Confirm model/provider readiness without exposing credentials or granting new permissions to agents.
- Resolve the signed engineering-ingress contract and its durable duplicate semantics before calling this a signed phone-directed engineering acceptance. The currently signed general-objective path is not a substitute.

## Ordered run and evidence

| Step | Owner/system action                                                                             | Required receipt                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Owner selects company and registered repository, enters brief and reviews criteria on Android   | Device/build IDs, intent digest, selected company/repository, operation/idempotency ID; no raw signature/token in public report |
| 2    | Android submits authenticated signed bounded engineering intent                                 | Backend verifies session/device/signature/time/nonce/company; denied-state tests produce no objective or execution              |
| 3    | Existing delivery/manager persist objective and bounded plan                                    | Delivery/objective/project-session IDs, task DAG, dependencies, scope, version, budget and audit                                |
| 4    | Owner resolves clarification/checkpoint if required                                             | Exact owner decision and current authority; plan may remain blocked without fallback                                            |
| 5    | Existing assignment ranking and Agent OS delegate                                               | Active assignment/manifests, distinct task/agent/session IDs, model attempts, scoped context references                         |
| 6    | Ready tasks obtain leases and isolated Mac worktrees                                            | Repository/base/worktree IDs, lease owner/generation/expiry and signed finite operation IDs                                     |
| 7    | Implementation proposes bounded changes and runs registered checks through governed Mac channel | Before/after head and file hashes, actual signed operation outcomes, profile/command IDs, bounded validation reports            |
| 8    | Integration validates combined work and invokes separate reviewer                               | Exact candidate head, combined validation ID, reviewer assignment and findings/verdict; no author self-approval                 |
| 9    | Android displays candidate, blockers, receipts and owner controls                               | Fresh company-scoped canonical state; request-revision/reject/cancel remain usable                                              |
| 10   | Owner explicitly requests guarded local merge if desired                                        | Exact candidate/head approval, real recent-auth grant where required, current scope/stop check and verified Mac result          |
| 11   | Canonical terminal outcome returns to Android                                                   | Recorded final evidence/status, correct notification/deep link or foreground result; no implied push/deployment                 |

“DONE” as delivery readiness and “local merge completed” are distinct evidence statements. A rejected or canceled run is a valid controlled terminal outcome, not a successful feature delivery. No autonomous Git push, PR creation, production deployment or broad sandbox enablement is included.

## Fault variants and stop observation

Repeat against disposable worktrees for each matrix row. Record request time, persisted cancellation/revocation time, dispatch authorization time, Mac acknowledgment and verified last effect. Observe actual process/queue/worktree state after acknowledgment; a UI state alone is insufficient. Already completed authorized changes remain retained with evidence; uncertain in-flight outcomes remain blocked until reconciled. Do not equate network loss with immediate remote termination or claim rollback of an effect that already committed.

The feature is accepted only after the exact real Android → persisted objective → authorized delegation → trusted Mac effects/validation → independent review → terminal Android path passes, including cancellation/revocation at the relevant boundaries. The current run does not meet that gate.
