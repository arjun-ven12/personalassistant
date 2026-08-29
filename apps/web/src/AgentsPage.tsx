import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import type { AgentPriority } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";
import { AgentEconomyPanel } from "./AgentEconomyPanel.js";
import { AgentWorkforceGraph } from "./AgentWorkforceGraph.js";

type AgentOperationsView =
  | "agents"
  | "workforce"
  | "economy"
  | "experiments"
  | "activity"
  | "system"
  | "settings";

const isAgentOperationsView = (value: string | null): value is AgentOperationsView =>
  value === "agents" ||
  value === "workforce" ||
  value === "economy" ||
  value === "experiments" ||
  value === "activity" ||
  value === "system" ||
  value === "settings";

export const AgentsPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [workspaceView, setWorkspaceView] = useState<AgentOperationsView>(() => {
    const view = new URLSearchParams(window.location.search).get("view");
    return isAgentOperationsView(view) ? view : "agents";
  });
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [agentId, setAgentId] = useState("planning_agent");
  const [title, setTitle] = useState("Plan a safe implementation");
  const [objective, setObjective] = useState(
    "Analyze the repository and produce a bounded implementation plan.",
  );
  const [priority, setPriority] = useState<AgentPriority>("normal");
  const [messageBody, setMessageBody] = useState("Share a status update.");
  const [consensusTopic, setConsensusTopic] = useState(
    "Security-sensitive implementation plan is ready for review.",
  );
  const [teamGoal, setTeamGoal] = useState(
    "Implement OAuth authentication with database migration, frontend updates, and security review.",
  );
  const [agentOsInput, setAgentOsInput] = useState(
    "Prepare bounded runtime context for advisory planning.",
  );
  const [societyGoal, setSocietyGoal] = useState(
    "Plan a secure repository intelligence improvement with security, testing, and documentation review.",
  );
  const [debateTopic, setDebateTopic] = useState(
    "Should this architecture change require a separate security review?",
  );
  const [debateArgument, setDebateArgument] = useState(
    "Security-sensitive architecture changes should include a visible dissent and consensus record before implementation planning.",
  );
  const [meetingSummary, setMeetingSummary] = useState(
    "Reviewed current organizational health and confirmed all work remains approval-gated.",
  );
  const dashboard = useQuery({
    queryKey: ["agents-dashboard"],
    queryFn: apiClient.getAgentsDashboard,
    refetchInterval: 10_000,
  });
  const agentOsDashboard = useQuery({
    queryKey: ["agent-os-dashboard"],
    queryFn: apiClient.getAgentOsDashboard,
    refetchInterval: 10_000,
  });
  const societyDashboard = useQuery({
    queryKey: ["agent-society-dashboard"],
    queryFn: apiClient.getAgentSocietyDashboard,
    refetchInterval: 10_000,
  });
  const workforce = useQuery({
    queryKey: ["agent-workforce-graph", "agents-directory"],
    queryFn: () => apiClient.getAgentWorkforceGraph("limit=160"),
    refetchInterval: 15_000,
  });
  const runtime = useQuery({
    queryKey: ["workforce-runtime"],
    queryFn: apiClient.getWorkforceRuntime,
    refetchInterval: 5_000,
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["agents-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["agent-os-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["agent-society-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["workforce-runtime"] });
  };
  const createTask = useMutation({
    mutationFn: apiClient.createAgentTask,
    onSuccess: refresh,
  });
  const queueRuntimeTask = useMutation({
    mutationFn: apiClient.createWorkforceRuntimeTask,
    onSuccess: refresh,
  });
  const runRuntimeTask = useMutation({
    mutationFn: apiClient.executeWorkforceRuntimeTask,
    onSuccess: refresh,
  });
  const cancelRuntimeTask = useMutation({
    mutationFn: apiClient.cancelWorkforceRuntimeTask,
    onSuccess: refresh,
  });
  const completeTask = useMutation({
    mutationFn: (taskId: string) =>
      apiClient.completeAgentTask(
        taskId,
        "Completed as a deterministic coordination record. No execution occurred.",
      ),
    onSuccess: refresh,
  });
  const sendMessage = useMutation({
    mutationFn: apiClient.sendAgentMessage,
    onSuccess: refresh,
  });
  const createConsensus = useMutation({
    mutationFn: apiClient.createAgentConsensus,
    onSuccess: refresh,
  });
  const composeTeam = useMutation({
    mutationFn: apiClient.composeAgentTeam,
    onSuccess: refresh,
  });
  const startAgentOsSession = useMutation({
    mutationFn: apiClient.startAgentOsSession,
    onSuccess: refresh,
  });
  const formSocietyTeam = useMutation({
    mutationFn: apiClient.formSocietyTeam,
    onSuccess: refresh,
  });
  const startSocietyDebate = useMutation({
    mutationFn: apiClient.startSocietyDebate,
    onSuccess: refresh,
  });
  const recordSocietyMeeting = useMutation({
    mutationFn: apiClient.recordSocietyMeeting,
    onSuccess: refresh,
  });
  const retireDynamicAgent = useMutation({
    mutationFn: (agentId: string) => apiClient.retireDynamicAgent(agentId),
    onSuccess: refresh,
  });
  const submitTask = (event: FormEvent) => {
    event.preventDefault();
    createTask.mutate({
      agentId,
      title,
      objective,
      priority,
      repositoryIds: [],
      evidence: ["Owner-created dashboard assignment."],
    });
  };
  const selectedAgent = dashboard.data?.agents.find((agent) => agent.id === agentId);
  const directoryAgents = (workforce.data?.nodes ?? [])
    .filter((agent) => agent.kind === "AGENT")
    .filter((agent) => `${agent.label} ${agent.subtitle}`.toLowerCase().includes(directoryQuery.trim().toLowerCase()))
    .slice(0, 20);
  const workspaceTabs = (
    <nav className="workspace-tabs agent-operations-tabs" aria-label="Agent workspace views">
      {[
        ["agents", "Agents"],
        ["workforce", "Workforce"],
        ["economy", "Economy"],
        ["experiments", "Experiments"],
        ["activity", "Activity"],
        ["system", "System"],
        ["settings", "Settings"],
      ].map(([view, label]) => (
        <button
          aria-current={workspaceView === view ? "page" : undefined}
          className={workspaceView === view ? "active" : undefined}
          key={view}
          onClick={() => setWorkspaceView(view as AgentOperationsView)}
          type="button"
        >
          {label}
        </button>
      ))}
    </nav>
  );

  if (workspaceView === "economy") {
    return (
      <section className="placeholder-page wide-page governance-page">
        <p className="eyebrow">Governed resource accounting</p>
        <h1>Agent Economy</h1>
        <p>Internal credits buy bounded resources, never permissions, approvals, capabilities, trust, or reputation.</p>
        {workspaceTabs}
        <AgentEconomyPanel apiClient={apiClient} />
      </section>
    );
  }

  if (workspaceView === "workforce") {
    return (
      <section className="placeholder-page wide-page governance-page workforce-page">
        <p className="eyebrow">Organizational intelligence</p>
        <h1>Agent Workforce</h1>
        <p>Inspect the Alexa-governed organization, dormant specialist registry, scoped memory, finite capabilities, and lazy runtime participation.</p>
        {workspaceTabs}
        <AgentWorkforceGraph apiClient={apiClient} />
      </section>
    );
  }

  if (workspaceView === "experiments") {
    return (
      <section className="placeholder-page wide-page governance-page">
        <p className="eyebrow">Strategy testing</p>
        <h1>Agent Experiments</h1>
        <p>Expose bounded objective experiments, variants, verified evidence, costs, and decisions without creating a second experiment engine.</p>
        {workspaceTabs}
        <AgentExperimentsPage apiClient={apiClient} />
      </section>
    );
  }

  if (workspaceView === "activity") {
    return (
      <section className="placeholder-page wide-page governance-page">
        <p className="eyebrow">Business activity</p>
        <h1>Agent Activity</h1>
        <p>CEO-readable operational events from the Business OS read model. Raw logs, prompts, and secrets stay out of this surface.</p>
        {workspaceTabs}
        <AgentActivityPage apiClient={apiClient} />
      </section>
    );
  }

  if (workspaceView === "system") {
    return (
      <section className="placeholder-page wide-page governance-page">
        <p className="eyebrow">Runtime health</p>
        <h1>Agent System</h1>
        <p>Safe Agent OS, scheduler, AIRouter, data, and economy summaries from existing health and runtime APIs.</p>
        {workspaceTabs}
        <AgentSystemPage apiClient={apiClient} />
      </section>
    );
  }

  if (workspaceView === "settings") {
    return (
      <section className="placeholder-page wide-page governance-page">
        <p className="eyebrow">Governed configuration</p>
        <h1>Agent Settings</h1>
        <p>Safe owner-facing runtime configuration that already exists in backend contracts. No fabricated toggles or authority shortcuts.</p>
        {workspaceTabs}
        <AgentSettingsPage apiClient={apiClient} />
      </section>
    );
  }

  return (
    <section className="placeholder-page wide-page governance-page agents-control-page">
      <p className="eyebrow">Agent operations</p>
      <h1>Alexa Workforce</h1>
      <p>
        Specialist agents coordinate through structured tasks, immutable messages,
        shared context, consensus records, and workflow checkpoints. No agent receives
        extra execution permission or can bypass patch approval.
      </p>
      {workspaceTabs}

      <section className="status-grid">
          <article className="status-card">
            <span>Agents</span>
          <strong>{workforce.data?.summary.registered ?? dashboard.data?.agents.length ?? 0}</strong>
          <small>Specialist registry</small>
        </article>
        <article className="status-card">
          <span>Active</span>
          <strong>
            {workforce.data?.summary.active ?? runtime.data?.summary.active ?? 0}
          </strong>
          <small>Lazy runtime participation</small>
        </article>
          <article className="status-card">
            <span>Dormant</span>
            <strong>{workforce.data?.summary.dormant ?? runtime.data?.summary.dormant ?? 0}</strong>
            <small>Metadata-only specialists</small>
        </article>
        <article className="status-card">
          <span>Open tasks</span>
          <strong>{(runtime.data?.summary.queued ?? 0) + (runtime.data?.summary.running ?? 0) + (runtime.data?.summary.waitingReview ?? 0)}</strong>
          <small>Queued, running, or review</small>
        </article>
      </section>

      <aside className="agents-side-rail" aria-label="Agent runtime controls">
        <section className="agent-rail-card agent-rail-runtime">
          <p className="eyebrow">Agent OS runtime</p>
          <div className="agent-rail-metrics">
            <span><strong>{agentOsDashboard.data?.manifests.length ?? 0}</strong><small>Registered</small></span>
            <span><strong>{agentOsDashboard.data?.packages.length ?? 0}</strong><small>Packages</small></span>
            <span><strong>{runtime.data?.summary.running ?? 0}</strong><small>Running</small></span>
            <span><strong>{agentOsDashboard.data?.sessions.length ?? 0}</strong><small>Sessions</small></span>
          </div>
          <p>Sessions prepare bounded context only. They do not deploy work or bypass approvals.</p>
          <button disabled={!selectedAgent || startAgentOsSession.isPending} onClick={() => startAgentOsSession.mutate({ agentId, inputSummary: agentOsInput })} type="button">Start Agent OS session</button>
          <input aria-label="Agent OS session context" onChange={(event) => setAgentOsInput(event.target.value)} value={agentOsInput} />
        </section>

        <section className="agent-rail-card agent-rail-capabilities">
          <p className="eyebrow">Capability registry</p>
          {(dashboard.data?.dynamicWorkforce?.capabilities ?? []).slice(0, 6).map((capability) => <div className="agent-capability-meter" key={capability.id}><span>{capability.id}</span><strong>{Math.round(capability.confidence * 100)}%</strong><i><b style={{ width: `${Math.round(capability.confidence * 100)}%` }} /></i></div>)}
          {(dashboard.data?.dynamicWorkforce?.capabilities.length ?? 0) === 0 ? <p className="agent-rail-empty">No bounded capability records are available.</p> : null}
        </section>

        <section className="agent-rail-card">
          <p className="eyebrow">Dynamic agents</p>
          <strong>{dashboard.data?.dynamicWorkforce?.dynamicAgents.length ?? 0} temporary agents active</strong>
          <p>Compose a governed team only for a detected capability gap.</p>
        </section>

        <section className="agent-rail-card agent-rail-adaptive">
          <p className="eyebrow">Adaptive workflows</p>
          <textarea aria-label="Adaptive workflow goal" onChange={(event) => setTeamGoal(event.target.value)} rows={3} value={teamGoal} />
          <button disabled={composeTeam.isPending} onClick={() => composeTeam.mutate({ goal: teamGoal, repositoryIds: [] })} type="button">Compose adaptive team</button>
        </section>

        <section className="agent-rail-card agent-rail-tasks">
          <p className="eyebrow">Task assignments</p>
          {(runtime.data?.tasks ?? []).filter((task) => !["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(task.status)).slice(0, 4).map((task) => <div className="agent-rail-task" key={task.id}><strong>{task.title}</strong><small>{task.status} · {task.assignedAgentId ?? "matching"}</small></div>)}
          {(runtime.data?.tasks.length ?? 0) === 0 ? <p className="agent-rail-empty">No live workforce tasks.</p> : null}
        </section>

        <section className="agent-rail-card">
          <p className="eyebrow">Message timeline</p>
          <input aria-label="Status message" onChange={(event) => setMessageBody(event.target.value)} value={messageBody} />
          <button disabled={!selectedAgent || sendMessage.isPending} onClick={() => sendMessage.mutate({ senderAgentId: "engineering_manager", recipientAgentId: agentId, messageType: "status", payload: { body: messageBody }, evidence: ["Dashboard-originated structured message."], priority: "normal" })} type="button">Send status message</button>
        </section>

        <section className="agent-rail-card">
          <p className="eyebrow">Consensus panel</p>
          <input aria-label="Consensus topic" onChange={(event) => setConsensusTopic(event.target.value)} value={consensusTopic} />
          <button disabled={createConsensus.isPending} onClick={() => createConsensus.mutate({ topic: consensusTopic, rule: "required_specialist", requiredAgentIds: ["security_agent", "review_agent", "testing_agent"] })} type="button">Open specialist consensus</button>
        </section>
      </aside>

      <div className="agents-main-column">
        <section className="panel-list workforce-runtime-panel">
        <div className="agent-runtime-heading">
          <div><p className="eyebrow">On-demand workforce</p><h2>Live task runtime</h2></div>
          <span>{runtime.data?.summary.active ?? 0} active · {runtime.data?.summary.dormant ?? 0} dormant · {runtime.data?.metrics.providerCalls ?? 0} provider calls · {Math.round(runtime.data?.metrics.matchingLatencyMs ?? 0)} ms match</span>
        </div>
        <form className="workforce-runtime-create" onSubmit={(event) => { event.preventDefault(); queueRuntimeTask.mutate({ createdByAgentId: "engineering_manager", assignedAgentId: null, title, objective, priority, requiredSkills: [], requiredCapabilities: [], economicBudget: 10, evidenceRefs: ["owner:dashboard"] }); }}>
          <input aria-label="Runtime task title" onChange={(event) => setTitle(event.target.value)} value={title} />
          <input aria-label="Runtime task objective" onChange={(event) => setObjective(event.target.value)} value={objective} />
          <button disabled={queueRuntimeTask.isPending} type="submit">Queue task</button>
        </form>
        <div className="workforce-runtime-list">
          {(runtime.data?.tasks ?? []).slice(0, 8).map((task) => {
            const selected = task.selection.find((score) => score.agentId === task.assignedAgentId) ?? task.selection[0];
            return <article key={task.id}>
              <i className={`runtime-task-state state-${task.status.toLowerCase()}`} />
              <div><strong>{task.title}</strong><span>{task.assignedAgentId ?? "Awaiting deterministic match"} · depth {task.depth} · {task.actualCost || task.reservedCredits} credits</span></div>
              {selected ? <small>match {Math.round(selected.finalScore * 100)}% · skills {Math.round(selected.skillFit * 100)}% · capabilities {Math.round(selected.capabilityFit * 100)}%</small> : <small>{task.status}</small>}
              <div className="runtime-task-actions">
                {task.status === "QUEUED" ? <button disabled={runRuntimeTask.isPending} onClick={() => runRuntimeTask.mutate(task.id)} type="button">Run</button> : null}
                {! ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(task.status) ? <button disabled={cancelRuntimeTask.isPending} onClick={() => cancelRuntimeTask.mutate(task.id)} type="button">Cancel</button> : null}
              </div>
            </article>;
          })}
          {(runtime.data?.tasks.length ?? 0) === 0 ? <p className="agent-rail-empty">Queue a bounded task to activate one specialist through the shared runtime.</p> : null}
        </div>
      </section>

      <section className="panel-list agent-society-panel">
        <h2>Agent Society</h2>
        <p>
          Agent Society organizes specialists into departments, task forces, leadership
          roles, debates, consensus sessions, peer review, mentorship, communications,
          reputation, and organizational memory. These are coordination records only:
          they do not grant permissions, approve work, or execute anything.
        </p>
        <section className="status-grid">
          <article className="status-card">
            <span>Teams</span>
            <strong>{societyDashboard.data?.teams.length ?? 0}</strong>
            <small>Structured task forces</small>
          </article>
          <article className="status-card">
            <span>Debates</span>
            <strong>{societyDashboard.data?.debates.length ?? 0}</strong>
            <small>Visible challenges</small>
          </article>
          <article className="status-card">
            <span>Consensus</span>
            <strong>{societyDashboard.data?.consensus.length ?? 0}</strong>
            <small>Evidence-backed decisions</small>
          </article>
          <article className="status-card">
            <span>Permission grants</span>
            <strong>{societyDashboard.data?.grantsPermissions ? "Yes" : "No"}</strong>
            <small>Must remain no</small>
          </article>
        </section>
        <form
          className="policy-form"
          onSubmit={(event) => {
            event.preventDefault();
            formSocietyTeam.mutate({ goal: societyGoal, repositoryIds: [] });
          }}
        >
          <label>
            Organizational goal
            <textarea
              rows={3}
              value={societyGoal}
              onChange={(event) => setSocietyGoal(event.target.value)}
            />
          </label>
          <button disabled={formSocietyTeam.isPending} type="submit">
            Form society team
          </button>
        </form>
        <div className="button-row">
          <button
            disabled={startSocietyDebate.isPending}
            type="button"
            onClick={() =>
              startSocietyDebate.mutate({
                teamId: societyDashboard.data?.teams[0]?.id ?? null,
                topic: debateTopic,
                initiatingAgentId: agentId,
                argument: debateArgument,
              })
            }
          >
            Open debate
          </button>
          <button
            disabled={recordSocietyMeeting.isPending}
            type="button"
            onClick={() =>
              recordSocietyMeeting.mutate({
                teamId: societyDashboard.data?.teams[0]?.id ?? null,
                meetingType: "planning_session",
                agenda: ["Review organizational health", "Confirm approval gates"],
                summary: meetingSummary,
                decisions: ["Keep organizational recommendations advisory."],
                actionItems: ["Preserve auditability for every interaction."],
              })
            }
          >
            Record meeting
          </button>
        </div>
        <label>
          Debate topic
          <input
            value={debateTopic}
            onChange={(event) => setDebateTopic(event.target.value)}
          />
        </label>
        <label>
          Debate argument
          <textarea
            rows={3}
            value={debateArgument}
            onChange={(event) => setDebateArgument(event.target.value)}
          />
        </label>
        <label>
          Meeting summary
          <textarea
            rows={3}
            value={meetingSummary}
            onChange={(event) => setMeetingSummary(event.target.value)}
          />
        </label>
        {societyDashboard.data?.teams.slice(0, 4).map((team) => (
          <article className="panel" key={team.id}>
            <p className="eyebrow">
              {team.status} · {team.complexity} complexity · {team.risk} risk
            </p>
            <h3>{team.name}</h3>
            <p>{team.purpose}</p>
            <small>
              Members:{" "}
              {
                societyDashboard.data.teamMembers.filter(
                  (member) => member.teamId === team.id,
                ).length
              }
            </small>
          </article>
        ))}
        {societyDashboard.data?.debates.slice(0, 4).map((debate) => (
          <article className="panel" key={debate.id}>
            <p className="eyebrow">
              debate · {debate.status} · confidence{" "}
              {Math.round(debate.confidence * 100)}%
            </p>
            <h3>{debate.topic}</h3>
            <p>{debate.outcome ?? "Awaiting more structured arguments."}</p>
          </article>
        ))}
      </section>

      <section className="panel-list agent-runtime-panel">
        <h2>Agent OS runtime</h2>
        <p>
          Agent OS turns every permanent and dynamic specialist into a manifest-backed
          software component with package integrity, reusable capabilities, permission
          profiles, scoped knowledge sources, replayable sessions, runtime events,
          health, and metrics. Starting a session only prepares governed context; it
          does not execute tools or bypass approvals.
        </p>
        <section className="status-grid">
          <article className="status-card">
            <span>Manifests</span>
            <strong>{agentOsDashboard.data?.manifests.length ?? 0}</strong>
            <small>Source of truth</small>
          </article>
          <article className="status-card">
            <span>Packages</span>
            <strong>{agentOsDashboard.data?.packages.length ?? 0}</strong>
            <small>Integrity hashed</small>
          </article>
          <article className="status-card">
            <span>Tools</span>
            <strong>{agentOsDashboard.data?.tools.length ?? 0}</strong>
            <small>Registry references</small>
          </article>
          <article className="status-card">
            <span>Sessions</span>
            <strong>{agentOsDashboard.data?.sessions.length ?? 0}</strong>
            <small>Replayable runtime runs</small>
          </article>
        </section>
        <div className="button-row">
          <button
            disabled={!selectedAgent || startAgentOsSession.isPending}
            type="button"
            onClick={() =>
              startAgentOsSession.mutate({
                agentId,
                inputSummary: agentOsInput,
              })
            }
          >
            Start Agent OS session
          </button>
          <input
            value={agentOsInput}
            onChange={(event) => setAgentOsInput(event.target.value)}
          />
        </div>
        {startAgentOsSession.data ? (
          <article className="panel">
            <p className="eyebrow">
              Runtime session · {startAgentOsSession.data.session.status}
            </p>
            <h3>{startAgentOsSession.data.session.agentId}</h3>
            <p>{startAgentOsSession.data.session.inputSummary}</p>
            <small>{startAgentOsSession.data.session.id}</small>
          </article>
        ) : null}
        {agentOsDashboard.data?.manifests.slice(0, 6).map((manifest) => {
          const health = agentOsDashboard.data.health.find(
            (candidate) => candidate.agentId === manifest.id,
          );
          return (
            <article className="panel" key={manifest.id}>
              <p className="eyebrow">
                {manifest.agentType} · {manifest.status} · {manifest.version}
              </p>
              <h3>{manifest.displayName}</h3>
              <p>{manifest.description}</p>
              <dl>
                <div>
                  <dt>Permission profile</dt>
                  <dd>{manifest.permissionProfileId}</dd>
                </div>
                <div>
                  <dt>Tools</dt>
                  <dd>{manifest.toolRefs.length}</dd>
                </div>
                <div>
                  <dt>Knowledge</dt>
                  <dd>{manifest.knowledgeSourceRefs.length}</dd>
                </div>
                <div>
                  <dt>Health</dt>
                  <dd>{health?.availability ?? "unknown"}</dd>
                </div>
              </dl>
            </article>
          );
        })}
        {!agentOsDashboard.data?.manifests.length ? (
          <article className="panel">
            <p className="eyebrow">Agent OS</p>
            <h3>No manifests loaded</h3>
            <p>Refresh after authentication to initialize manifest-backed agents.</p>
          </article>
        ) : null}
      </section>

      <section className="panel-list agent-adaptive-panel">
        <h2>Adaptive workforce</h2>
        <form
          className="policy-form"
          onSubmit={(event) => {
            event.preventDefault();
            composeTeam.mutate({ goal: teamGoal, repositoryIds: [] });
          }}
        >
          <label>
            Workflow goal
            <textarea
              rows={3}
              value={teamGoal}
              onChange={(event) => setTeamGoal(event.target.value)}
            />
          </label>
          <button disabled={composeTeam.isPending} type="submit">
            Compose adaptive team
          </button>
        </form>
        {composeTeam.data ? (
          <article className="panel">
            <p className="eyebrow">
              Team composition · {composeTeam.data.composition.riskLevel} risk
            </p>
            <h3>{composeTeam.data.composition.goal}</h3>
            <p>
              Required: {composeTeam.data.composition.requiredCapabilities.join(", ")}
            </p>
            <small>
              Reused {composeTeam.data.composition.reusedAgentIds.length} · Created{" "}
              {composeTeam.data.dynamicAgents.length}
            </small>
          </article>
        ) : null}
      </section>

      <section className="panel-list agent-dynamic-panel">
        <h2>Dynamic agents</h2>
        {dashboard.data?.dynamicWorkforce?.dynamicAgents.map((agent) => (
          <article className="panel" key={agent.id}>
            <p className="eyebrow">
              {agent.origin} · {agent.lifecycleStatus}
            </p>
            <h3>{agent.displayName}</h3>
            <p>{agent.roleDescription}</p>
            <p>Capabilities: {agent.capabilities.join(", ")}</p>
            <small>{agent.creationReason}</small>
            <div className="button-row">
              <button
                disabled={retireDynamicAgent.isPending}
                type="button"
                onClick={() => retireDynamicAgent.mutate(agent.id)}
              >
                Archive temporary agent
              </button>
            </div>
          </article>
        ))}
        {!dashboard.data?.dynamicWorkforce?.dynamicAgents.length ? (
          <article className="panel">
            <p className="eyebrow">Adaptive workforce</p>
            <h3>No temporary agents active</h3>
            <p>
              Compose a team to create template-based or synthesised specialists for
              detected capability gaps.
            </p>
          </article>
        ) : null}
      </section>

      <section className="panel-list agent-capability-panel">
        <h2>Capability registry</h2>
        <section className="status-grid">
          {dashboard.data?.dynamicWorkforce?.capabilities
            .slice(0, 8)
            .map((capability) => (
              <article className="status-card" key={capability.id}>
                <span>{capability.id}</span>
                <strong>{Math.round(capability.confidence * 100)}%</strong>
                <small>{capability.description}</small>
              </article>
            ))}
        </section>
      </section>

      <section className="panel-list agent-directory-panel">
        <div className="agent-directory-heading">
          <div><p className="eyebrow">Agent directory</p><h2>Registered workforce</h2></div>
          <small>{directoryAgents.length} of {workforce.data?.summary.registered ?? 0}</small>
        </div>
        <div className="agent-directory-toolbar">
          <input aria-label="Search agents" onChange={(event) => setDirectoryQuery(event.target.value)} placeholder="Search agents..." value={directoryQuery} />
          <button className="secondary-button" onClick={() => setWorkspaceView("workforce")} type="button">Open workforce graph</button>
        </div>
        <div className="agent-directory-table" role="table" aria-label="Registered agent directory">
          <div className="agent-directory-row agent-directory-header" role="row"><span>Agent</span><span>Specialization</span><span>Status</span><span>Credits</span><span>Reputation</span></div>
          {directoryAgents.map((agent) => {
            const currentTask = runtime.data?.tasks.find((task) => task.assignedAgentId === agent.id && !["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(task.status));
            return (
              <button className="agent-directory-row" key={agent.id} onClick={() => setWorkspaceView("workforce")} role="row" type="button">
                <strong>{agent.label}</strong>
                <span>{currentTask ? currentTask.title : agent.subtitle}</span>
                <span><i className={`agent-health-dot state-${agent.status.toLowerCase()}`} />{currentTask ? currentTask.status.toLowerCase() : agent.status.toLowerCase()}</span>
                <span>{agent.credits ?? 0}</span>
                <span>{agent.reputation?.toFixed(1) ?? "n/a"}</span>
              </button>
            );
          })}
          {directoryAgents.length === 0 ? <p className="notice">No registered workforce entries match this search.</p> : null}
        </div>
      </section>

      <form className="policy-form agent-task-panel" onSubmit={submitTask}>
        <h2>Task assignment</h2>
        <label>
          Agent
          <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
            {dashboard.data?.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          Objective
          <textarea
            required
            rows={3}
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
          />
        </label>
        <label>
          Priority
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as AgentPriority)}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <button disabled={createTask.isPending} type="submit">
          Assign specialist task
        </button>
      </form>

      <section className="panel-list agent-task-history-panel">
        <h2>Task assignments</h2>
        {dashboard.data?.tasks.map((task) => (
          <article className="panel" key={task.id}>
            <p className="eyebrow">
              {task.agentId} · {task.status} · {task.priority}
            </p>
            <h3>{task.title}</h3>
            <p>{task.objective}</p>
            <div className="button-row">
              <button
                disabled={task.status === "completed" || completeTask.isPending}
                type="button"
                onClick={() => completeTask.mutate(task.id)}
              >
                Mark complete
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="panel-list agent-message-panel">
        <h2>Message timeline</h2>
        <div className="button-row">
          <button
            disabled={!selectedAgent || sendMessage.isPending}
            type="button"
            onClick={() =>
              sendMessage.mutate({
                senderAgentId: "engineering_manager",
                recipientAgentId: agentId,
                messageType: "status",
                payload: { body: messageBody },
                evidence: ["Dashboard-originated structured message."],
                priority: "normal",
              })
            }
          >
            Send status message
          </button>
          <input
            value={messageBody}
            onChange={(event) => setMessageBody(event.target.value)}
          />
        </div>
        {dashboard.data?.messages.map((message) => (
          <article className="panel" key={message.id}>
            <p className="eyebrow">
              {message.messageType} · {message.priority}
            </p>
            <h3>
              {message.senderAgentId} → {message.recipientAgentId}
            </h3>
            <p>{JSON.stringify(message.payload)}</p>
            <small>{message.createdAt}</small>
          </article>
        ))}
      </section>

      <section className="panel-list agent-consensus-panel">
        <h2>Consensus panel</h2>
        <div className="button-row">
          <button
            disabled={createConsensus.isPending}
            type="button"
            onClick={() =>
              createConsensus.mutate({
                topic: consensusTopic,
                rule: "required_specialist",
                requiredAgentIds: ["security_agent", "review_agent", "testing_agent"],
              })
            }
          >
            Open specialist consensus
          </button>
          <input
            value={consensusTopic}
            onChange={(event) => setConsensusTopic(event.target.value)}
          />
        </div>
        {dashboard.data?.consensus.map((consensus) => (
          <article className="panel" key={consensus.id}>
            <p className="eyebrow">
              {consensus.rule} · {consensus.status}
            </p>
            <h3>{consensus.topic}</h3>
            <p>Required: {consensus.requiredAgentIds.join(", ")}</p>
          </article>
        ))}
      </section>
      </div>
    </section>
  );
};

const AgentExperimentsPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const experiments = useQuery({
    queryKey: ["experiments", "agent-operations"],
    queryFn: apiClient.getExperiments,
    refetchInterval: 30_000,
  });
  const [selectedId, setSelectedId] = useState("");
  const selected = experiments.data?.experiments.find((item) => item.id === selectedId) ?? experiments.data?.experiments[0];
  const variants = (experiments.data?.variants ?? []).filter((item) => item.experimentId === selected?.id);
  const results = (experiments.data?.results ?? []).filter((item) => item.experimentId === selected?.id);
  const timeline = (experiments.data?.timeline ?? []).filter((item) => item.experimentId === selected?.id).slice(0, 12);
  const running = experiments.data?.experiments.filter((item) => item.status === "RUNNING") ?? [];
  const needsAttention = experiments.data?.experiments.filter((item) => ["PAUSED", "FAILED", "STOPPED"].includes(item.status)) ?? [];
  const completed = experiments.data?.experiments.filter((item) => item.status === "COMPLETED") ?? [];

  if (experiments.isLoading) return <div className="notice">Loading experiments...</div>;

  return (
    <div className="agent-operations-page">
      <section className="compact-metric-strip" aria-label="Experiment summary">
        <span><small>Running</small><strong>{experiments.data?.summary.running ?? 0}</strong></span>
        <span><small>Needs attention</small><strong>{needsAttention.length}</strong></span>
        <span><small>Completed</small><strong>{experiments.data?.summary.completed ?? 0}</strong></span>
        <span><small>Budget allocated</small><strong>{experiments.data?.summary.budgetAllocated ?? 0}</strong></span>
        <span><small>Budget spent</small><strong>{experiments.data?.summary.budgetSpent ?? 0}</strong></span>
      </section>

      <div className="split-workspace">
        <section className="panel-list">
          <ExperimentSection title="Running" experiments={running} onSelect={setSelectedId} selectedId={selected?.id ?? ""} />
          <ExperimentSection title="Needs Attention" experiments={needsAttention} onSelect={setSelectedId} selectedId={selected?.id ?? ""} />
          <ExperimentSection title="Completed" experiments={completed} onSelect={setSelectedId} selectedId={selected?.id ?? ""} />
          {experiments.data?.experiments.length === 0 ? <div className="notice">No experiments are currently running.</div> : null}
        </section>

        <aside className="panel-list economy-inspector">
          <p className="eyebrow">Experiment detail</p>
          <h2>{selected?.title ?? "Select an experiment"}</h2>
          {selected ? (
            <>
              <dl className="compact-definition-list">
                <div><dt>Status</dt><dd>{selected.status}</dd></div>
                <div><dt>Objective</dt><dd>{selected.objectiveId}</dd></div>
                <div><dt>Project</dt><dd>{selected.projectId ?? "None"}</dd></div>
                <div><dt>Metric</dt><dd>{selected.primaryMetric.name}</dd></div>
                <div><dt>Budget</dt><dd>{selected.spentCredits} / {selected.explorationBudget}</dd></div>
                <div><dt>Decision</dt><dd>{decisionFor(results)}</dd></div>
              </dl>
              <article className="panel">
                <p className="eyebrow">Hypothesis</p>
                <p>{selected.hypothesis}</p>
              </article>
              <div className="dense-list">
                {variants.map((variant) => (
                  <div className="dense-row" key={variant.id}>
                    <div>
                      <strong>{variant.name}</strong>
                      <small>{variant.role} · {variant.status} · allocation {variant.allocationPercent}%</small>
                    </div>
                    <div className="row-meta">
                      <span className="mono-number">{variant.actualMetric ?? "no result"}</span>
                      <span>{variant.spentCredits} credits</span>
                    </div>
                  </div>
                ))}
              </div>
              <AgentOpsList
                rows={timeline.map((event) => ({
                  title: event.type,
                  meta: new Date(event.createdAt).toLocaleString(),
                  body: event.summary,
                }))}
                empty="No experiment timeline events."
              />
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
};

const ExperimentSection = ({
  title,
  experiments,
  selectedId,
  onSelect,
}: {
  title: string;
  experiments: Awaited<ReturnType<ApiClient["getExperiments"]>>["experiments"];
  selectedId: string;
  onSelect: (id: string) => void;
}) => (
  <section className="agent-ops-section">
    <div className="section-heading-row"><div><p className="eyebrow">Experiments</p><h2>{title}</h2></div><span className="mono-meta">{experiments.length}</span></div>
    <div className="dense-list">
      {experiments.map((experiment) => (
        <button className={`dense-row as-button${selectedId === experiment.id ? " is-selected" : ""}`} key={experiment.id} onClick={() => onSelect(experiment.id)} type="button">
          <div><strong>{experiment.title}</strong><small>{experiment.hypothesis}</small></div>
          <div className="row-meta"><span>{experiment.status}</span><span className="mono-number">{experiment.spentCredits}/{experiment.explorationBudget}</span></div>
        </button>
      ))}
      {experiments.length === 0 ? <div className="notice">No {title.toLowerCase()} experiments.</div> : null}
    </div>
  </section>
);

const decisionFor = (
  results: Awaited<ReturnType<ApiClient["getExperiments"]>>["results"],
) => {
  const result = results.find((item) => item.variantId === null) ?? results[0];
  if (!result) return "RUNNING";
  if (result.verdict === "WINNER") return "ADOPTED";
  if (result.verdict === "LOSER") return "REJECTED";
  if (result.verdict === "INCONCLUSIVE") return "INCONCLUSIVE";
  return result.verdict;
};

const AgentActivityPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const businessOS = useQuery({
    queryKey: ["business-os-summary", "agent-activity"],
    queryFn: apiClient.getBusinessOSSummary,
    refetchInterval: 30_000,
  });
  const [visible, setVisible] = useState(40);
  const events = businessOS.data?.timeline.slice(0, visible) ?? [];

  return (
    <div className="agent-operations-page">
      <section className="compact-metric-strip" aria-label="Activity summary">
        <span><small>Attention</small><strong>{businessOS.data?.summary.attentionCount ?? 0}</strong></span>
        <span><small>Critical</small><strong>{businessOS.data?.summary.criticalAlerts ?? 0}</strong></span>
        <span><small>Approvals</small><strong>{businessOS.data?.summary.pendingApprovals ?? 0}</strong></span>
        <span><small>Outcomes</small><strong>{businessOS.data?.summary.verifiedOutcomes ?? 0}</strong></span>
      </section>
      <section className="panel-list">
        <div className="section-heading-row"><div><p className="eyebrow">Timeline</p><h2>Business activity</h2></div><span className="mono-meta">{events.length} shown</span></div>
        <div className="dense-list">
          {events.map((event) => (
            <div className="dense-row" key={event.id}>
              <div><strong>{event.title}</strong><small>{event.category} · {event.entity?.label ?? "System"}</small></div>
              <div className="row-meta"><span>{event.entity?.status ?? "recorded"}</span><time>{new Date(event.occurredAt).toLocaleString()}</time></div>
              <p>{event.summary}</p>
            </div>
          ))}
          {events.length === 0 ? <div className="notice">No business activity recorded.</div> : null}
        </div>
        {(businessOS.data?.timeline.length ?? 0) > visible ? (
          <button className="secondary-button" onClick={() => setVisible((value) => value + 40)} type="button">Load more activity</button>
        ) : null}
      </section>
    </div>
  );
};

const AgentSystemPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const system = useQuery({ queryKey: ["system-status", "agent-ops"], queryFn: apiClient.getSystemStatus, refetchInterval: 30_000 });
  const workforce = useQuery({ queryKey: ["workforce-runtime", "system"], queryFn: apiClient.getWorkforceRuntime, refetchInterval: 15_000 });
  const graph = useQuery({ queryKey: ["agent-workforce-graph", "system"], queryFn: () => apiClient.getAgentWorkforceGraph("limit=160"), refetchInterval: 30_000 });
  const economy = useQuery({ queryKey: ["agent-economy-dashboard", "system"], queryFn: apiClient.getAgentEconomyDashboard, refetchInterval: 30_000 });
  const agentOS = useQuery({ queryKey: ["agent-os-dashboard", "system"], queryFn: apiClient.getAgentOsDashboard, refetchInterval: 30_000 });
  const providers = useQuery({ queryKey: ["ai-providers", "system"], queryFn: apiClient.getAIProviderHealth, refetchInterval: 30_000 });
  const providerAvailable = providers.data?.filter((item) => item.status === "HEALTHY").length ?? 0;

  return (
    <div className="agent-operations-page">
      <section className="status-grid">
        <article className="status-card"><span>Registered</span><strong>{graph.data?.summary.registered ?? 0}</strong><small>Agent OS identities</small></article>
        <article className="status-card"><span>Active</span><strong>{graph.data?.summary.active ?? 0}</strong><small>Runtime participants</small></article>
        <article className="status-card"><span>Dormant</span><strong>{graph.data?.summary.dormant ?? 0}</strong><small>No model sessions</small></article>
        <article className="status-card"><span>Open tasks</span><strong>{(workforce.data?.summary.queued ?? 0) + (workforce.data?.summary.running ?? 0) + (workforce.data?.summary.waitingReview ?? 0)}</strong><small>Scheduler backlog</small></article>
      </section>
      <div className="split-workspace">
        <section className="panel-list">
          <div className="section-heading-row"><div><p className="eyebrow">Execution</p><h2>Scheduler and Agent OS</h2></div></div>
          <dl className="compact-definition-list">
            <div><dt>Scheduler</dt><dd>{workforce.data ? "HEALTHY" : "Unavailable"}</dd></div>
            <div><dt>Max concurrent</dt><dd>{workforce.data?.summary.maxConcurrent ?? "-"}</dd></div>
            <div><dt>Active workflows</dt><dd>{workforce.data?.summary.running ?? 0}</dd></div>
            <div><dt>Review queue</dt><dd>{workforce.data?.summary.waitingReview ?? 0}</dd></div>
            <div><dt>Manifests</dt><dd>{agentOS.data?.manifests.length ?? 0}</dd></div>
            <div><dt>Sessions</dt><dd>{agentOS.data?.sessions.length ?? 0}</dd></div>
          </dl>
        </section>
        <section className="panel-list">
          <div className="section-heading-row"><div><p className="eyebrow">Runtime</p><h2>Safe component health</h2></div></div>
          <dl className="compact-definition-list">
            <div><dt>API</dt><dd>{system.data?.api.status ?? "unknown"}</dd></div>
            <div><dt>PostgreSQL</dt><dd>{system.data?.database.status ?? "unknown"}</dd></div>
            <div><dt>Redis</dt><dd>{system.data?.redis.status ?? "unknown"}</dd></div>
            <div><dt>AIRouter</dt><dd>{system.data?.aiProvider.status ?? "unknown"}</dd></div>
            <div><dt>Providers available</dt><dd>{providerAvailable}</dd></div>
            <div><dt>Execution enabled</dt><dd>{system.data?.execution.enabled ? "Yes" : "No"}</dd></div>
          </dl>
        </section>
      </div>
      <section className="compact-metric-strip" aria-label="System economy">
        <span><small>Available credits</small><strong>{economy.data?.overview.availableCredits ?? 0}</strong></span>
        <span><small>Reserved credits</small><strong>{economy.data?.overview.reservedCredits ?? 0}</strong></span>
        <span><small>Spent credits</small><strong>{economy.data?.overview.spentCredits ?? 0}</strong></span>
        <span><small>Completion rate</small><strong>{Math.round((workforce.data?.metrics.completionRate ?? 0) * 100)}%</strong></span>
      </section>
    </div>
  );
};

const AgentSettingsPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const workforce = useQuery({ queryKey: ["workforce-runtime", "settings"], queryFn: apiClient.getWorkforceRuntime });
  const economy = useQuery({ queryKey: ["agent-economy-dashboard", "settings"], queryFn: apiClient.getAgentEconomyDashboard });
  const experiments = useQuery({ queryKey: ["experiments", "settings"], queryFn: apiClient.getExperiments });
  const agentOS = useQuery({ queryKey: ["agent-os-dashboard", "settings"], queryFn: apiClient.getAgentOsDashboard });

  return (
    <div className="agent-operations-page">
      <section className="panel-list">
        <div className="section-heading-row"><div><p className="eyebrow">Workforce</p><h2>Runtime policy</h2></div><span className="mono-meta">Read-only</span></div>
        <dl className="compact-definition-list">
          <div><dt>Max concurrent active agents</dt><dd>{workforce.data?.summary.maxConcurrent ?? "-"}</dd></div>
          <div><dt>Max task depth</dt><dd>{workforce.data?.invariants.maxTaskDepth ?? "-"}</dd></div>
          <div><dt>Shared AIRouter</dt><dd>{workforce.data?.invariants.sharedAIRouter ? "Enabled" : "Unknown"}</dd></div>
          <div><dt>Dedicated model per agent</dt><dd>{workforce.data?.invariants.dedicatedModelPerAgent ? "Yes" : "No"}</dd></div>
        </dl>
      </section>
      <section className="panel-list">
        <div className="section-heading-row"><div><p className="eyebrow">Economy</p><h2>Credit authority</h2></div><span className="mono-meta">Credits are not reputation</span></div>
        <dl className="compact-definition-list">
          <div><dt>Grant authority</dt><dd>{economy.data?.creditsGrantAuthority ?? "-"}</dd></div>
          <div><dt>Credits buy authority</dt><dd>{economy.data?.creditsCanBuyAuthority ? "Yes" : "No"}</dd></div>
          <div><dt>Credits buy reputation</dt><dd>{economy.data?.creditsCanBuyReputation ? "Yes" : "No"}</dd></div>
          <div><dt>Economy accounts</dt><dd>{economy.data?.accounts.length ?? 0}</dd></div>
        </dl>
      </section>
      <section className="panel-list">
        <div className="section-heading-row"><div><p className="eyebrow">Experiments</p><h2>Experiment controls</h2></div><span className="mono-meta">Existing engine</span></div>
        <dl className="compact-definition-list">
          <div><dt>Experiments grant authority</dt><dd>{experiments.data?.invariants.experimentsGrantAuthority ? "Yes" : "No"}</dd></div>
          <div><dt>Verified evidence only</dt><dd>{experiments.data?.invariants.verifiedEvidenceOnly ? "Yes" : "No"}</dd></div>
          <div><dt>Objective budget conserved</dt><dd>{experiments.data?.invariants.objectiveBudgetConserved ? "Yes" : "No"}</dd></div>
          <div><dt>Existing scheduler used</dt><dd>{experiments.data?.invariants.existingSchedulerUsed ? "Yes" : "No"}</dd></div>
        </dl>
      </section>
      <section className="panel-list">
        <div className="section-heading-row"><div><p className="eyebrow">AI and memory</p><h2>Registered policies</h2></div></div>
        <div className="dense-list">
          {(agentOS.data?.configurations ?? []).slice(0, 20).map((configuration) => (
            <div className="dense-row" key={configuration.id}>
              <div><strong>{configuration.agentId}</strong><small>parallelism {configuration.configuration.parallelism} · memory {configuration.configuration.memoryLimitItems}</small></div>
              <div className="row-meta"><span>{configuration.configuration.defaultModel}</span><span>{configuration.signedChangeRequired ? "signed changes" : "unsigned"}</span></div>
            </div>
          ))}
          {agentOS.data?.configurations.length === 0 ? <div className="notice">No Agent OS configurations registered.</div> : null}
        </div>
      </section>
    </div>
  );
};

const AgentOpsList = ({
  rows,
  empty,
}: {
  rows: Array<{ title: string; meta: string; body: string }>;
  empty: string;
}) => (
  <div className="dense-list">
    {rows.map((row, index) => (
      <div className="dense-row" key={`${row.title}:${row.meta}:${index}`}>
        <div>
          <strong>{row.title}</strong>
          <small>{row.meta}</small>
        </div>
        {row.body ? <p>{row.body}</p> : null}
      </div>
    ))}
    {rows.length === 0 ? <div className="notice">{empty}</div> : null}
  </div>
);
