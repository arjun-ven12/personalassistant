import { describe, expect, it, vi } from "vitest";
import {
  ApplicationContextSnapshotRecordSchema,
  TrustedApplicationRecordSchema,
} from "@alexa-control/shared";

import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import { InMemoryApplicationIntelligenceStore } from "../application-intelligence/store.js";
import { InMemoryCoreAdapterStore } from "../core-adapters/store.js";
import { ActiveContextService } from "./service.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const deviceId = "22222222-2222-4222-8222-222222222222";
const capturedAt = "2026-08-21T08:00:00.000Z";

const setup = () => {
  let now = new Date(capturedAt);
  const applications = new InMemoryApplicationAdapterStore();
  const snapshots = new InMemoryCoreAdapterStore();
  const intelligence = new InMemoryApplicationIntelligenceStore();
  const audit = vi.fn(() => undefined);
  const service = new ActiveContextService(
    applications,
    snapshots,
    intelligence,
    audit,
    () => now,
  );
  return {
    applications,
    snapshots,
    audit,
    service,
    advance: (milliseconds: number) => {
      now = new Date(now.getTime() + milliseconds);
    },
  };
};

const trustVsCode = (applications: InMemoryApplicationAdapterStore) =>
  applications.saveTrustedApplication(
    TrustedApplicationRecordSchema.parse({
      id: "vscode",
      ownerId,
      applicationName: "Visual Studio Code",
      bundleIdentifier: "com.microsoft.VSCode",
      stableIdentifier: "vscode",
      applicationVersion: "1.0.0",
      executablePath: null,
      executablePathUserSupplied: false,
      codeSignature: "reviewed",
      permissionsGranted: ["read_semantic_structure"],
      capabilities: ["semantic_registry", "state_inspection"],
      status: "trusted",
      lastSeenAt: capturedAt,
      trustLevel: "semantic_read",
      securityProfile: "strict",
      createdAt: capturedAt,
      updatedAt: capturedAt,
    }),
  );

const observation = (overrides: Record<string, unknown> = {}) => ({
  application: {
    name: "Visual Studio Code",
    bundleIdentifier: "com.microsoft.VSCode",
    processIdentifier: 42,
  },
  window: { title: "service.ts — personalassistant" },
  document: {
    title: "service.ts",
    type: "source",
    uri: "file:///repo/service.ts",
    content: "The request failed because the provider timed out.",
  },
  selection: {
    text: "throw new Error('failed')",
    semanticType: "AXTextArea",
    secure: false,
  },
  accessibilityTrusted: true,
  capturedAt,
  ...overrides,
});

describe("ActiveContextService", () => {
  it("composes trusted adapter context with deterministic provenance", async () => {
    const { applications, snapshots, service } = setup();
    trustVsCode(applications);
    snapshots.saveContextSnapshot(
      ApplicationContextSnapshotRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        adapterId: "vscode",
        applicationId: "vscode",
        currentDocument: "canonical-service.ts",
        currentWorkspace: "personalassistant",
        currentTab: null,
        currentFolder: null,
        currentProject: "Alexa",
        currentReminderList: null,
        currentCalendar: null,
        currentSelection: "const canonical = true;",
        sessionIds: [],
        capturedAt,
      }),
    );

    const result = await service.update({
      ownerId,
      deviceId,
      observation: observation(),
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(result.context?.status).toBe("CURRENT");
    expect(result.context?.document?.title).toBe("canonical-service.ts");
    expect(result.context?.document?.content).toContain("provider timed out");
    expect(result.context?.selection?.text).toBe("const canonical = true;");
    expect(result.context?.sources).toEqual([
      "REVIEWED_ADAPTER",
      "REVIEWED_NATIVE_PROVIDER",
      "ACCESSIBILITY_METADATA",
      "APPLICATION_IDENTITY",
    ]);
    expect(service.toAIContext(result.context!).trustLevel).toBe("UNTRUSTED");
    expect(service.toAIContext(result.context!).content).toMatchObject({
      authority: "CONTEXT_ONLY",
    });
  });

  it("exposes identity only for an unknown application", async () => {
    const { service } = setup();
    const result = await service.update({
      ownerId,
      deviceId,
      observation: observation({
        application: {
          name: "Unknown Editor",
          bundleIdentifier: "com.example.UnknownEditor",
          processIdentifier: 55,
        },
      }),
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(result.context).toMatchObject({
      status: "DEGRADED",
      permission: "IDENTITY_ONLY",
      window: null,
      document: null,
      selection: null,
    });
  });

  it("suppresses secure content and audits only the transition", async () => {
    const { applications, service, audit } = setup();
    trustVsCode(applications);
    const secure = observation({
      selection: {
        text: "super-secret",
        semanticType: "AXSecureTextField",
        secure: true,
      },
    });
    const input = {
      ownerId,
      deviceId,
      observation: secure,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    };
    const first = await service.update(input);
    await service.update({ ...input, requestId: crypto.randomUUID() });

    expect(first.context?.selection).toBeNull();
    expect(first.context?.secureContentSuppressed).toBe(true);
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it("expires context without leaking the previous content", async () => {
    const { applications, service, advance } = setup();
    trustVsCode(applications);
    await service.update({
      ownerId,
      deviceId,
      observation: observation(),
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    advance(15_001);

    expect(service.snapshot(ownerId, deviceId)).toBeNull();
    expect(service.current(ownerId, deviceId).context).toMatchObject({
      status: "STALE",
      window: null,
      document: null,
      selection: null,
    });
    expect(service.current(ownerId, crypto.randomUUID()).context).toBeNull();
  });

  it("switches applications atomically and returns immutable snapshots", async () => {
    const { applications, service } = setup();
    trustVsCode(applications);
    await service.update({
      ownerId,
      deviceId,
      observation: observation(),
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    const captured = service.snapshot(ownerId, deviceId)!;
    captured.contextSummary = "tampered";
    await service.update({
      ownerId,
      deviceId,
      observation: observation({
        application: {
          name: "Google Chrome",
          bundleIdentifier: "com.google.Chrome",
          processIdentifier: 84,
        },
        window: { title: "OpenAI Docs" },
        document: null,
        selection: null,
      }),
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(service.current(ownerId, deviceId).context?.application.name).toBe(
      "Google Chrome",
    );
    expect(service.previous(ownerId, deviceId)?.application.name).toBe(
      "Visual Studio Code",
    );
    expect(service.previous(ownerId, deviceId)?.contextSummary).not.toBe("tampered");
  });

  it("denies blocked applications without falling back to accessibility content", async () => {
    const { service, audit } = setup();
    const result = await service.update({
      ownerId,
      deviceId,
      observation: observation({
        application: {
          name: "1Password",
          bundleIdentifier: "com.1password.1password",
          processIdentifier: 77,
        },
      }),
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(result.context).toMatchObject({
      status: "DENIED",
      permission: "DENIED",
      window: null,
      document: null,
      selection: null,
      authority: "CONTEXT_ONLY",
    });
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it("degrades safely when adapter stores are unavailable", async () => {
    const { applications, service } = setup();
    vi.spyOn(applications, "listTrustedApplications").mockRejectedValueOnce(
      new Error("adapter unavailable"),
    );
    const result = await service.update({
      ownerId,
      deviceId,
      observation: observation(),
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(result.context).toMatchObject({
      status: "DEGRADED",
      permission: "IDENTITY_ONLY",
      selection: null,
    });
  });
});
