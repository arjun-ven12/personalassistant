import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowRight, Box, CheckCircle2, CircleX, Plus, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { CrossCompanySharingScope, CrossCompanyServiceRequest } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";
import { serviceReadiness, type ServiceDraft } from "./crossCompanyServicesState.js";

const stateClass = (value: string) => `portfolio-${value.toLowerCase()}`;
const splitList = (value: string) => [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];

const initialDraft: ServiceDraft = {
  sourceCompanyId: "",
  destinationCompanyId: "",
  requestedOutcome: "",
  serviceType: "company.artifact.report",
  sharingScope: "SUMMARY_ONLY",
  capabilities: "company.artifact.report",
  sharedReferences: "",
  budgetCredits: 10,
  deadline: "",
  confidentiality: "INTERNAL",
};

const requestActionable = (request: CrossCompanyServiceRequest) => ["REQUESTED", "NEEDS_APPROVAL", "BUDGET_BLOCKED"].includes(request.status);
const requestCancellable = (request: CrossCompanyServiceRequest) => !["COMPLETED", "REJECTED", "FAILED", "CANCELLED"].includes(request.status);

export const CrossCompanyServicesPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initialDraft);
  const [policyPeerId, setPolicyPeerId] = useState("");
  const [policyServiceTypes, setPolicyServiceTypes] = useState("company.artifact.report");
  const [policyCapabilities, setPolicyCapabilities] = useState("company.artifact.report");
  const [policySharingScopes, setPolicySharingScopes] = useState("SUMMARY_ONLY,SPECIFIC_ARTIFACTS,SPECIFIC_METRICS,TASK_BOUND_CONTEXT");
  const [policyBudget, setPolicyBudget] = useState(100);
  const [policyApproval, setPolicyApproval] = useState(25);
  const [allowExternalTransfer, setAllowExternalTransfer] = useState(false);
  const dashboard = useQuery({ queryKey: ["cross-company-services"], queryFn: apiClient.getCrossCompanyServices, refetchInterval: 15_000 });
  const companies = useQuery({ queryKey: ["companies"], queryFn: apiClient.getCompanies });
  const activeCompanyData = useQuery({ queryKey: ["company-data", "services-policy"], queryFn: apiClient.getCompanyData });
  const companyItems = useMemo(() => companies.data?.companies ?? [], [companies.data?.companies]);
  const currentCompany = companies.data?.currentCompany;
  useEffect(() => setAllowExternalTransfer(activeCompanyData.data?.policy?.externalTransferAllowed ?? false), [activeCompanyData.data?.policy?.externalTransferAllowed]);
  const hydratedDraft = useMemo(() => ({
    ...draft,
    sourceCompanyId: draft.sourceCompanyId || currentCompany?.id || "",
    destinationCompanyId: draft.destinationCompanyId || companyItems.find((item) => item.id !== (draft.sourceCompanyId || currentCompany?.id))?.id || "",
  }), [companyItems, currentCompany?.id, draft]);
  const readiness = serviceReadiness(hydratedDraft, companyItems, dashboard.data?.policies ?? [], dashboard.data?.readiness);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["cross-company-services"] }),
      queryClient.invalidateQueries({ queryKey: ["companies"] }),
    ]);
  };
  const create = useMutation({
    mutationFn: () => apiClient.createCrossCompanyService({
      sourceCompanyId: hydratedDraft.sourceCompanyId,
      destinationCompanyId: hydratedDraft.destinationCompanyId,
      requesterAssignmentId: null,
      serviceType: hydratedDraft.serviceType,
      requestedOutcome: hydratedDraft.requestedOutcome,
      objectiveId: null,
      workflowId: null,
      requestedCapabilities: splitList(hydratedDraft.capabilities),
      sharedInput: {
        scope: hydratedDraft.sharingScope,
        artifactRefs: hydratedDraft.sharingScope === "SPECIFIC_ARTIFACTS" ? splitList(hydratedDraft.sharedReferences) : [],
        metricRefs: hydratedDraft.sharingScope === "SPECIFIC_METRICS" ? splitList(hydratedDraft.sharedReferences) : [],
        contextRefs: hydratedDraft.sharingScope === "TASK_BOUND_CONTEXT" ? splitList(hydratedDraft.sharedReferences) : [],
        summary: hydratedDraft.sharingScope === "NONE" ? null : hydratedDraft.requestedOutcome,
      },
      permittedOutputTypes: ["STRUCTURED_RESULT", "ARTIFACTS", "EVIDENCE"],
      confidentiality: hydratedDraft.confidentiality,
      budgetCredits: hydratedDraft.budgetCredits,
      costAttribution: "SOURCE_PAYS",
      deadline: hydratedDraft.deadline ? new Date(hydratedDraft.deadline).toISOString() : null,
      priority: "NORMAL",
    }),
    onSuccess: async () => {
      setDraft({ ...initialDraft, sourceCompanyId: hydratedDraft.sourceCompanyId });
      await refresh();
    },
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "ACCEPT" | "REJECT" }) => apiClient.decideCrossCompanyService(id, decision),
    onSuccess: refresh,
  });
  const cancel = useMutation({ mutationFn: apiClient.cancelCrossCompanyService, onSuccess: refresh });
  const savePolicy = useMutation({
    mutationFn: async () => {
      const policy = activeCompanyData.data?.policy;
      await apiClient.updateCompanyDataPolicy({
        rules: policy?.rules ?? [],
        modelRouting: policy?.modelRouting ?? {
          PUBLIC: "LOCAL_ONLY", INTERNAL: "LOCAL_ONLY", CONFIDENTIAL: "LOCAL_ONLY", RESTRICTED: "LOCAL_ONLY", approvedCloudProviderIds: [],
        },
        externalTransferAllowed: allowExternalTransfer,
      });
      return apiClient.upsertCrossCompanyPolicy({
        allowedDestinationCompanyIds: [policyPeerId],
        allowedServiceTypes: splitList(policyServiceTypes),
        allowedSharingScopes: splitList(policySharingScopes),
        allowedCapabilities: splitList(policyCapabilities),
        maxBudgetCredits: policyBudget,
        approvalThresholdCredits: policyApproval,
        maxConcurrentServices: 5,
      });
    },
    onSuccess: refresh,
  });
  const data = dashboard.data;
  const active = data?.requests.filter((request) => ["REQUESTED", "NEEDS_APPROVAL", "ACCEPTED", "BUDGET_BLOCKED", "RUNNING", "WAITING", "REVIEW"].includes(request.status)) ?? [];
  const companyName = (id: string) => companyItems.find((item) => item.id === id)?.name ?? id.slice(0, 8);
  const error = create.error ?? decide.error ?? cancel.error ?? savePolicy.error ?? dashboard.error;

  return (
    <section className="placeholder-page wide-page portfolio-page services-page" aria-labelledby="services-heading">
      <div className="panel-heading">
        <div><p className="eyebrow">Governed portfolio execution</p><h1 id="services-heading">Cross-company services</h1><p>Create, review, and monitor explicit collaboration contracts. No request grants direct sibling-company access.</p></div>
        <span className="portfolio-healthy"><ShieldCheck size={15} /> deny by default</span>
      </div>

      <section className="status-grid">
        <article className="status-card"><span><ArrowRight size={14} />Active services</span><strong>{active.length}</strong><small>destination-governed</small></article>
        <article className="status-card"><span><Activity size={14} />Durable runs</span><strong>{data?.executions.length ?? 0}</strong><small>replayable histories</small></article>
        <article className="status-card"><span><Box size={14} />Readiness</span><strong>{readiness.blockers.length || readiness.executionBlockers.length ? "BLOCKED" : "READY"}</strong><small>{readiness.blockers[0] ?? readiness.executionBlockers[0] ?? "bilateral policy and runtime checks passed"}</small></article>
      </section>

      <section className="dashboard-grid two-column-grid services-product-flow">
        <form className="panel service-request-form" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
          <div className="panel-heading"><div><h2><Plus size={16} /> Create service request</h2><p>Only policy-compatible contracts can be submitted.</p></div></div>
          <div className="service-form-grid">
            <label>Source company<select value={hydratedDraft.sourceCompanyId} onChange={(event) => setDraft((value) => ({ ...value, sourceCompanyId: event.target.value }))}>{companyItems.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
            <label>Destination company<select value={hydratedDraft.destinationCompanyId} onChange={(event) => setDraft((value) => ({ ...value, destinationCompanyId: event.target.value }))}>{companyItems.filter((company) => company.id !== hydratedDraft.sourceCompanyId).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
            <label>Service type<input required value={hydratedDraft.serviceType} onChange={(event) => setDraft((value) => ({ ...value, serviceType: event.target.value }))} /></label>
            <label>Sharing scope<select value={hydratedDraft.sharingScope} onChange={(event) => setDraft((value) => ({ ...value, sharingScope: event.target.value as CrossCompanySharingScope }))}><option>SUMMARY_ONLY</option><option>SPECIFIC_ARTIFACTS</option><option>SPECIFIC_DATASET</option><option>SPECIFIC_METRICS</option><option>TASK_BOUND_CONTEXT</option><option>NONE</option></select></label>
            <label>Budget credits<input min={1} type="number" value={hydratedDraft.budgetCredits} onChange={(event) => setDraft((value) => ({ ...value, budgetCredits: event.target.valueAsNumber }))} /></label>
            <label>Deadline<input type="datetime-local" value={hydratedDraft.deadline} onChange={(event) => setDraft((value) => ({ ...value, deadline: event.target.value }))} /></label>
            <label>Capabilities<input value={hydratedDraft.capabilities} onChange={(event) => setDraft((value) => ({ ...value, capabilities: event.target.value }))} /></label>
            <label>Shared references<input placeholder="artifact, metric, or context refs" value={hydratedDraft.sharedReferences} onChange={(event) => setDraft((value) => ({ ...value, sharedReferences: event.target.value }))} /></label>
            <label>Confidentiality<select value={hydratedDraft.confidentiality} onChange={(event) => setDraft((value) => ({ ...value, confidentiality: event.target.value as ServiceDraft["confidentiality"] }))}><option>INTERNAL</option><option>CONFIDENTIAL</option><option>RESTRICTED</option></select></label>
          </div>
          <label>Requested outcome<textarea required maxLength={4000} value={hydratedDraft.requestedOutcome} onChange={(event) => setDraft((value) => ({ ...value, requestedOutcome: event.target.value }))} /></label>
          <div className={readiness.blockers.length || readiness.executionBlockers.length ? "service-readiness blocked" : "service-readiness ready"}>
            <strong>{readiness.blockers.length ? "Not ready to submit" : readiness.executionBlockers.length ? "Request allowed; execution not ready" : "Ready to submit and execute"}</strong>
            {readiness.blockers.map((blocker) => <small key={blocker}>{blocker}</small>)}
            {readiness.executionBlockers.map((blocker) => <small key={blocker}>{blocker}</small>)}
            {readiness.approvalRequired ? <small>Owner approval will be required before acceptance. <a href="/approvals">Open Approvals</a></small> : <small>No approval threshold is currently triggered.</small>}
          </div>
          <button className="primary-button" disabled={create.isPending || readiness.blockers.length > 0 || !hydratedDraft.requestedOutcome.trim()} type="submit">Create governed request</button>
        </form>

        <form className="panel service-policy-form" onSubmit={(event) => { event.preventDefault(); savePolicy.mutate(); }}>
          <h2>Collaboration policy</h2>
          <p>Configure the active company ({currentCompany?.name ?? "unknown"}). Switch companies to configure the peer and establish bilateral readiness.</p>
          <label>Allowed peer<select required value={policyPeerId} onChange={(event) => setPolicyPeerId(event.target.value)}><option value="">Select peer</option>{companyItems.filter((company) => company.id !== currentCompany?.id).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          <label>Allowed service types<input value={policyServiceTypes} onChange={(event) => setPolicyServiceTypes(event.target.value)} /></label>
          <label>Allowed capabilities<input value={policyCapabilities} onChange={(event) => setPolicyCapabilities(event.target.value)} /></label>
          <label>Allowed sharing scopes<input value={policySharingScopes} onChange={(event) => setPolicySharingScopes(event.target.value)} /></label>
          <label className="service-policy-toggle"><input checked={allowExternalTransfer} onChange={(event) => setAllowExternalTransfer(event.target.checked)} type="checkbox" /> Allow governed external transfer for this company</label>
          <div className="service-form-grid"><label>Maximum credits<input min={0} type="number" value={policyBudget} onChange={(event) => setPolicyBudget(event.target.valueAsNumber)} /></label><label>Approval at<input min={0} type="number" value={policyApproval} onChange={(event) => setPolicyApproval(event.target.valueAsNumber)} /></label></div>
          <button disabled={savePolicy.isPending || !policyPeerId} type="submit">Save active-company policy</button>
          <div className="service-policy-list">{data?.policies.map((policy) => <div key={policy.id}><strong>{companyName(policy.companyId)}</strong><small>{policy.allowedDestinationCompanyIds.map(companyName).join(", ")} · {policy.allowedServiceTypes.join(", ")} · max {policy.maxBudgetCredits}</small></div>)}</div>
        </form>
      </section>

      {dashboard.isPending ? <p className="notice">Loading governed service history…</p> : null}
      <section className="panel services-contracts">
        <h2>Service contracts</h2>
        {data?.requests.map((request) => (
          <article className="service-contract-card" key={request.id}>
            <header><div><strong>{request.requestedOutcome}</strong><small>{companyName(request.sourceCompanyId)} <ArrowRight size={10} /> {companyName(request.destinationCompanyId)} · {request.serviceType}</small></div><b className={stateClass(request.status)}>{request.status}</b></header>
            <dl><div><dt>Sharing</dt><dd>{request.sharedInput.scope}</dd></div><div><dt>Specialist</dt><dd>{request.workforceResolution?.selectedDefinitionId ?? "Not assigned"}</dd></div><div><dt>Budget</dt><dd>{request.reservedCostCredits || request.budgetCredits} credits</dd></div><div><dt>Approval</dt><dd>{request.approvalRequirement}{request.approvalId ? " · linked" : ""}</dd></div><div><dt>Deadline</dt><dd>{request.deadline ? new Date(request.deadline).toLocaleString() : "None"}</dd></div><div><dt>Result</dt><dd>{request.result?.summary ?? "Not available"}</dd></div></dl>
            {request.waitReason ? <p className="notice">{request.waitReason}</p> : null}
            <div className="button-row">
              {requestActionable(request) ? <><button disabled={decide.isPending} onClick={() => decide.mutate({ id: request.id, decision: "ACCEPT" })} type="button"><CheckCircle2 size={15} /> Accept</button><button disabled={decide.isPending} onClick={() => decide.mutate({ id: request.id, decision: "REJECT" })} type="button"><XCircle size={15} /> Reject</button></> : null}
              {requestCancellable(request) ? <button disabled={cancel.isPending} onClick={() => cancel.mutate(request.id)} type="button"><CircleX size={15} /> Cancel</button> : null}
              {request.approvalRequirement !== "NONE" ? <a className="button-link" href="/approvals">Open approval</a> : null}
            </div>
            <details><summary>Advanced execution details</summary><p>Trace {request.traceId} · assignment {request.destinationAssignmentId ?? "unresolved"} · economy {request.economyState} · step {request.currentStep ?? "terminal"}</p>{data.executions.filter((execution) => execution.serviceRequestId === request.id).map((execution) => <p key={execution.id}>{execution.backend} · attempt {execution.attempt}/{execution.maxAttempts} · lease {execution.leaseOwner ?? "idle"} · generation {execution.leaseGeneration}</p>)}</details>
          </article>
        ))}
        {!data?.requests.length ? <div className="portfolio-empty"><strong>No service requests yet.</strong><p>Configure bilateral collaboration policies above, then create the first governed request. This is expected in a new portfolio.</p></div> : null}
      </section>
      {error instanceof Error ? <p className="error-banner">{error.message}</p> : null}
    </section>
  );
};
