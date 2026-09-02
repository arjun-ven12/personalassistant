import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Building2,
  CirclePause,
  CirclePlay,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";

import type { CompanyLifecycleAction, CompanyStatus } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";

const actionFor = (
  status: CompanyStatus,
): Array<{ action: CompanyLifecycleAction; label: string }> => {
  if (status === "ACTIVE")
    return [
      { action: "pause", label: "Pause" },
      { action: "suspend", label: "Suspend" },
      { action: "archive", label: "Archive" },
    ];
  if (status === "PAUSED")
    return [
      { action: "resume", label: "Resume" },
      { action: "suspend", label: "Suspend" },
      { action: "archive", label: "Archive" },
    ];
  if (status === "SUSPENDED" || status === "ARCHIVED")
    return [{ action: "restore", label: "Restore" }];
  if (status === "FAILED_PROVISIONING" || status === "PROVISIONING")
    return [{ action: "retry-provisioning", label: "Retry provisioning" }];
  return [];
};

export const CompaniesPage = ({
  apiClient,
  onSelect,
}: {
  apiClient: ApiClient;
  onSelect: (companyId: string) => void;
}) => {
  const queryClient = useQueryClient();
  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: apiClient.getCompanies,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [limit, setLimit] = useState(100);
  const [dataTab, setDataTab] = useState<
    "Data" | "Metrics" | "Integrations" | "Memory"
  >("Data");
  const [managementTab, setManagementTab] = useState<
    "Overview" | "Strategy" | "KPIs" | "Objectives" | "Departments" | "Reviews" | "Decisions"
  >("Overview");
  const [glossaryQuery, setGlossaryQuery] = useState("");
  useEffect(() => {
    if (companies.data?.companyLimit) setLimit(companies.data.companyLimit);
  }, [companies.data?.companyLimit]);
  const detailId = selectedId ?? companies.data?.currentCompany.id;
  const detail = useQuery({
    queryKey: ["company-detail", detailId],
    queryFn: () => apiClient.getCompany(detailId!),
    enabled: Boolean(detailId),
  });
  const isActiveCompany = Boolean(
    detailId && detailId === companies.data?.currentCompany.id,
  );
  const companyData = useQuery({
    queryKey: ["company-data", detailId],
    queryFn: apiClient.getCompanyData,
    enabled: isActiveCompany,
  });
  const companyManagement = useQuery({
    queryKey: ["company-management", detailId],
    queryFn: apiClient.getCompanyManagement,
    enabled: isActiveCompany,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["companies"] }),
      queryClient.invalidateQueries({ queryKey: ["company-detail"] }),
      queryClient.invalidateQueries({ queryKey: ["company-data"] }),
      queryClient.invalidateQueries({ queryKey: ["company-management"] }),
    ]);
  };
  const create = useMutation({
    mutationFn: () =>
      apiClient.createCompany({
        name,
        description: description || undefined,
        industry: industry || undefined,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: async (response) => {
      queryClient.removeQueries({
        predicate: (query) =>
          !["auth-session", "companies"].includes(String(query.queryKey[0])),
      });
      queryClient.setQueryData(["companies"], response);
      setSelectedId(response.currentCompany.id);
      setName("");
      setDescription("");
      setIndustry("");
      await refresh();
    },
  });
  const transition = useMutation({
    mutationFn: ({
      companyId,
      action,
    }: {
      companyId: string;
      action: CompanyLifecycleAction;
    }) => apiClient.transitionCompany(companyId, action),
    onSuccess: refresh,
  });
  const updateLimit = useMutation({
    mutationFn: apiClient.updateCompanyLimit,
    onSuccess: (response) => queryClient.setQueryData(["companies"], response),
  });
  const generateReview = useMutation({
    mutationFn: () =>
      apiClient.generateCompanyManagementReview({ cadence: "AD_HOC", period: "CURRENT" }),
    onSuccess: refresh,
  });
  const current = detail.data?.company;
  const error = create.error ?? transition.error ?? detail.error;

  return (
    <section
      className="placeholder-page wide-page company-management"
      aria-labelledby="companies-heading"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Tenant management</p>
          <h1 id="companies-heading">Companies</h1>
        </div>
        <form
          className="company-limit"
          onSubmit={(event) => {
            event.preventDefault();
            updateLimit.mutate(limit);
          }}
        >
          <label>
            Company limit
            <input
              aria-label="Company limit"
              max={100}
              min={companies.data?.companies.length ?? 1}
              onChange={(event) => setLimit(event.target.valueAsNumber)}
              type="number"
              value={limit}
            />
          </label>
          <button disabled={updateLimit.isPending} type="submit">
            Apply
          </button>
          <span>{companies.data?.companies.length ?? 0} used</span>
        </form>
      </div>

      <div className="company-layout">
        <div className="company-list" aria-label="Company list">
          {companies.data?.companies.map((company) => (
            <button
              className={detailId === company.id ? "company-row active" : "company-row"}
              key={company.id}
              onClick={() => setSelectedId(company.id)}
              type="button"
            >
              <Building2 size={18} />
              <span>
                <strong>{company.name}</strong>
                <small>{company.settings.industry ?? company.slug}</small>
              </span>
              <em data-status={company.status}>
                {company.status.replaceAll("_", " ")}
              </em>
            </button>
          ))}
        </div>

        <div className="company-detail">
          {current ? (
            <>
              <div className="panel-heading">
                <div>
                  <h2>{current.name}</h2>
                  <p>{current.settings.description ?? "No description provided."}</p>
                </div>
                <strong>{current.status.replaceAll("_", " ")}</strong>
              </div>
              <dl className="company-resources">
                <div>
                  <dt>Economy</dt>
                  <dd>0 starter credits</dd>
                </div>
                <div>
                  <dt>Governor</dt>
                  <dd>Dormant until work is approved</dd>
                </div>
                <div>
                  <dt>Autonomy</dt>
                  <dd>{current.settings.autonomyLevel}</dd>
                </div>
                <div>
                  <dt>Approval policy</dt>
                  <dd>{current.settings.defaultApprovalPolicy}</dd>
                </div>
              </dl>
              {detail.data?.provisioning ? (
                <div className="provisioning-progress">
                  <div className="panel-heading">
                    <strong>Provisioning</strong>
                    <span>
                      {
                        detail.data.provisioning.steps.filter(
                          (step) => step.status === "COMPLETED",
                        ).length
                      }{" "}
                      / {detail.data.provisioning.steps.length}
                    </span>
                  </div>
                  <progress
                    max={detail.data.provisioning.steps.length}
                    value={
                      detail.data.provisioning.steps.filter(
                        (step) => step.status === "COMPLETED",
                      ).length
                    }
                  />
                  <div className="provisioning-steps">
                    {detail.data.provisioning.steps.map((step) => (
                      <span data-state={step.status} key={step.name}>
                        {step.name.replaceAll("_", " ")}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="button-row company-actions">
                <button
                  className="primary-button"
                  disabled={["DRAFT", "PROVISIONING", "FAILED_PROVISIONING"].includes(
                    current.status,
                  )}
                  onClick={() => onSelect(current.id)}
                  type="button"
                >
                  <CirclePlay size={16} /> Open company
                </button>
                {actionFor(current.status).map(({ action, label }) => (
                  <button
                    disabled={transition.isPending}
                    key={action}
                    onClick={() => transition.mutate({ companyId: current.id, action })}
                    type="button"
                  >
                    {action === "pause" ? (
                      <CirclePause size={16} />
                    ) : action === "archive" ? (
                      <Archive size={16} />
                    ) : action === "suspend" ? (
                      <ShieldAlert size={16} />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                    {label}
                  </button>
                ))}
              </div>
              {isActiveCompany ? (
                <section className="company-management-intelligence" aria-label="Company management intelligence">
                  <div className="company-data-tabs management-tabs" role="tablist" aria-label="Company management">
                    {(["Overview", "Strategy", "KPIs", "Objectives", "Departments", "Reviews", "Decisions"] as const).map((tab) => (
                      <button aria-selected={managementTab === tab} key={tab} onClick={() => setManagementTab(tab)} role="tab" type="button">{tab}</button>
                    ))}
                  </div>
                  {companyManagement.isPending ? <p className="notice">Resolving evidence-backed management state…</p> : null}
                  {managementTab === "Overview" && companyManagement.data ? (
                    <div className="management-overview-grid">
                      <article><small>Company health</small><strong data-management-state={companyManagement.data.health}>{companyManagement.data.health}</strong></article>
                      <article><small>Objectives at risk</small><strong>{companyManagement.data.executiveBrief.objectivesAtRisk}</strong></article>
                      <article><small>Budget alerts</small><strong>{companyManagement.data.executiveBrief.budgetAlerts}</strong></article>
                      <article><small>Latest review</small><strong>{companyManagement.data.latestReview ? new Date(companyManagement.data.latestReview.generatedAt).toLocaleDateString() : "Not generated"}</strong></article>
                      <div className="management-wide-card"><h3>Top priorities</h3>{companyManagement.data.executiveBrief.topPriorities.length ? companyManagement.data.executiveBrief.topPriorities.map((item) => <p key={item}>{item}</p>) : <p>No approved strategic priorities yet. Create and activate an Objective to populate this view.</p>}</div>
                      <div className="management-wide-card"><h3>Evidence-based diagnosis</h3>{companyManagement.data.diagnoses.length ? companyManagement.data.diagnoses.map((item) => <p key={item.id}><strong>{item.evidenceState} · {item.category}</strong><br />{item.summary} <a href={item.actionPath === "DATA" || item.actionPath === "INTEGRATIONS" ? "/companies" : item.actionPath === "OBJECTIVE" ? "/objectives" : item.actionPath === "WORKFORCE" ? "/agents" : item.actionPath === "APPROVALS" ? "/approvals" : item.actionPath === "SERVICES" ? "/services" : item.actionPath === "SYSTEM" || item.actionPath === "AI" ? "/portfolio" : "/companies"}>Open evidence</a></p>) : <p>No bounded diagnosis is available yet.</p>}</div>
                    </div>
                  ) : null}
                  {managementTab === "Strategy" && companyManagement.data ? (
                    <article className="management-detail-card">{companyManagement.data.strategy ? <><div className="panel-heading"><h3>{companyManagement.data.strategy.strategicIntent}</h3><strong>v{companyManagement.data.strategy.version} · {companyManagement.data.strategy.status}</strong></div><h4>Priorities</h4>{companyManagement.data.strategy.priorities.map((item) => <p key={item}>{item}</p>)}<h4>Assumptions</h4>{companyManagement.data.strategy.assumptions.map((item) => <p key={item}>{item}</p>)}<small>Budget envelope: {companyManagement.data.strategy.budgetEnvelope ?? "not bound"} · horizon {companyManagement.data.strategy.timeHorizon}</small></> : <div className="portfolio-empty"><strong>No approved strategy.</strong><p>Create a measurable Objective and activate its Executive plan. Alexa will not invent a binding strategy or KPI target.</p><a href="/objectives">Open Objectives</a></div>}</article>
                  ) : null}
                  {managementTab === "KPIs" && companyManagement.data ? (
                    <div className="management-table">{companyManagement.data.kpis.map((kpi) => <article key={kpi.metricId}><div><strong>{kpi.name}</strong><small>{kpi.canonicalKey} · definition v{kpi.definitionVersion} · {kpi.freshness}</small></div><b>{kpi.value ?? "—"} {kpi.unit}</b><span>{kpi.target === null ? "No approved target" : `Target ${kpi.target}`} · {kpi.status} · {kpi.trend}</span></article>)}{!companyManagement.data.kpis.length ? <p className="portfolio-empty">No canonical metrics are defined. Connect a source and define semantic metrics in Data.</p> : null}</div>
                  ) : null}
                  {managementTab === "Objectives" && companyManagement.data ? (
                    <div className="management-table">{companyManagement.data.objectives.map((objective) => <article key={objective.objectiveId}><div><strong>{objective.title}</strong><small>{objective.status} · {objective.recommendation}</small></div><b>{objective.progressPercent}%</b><span>{objective.risk} risk · schedule {objective.components.schedule} · budget {objective.components.budget} · data {objective.components.dataConfidence}</span></article>)}{!companyManagement.data.objectives.length ? <p className="portfolio-empty">No company objectives exist. Create one to establish accountable progress and budget evidence.</p> : null}</div>
                  ) : null}
                  {managementTab === "Departments" && companyManagement.data ? (
                    <div className="management-table">{companyManagement.data.departments.map((department) => <article key={department.id}><div><strong>{department.name}</strong><small>{department.activeAgents} active agents · {department.availableCredits} credits</small></div><b>{department.objectiveCount} objectives</b><span>{department.kpiCount} owned KPIs · {department.risks.length} risks</span></article>)}{!companyManagement.data.departments.length ? <p className="portfolio-empty">No departments are configured. Build the company workforce to assign accountability.</p> : null}</div>
                  ) : null}
                  {managementTab === "Reviews" && companyManagement.data ? (
                    <article className="management-detail-card"><div className="panel-heading"><h3>Latest management review</h3><button disabled={generateReview.isPending} onClick={() => generateReview.mutate()} type="button">{generateReview.isPending ? "Generating…" : "Generate review"}</button></div>{companyManagement.data.latestReview ? <><strong>{companyManagement.data.latestReview.cadence} · {companyManagement.data.latestReview.companyState}</strong><p>{companyManagement.data.latestReview.recommendations.join(" ") || "No recommendations."}</p><small>{new Date(companyManagement.data.latestReview.generatedAt).toLocaleString()} · advisory only</small></> : <p>No review has been generated. Reviews persist structured evidence and recommendations, never hidden reasoning.</p>}</article>
                  ) : null}
                  {managementTab === "Decisions" && companyManagement.data ? (
                    <div className="management-table">{companyManagement.data.decisions.map((decision) => <article key={decision.id}><div><strong>{decision.question}</strong><small>{decision.status} · {decision.alternatives.join(" / ")}</small></div><b>{decision.selectedOption ?? "Pending"}</b><span>Expected: {decision.expectedOutcome ?? "not recorded"} · Actual: {decision.actualOutcome ?? "not reviewed"}</span></article>)}{!companyManagement.data.decisions.length ? <p className="portfolio-empty">No structured management decisions have been recorded.</p> : null}</div>
                  ) : null}
                  {companyManagement.error instanceof Error ? <p className="error-banner">{companyManagement.error.message}</p> : null}
                  {generateReview.error instanceof Error ? <p className="error-banner">{generateReview.error.message}</p> : null}
                </section>
              ) : null}
              {isActiveCompany ? (
                <section
                  className="company-information"
                  aria-label="Company information plane"
                >
                  <div
                    className="company-data-tabs"
                    role="tablist"
                    aria-label="Company operational context"
                  >
                    {(["Data", "Metrics", "Integrations", "Memory"] as const).map(
                      (tab) => (
                        <button
                          aria-selected={dataTab === tab}
                          key={tab}
                          onClick={() => setDataTab(tab)}
                          role="tab"
                          type="button"
                        >
                          {tab}
                        </button>
                      ),
                    )}
                  </div>
                  {companyData.isPending ? (
                    <p className="notice">
                      Loading company-scoped operational context...
                    </p>
                  ) : null}
                  {dataTab === "Data" && companyData.data ? (
                    <div className="company-data-grid">
                      <article>
                        <h3>Sources</h3>
                        {companyData.data.sources.length ? (
                          companyData.data.sources.map((source) => (
                            <div className="company-data-row" key={source.id}>
                              <span>
                                <strong>{source.displayName}</strong>
                                <small>
                                  {source.provider} ·{" "}
                                  {source.ingestionMode.toLowerCase()}
                                </small>
                              </span>
                              <em>{source.status}</em>
                            </div>
                          ))
                        ) : (
                          <p>No connected sources.</p>
                        )}
                      </article>
                      <article>
                        <h3>Datasets</h3>
                        {companyData.data.datasets.length ? (
                          companyData.data.datasets.map((dataset) => (
                            <div className="company-data-row" key={dataset.id}>
                              <span>
                                <strong>{dataset.canonicalName}</strong>
                                <small>
                                  {dataset.logicalContract} ·{" "}
                                  {dataset.sensitivity.toLowerCase()} ·{" "}
                                  {dataset.freshness.state.toLowerCase()}
                                </small>
                              </span>
                              <em>{dataset.status}</em>
                            </div>
                          ))
                        ) : (
                          <p>No registered datasets.</p>
                        )}
                      </article>
                      <article>
                        <h3>Pipelines</h3>
                        {companyData.data.pipelines.length ? (
                          companyData.data.pipelines.map((pipeline) => (
                            <div className="company-data-row" key={pipeline.id}>
                              <span>
                                <strong>{pipeline.connectorKey}</strong>
                                <small>
                                  {pipeline.triggerMode.toLowerCase()} ·{" "}
                                  {pipeline.schemaContract.toLowerCase()}
                                </small>
                              </span>
                              <em>{pipeline.status}</em>
                            </div>
                          ))
                        ) : (
                          <p>No ingestion pipelines.</p>
                        )}
                      </article>
                    </div>
                  ) : null}
                  {dataTab === "Metrics" && companyData.data ? (
                    <div className="company-data-grid single">
                      <article>
                        <h3>Canonical business metrics</h3>
                        {companyData.data.metrics.length ? (
                          companyData.data.metrics.map((metric) => (
                            <div
                              className="company-data-row metric"
                              key={metric.definition.id}
                            >
                              <span>
                                <strong>{metric.definition.name}</strong>
                                <small>
                                  {metric.definition.formula} · v
                                  {metric.definition.version} · {metric.definition.unit}
                                </small>
                              </span>
                              <b>
                                {metric.observation?.value ?? "—"}
                                <small>{metric.freshness.toLowerCase()}</small>
                              </b>
                            </div>
                          ))
                        ) : (
                          <p>No canonical metrics defined.</p>
                        )}
                      </article>
                    </div>
                  ) : null}
                  {dataTab === "Integrations" && companyData.data ? (
                    <div className="company-data-grid single">
                      <article>
                        <h3>Governed integration bindings</h3>
                        {companyData.data.integrations.length ? (
                          companyData.data.integrations.map((binding) => (
                            <div className="company-data-row" key={binding.id}>
                              <span>
                                <strong>{binding.provider}</strong>
                                <small>
                                  {binding.integrationType} ·{" "}
                                  {binding.capabilitiesExposed.join(", ") ||
                                    "no exposed capabilities"}{" "}
                                  · synced{" "}
                                  {binding.lastSyncAt
                                    ? new Date(binding.lastSyncAt).toLocaleString()
                                    : "never"}
                                </small>
                              </span>
                              <em>{binding.status}</em>
                            </div>
                          ))
                        ) : (
                          <p>No company integration bindings.</p>
                        )}
                      </article>
                    </div>
                  ) : null}
                  {dataTab === "Memory" && companyData.data ? (
                    <div className="company-data-grid">
                      <article>
                        <h3>Semantic memory</h3>
                        <div className="company-memory-total">
                          <strong>{companyData.data.memory.total}</strong>
                          <span>authorized indexed items</span>
                        </div>
                        {Object.entries(companyData.data.memory.byType).map(
                          ([type, count]) =>
                            count ? (
                              <div className="company-data-row" key={type}>
                                <span>{type.replaceAll("_", " ")}</span>
                                <em>{count}</em>
                              </div>
                            ) : null,
                        )}
                      </article>
                      <article>
                        <h3>Business glossary</h3>
                        <label className="company-glossary-search">
                          <Search size={14} />
                          <input
                            aria-label="Search company glossary"
                            onChange={(event) => setGlossaryQuery(event.target.value)}
                            placeholder="Search terms and aliases"
                            value={glossaryQuery}
                          />
                        </label>
                        {companyData.data.glossary
                          .filter((term) =>
                            `${term.name} ${term.aliases.join(" ")} ${term.definition}`
                              .toLowerCase()
                              .includes(glossaryQuery.toLowerCase()),
                          )
                          .map((term) => (
                            <div className="company-data-row glossary" key={term.id}>
                              <span>
                                <strong>{term.name}</strong>
                                <small>{term.definition}</small>
                              </span>
                              <em>v{term.version}</em>
                            </div>
                          ))}
                      </article>
                    </div>
                  ) : null}
                  {companyData.error instanceof Error ? (
                    <p className="error-banner">{companyData.error.message}</p>
                  ) : null}
                </section>
              ) : current.status === "ACTIVE" ? (
                <p className="notice">
                  Open this company to inspect its isolated data, metrics, integrations,
                  and memory.
                </p>
              ) : null}
            </>
          ) : (
            <p>Select a company to inspect it.</p>
          )}
        </div>
      </div>

      <form
        className="company-create"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <h2>Create company</h2>
          <p>
            Creates isolated scopes and a dormant Governor. No credits, agents, or
            providers are started.
          </p>
        </div>
        <label>
          Name
          <input
            maxLength={160}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </label>
        <label>
          Industry
          <input
            maxLength={160}
            onChange={(event) => setIndustry(event.target.value)}
            value={industry}
          />
        </label>
        <label>
          Description
          <textarea
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </label>
        <button
          className="primary-button"
          disabled={create.isPending || !name.trim()}
          type="submit"
        >
          {create.isPending ? "Provisioning..." : "Create company"}
        </button>
      </form>
      {error instanceof Error ? <p className="error-banner">{error.message}</p> : null}
    </section>
  );
};
