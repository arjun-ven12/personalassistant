import {
  DesktopSkillRecordSchema,
  TrustedApplicationRecordSchema,
} from "@alexa-control/shared";
import { describe, expect, it } from "vitest";

import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryIntentRecordingStore } from "../intent-recording/store.js";
import { DesktopSkillExecutionService } from "./service.js";
import { InMemoryDesktopSkillStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const audits: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const store = new InMemoryDesktopSkillStore();
  const intentRecordingStore = new InMemoryIntentRecordingStore();
  const applicationAdapterStore = new InMemoryApplicationAdapterStore();
  const service = new DesktopSkillExecutionService(
    store,
    intentRecordingStore,
    applicationAdapterStore,
    audit,
    () => new Date("2026-08-03T00:00:00.000Z"),
  );
  return {
    applicationAdapterStore,
    audits,
    intentRecordingStore,
    ownerId,
    service,
    store,
  };
};

const trustApp = (
  store: InMemoryApplicationAdapterStore,
  ownerId: string,
  permissionsGranted = ["read_semantic_structure", "navigate"],
) => {
  store.saveTrustedApplication(
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
      permissionsGranted,
      capabilities: [
        "navigation",
        "semantic_registry",
        "state_inspection",
        "terminal_input",
      ],
      status: "trusted",
      lastSeenAt: "2026-08-03T00:00:00.000Z",
      trustLevel: "semantic_read",
      securityProfile: "strict",
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
    }),
  );
};

const saveSkill = (
  store: InMemoryDesktopSkillStore,
  ownerId: string,
  permissions = ["read_semantic_structure", "navigate"],
) => {
  const skill = DesktopSkillRecordSchema.parse({
    id: crypto.randomUUID(),
    ownerId,
    generatedSkillId: null,
    name: "Prepare development environment",
    description: "Prepare development environment from trusted semantic skills.",
    capabilities: ["navigation", "semantic_registry", "state_inspection"],
    inputSchema: {},
    outputs: ["verification_status"],
    dependencies: [],
    permissions,
    estimatedRuntimeMs: 3_000,
    health: "healthy",
    version: "1.0.0",
    tags: ["development", "environment"],
    confidence: 0.9,
    plannerAvailable: true,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
  });
  store.saveDesktopSkill(skill);
  return skill;
};

describe("DesktopSkillExecutionService", () => {
  it("exposes deterministic desktop skills without pixels, OCR, coordinates, or hidden capabilities", async () => {
    const { ownerId, service } = setup();

    const dashboard = await service.dashboard(ownerId);

    expect(dashboard.autonomousDesktopSkillsAvailable).toBe(true);
    expect(dashboard.deterministicWorkflowExecution).toBe(true);
    expect(dashboard.pixelAutomationAvailable).toBe(false);
    expect(dashboard.coordinateReplayAvailable).toBe(false);
    expect(dashboard.ocrAutomationAvailable).toBe(false);
    expect(dashboard.computerVisionRequired).toBe(false);
    expect(dashboard.hiddenCapabilityExecutionAvailable).toBe(false);
    expect(dashboard.skillsModifyAutomatically).toBe(false);
  });

  it("executes a resolved skill as a verified deterministic execution graph", async () => {
    const { applicationAdapterStore, audits, ownerId, service, store } = setup();
    trustApp(applicationAdapterStore, ownerId);
    saveSkill(store, ownerId);

    const dashboard = await service.execute({
      ownerId,
      body: {
        goal: "prepare",
        origin: "planner",
        variables: { repository: "quants-trade" },
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(dashboard.skillExecutions[0]).toMatchObject({
      goal: "prepare",
      origin: "planner",
      status: "completed",
    });
    expect(dashboard.executionGraphs[0]).toMatchObject({
      deterministic: true,
      pixelAutomationUsed: false,
      coordinateReplayUsed: false,
      ocrUsed: false,
    });
    expect(dashboard.executionSteps.map((step) => step.status)).toEqual([
      "verified",
      "verified",
      "verified",
    ]);
    expect(dashboard.executionDependencies).toHaveLength(2);
    expect(audits.map((audit) => audit.eventType)).toEqual(
      expect.arrayContaining([
        "DESKTOP_WORKFLOW_STARTED",
        "DESKTOP_WORKFLOW_COMPLETED",
      ]),
    );
  });

  it("pauses for approval checkpoints when high-risk adapter permissions are required", async () => {
    const { applicationAdapterStore, audits, ownerId, service, store } = setup();
    trustApp(applicationAdapterStore, ownerId, [
      "read_semantic_structure",
      "navigate",
      "execute_commands",
    ]);
    saveSkill(store, ownerId, [
      "read_semantic_structure",
      "navigate",
      "execute_commands",
    ]);

    const dashboard = await service.execute({
      ownerId,
      body: { goal: "prepare", origin: "voice" },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(dashboard.skillExecutions[0]?.status).toBe("awaiting_approval");
    expect(dashboard.approvalCheckpoints[0]).toMatchObject({
      riskLevel: "high",
      status: "pending",
    });
    expect(audits.map((audit) => audit.eventType)).toContain(
      "DESKTOP_WORKFLOW_APPROVAL_CHECKPOINT",
    );
  });

  it("fails closed before execution when required adapter permissions are missing", async () => {
    const { applicationAdapterStore, ownerId, service, store } = setup();
    trustApp(applicationAdapterStore, ownerId);
    saveSkill(store, ownerId, [
      "read_semantic_structure",
      "navigate",
      "execute_commands",
    ]);

    await expect(
      service.execute({
        ownerId,
        body: { goal: "prepare", origin: "agent" },
        requestId: crypto.randomUUID(),
        ipAddress: "127.0.0.1",
      }),
    ).rejects.toMatchObject({ code: "DESKTOP_SKILL_PERMISSION_MISSING" });
  });

  it("supports pause, resume, cancel, and deterministic recovery suggestions", async () => {
    const { applicationAdapterStore, ownerId, service, store } = setup();
    trustApp(applicationAdapterStore, ownerId);
    saveSkill(store, ownerId);
    const started = await service.execute({
      ownerId,
      body: { goal: "prepare", origin: "dashboard" },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    const executionId = started.skillExecutions[0]!.id;

    expect(
      (
        await service.pause({
          ownerId,
          body: { executionId },
          requestId: crypto.randomUUID(),
          ipAddress: "127.0.0.1",
        })
      ).skillExecutions[0]?.status,
    ).toBe("paused");
    expect(
      (
        await service.resume({
          ownerId,
          body: { executionId },
          requestId: crypto.randomUUID(),
          ipAddress: "127.0.0.1",
        })
      ).skillExecutions[0]?.status,
    ).toBe("running");
    const recovered = await service.recover({
      ownerId,
      body: { executionId },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    expect(recovered.workflowRecovery[0]?.action).toBe("resume");
    expect(
      (
        await service.cancel({
          ownerId,
          body: { executionId },
          requestId: crypto.randomUUID(),
          ipAddress: "127.0.0.1",
        })
      ).skillExecutions[0]?.status,
    ).toBe("cancelled");
  });
});
