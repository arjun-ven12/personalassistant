import { describe, expect, it, vi } from "vitest";

import {
  MacAgentUpdateRuntime,
  productionUpdateEnabled,
  type MacAgentUpdateAdapter,
  type UpdateAdapterEvent,
} from "./update-runtime.js";

const fixture = (executionActive = false) => {
  let listener: ((event: UpdateAdapterEvent) => void) | null = null;
  const adapter: MacAgentUpdateAdapter = {
    subscribe: (next) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
    checkForUpdates: vi.fn(() => Promise.resolve()),
    downloadUpdate: vi.fn(() => Promise.resolve()),
    quitAndInstall: vi.fn(),
  };
  const record = vi.fn();
  const runtime = new MacAgentUpdateRuntime({
    enabled: true,
    channel: "stable",
    currentVersion: "1.2.3",
    adapter,
    isExecutionActive: () => executionActive,
    record,
  });
  return {
    adapter,
    emit: (event: UpdateAdapterEvent) => listener?.(event),
    record,
    runtime,
  };
};

describe("Mac Agent update runtime", () => {
  it("enables update transport only for a packaged production feed profile", () => {
    expect(
      productionUpdateEnabled({
        isPackaged: true,
        developerIdSigned: true,
        environment: "production",
        provider: "generic",
        feedUrl: "https://updates.example.test/mac",
      }),
    ).toBe(true);
    expect(
      productionUpdateEnabled({
        isPackaged: true,
        developerIdSigned: true,
        environment: "development",
        provider: "generic",
        feedUrl: "https://updates.example.test/mac",
      }),
    ).toBe(false);
    expect(
      productionUpdateEnabled({
        isPackaged: true,
        developerIdSigned: false,
        environment: "production",
        provider: "generic",
        feedUrl: "https://updates.example.test/mac",
      }),
    ).toBe(false);
  });

  it("moves through check, download, and install states", async () => {
    const { adapter, emit, runtime } = fixture();
    await runtime.check();
    expect(runtime.status.phase).toBe("CHECKING");
    emit({ type: "available", version: "1.3.0" });
    expect(runtime.status.phase).toBe("AVAILABLE");
    await runtime.download();
    emit({ type: "download-progress", percent: 42.3 });
    expect(runtime.status.downloadPercent).toBe(42.3);
    emit({ type: "downloaded", version: "1.3.0" });
    await runtime.restartAndInstall();
    expect(runtime.status.phase).toBe("INSTALLING");
    expect(adapter.quitAndInstall).toHaveBeenCalledOnce();
  });

  it("defers restart while governed execution is active", async () => {
    const { adapter, emit, runtime } = fixture(true);
    emit({ type: "downloaded", version: "1.3.0" });
    await runtime.restartAndInstall();
    expect(runtime.status).toMatchObject({
      phase: "RESTART_REQUIRED",
      restartDeferred: true,
    });
    expect(adapter.quitAndInstall).not.toHaveBeenCalled();
  });

  it("fails closed when production updating is disabled", async () => {
    const runtime = new MacAgentUpdateRuntime({
      enabled: false,
      channel: "development",
      currentVersion: "1.2.3",
      adapter: fixture().adapter,
      isExecutionActive: () => false,
    });
    await expect(runtime.check()).rejects.toThrow("disabled");
    expect(runtime.status.phase).toBe("IDLE");
  });

  it("bounds updater errors before surfacing diagnostics", () => {
    const { emit, runtime } = fixture();
    emit({ type: "error", message: `network failure\n${"x".repeat(500)}` });
    expect(runtime.status.phase).toBe("FAILED");
    expect(runtime.status.message.length).toBeLessThanOrEqual(240);
    expect(runtime.status.message).not.toContain("\n");
  });
});
