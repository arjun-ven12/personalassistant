import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseApplicationVoiceCommand,
  runDeterministicVoiceNavigation,
} from "./voiceNavigation.js";

const context = () => ({
  pathname: "/",
  navigate: vi.fn(),
  goBack: vi.fn(),
  goForward: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
});

describe("Deterministic voice navigation", () => {
  afterEach(() => {
    if (typeof document !== "undefined") document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const installButtonDom = (labels: string[]) => {
    const buttons = labels.map((label) => {
      const button = {
        dataset: {},
        tagName: "BUTTON",
        textContent: label,
        click: vi.fn(),
        focus: vi.fn(),
        hasAttribute: vi.fn(() => false),
        getAttribute: vi.fn((name: string) =>
          name === "role" || name === "aria-label" || name === "aria-disabled"
            ? null
            : null,
        ),
        getBoundingClientRect: vi.fn(() => ({
          width: 120,
          height: 36,
          top: 0,
          left: 0,
          right: 120,
          bottom: 36,
        })),
        dispatchEvent: vi.fn(() => true),
      };
      return button;
    });
    const querySelectorAll = vi.fn((selector: string) =>
      selector === "button" || selector.includes("button") ? buttons : [],
    );
    vi.stubGlobal("document", {
      documentElement: {},
      querySelectorAll,
      querySelector: vi.fn(() => null),
      body: { innerHTML: "", append: vi.fn() },
    });
    vi.stubGlobal("window", {
      getComputedStyle: vi.fn(() => ({ visibility: "visible", display: "block" })),
      innerHeight: 800,
      innerWidth: 1200,
    });
    vi.stubGlobal(
      "CustomEvent",
      class {
        readonly type: string;
        readonly detail: unknown;
        constructor(type: string, init?: { detail?: unknown }) {
          this.type = type;
          this.detail = init?.detail;
        }
      },
    );
    return buttons;
  };

  it("opens built-in pages without AI escalation", () => {
    const ctx = context();
    const result = runDeterministicVoiceNavigation("open commands", ctx);

    expect(result.handled).toBe(true);
    expect(result.escalatesToIntentEngine).toBe(false);
    expect(result.kind).toBe("navigation");
    expect(ctx.navigate).toHaveBeenCalledWith("/automation?tab=commands");
  });

  it("routes promoted pages to first-class destinations", () => {
    const ctx = context();

    runDeterministicVoiceNavigation("open conversations", ctx);
    runDeterministicVoiceNavigation("open workflows", ctx);
    runDeterministicVoiceNavigation("open skills", ctx);
    runDeterministicVoiceNavigation("open applications", ctx);
    runDeterministicVoiceNavigation("open approvals", ctx);

    expect(ctx.navigate).toHaveBeenCalledWith("/conversation");
    expect(ctx.navigate).toHaveBeenCalledWith("/workflows");
    expect(ctx.navigate).toHaveBeenCalledWith("/skills");
    expect(ctx.navigate).toHaveBeenCalledWith("/applications");
    expect(ctx.navigate).toHaveBeenCalledWith("/approvals");
  });

  it("supports command studio aliases", () => {
    const ctx = context();
    const result = runDeterministicVoiceNavigation("create command", ctx);

    expect(result.handled).toBe(true);
    expect(result.targetId).toBe("page:/automation?tab=demonstrations");
    expect(ctx.navigate).toHaveBeenCalledWith("/automation?tab=demonstrations");
  });

  it("routes plain settings and voice settings deterministically", () => {
    const settings = context();
    const settingsResult = runDeterministicVoiceNavigation("open settings", settings);
    expect(settingsResult.handled).toBe(true);
    expect(settingsResult.ambiguousTargets).toHaveLength(0);
    expect(settings.navigate).toHaveBeenCalledWith("/security?tab=sessions");

    const voice = context();
    const voiceResult = runDeterministicVoiceNavigation("open voice settings", voice);
    expect(voiceResult.handled).toBe(true);
    expect(voiceResult.ambiguousTargets).toHaveLength(0);
    expect(voice.navigate).toHaveBeenCalledWith("/voice");
  });

  it("treats launch app commands as application actions instead of ambiguous controls", () => {
    const [launch] = installButtonDom([
      "Launch VS Code",
      "focus VS Code",
      "focus_explorer VS Code",
      "show_problems VS Code",
    ]);
    const ctx = context();

    const result = runDeterministicVoiceNavigation("launch VS Code", ctx);

    expect(result.handled).toBe(true);
    expect(result.ambiguousTargets).toHaveLength(0);
    expect(result.feedback).toBe("Launching VS Code.");
    expect(launch?.click).toHaveBeenCalledOnce();
  });

  it("supports explicit open app phrasing for native app launch", () => {
    const [launch] = installButtonDom(["Launch VS Code", "open_file VS Code"]);
    const ctx = context();

    const result = runDeterministicVoiceNavigation("open app visual studio code", ctx);

    expect(result.handled).toBe(true);
    expect(result.targetId).toContain("Launch VS Code");
    expect(launch?.click).toHaveBeenCalledOnce();
  });

  it("supports focus app phrasing without colliding with focus explorer", () => {
    const [focus] = installButtonDom(["focus VS Code", "focus_explorer VS Code"]);
    const ctx = context();

    const result = runDeterministicVoiceNavigation("focus app VS Code", ctx);

    expect(result.handled).toBe(true);
    expect(result.feedback).toBe("Focusing VS Code.");
    expect(focus?.click).toHaveBeenCalledOnce();
  });

  it("parses app launch commands for global provider dispatch", () => {
    expect(parseApplicationVoiceCommand("launch VS Code")).toEqual({
      action: "launch",
      appLabel: "VS Code",
      providerType: "vscode",
    });
    expect(parseApplicationVoiceCommand("switch to Terminal")).toEqual({
      action: "focus",
      appLabel: "Terminal",
      providerType: "terminal",
    });
  });

  it("handles voice session stop locally", () => {
    const ctx = context();
    const result = runDeterministicVoiceNavigation("stop listening", ctx);

    expect(result.handled).toBe(true);
    expect(result.kind).toBe("session");
    expect(ctx.stop).toHaveBeenCalledOnce();
  });

  it("answers simple greetings locally instead of getting stuck understanding", () => {
    const ctx = context();
    const result = runDeterministicVoiceNavigation("hello", ctx);

    expect(result.handled).toBe(true);
    expect(result.kind).toBe("conversation");
    expect(result.escalatesToIntentEngine).toBe(false);
    expect(result.feedback).toBe("Hey — I’m here.");
  });

  it("escalates unknown commands to the Intent Engine", () => {
    const ctx = context();
    const result = runDeterministicVoiceNavigation(
      "plan a secure refactor of the auth system",
      ctx,
    );

    expect(result.handled).toBe(false);
    expect(result.escalatesToIntentEngine).toBe(true);
  });
});
