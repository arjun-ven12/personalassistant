import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { useMemo, useState } from "react";

import type { ApiClient } from "./api.js";

type Tab = "Overview" | "Business" | "System" | "AI";
const statusClass = (value: string) => `portfolio-${value.toLowerCase()}`;

export const PortfolioPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const [tab, setTab] = useState<Tab>("Overview");
  const portfolio = useQuery({
    queryKey: ["owner-portfolio"],
    queryFn: apiClient.getOwnerPortfolio,
    refetchInterval: 30_000,
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
            {data.companies.map((company) => (
              <article className="portfolio-company-card" key={company.companyId}>
                <header>
                  <div>
                    <h2>{company.companyName}</h2>
                    <small>{company.companyStatus}</small>
                  </div>
                  <strong>
                    {company.health.filter((item) => item.state === "CRITICAL").length
                      ? "CRITICAL"
                      : company.health.some((item) => item.state === "WARNING")
                        ? "ATTENTION"
                        : "STABLE"}
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
              </article>
            ))}
          </section>
          <section className="dashboard-grid two-column-grid">
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
                </div>
              ))}
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
          </article>
          <article className="panel">
            <h2>
              <GitBranch size={16} />
              Trace inspector
            </h2>
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
          </article>
          <article className="panel">
            <h2>
              <Bot size={16} />
              AI traces
            </h2>
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
