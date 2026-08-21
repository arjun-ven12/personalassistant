import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  Bot,
  Cpu,
  Database,
  GitBranch,
  Network,
  Radio,
  Shield,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";

import type { ApiClient } from "./api.js";
import type {
  SceneAgentNode,
  SceneRepositoryNode,
  SceneWorkflowNode,
} from "./HomeScene3D.js";
import { usePersistentVoiceRuntime } from "./PersistentVoiceRuntime.js";

type TelemetryTone = "accent" | "success" | "warning" | "danger" | "muted";

interface TelemetryItem {
  label: string;
  value: string;
  tone: TelemetryTone;
}

const readableStatus = (value: string) => value.replaceAll("_", " ");

const numericStatus = (value: number | undefined, fallback = "0") =>
  typeof value === "number" ? new Intl.NumberFormat().format(value) : fallback;

const relativeActivity = (iso: string | null | undefined) => {
  if (!iso) return "none";
  const elapsedMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "just now";
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const workflowProgressForStatus = (status: string) => {
  const progressByStatus: Record<string, number> = {
    PLANNED: 8,
    ANALYSING: 18,
    READY: 28,
    WAITING_APPROVAL: 35,
    APPROVED: 44,
    GENERATING_PATCH: 56,
    EXECUTING: 68,
    VALIDATING: 78,
    BLOCKED: 52,
    FAILED: 52,
    CANCELLED: 0,
    COMPLETED: 100,
    ROLLED_BACK: 12,
  };
  return progressByStatus[status] ?? 20;
};

const HolographicPanel = ({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) => (
  <motion.article
    className={`holo-panel ${className}`}
    initial={{ opacity: 0, y: 22, scale: 0.97 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ delay, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
  >
    {children}
  </motion.article>
);

const TelemetryWidget = ({ item }: { item: TelemetryItem }) => (
  <div className={`telemetry-widget tone-${item.tone}`}>
    <span>{item.label}</span>
    <strong>{item.value}</strong>
  </div>
);

const LazyHomeScene3D = lazy(() => import("./HomeScene3D.js"));

const AgentConstellation = ({
  agents,
  selectedAgentId,
  onSelectAgent,
}: {
  agents: SceneAgentNode[];
  selectedAgentId: string | null;
  onSelectAgent: (agent: SceneAgentNode) => void;
}) => {
  const displayAgents =
    agents.length > 0
      ? agents
      : [
          {
            id: "standby-agent",
            label: "Engineering Manager",
            status: "available",
            health: "healthy",
            taskTitle: "Standing by for owner-approved work",
            progress: 0,
            latencyLabel: "standby",
            lastActivityLabel: "none",
          } satisfies SceneAgentNode,
        ];
  return (
    <div className="agent-constellation" aria-label="Agent constellation">
      {displayAgents.map((agent, index) => {
        const angle = (index / displayAgents.length) * Math.PI * 2 - Math.PI / 2;
        return (
          <button
            aria-label={`${agent.label}: ${agent.status}, ${agent.progress}% progress`}
            aria-pressed={selectedAgentId === agent.id}
            className={`agent-star agent-status-${agent.status} agent-health-${agent.health} ${selectedAgentId === agent.id ? "selected" : ""}`}
            key={agent.id}
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("assistant:sound-hook", {
                  detail: { event: "agent_select", agentId: agent.id },
                }),
              );
              onSelectAgent(agent);
            }}
            style={
              {
                "--node-x": `${Math.cos(angle) * 185}px`,
                "--node-y": `${Math.sin(angle) * 118}px`,
                "--progress": `${agent.progress}%`,
              } as React.CSSProperties
            }
            type="button"
          >
            <span />
            <small>{agent.label}</small>
          </button>
        );
      })}
    </div>
  );
};

const SelectedAgentCard = ({ agent }: { agent: SceneAgentNode | null }) => {
  const displayed =
    agent ??
    ({
      id: "standby",
      label: "Agent Mesh",
      status: "available",
      health: "unknown",
      taskTitle: "Click an orbiting node to inspect an agent.",
      progress: 0,
      latencyLabel: "standby",
      lastActivityLabel: "none",
    } satisfies SceneAgentNode);
  return (
    <aside className="selected-agent-card" aria-live="polite">
      <p className="eyebrow">Selected agent</p>
      <strong>{displayed.label}</strong>
      <dl>
        <dt>Status</dt>
        <dd>{displayed.status}</dd>
        <dt>Working on</dt>
        <dd>{displayed.taskTitle}</dd>
        <dt>Progress</dt>
        <dd>{displayed.progress}%</dd>
        <dt>Health</dt>
        <dd>{displayed.health}</dd>
        <dt>Latency</dt>
        <dd>{displayed.latencyLabel}</dd>
        <dt>Last activity</dt>
        <dd>{displayed.lastActivityLabel}</dd>
      </dl>
    </aside>
  );
};

const RepositoryGalaxy = ({ count }: { count: number }) => {
  const clusterCount = Math.max(7, Math.min(18, count + 7));
  return (
    <div className="repo-galaxy" aria-label="Repository galaxy">
      {Array.from({ length: clusterCount }, (_, index) => (
        <span
          className="repo-cluster"
          key={index}
          style={
            {
              "--angle": `${index * (360 / clusterCount)}deg`,
              "--distance": `${76 + (index % 5) * 14}px`,
              "--delay": `${index * 0.11}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
};

const WorkflowStreams = () => {
  const phases = ["Planning", "Coding", "Review", "Validation", "Release"];
  return (
    <div className="workflow-streams" aria-label="Workflow streams">
      {phases.map((phase, index) => (
        <div className="workflow-stream" key={phase}>
          <span>{phase}</span>
          <i style={{ animationDelay: `${index * 0.35}s` }} />
        </div>
      ))}
    </div>
  );
};

export const HomeCommandCenter = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const voiceRuntime = usePersistentVoiceRuntime();
  const [localStopAsserted, setLocalStopAsserted] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const health = useQuery({
    queryKey: ["health"],
    queryFn: apiClient.getHealth,
    refetchInterval: 15_000,
  });
  const system = useQuery({
    queryKey: ["system-status"],
    queryFn: apiClient.getSystemStatus,
    refetchInterval: 10_000,
  });
  const security = useQuery({
    queryKey: ["security-status"],
    queryFn: apiClient.getSecurityStatus,
    refetchInterval: 15_000,
  });
  const devices = useQuery({ queryKey: ["devices"], queryFn: apiClient.getDevices });
  const repositories = useQuery({
    queryKey: ["repositories"],
    queryFn: apiClient.getRepositories,
  });
  const workflows = useQuery({
    queryKey: ["workflows"],
    queryFn: apiClient.getWorkflows,
  });
  const validations = useQuery({
    queryKey: ["validations"],
    queryFn: apiClient.getValidations,
    refetchInterval: 15_000,
  });
  const integrations = useQuery({
    queryKey: ["integrations-dashboard"],
    queryFn: apiClient.getIntegrationsDashboard,
  });
  const agents = useQuery({
    queryKey: ["agents-dashboard"],
    queryFn: apiClient.getAgentsDashboard,
  });
  const approvals = useQuery({
    queryKey: ["approvals", "home-preview"],
    queryFn: () => apiClient.getApprovals("PENDING"),
    refetchInterval: 15_000,
  });
  const aiRuntime = useQuery({
    queryKey: ["ai-runtime-health", "home-preview"],
    queryFn: apiClient.getAIRuntimeHealth,
    refetchInterval: 15_000,
  });

  const stop = useMutation({
    mutationFn: apiClient.emergencyStop,
    onMutate: () => setLocalStopAsserted(true),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["system-status"] });
      await queryClient.invalidateQueries({ queryKey: ["security-status"] });
    },
  });

  const telemetry: TelemetryItem[] = [
    {
      label: "API Link",
      value: health.isSuccess ? "Online" : health.isPending ? "Syncing" : "Offline",
      tone: health.isSuccess ? "success" : health.isPending ? "warning" : "danger",
    },
    {
      label: "Mac Agent",
      value: readableStatus(system.data?.macAgent.status ?? "not_connected"),
      tone:
        system.data?.macAgent.status === "online"
          ? "success"
          : system.data?.macAgent.status === "offline"
            ? "warning"
            : "muted",
    },
    {
      label: "Repositories",
      value: numericStatus(repositories.data?.length),
      tone: "accent",
    },
    {
      label: "Agents",
      value: numericStatus(agents.data?.agents.length),
      tone: "success",
    },
    {
      label: "Workflows",
      value: numericStatus(workflows.data?.length),
      tone: "accent",
    },
    {
      label: "Validations",
      value: numericStatus(validations.data?.length),
      tone: "warning",
    },
    {
      label: "Integrations",
      value: numericStatus(integrations.data?.integrations.length),
      tone: "accent",
    },
    {
      label: "Security",
      value:
        security.data?.emergencyStopActive || localStopAsserted
          ? "Stop Active"
          : "Guarded",
      tone:
        security.data?.emergencyStopActive || localStopAsserted ? "danger" : "success",
    },
    {
      label: "Voice",
      value: voiceRuntime.active ? readableStatus(voiceRuntime.frame.state) : "Standby",
      tone: voiceRuntime.active ? "success" : "muted",
    },
    {
      label: "Approvals",
      value: numericStatus(approvals.data?.length),
      tone: (approvals.data?.length ?? 0) > 0 ? "warning" : "success",
    },
  ];

  const activeWorkflowCount =
    workflows.data?.filter(
      (workflow) => !["COMPLETED", "CANCELLED"].includes(workflow.status),
    ).length ?? 0;
  const trustedDeviceCount =
    devices.data?.filter((device) => device.trustStatus === "TRUSTED").length ?? 0;
  const sceneAgents: SceneAgentNode[] =
    agents.data?.agents.map((agent, index) => {
      const task = agents.data?.tasks.find(
        (candidate) =>
          candidate.agentId === agent.id &&
          !["completed", "cancelled", "failed"].includes(candidate.status),
      );
      const metrics = agents.data?.metrics.find(
        (candidate) => candidate.agentId === agent.id,
      );
      const health = agents.data?.health.find(
        (candidate) => candidate.agentId === agent.id,
      );
      const assigned = metrics?.assignedTaskCount ?? 0;
      const completed = metrics?.completedTaskCount ?? 0;
      const progress =
        task?.status === "in_progress"
          ? 72
          : task?.status === "waiting_consensus"
            ? 84
            : task?.status === "blocked"
              ? 41
              : assigned > 0
                ? Math.min(96, Math.round((completed / assigned) * 100))
                : 0;
      return {
        id: agent.id,
        label: agent.displayName,
        status: task ? "busy" : agent.status,
        health: health?.state ?? "unknown",
        taskTitle: task?.title ?? "Standing by for owner-approved work",
        progress,
        latencyLabel: health?.state === "healthy" ? `${18 + index * 7}ms` : "degraded",
        lastActivityLabel: relativeActivity(metrics?.lastActivityAt ?? agent.updatedAt),
      };
    }) ?? [];
  const sceneRepositories: SceneRepositoryNode[] =
    repositories.data?.map((repository, index) => ({
      id: repository.id,
      label: repository.workspaceId,
      indexStatus: repository.indexStatus,
      weight: Math.max(
        1,
        Math.min(6, (repository.activeGeneration ?? 1) + (index % 3)),
      ),
    })) ?? [];
  const sceneWorkflows: SceneWorkflowNode[] =
    workflows.data?.map((workflow) => ({
      id: workflow.id,
      label: workflow.goal,
      status: workflow.status,
      progress: workflowProgressForStatus(workflow.status),
    })) ?? [];
  const selectedAgent =
    selectedAgentId === null
      ? null
      : (sceneAgents.find((agent) => agent.id === selectedAgentId) ?? null);
  return (
    <section
      className="home-command-center home-command-center-structured"
      aria-labelledby="home-command-heading"
    >
      <div className="deep-space" aria-hidden="true" />
      <div className="home-scanlines" aria-hidden="true" />
      <div className="scene-light scene-light-a" aria-hidden="true" />
      <div className="scene-light scene-light-b" aria-hidden="true" />

      <header className="home-page-header">
        <div>
          <span className="home-header-kicker">Live system overview</span>
          <h1 id="home-command-heading">Alexa Command Center</h1>
          <p>
            See what is active, what needs attention, and what Alexa can safely do next.
          </p>
        </div>
      </header>

      <div className="command-hero-card">
        <div className="command-core-stage" aria-label="Interactive AI ecosystem core">
          <div className="mesh-stage-heading">
            <span>Agent mesh</span>
            <small>{numericStatus(sceneAgents.length)} agents · click a node</small>
          </div>
          <div className="scene-canvas command-core-canvas">
            {reduceMotion ? (
              <div className="reduced-globe" aria-hidden="true">
                <span />
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="reduced-globe" aria-hidden="true">
                    <span />
                  </div>
                }
              >
                <LazyHomeScene3D
                  repositories={sceneRepositories}
                  validationCount={validations.data?.length ?? 0}
                  workflows={sceneWorkflows}
                />
              </Suspense>
            )}
          </div>
          <div className="ai-core-label command-core-tag">
            <Sparkles size={15} />
            Core online
          </div>
          <AgentConstellation
            agents={sceneAgents}
            onSelectAgent={(agent) => setSelectedAgentId(agent.id)}
            selectedAgentId={selectedAgent?.id ?? selectedAgentId}
          />
          <RepositoryGalaxy count={repositories.data?.length ?? 0} />
          <WorkflowStreams />
          <div className="command-stepper" aria-label="Workflow phase stream">
            {[
              ["Planning", "done"],
              ["Coding", activeWorkflowCount > 0 ? "active" : "done"],
              ["Review", "idle"],
              ["Validation", validations.data?.length ? "active" : "idle"],
              ["Release", "idle"],
            ].map(([label, state]) => (
              <div className={`command-stage stage-${state}`} key={label}>
                <span />
                <small>{label}</small>
              </div>
            ))}
          </div>
        </div>

        <SelectedAgentCard agent={selectedAgent} />

        <div className="command-metric-grid" aria-label="Primary telemetry">
          {telemetry.slice(0, 6).map((item) => (
            <TelemetryWidget item={item} key={item.label} />
          ))}
        </div>
      </div>

      <aside className="command-side-stack" aria-label="Dashboard status section">
        <div className="command-card-row command-card-row-three">
          <HolographicPanel className="command-info-card" delay={0.15}>
            <div className="holo-heading">
              <GitBranch size={16} />
              <span>Repository Galaxy</span>
            </div>
            <strong>{numericStatus(repositories.data?.length)}</strong>
            <small>
              Indexed workspaces remain read-only unless approved changes are applied.
            </small>
          </HolographicPanel>
          <HolographicPanel className="command-info-card" delay={0.22}>
            <div className="holo-heading">
              <Bot size={16} />
              <span>Active Agents</span>
            </div>
            <strong>{numericStatus(agents.data?.agents.length)}</strong>
            <small>
              {numericStatus(agents.data?.tasks.length)} assigned tasks in the mesh.
            </small>
          </HolographicPanel>
          <HolographicPanel className="command-info-card" delay={0.29}>
            <div className="holo-heading">
              <Activity size={16} />
              <span>System Status</span>
            </div>
            <strong className={health.isSuccess ? "status-online" : "status-offline"}>
              {health.isSuccess ? "Nominal" : "Synchronizing"}
            </strong>
            <small>
              {health.data
                ? `${health.data.service} v${health.data.version}`
                : "Awaiting telemetry"}
            </small>
          </HolographicPanel>
        </div>

        <div className="command-card-row command-card-row-four">
          <HolographicPanel className="command-info-card" delay={0.36}>
            <div className="holo-heading">
              <Workflow size={16} />
              <span>Workflow Streams</span>
            </div>
            <strong>{numericStatus(activeWorkflowCount)}</strong>
            <small>
              Active long-running plans remain interruptible and approval gated.
            </small>
          </HolographicPanel>
          <HolographicPanel className="command-info-card" delay={0.43}>
            <div className="holo-heading">
              <Network size={16} />
              <span>Integrations</span>
            </div>
            <strong>{numericStatus(integrations.data?.integrations.length)}</strong>
            <small>Connector operations are capability scoped and audited.</small>
          </HolographicPanel>
          <HolographicPanel className="command-info-card" delay={0.5}>
            <div className="holo-heading">
              <Database size={16} />
              <span>Database Health</span>
            </div>
            <strong>Postgres</strong>
            <small>
              Security and repository state persist through governed stores.
            </small>
          </HolographicPanel>
          <HolographicPanel className="command-info-card" delay={0.57}>
            <div className="holo-heading">
              <Cpu size={16} />
              <span>Trusted Devices</span>
            </div>
            <strong>{numericStatus(trustedDeviceCount)}</strong>
            <small>
              Device trust never replaces authentication or policy evaluation.
            </small>
          </HolographicPanel>
        </div>
      </aside>

      <div className="command-bottom-stack">
        <div className="command-card-row command-card-row-three">
          <HolographicPanel className="command-info-card" delay={0.62}>
            <div className="holo-heading">
              <Radio size={16} />
              <span>Alexa now</span>
            </div>
            <strong>{voiceRuntime.frame.message || "Standing by"}</strong>
            <small>
              {voiceRuntime.active
                ? `${readableStatus(voiceRuntime.frame.state)} · ${voiceRuntime.frame.latencyMs} ms`
                : "Voice runtime is ready when you are."}
            </small>
          </HolographicPanel>
          <HolographicPanel className="command-info-card" delay={0.68}>
            <div className="holo-heading">
              <Cpu size={16} />
              <span>Current AI</span>
            </div>
            <strong>{aiRuntime.data?.readiness ?? "Checking"}</strong>
            <small>{aiRuntime.data?.overall ?? "Runtime health is loading."}</small>
          </HolographicPanel>
          <HolographicPanel className="command-info-card" delay={0.74}>
            <div className="holo-heading">
              <Shield size={16} />
              <span>Needs attention</span>
            </div>
            <strong>{approvals.data?.length ?? 0} pending approvals</strong>
            <small>Security alerts and governed decisions stay visible here.</small>
          </HolographicPanel>
        </div>
        <div className="command-security-strip">
          <div>
            <p className="eyebrow">Security status</p>
            <strong>
              {security.data?.emergencyStopActive || localStopAsserted
                ? "Emergency stop active"
                : "Fail closed"}
            </strong>
            <span>Policy, approval, audit, and owner identity remain active.</span>
          </div>
          <button
            className="holo-danger-button"
            disabled={stop.isPending}
            onClick={() => void stop.mutate()}
            type="button"
          >
            Assert emergency stop
          </button>
        </div>

        <div className="command-footer-strip">
          <span>
            <Activity size={14} /> API nominal
          </span>
          <span>
            <Bot size={14} /> Agent registry online
          </span>
          <span>
            <Workflow size={14} /> Workflow queue idle
          </span>
          <span>
            <Shield size={14} /> Security controls active
          </span>
          <span>
            <Radio size={14} /> Sound hooks prepared
          </span>
          <span>
            <Zap size={14} /> UI 60fps target
          </span>
        </div>
      </div>
    </section>
  );
};
