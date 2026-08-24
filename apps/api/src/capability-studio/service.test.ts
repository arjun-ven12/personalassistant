import {
  IntentRecordingRecordSchema,
  ProviderHealthRecordSchema,
  RecordedEventRecordSchema,
  TrustedApplicationRecordSchema,
} from "@alexa-control/shared";
import { describe, expect, it } from "vitest";

import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import { ApprovalService, type GovernanceAuditWriter } from "../governance/approval-service.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { InMemoryIntentRecordingStore } from "../intent-recording/store.js";
import { NativeProviderRuntime } from "../native-providers/service.js";
import { InMemoryNativeProviderStore } from "../native-providers/store.js";
import { CapabilityStudioService } from "./service.js";
import { InMemoryCapabilityStudioStore } from "./store.js";

const now = "2026-08-22T00:00:00.000Z";

const setup = async () => {
  const ownerId = crypto.randomUUID();
  const audit: GovernanceAuditWriter = () => undefined;
  const capabilityStore = new InMemoryCapabilityStudioStore();
  const nativeStore = new InMemoryNativeProviderStore();
  const applicationStore = new InMemoryApplicationAdapterStore();
  const recordingStore = new InMemoryIntentRecordingStore();
  const nativeProviders = new NativeProviderRuntime(
    nativeStore,
    applicationStore,
    audit,
    () => new Date(now),
  );
  const governanceStore = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
  const approvals = new ApprovalService(governanceStore, audit);
  const service = new CapabilityStudioService(
    capabilityStore,
    nativeProviders,
    nativeStore,
    applicationStore,
    recordingStore,
    approvals,
    audit,
    () => new Date(now),
  );
  const dashboard = await nativeProviders.dashboard(ownerId);
  const chrome = dashboard.nativeProviders.find((provider) => provider.applicationId === "chrome");
  if (!chrome) throw new Error("Chrome reviewed provider fixture is missing.");
  nativeStore.saveProvider({ ...chrome, status: "healthy", updatedAt: now });
  nativeStore.saveHealth(
    ProviderHealthRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      providerId: chrome.id,
      status: "healthy",
      availability: 1,
      latencyMs: 14,
      executionSuccessRate: 1,
      verificationFailureRate: 0,
      permissionState: "granted",
      applicationVersion: "test",
      healthScore: 1,
      checkedAt: now,
    }),
  );
  applicationStore.saveTrustedApplication(
    TrustedApplicationRecordSchema.parse({
      id: "chrome",
      ownerId,
      applicationName: "Chrome",
      bundleIdentifier: "com.google.Chrome",
      stableIdentifier: "chrome",
      applicationVersion: "test",
      executablePath: null,
      executablePathUserSupplied: false,
      codeSignature: "reviewed-test-signature",
      permissionsGranted: ["read_semantic_structure", "navigate", "interact", "edit_text"],
      capabilities: ["navigation", "semantic_registry", "state_inspection"],
      status: "trusted",
      lastSeenAt: now,
      trustLevel: "interaction",
      securityProfile: "strict",
      createdAt: now,
      updatedAt: now,
    }),
  );
  return { approvals, applicationStore, capabilityStore, ownerId, recordingStore, service };
};

const request = (ownerId: string, body: unknown) => ({
  ownerId,
  body,
  requestId: crypto.randomUUID(),
  ipAddress: "127.0.0.1",
});

describe("CapabilityStudioService", () => {
  it("creates and validates a finite description candidate without adding execution authority", async () => {
    const { ownerId, service } = await setup();

    const created = await service.createFromDescription(
      request(ownerId, {
        applicationId: "chrome",
        description: "Create a capability that refreshes the current Chrome page.",
      }),
    );
    const candidate = created.candidates[0]!;

    expect(candidate).toMatchObject({
      name: "REFRESH_PAGE",
      primitive: "reload",
      source: "DESCRIPTION",
      status: "DRAFT",
    });
    expect(candidate.duplicateOfCapabilityId).toBeTruthy();
    expect(created.arbitraryExecutionAvailable).toBe(false);

    const validated = await service.validate(request(ownerId, { candidateId: candidate.id }));
    expect(validated.candidates[0]?.validation.status).toBe("PASSED");
  });

  it("rejects descriptions that do not map to a reviewed finite primitive", async () => {
    const { ownerId, service } = await setup();

    await expect(
      service.createFromDescription(
        request(ownerId, {
          applicationId: "chrome",
          description: "Run an arbitrary shell script and bypass policy.",
        }),
      ),
    ).rejects.toMatchObject({ code: "FINITE_CAPABILITY_NOT_INFERRED" });
  });

  it("fails ambiguous element-order targets closed", async () => {
    const { ownerId, service } = await setup();
    const created = await service.createFromDescription(
      request(ownerId, {
        applicationId: "chrome",
        description: "Click the first Delete button.",
      }),
    );

    const validated = await service.validate(
      request(ownerId, { candidateId: created.candidates[0]!.id }),
    );

    expect(validated.candidates[0]?.validation).toMatchObject({
      status: "FAILED",
      targetStabilityPassed: false,
    });
  });

  it("normalizes a semantic recording into a parameterized candidate", async () => {
    const { ownerId, recordingStore, service } = await setup();
    const recordingId = crypto.randomUUID();
    recordingStore.saveRecording(
      IntentRecordingRecordSchema.parse({
        id: recordingId,
        ownerId,
        name: "Teach Chrome text entry",
        description: "Bounded semantic demonstration.",
        status: "review_required",
        primaryObjective: "Type text into the Chrome address bar.",
        source: "dashboard",
        countdownSeconds: 0,
        eventCount: 1,
        startedAt: now,
        stoppedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    );
    recordingStore.saveEvent(
      RecordedEventRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        recordingId,
        sequence: 1,
        source: "desktop_capability",
        type: "capability_invoked",
        capabilityId: "insert_text",
        title: "Insert text in Chrome",
        semanticSummary: "Invoked reviewed insert_text for Chrome.",
        arguments: {
          applicationId: "chrome",
          providerId: "provider.chrome",
          role: "AXTextField",
          label: "Address and search bar",
          identifier: "browser.address-bar",
        },
        status: "observed",
        dependsOnEventIds: [],
        occurredAt: now,
        durationMs: 0,
        redacted: true,
        rawInputCaptured: false,
      }),
    );

    const result = await service.createFromRecording(
      request(ownerId, { applicationId: "chrome", recordingId }),
    );
    const candidate = result.candidates[0]!;

    expect(candidate.name).toBe("INSERT_IN_ADDRESS_BAR");
    expect(candidate.inputSchema).toEqual({ text: "string" });
    expect(candidate.targetResolver).toMatchObject({
      role: "AXTextField",
      identifier: "browser.address-bar",
      usesCoordinates: false,
    });
  });

  it("requires testing, exact approval, trust, and permissions before activation", async () => {
    const { approvals, ownerId, service } = await setup();
    const created = await service.createFromDescription(
      request(ownerId, {
        applicationId: "chrome",
        description: "Create a capability that refreshes the current Chrome page.",
      }),
    );
    const candidateId = created.candidates[0]!.id;
    await service.validate(request(ownerId, { candidateId }));
    await service.test(request(ownerId, { candidateId }));

    await expect(service.activate(request(ownerId, { candidateId }))).rejects.toMatchObject({
      code: "APPROVAL_REQUIRED",
    });
    const requested = await service.requestApproval(request(ownerId, { candidateId }));
    const candidate = requested.candidates.find((item) => item.id === candidateId)!;
    await approvals.approve(
      ownerId,
      candidate.approvalRequestId!,
      crypto.randomUUID(),
      { ipAddress: "127.0.0.1", requestId: crypto.randomUUID() },
    );

    const activated = await service.activate(request(ownerId, { candidateId }));
    expect(activated.candidates.find((item) => item.id === candidateId)?.status).toBe("ACTIVE");

    const revoked = await service.changeState(
      request(ownerId, { candidateId, action: "REVOKE" }),
    );
    expect(revoked.candidates.find((item) => item.id === candidateId)?.status).toBe("REVOKED");
  });

  it("keeps agent capability requests inert and owner scoped", async () => {
    const { ownerId, service } = await setup();

    const result = await service.createRequest(
      request(ownerId, {
        requestedIntent: "refresh the current page",
        applicationId: "chrome",
        desiredOutcome: "The page reloads.",
        contextSummary: "Agent observed stale page content.",
        requestedBy: "AGENT",
        requestingAgentId: "agent.research",
      }),
    );

    expect(result.requests[0]).toMatchObject({ status: "OPEN", requestedBy: "AGENT" });
    expect(result.candidates).toHaveLength(0);
  });
});
