export type VoiceNavigationCommandKind =
  | "navigation"
  | "scroll"
  | "selection"
  | "dialog"
  | "search"
  | "session"
  | "conversation"
  | "escalate";

export interface SemanticUiTarget {
  id: string;
  label: string;
  aliases: string[];
  role: string;
  page: string;
  enabled: boolean;
  visible: boolean;
  priority: number;
  element: HTMLElement;
}

export interface VoiceNavigationResult {
  handled: boolean;
  kind: VoiceNavigationCommandKind;
  transcript: string;
  normalized: string;
  feedback: string;
  confidence: number;
  targetId: string | null;
  ambiguousTargets: Array<{ id: string; label: string; role: string }>;
  escalatesToIntentEngine: boolean;
}

export interface VoiceNavigationContext {
  pathname: string;
  navigate: (path: string) => void;
  goBack: () => void;
  goForward: () => void;
  pause: () => void;
  stop: () => void;
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const trimCommandPrefix = (value: string) =>
  normalize(value).replace(
    /^(please\s+)?(open|go to|show|navigate to|click|press|select|activate|focus|launch|start)\s+/,
    "",
  );

const words = (value: string) => new Set(normalize(value).split(" ").filter(Boolean));

const applicationAliases = [
  { spoken: "vs code", label: "VS Code", providerType: "vscode" },
  { spoken: "visual studio code", label: "VS Code", providerType: "vscode" },
  { spoken: "vscode", label: "VS Code", providerType: "vscode" },
  { spoken: "finder", label: "Finder", providerType: "finder" },
  { spoken: "chrome", label: "Chrome", providerType: "chrome" },
  { spoken: "google chrome", label: "Chrome", providerType: "chrome" },
  { spoken: "safari", label: "Safari", providerType: "safari" },
  { spoken: "terminal", label: "Terminal", providerType: "terminal" },
] as const;

export interface ApplicationVoiceCommand {
  action: "focus" | "launch";
  appLabel: string;
  providerType: (typeof applicationAliases)[number]["providerType"];
}

export const parseApplicationVoiceCommand = (
  value: string,
): ApplicationVoiceCommand | null => {
  const normalizedValue = normalize(value);
  const match = normalizedValue.match(
    /^(open|launch|start|focus|bring up|switch to)\s+(?:(?:app|application)\s+)?(.+)$/,
  );
  if (!match) return null;
  const verb = match[1] ?? "";
  const target = normalize(match[2] ?? "");
  const app = applicationAliases.find((alias) => target === alias.spoken);
  if (!app) return null;
  const action: "focus" | "launch" = /focus|bring up|switch to/.test(verb)
    ? "focus"
    : "launch";
  return { action, appLabel: app.label, providerType: app.providerType };
};

const pageTargets = [
  { path: "/", label: "Home", aliases: ["home", "main", "command core"] },
  {
    path: "/automation?tab=commands",
    label: "Commands",
    aliases: ["command center", "command"],
  },
  {
    path: "/memory?tab=retrieval",
    label: "Semantic",
    aliases: ["semantic intelligence", "semantic search", "retrieval"],
  },
  {
    path: "/engineering?tab=indexing",
    label: "Semantic Workspace",
    aliases: [
      "semantic workspace explorer",
      "workspace intelligence",
      "content intelligence",
    ],
  },
  {
    path: "/automation?tab=demonstrations",
    label: "Command Studio",
    aliases: ["create command", "record command", "command recorder"],
  },
  {
    path: "/conversation",
    label: "Conversations",
    aliases: ["conversation", "conversations"],
  },
  { path: "/automation?tab=tasks", label: "Tasks", aliases: ["task center", "task"] },
  {
    path: "/engineering?tab=repositories",
    label: "Repositories",
    aliases: ["repos", "repo"],
  },
  { path: "/agents", label: "Agents", aliases: ["agent center", "agent dashboard"] },
  { path: "/workflows", label: "Workflows", aliases: ["workflow", "workflows"] },
  { path: "/skills", label: "Skills", aliases: ["skill", "skills"] },
  {
    path: "/applications?tab=integrations",
    label: "Integrations",
    aliases: ["connectors"],
  },
  { path: "/memory", label: "Memory", aliases: ["memory center"] },
  { path: "/ai?tab=advanced", label: "Infrastructure", aliases: ["infra"] },
  {
    path: "/engineering?tab=advisor",
    label: "Advisor",
    aliases: ["engineering advisor"],
  },
  {
    path: "/engineering?tab=validation",
    label: "Validation",
    aliases: ["validations", "tests"],
  },
  { path: "/approvals", label: "Approvals", aliases: ["approval", "approvals"] },
  { path: "/security", label: "Security", aliases: ["security center"] },
  { path: "/security?tab=policies", label: "Policies", aliases: ["policy"] },
  { path: "/devices", label: "Devices", aliases: ["trusted devices"] },
  { path: "/applications?tab=capabilities", label: "Desktop", aliases: ["desktop control"] },
  {
    path: "/applications?tab=adapters",
    label: "Application Intelligence",
    aliases: ["app intelligence", "application intelligence center"],
  },
  { path: "/applications", label: "Applications", aliases: ["apps"] },
  { path: "/workspace", label: "Workspaces", aliases: ["workspace"] },
  { path: "/engineering?tab=inspection", label: "Read-only tools", aliases: ["tools"] },
  { path: "/security?tab=audit", label: "Audit", aliases: ["audit log"] },
  { path: "/security?tab=sessions", label: "Settings", aliases: ["preferences"] },
  { path: "/spatial", label: "Spatial", aliases: ["gestures", "spatial"] },
  { path: "/voice", label: "Voice", aliases: ["voice center", "voice settings"] },
] as const;

const scrollContainer = () =>
  document.querySelector<HTMLElement>(".content") ?? document.documentElement;

const baseResult = (
  transcript: string,
  kind: VoiceNavigationCommandKind,
  feedback: string,
  confidence: number,
): VoiceNavigationResult => ({
  handled: true,
  kind,
  transcript,
  normalized: normalize(transcript),
  feedback,
  confidence,
  targetId: null,
  ambiguousTargets: [],
  escalatesToIntentEngine: false,
});

const isVisible = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
};

export const collectSemanticUiTargets = (pathname: string): SemanticUiTarget[] => {
  const spatialTargets = [
    ...document.querySelectorAll<HTMLElement>("[data-spatial-id][data-spatial-label]"),
  ].map((element) => ({
    id: element.dataset.spatialId ?? "",
    label: element.dataset.spatialLabel ?? "",
    aliases: [],
    role:
      element.dataset.spatialType ??
      element.getAttribute("role") ??
      element.tagName.toLowerCase(),
    page: pathname,
    enabled:
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-disabled") !== "true",
    visible: isVisible(element),
    priority: Number(element.dataset.spatialPriority ?? 0),
    element,
  }));

  const explicitControls = [
    ...document.querySelectorAll<HTMLElement>(
      "button[aria-label], button:not([data-spatial-id]), a[aria-label], input[aria-label], textarea[aria-label], [role='button'][aria-label]",
    ),
  ].flatMap((element) => {
    const label =
      element.getAttribute("aria-label") ??
      element.textContent?.trim().replace(/\s+/g, " ") ??
      "";
    if (!label) return [];
    return [
      {
        id: `dom:${pathname}:${label}:${explicitControlsIndex(element)}`,
        label,
        aliases: [],
        role: element.getAttribute("role") ?? element.tagName.toLowerCase(),
        page: pathname,
        enabled:
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-disabled") !== "true",
        visible: isVisible(element),
        priority: 0,
        element,
      },
    ];
  });

  const byId = new Map<string, SemanticUiTarget>();
  for (const target of [...spatialTargets, ...explicitControls]) {
    if (!target.id || !target.label || !target.visible) continue;
    byId.set(target.id, target);
  }
  return [...byId.values()];
};

const explicitControlsIndex = (element: HTMLElement) =>
  [...document.querySelectorAll(element.tagName.toLowerCase())].indexOf(element);

const scoreTarget = (query: string, target: SemanticUiTarget) => {
  const labels = [target.label, ...target.aliases].map(normalize);
  const normalizedQuery = normalize(query);
  let score = 0;
  for (const label of labels) {
    if (label === normalizedQuery) score = Math.max(score, 1);
    if (label.includes(normalizedQuery) || normalizedQuery.includes(label)) {
      score = Math.max(score, 0.86);
    }
    const labelWords = words(label);
    const queryWords = words(normalizedQuery);
    const intersection = [...queryWords].filter((word) => labelWords.has(word)).length;
    if (queryWords.size > 0) {
      score = Math.max(
        score,
        intersection / Math.max(queryWords.size, labelWords.size),
      );
    }
  }
  return Math.min(1, score + target.priority / 100);
};

const matchPageTarget = (command: string) => {
  const query = trimCommandPrefix(command);
  return pageTargets
    .map((target) => {
      const synthetic = {
        id: `page:${target.path}`,
        label: target.label,
        aliases: [...target.aliases],
        role: "page",
        page: target.path,
        enabled: true,
        visible: true,
        priority: 10,
        element: undefined as unknown as HTMLElement,
      } satisfies SemanticUiTarget;
      return { target, confidence: scoreTarget(query, synthetic) };
    })
    .sort((left, right) => right.confidence - left.confidence);
};

const activateElement = (target: SemanticUiTarget) => {
  target.element.focus({ preventScroll: true });
  target.element.dispatchEvent(
    new CustomEvent("voice-navigation-activate", {
      bubbles: true,
      detail: {
        targetId: target.id,
        label: target.label,
        confidence: 0.9,
      },
    }),
  );
  target.element.click();
};

const findApplicationActionTarget = (
  pathname: string,
  action: "launch" | "focus",
  appLabel: string,
) => {
  const wanted = normalize(`${action === "launch" ? "Launch" : "focus"} ${appLabel}`);
  return collectSemanticUiTargets(pathname)
    .filter((target) => target.enabled)
    .map((target) => ({ target, normalizedLabel: normalize(target.label) }))
    .filter(
      (match) =>
        match.normalizedLabel === wanted ||
        match.normalizedLabel === `${action} ${normalize(appLabel)}`,
    )
    .sort((left, right) => right.target.priority - left.target.priority)[0]?.target;
};

export const runDeterministicVoiceNavigation = (
  transcript: string,
  context: VoiceNavigationContext,
): VoiceNavigationResult => {
  const normalized = normalize(transcript);
  if (!normalized) {
    return {
      ...baseResult(transcript, "escalate", "I did not hear a command.", 0),
      handled: false,
      escalatesToIntentEngine: true,
    };
  }

  if (
    /^(stop listening|sleep|go to sleep|stop voice|stop microphone)$/.test(normalized)
  ) {
    context.stop();
    return baseResult(transcript, "session", "Stopping voice control.", 1);
  }
  if (/^(pause listening|pause voice)$/.test(normalized)) {
    context.pause();
    return baseResult(transcript, "session", "Pausing voice control.", 1);
  }

  if (/^(go back|back)$/.test(normalized)) {
    context.goBack();
    return baseResult(transcript, "navigation", "Going back.", 1);
  }
  if (/^(go forward|forward)$/.test(normalized)) {
    context.goForward();
    return baseResult(transcript, "navigation", "Going forward.", 1);
  }

  if (
    /^(hi|hello|hey|hey there|good morning|good afternoon|good evening)$/.test(
      normalized,
    )
  ) {
    return baseResult(transcript, "conversation", "Hey — I’m here.", 1);
  }
  if (/^(thanks|thank you|thx)$/.test(normalized)) {
    return baseResult(transcript, "conversation", "Anytime.", 1);
  }
  if (/^(help|what can you do|what can i say)$/.test(normalized)) {
    return baseResult(
      transcript,
      "conversation",
      'You can ask me to open pages, click visible controls, or route governed tasks like "launch VS Code."',
      1,
    );
  }

  if (
    /^(create command|record command|command studio|open command studio)$/.test(
      normalized,
    )
  ) {
    context.navigate("/automation?tab=demonstrations");
    return {
      ...baseResult(transcript, "navigation", "Opening Command Studio.", 1),
      targetId: "page:/automation?tab=demonstrations",
    };
  }

  if (
    /^(settings|open settings|go to settings|show settings|settings page|open settings page)$/.test(
      normalized,
    )
  ) {
    context.navigate("/security?tab=sessions");
    return {
      ...baseResult(transcript, "navigation", "Opening Settings.", 1),
      targetId: "page:/security?tab=sessions",
    };
  }

  if (
    /^(voice settings|open voice settings|go to voice settings|voice center|open voice center)$/.test(
      normalized,
    )
  ) {
    context.navigate("/voice");
    return {
      ...baseResult(transcript, "navigation", "Opening Voice.", 1),
      targetId: "page:/voice",
    };
  }

  if (/^(top|go top|scroll top|go to top)$/.test(normalized)) {
    scrollContainer().scrollTo({ top: 0, behavior: "smooth" });
    return baseResult(transcript, "scroll", "Top.", 1);
  }
  if (/^(bottom|go bottom|scroll bottom|go to bottom)$/.test(normalized)) {
    const container = scrollContainer();
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    return baseResult(transcript, "scroll", "Bottom.", 1);
  }
  if (/scroll|page up|page down/.test(normalized)) {
    const container = scrollContainer();
    const direction = /up|left|page up/.test(normalized) ? -1 : 1;
    const magnitude = /faster|far|page/.test(normalized) ? 0.9 : 0.46;
    container.scrollBy({
      top: direction * window.innerHeight * magnitude,
      left: /left|right/.test(normalized)
        ? direction * window.innerWidth * magnitude
        : 0,
      behavior: "smooth",
    });
    return baseResult(
      transcript,
      "scroll",
      direction > 0 ? "Scrolling." : "Scrolling up.",
      0.98,
    );
  }

  const appAction = parseApplicationVoiceCommand(normalized);
  if (appAction) {
    const target = findApplicationActionTarget(
      context.pathname,
      appAction.action,
      appAction.appLabel,
    );
    if (target) {
      activateElement(target);
      return {
        ...baseResult(
          transcript,
          "selection",
          `${appAction.action === "launch" ? "Launching" : "Focusing"} ${
            appAction.appLabel
          }.`,
          0.98,
        ),
        targetId: target.id,
      };
    }
    return {
      ...baseResult(
        transcript,
        "escalate",
        `Routing ${appAction.action} ${appAction.appLabel} through the Intent Engine.`,
        0.78,
      ),
      handled: false,
      escalatesToIntentEngine: true,
    };
  }

  if (/^(close|dismiss|cancel)$/.test(normalized)) {
    const dialogTarget = collectSemanticUiTargets(context.pathname)
      .filter((target) => /close|dismiss|cancel/i.test(target.label) && target.enabled)
      .sort((left, right) => right.priority - left.priority)[0];
    if (dialogTarget) {
      activateElement(dialogTarget);
      return {
        ...baseResult(transcript, "dialog", `Closing ${dialogTarget.label}.`, 0.9),
        targetId: dialogTarget.id,
      };
    }
    return {
      ...baseResult(
        transcript,
        "dialog",
        "I couldn't find an open dialog to close.",
        0.62,
      ),
      handled: false,
      escalatesToIntentEngine: false,
    };
  }

  const pageMatches = matchPageTarget(normalized);
  const bestPageMatch = pageMatches[0];
  if (
    /^(open|go to|show|navigate to)\b/.test(normalized) ||
    /^(home|dashboard)$/.test(normalized) ||
    (bestPageMatch?.confidence ?? 0) >= 0.86
  ) {
    const matches = pageMatches;
    const [best, second] = matches;
    if (
      best &&
      best.confidence >= 0.78 &&
      (!second || best.confidence - second.confidence >= 0.08)
    ) {
      context.navigate(best.target.path);
      return {
        ...baseResult(
          transcript,
          "navigation",
          `Opening ${best.target.label}.`,
          best.confidence,
        ),
        targetId: `page:${best.target.path}`,
      };
    }
    if (best && best.confidence >= 0.45) {
      return {
        ...baseResult(
          transcript,
          "navigation",
          "I found multiple matching pages.",
          best.confidence,
        ),
        handled: false,
        ambiguousTargets: matches
          .filter((match) => match.confidence >= 0.42)
          .slice(0, 4)
          .map((match) => ({
            id: `page:${match.target.path}`,
            label: match.target.label,
            role: "page",
          })),
      };
    }
  }

  if (
    /^(click|press|select|activate|open|focus|choose|launch|start)\b/.test(normalized)
  ) {
    const query = trimCommandPrefix(normalized);
    const candidates = collectSemanticUiTargets(context.pathname)
      .filter((target) => target.enabled)
      .map((target) => ({ target, confidence: scoreTarget(query, target) }))
      .filter((match) => match.confidence >= 0.35)
      .sort((left, right) => right.confidence - left.confidence);
    const [best, second] = candidates;
    if (
      best &&
      best.confidence >= 0.72 &&
      (!second || best.confidence - second.confidence >= 0.1)
    ) {
      activateElement(best.target);
      return {
        ...baseResult(
          transcript,
          "selection",
          `Activating ${best.target.label}.`,
          best.confidence,
        ),
        targetId: best.target.id,
      };
    }
    if (best) {
      return {
        ...baseResult(
          transcript,
          "selection",
          "I found multiple matching controls.",
          best.confidence,
        ),
        handled: false,
        ambiguousTargets: candidates.slice(0, 4).map((match) => ({
          id: match.target.id,
          label: match.target.label,
          role: match.target.role,
        })),
      };
    }
  }

  if (/^(search|find|filter|focus search|clear search)\b/.test(normalized)) {
    const search = collectSemanticUiTargets(context.pathname).find((target) =>
      /search|filter/i.test(`${target.label} ${target.role}`),
    );
    if (search) {
      search.element.focus();
      return {
        ...baseResult(transcript, "search", `Focused ${search.label}.`, 0.86),
        targetId: search.id,
      };
    }
  }

  return {
    ...baseResult(transcript, "escalate", "Routing through the Intent Engine.", 0.2),
    handled: false,
    escalatesToIntentEngine: true,
  };
};
