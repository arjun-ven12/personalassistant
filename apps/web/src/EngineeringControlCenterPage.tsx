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
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

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
  const [composerMode, setComposerMode] = useState<"DELIVERY" | "PROJECT">("DELIVERY");
  const [projectSearch, setProjectSearch] = useState("");
  const [projectRequest, setProjectRequest] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const messageKey = useRef<string | null>(null);
  const lastAutoSelectedRun = useRef<string | null>(null);
  const deliveries = useQuery({
    queryKey: ["engineering-deliveries"],
    queryFn: apiClient.getEngineeringDeliveries,
    refetchInterval: 5_000,
  });
  const projects = useQuery({
    queryKey: ["engineering-projects"],
    queryFn: apiClient.getEngineeringProjects,
  });
  const sessions = useQuery({
    queryKey: ["engineering-project-sessions"],
    queryFn: apiClient.getEngineeringProjectSessions,
  });
  const selectedProject = projects.data?.projects.find(
    (project) => project.repositoryId === repositoryId,
  );
  useEffect(() => {
    if (!projects.isSuccess) return;
    const available = projects.data.projects;
    if (repositoryId && !available.some((project) => project.repositoryId === repositoryId)) {
      setRepositoryId("");
      setSelectedSessionId(null);
      setProjectRequest("");
      window.localStorage.removeItem("engineering-last-repository");
      return;
    }
    if (!repositoryId) {
      const previous = window.localStorage.getItem("engineering-last-repository");
      if (previous && available.some((project) => project.repositoryId === previous)) setRepositoryId(previous);
    }
  }, [projects.isSuccess, projects.data, repositoryId]);
  const projectSessions = sessions.data?.sessions.filter(
    (session) => session.repositoryId === repositoryId,
  ) ?? [];
  const activeSessionId = selectedSessionId && projectSessions.some(
    (session) => session.id === selectedSessionId,
  ) ? selectedSessionId : projectSessions[0]?.id ?? null;
  const projectSession = useQuery({
    queryKey: ["engineering-project-session", activeSessionId],
    queryFn: () => apiClient.getEngineeringProjectSession(activeSessionId!),
    enabled: composerMode === "PROJECT" && Boolean(activeSessionId),
  });
  useEffect(() => {
    if (composerMode === "PROJECT" && activeSessionId && deliveries.dataUpdatedAt) {
      void client.invalidateQueries({ queryKey: ["engineering-project-session", activeSessionId] });
    }
  }, [activeSessionId, client, composerMode, deliveries.dataUpdatedAt]);
  const currentProjectRun = projectSession.data?.runs.at(-1);
  useEffect(() => {
    if (composerMode === "PROJECT" && currentProjectRun && lastAutoSelectedRun.current !== currentProjectRun.deliveryId) {
      lastAutoSelectedRun.current = currentProjectRun.deliveryId;
      setSelectedId(currentProjectRun.deliveryId);
    }
  }, [composerMode, currentProjectRun, selectedId]);
  const matchingProjects = (projects.data?.projects ?? []).filter((project) => {
    const needle = projectSearch.trim().toLowerCase();
    return !needle || [project.projectName, project.repositoryName, ...project.stack]
      .some((value) => value.toLowerCase().includes(needle));
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
  const sendProjectMessage = useMutation({
    mutationFn: async () => {
      const text = projectRequest.trim();
      if (!repositoryId || !text) throw new Error("Choose a project and describe the change.");
      const sessionId = activeSessionId ?? (await apiClient.createEngineeringProjectSession({
        repositoryId,
        idempotencyKey: crypto.randomUUID(),
      })).session.id;
      const idempotencyKey = messageKey.current ?? crypto.randomUUID();
      messageKey.current = idempotencyKey;
      return apiClient.sendEngineeringProjectMessage(sessionId, {
        instruction: text,
        idempotencyKey,
      });
    },
    onSuccess: async (view) => {
      messageKey.current = null;
      setProjectRequest("");
      setSelectedSessionId(view.session.id);
      const latestRun = view.runs.at(-1);
      if (latestRun) setSelectedId(latestRun.deliveryId);
      await client.invalidateQueries({ queryKey: ["engineering-project-sessions"] });
      await client.invalidateQueries({ queryKey: ["engineering-project-session"] });
      await client.invalidateQueries({ queryKey: ["engineering-deliveries"] });
      await client.invalidateQueries({ queryKey: ["engineering-control-center"] });
    },
  });
  const updateProjectQueue = useMutation({
    mutationFn: (input: { requestId: string; action: "CANCEL" | "MOVE_UP" | "MOVE_DOWN" | "START_NEXT" }) =>
      apiClient.updateEngineeringProjectSessionQueue(activeSessionId!, input),
    onSuccess: async (view) => {
      client.setQueryData(["engineering-project-session", view.session.id], view);
      const activeRun = view.runs.at(-1);
      if (activeRun) setSelectedId(activeRun.deliveryId);
      await client.invalidateQueries({ queryKey: ["engineering-project-sessions"] });
      await client.invalidateQueries({ queryKey: ["engineering-deliveries"] });
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
  const data = composerMode === "PROJECT"
    ? currentProjectRun && center.data?.delivery.id === currentProjectRun.deliveryId
      ? center.data
      : undefined
    : center.data;
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
    sessions.error
      ? formatEngineeringLoadError(sessions.error, "Unable to load project sessions.")
      : null,
    projectSession.error
      ? formatEngineeringLoadError(projectSession.error, "Unable to load the selected project session.")
      : null,
  ].filter((message): message is string => Boolean(message));
  const totalCost =
    data?.delivery.modelUsage.reduce((sum, item) => sum + Number(item.costUsd), 0) ?? 0;

  return (
    <section className="engineering-control-center wide-page">
      <div className="engineering-command-row">
        <div className="engineering-composer-stack">
        <div className="engineering-mode-switch" role="tablist" aria-label="Engineering mode">
          <button aria-selected={composerMode === "DELIVERY"} onClick={() => setComposerMode("DELIVERY")} role="tab" type="button">New delivery</button>
          <button aria-selected={composerMode === "PROJECT"} onClick={() => setComposerMode("PROJECT")} role="tab" type="button">Modify project</button>
        </div>
        {composerMode === "DELIVERY" ? (
        <form className="panel engineering-request-form" onSubmit={submit}>
          <div className="engineering-terminal-topline" aria-hidden="true">
            <span className="engineering-terminal-dots"><i /><i /><i /></span>
            <span>engineering@governed:~</span>
            <span className="engineering-terminal-command">$ new delivery</span>
          </div>
          <div className="engineering-command-heading">
            <div>
              <p className="eyebrow">Alexa Engineering</p>
              <h2>What should I build?</h2>
            </div>
            <span className="engineering-scope-chip">policy scoped</span>
          </div>
          <label className="engineering-objective-console">
            <span aria-hidden="true">&gt;_</span>
            <textarea
              aria-label="Software objective"
              onChange={(event) => setRequest(event.target.value)}
              placeholder="Build me a responsive SaaS landing page with pricing, testimonials, FAQ and a dark design."
              required
              value={request}
            />
          </label>
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
                    {project.projectName} · {(project.status ?? project.repositoryStatus).replaceAll("_", " ")}
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
              <Plus size={16} /> {create.isPending ? "Starting…" : "Build"}
            </button>
          </div>
          {create.isPending ? (
            <div
              aria-live="polite"
              className="engineering-build-progress"
              role="status"
            >
              <div
                aria-label="Starting engineering build"
                aria-valuetext="Creating the governed project and delivery"
                className="engineering-build-progress-track"
                role="progressbar"
              >
                <span />
              </div>
              <div>
                <strong>Starting governed build…</strong>
                <small>
                  Creating the project, checking its registered capabilities, and
                  preparing the delivery.
                </small>
              </div>
            </div>
          ) : null}
          {create.error instanceof ApiClientError &&
          create.error.code === "APPROVAL_REQUIRED" ? (
            <p className="form-error" role="alert">
              Project initialization is awaiting approval. Keep this Engineering tab
              open, open{" "}
              <a href="/approvals" rel="noreferrer" target="_blank">
                Approvals in a new tab
              </a>
              , approve the exact request, return here, then click Build again. Your
              build details will remain in this tab.
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
        ) : (
          <div className="panel engineering-request-form engineering-project-terminal">
            <div className="engineering-terminal-topline" aria-hidden="true">
              <span className="engineering-terminal-dots"><i /><i /><i /></span>
              <span>engineering@governed:~</span>
              <span className="engineering-terminal-command">$ modify project</span>
            </div>
            <div className="engineering-command-heading">
              <div><p className="eyebrow">Alexa Engineering</p><h2>What should I change?</h2></div>
              <span className="engineering-scope-chip">policy scoped</span>
            </div>
            <label className="engineering-project-picker-label" htmlFor="engineering-project-search">Project</label>
            <input
              aria-label="Search engineering projects"
              id="engineering-project-search"
              onChange={(event) => setProjectSearch(event.target.value)}
              placeholder="Search projects, repositories, or technologies"
              value={projectSearch}
            />
            <select
              aria-label="Project to modify"
              onChange={(event) => {
                setRepositoryId(event.target.value);
                if (event.target.value) window.localStorage.setItem("engineering-last-repository", event.target.value);
                else window.localStorage.removeItem("engineering-last-repository");
                setSelectedSessionId(null);
                setProjectRequest("");
                messageKey.current = null;
              }}
              value={repositoryId}
            >
              <option value="">Select a registered repository</option>
              {matchingProjects.map((project) => (
                <option key={project.repositoryId} value={project.repositoryId}>
                  {project.projectName} · {project.repositoryName}
                </option>
              ))}
            </select>
            {selectedProject ? (
              <div className="engineering-selected-project" role="status">
                <strong>{selectedProject.projectName}</strong>
                <span>{selectedProject.stack.join(" · ") || "Stack not indexed"}</span>
                <small>{selectedProject.defaultBranch} · {selectedProject.repositoryStatus} · Modified {new Date(selectedProject.lastModifiedAt).toLocaleString()}</small>
              </div>
            ) : (
              <p className="engineering-project-hint">Select an active repository in this company. Changes use the governed Engineering Manager and isolated worktrees.</p>
            )}
            {selectedProject ? (
              <>
                <div className="engineering-session-heading">
                  <span>Project session</span>
                  <small>{projectSessions.length ? `${projectSessions.length} available` : "First session will start with your change"}</small>
                </div>
                {projectSessions.length > 1 ? (
                  <select aria-label="Project session" onChange={(event) => setSelectedSessionId(event.target.value)} value={activeSessionId ?? ""}>
                    {projectSessions.map((session) => <option key={session.id} value={session.id}>{new Date(session.createdAt).toLocaleString()} · {session.messages.length} messages</option>)}
                  </select>
                ) : null}
                <div className="engineering-session-transcript" aria-label="Project conversation">
                  {projectSession.data?.session.messages.length ? projectSession.data.session.messages.map((message) => (
                    <article key={message.id}>
                      <span>{message.role === "OWNER" ? "YOU" : "ALEXA"}</span>
                      <p>{message.text}</p>
                      {message.deliveryId ? <button onClick={() => setSelectedId(message.deliveryId)} type="button">{message.state ?? "RUN"} · View full run</button> : null}
                    </article>
                  )) : <p className="engineering-project-hint">No modifications in this session yet.</p>}
                </div>
                {currentProjectRun || projectSession.data?.session.queuedRequests.some((item) => ["QUEUED", "READY", "BLOCKED"].includes(item.status)) ? (
                  <div className="engineering-session-queue">
                    {currentProjectRun && !["DONE", "DONE_WITH_WARNINGS", "FAILED", "CANCELLED", "BLOCKED", "OWNER_INPUT_REQUIRED"].includes(currentProjectRun.status) ? (
                      <div><span>CURRENT</span><strong>{currentProjectRun.request}</strong><small>{currentProjectRun.status.replaceAll("_", " ")}</small></div>
                    ) : null}
                    {projectSession.data?.session.queuedRequests.filter((item) => ["QUEUED", "READY", "BLOCKED"].includes(item.status)).map((item, index, items) => (
                      <div key={item.id}>
                        <span>QUEUED {index + 1}</span><strong>{item.instruction}</strong><small>{item.status}</small>
                        <div className="engineering-queue-actions">
                          <button aria-label="Move queued request up" disabled={index === 0 || updateProjectQueue.isPending} onClick={() => updateProjectQueue.mutate({ requestId: item.id, action: "MOVE_UP" })} type="button">↑</button>
                          <button aria-label="Move queued request down" disabled={index === items.length - 1 || updateProjectQueue.isPending} onClick={() => updateProjectQueue.mutate({ requestId: item.id, action: "MOVE_DOWN" })} type="button">↓</button>
                          <button disabled={updateProjectQueue.isPending} onClick={() => updateProjectQueue.mutate({ requestId: item.id, action: "CANCEL" })} type="button">Remove</button>
                          {index === 0 && (!currentProjectRun || ["DONE", "DONE_WITH_WARNINGS", "FAILED", "CANCELLED", "BLOCKED", "OWNER_INPUT_REQUIRED"].includes(currentProjectRun.status)) ? (
                            <button disabled={updateProjectQueue.isPending} onClick={() => updateProjectQueue.mutate({ requestId: item.id, action: "START_NEXT" })} type="button">Start next</button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {projectSession.data?.runs.length ? (
                  <div className="engineering-session-runs">
                    <span>Project history</span>
                    {projectSession.data.runs.slice().reverse().slice(0, 6).map((run) => (
                      <button key={run.deliveryId} onClick={() => setSelectedId(run.deliveryId)} type="button">
                        <span>{run.request}</span><small>{run.status.replaceAll("_", " ")} · {run.filesChanged} files · ${Number(run.costUsd).toFixed(4)} · {duration(run.durationMs)}</small>
                      </button>
                    ))}
                  </div>
                ) : null}
                {currentProjectRun && center.data?.delivery.id === currentProjectRun.deliveryId ? (
                  <div className="engineering-session-live" aria-live="polite">
                    <div><strong>{center.data.delivery.status.replaceAll("_", " ")}</strong><span>{center.data.overallProgress}% · {center.data.activeAgents.length} active engineers</span></div>
                    {center.data.timeline.at(-1) ? <p>{center.data.timeline.at(-1)!.summary}</p> : null}
                    <div className="engineering-session-validation">
                      {Object.entries(center.data.delivery.validation).map(([name, state]) => <span key={name}>{name} {state.replaceAll("_", " ")}</span>)}
                    </div>
                    {center.data.delivery.filesChanged.length ? <small>{center.data.delivery.filesChanged.length} changed files · {center.data.delivery.filesChanged.slice(0, 4).join(", ")}</small> : null}
                    {center.data.delivery.preview?.state === "RUNNING" && center.data.delivery.preview.url ? <a href={center.data.delivery.preview.url} rel="noreferrer" target="_blank">Open preview <ExternalLink size={13} /></a> : null}
                    {center.data.blocker ? <p className="form-error">{center.data.blocker.message} {center.data.blocker.action}</p> : null}
                  </div>
                ) : null}
                <form onSubmit={(event) => { event.preventDefault(); sendProjectMessage.mutate(); }}>
                  <label className="engineering-objective-console">
                    <span aria-hidden="true">&gt;_</span>
                    <textarea aria-label="Project modification instruction" onChange={(event) => { setProjectRequest(event.target.value); messageKey.current = null; }} placeholder="Ask Alexa to modify this project…" required value={projectRequest} />
                  </label>
                  <button disabled={!projectRequest.trim() || sendProjectMessage.isPending} type="submit">{sendProjectMessage.isPending ? "Starting…" : "Send change"}</button>
                </form>
              </>
            ) : null}
            {sendProjectMessage.error instanceof Error ? <p className="form-error" role="alert">{sendProjectMessage.error.message}</p> : null}
            {loadErrors.map((message) => <p className="form-error" key={message} role="alert">{message}</p>)}
          </div>
        )}
        </div>
        <div className="panel engineering-project-list">
          <div className="engineering-project-list-heading">
            <span>Session history</span>
            <small>{deliveryCount} runs</small>
          </div>
          {deliveries.data?.deliveries.slice(0, 8).map((item, index) => (
            <button
              className={item.id === selectedId ? "active" : ""}
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              type="button"
            >
              <span className="engineering-project-run">{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.projectName}</strong>
              <small>{item.status.replaceAll("_", " ")}</small>
            </button>
          ))}
          {deliveries.isSuccess && deliveryCount === 0 ? (
            <p className="engineering-project-list-empty">No prior runs.</p>
          ) : null}
        </div>
      </div>

      {!data ? (
        <div className="panel">
          <p>
            {composerMode === "PROJECT" && !repositoryId
              ? "Choose a registered project to open its engineering session."
              : composerMode === "PROJECT" && !currentProjectRun
                ? "No modifications in this project session yet. Describe the first change above."
                : deliveries.isPending || (Boolean(selectedId) && center.isPending)
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
            <div className="engineering-terminal-topline engineering-run-topline" aria-hidden="true">
              <span>run://{data.delivery.id.slice(0, 8)}</span>
              <span className="engineering-terminal-command">live delivery state</span>
            </div>
            <div>
              <p className="eyebrow">{data.delivery.intent.replaceAll("_", " ")}</p>
              <h2>{data.delivery.projectName}</h2>
              <p>{data.delivery.sourceRequest}</p>
            </div>
            <div className={`engineering-status ${data.delivery.status.toLowerCase()}`}>
              {data.delivery.status.replaceAll("_", " ")}
            </div>
          </div>
          {control.error instanceof Error ? <p className="form-error" role="alert">{formatEngineeringLoadError(control.error, "Unable to update this engineering run.")}</p> : null}
          {data.blocker && ["BLOCKED", "FAILED", "OWNER_INPUT_REQUIRED"].includes(data.delivery.status) ? (
            <div className="panel engineering-blocker" role="alert">
              <div><p className="eyebrow">Blocked · {data.blocker.category.replaceAll("_", " ")}</p><h2>{data.blocker.message}</h2><p>{data.blocker.action}</p></div>
              <button disabled={control.isPending || data.delivery.status !== "BLOCKED"} onClick={() => control.mutate("resume")} type="button"><RotateCcw size={15} /> Retry</button>
            </div>
          ) : null}
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
                <h2><span className="engineering-panel-index">01</span> Features</h2>
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
                <h2><span className="engineering-panel-index">02</span> Validation</h2>
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
                <h2><span className="engineering-panel-index">03</span> Active work</h2>
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
                <h2><span className="engineering-panel-index">04</span> Model economics</h2>
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
              <p className="eyebrow">Preview endpoint</p>
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
            <div className="engineering-controls-label">
              <p className="eyebrow">Run controls</p>
              <span>Owner actions</span>
            </div>
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
                <h2><span className="engineering-panel-index">05</span> Activity</h2>
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
                <h2><span className="engineering-panel-index">06</span> Changed files</h2>
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
