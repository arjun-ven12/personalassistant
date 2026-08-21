import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  CircleStop,
  Mic,
  Play,
  Radio,
  ShieldCheck,
  Sparkles,
  Volume2,
  Waves,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { VoiceShortcutRecord } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";
import { usePersistentVoiceRuntime } from "./PersistentVoiceRuntime.js";

const shortcutDrafts = [
  {
    phrase: "open command center",
    intentTemplate: "Open the command center.",
  },
  {
    phrase: "show agents",
    intentTemplate: "Open the agent command center.",
  },
  {
    phrase: "show approvals",
    intentTemplate: "Open pending approvals.",
  },
  {
    phrase: "show tasks",
    intentTemplate: "Open the task center.",
  },
] as const;

export const VoicePage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const runtime = usePersistentVoiceRuntime();
  const [manualTranscript, setManualTranscript] = useState("");
  const voice = useQuery({
    queryKey: ["voice-dashboard"],
    queryFn: apiClient.getVoiceDashboard,
    refetchInterval: 10_000,
  });
  const shortcutMutation = useMutation({
    mutationFn: apiClient.upsertVoiceShortcut,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["voice-dashboard"] });
    },
  });
  const manualMutation = useMutation({
    mutationFn: async (transcript: string) =>
      runtime.submitTranscript(transcript, 0.99),
    onSuccess: async () => {
      setManualTranscript("");
      await queryClient.invalidateQueries({ queryKey: ["voice-dashboard"] });
    },
  });

  const shortcutsByPhrase = useMemo(() => {
    const map = new Map<string, VoiceShortcutRecord>();
    for (const shortcut of voice.data?.shortcuts ?? []) {
      map.set(shortcut.phrase.toLowerCase(), shortcut);
    }
    return map;
  }, [voice.data?.shortcuts]);

  return (
    <section className="voice-center">
      <div className="voice-hero">
        <div>
          <p className="eyebrow">Phase 15A · Voice Operating System</p>
          <h2>Conversational Runtime</h2>
          <p>
            Voice is a persistent input source. Microphone audio stays local by default;
            final transcripts become governed intents.
          </p>
        </div>
        <div className="voice-hero-actions">
          <button disabled={runtime.active} onClick={() => void runtime.start()}>
            <Play size={15} /> Start Listening
          </button>
          <button disabled={!runtime.active} onClick={runtime.pause}>
            <Radio size={15} /> Pause
          </button>
          <button disabled={!runtime.active && !runtime.paused} onClick={runtime.stop}>
            <CircleStop size={15} /> Stop
          </button>
        </div>
      </div>

      <div className="voice-grid">
        <article className="hud-card">
          <div className="hud-card-corners" />
          <p className="eyebrow">
            <Mic size={13} /> Runtime
          </p>
          <h3>{runtime.frame.state.replaceAll("_", " ")}</h3>
          <p>{runtime.runtimeError ?? runtime.frame.message}</p>
        </article>
        <article className="hud-card">
          <div className="hud-card-corners" />
          <p className="eyebrow">
            <Waves size={13} /> Transcript
          </p>
          <h3>{runtime.frame.transcript || runtime.frame.finalTranscript || "Idle"}</h3>
          <p>Confidence {Math.round(runtime.frame.confidence * 100)}%</p>
        </article>
        <article className="hud-card">
          <div className="hud-card-corners" />
          <p className="eyebrow">
            <ShieldCheck size={13} /> Security
          </p>
          <h3>Governed</h3>
          <p>Voice cannot authenticate, approve, or bypass policy.</p>
        </article>
      </div>

      <div className="voice-lab-layout">
        <section className="glass-panel">
          <p className="eyebrow">Manual transcript test</p>
          <h3>Route a transcript through the same voice path</h3>
          <form
            className="voice-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (manualTranscript.trim()) {
                manualMutation.mutate(manualTranscript.trim());
              }
            }}
          >
            <input
              value={manualTranscript}
              onChange={(event) => setManualTranscript(event.target.value)}
              placeholder='Try: "open command center"'
            />
            <button disabled={manualMutation.isPending} type="submit">
              <Bot size={14} /> Submit as voice
            </button>
          </form>
          <p>
            This test sends transcript metadata only. It does not upload microphone
            audio.
          </p>
        </section>

        <section className="glass-panel">
          <p className="eyebrow">Voice shortcuts</p>
          <h3>Phrase → governed intent</h3>
          <div className="voice-shortcut-list">
            {shortcutDrafts.map((draft) => {
              const existing = shortcutsByPhrase.get(draft.phrase);
              return (
                <button
                  className={existing?.enabled ? "voice-shortcut-active" : undefined}
                  key={draft.phrase}
                  onClick={() =>
                    shortcutMutation.mutate({
                      id: existing?.id,
                      phrase: draft.phrase,
                      intentTemplate: draft.intentTemplate,
                      enabled: !(existing?.enabled ?? false),
                      safetyLevel: "low_risk",
                      approvalRequired: false,
                    })
                  }
                  type="button"
                >
                  <Sparkles size={14} />
                  <span>{draft.phrase}</span>
                  <small>{existing?.enabled ? "enabled" : "disabled"}</small>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <section className="glass-panel">
        <p className="eyebrow">
          <Activity size={13} /> Conversation timeline
        </p>
        <div className="voice-timeline">
          {(voice.data?.conversationHistory ?? []).slice(0, 12).map((entry) => (
            <article key={entry.id}>
              <strong>{entry.transcript}</strong>
              <span>
                {entry.responseSource === "PRECODED"
                  ? "pre-coded"
                  : entry.responseSource.toLowerCase()} ·{" "}
                {entry.intentCreated ? "intent routed" : "response only"} ·{" "}
                {Math.round(entry.confidence * 100)}%
              </span>
            </article>
          ))}
          {!voice.data?.conversationHistory.length ? (
            <p>No voice conversations recorded yet.</p>
          ) : null}
        </div>
      </section>

      <section className="voice-grid">
        <article className="hud-card">
          <p className="eyebrow">
            <Volume2 size={13} /> TTS
          </p>
          <h3>{runtime.panelState.ttsEnabled ? "Enabled" : "Muted"}</h3>
          <p>Uses browser speech synthesis when available.</p>
        </article>
        <article className="hud-card">
          <p className="eyebrow">Wake word</p>
          <h3>{voice.data?.wakeWordSettings[0]?.wakeWords.join(", ") ?? "Alexa"}</h3>
          <p>Wake word activates listening only; commands still route to Intent.</p>
        </article>
        <article className="hud-card">
          <p className="eyebrow">Raw audio</p>
          <h3>Not persisted</h3>
          <p>Camera/microphone-style raw data stays local by default.</p>
        </article>
      </section>
    </section>
  );
};
