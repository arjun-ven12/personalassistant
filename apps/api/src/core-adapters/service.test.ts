import { describe, expect, it } from "vitest";

import {
  NativeProviderRecordSchema,
  ProviderCapabilityRecordSchema,
  TrustedApplicationRecordSchema,
} from "@alexa-control/shared";
import { AdapterRegistryService } from "../adapter-sdk/service.js";
import { InMemoryAdapterSdkStore } from "../adapter-sdk/store.js";
import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import { InMemoryDeepIndexerStore } from "../deep-indexers/store.js";
import { InMemoryNativeProviderStore } from "../native-providers/store.js";
import { NativeProviderRuntime } from "../native-providers/service.js";
import { CoreAdapterService } from "./service.js";
import { InMemoryCoreAdapterStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const coreStore = new InMemoryCoreAdapterStore();
  const applicationAdapterStore = new InMemoryApplicationAdapterStore();
  const nativeProviderStore = new InMemoryNativeProviderStore();
  const deepIndexerStore = new InMemoryDeepIndexerStore();
  const now = () => new Date("2026-08-07T00:00:00.000Z");
  const adapterSdk = new AdapterRegistryService(
    new InMemoryAdapterSdkStore(),
    applicationAdapterStore,
    nativeProviderStore,
    deepIndexerStore,
    () => undefined,
    now,
  );
  const nativeProviders = new NativeProviderRuntime(
    nativeProviderStore,
    applicationAdapterStore,
    () => undefined,
    now,
    () => Promise.resolve({ executionRequestId: crypto.randomUUID() }),
  );
  const service = new CoreAdapterService(
    coreStore,
    applicationAdapterStore,
    nativeProviderStore,
    adapterSdk,
    nativeProviders,
    () => undefined,
    now,
  );
  return { ownerId, applicationAdapterStore, nativeProviderStore, service };
};

const trustApplication = (
  ownerId: string,
  applicationAdapterStore: InMemoryApplicationAdapterStore,
) => {
  applicationAdapterStore.saveTrustedApplication(
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
      permissionsGranted: ["read_semantic_structure", "navigate", "open_files"],
      capabilities: ["navigation", "opening_files", "semantic_registry"],
      status: "trusted",
      lastSeenAt: "2026-08-07T00:00:00.000Z",
      trustLevel: "semantic_read",
      securityProfile: "strict",
      createdAt: "2026-08-07T00:00:00.000Z",
      updatedAt: "2026-08-07T00:00:00.000Z",
    }),
  );
};

const registerProvider = (
  ownerId: string,
  nativeProviderStore: InMemoryNativeProviderStore,
) => {
  nativeProviderStore.saveProvider(
    NativeProviderRecordSchema.parse({
      id: "provider.vscode",
      ownerId,
      applicationId: "vscode",
      name: "VSCodeProvider",
      providerType: "vscode",
      bundleIdentifier: "com.microsoft.VSCode",
      version: "18E.1",
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
      createdAt: "2026-08-07T00:00:00.000Z",
      updatedAt: "2026-08-07T00:00:00.000Z",
    }),
  );
  nativeProviderStore.saveCapability(
    ProviderCapabilityRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      providerId: "provider.vscode",
      capability: "open_file",
      inputs: [],
      outputs: ["structuredOutcome", "verification"],
      permissions: ["open_files"],
      dependencies: ["trustedApplication", "providerValidation", "providerHealth"],
      verification: "Verify file opened through VS Code provider state.",
      examples: ["VSCodeProvider.open_file()"],
      riskLevel: "low",
      enabled: true,
      updatedAt: "2026-08-07T00:00:00.000Z",
    }),
  );
};

describe("CoreAdapterService", () => {
  it("exposes the complete core adapter suite through semantic capabilities", async () => {
    const { ownerId, service } = setup();

    const dashboard = await service.dashboard(ownerId);

    expect(dashboard.adapters.map((adapter) => adapter.id)).toEqual([
      "vscode",
      "finder",
      "chrome",
      "safari",
      "terminal",
      "apple_notes",
      "calendar",
      "reminders",
    ]);
    expect(dashboard.capabilities.map((capability) => capability.capabilityId)).toContain(
      "NoteTaking.CreateNote",
    );
    expect(dashboard.capabilities.map((capability) => capability.capabilityId)).toContain(
      "Calendar.TodayEvents",
    );
    expect(dashboard.rawUiAutomationAvailable).toBe(false);
    expect(dashboard.plannerApplicationSpecificLogicAvailable).toBe(false);
  });

  it("routes mapped VS Code capabilities through the reviewed native provider runtime", async () => {
    const { ownerId, applicationAdapterStore, nativeProviderStore, service } = setup();
    trustApplication(ownerId, applicationAdapterStore);
    registerProvider(ownerId, nativeProviderStore);
    await service.dashboard(ownerId);

    const response = await service.executeSemanticAction({
      ownerId,
      sessionId: crypto.randomUUID(),
      networkState: "PRIVATE_NETWORK",
      body: {
        adapterId: "vscode",
        capabilityId: "CodeEditing.OpenFile",
        arguments: {},
        origin: "planner",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.action).toMatchObject({
      adapterId: "vscode",
      capabilityId: "CodeEditing.OpenFile",
      status: "verified",
      providerId: "provider.vscode",
    });
  });

  it("fails closed for official API adapters that are not connected yet", async () => {
    const { ownerId, service } = setup();

    const response = await service.executeSemanticAction({
      ownerId,
      sessionId: crypto.randomUUID(),
      networkState: "PRIVATE_NETWORK",
      body: {
        adapterId: "apple_notes",
        capabilityId: "NoteTaking.CreateNote",
        arguments: { title: "Sprint Ideas" },
        origin: "voice",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.action).toMatchObject({
      adapterId: "apple_notes",
      status: "denied",
      errorCode: "APPLICATION_NOT_TRUSTED",
    });
  });
});
