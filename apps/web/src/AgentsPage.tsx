import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import type { AgentPriority } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";
import { AgentEconomyPanel } from "./AgentEconomyPanel.js";
import { AgentWorkforceGraph } from "./AgentWorkforceGraph.js";

export const AgentsPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [workspaceView, setWorkspaceView] = useState<"agents" | "workforce" | "economy">(() => {
    const view = new URLSearchParams(window.location.search).get("view");
    return view === "workforce" || view === "economy" ? view : "agents";
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

  if (workspaceView === "economy") {
    return (
      <section className="placeholder-page wide-page governance-page">
        <p className="eyebrow">Governed resource accounting</p>
        <h1>Agent Economy</h1>
        <p>Internal credits buy bounded resources, never permissions, approvals, capabilities, trust, or reputation.</p>
        <nav className="workspace-tabs" aria-label="Agent workspace views">
          <button onClick={() => setWorkspaceView("agents")} type="button">Agents</button>
          <button onClick={() => setWorkspaceView("workforce")} type="button">Workforce</button>
          <button aria-current="page" className="active" type="button">Economy</button>
        </nav>
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
        <nav className="workspace-tabs" aria-label="Agent workspace views">
          <button onClick={() => setWorkspaceView("agents")} type="button">Agents</button>
          <button aria-current="page" className="active" type="button">Workforce</button>
          <button onClick={() => setWorkspaceView("economy")} type="button">Economy</button>
        </nav>
        <AgentWorkforceGraph apiClient={apiClient} />
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
      <nav className="workspace-tabs" aria-label="Agent workspace views">
        <button aria-current="page" className="active" type="button">Agents</button>
        <button onClick={() => setWorkspaceView("workforce")} type="button">Workforce</button>
        <button onClick={() => setWorkspaceView("economy")} type="button">Economy</button>
      </nav>

      <section className="status-grid">
          <article className="status-card">
            <span>Agents</span>
          <strong>{workforce.data?.summary.registered ?? dashboard.data?.agents.length ?? 0}</strong>
          <small>Specialist registry</small>
        </article>
        <article className="status-card">
          <span>Open tasks</span>
          <strong>
            {runtime.data?.summary.queued ?? 0}
          </strong>
          <small>Deterministic scheduler state</small>
        </article>
          <article className="status-card">
            <span>Consensus</span>
            <strong>{runtime.data?.summary.running ?? 0}</strong>
            <small>Bounded active contexts</small>
        </article>
        <article className="status-card">
          <span>Dynamic</span>
          <strong>{runtime.data?.summary.waitingReview ?? 0}</strong>
          <small>Independent review gates</small>
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
          <div className="agent-directory-row agent-directory-header" role="row"><span>Agent</span><span>Specialization</span><span>Health</span><span>State</span><span>Members</span></div>
          {directoryAgents.map((agent) => <button className="agent-directory-row" key={agent.id} onClick={() => setWorkspaceView("workforce")} role="row" type="button"><strong>{agent.label}</strong><span>{agent.subtitle}</span><span><i className={`agent-health-dot state-${agent.status.toLowerCase()}`} />{agent.status === "FAILED" || agent.status === "BLOCKED" ? "attention" : "healthy"}</span><span>{agent.status.toLowerCase()}</span><span>{agent.childCount}</span></button>)}
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
