import { describe, expect, it } from "vitest";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { GovernanceError } from "../governance/errors.js";
import { ApplicationRegistryService } from "./service.js";
import { InMemoryApplicationAdapterStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const audits: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const store = new InMemoryApplicationAdapterStore();
  const service = new ApplicationRegistryService(
    store,
    audit,
    () => new Date("2026-08-03T00:00:00.000Z"),
  );
  return { audits, ownerId, service, store };
};

const vscodeRequest = {
  id: "vscode",
  applicationName: "VS Code",
  bundleIdentifier: "com.microsoft.VSCode",
  stableIdentifier: "vscode",
  applicationVersion: "1.100.0",
  codeSignature: "Developer ID Application: Microsoft Corporation",
  permissionsGranted: ["read_semantic_structure", "navigate"],
  trustLevel: "semantic_read",
  securityProfile: "strict",
} as const;

describe("ApplicationRegistryService", () => {
  it("exposes the universal adapter framework without pixel automation", async () => {
    const { ownerId, service } = setup();

    const dashboard = await service.dashboard(ownerId);

    expect(dashboard.universalAdapterFrameworkAvailable).toBe(true);
    expect(dashboard.genericAccessibilityAdapterAvailable).toBe(true);
    expect(dashboard.applicationSpecificCoreHardcoding).toBe(false);
    expect(dashboard.pixelAutomationAvailable).toBe(false);
    expect(dashboard.ocrAutomationAvailable).toBe(false);
    expect(dashboard.coordinateReplayAvailable).toBe(false);
    expect(dashboard.untrustedApplicationControlAvailable).toBe(false);
    expect(dashboard.applicationContext[0]).toMatchObject({
      ownerId,
      currentApplicationId: null,
    });
  });

  it("trusts an application through semantic metadata and never stores caller paths", async () => {
    const { audits, ownerId, service } = setup();

    const dashboard = await service.trustApplication({
      ownerId,
      body: vscodeRequest,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(dashboard.trustedApplications).toHaveLength(1);
    expect(dashboard.trustedApplications[0]).toMatchObject({
      id: "vscode",
      bundleIdentifier: "com.microsoft.VSCode",
      executablePath: null,
      executablePathUserSupplied: false,
      status: "trusted",
    });
    expect(dashboard.adapterInstances[0]).toMatchObject({
      applicationId: "vscode",
      adapterType: "generic_accessibility",
      status: "registered",
    });
    expect(dashboard.applicationProfiles[0]?.aliases).toContain("VS Code");
    expect(dashboard.adapterPlugins[0]).toMatchObject({
      optional: true,
      status: "disabled",
      exposesApplicationApis: false,
    });
    expect(
      dashboard.applicationCapabilities.some(
        (capability) =>
          capability.applicationId === "vscode" &&
          capability.capability === "terminal_input" &&
          capability.riskLevel === "high",
      ),
    ).toBe(true);
    expect(audits.map((audit) => audit.eventType)).toContain(
      "ADAPTER_APPLICATION_TRUSTED",
    );
  });

  it("updates fine-grained permissions and exposes planner-visible capabilities", async () => {
    const { ownerId, service } = setup();
    await service.trustApplication({
      ownerId,
      body: vscodeRequest,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    const dashboard = await service.updatePermissions({
      ownerId,
      body: {
        applicationId: "vscode",
        permissions: ["read_semantic_structure", "navigate", "execute_commands"],
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(dashboard.trustedApplications[0]?.permissionsGranted).toContain(
      "execute_commands",
    );
    expect(
      dashboard.applicationPermissions.find(
        (permission) =>
          permission.applicationId === "vscode" &&
          permission.permission === "execute_commands",
      )?.granted,
    ).toBe(true);
    expect(
      dashboard.applicationHealth.some(
        (health) =>
          health.applicationId === "vscode" && health.permissionState === "partial",
      ),
    ).toBe(true);
  });

  it("records lifecycle diagnostics and audits refresh and synchronization", async () => {
    const { audits, ownerId, service } = setup();
    await service.trustApplication({
      ownerId,
      body: vscodeRequest,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    await service.refreshCapabilities({
      ownerId,
      applicationId: "vscode",
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    const dashboard = await service.synchronize({
      ownerId,
      applicationId: "vscode",
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(dashboard.applicationContext[0]?.currentApplicationId).toBe("vscode");
    expect(dashboard.applicationEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["capabilities_refreshed", "synchronized"]),
    );
    expect(dashboard.adapterMetrics.map((metric) => metric.metricName)).toEqual(
      expect.arrayContaining(["capability_refresh_ms", "adapter_synchronization_ms"]),
    );
    expect(audits.map((audit) => audit.eventType)).toEqual(
      expect.arrayContaining([
        "ADAPTER_CAPABILITIES_REFRESHED",
        "ADAPTER_SYNCHRONIZED",
      ]),
    );
  });

  it("fails closed after application trust is revoked", async () => {
    const { ownerId, service } = setup();
    await service.trustApplication({
      ownerId,
      body: vscodeRequest,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    const revoked = await service.revoke({
      ownerId,
      applicationId: "vscode",
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(revoked.trustedApplications[0]?.status).toBe("revoked");
    await expect(
      service.refreshCapabilities({
        ownerId,
        applicationId: "vscode",
        requestId: crypto.randomUUID(),
        ipAddress: "127.0.0.1",
      }),
    ).rejects.toMatchObject(
      new GovernanceError(
        403,
        "APPLICATION_NOT_TRUSTED",
        "Application must be explicitly trusted before adapter control.",
      ),
    );
  });
});
