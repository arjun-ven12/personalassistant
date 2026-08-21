import { describe, expect, it, vi } from "vitest";

import { AgentCognitionService } from "../agent-cognition/service.js";
import { InMemoryAgentCognitionStore } from "../agent-cognition/store.js";
import { AgentEvolutionService } from "../agent-evolution/service.js";
import { InMemoryAgentEvolutionStore } from "../agent-evolution/store.js";
import { AgentSocietyService } from "../agent-society/service.js";
import { InMemoryAgentSocietyStore } from "../agent-society/store.js";
import { AgentOsService } from "../agents/os-service.js";
import { InMemoryAgentOsStore } from "../agents/os-store.js";
import { AgentRegistryService } from "../agents/service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import { InMemoryApplicationIntelligenceStore } from "../application-intelligence/store.js";
import { InMemoryCoreAdapterStore } from "../core-adapters/store.js";
import { ActiveContextService } from "../active-context/service.js";
import { TrustedApplicationRecordSchema } from "@alexa-control/shared";
import { InMemoryDesktopSkillStore } from "../desktop-skills/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { EmbeddingService } from "../intelligence/embedding-service.js";
import { RetrievalService } from "../intelligence/retrieval-service.js";
import { IntentExecutionService } from "../intent/service.js";
import { InMemoryIntentStore } from "../intent/store.js";
import { InMemoryIntentRecordingStore } from "../intent-recording/store.js";
import { InMemoryLearningEngineStore } from "../learning-engine/store.js";
import { InMemoryReflectionStore } from "../reflection/store.js";
import { SkillEvolutionService } from "../skill-evolution/service.js";
import { InMemorySkillEvolutionStore } from "../skill-evolution/store.js";
import { HumanUnderstandingService } from "../human-understanding/service.js";
import { InMemoryHumanUnderstandingStore } from "../human-understanding/store.js";
import { InMemoryMemoryStore } from "../memory/store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { InMemoryWorkspaceIntelligenceStore } from "../workspace-intelligence/store.js";
import type { AIRouterService } from "../ai/router/service.js";
import { VoiceRuntimeService } from "./service.js";
import { InMemoryVoiceStore } from "./store.js";
import type { ApplicationInteractionService } from "../application-interactions/service.js";

class DashboardReadFailureVoiceStore extends InMemoryVoiceStore {
  override listConversationAnalytics(
    ownerId: string,
    limit: number,
  ): ReturnType<InMemoryVoiceStore["listConversationAnalytics"]> {
    void ownerId;
    void limit;
    throw new Error("conversation analytics unavailable");
  }
}

const setup = (aiRouter?: VoiceRuntimeService["aiRouter"]) => {
  const ownerId = crypto.randomUUID();
  const audits: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const agentStore = new InMemoryAgentStore();
  const memoryStore = new InMemoryMemoryStore();
  const repositoryStore = new InMemoryRepositoryStore();
  const agents = new AgentRegistryService(agentStore, audit);
  const agentOs = new AgentOsService(
    new InMemoryAgentOsStore(),
    agentStore,
    repositoryStore,
    memoryStore,
    audit,
    undefined,
    (id, requestId) => agents.ensureBuiltIns(id, requestId),
  );
  const cognition = new AgentCognitionService(
    new InMemoryAgentCognitionStore(),
    agentStore,
    agentOs,
    memoryStore,
    audit,
  );
  const evolution = new AgentEvolutionService(
    new InMemoryAgentEvolutionStore(),
    agentStore,
    cognition,
    audit,
  );
  const society = new AgentSocietyService(
    new InMemoryAgentSocietyStore(),
    agentStore,
    evolution,
    audit,
  );
  const intent = new IntentExecutionService(new InMemoryIntentStore(), society, audit);
  const voice = new VoiceRuntimeService(new InMemoryVoiceStore(), intent, audit);
  const applicationAdapters = new InMemoryApplicationAdapterStore();
  const applicationIntelligence = new InMemoryApplicationIntelligenceStore();
  const humanUnderstanding = new HumanUnderstandingService(
    new InMemoryHumanUnderstandingStore(),
    memoryStore,
    new RetrievalService(
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
    ),
    applicationAdapters,
    applicationIntelligence,
    new InMemoryWorkspaceIntelligenceStore(),
    audit,
  );
  const voiceStore = new InMemoryVoiceStore();
  const voiceWithUnderstanding = new VoiceRuntimeService(
    voiceStore,
    intent,
    audit,
    undefined,
    humanUnderstanding,
    aiRouter,
    true,
  );
  const skillEvolutionStore = new InMemorySkillEvolutionStore();
  const skillEvolution = new SkillEvolutionService(
    skillEvolutionStore,
    new InMemoryDesktopSkillStore(),
    new InMemoryIntentRecordingStore(),
    new InMemoryLearningEngineStore(),
    new InMemoryReflectionStore(),
    audit,
  );
  const voiceWithSkillEvolution = new VoiceRuntimeService(
    voiceStore,
    intent,
    audit,
    undefined,
    humanUnderstanding,
    aiRouter,
    true,
    undefined,
    undefined,
    undefined,
    skillEvolution,
  );
  const activeContext = new ActiveContextService(
    applicationAdapters,
    new InMemoryCoreAdapterStore(),
    applicationIntelligence,
    audit,
  );
  const voiceWithActiveContext = new VoiceRuntimeService(
    voiceStore,
    intent,
    audit,
    undefined,
    humanUnderstanding,
    aiRouter,
    true,
    undefined,
    undefined,
    undefined,
    undefined,
    activeContext,
  );
  const applicationInteractions = {
    planFromUtterance: vi.fn((input: { utterance: string }) =>
      /^type/i.test(input.utterance)
        ? {
            request: {
              applicationId: "chatgpt",
              capability: "insert_text",
              target: {
                type: "COMPOSER",
                role: "AXTextArea",
                label: "Message ChatGPT",
                identifier: "chatgpt.composer",
                semanticId: "a".repeat(64),
                source: "EXPLICIT",
                confidence: 0.98,
                capturedAt: "2026-08-21T00:00:00.000Z",
                expiresAt: "2026-08-21T00:01:00.000Z",
              },
              text: "hello",
              origin: "voice",
              conversationId: null,
              proposalId: null,
            },
            clarification: null,
          }
        : { request: null, clarification: null },
    ),
    execute: vi.fn((input: { requestId: string }) =>
      Promise.resolve({
        requestId: input.requestId,
        applicationId: "chatgpt",
        providerId: "provider.chatgpt",
        capability: "insert_text",
        status: "SUCCESS",
        targetSemanticId: "a".repeat(64),
        executionRequestId: crypto.randomUUID(),
        approvalRequestId: null,
        message: "Queued.",
        createdAt: "2026-08-21T00:00:00.000Z",
      }),
    ),
  } as unknown as ApplicationInteractionService;
  const voiceWithApplicationInteractions = new VoiceRuntimeService(
    new InMemoryVoiceStore(),
    intent,
    audit,
    undefined,
    undefined,
    undefined,
    true,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    applicationInteractions,
  );
  return {
    activeContext,
    applicationAdapters,
    audits,
    ownerId,
    skillEvolutionStore,
    voice,
    voiceStore,
    voiceWithActiveContext,
    voiceWithApplicationInteractions,
    voiceWithSkillEvolution,
    voiceWithUnderstanding,
  };
};

describe("VoiceRuntimeService", () => {
  it("initializes governed voice metadata without raw audio persistence", async () => {
    const { ownerId, voice } = setup();
    const dashboard = await voice.dashboard(ownerId);

    expect(dashboard.runtime.persistent).toBe(true);
    expect(dashboard.runtime.routesThroughIntentEngine).toBe(true);
    expect(dashboard.runtime.rawAudioPersisted).toBe(false);
    expect(dashboard.runtime.voiceCanApproveHighRisk).toBe(false);
    expect(dashboard.profiles).toHaveLength(1);
    expect(dashboard.wakeWordSettings[0]?.wakeWords).toContain("Alexa");
  });

  it("cancels only the explicit voice turn through AIRouter", async () => {
    const cancel = vi.fn(() => true);
    const { audits, ownerId, voiceWithUnderstanding } = setup({
      cancel,
    } as unknown as VoiceRuntimeService["aiRouter"]);
    const turnId = crypto.randomUUID();

    await expect(
      voiceWithUnderstanding.cancelTurn(
        ownerId,
        turnId,
        "127.0.0.1",
        crypto.randomUUID(),
      ),
    ).resolves.toEqual({ turnId, cancelled: true, state: "interrupted" });
    expect(cancel).toHaveBeenCalledWith(ownerId, turnId);
    expect(audits.map((event) => event.eventType)).toContain("VOICE_TURN_INTERRUPTED");
  });

  it("routes final confident transcripts through the Intent Engine", async () => {
    const { audits, ownerId, voice } = setup();
    const dashboard = await voice.createSession({
      ownerId,
      body: { wakeWordEnabled: true },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    const sessionId = dashboard.sessions[0]!.id;
    const response = await voice.recordTranscript({
      ownerId,
      body: {
        sessionId,
        transcript: "open command center",
        isFinal: true,
        confidence: 0.92,
        wakeWordDetected: true,
        source: "browser",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.routed).toBe(true);
    expect(response.commandResponse?.command.source).toBe("voice");
    expect(response.conversation.intentCreated).toBe(true);
    expect(response.conversation.commandId).toBe(response.commandResponse?.command.id);
    expect(audits.map((audit) => audit.eventType)).toEqual(
      expect.arrayContaining(["VOICE_SESSION_STARTED", "VOICE_INTENT_ROUTED"]),
    );
  });

  it("reuses 22.3 proposals before dispatching governed application interaction", async () => {
    const { ownerId, voiceWithApplicationInteractions } = setup();
    const dashboard = await voiceWithApplicationInteractions.createSession({
      ownerId,
      body: { wakeWordEnabled: true },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    const sessionId = dashboard.sessions[0]!.id;
    const first = await voiceWithApplicationInteractions.recordTranscript({
      ownerId,
      deviceId: crypto.randomUUID(),
      body: {
        sessionId,
        transcript: "Type hello into ChatGPT",
        isFinal: true,
        confidence: 0.99,
        wakeWordDetected: true,
        source: "electron",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    expect(first.conversation.responseText).toMatch(/Say “do it”/);
    expect(first.conversation.intentCreated).toBe(false);

    const second = await voiceWithApplicationInteractions.recordTranscript({
      ownerId,
      body: {
        sessionId,
        transcript: "Do it",
        isFinal: true,
        confidence: 0.99,
        wakeWordDetected: true,
        source: "electron",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      governanceSessionId: crypto.randomUUID(),
      networkState: "PRIVATE_NETWORK",
    });
    expect(second.conversation.intentCreated).toBe(true);
    expect(second.conversation.responseText).toMatch(/reviewed provider/i);
  });

  it("fails closed for low-confidence transcripts", async () => {
    const { audits, ownerId, voice } = setup();
    const response = await voice.recordTranscript({
      ownerId,
      body: {
        transcript: "maybe do some unclear thing",
        isFinal: true,
        confidence: 0.2,
        wakeWordDetected: false,
        source: "browser",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.routed).toBe(false);
    expect(response.commandResponse).toBeNull();
    expect(response.conversation.intentCreated).toBe(false);
    expect(audits.map((audit) => audit.eventType)).toContain(
      "VOICE_TRANSCRIPT_RECORDED",
    );
  });

  it("does not mutate continuity from interim or low-confidence speech", async () => {
    const { ownerId, voiceStore, voiceWithUnderstanding } = setup();
    for (const body of [
      { transcript: "Schedule a meeting with Sarah tomorrow", isFinal: false, confidence: 0.98 },
      { transcript: "Schedule a meeting with Sarah tomorrow", isFinal: true, confidence: 0.2 },
    ])
      await voiceWithUnderstanding.recordTranscript({
        ownerId,
        body: { ...body, wakeWordDetected: true, source: "browser" },
        requestId: crypto.randomUUID(),
        ipAddress: "127.0.0.1",
      });

    expect(voiceStore.listConversationContinuity(ownerId, 10)).toEqual([]);
  });

  it("returns the transcript response when derived dashboard reads fail", async () => {
    const ownerId = crypto.randomUUID();
    const audits: Parameters<GovernanceAuditWriter>[0][] = [];
    const audit: GovernanceAuditWriter = (event) => {
      audits.push(event);
    };
    const intent = new IntentExecutionService(
      new InMemoryIntentStore(),
      new AgentSocietyService(
        new InMemoryAgentSocietyStore(),
        new InMemoryAgentStore(),
        new AgentEvolutionService(
          new InMemoryAgentEvolutionStore(),
          new InMemoryAgentStore(),
          new AgentCognitionService(
            new InMemoryAgentCognitionStore(),
            new InMemoryAgentStore(),
            new AgentOsService(
              new InMemoryAgentOsStore(),
              new InMemoryAgentStore(),
              new InMemoryRepositoryStore(),
              new InMemoryMemoryStore(),
              audit,
            ),
            new InMemoryMemoryStore(),
            audit,
          ),
          audit,
        ),
        audit,
      ),
      audit,
    );
    const voice = new VoiceRuntimeService(
      new DashboardReadFailureVoiceStore(),
      intent,
      audit,
    );

    const response = await voice.recordTranscript({
      ownerId,
      body: {
        transcript: "maybe do some unclear thing",
        isFinal: true,
        confidence: 0.2,
        wakeWordDetected: false,
        source: "browser",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.routed).toBe(false);
    expect(response.conversation.transcript).toBe("maybe do some unclear thing");
    expect(response.dashboard.runtime.rawAudioPersisted).toBe(false);
    expect(response.dashboard.conversationAnalytics).toEqual([]);
    expect(audits.map((auditRecord) => auditRecord.eventType)).toContain(
      "VOICE_TRANSCRIPT_RECORDED",
    );
  });

  it("asks clarification instead of guessing ambiguous conversational references", async () => {
    const { audits, ownerId, voice } = setup();
    const response = await voice.recordTranscript({
      ownerId,
      body: {
        transcript: "do that again",
        isFinal: true,
        confidence: 0.94,
        wakeWordDetected: true,
        source: "browser",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    const center = await voice.conversationCenter(ownerId);

    expect(response.routed).toBe(false);
    expect(response.commandResponse).toBeNull();
    expect(response.responseText).toMatch(/Which specific thing/);
    expect(center.clarifications).toHaveLength(1);
    expect(center.clarifications[0]?.status).toBe("open");
    expect(center.sessions[0]?.lifecycleState).toBe("clarifying");
    expect(audits.map((audit) => audit.eventType)).toContain(
      "CONVERSATION_CLARIFICATION_REQUESTED",
    );
  });

  it("supports persona updates and conversation bookmarks without granting authority", async () => {
    const { audits, ownerId, voice } = setup();
    const center = await voice.upsertPersona({
      ownerId,
      body: {
        name: "Concise",
        mode: "concise",
        vocabulary: "plain",
        sentenceLength: "short",
        humor: "none",
        formality: "casual",
        questionStyle: "direct",
        prosody: "neutral",
        active: true,
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    const conversationId = center.sessions[0]!.id;
    const bookmarked = await voice.createBookmark({
      ownerId,
      body: {
        conversationId,
        label: "Follow up",
        note: "Remember to revisit this discussion.",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(center.personas.some((persona) => persona.mode === "concise")).toBe(true);
    expect(bookmarked.bookmarks).toHaveLength(1);
    expect(bookmarked.secure.autonomousExecution).toBe(false);
    expect(audits.map((audit) => audit.eventType)).toEqual(
      expect.arrayContaining([
        "CONVERSATION_PERSONA_UPDATED",
        "CONVERSATION_BOOKMARK_CREATED",
      ]),
    );
  });

  it("uses Human Understanding behaviour rules before creating intent commands", async () => {
    const { ownerId, voiceWithUnderstanding } = setup();
    const response = await voiceWithUnderstanding.recordTranscript({
      ownerId,
      body: {
        transcript: "hello",
        isFinal: true,
        confidence: 0.99,
        wakeWordDetected: true,
        source: "browser",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.routed).toBe(false);
    expect(response.commandResponse).toBeNull();
    expect(response.conversation.intentCreated).toBe(false);
    expect(response.responseText).toBe("Hey — I’m here.");
    expect(response.responseSource).toBe("PRECODED");
  });

  it("routes an explicit application action even when Human Understanding has no selected intent", async () => {
    const { ownerId, voiceWithUnderstanding } = setup();
    const response = await voiceWithUnderstanding.recordTranscript({
      ownerId,
      body: {
        transcript: "Open VS Code",
        isFinal: true,
        confidence: 0.95,
        wakeWordDetected: true,
        source: "electron",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.commandResponse?.command.source).toBe("voice");
    expect(response.conversation.intentCreated).toBe(true);
    expect(response.responseText).not.toContain("confidence was too low");
  });

  it("keeps a calendar clarification chain in one conversation and creates one command", async () => {
    const { ownerId, voiceStore, voiceWithUnderstanding } = setup();
    const dashboard = await voiceWithUnderstanding.createSession({
      ownerId,
      body: { wakeWordEnabled: true },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    const sessionId = dashboard.sessions[0]!.id;
    const submit = (transcript: string, source: "browser" | "electron") =>
      voiceWithUnderstanding.recordTranscript({
        ownerId,
        body: {
          sessionId,
          turnId: crypto.randomUUID(),
          transcript,
          isFinal: true,
          confidence: 0.95,
          wakeWordDetected: true,
          source,
        },
        requestId: crypto.randomUUID(),
        ipAddress: "127.0.0.1",
      });

    const first = await submit("Schedule a meeting with Sarah tomorrow", "browser");
    const second = await submit("3 PM", "electron");
    const final = await submit("One hour", "browser");

    expect(second.conversation.conversationId).toBe(first.conversation.conversationId);
    expect(final.conversation.conversationId).toBe(first.conversation.conversationId);
    expect(first.responseText).toBe("What time?");
    expect(second.responseText).toBe("How long?");
    expect(first.commandResponse).toBeNull();
    expect(second.commandResponse).toBeNull();
    expect(final.commandResponse?.command.originalRequest).toBe(
      "Schedule a 60 minute meeting with Sarah tomorrow at 3:00 PM.",
    );
    const continuity = voiceStore.listConversationContinuity(ownerId, 10);
    expect(continuity).toHaveLength(1);
    expect(continuity[0]?.pendingIntent?.status).toBe("COMPLETED");
  });

  it("continues through conversational fallback when Human Understanding fails", async () => {
    const { ownerId, voiceWithUnderstanding } = setup({
      executeStructured: vi.fn(() => Promise.reject(new Error("provider unavailable"))),
      execute: vi.fn(() =>
        Promise.resolve({
          requestId: crypto.randomUUID(),
          providerId: "openai",
          modelId: "gpt-5.6-luna",
          status: "SUCCESS",
          outputText: "Quantum computing uses quantum states to process information.",
          latencyMs: 1,
          attempts: [],
          decision: {},
        }),
      ),
    } as unknown as VoiceRuntimeService["aiRouter"]);
    vi.spyOn(
      voiceWithUnderstanding["humanUnderstanding"]!,
      "understand",
    ).mockRejectedValueOnce(new Error("understanding store unavailable"));

    const response = await voiceWithUnderstanding.recordTranscript({
      ownerId,
      body: {
        transcript: "What is quantum computing?",
        isFinal: true,
        confidence: 0.99,
        wakeWordDetected: true,
        source: "browser",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.routed).toBe(false);
    expect(response.responseText).toMatch(/quantum states/i);
    expect(response.responseSource).toBe("GPT");
  });

  it("names AI economics blocks instead of reporting provider unavailability", async () => {
    const execute = vi.fn();
    const { ownerId, voiceWithUnderstanding } = setup({
      executeStructured: vi.fn(() =>
        Promise.resolve({
          requestId: crypto.randomUUID(),
          outcome: "ROUTING_FAILED",
          decision: {
            complexity: "LOW",
            requiredRole: "FAST_INTERPRETER",
            requiredStructuredOutput: true,
            candidateModels: ["openai/gpt-5.6-luna"],
            selectedModel: null,
            selectedProvider: null,
            reason: "All eligible model attempts failed or were rejected.",
            escalated: false,
            clarified: false,
            economic: {
              budgetHealth: "EXHAUSTED",
              applicableBudgetIds: [crypto.randomUUID()],
              estimatedCostUsd: "0.001",
              economicAction: "REQUIRE_APPROVAL",
              reasons: ["Budget policy would be exceeded."],
            },
          },
          attempts: [
            {
              providerId: "openai",
              modelId: "gpt-5.6-luna",
              locality: "REMOTE",
              status: "SKIPPED",
              reason: "Budget policy would be exceeded.",
              errorCode: "ECONOMIC_POLICY",
            },
          ],
          latencyMs: 1,
        }),
      ),
      execute,
    } as unknown as VoiceRuntimeService["aiRouter"]);

    const response = await voiceWithUnderstanding.recordTranscript({
      ownerId,
      body: {
        transcript: "Explain this page to me",
        isFinal: true,
        confidence: 0.99,
        wakeWordDetected: true,
        source: "browser",
        pageContext: {
          pathname: "/approvals",
          title: "Approvals",
          description: null,
          headings: ["Approvals"],
          content: ["Pending ai.economic_override approvals"],
          controls: [],
          extractionStatus: "AVAILABLE",
          authority: "CONTEXT_ONLY",
        },
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.responseText).toMatch(/AI budget approval/i);
    expect(response.responseText).not.toMatch(/provider is unavailable/i);
    expect(response.routeStages).toEqual(expect.arrayContaining(["PAGE", "PRECODED"]));
    expect(response.conversation.providerAttempts[0]?.reason).toMatch(/Budget policy/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("routes natural skill-evolution requests to candidate-only governance", async () => {
    const { ownerId, skillEvolutionStore, voiceWithSkillEvolution } = setup();
    const response = await voiceWithSkillEvolution.recordTranscript({
      ownerId,
      body: {
        transcript: "Can you make this a skill?",
        isFinal: true,
        confidence: 0.99,
        wakeWordDetected: true,
        source: "browser",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.routed).toBe(false);
    expect(response.commandResponse).toBeNull();
    expect(response.conversation.executionStatus).toBe("NONE");
    expect(response.conversation.routeStages).toEqual(["GEMMA", "SKILL_EVOLUTION"]);
    expect(response.conversation.responseText).toMatch(/not active/i);
    expect(skillEvolutionStore.listCandidates(ownerId, 10)).toHaveLength(1);
    expect(skillEvolutionStore.listSkills(ownerId, 10)).toEqual([]);
  });

  it("uses Luna with bounded page and conversation context for page explanations", async () => {
    const execute = vi.fn((request: unknown) => {
      void request;
      return Promise.resolve({
        requestId: crypto.randomUUID(),
        outcome: "SUCCESS",
        decision: {
          routeId: crypto.randomUUID(),
          complexity: "LOW",
          requiredRole: "FAST_INTERPRETER",
          requiredStructuredOutput: false,
          candidateModels: ["openai/gpt-5.6-luna"],
          selectedModel: "gpt-5.6-luna",
          selectedProvider: "openai",
          reason: "Cloud conversational response.",
          escalated: false,
          clarified: false,
        },
        attempts: [],
        outputText:
          "This is the Conversation Center. It shows your recent topics, goals, and routing history.",
        providerId: "openai",
        modelId: "gpt-5.6-luna",
        latencyMs: 24,
      });
    });
    const { ownerId, voiceWithUnderstanding } = setup({ execute } as unknown as Pick<
      AIRouterService,
      "execute"
    >);

    const response = await voiceWithUnderstanding.recordTranscript({
      ownerId,
      body: {
        transcript: "Explain this page to me",
        isFinal: true,
        confidence: 0.98,
        wakeWordDetected: true,
        source: "browser",
        pageContext: {
          pathname: "/conversations",
          title: "Conversation Center",
          description: "Tracks conversational context and governed routing.",
          headings: ["Conversation Center", "Conversation routing history"],
          content: ["Tracks topics, goals, clarifications, and summaries."],
          controls: [],
          authority: "CONTEXT_ONLY",
        },
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.routed).toBe(false);
    expect(response.responseSource).toBe("GPT");
    expect(response.responseProviderId).toBe("openai");
    expect(response.responseModelId).toBe("gpt-5.6-luna");
    expect(response.responseText).toMatch(/Conversation Center/);
    expect(response.conversation.responseSource).toBe("GPT");
    expect(execute).toHaveBeenCalledTimes(1);
    const routedRequest = execute.mock.calls[0]?.[0] as
      { context?: unknown } | undefined;
    expect(routedRequest).toMatchObject({
      requestedRole: "FAST_INTERPRETER",
      privacy: "STANDARD",
      locality: "PREFER_LOCAL",
      allowCloud: true,
      contextProfile: "GENERAL_CONVERSATION",
    });
    expect(routedRequest?.context).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: "EXTERNAL",
          trustLevel: "UNTRUSTED",
        }),
      ]),
    );
  });

  it("uses highlighted page text for the user's exact contextual question", async () => {
    const execute = vi.fn((request: unknown) => {
      void request;
      return Promise.resolve({
        requestId: crypto.randomUUID(),
        outcome: "SUCCESS" as const,
        decision: {
          routeId: crypto.randomUUID(),
          complexity: "LOW" as const,
          requiredRole: "FAST_INTERPRETER" as const,
          requiredStructuredOutput: false,
          candidateModels: ["openai/gpt-5.6-luna"],
          selectedModel: "gpt-5.6-luna",
          selectedProvider: "openai",
          reason: "Contextual conversational response.",
          escalated: false,
          clarified: false,
        },
        attempts: [],
        outputText: "You highlighted Generate.",
        providerId: "openai",
        modelId: "gpt-5.6-luna",
        latencyMs: 12,
      });
    });
    const { ownerId, voiceWithUnderstanding } = setup({ execute });
    const response = await voiceWithUnderstanding.recordTranscript({
      ownerId,
      body: {
        transcript: "Do you know what I highlighted",
        isFinal: true,
        confidence: 0.99,
        wakeWordDetected: true,
        source: "browser",
        pageContext: {
          pathname: "/devices",
          url: "http://localhost:5173/devices",
          title: "Devices",
          description: "Registered-device identity",
          headings: ["Devices"],
          content: ["Generate a five-minute pairing code."],
          selectedText: "Generate",
          focusedElement: null,
          chunks: [
            { id: "/devices#selection", kind: "SELECTION", text: "Generate", relevance: 1 },
          ],
          extractionStatus: "AVAILABLE",
          controls: [],
          authority: "CONTEXT_ONLY",
        },
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.responseText).toBe("You highlighted Generate.");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(execute.mock.calls[0]?.[0])).toContain("Generate");
    expect(response.conversation.contextReferences.map((item) => item.source)).toContain(
      "SELECTION",
    );
  });

  it("routes contextual voice questions through AIRouter with the canonical device context", async () => {
    const execute = vi.fn((request: unknown) => {
      void request;
      return Promise.resolve({
        requestId: crypto.randomUUID(),
        outcome: "SUCCESS",
        decision: {
          routeId: crypto.randomUUID(),
          complexity: "LOW",
          requiredRole: "FAST_INTERPRETER",
          requiredStructuredOutput: false,
          candidateModels: ["openai/gpt-5.6-luna"],
          selectedModel: "gpt-5.6-luna",
          selectedProvider: "openai",
          reason: "Contextual conversational response.",
          escalated: false,
          clarified: false,
        },
        attempts: [],
        outputText: "The selected line throws the error currently shown in VS Code.",
        providerId: "openai",
        modelId: "gpt-5.6-luna",
        latencyMs: 20,
      });
    });
    const { activeContext, applicationAdapters, ownerId, voiceWithActiveContext } =
      setup({ execute } as unknown as Pick<AIRouterService, "execute">);
    const deviceId = crypto.randomUUID();
    const at = new Date().toISOString();
    applicationAdapters.saveTrustedApplication(
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
        lastSeenAt: at,
        trustLevel: "semantic_read",
        securityProfile: "strict",
        createdAt: at,
        updatedAt: at,
      }),
    );
    await activeContext.update({
      ownerId,
      deviceId,
      observation: {
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
        },
        selection: {
          text: "throw new Error('provider unavailable')",
          semanticType: "AXTextArea",
          secure: false,
        },
        accessibilityTrusted: true,
        capturedAt: at,
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    const response = await voiceWithActiveContext.recordTranscript({
      ownerId,
      deviceId,
      body: {
        transcript: "Explain this error",
        isFinal: true,
        confidence: 0.99,
        wakeWordDetected: true,
        source: "electron",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.responseText).toMatch(/selected line/i);
    expect(response.conversation.activeContext).toMatchObject({
      deviceId,
      applicationId: "vscode",
      selectedText: null,
      authority: "CONTEXT_ONLY",
    });
    expect(response.conversation.contextReferences[0]?.source).toBe("SELECTION");
    const routedRequest = execute.mock.calls[0]?.[0] as
      | {
          context?: Array<{
            sourceType?: string;
            trustLevel?: string;
            content?: unknown;
          }>;
        }
      | undefined;
    expect(routedRequest?.context?.[0]).toMatchObject({
      sourceType: "EXTERNAL",
      trustLevel: "UNTRUSTED",
    });
    expect(routedRequest?.context?.[0]?.content).toMatchObject({
      kind: "ACTIVE_DESKTOP_CONTEXT",
      authority: "CONTEXT_ONLY",
    });
  });

  it("keeps secret-like page context local-only instead of sending it to Luna", async () => {
    const execute = vi.fn((request: unknown) => {
      void request;
      return Promise.resolve({
        requestId: crypto.randomUUID(),
        outcome: "SUCCESS",
        decision: {
          routeId: crypto.randomUUID(),
          complexity: "LOW",
          requiredRole: "FAST_INTERPRETER",
          requiredStructuredOutput: false,
          candidateModels: ["ollama/gemma3:4b"],
          selectedModel: "gemma3:4b",
          selectedProvider: "ollama",
          reason: "Local privacy fallback.",
          escalated: false,
          clarified: false,
        },
        attempts: [],
        outputText: "I can summarize the page without sending restricted content out.",
        providerId: "ollama",
        modelId: "gemma3:4b",
        latencyMs: 24,
      });
    });
    const { ownerId, voiceWithUnderstanding } = setup({ execute } as unknown as Pick<
      AIRouterService,
      "execute"
    >);

    await voiceWithUnderstanding.recordTranscript({
      ownerId,
      body: {
        transcript: "Explain this page to me",
        isFinal: true,
        confidence: 0.98,
        wakeWordDetected: true,
        source: "browser",
        pageContext: {
          pathname: "/credentials",
          title: "Credential Note",
          description: "Contains a SECRET placeholder.",
          headings: ["Credential Note"],
          content: ["SECRET value redacted"],
          controls: [],
          authority: "CONTEXT_ONLY",
        },
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(execute.mock.calls.length).toBeGreaterThan(0);
    const routedRequest = execute.mock.calls[0]?.[0];
    expect(routedRequest).toMatchObject({
      privacy: "LOCAL_ONLY",
      locality: "LOCAL_ONLY",
      allowCloud: false,
    });
  });

  it("stores canonical structured Luna interpretation and page provenance", async () => {
    const execute = vi.fn();
    const executeStructured = vi.fn(() =>
      Promise.resolve({
        requestId: crypto.randomUUID(),
        outcome: "SUCCESS" as const,
        decision: {
          complexity: "LOW" as const,
          requiredRole: "FAST_INTERPRETER" as const,
          requiredStructuredOutput: true,
          candidateModels: ["openai/gpt-5.6-luna"],
          selectedModel: "gpt-5.6-luna",
          selectedProvider: "openai",
          reason: "Luna structured conversation interpretation.",
          escalated: false,
          clarified: false,
        },
        attempts: [
          {
            providerId: "openai",
            modelId: "gpt-5.6-luna",
            locality: "REMOTE" as const,
            status: "SUCCESS" as const,
            reason: "Structured output accepted.",
            latencyMs: 31,
          },
        ],
        structuredOutput: {
          type: "ANSWER" as const,
          confidence: 0.96,
          speechAct: "QUESTION" as const,
          answer: "This page shows governed conversation history and routing details.",
          actionIntent: "",
          steps: [],
          question: "",
          missingInformation: [],
          contextSources: ["CONVERSATION" as const],
          safeExplanation: "Answered from bounded active-page context.",
        },
        providerId: "openai",
        modelId: "gpt-5.6-luna",
        latencyMs: 31,
        usage: { totalTokens: 44 },
      }),
    );
    const { ownerId, voiceWithUnderstanding } = setup({
      execute,
      executeStructured,
    } as unknown as VoiceRuntimeService["aiRouter"]);
    const response = await voiceWithUnderstanding.recordTranscript({
      ownerId,
      body: {
        transcript: "Explain this page to me",
        isFinal: true,
        confidence: 0.99,
        wakeWordDetected: true,
        source: "browser",
        pageContext: {
          pathname: "/conversations",
          url: "http://localhost:5173/conversations",
          title: "Conversation Center",
          description: "Governed conversation history.",
          headings: ["Conversation Center"],
          content: ["Recent responses and their route provenance."],
          selectedText: null,
          focusedElement: null,
          chunks: [
            { id: "title", kind: "TITLE", text: "Conversation Center", relevance: 1 },
          ],
          extractionStatus: "AVAILABLE",
          controls: [],
          authority: "CONTEXT_ONLY",
        },
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });

    expect(response.classification).toBe("ANSWER");
    expect(response.routeStages).toEqual(
      expect.arrayContaining(["PAGE", "MEMORY", "GPT"]),
    );
    expect(response.conversation.interpretation?.type).toBe("ANSWER");
    expect(response.conversation.activeContext?.authority).toBe("CONTEXT_ONLY");
    expect(response.conversation.contextReferences.map((item) => item.source)).toEqual(
      expect.arrayContaining(["ACTIVE_PAGE", "CONVERSATION"]),
    );
    expect(response.conversation.providerAttempts[0]?.status).toBe("SUCCESS");
    expect(response.conversation.tokenUsage?.totalTokens).toBe(44);
    expect(execute).not.toHaveBeenCalled();
  });

  it("creates an inert AI action proposal and governs later confirmation", async () => {
    const executeStructured = vi.fn(() =>
      Promise.resolve({
        requestId: crypto.randomUUID(),
        outcome: "SUCCESS" as const,
        decision: {
          complexity: "LOW" as const,
          requiredRole: "FAST_INTERPRETER" as const,
          requiredStructuredOutput: true,
          candidateModels: ["openai/gpt-5.6-luna"],
          selectedModel: "gpt-5.6-luna",
          selectedProvider: "openai",
          reason: "Structured action interpretation.",
          escalated: false,
          clarified: false,
        },
        attempts: [
          {
            providerId: "openai",
            modelId: "gpt-5.6-luna",
            locality: "REMOTE" as const,
            status: "SUCCESS" as const,
            reason: "Structured output accepted.",
            latencyMs: 20,
          },
        ],
        structuredOutput: {
          type: "ACTION" as const,
          confidence: 0.96,
          speechAct: "ACTION_REQUEST" as const,
          answer: "",
          actionIntent: "APPLICATION.REVIEW_CURRENT_PAGE",
          steps: [],
          question: "",
          missingInformation: [],
          contextSources: ["ACTIVE_PAGE" as const],
          safeExplanation: "The owner requested a bounded review action.",
        },
        providerId: "openai",
        modelId: "gpt-5.6-luna",
        latencyMs: 20,
        usage: { totalTokens: 30 },
      }),
    );
    const { ownerId, voiceStore, voiceWithUnderstanding } = setup({
      execute: vi.fn(),
      executeStructured,
    } as unknown as VoiceRuntimeService["aiRouter"]);
    const session = await voiceWithUnderstanding.createSession({
      ownerId,
      body: { wakeWordEnabled: true },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    const sessionId = session.sessions[0]!.id;
    const browserSessionId = crypto.randomUUID();
    const pageContext = {
      pathname: "/applications",
      url: "http://localhost:5173/applications",
      title: "Applications",
      description: "Registered application controls.",
      headings: ["Applications"],
      content: ["Known applications and their bounded capabilities."],
      selectedText: null,
      focusedElement: null,
      chunks: [{ id: "title", kind: "TITLE" as const, text: "Applications", relevance: 1 }],
      extractionStatus: "AVAILABLE" as const,
      controls: [],
      authority: "CONTEXT_ONLY" as const,
    };
    const proposalTurnId = crypto.randomUUID();
    const proposed = await voiceWithUnderstanding.recordTranscript({
      ownerId,
      deviceId: browserSessionId,
      body: {
        sessionId,
        transcript: "Proceed with the current page",
        isFinal: true,
        confidence: 0.99,
        wakeWordDetected: true,
        source: "browser",
        pageContext,
      },
      requestId: proposalTurnId,
      ipAddress: "127.0.0.1",
    });
    expect(proposed.commandResponse).toBeNull();
    expect(proposed.responseText).toMatch(/prepared a governed/i);
    const continuity = voiceStore.listConversationContinuity(ownerId, 10)[0];
    expect(continuity?.actionProposal?.status).toBe("PROPOSED");
    expect(continuity?.actionProposal?.sourceTurnId).toBe(proposalTurnId);
    expect(continuity?.actionProposal?.sourceContextReferenceId).toMatch(
      /#page-[a-f0-9]{8}$/,
    );

    const confirmed = await voiceWithUnderstanding.recordTranscript({
      ownerId,
      deviceId: browserSessionId,
      body: {
        sessionId,
        transcript: "Do it",
        isFinal: true,
        confidence: 0.99,
        wakeWordDetected: true,
        source: "browser",
        pageContext,
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    expect(confirmed.commandResponse).not.toBeNull();
    expect(confirmed.conversation.intentCreated).toBe(true);
  });

  it("reports active-page content failure without a generic misunderstanding", async () => {
    const { ownerId, voiceWithUnderstanding } = setup();
    const response = await voiceWithUnderstanding.recordTranscript({
      ownerId,
      body: {
        transcript: "Explain this page to me",
        isFinal: true,
        confidence: 0.98,
        wakeWordDetected: true,
        source: "browser",
        pageContext: {
          pathname: "/unreadable",
          title: "Chrome",
          description: null,
          headings: [],
          content: [],
          controls: [],
          extractionStatus: "CONTENT_UNAVAILABLE",
          authority: "CONTEXT_ONLY",
        },
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    expect(response.responseText).toBe(
      "I can see you're on Chrome, but I couldn't read the page contents.",
    );
    expect(response.routeStages).toEqual(["PAGE", "PRECODED"]);
  });

  it("keeps feedback owner-scoped and replay permanently non-executing", async () => {
    const { ownerId, voiceWithUnderstanding } = setup();
    const recorded = await voiceWithUnderstanding.recordTranscript({
      ownerId,
      body: {
        transcript: "What is inflation?",
        isFinal: true,
        confidence: 0.99,
        wakeWordDetected: true,
        source: "browser",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    await expect(
      voiceWithUnderstanding.recordTurnFeedback({
        ownerId: crypto.randomUUID(),
        turnId: recorded.conversation.id,
        body: { kind: "CORRECT" },
        requestId: crypto.randomUUID(),
        ipAddress: "127.0.0.1",
      }),
    ).rejects.toThrow("Conversation turn not found");
    const replay = await voiceWithUnderstanding.replayTurn({
      ownerId,
      turnId: recorded.conversation.id,
      body: { route: "DETERMINISTIC" },
    });
    expect(replay.mode).toBe("DRY_RUN");
    expect(replay.execution).toBe("NO_EXECUTION");
  });
});
