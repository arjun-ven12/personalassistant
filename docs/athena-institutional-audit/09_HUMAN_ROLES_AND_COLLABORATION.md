# Human roles, collaboration and decision rights

> Audit date: 2026-10-26 · CONFIDENTIAL INTERNAL · Review draft v0.1
> Evidence scope: current workspace, including pre-existing uncommitted changes.
> Current implementation, test evidence, and proposed institutional design are distinguished below.

## Current state versus proposed institution

Current authentication is owner-oriented. Company records and Agent Society organizational roles do not establish a staffed institution or a completed multi-user collaborator system. `CompanyService.resolve` resolves the authenticated owner and returns role OWNER. `AgentSocietyService` models chief planner, technical lead, security engineer, QA and mentor roles as advisory agent coordination data. Human job titles and access rights below are recommendations.

## Proposed decision-rights model

| Role                                | Accountable work                              | May decide                                                             | Must escalate / may not decide                                               |
| ----------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Founder / accountable owner         | Mission, resources, institutional commitments | Charter, disclosure policy, human appointments, approved budget limits | Cannot waive prohibited system operations through an approval                |
| Division lead                       | Mandate, scoped backlog and output quality    | Work allocation and internal review within granted scope               | Cross-division data access, legal promises, privileged tool grants           |
| Project sponsor                     | Requirements and human acceptance             | Acceptance criteria and result acceptance                              | Cannot treat acceptance as blanket execution permission                      |
| Technical maintainer                | Repository integrity and compatibility        | Reviewed implementation choices and test adequacy                      | Production permissions/deployments require their separate reviewed path      |
| Security reviewer                   | Threat model and control acceptance           | Block unsafe release, recommend containment                            | No unrestricted private-data access or automatic security exceptions         |
| Data/document steward               | Classification, provenance and retention      | Recommend clearance and reviewed export                                | No silent downgrade of confidential source material                          |
| Research lead                       | Scientific validity and replication           | Approved hypothesis/method/analysis                                    | No invented results, unauthorized training data or production auto-promotion |
| Independent reviewer                | Challenge and verify output                   | Record pass/fail and limitations                                       | Cannot review their own consequential work when independence is required     |
| Contributor / external collaborator | Bounded deliverable                           | Work inside granted project and time window                            | No transitive team/department access or default tool execution               |
| Agent sponsor                       | AI assignment scope and supervision           | Request assignment and evaluate output                                 | Cannot use agent title/model strength as authorization                       |
| Incident lead                       | Contain and reconcile an incident             | Invoke reviewed emergency revocation/stop                              | Stop is not an irreversible administrative executor                          |

**Proposed review separation:** sponsor requests; steward scopes; designated human authority approves; provider performs finite operation; independent verifier checks outcome; audit records each transition. For early operation one human may hold several roles, but the conflict must be visible and consequential independent review must not be falsely claimed.

## Contribution pathways

### Engineering

Provide a bounded issue, acceptance criteria, sanitized architecture material and test instructions. Grant a time-limited project/repository role after identity and scope review. Use the existing review/validation/merge boundaries. Contributions must include documentation impact and uncertainty. Offboard by revoking grants/sessions and retaining auditable artifacts; do not delete canonical evidence.

### Research

Begin with a primary-source literature task or replication on approved public/synthetic data. Require hypothesis, data rights, evaluation plan, resource budget, methods and a mentor. Separate negative results from implementation failure. A candidate method may enter shadow/canary evaluation only through reviewed promotion and rollback gates.

### Creative and community

Use approved public product claims and brand assets. Drafts must show source/rights references. Human review controls publication; no agent independently messages partners, posts content or accepts commercial terms. Invitees receive the minimum project documents, not the full institutional source register.

### Client delivery

Use an explicitly isolated company/project scope and approved test data. Confirm client data rights, tool accounts, acceptance criteria, retention and exit obligations before access. Demonstrating a synthetic flow is distinct from delivering a client outcome. Client content never becomes reusable training or shared institutional memory automatically.

## Onboarding checklist proposal

1. Named sponsor, project purpose, human/agent identity and expiration.
2. Required expertise, bounded deliverable, review path and evidence expectations.
3. Document clearance and allowed repository/tool references; deny everything else.
4. Confidentiality, data rights and reporting expectations approved by responsible humans; no legal status assumed.
5. Fixture-based orientation to stop, clarification, approvals, sensitive content and incident reporting.
6. Access activation through reviewed Organization Control workflow, followed by a harmless read-only check.
7. Scheduled access review; offboarding includes revocation, queued-work cancellation, artifact handover and retention review.

## Human–AI collaboration protocol

A person supplies purpose and constraints; the system proposes a decomposed plan and identifies ambiguity. The person reviews consequential commitments. Agents receive scoped context and finite capability references. Results carry provenance and known gaps. When the model is uncertain, the appropriate response is clarification, bounded investigation or a visible blocker—not a fabricated command or hidden permission expansion.

Use task IDs, reviewed artifact references and explicit handoff criteria between divisions. Shared summaries should disclose what is necessary for the recipient's work, inherit source classification and avoid private reasoning. Human disagreement should create an inspectable decision record with accountable authority; agent consensus is advisory evidence.

## Founder operating cadence proposal

Daily: review stop/security posture, blocked objectives, pending high-risk approvals and spend alerts; select a small set of useful outcomes. Weekly: review accepted results, recovery effort, documentation claim freshness, access expiry and research evidence. Monthly: audit scope/permission changes, restore evidence, model/data policy, division mandates and collaborator offboarding. Review every public claim against the capability register before release.

No cadence or score above is evidence of current practice. Record the first baseline before setting numerical targets. Founder attention should focus on irreversible commitments, security exceptions, unclear goals, disputed evidence and institutional direction rather than approving every low-risk internal metadata operation.
