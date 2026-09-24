import { describe, expect, it, vi } from "vitest";
import type { AIRouterService } from "../ai/router/service.js";
import type { AgentStore } from "../agents/store.js";
import { AIRouterEngineeringIntegrationReviewer } from "./ai-reviewer.js";

describe("integration reviewer routing", () => {
  it("resolves the scoped assignment for cognitive context and supplies the output schema", async () => {
    const executeStructured = vi.fn((input: Parameters<AIRouterService["executeStructured"]>[0]) => {
      void input;
      return Promise.resolve({
        outcome: "ROUTING_FAILED", decision: { reason: "Generic failure" },
        attempts: [{ reason: "Required cognitive context is unavailable: AGENT." }],
      });
    });
    const reviewer = new AIRouterEngineeringIntegrationReviewer(
      { executeStructured } as unknown as AIRouterService,
      { listAssignments: () => Promise.resolve([
        { id: "assignment", companyId: "company", status: "DORMANT", agentDefinitionId: "code_reviewer" },
      ]) } as unknown as AgentStore,
    );
    const input = {
      run: { ownerId: "owner", companyId: "company", id: "run", objectiveId: "objective" },
      reviewerAgentId: "assignment", security: false, taskResults: [],
      validationReport: { id: "report", status: "PASS", steps: [] },
      acceptanceCriteria: [], filesChanged: [], combinedPatch: "", headCommit: "a".repeat(40),
      signal: new AbortController().signal,
    } as unknown as Parameters<typeof reviewer.review>[0];
    const output = await reviewer.review(input);
    expect(executeStructured).toHaveBeenCalledWith(expect.objectContaining({
      agentId: "code_reviewer", agentDefinitionId: "code_reviewer",
      companyAgentAssignmentId: "assignment", jsonSchema: expect.any(Object) as unknown,
      maxOutputTokens: 8_192,
      economicContext: expect.objectContaining({ agentId: "assignment" }) as unknown,
    }), expect.any(Object));
    expect(executeStructured.mock.calls[0]?.[0].input[0]?.content[0])
      .toEqual(expect.objectContaining({ value: expect.objectContaining({
        integrationValidation: { reportId: "report", status: "PASS", steps: [] },
      }) as unknown }));
    expect(output.findings).toEqual(["Required cognitive context is unavailable: AGENT."]);
    await expect(reviewer.review({ ...input, run: { ...input.run, companyId: "other" } }))
      .rejects.toThrow("no active company assignment");
    expect(executeStructured).toHaveBeenCalledTimes(1);
  });
});
