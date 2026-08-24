import {
  NativeProviderRecordSchema,
  TrustedApplicationRecordSchema,
} from "@alexa-control/shared";
import { describe, expect, it } from "vitest";

import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { NativeProviderRuntime } from "./service.js";
import { InMemoryNativeProviderStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const audits: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const store = new InMemoryNativeProviderStore();
  const applicationAdapterStore = new InMemoryApplicationAdapterStore();
  const service = new NativeProviderRuntime(
    store,
    applicationAdapterStore,
    audit,
    () => new Date("2026-08-05T00:00:00.000Z"),
  );
  return { applicationAdapterStore, audits, ownerId, service, store };
};

const trustVsCode = (
  applicationAdapterStore: InMemoryApplicationAdapterStore,
  ownerId: string,
) => {
  applicationAdapterStore.saveTrustedApplication(
    TrustedApplicationRecordSchema.parse({
      id: "vscode",
      ownerId,
      applicationName: "VS Code",
      bundleIdentifier: "com.microsoft.VSCode",
      stableIdentifier: "vscode",
      applicationVersion: "1.100.0",
      executablePath: null,
      executablePathUserSupplied: false,
      codeSignature: "Developer ID Application: Microsoft Corporation",
      permissionsGranted: ["read_semantic_structure", "navigate"],
      capabilities: ["navigation", "semantic_registry", "state_inspection"],
      status: "trusted",
      lastSeenAt: "2026-08-05T00:00:00.000Z",
      trustLevel: "semantic_read",
      securityProfile: "strict",
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:00:00.000Z",
    }),
  );
};

describe("NativeProviderRuntime", () => {
  it("registers reviewed finite providers without raw automation surfaces", async () => {
    const { ownerId, service } = setup();

    const dashboard = await service.dashboard(ownerId);

    expect(dashboard.reviewedNativeProviderRuntimeAvailable).toBe(true);
    expect(dashboard.nativeCapabilityDispatcherAvailable).toBe(true);
    expect(dashboard.providerSandboxEnforced).toBe(true);
    expect(dashboard.arbitraryAppleScriptAvailable).toBe(false);
    expect(dashboard.arbitraryShellAvailable).toBe(false);
    expect(dashboard.coordinateClickingAvailable).toBe(false);
    expect(dashboard.keyboardReplayAvailable).toBe(false);
    expect(dashboard.ocrAvailable).toBe(false);
    expect(dashboard.unrestrictedAccessibilityAvailable).toBe(false);
    expect(dashboard.nativeProviders.map((provider) => provider.name)).toEqual(
      expect.arrayContaining(["VSCodeProvider", "FinderProvider", "TerminalProvider"]),
    );
    expect(
      dashboard.providerCapabilities.some(
        (capability) =>
          capability.providerId === "provider.vscode" &&
          capability.capability === "focus_explorer",
      ),
    ).toBe(true);
  });

  it("reconciles a newly reviewed finite capability for an existing provider", async () => {
    const { ownerId, service, store } = setup();
    const at = "2026-08-05T00:00:00.000Z";
    store.saveProvider(
      NativeProviderRecordSchema.parse({
        id: "provider.chrome",
        ownerId,
        applicationId: "chrome",
        name: "ChromeProvider",
        providerType: "chrome",
        bundleIdentifier: "com.google.Chrome",
        version: "17G.1",
        supportedMacosVersions: ["13", "14", "15", "16"],
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
        createdAt: at,
        updatedAt: at,
      }),
    );

    const dashboard = await service.dashboard(ownerId);

    expect(
      dashboard.providerCapabilities.some(
        (capability) =>
          capability.providerId === "provider.chrome" &&
          capability.capability === "insert_text" &&
          capability.enabled,
      ),
    ).toBe(true);
    expect(
      dashboard.nativeProviders.find((provider) => provider.id === "provider.chrome")?.status,
    ).toBe("healthy");
  });

  it("validates providers and disables them when native host health is unavailable", async () => {
    const { applicationAdapterStore, audits, ownerId, service } = setup();
    trustVsCode(applicationAdapterStore, ownerId);

    const dashboard = await service.validateProviders({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(dashboard.providerValidation[0]?.status).toBe("failed");
    expect(dashboard.providerHealth[0]?.healthScore).toBe(0);
    expect(
      dashboard.nativeProviders.every((provider) => provider.status === "disabled"),
    ).toBe(true);
    expect(audits.map((audit) => audit.eventType)).toContain(
      "NATIVE_PROVIDER_VALIDATED",
    );
  });

  it("denies dispatch for untrusted applications and records structured failure", async () => {
    const { audits, ownerId, service } = setup();

    const dashboard = await service.dispatch({
      ownerId,
      body: {
        providerId: "provider.vscode",
        capability: "launch",
        applicationId: "vscode",
        arguments: {},
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(dashboard.providerExecution[0]).toMatchObject({
      status: "denied",
      errorCode: "APPLICATION_NOT_TRUSTED",
      verificationSummary: "No macOS action was performed.",
    });
    expect(audits.map((audit) => audit.eventType)).toContain(
      "NATIVE_CAPABILITY_DISPATCH_DENIED",
    );
  });

  it("blocks semantic mutations outside the governed interaction coordinator", async () => {
    const { ownerId, service } = setup();

    const dashboard = await service.dispatch({
      ownerId,
      body: {
        providerId: "provider.chatgpt",
        capability: "insert_text",
        applicationId: "chatgpt",
        arguments: {
          target: {
            type: "COMPOSER",
            role: "AXTextArea",
            label: "composer",
            identifier: "chatgpt.composer",
            semanticId: "a".repeat(64),
            registryObjectId: "semantic.chatgpt.composer",
            registryVersion: "1",
            source: "PROVIDER",
            confidence: 0.99,
            capturedAt: "2026-08-05T00:00:00.000Z",
            expiresAt: "2026-08-05T00:01:00.000Z",
          },
          text: "bounded text",
        },
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(dashboard.providerExecution[0]).toMatchObject({
      status: "denied",
      errorCode: "GOVERNED_APPLICATION_INTERACTION_REQUIRED",
    });
  });

  it("denies dispatch until provider validation is healthy", async () => {
    const { applicationAdapterStore, ownerId, service } = setup();
    trustVsCode(applicationAdapterStore, ownerId);

    const dashboard = await service.dispatch({
      ownerId,
      body: {
        providerId: "provider.vscode",
        capability: "launch",
        applicationId: "vscode",
        arguments: {},
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(dashboard.providerExecution[0]?.errorCode).toBe("PROVIDER_NOT_HEALTHY");
  });

  it("does not fake provider execution when Mac Agent host transport is unavailable", async () => {
    const { applicationAdapterStore, ownerId, service, store } = setup();
    trustVsCode(applicationAdapterStore, ownerId);
    const baseline = await service.dashboard(ownerId);
    const provider = baseline.nativeProviders.find(
      (item) => item.id === "provider.vscode",
    );
    expect(provider).toBeDefined();
    store.saveProvider({
      ...provider!,
      status: "healthy",
      updatedAt: "2026-08-05T00:00:00.000Z",
    });

    const dashboard = await service.dispatch({
      ownerId,
      body: {
        providerId: "provider.vscode",
        capability: "launch",
        applicationId: "vscode",
        arguments: {},
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(dashboard.providerExecution[0]).toMatchObject({
      status: "denied",
      errorCode: "MAC_AGENT_PROVIDER_HOST_TRANSPORT_UNAVAILABLE",
      verificationSummary: "No macOS action was performed.",
    });
  });

  it("requires approved command registry entries for terminal command capabilities", async () => {
    const { applicationAdapterStore, ownerId, service } = setup();
    applicationAdapterStore.saveTrustedApplication(
      TrustedApplicationRecordSchema.parse({
        id: "terminal",
        ownerId,
        applicationName: "Terminal",
        bundleIdentifier: "com.apple.Terminal",
        stableIdentifier: "terminal",
        applicationVersion: "2.14",
        executablePath: null,
        executablePathUserSupplied: false,
        codeSignature: "Apple System",
        permissionsGranted: ["execute_commands", "navigate"],
        capabilities: ["terminal_input", "navigation"],
        status: "trusted",
        lastSeenAt: "2026-08-05T00:00:00.000Z",
        trustLevel: "interaction",
        securityProfile: "strict",
        createdAt: "2026-08-05T00:00:00.000Z",
        updatedAt: "2026-08-05T00:00:00.000Z",
      }),
    );

    const dashboard = await service.dispatch({
      ownerId,
      body: {
        providerId: "provider.terminal",
        capability: "run_approved_command",
        applicationId: "terminal",
        arguments: {},
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(dashboard.providerExecution[0]?.errorCode).toBe("APPROVED_COMMAND_REQUIRED");
  });
});
