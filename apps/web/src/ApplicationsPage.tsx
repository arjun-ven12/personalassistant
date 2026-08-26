import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";

import type { AdapterPermission, ApplicationPermissions } from "@alexa-control/shared";

import { ApiClientError, type ApiClient } from "./api.js";
import { ContextualAskAlexa } from "./BusinessOSComponents.js";

const emptyPermissions: ApplicationPermissions = {
  open: false,
  focus: false,
  inspectWindow: false,
  captureWindow: false,
  automate: false,
  sendKeyboardShortcuts: false,
  readSemanticStructure: false,
  navigate: false,
  interact: false,
  editText: false,
  openFiles: false,
  createDocuments: false,
  deleteContent: false,
  executeCommands: false,
  clipboardAccess: false,
};

const adapterPermissions: AdapterPermission[] = [
  "read_semantic_structure",
  "navigate",
  "interact",
  "edit_text",
  "open_files",
  "create_documents",
  "delete_content",
  "execute_commands",
  "clipboard_access",
];

export const ApplicationsPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const scrollTopRef = useRef<number | null>(null);
  const [id, setId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bundleId, setBundleId] = useState("");
  const [trustLevel, setTrustLevel] = useState<
    "metadata_only" | "semantic_read" | "interaction" | "automation"
  >("metadata_only");
  const applications = useQuery({
    queryKey: ["applications"],
    queryFn: apiClient.getApplications,
  });
  const adapterDashboard = useQuery({
    queryKey: ["application-adapters"],
    queryFn: apiClient.getApplicationAdapters,
  });
  const adapterSdk = useQuery({
    queryKey: ["adapter-sdk"],
    queryFn: apiClient.getAdapterSdk,
  });
  const coreAdapters = useQuery({
    queryKey: ["core-adapters"],
    queryFn: apiClient.getCoreAdapters,
    refetchInterval: 10_000,
  });
  const nativeProviders = useQuery({
    queryKey: ["native-provider-runtime"],
    queryFn: apiClient.getNativeProviderRuntime,
    refetchInterval: 10_000,
  });
  const integrations = useQuery({
    queryKey: ["integrations"],
    queryFn: apiClient.getIntegrationsDashboard,
    refetchInterval: 15_000,
  });
  const business = useQuery({
    queryKey: ["business-operations"],
    queryFn: apiClient.getBusinessOperations,
    refetchInterval: 15_000,
  });
  const businessOS = useQuery({
    queryKey: ["business-os-summary"],
    queryFn: apiClient.getBusinessOSSummary,
    refetchInterval: 15_000,
  });
  const preserveScrollPosition = () => {
    scrollTopRef.current =
      document.querySelector<HTMLElement>(".content")?.scrollTop ?? null;
  };
  const restoreScrollPosition = () => {
    const scrollTop = scrollTopRef.current;
    if (scrollTop === null) return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const content = document.querySelector<HTMLElement>(".content");
        if (content) content.scrollTop = scrollTop;
      });
    });
  };
  const create = useMutation({
    mutationFn: apiClient.createApplication,
    onSuccess: async () => {
      setId("");
      setDisplayName("");
      setBundleId("");
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
  const update = useMutation({
    mutationFn: ({
      applicationId,
      input,
    }: {
      applicationId: string;
      input: Parameters<ApiClient["updateApplication"]>[1];
    }) => apiClient.updateApplication(applicationId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
      restoreScrollPosition();
    },
    onError: restoreScrollPosition,
  });
  const trustAdapter = useMutation({
    mutationFn: apiClient.trustApplicationAdapter,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["application-adapters"] });
    },
  });
  const updateAdapterPermissions = useMutation({
    mutationFn: apiClient.updateApplicationAdapterPermissions,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["application-adapters"] });
      restoreScrollPosition();
    },
    onError: restoreScrollPosition,
  });
  const refreshCapabilities = useMutation({
    mutationFn: apiClient.refreshApplicationCapabilities,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["application-adapters"] });
    },
  });
  const synchronizeAdapter = useMutation({
    mutationFn: apiClient.synchronizeApplicationAdapter,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["application-adapters"] });
    },
  });
  const revokeAdapter = useMutation({
    mutationFn: apiClient.revokeApplicationAdapter,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["application-adapters"] });
    },
  });
  const transitionAdapter = useMutation({
    mutationFn: apiClient.transitionAdapterLifecycle,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["adapter-sdk"] }),
        queryClient.invalidateQueries({ queryKey: ["application-adapters"] }),
      ]);
    },
  });
  const trustedByBundle = useMemo(
    () =>
      new Map(
        adapterDashboard.data?.trustedApplications.map((application) => [
          application.bundleIdentifier,
          application,
        ]) ?? [],
      ),
    [adapterDashboard.data?.trustedApplications],
  );
  const disable = useMutation({
    mutationFn: apiClient.disableApplication,
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({
      id,
      displayName,
      macBundleId: bundleId,
      enabled: false,
      permissions: emptyPermissions,
      riskOverrides: {},
    });
  };

  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Owner-scoped metadata registry</p>
      <h1>Applications</h1>
      <p>
        Registering an application does not allow the system to open or control it
        during Phase 2.3. Executable paths are never accepted.
      </p>
      <section className="business-integrations">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Business connections</p>
            <h2>Operational integrations</h2>
          </div>
          <small>
            Credentials remain in the configured secret provider and are never shown
            here.
          </small>
        </div>
        <div className="business-integration-grid">
          {integrations.data?.integrations
            .filter((item) => ["gmail", "crm", "analytics", "github"].includes(item.id))
            .map((item) => {
              const health = integrations.data?.health.find(
                (entry) => entry.integrationId === item.id,
              );
              const capabilities =
                integrations.data?.capabilities.filter(
                  (entry) => entry.integrationId === item.id,
                ) ?? [];
              const granted = new Set(
                integrations.data?.permissions
                  .filter(
                    (entry) =>
                      entry.integrationId === item.id && entry.state === "granted",
                  )
                  .map((entry) => entry.capabilityId),
              );
              const checkpoint = business.data?.checkpoints
                .filter((entry) => entry.integrationId === item.id)
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
              const impact = businessOS.data?.providerImpact.find(
                (entry) => entry.provider === item.id,
              );
              return (
                <article key={item.id}>
                  <header>
                    <div>
                      <strong>{item.displayName}</strong>
                      <span
                        className={`integration-health health-${health?.state ?? "unknown"}`}
                      >
                        {health?.credentialStatus === "expired"
                          ? "REAUTH REQUIRED"
                          : (health?.state ?? "unknown").toUpperCase()}
                      </span>
                    </div>
                    <small>{item.healthSummary}</small>
                  </header>
                  <div className="integration-impact">
                    <span>
                      <b>{impact?.activeObjectives ?? 0}</b> objectives
                    </span>
                    <span>
                      <b>{impact?.workflowRuns ?? 0}</b> workflows
                    </span>
                    <span>
                      <b>{impact?.queuedTasks ?? 0}</b> queued tasks
                    </span>
                    <span>
                      <b>{impact?.experiments ?? 0}</b> experiments
                    </span>
                  </div>
                  <div className="integration-capability-list">
                    {capabilities.map((capability) => (
                      <span key={capability.id}>
                        <i className={granted.has(capability.id) ? "granted" : ""} />
                        {capability.name}
                      </span>
                    ))}
                  </div>
                  <footer>
                    <span>
                      {capabilities.filter((item) => granted.has(item.id)).length} of{" "}
                      {capabilities.length} capabilities granted
                    </span>
                    <span>
                      {checkpoint
                        ? `Synced ${new Date(checkpoint.updatedAt).toLocaleString()}`
                        : "No sync recorded"}
                    </span>
                    <ContextualAskAlexa
                      kind="PROVIDER"
                      id={item.id}
                      label={item.displayName}
                    />
                  </footer>
                </article>
              );
            })}
        </div>
        <section className="business-capability-overview">
          <div className="section-heading">
            <div>
              <p className="eyebrow">What can Alexa do?</p>
              <h3>Current business capability</h3>
            </div>
          </div>
          <div>
            {businessOS.data?.capabilities.map((capability) => (
              <article key={capability.id}>
                <span
                  className={`capability-state state-${capability.state.toLowerCase()}`}
                >
                  {capability.state.replaceAll("_", " ")}
                </span>
                <strong>{capability.name}</strong>
                <small>
                  {capability.usedByObjectives} objectives ·{" "}
                  {capability.usedByWorkflows} workflows · {capability.usedByAgents}{" "}
                  agents · {capability.queuedActions} queued
                </small>
              </article>
            ))}
          </div>
        </section>
      </section>
      <form className="registry-form" onSubmit={submit}>
        <label>
          Stable ID
          <input
            onChange={(event) => setId(event.target.value)}
            placeholder="example.editor"
            required
            value={id}
          />
        </label>
        <label>
          Display name
          <input
            onChange={(event) => setDisplayName(event.target.value)}
            required
            value={displayName}
          />
        </label>
        <label>
          macOS bundle ID
          <input
            onChange={(event) => setBundleId(event.target.value)}
            placeholder="com.example.editor"
            required
            value={bundleId}
          />
        </label>
        <button disabled={create.isPending} type="submit">
          Register metadata
        </button>
      </form>
      {create.error instanceof Error ? (
        <p className="form-error">{create.error.message}</p>
      ) : null}

      <div className="registry-list">
        {applications.isPending ? <p>Loading applications…</p> : null}
        {applications.error instanceof ApiClientError ? (
          <p className="form-error">{applications.error.message}</p>
        ) : null}
        {applications.data?.length === 0 ? (
          <div className="notice">No application metadata is registered.</div>
        ) : null}
        {applications.data?.map((application) => (
          <article key={application.id}>
            <div className="registry-card-heading">
              <div>
                <span
                  className={`trust-pill ${application.enabled ? "trust-trusted" : ""}`}
                >
                  {application.enabled ? "ENABLED" : "DISABLED"}
                </span>
                <h2>{application.displayName}</h2>
                <code>{application.id}</code>
                <small>{application.macBundleId}</small>
              </div>
              <div className="device-actions">
                <button
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({
                      applicationId: application.id,
                      input: { enabled: !application.enabled },
                    })
                  }
                  type="button"
                >
                  {application.enabled ? "Turn off" : "Enable metadata"}
                </button>
                <button
                  className="danger-button"
                  disabled={!application.enabled || disable.isPending}
                  onClick={() => disable.mutate(application.id)}
                  type="button"
                >
                  Disable
                </button>
                <button
                  disabled={
                    trustAdapter.isPending ||
                    trustedByBundle.get(application.macBundleId)?.status === "trusted"
                  }
                  onClick={() =>
                    trustAdapter.mutate({
                      id: application.id,
                      applicationName: application.displayName,
                      bundleIdentifier: application.macBundleId,
                      stableIdentifier: application.id,
                      applicationVersion: "unknown",
                      codeSignature: "not_verified",
                      permissionsGranted: [],
                      trustLevel,
                      securityProfile: "strict",
                    })
                  }
                  type="button"
                >
                  Trust adapter
                </button>
                <button
                  disabled={
                    trustAdapter.isPending ||
                    (trustedByBundle.get(application.macBundleId)?.status ===
                      "trusted" &&
                      trustedByBundle.get(application.macBundleId)?.trustLevel !==
                        "metadata_only" &&
                      trustedByBundle
                        .get(application.macBundleId)
                        ?.permissionsGranted.includes("read_semantic_structure"))
                  }
                  onClick={() => {
                    const trusted = trustedByBundle.get(application.macBundleId);
                    trustAdapter.mutate({
                      id: application.id,
                      applicationName: application.displayName,
                      bundleIdentifier: application.macBundleId,
                      stableIdentifier: application.id,
                      applicationVersion: trusted?.applicationVersion ?? "unknown",
                      codeSignature: trusted?.codeSignature ?? "not_verified",
                      permissionsGranted: [
                        ...new Set([
                          ...(trusted?.permissionsGranted ?? []),
                          "read_semantic_structure" as const,
                        ]),
                      ],
                      trustLevel:
                        trusted?.trustLevel === "interaction" ||
                        trusted?.trustLevel === "automation"
                          ? trusted.trustLevel
                          : "semantic_read",
                      securityProfile: trusted?.securityProfile ?? "strict",
                    });
                  }}
                  type="button"
                >
                  {trustedByBundle.get(application.macBundleId)?.status === "trusted" &&
                  trustedByBundle.get(application.macBundleId)?.trustLevel !==
                    "metadata_only" &&
                  trustedByBundle
                    .get(application.macBundleId)
                    ?.permissionsGranted.includes("read_semantic_structure")
                    ? "Context reading enabled"
                    : "Allow context reading"}
                </button>
              </div>
            </div>
            <div className="permission-grid">
              {Object.entries(application.permissions).map(([permission, enabled]) => (
                <label key={permission}>
                  <input
                    checked={enabled}
                    onChange={(event) => {
                      preserveScrollPosition();
                      update.mutate({
                        applicationId: application.id,
                        input: {
                          permissions: {
                            ...application.permissions,
                            [permission]: event.target.checked,
                          },
                        },
                      });
                    }}
                    type="checkbox"
                  />
                  {permission}
                </label>
              ))}
            </div>
            <small>
              Updated {new Date(application.updatedAt).toLocaleString()} · risk
              overrides: {Object.keys(application.riskOverrides).length}
            </small>
          </article>
        ))}
      </div>

      <section className="registry-list">
        <div className="registry-card-heading">
          <div>
            <p className="eyebrow">Phase 17E Application Center</p>
            <h2>Universal Application Adapters</h2>
            <p>
              Trusted applications expose semantic adapter capabilities to Planner,
              Voice, Gesture, Demonstration Learning, and Agents. No executable path,
              pixels, OCR, or coordinate replay is accepted here.
            </p>
          </div>
          <label>
            Default trust level
            <select
              onChange={(event) =>
                setTrustLevel(
                  event.target.value as
                    "metadata_only" | "semantic_read" | "interaction" | "automation",
                )
              }
              value={trustLevel}
            >
              <option value="metadata_only">Metadata only</option>
              <option value="semantic_read">Semantic read</option>
              <option value="interaction">Interaction</option>
              <option value="automation">Automation</option>
            </select>
          </label>
        </div>
        {adapterDashboard.isPending ? <p>Loading adapter framework…</p> : null}
        {adapterDashboard.error instanceof ApiClientError ? (
          <p className="form-error">{adapterDashboard.error.message}</p>
        ) : null}
        {trustAdapter.error instanceof Error ? (
          <p className="form-error">{trustAdapter.error.message}</p>
        ) : null}
        <div className="notice">
          Framework:{" "}
          {adapterDashboard.data?.universalAdapterFrameworkAvailable
            ? "available"
            : "loading"}{" "}
          · generic accessibility adapter:{" "}
          {adapterDashboard.data?.genericAccessibilityAdapterAvailable
            ? "registered"
            : "loading"}{" "}
          · pixel/OCR/coordinate automation: disabled
        </div>
        {adapterDashboard.data?.trustedApplications.length === 0 ? (
          <div className="notice">
            No trusted application adapters yet. Register application metadata above,
            then explicitly trust the adapter.
          </div>
        ) : null}
        {adapterDashboard.data?.trustedApplications.map((application) => {
          const permissions = adapterDashboard.data.applicationPermissions.filter(
            (permission) => permission.applicationId === application.id,
          );
          const capabilities = adapterDashboard.data.applicationCapabilities.filter(
            (capability) => capability.applicationId === application.id,
          );
          const health = adapterDashboard.data.applicationHealth.find(
            (item) => item.applicationId === application.id,
          );
          const events = adapterDashboard.data.applicationEvents
            .filter((event) => event.applicationId === application.id)
            .slice(0, 5);
          const granted = new Set(application.permissionsGranted);
          return (
            <article key={application.id}>
              <div className="registry-card-heading">
                <div>
                  <span
                    className={`trust-pill ${
                      application.status === "trusted" ? "trust-trusted" : ""
                    }`}
                  >
                    {application.status.toUpperCase()}
                  </span>
                  <h2>{application.applicationName}</h2>
                  <code>{application.stableIdentifier}</code>
                  <small>
                    {application.bundleIdentifier} · trust {application.trustLevel} ·
                    executable path user supplied:{" "}
                    {String(application.executablePathUserSupplied)}
                  </small>
                </div>
                <div className="device-actions">
                  <button
                    disabled={refreshCapabilities.isPending}
                    onClick={() => refreshCapabilities.mutate(application.id)}
                    type="button"
                  >
                    Refresh capabilities
                  </button>
                  <button
                    disabled={synchronizeAdapter.isPending}
                    onClick={() => synchronizeAdapter.mutate(application.id)}
                    type="button"
                  >
                    Synchronize
                  </button>
                  <button
                    className="danger-button"
                    disabled={
                      revokeAdapter.isPending || application.status !== "trusted"
                    }
                    onClick={() => revokeAdapter.mutate(application.id)}
                    type="button"
                  >
                    Revoke
                  </button>
                </div>
              </div>
              <div className="permission-grid">
                {adapterPermissions.map((permission) => (
                  <label key={permission}>
                    <input
                      checked={granted.has(permission)}
                      onChange={(event) => {
                        preserveScrollPosition();
                        const next = new Set(application.permissionsGranted);
                        if (event.target.checked) {
                          next.add(permission);
                        } else {
                          next.delete(permission);
                        }
                        updateAdapterPermissions.mutate({
                          applicationId: application.id,
                          permissions: [...next],
                        });
                      }}
                      type="checkbox"
                    />
                    {permission}
                  </label>
                ))}
              </div>
              <p>
                Capabilities:{" "}
                {capabilities.map((capability) => capability.capability).join(", ") ||
                  "none discovered"}
              </p>
              <p>
                Health: {health?.status ?? "unknown"} · permissions{" "}
                {health?.permissionState ?? "unknown"} ·{" "}
                {health?.connectionStatus ?? "not checked"}
              </p>
              <small>
                Permission records: {permissions.length} · recent events:{" "}
                {events.map((event) => event.eventType).join(", ") || "none"}
              </small>
            </article>
          );
        })}
      </section>

      <section className="registry-list">
        <div className="registry-card-heading">
          <div>
            <p className="eyebrow">Phase 18D Adapter Management Center</p>
            <h2>Universal Application Adapter SDK</h2>
            <p>
              Reviewed adapters install into the existing Application Adapter Framework,
              Provider Runtime, semantic object model, and transport. The Planner
              discovers capabilities dynamically and keeps application-specific logic
              out of core planning.
            </p>
          </div>
        </div>
        <div className="notice">
          SDK:{" "}
          {adapterSdk.data?.universalApplicationAdapterSdkAvailable
            ? "available"
            : "loading"}{" "}
          · duplicates provider registry:{" "}
          {String(adapterSdk.data?.metadata.duplicatesProviderRegistry ?? false)} · raw
          UI automation: disabled
        </div>
        <section className="status-grid">
          <article className="status-card">
            <span>SDK contracts</span>
            <strong>{adapterSdk.data?.contracts.length ?? 0}</strong>
            <small>generated from existing adapter instances</small>
          </article>
          <article className="status-card">
            <span>Lifecycle events</span>
            <strong>{adapterSdk.data?.lifecycle.length ?? 0}</strong>
            <small>audited state transitions</small>
          </article>
          <article className="status-card">
            <span>Sandboxes</span>
            <strong>{adapterSdk.data?.sandboxes.length ?? 0}</strong>
            <small>bounded resource declarations</small>
          </article>
          <article className="status-card">
            <span>Compatibility</span>
            <strong>{adapterSdk.data?.compatibility.length ?? 0}</strong>
            <small>SDK/app/provider checks</small>
          </article>
        </section>
        {adapterSdk.data?.contracts.map((contract) => (
          <article key={contract.id}>
            <div className="registry-card-heading">
              <div>
                <span
                  className={`trust-pill ${
                    contract.lifecycleState === "active" ||
                    contract.lifecycleState === "enabled"
                      ? "trust-trusted"
                      : ""
                  }`}
                >
                  {contract.lifecycleState.toUpperCase()}
                </span>
                <h2>{contract.adapterName}</h2>
                <code>{contract.applicationId}</code>
                <small>
                  SDK {contract.sdkVersion} · source {contract.source} · provider{" "}
                  {contract.providerId ?? "none"}
                </small>
              </div>
              <div className="device-actions">
                <button
                  disabled={transitionAdapter.isPending}
                  onClick={() =>
                    transitionAdapter.mutate({
                      adapterInstanceId: contract.adapterInstanceId,
                      toState: "enabled",
                      reason: "Owner enabled reviewed adapter SDK contract.",
                    })
                  }
                  type="button"
                >
                  Enable SDK adapter
                </button>
                <button
                  disabled={transitionAdapter.isPending}
                  onClick={() =>
                    transitionAdapter.mutate({
                      adapterInstanceId: contract.adapterInstanceId,
                      toState: "paused",
                      reason: "Owner paused reviewed adapter SDK contract.",
                    })
                  }
                  type="button"
                >
                  Pause
                </button>
                <button
                  className="danger-button"
                  disabled={transitionAdapter.isPending}
                  onClick={() =>
                    transitionAdapter.mutate({
                      adapterInstanceId: contract.adapterInstanceId,
                      toState: "disabled",
                      reason: "Owner disabled reviewed adapter SDK contract.",
                    })
                  }
                  type="button"
                >
                  Disable
                </button>
              </div>
            </div>
            <p>
              Domains: {contract.semanticDomains.join(", ") || "none"} · semantic
              capabilities: {contract.semanticCapabilityIds.join(", ") || "none"}
            </p>
            <p>
              Operations: {contract.operations.join(", ") || "none"} · object types:{" "}
              {contract.objectTypes.join(", ") || "none"}
            </p>
            <small>
              sandboxed: {String(contract.sandboxed)} · planner agnostic:{" "}
              {String(contract.plannerAgnostic)} · raw UI automation:{" "}
              {String(contract.rawUiAutomationAvailable)}
            </small>
          </article>
        ))}
        {adapterSdk.data?.contracts.length === 0 ? (
          <div className="notice">
            No SDK contracts yet. Trust an application adapter above to generate a
            reviewed SDK contract from the existing adapter instance.
          </div>
        ) : null}
      </section>

      <section className="registry-list">
        <div className="registry-card-heading">
          <div>
            <p className="eyebrow">Phase 18E Core Adapter Suite</p>
            <h2>Production semantic adapters</h2>
            <p>
              Core adapters expose application semantics through the existing SDK,
              provider runtime, semantic object model, and trusted native transport.
              Planner, Voice, Gesture, Demonstration Learning, and Agents consume
              semantic capabilities instead of application-specific UI logic.
            </p>
          </div>
          <button
            disabled={coreAdapters.isFetching}
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["core-adapters"] })
            }
            type="button"
          >
            Refresh core adapters
          </button>
        </div>
        <div className="notice">
          Core suite:{" "}
          {coreAdapters.data?.coreApplicationAdapterSuiteAvailable
            ? "available"
            : "loading"}{" "}
          · existing SDK: {String(coreAdapters.data?.usesExistingAdapterSdk ?? true)} ·
          raw UI automation: disabled
        </div>
        <section className="status-grid">
          <article className="status-card">
            <span>Core adapters</span>
            <strong>{coreAdapters.data?.adapters.length ?? 0}</strong>
            <small>
              VS Code, Finder, browsers, Terminal, Notes, Calendar, Reminders
            </small>
          </article>
          <article className="status-card">
            <span>Semantic capabilities</span>
            <strong>{coreAdapters.data?.capabilities.length ?? 0}</strong>
            <small>application-independent Planner surface</small>
          </article>
          <article className="status-card">
            <span>Recent actions</span>
            <strong>{coreAdapters.data?.recentActions.length ?? 0}</strong>
            <small>verified/denied semantic action history</small>
          </article>
          <article className="status-card">
            <span>Context snapshots</span>
            <strong>{coreAdapters.data?.contextSnapshots.length ?? 0}</strong>
            <small>current app/session metadata</small>
          </article>
        </section>
        {coreAdapters.data?.adapters.map((adapter) => {
          const capabilities =
            coreAdapters.data.capabilities.filter(
              (capability) => capability.adapterId === adapter.id,
            ) ?? [];
          const health = coreAdapters.data.healthMetrics.find(
            (metric) => metric.adapterId === adapter.id,
          );
          const permissionStatus = coreAdapters.data.permissionStatus.filter(
            (permission) => permission.adapterId === adapter.id,
          );
          return (
            <article key={adapter.id}>
              <div className="registry-card-heading">
                <div>
                  <span
                    className={`trust-pill ${
                      adapter.status === "active" ? "trust-trusted" : ""
                    }`}
                  >
                    {adapter.status.toUpperCase()}
                  </span>
                  <h2>{adapter.displayName}</h2>
                  <code>{adapter.applicationId}</code>
                  <small>
                    provider {adapter.providerId ?? "none"} · dependency{" "}
                    {adapter.dependencyState} · health{" "}
                    {Math.round(adapter.health * 100)}%
                  </small>
                </div>
              </div>
              <p>
                Domains: {adapter.semanticDomains.join(", ")} · objects:{" "}
                {adapter.supportedObjectTypes.join(", ")}
              </p>
              <p>
                Capabilities:{" "}
                {capabilities.map((capability) => capability.capabilityId).join(", ")}
              </p>
              <small>
                permissions:{" "}
                {permissionStatus
                  .map(
                    (permission) =>
                      `${permission.permission}:${permission.granted ? "granted" : "missing"}`,
                  )
                  .join(", ") || "none"}{" "}
                · latest health metric {health ? Math.round(health.health * 100) : 0}%
              </small>
            </article>
          );
        })}
      </section>

      <details className="advanced-panel">
        <summary>Interaction providers and reviewed capabilities</summary>
        <div className="advanced-panel-body">
          <p>
            Context reading and application interaction are independent. Providers below
            expose finite semantic operations only; raw Accessibility, coordinates, key
            replay, scripts, and shell execution remain unavailable.
          </p>
          {nativeProviders.data?.nativeProviders.map((provider) => {
            const trusted = adapterDashboard.data?.trustedApplications.find(
              (application) => application.id === provider.applicationId,
            );
            const capabilities = nativeProviders.data.providerCapabilities.filter(
              (capability) => capability.providerId === provider.id,
            );
            const health = nativeProviders.data.providerHealth.find(
              (record) => record.providerId === provider.id,
            );
            const latest = nativeProviders.data.providerExecution.find(
              (record) => record.providerId === provider.id,
            );
            return (
              <article key={provider.id}>
                <div className="registry-card-heading">
                  <div>
                    <span
                      className={`trust-pill ${
                        provider.status === "healthy" ? "trust-trusted" : ""
                      }`}
                    >
                      {provider.status.toUpperCase()}
                    </span>
                    <h2>{provider.name}</h2>
                    <code>{provider.id}</code>
                  </div>
                </div>
                <p>
                  Context:{" "}
                  {trusted?.permissionsGranted.includes("read_semantic_structure")
                    ? "Allowed"
                    : "Denied"}
                  {" · "}Interaction:{" "}
                  {trusted?.permissionsGranted.includes("interact")
                    ? "Allowed"
                    : "Denied"}
                  {" · "}Health: {health?.status ?? "unknown"}
                </p>
                <p>
                  Reviewed capabilities:{" "}
                  {capabilities
                    .filter((item) => item.enabled)
                    .map((item) => item.capability)
                    .join(", ") || "none"}
                </p>
                <small>
                  Reviewed version {provider.version} · last execution{" "}
                  {latest?.status ?? "none"}
                </small>
              </article>
            );
          })}
        </div>
      </details>
    </section>
  );
};
