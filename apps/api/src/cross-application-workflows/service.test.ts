import { describe, expect, it } from "vitest";

import {
  NativeProviderRecordSchema,
  ProviderCapabilityRecordSchema,
  TrustedApplicationRecordSchema,
  type AdapterPermission,
  type NativeProviderCapability,
} from "@alexa-control/shared";
import { AdapterRegistryService } from "../adapter-sdk/service.js";
import { InMemoryAdapterSdkStore } from "../adapter-sdk/store.js";
import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import { InMemoryCoreAdapterStore } from "../core-adapters/store.js";
import { CoreAdapterService } from "../core-adapters/service.js";
import { InMemoryDeepIndexerStore } from "../deep-indexers/store.js";
import { InMemoryNativeProviderStore } from "../native-providers/store.js";
import { NativeProviderRuntime } from "../native-providers/service.js";
import { CrossApplicationWorkflowService } from "./service.js";
import { InMemoryCrossApplicationWorkflowStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
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
  const coreAdapters = new CoreAdapterService(
    new InMemoryCoreAdapterStore(),
    applicationAdapterStore,
    nativeProviderStore,
    adapterSdk,
    nativeProviders,
    () => undefined,
    now,
  );
  const service = new CrossApplicationWorkflowService(
    new InMemoryCrossApplicationWorkflowStore(),
    coreAdapters,
    () => undefined,
    now,
  );
  return { ownerId, applicationAdapterStore, nativeProviderStore, service };
};

const trustApplication = (
  ownerId: string,
  store: InMemoryApplicationAdapterStore,
  input: {
    id: string;
    applicationName: string;
    bundleIdentifier: string;
    permissions: AdapterPermission[];
  },
) => {
  store.saveTrustedApplication(
    TrustedApplicationRecordSchema.parse({
      id: input.id,
      ownerId,
      applicationName: input.applicationName,
      bundleIdentifier: input.bundleIdentifier,
      stableIdentifier: input.id,
      applicationVersion: "1.0.0",
      executablePath: null,
      executablePathUserSupplied: false,
      codeSignature: "reviewed",
      permissionsGranted: input.permissions,
      capabilities: ["navigation", "semantic_registry"],
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
  store: InMemoryNativeProviderStore,
  input: {
    id: string;
    applicationId: string;
    name: string;
    providerType: "vscode" | "chrome";
    bundleIdentifier: string;
    capabilities: NativeProviderCapability[];
  },
) => {
  store.saveProvider(
    NativeProviderRecordSchema.parse({
      id: input.id,
      ownerId,
      applicationId: input.applicationId,
      name: input.name,
      providerType: input.providerType,
      bundleIdentifier: input.bundleIdentifier,
      version: "18F.1",
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
  for (const capability of input.capabilities) {
    store.saveCapability(
      ProviderCapabilityRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        providerId: input.id,
        capability,
        inputs: [],
        outputs: ["structuredOutcome", "verification"],
        permissions: ["navigate"],
        dependencies: ["trustedApplication", "providerValidation", "providerHealth"],
        verification: `Verify ${capability}.`,
        examples: [`${input.name}.${capability}()`],
        riskLevel: "low",
        enabled: true,
        updatedAt: "2026-08-07T00:00:00.000Z",
      }),
    );
  }
};

describe("CrossApplicationWorkflowService", () => {
  it("composes a deterministic meeting-preparation DAG from an outcome", async () => {
    const { ownerId, service } = setup();

    const response = await service.compose({
      ownerId,
      body: {
        goal: "Prepare me for today's meeting",
        variables: { meetingTitle: "Design Review" },
        origin: "voice",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.graphs[0]).toMatchObject({
      status: "composed",
      deterministicComposer: true,
      plannerApplicationSpecificLogicAvailable: false,
    });
    expect(response.nodes.map((node) => node.semanticCapabilityId)).toEqual([
      "Calendar.TodayEvents",
      "NoteTaking.CreateNote",
      "Browser.OpenUrl",
      "FileManagement.SearchFiles",
    ]);
    expect(response.nodes[1]?.dependencies).toContain(response.nodes[0]?.id);
  });

  it("fails closed when execution reaches an untrusted adapter", async () => {
    const { ownerId, service } = setup();
    const composed = await service.compose({
      ownerId,
      body: { goal: "Start my development session", variables: {}, origin: "planner" },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    const started = await service.start({
      ownerId,
      sessionId: crypto.randomUUID(),
      networkState: "PRIVATE_NETWORK",
      graphId: composed.graphs[0]!.id,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(started.graphs[0]).toMatchObject({
      status: "failed",
      failureCode: "APPLICATION_NOT_TRUSTED",
    });
    expect(started.failures[0]?.summary).toContain("explicitly trusted");
  });

  it("executes healthy native-backed development nodes through core adapters", async () => {
    const { ownerId, applicationAdapterStore, nativeProviderStore, service } = setup();
    trustApplication(ownerId, applicationAdapterStore, {
      id: "vscode",
      applicationName: "VS Code",
      bundleIdentifier: "com.microsoft.VSCode",
      permissions: ["open_files", "navigate", "read_semantic_structure"],
    });
    trustApplication(ownerId, applicationAdapterStore, {
      id: "chrome",
      applicationName: "Chrome",
      bundleIdentifier: "com.google.Chrome",
      permissions: ["navigate", "read_semantic_structure"],
    });
    registerProvider(ownerId, nativeProviderStore, {
      id: "provider.vscode",
      applicationId: "vscode",
      name: "VSCodeProvider",
      providerType: "vscode",
      bundleIdentifier: "com.microsoft.VSCode",
      capabilities: ["open_workspace", "focus_terminal", "show_problems"],
    });
    registerProvider(ownerId, nativeProviderStore, {
      id: "provider.chrome",
      applicationId: "chrome",
      name: "ChromeProvider",
      providerType: "chrome",
      bundleIdentifier: "com.google.Chrome",
      capabilities: ["open_url"],
    });
    const composed = await service.compose({
      ownerId,
      body: { goal: "Start my development session", variables: {}, origin: "planner" },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    const started = await service.start({
      ownerId,
      sessionId: crypto.randomUUID(),
      networkState: "PRIVATE_NETWORK",
      graphId: composed.graphs[0]!.id,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(started.graphs[0]).toMatchObject({ status: "completed" });
    expect(started.nodes.every((node) => node.status === "completed")).toBe(true);
    expect(started.metrics[0]).toMatchObject({ successRate: 1, nodeCount: 4 });
  });
});
