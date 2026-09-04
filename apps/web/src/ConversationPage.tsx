import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bookmark,
  BrainCircuit,
  GitBranch,
  HelpCircle,
  History,
  MessageCircle,
  Network,
  Search,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";

import type { ConversationPersonaRecord } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";

const personaTemplates: Array<
  Pick<
    ConversationPersonaRecord,
    | "name"
    | "mode"
    | "vocabulary"
    | "sentenceLength"
    | "humor"
    | "formality"
    | "questionStyle"
    | "prosody"
  >
> = [
  {
    name: "Engineer",
    mode: "engineer",
    vocabulary: "technical",
    sentenceLength: "medium",
    humor: "light",
    formality: "balanced",
    questionStyle: "direct",
    prosody: "focused",
  },
  {
    name: "Teacher",
    mode: "teacher",
    vocabulary: "teaching",
    sentenceLength: "detailed",
    humor: "warm",
    formality: "balanced",
    questionStyle: "guided",
    prosody: "encouraging",
  },
  {
    name: "Concise",
    mode: "concise",
    vocabulary: "plain",
    sentenceLength: "short",
    humor: "none",
    formality: "casual",
    questionStyle: "direct",
    prosody: "neutral",
  },
];

export const ConversationPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [routeFilter, setRouteFilter] = useState("ALL");
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const conversation = useQuery({
    queryKey: ["conversation-center"],
    queryFn: apiClient.getConversationCenter,
    refetchInterval: 10_000,
  });
  const personaMutation = useMutation({
    mutationFn: apiClient.upsertConversationPersona,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["conversation-center"] });
      await queryClient.invalidateQueries({ queryKey: ["voice-dashboard"] });
    },
  });
  const bookmarkMutation = useMutation({
    mutationFn: apiClient.createConversationBookmark,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["conversation-center"] });
    },
  });
  const feedbackMutation = useMutation({
    mutationFn: (input: {
      turnId: string;
      kind: "CORRECT" | "WRONG_ROUTE" | "WRONG_ANSWER" | "MISSING_CONTEXT";
    }) =>
      apiClient.recordConversationTurnFeedback(input.turnId, {
        kind: input.kind,
        note: null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["conversation-center"] });
    },
  });
  const replayMutation = useMutation({
    mutationFn: (input: { turnId: string; route: "DETERMINISTIC" | "GEMMA" | "GPT" }) =>
      apiClient.replayConversationTurn(input.turnId, input.route),
  });
  const activeSession =
    conversation.data?.sessions.find(
      (session) => session.lifecycleState !== "archived",
    ) ?? conversation.data?.sessions[0];
  const filteredHistory = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (conversation.data?.history ?? []).filter((turn) => {
      const matchesText =
        !needle ||
        turn.transcript.toLowerCase().includes(needle) ||
        turn.responseText?.toLowerCase().includes(needle) ||
        turn.responseModelId?.toLowerCase().includes(needle);
      const matchesRoute =
        routeFilter === "ALL" ||
        turn.routeStages.includes(routeFilter as (typeof turn.routeStages)[number]) ||
        turn.classification === routeFilter ||
        turn.responseSource === routeFilter;
      return Boolean(matchesText && matchesRoute);
    });
  }, [conversation.data?.history, routeFilter, search]);
  const selectedTurn = conversation.data?.history.find(
    (turn) => turn.id === selectedTurnId,
  );
  const activeContinuity = activeSession
    ? conversation.data?.continuity.find(
        (record) => record.conversationId === activeSession.id,
      )
    : null;
  const contextQuery = new URLSearchParams(window.location.search);
  const attachedContext =
    contextQuery.get("contextId") && contextQuery.get("contextKind")
      ? {
          id: contextQuery.get("contextId")!,
          kind: contextQuery.get("contextKind")!,
          label: contextQuery.get("contextLabel") ?? "Selected entity",
        }
      : null;

  return (
    <section className="voice-center conversation-center">
      {attachedContext ? (
        <section className="conversation-attached-context">
          <div>
            <p className="eyebrow">Structured context attached</p>
            <h3>{attachedContext.label}</h3>
            <span>
              {attachedContext.kind} · {attachedContext.id}
            </span>
          </div>
          <div>
            <strong>Ask Athena</strong>
            <span>Try: Why is this behind? What is blocked? What happens next?</span>
          </div>
        </section>
      ) : null}
      <div className="voice-hero">
        <div>
          <p className="eyebrow">Phase 15B · Conversational Intelligence</p>
          <h2>Conversation Center</h2>
          <p>
            Tracks topics, goals, clarifications, summaries, personas, and
            conversational context while keeping all actions routed through governed
            intent planning.
          </p>
        </div>
        <div className="voice-hero-actions">
          {activeSession ? (
            <button
              disabled={bookmarkMutation.isPending}
              onClick={() =>
                bookmarkMutation.mutate({
                  conversationId: activeSession.id,
                  label: "Current conversation",
                  note: "Owner-created bookmark for the active conversational context.",
                })
              }
              type="button"
            >
              <Bookmark size={15} /> Bookmark
            </button>
          ) : null}
        </div>
      </div>

      <div className="voice-grid">
        <article className="hud-card">
          <p className="eyebrow">
            <MessageCircle size={13} /> Active conversations
          </p>
          <h3>{conversation.data?.sessions.length ?? 0}</h3>
          <p>{activeSession?.lifecycleState ?? "idle"}</p>
        </article>
        <article className="hud-card">
          <p className="eyebrow">
            <HelpCircle size={13} /> Open clarifications
          </p>
          <h3>
            {conversation.data?.clarifications.filter((item) => item.status === "open")
              .length ?? 0}
          </h3>
          <p>Ambiguous requests ask a question instead of guessing.</p>
        </article>
        <article className="hud-card">
          <p className="eyebrow">
            <Network size={13} /> Routed intents
          </p>
          <h3>{conversation.data?.analytics[0]?.routedIntentCount ?? 0}</h3>
          <p>No conversational path bypasses the Intent Engine.</p>
        </article>
      </div>

      <section className="glass-panel">
        <p className="eyebrow">
          <History size={13} /> Conversation routing history
        </p>
        <div className="conversation-history-tools">
          <label>
            <Search size={15} aria-hidden="true" />
            <input
              aria-label="Search conversation history"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search turns"
              type="search"
              value={search}
            />
          </label>
          <select
            aria-label="Filter conversation route"
            onChange={(event) => setRouteFilter(event.target.value)}
            value={routeFilter}
          >
            <option value="ALL">All routes</option>
            <option value="PRECODED">Pre-coded</option>
            <option value="GEMMA">Gemma</option>
            <option value="GPT">GPT</option>
            <option value="ACTION">Actions</option>
            <option value="CLARIFY">Clarifications</option>
            <option value="NON_EXECUTION">Non-execution</option>
          </select>
        </div>
        <div className="voice-timeline">
          {filteredHistory.slice(0, 100).map((entry) => (
            <article
              className={
                selectedTurnId === entry.id ? "conversation-turn-selected" : undefined
              }
              key={entry.id}
              onClick={() => setSelectedTurnId(entry.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ")
                  setSelectedTurnId(entry.id);
              }}
              role="button"
              tabIndex={0}
            >
              <strong>{entry.transcript}</strong>
              {entry.responseText ? <p>{entry.responseText}</p> : null}
              <span>
                {entry.responseSource === "PRECODED"
                  ? "Pre-coded"
                  : entry.responseSource === "GEMMA"
                    ? `Gemma${entry.responseModelId ? ` · ${entry.responseModelId}` : ""}`
                    : `GPT${entry.responseModelId ? ` · ${entry.responseModelId}` : ""}`}
                {entry.intentCreated ? " · governed intent routed" : " · response only"}
                {entry.classification ? ` · ${entry.classification.toLowerCase()}` : ""}
                {` · ${entry.latencyMs} ms`}
              </span>
              <span>{entry.routeStages.join(" → ")}</span>
            </article>
          ))}
          {!conversation.data?.history.length ? (
            <p>No conversation turns have been recorded yet.</p>
          ) : null}
        </div>
      </section>

      <details className="advanced-panel conversation-continuity-inspector">
        <summary>Advanced conversation state</summary>
        <div className="advanced-panel-body">
          {activeContinuity ? (
            <dl className="conversation-inspector-grid">
              <div>
                <dt>Conversation</dt>
                <dd>{activeContinuity.conversationId}</dd>
              </div>
              <div>
                <dt>Device</dt>
                <dd>{activeContinuity.deviceId ?? "No device bound"}</dd>
              </div>
              <div>
                <dt>Topic</dt>
                <dd>{activeContinuity.topic ?? "No active topic"}</dd>
              </div>
              <div>
                <dt>Resolution</dt>
                <dd>
                  {activeContinuity.resolutionPath.join(" → ") || "No resolution yet"}
                </dd>
              </div>
              <div>
                <dt>Last turn</dt>
                <dd>
                  {activeContinuity.processedTurns[0]?.turnId ?? "No processed turn"}
                </dd>
              </div>
              <div>
                <dt>Pending intent</dt>
                <dd>
                  {activeContinuity.pendingIntent
                    ? `${activeContinuity.pendingIntent.canonicalIntent} · ${activeContinuity.pendingIntent.status}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Missing information</dt>
                <dd>
                  {activeContinuity.pendingIntent?.missingSlots.join(", ") || "None"}
                </dd>
              </div>
              <div>
                <dt>Resolved information</dt>
                <dd>
                  {activeContinuity.pendingIntent
                    ? Object.entries(activeContinuity.pendingIntent.resolvedSlots)
                        .map(([key, value]) => {
                          const displayValue =
                            typeof value === "string" ||
                            typeof value === "number" ||
                            typeof value === "boolean"
                              ? String(value)
                              : (JSON.stringify(value) ?? "structured value");
                          return `${key}: ${displayValue}`;
                        })
                        .join(", ") || "None"
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Pending expiry</dt>
                <dd>{activeContinuity.pendingIntent?.expiresAt ?? "None"}</dd>
              </div>
              <div>
                <dt>Action proposal</dt>
                <dd>
                  {activeContinuity.actionProposal
                    ? `${activeContinuity.actionProposal.canonicalIntent} · ${activeContinuity.actionProposal.status}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Proposal expiry</dt>
                <dd>{activeContinuity.actionProposal?.expiresAt ?? "None"}</dd>
              </div>
              <div>
                <dt>Recent references</dt>
                <dd>
                  {activeContinuity.references
                    .slice(0, 5)
                    .map(
                      (reference) =>
                        `${reference.label} (${reference.source}, ${Math.round(reference.confidence * 100)}%)`,
                    )
                    .join(", ") || "None"}
                </dd>
              </div>
            </dl>
          ) : (
            <p>No active structured continuity state.</p>
          )}
        </div>
      </details>

      {selectedTurn ? (
        <section className="glass-panel conversation-turn-inspector">
          <div className="conversation-inspector-heading">
            <div>
              <p className="eyebrow">Turn inspector</p>
              <h3>{selectedTurn.classification ?? "Legacy turn"}</h3>
            </div>
            <button
              aria-label="Close turn inspector"
              onClick={() => setSelectedTurnId(null)}
              title="Close"
              type="button"
            >
              <X size={16} />
            </button>
          </div>
          <dl className="conversation-inspector-grid">
            <div>
              <dt>Speech act</dt>
              <dd>{selectedTurn.speechAct ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Route</dt>
              <dd>{selectedTurn.routeStages.join(" → ")}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{selectedTurn.responseProviderId ?? "Deterministic"}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{selectedTurn.responseModelId ?? "None"}</dd>
            </div>
            <div>
              <dt>Latency</dt>
              <dd>{selectedTurn.latencyMs} ms</dd>
            </div>
            <div>
              <dt>Tokens</dt>
              <dd>{selectedTurn.tokenUsage?.totalTokens ?? "Not reported"}</dd>
            </div>
            <div>
              <dt>Cost</dt>
              <dd>
                {selectedTurn.costUsd === null
                  ? "Not reported"
                  : `$${selectedTurn.costUsd}`}
              </dd>
            </div>
            <div>
              <dt>Reservation</dt>
              <dd>{selectedTurn.economicReservationId ?? "None"}</dd>
            </div>
            <div>
              <dt>Execution</dt>
              <dd>{selectedTurn.executionStatus}</dd>
            </div>
            <div>
              <dt>Page chunks</dt>
              <dd>{selectedTurn.pageChunkCount}</dd>
            </div>
            <div>
              <dt>Memory items</dt>
              <dd>{selectedTurn.memoryItemCount}</dd>
            </div>
          </dl>
          <p>
            <strong>Transcript:</strong> {selectedTurn.transcript}
          </p>
          <p>
            <strong>Response:</strong> {selectedTurn.responseText ?? "No response"}
          </p>
          <p>
            <strong>Safety:</strong> {selectedTurn.safeExplanation ?? "Legacy turn"}
          </p>
          {selectedTurn.activeContext ? (
            <p>
              <strong>Active context:</strong>{" "}
              {selectedTurn.activeContext.documentTitle ??
                selectedTurn.activeContext.applicationName}
              {selectedTurn.contextReferences.some(
                (item) => item.source === "SELECTION",
              )
                ? " · selection used transiently"
                : ""}
            </p>
          ) : null}
          <p>
            <strong>Context sources:</strong>{" "}
            {selectedTurn.contextReferences.map((item) => item.source).join(", ") ||
              "None"}
          </p>
          <div className="conversation-feedback-actions">
            <button
              disabled={feedbackMutation.isPending}
              onClick={() =>
                feedbackMutation.mutate({ turnId: selectedTurn.id, kind: "CORRECT" })
              }
              title="Mark correct"
              type="button"
            >
              <ThumbsUp size={15} /> Correct
            </button>
            <button
              disabled={feedbackMutation.isPending}
              onClick={() =>
                feedbackMutation.mutate({
                  turnId: selectedTurn.id,
                  kind: "WRONG_ROUTE",
                })
              }
              type="button"
            >
              <ThumbsDown size={15} /> Wrong route
            </button>
            <button
              disabled={feedbackMutation.isPending}
              onClick={() =>
                feedbackMutation.mutate({
                  turnId: selectedTurn.id,
                  kind: "WRONG_ANSWER",
                })
              }
              type="button"
            >
              Wrong answer
            </button>
            <button
              disabled={feedbackMutation.isPending}
              onClick={() =>
                feedbackMutation.mutate({
                  turnId: selectedTurn.id,
                  kind: "MISSING_CONTEXT",
                })
              }
              type="button"
            >
              Missing context
            </button>
          </div>
          <div
            className="conversation-replay-controls"
            role="group"
            aria-label="Dry-run replay route"
          >
            {(["DETERMINISTIC", "GEMMA", "GPT"] as const).map((route) => (
              <button
                disabled={replayMutation.isPending}
                key={route}
                onClick={() =>
                  replayMutation.mutate({ turnId: selectedTurn.id, route })
                }
                type="button"
              >
                {route}
              </button>
            ))}
          </div>
          {replayMutation.data?.turnId === selectedTurn.id ? (
            <p>
              <strong>Dry-run replay:</strong> {replayMutation.data.route} ·{" "}
              {replayMutation.data.classification} · {replayMutation.data.execution}
              {replayMutation.data.responseText
                ? ` · ${replayMutation.data.responseText}`
                : ""}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="voice-lab-layout">
        <section className="glass-panel">
          <p className="eyebrow">
            <BrainCircuit size={13} /> Personality profiles
          </p>
          <h3>Adaptive dialogue style</h3>
          <div className="voice-shortcut-list">
            {personaTemplates.map((template) => {
              const active = conversation.data?.personas.find(
                (persona) => persona.active && persona.mode === template.mode,
              );
              return (
                <button
                  className={active ? "voice-shortcut-active" : undefined}
                  disabled={personaMutation.isPending}
                  key={template.mode}
                  onClick={() =>
                    personaMutation.mutate({
                      ...template,
                      active: true,
                    })
                  }
                  type="button"
                >
                  <Sparkles size={14} />
                  <span>{template.name}</span>
                  <small>{active ? "active" : template.prosody}</small>
                </button>
              );
            })}
          </div>
        </section>

        <section className="glass-panel">
          <p className="eyebrow">
            <GitBranch size={13} /> Goals & topics
          </p>
          <div className="voice-timeline">
            {(conversation.data?.goals ?? []).slice(0, 5).map((goal) => (
              <article key={goal.id}>
                <strong>{goal.goal}</strong>
                <span>{goal.status}</span>
              </article>
            ))}
            {(conversation.data?.topics ?? []).slice(0, 5).map((topic) => (
              <article key={topic.id}>
                <strong>{topic.title}</strong>
                <span>{Math.round(topic.confidence * 100)}%</span>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="glass-panel">
        <p className="eyebrow">Clarifications</p>
        <div className="voice-timeline">
          {(conversation.data?.clarifications ?? []).slice(0, 10).map((item) => (
            <article key={item.id}>
              <strong>{item.question}</strong>
              <span>{item.status}</span>
            </article>
          ))}
          {!conversation.data?.clarifications.length ? (
            <p>No clarification requests yet.</p>
          ) : null}
        </div>
      </section>

      <section className="glass-panel">
        <p className="eyebrow">Conversation summaries</p>
        <div className="voice-timeline">
          {(conversation.data?.summaries ?? []).slice(0, 8).map((summary) => (
            <article key={summary.id}>
              <strong>{summary.summary}</strong>
              <span>{summary.summaryType}</span>
            </article>
          ))}
          {!conversation.data?.summaries.length ? (
            <p>Summaries appear after enough conversational turns are recorded.</p>
          ) : null}
        </div>
      </section>
    </section>
  );
};
