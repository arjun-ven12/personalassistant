import { describe, expect, it } from "vitest";

import {
  NativeProviderRecordSchema,
  TrustedApplicationRecordSchema,
} from "@alexa-control/shared";
import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import { InMemoryNativeProviderStore } from "../native-providers/store.js";
import { WorkspaceIntelligenceService } from "./service.js";
import { InMemoryWorkspaceIntelligenceStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const store = new InMemoryWorkspaceIntelligenceStore();
  const applicationAdapters = new InMemoryApplicationAdapterStore();
  const nativeProviders = new InMemoryNativeProviderStore();
  const service = new WorkspaceIntelligenceService(
    store,
    applicationAdapters,
    nativeProviders,
    () => undefined,
    () => new Date("2026-08-06T00:00:00.000Z"),
  );
  return { ownerId, store, applicationAdapters, nativeProviders, service };
};

describe("WorkspaceIntelligenceService", () => {
  it("discovers semantic content objects and searches them deterministically", async () => {
    const { ownerId, applicationAdapters, nativeProviders, service } = setup();
    applicationAdapters.saveTrustedApplication(
      TrustedApplicationRecordSchema.parse({
        id: "vscode",
        ownerId,
        applicationName: "VS Code",
        bundleIdentifier: "com.microsoft.VSCode",
        stableIdentifier: "vscode",
        applicationVersion: "1.0.0",
        executablePath: null,
        executablePathUserSupplied: false,
        codeSignature: "reviewed",
        permissionsGranted: ["open_files", "read_semantic_structure"],
        capabilities: ["opening_files", "semantic_registry"],
        status: "trusted",
        lastSeenAt: "2026-08-06T00:00:00.000Z",
        trustLevel: "interaction",
        securityProfile: "strict",
        createdAt: "2026-08-06T00:00:00.000Z",
        updatedAt: "2026-08-06T00:00:00.000Z",
      }),
    );
    nativeProviders.saveProvider(
      NativeProviderRecordSchema.parse({
        id: "provider.vscode",
        ownerId,
        applicationId: "vscode",
        name: "VSCodeProvider",
        providerType: "vscode",
        bundleIdentifier: "com.microsoft.VSCode",
        version: "17H.1",
        supportedMacosVersions: ["14", "15"],
        status: "healthy",
        sandboxed: true,
        arbitraryExecutionAvailable: false,
        arbitraryAppleScriptAvailable: false,
        arbitraryShellAvailable: false,
        coordinateClickingAvailable: false,
        keyboardReplayAvailable: false,
        ocrAvailable: false,
        screenshotAutomationAvailable: false,
        unrestrictedAccessibilityAvailable: false,
        createdAt: "2026-08-06T00:00:00.000Z",
        updatedAt: "2026-08-06T00:00:00.000Z",
      }),
    );

    const response = await service.search({
      ownerId,
      body: { query: "login API", limit: 5 },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.results[0]?.object).toMatchObject({
      objectType: "function",
      title: "login API",
      applicationId: "vscode",
    });
    expect(response.results[0]?.score).toBeGreaterThan(0.5);
    expect((await service.dashboard(ownerId)).relationships.length).toBeGreaterThan(0);
  });

  it("returns no results when no trusted application content matches", async () => {
    const { ownerId, service } = setup();

    const response = await service.search({
      ownerId,
      body: { query: "shopping list", limit: 5 },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.results).toEqual([]);
  });
});
