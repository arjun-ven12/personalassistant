import { describe, expect, it, vi } from "vitest";
import { createGitHubGatewayAdapter } from "./gateway-adapter.js";
import type { EngineeringGitHubService } from "./github.js";
import { validateValue, normalizeSchema } from "../universal-tools/schema.js";
const invocationId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const context = {
  ownerId: invocationId,
  companyId,
  agentId: null,
  requestId: invocationId,
  emergencyStopActive: false,
};
describe("finite governed GitHub adapter", () => {
  it("has reviewable strict schemas and strengthens remote mutations to recent authentication", () => {
    const { handlers, manifests } = createGitHubGatewayAdapter(
      {} as EngineeringGitHubService,
    );
    for (const handler of handlers) {
      expect(() => normalizeSchema(handler.descriptor.inputSchema)).not.toThrow();
      expect(() => normalizeSchema(handler.descriptor.outputSchema)).not.toThrow();
    }
    expect(
      manifests
        .filter((item) => item.operationClass === "WRITE")
        .every(
          (item) =>
            item.governanceToolName === "universal.external_publish" &&
            item.riskLevel === "high" &&
            item.approvalRequirement === "recent_authentication",
        ),
    ).toBe(true);
    expect(() =>
      validateValue(normalizeSchema(handlers[0]!.descriptor.inputSchema), {
        credentialReferenceId: invocationId,
        token: "untrusted",
      }),
    ).toThrow();
  });
  it("denies missing company and altered creation idempotency before provider write", async () => {
    const create = vi.fn();
    const { handlers } = createGitHubGatewayAdapter({
      create,
    } as unknown as EngineeringGitHubService);
    const handler = handlers.find(
      (item) => item.descriptor.name === "create_repository",
    )!;
    const input = {
      context,
      ownerId: invocationId,
      companyId,
      invocationId,
      idempotencyKey: invocationId,
      arguments: {
        credentialReferenceId: invocationId,
        name: "site",
        idempotencyKey: companyId,
      },
    };
    await expect(handler.invoke(input)).rejects.toThrow("Creation key");
    await expect(handler.invoke({ ...input, companyId: null })).rejects.toThrow(
      "Company scope",
    );
    expect(create).not.toHaveBeenCalled();
  });
  it("reconciles an exact creation receipt without repeating provider creation", async () => {
    const create = vi.fn();
    const reconcileCreation = vi.fn(() =>
      Promise.resolve({ id: companyId, repository: { providerRepositoryId: 42 } }),
    );
    const { handlers } = createGitHubGatewayAdapter({
      create,
      reconcileCreation,
    } as unknown as EngineeringGitHubService);
    const handler = handlers.find(
      (item) => item.descriptor.name === "create_repository",
    )!;
    const receipt = await handler.reconcile!({
      ownerId: invocationId,
      companyId,
      invocationId,
      requestDigest: "a".repeat(64),
    });
    expect(receipt).toMatchObject({
      status: "SUCCEEDED",
      structuredOutput: { registrationId: companyId, providerRepositoryId: 42 },
    });
    expect(create).not.toHaveBeenCalled();
  });
  it("binds invocation credentials to the exact reviewed provider before any GitHub read", async () => {
    const listAuthorized = vi.fn(() => Promise.resolve([]));
    const { handlers } = createGitHubGatewayAdapter(
      { listAuthorized } as unknown as EngineeringGitHubService,
      () => Promise.resolve(companyId),
      "engineering.github.company_a",
    );
    const handler = handlers.find(
      (item) => item.descriptor.name === "list_repositories",
    )!;
    expect(handler.providerId).toBe("engineering.github.company_a");
    const input = {
      context,
      ownerId: invocationId,
      companyId,
      invocationId,
      idempotencyKey: invocationId,
      arguments: { credentialReferenceId: invocationId },
    };
    await expect(handler.invoke(input)).rejects.toThrow("reviewed provider credential");
    expect(listAuthorized).not.toHaveBeenCalled();
    await expect(
      handler.invoke({ ...input, arguments: { credentialReferenceId: companyId } }),
    ).resolves.toEqual({ structuredOutput: { repositories: [] } });
    expect(listAuthorized).toHaveBeenCalledOnce();
  });
});
