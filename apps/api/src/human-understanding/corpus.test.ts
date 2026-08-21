import { describe, expect, it } from "vitest";

import { InMemoryMemoryStore } from "../memory/store.js";
import {
  CorpusCompiler,
  CorpusRuntimeService,
  CorpusValidator,
  normalizeCorpusUtterance,
} from "./corpus.js";
import { InMemoryHumanUnderstandingStore } from "./store.js";

const corpusPath =
  "/Users/arjunaravapalli/Downloads/Alexa_Personality_Seed_Corpus_v4_coverage_safety.md";

describe("Personality seed corpus", () => {
  it("normalizes filler while preserving negation", () => {
    expect(
      normalizeCorpusUtterance("hey Alexa could you please just quickly open VS Code for me"),
    ).toBe("open vs code");
    expect(normalizeCorpusUtterance("actually don't open Chrome")).toContain("don't");
    expect(normalizeCorpusUtterance("only open the first one after that")).toContain("only");
  });

  it("compiles the canonical markdown into structured deterministic runtime entries", async () => {
    const compiled = await new CorpusCompiler(() => new Date("2026-08-07T00:00:00.000Z"))
      .compileFromMarkdown(corpusPath);

    expect(compiled.manifest.corpusId).toBe("alexa-personality-seed-corpus");
    expect(compiled.manifest.corpusVersion).toBe("v4-coverage-safety");
    expect(compiled.manifest.profileCount).toBe(7);
    expect(compiled.manifest.negativeExampleCount).toBeGreaterThan(0);
    expect(compiled.entries.some((entry) => entry.entryType === "response_template")).toBe(true);
    expect(compiled.entries.every((entry) => entry.requiresAi === false)).toBe(true);
  });

  it("validates corpus ambiguity without treating ordinary contextual ambiguity as startup-fatal", async () => {
    const ownerId = crypto.randomUUID();
    const compiled = await new CorpusCompiler(() => new Date("2026-08-07T00:00:00.000Z"))
      .compileFromMarkdown(corpusPath);
    const validation = new CorpusValidator().validate(ownerId, compiled.manifest, compiled.entries);

    expect(validation.criticalCount).toBe(0);
    expect(validation.warningCount).toBeGreaterThan(0);
    expect(validation.issues.some((issue) => issue.code === "AMBIGUOUS_UTTERANCE")).toBe(true);
  });

  it("imports idempotently into existing runtime stores and seeds vector memory records", async () => {
    const ownerId = crypto.randomUUID();
    const store = new InMemoryHumanUnderstandingStore();
    const memoryStore = new InMemoryMemoryStore();
    const runtime = new CorpusRuntimeService(
      store,
      memoryStore,
      () => new Date("2026-08-07T00:00:00.000Z"),
    );

    const first = await runtime.importFromMarkdown(ownerId, corpusPath);
    const second = await runtime.importFromMarkdown(ownerId, corpusPath);
    const dashboard = await runtime.dashboard(ownerId);

    expect(first.validation.criticalCount).toBe(0);
    expect(second.importRecord.id).toBe(first.importRecord.id);
    expect(dashboard.activeVersion?.corpusVersion).toBe("v4-coverage-safety");
    expect(dashboard.entries.length).toBe(
      Object.values(first.manifest.entryCounts).reduce((sum, value) => sum + value, 0),
    );
    expect(dashboard.negativeExamples.length).toBe(first.manifest.negativeExampleCount);
    expect(memoryStore.listMemories(ownerId, 1_000).length).toBe(
      first.manifest.vectorSeedCount,
    );
  });

  it("treats negative examples as first-class non-execution data", async () => {
    const ownerId = crypto.randomUUID();
    const runtime = new CorpusRuntimeService(
      new InMemoryHumanUnderstandingStore(),
      new InMemoryMemoryStore(),
      () => new Date("2026-08-07T00:00:00.000Z"),
    );
    await runtime.importFromMarkdown(ownerId, corpusPath);

    const result = await runtime.testUtterance(ownerId, "I'm reading about how to delete a file");

    expect(result.mustNotExecute).toBe(true);
    expect(result.candidateIntent).toBe("NON_EXECUTION");
    expect(result.aiUsed).toBe(false);
    expect(result.negativeExampleMatches.length).toBeGreaterThan(0);
  });
});
