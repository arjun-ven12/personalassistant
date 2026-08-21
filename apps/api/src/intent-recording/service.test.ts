import { describe, expect, it } from "vitest";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { GovernanceError } from "../governance/errors.js";
import { InMemoryIntentStore } from "../intent/store.js";
import { IntentRecordingService } from "./service.js";
import { InMemoryIntentRecordingStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const audits: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const intentStore = new InMemoryIntentStore();
  const store = new InMemoryIntentRecordingStore();
  const service = new IntentRecordingService(store, intentStore, audit);
  return { audits, intentStore, ownerId, service, store };
};

describe("IntentRecordingService", () => {
  it("starts a semantic-only recording session", async () => {
    const { audits, ownerId, service } = setup();
    const dashboard = await service.start({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        name: "Teach repo review",
        description: "Demonstrate a repository review flow.",
        source: "dashboard",
      },
    });

    expect(dashboard.recordingActive).toBe(true);
    expect(dashboard.rawInputCaptured).toBe(false);
    expect(dashboard.commandsRequireReview).toBe(true);
    expect(dashboard.programmingByDemonstrationAvailable).toBe(true);
    expect(dashboard.macroRecordingAvailable).toBe(false);
    expect(dashboard.semanticRecordings[0]).toMatchObject({
      semanticOnly: true,
      rawMouseCaptured: false,
      rawPixelsCaptured: false,
    });
    expect(dashboard.recordings[0]?.status).toBe("recording");
    expect(audits.map((audit) => audit.eventType)).toContain(
      "INTENT_RECORDING_STARTED",
    );
  });

  it("records redacted semantic events and synthesizes a reviewed command", async () => {
    const { audits, ownerId, service } = setup();
    const started = await service.start({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        name: "Open repository summary",
        description: "Capture repository navigation.",
        source: "dashboard",
      },
    });
    const recordingId = started.recordings[0]!.id;

    await service.recordEvent({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        recordingId,
        source: "browser_capability",
        type: "browser_navigation",
        capabilityId: "browser.open_url",
        title: "Open repository page",
        semanticSummary: "Open the selected repository dashboard page.",
        arguments: {
          repositoryId: crypto.randomUUID(),
          url: "https://example.test/repository",
        },
        status: "succeeded",
      },
    });

    const stopped = await service.stop({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        recordingId,
        primaryObjective: "Open a selected repository and summarize its state.",
      },
    });

    expect(stopped.events[0]?.redacted).toBe(true);
    expect(stopped.events[0]?.rawInputCaptured).toBe(false);
    expect(stopped.generatedCommands[0]?.status).toBe("review_required");
    expect(stopped.generatedCommands[0]?.requestTemplate).toContain(
      "Open a selected repository",
    );
    expect(stopped.workflowTimelines[0]).toMatchObject({
      objective: "Open a selected repository and summarize its state.",
      deterministic: true,
      coordinatePlaybackGenerated: false,
    });
    expect(stopped.generatedSkills[0]).toMatchObject({
      status: "review_required",
      plannerAvailable: false,
    });
    expect(stopped.skillParameters.map((parameter) => parameter.name)).toEqual(
      expect.arrayContaining(["repository", "url"]),
    );
    expect(stopped.workflowValidation[0]?.status).toBe("passed");
    expect(stopped.parameters.map((parameter) => parameter.name)).toEqual(
      expect.arrayContaining(["repository", "url"]),
    );
    expect(audits.map((audit) => audit.eventType)).toEqual(
      expect.arrayContaining([
        "INTENT_RECORDING_EVENT_RECORDED",
        "INTENT_RECORDING_STOPPED",
        "WORKFLOW_SYNTHESIZED",
        "DEMONSTRATION_WORKFLOW_GENERATED",
      ]),
    );
  });

  it("denies secret-like event arguments", async () => {
    const { ownerId, service } = setup();
    const started = await service.start({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        name: "Unsafe recording",
        description: "Should fail closed.",
        source: "dashboard",
      },
    });

    await expect(
      service.recordEvent({
        ownerId,
        requestId: crypto.randomUUID(),
        ipAddress: "127.0.0.1",
        body: {
          recordingId: started.recordings[0]!.id,
          source: "dashboard",
          type: "semantic_note",
          title: "Secret attempt",
          semanticSummary: "Attempt to store a secret-like key.",
          arguments: { apiToken: "never-store-this" },
        },
      }),
    ).rejects.toBeInstanceOf(GovernanceError);
  });

  it("denies raw macro-recording payloads", async () => {
    const { ownerId, service } = setup();
    const started = await service.start({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        name: "Unsafe macro",
        description: "Should fail closed.",
        source: "dashboard",
      },
    });

    await expect(
      service.recordEvent({
        ownerId,
        requestId: crypto.randomUUID(),
        ipAddress: "127.0.0.1",
        body: {
          recordingId: started.recordings[0]!.id,
          source: "dashboard",
          type: "semantic_note",
          title: "Raw coordinates",
          semanticSummary: "Attempt to store a mouse coordinate.",
          arguments: { mouseCoordinates: [431, 284] },
        },
      }),
    ).rejects.toMatchObject({
      code: "RAW_DEMONSTRATION_INPUT_DENIED",
    });
  });

  it("saves generated commands only after explicit review", async () => {
    const { intentStore, ownerId, service } = setup();
    const started = await service.start({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        name: "Open current dashboard",
        description: "Capture a dashboard flow.",
        source: "dashboard",
      },
    });
    const recordingId = started.recordings[0]!.id;
    await service.recordEvent({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        recordingId,
        source: "dashboard",
        type: "semantic_note",
        title: "Inspect dashboard",
        semanticSummary: "Inspect the current dashboard panel.",
        arguments: { dashboardPage: "/commands" },
      },
    });
    const stopped = await service.stop({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: { recordingId },
    });
    const generatedId = stopped.generatedCommands[0]!.id;
    expect(intentStore.listSavedCommands(ownerId)).toHaveLength(0);

    await service.saveGeneratedCommand({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        generatedCommandId: generatedId,
        name: "Inspect dashboard",
        requestTemplate: "Inspect the current dashboard panel.",
        pinned: true,
        favorite: true,
      },
    });

    const saved = intentStore.listSavedCommands(ownerId);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBe("Inspect dashboard");
  });

  it("saves, validates, simulates, and edits demonstrated skills after review", async () => {
    const { audits, ownerId, service } = setup();
    const started = await service.start({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        name: "Open dev dashboard",
        description: "Teach a semantic browser workflow.",
        source: "dashboard",
      },
    });
    const recordingId = started.recordings[0]!.id;
    await service.recordEvent({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        recordingId,
        source: "semantic_interaction",
        type: "button_clicked",
        capabilityId: "desktop.context.read",
        title: "Select dashboard",
        semanticSummary: "Select the Dashboard button.",
        arguments: { target: "Dashboard", environment: "development" },
        status: "succeeded",
      },
    });
    const stopped = await service.stop({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: { recordingId, primaryObjective: "Open development dashboard." },
    });
    const skill = stopped.generatedSkills[0]!;

    const saved = await service.saveGeneratedSkill({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        skillId: skill.id,
        plannerAvailable: true,
      },
    });
    expect(saved.generatedSkills[0]).toMatchObject({
      id: skill.id,
      status: "saved",
      plannerAvailable: true,
    });

    await service.validateWorkflow({
      ownerId,
      skillId: skill.id,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    await service.simulateWorkflow({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: { skillId: skill.id, origin: "dashboard" },
    });
    const edited = await service.editWorkflow({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        skillId: skill.id,
        operation: "add_condition",
        stepId: stopped.workflowTimelines[0]!.steps[0]!.id,
        input: { expression: "Wait for dashboard to be available." },
      },
    });

    expect(edited.workflowConditions[0]).toMatchObject({
      skillId: skill.id,
      conditionType: "if",
    });
    expect(edited.skillUsage[0]).toMatchObject({
      skillId: skill.id,
      status: "simulated",
    });
    expect(audits.map((audit) => audit.eventType)).toEqual(
      expect.arrayContaining([
        "DEMONSTRATED_SKILL_SAVED",
        "DEMONSTRATED_SKILL_SIMULATED",
        "DEMONSTRATED_SKILL_EDITED",
      ]),
    );
  });
});
