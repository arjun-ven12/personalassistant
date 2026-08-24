import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  CircleStop,
  Mic,
  Move,
  Pause,
  Play,
  Settings,
  VolumeX,
  Volume2,
  Waves,
} from "lucide-react";

import type {
  ApprovalRequest,
  NativeProviderDashboardResponse,
  VoiceProfileRecord,
  VoiceRuntimeState,
} from "@alexa-control/shared";
import type { ApiClient } from "./api.js";
import {
  parseVoiceNavigationSequence,
  parseApplicationVoiceCommand,
  runDeterministicVoiceNavigation,
  runDeterministicVoiceNavigationTarget,
  type ApplicationVoiceCommand,
} from "./voiceNavigation.js";
import {
  memoryTextFromVoiceCommand,
  ordinalVoiceSelectionIndex,
  voiceRouteFailureMessage,
} from "./voiceRuntimeParsing.js";
import { collectVoicePageContext } from "./voicePageContext.js";

const VOICE_ENABLED_KEY = "alexa.voiceRuntime.enabled";
const VOICE_PANEL_KEY = "alexa.voiceRuntime.panel";
const VOICE_NAVIGATION_SESSION_MS = 120_000;
const INTERRUPTION_PHRASES = new Set([
  "stop",
  "cancel",
  "wait",
  "pause",
  "continue",
  "never mind",
  "nevermind",
]);

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  readonly results: {
    readonly length: number;
    item(index: number): SpeechRecognitionResultLike;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

interface PanelState {
  x: number;
  y: number;
  collapsed: boolean;
  pinned: boolean;
  ttsEnabled: boolean;
}

interface VoiceFrame {
  state: VoiceRuntimeState;
  transcript: string;
  finalTranscript: string;
  confidence: number;
  wakeWordDetected: boolean;
  providerSupported: boolean;
  microphonePermission: "not_requested" | "prompt" | "granted" | "denied" | "unknown";
  sessionId: string | null;
  latencyMs: number;
  message: string;
}

export interface PersistentVoiceRuntimeValue {
  frame: VoiceFrame;
  panelState: PanelState;
  runtimeError: string | null;
  active: boolean;
  paused: boolean;
  start: (takeOverCapture?: boolean) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  stop: () => void;
  interrupt: (phrase: string) => Promise<void>;
  stopSpeaking: () => void;
  submitTranscript: (transcript: string, confidence?: number) => Promise<void>;
  speak: (text: string) => void;
  setPanelState: (updater: (current: PanelState) => PanelState) => void;
}

const initialFrame: VoiceFrame = {
  state: "stopped",
  transcript: "",
  finalTranscript: "",
  confidence: 0,
  wakeWordDetected: false,
  providerSupported: false,
  microphonePermission: "not_requested",
  sessionId: null,
  latencyMs: 0,
  message: "Voice runtime is stopped.",
};

const defaultPanelState: PanelState = {
  x: 372,
  y: 92,
  collapsed: false,
  pinned: true,
  ttsEnabled: true,
};

const PersistentVoiceRuntimeContext = createContext<PersistentVoiceRuntimeValue | null>(
  null,
);

const speechRecognitionConstructor = (): BrowserSpeechRecognitionConstructor | null => {
  const candidate = window as unknown as {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
};

const clampPanelState = (state: PanelState): PanelState => ({
  ...state,
  x: Math.max(12, Math.min(window.innerWidth - 300, state.x)),
  y: Math.max(72, Math.min(window.innerHeight - 170, state.y)),
});

const readPanelState = (): PanelState => {
  try {
    const stored = window.localStorage.getItem(VOICE_PANEL_KEY);
    if (!stored) return defaultPanelState;
    return clampPanelState({
      ...defaultPanelState,
      ...(JSON.parse(stored) as Partial<PanelState>),
    });
  } catch {
    return defaultPanelState;
  }
};

const statusClass = (state: VoiceRuntimeState, paused: boolean) => {
  if (paused || state === "paused") return "persistent-spatial-waiting";
  if (["listening", "recording", "responding"].includes(state))
    return "persistent-spatial-good";
  if (["interrupted", "recovering", "stopped"].includes(state))
    return "persistent-spatial-waiting";
  return "persistent-spatial-bad";
};

const commandTextFromWakeWord = (transcript: string) => {
  const match = transcript.match(/\balexa\b[\s,.:;-]*(.*)$/i);
  return match ? (match[1]?.trim() ?? "") : null;
};

const normalizeVoiceLabel = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const voiceReply = (feedback: string, transcript: string) => {
  const clean = feedback.trim();
  const variants = [
    clean,
    `${clean} boss.`,
    `${clean} Arjun.`,
    `Got it — ${clean}`,
    `On it, boss — ${clean}`,
  ];
  const index =
    [...transcript].reduce((total, character) => total + character.charCodeAt(0), 0) %
    variants.length;
  return variants[index] ?? clean;
};

const findNativeProviderForApp = (
  dashboard: NativeProviderDashboardResponse,
  command: ApplicationVoiceCommand,
) => {
  const provider = dashboard.nativeProviders.find((item) => {
    const labels = [
      item.providerType,
      item.name,
      item.applicationId,
      item.bundleIdentifier,
    ].map(normalizeVoiceLabel);
    return (
      item.providerType === command.providerType ||
      labels.includes(normalizeVoiceLabel(command.appLabel))
    );
  });
  if (!provider) return null;
  const capability = dashboard.providerCapabilities.find(
    (item) =>
      item.providerId === provider.id &&
      item.capability === command.action &&
      item.enabled,
  );
  return capability ? { provider, capability } : null;
};

export const PersistentVoiceRuntimeProvider = ({
  apiClient,
  onNavigate,
  children,
}: {
  apiClient: ApiClient;
  onNavigate: (path: string) => void;
  children: ReactNode;
}) => {
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const lastStartAtRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const activeTurnIdRef = useRef<string | null>(null);
  const leaseHeartbeatRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const hasMicrophoneGrantRef = useRef(false);
  const selectedTextRef = useRef<string | null>(null);
  const shouldRestartRecognitionRef = useRef(false);
  const startRef = useRef<((takeOverCapture?: boolean) => Promise<void>) | null>(null);
  const stopRuntimeRef = useRef<(() => void) | null>(null);
  const pauseRuntimeRef = useRef<(() => void) | null>(null);
  const navigationSessionUntilRef = useRef(0);
  const pendingAmbiguousTargetsRef = useRef<
    Array<{ id: string; label: string; role: string }>
  >([]);
  const activeVoiceProfileRef = useRef<VoiceProfileRecord | null>(null);
  const [frame, setFrame] = useState<VoiceFrame>(() => ({
    ...initialFrame,
    providerSupported: Boolean(speechRecognitionConstructor()),
  }));
  const [panelState, setPanelStateState] = useState<PanelState>(readPanelState);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [approvalPassword, setApprovalPassword] = useState("");
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const rememberSelection = () => {
      const selection = window.getSelection()?.toString().trim().replace(/\s+/g, " ");
      if (selection) {
        selectedTextRef.current = selection.slice(0, 2_000);
        return;
      }
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || !focused.closest(".persistent-voice-panel"))
        selectedTextRef.current = null;
    };
    document.addEventListener("selectionchange", rememberSelection);
    return () => document.removeEventListener("selectionchange", rememberSelection);
  }, []);

  const active = ["initializing", "listening", "recording", "transcribing"].includes(
    frame.state,
  );

  const updatePanelState = useCallback(
    (updater: (current: PanelState) => PanelState) => {
      setPanelStateState((current) => {
        const next = clampPanelState(updater(current));
        window.localStorage.setItem(VOICE_PANEL_KEY, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  const speak = useCallback(
    (text: string) => {
      if (!panelState.ttsEnabled || !("speechSynthesis" in window) || !text.trim())
        return;
      const synthesis = window.speechSynthesis;
      const utterance = new SpeechSynthesisUtterance(text);
      const profile = activeVoiceProfileRef.current;
      const voices = synthesis.getVoices();
      const exactVoice = profile?.ttsVoice
        ? voices.find((voice) => voice.name === profile.ttsVoice)
        : null;
      const languageVoice = profile
        ? voices.find(
            (voice) => voice.lang.toLowerCase() === profile.sttLanguage.toLowerCase(),
          )
        : null;
      utterance.voice = exactVoice ?? languageVoice ?? null;
      utterance.lang = utterance.voice?.lang ?? profile?.sttLanguage ?? "en-US";
      utterance.rate = profile?.ttsRate ?? 1;
      utterance.pitch = profile?.ttsPitch ?? 1;
      utterance.volume = profile?.ttsVolume ?? 1;
      utterance.onerror = (event) => {
        // Replacing or explicitly stopping an utterance produces these normal
        // Chromium lifecycle events; they are not runtime failures.
        if (event.error === "canceled" || event.error === "interrupted") return;
        setRuntimeError(`Text-to-speech error: ${event.error || "speech synthesis failed"}.`);
      };
      synthesis.cancel();
      // Chromium can ignore an utterance queued in the same task as cancel().
      window.setTimeout(() => {
        try {
          synthesis.resume();
          synthesis.speak(utterance);
        } catch (error) {
          setRuntimeError(
            `Text-to-speech error: ${error instanceof Error ? error.message : "speech synthesis failed"}.`,
          );
        }
      }, 0);
    },
    [panelState.ttsEnabled],
  );

  const loadPendingApproval = useCallback(
    async (approvalId: string | null) => {
      if (!approvalId) return;
      const approvals = await apiClient.getApprovals("PENDING");
      setPendingApproval(approvals.find((approval) => approval.id === approvalId) ?? null);
    },
    [apiClient],
  );

  const submitTranscript = useCallback(
    async (transcript: string, confidence = 0.75) => {
      const trimmed = transcript.trim();
      if (!trimmed) return;
      const started = performance.now();
      setRuntimeError(null);
      const pendingSelectionIndex = ordinalVoiceSelectionIndex(trimmed);
      if (
        pendingSelectionIndex !== null &&
        pendingAmbiguousTargetsRef.current[pendingSelectionIndex]
      ) {
        const target = pendingAmbiguousTargetsRef.current[pendingSelectionIndex];
        pendingAmbiguousTargetsRef.current = [];
        const deterministic = runDeterministicVoiceNavigationTarget(
          target.id,
          {
            pathname: window.location.pathname,
            navigate: onNavigate,
            goBack: () => window.history.back(),
            goForward: () => window.history.forward(),
            pause: () => pauseRuntimeRef.current?.(),
            stop: () => stopRuntimeRef.current?.(),
          },
          trimmed,
        );
        const responseText = voiceReply(
          deterministic.handled
            ? deterministic.feedback
            : `I selected ${target.label}, but it is no longer available.`,
          trimmed,
        );
        setFrame((current) => ({
          ...current,
          state: "listening",
          transcript: "",
          finalTranscript: trimmed,
          confidence: deterministic.confidence,
          latencyMs: Math.round(performance.now() - started),
          message: responseText,
        }));
        speak(responseText);
        return;
      }
      const memoryText = memoryTextFromVoiceCommand(trimmed);
      if (memoryText) {
        pendingAmbiguousTargetsRef.current = [];
        setFrame((current) => ({
          ...current,
          state: "understanding",
          finalTranscript: trimmed,
          confidence,
          message: "Saving that as owner-scoped memory.",
        }));
        try {
          const result = await apiClient.teachExplicitMemory({
            type: "OTHER",
            content: memoryText,
            entityRefs: [],
          });
          const responseText = voiceReply(
            result.duplicate ? "I already remember that." : "Remembered.",
            trimmed,
          );
          setFrame((current) => ({
            ...current,
            state: "listening",
            transcript: "",
            finalTranscript: trimmed,
            confidence,
            latencyMs: Math.round(performance.now() - started),
            message: responseText,
          }));
          speak(responseText);
          return;
        } catch (error) {
          const responseText =
            error instanceof Error &&
            /sensitive|credential|password|security code/i.test(error.message)
              ? "I can’t save passwords, credentials, or security codes to memory."
              : error instanceof Error &&
            /csrf|trusted origin|unauthorized|forbidden/i.test(error.message)
              ? "I heard the memory, but saving it was rejected by the guarded memory route. Refresh the page and try again."
              : "Memory saving isn't available right now, so I didn't save that.";
          setFrame((current) => ({
            ...current,
            state: "listening",
            transcript: "",
            finalTranscript: trimmed,
            confidence,
            latencyMs: Math.round(performance.now() - started),
            message: responseText,
          }));
          speak(responseText);
          return;
        }
      }
      const navigationSequence = parseVoiceNavigationSequence(trimmed);
      if (navigationSequence) {
        const navigation = runDeterministicVoiceNavigation(
          navigationSequence.navigation,
          {
            pathname: window.location.pathname,
            navigate: onNavigate,
            goBack: () => window.history.back(),
            goForward: () => window.history.forward(),
            pause: () => pauseRuntimeRef.current?.(),
            stop: () => stopRuntimeRef.current?.(),
          },
        );
        if (navigation.handled && navigation.targetId?.startsWith("page:")) {
          pendingAmbiguousTargetsRef.current = [];
          setFrame((current) => ({
            ...current,
            state: "understanding",
            transcript: "",
            finalTranscript: trimmed,
            confidence: navigation.confidence,
            message: `${navigation.feedback} Looking for the requested control.`,
          }));
          const activateWhenRendered = (remainingAttempts: number) => {
            const activation = runDeterministicVoiceNavigation(
              navigationSequence.activation,
              {
                pathname: window.location.pathname,
                navigate: onNavigate,
                goBack: () => window.history.back(),
                goForward: () => window.history.forward(),
                pause: () => pauseRuntimeRef.current?.(),
                stop: () => stopRuntimeRef.current?.(),
              },
            );
            if (!activation.handled && remainingAttempts > 1) {
              window.setTimeout(
                () => activateWhenRendered(remainingAttempts - 1),
                150,
              );
              return;
            }
            const responseText = voiceReply(
              activation.handled
                ? activation.feedback
                : "I opened the page, but I could not resolve one visible control for the second step.",
              trimmed,
            );
            setFrame((current) => ({
              ...current,
              state: "listening",
              confidence: activation.confidence,
              latencyMs: Math.round(performance.now() - started),
              message: responseText,
            }));
            speak(responseText);
          };
          window.setTimeout(() => activateWhenRendered(12), 150);
          return;
        }
      }
      const deterministic = runDeterministicVoiceNavigation(trimmed, {
        pathname: window.location.pathname,
        navigate: onNavigate,
        goBack: () => window.history.back(),
        goForward: () => window.history.forward(),
        pause: () => pauseRuntimeRef.current?.(),
        stop: () => stopRuntimeRef.current?.(),
      });
      if (deterministic.handled) {
        pendingAmbiguousTargetsRef.current = [];
        const responseText = voiceReply(deterministic.feedback, trimmed);
        setFrame((current) => ({
          ...current,
          state: "listening",
          transcript: "",
          finalTranscript: trimmed,
          confidence: deterministic.confidence,
          latencyMs: Math.round(performance.now() - started),
          message: responseText,
        }));
        speak(responseText);
        void apiClient.recordVoiceMetric({
          sessionId: sessionIdRef.current,
          provider: "browser_speech_recognition",
          runtimeState: "planning",
          recognitionLatencyMs: Math.round(performance.now() - started),
          intentLatencyMs: Math.round(performance.now() - started),
          ttsLatencyMs: 0,
          confidence: deterministic.confidence,
          interruption: deterministic.kind === "session",
        });
        return;
      }
      if (deterministic.ambiguousTargets.length > 0) {
        pendingAmbiguousTargetsRef.current = deterministic.ambiguousTargets;
        const options = deterministic.ambiguousTargets
          .map((target, index) => `${index + 1}. ${target.label}`)
          .join(", ");
        const responseText = `I found multiple matches: ${options}. Say first one, second one, and so on.`;
        setFrame((current) => ({
          ...current,
          state: "listening",
          transcript: "",
          finalTranscript: trimmed,
          confidence: deterministic.confidence,
          latencyMs: Math.round(performance.now() - started),
          message: responseText,
        }));
        speak(responseText);
        return;
      }
      const appCommand = parseApplicationVoiceCommand(trimmed);
      if (appCommand) {
        pendingAmbiguousTargetsRef.current = [];
        setFrame((current) => ({
          ...current,
          state: "understanding",
          finalTranscript: trimmed,
          confidence,
          message: `Looking for a reviewed ${appCommand.appLabel} provider.`,
        }));
        try {
          const nativeRuntime = await apiClient.getNativeProviderRuntime();
          const target = findNativeProviderForApp(nativeRuntime, appCommand);
          if (!target) {
            const responseText = voiceReply(
              `I can't ${appCommand.action} ${appCommand.appLabel} from here yet because no enabled reviewed provider capability is registered.`,
              trimmed,
            );
            setFrame((current) => ({
              ...current,
              state: "listening",
              transcript: "",
              finalTranscript: trimmed,
              confidence,
              latencyMs: Math.round(performance.now() - started),
              message: responseText,
            }));
            speak(responseText);
            return;
          }
          await apiClient.dispatchNativeCapability({
            providerId: target.provider.id,
            capability: appCommand.action,
            applicationId: target.provider.applicationId,
            arguments: {},
          });
          const responseText = voiceReply(
            `${appCommand.action === "launch" ? "Launching" : "Focusing"} ${
              appCommand.appLabel
            } through the reviewed provider.`,
            trimmed,
          );
          setFrame((current) => ({
            ...current,
            state: "listening",
            transcript: "",
            finalTranscript: trimmed,
            confidence,
            latencyMs: Math.round(performance.now() - started),
            message: responseText,
          }));
          speak(responseText);
          void apiClient.recordVoiceMetric({
            sessionId: sessionIdRef.current,
            provider: "browser_speech_recognition",
            runtimeState: "planning",
            recognitionLatencyMs: Math.round(performance.now() - started),
            intentLatencyMs: Math.round(performance.now() - started),
            ttsLatencyMs: 0,
            confidence,
            interruption: false,
          });
          return;
        } catch (error) {
          const responseText = voiceReply(
            error instanceof Error &&
              /csrf|trusted origin|unauthorized|forbidden/i.test(error.message)
              ? `I heard ${appCommand.action} ${appCommand.appLabel}, but the governed provider route rejected the request. Refresh the page so the session and CSRF token are fresh.`
              : `That ${appCommand.appLabel} function isn't enabled or available right now.`,
            trimmed,
          );
          setFrame((current) => ({
            ...current,
            state: "listening",
            transcript: "",
            finalTranscript: trimmed,
            confidence,
            latencyMs: Math.round(performance.now() - started),
            message: responseText,
          }));
          speak(responseText);
          return;
        }
      }
      setFrame((current) => ({
        ...current,
        state: "understanding",
        finalTranscript: trimmed,
        confidence,
        message: "Routing final transcript through the Intent Engine.",
      }));
      try {
        const turnId = crypto.randomUUID();
        activeTurnIdRef.current = turnId;
        const preservedSelection = selectedTextRef.current;
        // Keep the exact bounded selection available for a follow-up
        // confirmation (for example, "do it"). A later non-empty browser
        // selection replaces it; this avoids invalidating a proposal merely
        // because interacting with the voice panel temporarily clears DOM selection.
        const response = await apiClient.recordVoiceTranscript({
          sessionId: sessionIdRef.current,
          turnId,
          transcript: trimmed,
          confidence,
          isFinal: true,
          language: "en-US",
          wakeWordDetected: true,
          source: "browser",
          pageContext: collectVoicePageContext(
            window.location.pathname,
            transcript,
            preservedSelection,
          ),
        });
        if (activeTurnIdRef.current === turnId) activeTurnIdRef.current = null;
        await loadPendingApproval(response.approvalRequestId);
        const routedResponseText =
          response.responseText ?? "Voice command was recorded.";
        const responseText = voiceReply(routedResponseText, trimmed);
        setFrame((current) => ({
          ...current,
          state: "listening",
          transcript: "",
          finalTranscript: trimmed,
          latencyMs: Math.round(performance.now() - started),
          message: responseText,
        }));
        if (/open command center/i.test(trimmed)) onNavigate("/commands");
        if (/show agents|open agents/i.test(trimmed)) onNavigate("/agents");
        if (/show approvals|open approvals/i.test(trimmed)) onNavigate("/approvals");
        speak(responseText);
        void apiClient.recordVoiceMetric({
          sessionId: sessionIdRef.current,
          provider: "browser_speech_recognition",
          runtimeState: "planning",
          recognitionLatencyMs: Math.round(performance.now() - started),
          intentLatencyMs: Math.round(performance.now() - started),
          ttsLatencyMs: 0,
          confidence,
          interruption: false,
        });
      } catch (error) {
        activeTurnIdRef.current = null;
        const responseText = voiceRouteFailureMessage(error);
        setRuntimeError(null);
        setFrame((current) => ({
          ...current,
          state: "listening",
          transcript: "",
          finalTranscript: trimmed,
          latencyMs: Math.round(performance.now() - started),
          message: responseText,
        }));
        speak(responseText);
      }
    },
    [apiClient, loadPendingApproval, onNavigate, speak],
  );

  const decidePendingApproval = useCallback(
    async (decision: "approve" | "reject") => {
      if (!pendingApproval || approvalBusy) return;
      setApprovalBusy(true);
      setApprovalError(null);
      try {
        if (decision === "reject") {
          await apiClient.rejectApproval(pendingApproval.id);
          setPendingApproval(null);
          setApprovalPassword("");
          return;
        }
        if (pendingApproval.approvalRequirement === "recent_authentication") {
          if (!approvalPassword) {
            setApprovalError("Re-enter your password to approve this action.");
            return;
          }
          const challenge = await apiClient.createRecentAuthChallenge(
            "approve_high_risk_action",
          );
          await apiClient.verifyRecentPassword({
            challengeId: challenge.challengeId,
            challengeToken: challenge.challengeToken,
            password: approvalPassword,
          });
        }
        await apiClient.approveApproval(pendingApproval.id);
        setPendingApproval((current) =>
          current ? { ...current, status: "APPROVED" } : current,
        );
        setApprovalPassword("");
      } catch (cause) {
        setApprovalError(cause instanceof Error ? cause.message : "Approval could not be completed.");
      } finally {
        setApprovalBusy(false);
      }
    },
    [apiClient, approvalBusy, approvalPassword, pendingApproval],
  );

  const handleResult = useCallback(
    (event: SpeechRecognitionEventLike) => {
      let transcript = "";
      let finalTranscript = "";
      let confidence = 0;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index] ?? event.results.item(index);
        const alternative = result[0] ?? result.item(0);
        if (!alternative) continue;
        transcript += alternative.transcript;
        confidence = Math.max(confidence, alternative.confidence || 0.75);
        if (result.isFinal) finalTranscript += alternative.transcript;
      }
      const currentTranscript = transcript.trim();
      setFrame((current) => ({
        ...current,
        state: finalTranscript ? "transcribing" : "recording",
        transcript: currentTranscript,
        confidence,
        message: currentTranscript || "Listening for wake word.",
      }));
      const finalText = finalTranscript.trim();
      if (!finalText) return;
      const lower = finalText.toLowerCase().trim();
      if (INTERRUPTION_PHRASES.has(lower)) {
        void apiClient.recordVoiceTranscript({
          sessionId: sessionIdRef.current,
          turnId: crypto.randomUUID(),
          ...(activeTurnIdRef.current
            ? { interruptedTurnId: activeTurnIdRef.current }
            : {}),
          transcript: finalText,
          confidence,
          isFinal: true,
          language: "en-US",
          wakeWordDetected: false,
          source: "browser",
        });
        window.speechSynthesis?.cancel();
        setFrame((current) => ({
          ...current,
          state: "interrupted",
          finalTranscript: finalText,
          transcript: "",
          message: "Voice interruption received.",
        }));
        return;
      }
      const wakeCommand = commandTextFromWakeWord(finalText);
      const navigationSessionActive = Date.now() < navigationSessionUntilRef.current;
      if (wakeCommand === null && !navigationSessionActive) {
        setFrame((current) => ({
          ...current,
          state: "listening",
          finalTranscript: finalText,
          transcript: "",
          wakeWordDetected: false,
          message: "Heard speech, but no wake word was detected.",
        }));
        return;
      }
      const command = wakeCommand === null ? finalText : wakeCommand;
      if (wakeCommand !== null) {
        navigationSessionUntilRef.current = Date.now() + VOICE_NAVIGATION_SESSION_MS;
      } else {
        navigationSessionUntilRef.current = Date.now() + VOICE_NAVIGATION_SESSION_MS;
      }
      setFrame((current) => ({
        ...current,
        state: "wake_word_detected",
        wakeWordDetected: wakeCommand !== null || current.wakeWordDetected,
        finalTranscript: finalText,
        transcript: "",
        message: command
          ? "Wake word detected. Routing command."
          : "Wake word detected. Listening for the command.",
      }));
      if (command) void submitTranscript(command, confidence);
    },
    [apiClient, submitTranscript],
  );

  const stopRecognition = useCallback(() => {
    shouldRestartRecognitionRef.current = false;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearCaptureHeartbeat = useCallback(() => {
    if (leaseHeartbeatRef.current !== null) window.clearInterval(leaseHeartbeatRef.current);
    leaseHeartbeatRef.current = null;
  }, []);

  const releaseCaptureLease = useCallback(async () => {
    clearCaptureHeartbeat();
    const voiceSessionId = sessionIdRef.current;
    if (!voiceSessionId) return;
    try {
      await apiClient.manageVoiceCaptureLease({ action: "release", voiceSessionId });
    } finally {
      sessionIdRef.current = null;
    }
  }, [apiClient, clearCaptureHeartbeat]);

  const start = useCallback(async (takeOverCapture = true) => {
    if (recognitionRef.current || active) return;
    const SpeechRecognition = speechRecognitionConstructor();
    if (!SpeechRecognition) {
      setRuntimeError("This browser does not expose SpeechRecognition.");
      setFrame((current) => ({
        ...current,
        providerSupported: false,
        state: "stopped",
        message: "Speech recognition is unavailable in this browser.",
      }));
      return;
    }
    setRuntimeError(null);
    setPaused(false);
    setFrame((current) => ({
      ...current,
      state: "initializing",
      microphonePermission: hasMicrophoneGrantRef.current ? "granted" : "prompt",
      providerSupported: true,
      message: hasMicrophoneGrantRef.current
        ? "Reactivating voice recognition with existing microphone permission."
        : "Requesting microphone permission.",
    }));
    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      }
      hasMicrophoneGrantRef.current = true;
      const dashboard = sessionIdRef.current
        ? await apiClient.getVoiceDashboard()
        : await apiClient.createVoiceSession({ wakeWordEnabled: true, reuseActiveSession: true });
      const sessionId = sessionIdRef.current ?? dashboard.sessions[0]?.id ?? null;
      if (!sessionId) throw new Error("Voice session was not created.");
      sessionIdRef.current = sessionId;
      activeVoiceProfileRef.current =
        dashboard.profiles.find((profile) => profile.active) ?? null;
      const lease = await apiClient.manageVoiceCaptureLease({
        action: takeOverCapture ? "takeover" : "acquire",
        voiceSessionId: sessionId,
      });
      if (lease.status !== "ACQUIRED") {
        throw new Error(
          lease.owner === "OVERLAY"
            ? "Alexa voice is active in the desktop overlay."
            : "Voice capture is already active.",
        );
      }
      clearCaptureHeartbeat();
      leaseHeartbeatRef.current = window.setInterval(() => {
        void apiClient
          .manageVoiceCaptureLease({ action: "heartbeat", voiceSessionId: sessionId })
          .then((result) => {
            if (result.status === "ACQUIRED") return;
            stopRecognition();
            setRuntimeError("Voice capture ownership changed.");
            setFrame((current) => ({ ...current, state: "stopped", message: "Voice capture ended." }));
          });
      }, 1_000);
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang =
        dashboard.profiles.find((profile) => profile.active)?.sttLanguage ?? "en-US";
      recognition.onresult = handleResult;
      recognition.onerror = (event) => {
        if (event.error === "no-speech") {
          setRuntimeError(null);
          setFrame((current) => ({
            ...current,
            state: "listening",
            microphonePermission: "granted",
            message: 'Listening locally. Say "Alexa" followed by a command.',
          }));
          return;
        }
        stopRecognition();
        void releaseCaptureLease();
        setRuntimeError(event.message ?? event.error);
        setFrame((current) => ({
          ...current,
          state: "stopped",
          message: `Speech recognition stopped: ${event.error}`,
        }));
      };
      recognition.onend = () => {
        if (!shouldRestartRecognitionRef.current || pausedRef.current) return;
        setFrame((current) => ({
          ...current,
          state: "listening",
          microphonePermission: "granted",
          message: 'Listening locally. Say "Alexa" followed by a command.',
        }));
        window.setTimeout(() => {
          try {
            recognitionRef.current?.start();
          } catch {
            setFrame((current) => ({
              ...current,
              state: "recovering",
              message: "Speech recognition is recovering.",
            }));
          }
        }, 350);
      };
      recognitionRef.current = recognition;
      shouldRestartRecognitionRef.current = true;
      lastStartAtRef.current = performance.now();
      recognition.start();
      window.localStorage.setItem(VOICE_ENABLED_KEY, "true");
      setFrame((current) => ({
        ...current,
        state: "listening",
        sessionId,
        microphonePermission: "granted",
        message: 'Listening locally. Say "Alexa" followed by a command.',
      }));
    } catch (error) {
      stopRecognition();
      await releaseCaptureLease();
      const routeMessage = voiceRouteFailureMessage(error);
      setRuntimeError(error instanceof Error ? error.message : routeMessage);
      setFrame((current) => ({
        ...current,
        state: "stopped",
        microphonePermission: streamRef.current ? "granted" : "denied",
        message:
          routeMessage ===
          "I couldn't process that request because the conversation service returned an error."
            ? "Microphone permission was denied or unavailable."
            : routeMessage,
      }));
      window.localStorage.removeItem(VOICE_ENABLED_KEY);
    }
  }, [active, apiClient, clearCaptureHeartbeat, handleResult, releaseCaptureLease, stopRecognition]);

  const pause = useCallback(() => {
    if (!recognitionRef.current) return;
    shouldRestartRecognitionRef.current = false;
    recognitionRef.current.stop();
    setPaused(true);
    setFrame((current) => ({
      ...current,
      state: "paused",
      message: "Voice runtime paused. Microphone remains reserved until stopped.",
    }));
  }, []);

  const resume = useCallback(async () => {
    if (recognitionRef.current) {
      setPaused(false);
      shouldRestartRecognitionRef.current = true;
      recognitionRef.current.start();
      setFrame((current) => ({
        ...current,
        state: "listening",
        message: 'Listening locally. Say "Alexa" followed by a command.',
      }));
      return;
    }
    await start(true);
  }, [start]);

  const stop = useCallback(() => {
    stopRecognition();
    void releaseCaptureLease();
    window.speechSynthesis?.cancel();
    setPaused(false);
    window.localStorage.removeItem(VOICE_ENABLED_KEY);
    hasMicrophoneGrantRef.current = false;
    setFrame({
      ...initialFrame,
      providerSupported: Boolean(speechRecognitionConstructor()),
      state: "stopped",
      message: "Voice runtime stopped. Microphone released.",
    });
  }, [releaseCaptureLease, stopRecognition]);

  const interrupt = useCallback(
    async (phrase: string) => {
      window.speechSynthesis?.cancel();
      await apiClient.recordVoiceTranscript({
        sessionId: sessionIdRef.current,
        turnId: crypto.randomUUID(),
        ...(activeTurnIdRef.current
          ? { interruptedTurnId: activeTurnIdRef.current }
          : {}),
        transcript: phrase,
        confidence: 1,
        isFinal: true,
        language: "en-US",
        wakeWordDetected: false,
        source: "browser",
      });
      setFrame((current) => ({
        ...current,
        state: "interrupted",
        message: `${phrase} received.`,
      }));
    },
    [apiClient],
  );

  const stopSpeaking = useCallback(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setFrame((current) => ({
      ...current,
      state:
        current.state === "responding" || current.state === "interrupted"
          ? "listening"
          : current.state,
      message: "Speech playback stopped.",
    }));
  }, []);

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  useEffect(() => {
    pauseRuntimeRef.current = pause;
  }, [pause]);

  useEffect(() => {
    stopRuntimeRef.current = stop;
  }, [stop]);

  useEffect(() => {
    if (window.localStorage.getItem(VOICE_ENABLED_KEY) === "true") {
      void startRef.current?.(false);
    }
    return () => {
      stopRecognition();
      void releaseCaptureLease();
    };
  }, [releaseCaptureLease, stopRecognition]);

  useEffect(() => {
    const handleVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        window.localStorage.getItem(VOICE_ENABLED_KEY) === "true" &&
        !recognitionRef.current &&
        !paused
      ) {
        setFrame((current) => ({
          ...current,
          state: "recovering",
          message: "Recovering voice runtime after browser suspension.",
        }));
        void startRef.current?.(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [paused]);

  const value = useMemo<PersistentVoiceRuntimeValue>(
    () => ({
      frame,
      panelState,
      runtimeError,
      active,
      paused,
      start,
      pause,
      resume,
      stop,
      interrupt,
      stopSpeaking,
      submitTranscript,
      speak,
      setPanelState: updatePanelState,
    }),
    [
      active,
      frame,
      interrupt,
      panelState,
      pause,
      paused,
      resume,
      runtimeError,
      speak,
      start,
      stop,
      stopSpeaking,
      submitTranscript,
      updatePanelState,
    ],
  );

  return (
    <PersistentVoiceRuntimeContext.Provider value={value}>
      {children}
      {active ? (
        <div className="persistent-voice-overlay" aria-hidden="true">
          <span className="persistent-voice-wave" />
          <span className="persistent-voice-label">
            {frame.state.replaceAll("_", " ")} · {Math.round(frame.confidence * 100)}%
          </span>
        </div>
      ) : null}
      <aside
        className={[
          "persistent-spatial-panel",
          "persistent-voice-panel",
          panelState.collapsed ? "persistent-spatial-panel-collapsed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          {
            "--persistent-panel-x": `${panelState.x}px`,
            "--persistent-panel-y": `${panelState.y}px`,
          } as CSSProperties
        }
      >
        <button
          className="persistent-spatial-panel-grip"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragOffsetRef.current = {
              x: event.clientX - panelState.x,
              y: event.clientY - panelState.y,
            };
          }}
          onPointerMove={(event) => {
            if (!dragOffsetRef.current) return;
            updatePanelState((current) => ({
              ...current,
              x: event.clientX - dragOffsetRef.current!.x,
              y: event.clientY - dragOffsetRef.current!.y,
            }));
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
            dragOffsetRef.current = null;
          }}
          type="button"
        >
          <Move size={13} /> Voice Runtime
        </button>
        <button
          className="persistent-spatial-collapse"
          onClick={() =>
            updatePanelState((current) => ({
              ...current,
              collapsed: !current.collapsed,
            }))
          }
          type="button"
        >
          <ChevronDown size={14} />
        </button>
        {!panelState.collapsed ? (
          <>
            <div className="persistent-spatial-status">
              <span className={statusClass(frame.state, paused)}>
                {frame.state.replaceAll("_", " ")}
              </span>
              <strong>{frame.transcript || frame.finalTranscript || "Voice OS"}</strong>
              <small>{runtimeError ?? frame.message}</small>
            </div>
            <div className="persistent-spatial-metrics">
              <span>
                <Mic size={13} /> {frame.microphonePermission}
              </span>
              <span>
                <Waves size={13} /> {Math.round(frame.confidence * 100)}%
              </span>
              <span>{frame.latencyMs}ms</span>
              <span>{frame.providerSupported ? "STT ready" : "No STT"}</span>
            </div>
            <div className="persistent-spatial-controls">
              <button disabled={active} onClick={() => void start(true)} type="button">
                <Play size={13} /> Start
              </button>
              <button disabled={!active} onClick={pause} type="button">
                <Pause size={13} /> Pause
              </button>
              <button disabled={!paused} onClick={() => void resume()} type="button">
                <Mic size={13} /> Resume
              </button>
              <button
                className="persistent-runtime-stop"
                disabled={!active && !paused}
                onClick={stop}
                type="button"
              >
                <CircleStop size={13} /> Stop
              </button>
            </div>
            <div className="persistent-spatial-toggles">
              <button
                className={
                  panelState.ttsEnabled
                    ? "persistent-toggle-active"
                    : "persistent-toggle-inactive"
                }
                onClick={() =>
                  updatePanelState((current) => ({
                    ...current,
                    ttsEnabled: !current.ttsEnabled,
                  }))
                }
                type="button"
              >
                <Volume2 size={13} /> TTS
              </button>
              <button
                className="persistent-voice-stop-speaking"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  stopSpeaking();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                <VolumeX size={13} /> Stop speaking
              </button>
            </div>
            {pendingApproval ? (
              <section className="persistent-voice-approval" aria-live="polite">
                <span className="persistent-voice-approval-label">Approval required</span>
                <strong>{pendingApproval.toolName}</strong>
                <small>{pendingApproval.humanSummary}</small>
                <small>
                  {pendingApproval.riskLevel} · {pendingApproval.approvalRequirement}
                </small>
                {pendingApproval.status === "PENDING" ? (
                  <>
                    {pendingApproval.approvalRequirement === "recent_authentication" ? (
                      <input
                        autoComplete="current-password"
                        aria-label="Password for recent authentication"
                        onChange={(event) => setApprovalPassword(event.target.value)}
                        placeholder="Password required"
                        type="password"
                        value={approvalPassword}
                      />
                    ) : null}
                    <div className="persistent-spatial-controls">
                      <button
                        disabled={approvalBusy}
                        onClick={() => void decidePendingApproval("approve")}
                        type="button"
                      >
                        Approve
                      </button>
                      <button
                        className="persistent-runtime-stop"
                        disabled={approvalBusy}
                        onClick={() => void decidePendingApproval("reject")}
                        type="button"
                      >
                        Reject
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    disabled={approvalBusy}
                    onClick={() => void submitTranscript("Do it", 1)}
                    type="button"
                  >
                    Run approved action
                  </button>
                )}
                {approvalError ? <small className="form-error">{approvalError}</small> : null}
              </section>
            ) : null}
            <p>Say “Alexa” then a command. Voice cannot approve risky actions.</p>
            <button
              className="persistent-spatial-lab-link"
              onClick={() => onNavigate("/voice")}
              type="button"
            >
              <Settings size={13} /> Open Voice Center
            </button>
          </>
        ) : null}
      </aside>
    </PersistentVoiceRuntimeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const usePersistentVoiceRuntime = () => {
  const context = useContext(PersistentVoiceRuntimeContext);
  if (!context) {
    throw new Error(
      "usePersistentVoiceRuntime must be used inside PersistentVoiceRuntimeProvider",
    );
  }
  return context;
};
