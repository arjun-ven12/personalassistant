import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import type { ApiClient } from "./api.js";

export const IntegrationsPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [selectedIntegrationId, setSelectedIntegrationId] = useState("github");
  const [selectedCapabilityId, setSelectedCapabilityId] = useState(
    "github.repository.read",
  );
  const [operation, setOperation] = useState("repositories.list");
  const [target, setTarget] = useState("owner/repository");
  const [reason, setReason] = useState("Inspect engineering context.");
  const dashboard = useQuery({
    queryKey: ["integrations-dashboard"],
    queryFn: apiClient.getIntegrationsDashboard,
    refetchInterval: 10_000,
  });
  const permissions = useMemo(
    () => dashboard.data?.permissions ?? [],
    [dashboard.data?.permissions],
  );
  const capabilities = useMemo(
    () => dashboard.data?.capabilities ?? [],
    [dashboard.data?.capabilities],
  );
  const selectedCapability = capabilities.find(
    (capability) => capability.id === selectedCapabilityId,
  );
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["integrations-dashboard"] });
  };
  const setPermission = useMutation({
    mutationFn: apiClient.setIntegrationPermission,
    onSuccess: refresh,
  });
  const requestOperation = useMutation({
    mutationFn: apiClient.requestIntegrationOperation,
    onSuccess: refresh,
  });
  const grantState = (integrationId: string, capabilityId: string) =>
    permissions.find(
      (permission) =>
        permission.integrationId === integrationId &&
        permission.capabilityId === capabilityId,
    )?.state ?? "revoked";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    requestOperation.mutate({
      integrationId: selectedIntegrationId,
      capabilityId: selectedCapabilityId,
      operation,
      target,
      reason,
      dryRun: true,
      parameters: {},
    });
  };

  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Phase 6</p>
      <h1>Integration Manager</h1>
      <p>
        External engineering tools are treated as governed capabilities. Connector
        operations are authenticated, permission-scoped, audited, rate-limitable, and
        approval-gated before any live third-party mutation can happen.
      </p>

      <section className="status-grid">
        <article className="status-card">
          <span>Installed connectors</span>
          <strong>{dashboard.data?.integrations.length ?? 0}</strong>
          <small>Built-in descriptors</small>
        </article>
        <article className="status-card">
          <span>Capabilities</span>
          <strong>{capabilities.length}</strong>
          <small>Deny-by-default permissions</small>
        </article>
        <article className="status-card">
          <span>Operations</span>
          <strong>{dashboard.data?.operations.length ?? 0}</strong>
          <small>Audited request history</small>
        </article>
      </section>

      <section className="panel-list">
        <h2>Health dashboard</h2>
        {dashboard.data?.integrations.map((integration) => {
          const health = dashboard.data.health.find(
            (candidate) => candidate.integrationId === integration.id,
          );
          const usage = dashboard.data.usage.find(
            (candidate) => candidate.integrationId === integration.id,
          );
          return (
            <article className="panel" key={integration.id}>
              <p className="eyebrow">
                {integration.category} · {integration.status}
              </p>
              <h3>{integration.displayName}</h3>
              <p>{integration.healthSummary}</p>
              <dl>
                <div>
                  <dt>Health</dt>
                  <dd>{health?.state ?? "unknown"}</dd>
                </div>
                <div>
                  <dt>Credential</dt>
                  <dd>{health?.credentialStatus ?? "missing"}</dd>
                </div>
                <div>
                  <dt>Usage</dt>
                  <dd>{usage?.operationCount ?? 0} operation(s)</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </section>

      <section className="panel-list">
        <h2>Capability explorer</h2>
        {capabilities.map((capability) => (
          <article className="panel" key={capability.id}>
            <p className="eyebrow">
              {capability.integrationId} · {capability.risk}
            </p>
            <h3>{capability.name}</h3>
            <p>{capability.description}</p>
            <p>
              Operations: {capability.operations.join(", ")} · Approval:{" "}
              {capability.approvalRequired ? "required" : "not required"}
            </p>
            <div className="button-row">
              <button
                disabled={setPermission.isPending}
                type="button"
                onClick={() =>
                  setPermission.mutate({
                    integrationId: capability.integrationId,
                    capabilityId: capability.id,
                    grant: true,
                  })
                }
              >
                Grant
              </button>
              <button
                disabled={setPermission.isPending}
                type="button"
                onClick={() =>
                  setPermission.mutate({
                    integrationId: capability.integrationId,
                    capabilityId: capability.id,
                    grant: false,
                  })
                }
              >
                Revoke
              </button>
              <small>
                Permission: {grantState(capability.integrationId, capability.id)}
              </small>
            </div>
          </article>
        ))}
      </section>

      <form className="policy-form" onSubmit={submit}>
        <h2>Operation request</h2>
        <p>
          This creates an audited dry-run integration request. Live third-party
          execution remains disabled until a connector has credentials and approval
          wiring.
        </p>
        <label>
          Integration
          <select
            value={selectedIntegrationId}
            onChange={(event) => {
              const integrationId = event.target.value;
              const firstCapability = capabilities.find(
                (capability) => capability.integrationId === integrationId,
              );
              setSelectedIntegrationId(integrationId);
              if (firstCapability) {
                setSelectedCapabilityId(firstCapability.id);
                setOperation(firstCapability.operations[0] ?? "");
              }
            }}
          >
            {dashboard.data?.integrations.map((integration) => (
              <option key={integration.id} value={integration.id}>
                {integration.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Capability
          <select
            value={selectedCapabilityId}
            onChange={(event) => {
              const capabilityId = event.target.value;
              const capability = capabilities.find(
                (candidate) => candidate.id === capabilityId,
              );
              setSelectedCapabilityId(capabilityId);
              setOperation(capability?.operations[0] ?? operation);
            }}
          >
            {capabilities
              .filter(
                (capability) => capability.integrationId === selectedIntegrationId,
              )
              .map((capability) => (
                <option key={capability.id} value={capability.id}>
                  {capability.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Operation
          <select
            value={operation}
            onChange={(event) => setOperation(event.target.value)}
          >
            {selectedCapability?.operations.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target
          <input value={target} onChange={(event) => setTarget(event.target.value)} />
        </label>
        <label>
          Reason
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <button disabled={requestOperation.isPending} type="submit">
          Create dry-run request
        </button>
      </form>

      <section className="panel-list">
        <h2>Audit explorer</h2>
        {dashboard.data?.operations.map((request) => (
          <article className="panel" key={request.id}>
            <p className="eyebrow">
              {request.status} · {request.policyDecision}
            </p>
            <h3>{request.operation}</h3>
            <p>{request.resultSummary}</p>
            <small>
              {request.integrationId} / {request.capabilityId} / {request.target}
            </small>
          </article>
        ))}
      </section>
    </section>
  );
};
