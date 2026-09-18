import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  CirclePause,
  CirclePlay,
  ExternalLink,
  Plus,
  RotateCcw,
  Square,
  Timer,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { ApiClientError, type ApiClient } from "./api.js";
import {
  engineeringFirstRunMessage,
  formatEngineeringLoadError,
  isEligibleEngineeringRoot,
} from "./engineeringControlCenterState.js";

const duration = (milliseconds: number) => {
  const seconds = Math.floor(milliseconds / 1_000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

export const EngineeringControlCenterPage = ({
  apiClient,
}: {
  apiClient: ApiClient;
}) => {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [request, setRequest] = useState("");
  const [projectName, setProjectName] = useState("");
  const [mode, setMode] = useState<"NEW" | "EXISTING">("NEW");
  const [rootId, setRootId] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [instruction, setInstruction] = useState("");
  const deliveries = useQuery({
    queryKey: ["engineering-deliveries"],
    queryFn: apiClient.getEngineeringDeliveries,
    refetchInterval: 5_000,
  });
  const projects = useQuery({
    queryKey: ["engineering-projects"],
    queryFn: apiClient.getEngineeringProjects,
  });
  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: apiClient.getWorkspaces,
  });
  const eligibleRoots = useMemo(
    () => (workspaces.data ?? []).filter(isEligibleEngineeringRoot),
    [workspaces.data],
  );
  useEffect(() => {
    if (!selectedId && deliveries.data?.deliveries[0])
      setSelectedId(deliveries.data.deliveries[0].id);
  }, [deliveries.data, selectedId]);
  useEffect(() => {
    if (!rootId && eligibleRoots[0]) setRootId(eligibleRoots[0].id);
  }, [eligibleRoots, rootId]);
  const center = useQuery({
    queryKey: ["engineering-control-center", selectedId],
    queryFn: () => apiClient.getEngineeringControlCenter(selectedId!),
    enabled: Boolean(selectedId),
    refetchInterval: (query) => {
      const status = query.state.data?.delivery.status;
      return status &&
        ["DONE", "DONE_WITH_WARNINGS", "FAILED", "CANCELLED"].includes(status)
        ? false
        : 3_000;
    },
  });
  const refresh = async (
    data?: Awaited<ReturnType<ApiClient["getEngineeringControlCenter"]>>,
  ) => {
    if (data) {
      setSelectedId(data.delivery.id);
      client.setQueryData(["engineering-control-center", data.delivery.id], data);
    }
    await client.invalidateQueries({ queryKey: ["engineering-deliveries"] });
    await client.invalidateQueries({ queryKey: ["engineering-control-center"] });
  };
  const create = useMutation({
    mutationFn: () =>
      apiClient.createSoftwareObjective({
        request,
        projectName: projectName || null,
        repositoryId: mode === "EXISTING" ? repositoryId : null,
        developmentRootWorkspaceId: mode === "NEW" ? rootId : null,
        acceptanceCriteria: [],
        constraints: [],
        deadlineAt: null,
        visibleMode: false,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: async (data) => {
      setRequest("");
      setProjectName("");
      await refresh(data);
    },
  });
  const control = useMutation({
    mutationFn: (action: "pause" | "resume" | "cancel") =>
      apiClient.controlEngineeringDelivery(selectedId!, action),
    onSuccess: refresh,
  });
  const preview = useMutation({
    mutationFn: (action: "restart" | "stop") =>
      apiClient.controlEngineeringPreview(selectedId!, action),
    onSuccess: refresh,
  });
  const addInstruction = useMutation({
    mutationFn: () =>
      apiClient.addEngineeringInstruction(selectedId!, {
        instruction,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: async (data) => {
      setInstruction("");
      await refresh(data);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };
  const data = center.data;
  const deliveryCount = deliveries.data?.deliveries.length ?? 0;
  const firstRunMessage =
    workspaces.isSuccess && deliveries.isSuccess
      ? engineeringFirstRunMessage({
          workspaceCount: workspaces.data.length,
          eligibleRootCount: eligibleRoots.length,
          deliveryCount,
        })
      : null;
  const loadErrors = [
    workspaces.error
      ? formatEngineeringLoadError(
          workspaces.error,
          "Unable to load governed workspaces.",
        )
      : null,
    projects.error
      ? formatEngineeringLoadError(
          projects.error,
          "Unable to load engineering projects.",
        )
      : null,
    deliveries.error
      ? formatEngineeringLoadError(deliveries.error, "Unable to load delivery state.")
      : null,
    center.error
      ? formatEngineeringLoadError(center.error, "Unable to load delivery state.")
      : null,
  ].filter((message): message is string => Boolean(message));
  const totalCost =
    data?.delivery.modelUsage.reduce((sum, item) => sum + Number(item.costUsd), 0) ?? 0;

  return (
    <section className="engineering-control-center wide-page">
      <div className="engineering-command-row">
        <form className="panel engineering-request-form" onSubmit={submit}>
          <div>
            <p className="eyebrow">Alexa Engineering</p>
            <h2>What should I build?</h2>
          </div>
          <textarea
            aria-label="Software objective"
            onChange={(event) => setRequest(event.target.value)}
            placeholder="Build me a responsive SaaS landing page with pricing, testimonials, FAQ and a dark design."
            required
            value={request}
          />
          <div className="engineering-form-row">
            <input
              aria-label="Project name"
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Project name (optional)"
              value={projectName}
            />
            <select
              aria-label="Project mode"
              onChange={(event) => setMode(event.target.value as "NEW" | "EXISTING")}
              value={mode}
            >
              <option value="NEW">New project</option>
              <option value="EXISTING">Existing repository</option>
            </select>
            {mode === "NEW" ? (
              <select
                aria-label="Development root"
                onChange={(event) => setRootId(event.target.value)}
                required
                value={rootId}
              >
                <option value="">Select governed development root</option>
                {eligibleRoots.map((root) => (
                  <option key={root.id} value={root.id}>
                    {root.displayName}
                  </option>
                ))}
              </select>
            ) : (
              <select
                aria-label="Existing engineering project"
                onChange={(event) => setRepositoryId(event.target.value)}
                required
                value={repositoryId}
              >
                <option value="">Select existing project</option>
                {projects.data?.projects.map((project) => (
                  <option key={project.repositoryId} value={project.repositoryId}>
                    {project.projectName} · {project.status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            )}
            <button
              disabled={
                create.isPending ||
                !request ||
                (mode === "NEW" && !rootId) ||
                (mode === "EXISTING" && !repositoryId)
              }
              type="submit"
            >
              <Plus size={16} /> Build
            </button>
          </div>
          {create.error instanceof ApiClientError &&
          create.error.code === "APPROVAL_REQUIRED" ? (
            <p className="form-error" role="alert">
              Project initialization is awaiting approval. Open{" "}
              <a href="/approvals">Approvals</a>, approve the exact request, then click
              Build again with the same project details.
            </p>
          ) : create.error instanceof Error ? (
            <p className="form-error" role="alert">
              {create.error.message}
            </p>
          ) : null}
          {loadErrors.map((message) => (
            <p className="form-error" key={message} role="alert">
              {message}
            </p>
          ))}
          {firstRunMessage ? <p className="notice">{firstRunMessage}</p> : null}
        </form>
        <div className="panel engineering-project-list">
          <span>Recent projects</span>
          {deliveries.data?.deliveries.slice(0, 8).map((item) => (
            <button
              className={item.id === selectedId ? "active" : ""}
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              type="button"
            >
              <strong>{item.projectName}</strong>
              <small>{item.status.replaceAll("_", " ")}</small>
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="panel">
          <p>
            {deliveries.isPending || (Boolean(selectedId) && center.isPending)
              ? "Loading engineering state…"
              : deliveryCount === 0 && deliveries.isSuccess
                ? "No engineering deliveries yet. Choose a governed development root and start your first build."
                : center.error || deliveries.error
                  ? "Delivery state is unavailable. Review the error above and try again."
                  : "Select a recent project to see its delivery state."}
          </p>
        </div>
      ) : (
        <>
          <div className="engineering-mission-heading panel">
            <div>
              <p className="eyebrow">{data.delivery.intent.replaceAll("_", " ")}</p>
              <h2>{data.delivery.projectName}</h2>
              <p>{data.delivery.sourceRequest}</p>
            </div>
            <div className={`engineering-status ${data.delivery.status.toLowerCase()}`}>
              {data.delivery.status.replaceAll("_", " ")}
            </div>
          </div>
          <div className="metric-grid engineering-metrics">
            <article>
              <span>Overall</span>
              <strong>{data.overallProgress}%</strong>
            </article>
            <article>
              <span>Elapsed</span>
              <strong>{duration(data.elapsedMs)}</strong>
            </article>
            <article>
              <span>Agents</span>
              <strong>{data.activeAgents.length} active</strong>
            </article>
            <article>
              <span>Cost</span>
              <strong>${totalCost.toFixed(4)}</strong>
            </article>
            <article>
              <span>Tasks</span>
              <strong>
                {data.completedTasks}/{data.totalTasks}
              </strong>
            </article>
            <article>
              <span>Preview</span>
              <strong>{data.delivery.preview?.state ?? "WAITING"}</strong>
            </article>
          </div>
          <div className="engineering-progress-track">
            <span style={{ width: `${data.overallProgress}%` }} />
          </div>
          <div className="engineering-grid">
            <section className="panel">
              <div className="panel-heading">
                <h2>Features</h2>
                <small>Derived from real task state</small>
              </div>
              <div className="engineering-feature-list">
                {data.delivery.features.map((feature) => (
                  <article key={feature.id}>
                    <span className={`feature-dot ${feature.status.toLowerCase()}`} />{" "}
                    <strong>{feature.name}</strong>
                    <small>{feature.status.replaceAll("_", " ")}</small>
                  </article>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Validation</h2>
                <small>Configured project checks</small>
              </div>
              <div className="engineering-validation-list">
                {Object.entries(data.delivery.validation).map(([name, state]) => (
                  <article key={name}>
                    <span>{name}</span>
                    <strong
                      className={
                        state === "PASS" || state === "PASS_WITH_WARNINGS"
                          ? "pass"
                          : state === "FAIL"
                            ? "fail"
                            : ""
                      }
                    >
                      {state.replaceAll("_", " ")}
                    </strong>
                  </article>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Active work</h2>
                <small>{data.activeAgents.length} bounded workers</small>
              </div>
              {data.activeAgents.length ? (
                <div className="engineering-agent-list">
                  {data.activeAgents.map((agent) => (
                    <article key={agent.taskId}>
                      <Bot size={17} />
                      <div>
                        <strong>{agent.role.replaceAll("_", " ")}</strong>
                        <span>{agent.taskTitle}</span>
                      </div>
                      <small>
                        {agent.modelTier} · {duration(agent.elapsedMs)} · attempt{" "}
                        {agent.attempt}
                      </small>
                    </article>
                  ))}
                </div>
              ) : (
                <p>No agents currently active.</p>
              )}
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Model economics</h2>
                <small>Actual completed task usage</small>
              </div>
              <div className="engineering-validation-list">
                {data.delivery.modelUsage.map((usage) => (
                  <article key={usage.tier}>
                    <span>{usage.tier}</span>
                    <strong>
                      {usage.calls} calls · ${Number(usage.costUsd).toFixed(4)}
                    </strong>
                  </article>
                ))}
              </div>
            </section>
          </div>
          <section className="panel engineering-preview-panel">
            <div>
              <h2>Local preview</h2>
              <p>
                {data.delivery.preview?.state === "RUNNING"
                  ? `Healthy at ${data.delivery.preview.url}`
                  : "Preview will appear only after integration, validation, and review pass."}
              </p>
            </div>
            <div className="engineering-actions">
              {data.delivery.preview?.url &&
              data.delivery.preview.state === "RUNNING" ? (
                <a href={data.delivery.preview.url} rel="noreferrer" target="_blank">
                  <ExternalLink size={15} /> Open preview
                </a>
              ) : null}
              <button
                disabled={!data.delivery.preview || preview.isPending}
                onClick={() => preview.mutate("restart")}
                type="button"
              >
                <RotateCcw size={15} /> Restart
              </button>
              <button
                disabled={!data.delivery.preview || preview.isPending}
                onClick={() => preview.mutate("stop")}
                type="button"
              >
                <Square size={15} /> Stop
              </button>
            </div>
          </section>
          <section className="panel engineering-controls">
            <div className="engineering-actions">
              <button
                disabled={
                  control.isPending ||
                  data.delivery.status === "PAUSED" ||
                  ["DONE", "DONE_WITH_WARNINGS", "FAILED", "CANCELLED"].includes(
                    data.delivery.status,
                  )
                }
                onClick={() => control.mutate("pause")}
                type="button"
              >
                <CirclePause size={15} /> Pause
              </button>
              <button
                disabled={control.isPending || data.delivery.status !== "PAUSED"}
                onClick={() => control.mutate("resume")}
                type="button"
              >
                <CirclePlay size={15} /> Resume
              </button>
              <button
                className="danger-button"
                disabled={
                  control.isPending ||
                  ["CANCELLED", "DONE", "DONE_WITH_WARNINGS"].includes(
                    data.delivery.status,
                  )
                }
                onClick={() => control.mutate("cancel")}
                type="button"
              >
                <Square size={15} /> Cancel
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                addInstruction.mutate();
              }}
            >
              <input
                aria-label="Additional engineering instruction"
                disabled={[
                  "DONE",
                  "DONE_WITH_WARNINGS",
                  "FAILED",
                  "CANCELLED",
                ].includes(data.delivery.status)}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="Also add an FAQ…"
                value={instruction}
              />
              <button
                disabled={
                  !instruction ||
                  addInstruction.isPending ||
                  ["DONE", "DONE_WITH_WARNINGS", "FAILED", "CANCELLED"].includes(
                    data.delivery.status,
                  )
                }
                type="submit"
              >
                Add instruction
              </button>
            </form>
          </section>
          <div className="engineering-grid">
            <section className="panel">
              <div className="panel-heading">
                <h2>Activity</h2>
                <Activity size={17} />
              </div>
              <div className="engineering-timeline">
                {data.timeline
                  .slice()
                  .reverse()
                  .slice(0, 20)
                  .map((event) => (
                    <article key={event.id}>
                      <Timer size={14} />
                      <div>
                        <strong>{event.summary}</strong>
                        <small>
                          {new Date(event.at).toLocaleTimeString()} ·{" "}
                          {event.type.replaceAll("_", " ")}
                        </small>
                      </div>
                    </article>
                  ))}
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Changed files</h2>
                <WalletCards size={17} />
              </div>
              <div className="engineering-files">
                {data.delivery.filesChanged.length ? (
                  data.delivery.filesChanged.map((file) => (
                    <code key={file}>{file}</code>
                  ))
                ) : (
                  <p>Integrated file evidence will appear here.</p>
                )}
              </div>
              {data.delivery.warnings.map((warning) => (
                <p className="form-error" key={warning}>
                  {warning}
                </p>
              ))}
            </section>
          </div>
        </>
      )}
    </section>
  );
};
