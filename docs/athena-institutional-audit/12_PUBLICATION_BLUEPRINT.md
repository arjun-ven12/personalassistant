# Institutional publication blueprints

> Audit date: 2026-10-26 · CONFIDENTIAL INTERNAL · Review draft v0.1
> Evidence scope: current workspace, including pre-existing uncommitted changes.
> Current implementation, test evidence, and proposed institutional design are distinguished below.

## Publication system rules

These are publication blueprints and substantive content plans, not completed externally approved publications. The confidential audit is their technical source; every public sentence about capability must retain a register claim ID and accepted evidence scope in its editorial source. Mission statements may be aspirational when labeled. No publication may invent staffing, legal status, clients, benchmarks, deployment or research results.

Each chapter should explain purpose, mechanism, interaction, evidence and limits, followed by a realistic scenario where useful. Publish architecture at the audience's allowed detail. Internal source paths and threat details require a separate release decision before public distribution.

## 01. Athena Institutional Prospectus

**Audience:** Prospective collaborators, research contributors, prospective partners and recruits.

**Disclosure:** PUBLIC release derived from confidential reviewed sources.

**Editorial purpose / proposed opening:** Tell an ambitious but testable institutional story: durable delegated intelligence with human accountability.

**Primary source material:** 00_EXECUTIVE_FINDINGS.md; 01_SYSTEM_ARCHITECTURE.md; 02_CAPABILITY_REGISTER.json; 08_ORGANIZATIONAL_DIVISIONS.md.

### Detailed contents and section plan

1. **Purpose and promise.** Explain why continuity, delegation and accountable authority matter; distinguish the proposed mission from current legal/operational status.
2. **What Athena is today.** Describe the actual owner-operated platform and its interfaces; show implemented foundations and the limits of accepted evidence.
3. **How delegated intelligence works.** Walk a realistic engineering/research objective through scoped agents, context, budgets, finite tools, review and verification.
4. **Institutional divisions.** Present proposed mandates and cross-division handoffs without claiming staffed labs or existing clients.
5. **Research and development agenda.** Separate near-term acceptance work from exploratory machine-intelligence and quantum directions; publish no unmeasured superiority claim.
6. **Trust and participation.** Explain human oversight, selective disclosure, contribution routes and the boundaries that collaborators accept.
7. **Roadmap and evidence note.** Tie milestones to specific acceptance receipts and versioned capability claims; disclose what remains unknown.

**Required diagrams:** Public architecture abstraction; objective lifecycle; proposed division map.

**Tables and figures:** Capability/maturity matrix; current-versus-proposed table; contribution pathways.

**Evidence needed:** cited source symbols/hashes, relevant current test outcomes, exact acceptance scope and limitations. Where the chapter describes a future system, cite the approved design and mark implementation absent. Additional live/device/provider/research evidence must be collected under separate authorization before changing those claims.

**Founder input:** Approved mission/name/legal description; target audiences; first product promise; publication scope; approved founder narrative.

**Versioning and review:** start at `0.1-draft`; semantic major version for changed mandate/authority/API guarantees, minor for reviewed substantive additions, patch for editorial corrections. Required reviewers: Founder + security/data steward + technical claims reviewer. Review before every release and when mapped source/evidence/policy changes; retire or mark stale any contradicted claim. A new version remains a draft until its own approval manifest is accepted; prior approval does not cover new material.

## 02. Agent OS Technical Reference

**Audience:** Runtime engineers, adapter authors, technical evaluators and approved contributors.

**Disclosure:** INTERNAL; selected sanitized chapters may be PUBLIC.

**Editorial purpose / proposed opening:** Define the contracts that let intelligence be delegated without transferring authority.

**Primary source material:** 01_SYSTEM_ARCHITECTURE.md; 03_AGENT_WORKFORCE.md; evidence/agent-catalog.json; shared contracts.

### Detailed contents and section plan

1. **Terminology and identity.** Define agent definition, catalog, assignment, manifest, package, manager, session and provider; use exact source identifiers.
2. **Lifecycle and state machines.** Specify dormant/active/revoked assignment behavior and session start/completion/failure; distinguish coordination-only session APIs.
3. **Delegation and scheduling.** Document task decomposition, dependency readiness, concurrency, lease generation, fencing, idempotency and recovery.
4. **Context and memory.** Define allowed context sources, budgets, dependency artifacts, isolated scopes, retention and stable fact promotion.
5. **Inference and resource policy.** Explain registered model roles, health/privacy filters, reservation/settlement and model escalation without permission expansion.
6. **Capabilities and authority.** Trace finite proposals to governance/provider execution, exact approval and signed device results; specify denial behavior.
7. **Collaboration, review and audit.** Specify immutable messages, shared context, consensus, reviewer independence, provenance and safe metrics.
8. **API and conformance.** Link exact shared schema symbols and route versions; provide sanitized fixtures, compatibility rules and failure examples.

**Required diagrams:** Definition-assignment-session relationship; scheduling/recovery state graph; context trust boundary; signed execution sequence.

**Tables and figures:** Schema field dictionary; error codes; capability mapping; lifecycle transitions; conformance cases.

**Evidence needed:** cited source symbols/hashes, relevant current test outcomes, exact acceptance scope and limitations. Where the chapter describes a future system, cite the approved design and mark implementation absent. Additional live/device/provider/research evidence must be collected under separate authorization before changing those claims.

**Founder input:** Supported compatibility promises; first accepted workload; performance/cost objectives after baseline.

**Versioning and review:** start at `0.1-draft`; semantic major version for changed mandate/authority/API guarantees, minor for reviewed substantive additions, patch for editorial corrections. Required reviewers: Core maintainer + Security + independent runtime reviewer. Review before every release and when mapped source/evidence/policy changes; retire or mark stale any contradicted claim. A new version remains a draft until its own approval manifest is accepted; prior approval does not cover new material.

## 03. Product and Engineering Division Handbook

**Audience:** Engineers, designers, QA, SRE, product leads and engineering agents.

**Disclosure:** INTERNAL; client project annexes CONFIDENTIAL.

**Editorial purpose / proposed opening:** Make useful software with inspectable evidence from brief through handover.

**Primary source material:** 04_ENGINEERING_INFRASTRUCTURE.md; engineering domain services; CI; validation profiles.

### Detailed contents and section plan

1. **Mandate and product scope.** Define target users, product boundaries, human acceptance and supported interfaces; expose current unknowns.
2. **Repository and build orientation.** Describe pnpm graph, strict TypeScript, shared Zod contracts, entry points and separate Android/macOS toolchains.
3. **Objective intake and task design.** Translate briefs into acceptance criteria, bounded DAGs and independent review; show when to clarify.
4. **Implementation and integration.** Explain registered repositories/assignments, worktrees, expected hashes, dependency artifacts, conflicts and candidate repair.
5. **Quality and security gates.** Specify tests, registered command profiles, isolation, denial cases, accessibility and documentation impact review.
6. **Delivery and operations.** Describe local preview, guarded local merge, recovery and handover; distinguish publication/deployment prerequisites.
7. **Contribution and stewardship.** Define maintainers, review ownership, dependency changes, incident escalation and retention of recoverable work.

**Required diagrams:** Engineering delivery sequence; worktree/integration graph; build/deploy boundary.

**Tables and figures:** Toolchain matrix; acceptance checklist; command-profile registry; recovery decision table.

**Evidence needed:** cited source symbols/hashes, relevant current test outcomes, exact acceptance scope and limitations. Where the chapter describes a future system, cite the approved design and mark implementation absent. Additional live/device/provider/research evidence must be collected under separate authorization before changing those claims.

**Founder input:** Product priorities; merge/release authorities; quality targets; supported platforms and availability commitments.

**Versioning and review:** start at `0.1-draft`; semantic major version for changed mandate/authority/API guarantees, minor for reviewed substantive additions, patch for editorial corrections. Required reviewers: Product lead + technical maintainer + QA + Security. Review before every release and when mapped source/evidence/policy changes; retire or mark stale any contradicted claim. A new version remains a draft until its own approval manifest is accepted; prior approval does not cover new material.

## 04. Machine Intelligence Research Charter

**Audience:** Researchers, evaluation engineers, advisors and approved research collaborators.

**Disclosure:** PUBLIC charter; protocols/data annexes INTERNAL or CONFIDENTIAL.

**Editorial purpose / proposed opening:** Study intelligence through reproducible task evidence and explicit uncertainty.

**Primary source material:** 05_INTELLIGENCE_AND_MEMORY.md; 10_RESEARCH_LABS.md; ai/benchmark; corpus/learning/reflection services.

### Detailed contents and section plan

1. **Scientific mission and non-claims.** State research questions; separate existing infrastructure from unperformed training and experiments.
2. **Programs and hypotheses.** Describe deterministic-first safety, context/retrieval, routing economics, delegation and reversible adaptation programs.
3. **Data governance.** Specify rights, consent, classification, secret exclusion, tenant scope and train/test contamination prevention.
4. **Methods and evaluation.** Require preregistration, baselines, held-out tasks, evaluator independence, repeated trials and uncertainty reporting.
5. **Infrastructure and reproducibility.** Version code/model/config/data hashes and compute approvals; define artifact manifests and replication procedures.
6. **Promotion and safety.** Describe advisory proposals, shadow/canary acceptance, human approvals, regression checks and rollback.
7. **Publication and collaboration.** Report limitations/negative results, disclose model assistance and define contributor/replication pathways.

**Required diagrams:** Experiment lifecycle; data-to-context trust flow; evaluation/promotion gates.

**Tables and figures:** Experiment record; dataset rights matrix; metric definitions; replication manifest.

**Evidence needed:** cited source symbols/hashes, relevant current test outcomes, exact acceptance scope and limitations. Where the chapter describes a future system, cite the approved design and mark implementation absent. Additional live/device/provider/research evidence must be collected under separate authorization before changing those claims.

**Founder input:** Chosen research hypotheses; AthenaCoder meaning; data rights; compute budget; scientific leadership.

**Versioning and review:** start at `0.1-draft`; semantic major version for changed mandate/authority/API guarantees, minor for reviewed substantive additions, patch for editorial corrections. Required reviewers: Research lead + Data steward + independent methods reviewer + Security. Review before every release and when mapped source/evidence/policy changes; retire or mark stale any contradicted claim. A new version remains a draft until its own approval manifest is accepted; prior approval does not cover new material.

## 05. Quantum Systems Research Charter

**Audience:** Scientific advisors, potential researchers and technical collaborators.

**Disclosure:** PUBLIC feasibility charter; experiment plans INTERNAL.

**Editorial purpose / proposed opening:** Pursue focused frontier questions with mathematical discipline and no unsupported claim of advantage.

**Primary source material:** 10_RESEARCH_LABS.md; negative repository search evidence in 14_EVIDENCE_AND_GAPS.md.

### Detailed contents and section plan

1. **Scope and current status.** State that no dedicated implementation/results were established; articulate a proposed exploratory mandate.
2. **Question selection.** Define criteria for novelty, relevance, feasibility and expertise; require literature and classical baseline.
3. **Literature and replication.** Plan primary-source review, exact mathematical assumptions and small reproducible simulations.
4. **Compute and resource estimates.** Specify approved simulator/hardware account prerequisites and explicit resource limits; no hypothetical hardware partnership.
5. **Experimental method.** Define hypothesis, correctness checks, uncertainty, error sources, reproducibility and independent replication.
6. **Governance and interfaces.** Use reviewed finite compute adapters, data rights and separate spend/security approval; no privileged lab executor.
7. **Stage gates and publication.** Allow stopping after negative feasibility results; publish only evidence-backed methods/results and limitations.

**Required diagrams:** Feasibility stage gates; optional future simulator/provider boundary.

**Tables and figures:** Problem selection rubric; resource assumptions; replication checklist; explicit non-claims.

**Evidence needed:** cited source symbols/hashes, relevant current test outcomes, exact acceptance scope and limitations. Where the chapter describes a future system, cite the approved design and mark implementation absent. Additional live/device/provider/research evidence must be collected under separate authorization before changing those claims.

**Founder input:** Scientific focus; qualified advisor; research budget; acceptable stop criteria; publication/IP expectations.

**Versioning and review:** start at `0.1-draft`; semantic major version for changed mandate/authority/API guarantees, minor for reviewed substantive additions, patch for editorial corrections. Required reviewers: Qualified quantum lead + independent scientific reviewer + Governance. Review before every release and when mapped source/evidence/policy changes; retire or mark stale any contradicted claim. A new version remains a draft until its own approval manifest is accepted; prior approval does not cover new material.

## 06. Brand, Marketing and Community Handbook

**Audience:** Creative contributors, marketers, editors and community stewards.

**Disclosure:** INTERNAL; approved brand/contributor extracts PUBLIC.

**Editorial purpose / proposed opening:** Communicate Athena with craft, generosity and claims that can withstand scrutiny.

**Primary source material:** 06_TOOL_AND_INTEGRATION_ECOSYSTEM.md; 08_ORGANIZATIONAL_DIVISIONS.md; launch-workflow contracts.

### Detailed contents and section plan

1. **Institutional voice and brand purpose.** Define proposed voice, terminology and honest ambition; distinguish policy-approved rules from suggestions.
2. **Evidence-led messaging.** Tie every product/research claim to register ID, acceptance scope and approved disclosure; prohibit invented outcomes/clients.
3. **Creative system and rights.** Plan asset briefs, design tokens, accessibility, licensing/provenance and versioned asset review.
4. **Campaign development.** Describe research-to-brand-to-marketing-to-social review packages, content hashes and edit invalidation.
5. **Publication and spending.** Require separate finite provider, trusted account, exact approval and independent terminal verification; current social effect path is blocked.
6. **Community contribution.** Define onboarding, mentorship, feedback/moderation and partnership proposal handling with selective access.
7. **Measurement and iteration.** Use authorized metric lineage and approved experiment interpretation; distinguish reach/conversion observations from causal claims.

**Required diagrams:** Launch review stages; factual-claim approval; publication trust boundary.

**Tables and figures:** Voice/style examples; asset-rights ledger; channel plan; claim checklist; analytics definitions.

**Evidence needed:** cited source symbols/hashes, relevant current test outcomes, exact acceptance scope and limitations. Where the chapter describes a future system, cite the approved design and mark implementation absent. Additional live/device/provider/research evidence must be collected under separate authorization before changing those claims.

**Founder input:** Approved positioning/voice; audiences; visual identity; channel priorities; partnership terms; human publication authority.

**Versioning and review:** start at `0.1-draft`; semantic major version for changed mandate/authority/API guarantees, minor for reviewed substantive additions, patch for editorial corrections. Required reviewers: Creative lead + Marketing + Community + factual/security reviewer. Review before every release and when mapped source/evidence/policy changes; retire or mark stale any contradicted claim. A new version remains a draft until its own approval manifest is accepted; prior approval does not cover new material.

## 07. Client Solutions Handbook

**Audience:** Solutions architects, delivery leads and approved client-project collaborators.

**Disclosure:** CONFIDENTIAL; sanitized service overview PUBLIC.

**Editorial purpose / proposed opening:** Solve a bounded client problem with clear commitments and verifiable delivery.

**Primary source material:** 04_ENGINEERING_INFRASTRUCTURE.md; 06_TOOL_AND_INTEGRATION_ECOSYSTEM.md; company-data/companies/objectives.

### Detailed contents and section plan

1. **Service scope and truth in commitments.** State currently accepted capabilities and exclusions; do not imply clients, contracts or service levels exist.
2. **Discovery and qualification.** Specify problem definition, stakeholders, risks, success criteria and capability gap disclosure.
3. **Tenant and data design.** Map company/project scope, data classes, rights, repository/tool binding and allowed model locality.
4. **Solution and acceptance plan.** Design finite workflows, integration prerequisites, approvals, evidence and independent outcome checks.
5. **Delivery and collaboration.** Describe scoped work, human review, progress reporting, blockers and change control.
6. **Handover and support.** Provide tested runbooks, accepted artifacts, monitoring/recovery boundaries and agreed support scope.
7. **Exit and knowledge retention.** Revoke access, reconcile pending effects and preserve required evidence; prohibit automatic client-data reuse.

**Required diagrams:** Client/project trust boundaries; delivery/acceptance lifecycle; offboarding sequence.

**Tables and figures:** Capability fit/gap matrix; data-flow register; acceptance criteria; handover evidence.

**Evidence needed:** cited source symbols/hashes, relevant current test outcomes, exact acceptance scope and limitations. Where the chapter describes a future system, cite the approved design and mark implementation absent. Additional live/device/provider/research evidence must be collected under separate authorization before changing those claims.

**Founder input:** Target market; supported service offering; legal/contractual review; pricing; retention/support commitments.

**Versioning and review:** start at `0.1-draft`; semantic major version for changed mandate/authority/API guarantees, minor for reviewed substantive additions, patch for editorial corrections. Required reviewers: Solutions lead + client sponsor where established + Security + Governance. Review before every release and when mapped source/evidence/policy changes; retire or mark stale any contradicted claim. A new version remains a draft until its own approval manifest is accepted; prior approval does not cover new material.

## 08. Organization Governance Constitution

**Audience:** Founder, future human leadership, stewards and governance reviewers.

**Disclosure:** INTERNAL draft; approved constitutional extract PUBLIC.

**Editorial purpose / proposed opening:** Make authority explicit, limited and accountable.

**Primary source material:** 07_SECURITY_AND_GOVERNANCE.md; 08_ORGANIZATIONAL_DIVISIONS.md; 09_HUMAN_ROLES_AND_COLLABORATION.md; 11_ORGANIZATION_CONTROL_APP.md.

### Detailed contents and section plan

1. **Purpose, status and principles.** State proposed mission and founder-established legal context; define deny-default and human accountability.
2. **Institutional units and mandates.** Define divisions/projects/teams and appointment/review pathways; no authority by title alone.
3. **Human and agent decision rights.** Specify sponsors, approvers, reviewers and operators; agents propose and never self-authorize.
4. **Policy, approvals and exceptions.** Define canonical action binding, recent authentication, independence, expiry and non-waivable prohibitions.
5. **Information and collaboration.** Set classification/clearance, purpose limitation, collaborator invitations and time-limited access.
6. **Audit and dispute resolution.** Require bounded evidence, reviewable reasons, conflicts of interest and human appeal/escalation.
7. **Emergency powers and recovery.** Retain stop/revocation, reconciliation and reviewed restoration; no arbitrary administrator executor.
8. **Amendment and review.** Version policy, require documented impact/approval and preserve superseded decisions.

**Required diagrams:** Decision-rights flow; authority versus advisory boundary; emergency lifecycle.

**Tables and figures:** Reserved human decisions; non-waivable constraints; review calendar; amendment ledger.

**Evidence needed:** cited source symbols/hashes, relevant current test outcomes, exact acceptance scope and limitations. Where the chapter describes a future system, cite the approved design and mark implementation absent. Additional live/device/provider/research evidence must be collected under separate authorization before changing those claims.

**Founder input:** Legal form/status; accountable human roles; delegated authority ceilings; conflicts/appeals; amendment authority.

**Versioning and review:** start at `0.1-draft`; semantic major version for changed mandate/authority/API guarantees, minor for reviewed substantive additions, patch for editorial corrections. Required reviewers: Founder + Governance + Security + qualified legal input where needed. Review before every release and when mapped source/evidence/policy changes; retire or mark stale any contradicted claim. A new version remains a draft until its own approval manifest is accepted; prior approval does not cover new material.

## 09. Security and Selective Disclosure Standard

**Audience:** Developers, stewards, incident responders and publication reviewers.

**Disclosure:** INTERNAL; threat/incident annexes RESTRICTED.

**Editorial purpose / proposed opening:** Protect people and confidential work by enforcing boundaries before information moves.

**Primary source material:** 07_SECURITY_AND_GOVERNANCE.md; 11_ORGANIZATION_CONTROL_APP.md; identity/governance/security-state and deployment configuration.

### Detailed contents and section plan

1. **Threat model and trust boundaries.** Define untrusted input, device/model/provider/cloud boundaries and current assurance gaps.
2. **Identity and transport.** Describe sessions, device keys, signing/replay, origin/CSRF, private/cloud network profiles and step-up.
3. **Authority and effects.** Specify finite registries, default deny, exact approvals, verification and emergency stop across paths.
4. **Data classification and context.** Define classes, compartments, purpose/locality, memory/prompt/log exclusions and authorization before retrieval.
5. **Disclosure and publication.** Require reviewed release manifests, redaction checks, rights/provenance and separate public artifacts.
6. **Access lifecycle and external ACLs.** Specify expiry, reviews, offboarding, revocation epochs and provider reconciliation proposals.
7. **Operational evidence and incidents.** Define security gates, backup/restore acceptance, bounded logs, containment and residual-effect reporting.

**Required diagrams:** Data-flow trust map; signed request/result sequence; selective-disclosure flow; revoke/reconcile graph.

**Tables and figures:** Control-evidence matrix; allowed/forbidden data; threat/mitigation tests; incident evidence checklist.

**Evidence needed:** cited source symbols/hashes, relevant current test outcomes, exact acceptance scope and limitations. Where the chapter describes a future system, cite the approved design and mark implementation absent. Additional live/device/provider/research evidence must be collected under separate authorization before changing those claims.

**Founder input:** Risk ownership; security reviewer; disclosure audience; incident authority; operational retention and recovery requirements.

**Versioning and review:** start at `0.1-draft`; semantic major version for changed mandate/authority/API guarantees, minor for reviewed substantive additions, patch for editorial corrections. Required reviewers: Security lead + Data steward + infrastructure maintainer. Review before every release and when mapped source/evidence/policy changes; retire or mark stale any contradicted claim. A new version remains a draft until its own approval manifest is accepted; prior approval does not cover new material.

## 10. Contributor and Research Collaboration Manual

**Audience:** Prospective engineers, researchers, creative contributors and mentors.

**Disclosure:** PUBLIC guide with INTERNAL access annex.

**Editorial purpose / proposed opening:** Make the first useful contribution clear, bounded and safe.

**Primary source material:** 09_HUMAN_ROLES_AND_COLLABORATION.md; 10_RESEARCH_LABS.md; 04_ENGINEERING_INFRASTRUCTURE.md.

### Detailed contents and section plan

1. **Orientation and ways to contribute.** Explain current platform, proposed institutions and available engineering/research/creative pathways.
2. **Scope and onboarding.** Define sponsor, expertise, project brief, rights/confidentiality and time-limited access; no default full-repo grant.
3. **Working environment.** Provide pinned builds and safe fixture tests; identify Mac/Android/provider requirements without credentials.
4. **Engineering contribution.** Show issue/criteria, shared schema, patch/check/review and documentation-impact expectations.
5. **Research contribution.** Require hypothesis, literature/data rights, reproducibility and independent review; accept negative results.
6. **Communication and conduct.** Describe evidence-linked handoffs, disagreement, human escalation and sensitive-data reporting.
7. **Completion and offboarding.** Handover artifacts, revoke grants, retain audit and document unresolved limitations.

**Required diagrams:** Contribution pathways; sponsor/reviewer handoff; onboarding/offboarding sequence.

**Tables and figures:** Prerequisite matrix; definition of done; evidence examples; safe test commands.

**Evidence needed:** cited source symbols/hashes, relevant current test outcomes, exact acceptance scope and limitations. Where the chapter describes a future system, cite the approved design and mark implementation absent. Additional live/device/provider/research evidence must be collected under separate authorization before changing those claims.

**Founder input:** Contribution rights/license; community expectations; mentoring capacity; invitation/acceptance authority.

**Versioning and review:** start at `0.1-draft`; semantic major version for changed mandate/authority/API guarantees, minor for reviewed substantive additions, patch for editorial corrections. Required reviewers: Community steward + Engineering/Research lead + Security. Review before every release and when mapped source/evidence/policy changes; retire or mark stale any contradicted claim. A new version remains a draft until its own approval manifest is accepted; prior approval does not cover new material.

## 11. Capability and Evidence Register

**Audience:** Maintainers, technical reviewers, institutional editors and selective-disclosure stewards.

**Disclosure:** CONFIDENTIAL canonical register; filtered approved PUBLIC projection.

**Editorial purpose / proposed opening:** Make every consequential capability claim traceable to a source and an acceptance boundary.

**Primary source material:** 02_CAPABILITY_REGISTER.json; evidence/*.json; 14_EVIDENCE_AND_GAPS.md.

### Detailed contents and section plan

1. **Schema and status semantics.** Define stable capability IDs, owners, environments, evidence types and UNKNOWN; local pass is not live verification.
2. **System capability catalog.** Group significant subsystems and finite operation indexes without treating declarations as dispatch.
3. **Evidence and reproducibility.** Attach path/symbol/hash, tests/config provenance, acceptance date, exclusions and safe artifact references.
4. **Dependencies and governance.** Record exact provider/binding/permission prerequisites and inherited scope; explain denied/partial states.
5. **Gaps and conflicts.** Capture missing implementation, stale historical claims, unknown deployed state and contradictory evidence.
6. **Change impact and review.** Map source changes to claims/publications; flag review instead of silently rewriting approved prose.
7. **Disclosure and release projections.** Create explicit reviewed public subset with retained claim IDs and version/expiry information.

**Required diagrams:** Claim-to-evidence graph; maturity and approval state machines; impact-detection pipeline.

**Tables and figures:** Capability matrix; finite operation list; test coverage/exclusions; review backlog.

**Evidence needed:** cited source symbols/hashes, relevant current test outcomes, exact acceptance scope and limitations. Where the chapter describes a future system, cite the approved design and mark implementation absent. Additional live/device/provider/research evidence must be collected under separate authorization before changing those claims.

**Founder input:** Approved verification standard; accountable owners; public claim subset; evidence freshness thresholds.

**Versioning and review:** start at `0.1-draft`; semantic major version for changed mandate/authority/API guarantees, minor for reviewed substantive additions, patch for editorial corrections. Required reviewers: Technical documentation steward + subsystem maintainer + Security. Review before every release and when mapped source/evidence/policy changes; retire or mark stale any contradicted claim. A new version remains a draft until its own approval manifest is accepted; prior approval does not cover new material.

## 12. Founder Operating Manual

**Audience:** Founder/accountable owner and explicitly appointed delegates.

**Disclosure:** RESTRICTED.

**Editorial purpose / proposed opening:** Concentrate human judgment where it matters: purpose, authority, evidence and irreversible commitments.

**Primary source material:** 00_EXECUTIVE_FINDINGS.md; 09_HUMAN_ROLES_AND_COLLABORATION.md; 11_ORGANIZATION_CONTROL_APP.md; 15_RECOMMENDED_PRIORITIES.md.

### Detailed contents and section plan

1. **Institutional compass.** State mission, legal status decisions, strategic constraints and first useful workflow.
2. **Reading the operating picture.** Explain objectives, task progress versus outcomes, budgets, provider health, pending approvals and evidence gaps.
3. **Daily decision practice.** Triage blockers/clarifications and high-risk decisions; review exact scope, impact and recent-auth requirements.
4. **Delegation and organizational design.** Appoint human sponsors, grant bounded projects, set resource ceilings and require independent review.
5. **Weekly/monthly governance.** Review accepted results, recovery effort, access expiry, publication claims, research/data rights and financial commitments.
6. **Incident and emergency decisions.** Use stop/revocation, preserve evidence, reconcile external effects and authorize restoration only after reviewed state.
7. **Growth and publication decisions.** Choose evidence-backed milestones, collaborator/client readiness and reviewed public claims; track unresolved assumptions.
8. **Succession and operating continuity.** Design explicit delegate authority and recovery arrangements without sharing credentials or bypassing recent authentication.

**Required diagrams:** Founder decision loop; approval/revocation escalation; portfolio-to-project drilldown.

**Tables and figures:** Decision log template; review cadence; authority ceiling; priorities/acceptance evidence.

**Evidence needed:** cited source symbols/hashes, relevant current test outcomes, exact acceptance scope and limitations. Where the chapter describes a future system, cite the approved design and mark implementation absent. Additional live/device/provider/research evidence must be collected under separate authorization before changing those claims.

**Founder input:** Mission/legal status; decision delegates; risk appetite; budget/resources; release/publication authority; continuity plan.

**Versioning and review:** start at `0.1-draft`; semantic major version for changed mandate/authority/API guarantees, minor for reviewed substantive additions, patch for editorial corrections. Required reviewers: Founder + Governance + Security; named delegate review only. Review before every release and when mapped source/evidence/policy changes; retire or mark stale any contradicted claim. A new version remains a draft until its own approval manifest is accepted; prior approval does not cover new material.

## Shared editorial acceptance

Every release has document ID, source commit plus workspace/evidence manifest, authoring steward, reviewer identities/roles, approval date, disclosure class, exact claim subset, artifact hashes and review triggers. Separate public and internal artifacts; do not rely on a public renderer hiding internal paragraphs. Diagrams and table captions must distinguish current from proposed systems. Block release on unresolved material contradictions, missing consent/rights, secret leakage or unsupported verified claims.

The full prospectus should be written after the founder chooses the mission, institutional status and first accepted workflow. Technical references can progress now using this audit. Research charters may describe disciplined programs without claiming results; recruiting material must describe actual available roles and human support.
