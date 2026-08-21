import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ConversationHistoryRecordSchema,
  ConversationTurnFeedbackRecordSchema,
} from "@alexa-control/shared";

import { PostgresDatabase } from "../persistence/database.js";
import { safeTestDatabaseUrl } from "../persistence/test-database.js";
import { ConversationContinuityService } from "../conversation-continuity/service.js";
import { PostgresVoiceStore } from "./postgres-store.js";

const connectionString = safeTestDatabaseUrl();
const ownerA = crypto.randomUUID();
const ownerB = crypto.randomUUID();
let database: PostgresDatabase | undefined;

describe.skipIf(!connectionString)("PostgreSQL conversation persistence", () => {
  beforeAll(async () => {
    database = new PostgresDatabase(connectionString!);
    await database.migrate();
    for (const [id, email] of [
      [ownerA, "phase21a-owner-a@example.test"],
      [ownerB, "phase21a-owner-b@example.test"],
    ]) {
      await database.pool.query(
        `INSERT INTO owners(id,email,password_hash,record,created_at,updated_at)
         VALUES($1,$2,'test-only',$3,NOW(),NOW())`,
        [id, email, { id }],
      );
    }
  });

  afterAll(async () => {
    if (!database) return;
    await database.pool.query("DELETE FROM owners WHERE id = ANY($1::uuid[])", [
      [ownerA, ownerB],
    ]);
    await database.close();
  });

  it("survives reconstruction with route/context data and owner-scoped feedback", async () => {
    const first = new PostgresVoiceStore(database!.pool);
    const turn = ConversationHistoryRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: ownerA,
      conversationId: crypto.randomUUID(),
      sessionId: null,
      role: "user",
      transcript: "Explain this page to me.",
      normalizedTranscript: "explain this page to me.",
      confidence: 0.99,
      isFinal: true,
      language: "en-US",
      wakeWordDetected: true,
      interruption: false,
      commandId: null,
      intentCreated: false,
      responseText: "This page shows conversation routing history.",
      responseSource: "GEMMA",
      responseProviderId: "ollama",
      responseModelId: "gemma3:4b",
      classification: "ANSWER",
      speechAct: "QUESTION",
      routeStages: ["PAGE", "GEMMA"],
      activeContext: {
        deviceId: null,
        applicationId: "chrome",
        applicationName: "Chrome",
        windowId: null,
        windowTitle: "Conversation Center",
        documentTitle: "Conversation Center",
        url: "https://example.test/conversations",
        workspaceId: null,
        projectId: null,
        selectedText: null,
        focusedElement: null,
        semanticContentReference: "/conversations",
        adapterId: "browser.semantic-page-context",
        providerId: "chrome",
        capturedAt: new Date().toISOString(),
        authority: "CONTEXT_ONLY",
      },
      contextReferences: [
        {
          source: "ACTIVE_PAGE",
          id: "/conversations",
          label: "Conversation Center",
          confidence: 1,
        },
      ],
      latencyMs: 4200,
      tokenUsage: { totalTokens: 120 },
      costUsd: "0",
      executionStatus: "NONE",
      contextSourceCount: 1,
      pageChunkCount: 5,
      memoryItemCount: 0,
      createdAt: new Date().toISOString(),
    });
    await first.saveConversation(turn);
    const feedback = ConversationTurnFeedbackRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: ownerA,
      turnId: turn.id,
      kind: "CORRECT",
      note: null,
      learningApplied: false,
      createdAt: new Date().toISOString(),
    });
    await first.saveTurnFeedback(feedback);

    const reconstructed = new PostgresVoiceStore(database!.pool);
    expect(await reconstructed.listConversation(ownerA, 10)).toEqual([turn]);
    expect(await reconstructed.listTurnFeedback(ownerA, 10)).toEqual([feedback]);
    expect(await reconstructed.listConversation(ownerB, 10)).toEqual([]);
    expect(await reconstructed.listTurnFeedback(ownerB, 10)).toEqual([]);
  });

  it("persists continuity across reconstruction and claims each turn once", async () => {
    const conversationId = crypto.randomUUID();
    const identity = {
      ownerId: ownerA,
      conversationId,
      deviceId: crypto.randomUUID(),
      voiceSessionId: crypto.randomUUID(),
    };
    const firstStore = new PostgresVoiceStore(database!.pool);
    const firstService = new ConversationContinuityService(firstStore);
    const first = await firstService.resolveTurn({
      ...identity,
      turnId: crypto.randomUUID(),
      transcript: "Schedule a meeting with Sarah tomorrow",
      activeContext: null,
      contextReferences: [],
    });
    expect(first.responseText).toBe("What time?");

    const reconstructedStore = new PostgresVoiceStore(database!.pool);
    const reconstructedService = new ConversationContinuityService(reconstructedStore);
    const continued = await reconstructedService.resolveTurn({
      ...identity,
      turnId: crypto.randomUUID(),
      transcript: "3 PM",
      activeContext: null,
      contextReferences: [],
    });
    expect(continued.responseText).toBe("How long?");

    const turnId = crypto.randomUUID();
    const claims = await Promise.all([
      reconstructedStore.claimConversationTurn(
        ownerA,
        conversationId,
        turnId,
        new Date().toISOString(),
      ),
      reconstructedStore.claimConversationTurn(
        ownerA,
        conversationId,
        turnId,
        new Date().toISOString(),
      ),
    ]);
    expect(claims.sort()).toEqual([false, true]);
  });

  it("serializes different continuity turns across store instances", async () => {
    const conversationId = crypto.randomUUID();
    const identity = {
      ownerId: ownerB,
      conversationId,
      deviceId: crypto.randomUUID(),
      voiceSessionId: crypto.randomUUID(),
    };
    const firstService = new ConversationContinuityService(
      new PostgresVoiceStore(database!.pool),
    );
    const secondService = new ConversationContinuityService(
      new PostgresVoiceStore(database!.pool),
    );
    await firstService.resolveTurn({
      ...identity,
      turnId: crypto.randomUUID(),
      transcript: "Schedule a meeting with Sarah tomorrow",
      activeContext: null,
      contextReferences: [],
    });
    const timeTurnId = crypto.randomUUID();
    const cancelTurnId = crypto.randomUUID();
    await Promise.all([
      firstService.resolveTurn({
        ...identity,
        turnId: timeTurnId,
        transcript: "3 PM",
        activeContext: null,
        contextReferences: [],
      }),
      secondService.resolveTurn({
        ...identity,
        turnId: cancelTurnId,
        transcript: "Never mind",
        activeContext: null,
        contextReferences: [],
      }),
    ]);
    const state = await new PostgresVoiceStore(database!.pool).getConversationContinuity(
      ownerB,
      conversationId,
    );
    expect(state?.pendingIntent?.status).toBe("CANCELLED");
    expect(state?.processedTurns.map((item) => item.turnId)).toEqual(
      expect.arrayContaining([timeTurnId, cancelTurnId]),
    );
  });
});
