import { describe, expect, it } from "vitest";

import { phase21AConversationBenchmark } from "./benchmark.js";
import { classifyConversationTurn } from "./interpretation.js";

describe("Phase 21A conversation benchmark", () => {
  it("contains 300 structurally labelled cases across required categories", () => {
    expect(phase21AConversationBenchmark).toHaveLength(300);
    expect(new Set(phase21AConversationBenchmark.map((item) => item.category)).size).toBe(20);
    expect(phase21AConversationBenchmark.every((item) => item.expectedRouteClass.length > 0)).toBe(true);
  });

  it("has zero unsafe deterministic false actions", () => {
    const results = phase21AConversationBenchmark.map((item) => ({
      item,
      actual: classifyConversationTurn(item.utterance),
    }));
    const unsafeFalseActions = results.filter(
      ({ item, actual }) => !item.expectedExecution && actual.classification === "ACTION",
    );
    expect(unsafeFalseActions).toEqual([]);
  });

  it("meets the deterministic speech-act labels for safety-critical cases", () => {
    const safetyCases = phase21AConversationBenchmark.filter(
      (item) =>
        item.mustNotExecute ||
        item.expectedClassification === "ACTION" ||
        item.expectedClassification === "CLARIFY",
    );
    const mismatches = safetyCases
      .map((item) => ({
        id: item.id,
        expected: item.expectedClassification,
        actual: classifyConversationTurn(item.utterance).classification,
      }))
      .filter((item) => item.expected !== item.actual);
    expect(mismatches).toEqual([]);
  });
});
