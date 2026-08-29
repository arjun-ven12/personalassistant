import { describe, expect, it } from "vitest";

import {
  connectionStateFor,
  maskDeviceId,
  reconnectDelayMs,
  resolveAgentResource,
} from "./product-runtime.js";

describe("Mac Agent product runtime", () => {
  it("maps transport failures to bounded product states", () => {
    expect(connectionStateFor({ polling: true, lastFailureCode: null, lastSuccessfulConnectionAt: null, suspended: false })).toBe("CONNECTING");
    expect(connectionStateFor({ polling: true, lastFailureCode: null, lastSuccessfulConnectionAt: new Date().toISOString(), suspended: false })).toBe("ONLINE");
    expect(connectionStateFor({ polling: true, lastFailureCode: "AGENT_EXECUTION_POLL_FAILED", lastSuccessfulConnectionAt: new Date().toISOString(), suspended: false })).toBe("RECONNECTING");
    expect(connectionStateFor({ polling: true, lastFailureCode: "TRUSTED_DEVICE_REQUIRED", lastSuccessfulConnectionAt: null, suspended: false })).toBe("DEVICE_REVOKED");
  });

  it("caps exponential reconnect delays", () => {
    expect(reconnectDelayMs(0, 5_000)).toBe(5_000);
    expect(reconnectDelayMs(3, 5_000)).toBe(40_000);
    expect(reconnectDelayMs(20, 5_000)).toBe(60_000);
  });

  it("resolves packaged resources without source-tree assumptions", () => {
    expect(resolveAgentResource({ isPackaged: true, resourcesPath: "/App/Contents/Resources", moduleDirectory: "/source/dist-electron", relativePath: "native/A.app" })).toBe("/App/Contents/Resources/native/A.app");
    expect(resolveAgentResource({ isPackaged: false, resourcesPath: "/ignored", moduleDirectory: "/source/dist-electron", relativePath: "dist-native/A.app" })).toBe("/source/dist-native/A.app");
    expect(maskDeviceId("12345678-1234-1234-1234-123456789abc")).toBe("12345678…9abc");
  });
});

