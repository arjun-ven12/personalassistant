import { describe, expect, it, vi } from "vitest";

import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import { InMemoryApplicationIntelligenceStore } from "../application-intelligence/store.js";
import type { AIRouterService } from "../ai/router/service.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { EmbeddingService } from "../intelligence/embedding-service.js";
import { RetrievalService } from "../intelligence/retrieval-service.js";
import { InMemoryMemoryStore } from "../memory/store.js";
import { InMemoryWorkspaceIntelligenceStore } from "../workspace-intelligence/store.js";
import { HumanUnderstandingService } from "./service.js";
import { InMemoryHumanUnderstandingStore } from "./store.js";

const setup = (aiRouter?: AIRouterService) => {
  const ownerId = crypto.randomUUID();
  const audits: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const memoryStore = new InMemoryMemoryStore();
  const retrieval = new RetrievalService(
    memoryStore,
    new EmbeddingService({
      provider: "disabled",
      model: "text-embedding-3-small",
      batchSize: 32,
      maxRetries: 3,
      dimensions: 1536,
    }),
    {
      semanticSearchEnabled: false,
      hybridSearchEnabled: true,
      keywordWeight: 0.35,
      vectorWeight: 0.65,
      similarityThreshold: 0.75,
      retrievalLimit: 12,
    },
  );
  const service = new HumanUnderstandingService(
    new InMemoryHumanUnderstandingStore(),
    memoryStore,
    retrieval,
    new InMemoryApplicationAdapterStore(),
    new InMemoryApplicationIntelligenceStore(),
    new InMemoryWorkspaceIntelligenceStore(),
    audit,
    undefined,
    undefined,
    aiRouter,
  );
  return { audits, ownerId, service };
};

describe("HumanUnderstandingService", () => {
  it("bootstraps a model-independent personality and deterministic language packs", async () => {
    const { ownerId, service } = setup();
    const dashboard = await service.dashboard(ownerId);

    expect(dashboard.profile.name).toBe("Athena Default");
    expect(dashboard.deterministicFirst).toBe(true);
    expect(dashboard.usesExistingVectorDatabase).toBe(true);
    expect(dashboard.llmIsCapabilityProviderOnly).toBe(true);
    expect(dashboard.aliases.some((alias) => alias.phrase === "launch")).toBe(true);
    expect(dashboard.patterns.some((pattern) => pattern.intentId === "LaunchApplication")).toBe(true);
    expect(dashboard.identity.assistantName).toBe("Athena");
    expect(dashboard.traits.some((trait) => trait.key === "verification_level")).toBe(true);
    expect(dashboard.interactionPolicies.some((policy) => policy.policyKey === "confirm_destructive_actions")).toBe(true);
    expect(dashboard.decisionPreferences.some((preference) => preference.preferenceKey === "semantic_integrations")).toBe(true);
  });

  it("renames an existing default Alexa profile without changing custom profiles", async () => {
    const { ownerId, service } = setup();
    const initial = await service.dashboard(ownerId);
    await service.store.saveProfile({ ...initial.profile, name: "Alexa Default" });

    const dashboard = await service.dashboard(ownerId);

    expect(dashboard.profile.name).toBe("Athena Default");
    expect(dashboard.identity.assistantName).toBe("Athena");
  });

  it("understands app launch through vocabulary, aliases, patterns, and confidence", async () => {
    const { audits, ownerId, service } = setup();
    const result = await service.understand({
      ownerId,
      ipAddress: "127.0.0.1",
      requestId: crypto.randomUUID(),
      body: {
        text: "Launch VS Code",
        source: "text",
      },
    });

    expect(result.normalizedText).toBe("launch vs code");
    expect(result.selectedIntent?.intentId).toBe("LaunchApplication");
    expect(result.entities.some((entity) => entity.value === "vs code")).toBe(true);
    expect(result.confidence.band).toMatch(/execute/);
    expect(result.aiFallbackReason).toBeNull();
    expect(result.plannerInput.personalityCore).toMatchObject({
      modelIndependent: true,
      aiOwnsPersonality: false,
    });
    expect(result.stages.map((stage) => stage.stage)).toEqual(
      expect.arrayContaining([
        "tokenizer",
        "vocabulary",
        "aliases",
        "pattern_recognition",
        "intent_classification",
        "context_resolution",
        "vector_retrieval",
      ]),
    );
    expect(audits.map((audit) => audit.eventType)).toContain(
      "SEMANTIC_RETRIEVAL_RESOLVED",
    );
  });

  it("handles greetings with behaviour rules without requiring AI", async () => {
    const { ownerId, service } = setup();
    const result = await service.understand({
      ownerId,
      ipAddress: "127.0.0.1",
      body: {
        text: "hello",
        source: "voice",
      },
    });

    expect(result.behaviourRule?.responseAction).toBe("greeting_response");
    expect(result.conversationState).toBe("COMPLETED");
    expect(result.selectedIntent?.intentId).toBe("Behaviour.greeting_response");
  });

  it.each([
    ["do not open VS Code", "NEGATED_ACTION"],
    ["don't open VS Code", "NEGATED_ACTION"],
    ["please don't launch Chrome", "NEGATED_ACTION"],
    ["if I wanted to open Terminal, how would I do that?", "HYPOTHETICAL_ACTION"],
    ["what happens if I delete a file?", "HYPOTHETICAL_ACTION"],
    ["I'm reading about deleting a file", "EDUCATIONAL_ACTION_REFERENCE"],
    ["tell me how to open Terminal", "EDUCATIONAL_ACTION_REFERENCE"],
    ['he said "open VS Code"', "QUOTED_ACTION"],
    ["I want to know how to close Safari", "EDUCATIONAL_ACTION_REFERENCE"],
  ])("classifies %s as deterministic non-execution", async (text, category) => {
    const { ownerId, service } = setup();
    const result = await service.understand({
      ownerId,
      ipAddress: "127.0.0.1",
      body: { text, source: "text" },
    });
    expect(result.selectedIntent?.intentId).toBe(`NonExecution.${category}`);
    expect(result.plannerInput).toMatchObject({
      mustNotExecute: true,
      nonExecutionCategory: category,
    });
    expect(result.aiFallbackReason).toBeNull();
  });

  it.each(["open VS Code", "launch Terminal"])(
    "preserves the positive command %s",
    async (text) => {
      const { ownerId, service } = setup();
      const result = await service.understand({
        ownerId,
        ipAddress: "127.0.0.1",
        body: { text, source: "text" },
      });
      expect(result.selectedIntent?.intentId).toBe("LaunchApplication");
      expect(result.plannerInput).toMatchObject({ mustNotExecute: false });
    },
  );

  it("clarifies an ambiguous report instead of guessing an executable target", async () => {
    const { ownerId, service } = setup();
    const result = await service.understand({
      ownerId,
      ipAddress: "127.0.0.1",
      body: { text: "open the report", source: "text" },
    });
    expect(result.conversationState).toBe("CLARIFYING");
    expect(result.clarification).not.toBeNull();
    expect(result.plannerInput).toMatchObject({ conversationState: "CLARIFYING" });
  });

  it("creates deterministic clarification before AI fallback for unknown requests", async () => {
    const { ownerId, service } = setup();
    const result = await service.understand({
      ownerId,
      ipAddress: "127.0.0.1",
      body: {
        text: "florbanize the purple orbit",
        source: "text",
      },
    });

    expect(["CLARIFYING", "WAITING"]).toContain(result.conversationState);
    expect(result.confidence.overall).toBeLessThan(0.8);
    expect(result.clarification ?? result.aiFallbackReason).toBeTruthy();
  });

  it("does not fail the request when AI router interpretation is unavailable", async () => {
    const executeStructured = vi.fn(() =>
      Promise.reject(new Error("AI_ROUTER_UNAVAILABLE")),
    );
    const { ownerId, service } = setup({
      executeStructured,
    } as unknown as AIRouterService);
    const result = await service.understand({
      ownerId,
      ipAddress: "127.0.0.1",
      requestId: crypto.randomUUID(),
      body: {
        text: "what is quantum computing",
        source: "voice",
      },
    });

    expect(executeStructured).toHaveBeenCalledTimes(1);
    expect(result.confidence.band).toBe("ai_router");
    expect(result.plannerInput.localInterpretation).toBeNull();
    expect(result.conversationState).toBe("WAITING");
  });

  it("switches personality profiles without changing planner ownership", async () => {
    const { ownerId, service } = setup();
    const dashboard = await service.switchProfile({
      ownerId,
      profileName: "Developer",
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(dashboard.profile.name).toBe("Developer");
    expect(dashboard.llmIsCapabilityProviderOnly).toBe(true);
  });

  it("records learning evidence without instantly modifying behaviour", async () => {
    const { ownerId, service } = setup();
    const first = await service.recordLearning({
      ownerId,
      key: "answer_style",
      value: "concise",
      source: "manual",
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(first.active).toBe(false);
    expect(first.evidenceCount).toBe(1);

    let latest = first;
    for (let index = 0; index < 9; index += 1) {
      latest = await service.recordLearning({
        ownerId,
        key: "answer_style",
        value: "concise",
        source: "manual",
        requestId: crypto.randomUUID(),
        ipAddress: "127.0.0.1",
      });
    }

    expect(latest.evidenceCount).toBe(10);
    expect(latest.active).toBe(true);
  });

  it("simulates personality profiles without AI", async () => {
    const { ownerId, service } = setup();
    const simulations = await service.simulatePersonality({
      ownerId,
      text: "Explain Docker",
    });

    expect(simulations.length).toBeGreaterThan(1);
    expect(simulations.every((simulation) => simulation.aiUsed === false)).toBe(true);
    expect(simulations.map((simulation) => simulation.profileName)).toContain("Founder");
  });

  it("explains response influences for the why inspector", async () => {
    const { ownerId, service } = setup();
    const explanation = await service.explainResponse({
      ownerId,
      response: "Understood boss. Opening VS Code.",
      plannerConfidence: 0.99,
      aiUsed: false,
    });

    expect(explanation.aiUsed).toBe(false);
    expect(explanation.plannerConfidence).toBe(0.99);
    expect(explanation.influencedBy.some((item) => item.includes("Profile"))).toBe(true);
  });
});
