import { useCallback, useEffect, useRef, useState } from "react";
import type { ActiveContext } from "@alexa-control/shared";

import type { VoiceOverlayState } from "../electron/contracts.js";
import {
  BrowserTTSProvider,
  WhisperCppSTTProvider,
  type STTProvider,
} from "./voiceProviders.js";
import {
  LocalVoiceTransport,
  type VoiceInputHandlers,
  type VoiceTransport,
} from "./voiceTransport.js";
import { isLikelyPlaybackEcho } from "./voiceEcho.js";

const stateLabel: Record<VoiceOverlayState, string> = {
  collapsed: "IDLE",
  listening: "LISTENING",
  transcribing: "TRANSCRIBING",
  thinking: "THINKING",
  speaking: "SPEAKING",
  reconnecting: "RECONNECTING",
  error: "ERROR",
};

export const VoiceOverlay = () => {
  const sttRef = useRef<STTProvider | null>(null);
  const ttsRef = useRef(new BrowserTTSProvider());
  const transportRef = useRef<VoiceTransport | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const activeTurnRef = useRef<string | null>(null);
  const leaseHeartbeatRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  const stateRef = useRef<VoiceOverlayState>("collapsed");
  const playbackTextRef = useRef("");
  const playbackEndedAtRef = useRef(0);
  const acceptedBargeInRef = useRef(false);
  const inputHandlersRef = useRef<VoiceInputHandlers | null>(null);
  const inputSuspendedForPlaybackRef = useRef(false);
  const [state, setState] = useState<VoiceOverlayState>("collapsed");
  const [interim, setInterim] = useState("");
  const [response, setResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [sttStatus, setSttStatus] = useState<"starting" | "ready" | "error">("starting");
  const [sttProvider, setSttProvider] = useState("whisper.cpp");
  const [audioLevel, setAudioLevel] = useState(0);
  const [speechActivity, setSpeechActivity] = useState(false);
  const [activeContext, setActiveContext] = useState<ActiveContext | null>(null);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);

  const updateState = useCallback((next: VoiceOverlayState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const clearLeaseHeartbeat = useCallback(() => {
    if (leaseHeartbeatRef.current !== null)
      window.clearInterval(leaseHeartbeatRef.current);
    leaseHeartbeatRef.current = null;
  }, []);

  const releaseCaptureLease = useCallback(async () => {
    clearLeaseHeartbeat();
    const voiceSessionId = sessionIdRef.current;
    if (!voiceSessionId) return;
    try {
      await window.alexaAgent.manageOverlayVoiceCaptureLease({
        operation: "capture_lease",
        action: "release",
        voiceSessionId,
      });
    } finally {
      sessionIdRef.current = null;
    }
  }, [clearLeaseHeartbeat]);

  const resumeInputAfterPlayback = useCallback(async () => {
    if (!inputSuspendedForPlaybackRef.current) return;
    inputSuspendedForPlaybackRef.current = false;
    const transport = transportRef.current;
    const handlers = inputHandlersRef.current;
    if (!transport || !handlers || stateRef.current === "collapsed") return;
    try {
      setSttStatus("starting");
      await transport.startInput(handlers);
      setSttStatus("ready");
      updateState("listening");
    } catch (cause) {
      setSttStatus("error");
      setError(
        cause instanceof Error ? cause.message : "Desktop speech recognition could not resume.",
      );
      updateState("error");
    }
  }, [updateState]);

  const stopPlayback = useCallback(() => {
    void (transportRef.current?.stopPlayback() ?? Promise.resolve());
    playbackEndedAtRef.current = Date.now();
    void resumeInputAfterPlayback();
  }, [resumeInputAfterPlayback]);

  const shouldSuppressPlaybackEcho = useCallback((transcript: string) => {
    if (acceptedBargeInRef.current) return false;
    const playbackIsActive = stateRef.current === "speaking";
    const playbackJustEnded = Date.now() - playbackEndedAtRef.current < 1_500;
    return (
      (playbackIsActive || playbackJustEnded) &&
      isLikelyPlaybackEcho(transcript, playbackTextRef.current)
    );
  }, []);

  const cancelCurrentTurn = useCallback(
    async (reason: "barge_in" | "owner_stop" | "transport_disconnect") => {
      const turnId = activeTurnRef.current;
      if (!turnId) return;
      activeTurnRef.current = null;
      await window.alexaAgent.cancelOverlayVoiceTurn({
        operation: "cancel_turn",
        turnId,
        sessionId: sessionIdRef.current,
        reason,
      });
    },
    [],
  );

  const speak = useCallback(
    (text: string) => {
      if (!ttsEnabled) {
        updateState("listening");
        return;
      }
      playbackTextRef.current = text;
      playbackEndedAtRef.current = 0;
      acceptedBargeInRef.current = false;
      const transport = transportRef.current;
      inputSuspendedForPlaybackRef.current = true;
      setAudioLevel(0);
      void (transport?.stopInput() ?? Promise.resolve()).then(() => {
        ttsRef.current.speak(text, {
          onStart: () => updateState("speaking"),
          onEnd: () => {
            playbackEndedAtRef.current = Date.now();
            void resumeInputAfterPlayback();
          },
          onError: (message) => {
            setError(`Text-to-speech error: ${message}`);
            void resumeInputAfterPlayback();
          },
        });
      });
    },
    [resumeInputAfterPlayback, ttsEnabled, updateState],
  );

  const submitFinalTranscript = useCallback(
    async (text: string, confidence: number) => {
      const transcript = text.trim();
      if (!transcript) return;
      if (shouldSuppressPlaybackEcho(transcript)) return;
      acceptedBargeInRef.current = false;
      const normalized = transcript.toLowerCase().replace(/[.!?]/g, "").trim();
      if (normalized === "shut up") {
        stopPlayback();
        return;
      }
      if (normalized === "stop listening") {
        stopPlayback();
        await transportRef.current?.stopInput();
        await releaseCaptureLease();
        updateState("collapsed");
        return;
      }
      if (stateRef.current === "speaking" || stateRef.current === "thinking") {
        stopPlayback();
        await cancelCurrentTurn("barge_in");
      }
      const turnId = crypto.randomUUID();
      activeTurnRef.current = turnId;
      setPendingApprovalId(null);
      updateState("thinking");
      setInterim(transcript);
      try {
        const result = await window.alexaAgent.submitOverlayVoiceTranscript({
          operation: "submit_transcript",
          transcript: {
            sessionId: sessionIdRef.current,
            turnId,
            transcript,
            confidence,
            isFinal: true,
            language: "en-US",
            wakeWordDetected: true,
            source: "electron",
          },
        });
        if (activeTurnRef.current !== turnId) return;
        activeTurnRef.current = null;
        const nextResponse = result.responseText?.trim() || "I heard you.";
        setPendingApprovalId(result.approvalRequestId);
        setResponse(nextResponse);
        speak(nextResponse);
      } catch (cause) {
        if (activeTurnRef.current !== turnId) return;
        activeTurnRef.current = null;
        setError(cause instanceof Error ? cause.message : "Voice request failed.");
        updateState("error");
      }
    },
    [cancelCurrentTurn, releaseCaptureLease, shouldSuppressPlaybackEcho, speak, stopPlayback, updateState],
  );

  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setError(null);
    try {
      const dashboard = await window.alexaAgent.startOverlayVoiceSession();
      sessionIdRef.current ??= dashboard.sessions[0]?.id ?? null;
      const activeProfile = dashboard.profiles.find((profile) => profile.active);
      if (activeProfile) {
        const ttsProfile = dashboard.ttsProfiles.find(
          (profile) => profile.profileId === activeProfile.id,
        );
        ttsRef.current.configure({
          voiceName: ttsProfile?.voiceName ?? activeProfile.ttsVoice,
          language: activeProfile.sttLanguage,
          rate: ttsProfile?.speakingRate ?? activeProfile.ttsRate,
          pitch: ttsProfile?.pitch ?? activeProfile.ttsPitch,
          volume: ttsProfile?.volume ?? activeProfile.ttsVolume,
        });
      }
      const voiceSessionId = sessionIdRef.current;
      if (!voiceSessionId) throw new Error("Voice session was not created.");
      const lease = await window.alexaAgent.manageOverlayVoiceCaptureLease({
        operation: "capture_lease",
        action: "takeover",
        voiceSessionId,
      });
      if (lease.status !== "ACQUIRED") {
        throw new Error(
          lease.owner === "WEB"
            ? "Voice is currently active in the web app."
            : "Voice capture is already active on this device.",
        );
      }
      clearLeaseHeartbeat();
      leaseHeartbeatRef.current = window.setInterval(() => {
        void window.alexaAgent
          .manageOverlayVoiceCaptureLease({
            operation: "capture_lease",
            action: "heartbeat",
            voiceSessionId,
          })
          .then((result) => {
            if (result.status === "ACQUIRED") return;
            void transportRef.current?.disconnect();
            setError("Voice capture ownership changed.");
            updateState("error");
          })
          .catch(() => {
            void transportRef.current?.disconnect();
            setError("Voice capture connection was interrupted. Try Start again.");
            updateState("error");
          });
      }, 1_000);
      sttRef.current?.stop();
      setSttStatus("starting");
      setAudioLevel(0);
      setSpeechActivity(false);
      const stt = new WhisperCppSTTProvider();
      sttRef.current = stt;
      const transport = new LocalVoiceTransport(stt, ttsRef.current);
      transportRef.current = transport;
      await transport.connect();
      const inputHandlers: VoiceInputHandlers = {
        onReady: (providerId) => {
          setSttStatus("ready");
          setSttProvider(providerId === "apple_speech" ? "Apple Speech" : "whisper.cpp");
        },
        onAudioLevel: (level) => {
          setAudioLevel(level);
          if (level >= 0.08) {
            setSpeechActivity(true);
            window.setTimeout(() => setSpeechActivity(false), 900);
          }
        },
        onInterim: (transcript) => {
          setSpeechActivity(false);
          if (stateRef.current === "speaking" || stateRef.current === "thinking") {
            if (shouldSuppressPlaybackEcho(transcript)) return;
            acceptedBargeInRef.current = true;
            stopPlayback();
            void cancelCurrentTurn("barge_in");
          }
          setInterim(transcript);
          if (stateRef.current !== "thinking") updateState("listening");
        },
        onFinal: (transcript, confidence) => {
          setSpeechActivity(false);
          void submitFinalTranscript(transcript, confidence);
        },
        onError: (message) => {
          setSttStatus("error");
          void transportRef.current?.disconnect();
          void releaseCaptureLease();
          setError(message);
          updateState("error");
        },
      };
      inputHandlersRef.current = inputHandlers;
      await transport.startInput(inputHandlers);
      updateState("listening");
    } catch (cause) {
      setSttStatus("error");
      await releaseCaptureLease();
      setError(
        cause instanceof Error ? cause.message : "Microphone permission is required.",
      );
      updateState("error");
    } finally {
      startingRef.current = false;
    }
  }, [
    cancelCurrentTurn,
    clearLeaseHeartbeat,
    releaseCaptureLease,
    shouldSuppressPlaybackEcho,
    stopPlayback,
    submitFinalTranscript,
    updateState,
  ]);

  const stopListening = useCallback(async () => {
    inputSuspendedForPlaybackRef.current = false;
    inputHandlersRef.current = null;
    stopPlayback();
    await cancelCurrentTurn("owner_stop");
    await transportRef.current?.disconnect();
    transportRef.current = null;
    sttRef.current?.stop();
    sttRef.current = null;
    await releaseCaptureLease();
    updateState("collapsed");
  }, [cancelCurrentTurn, releaseCaptureLease, stopPlayback, updateState]);

  const hideOverlay = useCallback(async () => {
    await window.alexaAgent.hideVoiceOverlay();
  }, []);

  useEffect(() => {
    const tts = ttsRef.current;
    const unsubscribe = window.alexaAgent.onVoiceOverlayActivation(() => {
      void start();
    });
    // The first global shortcut creates the overlay window. Start on mount as
    // well so that early main-process activation events cannot be lost before
    // the renderer subscription is ready.
    void start();
    return () => {
      unsubscribe();
      void releaseCaptureLease();
      void transportRef.current?.disconnect();
      transportRef.current = null;
      sttRef.current = null;
      tts.stop();
    };
  }, [releaseCaptureLease, start]);

  useEffect(() => {
    let mounted = true;
    void window.alexaAgent.getActiveContext().then((result) => {
      if (mounted) setActiveContext(result.context);
    });
    const unsubscribe = window.alexaAgent.onActiveContextChanged((result) => {
      setActiveContext(result.context);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const active = state !== "collapsed" && state !== "error";

  return (
    <main
      className={`voice-overlay voice-overlay-${state} ${expanded ? "voice-overlay-expanded" : ""}`}
    >
      <header className="voice-overlay-header">
        <div className="voice-overlay-drag" aria-label="Move Alexa overlay">
          <span className="voice-overlay-accent" aria-hidden="true" />
          <strong>Voice Runtime</strong>
        </div>
        <button
          aria-expanded={expanded}
          className="voice-overlay-collapse"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? "v" : "^"}
        </button>
      </header>
      {expanded ? (
        <>
          <section className="voice-overlay-status" aria-live="polite">
            <span className="voice-overlay-state-chip">
              <span className="voice-overlay-dot" aria-hidden="true" />
              {stateLabel[state]}
            </span>
            <strong>
              {interim ||
                (speechActivity && state === "listening"
                  ? "Hearing audio..."
                  : state === "collapsed"
                    ? "Voice OS"
                    : "Alexa")}
            </strong>
            <p>
              {error ??
                response ??
                (speechActivity && state === "listening"
                  ? "Waiting for speech recognition words."
                  : "Say “Alexa” then a command.")}
            </p>
          </section>
          <div className="voice-overlay-metrics" aria-label="Voice runtime status">
            <span>
              Mic <b>{sttStatus === "ready" ? "ready" : sttStatus}</b>
            </span>
            <span>
              Voice <b>{sttStatus === "ready" ? `${Math.round(audioLevel * 100)}%` : "--"}</b>
            </span>
            <span>
              STT <b>{sttStatus === "ready" ? sttProvider : "waiting"}</b>
            </span>
            <span>
              TTS <b>{ttsEnabled ? "ready" : "off"}</b>
            </span>
          </div>
          <div className="voice-overlay-controls">
            <button disabled={active} onClick={() => void start()} type="button">
              Start
            </button>
            <button
              disabled={!active}
              onClick={() => void stopListening()}
              type="button"
            >
              Stop
            </button>
            <button
              className={ttsEnabled ? "voice-overlay-toggle-active" : ""}
              onClick={() => setTtsEnabled((current) => !current)}
              type="button"
            >
              TTS
            </button>
            <button
              className="voice-overlay-stop-speaking"
              onClick={stopPlayback}
              type="button"
            >
              Stop speaking
            </button>
          </div>
          <section
            className="voice-overlay-context"
            aria-label="Active desktop context"
          >
            <span>Current context</span>
            <strong>
              {activeContext?.contextSummary ?? "No trusted application context"}
            </strong>
            {activeContext?.status === "DEGRADED" ? (
              <small>
                Identity only. Grant Alexa Active Context macOS Accessibility access and trust this app with Semantic read access to include content.
              </small>
            ) : activeContext?.status === "DENIED" ? (
              <small>Context is unavailable for this application.</small>
            ) : null}
          </section>
          {pendingApprovalId ? (
            <section className="voice-overlay-approval" aria-live="polite">
              <span>Approval required</span>
              <strong>Review the exact action in Alexa Control.</strong>
              <small>
                Voice and the desktop overlay cannot approve actions. The authenticated
                approval screen preserves the required owner and recent-auth checks.
                Approve there first, then return here to run this exact action.
              </small>
              <button
                onClick={() => void window.alexaAgent.openApprovalCenter()}
                type="button"
              >
                Review approval
              </button>
              <button
                onClick={() => void submitFinalTranscript("Do it", 1)}
                type="button"
              >
                Run approved action
              </button>
            </section>
          ) : null}
          <div className="voice-overlay-footer">
            <button onClick={() => void hideOverlay()} type="button">
              Hide overlay
            </button>
            <span>Voice settings remain in Alexa Control.</span>
          </div>
        </>
      ) : null}
    </main>
  );
};
