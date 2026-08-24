import { describe, expect, it, vi } from "vitest";

import { MacNativeProviderHost } from "./native-providers.js";

describe("MacNativeProviderHost", () => {
  it("reports finite reviewed providers without raw automation surfaces", () => {
    const host = new MacNativeProviderHost(
      () => Promise.resolve(),
      () => new Date("2026-08-05T00:00:00.000Z"),
    );

    const status = host.status(false);

    expect(status.hostVersion).toBe("17H.1");
    expect(status.nativeBridgeStatus).toBe("available_reviewed");
    expect(status.arbitraryExecutionAvailable).toBe(false);
    expect(status.arbitraryAppleScriptAvailable).toBe(false);
    expect(status.arbitraryShellAvailable).toBe(false);
    expect(status.coordinateClickingAvailable).toBe(false);
    expect(status.keyboardReplayAvailable).toBe(false);
    expect(status.ocrAvailable).toBe(false);
    expect(status.screenshotAutomationAvailable).toBe(false);
    expect(status.unrestrictedAccessibilityAvailable).toBe(false);
    expect(
      status.providerImplementations.find(
        (provider) => provider.providerId === "provider.vscode",
      )?.implementedCapabilities,
    ).toEqual([
      "launch",
      "focus",
      "focus_semantic_control",
      "insert_text",
      "replace_selection",
    ]);
  });

  it("launches a reviewed provider through fixed Launch Services arguments", async () => {
    const runner = vi.fn(() => Promise.resolve());
    const host = new MacNativeProviderHost(runner);

    const result = await host.execute({
      providerId: "provider.vscode",
      applicationId: "vscode",
      capability: "launch",
      arguments: {},
    });

    expect(result.status).toBe("verified");
    expect(result.verified).toBe(true);
    expect(result.nativeBridgeUsed).toBe(false);
    expect(runner).toHaveBeenNthCalledWith(1, "/usr/bin/open", [
      "-b",
      "com.microsoft.VSCode",
    ]);
    expect(runner).toHaveBeenNthCalledWith(2, "/usr/bin/pgrep", ["-x", "Code"]);
  });

  it("opens browser URLs but rejects non-http schemes", async () => {
    const runner = vi.fn(() => Promise.resolve());
    const host = new MacNativeProviderHost(runner);

    const ok = await host.execute({
      providerId: "provider.chrome",
      applicationId: "chrome",
      capability: "open_url",
      arguments: { url: "http://localhost:3000/dashboard" },
    });
    expect(ok.status).toBe("verified");
    expect(runner).toHaveBeenNthCalledWith(1, "/usr/bin/open", [
      "-b",
      "com.google.Chrome",
      "http://localhost:3000/dashboard",
    ]);

    const denied = await host.execute({
      providerId: "provider.chrome",
      applicationId: "chrome",
      capability: "open_url",
      arguments: { url: "file:///Users/example/secrets.txt" },
    });
    expect(denied.status).toBe("failed");
    expect(denied.verified).toBe(false);
  });

  it("fails closed for unsupported semantic app actions", async () => {
    const runner = vi.fn(() => Promise.resolve());
    const host = new MacNativeProviderHost(runner);

    const result = await host.execute({
      providerId: "provider.vscode",
      applicationId: "vscode",
      capability: "focus_explorer",
      arguments: {},
    });

    expect(result.status).toBe("unsupported");
    expect(result.errorCode).toBe("REVIEWED_BRIDGE_REQUIRED");
    expect(result.verified).toBe(false);
    expect(runner).not.toHaveBeenCalled();
  });

  it("opens only Mac-Agent-owned special Finder folders", async () => {
    const runner = vi.fn(() => Promise.resolve());
    const host = new MacNativeProviderHost(runner, undefined, {
      downloads: () => "/Users/owner/Downloads",
      desktop: () => "/Users/owner/Desktop",
    });

    const result = await host.execute({
      providerId: "provider.finder",
      applicationId: "finder",
      capability: "focus_downloads",
      arguments: {},
    });

    expect(result.status).toBe("verified");
    expect(runner).toHaveBeenNthCalledWith(1, "/usr/bin/open", [
      "/Users/owner/Downloads",
    ]);
    expect(runner).toHaveBeenNthCalledWith(2, "/usr/bin/pgrep", ["-x", "Finder"]);
  });

  it("routes bounded text insertion through the narrow semantic bridge", async () => {
    const runner = vi.fn(() => Promise.resolve());
    const semanticBridge = {
      execute: vi.fn(() =>
        Promise.resolve({
          status: "SUCCESS" as const,
          semanticId: "a".repeat(64),
          matchedCount: 1,
        }),
      ),
    };
    const host = new MacNativeProviderHost(
      runner,
      undefined,
      { downloads: () => "", desktop: () => "" },
      semanticBridge,
    );
    const target = {
      type: "COMPOSER",
      role: "AXTextArea",
      label: "Message ChatGPT",
      identifier: "chatgpt.composer",
      semanticId: "a".repeat(64),
      source: "EXPLICIT",
      confidence: 0.98,
      capturedAt: "2026-08-05T00:00:00.000Z",
      expiresAt: "2026-08-05T00:01:00.000Z",
    };

    const result = await host.execute({
      providerId: "provider.chatgpt",
      applicationId: "chatgpt",
      capability: "insert_text",
      arguments: { target, text: "hello from Alexa" },
    });

    expect(result).toMatchObject({
      status: "verified",
      nativeBridgeUsed: true,
      semanticId: "a".repeat(64),
      matchedCount: 1,
    });
    expect(semanticBridge.execute).toHaveBeenCalledWith({
      operation: "insert_text",
      bundleIdentifier: "com.openai.chat",
      target,
      text: "hello from Alexa",
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("does not fall back when the semantic bridge blocks a secure target", async () => {
    const semanticBridge = {
      execute: vi.fn(() =>
        Promise.resolve({
          status: "SECURE_TARGET_BLOCKED" as const,
          semanticId: "b".repeat(64),
          matchedCount: 1,
        }),
      ),
    };
    const runner = vi.fn(() => Promise.resolve());
    const host = new MacNativeProviderHost(
      runner,
      undefined,
      { downloads: () => "", desktop: () => "" },
      semanticBridge,
    );
    const result = await host.execute({
      providerId: "provider.chrome",
      applicationId: "chrome",
      capability: "insert_text",
      arguments: {
        target: {
          type: "TEXT_FIELD",
          role: "AXSecureTextField",
          label: "Password",
          identifier: "password",
          semanticId: "b".repeat(64),
          source: "EXPLICIT",
          confidence: 0.99,
          capturedAt: "2026-08-05T00:00:00.000Z",
          expiresAt: "2026-08-05T00:01:00.000Z",
        },
        text: "not-written",
      },
    });

    expect(result).toMatchObject({
      status: "denied",
      errorCode: "SECURE_TARGET_BLOCKED",
      nativeBridgeUsed: true,
    });
    expect(runner).not.toHaveBeenCalled();
  });
});
