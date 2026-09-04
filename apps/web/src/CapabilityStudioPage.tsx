import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FlaskConical, History, Plus, Radio, ShieldCheck } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import type { CapabilityCandidate } from "@alexa-control/shared";

import type { ApiClient } from "./api.js";

type StudioTab = "registry" | "create" | "candidates" | "history";

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const errorMessage = (...values: unknown[]) => {
  const error = values.find((value) => value instanceof Error);
  return error instanceof Error ? error.message : null;
};

export const CapabilityStudioPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<StudioTab>("registry");
  const [applicationId, setApplicationId] = useState("chrome");
  const [method, setMethod] = useState<"record" | "describe">("describe");
  const [description, setDescription] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedRegistryCapabilityId, setSelectedRegistryCapabilityId] = useState<
    string | null
  >(null);

  const studio = useQuery({
    queryKey: ["capability-studio"],
    queryFn: apiClient.getCapabilityStudio,
    refetchInterval: 10_000,
  });
  const demonstrations = useQuery({
    queryKey: ["command-studio"],
    queryFn: apiClient.getCommandStudio,
    refetchInterval: recordingId ? 2_000 : false,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["capability-studio"] }),
      queryClient.invalidateQueries({ queryKey: ["command-studio"] }),
      queryClient.invalidateQueries({ queryKey: ["native-provider-runtime"] }),
    ]);
  };

  const createDescription = useMutation({
    mutationFn: apiClient.createCapabilityFromDescription,
    onSuccess: async (data) => {
      setDescription("");
      setSelectedCandidateId(data.candidates[0]?.id ?? null);
      setTab("candidates");
      await refresh();
    },
  });
  const startRecording = useMutation({
    mutationFn: () =>
      apiClient.startIntentRecording({
        name: `Teach ${applicationId} capability`,
        description: "Bounded semantic capability demonstration.",
        source: "dashboard",
        countdownSeconds: 0,
      }),
    onSuccess: async (data) => {
      setRecordingId(data.recordings.find((item) => item.status === "recording")?.id ?? null);
      await refresh();
    },
  });
  const stopRecording = useMutation({
    mutationFn: async () => {
      if (!recordingId) throw new Error("No capability recording is active.");
      await apiClient.stopIntentRecording({
        recordingId,
        primaryObjective: description.trim() || `Teach a reviewed ${applicationId} capability.`,
      });
      return apiClient.createCapabilityFromRecording({ applicationId, recordingId });
    },
    onSuccess: async (data) => {
      setSelectedCandidateId(data.candidates[0]?.id ?? null);
      setRecordingId(null);
      setDescription("");
      setTab("candidates");
      await refresh();
    },
  });
  const candidateMutation = useMutation({
    mutationFn: async ({ action, candidate }: { action: string; candidate: CapabilityCandidate }) => {
      const input = { candidateId: candidate.id };
      if (action === "validate") return apiClient.validateCapabilityCandidate(input);
      if (action === "test") return apiClient.testCapabilityCandidate(input);
      if (action === "approval") return apiClient.requestCapabilityApproval(input);
      if (action === "activate") return apiClient.activateCapabilityCandidate(input);
      if (action === "deprecate")
        return apiClient.changeCapabilityCandidateState({ ...input, action: "DEPRECATE" });
      if (action === "rollback")
        return apiClient.changeCapabilityCandidateState({ ...input, action: "ROLLBACK" });
      return apiClient.changeCapabilityCandidateState({ ...input, action: "REVOKE" });
    },
    onSuccess: refresh,
  });

  const applications = useMemo(
    () => studio.data?.nativeProviders ?? [],
    [studio.data?.nativeProviders],
  );
  const selectedProvider = applications.find((item) => item.applicationId === applicationId);
  const selectedRegistryCapability = studio.data?.providerCapabilities.find(
    (item) => item.id === selectedRegistryCapabilityId,
  );
  const selectedProviderHealth = studio.data?.providerHealth.find(
    (item) => item.providerId === selectedProvider?.id,
  );
  const selectedCandidate = studio.data?.candidates.find(
    (item) => item.id === selectedCandidateId,
  );
  const activeRecording = demonstrations.data?.recordings.find(
    (item) => item.id === recordingId && item.status === "recording",
  );
  const recordedEvents = demonstrations.data?.events.filter(
    (item) => item.recordingId === recordingId,
  );
  const mutationError = errorMessage(
    createDescription.error,
    startRecording.error,
    stopRecording.error,
    candidateMutation.error,
  );

  if (studio.isPending) return <section className="placeholder-page">Loading capabilities…</section>;

  const submitDescription = (event: FormEvent) => {
    event.preventDefault();
    createDescription.mutate({ applicationId, description });
  };

  return (
    <section className="capability-studio">
      <div className="capability-studio-summary">
        <div>
          <h2>Capability Studio</h2>
          <p>Inspect and teach finite, reviewed application abilities.</p>
        </div>
        <button className="primary-button" onClick={() => setTab("create")} type="button">
          <Plus size={15} /> Teach new capability
        </button>
      </div>

      <div className="capability-studio-tabs" role="tablist" aria-label="Capability Studio sections">
        {(["registry", "create", "candidates", "history"] as const).map((item) => (
          <button
            aria-selected={tab === item}
            className={tab === item ? "active" : undefined}
            key={item}
            onClick={() => setTab(item)}
            role="tab"
            type="button"
          >
            {titleCase(item)}
          </button>
        ))}
      </div>

      {studio.isError ? <p className="error-banner">Capability Studio could not load: {studio.error.message}</p> : null}
      {mutationError ? <p className="error-banner">{mutationError}</p> : null}

      {tab === "registry" ? (
        <div className="capability-registry-layout">
          <aside className="capability-app-list">
            {applications.map((application) => {
              const capabilities = studio.data?.providerCapabilities.filter(
                (item) => item.providerId === application.id && item.enabled,
              );
              return (
                <button
                  className={application.applicationId === applicationId ? "active" : undefined}
                  key={application.id}
                  onClick={() => {
                    setApplicationId(application.applicationId);
                    setSelectedRegistryCapabilityId(null);
                  }}
                  type="button"
                >
                  <span>{application.name.replace("Provider", "")}</span>
                  <small>{capabilities?.length ?? 0} active</small>
                </button>
              );
            })}
          </aside>
          <div className="capability-registry-main">
            <header>
              <div>
                <h3>{selectedProvider?.name.replace("Provider", "") ?? "Application"}</h3>
                <p>{selectedProvider?.status ?? "unavailable"} reviewed provider</p>
              </div>
            </header>
            <div className="capability-table" role="table">
              {(studio.data?.providerCapabilities ?? [])
                .filter((item) => item.providerId === selectedProvider?.id)
                .map((capability) => {
                  const health = studio.data?.providerHealth.find(
                    (item) => item.providerId === capability.providerId,
                  );
                  return (
                    <button
                      className="capability-row"
                      key={capability.id}
                      onClick={() => setSelectedRegistryCapabilityId(capability.id)}
                      role="row"
                      type="button"
                    >
                      <span><strong>{capability.capability.toUpperCase()}</strong><small>{capability.verification}</small></span>
                      <span className={`status-badge ${capability.enabled ? "good" : "muted"}`}>{capability.enabled ? "ACTIVE" : "DISABLED"}</span>
                      <span className="status-badge">{health?.status ?? "unknown"}</span>
                      <span className="status-badge">{capability.riskLevel}</span>
                    </button>
                  );
                })}
            </div>
            {selectedRegistryCapability ? (
              <article className="capability-inspector">
                <header>
                  <div>
                    <h3>{selectedRegistryCapability.capability.toUpperCase()}</h3>
                    <p>{selectedRegistryCapability.verification}</p>
                  </div>
                  <span className={`status-badge ${selectedRegistryCapability.enabled ? "good" : "muted"}`}>
                    {selectedRegistryCapability.enabled ? "ACTIVE" : "DISABLED"}
                  </span>
                </header>
                <dl>
                  <div><dt>Application</dt><dd>{selectedProvider?.applicationId ?? "unknown"}</dd></div>
                  <div><dt>Provider</dt><dd>{selectedRegistryCapability.providerId}</dd></div>
                  <div><dt>Version</dt><dd>{selectedProvider?.version ?? "unknown"}</dd></div>
                  <div><dt>Health</dt><dd>{selectedProviderHealth?.status ?? "unknown"}</dd></div>
                  <div><dt>Risk</dt><dd>{selectedRegistryCapability.riskLevel}</dd></div>
                  <div><dt>Permissions</dt><dd>{selectedRegistryCapability.permissions.join(", ") || "none"}</dd></div>
                  <div><dt>Inputs</dt><dd>{selectedRegistryCapability.inputs.join(", ") || "none"}</dd></div>
                  <div><dt>Outputs</dt><dd>{selectedRegistryCapability.outputs.join(", ") || "none"}</dd></div>
                </dl>
                <details className="advanced-panel">
                  <summary>Advanced capability details</summary>
                  <div className="advanced-panel-body">
                    <p>Dependencies: {selectedRegistryCapability.dependencies.join(", ") || "none"}</p>
                    <p>Updated: {new Date(selectedRegistryCapability.updatedAt).toLocaleString()}</p>
                  </div>
                </details>
              </article>
            ) : null}
            <details className="advanced-panel">
              <summary>Advanced provider details</summary>
              <div className="advanced-panel-body">
                <p>Provider {selectedProvider?.id ?? "none"} · version {selectedProvider?.version ?? "n/a"}</p>
                <p>Arbitrary execution, shell, AppleScript, coordinate clicks, keyboard replay, OCR, and screenshots remain unavailable.</p>
              </div>
            </details>
          </div>
        </div>
      ) : null}

      {tab === "create" ? (
        <div className="capability-create-panel">
          <div className="capability-methods">
            <button className={method === "record" ? "active" : undefined} onClick={() => setMethod("record")} type="button"><Radio size={15} /> Record demonstration</button>
            <button className={method === "describe" ? "active" : undefined} onClick={() => setMethod("describe")} type="button"><Plus size={15} /> Describe capability</button>
          </div>
          <label>
            Application
            <select value={applicationId} onChange={(event) => setApplicationId(event.target.value)}>
              {applications.map((application) => <option key={application.id} value={application.applicationId}>{application.name.replace("Provider", "")}</option>)}
            </select>
          </label>
          <label>
            Desired ability
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Create a capability that refreshes the current Chrome page." />
          </label>
          {method === "describe" ? (
            <form onSubmit={submitDescription}>
              <p className="notice">Description creates an inert candidate. It cannot grant permissions or execute.</p>
              <button className="primary-button" disabled={description.trim().length < 5 || createDescription.isPending} type="submit">Create candidate</button>
            </form>
          ) : (
            <div className="capability-recording">
              <p className="notice">Recording captures governed semantic provider actions only. Run the action through Athena while recording; raw mouse, keyboard, pixels, audio, and secure text are not captured.</p>
              {activeRecording ? (
                <>
                  <div className="recording-indicator"><span /> Recording {selectedProvider?.name.replace("Provider", "")} · {recordedEvents?.length ?? 0} semantic event(s)</div>
                  <div className="capability-trace-list">
                    {recordedEvents?.map((event, index) => <div key={event.id}><b>{index + 1}</b><span>{event.semanticSummary}</span></div>)}
                  </div>
                  <button className="danger-button" disabled={stopRecording.isPending} onClick={() => stopRecording.mutate()} type="button">Stop and create candidate</button>
                </>
              ) : (
                <button className="primary-button" disabled={startRecording.isPending} onClick={() => startRecording.mutate()} type="button">Start semantic recording</button>
              )}
            </div>
          )}
        </div>
      ) : null}

      {tab === "candidates" ? (
        <div className="capability-candidate-layout">
          <div className="capability-candidate-list">
            {(studio.data?.candidates ?? []).map((candidate) => (
              <button className={selectedCandidateId === candidate.id ? "active" : undefined} key={candidate.id} onClick={() => setSelectedCandidateId(candidate.id)} type="button">
                <span><strong>{candidate.name}</strong><small>{candidate.applicationId} · v{candidate.version} · {candidate.source.toLowerCase()}</small></span>
                <span className="status-badge">{candidate.status}</span>
              </button>
            ))}
            {studio.data?.candidates.length === 0 ? <p className="notice">No capability candidates yet.</p> : null}
          </div>
          {selectedCandidate ? (
            <article className="capability-inspector">
              <header><div><h3>{selectedCandidate.name}</h3><p>{selectedCandidate.description}</p></div><span className="status-badge">{selectedCandidate.status}</span></header>
              <dl>
                <div><dt>Application</dt><dd>{selectedCandidate.applicationId}</dd></div>
                <div><dt>Primitive</dt><dd>{selectedCandidate.primitive}</dd></div>
                <div><dt>Provider</dt><dd>{selectedCandidate.providerId}</dd></div>
                <div><dt>Risk</dt><dd>{selectedCandidate.riskLevel}</dd></div>
                <div><dt>Permissions</dt><dd>{selectedCandidate.requiredPermissions.join(", ")}</dd></div>
                <div><dt>Verification</dt><dd>{selectedCandidate.verificationStrategy}</dd></div>
              </dl>
              {selectedCandidate.duplicateOfCapabilityId ? <p className="notice">An existing reviewed primitive already covers execution. This candidate versions its bounded target and behavior without duplicating authority.</p> : null}
              <div className="candidate-checks">
                <span><ShieldCheck size={14} /> Safety {selectedCandidate.validation.safetyPassed ? "PASS" : "pending"}</span>
                <span><FlaskConical size={14} /> Test {selectedCandidate.testSummary.status}</span>
                <span><Check size={14} /> {selectedCandidate.testSummary.verificationSuccesses}/{selectedCandidate.testSummary.attempts} checks</span>
              </div>
              <div className="button-row">
                <button onClick={() => candidateMutation.mutate({ action: "validate", candidate: selectedCandidate })} type="button">Validate</button>
                <button disabled={selectedCandidate.validation.status !== "PASSED"} onClick={() => candidateMutation.mutate({ action: "test", candidate: selectedCandidate })} type="button">Test</button>
                <button disabled={selectedCandidate.testSummary.status !== "PASSED"} onClick={() => candidateMutation.mutate({ action: "approval", candidate: selectedCandidate })} type="button">Request approval</button>
                {selectedCandidate.approvalRequestId ? <button onClick={() => { window.location.href = "/approvals"; }} type="button">Open approval</button> : null}
                <button disabled={!selectedCandidate.approvalRequestId} onClick={() => candidateMutation.mutate({ action: "activate", candidate: selectedCandidate })} type="button">Activate approved</button>
                <button className="danger-button" onClick={() => candidateMutation.mutate({ action: "revoke", candidate: selectedCandidate })} type="button">Revoke</button>
              </div>
              <details className="advanced-panel"><summary>Advanced candidate details</summary><div className="advanced-panel-body"><pre>{JSON.stringify({ targetResolver: selectedCandidate.targetResolver, inputSchema: selectedCandidate.inputSchema, validation: selectedCandidate.validation }, null, 2)}</pre></div></details>
            </article>
          ) : <p className="notice">Select a candidate to inspect its bounded definition.</p>}
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="capability-history-list">
          {(studio.data?.history ?? []).map((event) => <div key={event.id}><History size={14} /><span><strong>{titleCase(event.type)}</strong><small>{event.summary}</small></span><time>{new Date(event.createdAt).toLocaleString()}</time></div>)}
          {studio.data?.history.length === 0 ? <p className="notice">No capability lifecycle history yet.</p> : null}
        </div>
      ) : null}
    </section>
  );
};
