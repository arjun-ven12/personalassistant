import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  LibraryBig,
  Mic2,
  Play,
  Save,
  Square,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { ApiClient } from "./api.js";

type VoiceShortcutSafetyLevel =
  "informational" | "read_only" | "low_risk" | "moderate_risk";

const toVoiceShortcutSafetyLevel = (risk: string): VoiceShortcutSafetyLevel => {
  if (risk === "informational" || risk === "read_only" || risk === "low_risk") {
    return risk;
  }
  return "moderate_risk";
};

export const CommandStudioPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState("New demonstrated command");
  const [description, setDescription] = useState(
    "Teach Athena a reusable semantic workflow.",
  );
  const [objective, setObjective] = useState("");
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [saveAsVoice, setSaveAsVoice] = useState(false);
  const [voicePhrase, setVoicePhrase] = useState("");

  const studio = useQuery({
    queryKey: ["command-studio"],
    queryFn: apiClient.getCommandStudio,
    refetchInterval: 15_000,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["command-studio"] });
    await queryClient.invalidateQueries({ queryKey: ["command-center"] });
    await queryClient.invalidateQueries({ queryKey: ["voice-dashboard"] });
  };

  const start = useMutation({
    mutationFn: apiClient.startIntentRecording,
    onSuccess: invalidate,
  });
  const record = useMutation({
    mutationFn: apiClient.recordIntentEvent,
    onSuccess: invalidate,
  });
  const stop = useMutation({
    mutationFn: apiClient.stopIntentRecording,
    onSuccess: invalidate,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!latestGenerated) throw new Error("No generated command is available.");
      const response = await apiClient.saveGeneratedCommand({
        generatedCommandId: latestGenerated.id,
        name: latestGenerated.name,
        requestTemplate: latestGenerated.requestTemplate,
        pinned: false,
        favorite: false,
      });
      if (saveAsVoice && voicePhrase.trim()) {
        const elevated =
          latestGenerated.riskLevel === "moderate_risk" ||
          latestGenerated.riskLevel === "high_risk" ||
          latestGenerated.riskLevel === "critical";
        await apiClient.upsertVoiceShortcut({
          phrase: voicePhrase.trim(),
          intentTemplate: latestGenerated.requestTemplate,
          enabled: true,
          safetyLevel: toVoiceShortcutSafetyLevel(latestGenerated.riskLevel),
          approvalRequired: elevated || latestGenerated.approvalRequired,
        });
      }
      return response;
    },
    onSuccess: invalidate,
  });

  const activeRecording = useMemo(
    () => studio.data?.recordings.find((recording) => recording.status === "recording"),
    [studio.data?.recordings],
  );
  const activeEvents = useMemo(
    () =>
      activeRecording
        ? (studio.data?.events ?? []).filter(
            (event) => event.recordingId === activeRecording.id,
          )
        : [],
    [activeRecording, studio.data?.events],
  );
  const latestGenerated = studio.data?.generatedCommands[0];
  const latestSkill = studio.data?.generatedSkills[0];
  const latestTimeline = studio.data?.workflowTimelines[0];
  const skillParameters = studio.data?.skillParameters ?? [];
  const workflowValidation = studio.data?.workflowValidation ?? [];
  const skillUsage = studio.data?.skillUsage ?? [];

  const saveSkill = useMutation({
    mutationFn: async () => {
      if (!latestSkill) throw new Error("No generated skill is available.");
      return apiClient.saveGeneratedSkill({
        skillId: latestSkill.id,
        name: latestSkill.name,
        description: latestSkill.description,
        plannerAvailable: true,
      });
    },
    onSuccess: invalidate,
  });
  const validateSkill = useMutation({
    mutationFn: async () => {
      if (!latestSkill) throw new Error("No generated skill is available.");
      return apiClient.validateDemonstratedWorkflow({ skillId: latestSkill.id });
    },
    onSuccess: invalidate,
  });
  const simulateSkill = useMutation({
    mutationFn: async () => {
      if (!latestSkill) throw new Error("No generated skill is available.");
      return apiClient.simulateDemonstratedWorkflow({
        skillId: latestSkill.id,
        origin: "dashboard",
      });
    },
    onSuccess: invalidate,
  });
  const editSkill = useMutation({
    mutationFn: async () => {
      if (!latestSkill) throw new Error("No generated skill is available.");
      return apiClient.editDemonstratedWorkflow({
        skillId: latestSkill.id,
        operation: "add_condition",
        stepId: latestTimeline?.steps[0]?.id ?? null,
        input: { expression: "Wait until semantic target is available." },
      });
    },
    onSuccess: invalidate,
  });

  useEffect(() => {
    if (!activeRecording) return;
    let lastRecordedAt = 0;
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("[data-intent-recorder-panel='true']")) return;
      if (target.closest("input, textarea, select, [contenteditable='true']")) return;

      const interactive = target.closest(
        "button, a, [role='button'], [data-spatial-id]",
      );
      if (!(interactive instanceof HTMLElement)) return;

      const now = Date.now();
      if (now - lastRecordedAt < 500) return;
      lastRecordedAt = now;

      const label =
        interactive.getAttribute("aria-label") ??
        interactive.getAttribute("data-spatial-label") ??
        interactive.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) ??
        interactive.tagName.toLowerCase();
      if (!label) return;

      record.mutate({
        recordingId: activeRecording.id,
        source: "dashboard",
        type: "semantic_note",
        capabilityId: null,
        title: `Clicked ${label}`,
        semanticSummary: `The user selected the dashboard control labelled "${label}".`,
        arguments: {
          dashboardPage: window.location.pathname,
          elementRole:
            interactive.getAttribute("role") ?? interactive.tagName.toLowerCase(),
          elementLabel: label,
        },
        status: "succeeded",
        dependsOnEventIds: activeEvents.at(-1) ? [activeEvents.at(-1)!.id] : [],
        durationMs: 0,
      });
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [activeEvents, activeRecording, record]);

  const addSemanticEvent = () => {
    if (!activeRecording) return;
    const sequence = activeEvents.length + 1;
    record.mutate({
      recordingId: activeRecording.id,
      source: sequence % 2 === 0 ? "intent_engine" : "dashboard",
      type: sequence % 2 === 0 ? "intent_submitted" : "semantic_note",
      capabilityId: sequence % 2 === 0 ? "intent.command.submit" : null,
      title:
        sequence % 2 === 0
          ? "Submit governed dashboard intent"
          : "Observe dashboard workflow step",
      semanticSummary:
        sequence % 2 === 0
          ? "Submit a governed intent using the current dashboard context."
          : "Capture a semantic workflow step without recording raw input.",
      arguments: {
        workspaceContext: "current_context",
        dashboardPage: window.location.pathname,
      },
      status: "succeeded",
      dependsOnEventIds: activeEvents.at(-1) ? [activeEvents.at(-1)!.id] : [],
      durationMs: 250,
    });
  };

  if (studio.isPending) {
    return <section className="placeholder-page">Loading Command Studio…</section>;
  }

  return (
    <section className="placeholder-page wide-page governance-page">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Phase 16 · Programming by Demonstration</p>
          <h1>Demonstration Studio</h1>
          <p>
            Record semantic actions, generate reusable demonstrated skills, and save
            them only after review. This is programming by demonstration, not macro
            recording: raw camera, audio, passwords, mouse paths, pixels, coordinates,
            and keyboard streams stay out of the recording.
          </p>
        </div>
        <button
          className="command-recorder-launch"
          onClick={() => setRecorderOpen(true)}
          type="button"
        >
          <WandSparkles size={16} /> Create command
        </button>
      </div>

      <div className="status-grid">
        <div className="status-card">
          <span>Recording mode</span>
          <strong>{activeRecording ? "Active" : "Stopped"}</strong>
          <small>Semantic events only</small>
        </div>
        <div className="status-card">
          <span>Raw input</span>
          <strong>{studio.data?.rawInputCaptured ? "Captured" : "Blocked"}</strong>
          <small>Coordinates and keystreams are not replayed</small>
        </div>
        <div className="status-card">
          <span>Generated commands</span>
          <strong>{studio.data?.generatedCommands.length ?? 0}</strong>
          <small>Review is required before activation</small>
        </div>
        <div className="status-card">
          <span>Generated skills</span>
          <strong>{studio.data?.generatedSkills.length ?? 0}</strong>
          <small>
            Macro recording: {studio.data?.macroRecordingAvailable ? "on" : "off"}
          </small>
        </div>
      </div>

      {recorderOpen || activeRecording ? (
        <aside
          className="intent-recorder-panel"
          data-intent-recorder-panel="true"
          aria-label="Intent recorder controls"
        >
          <div className="intent-recorder-panel-header">
            <div>
              <p className="eyebrow">Intent recorder</p>
              <strong>{activeRecording ? "Watching dashboard clicks" : "Ready"}</strong>
            </div>
            <button
              aria-label="Close recorder panel"
              disabled={Boolean(activeRecording)}
              onClick={() => setRecorderOpen(false)}
              type="button"
            >
              <X size={15} />
            </button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (activeRecording) return;
              start.mutate({
                name,
                description,
                source: "dashboard",
                countdownSeconds: 3,
              });
            }}
          >
            <label>
              Command name
              <input
                disabled={Boolean(activeRecording)}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
            <label>
              Description
              <textarea
                disabled={Boolean(activeRecording)}
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
            </label>
            <label>
              Objective for synthesis
              <textarea
                disabled={!activeRecording}
                onChange={(event) => setObjective(event.target.value)}
                placeholder="Example: Open the selected repository and prepare a status summary."
                value={objective}
              />
            </label>
            <div className="intent-recorder-status">
              <span className={activeRecording ? "live-dot" : "muted-dot"} />
              <span>
                {activeRecording
                  ? `${activeEvents.length} safe click/event(s) observed`
                  : "Not recording"}
              </span>
            </div>
            <div className="button-row">
              <button
                disabled={Boolean(activeRecording) || start.isPending}
                type="submit"
              >
                <Play size={14} /> Start
              </button>
              <button
                disabled={!activeRecording || stop.isPending}
                onClick={() => {
                  if (!activeRecording) return;
                  stop.mutate({
                    recordingId: activeRecording.id,
                    ...(objective.trim() ? { primaryObjective: objective.trim() } : {}),
                  });
                }}
                type="button"
              >
                <Square size={14} /> Stop
              </button>
              <button
                disabled={!activeRecording || record.isPending}
                onClick={addSemanticEvent}
                type="button"
              >
                Add safe event
              </button>
            </div>
          </form>
          {activeEvents.at(-1) ? (
            <small>Last seen: {activeEvents.at(-1)!.title}</small>
          ) : (
            <small>
              Click normal dashboard controls after Start. Text input contents are
              ignored.
            </small>
          )}
        </aside>
      ) : null}

      <div className="governance-grid">
        <section className="panel-list">
          <h2>
            <WandSparkles size={18} /> Recording Timeline
          </h2>
          {(activeEvents.length
            ? activeEvents
            : (studio.data?.events.slice(0, 8) ?? [])
          ).map((event) => (
            <article className="panel" key={event.id}>
              <div>
                <strong>
                  {event.sequence}. {event.title}
                </strong>
                <p>{event.semanticSummary}</p>
                <small>
                  {event.source} · {event.type} · raw input:{" "}
                  {event.rawInputCaptured ? "captured" : "blocked"}
                </small>
              </div>
              <span className="status-chip">{event.status}</span>
            </article>
          ))}
          {!studio.data?.events.length ? (
            <p>
              No semantic events recorded yet. Start recording, perform a governed
              action, or add a safe semantic event for testing.
            </p>
          ) : null}
        </section>

        <section className="panel-list">
          <h2>
            <LibraryBig size={18} /> Semantic Workflow Timeline
          </h2>
          {latestTimeline ? (
            <>
              <article className="panel">
                <div>
                  <strong>{latestTimeline.objective}</strong>
                  <p>
                    {latestTimeline.steps.length} semantic step(s) · coordinate playback
                    generated:{" "}
                    {latestTimeline.coordinatePlaybackGenerated ? "yes" : "no"}
                  </p>
                </div>
              </article>
              {latestTimeline.steps.slice(0, 8).map((step) => (
                <article className="panel" key={step.id}>
                  <div>
                    <strong>
                      {step.sequence}. {step.semanticAction}
                    </strong>
                    <p>{step.target}</p>
                    <small>
                      {step.capabilityId ?? "semantic metadata"} ·{" "}
                      {step.executionStatus}
                    </small>
                  </div>
                </article>
              ))}
            </>
          ) : (
            <p>Stop a recording to generate a semantic workflow timeline.</p>
          )}
        </section>

        <section className="panel-list">
          <h2>
            <LibraryBig size={18} /> Generated Command Review
          </h2>
          {latestGenerated ? (
            <article className="panel">
              <div>
                <strong>{latestGenerated.name}</strong>
                <p>{latestGenerated.requestTemplate}</p>
                <small>
                  Risk: {latestGenerated.riskLevel} · approval required:{" "}
                  {latestGenerated.approvalRequired ? "yes" : "no"} · status:{" "}
                  {latestGenerated.status}
                </small>
              </div>
              <button
                disabled={
                  latestGenerated.status !== "review_required" ||
                  save.isPending ||
                  (saveAsVoice && !voicePhrase.trim())
                }
                onClick={() => save.mutate()}
                type="button"
              >
                <Save size={14} /> Save
              </button>
            </article>
          ) : (
            <p>Stop a recording to synthesize the first reviewed command.</p>
          )}
          {latestGenerated?.status === "review_required" ? (
            <div className="voice-command-save-card">
              <label className="voice-command-toggle">
                <input
                  checked={saveAsVoice}
                  onChange={(event) => setSaveAsVoice(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <Mic2 size={14} /> Also save as voice command
                </span>
              </label>
              {saveAsVoice ? (
                <label>
                  Voice phrase
                  <input
                    onChange={(event) => setVoicePhrase(event.target.value)}
                    placeholder="Example: run my repo summary"
                    value={voicePhrase}
                  />
                </label>
              ) : null}
              <small>
                Voice shortcuts do not approve or execute privileged work by themselves;
                they submit the saved intent through governance.
              </small>
            </div>
          ) : null}
          {(studio.data?.parameters ?? []).slice(0, 8).map((parameter) => (
            <article className="panel" key={parameter.id}>
              <div>
                <strong>{parameter.label}</strong>
                <p>
                  {parameter.valueType} · {parameter.source} · required:{" "}
                  {parameter.required ? "yes" : "no"}
                </p>
              </div>
            </article>
          ))}
        </section>
      </div>

      <div className="governance-grid">
        <section className="panel-list">
          <h2>
            <Bot size={18} /> Skill Registry
          </h2>
          {latestSkill ? (
            <article className="panel">
              <div>
                <strong>{latestSkill.name}</strong>
                <p>{latestSkill.description}</p>
                <small>
                  {latestSkill.category} · status {latestSkill.status} · planner{" "}
                  {latestSkill.plannerAvailable ? "available" : "off until saved"}
                </small>
              </div>
              <div className="button-row">
                <button
                  disabled={
                    latestSkill.status !== "review_required" || saveSkill.isPending
                  }
                  onClick={() => saveSkill.mutate()}
                  type="button"
                >
                  <Save size={14} /> Save skill
                </button>
                <button
                  disabled={validateSkill.isPending}
                  onClick={() => validateSkill.mutate()}
                  type="button"
                >
                  Validate
                </button>
                <button
                  disabled={simulateSkill.isPending}
                  onClick={() => simulateSkill.mutate()}
                  type="button"
                >
                  Simulate
                </button>
                <button
                  disabled={editSkill.isPending}
                  onClick={() => editSkill.mutate()}
                  type="button"
                >
                  Add condition
                </button>
              </div>
            </article>
          ) : (
            <p>No demonstrated skills yet.</p>
          )}
          {skillParameters.slice(0, 6).map((parameter) => (
            <article className="panel" key={parameter.id}>
              <div>
                <strong>{parameter.label}</strong>
                <p>{parameter.description}</p>
                <small>
                  {parameter.valueType} · {parameter.source} · required{" "}
                  {parameter.required ? "yes" : "no"}
                </small>
              </div>
            </article>
          ))}
        </section>
        <section className="panel-list">
          <h2>
            <Bot size={18} /> Command Library Analytics
          </h2>
          {(studio.data?.analytics ?? []).slice(0, 6).map((metric) => (
            <article className="panel" key={metric.id}>
              <div>
                <strong>{Math.round(metric.successRate * 100)}% success rate</strong>
                <p>
                  Average duration {Math.round(metric.averageDurationMs)}ms · failures{" "}
                  {metric.failureCount}
                </p>
              </div>
            </article>
          ))}
          {workflowValidation.slice(0, 4).map((validation) => (
            <article className="panel" key={validation.id}>
              <div>
                <strong>Workflow validation: {validation.status}</strong>
                <p>
                  Targets {validation.targetCheck} · capabilities{" "}
                  {validation.capabilityCheck} · dependencies{" "}
                  {validation.dependencyCheck}
                </p>
                <small>{validation.warnings.join(" · ") || "No warnings"}</small>
              </div>
            </article>
          ))}
          {skillUsage.slice(0, 4).map((usage) => (
            <article className="panel" key={usage.id}>
              <div>
                <strong>Skill {usage.status}</strong>
                <p>
                  {usage.origin} · {usage.durationMs}ms · {usage.executedAt}
                </p>
              </div>
            </article>
          ))}
        </section>
        <section className="panel-list">
          <h2>Optimization Suggestions</h2>
          {(studio.data?.optimizationSuggestions ?? [])
            .slice(0, 6)
            .map((suggestion) => (
              <article className="panel" key={suggestion.id}>
                <div>
                  <strong>{suggestion.title}</strong>
                  <p>{suggestion.rationale}</p>
                  <small>
                    {suggestion.impact} impact ·{" "}
                    {Math.round(suggestion.confidence * 100)}% confidence · approval
                    required
                  </small>
                </div>
              </article>
            ))}
        </section>
      </div>
    </section>
  );
};
