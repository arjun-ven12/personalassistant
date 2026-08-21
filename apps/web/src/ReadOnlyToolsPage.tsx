import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import type { CreateExecutionRequest } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";

type DashboardReadOnlyTool = Exclude<
  CreateExecutionRequest["toolName"],
  "workspace.apply_patch" | "workspace.validate_profile" | "native.provider_capability"
>;

const terminal = new Set([
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
  "EXPIRED",
  "REJECTED",
]);

export const ReadOnlyToolsPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [toolName, setToolName] = useState<DashboardReadOnlyTool>(
    "workspace.inspect_metadata",
  );
  const [workspaceId, setWorkspaceId] = useState("");
  const [relativePath, setRelativePath] = useState("");
  const [mode, setMode] = useState<
    | "unstaged_summary"
    | "staged_summary"
    | "unstaged_name_status"
    | "staged_name_status"
  >("unstaged_summary");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exportPayload, setExportPayload] = useState<unknown>(null);
  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: apiClient.getWorkspaces,
  });
  const executions = useQuery({
    queryKey: ["executions"],
    queryFn: apiClient.getExecutions,
    refetchInterval: 2_000,
  });
  const detail = useQuery({
    queryKey: ["execution", selectedId],
    queryFn: () => apiClient.getExecution(selectedId!),
    enabled: Boolean(selectedId),
    refetchInterval: (query) =>
      query.state.data && terminal.has(query.state.data.request.status) ? false : 1_500,
  });
  const create = useMutation({
    mutationFn: (input: CreateExecutionRequest) => apiClient.createExecution(input),
    onSuccess: async (request) => {
      setSelectedId(request.id);
      await queryClient.invalidateQueries({ queryKey: ["executions"] });
    },
  });
  const cancel = useMutation({
    mutationFn: apiClient.cancelExecution,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["executions"] }),
        queryClient.invalidateQueries({ queryKey: ["execution", selectedId] }),
      ]);
    },
  });
  const exportExecution = useMutation({
    mutationFn: apiClient.exportExecution,
    onSuccess: (payload) => setExportPayload(payload),
  });
  const cleanup = useMutation({
    mutationFn: apiClient.cleanupExecutions,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["executions"] });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId) return;
    const input =
      toolName === "workspace.read_file"
        ? { toolName, arguments: { workspaceId, relativePath } }
        : toolName === "git.diff"
          ? { toolName, arguments: { workspaceId, mode } }
          : { toolName, arguments: { workspaceId } };
    create.mutate(input);
  };

  const result = detail.data?.result?.result;
  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Constrained Mac inspection</p>
      <h1>Read-only tools</h1>
      <p>
        Only bounded registered-workspace and Git inspection is available. Privileged
        and write execution remain unavailable.
      </p>
      <form className="policy-form" onSubmit={submit}>
        <label>
          Enabled workspace
          <select
            required
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
          >
            <option value="">Select workspace</option>
            {workspaces.data
              ?.filter((workspace) => workspace.enabled)
              .map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.displayName}
                </option>
              ))}
          </select>
        </label>
        <label>
          Fixed read-only capability
          <select
            value={toolName}
            onChange={(event) => setToolName(event.target.value as typeof toolName)}
          >
            <option value="workspace.inspect_metadata">
              Inspect workspace metadata
            </option>
            <option value="workspace.read_file">Read registered file</option>
            <option value="git.status">Inspect Git status</option>
            <option value="git.diff">Inspect Git changes</option>
            <option value="git.current_branch">Inspect current branch</option>
          </select>
        </label>
        {toolName === "workspace.read_file" ? (
          <label>
            Normalised relative path
            <input
              required
              maxLength={1_024}
              pattern="^(?!/)(?!.*(?:^|/)\.\.?/)(?!.*[*?[\]{}]).+$"
              value={relativePath}
              onChange={(event) => setRelativePath(event.target.value)}
              placeholder="src/index.ts"
            />
          </label>
        ) : null}
        {toolName === "git.diff" ? (
          <label>
            Fixed summary mode
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as typeof mode)}
            >
              <option value="unstaged_summary">Unstaged summary</option>
              <option value="staged_summary">Staged summary</option>
              <option value="unstaged_name_status">Unstaged names/status</option>
              <option value="staged_name_status">Staged names/status</option>
            </select>
          </label>
        ) : null}
        <button disabled={create.isPending} type="submit">
          Create read-only request
        </button>
      </form>
      {create.error instanceof Error ? (
        <p className="form-error">{create.error.message}</p>
      ) : null}

      <h2>Execution history</h2>
      <button
        className="secondary-button"
        disabled={cleanup.isPending}
        onClick={() => cleanup.mutate()}
        type="button"
      >
        Clean expired records
      </button>
      <div className="compact-list">
        {executions.data?.map((execution) => (
          <article key={execution.id} onClick={() => setSelectedId(execution.id)}>
            <strong>{execution.toolName}</strong>
            <span className={`trust-pill trust-${execution.status.toLowerCase()}`}>
              {execution.status}
            </span>
            <small>
              {execution.workspaceId} · {new Date(execution.createdAt).toLocaleString()}
            </small>
          </article>
        ))}
      </div>
      {detail.data ? (
        <article className="policy-result">
          <h2>Selected result</h2>
          <p>
            Status: <strong>{detail.data.request.status}</strong>
          </p>
          <p>
            Assigned device: <code>{detail.data.request.deviceId}</code>
          </p>
          <p>
            Server key:{" "}
            <code>{detail.data.provenance.serverKeyFingerprint ?? "not recorded"}</code>
          </p>
          <p>
            Workspace root hash:{" "}
            <code>{detail.data.provenance.workspaceRootHash ?? "not recorded"}</code>
          </p>
          <p>
            Result digest:{" "}
            <code>{detail.data.provenance.resultDigest ?? "not available"}</code>
          </p>
          <p>Privileged execution: unavailable · write execution: unavailable</p>
          {!terminal.has(detail.data.request.status) ? (
            <button
              className="danger-button"
              onClick={() => cancel.mutate(detail.data.request.id)}
              type="button"
            >
              Cancel request
            </button>
          ) : null}
          <button
            className="secondary-button"
            disabled={exportExecution.isPending}
            onClick={() => exportExecution.mutate(detail.data.request.id)}
            type="button"
          >
            Export provenance
          </button>
          {result ? (
            <pre>{JSON.stringify(result, null, 2)}</pre>
          ) : detail.data.request.failureCode ? (
            <p className="form-error">{detail.data.request.failureCode}</p>
          ) : (
            <p>Waiting for the trusted Mac agent.</p>
          )}
          {exportPayload ? <pre>{JSON.stringify(exportPayload, null, 2)}</pre> : null}
        </article>
      ) : null}
    </section>
  );
};
