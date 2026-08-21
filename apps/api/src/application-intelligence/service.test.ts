import { describe, expect, it } from "vitest";

import {
  NativeProviderRecordSchema,
  ProviderCapabilityRecordSchema,
  ProviderHealthRecordSchema,
  TrustedApplicationRecordSchema,
} from "@alexa-control/shared";
import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import { InMemoryNativeProviderStore } from "../native-providers/store.js";
import { ApplicationIntelligenceService } from "./service.js";
import { InMemoryApplicationIntelligenceStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const store = new InMemoryApplicationIntelligenceStore();
  const applicationAdapters = new InMemoryApplicationAdapterStore();
  const nativeProviders = new InMemoryNativeProviderStore();
  const service = new ApplicationIntelligenceService(
    store,
    applicationAdapters,
    nativeProviders,
    () => undefined,
    () => new Date("2026-08-06T00:00:00.000Z"),
  );
  return { ownerId, store, applicationAdapters, nativeProviders, service };
};

describe("ApplicationIntelligenceService", () => {
  it("selects a trusted provider for an application-independent capability", async () => {
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
        permissionsGranted: ["open_files", "navigate", "read_semantic_structure"],
        capabilities: ["opening_files", "navigation", "semantic_registry"],
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
    nativeProviders.saveCapability(
      ProviderCapabilityRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        providerId: "provider.vscode",
        capability: "open_file",
        inputs: ["registered_file"],
        outputs: ["focused_file"],
        permissions: ["open_files"],
        dependencies: [],
        verification: "Verify file is open in VS Code.",
        examples: ["Open file"],
        riskLevel: "low",
        enabled: true,
        updatedAt: "2026-08-06T00:00:00.000Z",
      }),
    );
    nativeProviders.saveHealth(
      ProviderHealthRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        providerId: "provider.vscode",
        status: "healthy",
        availability: 1,
        latencyMs: 12,
        executionSuccessRate: 1,
        verificationFailureRate: 0,
        permissionState: "granted",
        applicationVersion: "1.0.0",
        healthScore: 1,
        checkedAt: "2026-08-06T00:00:00.000Z",
      }),
    );

    const response = await service.selectProvider({
      ownerId,
      body: { capabilityId: "CodeEditing.OpenFile", origin: "planner" },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.selection).toMatchObject({
      selected: true,
      selectedApplicationId: "vscode",
      selectedProviderId: "provider.vscode",
      capabilityId: "CodeEditing.OpenFile",
    });
    expect(response.selection.candidates[0]?.score).toBeGreaterThan(0.8);
  });

  it("fails closed when no trusted provider exposes the semantic capability", async () => {
    const { ownerId, service } = setup();

    const response = await service.selectProvider({
      ownerId,
      body: { capabilityId: "NoteTaking.CreateNote", origin: "voice" },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.selection).toMatchObject({
      selected: false,
      selectedApplicationId: null,
      selectedProviderId: null,
      capabilityId: "NoteTaking.CreateNote",
    });
    expect(response.selection.decisionReason).toContain("No trusted provider");
  });
});
