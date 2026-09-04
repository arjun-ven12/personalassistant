import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Building2,
  Database,
  Gauge,
  GitBranch,
  ShieldCheck,
  Search,
  WalletCards,
  Target,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { ApiClient } from "./api.js";
import { portfolioCompanyState } from "./portfolio-state.js";

type Tab = "Overview" | "Business" | "System" | "AI";
const statusClass = (value: string) => `portfolio-${value.toLowerCase()}`;

export const PortfolioPage = ({ apiClient, onOpenCompany }: { apiClient: ApiClient; onOpenCompany?: (companyId: string) => void }) => {
  const [tab, setTab] = useState<Tab>("Overview");
  const [objectiveTitle, setObjectiveTitle] = useState("");
  const [objectiveOutcome, setObjectiveOutcome] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("ALL");
  const [allocationCompanyId, setAllocationCompanyId] = useState("");
  const [allocationAmount, setAllocationAmount] = useState("100");
  const [allocationReason, setAllocationReason] = useState("");
  const [allocationKey, setAllocationKey] = useState(() => crypto.randomUUID());
  const [pendingAllocationApprovalId, setPendingAllocationApprovalId] = useState<string | undefined>();
  const [counterProposalId, setCounterProposalId] = useState<string | null>(null);
  const [counterOutcome, setCounterOutcome] = useState("");
  const [counterTarget, setCounterTarget] = useState("");
  const [counterBudget, setCounterBudget] = useState("0");
  const [counterExplanation, setCounterExplanation] = useState("");
  const queryClient = useQueryClient();
  const portfolio = useQuery({
    queryKey: ["owner-portfolio"],
    queryFn: apiClient.getOwnerPortfolio,
    refetchInterval: 30_000,
  });
  const brief = useQuery({
    queryKey: ["owner-portfolio-brief"],
    queryFn: apiClient.getPortfolioBrief,
  });
  const objectives = useQuery({
    queryKey: ["owner-portfolio-objectives"],
    queryFn: apiClient.getPortfolioObjectives,
  });
  const economy = useQuery({ queryKey: ["owner-portfolio-economy"], queryFn: apiClient.getPortfolioEconomy });
  const approvals = useQuery({ queryKey: ["owner-portfolio-approvals"], queryFn: apiClient.getPortfolioApprovals });
  const governorProposals = useQuery({ queryKey: ["owner-governor-proposals"], queryFn: apiClient.getGovernorProposals });
  const search = useQuery({
    queryKey: ["owner-portfolio-search", searchQuery, searchType],
    queryFn: () => apiClient.searchPortfolio({ query: searchQuery, type: searchType, limit: 30 }),
    enabled: searchQuery.trim().length > 0,
  });
  const createObjective = useMutation({
    mutationFn: () => apiClient.createPortfolioObjective({
      idempotencyKey: crypto.randomUUID(),
      title: objectiveTitle,
      desiredOutcome: objectiveOutcome,
      canonicalMetricKey: null,
      targetValue: null,
      unit: null,
      deadline: null,
      strategy: "PRIORITY_WEIGHTED",
      constraints: [],
      budgetCredits: 0,
    }),
    onSuccess: async () => {
      setObjectiveTitle("");
      setObjectiveOutcome("");
      await queryClient.invalidateQueries({ queryKey: ["owner-portfolio-objectives"] });
    },
  });
  const transfer = useMutation({
    mutationFn: () => apiClient.transferPortfolioResources({
      companyId: allocationCompanyId,
      amount: Number(allocationAmount),
      reason: allocationReason,
      idempotencyKey: allocationKey,
      ...(pendingAllocationApprovalId ? { approvalId: pendingAllocationApprovalId } : {}),
    }),
    onSuccess: async (result) => {
      if (result.status === "APPROVAL_REQUIRED") setPendingAllocationApprovalId(result.approvalId ?? undefined);
      else {
        setAllocationReason("");
        setPendingAllocationApprovalId(undefined);
        setAllocationKey(crypto.randomUUID());
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["owner-portfolio-economy"] }),
        queryClient.invalidateQueries({ queryKey: ["owner-portfolio-approvals"] }),
      ]);
    },
  });
  const decideApproval = useMutation({
    mutationFn: ({ approvalId, decision }: { approvalId: string; decision: "approve" | "reject" }) => apiClient.decidePortfolioApproval(approvalId, decision),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["owner-portfolio-approvals"] }),
  });
  const decideProposal = useMutation({
    mutationFn: ({ proposalId, decision, counterTerms, explanation }: { proposalId: string; decision: "ACCEPT" | "REJECT" | "COUNTERPROPOSE"; counterTerms?: { requestedOutcome: string; targetValue: string | null; unit: string | null; budgetCredits: number; deadline: string | null; constraints: string[] }; explanation?: string }) => apiClient.decideGovernorProposal(proposalId, {
      decision,
      reasonCode: decision === "ACCEPT" ? "ACCEPTED" : decision === "COUNTERPROPOSE" ? "INSUFFICIENT_CAPACITY" : "CONFLICTING_PRIORITY",
      explanation: explanation || null,
      ...(counterTerms ? { counterTerms } : {}),
      idempotencyKey: crypto.randomUUID(),
    }),
    onSuccess: async () => {
      setCounterProposalId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["owner-governor-proposals"] }),
        queryClient.invalidateQueries({ queryKey: ["owner-portfolio-objectives"] }),
      ]);
    },
  });
  const updatePriority = useMutation({
    mutationFn: ({ companyId, portfolioPriority }: { companyId: string; portfolioPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" }) =>
      apiClient.updateCompany(companyId, { portfolioPriority }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["owner-portfolio"] }),
  });
  const traces = useQuery({
    queryKey: ["owner-portfolio-traces"],
    queryFn: apiClient.getPortfolioTraces,
    enabled: tab === "System",
  });
  const aiTraces = useQuery({
    queryKey: ["owner-portfolio-ai-traces"],
    queryFn: apiClient.getPortfolioAITraces,
    enabled: tab === "AI",
  });
  const data = portfolio.data;
  const metricKeys = useMemo(
    () => [
      ...new Set(data?.portfolioMetrics.map((item) => item.canonicalMetricKey) ?? []),
    ],
    [data?.portfolioMetrics],
  );
  const [metricKey, setMetricKey] = useState("");
  const selectedMetric = metricKey || metricKeys[0] || "";
  return (
    <section
      className="placeholder-page wide-page portfolio-page"
      aria-labelledby="portfolio-heading"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Owner intelligence</p>
          <h1 id="portfolio-heading">Portfolio</h1>
          <p>
            Company summaries, business truth, runtime evidence, and AI telemetry.
            Recommendations cannot execute work.
          </p>
        </div>
        <span className={statusClass(data?.evidenceQuality ?? "UNAVAILABLE")}>
          <ShieldCheck size={15} />
          {data?.evidenceQuality ?? "UNAVAILABLE"}
        </span>
      </div>
      <div className="portfolio-tabs" role="tablist">
        {(["Overview", "Business", "System", "AI"] as const).map((item) => (
          <button
            aria-selected={tab === item}
            key={item}
            onClick={() => setTab(item)}
            role="tab"
            type="button"
          >
            {item}
          </button>
        ))}
      </div>
      {portfolio.isPending ? (
        <p className="notice">Resolving owner-authorized company summaries...</p>
      ) : null}
      {tab === "Overview" && data ? (
        <>
          <section className="status-grid">
            <article className="status-card">
              <span><Gauge size={14} />Portfolio health</span>
              <strong>{data.health.score === null ? "—" : Math.round(data.health.score)}</strong>
              <small>{data.health.state} · {data.health.companiesUnknown} unknown</small>
            </article>
            <article className="status-card">
              <span>
                <Building2 size={14} />
                Companies
              </span>
              <strong>{data.companies.length}</strong>
              <small>Operationally isolated</small>
            </article>
            <article className="status-card">
              <span>
                <AlertTriangle size={14} />
                Attention
              </span>
              <strong>
                {data.attentionQueue.filter((item) => item.status === "OPEN").length}
              </strong>
              <small>
                {
                  data.attentionQueue.filter((item) =>
                    ["HIGH", "CRITICAL"].includes(item.severity),
                  ).length
                }{" "}
                high priority
              </small>
            </article>
            <article className="status-card">
              <span>
                <Bot size={14} />
                AI spend
              </span>
              <strong>{data.aiHealth.totalCostCredits.toFixed(1)}</strong>
              <small>credits in retained telemetry</small>
            </article>
            <article className="status-card">
              <span>
                <Activity size={14} />
                Incidents
              </span>
              <strong>{data.systemHealth.incidentCount}</strong>
              <small>{data.systemHealth.activeTraces} correlated traces</small>
            </article>
          </section>
          <section className="portfolio-company-grid">
            {data.companies.map((company) => {
              const companyState = portfolioCompanyState(company.health);
              return (
                <article className="portfolio-company-card" key={company.companyId}>
                  <header>
                    <div>
                      <h2>{company.companyName}</h2>
                      <small>{company.companyStatus}</small>
                    </div>
                    <strong className={statusClass(companyState.tone)}>
                      {company.healthScore === null ? companyState.label : `${Math.round(company.healthScore)} · ${company.healthState}`}
                    </strong>
                  </header>
                  <div className="portfolio-health-strip">
                    {company.health.map((item) => (
                      <span
                        className={statusClass(item.state)}
                        key={item.dimension}
                        title={item.evidence.join(" ")}
                      >
                        {item.dimension}
                        <b>{item.state}</b>
                      </span>
                    ))}
                  </div>
                  <dl>
                    <div><dt>Priority</dt><dd><select aria-label={`${company.companyName} priority`} disabled={updatePriority.isPending} onChange={(event) => updatePriority.mutate({ companyId: company.companyId, portfolioPriority: event.target.value as "CRITICAL" | "HIGH" | "NORMAL" | "LOW" })} value={company.priority}><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="NORMAL">Normal</option><option value="LOW">Low</option></select></dd></div>
                    <div><dt>Objectives</dt><dd>{company.activeObjectives} active</dd></div>
                    <div><dt>Blocked</dt><dd>{company.blockedObjectives}</dd></div>
                    <div><dt>Active agents</dt><dd>{company.activeAgents}</dd></div>
                    <div>
                      <dt>AI cost</dt>
                      <dd>{company.aiSpendCredits.toFixed(1)}</dd>
                    </div>
                    <div>
                      <dt>AI success</dt>
                      <dd>
                        {company.aiSuccessRate === null
                          ? "—"
                          : `${Math.round(company.aiSuccessRate * 100)}%`}
                      </dd>
                    </div>
                    <div>
                      <dt>Data alerts</dt>
                      <dd>{company.dataAlerts}</dd>
                    </div>
                    <div>
                      <dt>Incidents</dt>
                      <dd>{company.systemIncidents}</dd>
                    </div>
                  </dl>
                  <div className="portfolio-management-summary">
                    <small>Top priority</small>
                    <strong>{company.management.topPriority ?? "Not established"}</strong>
                    <span>{company.management.objectivesAtRisk} objectives at risk · {company.management.decisionsRequiringOwner} decisions need owner</span>
                    <small>{company.management.latestReviewAt ? `Review ${new Date(company.management.latestReviewAt).toLocaleDateString()}` : "No management review yet"} · {company.management.nextRecommendedFocus}</small>
                  </div>
                  <button onClick={() => onOpenCompany?.(company.companyId)} type="button">
                    Open management
                  </button>
                </article>
              );
            })}
            {!data.companies.length ? (
              <p className="portfolio-empty">No companies are available to compare.</p>
            ) : null}
          </section>
          <section className="dashboard-grid two-column-grid">
            <article className="panel portfolio-orchestration-panel">
              <h2><Search size={16} /> Search all companies</h2>
              <div className="portfolio-search-controls">
                <input aria-label="Search all companies" maxLength={120} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Companies, objectives, agents, workflows…" value={searchQuery} />
                <select aria-label="Search type" onChange={(event) => setSearchType(event.target.value)} value={searchType}>
                  {['ALL','COMPANIES','OBJECTIVES','AGENTS','WORKFLOWS','APPROVALS','EXPERIMENTS'].map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              {search.data?.results.map((result) => <button className="portfolio-search-result" key={`${result.type}:${result.id}`} onClick={() => onOpenCompany?.(result.companyId)} type="button"><strong>{result.title}</strong><span>{result.companyName} · {result.type} · {result.status}</span><small>{result.subtitle}</small></button>)}
              {searchQuery && !search.isPending && !search.data?.results.length ? <p className="portfolio-empty">No authorized portfolio results match.</p> : null}
            </article>
            <article className="panel portfolio-orchestration-panel">
              <h2><WalletCards size={16} /> Owner reserve</h2>
              <div className="portfolio-reserve-summary"><strong>{economy.data?.ownerReserveAvailable ?? 0}</strong><span>credits available</span><small>{economy.data?.allocatedAcrossCompanies ?? 0} allocated across companies</small></div>
              <form onSubmit={(event) => { event.preventDefault(); transfer.mutate(); }}>
                <label>Company<select required onChange={(event) => { setAllocationCompanyId(event.target.value); setPendingAllocationApprovalId(undefined); setAllocationKey(crypto.randomUUID()); }} value={allocationCompanyId}><option value="">Choose company</option>{economy.data?.companyAccounts.map((account) => <option key={account.companyId} value={account.companyId}>{account.companyName} · {account.availableCredits} available</option>)}</select></label>
                <label>Credits<input min="1" max="1000000000" onChange={(event) => setAllocationAmount(event.target.value)} required type="number" value={allocationAmount} /></label>
                <label>Reason<input maxLength={240} onChange={(event) => setAllocationReason(event.target.value)} required value={allocationReason} /></label>
                <button disabled={transfer.isPending} type="submit">{pendingAllocationApprovalId ? "Settle approved allocation" : "Request allocation"}</button>
              </form>
              {pendingAllocationApprovalId ? <p className="notice">Approval {pendingAllocationApprovalId.slice(0, 8)} is required. Approve it below, then settle the same idempotent request.</p> : null}
              {transfer.error instanceof Error ? <p className="error-banner">{transfer.error.message}</p> : null}
            </article>
            <article className="panel portfolio-orchestration-panel">
              <h2><ShieldCheck size={16} /> All Companies approvals</h2>
              {approvals.data?.slice(0, 20).map((approval) => <div className="portfolio-approval-row" key={approval.id}><div><strong>{approval.companyName}</strong><p>{approval.action}</p><small>{approval.risk} risk · {approval.status}</small></div>{approval.status === "PENDING" ? <span><button disabled={decideApproval.isPending} onClick={() => decideApproval.mutate({ approvalId: approval.id, decision: "approve" })} type="button">Approve</button><button disabled={decideApproval.isPending} onClick={() => decideApproval.mutate({ approvalId: approval.id, decision: "reject" })} type="button">Reject</button></span> : null}</div>)}
              {!approvals.data?.length ? <p className="portfolio-empty">No portfolio approvals are available.</p> : null}
              {decideApproval.error instanceof Error ? <p className="error-banner">{decideApproval.error.message}</p> : null}
            </article>
            <article className="panel portfolio-orchestration-panel">
              <h2><GitBranch size={16} /> Governor coordination</h2>
              {governorProposals.data?.slice(0, 20).map((proposal) => { const latest = proposal.revisions.at(-1)!; return <div className="portfolio-proposal-row" key={proposal.id}><strong>{proposal.status}</strong><p>{proposal.companyId.slice(0, 8)} · {latest.terms.requestedOutcome}</p><small>v{latest.version} · {latest.terms.targetValue ?? "no target"} {latest.terms.unit ?? ""} · {latest.terms.budgetCredits} credits</small>{["DELIVERED","COUNTERPROPOSED","ESCALATED_TO_OWNER"].includes(proposal.status) ? <><span><button disabled={decideProposal.isPending} onClick={() => decideProposal.mutate({ proposalId: proposal.id, decision: "ACCEPT" })} type="button">Accept</button><button disabled={decideProposal.isPending} onClick={() => decideProposal.mutate({ proposalId: proposal.id, decision: "REJECT" })} type="button">Reject</button><button disabled={decideProposal.isPending} onClick={() => { setCounterProposalId(proposal.id); setCounterOutcome(latest.terms.requestedOutcome); setCounterTarget(latest.terms.targetValue ?? ""); setCounterBudget(String(latest.terms.budgetCredits)); setCounterExplanation(""); }} type="button">Counter</button></span>{counterProposalId === proposal.id ? <form onSubmit={(event) => { event.preventDefault(); decideProposal.mutate({ proposalId: proposal.id, decision: "COUNTERPROPOSE", explanation: counterExplanation, counterTerms: { ...latest.terms, requestedOutcome: counterOutcome, targetValue: counterTarget || null, budgetCredits: Number(counterBudget) } }); }}><label>Revised outcome<textarea maxLength={1000} onChange={(event) => setCounterOutcome(event.target.value)} required value={counterOutcome} /></label><label>Revised target<input onChange={(event) => setCounterTarget(event.target.value)} value={counterTarget} /></label><label>Revised credits<input max="1000000000" min="0" onChange={(event) => setCounterBudget(event.target.value)} required type="number" value={counterBudget} /></label><label>Reason<textarea maxLength={500} onChange={(event) => setCounterExplanation(event.target.value)} required value={counterExplanation} /></label><button disabled={decideProposal.isPending} type="submit">Submit counterproposal</button><button onClick={() => setCounterProposalId(null)} type="button">Cancel</button></form> : null}</> : null}</div>; })}
              {!governorProposals.data?.length ? <p className="portfolio-empty">No Governor proposals exist.</p> : null}
              {decideProposal.error instanceof Error ? <p className="error-banner">{decideProposal.error.message}</p> : null}
            </article>
            <article className="panel">
              <h2><Target size={16} /> Portfolio objectives</h2>
              <p>Creates coordination proposals only. Company Governors must still accept work.</p>
              <form onSubmit={(event) => { event.preventDefault(); createObjective.mutate(); }}>
                <label>Objective title<input maxLength={240} onChange={(event) => setObjectiveTitle(event.target.value)} required value={objectiveTitle} /></label>
                <label>Desired outcome<textarea maxLength={1000} onChange={(event) => setObjectiveOutcome(event.target.value)} required value={objectiveOutcome} /></label>
                <button disabled={createObjective.isPending} type="submit">{createObjective.isPending ? "Creating proposal…" : "Create proposal"}</button>
              </form>
              {createObjective.isError ? <p className="notice error-notice">The objective proposal could not be created.</p> : null}
              {objectives.data?.map((objective) => <div className="portfolio-insight" key={objective.id}><strong>{objective.title}</strong><p>{objective.desiredOutcome}</p><small>{objective.allocations.filter((item) => item.status === "PROPOSED").length} company proposals · {objective.strategy.replaceAll("_", " ").toLowerCase()} · no work executed</small></div>)}
              {!objectives.data?.length ? <p className="portfolio-empty">No portfolio objectives proposed yet.</p> : null}
            </article>
            <article className="panel">
              <h2>Executive brief</h2>
              {brief.data ? <><p>{brief.data.summary}</p>{brief.data.companyUpdates.map((item) => <div className="portfolio-insight" key={item.companyId}><strong>{item.companyName} · {item.state}</strong><p>{item.summary}</p><small>{item.ownerActionRequired ? "Owner action required" : "No verified owner action required"}</small></div>)}</> : <p className="portfolio-empty">Preparing a deterministic portfolio brief…</p>}
            </article>
            <article className="panel">
              <h2>Attention queue</h2>
              {data.attentionQueue.slice(0, 20).map((item) => (
                <div className="portfolio-signal" key={item.id}>
                  <span className={statusClass(item.severity)}>{item.severity}</span>
                  <div>
                    <strong>
                      {item.companyName} — {item.title}
                    </strong>
                    <small>
                      Confidence {Math.round(item.confidence * 100)}% · priority{" "}
                      {item.priority.toFixed(2)} · {item.status.toLowerCase()}
                    </small>
                  </div>
                </div>
              ))}
              {!data.attentionQueue.length ? (
                <p className="portfolio-empty">
                  No portfolio signals currently require attention.
                </p>
              ) : null}
            </article>
            <article className="panel">
              <h2>Significant activity</h2>
              {data.activity.map((item) => <div className="portfolio-signal" key={item.id}><span className={statusClass(item.severity)}>{item.severity}</span><div><strong>{item.companyName} — {item.summary}</strong><small>{item.category} · {new Date(item.occurredAt).toLocaleString()}</small></div></div>)}
              {!data.activity.length ? <p className="portfolio-empty">No material portfolio activity is available.</p> : null}
            </article>
            <article className="panel">
              <h2>Executive insights</h2>
              {data.insights.map((item) => (
                <div className="portfolio-insight" key={item.id}>
                  <strong>
                    {item.companyName} · {item.category}
                  </strong>
                  <p>{item.observation}</p>
                  <small>
                    {item.suggestedNextAction} · confidence{" "}
                    {Math.round(item.confidence * 100)}%
                  </small>
                  <button onClick={() => onOpenCompany?.(item.companyId)} type="button">
                    Review company evidence
                  </button>
                </div>
              ))}
              {!data.insights.length ? (
                <p className="portfolio-empty">
                  No evidence-backed executive insights are available yet.
                </p>
              ) : null}
            </article>
          </section>
        </>
      ) : null}
      {tab === "Business" && data ? (
        <section className="panel portfolio-business">
          <div className="panel-heading">
            <div>
              <h2>Canonical company metrics</h2>
              <p>
                Only identical definition fingerprints, versions, periods, dimensions,
                and units are directly comparable.
              </p>
            </div>
            {metricKeys.length ? (
              <label>
                Metric
                <select
                  value={selectedMetric}
                  onChange={(event) => setMetricKey(event.target.value)}
                >
                  {metricKeys.map((key) => (
                    <option key={key}>{key}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className="portfolio-metric-grid">
            {data.portfolioMetrics
              .filter((item) => item.canonicalMetricKey === selectedMetric)
              .map((metric) => (
                <article key={`${metric.companyId}:${metric.metricId}`}>
                  <header>
                    <strong>{metric.companyName}</strong>
                    <span className={statusClass(metric.freshness)}>
                      {metric.freshness}
                    </span>
                  </header>
                  <b>
                    {metric.value ?? "—"} {metric.unit}
                  </b>
                  <p>
                    {metric.trend}
                    {metric.deltaPercent === null
                      ? ""
                      : ` · ${Math.round(metric.deltaPercent * 100)}%`}
                  </p>
                  <small>
                    v{metric.metricVersion} · {metric.period} · lineage{" "}
                    {metric.lineageRefs.length}
                  </small>
                </article>
              ))}
            {!data.portfolioMetrics.length ? (
              <p className="portfolio-empty">
                No canonical company metrics are available. Define a semantic metric and
                record an observation to populate this view.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
      {tab === "System" && data ? (
        <section className="dashboard-grid two-column-grid">
          <article className="panel">
            <h2>
              <Gauge size={16} />
              Service health
            </h2>
            {data.systemHealth.serviceHealth.map((service) => (
              <div className="portfolio-service" key={service.service}>
                <span>
                  <strong>{service.service}</strong>
                  <small>
                    {service.requests} spans · {service.errors} errors
                  </small>
                </span>
                <b className={statusClass(service.state)}>
                  {Math.round(service.averageLatencyMs)}ms · {service.state}
                </b>
              </div>
            ))}
            {!data.systemHealth.serviceHealth.length ? (
              <p className="portfolio-empty">
                No retained system telemetry is available.
              </p>
            ) : null}
          </article>
          <article className="panel">
            <h2>
              <GitBranch size={16} />
              Trace inspector
            </h2>
            {traces.isPending ? (
              <p className="portfolio-empty">Loading retained system traces…</p>
            ) : null}
            {traces.error instanceof Error ? (
              <p className="error-banner">{traces.error.message}</p>
            ) : null}
            {traces.data?.slice(0, 30).map((trace) => (
              <div className="portfolio-trace" key={trace.id}>
                <span>
                  <strong>{trace.operation}</strong>
                  <small>
                    {trace.companyId ?? "owner"} · {trace.traceId.slice(0, 12)} ·{" "}
                    {trace.errorSource ?? "no error"}
                  </small>
                </span>
                <b className={statusClass(trace.status)}>
                  {trace.durationMs.toFixed(0)}ms
                </b>
              </div>
            ))}
            {!traces.isPending && !traces.error && !traces.data?.length ? (
              <p className="portfolio-empty">
                No retained traces match the current portfolio scope.
              </p>
            ) : null}
          </article>
        </section>
      ) : null}
      {tab === "AI" && data ? (
        <section className="dashboard-grid two-column-grid">
          <article className="panel">
            <h2>
              <BarChart3 size={16} />
              Model efficiency
            </h2>
            {data.aiHealth.modelBreakdown.map((model) => (
              <div
                className="portfolio-service"
                key={`${model.provider}:${model.model}:${model.taskClass}`}
              >
                <span>
                  <strong>
                    {model.provider} · {model.model}
                  </strong>
                  <small>
                    {model.taskClass} · {model.calls} comparable calls
                  </small>
                </span>
                <b>
                  {model.successRate === null
                    ? "—"
                    : `${Math.round(model.successRate * 100)}%`}{" "}
                  · {model.averageCostPerSuccess?.toFixed(2) ?? "—"}/success
                </b>
              </div>
            ))}
            {!data.aiHealth.modelBreakdown.length ? (
              <p className="portfolio-empty">
                No model-backed AI calls are present in retained telemetry.
              </p>
            ) : null}
          </article>
          <article className="panel">
            <h2>
              <Bot size={16} />
              AI traces
            </h2>
            {aiTraces.isPending ? (
              <p className="portfolio-empty">Loading retained AI traces…</p>
            ) : null}
            {aiTraces.error instanceof Error ? (
              <p className="error-banner">{aiTraces.error.message}</p>
            ) : null}
            {aiTraces.data?.slice(0, 30).map((trace) => (
              <div className="portfolio-trace" key={trace.id}>
                <span>
                  <strong>
                    {trace.provider} · {trace.model}
                  </strong>
                  <small>
                    {trace.taskClass} · {trace.inputTokens + trace.outputTokens} tokens
                    · {trace.promptVersion ?? "unversioned prompt"}
                  </small>
                </span>
                <b className={statusClass(trace.success ? "OK" : "ERROR")}>
                  {trace.costCredits.toFixed(2)} cr
                </b>
              </div>
            ))}
            {!aiTraces.isPending && !aiTraces.error && !aiTraces.data?.length ? (
              <p className="portfolio-empty">
                No retained AI traces match the current portfolio scope.
              </p>
            ) : null}
          </article>
          <article className="panel">
            <h2>
              <Database size={16} />
              Regression signals
            </h2>
            {data.aiHealth.regressions.length ? (
              data.aiHealth.regressions.map((item) => (
                <div
                  className="portfolio-insight"
                  key={`${item.companyId}:${item.provider}:${item.model}:${item.taskClass}`}
                >
                  <strong>
                    {item.kind} · {item.model}
                  </strong>
                  <p>{item.evidence.join(" ")}</p>
                  <small>
                    Task class {item.taskClass} · confidence{" "}
                    {Math.round(item.confidence * 100)}%
                  </small>
                </div>
              ))
            ) : (
              <p>No task-class-controlled regression detected.</p>
            )}
          </article>
        </section>
      ) : null}
      {portfolio.error instanceof Error ? (
        <p className="error-banner">{portfolio.error.message}</p>
      ) : null}
    </section>
  );
};
