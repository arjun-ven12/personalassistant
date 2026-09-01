import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, Box, ShieldCheck } from "lucide-react";

import type { ApiClient } from "./api.js";

const stateClass = (value: string) => `portfolio-${value.toLowerCase()}`;

export const CrossCompanyServicesPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const dashboard = useQuery({
    queryKey: ["cross-company-services"],
    queryFn: apiClient.getCrossCompanyServices,
    refetchInterval: 15_000,
  });
  const data = dashboard.data;
  const active =
    data?.requests.filter((request) =>
      [
        "REQUESTED",
        "NEEDS_APPROVAL",
        "ACCEPTED",
        "BUDGET_BLOCKED",
        "RUNNING",
        "WAITING",
        "REVIEW",
      ].includes(request.status),
    ) ?? [];

  return (
    <section
      className="placeholder-page wide-page portfolio-page"
      aria-labelledby="services-heading"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Governed portfolio execution</p>
          <h1 id="services-heading">Cross-company services</h1>
          <p>
            Explicit service contracts, durable progress, approved output boundaries,
            and isolated sandbox results.
          </p>
        </div>
        <span className="portfolio-healthy">
          <ShieldCheck size={15} /> deny by default
        </span>
      </div>
      <section className="status-grid">
        <article className="status-card">
          <span>
            <ArrowRight size={14} />
            Active services
          </span>
          <strong>{active.length}</strong>
          <small>destination-governed</small>
        </article>
        <article className="status-card">
          <span>
            <Activity size={14} />
            Durable runs
          </span>
          <strong>{data?.executions.length ?? 0}</strong>
          <small>replayable histories</small>
        </article>
        <article className="status-card">
          <span>
            <Box size={14} />
            Sandbox runs
          </span>
          <strong>{data?.sandboxResults.length ?? 0}</strong>
          <small>
            ephemeral environments · {data?.operationalWarnings.length ?? 0} warnings
          </small>
        </article>
      </section>
      {dashboard.isPending ? (
        <p className="notice">Loading governed service history…</p>
      ) : null}
      <section className="dashboard-grid two-column-grid">
        <article className="panel">
          <h2>Service contracts</h2>
          {data?.requests.map((request) => (
            <div className="portfolio-service" key={request.id}>
              <span>
                <strong>{request.serviceType}</strong>
                <small>
                  {request.sourceCompanyId.slice(0, 8)} <ArrowRight size={10} />{" "}
                  {request.destinationCompanyId.slice(0, 8)} ·{" "}
                  {request.sharedInput.scope} · estimated {request.estimatedCostCredits}
                  {" · "}reserved {request.reservedCostCredits} · settled{" "}
                  {request.settledCostCredits} credits
                </small>
                <small>
                  economy {request.economyState} · assignment{" "}
                  {request.destinationAssignmentId?.slice(0, 12) ?? "unresolved"} ·
                  definition{" "}
                  {request.workforceResolution?.selectedDefinitionId ?? "unresolved"}
                </small>
                {request.waitReason ? (
                  <small>
                    {request.waitReason.includes("outcome is unknown")
                      ? "Execution outcome could not be safely established. Manual reconciliation may be required."
                      : request.waitReason}
                  </small>
                ) : null}
                <small>
                  deadline{" "}
                  {request.deadline
                    ? new Date(request.deadline).toLocaleString()
                    : "none"}{" "}
                  · trace {request.traceId.slice(0, 12)}
                </small>
              </span>
              <b className={stateClass(request.status)}>{request.status}</b>
            </div>
          ))}
          {!data?.requests.length ? (
            <p>No cross-company service has been requested.</p>
          ) : null}
        </article>
        <article className="panel">
          <h2>Durable execution history</h2>
          {data?.executions.map((execution) => (
            <div className="portfolio-trace" key={execution.id}>
              <span>
                <strong>{execution.currentStep ?? "terminal"}</strong>
                <small>
                  {execution.backend} · attempt {execution.attempt}/
                  {execution.maxAttempts} · trace {execution.traceId.slice(0, 12)}
                </small>
                <small>
                  lease {execution.leaseOwner?.slice(0, 18) ?? "idle"} · generation{" "}
                  {execution.leaseGeneration} · expires{" "}
                  {execution.leaseExpiresAt
                    ? new Date(execution.leaseExpiresAt).toLocaleTimeString()
                    : "—"}
                </small>
              </span>
              <b className={stateClass(execution.status)}>{execution.status}</b>
            </div>
          ))}
          {!data?.executions.length ? (
            <p>No durable execution history is available.</p>
          ) : null}
        </article>
      </section>
      {dashboard.error instanceof Error ? (
        <p className="error-banner">{dashboard.error.message}</p>
      ) : null}
    </section>
  );
};
