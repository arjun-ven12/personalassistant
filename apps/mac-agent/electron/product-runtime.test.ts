import { describe, expect, it } from "vitest";

import {
  connectionStateFor,
  MAC_AGENT_SECURE_STORAGE_NAME,
  maskDeviceId,
  packagedMacStatePaths,
  reconnectDelayMs,
  resolveAgentResource,
} from "./product-runtime.js";

describe("Mac Agent product runtime", () => {
  it("keeps packaged macOS state on the established trusted-device paths", () => {
    expect(MAC_AGENT_SECURE_STORAGE_NAME).toBe("Alexa Mac Agent");
    expect(
      packagedMacStatePaths({
        isPackaged: true,
        platform: "darwin",
        home: "/Users/owner",
      }),
    ).toEqual({
      userData: "/Users/owner/Library/Application Support/Alexa Mac Agent",
      logs: "/Users/owner/Library/Logs/Alexa Mac Agent",
    });
    expect(
      packagedMacStatePaths({
        isPackaged: false,
        platform: "darwin",
        home: "/Users/owner",
      }),
    ).toBeNull();
  });

  it("maps transport failures to bounded product states", () => {
    expect(
      connectionStateFor({
        polling: true,
        lastFailureCode: null,
        lastSuccessfulConnectionAt: null,
        suspended: false,
      }),
    ).toBe("CONNECTING");
    expect(
      connectionStateFor({
        polling: true,
        lastFailureCode: null,
        lastSuccessfulConnectionAt: new Date().toISOString(),
        suspended: false,
      }),
    ).toBe("ONLINE");
    expect(
      connectionStateFor({
        polling: true,
        lastFailureCode: "AGENT_EXECUTION_POLL_FAILED",
        lastSuccessfulConnectionAt: new Date().toISOString(),
        suspended: false,
      }),
    ).toBe("RECONNECTING");
    expect(
      connectionStateFor({
        polling: true,
        lastFailureCode: "TRUSTED_DEVICE_REQUIRED",
        lastSuccessfulConnectionAt: null,
        suspended: false,
      }),
    ).toBe("DEVICE_REVOKED");
  });

  it("caps exponential reconnect delays", () => {
    expect(reconnectDelayMs(0, 5_000)).toBe(5_000);
    expect(reconnectDelayMs(3, 5_000)).toBe(40_000);
    expect(reconnectDelayMs(20, 5_000)).toBe(60_000);
  });

  it("resolves packaged resources without source-tree assumptions", () => {
    expect(
      resolveAgentResource({
        isPackaged: true,
        resourcesPath: "/App/Contents/Resources",
        moduleDirectory: "/source/dist-electron",
        relativePath: "native/A.app",
      }),
    ).toBe("/App/Contents/Resources/native/A.app");
    expect(
      resolveAgentResource({
        isPackaged: false,
        resourcesPath: "/ignored",
        moduleDirectory: "/source/dist-electron",
        relativePath: "dist-native/A.app",
      }),
    ).toBe("/source/dist-native/A.app");
    expect(maskDeviceId("12345678-1234-1234-1234-123456789abc")).toBe("12345678…9abc");
  });
});
