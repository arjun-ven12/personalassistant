import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import {
  AdapterInstanceRecordSchema,
  NativeProviderRecordSchema,
} from "@alexa-control/shared";
import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { RegistryService } from "../governance/registry-service.js";
import { InMemoryNativeProviderStore } from "../native-providers/store.js";
import { ApplicationDiscoveryService } from "./service.js";
import { InMemoryApplicationDiscoveryStore } from "./store.js";

const ownerId = "00000000-0000-4000-8000-000000000001";
const deviceId = "00000000-0000-4000-8000-000000000002";
const now = () => new Date("2026-08-14T00:00:00.000Z");

const discovered = (displayName: string, bundleIdentifier: string) => ({
  displayName,
  bundleIdentifier,
  bundlePath: `/Applications/${displayName}.app`,
  executableName: displayName,
  version: "1.0",
  buildVersion: "100",
  iconPath: `/Applications/${displayName}.app/Contents/Resources/${displayName}.icns`,
  bundleUrl: `file:///Applications/${displayName}.app`,
  isSystemApp: false,
  isUserInstalled: false,
  source: "mac_agent_startup" as const,
  discoveredAt: "2026-08-14T00:00:00.000Z",
});

describe("ApplicationDiscoveryService", () => {
  it("creates deny-by-default application records and preserves policy on rediscovery", async () => {
    const governanceStore = new InMemoryGovernanceStore();
    const registry = new RegistryService(governanceStore);
    const service = new ApplicationDiscoveryService(
      new InMemoryApplicationDiscoveryStore(),
      governanceStore,
      new InMemoryApplicationAdapterStore(),
      new InMemoryNativeProviderStore(),
      () => undefined,
      now,
    );

    const first = await service.ingest(ownerId, deviceId, "request-1", "127.0.0.1", {
      operation: "application_discovery_ingest",
      source: "mac_agent_startup",
      applications: [discovered("Visual Studio Code", "com.microsoft.VSCode")],
    });

    expect(first.createdApplications).toBe(1);
    const application = first.installations[0]!;
    const policyRecord = await registry.getApplication(ownerId, application.applicationId);
    expect(policyRecord.enabled).toBe(false);
    expect(policyRecord.permissions.open).toBe(false);

    await registry.updateApplication(ownerId, application.applicationId, {
      enabled: true,
      permissions: { ...policyRecord.permissions, focus: true },
      riskOverrides: { "app.focus": "medium" },
    });

    await service.ingest(ownerId, deviceId, "request-2", "127.0.0.1", {
      operation: "application_discovery_ingest",
      source: "mac_agent_startup",
      applications: [
        {
          ...discovered("Visual Studio Code", "com.microsoft.VSCode"),
          version: "2.0",
        },
      ],
    });

    const preserved = await registry.getApplication(ownerId, application.applicationId);
    expect(preserved.enabled).toBe(true);
    expect(preserved.permissions.focus).toBe(true);
    expect(preserved.riskOverrides["app.focus"]).toBe("medium");
  });

  it("marks disappeared apps unavailable instead of deleting installation state", async () => {
    const store = new InMemoryApplicationDiscoveryStore();
    const service = new ApplicationDiscoveryService(
      store,
      new InMemoryGovernanceStore(),
      new InMemoryApplicationAdapterStore(),
      new InMemoryNativeProviderStore(),
      () => undefined,
      now,
    );

    await service.ingest(ownerId, deviceId, "request-1", "127.0.0.1", {
      operation: "application_discovery_ingest",
      source: "mac_agent_startup",
      applications: [
        discovered("Finder", "com.apple.finder"),
        discovered("Terminal", "com.apple.Terminal"),
      ],
    });
    const second = await service.ingest(ownerId, deviceId, "request-2", "127.0.0.1", {
      operation: "application_discovery_ingest",
      source: "mac_agent_startup",
      applications: [discovered("Finder", "com.apple.finder")],
    });

    expect(second.markedUnavailable).toBe(1);
    const installations = await service.listInstallations(ownerId, deviceId);
    expect(installations).toHaveLength(2);
    expect(
      installations.find((item) => item.bundleIdentifier === "com.apple.Terminal")
        ?.installed,
    ).toBe(false);
  });

  it("links only already registered adapters and native providers", async () => {
    const governanceStore = new InMemoryGovernanceStore();
    const adapterStore = new InMemoryApplicationAdapterStore();
    const nativeProviderStore = new InMemoryNativeProviderStore();
    const service = new ApplicationDiscoveryService(
      new InMemoryApplicationDiscoveryStore(),
      governanceStore,
      adapterStore,
      nativeProviderStore,
      () => undefined,
      now,
    );

    const first = await service.ingest(ownerId, deviceId, "request-1", "127.0.0.1", {
      operation: "application_discovery_ingest",
      source: "mac_agent_startup",
      applications: [discovered("Safari", "com.apple.Safari")],
    });
    const applicationId = first.installations[0]!.applicationId;
    adapterStore.saveAdapterInstance(
      AdapterInstanceRecordSchema.parse({
        id: randomUUID(),
        ownerId,
        applicationId,
        adapterType: "generic_accessibility",
        status: "registered",
        interfaceVersion: "1",
        health: "registered",
        synchronizedAt: null,
        createdAt: now().toISOString(),
        updatedAt: now().toISOString(),
      }),
    );
    nativeProviderStore.saveProvider(
      NativeProviderRecordSchema.parse({
        id: "provider.safari",
        ownerId,
        applicationId,
        name: "Safari",
        providerType: "safari",
        bundleIdentifier: "com.apple.Safari",
        version: "1",
        supportedMacosVersions: ["14"],
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
        createdAt: now().toISOString(),
        updatedAt: now().toISOString(),
      }),
    );

    const second = await service.ingest(ownerId, deviceId, "request-2", "127.0.0.1", {
      operation: "application_discovery_ingest",
      source: "mac_agent_startup",
      applications: [discovered("Safari", "com.apple.Safari")],
    });

    expect(second.installations[0]!.supportedAdapterId).toMatch(
      /^[0-9a-f-]{36}$/u,
    );
    expect(second.installations[0]!.nativeProviderId).toBe("provider.safari");
    expect(second.dynamicAdaptersCreated).toBe(false);
    expect(second.permissionsGranted).toBe(false);
  });
});
