import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  Bot,
  BrainCircuit,
  CircleGauge,
  Cpu,
  Database,
  GitBranch,
  Lightbulb,
  Network,
  Radio,
  Shield,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";

import type { ApiClient } from "./api.js";
import type { BrainRuntimeSummary } from "@alexa-control/shared";
import type { SceneRepositoryNode, SceneWorkflowNode } from "./HomeScene3D.js";
import { usePersistentVoiceRuntime } from "./PersistentVoiceRuntime.js";
import { NeedsAttentionFeed } from "./BusinessOSComponents.js";

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

type BrainNode = BrainRuntimeSummary["nodes"][number];
type ConstellationNode = Omit<BrainNode, "id"> & {
  id: string;
  category: "SYSTEM" | "DEPARTMENT" | "AGENT";
  departmentId?: string;
};

const workforceNodeStatus = (status: string): BrainNode["status"] => {
  if (status === "ACTIVE") return "ACTIVE";
  if (["BLOCKED", "FAILED"].includes(status)) return "DEGRADED";
  if (status === "SUSPENDED") return "WARNING";
  return "IDLE";
};

const BrainConstellation = ({
  nodes,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: ConstellationNode[];
  selectedNodeId: string | null;
  onSelectNode: (node: ConstellationNode) => void;
}) => {
  const displayNodes =
    nodes.length > 0
      ? nodes
      : [
          {
            id: "agents",
            label: "Agents",
            status: "IDLE",
            value: "Synchronizing",
            detail: ["Awaiting Alexa brain state"],
            active: false,
            category: "SYSTEM",
          } satisfies ConstellationNode,
        ];
  return (
    <div className="agent-constellation brain-constellation" aria-label="Alexa cognitive systems">
      {displayNodes.map((node) => {
        const categoryNodes = displayNodes.filter((candidate) => candidate.category === node.category);
        const categoryIndex = categoryNodes.findIndex((candidate) => candidate.id === node.id);
        const angle = (categoryIndex / categoryNodes.length) * Math.PI * 2 - Math.PI / 2;
        const radius = node.category === "SYSTEM"
          ? { x: 142, y: 106 }
          : node.category === "DEPARTMENT"
            ? { x: 276, y: 194 }
            : { x: 188, y: 164 };
        return (
          <button
            aria-label={`${node.label}: ${node.status}, ${node.value}`}
            aria-pressed={selectedNodeId === node.id}
            className={`agent-star brain-node brain-node-${node.category.toLowerCase()} brain-status-${node.status.toLowerCase()} ${node.active ? "is-active" : ""} ${selectedNodeId === node.id ? "selected" : ""}`}
            key={node.id}
            onClick={() => {
              onSelectNode(node);
              window.dispatchEvent(
                new CustomEvent("assistant:sound-hook", {
                  detail: { event: "brain_node_select", nodeId: node.id },
                }),
              );
            }}
            style={
              {
                "--node-x": `${Math.cos(angle) * radius.x}px`,
                "--node-y": `${Math.sin(angle) * radius.y}px`,
                "--progress": node.active ? "100%" : "0%",
              } as React.CSSProperties
            }
            type="button"
          >
            <span />
            <small>{node.label}</small>
          </button>
        );
      })}
    </div>
  );
};

const SelectedBrainNodeCard = ({ node }: { node: ConstellationNode | null }) => {
  const displayed =
    node ??
    ({
      id: "agents",
      label: "Alexa Brain",
      status: "IDLE",
      value: "Select a cognitive system",
      detail: ["Live bounded runtime state appears here."],
      active: false,
      category: "SYSTEM",
    } satisfies ConstellationNode);
  return (
    <aside className="selected-agent-card" aria-live="polite">
      <p className="eyebrow">Selected brain node</p>
      <strong>{displayed.label}</strong>
      <dl>
        <dt>Status</dt>
        <dd><span className={`brain-status-dot status-${displayed.status.toLowerCase()}`} />{displayed.status}</dd>
        <dt>Live state</dt>
        <dd>{displayed.value}</dd>
        {displayed.detail.map((detail, index) => (
          <div className="brain-node-detail" key={`${displayed.id}-${index}`}>
            <dt>{index === 0 ? "Evidence" : ""}</dt>
            <dd>{detail}</dd>
          </div>
        ))}
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
  const [selectedBrainNodeId, setSelectedBrainNodeId] = useState<string | null>(null);
  const [expandedDepartmentId, setExpandedDepartmentId] = useState<string | null>(null);

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
  const brain = useQuery({
    queryKey: ["brain-runtime-summary"],
    queryFn: apiClient.getBrainRuntimeSummary,
    refetchInterval: 5_000,
  });
  const workforce = useQuery({
    queryKey: ["agent-workforce-graph", "home-constellation"],
    queryFn: () => apiClient.getAgentWorkforceGraph("limit=160"),
    refetchInterval: 15_000,
  });
  const businessOS = useQuery({
    queryKey: ["business-os-summary"],
    queryFn: apiClient.getBusinessOSSummary,
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
  const constellationNodes = useMemo<ConstellationNode[]>(() => {
    const systems = (brain.data?.nodes ?? []).map((node) => ({ ...node, category: "SYSTEM" as const }));
    const departments = (workforce.data?.nodes ?? [])
      .filter((node) => node.kind === "DEPARTMENT")
      .map((node) => ({
        id: `department:${node.departmentId}`,
        label: node.label,
        status: workforceNodeStatus(node.status),
        value: `${node.childCount} specialists`,
        detail: [node.subtitle, "Select to expand the bounded specialist view."],
        active: node.status === "ACTIVE",
        category: "DEPARTMENT" as const,
        ...(node.departmentId ? { departmentId: node.departmentId } : {}),
      }));
    const specialists = expandedDepartmentId === null
      ? []
      : (workforce.data?.nodes ?? [])
        .filter((node) => node.kind === "AGENT" && node.departmentId === expandedDepartmentId)
        .slice(0, 8)
        .map((node) => ({
          id: `agent:${node.id}`,
          label: node.label,
          status: workforceNodeStatus(node.status),
          value: node.status.toLowerCase(),
          detail: [node.subtitle, "Bounded department specialist."],
          active: node.status === "ACTIVE",
          category: "AGENT" as const,
          ...(node.departmentId ? { departmentId: node.departmentId } : {}),
        }));
    return [...systems, ...departments, ...specialists];
  }, [brain.data?.nodes, expandedDepartmentId, workforce.data?.nodes]);
  const selectedBrainNode = selectedBrainNodeId === null
    ? null
    : (constellationNodes.find((node) => node.id === selectedBrainNodeId) ?? null);
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

      <NeedsAttentionFeed compact data={businessOS.data} />

      <div className="command-hero-card">
        <div className="command-core-stage" aria-label="Interactive AI ecosystem core">
          <div className="mesh-stage-heading">
            <span>Alexa brain</span>
            <small>{numericStatus(brain.data?.nodes.length)} cognitive systems · {numericStatus(workforce.data?.summary.departments)} departments · select a node</small>
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
            Alexa core online
          </div>
          <BrainConstellation
            nodes={constellationNodes}
            onSelectNode={(node) => {
              setSelectedBrainNodeId(node.id);
              if (node.category === "DEPARTMENT") {
                setExpandedDepartmentId((current) => current === node.departmentId ? null : node.departmentId ?? null);
              }
            }}
            selectedNodeId={selectedBrainNode?.id ?? selectedBrainNodeId}
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

        <SelectedBrainNodeCard node={selectedBrainNode} />

        <div className="command-metric-grid" aria-label="Primary telemetry">
          {telemetry.slice(0, 6).map((item) => (
            <TelemetryWidget item={item} key={item.label} />
          ))}
        </div>
      </div>

      <section className="cognitive-path-panel" aria-labelledby="cognitive-path-title">
        <div className="brain-section-heading">
          <div>
            <span>Live routing</span>
            <h2 id="cognitive-path-title">Current cognitive path</h2>
          </div>
          <small>Only stages used by the current Alexa runtime are illuminated.</small>
        </div>
        <div className="cognitive-path-track">
          {(brain.data?.cognitivePath ?? []).map((stage) => (
            <div className={`cognitive-stage state-${stage.state.toLowerCase()}`} key={stage.stage}>
              <i />
              <span>{readableStatus(stage.stage)}</span>
            </div>
          ))}
          {brain.isPending ? <span className="brain-empty-inline">Synchronizing cognitive state</span> : null}
        </div>
      </section>

      <section className="brain-summary-grid" aria-label="Alexa brain summary">
        <article className="brain-operational-card current-cognition-card">
          <div className="holo-heading"><BrainCircuit size={16} /><span>Current cognition</span></div>
          <dl>
            <dt>Intent</dt><dd>{brain.data?.cognition.intent ?? "No active turn"}</dd>
            <dt>Context</dt><dd>{brain.data?.cognition.context ?? "No active context"}</dd>
            <dt>Memory</dt><dd>{brain.data?.cognition.memory ?? "0 relevant memories"}</dd>
            <dt>AI</dt><dd>{brain.data?.cognition.ai ?? "No recent route"}</dd>
            <dt>Knowledge</dt><dd>{brain.data?.cognition.knowledgeConfidence === null || brain.data?.cognition.knowledgeConfidence === undefined ? "Not measured" : `${Math.round(brain.data.cognition.knowledgeConfidence * 100)}% confidence`}</dd>
          </dl>
        </article>

        <article className="brain-operational-card brain-health-card">
          <div className="holo-heading"><CircleGauge size={16} /><span>Brain health</span></div>
          <div className="brain-health-list">
            {[
              ["Memory", brain.data?.brainHealth.memory ?? "CHECKING"],
              ["Embeddings", brain.data?.brainHealth.embeddings === null || brain.data?.brainHealth.embeddings === undefined ? "Not measured" : `${Math.round(brain.data.brainHealth.embeddings * 100)}%`],
              ["Knowledge graph", brain.data?.brainHealth.knowledgeGraph ?? "CHECKING"],
              ["Conflicts", numericStatus(brain.data?.brainHealth.conflicts)],
              ["Gaps", numericStatus(brain.data?.brainHealth.gaps)],
              ["Orphans", numericStatus(brain.data?.brainHealth.orphans)],
            ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
        </article>

        <article className="brain-operational-card knowledge-gap-card">
          <div className="holo-heading"><Lightbulb size={16} /><span>Knowledge gaps</span></div>
          <div className="compact-runtime-list">
            {(brain.data?.knowledgeGaps ?? []).slice(0, 4).map((gap) => (
              <div key={`${gap.objective}-${gap.assessedAt}`}>
                <strong>{gap.objective}</strong>
                <span>{gap.missing.length > 0 ? `${gap.missing.length} missing · ${gap.missing.slice(0, 2).join(", ")}` : "Evidence sufficient"}</span>
              </div>
            ))}
            {(brain.data?.knowledgeGaps.length ?? 0) === 0 ? <p className="brain-empty">No gap assessments yet.</p> : null}
          </div>
        </article>

        <article className="brain-operational-card brain-observability-card">
          <div className="holo-heading"><Activity size={16} /><span>Routing economy</span></div>
          <div className="brain-health-list">
            <div><span>Brain-first lookups</span><strong>{numericStatus(brain.data?.observability.brainFirstLookups)}</strong></div>
            <div><span>Memory sufficient</span><strong>{numericStatus(brain.data?.observability.memorySufficient)}</strong></div>
            <div><span>AI required</span><strong>{numericStatus(brain.data?.observability.aiRequired)}</strong></div>
            <div><span>Deterministic</span><strong>{numericStatus(brain.data?.observability.deterministicResolutions)}</strong></div>
            <div><span>Memory avg</span><strong>{brain.data?.observability.memoryFirstAverageLatencyMs == null ? "Not measured" : `${Math.round(brain.data.observability.memoryFirstAverageLatencyMs)}ms`}</strong></div>
            <div><span>AI avg</span><strong>{brain.data?.observability.aiAverageLatencyMs == null ? "Not measured" : `${Math.round(brain.data.observability.aiAverageLatencyMs)}ms`}</strong></div>
          </div>
        </article>
      </section>

      <section className="brain-workforce-grid" aria-label="Alexa organization and delegation">
        <article className="brain-operational-card organization-card">
          <div className="brain-section-heading">
            <div><span>Organization</span><h2>Development department</h2></div>
            <small>{numericStatus(brain.data?.organization.length)} Alexa AgentDefinitions</small>
          </div>
          <div className="organization-tree">
            {(brain.data?.organization ?? []).map((agent) => (
              <div className={`organization-agent kind-${agent.kind.toLowerCase()}`} key={agent.id}>
                <Users size={14} />
                <div><strong>{agent.label}</strong><span>{readableStatus(agent.kind)} · {readableStatus(agent.status)}</span></div>
                <small>{agent.capabilityCount} capabilities</small>
              </div>
            ))}
            {(brain.data?.organization.length ?? 0) === 0 ? <p className="brain-empty">Agent organization is synchronizing.</p> : null}
          </div>
        </article>

        <article className="brain-operational-card live-delegation-card">
          <div className="brain-section-heading">
            <div><span>Agent OS</span><h2>Live delegations</h2></div>
            <small>AIRouter + isolated sandbox</small>
          </div>
          <div className="compact-runtime-list delegation-list">
            {(brain.data?.delegations ?? []).slice(0, 6).map((session) => (
              <div key={session.id}>
                <span className={`delegation-state state-${session.status}`} />
                <div><strong>{session.inputSummary}</strong><span>{session.agentId} · {readableStatus(session.status)} · sandbox {readableStatus(session.delegation?.sandboxStatus ?? "pending")}</span></div>
                <small>{session.endedAt ? relativeActivity(session.endedAt) : "running"}</small>
              </div>
            ))}
            {(brain.data?.delegations.length ?? 0) === 0 ? <p className="brain-empty">No specialist delegations yet.</p> : null}
          </div>
        </article>
      </section>

      <section className="brain-operational-card knowledge-neighborhood-card" aria-labelledby="knowledge-neighborhood-title">
        <div className="brain-section-heading">
          <div><span>Bounded graph</span><h2 id="knowledge-neighborhood-title">Knowledge neighborhood</h2></div>
          <small>Recent entities only · no full graph dump</small>
        </div>
        <div className="knowledge-neighborhood">
          {(brain.data?.knowledgeNeighborhood ?? []).map((node) => (
            <div className="knowledge-node" key={node.id} title={`${node.connectionCount} connections`}>
              <i />
              <strong>{node.label}</strong>
              <span>{readableStatus(node.kind)} · {node.connectionCount} links</span>
            </div>
          ))}
          {(brain.data?.knowledgeNeighborhood.length ?? 0) === 0 ? <p className="brain-empty">No knowledge entities are available yet.</p> : null}
        </div>
      </section>

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
