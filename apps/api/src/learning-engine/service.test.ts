import { describe, expect, it } from "vitest";

import { LearningEngineService } from "./service.js";
import { InMemoryLearningEngineStore } from "./store.js";

const ownerId = "00000000-0000-4000-8000-00000000019c";
const at = "2026-08-07T00:00:00.000Z";

const makeService = () => {
  const store = new InMemoryLearningEngineStore();
  const auditEvents: unknown[] = [];
  const service = new LearningEngineService(
    store,
    (input) => {
      auditEvents.push(input);
    },
    () => new Date(at),
  );
  return { service, store, auditEvents };
};

describe("LearningEngineService", () => {
  it("accumulates repeated alias evidence into a high-confidence candidate", async () => {
    const { service, store } = makeService();
    for (let index = 0; index < 20; index += 1) {
      await service.ingest({
        ownerId,
        requestId: `request-${index}`,
        ipAddress: "127.0.0.1",
        body: {
          eventType: "ALIAS_RESOLUTION_SUCCEEDED",
          category: "ALIAS",
          subject: "code",
          observedValue: "vscode",
          sourceType: index % 2 === 0 ? "human_understanding" : "voice",
          sessionId: `session-${index % 3}`,
        },
      });
    }

    const candidate = store.listCandidates(ownerId, 10)[0];
    expect(candidate?.category).toBe("ALIAS");
    expect(candidate?.candidateValue).toBe("vscode");
    expect(candidate?.confidence).toBeGreaterThanOrEqual(0.95);
    expect(candidate?.evidenceCount).toBe(20);
    expect(store.listPreferences(ownerId, 10)[0]?.value).toBe("vscode");
  });

  it("keeps ambiguous evidence context-specific instead of creating one global alias", async () => {
    const { service, store } = makeService();
    await service.ingest({
      ownerId,
      requestId: "launch",
      ipAddress: "127.0.0.1",
      body: {
        eventType: "ALIAS_RESOLUTION_SUCCEEDED",
        category: "ALIAS",
        subject: "code",
        observedValue: "vscode",
        sourceType: "human_understanding",
        context: { level: "APPLICATION", applicationId: "vscode", modality: "text" },
      },
    });
    await service.ingest({
      ownerId,
      requestId: "search",
      ipAddress: "127.0.0.1",
      body: {
        eventType: "ALIAS_RESOLUTION_CORRECTED",
        category: "ALIAS",
        subject: "code",
        observedValue: "source code",
        sourceType: "correction",
        context: { level: "PROJECT", projectId: "source-page", modality: "text" },
      },
    });

    const candidates = store.listCandidates(ownerId, 10);
    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map((candidate) => candidate.context.level))).toEqual(
      new Set(["APPLICATION", "PROJECT"]),
    );
    expect(store.listPreferences(ownerId, 10)).toHaveLength(0);
  });

  it("lets explicit owner teaching outrank learned preferences", async () => {
    const { service, store } = makeService();
    for (let index = 0; index < 20; index += 1) {
      await service.ingest({
        ownerId,
        requestId: `chrome-${index}`,
        ipAddress: "127.0.0.1",
        body: {
          eventType: "APPLICATION_SELECTED",
          category: "PREFERRED_APPLICATION",
          subject: "browser",
          observedValue: "chrome",
          sourceType: "application",
        },
      });
    }

    const taught = await service.teach({
      ownerId,
      requestId: "teach",
      ipAddress: "127.0.0.1",
      body: {
        category: "PREFERRED_APPLICATION",
        subject: "browser",
        value: "safari",
        locked: true,
        explanation: "Owner explicitly changed default browser.",
      },
    });

    expect(taught.value).toBe("safari");
    expect(taught.status).toBe("LOCKED");
    const active = store
      .listPreferences(ownerId, 10)
      .filter((preference) => preference.status === "LOCKED");
    expect(active[0]?.value).toBe("safari");
  });

  it("detects repeated sequences and creates a workflow suggestion candidate", async () => {
    const { service, store } = makeService();
    for (let index = 0; index < 5; index += 1) {
      await service.observeSequence({
        ownerId,
        requestId: `sequence-${index}`,
        ipAddress: "127.0.0.1",
        body: {
          actions: ["OPEN_VSCODE", "OPEN_REPOSITORY", "RUN_TESTS"],
          relatedProject: "personalassistant",
          success: true,
        },
      });
    }

    const sequence = store.listSequences(ownerId, 10)[0];
    expect(sequence?.frequency).toBe(5);
    expect(sequence?.confidence).toBeGreaterThanOrEqual(0.8);
    expect(store.listHabits(ownerId, 10)[0]?.suggestedAction).toContain("workflow");
    expect(store.listSuggestions(ownerId, 10)[0]?.suggestionType).toBe(
      "create_workflow",
    );
  });

  it("applies rejection cooldowns to avoid repeated suggestions", async () => {
    const { service, store } = makeService();
    for (let index = 0; index < 5; index += 1) {
      await service.ingest({
        ownerId,
        requestId: `shorter-${index}`,
        ipAddress: "127.0.0.1",
        body: {
          eventType: "RESPONSE_FEEDBACK",
          category: "RESPONSE_LENGTH",
          subject: "default_response_length",
          observedValue: "concise",
          sourceType: "response_feedback",
        },
      });
    }

    const suggestion = store.listSuggestions(ownerId, 10)[0];
    expect(suggestion?.status).toBe("pending");
    const rejected = await service.rejectSuggestion(ownerId, suggestion?.id ?? "");
    expect(rejected.status).toBe("rejected");
    expect(rejected.nextEligibleAt).not.toBeNull();
    expect(store.listCandidates(ownerId, 10)[0]?.status).toBe("REJECTED");
  });

  it("does not persist events in private mode", async () => {
    const { service, store, auditEvents } = makeService();
    const result = await service.ingest({
      ownerId,
      requestId: "private",
      ipAddress: "127.0.0.1",
      body: {
        eventType: "PRIVATE_OBSERVATION",
        category: "ALIAS",
        subject: "secret nickname",
        observedValue: "private app",
        sourceType: "api",
        privateMode: true,
      },
    });

    expect(result).toBeNull();
    expect(store.listEvents(ownerId, 10)).toHaveLength(0);
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "LEARNING_EVENT_RECORDED" }),
      ]),
    );
  });

  it("never auto-applies high-impact model preferences", async () => {
    const { service, store } = makeService();
    for (let index = 0; index < 30; index += 1) {
      await service.ingest({
        ownerId,
        requestId: `model-${index}`,
        ipAddress: "127.0.0.1",
        body: {
          eventType: "MODEL_SELECTED",
          category: "MODEL_PREFERENCE",
          subject: "default_reasoning_model",
          observedValue: "local",
          sourceType: "api",
        },
      });
    }

    const candidate = store.listCandidates(ownerId, 10)[0];
    expect(candidate?.requiresApproval).toBe(true);
    expect(candidate?.autoApplicable).toBe(false);
    expect(store.listPreferences(ownerId, 10)).toHaveLength(0);
  });
});
