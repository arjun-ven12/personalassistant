import { describe, expect, it } from "vitest";

import {
  NativeProviderRecordSchema,
  TrustedApplicationRecordSchema,
} from "@alexa-control/shared";
import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import { InMemoryNativeProviderStore } from "../native-providers/store.js";
import { InMemoryWorkspaceIntelligenceStore } from "../workspace-intelligence/store.js";
import { SemanticIndexerService } from "./service.js";
import { InMemoryDeepIndexerStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const store = new InMemoryDeepIndexerStore();
  const workspaceStore = new InMemoryWorkspaceIntelligenceStore();
  const applicationAdapters = new InMemoryApplicationAdapterStore();
  const nativeProviders = new InMemoryNativeProviderStore();
  const service = new SemanticIndexerService(
    store,
    workspaceStore,
    applicationAdapters,
    nativeProviders,
    () => undefined,
    () => new Date("2026-08-07T00:00:00.000Z"),
  );
  return { ownerId, store, workspaceStore, applicationAdapters, nativeProviders, service };
};

const trustVsCode = (
  ownerId: string,
  applicationAdapters: InMemoryApplicationAdapterStore,
  nativeProviders: InMemoryNativeProviderStore,
) => {
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
      capabilities: ["opening_files", "semantic_registry", "state_inspection"],
      status: "trusted",
      lastSeenAt: "2026-08-07T00:00:00.000Z",
      trustLevel: "semantic_read",
      securityProfile: "strict",
      createdAt: "2026-08-07T00:00:00.000Z",
      updatedAt: "2026-08-07T00:00:00.000Z",
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
      version: "18C.1",
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
};

describe("SemanticIndexerService", () => {
  it("registers reviewed provider indexers and syncs VS Code symbol objects", async () => {
    const {
      ownerId,
      workspaceStore,
      applicationAdapters,
      nativeProviders,
      service,
    } = setup();
    trustVsCode(ownerId, applicationAdapters, nativeProviders);

    const dashboard = await service.dashboard(ownerId);
    const vscodeIndexer = dashboard.indexers.find(
      (indexer) => indexer.providerId === "provider.vscode",
    );

    expect(vscodeIndexer).toMatchObject({
      indexerType: "vscode_extension",
      source: "reviewed_extension",
      noUiScraping: true,
      noOcr: true,
      noScreenshots: true,
      noUnrestrictedAccessibility: true,
    });

    const response = await service.incrementalSync({
      ownerId,
      body: { indexerId: vscodeIndexer?.id, mode: "incremental" },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    const objects = workspaceStore.listObjects(ownerId, 100);
    expect(response.session.status).toBe("completed");
    expect(objects.map((object) => object.title)).toContain("JWT validator");
    expect(response.dashboard.events.length).toBeGreaterThan(0);
    expect(response.dashboard.fingerprints.length).toBeGreaterThan(0);
    expect(response.dashboard.relationshipUpdates.length).toBeGreaterThan(0);
  });

  it("fails closed when an indexer is unavailable", async () => {
    const { ownerId, service } = setup();

    const response = await service.incrementalSync({
      ownerId,
      body: { indexerId: crypto.randomUUID(), mode: "incremental" },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.session).toMatchObject({
      status: "failed",
      failureCode: "INDEXER_NOT_AVAILABLE",
    });
    expect(response.dashboard.genericFilesystemCrawlingAvailable).toBe(false);
  });
});
