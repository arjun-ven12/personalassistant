import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  LocateFixed,
  Minus,
  Network,
  Plus,
  Search,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { WorkforceGraphResponse } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";
import { layoutWorkforceGraph } from "./agentWorkforceLayout.js";
import { ContextualAskAlexa } from "./BusinessOSComponents.js";

type InspectorTab =
  | "overview"
  | "activity"
  | "memory"
  | "skills"
  | "capabilities"
  | "tasks"
  | "economy"
  | "children";

const statusLabel = (status: string) =>
  status.charAt(0) + status.slice(1).toLowerCase();
const nodeDimensions = (kind: WorkforceGraphResponse["nodes"][number]["kind"]) =>
  kind === "AGENT"
    ? { width: 252, height: 56 }
    : kind === "DEPARTMENT"
      ? { width: 270, height: 68 }
      : { width: 252, height: 60 };

export const AgentWorkforceGraph = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [selectedId, setSelectedId] = useState(
    () => new URLSearchParams(window.location.search).get("selected") ?? "",
  );
  const [tab, setTab] = useState<InspectorTab>("overview");
  const [zoom, setZoom] = useState(0.78);
  const [offset, setOffset] = useState({ x: 20, y: 20 });
  const [focusBranch, setFocusBranch] = useState(false);
  const [collapsedDepartments, setCollapsedDepartments] = useState<Set<string>>(
    new Set(),
  );
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [newDepartmentPurpose, setNewDepartmentPurpose] = useState("");
  const [newDepartmentTemplateId, setNewDepartmentTemplateId] = useState("");
  const [newDepartmentParentId, setNewDepartmentParentId] = useState("");
  const [newDepartmentManagerId, setNewDepartmentManagerId] = useState("");
  const drag = useRef<{
    x: number;
    y: number;
    originX: number;
    originY: number;
  } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const query = useMemo(() => {
    const value = new URLSearchParams();
    if (search.trim()) value.set("q", search.trim());
    if (departmentId) value.set("departmentId", departmentId);
    if (status) value.set("status", status);
    if (source) value.set("source", source);
    value.set("limit", "500");
    return value.toString();
  }, [departmentId, search, source, status]);
  const graph = useQuery({
    queryKey: ["agent-workforce-graph", query],
    queryFn: () => apiClient.getAgentWorkforceGraph(query),
    refetchInterval: 15_000,
  });
  const runtime = useQuery({
    queryKey: ["workforce-runtime", "graph"],
    queryFn: apiClient.getWorkforceRuntime,
    refetchInterval: 5_000,
  });
  const catalog = useQuery({
    queryKey: ["agent-catalog", "workforce-management"],
    queryFn: () => apiClient.getAgentCatalog("limit=500"),
  });
  const departmentTemplates = useQuery({
    queryKey: ["workforce-department-templates"],
    queryFn: apiClient.getWorkforceDepartmentTemplates,
  });
  const detail = useQuery({
    queryKey: ["agent-workforce-detail", selectedId],
    queryFn: () => apiClient.getAgentWorkforceDetail(selectedId),
    enabled: Boolean(
      selectedId &&
      selectedId !== "alexa_governor" &&
      !selectedId.startsWith("department:"),
    ),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["agent-workforce-graph"] });
    await queryClient.invalidateQueries({ queryKey: ["agent-workforce-detail"] });
    await queryClient.invalidateQueries({ queryKey: ["agent-economy-dashboard"] });
  };
  const bootstrap = useMutation({
    mutationFn: apiClient.bootstrapAgentWorkforce,
    onSuccess: refresh,
  });
  const createDepartment = useMutation({
    mutationFn: apiClient.createWorkforceDepartment,
    onSuccess: async () => {
      setNewDepartmentName("");
      setNewDepartmentPurpose("");
      setNewDepartmentTemplateId("");
      setNewDepartmentParentId("");
      setNewDepartmentManagerId("");
      await refresh();
    },
  });
  const updateDepartment = useMutation({
    mutationFn: ({
      departmentId,
      input,
    }: {
      departmentId: string;
      input: Parameters<ApiClient["updateWorkforceDepartment"]>[1];
    }) => apiClient.updateWorkforceDepartment(departmentId, input),
    onSuccess: refresh,
  });
  const archiveDepartment = useMutation({
    mutationFn: ({
      departmentId,
      relocateToDepartmentId,
    }: {
      departmentId: string;
      relocateToDepartmentId: string | null;
    }) => apiClient.archiveWorkforceDepartment(departmentId, relocateToDepartmentId),
    onSuccess: refresh,
  });
  const moveAgent = useMutation({
    mutationFn: ({
      agentId,
      departmentId: nextDepartmentId,
    }: {
      agentId: string;
      departmentId: string | null;
    }) => apiClient.moveWorkforceAgent(agentId, nextDepartmentId),
    onSuccess: refresh,
  });
  const assignCatalogAgent = useMutation({
    mutationFn: ({
      definitionId,
      departmentId: targetDepartmentId,
    }: {
      definitionId: string;
      departmentId: string;
    }) =>
      apiClient.assignAgentFromCatalogToDepartment(definitionId, targetDepartmentId),
    onSuccess: refresh,
  });
  const activation = useMutation({
    mutationFn: ({
      agentId,
      state,
    }: {
      agentId: string;
      state: "ACTIVE" | "DORMANT";
    }) => apiClient.updateAgentWorkforceActivation(agentId, state),
    onSuccess: refresh,
  });

  const graphData = graph.data;
  const selectedNode = graphData?.nodes.find((node) => node.id === selectedId) ?? null;
  const selectedDepartment =
    graphData?.departments.find(
      (department) => department.id === selectedNode?.departmentId,
    ) ?? null;
  const highlightedNodeIds = useMemo(() => {
    if (!graphData || !focusBranch || !selectedNode) return new Set<string>();
    const ids = new Set(["alexa_governor", selectedNode.id]);
    if (selectedNode.departmentId) ids.add(`department:${selectedNode.departmentId}`);
    if (selectedNode.parentId) ids.add(selectedNode.parentId);
    for (const node of graphData.nodes) {
      if (
        selectedNode.kind === "DEPARTMENT" &&
        node.departmentId === selectedNode.departmentId
      )
        ids.add(node.id);
      if (selectedNode.kind === "AGENT" && node.parentId === selectedNode.id)
        ids.add(node.id);
    }
    return ids;
  }, [focusBranch, graphData, selectedNode]);
  const visibleGraph = useMemo<WorkforceGraphResponse | null>(() => {
    if (!graphData) return null;
    const activeAgentIds = new Set(
      (runtime.data?.tasks ?? [])
        .filter((task) =>
          ["ASSIGNED", "RESERVED", "RUNNING", "REVIEW_REQUIRED"].includes(task.status),
        )
        .map((task) => task.assignedAgentId)
        .filter((id): id is string => Boolean(id)),
    );
    const nodes = graphData.nodes
      .filter((node) => {
        return (
          node.kind !== "AGENT" ||
          !node.departmentId ||
          !collapsedDepartments.has(node.departmentId)
        );
      })
      .map((node) =>
        activeAgentIds.has(node.id) ? { ...node, status: "ACTIVE" as const } : node,
      );
    const ids = new Set(nodes.map((node) => node.id));
    const activityEdges = (runtime.data?.tasks ?? [])
      .filter(
        (task) =>
          task.createdByAgentId &&
          task.assignedAgentId &&
          ids.has(task.createdByAgentId) &&
          ids.has(task.assignedAgentId),
      )
      .map((task) => ({
        id: `runtime:${task.id}`,
        source: task.createdByAgentId!,
        target: task.assignedAgentId!,
        type: "RECENT_ACTIVITY" as const,
      }));
    return {
      ...graphData,
      nodes,
      edges: [
        ...graphData.edges.filter(
          (edge) => ids.has(edge.source) && ids.has(edge.target),
        ),
        ...activityEdges,
      ],
    };
  }, [collapsedDepartments, graphData, runtime.data?.tasks]);
  const layout = useMemo(
    () => (visibleGraph ? layoutWorkforceGraph(visibleGraph) : null),
    [visibleGraph],
  );
  const byId = useMemo(
    () => new Map(layout?.nodes.map((node) => [node.id, node]) ?? []),
    [layout],
  );

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest("button, .workforce-node")) return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setOffset({
      x: drag.current.originX + event.clientX - drag.current.x,
      y: drag.current.originY + event.clientY - drag.current.y,
    });
  };
  const pointerUp = () => {
    drag.current = null;
  };
  const zoomAtPointer = useCallback(
    (deltaY: number, clientX: number, clientY: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const nextZoom = Math.min(1.5, Math.max(0.35, zoom * (deltaY < 0 ? 1.12 : 0.88)));
      if (nextZoom === zoom) return;
      const bounds = viewport.getBoundingClientRect();
      const pointerX = clientX - bounds.left;
      const pointerY = clientY - bounds.top;
      const graphX = (pointerX - offset.x) / zoom;
      const graphY = (pointerY - offset.y) / zoom;
      setZoom(nextZoom);
      setOffset({ x: pointerX - graphX * nextZoom, y: pointerY - graphY * nextZoom });
    },
    [offset, zoom],
  );
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAtPointer(event.deltaY, event.clientX, event.clientY);
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [zoomAtPointer]);
  const resetView = () => {
    setZoom(0.78);
    setOffset({ x: 20, y: 20 });
  };
  const showAllEntities = () => {
    setSelectedId("");
    setFocusBranch(false);
    resetView();
  };
  const selectNode = (nodeId: string) => {
    const node = byId.get(nodeId);
    const focusedZoom = 0.94;
    setSelectedId(nodeId);
    setTab("overview");
    setFocusBranch(nodeId !== "alexa_governor");
    setZoom(focusedZoom);
    if (node && viewportRef.current) {
      const { width, height } = nodeDimensions(node.kind);
      setOffset({
        x: viewportRef.current.clientWidth / 2 - (node.x + width / 2) * focusedZoom,
        y: viewportRef.current.clientHeight / 2 - (node.y + height / 2) * focusedZoom,
      });
    }
  };

  if (graph.isLoading) return <div className="notice">Loading workforce graph...</div>;
  if (graph.error || !graphData || !layout)
    return <div className="notice error">Workforce graph is unavailable.</div>;

  return (
    <div className="workforce-workspace">
      <section
        className="compact-metric-strip workforce-metrics"
        aria-label="Workforce summary"
      >
        <span>
          <small>Catalog</small>
          <strong>{catalog.data?.catalogCount ?? 0}</strong>
        </span>
        <span>
          <small>Assigned</small>
          <strong>{graphData.summary.registered}</strong>
        </span>
        <span>
          <small>Active</small>
          <strong>{graphData.summary.active}</strong>
        </span>
        <span>
          <small>Dormant</small>
          <strong>{graphData.summary.dormant}</strong>
        </span>
        <span>
          <small>Available</small>
          <strong>
            {Math.max(
              0,
              (catalog.data?.catalogCount ?? 0) - (catalog.data?.assignedCount ?? 0),
            )}
          </strong>
        </span>
        <span>
          <small>Departments</small>
          <strong>{graphData.summary.departments}</strong>
        </span>
        <span>
          <small>Memory scopes</small>
          <strong>{graphData.summary.memoryScopes}</strong>
        </span>
        <span>
          <small>Capability profiles</small>
          <strong>{graphData.summary.capabilityProfiles}</strong>
        </span>
        <span>
          <small>Avg reputation</small>
          <strong>{graphData.summary.averageReputation.toFixed(1)}</strong>
        </span>
      </section>

      {graphData.bootstrapAvailable ? (
        <section className="workforce-bootstrap">
          <div>
            <p className="eyebrow">Optional company setup</p>
            <h2>Assign the standard workforce to this company</h2>
            <p>
              This company currently has {graphData.summary.registered} assigned. The
              standard workforce would bring it to{" "}
              {graphData.importPreview.finalActualRegisteredAgents} company assignments.
              Newly assigned specialists remain dormant; no model, worker, or external
              runtime is started.
            </p>
          </div>
          <button
            disabled={bootstrap.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Assign the full standard workforce to this company? This creates dormant company assignments and does not start any runtime.",
                )
              )
                bootstrap.mutate();
            }}
            type="button"
          >
            {bootstrap.isPending ? "Assigning..." : "Assign standard workforce"}
          </button>
        </section>
      ) : null}

      <section className="workforce-department-management">
        <div>
          <p className="eyebrow">Company departments</p>
          <h2>Organize the assigned workforce</h2>
          <p>
            Create company-scoped departments, then assign reusable specialists without
            duplicating their catalog identities.
          </p>
        </div>
        <details>
          <summary>New Department</summary>
          <form
            className="workforce-department-form"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              createDepartment.mutate({
                name: newDepartmentName,
                purpose: newDepartmentPurpose,
                parentDepartmentId: newDepartmentParentId || null,
                templateId: newDepartmentTemplateId || null,
                managerDefinitionId: newDepartmentManagerId || null,
                initialDefinitionIds: [],
              });
            }}
          >
            <label>
              Name
              <input
                required
                value={newDepartmentName}
                onChange={(event) => setNewDepartmentName(event.target.value)}
              />
            </label>
            <label>
              Purpose
              <input
                required
                value={newDepartmentPurpose}
                onChange={(event) => setNewDepartmentPurpose(event.target.value)}
              />
            </label>
            <label>
              Template
              <select
                value={newDepartmentTemplateId}
                onChange={(event) => {
                  const template = departmentTemplates.data?.templates.find(
                    (item) => item.id === event.target.value,
                  );
                  setNewDepartmentTemplateId(event.target.value);
                  if (template && !newDepartmentPurpose)
                    setNewDepartmentPurpose(template.genericPurpose);
                  if (template && !newDepartmentName)
                    setNewDepartmentName(template.name);
                }}
              >
                <option value="">Custom department</option>
                {departmentTemplates.data?.templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Parent
              <select
                value={newDepartmentParentId}
                onChange={(event) => setNewDepartmentParentId(event.target.value)}
              >
                <option value="">Governor</option>
                {graphData.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Manager
              <select
                value={newDepartmentManagerId}
                onChange={(event) => setNewDepartmentManagerId(event.target.value)}
              >
                <option value="">Assign later</option>
                {catalog.data?.items
                  .filter((item) => item.definition.role === "engineering_manager")
                  .map((item) => (
                    <option key={item.definition.id} value={item.definition.id}>
                      {item.definition.name}
                    </option>
                  ))}
              </select>
            </label>
            <button disabled={createDepartment.isPending} type="submit">
              {createDepartment.isPending ? "Creating..." : "Create department"}
            </button>
          </form>
        </details>
      </section>

      <section className="workforce-toolbar" aria-label="Workforce graph controls">
        <label className="workforce-search">
          <Search size={15} />
          <input
            aria-label="Search workforce"
            placeholder="Search role, skill, agent..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          aria-label="Filter by department"
          value={departmentId}
          onChange={(event) => setDepartmentId(event.target.value)}
        >
          <option value="">All departments</option>
          {graphData.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by state"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">All states</option>
          <option value="ACTIVE">Active</option>
          <option value="DORMANT">Dormant</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <select
          aria-label="Filter by source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
        >
          <option value="">All sources</option>
          <option value="ALEXA_NATIVE">Alexa native</option>
          <option value="EVERYTHING_CLAUDE_CODE">External-derived</option>
        </select>
        {focusBranch ? (
          <button className="is-active" onClick={showAllEntities} type="button">
            <LocateFixed size={15} /> Show all entities
          </button>
        ) : (
          <button
            disabled={!selectedId}
            onClick={() => setFocusBranch(true)}
            type="button"
          >
            <LocateFixed size={15} /> Show linked entities
          </button>
        )}
      </section>

      <div className="workforce-main-grid">
        <section className="workforce-graph-panel">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Organization graph</p>
              <h2>
                {focusBranch && selectedNode
                  ? `${selectedNode.label} connections`
                  : (graphData.organization?.name ?? "Alexa Workforce")}
              </h2>
            </div>
            <span className="mono-meta">{layout.nodes.length} visible nodes</span>
          </div>
          <div className="workforce-graph-controls">
            <button
              aria-label="Zoom in"
              onClick={() => setZoom((value) => Math.min(1.5, value + 0.12))}
              title="Zoom in"
              type="button"
            >
              <Plus size={15} />
            </button>
            <button
              aria-label="Zoom out"
              onClick={() => setZoom((value) => Math.max(0.35, value - 0.12))}
              title="Zoom out"
              type="button"
            >
              <Minus size={15} />
            </button>
            <button
              aria-label="Fit graph"
              onClick={resetView}
              title="Fit graph"
              type="button"
            >
              <Network size={15} />
            </button>
          </div>
          <div
            className="workforce-graph-viewport"
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            ref={viewportRef}
          >
            <svg
              aria-label="Alexa agent organization graph"
              height={layout.height}
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              }}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              width={layout.width}
            >
              <g className="workforce-edges">
                {visibleGraph?.edges.map((edge) => {
                  const sourceNode = byId.get(edge.source);
                  const targetNode = byId.get(edge.target);
                  if (!sourceNode || !targetNode) return null;
                  const sourceSize = nodeDimensions(sourceNode.kind);
                  const targetSize = nodeDimensions(targetNode.kind);
                  const highlighted =
                    highlightedNodeIds.has(edge.source) &&
                    highlightedNodeIds.has(edge.target);
                  return (
                    <path
                      className={
                        focusBranch ? (highlighted ? "is-linked" : "is-dimmed") : ""
                      }
                      d={`M ${sourceNode.x + sourceSize.width} ${sourceNode.y + sourceSize.height / 2} C ${sourceNode.x + sourceSize.width + 46} ${sourceNode.y + sourceSize.height / 2}, ${targetNode.x - 46} ${targetNode.y + targetSize.height / 2}, ${targetNode.x} ${targetNode.y + targetSize.height / 2}`}
                      key={edge.id}
                    />
                  );
                })}
              </g>
              {layout.nodes.map((node) => {
                const { width, height } = nodeDimensions(node.kind);
                const selected = node.id === selectedId;
                const highlighted = !focusBranch || highlightedNodeIds.has(node.id);
                return (
                  <g
                    aria-label={`Show linked entities for ${node.label}`}
                    className={`workforce-node node-${node.kind.toLowerCase()} state-${node.status.toLowerCase()}${selected ? " is-selected" : ""}${highlighted ? " is-linked" : " is-dimmed"}`}
                    key={node.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectNode(node.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectNode(node.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    transform={`translate(${node.x}, ${node.y})`}
                  >
                    <rect
                      height={height}
                      rx={node.kind === "AGENT" ? 5 : 8}
                      width={width}
                    />
                    {node.kind === "DEPARTMENT" ? (
                      <rect
                        className="node-accent"
                        height={height - 18}
                        rx="2"
                        width="3"
                        x="0"
                        y="9"
                      />
                    ) : null}
                    <circle cx="18" cy={height / 2} r="4" />
                    <text className="node-label" x="31" y={height / 2 - 4}>
                      {node.label.slice(0, 31)}
                    </text>
                    <text className="node-subtitle" x="31" y={height / 2 + 13}>
                      {node.subtitle.slice(0, 38)}
                    </text>
                    {node.kind === "DEPARTMENT" ? (
                      <text className="node-count" x={width - 16} y={height / 2 + 4}>
                        {node.childCount}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="workforce-legend">
            <span>
              <i className="legend-active" />
              Active
            </span>
            <span>
              <i className="legend-dormant" />
              Dormant
            </span>
            <span>
              <i className="legend-suspended" />
              Suspended
            </span>
            <span className="mono-meta">
              Click to center and inspect · drag to pan · scroll to zoom
            </span>
          </div>
        </section>

        <aside className="workforce-inspector" aria-live="polite">
          <p className="eyebrow">Inspector</p>
          <h2>{selectedNode?.label ?? "Select a node"}</h2>
          <p>
            {selectedNode?.subtitle ??
              "Choose a department or specialist to inspect its bounded organizational state."}
          </p>
          {selectedNode?.kind === "DEPARTMENT" ? (
            <DepartmentInspector
              department={selectedDepartment}
              node={selectedNode}
              departments={graphData.departments}
              catalog={catalog.data?.items ?? []}
              members={graphData.nodes.filter(
                (node) =>
                  node.kind === "AGENT" &&
                  node.departmentId === selectedNode.departmentId,
              )}
              busy={
                updateDepartment.isPending ||
                archiveDepartment.isPending ||
                assignCatalogAgent.isPending ||
                moveAgent.isPending
              }
              collapsed={Boolean(
                selectedNode.departmentId &&
                collapsedDepartments.has(selectedNode.departmentId),
              )}
              onToggle={() =>
                setCollapsedDepartments((current) => {
                  const next = new Set(current);
                  if (selectedNode.departmentId && next.has(selectedNode.departmentId))
                    next.delete(selectedNode.departmentId);
                  else if (selectedNode.departmentId)
                    next.add(selectedNode.departmentId);
                  return next;
                })
              }
              onUpdate={(input) =>
                selectedDepartment &&
                updateDepartment.mutate({ departmentId: selectedDepartment.id, input })
              }
              onArchive={(relocateToDepartmentId) =>
                selectedDepartment &&
                archiveDepartment.mutate({
                  departmentId: selectedDepartment.id,
                  relocateToDepartmentId,
                })
              }
              onAssign={(definitionId) =>
                selectedDepartment &&
                assignCatalogAgent.mutate({
                  definitionId,
                  departmentId: selectedDepartment.id,
                })
              }
              onMove={(agentId, departmentId) =>
                moveAgent.mutate({ agentId, departmentId })
              }
            />
          ) : null}
          {detail.data ? (
            <AgentInspector
              detail={detail.data}
              tab={tab}
              setTab={setTab}
              activationPending={activation.isPending}
              onActivation={(state) =>
                activation.mutate({ agentId: detail.data.agent.id, state })
              }
              departments={graphData.departments}
              movePending={moveAgent.isPending}
              onMove={(departmentId) =>
                moveAgent.mutate({ agentId: detail.data.agent.id, departmentId })
              }
            />
          ) : selectedNode?.kind === "AGENT" ? (
            <div className="notice">Loading agent detail...</div>
          ) : (
            <dl className="compact-definition-list">
              <div>
                <dt>Type</dt>
                <dd>{selectedNode?.kind ?? "-"}</dd>
              </div>
              <div>
                <dt>Children</dt>
                <dd>{selectedNode?.childCount ?? 0}</dd>
              </div>
              <div>
                <dt>Authority inherited</dt>
                <dd>No</dd>
              </div>
            </dl>
          )}
        </aside>
        {focusBranch && selectedNode ? (
          <section
            className="workforce-linked-entities"
            aria-label={`Entities linked to ${selectedNode.label}`}
          >
            <div>
              <p className="eyebrow">Linked entities</p>
              <h2>{selectedNode.label}</h2>
              <p>
                Showing the registered organizational entities directly connected to
                this selection.
              </p>
            </div>
            <div className="workforce-linked-list">
              {(visibleGraph?.nodes ?? [])
                .filter(
                  (node) =>
                    node.id !== selectedNode.id && highlightedNodeIds.has(node.id),
                )
                .map((node) => (
                  <button
                    key={node.id}
                    onClick={() => selectNode(node.id)}
                    type="button"
                  >
                    <span
                      className={`linked-entity-dot state-${node.status.toLowerCase()}`}
                    />
                    <span>
                      <strong>{node.label}</strong>
                      <small>
                        {node.kind === "DEPARTMENT" ? "Department" : node.subtitle}
                      </small>
                    </span>
                    <span className="mono-meta">
                      {node.kind === "AGENT" ? "Specialist" : node.kind}
                    </span>
                  </button>
                ))}
            </div>
          </section>
        ) : null}
      </div>
      <p className="workforce-runtime-note">
        Registered identities are metadata. Dormant agents create{" "}
        <strong>{graphData.runtime.modelInstancesFromRegistration}</strong> model
        instances, <strong>{graphData.runtime.workerProcessesFromRegistration}</strong>{" "}
        workers, and <strong>{graphData.runtime.providerCallsFromRegistration}</strong>{" "}
        provider calls. All reasoning remains routed through the shared AIRouter.
      </p>
    </div>
  );
};

const DepartmentInspector = ({
  department,
  node,
  departments,
  catalog,
  members,
  busy,
  collapsed,
  onToggle,
  onUpdate,
  onArchive,
  onAssign,
  onMove,
}: {
  department: WorkforceGraphResponse["departments"][number] | null;
  node: WorkforceGraphResponse["nodes"][number];
  departments: WorkforceGraphResponse["departments"];
  catalog: Awaited<ReturnType<ApiClient["getAgentCatalog"]>>["items"];
  members: WorkforceGraphResponse["nodes"];
  busy: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onUpdate: (input: Parameters<ApiClient["updateWorkforceDepartment"]>[1]) => void;
  onArchive: (relocateToDepartmentId: string | null) => void;
  onAssign: (definitionId: string) => void;
  onMove: (agentId: string, departmentId: string | null) => void;
}) => {
  const [name, setName] = useState(department?.name ?? "Unassigned");
  const [purpose, setPurpose] = useState(department?.responsibility ?? node.subtitle);
  const [managerDefinitionId, setManagerDefinitionId] = useState(
    department?.leadAgentId ?? "",
  );
  const [parentDepartmentId, setParentDepartmentId] = useState(
    department?.parentDepartmentId ?? "",
  );
  const [catalogDefinitionId, setCatalogDefinitionId] = useState("");
  const [relocateToDepartmentId, setRelocateToDepartmentId] = useState("");
  useEffect(() => {
    setName(department?.name ?? "Unassigned");
    setPurpose(department?.responsibility ?? node.subtitle);
    setManagerDefinitionId(department?.leadAgentId ?? "");
    setParentDepartmentId(department?.parentDepartmentId ?? "");
  }, [
    department?.id,
    department?.leadAgentId,
    department?.name,
    department?.parentDepartmentId,
    department?.responsibility,
    node.subtitle,
  ]);
  if (!department)
    return (
      <>
        <dl className="compact-definition-list">
          <div>
            <dt>Placement</dt>
            <dd>Unassigned</dd>
          </div>
          <div>
            <dt>Members</dt>
            <dd>{members.length}</dd>
          </div>
        </dl>
        <p className="mono-meta">
          Move a specialist into a company department when its reporting line is known.
        </p>
        <MemberList
          members={members}
          departments={departments}
          busy={busy}
          onMove={onMove}
        />
      </>
    );
  return (
    <>
      <button className="secondary-button" onClick={onToggle} type="button">
        {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        {collapsed ? "Expand" : "Collapse"} department
      </button>
      <form
        className="workforce-inspector-form"
        onSubmit={(event) => {
          event.preventDefault();
          onUpdate({
            name,
            purpose,
            parentDepartmentId: parentDepartmentId || null,
            managerDefinitionId: managerDefinitionId || null,
          });
        }}
      >
        <label>
          Name
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Purpose
          <input
            required
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
          />
        </label>
        <label>
          Manager
          <select
            value={managerDefinitionId}
            onChange={(event) => setManagerDefinitionId(event.target.value)}
          >
            <option value="">Assign later</option>
            {catalog
              .filter((item) => item.definition.role === "engineering_manager")
              .map((item) => (
                <option key={item.definition.id} value={item.definition.id}>
                  {item.definition.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Parent
          <select
            value={parentDepartmentId}
            onChange={(event) => setParentDepartmentId(event.target.value)}
          >
            <option value="">Governor</option>
            {departments
              .filter((candidate) => candidate.id !== department.id)
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
          </select>
        </label>
        <button disabled={busy} type="submit">
          Save department
        </button>
      </form>
      <label className="workforce-inspector-field">
        Add specialist
        <select
          value={catalogDefinitionId}
          onChange={(event) => setCatalogDefinitionId(event.target.value)}
        >
          <option value="">Select catalog specialist</option>
          {catalog
            .filter((item) => item.currentCompanyStatus !== "UNAVAILABLE")
            .map((item) => (
              <option key={item.definition.id} value={item.definition.id}>
                {item.definition.name}
                {item.currentCompanyStatus === "ASSIGNED" ? " (move here)" : ""}
              </option>
            ))}
        </select>
      </label>
      <button
        disabled={busy || !catalogDefinitionId}
        onClick={() => onAssign(catalogDefinitionId)}
        type="button"
      >
        Add specialist
      </button>
      <MemberList
        members={members}
        departments={departments}
        busy={busy}
        onMove={onMove}
      />
      <label className="workforce-inspector-field">
        Archive relocation
        <select
          value={relocateToDepartmentId}
          onChange={(event) => setRelocateToDepartmentId(event.target.value)}
        >
          <option value="">Move members to Unassigned</option>
          {departments
            .filter((candidate) => candidate.id !== department.id)
            .map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                Move members to {candidate.name}
              </option>
            ))}
        </select>
      </label>
      <button
        className="danger-button"
        disabled={busy}
        onClick={() => {
          if (
            window.confirm(
              `Archive ${department.name}? Assigned specialists will be safely relocated.`,
            )
          )
            onArchive(relocateToDepartmentId || null);
        }}
        type="button"
      >
        Archive department
      </button>
    </>
  );
};

const MemberList = ({
  members,
  departments,
  busy,
  onMove,
}: {
  members: WorkforceGraphResponse["nodes"];
  departments: WorkforceGraphResponse["departments"];
  busy: boolean;
  onMove: (agentId: string, departmentId: string | null) => void;
}) => (
  <div className="workforce-member-list">
    <p className="eyebrow">Assigned specialists</p>
    {members.map((member) => {
      const currentDepartmentId = departments.some(
        (department) => department.id === member.departmentId,
      )
        ? (member.departmentId ?? "")
        : "";
      return (
        <label key={member.id}>
          <span>{member.label}</span>
          <select
            disabled={busy}
            value={currentDepartmentId}
            onChange={(event) => onMove(member.id, event.target.value || null)}
          >
            <option value="">Unassigned</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
      );
    })}
    {!members.length ? (
      <p className="mono-meta">No specialists assigned to this department.</p>
    ) : null}
  </div>
);

const AgentInspector = ({
  detail,
  tab,
  setTab,
  activationPending,
  onActivation,
  departments,
  movePending,
  onMove,
}: {
  detail: Awaited<ReturnType<ApiClient["getAgentWorkforceDetail"]>>;
  tab: InspectorTab;
  setTab: (tab: InspectorTab) => void;
  activationPending: boolean;
  onActivation: (state: "ACTIVE" | "DORMANT") => void;
  departments: WorkforceGraphResponse["departments"];
  movePending: boolean;
  onMove: (departmentId: string | null) => void;
}) => {
  const metadata = detail.agent.workforce;
  const tabs: InspectorTab[] = [
    "overview",
    "activity",
    "memory",
    "skills",
    "capabilities",
    "tasks",
    "economy",
    "children",
  ];
  return (
    <>
      <ContextualAskAlexa
        kind="AGENT"
        id={detail.agent.id}
        label={detail.agent.displayName}
      />
      <div className="inspector-tabs">
        {tabs.map((value) => (
          <button
            className={tab === value ? "active" : ""}
            key={value}
            onClick={() => setTab(value)}
            type="button"
          >
            {value}
          </button>
        ))}
      </div>
      {tab === "overview" ? (
        <>
          <dl className="compact-definition-list">
            <div>
              <dt>Department</dt>
              <dd>{detail.department?.name ?? "Unassigned"}</dd>
            </div>
            <div>
              <dt>Manager</dt>
              <dd>{detail.manager?.displayName ?? "Alexa Governor"}</dd>
            </div>
            <div>
              <dt>State</dt>
              <dd>{statusLabel(detail.economy?.economyStatus ?? "DORMANT")}</dd>
            </div>
            <div>
              <dt>Model policy</dt>
              <dd>{metadata?.modelPolicyId ?? "Shared"}</dd>
            </div>
            <div>
              <dt>Placement</dt>
              <dd>{metadata?.executionPlacement ?? "Bounded"}</dd>
            </div>
            <div>
              <dt>Authority inherited</dt>
              <dd>No</dd>
            </div>
          </dl>
          <div className="inspector-actions">
            <button
              disabled={activationPending || detail.economy?.economyStatus === "ACTIVE"}
              onClick={() => onActivation("ACTIVE")}
              type="button"
            >
              Activate lazily
            </button>
            <button
              disabled={
                activationPending || detail.economy?.economyStatus === "DORMANT"
              }
              onClick={() => onActivation("DORMANT")}
              type="button"
            >
              Return dormant
            </button>
          </div>
          <label className="workforce-inspector-field">
            Department
            <select
              disabled={movePending}
              value={detail.department?.id ?? ""}
              onChange={(event) => onMove(event.target.value || null)}
            >
              <option value="">Unassigned</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <details>
            <summary>Advanced provenance</summary>
            <dl className="compact-definition-list">
              <div>
                <dt>Source</dt>
                <dd>{metadata?.source ?? "Alexa native"}</dd>
              </div>
              <div>
                <dt>Path</dt>
                <dd>{metadata?.sourcePath ?? "-"}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{metadata?.sourceVersion ?? detail.agent.version}</dd>
              </div>
              <div>
                <dt>License</dt>
                <dd>{metadata?.license ?? "Alexa-owned"}</dd>
              </div>
            </dl>
          </details>
        </>
      ) : null}
      {tab === "activity" ? (
        <InspectorList
          rows={detail.events.map((event) => ({
            title: event.type,
            meta: new Date(event.createdAt).toLocaleString(),
            body: event.summary,
          }))}
          empty="No workforce activity recorded."
        />
      ) : null}
      {tab === "memory" ? (
        <dl className="compact-definition-list">
          <div>
            <dt>Private</dt>
            <dd>{detail.memoryAccess.privateScope}</dd>
          </div>
          <div>
            <dt>Department</dt>
            <dd>{detail.memoryAccess.departmentScope}</dd>
          </div>
          <div>
            <dt>Organization</dt>
            <dd>{detail.memoryAccess.organizationScope}</dd>
          </div>
          <div>
            <dt>Owner private memory</dt>
            <dd>Excluded</dd>
          </div>
        </dl>
      ) : null}
      {tab === "skills" ? (
        <InspectorList
          rows={(metadata?.skills ?? []).map((skill) => ({
            title: skill,
            meta: "registered skill",
            body: "",
          }))}
          empty="No skills registered."
        />
      ) : null}
      {tab === "capabilities" ? (
        <>
          <InspectorList
            rows={detail.agent.capabilities.map((capability) => ({
              title: capability,
              meta: "finite capability",
              body: "",
            }))}
            empty="No finite capabilities registered."
          />
          {metadata?.missingCapabilities.length ? (
            <p className="notice">Missing: {metadata.missingCapabilities.join(", ")}</p>
          ) : null}
        </>
      ) : null}
      {tab === "tasks" ? (
        <InspectorList
          rows={detail.tasks.map((task) => ({
            title: task.title,
            meta: task.status,
            body: task.objective,
          }))}
          empty="No tasks assigned."
        />
      ) : null}
      {tab === "economy" ? (
        <dl className="compact-definition-list">
          <div>
            <dt>Available credits</dt>
            <dd>{detail.economy?.availableCredits ?? 0}</dd>
          </div>
          <div>
            <dt>Reserved</dt>
            <dd>{detail.economy?.reservedCredits ?? 0}</dd>
          </div>
          <div>
            <dt>Lifetime spent</dt>
            <dd>{detail.economy?.lifetimeSpent ?? 0}</dd>
          </div>
          <div>
            <dt>Reputation</dt>
            <dd>{(detail.economy?.reputation ?? 0).toFixed(1)}</dd>
          </div>
          <div>
            <dt>Credits grant authority</dt>
            <dd>No</dd>
          </div>
        </dl>
      ) : null}
      {tab === "children" ? (
        <InspectorList
          rows={detail.children.map((agent) => ({
            title: agent.displayName,
            meta: agent.status,
            body: agent.workforce?.specialization ?? agent.role,
          }))}
          empty="No direct reports."
        />
      ) : null}
    </>
  );
};

const InspectorList = ({
  rows,
  empty,
}: {
  rows: { title: string; meta: string; body: string }[];
  empty: string;
}) =>
  rows.length ? (
    <div className="inspector-list">
      {rows.slice(0, 50).map((row, index) => (
        <div key={`${row.title}:${index}`}>
          <strong>{row.title}</strong>
          <span>{row.meta}</span>
          {row.body ? <small>{row.body}</small> : null}
        </div>
      ))}
    </div>
  ) : (
    <div className="notice">{empty}</div>
  );
