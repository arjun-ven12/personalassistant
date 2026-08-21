import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import type { AgentPriority } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";

export const AgentsPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
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
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["agents-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["agent-os-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["agent-society-dashboard"] });
  };
  const createTask = useMutation({
    mutationFn: apiClient.createAgentTask,
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

  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Phase 7</p>
      <h1>Multi-Agent Engineering System</h1>
      <p>
        Specialist agents coordinate through structured tasks, immutable messages,
        shared context, consensus records, and workflow checkpoints. No agent receives
        extra execution permission or can bypass patch approval.
      </p>

      <section className="status-grid">
        <article className="status-card">
          <span>Agents</span>
          <strong>{dashboard.data?.agents.length ?? 0}</strong>
          <small>Specialist registry</small>
        </article>
        <article className="status-card">
          <span>Open tasks</span>
          <strong>
            {dashboard.data?.tasks.filter((task) => task.status !== "completed")
              .length ?? 0}
          </strong>
          <small>Deterministic scheduler state</small>
        </article>
        <article className="status-card">
          <span>Messages</span>
          <strong>{dashboard.data?.messages.length ?? 0}</strong>
          <small>Immutable timeline</small>
        </article>
        <article className="status-card">
          <span>Dynamic</span>
          <strong>{dashboard.data?.dynamicWorkforce?.dynamicAgents.length ?? 0}</strong>
          <small>Temporary specialists</small>
        </article>
      </section>

      <section className="panel-list">
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

      <section className="panel-list">
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

      <section className="panel-list">
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

      <section className="panel-list">
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

      <section className="panel-list">
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

      <section className="panel-list">
        <h2>Agent overview</h2>
        {dashboard.data?.agents.map((agent) => {
          const health = dashboard.data.health.find(
            (candidate) => candidate.agentId === agent.id,
          );
          const metrics = dashboard.data.metrics.find(
            (candidate) => candidate.agentId === agent.id,
          );
          return (
            <article className="panel" key={agent.id}>
              <p className="eyebrow">
                {agent.role} · {agent.status}
              </p>
              <h3>{agent.displayName}</h3>
              <p>{agent.healthSummary}</p>
              <p>Capabilities: {agent.capabilities.join(", ")}</p>
              <dl>
                <div>
                  <dt>Health</dt>
                  <dd>{health?.state ?? "unknown"}</dd>
                </div>
                <div>
                  <dt>Assigned</dt>
                  <dd>{metrics?.assignedTaskCount ?? 0}</dd>
                </div>
                <div>
                  <dt>Messages</dt>
                  <dd>{metrics?.messageCount ?? 0}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </section>

      <form className="policy-form" onSubmit={submitTask}>
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

      <section className="panel-list">
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

      <section className="panel-list">
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

      <section className="panel-list">
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
    </section>
  );
};
