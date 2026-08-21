import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppWindow,
  Clipboard,
  Gauge,
  Hand,
  Layers3,
  MonitorCog,
  MousePointerClick,
  Navigation,
  Play,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

import type { ApiClient } from "./api.js";

const stateClass = (state: string) =>
  state === "available" || state === "healthy" || state === "completed"
    ? "success-text"
    : state === "waiting_approval" || state === "experimental"
      ? "warning-text"
      : "danger-text";

const providerVoiceName = (providerType: string, providerName: string) => {
  const normalized = providerType.toLowerCase();
  if (normalized === "vscode") return "VS Code";
  if (normalized === "chrome") return "Chrome";
  if (normalized === "finder") return "Finder";
  if (normalized === "terminal") return "Terminal";
  if (normalized === "safari") return "Safari";
  return providerName.replace(/Provider$/u, "");
};

const providerCapabilityVoiceLabel = (
  capability: string,
  providerType: string,
  providerName: string,
) =>
  `${capability === "launch" ? "Launch" : capability} ${providerVoiceName(
    providerType,
    providerName,
  )}`;

export const DesktopPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const desktop = useQuery({
    queryKey: ["desktop-control-center"],
    queryFn: apiClient.getDesktopControlCenter,
    refetchInterval: 20_000,
  });
  const desktopSkills = useQuery({
    queryKey: ["desktop-skills-center"],
    queryFn: apiClient.getDesktopSkillsCenter,
    refetchInterval: 20_000,
  });
  const nativeProviders = useQuery({
    queryKey: ["native-provider-runtime"],
    queryFn: apiClient.getNativeProviderRuntime,
    refetchInterval: 2_000,
  });
  const data = desktop.data;
  const skillsData = desktopSkills.data;
  const providerData = nativeProviders.data;
  const firstCapability = data?.capabilities[0]?.id ?? "desktop.context.read";
  const firstDesktopObject = data?.desktopObjects[0]?.id ?? "desktop.object.dashboard";
  const [capabilityId, setCapabilityId] = useState(firstCapability);
  const [desktopObjectId, setDesktopObjectId] = useState(firstDesktopObject);
  const [semanticQuery, setSemanticQuery] = useState("command palette");
  const [navigationQuery, setNavigationQuery] = useState("command palette");
  const [interactionQuery, setInteractionQuery] = useState("command palette");
  const [formValue, setFormValue] = useState("Open settings");
  const [skillGoal, setSkillGoal] = useState("prepare development environment");
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["desktop-control-center"] });
    await queryClient.invalidateQueries({ queryKey: ["desktop-skills-center"] });
    await queryClient.invalidateQueries({ queryKey: ["native-provider-runtime"] });
  };
  const refreshContext = useMutation({
    mutationFn: apiClient.refreshDesktopContext,
    onSuccess: refresh,
  });
  const requestCapability = useMutation({
    mutationFn: apiClient.requestDesktopCapability,
    onSuccess: refresh,
  });
  const requestSpatialDesktopInteraction = useMutation({
    mutationFn: apiClient.requestSpatialDesktopInteraction,
    onSuccess: refresh,
  });
  const searchSemanticDesktop = useMutation({
    mutationFn: apiClient.searchSemanticDesktop,
  });
  const navigateSemanticDesktop = useMutation({
    mutationFn: apiClient.navigateSemanticDesktop,
    onSuccess: refresh,
  });
  const requestSemanticInteraction = useMutation({
    mutationFn: apiClient.requestSemanticInteraction,
    onSuccess: refresh,
  });
  const fillSemanticForm = useMutation({
    mutationFn: apiClient.fillSemanticForm,
    onSuccess: refresh,
  });
  const executeDesktopSkill = useMutation({
    mutationFn: apiClient.executeDesktopSkill,
    onSuccess: refresh,
  });
  const pauseDesktopWorkflow = useMutation({
    mutationFn: apiClient.pauseDesktopWorkflow,
    onSuccess: refresh,
  });
  const resumeDesktopWorkflow = useMutation({
    mutationFn: apiClient.resumeDesktopWorkflow,
    onSuccess: refresh,
  });
  const cancelDesktopWorkflow = useMutation({
    mutationFn: apiClient.cancelDesktopWorkflow,
    onSuccess: refresh,
  });
  const recoverDesktopWorkflow = useMutation({
    mutationFn: apiClient.recoverDesktopWorkflow,
    onSuccess: refresh,
  });
  const validateNativeProviders = useMutation({
    mutationFn: apiClient.validateNativeProviders,
    onSuccess: refresh,
  });
  const dispatchNativeCapability = useMutation({
    mutationFn: apiClient.dispatchNativeCapability,
    onSuccess: refresh,
  });
  const capabilities = data?.capabilities ?? [];
  const desktopObjects = data?.desktopObjects ?? [];
  const available = capabilities.filter(
    (capability) => capability.status === "available",
  );
  const providerUnavailable =
    data?.providers.filter((provider) => provider.status === "unavailable").length ?? 0;
  const semanticObjects = data?.semanticObjects ?? [];
  const semanticWindows = data?.desktopWindows ?? [];
  const semanticContext = data?.semanticDesktopContexts[0];
  const navigationGraphs = data?.navigationGraphs ?? [];
  const focusHistory = data?.focusHistory ?? [];
  const navigationTargets = data?.navigationTargets ?? [];
  const semanticNavigationHistory = data?.semanticNavigationHistory ?? [];
  const semanticInteractions = data?.semanticInteractions ?? [];
  const interactionHistory = data?.interactionHistory ?? [];
  const interactionVerification = data?.interactionVerification ?? [];
  const interactionFailures = data?.interactionFailures ?? [];
  const fieldMappings = data?.fieldMappings ?? [];
  const interactionMetrics = data?.interactionMetrics ?? [];
  const semanticActions = data?.semanticActions ?? [];
  const desktopSkillLibrary = skillsData?.desktopSkills ?? [];
  const skillExecutions = skillsData?.skillExecutions ?? [];
  const executionSteps = skillsData?.executionSteps ?? [];
  const executionGraphs = skillsData?.executionGraphs ?? [];
  const approvalCheckpoints = skillsData?.approvalCheckpoints ?? [];
  const workflowFailures = skillsData?.workflowFailures ?? [];
  const workflowRecovery = skillsData?.workflowRecovery ?? [];
  const latestExecution = skillExecutions[0];
  const providerRegistry = providerData?.nativeProviders ?? [];
  const providerCapabilities = providerData?.providerCapabilities ?? [];
  const providerHealth = providerData?.providerHealth ?? [];
  const providerValidation = providerData?.providerValidation ?? [];
  const providerExecutions = providerData?.providerExecution ?? [];
  const providerDiagnostics = providerData?.providerDiagnostics ?? [];
  const terminalCommands = providerData?.approvedTerminalCommands ?? [];
  const nativeExecutionIds = [
    ...new Set([
      ...providerExecutions
        .map((execution) => execution.executionRequestId ?? null)
        .filter(Boolean),
      ...providerDiagnostics
        .map((diagnostic) => diagnostic.executionRequestId ?? null)
        .filter(Boolean),
    ] as string[]),
  ];
  const latestNativeExecutionId = nativeExecutionIds[0] ?? null;
  const latestNativeExecution = providerExecutions.find(
    (execution) => execution.executionRequestId === latestNativeExecutionId,
  );
  const nativeTimeline = providerDiagnostics
    .filter(
      (diagnostic) =>
        diagnostic.stage &&
        (!latestNativeExecutionId ||
          diagnostic.executionRequestId === latestNativeExecutionId),
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Phase 13</p>
      <h1>Desktop Control Center</h1>
      <p>
        Governed desktop capability registry and provider framework. Capabilities are
        explicit, auditable, provider-scoped, and policy-shaped. Unreviewed OS providers
        remain unavailable; there is no shell, generic executor, unrestricted
        AppleScript, or unrestricted Accessibility bridge.
      </p>

      <section className="status-grid">
        <article className="status-card">
          <span>
            <MonitorCog size={14} /> Capabilities
          </span>
          <strong>{capabilities.length}</strong>
          <small>{available.length} metadata-safe available</small>
        </article>
        <article className="status-card">
          <span>
            <Gauge size={14} /> Providers
          </span>
          <strong>{data?.providers.length ?? 0}</strong>
          <small>{providerUnavailable} unavailable by design</small>
        </article>
        <article className="status-card">
          <span>
            <ShieldCheck size={14} /> Generic executor
          </span>
          <strong>{data?.genericExecutorAvailable ? "Yes" : "No"}</strong>
          <small>Must remain false</small>
        </article>
        <article className="status-card">
          <span>
            <ShieldAlert size={14} /> Accessibility bridge
          </span>
          <strong>
            {data?.unrestrictedAccessibilityAvailable ? "Unrestricted" : "Blocked"}
          </strong>
          <small>No raw OS control surface</small>
        </article>
      </section>

      <section className="panel-list">
        <h2>
          <ShieldCheck size={18} /> Application Trust & Native Provider Runtime
        </h2>
        <p>
          Phase 17G bridges semantic desktop skills to macOS through reviewed native
          providers only. Providers expose finite capabilities such as launch, focus,
          focus explorer, open URL, and run approved command. Generic AppleScript,
          shell, keyboard replay, mouse replay, OCR, screenshots, coordinate clicking,
          and unrestricted Accessibility stay unavailable.
        </p>
        <section className="status-grid">
          <article className="status-card">
            <span>Runtime</span>
            <strong>
              {providerData?.reviewedNativeProviderRuntimeAvailable
                ? "Available"
                : "Loading"}
            </strong>
            <small>{providerRegistry.length} registered providers</small>
          </article>
          <article className="status-card">
            <span>Dispatcher</span>
            <strong>
              {providerData?.nativeCapabilityDispatcherAvailable ? "Enabled" : "Off"}
            </strong>
            <small>Planner and skills must route here</small>
          </article>
          <article className="status-card">
            <span>Sandbox</span>
            <strong>
              {providerData?.providerSandboxEnforced ? "Enforced" : "Off"}
            </strong>
            <small>finite semantic capabilities only</small>
          </article>
          <article className="status-card">
            <span>Raw automation</span>
            <strong>
              {providerData?.arbitraryShellAvailable ||
              providerData?.arbitraryAppleScriptAvailable ||
              providerData?.coordinateClickingAvailable
                ? "Available"
                : "Blocked"}
            </strong>
            <small>must remain blocked</small>
          </article>
        </section>
        <div className="device-actions">
          <button
            disabled={validateNativeProviders.isPending}
            onClick={() => validateNativeProviders.mutate()}
            type="button"
          >
            <RefreshCcw size={13} /> Validate providers
          </button>
        </div>
        {dispatchNativeCapability.error instanceof Error ? (
          <p className="form-error">{dispatchNativeCapability.error.message}</p>
        ) : null}
        <section className="status-grid">
          {providerRegistry.slice(0, 6).map((provider) => {
            const health = providerHealth.find(
              (item) => item.providerId === provider.id,
            );
            const validation = providerValidation.find(
              (item) => item.providerId === provider.id,
            );
            const providerCapabilityButtons = providerCapabilities
              .filter((item) => item.providerId === provider.id)
              .sort((left, right) => {
                const order = ["launch", "focus", "open_url"];
                return (
                  (order.indexOf(left.capability) === -1
                    ? order.length
                    : order.indexOf(left.capability)) -
                  (order.indexOf(right.capability) === -1
                    ? order.length
                    : order.indexOf(right.capability))
                );
              });
            return (
              <article className="status-card" key={provider.id}>
                <span>{provider.providerType}</span>
                <strong>{provider.name}</strong>
                <small>
                  {provider.status} · health {health?.healthScore ?? 0} · validation{" "}
                  {validation?.status ?? "not run"}
                </small>
                {validation?.status === "failed" ? (
                  <small className="danger-text">
                    {validation.diagnostics.join(" ")}
                  </small>
                ) : null}
                {providerCapabilityButtons.map((capability) => {
                  const label = providerCapabilityVoiceLabel(
                    capability.capability,
                    provider.providerType,
                    provider.name,
                  );
                  return (
                    <button
                      aria-label={label}
                      data-spatial-id={`native-provider:${provider.id}:${capability.capability}`}
                      data-spatial-label={label}
                      data-spatial-priority="20"
                      data-spatial-type="button"
                      disabled={dispatchNativeCapability.isPending}
                      key={capability.id}
                      onClick={() =>
                        dispatchNativeCapability.mutate({
                          providerId: provider.id,
                          capability: capability.capability,
                          applicationId: provider.applicationId,
                          arguments: {},
                        })
                      }
                      type="button"
                    >
                      {label}
                    </button>
                  );
                })}
              </article>
            );
          })}
        </section>
        <article className="panel">
          <p className="eyebrow">Native Execution Inspector</p>
          <h3>
            {latestNativeExecutionId
              ? `Execution ${latestNativeExecutionId}`
              : "No native execution selected"}
          </h3>
          <p>
            Provider: {latestNativeExecution?.providerId ?? "none"} · capability:{" "}
            {latestNativeExecution?.capability ?? "none"} · verification:{" "}
            {latestNativeExecution?.status ?? "waiting"}
          </p>
          {latestNativeExecution ? (
            <div className="notice">
              <strong>{latestNativeExecution.errorCode ?? "Execution detail"}</strong>
              <br />
              {latestNativeExecution.resultSummary}
              <br />
              {latestNativeExecution.verificationSummary}
            </div>
          ) : null}
          <div className="command-list">
            {nativeTimeline.length === 0 ? (
              <div className="command-item">
                <strong>Waiting for native execution events</strong>
                <span>
                  Press a provider launch button to trace Dashboard → Backend Dispatch →
                  Queue → Transport → Mac Agent → Provider → Verification → Signed
                  Result.
                </span>
              </div>
            ) : null}
            {nativeTimeline.map((event) => (
              <div className="command-item" key={event.id}>
                <strong>
                  {new Date(event.createdAt).toLocaleTimeString()} ·{" "}
                  {event.stage?.replaceAll("_", " ")}
                </strong>
                <span>
                  request {event.executionRequestId ?? "pending"} · provider{" "}
                  {event.providerId} · capability {event.capability ?? "unknown"} ·{" "}
                  verification {event.verificationResult ?? "pending"} · audit{" "}
                  {event.auditEventType ?? "none"}
                </span>
                <span>{event.message}</span>
              </div>
            ))}
          </div>
          <small>
            Recent native records: {providerExecutions.length} · diagnostics:{" "}
            {providerDiagnostics.length}
          </small>
        </article>
        <article className="panel">
          <p className="eyebrow">Capability Explorer</p>
          <h3>{providerCapabilities.length} finite capabilities</h3>
          <div className="command-list">
            {providerCapabilities.slice(0, 10).map((capability) => (
              <div className="command-item" key={capability.id}>
                <strong>
                  {capability.providerId}.{capability.capability}
                </strong>
                <span>
                  inputs {capability.inputs.join(", ") || "none"} · permissions{" "}
                  {capability.permissions.join(", ")} · {capability.verification}
                </span>
              </div>
            ))}
          </div>
          <small>
            Approved terminal commands: {terminalCommands.length} · executions:{" "}
            {providerExecutions.length} · diagnostics: {providerDiagnostics.length}
          </small>
        </article>
      </section>

      <section className="panel-list">
        <h2>
          <Play size={18} /> Desktop Skills Center
        </h2>
        <p>
          Phase 17F orchestrates complete desktop workflows as deterministic skill
          graphs. Goals resolve to approved reusable skills, preconditions validate
          trusted application adapters and permissions, high-risk work pauses for
          approval, and every step records semantic verification. Pixels, OCR, computer
          vision, coordinate replay, and hidden capabilities remain disabled.
        </p>
        <section className="status-grid">
          <article className="status-card">
            <span>Autonomous skills</span>
            <strong>
              {skillsData?.autonomousDesktopSkillsAvailable ? "Enabled" : "Loading"}
            </strong>
            <small>{desktopSkillLibrary.length} planner-visible skills</small>
          </article>
          <article className="status-card">
            <span>Running workflows</span>
            <strong>
              {
                skillExecutions.filter((execution) =>
                  ["running", "paused", "awaiting_approval"].includes(execution.status),
                ).length
              }
            </strong>
            <small>{skillExecutions.length} total executions</small>
          </article>
          <article className="status-card">
            <span>Execution graph</span>
            <strong>{executionGraphs[0]?.nodes.length ?? 0}</strong>
            <small>{executionGraphs[0]?.edges.length ?? 0} dependencies</small>
          </article>
          <article className="status-card">
            <span>Pixel automation</span>
            <strong>{skillsData?.pixelAutomationAvailable ? "On" : "Off"}</strong>
            <small>coordinates/OCR/vision also off</small>
          </article>
        </section>
        <form
          className="policy-form"
          onSubmit={(event) => {
            event.preventDefault();
            executeDesktopSkill.mutate({
              goal: skillGoal,
              origin: "dashboard",
              variables: {},
              preview: false,
            });
          }}
        >
          <label>
            Goal
            <input
              value={skillGoal}
              onChange={(event) => setSkillGoal(event.target.value)}
              placeholder="Prepare my development environment"
            />
          </label>
          <button disabled={executeDesktopSkill.isPending} type="submit">
            <Play size={13} /> Execute skill graph
          </button>
        </form>
        {executeDesktopSkill.error instanceof Error ? (
          <p className="form-error">{executeDesktopSkill.error.message}</p>
        ) : null}
        <section className="status-grid">
          {desktopSkillLibrary.slice(0, 6).map((skill) => (
            <article className="status-card" key={skill.id}>
              <span>{skill.health}</span>
              <strong>{skill.name}</strong>
              <small>
                {skill.capabilities.join(", ")} · confidence{" "}
                {Math.round(skill.confidence * 100)}%
              </small>
            </article>
          ))}
        </section>
        {latestExecution ? (
          <article className="panel">
            <p className="eyebrow">Latest execution · {latestExecution.origin}</p>
            <h3>{latestExecution.goal}</h3>
            <p>
              Status: {latestExecution.status} · current skill:{" "}
              {latestExecution.currentSkillId ?? "none"} · current step:{" "}
              {latestExecution.currentStepId ?? "none"}
            </p>
            <div className="device-actions">
              <button
                disabled={pauseDesktopWorkflow.isPending}
                onClick={() => pauseDesktopWorkflow.mutate(latestExecution.id)}
                type="button"
              >
                Pause
              </button>
              <button
                disabled={resumeDesktopWorkflow.isPending}
                onClick={() => resumeDesktopWorkflow.mutate(latestExecution.id)}
                type="button"
              >
                Resume
              </button>
              <button
                disabled={recoverDesktopWorkflow.isPending}
                onClick={() => recoverDesktopWorkflow.mutate(latestExecution.id)}
                type="button"
              >
                Recovery
              </button>
              <button
                className="danger-button"
                disabled={cancelDesktopWorkflow.isPending}
                onClick={() => cancelDesktopWorkflow.mutate(latestExecution.id)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </article>
        ) : null}
        <div className="command-list">
          {executionSteps.slice(0, 8).map((step) => (
            <div className="command-item" key={step.id}>
              <strong>
                #{step.sequence} {step.title}
              </strong>
              <span>
                {step.status} · {step.nodeKind} · {step.verification}
              </span>
            </div>
          ))}
        </div>
        <small>
          Approval checkpoints: {approvalCheckpoints.length} · failures:{" "}
          {workflowFailures.length} · recovery suggestions: {workflowRecovery.length}
        </small>
      </section>

      <section className="panel-list">
        <h2>
          <Search size={18} /> Semantic Desktop Inspector
        </h2>
        <p>
          Phase 17A models trusted application structure as deterministic semantic
          objects. Native Accessibility snapshots are preferred when a reviewed provider
          is installed; until then, this page shows safe registered metadata and browser
          semantic objects only. No AI, OCR, pixels, or OS control are used.
        </p>
        <section className="status-grid">
          <article className="status-card">
            <span>Semantic model</span>
            <strong>{data?.semanticDesktopModelAvailable ? "Enabled" : "Off"}</strong>
            <small>read-only deterministic registry</small>
          </article>
          <article className="status-card">
            <span>Native Accessibility</span>
            <strong>
              {data?.nativeAccessibilityProviderAvailable ? "Available" : "Unavailable"}
            </strong>
            <small>requires reviewed provider</small>
          </article>
          <article className="status-card">
            <span>Semantic objects</span>
            <strong>{semanticObjects.length}</strong>
            <small>{semanticWindows.length} windows tracked</small>
          </article>
          <article className="status-card">
            <span>OCR / vision required</span>
            <strong>
              {data?.ocrRequiredForAccessibilityObjects ||
              data?.computerVisionRequiredForSemanticModel
                ? "Yes"
                : "No"}
            </strong>
            <small>accessibility metadata first</small>
          </article>
        </section>
        <form
          className="policy-form"
          onSubmit={(event) => {
            event.preventDefault();
            searchSemanticDesktop.mutate({
              query: semanticQuery,
              applicationId: null,
              windowId: null,
              roles: [],
              visibleOnly: true,
              limit: 8,
            });
          }}
        >
          <label>
            Deterministic semantic search
            <input
              value={semanticQuery}
              onChange={(event) => setSemanticQuery(event.target.value)}
              placeholder="Find button Save, field Project Name, tab Extensions…"
            />
          </label>
          <button disabled={searchSemanticDesktop.isPending} type="submit">
            <Search size={13} /> Search registry
          </button>
        </form>
        {searchSemanticDesktop.data ? (
          <article className="panel">
            <p className="eyebrow">
              deterministic · AI{" "}
              {searchSemanticDesktop.data.aiUsed ? "used" : "not used"}
            </p>
            <h3>
              {searchSemanticDesktop.data.results.length} result
              {searchSemanticDesktop.data.results.length === 1 ? "" : "s"}
            </h3>
            <div className="command-list">
              {searchSemanticDesktop.data.results.map((result) => (
                <div className="command-item" key={result.objectId}>
                  <strong>{result.displayName}</strong>
                  <span>
                    {result.role} · {Math.round(result.confidence * 100)}% ·{" "}
                    {result.reason}
                  </span>
                </div>
              ))}
            </div>
          </article>
        ) : null}
        <section className="status-grid">
          {semanticObjects.slice(0, 8).map((object) => (
            <article className="status-card" key={object.id}>
              <span>{object.role}</span>
              <strong>{object.displayName}</strong>
              <small>
                {object.source} · children {object.childIds.length} · confidence{" "}
                {Math.round(object.confidence * 100)}%
              </small>
            </article>
          ))}
        </section>
        <article className="panel">
          <p className="eyebrow">Current semantic context</p>
          <h3>{semanticContext?.currentApplicationId ?? "No application focus"}</h3>
          <p>
            Focused object: {semanticContext?.focusedObjectId ?? "none"} · Current
            window: {semanticContext?.currentWindowId ?? "none"}
          </p>
          <small>
            Events: {data?.semanticEvents.length ?? 0} · Relationships:{" "}
            {data?.semanticRelationships.length ?? 0} · Accessibility snapshots:{" "}
            {data?.accessibilitySnapshots.length ?? 0}
          </small>
        </article>
      </section>

      <section className="panel-list">
        <h2>
          <Navigation size={18} /> Desktop Navigation Center
        </h2>
        <p>
          Phase 17B can deterministically move semantic focus and preview targets using
          the registered desktop hierarchy. This is navigation only: it never clicks
          controls, types text, activates buttons, or changes application state.
        </p>
        <section className="status-grid">
          <article className="status-card">
            <span>Navigation engine</span>
            <strong>
              {data?.semanticDesktopNavigationAvailable ? "Enabled" : "Off"}
            </strong>
            <small>deterministic · read-only</small>
          </article>
          <article className="status-card">
            <span>Navigation graph</span>
            <strong>{navigationGraphs[0]?.nodeCount ?? 0}</strong>
            <small>{navigationGraphs[0]?.edgeCount ?? 0} semantic edges</small>
          </article>
          <article className="status-card">
            <span>Focus history</span>
            <strong>{focusHistory.length}</strong>
            <small>{focusHistory[0]?.objectId ?? "No focused object"}</small>
          </article>
          <article className="status-card">
            <span>Navigation targets</span>
            <strong>{navigationTargets.length}</strong>
            <small>{data?.highlightProfiles[0]?.name ?? "No highlight profile"}</small>
          </article>
        </section>
        <form
          className="policy-form"
          onSubmit={(event) => {
            event.preventDefault();
            navigateSemanticDesktop.mutate({
              action: "preview_object",
              objectId: null,
              query: navigationQuery,
              applicationId: null,
              windowId: null,
            });
          }}
        >
          <label>
            Navigate or preview semantic target
            <input
              value={navigationQuery}
              onChange={(event) => setNavigationQuery(event.target.value)}
              placeholder="Explorer, Terminal, Save, Current Page Content…"
            />
          </label>
          <button disabled={navigateSemanticDesktop.isPending} type="submit">
            <Navigation size={13} /> Preview target
          </button>
          <button
            disabled={navigateSemanticDesktop.isPending}
            onClick={() =>
              navigateSemanticDesktop.mutate({
                action: "focus_object",
                objectId: null,
                query: navigationQuery,
                applicationId: null,
                windowId: null,
              })
            }
            type="button"
          >
            <Play size={13} /> Focus target
          </button>
        </form>
        <div className="button-row">
          {(["parent", "first_child", "next_sibling", "previous_sibling"] as const).map(
            (action) => (
              <button
                disabled={navigateSemanticDesktop.isPending}
                key={action}
                onClick={() =>
                  navigateSemanticDesktop.mutate({
                    action,
                    objectId: null,
                    query: null,
                    applicationId: null,
                    windowId: null,
                  })
                }
                type="button"
              >
                {action.replaceAll("_", " ")}
              </button>
            ),
          )}
        </div>
        {navigateSemanticDesktop.data ? (
          <article className="panel">
            <p className="eyebrow">
              {navigateSemanticDesktop.data.status} · read-only{" "}
              {navigateSemanticDesktop.data.readOnly ? "yes" : "no"}
            </p>
            <h3>
              {navigateSemanticDesktop.data.targetObject?.displayName ??
                "No deterministic target"}
            </h3>
            <p>{navigateSemanticDesktop.data.message}</p>
            <small>
              clicked: {String(navigateSemanticDesktop.data.clickedButton)} · typed:{" "}
              {String(navigateSemanticDesktop.data.typedText)} · activated:{" "}
              {String(navigateSemanticDesktop.data.activatedControl)}
            </small>
          </article>
        ) : null}
        <section className="status-grid">
          {semanticNavigationHistory.slice(0, 6).map((entry) => (
            <article className="status-card" key={entry.id}>
              <span>{entry.action}</span>
              <strong
                className={entry.status === "failed" ? "danger-text" : "success-text"}
              >
                {entry.status}
              </strong>
              <small>
                {entry.toObjectId ?? "no target"} · activated{" "}
                {String(entry.activatedControl)}
              </small>
            </article>
          ))}
        </section>
      </section>

      <section className="panel-list">
        <h2>
          <MousePointerClick size={18} /> Interaction Inspector
        </h2>
        <p>
          Phase 17C adds deterministic semantic interaction on top of the existing
          desktop model and navigation graph. Targets resolve through labels, aliases,
          roles, hierarchy, and registered field mappings; requests are represented as
          Desktop Capability Layer actions and verified after every step. No pixels,
          OCR, vision, coordinates, raw mouse, or raw keyboard input are accepted.
        </p>
        <section className="status-grid">
          <article className="status-card">
            <span>Interaction engine</span>
            <strong>
              {data?.semanticInteractionEngineAvailable ? "Enabled" : "Off"}
            </strong>
            <small>deterministic · capability-routed</small>
          </article>
          <article className="status-card">
            <span>Pixel automation</span>
            <strong>{data?.pixelAutomationAvailable ? "Available" : "Blocked"}</strong>
            <small>must remain blocked</small>
          </article>
          <article className="status-card">
            <span>Field mappings</span>
            <strong>{fieldMappings.length}</strong>
            <small>semantic labels and aliases</small>
          </article>
          <article className="status-card">
            <span>Verifications</span>
            <strong>{interactionVerification.length}</strong>
            <small>{interactionVerification[0]?.status ?? "none yet"}</small>
          </article>
        </section>
        <div className="button-row">
          <input
            value={interactionQuery}
            onChange={(event) => setInteractionQuery(event.target.value)}
            placeholder="Save, Production, Remember Me…"
          />
          <button
            disabled={requestSemanticInteraction.isPending}
            onClick={() =>
              requestSemanticInteraction.mutate({
                origin: "dashboard",
                action: "highlight",
                target: {
                  objectId: null,
                  query: interactionQuery,
                  fieldKey: null,
                  applicationId: null,
                  windowId: null,
                  contextObjectId: null,
                },
                preview: true,
                steps: [],
              })
            }
            type="button"
          >
            <Play size={13} /> Preview target
          </button>
          <button
            disabled={requestSemanticInteraction.isPending}
            onClick={() =>
              requestSemanticInteraction.mutate({
                origin: "dashboard",
                action: "click",
                target: {
                  objectId: null,
                  query: interactionQuery,
                  fieldKey: null,
                  applicationId: null,
                  windowId: null,
                  contextObjectId: null,
                },
                preview: false,
                steps: [],
              })
            }
            type="button"
          >
            <Play size={13} /> Request click
          </button>
        </div>
        <div className="button-row">
          <input
            value={formValue}
            onChange={(event) => setFormValue(event.target.value)}
            placeholder="Command palette value"
          />
          <button
            disabled={fillSemanticForm.isPending}
            onClick={() =>
              fillSemanticForm.mutate({
                origin: "dashboard",
                formObjectId: null,
                fields: [
                  {
                    field: "command palette",
                    value: formValue,
                    mode: "replace",
                  },
                ],
                submit: false,
                preview: true,
              })
            }
            type="button"
          >
            <Play size={13} /> Preview form fill
          </button>
        </div>
        {requestSemanticInteraction.data ? (
          <article className="panel">
            <p className="eyebrow">
              {requestSemanticInteraction.data.interaction.status} · AI{" "}
              {requestSemanticInteraction.data.aiUsed ? "used" : "not used"}
            </p>
            <h3>
              {requestSemanticInteraction.data.target?.displayName ??
                "No deterministic target"}
            </h3>
            <p>{requestSemanticInteraction.data.message}</p>
            {requestSemanticInteraction.data.clarificationPrompt ? (
              <small>{requestSemanticInteraction.data.clarificationPrompt}</small>
            ) : null}
          </article>
        ) : null}
        {fillSemanticForm.data ? (
          <article className="panel">
            <p className="eyebrow">{fillSemanticForm.data.interaction.status}</p>
            <h3>Form interaction</h3>
            <p>{fillSemanticForm.data.message}</p>
          </article>
        ) : null}
        <section className="status-grid">
          {semanticInteractions.slice(0, 6).map((interaction) => (
            <article className="status-card" key={interaction.id}>
              <span>
                {interaction.origin} · {interaction.requestedAction}
              </span>
              <strong
                className={
                  interaction.status === "completed" ||
                  interaction.status === "previewed"
                    ? "success-text"
                    : interaction.status === "waiting_approval"
                      ? "warning-text"
                      : "danger-text"
                }
              >
                {interaction.status}
              </strong>
              <small>
                {interaction.targetDisplayName ?? "no target"} · coordinates{" "}
                {String(interaction.coordinateAutomationUsed)}
              </small>
            </article>
          ))}
        </section>
        <section className="status-grid">
          <article className="status-card">
            <span>History</span>
            <strong>{interactionHistory.length}</strong>
            <small>{interactionHistory[0]?.summary ?? "No interactions yet"}</small>
          </article>
          <article className="status-card">
            <span>Actions</span>
            <strong>{semanticActions.length}</strong>
            <small>{semanticActions[0]?.capabilityId ?? "No semantic action"}</small>
          </article>
          <article className="status-card">
            <span>Failures</span>
            <strong>{interactionFailures.length}</strong>
            <small>{interactionFailures[0]?.failureCode ?? "No failures"}</small>
          </article>
          <article className="status-card">
            <span>Metrics</span>
            <strong>{interactionMetrics.length}</strong>
            <small>{interactionMetrics[0]?.metricName ?? "No metrics"}</small>
          </article>
        </section>
      </section>

      <section className="panel-list">
        <h2>
          <Layers3 size={18} /> Capability execution layer
        </h2>
        <div className="button-row">
          <select
            value={capabilityId}
            onChange={(event) => setCapabilityId(event.target.value)}
          >
            {capabilities.map((capability) => (
              <option key={capability.id} value={capability.id}>
                {capability.name} · {capability.status}
              </option>
            ))}
          </select>
          <button
            disabled={requestCapability.isPending}
            onClick={() => requestCapability.mutate({ capabilityId, input: {} })}
            type="button"
          >
            <Play size={13} /> Request capability
          </button>
          <button
            disabled={refreshContext.isPending}
            onClick={() => refreshContext.mutate()}
            type="button"
          >
            <RefreshCcw size={13} /> Refresh context
          </button>
        </div>
        <section className="status-grid">
          {capabilities.slice(0, 8).map((capability) => (
            <article className="status-card" key={capability.id}>
              <span>{capability.category}</span>
              <strong className={stateClass(capability.status)}>
                {capability.status}
              </strong>
              <small>
                {capability.id} · risk {capability.riskLevel}
              </small>
            </article>
          ))}
        </section>
      </section>

      <section className="panel-list">
        <h2>
          <Hand size={18} /> Spatial Desktop Layer
        </h2>
        <p>
          Gesture targets are registered as desktop objects with explicit capability
          bindings. Selecting one records an intent-ready desktop interaction through
          the governed Desktop Capability Layer; it does not move the OS cursor or call
          macOS directly.
        </p>
        <div className="button-row">
          <select
            value={desktopObjectId}
            onChange={(event) => setDesktopObjectId(event.target.value)}
          >
            {desktopObjects.map((object) => (
              <option key={object.id} value={object.id}>
                {object.displayName} · {object.status}
              </option>
            ))}
          </select>
          <button
            disabled={requestSpatialDesktopInteraction.isPending}
            onClick={() =>
              requestSpatialDesktopInteraction.mutate({
                objectId: desktopObjectId,
                interactionType: "inspect",
                gesture: "point",
                intentPreview: "Inspect the selected desktop object.",
                input: {},
              })
            }
            type="button"
          >
            <Play size={13} /> Inspect object
          </button>
        </div>
        <section className="status-grid">
          <article className="status-card">
            <span>Desktop objects</span>
            <strong>{desktopObjects.length}</strong>
            <small>Registered spatial targets only</small>
          </article>
          <article className="status-card">
            <span>Spatial profiles</span>
            <strong>{data?.desktopProfiles.length ?? 0}</strong>
            <small>
              {data?.desktopProfiles.find((profile) => profile.active)?.name ??
                "No active profile"}
            </small>
          </article>
          <article className="status-card">
            <span>Overlay</span>
            <strong>
              {data?.overlaySettings[0]?.enabled ? "Enabled" : "Disabled"}
            </strong>
            <small>Configurable visual targeting layer</small>
          </article>
          <article className="status-card">
            <span>Direct OS control</span>
            <strong>{data?.directOsPointerControlAvailable ? "Yes" : "No"}</strong>
            <small>Must remain false</small>
          </article>
        </section>
        <section className="status-grid">
          {desktopObjects.slice(0, 6).map((object) => (
            <article className="status-card" key={object.id}>
              <span>{object.objectType}</span>
              <strong className={stateClass(object.status)}>
                {object.displayName}
              </strong>
              <small>
                {object.sourceCapabilityId ?? "metadata"} · risk {object.riskLevel}
              </small>
            </article>
          ))}
        </section>
      </section>

      <section className="panel-list">
        <h2>
          <Gauge size={18} /> Providers and health
        </h2>
        {data?.providers.map((provider) => (
          <article className="panel" key={provider.id}>
            <p className="eyebrow">
              {provider.providerType} ·{" "}
              <span className={stateClass(provider.status)}>{provider.status}</span>
            </p>
            <h3>{provider.name}</h3>
            <p>{provider.health}</p>
            <small>{provider.supportedCategories.join(" · ")}</small>
          </article>
        ))}
      </section>

      <section className="panel-list">
        <h2>
          <AppWindow size={18} /> Desktop context and applications
        </h2>
        {data?.contexts.slice(0, 3).map((context) => (
          <article className="panel" key={context.id}>
            <p className="eyebrow">permission {context.permissionState}</p>
            <h3>{context.desktopLayout}</h3>
            <p>{context.clipboardSummary}</p>
            <small>Displays: {context.displays.join(" · ") || "none"}</small>
          </article>
        ))}
        <section className="status-grid">
          {data?.applications.slice(0, 4).map((application) => (
            <article className="status-card" key={application.id}>
              <span>{application.bundleId}</span>
              <strong>{application.displayName}</strong>
              <small>Executable paths accepted: no</small>
            </article>
          ))}
        </section>
      </section>

      <section className="panel-list">
        <h2>
          <Clipboard size={18} /> Actions, clipboard, and layouts
        </h2>
        <section className="status-grid">
          <article className="status-card">
            <span>Actions</span>
            <strong>{data?.actions.length ?? 0}</strong>
            <small>{data?.actions[0]?.status ?? "No actions yet"}</small>
          </article>
          <article className="status-card">
            <span>Clipboard</span>
            <strong>{data?.clipboardHistory.length ?? 0}</strong>
            <small>
              {data?.clipboardHistory[0]?.summary ?? "No clipboard history"}
            </small>
          </article>
          <article className="status-card">
            <span>Layouts</span>
            <strong>{data?.windowLayouts.length ?? 0}</strong>
            <small>{data?.windowLayouts[0]?.name ?? "No layouts"}</small>
          </article>
          <article className="status-card">
            <span>Metrics</span>
            <strong>{data?.metrics.length ?? 0}</strong>
            <small>{data?.metrics[0]?.metricName ?? "No metrics"}</small>
          </article>
        </section>
      </section>

      <section className="panel-list">
        <h2>
          <Layers3 size={18} /> Spatial dock, panels, and navigation
        </h2>
        <section className="status-grid">
          <article className="status-card">
            <span>Dock items</span>
            <strong>{data?.dockItems.length ?? 0}</strong>
            <small>{data?.dockItems[0]?.label ?? "No dock items"}</small>
          </article>
          <article className="status-card">
            <span>Floating panels</span>
            <strong>{data?.desktopPanels.length ?? 0}</strong>
            <small>{data?.desktopPanels[0]?.title ?? "No panels"}</small>
          </article>
          <article className="status-card">
            <span>Navigation events</span>
            <strong>{data?.desktopNavigationHistory.length ?? 0}</strong>
            <small>
              {data?.desktopNavigationHistory[0]?.gesture ?? "No spatial navigation"}
            </small>
          </article>
          <article className="status-card">
            <span>Desktop metrics</span>
            <strong>{data?.desktopMetrics.length ?? 0}</strong>
            <small>{data?.desktopMetrics[0]?.metricName ?? "No desktop metrics"}</small>
          </article>
        </section>
      </section>
    </section>
  );
};
