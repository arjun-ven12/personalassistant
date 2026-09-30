# Foundation hardening evidence — 2026-09-27

Status: in progress. This is not a production-readiness certification or a 9/10 rating.

## Baseline

Starting HEAD: `db85cd7` (`objectives`). Existing changes from prior closure work were
already committed. Real Objective dispatch, Agent OS invocation, AIRouter research,
and automatic dependency advancement were already wired. The earlier claim that
Objectives only reserved agents is stale for this HEAD.

## Live acceptance

Objective: `4d16a63e-896d-4f53-9c39-e400b1d477fe`, **Foundation provenance acceptance**.
Submitted and activated through the authenticated owner UI. Research-only, no
contacting or sending messages. Budget: 40 credits.

- Activated 2026-09-27 14:29:49 Asia/Kolkata; completion timeline 14:30:57.
- Three tasks completed without manual stage advancement; metric 5/5.
- Define: `dynamic_frontend_engineering_lead_generation_specialist_0dbe8094`.
- Deliver: `native_market_researcher`.
- Verify: `native_vendor_analyst`.
- All three used `openai / gpt-5.6-luna` through AIRouter.
- Model request IDs: `3e24e8f2-d4aa-4899-967a-823c4c2d62cf`,
  `8c6cba27-eb9d-4ef3-9b75-6b6b0b67d204`,
  `ebe878c4-5d75-4148-817b-759e61a747a5`.
- Research task displayed two completed web searches and ten evidence references.
- Final source-linked records: OpenAI, Anthropic, Cohere, Mistral AI, Perplexity.
- All tasks displayed runtime-executed provenance. Final result survived refresh.
- Displayed cost: 15 **credits**, not verified dollar spend.

Qualification checks structured records against provider-returned HTTPS URLs. This
does not prove every factual claim on a source page. Reviewer explicitly stated
that it did not independently check source-page content. Do not describe this as
independent factual verification.

## Changes and checks

### Harder comparison run exposed false completion

`6db58831-92b9-42dd-807f-42c95322d132` (**Foundation coding assistant comparison**)
was activated through the owner UI with a 40-credit cap. It displayed COMPLETED,
five completed tasks, three completed web searches, and 29 credits. This is a
FAILED acceptance: the initial comparison of Copilot/Cursor/Claude Code generated
no counted subject records, and the hardcoded gap prompt substituted AI-company
outreach records (OpenAI/Google/Replit). Reviewers explicitly said context was
insufficient but their notes did not gate completion.

Fixes under validation: preserve original outcome/constraints/metrics in task
context, make gap repair subject-neutral, use the existing research record shape
for the requested subjects, preserve bounded full summaries across dependencies,
and require a structured passing reviewer verdict. Missing/failing verdicts retain
model usage and result evidence but block completion. A successful live retest is
still required. Do not count the displayed green status as acceptance success.

### Retest and current handoff

Retest objective: `4b41d3a5-c231-48b4-9017-20c904edacce`, **Foundation comparison
retest**, same research-only request and 40-credit cap. Requirements completed;
research failed local structured-output validation (`invalid_value at field.field`)
twice. The original passing requirements task is preserved. A read-only PostgreSQL
check confirmed its settled OpenAI request used 2,741 tokens and recorded
$0.005549 model cost. Failed research attempts had unknown tokens and zero recorded
cost; zero recorded cost is NOT proof that the provider charged nothing.

The new review field was locally validated but the request lacked an explicit
provider JSON Schema and the non-review output instructions were underspecified.
The follow-up fix supplies `z.toJSONSchema(RuntimeResultSchema)` through AIRouter,
includes that contract for provider-native research, explicitly requires null
verification on non-review tasks, and retains PASS/FAIL-only review validation.
No validation or policy bypass was added. Official Structured Outputs guidance
was consulted: https://developers.openai.com/api/docs/guides/structured-outputs

Deployments with scope/review fixes succeeded:
- API `a25ae74e-02fb-48a7-b97c-a35c4eac0a14`.
- Web `90328a18-ffed-4b00-89be-4133b8ff6a80`.

Final schema-instruction patch deployment `386de7c9-8b3a-4ca7-94fb-5ac032a7b2e6`
is SUCCESS. Retry ONLY the above existing retest; do not create another equivalent run.
At the current handoff, Safari automation reported the Mac locked. Owner was asked
to unlock it. Do not bypass the owner session or approve permissions.

After unlocking, the same objective was resumed through the owner UI at 15:50:52.
Requirements remained unchanged (same request ID). Research completed with three
provider web searches, nine evidence references, and three source-linked assistant
records: Codex, Claude Code, and GitHub Copilot Agents. Research request:
`f2f1f86f-b7ef-484a-9735-851d1d9adff1`. The metric reached 3/3, but the objective
correctly remained BLOCKED because the automatically dispatched review failed.
OpenAI rejected the provider schema nested under `leads`: Zod URL fields emit
`format: uri`, which is outside the supported Structured Outputs format subset.
The provider-facing schema now omits that hint only; local Zod URL validation
and the explicit PASS review gate remain enforced. Focused tests: 56 passed.
API typecheck/build passed; a test-only unbound-method lint error was corrected.
Deployed as API `44a311dd-45ed-469e-8a70-bd2c7cb59c6a` (SUCCESS).
Full lint passed. Production configuration validation passed; migrations current.
Owner UI retry at 15:59:08 reran only review and reached COMPLETE at 15:59:15.
Review request `117bb8b3-f6d2-41b5-a3e9-6fe1003d16d8` returned an explicit PASS:
all three assistants compared, strengths/weaknesses and task-fit recommendations
present, research-only constraints preserved. UI displays three completed tasks,
three execution-backed records, metric 3/3, and 15 credits. Read-only PostgreSQL
confirmed original task IDs and requests preserved, no replay of completed work.
Settled requests used 2,741 + 34,214 + 4,939 = 41,894 tokens, recorded model cost
$0.005549 + $0.048893 + $0.007972 = $0.062414. Four failed ledger entries have
unknown tokens; do not present this sum as a complete provider billing total.
Reloaded Safari and reopened the same result at 16:01:42: completion, all three
task request IDs, three records, sources, metric 3/3 and 15 credits were restored
from persisted state. This proves history reconstruction, not active-worker
restart recovery. No permissions or approval settings were changed.

Validation: 55 focused service tests pass, PostgreSQL workforce isolation and exact
replay test passes, API typecheck/build pass, web build passes, production config
validation passes, database migration status current. Earlier full build/lint passed.
A broad run overlapping edits had 6 failures / 1052 passes / 2 skips and is not a
valid final snapshot. A fresh broad run finished: 188 files passed / 2 skipped;
1,058 tests passed / 2 skipped (Gmail and Stripe opt-in live acceptance), 710.37
seconds. The final schema-instruction-only patch also passed a fresh 55-test focused
rerun. Final workspace-wide typecheck passed; touched-file lint and diff check passed.

Further audit: company semantic documents already have scoped pgvector search and
a production embedding-provider binding in app composition. Legacy retrieval
explicitly reports lexical mode. Do not duplicate the company semantic store;
downstream memory usefulness still needs live proof.

- Explicit runtime/manual provenance; historical records are not backfilled as executed.
- Retrieval provenance stored separately from model-authored URLs.
- Objective completion/dependency metrics require executed provenance.
- PostgreSQL workforce reads/writes/messages/reviews constrained to company scope.
- Dependency evidence reloaded through scoped storage; duplicate attachment bounded.
- Owner observations remain observations, not verified research KPI increments.
- Exact message/review retries are idempotent; conflicting content fails closed.
- Downstream callback failure cannot rewrite saved executed output into retryable work.
- Existing UI reconciliation enabled in background and on focus; update errors labelled stale.

The 1,058-pass full-suite result predates the final URI-format-only fix. The final
fix has a fresh 56-test focused pass, API typecheck/build, full lint and diff check.
Do not describe it as a new full-suite run.

## Remaining audit findings / acceptance work

### Durability closure in progress

Migration `0104_workforce_execution_leases` applied through the normal production
migration command. Existing tasks/history preserved. Workforce admission now uses
atomic company-scoped PostgreSQL claims, 60-second renewable ownership, opaque
fencing tokens, and fenced task writes. Cancellation revokes persisted ownership;
late model output cannot overwrite cancellation. Process-local controllers remain
only cancellation accelerators. The existing scheduler now invokes company-scoped
recovery independently of dashboard reads. Expired uncertain work becomes FAILED
with WORKER_CRASHED, without replaying unknown provider/tool effects.

Terminal task writes persist a lifecycle-pending marker. Reconstructed workers
can replay the existing idempotent objective callback and acknowledge the exact
saved result, preserving the result-to-dependency boundary. No new queue service.

PostgreSQL test proves concurrent claims, expiry, stale-token denial, cross-company
renewal denial, recovery ownership, stale release denial, and pending lifecycle
reconstruction. Focused suite: 63 passing tests before evidence-gap follow-up.
Deployed API `951ba85f-e08d-4ac4-924a-65df841e536e` successfully.

Live objective `6e686aa6-4306-4514-8102-8b2987d9f460` (Foundation lease recovery
acceptance) created through owner UI, research-only, target 5, cap 40 credits.
Persisted research lease observed on task `57121123-97c8-4867-9390-4b036df7751e`;
Railway restart requested while research was RUNNING. Completed requirements
`96097ae4-a3b8-46f7-ab50-91f6f3fbe11f` survived. Research and review completed
around restart, so this does NOT yet prove termination during an uncertain call.
Review task `91ff98b8-922a-4014-9e9b-21b43e341a05` correctly FAILED: only four
qualifying company records, not five. No fabricated completion.

This exposed an evidence-gap repair eligibility bug: the old repair path required
all tasks to have passed, even the review rejecting the gap. The patch permits
bounded gap research when the only failures are executed review rejections. A new
review explicitly references the failed reviews it replaces; historical failures
and costs remain intact, and the replacement review must pass. The original
objective/context, bounded rounds and total credit cap remain enforced.
58 service tests pass after this patch; API typecheck/build and touched lint pass.
Deployment `465e58fe-180f-4caa-844e-4f6a5789e472` succeeded. Retrying the
same objective exposed a second blocker: the gap-research result cited retrieved
sources inside each lead, while the gate had checked only a top-level evidence
array. The gate now accepts citations from either location, but only when the
HTTPS URL matches a URL actually returned by the governed research tool. API
deployment `2fee6519-38a2-4ed6-a513-01b4f2eebfad` succeeded. The same gap
research task completed with two web calls and eight evidence references; the
structured result added Cohere and retained the four prior qualifying companies.

Its replacement review correctly found five records but failed for a different
bug: a hardcoded instruction required a cross-company comparison and prioritized
recommendation that this owner never requested. New gap reviews now require only
the original owner criteria. An already-executed review with this exact legacy
over-scope can be superseded by one bounded, source-backed review without replaying
the research. Both historical failures remain in the audit trail. Deployment
`3debe173-841b-4f76-9ab9-3dcba9314f2c` succeeded. The scope-corrected review
then failed because its dependency context referenced the original four-record
research, not the completed five-record gap research. The task graph now selects
the latest completed research project by sequence when constructing a replacement
review. A persisted failed review whose dependency list omitted that latest
research can be superseded once, with the correct evidence and no repeated web
search. Focused Objective tests: 26 pass, including this legacy recovery case.
Deployment `d6edd14b-bbb2-4252-a4ab-849b18d99c1a` succeeded.

The SAME objective `6e686aa6-4306-4514-8102-8b2987d9f460` reached COMPLETE
in the owner UI on 2026-09-27. Its final review request
`052a09ab-cd3e-40e3-b235-2f8f028f1d9f` explicitly accepted five company
records with the originally requested fields, HTTPS sources, and research-only
constraints. The source-backed companies are OpenAI, Anthropic, Google DeepMind,
Mistral AI, and Cohere. Execution and outcome progress are 100%; the KPI is 5/5;
35/40 credits were used. The UI shows four effective completed tasks plus three
failed historical reviews, preserving the original four-record rejection, the
over-scoped review, and the stale-context review. The result and its source links
survived a full Safari reload. No new objective was created for this repair.
Read-only usage-ledger inspection found nine settled OpenAI `gpt-5.6-luna`
requests across the seven tasks, including repeated research attempts:
99,598 recorded tokens and $0.172561 summed settled model cost. This dollar sum
is distinct from the 35 objective credits displayed in the UI; unknown charges
outside settled ledger rows are not asserted to be zero.

Full lint, typecheck, touched-file lint, API build and diff check passed after the
latest correction. Full test suite returned
1,060 passing, two skipped, and two failures in 774.37 seconds: one was the
pre-fix lead-citation test, which passes in focused reruns; the other was a
temporary Neon DNS failure in skill-evolution PostgreSQL integration, which
passed in a standalone rerun. This broad run is not a clean final snapshot.

- General workforce execution now has persisted PostgreSQL lease claims, fencing,
  and scheduler recovery. Process-local controllers only accelerate cancellation.
  An interrupted in-flight production call and exact billing/side-effect
  idempotency across that boundary still require live verification.
- Engineering real existing-project follow-up/restart acceptance is unverified.
- A scoped Engineering implementation recovery scan is now wired into the existing
  durable scheduler. After a persisted worker lease expires, the delivery becomes
  BLOCKED with a WORKER_CRASHED reason, and owner Retry uses the original delivery
  with a fresh authenticated context. It does not replay an uncertain mutation
  unattended. This path has focused service/scheduler coverage but has not yet
  been proven by killing a live Engineering worker. Integration/preview phases
  still need separate startup reconciliation.
  Migration `0105_engineering_delivery_recovery_scan` applied in production;
  read-only verification found the partial index and no unintended status
  changes (three pre-existing BLOCKED, one CANCELLED, one DONE_WITH_WARNINGS).
  API deployment `71d1dbb1-cda6-4490-a1fb-38890b9c59be` succeeded. Focused
  Objective/Workforce/Engineering/scheduler tests: 89 pass. Full lint, typecheck,
  build, and diff check pass. A fresh broad test run is in progress.
  Web deployment `49cf7c8d-f86c-43e8-8b6e-02107873a6f5` succeeded with the
  shared WORKER_CRASHED blocker category. Production currently has no active
  Engineering delivery on which to perform a real crash/retry acceptance.
  Control Center refresh now uses the delivery's updated-at compare-and-swap so
  a stale read cannot overwrite a concurrent recovery block. Focused Engineering
  tests (24), API typecheck/build and touched lint pass after this last change;
  API deployment `c6c72a9c-651e-4198-a64f-089f611afa2b` succeeded.
  A fresh full suite completed with 1,064 passing tests, two intentionally
  skipped live-integration tests, and zero failures (1,082.61 seconds). The
  final Control Center compare-and-swap patch was followed by its focused
  Engineering tests, API typecheck/build, and touched lint checks.

Read-only inspection of “Portfolio Acceptance” found delivery
`ff9adf52-7ae4-433f-bf47-31527b2f12e3`, READY integration candidate
`38a47f13-916b-4184-ac83-1c085bed4b8f`, and no merge timestamp/commit. It is
not a safe live modification baseline until the owner reviews/applies the
candidate through the existing governed merge path. No new Engineering run was
started and no merge/approval was made by this task.
- Safari owner UI confirms the completed delivery shows 4/4 tasks, passing
  lint/typecheck/tests/build, independent review pass-with-warnings, and a
  healthy localhost:4173 preview. Its previous source-workspace mismatch is
  historical retry evidence, not a current blocker. The Control Center now
  suppresses that one resolved warning from the current changed-files panel
  while retaining the event history. Web deployment
  `e323614a-f015-4f99-92e7-5cda9376b6a8` succeeded; Safari reload
  confirmed the resolved warning is no longer shown as current.
  The Control Center also lacked any owner-facing path to its existing governed
  integration merge API. A minimal reviewed-candidate panel now exposes the
  candidate summary, risks/warnings, READY/MERGED state, and an Apply button.
  Its first use requests the exact recent-authenticated merge approval; it does
  not bypass approval or merge unattended. The idempotency key is retained per
  candidate so the owner can return from Approvals and apply the same request.
  Safari verified the READY candidate panel with its three changed files and
  independent-review risks. Clicking Apply created a PENDING
  `engineering.merge_candidate` approval for the expected registered workspace;
  no approval or merge was performed. The owner must decide using recent
  password authentication. Full workspace build, lint, typecheck, and diff
  check pass after this UI change; the fresh 1,064-pass full suite completed
  just before this small client-only change.
- UI remained at first-task state while backgrounded until refresh; background
  reconciliation mitigation added, live retest outstanding. No new event transport added.
- Research metric semantic validation, model-prose truthfulness, and dollar cost
  aggregation require further audit.
- Full tenant/security adversarial coverage, semantic memory usefulness, reconnect,
  controlled failure/retry, crash-boundary and soak acceptance remain outstanding.
- No new 20-category score assigned; Phase 28 readiness is not established.

Further Engineering closure (September 27 evening):
- Terminal delivery elapsed time now freezes at completion instead of continuing
  to count while an owner views history. A focused test covers a later refresh.
- Delivery writes now use an updated-at compare-and-swap, so a late preview or
  integration result cannot silently overwrite a newer cancellation/recovery
  decision. A focused cancellation race test passes.
- Integration-phase startup reconciliation now scans stale INTEGRATING deliveries,
  checks that no live integration lease exists, and marks the delivery BLOCKED
  with a WORKER_CRASHED action. Authenticated Retry uses the same integration run
  and skips the completed Engineering objective; it never auto-replays an
  uncertain native mutation. A focused test verifies reuse of the existing run.
  Migration `0106_engineering_delivery_integration_recovery_scan.sql` adds the
  partial scan index. This does not yet cover an interrupted PREVIEWING phase.
- Engineering delivery focused tests: 27 passing. Full lint, typecheck, and build
  passed after these changes; full suite is in progress. Railway deployment
  `d0c8c0ac-9eec-48f4-95f6-7ecb85247bad` reached SUCCESS. Deployment logs
  show migrations current with no pending entries, ending in `0106`.
- The exact `engineering.merge_candidate` request for Portfolio Acceptance was
  PENDING in Athena Approvals at 6:49 PM IST, although its listed expiry was
  6:42 PM. The Mac then locked. No owner recent-authentication approval or merge
  has been performed. Owner unlock/approval is still required; never bypass it.
  After the Mac was unlocked, a fresh exact request was created at 7:02:47 PM
  IST and displayed PENDING in Approvals. It expired at 7:17:47 PM without
  approval; refreshing the page showed EXPIRED. The candidate remains READY
  and unmerged. A new exact request can be generated from its Apply button
  when the owner is ready to authenticate and decide.
- Preview startup recovery was then added: the bounded preview ID is persisted
  before the signed start request; a PREVIEWING run stale for two minutes becomes
  BLOCKED, and Retry uses the same reviewed candidate and preview ID. A focused
  test verifies no repeated Engineering task or integration run. Cancellation
  now rereads before its compare-and-swap and preserves the stopped preview
  result, so a concurrent startup cannot overwrite CANCELLED. Migration `0107`
  adds a partial preview scan index. Deployment
  `a4c6f48a-c895-4493-acfe-8952c6fced14` succeeded, with migration logs
  current through `0107` and no pending migrations. A live preview crash has
  not yet been induced. Focused Engineering/scheduler tests: 33 pass.
  The broad test suite was started before the preview patch and imported a
  mixed code snapshot while edits were ongoing: 1,066 pass, two skipped, two
  preview-recovery failures. Both affected tests passed in the final focused
  snapshot. A clean broad rerun then passed: 188 test files, 1,068 tests,
  two intentionally skipped live Gmail/Stripe tests, zero failures (697.44s).
  Full lint, typecheck, build, and `git diff --check` also pass on this code.

Owner-approved merge acceptance (September 27, 7:33 PM IST):
- The owner approved the exact Portfolio Acceptance merge. Applying it through
  the deployed Engineering UI failed with `ENGINEERING_SCOPE_DENIED` before
  mutation. The candidate remained READY.
- Root cause: merge chose a non-author reviewer identity from the repository
  instead of the agent registered to the integration worktree. The signed
  transport correctly requires an exact workspace/task/agent binding.
- Fixed merge to load the owner/company-scoped integration workspace and verify
  its repository, objective, and authorized execution identity. Independent
  review, exact recent-auth approval, lease fencing, and protected-target checks
  are unchanged. Regression coverage checks all integration-workspace calls
  retain the registered agent, including merge.
- Focused integration/transport/runtime/delivery tests: 62 passed. Web API and
  Control Center state tests: 11 passed. Full lint, typecheck, build, and diff
  check passed after the runtime fix. API deployment
  `a908d561-a3c6-46c9-bc1c-daf6f33b5421` reached SUCCESS.
- Approval expired at 7:36:58 while fixing the runtime mismatch. Retrying the
  unchanged candidate created a fresh exact request at 7:41:56, expiring 7:56:56.
  Owner authentication is required again; no merge success has yet been proven.
- Approval UI now scrolls/focuses the password confirmation region, identifies
  the selected proposal, clears stale password/error state when choosing a new
  proposal, and disables overlapping decisions during authentication. It does
  not automatically approve or execute anything. Web typecheck/lint/build pass;
  deployment `a2de6d2f-26bc-48b7-b1ce-ed1c6e9ad8ed` reached SUCCESS.
  API migration logs confirm current through 0107 with no pending migrations.
- At 7:46 PM the fresh exact request was visibly APPROVED. Applying the same
  candidate through Engineering succeeded: UI showed candidate
  `38a47f13-916b-4184-ac83-1c085bed4b8f` MERGED and "Applied to the registered
  project" at 7:48 PM. No manual repository edit or approval bypass was used.
  A first Modify Project request was submitted in Portfolio Acceptance at
  7:51 PM to add a compact-mode settings panel with focused tests; deployment
  and merge remain owner-governed.
- Existing-project run `28898f3a-6a4b-438a-ad91-36d116aff6b5` / objective
  `4e3eece9-c509-4ce0-8dce-32c25f3c42cc` used one Generalist task. It encountered
  JSX lint failures and a signed search timeout during a recorded Mac Agent
  disconnection (14:27:42–14:31:58 UTC). Authenticated Retry at 20:12 IST reused
  the same objective/worktree. The task reached COMPLETE at 14:55:15 UTC, with
  passing validation and required review; completed-task cost shown $0.4365.
- Integration preparation subsequently timed out before an integration ID was
  attached, leaving delivery FAILED at 14:58:55 UTC. This exposed a missing
  recovery classification. The exact signed timeout is now eligible for
  same-delivery retry only after objective completion; the continuation skips
  completed task dispatch and reuses integration creation idempotency. The UI
  exposes its actionable DEVICE_OFFLINE blocker and Retry. Tests verify that
  completed task execution is not called again.
- Worker file-read observations were dropping startLine/endLine/truncated
  metadata before model patch planning. These bounded fields now survive, with
  a regression test for partial excerpts. This does not claim to eliminate all
  model-generated syntax errors; validation remains mandatory.
- Latest focused tests: 50 pass (delivery 29, AI worker 18, Control Center state
  3). Full lint/typecheck/build and diff check passed. API deployment
  `c9e1f908-0072-4ae0-94a5-247e2cef71e0` and web deployment
  `7cff3cae-14c1-4115-aeb3-6e0f79954191` both reached SUCCESS.
  The live UI displayed the specific integration-preparation timeout and enabled
  Retry; it was invoked on the same delivery at 20:44 IST, retaining 1/1 tasks
  and $0.4365 completed-task cost.
  Live integration/preview/follow-up and crash-boundary acceptance remain open.
- The independent reviewer then requested interaction/responsive test evidence.
  Repair task `becda97b-ebc4-4d12-8ab8-333fec105fa7` completed through the real
  runtime, bringing the objective to 2/2 and completed-task cost $1.5120.
  Integration failed with `Prepared task files differ from the validated task
  result.` The signed prepare-commit receipt reported `src/App.tsx`,
  `src/styles.css`, and `tests/app.test.mjs`, while the final repair result
  recorded only the test. Prior-attempt edits were retained in its worktree.
- Added committed-repair evidence reconciliation: verify registered scope,
  clean exact signed commit before/after fresh full validation, and identical
  controlled commit/path provenance on repeat preparation. Persist all paths,
  rebuild contract/security requirements, and still require combined validation
  and independent review. Failed validation or a moved head stays denied.
  FAILED recovery now also accounts for a completed but not-yet-appended repair.
  Delivery exposes the exact evidence blocker and same-run Retry; completed
  implementation is not rerun. No manual portfolio edits or DB mutation used.
- Focused integration/delivery/signed-gateway tests: 65 pass. Full typecheck and
  build pass. The first lint read overlapped a test edit and returned a parser
  error; touched-file lint and a clean full rerun passed afterward.
  Production configuration invariant validation passes; database status is
  current through 0107 with no pending migration. Live retry awaits deployment
  and owner unlock: computer-use inventory explicitly reports the Mac locked.
- Native engineering runtime regression tests also pass (14), including real
  temporary-repository commit preparation, cherry-pick, deterministic revert,
  exact protected-target fast-forward, and crash retry. Total focused tests in
  this change: 79. These do not replace the pending signed live acceptance.
- API deployment `dddc4653-669b-4ee6-904b-70ab03d5e171` reached SUCCESS with a
  passing healthcheck. No web or Mac update is needed for this backend fix.
  The live same-run Retry is not yet performed: owner unlock remains required.
- After owner unlock, Retry was submitted through Safari at 21:20 IST on the
  same delivery. Integration `49a441dd-ac99-47f4-903c-9ea5d8380243` reached READY
  at 15:52:56 UTC; delivery reached DONE_WITH_WARNINGS with a healthy preview.
  Validation `bdece751-3ec6-4e8d-8d1e-bdb037446f56` passed lint, typecheck, tests,
  and build. Independent review `6bf4c17f-7112-477d-bb3e-85f758bc9153` passed with
  warnings. Candidate `8403a389-a723-4bf4-a1f2-03a0fd454258` is READY, unmerged.
  The same two completed tasks and $1.5120 completed-task cost were retained.
- Refreshed UI reconstructs the persisted completion, three changed files, and
  running preview at localhost:4173. Safari had stale/blank page observations;
  the in-app browser rendered the actual portfolio. Compact-mode checkbox
  changes Hero padding from 80px to 44px and height from ~538px to ~466px; Space
  toggles it back. This is real browser interaction evidence, not a mocked test.
- Reviewer warns that the change removes the prior footer outside the requested
  compact-mode change, and source/CSS assertions do not prove full responsive
  interaction. Candidate has not been merged or approved. Existing terminal
  deliveries reject add-instruction; there is no owner-facing candidate rework
  endpoint. Follow-up acceptance still requires a governed baseline decision.
  This success proves evidence-mismatch recovery, not full foundation closure.
- Owner requested all remaining blockers fixed. Prepared a same-session
  correction in the authenticated Modify Project composer: inspect the current
  registered checkout (previous candidate remains unmerged), add compact mode
  additively, preserve footer/content/links and all existing sections, add
  retention/toggle tests, then validate/review without deployment or merge.
  Safari automation failed to activate Send change (`elementHasNoFrame` and
  `noWindowsAvailable`), although read-only UI remained available. A scoped
  database check confirmed no new delivery was created. Owner was asked to
  click the prepared Send change once; do not submit a duplicate or apply the
  prior candidate. No source code, approval, or project files were changed in
  this attempt.

- The owner submitted the corrective project-session instruction as delivery
  `cf59b30d-d528-435c-8b5e-c689607d805d`. Live decomposition incorrectly
  added a DevOps infrastructure task to a frontend-only change. That task
  reached an independent-review blocker and the run was paused. Root cause:
  unbounded role-inference regexes matched short substrings such as `ci` inside
  unrelated words and considered negated requirements. Domain inference now
  uses whole-word matching after excluding negative clauses; a focused test
  protects this portfolio/compact-mode case.
- Normal cancellation initially failed because the Engineering gateway parsed
  500 owner-wide execution requests. An unrelated expired request contained a
  PostgreSQL-formatted `completedAt` value rejected by the shared ISO schema.
  Cancellation now selects only active requests for the exact owner and
  Engineering workspace. The same run was cancelled through Athena's owner UI;
  the UI confirmed zero active workers, preserved workspaces, and CANCELLED.
  It had completed 2/5 tasks and incurred $1.1753 before cancellation; none of
  its output was merged.
- Three execution-store timestamp transitions could coerce ISO strings through
  a PostgreSQL timestamp parameter before persisting JSON. They now cast the
  column separately while retaining ISO JSON. Idempotent migration 0108
  normalizes historical terminal `completedAt` values without changing request
  identity, status, arguments, or evidence. A read-only pre-migration check
  found seven affected rows; after Railway API deployment
  `28ff7aab-4121-4839-ad57-0fa798dfd7c5` reached SUCCESS, the same query
  found zero. Focused store/gateway/planner tests passed (42 total across four
  files), as did lint, typecheck, build, and `git diff --check`.
- A fresh correction was submitted through the same Portfolio Acceptance
  project session as delivery `e6db4478-1905-41ef-b913-ea3a911227bc` /
  objective `403a6a94-a7a5-41e6-9643-e77e117d242a`. The authenticated UI
  showed the intended four tasks (inspect, frontend, focused test review,
  handoff) with no infrastructure task; real Generalist execution began.
  Candidate review/preview/merge and independent restart acceptance remain
  unproven for this new run.
- The new run completed repository inspection and entered real frontend work.
  Lint/typecheck passed in an early validation, but the added Settings section
  broke an existing ordered-section assertion. A subsequent model repair
  generated a malformed regular expression in `tests/app.test.mjs:23`; two
  registered lint reports independently recorded `Invalid regular expression
  flag`, and the objective correctly became BLOCKED after bounded attempts.
  No invalid candidate was integrated. The retry context previously retained
  only a vague file-level summary. It now retrieves the latest scoped
  validation report from the task's existing worktree and supplies a bounded,
  non-secret diagnostic with file, line, and error category. Focused tests
  cover the diagnostic and company/workspace scoping. Same-objective Retry is
  pending deployment and live verification; this is not yet a successful
  Engineering golden path.
- After owner unlock, same-delivery Retry resumed the blocked frontend task in
  its preserved worktree. The latest registered report passed lint, typecheck,
  tests, and build; all five project tests passed, including explicit footer
  retention and Compact-mode spacing checks. QA and structured handoff advanced
  automatically, and objective `403a6a94-a7a5-41e6-9643-e77e117d242a` reached
  COMPLETED with 4/4 tasks. Full repository `pnpm test` finished 1,081 passed,
  2 skipped (188 passing files, 2 skipped files).
- Delivery `e6db4478-1905-41ef-b913-ea3a911227bc` then failed before an
  integration ID was persisted: the signed `repository.run_command` request
  `c0f95e91-810b-4a51-a37b-aab9004dc719` stayed unclaimed for its full
  two-minute window and was cancelled. Railway logs show no Mac Agent execution
  poll in that window; the agent is polling again now. The existing same-delivery
  DEVICE_OFFLINE Retry path applies and preserves completed tasks/worktrees.
  Safari's Athena owner session signed out before Retry, so signed-in owner UI
  access is the remaining live prerequisite. No candidate was integrated,
  reviewed, previewed, or merged from this delivery yet.
- After the owner signed in, the same delivery Retry resumed without another
  objective. Signed Mac Agent repository requests succeeded, integration run
  `372d5831-2136-48aa-9c1a-3d728845bfd6` advanced through combined
  validation, and the independent reviewer rejected malformed CSS and
  insufficient interaction evidence. A governed first repair passed validation;
  the next review still required interaction/responsive evidence and provenance
  clarification. The second repair generated invalid JavaScript test regexes
  across three bounded attempts, becoming a truthful VALIDATION_FAILURE block.
- The Engineering repair prompt now directs JavaScript test repairs toward
  literal string/DOM assertions instead of fragile regex literals; a test-file
  regex lint failure supplies that exact repair guidance. Focused worker tests
  passed 19/19. Railway API deployment
  `67a9fe16-014f-48b0-9bd1-64ff6c3f1d1a` succeeded. Same-delivery Retry
  resumed the blocked task and completed it without a new project/objective.
  Fresh integration validation `65d8179f-d45d-4950-b0b9-536899d2efa5`
  passed all configured lint, typecheck, tests, and build gates. Independent
  review `1f5ab0e9-defb-4c18-a1eb-3618a2cc8f4e` accepted all six criteria
  with non-blocking warnings. Candidate
  `391fde88-0e26-4ffd-91a7-6561a4c64284` is READY and remains unmerged.
- The delivery reached DONE_WITH_WARNINGS with 6/6 tasks, $2.3494 recorded
  model cost, and a health-checked preview at `http://localhost:4173`. A real
  narrow-viewport browser check showed Hero, About, Testimonials, Settings,
  and the original footer; toggling Compact mode changed the checkbox state
  and visibly reduced spacing. This does not establish automated browser
  keyboard/accessibility coverage. The reviewer also noted a nested/repeated
  test assertion. Those are non-blocking warnings and should be cleaned up
  before calling this an unrestricted Engineering golden path.
- A resolved signed-agent timeout remained in the delivery warning list after
  successful review/preview. Retry now removes the resolved warning, and the
  completed control-center read model reconciles older successful deliveries
  while preserving audit history. Focused delivery/worker tests passed 50/50;
  lint, typecheck, build, and `git diff --check` passed. Railway API deployment
  `60120b53-f632-4498-8400-39d0bdfe187e` succeeded. Refreshing the owner
  Control Center removed the stale timeout text; the real review warnings and
  unmerged candidate remain visible. A later full `pnpm test` run was stopped
  after several passing PostgreSQL integration files to prioritize live
  acceptance, so the latest small edits have focused-test rather than a new
  completed full-suite result.

September 28 owner-approved merge and registered-checkout verification:
- The owner approved the exact recent-authenticated `engineering.merge_candidate`
  request for Portfolio Acceptance. The existing candidate
  `391fde88-0e26-4ffd-91a7-6561a4c64284` was applied through Athena's
  Engineering UI, not through a direct Git or database mutation. A read-only
  database query showed `MERGED` at 04:28:14 UTC. The registered checkout at
  `/Users/arjunaravapalli/athena_projects/portfolio-acceptance` was clean on
  `main` with HEAD `2ffadc4ac72500833c7e360a3f02173fa058db27`, matching
  the candidate head. This proves that the governed merge reached the working
  tree; it does not prove every later autonomous build will succeed.
- The checkout's pre-existing `node_modules` came from `/workspace` and linked
  Linux Rollup rather than the macOS native optional package. The old generated
  dependency tree was moved intact to a recoverable temporary backup; a fresh
  lockfile-based pnpm install populated a native Mac tree. Its installation
  command returned nonzero because this pnpm version separately flags esbuild's
  ignored build script for approval. No package manifest or lockfile was
  changed. With the refreshed tree, project `npm run test` passed 6/6,
  `npm run typecheck` and `npm run build` passed, and `npm run lint` passed with
  one non-failing Fast Refresh warning. The registered Git checkout stayed clean.
- Live same-session follow-up modification, worker restart, and repeatability
  acceptance remain unproven. Do not claim Phase 28 readiness from this merge.

September 28 live same-session Engineering follow-up:
- From the existing Portfolio Acceptance project session, the owner UI submitted
  a bounded request to rename the Compact-mode control to “Compact layout,”
  persist its boolean state across refreshes with a safe storage fallback, and
  preserve the portfolio sections. Delivery
  `8a9d11e3-843b-4b7a-8402-ad9254487ecb` used the small-change Generalist
  Engineer path and objective `6131c6cc-0ade-471d-810f-e6c53213de7b`.
  This was a second real run in the same project session, without repository
  reselection or manual editing of the generated project.
- The first integration review requested stronger acceptance evidence. A signed
  dependency request expired while its first repair attempt was active; the
  existing task retry recovered without an orphaned RUNNING state. A subsequent
  review rejected weakened navigation and source-text-only persistence tests.
  The second isolated repair restored specific navigation/Hero assertions and
  added runtime storage/fallback checks. Both repairs ran through the governed
  worker and isolated worktrees, not direct editing of the candidate.
- Combined validation `b6f9920a-6772-4268-a756-101a5d2b88fa` passed lint,
  typecheck, tests, and build. Independent review
  `3a6f141e-2f85-4004-a6c7-de24871240dc` returned PASS_WITH_WARNINGS:
  static and CSS assertions do not replace a full browser accessibility audit.
  Integration candidate `8d8639a9-43e5-4aad-bab2-23c38c364aa7` is READY,
  based on registered commit `2ffadc4ac72500833c7e360a3f02173fa058db27`.
  Delivery reached DONE with 3/3 tasks and $2.7088 reported model usage.
  Health-checked preview `http://localhost:4174` displayed all retained
  sections; in a real browser, the renamed checkbox switched on and remained
  on after refresh. This does not yet prove the follow-up is in the registered
  checkout: a separate exact, recent-authenticated merge approval is pending.
- Restart recovery during this run, repeated autonomous follow-up success,
  broader visual/accessibility verification, and Phase 28 readiness remain
  unproven.
- The expired dependency request
  `37e50b90-620b-4686-a368-428fabed73a4` had its last persisted Mac Agent
  heartbeat at 04:58:59 UTC; the agent connection logged a reconnect at
  04:59:03–04:59:09 UTC, and the request expired at 05:07:45 UTC. This is
  evidence of recovery by expiry/retry, not proof of an interruption-safe
  in-flight result handoff. That reliability gap remains open.
- A subsequent full monorepo `pnpm test` run produced 1,081 passing tests,
  2 opt-in live tests skipped, and one stale Engineering retry-message
  assertion failing. The assertion was updated to match the already-implemented
  actionable regex-repair guidance; the focused Engineering suite then passed
  28/28. `pnpm lint`, `pnpm typecheck`, `pnpm build`, focused lint, and
  `git diff --check` passed. The full suite has not yet been rerun after that
  one-line assertion update.

September 28 follow-up merge and transport hardening:
- After the owner approved the fresh exact `engineering.merge_candidate`
  request, candidate `8d8639a9-43e5-4aad-bab2-23c38c364aa7` was applied
  through Athena's owner UI. Read-only database verification showed MERGED at
  05:50:48.960 UTC. The registered checkout is clean on `main` at
  `95d69144e9344cbd0f15aec7fb221e593e776b0a`, matching the candidate head.
  Registered-checkout lint passed with three non-failing Fast Refresh warnings;
  typecheck, all seven tests, and production build passed.
- Inspection found that Mac Agent reconnect/resume could start a second poll
  loop while the first awaited a capability/result. Added a single-flight guard
  covering the whole poll/execution lifecycle. Late poll responses after stop
  or suspension cannot dispatch new work. Three focused regression tests passed.
  This is a verified concurrency fix, not proof that the earlier heartbeat
  interruption was caused by overlapping loops.
- Durable delivery of a completed signed device result across process death,
  live worker-restart acceptance, and broader foundation acceptance remain open.
  This change does not bypass signing, expiry, replay checks, policy or approval.
- After correcting the test fixture's Node/browser CryptoKey type mismatch,
  monorepo lint, typecheck, build, focused transport tests (3/3), formatting,
  and `git diff --check` passed. The full test suite was started and remains
  in progress. The updated Mac Agent bundle has not been installed or live-tested.

September 28 installation attempt:
- Full monorepo test run completed: 189 files passed, two opt-in files skipped;
  1,085 tests passed and two skipped. No failing tests.
- The owner requested installation and live testing. Packaging/signing completed,
  but the installer rejected the replacement because it did not report ONLINE
  within thirty seconds, then restored the previous bundle. The app UI shows
  AUTH REQUIRED, execution disabled, and key storage UNAVAILABLE. The restored
  app shows the same secure-storage blocker. Neither identity reset nor re-pairing
  was attempted; the encrypted identity files were not read or modified.
- Live preview restart has not been attempted with an unauthenticated device.
  Owner intervention to restore macOS secure-storage availability is required
  before installation/live execution can be verified. The precise OS cause is
  not established; do not claim this is a policy/provider or replay failure.

Secure-storage recovery fixes (not yet installed):
- Reconnect now retries loading the existing encrypted identity through the
  existing Electron safeStorage adapter. It never generates replacement keys.
  Recovery preserves validated public metadata and rejects fingerprint mismatch.
- Pairing checks storage and recovery state before consuming a server pairing
  code. Unknown state denies. UI disables pairing during unavailable/corrupt
  storage and shows recovery guidance instead of only NOT CONFIGURED.
- Nine focused storage/transport tests passed. These tests prove the bounded
  recovery logic, not OS secure-storage availability on this Mac. The owner must
  resolve OS unlock/access locally; no password, key, plaintext fallback, Keychain
  inspection, identity reset, or untrusted execution was used.

September 28 live installation and preview recovery:
- After the owner handled macOS secure-storage access, the signed local installer
  succeeded. Installed Mac Agent 0.1.1 preserved trusted device ID
  `a9b70309-11ac-457c-a5ad-c044204fbf8a`; the agent reported ONLINE, key
  storage AVAILABLE, active signed polling, and no execution failure. No reset
  or re-pairing occurred.
- The existing Portfolio Acceptance delivery was DONE with 3/3 tasks, all
  configured checks PASS, independent review PASS_WITH_WARNINGS, and candidate
  `8d8639a9-43e5-4aad-bab2-23c38c364aa7` MERGED. Its preview was stopped
  through the signed agent path. Restart then failed because stopping after an
  agent relaunch had persisted `serverId: "unknown"`. The backend now preserves
  a known registered server ID and recovers an older unknown ID only when the
  scoped repository has exactly one active configured development server. The
  signed gateway still validates the registered server; ambiguous profiles
  fail closed. Control Center now shows preview-action errors and stopped state.
- The first post-deploy restart reached the agent but correctly reported that
  the internal preview network was unavailable. Docker Desktop's backend log
  identified an engine crash during host-disk exhaustion. Old generated Mac
  Agent installer archives were removed to reclaim space; the unresponsive
  Docker backend was restarted without deleting images, volumes, or project
  files. `docker info` then reported server 29.6.1.
- Retrying the *same* delivery preview succeeded. Athena displayed PREVIEW
  RUNNING and a health-checked `http://localhost:4173`. Local HTTP returned
  200, and the bounded preview and relay containers were running. Safari loaded
  Hero, About, Testimonials, and Settings. Toggling Compact layout stayed on
  after refresh. No new Engineering objective, merge, or model call was made.
- Focused Engineering Delivery tests passed 32/32. Monorepo lint, typecheck,
  and build passed; `git diff --check` passed. A full monorepo test run was
  started but interrupted before a final result, so it is not claimed as green
  for this latest change. The previously completed full run had 1,085 passing
  tests and two opt-in skips.
- This live preview restart does not prove process-death-safe signed result
  handoff or a fresh autonomous build after restart. Those remain separate
  foundation acceptance items.

September 28 signed-result durability follow-up:
- Traced the Mac Agent's actual result path. After a governed capability
  finished, its signed result existed only in process memory until the API
  acknowledged `operation: "result"`. A Mac Agent process death in that gap
  could lose the result while the file/Git operation had already happened.
- Added one bounded, device-bound, macOS-secure-storage-encrypted receipt file.
  The signed result is written and synced before HTTP submission. On restart,
  the Agent submits this exact receipt before polling for more work; it never
  re-executes the capability to reconstruct the result. Unknown secure-storage
  state or a mismatched device identity pauses execution.
- The API now verifies the signature and returns an idempotent acknowledgement
  for the exact already-stored receipt, including after a lost HTTP response.
  Different signed results for the same request fail closed. Replayed receipts
  do not repeat normal route-side events. Repository scan, validation, and
  native-provider publications remain fail-closed with a specific
  `EXECUTION_RESULT_PUBLICATION_UNCERTAIN` error, because those legacy
  downstream consumers have not yet been made independently idempotent.
- Focused API/Mac Agent tests passed 39/39; monorepo lint, typecheck, and build
  passed. A fresh full suite completed with 1,092 passed, two opt-in live
  integrations skipped, and zero failures. API deployment
  `08a65508-769e-43cc-8ef8-cf9f7ff6e322` reached SUCCESS; public readiness
  reports database/security ready and migrations current. Production config,
  migration status, and security checks passed.
- Existing live UI still reconstructs the completed five-company Objective
  (5/5, source-linked records, model and tool evidence) and merged Engineering
  follow-up (3/3, passing gates, healthy preview). This is history/reconnect
  evidence, not proof of in-flight crash recovery.
- The signed local installer completed with Mac Agent 0.1.1 and preserved trusted
  device ID `a9b70309-11ac-457c-a5ad-c044204fbf8a`. The Agent showed ONLINE,
  secure key storage AVAILABLE, signed polling active, and no execution failure.
  Its own backend connection check reported HTTPS online. No identity reset or
  re-pairing occurred.
- The existing Portfolio Acceptance preview was restarted through Athena's
  governed owner UI after installation. It returned to PREVIEW RUNNING and
  healthy at `http://localhost:4173`; local HTTP returned 200. The Agent had
  no pending request or execution failure, and the encrypted receipt file was
  absent after acknowledgement. A clean Agent quit/relaunch preserved the same
  device ID, recovered ONLINE polling, and left the preview serving HTTP 200.
  No new Engineering objective, model call, merge, or approval was made.
- This verifies the installed bundle, ordinary restart/reconnect, and one live
  signed preview operation. It does **not** prove a forced crash precisely
  between a Mac capability side effect and its API acknowledgement. Legacy
  repository scan, workspace validation, and native-provider result publication
  still fail closed as uncertain on receipt replay. They need independently
  idempotent publication before claiming complete crash-safe result handoff.
- Follow-up inspection found that the API had also advanced a request to its
  terminal status before inserting the signed receipt in a separate query. A
  process crash at that boundary could leave a terminal request with no result.
  The execution store now commits both changes in one PostgreSQL transaction;
  cancellation acknowledgement remains cancellation-only. Focused tests cover
  owner-scope denial, exact receipt persistence, duplicate denial, and rollback
  when receipt insertion fails. The real isolated-PostgreSQL integration test
  confirmed a terminal request and matching receipt are stored together.
  Monorepo lint, typecheck, and build passed. The final broad run passed 1,094
  tests, with two opt-in live integrations skipped and zero failures. API
  deployment `caffdab8-c43c-4a22-b14f-575eef7b0e06` succeeded after one
  transient Railway upload HTTP 500; production config, migration status, and
  security checks passed. Public readiness reports database/security ready and
  migrations current. No Mac Agent rebuild was needed for this API-only transaction.
- After deployment, the owner opened Engineering and the existing Portfolio
  Acceptance preview was restarted through the governed UI a second time. It
  returned to PREVIEW RUNNING, reported healthy at `http://localhost:4173`, and
  local HTTP returned 200. The installed trusted Agent remained ONLINE with no
  execution failure or pending receipt file. This proves a normal signed
  operation against the new API, not a forced-crash replay at the narrow
  uncertain-result boundary.
- September 28 nonce follow-up: a signed result nonce is now bound to the exact
  execution request and SHA-256 digest of the verified device signature. The
  same signed result may retry after a crash between nonce reservation and the
  atomic request/receipt commit; a changed signature or different request still
  fails closed. Additive migration `0109_bind_execution_result_nonces` was applied
  to production. Focused execution and isolated-PostgreSQL tests passed 12/12,
  including a simulated commit failure followed by an exact retry. Monorepo
  lint, typecheck, build, and diff check passed. The fresh full suite passed
  1,094 tests with two opt-in integrations skipped and zero failures, in 696.83
  seconds. API deployment `aeb6286f-9247-4fbf-b711-020dfd5dbcef` succeeded;
  public readiness reports database/security ready and migrations current.
  This nonce release does not itself make downstream publishers idempotent.
- Downstream publication follow-up: repository generation,
  inventory, active pointer, and terminal index job now commit together; the
  index job is locked before publication. Exact replays repair an older saved
  generation without creating another one. Failed scan publication also commits
  repository/job state together and cannot overwrite an already-terminal job.
  Validation completion uses an owner/request-bound compare-and-set, so only
  one active-to-terminal write wins. Native execution and diagnostic receipts
  use stable request/stage IDs; replay updates the same records, not another
  action. The result route retries these publishers from the verified identical
  signed receipt without re-executing any capability or replaying generic audit
  events. The final focused five-file suite passed 24/24, including real
  PostgreSQL rollback fault injection, concurrent publication, stale-failure
  denial, validation owner denial, and native receipt replay. Monorepo lint,
  typecheck, build, production configuration/security checks, and diff check
  passed. API deployment `70d757cc-3c7c-4ac6-b74e-1d37f8c94a5f` succeeded.
  Public readiness reports database/security ready and migrations current.
  The final full suite passed 1,095 tests with two opt-in tests skipped and
  zero failures (190 files passed, two skipped), in 738.62 seconds.
- Live post-release check: existing Portfolio Acceptance remained DONE with
  3/3 tasks, all configured validation PASS, independent review warnings
  retained, candidate `8d8639a9-43e5-4aad-bab2-23c38c364aa7` MERGED, and
  preview healthy. The visible owner UI Restart action created signed request
  `bb783baa-1d83-40c9-b0c7-0a27d91029c2` at 11:17:11 UTC; it SUCCEEDED
  at 11:17:21 UTC with no failure. Scoped PostgreSQL inspection confirmed its
  signed receipt and bound nonce are both saved. The UI returned to enabled
  preview controls and local HTTP returned 200. No new objective, model call,
  source patch, approval, or merge was made. This proves normal signed execution
  after the release, not a forced crash at the receipt boundary or live replay
  of each of the three legacy tool consumers.

## Current readiness verdict

September 28 live active-restart closure:

- Objective `7d25f0c8-f028-457c-932b-128cf3e5e37c` (Foundation active
  restart check) ran a sourced comparison of three AI coding assistants through
  real workforce execution and OpenAI `gpt-5.6-luna`. Requirements request
  `f67cd903-f381-49af-9347-7065d9dc11e1` and research request
  `4c392c55-8bf5-4875-b4d4-17f0ca0b7986` completed. Research used two
  actual web-search calls and persisted three source-linked records.
- A Railway API restart requested SIGTERM at 11:40:48 UTC, after research
  completed at 11:40:41 UTC and while the review held a preparation lease.
  Recovery formerly scanned RUNNING/RESERVED only, leaving that leased QUEUED
  task behind. Recovery now includes expired leased QUEUED/MATCHING/WAITING
  preparation, never ordinary unleased queued work. The interrupted review
  became actionable WORKER_CRASHED; completed requirements/research remained
  intact. This is live SIGTERM restart proof at preparation, not forced SIGKILL
  or in-flight provider/tool-effect replay proof.
- Dashboard execution truth now comes from unexpired persisted leases rather
  than RUNNING row labels. Company-scoped active task IDs expose no lease
  secrets. Session preparation is labelled separately from model execution.
  Focused checks passed 62/62 across Objective, workforce, and real PostgreSQL
  lease tests; the additional preparation-recovery service test passed 35/35.
  Root lint/typecheck/build and diff checks passed for this release.
- Retrying the same objective resumed the same review task, request
  `6cf17ab3-47a6-4a14-8b1a-13f299768003`, without repeating research.
  It exposed a second bug: the reviewer treated the planning stage's lack of
  sources as absence of subsequent real retrieval. Dependency context now
  carries bounded persisted retrieval receipts, not model-provided URLs as
  retrieval proof. Existing bounded correction schedules a replacement review
  only when legacy review context lacks those receipts. Review/evidence gates
  and historical failure evidence remain intact.
- Verified-assistant count metrics now reuse structured research record
  evidence. An existing completed research task can recalculate that metric
  without rerunning research or manually changing the database. Assistant
  record counts must not be mistaken for assistant-download counts.
- API receipt-context release `55d684da-636b-4eff-a447-440fb1fefe22`
  succeeded. Same objective reached COMPLETED in the owner UI at approximately
  17:32 local time, with 3/3 verified assistants and final sourced comparison
  visible. Corrected review request
  `5cc8841b-d5e2-4857-83e3-40bdb6e16697` passed. Aggregate spend was
  19 application credits, not $19. Earlier failed review remained in history.
  No manual completion, source edits, outreach, or governance bypass occurred.
  Receipt-context focused tests passed 63/63 before the final metric-name guard.
  After narrowing assistant-count inference and adding download-count
  protection, Objective/workforce focused tests passed 64/64 (2 files, 2.34s).
  The narrower metric guard is a subsequent local patch; the cited live
  completion used the receipt-context release above.
  Browser refresh reconstructed COMPLETED, 100/100 progress, the final three
  records, and model history. Read-only scoped PostgreSQL inspection confirmed
  31 persisted research retrieval receipts, two search calls, preserved model
  request IDs, and no pending lifecycle delivery on all four historical tasks.
  Final local validation after the metric guard: `pnpm lint`, `pnpm typecheck`,
  `pnpm build`, production-configuration validation, and `git diff --check`
  all passed. Build retains existing runtime-config/module and large-chunk
  warnings. The earlier 1,095-test full suite was not rerun in this cycle.
- Read-only scoped inspection of completed Portfolio Acceptance follow-up
  objective `6131c6cc-0ade-471d-810f-e6c53213de7b` found five stable
  repository memories and three Agent OS context packages carrying those five
  actual memory IDs. This proves company/repository-scoped memory retrieval
  reached the real follow-up sessions. It does **not** by itself prove a
  specific implementation decision was caused by memory; usefulness comparison
  and semantic retrieval remain open gates. The legacy hybrid endpoint labels
  keyword mode and vector-only retrieval fails closed instead of pretending
  semantic similarity occurred.
- Post-release read-only production check found 10 completed, two blocked,
  six cancelled Objectives and zero live workforce leases. The owner UI also
  showed zero ACTIVE objectives; no silently RUNNING objective was present in
  this snapshot. Public readiness returned database/security ready and current
  migrations; private-network and privileged-execution remained unavailable
  on the public request context as designed. Existing local Engineering preview
  returned HTTP 200. API release
  `377c692b-338e-4c5d-ab8b-16c21ed178aa` reached SUCCESS.
- Deadline-focused security/scope pass after the release: 25/25 tests passed
  across browser security, company-data scope, memory scope, signed Engineering
  gateway, and execution persistence. The API `security:check` passed with
  repository security invariants validated. These targeted checks do not
  replace an adversarial live cross-company run or the earlier full suite.

September 28 additional live acceptance and stale-dashboard repair:

- Research-only objective `e1ee528f-edff-4674-a36b-af722cd78c1c`
  (Foundation forced restart acceptance) reached COMPLETED, execution/outcome
  progress 100/100. Scoped persisted task inspection showed real Agent OS and
  model-request provenance. Research tasks persisted 36 and 37 retrieval
  receipts respectively. The initial review rejected four records against a
  five-lead target; a subsequent autonomous repair and review completed with
  five companies. No manual task completion or database mutation was used.
  Despite the title, no in-flight restart was performed: the run completed
  while the owner browser displayed stale cached draft state. This is not
  restart acceptance proof.
- Refresh exposed an expired owner browser session. Previously API 401 errors
  only cleared the CSRF token, leaving the authenticated query cache on screen.
  The Web query/mutation caches now react to authentication denial by replacing
  auth state with unauthenticated state, cancelling scoped reads and evicting
  stale owner data. Permission denials and provider failures do not sign out.
  API contract mismatches now return a bounded app-version error rather than
  raw Zod response details. Objective mutation errors and pending activation
  are visible. No session lifetime, permission, approval, or trust was widened.
  Focused Web checks passed 11/11. Monorepo lint/typecheck and the Web build
  passed; diff check passed. The earlier full suite was 1,095 passing tests
  before these final UI changes, not a full rerun of them. Frontend release
  `761742ce-2e66-4283-83a8-b1d8fa47e920` succeeded. Owner sign-in is
  needed to resume UI proof. Existing session expiry remains enforced.

The foundation is materially stronger but is **not** certified 9/10 or Phase 28
ready. The completed Objective and Engineering golden paths, persisted history,
tenant-focused tests, installed trusted Agent, and signed preview operation are
real evidence. The following gates remain open rather than being counted as
passed by a green test suite:

September 28 Engineering restart and dependency-security audit:

- A new owner-UI modification of the existing Portfolio Acceptance project
  (delivery `3b2eb19f-27f8-460f-82f3-4b2e4ca14897`, objective
  `93a0b73c-7167-4567-b7aa-2657fd9fed3f`) changed only a compact-mode
  label. The API was restarted while its first task had a live lease but before
  an Agent OS/model request was persisted. The deployment recovered; expiry
  became an actionable `WORKER_CRASHED` block instead of indefinite RUNNING.
  Owner-UI Retry reused the same delivery and objective, and the recovered
  task completed with a real Terra model call and recorded $0.7066. The
  integration path then created a bounded repair task after review. The same
  delivery later reached DONE: both tasks completed, lint/typecheck/tests/build
  passed, independent review passed with warnings, a governed candidate was
  READY, and its local preview was healthy at `http://localhost:4174`.
  Candidate `6f501e85-ebe2-4b5f-b48a-0d6934719cf4` was **not merged** into the
  registered checkout. Exact recent-authenticated approval is still required;
  this run proves reviewed candidate publication, not VS Code/main-checkout
  visibility after merge. Total recorded model cost was $1.1528 (Terra $0.7066,
  Sol $0.4462); failed attempts may have unreported provider charges.
- The blocked Control Center previously counted a stale ACTIVE task row as one
  active worker after its lease expired. Its read model now requires a live
  lease and shows the affected feature as BLOCKED. The deployed UI was
  observed showing 0 workers, Settings BLOCKED, and the specific retry action.
- During that run's integration repair, a governed dependency install request
  reached its 10-minute signed-request expiry before the Mac Agent returned a
  receipt. The existing retry advanced on the same task and later performed
  real signed file reads/patches. The dependency runner remains limited to
  nine minutes; the request/result window is now 12/13 minutes respectively,
  leaving a bounded response margin instead of expiring at the edge of the
  runner limit. This does not authorize new commands or bypass the container.
- Review then demanded fresh proof of responsiveness for a label-only edit.
  Root cause: every React delivery inherited a broad responsive-interface
  acceptance criterion, including existing-project tiny edits. Existing-project
  changes now receive that criterion only when the request actually changes
  responsive/layout/styling behavior or adds a page, section, or component.
  New deliveries retain the baseline criterion, and configured validation is
  unchanged. This does not retroactively alter the already-running objective;
  its bounded repair/review result is still being observed separately.
- A production `pnpm audit --prod` found 15 advisories (12 high, 3 moderate)
  across stale Fastify/OpenTelemetry versions and vulnerable transitive pins.
  Direct dependencies and reviewed lockfile overrides were updated; a fresh
  production audit now reports **no known vulnerabilities**. This is package
  advisory coverage, not proof against all application vulnerabilities. API
  deployment `d950180c-73fc-481e-8fc5-d97f1264d4c5` reached SUCCESS and
  public `/health` returned HTTP 200. Safari session and completed Engineering
  read model survived a full page reload after deployment.
- Fastify 5.12.1 no longer accepts numeric `trustProxy` hop-count trust. The
  public cloud path now ignores forwarding headers until an authenticated
  peer-address policy exists; a focused test proves spoofed forwarded IP/host
  headers are ignored. The legacy `one-hop` environment value remains accepted
  during migration but no longer grants trust. Cloud source-IP rate limiting
  may be coarser while peer identity is unknown; do not silently re-enable
  hop-count trust or trust all private addresses.
- Final validation after the narrowly scoped existing-project criterion fix:
  `pnpm lint` PASS, `pnpm typecheck` PASS, `pnpm build` PASS,
  production-configuration check PASS, `pnpm audit --prod` PASS (no known
  advisories), and `git diff --check` PASS. The clean full suite passed:
  **191 files / 1,104 tests**, with two opt-in Gmail/Stripe live files skipped
  (694.95 seconds). The prior broad failure overlapped edits and is superseded
  by this clean run.
- A post-release read-only workforce snapshot had 44 completed, five failed,
  12 cancelled, four queued, two waiting, **zero RUNNING** tasks and zero live
  execution leases. This supports truthful state at that instant; it is not a
  concurrency soak or proof that every future failure is surfaced promptly.
- The first broad test run overlapped these edits and was not a final snapshot:
  1,101 passed, 1 failed, 2 skipped. The failed expired-lease test passed in
  isolation and its complete 32-test file passed afterward. The clean broad
  rerun above is the current result.
- On a separate owner-UI inspection, the latest Engineering label-change
  candidate `6f501e85-ebe2-4b5f-b48a-0d6934719cf4` was still READY, not
  merged. A completed Objective (`7d25f0c8-f028-457c-932b-128cf3e5e37c`)
  was selected after navigation and restored again after a full Safari reload:
  completed and historical failed tasks, real model request IDs, two web
  searches, ten evidence references, three qualifying records, and 19 credits
  remained visible. This proves history reconstruction after reconnect, not
  continuation of an actively disconnected worker.
- The encrypted Mac result outbox preserves one signed receipt and refuses
  further work until the API acknowledges that exact receipt. A narrow
  unresolved failure boundary remains: if the Mac completed an action but its
  first result POST cannot reach the API until the execution request expires,
  `acceptResultDetailed` rejects the late receipt. The outbox then correctly
  fails closed, but owner recovery of that uncertain side effect is not yet
  demonstrated. Do not describe this as exact-once external execution. A
  targeted rerun passed 15/15 API execution tests and 6/6 Mac Agent
  execution/outbox tests; these do not replace the forced live boundary test.
- The repository `pnpm security:check` composite passed: security invariants,
  private/cloud production configuration, and production dependency audit
  (no known advisories). This does not establish live tenant penetration or
  crash-at-every-boundary acceptance.
- A separate focused security/scope rerun passed 23/23 tests across browser
  security, company-data scope, memory scope, signed Engineering gateway, and
  actual PostgreSQL workforce company-isolation. This is stronger than a mock
  tenant check, but still not an adversarial live cross-company UI/API run.
- At 21:16 IST the owner approved the exact `engineering.merge_candidate`
  request for Portfolio Acceptance. Applying reviewed candidate
  `6f501e85-ebe2-4b5f-b48a-0d6934719cf4` through the authenticated
  Engineering UI transitioned READY to MERGED and reported application to the
  registered project. Read-only checkout verification found `src/App.tsx`
  displaying “Compact view,” the matching assertion in `tests/app.test.mjs`,
  and a clean Git working tree at `/Users/arjunaravapalli/athena_projects/portfolio-acceptance`.
  Direct local checks passed: ESLint (zero errors, three pre-existing
  react-refresh warnings), TypeScript, 7/7 Node tests, Vite build, and
  `git diff --check`. The `pnpm` package-script wrapper first attempted a
  dependency policy install and refused ignored `esbuild` build scripts;
  those initial invocations did not run the requested checks. Its generated
  placeholder `pnpm-workspace.yaml` was removed; no dependency policy was
  weakened and the repository remained clean. This closes the reviewed-merge
  and registered-checkout visibility gate, not the live crash/replay gate.
- A signed-result contract mismatch was found in the remaining transport
  audit. The governed dependency container is bounded to nine minutes, but
  the outer Mac result receipt allowed only 60 seconds of `durationMs`.
  The receipt schema now accepts up to 35 minutes to cover the existing
  registered-command ceiling plus bounded overhead; the dependency runner
  remains bounded to nine minutes. No tool, shell, policy, or execution time
  authority was expanded. Focused regressions accept a nine-minute signed
  result and reject one exceeding 35 minutes. Shared/API/Mac Agent execution checks
  passed 10/10, 15/15, and 6/6 respectively. Full monorepo lint, typecheck,
  build, and diff check passed. The clean full suite passed 191 files and
  1,105 tests; two opt-in Gmail/Stripe live files were skipped (680.02s).
  API release `f6112c0d-68b3-4af0-b25f-f089ba76c737` deployed successfully
  and `/health` returned 200. The signed Mac package built and verified, but
  three bounded local installation attempts did not reach `CONNECTION_ONLINE`
  before the two-minute deadline; each automatically restored the previous
  application, which connected again. A process sample of the replacement
  placed its main thread inside macOS `SecItemCopyMatching` / security-server
  decryption before Agent startup logging. The packaged and working apps have
  the same bundle identifier and certificate requirement, so a macOS
  secure-storage access/locked-keychain condition remains the immediate live
  prerequisite. A diagnostic retry through macOS Launch Services reached the
  same security-server wait, so that installer experiment was reverted. No key
  was reset or re-paired. This is API-deployed and
  code-tested, **not** installed-Agent or long-operation verification.
- The next expiry audit found a separate mismatch: ordinary signed execution
  requests expired after 120 seconds, but registered Engineering commands can
  run for 180 seconds in the current delivery profile (and up to 30 minutes by
  schema). Sequential registered validation profiles can likewise exceed the
  old request and result-report limits. The unclaimed dispatch window remains
  short (120 seconds in production). Only an unexpired, trusted-device claim
  may atomically enter RUNNING and receive a deadline derived from its
  already-registered command/profile timeout plus one minute. A missing
  heartbeat expires RUNNING after 30 seconds; the existing durable scheduler
  reconciles that state at startup and in bounded ticks. Signed receipt and
  validation elapsed-time schemas cover the finite registered work limits.
  This changes transport validity, **not** command selection, runtime timeout,
  policy, or approval authority. API deployment
  `54925900-a0c1-4ff2-98cb-4346da8a174b` succeeded on September 29 and
  public `/health` returned 200. Focused tests passed 47/47; the full suite
  passed 191 files and 1,109 tests, with two opt-in live files skipped.
  Workspace lint, typecheck, build, and `git diff --check` passed. The
  repository security check and production configuration validation passed;
  the production dependency audit found no known vulnerabilities after
  updating only the transitive `fast-uri` overrides and lockfile to patched
  3.1.8/4.1.5. This remains **not live-verified on the trusted Mac Agent**:
  the signed package was rebuilt on September 29 and `codesign --verify --deep
  --strict` passed, but the prior bounded installer attempts did not reach
  ONLINE and were safely rolled back, preserving the previously paired app.
  The newly rebuilt package has not yet been installed.
- A September 29 reinstall of the newly signed package also timed out at the
  existing macOS secure-storage access boundary. A foreground Launch Services
  diagnostic produced the same result, so that installer experiment was
  reverted. Both attempts restored the prior paired Agent, whose operational
  log then recorded `CONNECTION_ONLINE`. Neither attempt changed device identity
  or relaxed the secure-key requirement. A user-handled macOS secure-storage
  decision is still needed before the updated Agent can be live-tested.
- The next owner-unlocked attempt reproduced the same boundary: the replacement
  process was sampled inside `SecItemCopyMatching` and security-server
  decryption before its normal startup event. A menu-bar-app usability fix now
  shows a one-time installer-only notice before accessing secure storage; that
  notice was observed in the native UI. It does not approve the macOS prompt.
  The replacement still did not report ONLINE within the bounded window, and
  rollback again restored the prior Agent to `CONNECTION_ONLINE`. Focused
  Mac installer/key-store/execution-client checks passed 15/15. The new package
  remains uninstalled, and live signed long-operation acceptance remains open.
  The final workspace validation after this installer-only UI change passed:
  191 test files / 1,110 tests, two opt-in live files skipped, lint, typecheck,
  build, security/configuration/dependency checks, and `git diff --check`.
- Engineering stable-memory retrieval had been ordering the first twenty
  repository memories by importance without considering the active task. It
  now considers up to one hundred company- and repository-scoped candidates,
  ranks them against the task title, acceptance criteria, and objective
  description, and still sends at most twelve bounded summaries. A focused
  regression shows an older relevant Zod decision selected ahead of unrelated
  higher-ranked records; company scope remains enforced. The full suite passed
  191 files / 1,110 tests with two opt-in live files skipped, plus lint,
  typecheck, API build, and diff check. API deployment
  `7090fc51-9552-44f8-ab72-9a620ad81d4f` succeeded and public `/health`
  returned 200. This establishes selection in code, not causal usefulness in
  a later live Engineering run.
- A signed native result could commit durably and then lose its owner-facing
  conversation settlement if the process failed before the settlement write:
  retry acknowledged the receipt but skipped that idempotent update. Exact
  signed-result retries now replay the settlement from the stored request and
  receipt, without repeating the Mac capability. The acknowledgement also
  re-reads the terminal request to avoid rejecting a concurrent retry that
  initially observed stale RUNNING state. A focused regression forces the
  post-commit failure and a stale initial read; both recover. This is code-level
  replay coverage, not a forced live-crash proof. The replacement Mac Agent's
  secure-storage gate remains separate: installed and replacement apps have
  matching bundle ID, designated signing requirement, entitlements, and name.
  After this repair, the focused execution suite passed 13/13; the full suite
  passed 191 files / 1,111 tests, with two opt-in live files skipped (684.13s).
  Lint, typecheck, build, repository security, production configuration,
  production dependency audit, and `git diff --check` passed. Railway API
  deployment `bbfaa2f7-246a-406f-b053-b102eed8b3a7` reached SUCCESS and
  the public `/health` endpoint returned HTTP 200. Live forced-crash replay
  was not performed by this deployment.
- On September 29 the owner handled the macOS secure-storage prompt during a
  fresh bounded local update. The installer completed successfully, preserving
  trusted device ID `a9b70309-11ac-457c-a5ad-c044204fbf8a`; the installed
  app.asar SHA-256 matched the newly signed package, `codesign --verify --deep
  --strict` passed, and the Agent UI showed ONLINE / key storage AVAILABLE.
  The operational log recorded a fresh `CONNECTION_ONLINE`. This closes the
  packaging/install/reconnect prerequisite. The owner-signed-in Engineering UI
  accepted Restart on the existing Portfolio Acceptance preview, returned to
  PREVIEW RUNNING / Healthy at `http://localhost:4174`, and direct local HTTP
  returned 200. This is a bounded preview availability check, not proof of a
  nine-minute signed dependency operation or exact crash-boundary replay;
  those gates still require separate live acceptance.

### September 29 final-gate continuation

- The existing two-profile validation plan `d5f9f62d-aaf4-49ca-8652-ddcaa137d4ca`
  initially failed to start with an incorrect approval terminal-state error.
  Read-only production inspection showed approval `9195605c-4ae3-48fd-a9f5-f2803874a4f5`
  still PENDING: its SQL company column was populated, while its legacy JSON
  company ID was null. Strict company-bound updates therefore matched no row.
  Approval reads now hydrate missing legacy company identity from the SQL
  column, reject conflicting identities, and retain strict company-bound writes.
  Validation routes now require company context. The real PostgreSQL regression,
  focused lint and API typecheck passed. API deployment
  `98eef3bf-fcfd-4942-8dff-72745d21a7aa` succeeded.
- Retrying the same plan through the owner UI created signed execution
  `c3368222-a798-49f2-89ac-21979ec43370` on existing trusted device
  `a9b70309-11ac-457c-a5ad-c044204fbf8a`. It started at
  `2026-09-29T10:14:41.354Z`, lasted 43,662 ms, and persisted a signed FAILED
  receipt at `10:15:24.998Z`. Live database observation showed RUNNING with
  heartbeat `10:15:11.455Z`; final heartbeat was `10:15:21.437Z`, attempt count
  one. This proves active signed execution/heartbeat and truthful terminal
  failure, not a successful long-running gate or a forced-crash pass.
- Failure exposed legacy validation snapshot copying packaged `app.asar`
  output. Its source-copy filter now excludes packaged apps/archives, release
  and native build output, signed workspace blocked patterns and symlinks.
  Partial snapshots are cleaned on failure. One focused filesystem regression,
  Mac Agent typecheck and focused lint passed. Dependency directories remain
  omitted; no ungoverned network installation was added. The signed local
  package/update completed, preserved the trusted device identity, and the
  installed UI showed ONLINE / secure storage AVAILABLE. Live retest pending.
- A real memory-usefulness follow-up was submitted against the existing
  Portfolio Acceptance session. It was rejected before creating an execution:
  legacy project name `tri` matched the substring inside `retrieved` in the
  instruction. Project reference checks now use escaped Unicode word boundaries;
  an explicit different-project reference still fails closed. Five focused
  session tests passed, including the substring regression and true wrong-project
  denial; focused lint and API typecheck passed. No task/model cost was incurred
  by the rejected instruction. API deployment
  `163b9ede-bf9f-46e4-8d88-eb9438e392ed` succeeded; the unchanged instruction
  then created delivery `c1a29b93-6d01-46bb-86e0-922dc1a9e722` and focused task
  `5c32f1ca-ff92-4cf8-9d2f-f363c867c348`.
- The live task persisted scoped memory context package
  `7743159f-6d8f-47c4-b46c-ae0ff674796f` with five memory references:
  `75ba8639-f60d-413d-838e-eb684dabc93f`,
  `414f20cb-4f05-47fb-86a7-0f49c0f22601`,
  `05fef13c-3e80-4547-a8ae-91921f811a9a`,
  `f5fe222c-aa4f-434f-b487-548176946098`, and
  `2b425aeb-11d6-4b96-81c9-1b6a0bbf1531`. Retrieval count is five; causal
  usefulness remains pending final task evidence.
- A controlled Railway API restart during the real safe unmerged follow-up
  restarted the server at `2026-09-29T10:31:46.409Z`. The interrupted task's
  generation-2 lease expired at `10:33:22.308Z`; reconciliation persisted the
  delivery as BLOCKED at `10:33:46.477Z` with the explicit expired-worker warning.
  Reconnected Engineering displayed WORKER CRASHED and canonical Retry.
  Retry resumed the same delivery/task with generation 3 at `10:35:34.182Z`.
  This is a real active-run restart/retry observation, not a precisely injected
  result-persistence-boundary crash or proof of eventual completion.
- That observation exposed an orphan Agent OS delegation still marked running
  after replacement. The Engineering gateway now fails older running delegations
  only for the same task/company/repository when a replacement lease starts;
  it preserves completed records and does not touch new-attempt sessions.
  Focused regression, lint and API typecheck passed. API deployment
  `b46d7d00-1001-43a6-a58a-5359a85aa673` succeeded. The resumed generation-3
  task reached real signed validation but blocked on a generated TypeScript
  syntax error near `src/App.tsx:81`. Canonical Retry again preserved the
  same task/delivery and started generation 4. Live observation confirmed old
  session `03ac2ea3-7783-4681-b616-405a1f5ad809` now FAILED with
  WORKER_LEASE_EXPIRED; session `e4913394-27b8-4b58-8386-0ea6b96dd42c`
  retained TEST_FAILURE; only replacement
  `725ad2d9-5ecb-4c57-a810-403adfe03420` remained running.
- Generation 4 completed the same task with result
  `cc269c18-a751-46aa-9dc8-b43e7d66caa4`, real OpenAI `gpt-5.6-luna`
  usage ($0.998037 for this result), and validation report
  `defd718c-c870-4386-a61b-e79611124389`: lint, typecheck, seven project tests,
  and build PASS in network-isolated command execution. Its summary explicitly
  attributes stylesheet placement and the existing rendered-test pattern to
  repository guidance; retrieved memory count is five. Independent integration
  review is still required before declaring the memory task accepted.
- Successful signed dependency preparation
  `b0241118-08ad-48dc-89ae-850d373e5008` used the existing trusted device and
  registered root. ACK: `10:29:39.842Z`; start: `10:29:39.923Z`; native
  completion: `10:29:55.292Z`; duration: 15,398 ms; persisted heartbeat:
  `10:29:55.435Z`; claims: one; signed receipt present. This is successful
  heartbeat-bearing execution, but does not alone prove forced reconnect or
  a native-effect counter across a crash.
- A second API restart interrupted integration run
  `7bb3641a-d218-40df-9d27-756b82c90d2d` after a successful command receipt
  and persisted validation report, before independent review. Lease generation
  1 expired; Engineering showed BLOCKED / WORKER CRASHED and preserved the
  completed task. Canonical Retry resumed the same integration as generation 2.
  This was not a precisely injected receipt-to-conversation boundary crash.
  A bounded monitor attempted to observe an early running validation command
  before receipt persistence; no eligible timing window occurred, so it did
  not restart the API or claim a boundary-A pass.
- Repeated integration validation PASS did not bypass independent review.
  Review found unintended copy/navigation changes and weakened test coverage;
  the existing repair path automatically created task
  `40d83d7c-c432-4ac9-827a-5513cf2511ff` in the same objective. No manual
  portfolio source edit or merge was performed.
- Focused recovery regression rerun: seven files / 31 tests PASS, covering
  execution receipt settlement, PostgreSQL receipt atomicity, Agent OS orphan
  fencing, session selection, encrypted outbox replay and validation filtering.
  Final broad validation remains pending the live gates.
- Dispatch-boundary observation: safe signed `repository.file_read` request
  `0b727c4a-1ab9-48c9-8367-22b37552ae56` was persisted at
  `10:58:52.470Z` and observed PENDING without a receipt at `10:58:52.552Z`.
  The bounded monitor initiated a real Railway API restart. New API listening
  was observed at `10:58:56.905Z`, before the Mac ACK at `10:58:57.731Z`.
  The same request then SUCCEEDED with one claim and one signed receipt.
  This proves a queued signed operation survived restart and was not duplicated;
  it is not a crash during a native mutation or post-result conversation replay.
- The forced restart exposed a missing reconciliation branch: delivery
  INTEGRATING / integration REPAIRING / expired ACTIVE repair-task lease was
  excluded from both implementation and integration recovery scans. The narrow
  repair branch now blocks expired repair workers using the existing worker
  recovery warning and Retry path; live leases remain untouched. Focused
  delivery suite: 34 tests PASS; API typecheck and focused lint PASS;
  repository security and production configuration checks PASS; production
  migrations current through 0109 with no pending migration. Deployment/live
  recovery verification pending at that point. Deployment
  `2d7de172-a0e1-428a-811c-e387c34b72b2` subsequently SUCCESS; production
  reconciliation persisted BLOCKED at `11:03:49.554Z`. Reconnected Engineering
  showed WORKER CRASHED, the expired-task reason and canonical Retry. A duplicate
  UI click disabled Retry and Recover while the existing request was pending;
  this is UI duplicate-click protection, not a claim of two concurrent backend
  retry requests or completion of the full replay matrix.
- Canonical Retry resumed the same repair task with lease generation 3. Live
  Agent OS history preserved TEST_FAILURE, marked the interrupted delegation
  WORKER_LEASE_EXPIRED, and showed only the replacement delegation running.
- Its prior failed project-test report exposed weak retry diagnostics: the
  command banner `tests/*.test.mjs` was matched as `test.mjs`, hiding actual
  failing behavior from the next bounded context. The failure-summary parser
  now prefers Node's actual `test at tests/app.test.mjs:line:column` and three
  unique bounded failing test names; passing tests, assertion values and stack
  traces are not included. Focused worker suite: 20 tests PASS; API typecheck
  and focused lint PASS. Deployment held until the active attempt finishes.
- The active generation-3 repair eventually BLOCKED on a generated syntax
  error at `tests/app.test.mjs:118`; no failed source was merged. Preparing an
  **ephemeral acceptance-only crash probe**, disabled unless an exact task UUID
  is set in operator configuration. It SIGKILLs the API only after a successful,
  signature-verified `repository.file_read` receipt for that task has atomically
  committed. No mutating capability, new endpoint, trust override or approval
  bypass is enabled. The probe and operator variable MUST be removed before
  final validation/readiness. Focused execution/security/worker tests: 38 PASS;
  API typecheck/lint PASS; security/configuration/migrations revalidated.
- The temporary probe deployment was enabled for only repair task
  `40d83d7c-c432-4ac9-827a-5513cf2511ff`. A real signed read
  `566f713a-c2a3-4f4d-bb7e-b7180c72dd17` succeeded with one claim and
  receipt, but normal completion audit appeared and no post-receipt crash was
  observed. **Do not count boundary B as passed.** The probe variable was
  deleted, confirmed absent in Railway configuration, and the process-kill
  hook was removed from source. Clean deployment
  `875fc97f-db05-4397-8a8e-c26e9b47c268` is pending final status.
- Receipt replay now emits an explicit bounded governance audit event stating
  that the exact stored signed result was acknowledged without re-execution.
  Its focused execution test and security checks pass. The owner UI still
  needs an accepted candidate to finish the memory-usefulness gate. The same
  repair task completed on lease generation 4 after real validation; integration
  and independent review remained in progress at observation time.

1. Force-kill a live Objective and a live Engineering worker at selected lease,
   model, tool, and result handoff boundaries; verify no duplicate external
   effects and an actionable recovery path. Clean restart/history reload is not
   equivalent to this test.
2. Verify live receipt replay for repository index, validation, and
   native-provider publication recovery. Idempotent/transactional code is now
   deployed and covered by actual PostgreSQL concurrency/rollback tests; this
   is not yet forced live-crash proof for those tool consumers.
3. Verify the nonce retry change against a forced crash at the exact boundary,
   and address bounded request/result retention cases. The nonce binding and
   atomic request/receipt commit are covered by focused tests, but the nonce
   ledger and downstream publications are not one transaction.
4. Repeat the supported Objective and existing-project Engineering paths under
   a controlled failure/retry and reconnect scenario, including a demonstrated
   stable-memory retrieval influence. The provisional scores below treat the
   missing observations as open gates, not as passes.

## Strict re-audit snapshot (September 28)

The original independent overall score was 5.3/10. The following are current
**evidence-limited judgments**, not a certification or a computed product KPI.
Categories below 9 state why; an untested golden-path property is not scored
as if it passed. The clean broad suite and owner-reviewed merge are reflected
above. Revise this snapshot when forced effect-boundary tests change the evidence.

| Category | Current /10 | Principal limit below 9 |
| --- | ---: | --- |
| Core Architecture | 7.5 | Strong separation, but some recovery truth still spans stores. |
| Objectives | 7.5 | Two real research paths complete; source verification remains bounded. |
| Autonomous Execution | 7.0 | Real model/tool work proven; exact effect-boundary crashes unproven. |
| Agent OS | 7.0 | Real sessions and provenance; model/tool replay fence needs live proof. |
| Engineering Department | 7.0 | Restarted same run reached governed merge and healthy preview; tiny edit still costly and exact effect replay unproven. |
| AIRouter / Model Abstraction | 6.5 | Real routing proven; malformed output, timeout and fallback remain operational friction. |
| Capability / Tool System | 6.5 | Signed Mac/research receipts; not every consumer has live crash proof. |
| Memory / Knowledge | 5.0 | Scoped IDs reached sessions; semantic relevance and causal usefulness not proven. |
| Security | 7.0 | High-risk boundaries and focused tests; adversarial tenant/live checks incomplete. |
| Reliability | 6.0 | Live restart recovery improved; no soak or forced effect-boundary test. |
| Failure Recovery | 6.0 | Same-run retry proven; exact-once external effects not established. |
| Data Architecture | 7.0 | PostgreSQL scoped leases/fencing; some cross-store transactions remain. |
| Realtime / Observability | 6.0 | Truthful lease read model; reconnect/timeline completeness unproven. |
| Web UX | 6.0 | Actionable blockers improved; stale owner state and busy states still need soak. |
| Mobile Readiness | 4.5 | Contracts exist; disconnected mobile control not accepted live. |
| Cloud Readiness | 4.0 | Cloud engineering workers are Phase 28; current cloud API is not that capability. |
| Cost Efficiency | 6.0 | Usage recorded; tiny change already required escalation and repair. |
| Testing Quality | 7.0 | Strong focused/PostgreSQL coverage; live crash matrix incomplete. |
| Production Readiness | 6.5 | Dependency remediation released and suite green; live effect-boundary replay gates pending. |
| Extensibility | 7.0 | Shared contracts and bounded providers; architectural breadth adds integration risk. |

The arithmetic mean of these judgments is 6.35/10 (rounded **6.4/10**). This is
an estimated improvement from the prior 5.3/10, not evidence that Athena has
reached 9/10. Phase 28 should not start while memory usefulness and
effect-boundary replay gates remain
open. No unsupported claim is made that all changes are permanently safe or
every autonomous build will succeed.

## Final narrow acceptance update (September 29)

The signed-agent installation and secure-storage blocker remains closed. The
clean API deployment `875fc97f-db05-4397-8a8e-c26e9b47c268` succeeded and
the ephemeral receipt-crash operator variable and hook were removed. Do not
count the unsuccessful crash-probe attempt as a replay pass.

| Gate | Result | Evidence and remaining limit |
| --- | --- | --- |
| Long-running signed execution | PARTIAL | `repository.install_dependencies` request `b0241118-08ad-48dc-89ae-850d373e5008` completed on the trusted signed Mac Agent in 15.398 seconds with ACK, heartbeat, one claim, and a signed receipt. A separate 43.662-second `workspace.validate_profile` operation exercised heartbeats but failed safely on the legacy snapshot. A successful operation long enough to demonstrate reconnect and lease renewal throughout is not yet proven. |
| Forced crash/replay | PARTIAL | Queued signed `repository.file_read` request `0b727c4a-1ab9-48c9-8367-22b37552ae56` survived a real API restart and completed with one claim and receipt. The exact post-receipt/pre-publication crash probe did not fire; concurrent stale-RUNNING retry and exact native-effect deduplication at that boundary are not established live. PostgreSQL fencing and receipt tests pass, but tests are not a substitute for the forced boundary. |
| Controlled failure → Retry | PASS, bounded | A real repair-task lease expired on API restart, surfaced `WORKER_CRASHED` in Engineering, and Retry resumed the same task at a higher generation while preserving prior failure evidence. The new repair subsequently encountered independent code/validation failures; the retry path itself worked and did not create a new delivery. |
| Memory usefulness | PARTIAL | Context package `7743159f-6d8f-47c4-b46c-ae0ff674796f` attached five repository-scoped memory IDs to live task `5c32f1ca-ff92-4cf8-9d2f-f363c867c348`. One stored guidance item prescribed stylesheet placement and rendered-test conventions; the AI result explicitly cites that guidance. However, independent review rejected the candidate for unrelated content removal, so there is no accepted downstream change proving material usefulness. |
| UI reconnect | PASS for tested state | Safari reload reconstructed the same delivery, active worker, cost, task count, retry timeline, and later BLOCKED state from persisted records. It did not show a false COMPLETE or merge. |

The follow-up Engineering run `c1a29b93-6d01-46bb-86e0-922dc1a9e722`
remains **BLOCKED**, with integration run
`7bb3641a-d218-40df-9d27-756b82c90d2d` in `REPAIRING`, no candidate,
and no merge. Independent review twice found unauthorized removal of existing
portfolio content/tests. The third bounded repair task
`8c7f4f9c-d6f2-44e2-8e47-cb851d7066ec` then failed governed lint at
`src/App.tsx:114` after its three attempts. Do not retry automatically or
manually edit the generated candidate solely to manufacture an audit pass.

One final validation run on the current checkout completed: `pnpm lint` PASS,
`pnpm typecheck` PASS, `pnpm test` **1,114 passed / 2 skipped** across 192
passing files (two opt-in live integration files skipped), `pnpm build` PASS,
`pnpm security:check` PASS (repository security, production configuration,
production dependency audit with no known vulnerabilities), and
`git diff --check` PASS. Build emitted pre-existing runtime-config and chunk
size warnings; neither failed the build.

**Decision:** the current foundation can be used for bounded Phase 28 planning
or isolated development if the owner accepts these known risks, but it is not
audited READY for unattended trusted execution. The unresolved critical gates
are exact post-receipt crash/replay and concurrent stale retry, a successful
long-running signed operation spanning reconnect, and an independently
accepted memory-informed Engineering follow-up. The provisional 20-category
score remains **6.4/10**; broad green tests do not raise it by themselves.

The earlier independent audit supplied seven domain scores, not all twenty
category scores. They cannot be compared point-for-point with the new table.
The closest current proxies are shown only to orient the reader:

| Earlier domain | Earlier | Closest current category/proxy | Current |
| --- | ---: | --- | ---: |
| Overall | 5.3 | 20-category arithmetic mean | 6.4 |
| Architecture | 7.0 | Core Architecture | 7.5 |
| Runtime reality | 4.0 | Reliability | 6.0 |
| Security | 7.0 | Security | 7.0 |
| Autonomy | 3.5 | Autonomous Execution | 7.0 |
| Engineering implementation | 6.5 | Engineering Department | 7.0 |
| Engineering usability | 4.0 | Web UX | 6.0 |
| Mobile/remote | 4.5 | Mobile Readiness | 4.5 |

### Bounded follow-up evidence (September 29, later run)

The prior review-rejected Portfolio candidate was **not** merged. Two small
production fixes were deployed before a fresh modification: Engineering owner
Retry now preserves the exact validation failure in the next worker context and
accepts a recoverable test failure; the worker rejects a signed file-patch
receipt whose output hash equals its expected input hash. A concurrent exact
signed-receipt commit is re-read and acknowledged rather than returning a
conflicting retry. Focused regressions for these paths passed (63 tests).

The independent reviewer was also given a narrower decision rubric: concrete
regressions, unsafe content, and unmet acceptance criteria still require
changes, while missing browser-wide or unrelated security-wide evidence is
reported as a limit, not invented as a passing check or made a hard requirement
for a bounded text edit. Test-repair guidance now requires preservation of
baseline assertions and setup/cleanup. Its 22 focused reviewer/worker tests,
API typecheck, targeted lint, and API build passed. Railway deployment
`66a7eb33-5cb5-49bf-b65e-6ba9c9275569` succeeded.

The fresh owner-UI Modify Project delivery
`0c533600-1627-47a2-9a07-66bec0de0732` selected the existing Portfolio
Acceptance repository and the same persistent project session. It requested
only the Hero supporting sentence, preservation of all existing content/tests,
and a reviewed unmerged candidate. A transient trusted-device outage caused
two signed `repository.git_status` requests to be cancelled and the same
delivery to become actionable `BLOCKED · DEVICE OFFLINE`. After the registered
Mac Agent returned, owner Retry resumed the **same** delivery and preserved
the completed tasks. Signed `repository.install_dependencies` request
`336edd0b-95eb-4616-ac60-08da54e155d4` ran on trusted device
`a9b70309-11ac-457c-a5ad-c044204fbf8a`: claimed at 14:36:04Z, completed
at 14:36:24Z, device-reported duration 20.141 seconds, one attempt, heartbeat,
one stored signed result, and `SUCCEEDED`. This is a real long-running signed
operation, but it did not span a forced mid-operation reconnect; that specific
subcondition remains unproven.

The same delivery progressed automatically to 4/4 tasks and integration run
`760ac8c0-948b-42ab-b7f5-4e2478e96a5a`. Its combined lint, typecheck,
tests, and build passed. Independent review
`1461d803-3e1b-4824-a76d-d93fe948236e` returned `PASS_WITH_WARNINGS` with
all stated acceptance criteria satisfied and no repair cycles. Candidate
`dc5f60c8-7daf-4003-81b5-3f6645733a4f` is `READY`; the only changed path
is `src/App.tsx`. The candidate has **not** been merged. The review warnings
include an inconsistent task summary and lack of unrelated broad-scope scans;
the latter are explicitly evidence limits, not asserted successes. Safari
reload reconstructed `DONE`, `PREVIEW RUNNING`, and `REVIEW PASS WITH WARNINGS`
from persisted state.

For memory, an Agent OS context package for this objective contained seven
scoped memory refs, including repository memory
`f5fe222c-aa4f-434f-b487-548176946098` about stylesheet and rendered-test
conventions. The accepted implementation task said it used repository guidance
to keep an additive Hero-only change and preserve baseline tests. Because the
owner instruction and direct code inspection also carried those constraints,
this is credible use but **not** an isolated demonstration that memory
materially changed the outcome. Memory usefulness remains PARTIAL.

A separate immutable Validation-tab plan for registered `personalassistant`
failed before TypeScript executed: its legacy Mac runner searched only fixed
Homebrew pnpm paths, whereas this Mac's pnpm is under NVM. Its isolated copy
also omits dependencies. The 6 ms `exitCode: -1` is an environment/command
discovery failure, **not** a TypeScript failure. Engineering's signed
dependency-prepared validation succeeded and was used for this acceptance.
The legacy Validation-tab path remains a noncritical product limitation to
repair separately; do not count its result as a failed source typecheck.

Final repository validation after the runtime fixes: `pnpm lint` PASS,
`pnpm typecheck` PASS, `pnpm test` **1,116 passed / 2 skipped** across 192 passing
files, `pnpm build` PASS, `pnpm security:check` PASS with no known production
dependency vulnerabilities, and `git diff --check` PASS. After the final
review-guidance edit, focused 22 tests, API typecheck, targeted lint, API
build, and diff check passed; the full suite was not repeated.

**Readiness update:** bounded existing-project execution and offline-device
Retry are now demonstrated end to end. Exact post-receipt/pre-publication
forced crash replay, concurrent stale-RUNNING retry under a real process
restart, and isolated material memory usefulness remain unverified. The
previous provisional 6.4/10 score should not be promoted to 9/10 on this
evidence. Phase 28 planning or isolated implementation can proceed with these
explicit residual risks; an unconditional unattended-execution foundation GO
has not been earned.

### Final owner-session dependency and memory safety (September 29)

The exact post-receipt/pre-publication crash acceptance was prepared against
the read-only `repository.scan_metadata` path, but Athena Control was signed
out in Safari. The owner-authenticated scan could not be initiated. The
temporary fault-injection hook was **removed before deployment**, and no
fault-injection variable was set. Do not count this gate as passed. The prior
receipt replay and concurrent-retry focused tests remain green (18 targeted
execution/security tests in this pass), but the live crash boundary remains
unverified.

During memory-usefulness inspection, one historical owner memory was found to
contain credential-like text. Its value is intentionally not reproduced here.
The current explicit-teaching path already denied this category, but the
older generic memory-write path did not. The generic write and decision paths
now deny credential-like content, promotion skips it, and both Engineering
retrieval and the general AI context source omit legacy sensitive memories.
The existing record was not silently deleted or rewritten. Focused memory and
context tests passed (13 tests, then 6 after the final decision-path guard),
as did API typecheck, targeted lint, and `git diff --check`. This closes the
identified prompt-injection path for that record; it does not prove isolated
material usefulness of project memory or a system-wide historical-secret
purge. Owner review of the legacy record remains appropriate.

Railway deployment `55129413-afd2-4abc-a16d-a41a0a3fa4c8` reached
`SUCCESS`; the proxied public runtime-health response reported API,
PostgreSQL, Redis, AIRouter, and scheduler healthy. The crash-probe environment
variable was confirmed absent. The direct service domain did not answer a
local curl within 15 seconds while the frontend proxy did; this is recorded as
a reachability observation, not a runtime acceptance pass.

The final guard also checks memory tags and evidence fields. Its focused 11
memory tests, API typecheck, targeted lint, API build, and diff check passed.
Deployment `1e116867-ed88-456d-bff5-eab9a9abe19b` reached `SUCCESS` and the
proxied runtime-health response again reported the API, PostgreSQL, Redis,
AIRouter, and scheduler healthy. Safari remained on Athena's owner sign-in
page, so the live crash and causal-memory acceptance checks were not run.

The Human Understanding hybrid memory-retrieval path was then checked and
found to bypass those context filters for legacy sensitive records. It now
applies the same guard before ranking/returning memories. A focused retrieval
regression plus memory tests passed (12 total); API typecheck and targeted lint
passed. This is a fail-closed omission, not deletion of the owner's record.
