import { describe, expect, it } from "vitest";
import { EngineeringDraftCreateOperationSchema } from "./engineering-draft.js";

const input = {
  operation: "engineering_draft_create",
  companyId: crypto.randomUUID(),
  request: {
    repositoryId: crypto.randomUUID(),
    request: "Add a label normalizer with tests.",
    idempotencyKey: "draft-contract-fixture",
  },
};
describe("signed engineering draft boundary", () => {
  it("normalizes a finite existing-repository request with no execution flags", () => {
    expect(EngineeringDraftCreateOperationSchema.parse(input).request).toMatchObject({
      visibleMode: false,
      developmentRootWorkspaceId: null,
    });
  });
  it.each([
    { ...input, ownerId: crypto.randomUUID() },
    { ...input, operation: "run" },
    {
      ...input,
      request: {
        ...input.request,
        repositoryId: null,
        developmentRootWorkspaceId: "caller.root",
      },
    },
    { ...input, request: { ...input.request, visibleMode: true } },
    { ...input, request: { ...input.request, approval: true } },
    { ...input, request: { ...input.request, command: "unregistered" } },
  ])("rejects authority, initialization, preview and execution expansion", (value) => {
    expect(EngineeringDraftCreateOperationSchema.safeParse(value).success).toBe(false);
  });
});
