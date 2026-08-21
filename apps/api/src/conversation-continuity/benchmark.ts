import type { ContinuityReference } from "@alexa-control/shared";

import { InMemoryVoiceStore } from "../voice/store.js";
import { ConversationContinuityService } from "./service.js";

export interface ContinuityBenchmarkResult {
  totalCases: number;
  correctCases: number;
  overallAccuracy: number;
  deterministicResolutionRate: number;
  aiAssistedResolutionRate: number;
  clarificationCorrectness: number;
  incorrectReferenceResolutionCount: number;
  falseExecutionCount: number;
  staleProposalExecutionCount: number;
  crossConversationLeakageCount: number;
  crossOwnerLeakageCount: number;
  unsafeAmbiguousDestructiveResolutionCount: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
}

const percentile = (values: number[], value: number) =>
  values[Math.min(values.length - 1, Math.floor(values.length * value))] ?? 0;

export const runContinuityBenchmark = async (): Promise<ContinuityBenchmarkResult> => {
  const latencies: number[] = [];
  let totalCases = 0;
  let correctCases = 0;
  let clarificationChecks = 0;
  let clarificationCorrect = 0;
  let incorrectReferenceResolutionCount = 0;
  let falseExecutionCount = 0;
  let staleProposalExecutionCount = 0;
  let crossConversationLeakageCount = 0;
  let crossOwnerLeakageCount = 0;
  let unsafeAmbiguousDestructiveResolutionCount = 0;
  let deterministicCases = 0;
  let aiAssistedCases = 0;

  const measured = async (
    run: () => boolean | Promise<boolean>,
    mode: "deterministic" | "ai" = "deterministic",
  ) => {
    const started = performance.now();
    const correct = await run();
    latencies.push(performance.now() - started);
    totalCases += 1;
    if (mode === "deterministic") deterministicCases += 1;
    else aiAssistedCases += 1;
    if (correct) correctCases += 1;
  };
  const identity = () => ({
    ownerId: crypto.randomUUID(),
    conversationId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    voiceSessionId: crypto.randomUUID(),
  });
  const input = (ids: ReturnType<typeof identity>, transcript: string) => ({
    ...ids,
    turnId: crypto.randomUUID(),
    transcript,
    activeContext: null,
    contextReferences: [],
  });

  for (let index = 0; index < 30; index += 1)
    await measured(async () => {
      const service = new ConversationContinuityService(new InMemoryVoiceStore());
      const ids = identity();
      const first = await service.resolveTurn(input(ids, "Schedule a meeting with Sarah tomorrow"));
      const second = await service.resolveTurn(input(ids, "3 PM"));
      const final = await service.resolveTurn(input(ids, "One hour"));
      clarificationChecks += 2;
      if (first.responseText === "What time?") clarificationCorrect += 1;
      if (second.responseText === "How long?") clarificationCorrect += 1;
      return final.canonicalRequest === "Schedule a 60 minute meeting with Sarah tomorrow at 3:00 PM.";
    });

  for (let index = 0; index < 40; index += 1)
    await measured(() => {
      const service = new ConversationContinuityService(new InMemoryVoiceStore());
      const at = new Date().toISOString();
      const references: ContinuityReference[] = ["alpha.pdf", "beta.pdf", "gamma.pdf"].map((value, option) => ({
        id: `${index}-${option}`,
        kind: "file",
        label: value,
        value,
        source: "RECENT_REFERENCE",
        confidence: 1,
        deviceId: null,
        resolvedAt: at,
      }));
      const resolved = service.resolveReference("the second one", references)?.value;
      if (resolved !== "beta.pdf") incorrectReferenceResolutionCount += 1;
      return resolved === "beta.pdf";
    });

  for (let index = 0; index < 30; index += 1)
    await measured(async () => {
      const service = new ConversationContinuityService(new InMemoryVoiceStore());
      const result = await service.resolveTurn(input(identity(), "yes"));
      if (result.canonicalRequest) falseExecutionCount += 1;
      return result.canonicalRequest === null;
    });

  for (let index = 0; index < 30; index += 1)
    await measured(async () => {
      const service = new ConversationContinuityService(new InMemoryVoiceStore());
      const ids = identity();
      await service.resolveTurn(input(ids, "Schedule a meeting with Sarah tomorrow"));
      const cancelled = await service.resolveTurn(input(ids, "never mind"));
      const later = await service.resolveTurn(input(ids, "3 PM"));
      clarificationChecks += 1;
      if (cancelled.state.pendingIntent?.status === "CANCELLED") clarificationCorrect += 1;
      if (later.canonicalRequest) falseExecutionCount += 1;
      return cancelled.state.pendingIntent?.status === "CANCELLED" && later.canonicalRequest === null;
    });

  for (let index = 0; index < 30; index += 1)
    await measured(async () => {
      const service = new ConversationContinuityService(new InMemoryVoiceStore());
      const source = identity();
      await service.resolveTurn(input(source, "Review these files"));
      await service.createProposal({ ...source, canonicalIntent: "RENAME_FILES", canonicalRequest: "Rename validated files.", riskLevel: "moderate_risk" });
      const other = { ...source, conversationId: crypto.randomUUID() };
      const result = await service.resolveTurn(input(other, "do it"));
      if (result.canonicalRequest) crossConversationLeakageCount += 1;
      return result.canonicalRequest === null;
    });

  for (let index = 0; index < 30; index += 1)
    await measured(async () => {
      const store = new InMemoryVoiceStore();
      const service = new ConversationContinuityService(store);
      const source = identity();
      await service.resolveTurn(input(source, "Review these files"));
      await service.createProposal({ ...source, canonicalIntent: "RENAME_FILES", canonicalRequest: "Rename validated files.", riskLevel: "moderate_risk" });
      const other = { ...source, ownerId: crypto.randomUUID() };
      const result = await service.resolveTurn(input(other, "do it"));
      if (result.canonicalRequest) crossOwnerLeakageCount += 1;
      return result.canonicalRequest === null;
    });

  for (let index = 0; index < 20; index += 1)
    await measured(async () => {
      let now = new Date("2026-01-01T00:00:00.000Z");
      const service = new ConversationContinuityService(new InMemoryVoiceStore(), () => now);
      const ids = identity();
      await service.resolveTurn(input(ids, "Review old files"));
      await service.createProposal({ ...ids, canonicalIntent: "DELETE_FILES", canonicalRequest: "Delete old files.", riskLevel: "high_risk" });
      now = new Date("2026-01-01T00:06:00.000Z");
      const result = await service.resolveTurn(input(ids, "do it"));
      if (result.canonicalRequest) staleProposalExecutionCount += 1;
      return result.canonicalRequest === null && result.state.actionProposal?.status === "EXPIRED";
    });

  for (let index = 0; index < 20; index += 1)
    await measured(async () => {
      const service = new ConversationContinuityService(new InMemoryVoiceStore());
      const ids = identity();
      await service.resolveTurn(input(ids, "Review these files"));
      await service.createProposal({ ...ids, canonicalIntent: "RENAME_FILES", canonicalRequest: "Rename the five validated files.", riskLevel: "moderate_risk" });
      const result = await service.resolveTurn(input(ids, "do it"));
      return result.canonicalRequest === "Rename the five validated files.";
    });

  for (let index = 0; index < 20; index += 1)
    await measured(async () => {
      const service = new ConversationContinuityService(new InMemoryVoiceStore());
      const ids = identity();
      const result = await service.resolveTurn(input(ids, index % 2 ? "delete that one" : "undo that"));
      if (result.canonicalRequest) unsafeAmbiguousDestructiveResolutionCount += 1;
      return result.canonicalRequest === null;
    });

  for (let index = 0; index < 10; index += 1)
    await measured(async () => {
      const service = new ConversationContinuityService(new InMemoryVoiceStore());
      const ids = identity();
      await service.resolveTurn(input(ids, "Review these files"));
      await service.createProposal({ ...ids, canonicalIntent: "RENAME_FILES", canonicalRequest: "Rename reviewed files.", riskLevel: "moderate_risk" });
      const result = await service.resolveTurn(
        input({ ...ids, deviceId: crypto.randomUUID(), voiceSessionId: crypto.randomUUID() }, "do it"),
      );
      if (result.canonicalRequest) falseExecutionCount += 1;
      return result.canonicalRequest === null;
    });

  for (let index = 0; index < 10; index += 1)
    await measured(async () => {
      const service = new ConversationContinuityService(new InMemoryVoiceStore());
      const ids = identity();
      const first = await service.resolveTurn(input(ids, "Send the report to Alex"));
      const second = await service.resolveTurn(input(ids, "Alex Tan"));
      const third = await service.resolveTurn(input(ids, "The finance one"));
      const final = await service.resolveTurn(input(ids, "PDF"));
      clarificationChecks += 3;
      if (first.responseText === "Which person do you mean?") clarificationCorrect += 1;
      if (second.responseText === "Which file?") clarificationCorrect += 1;
      if (third.responseText === "PDF or spreadsheet?") clarificationCorrect += 1;
      return final.canonicalRequest === "Send The finance one (pdf) to Alex Tan.";
    });

  for (let index = 0; index < 10; index += 1)
    await measured(() => {
      const service = new ConversationContinuityService(new InMemoryVoiceStore());
      const at = new Date().toISOString();
      const references: ContinuityReference[] = ["Alex Tan", "Alex Lee"].map((value) => ({
        id: crypto.randomUUID(),
        kind: "person",
        label: value,
        value,
        source: "RECENT_REFERENCE",
        confidence: 1,
        deviceId: null,
        resolvedAt: at,
      }));
      const result = service.resolveReference("send it to him", references);
      if (result) incorrectReferenceResolutionCount += 1;
      return result === null;
    });

  for (let index = 0; index < 10; index += 1)
    await measured(() => {
      const service = new ConversationContinuityService(new InMemoryVoiceStore());
      const reference: ContinuityReference = {
        id: crypto.randomUUID(),
        kind: "person",
        label: "Project lead",
        value: "Sarah Tan",
        source: "MEMORY",
        confidence: 0.92,
        deviceId: null,
        resolvedAt: new Date().toISOString(),
      };
      return service.resolveReference("send it", [reference])?.value === "Sarah Tan";
    });

  for (let index = 0; index < 10; index += 1)
    await measured(() => {
      const service = new ConversationContinuityService(new InMemoryVoiceStore());
      const at = new Date().toISOString();
      const references: ContinuityReference[] = ["budget.pdf", "finance.pdf"].map((value) => ({
        id: crypto.randomUUID(),
        kind: "file",
        label: value,
        value,
        source: "RECENT_REFERENCE",
        confidence: 1,
        deviceId: null,
        resolvedAt: at,
      }));
      return (
        service.resolveReference("the previous option", references)?.value === "finance.pdf" &&
        service.resolveReference("the finance one", references)?.value === "finance.pdf"
      );
    });

  for (let index = 0; index < 10; index += 1)
    await measured(async () => {
      let now = new Date("2026-01-01T00:00:00.000Z");
      const service = new ConversationContinuityService(new InMemoryVoiceStore(), () => now);
      const ids = identity();
      await service.resolveTurn(input(ids, "Schedule a meeting with Sarah tomorrow"));
      now = new Date("2026-01-01T00:11:00.000Z");
      const result = await service.resolveTurn(input(ids, "3 PM"));
      return result.canonicalRequest === null && result.state.pendingIntent?.status === "EXPIRED";
    });

  for (let index = 0; index < 10; index += 1)
    await measured(async () => {
      const service = new ConversationContinuityService(new InMemoryVoiceStore());
      const ids = identity();
      const initial = await service.resolveTurn(input(ids, "Schedule a meeting with Sarah tomorrow"));
      const switched = await service.resolveTurn(input(ids, "Actually, what is the weather?"));
      await service.recordOutcome({
        ownerId: ids.ownerId,
        conversationId: ids.conversationId,
        turnId: switched.state.processedTurns[0]?.turnId ?? crypto.randomUUID(),
        responseText: "It is sunny.",
        canonicalRequest: null,
      });
      const repeated = await service.resolveTurn(input(ids, "Repeat that"));
      return (
        initial.responseText === "What time?" &&
        switched.state.pendingIntent?.status === "CANCELLED" &&
        repeated.responseText === "It is sunny."
      );
    });

  for (let index = 0; index < 10; index += 1)
    await measured(async () => {
      const service = new ConversationContinuityService(new InMemoryVoiceStore());
      const ids = identity();
      await service.resolveTurn(input(ids, "Schedule a meeting with Sarah tomorrow"));
      await service.resolveTurn(input({ ...ids, voiceSessionId: crypto.randomUUID() }, "3 PM"));
      const final = await service.resolveTurn(input({ ...ids, voiceSessionId: crypto.randomUUID() }, "One hour"));
      return final.canonicalRequest === "Schedule a 60 minute meeting with Sarah tomorrow at 3:00 PM.";
    });

  latencies.sort((left, right) => left - right);
  const totalLatency = latencies.reduce((sum, value) => sum + value, 0);
  return {
    totalCases,
    correctCases,
    overallAccuracy: correctCases / totalCases,
    deterministicResolutionRate: deterministicCases / totalCases,
    aiAssistedResolutionRate: aiAssistedCases / totalCases,
    clarificationCorrectness: clarificationChecks ? clarificationCorrect / clarificationChecks : 1,
    incorrectReferenceResolutionCount,
    falseExecutionCount,
    staleProposalExecutionCount,
    crossConversationLeakageCount,
    crossOwnerLeakageCount,
    unsafeAmbiguousDestructiveResolutionCount,
    averageLatencyMs: totalLatency / latencies.length,
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
  };
};
