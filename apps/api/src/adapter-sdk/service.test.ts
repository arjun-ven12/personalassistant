import { describe, expect, it } from "vitest";

import {
  ApplicationCapabilityRecordSchema,
  NativeProviderRecordSchema,
} from "@alexa-control/shared";
import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import { ApplicationRegistryService } from "../application-adapters/service.js";
import { InMemoryDeepIndexerStore } from "../deep-indexers/store.js";
import { InMemoryNativeProviderStore } from "../native-providers/store.js";
import { AdapterRegistryService } from "./service.js";
import { InMemoryAdapterSdkStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const applicationAdapterStore = new InMemoryApplicationAdapterStore();
  const nativeProviderStore = new InMemoryNativeProviderStore();
  const deepIndexerStore = new InMemoryDeepIndexerStore();
  const sdkStore = new InMemoryAdapterSdkStore();
  const now = () => new Date("2026-08-07T00:00:00.000Z");
  const applicationAdapters = new ApplicationRegistryService(
    applicationAdapterStore,
    () => undefined,
    now,
  );
  const adapterSdk = new AdapterRegistryService(
    sdkStore,
    applicationAdapterStore,
    nativeProviderStore,
    deepIndexerStore,
    () => undefined,
    now,
  );
  return {
    ownerId,
    applicationAdapterStore,
    nativeProviderStore,
    applicationAdapters,
    adapterSdk,
  };
};

describe("AdapterRegistryService", () => {
  it("creates SDK contracts from existing trusted adapter instances", async () => {
    const {
      ownerId,
      applicationAdapterStore,
      nativeProviderStore,
      applicationAdapters,
      adapterSdk,
    } = setup();
    await applicationAdapters.trustApplication({
      ownerId,
      body: {
        id: "vscode",
        applicationName: "VS Code",
        bundleIdentifier: "com.microsoft.VSCode",
        stableIdentifier: "vscode",
        applicationVersion: "1.0.0",
        codeSignature: "reviewed",
        permissionsGranted: ["read_semantic_structure", "open_files", "navigate"],
        trustLevel: "semantic_read",
        securityProfile: "strict",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    nativeProviderStore.saveProvider(
      NativeProviderRecordSchema.parse({
        id: "provider.vscode",
        ownerId,
        applicationId: "vscode",
        name: "VSCodeProvider",
        providerType: "vscode",
        bundleIdentifier: "com.microsoft.VSCode",
        version: "18D.1",
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

    const dashboard = await adapterSdk.dashboard(ownerId);
    const contract = dashboard.contracts[0];

    expect(contract).toMatchObject({
      applicationId: "vscode",
      providerId: "provider.vscode",
      source: "built_in",
      reviewed: true,
      sandboxed: true,
      plannerAgnostic: true,
      rawUiAutomationAvailable: false,
      genericExecutionAvailable: false,
    });
    expect(contract?.semanticDomains).toContain("code_editing");
    expect(contract?.semanticCapabilityIds).toContain("CodeEditing.OpenFile");
    expect(dashboard.metadata.duplicatesProviderRegistry).toBe(false);
    expect(dashboard.sandboxes[0]?.unrestrictedOsApisAvailable).toBe(false);
    expect(applicationAdapterStore.listAdapterInstances(ownerId, 10)).toHaveLength(1);
  });

  it("records audited lifecycle transitions without granting execution authority", async () => {
    const { ownerId, applicationAdapters, adapterSdk } = setup();
    await applicationAdapters.trustApplication({
      ownerId,
      body: {
        id: "finder",
        applicationName: "Finder",
        bundleIdentifier: "com.apple.finder",
        stableIdentifier: "finder",
        applicationVersion: "1.0.0",
        codeSignature: "reviewed",
        permissionsGranted: ["read_semantic_structure"],
        trustLevel: "metadata_only",
        securityProfile: "strict",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    const dashboard = await adapterSdk.dashboard(ownerId);
    const adapterInstanceId = dashboard.contracts[0]!.adapterInstanceId;
    const transitioned = await adapterSdk.transition({
      ownerId,
      body: {
        adapterInstanceId,
        toState: "disabled",
        reason: "Owner disabled test adapter.",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(transitioned.contracts[0]).toMatchObject({
      adapterInstanceId,
      lifecycleState: "disabled",
      rawUiAutomationAvailable: false,
    });
    expect(transitioned.usage[0]).toMatchObject({
      operation: "shutdown",
      outcome: "success",
    });
  });

  it("deduplicates legacy application capability records when composing SDK contracts", async () => {
    const { ownerId, applicationAdapterStore, applicationAdapters, adapterSdk } = setup();
    await applicationAdapters.trustApplication({
      ownerId,
      body: {
        id: "chrome",
        applicationName: "Chrome",
        bundleIdentifier: "com.google.Chrome",
        stableIdentifier: "chrome",
        applicationVersion: "1.0.0",
        codeSignature: "reviewed",
        permissionsGranted: ["navigate"],
        trustLevel: "semantic_read",
        securityProfile: "strict",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    const original = applicationAdapterStore.listApplicationCapabilities(ownerId, 100)[0]!;
    for (let index = 0; index < 100; index += 1) {
      applicationAdapterStore.saveApplicationCapability(
        ApplicationCapabilityRecordSchema.parse({ ...original, id: crypto.randomUUID() }),
      );
    }

    const dashboard = await adapterSdk.dashboard(ownerId);

    expect(dashboard.contracts[0]?.capabilities).toEqual(
      expect.arrayContaining([original.capability]),
    );
    expect(dashboard.contracts[0]?.capabilities).toHaveLength(
      new Set(applicationAdapterStore.listApplicationCapabilities(ownerId, 200).map((record) => record.capability)).size,
    );
  });
});
