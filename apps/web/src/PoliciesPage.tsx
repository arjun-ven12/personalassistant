import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import type { ApiClient } from "./api.js";

export const PoliciesPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const tools = useQuery({ queryKey: ["tools"], queryFn: apiClient.getTools });
  const applications = useQuery({
    queryKey: ["applications"],
    queryFn: apiClient.getApplications,
  });
  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: apiClient.getWorkspaces,
  });
  const history = useQuery({
    queryKey: ["policy-evaluations"],
    queryFn: apiClient.getPolicyEvaluations,
  });
  const [toolName, setToolName] = useState("security.view");
  const [applicationId, setApplicationId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [argumentsText, setArgumentsText] = useState("{}");
  const [clientError, setClientError] = useState("");
  const selectedTool = useMemo(
    () => tools.data?.find((tool) => tool.name === toolName),
    [toolName, tools.data],
  );
  const evaluate = useMutation({
    mutationFn: apiClient.evaluatePolicy,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["policy-evaluations"] }),
        queryClient.invalidateQueries({ queryKey: ["approvals"] }),
        queryClient.invalidateQueries({ queryKey: ["audit"] }),
      ]);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setClientError("");
    try {
      const parsedArguments: unknown = JSON.parse(argumentsText);
      evaluate.mutate({
        action: {
          actionId: crypto.randomUUID(),
          toolName,
          arguments: parsedArguments as never,
          ...(selectedTool?.targetType === "application" && applicationId
            ? { applicationId }
            : {}),
          ...(selectedTool?.targetType === "workspace" && workspaceId
            ? { workspaceId }
            : {}),
        },
      });
    } catch {
      setClientError("Arguments must be valid bounded JSON.");
    }
  };

  const result = evaluate.data;
  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Deterministic governance simulation</p>
      <h1>Policies</h1>
      <p>
        Simulate authorization without running anything. An “allow” decision is
        policy-only; privileged execution remains unavailable.
      </p>
      <form className="policy-form" onSubmit={submit}>
        <label>
          Registered tool
          <select
            onChange={(event) => setToolName(event.target.value)}
            value={toolName}
          >
            {tools.data?.map((tool) => (
              <option key={tool.name} value={tool.name}>
                {tool.name} · {tool.riskLevel} · {tool.enabled ? "enabled" : "disabled"}
              </option>
            ))}
          </select>
        </label>
        {selectedTool?.targetType === "application" ? (
          <label>
            Registered application
            <select
              onChange={(event) => setApplicationId(event.target.value)}
              required
              value={applicationId}
            >
              <option value="">Select application</option>
              {applications.data?.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {selectedTool?.targetType === "workspace" ? (
          <label>
            Registered workspace
            <select
              onChange={(event) => setWorkspaceId(event.target.value)}
              required
              value={workspaceId}
            >
              <option value="">Select workspace</option>
              {workspaces.data?.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Non-executing JSON arguments
          <textarea
            maxLength={16_384}
            onChange={(event) => setArgumentsText(event.target.value)}
            rows={5}
            value={argumentsText}
          />
        </label>
        <button disabled={evaluate.isPending} type="submit">
          Simulate authorization
        </button>
      </form>
      {clientError ? <p className="form-error">{clientError}</p> : null}
      {evaluate.error instanceof Error ? (
        <p className="form-error">{evaluate.error.message}</p>
      ) : null}

      {result ? (
        <article className="policy-result" aria-live="polite">
          <div>
            <span className={`decision decision-${result.evaluation.decision}`}>
              {result.evaluation.decision}
            </span>
            <strong>{result.evaluation.reasonCode}</strong>
          </div>
          <p>{result.evaluation.humanReadableReason}</p>
          <dl>
            <div>
              <dt>Risk</dt>
              <dd>{result.evaluation.riskLevel}</dd>
            </div>
            <div>
              <dt>Approval</dt>
              <dd>{result.evaluation.approvalRequirement}</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>{result.networkVerification}</dd>
            </div>
            <div>
              <dt>Execution available</dt>
              <dd>No</dd>
            </div>
          </dl>
          {result.evaluation.approvalRequestId ? (
            <p>
              Approval request: <code>{result.evaluation.approvalRequestId}</code>
            </p>
          ) : null}
          <details>
            <summary>Matched deterministic rules</summary>
            <ul>
              {result.evaluation.matchedRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </details>
        </article>
      ) : null}

      <h2>Recent evaluations</h2>
      <div className="compact-list">
        {history.data?.length === 0 ? <p>No policy evaluations yet.</p> : null}
        {history.data?.map((evaluation) => (
          <article key={evaluation.id}>
            <span className={`decision decision-${evaluation.decision}`}>
              {evaluation.decision}
            </span>
            <strong>{evaluation.reasonCode}</strong>
            <small>
              {evaluation.riskLevel} ·{" "}
              {new Date(evaluation.evaluatedAt).toLocaleString()}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
};
