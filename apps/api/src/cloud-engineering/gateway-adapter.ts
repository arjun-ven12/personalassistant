import { z } from "zod";
import type { ReviewedToolManifest } from "../universal-tools/lifecycle.js";
import type { ReviewedToolHandler } from "../universal-tools/reviewed-adapter.js";
import { normalizeSchema, schemaDigest } from "../universal-tools/schema.js";
import type { EngineeringGitHubService } from "./github.js";

const credential = { type: "string", minLength: 36, maxLength: 36 };
const providerId = { type: "integer", minimum: 1 };
const inputSchemas = {
  prepare_workspace: {
    type: "object",
    properties: {
      credentialReferenceId: credential,
      registrationId: { type: "string", minLength: 36, maxLength: 36 },
    },
    required: ["credentialReferenceId", "registrationId"],
    additionalProperties: false,
  },
  list_repositories: {
    type: "object",
    properties: {
      credentialReferenceId: credential,
      page: { type: "integer", minimum: 1, maximum: 100 },
      search: { type: "string", maxLength: 100 },
    },
    required: ["credentialReferenceId"],
    additionalProperties: false,
  },
  register_repository: {
    type: "object",
    properties: { credentialReferenceId: credential, providerRepositoryId: providerId },
    required: ["credentialReferenceId", "providerRepositoryId"],
    additionalProperties: false,
  },
  create_repository: {
    type: "object",
    properties: {
      credentialReferenceId: credential,
      name: { type: "string", minLength: 1, maxLength: 100 },
      description: { type: "string", maxLength: 300 },
      private: { type: "boolean" },
      idempotencyKey: { type: "string", minLength: 36, maxLength: 36 },
    },
    required: ["credentialReferenceId", "name", "idempotencyKey"],
    additionalProperties: false,
  },
} as const;
const row = {
  type: "object",
  properties: {
    providerRepositoryId: providerId,
    fullName: { type: "string", maxLength: 201 },
    defaultBranch: { type: "string", maxLength: 200 },
    private: { type: "boolean" },
    registrationId: { type: "string", maxLength: 36 },
  },
  required: [
    "providerRepositoryId",
    "fullName",
    "defaultBranch",
    "private",
    "registrationId",
  ],
  additionalProperties: false,
};
const listOutput = {
  type: "object",
  properties: { repositories: { type: "array", maxItems: 100, items: row } },
  required: ["repositories"],
  additionalProperties: false,
};
const mutationOutput = {
  type: "object",
  properties: {
    registrationId: { type: "string", minLength: 36, maxLength: 36 },
    providerRepositoryId: providerId,
  },
  required: ["registrationId", "providerRepositoryId"],
  additionalProperties: false,
};

/** Called only by the registered API adapter after exact Tool Gateway authority. */
export function createGitHubGatewayAdapter(
  service: EngineeringGitHubService,
  credentialForScope?: (ownerId: string, companyId: string) => Promise<string | null>,
  reviewedProviderId = "engineering.github",
  prepareWorkspace?: (
    ownerId: string,
    companyId: string,
    registrationId: string,
  ) => Promise<{ id: string; repositoryId: string; state: string }>,
): { handlers: ReviewedToolHandler[]; manifests: ReviewedToolManifest[] } {
  const names = Object.keys(inputSchemas) as (keyof typeof inputSchemas)[];
  const handlers: ReviewedToolHandler[] = names.map((name) => {
    const read = name === "list_repositories";
    return {
      providerId: reviewedProviderId,
      descriptor: {
        name,
        description: `Reviewed company GitHub ${name.replaceAll("_", " ")}.`,
        inputSchema: inputSchemas[name],
        outputSchema: read
          ? listOutput
          : name === "prepare_workspace"
            ? {
                type: "object",
                properties: {
                  workspaceId: credential,
                  repositoryId: credential,
                  state: { type: "string", maxLength: 30 },
                },
                required: ["workspaceId", "repositoryId", "state"],
                additionalProperties: false,
              }
            : mutationOutput,
        capabilityCategory: `github.${name}`,
        department: "engineering",
        operationClass: read ? "READ" : "WRITE",
        riskLevel: read ? "read_only" : "high",
        approvalRequirement: read ? "session" : "recent_authentication",
        costModel: "UNKNOWN",
      },
      ...(!read
        ? {
            writeRecovery: "PROVIDER_IDEMPOTENT_RECONCILABLE" as const,
            async reconcile(input: {
              ownerId: string;
              companyId: string | null;
              invocationId: string;
            }) {
              if (!input.companyId || name !== "create_repository")
                return { status: "UNKNOWN" as const, externalOperationId: null };
              const registration = await service.reconcileCreation(
                input.ownerId,
                input.companyId,
                input.invocationId,
              );
              return registration
                ? {
                    status: "SUCCEEDED" as const,
                    structuredOutput: {
                      registrationId: registration.id,
                      providerRepositoryId:
                        registration.repository.providerRepositoryId,
                    },
                    externalOperationId: registration.id,
                  }
                : { status: "UNKNOWN" as const, externalOperationId: null };
            },
          }
        : {}),
      async invoke(input) {
        if (!input.companyId) throw Error("Company scope is required.");
        if (!read && input.idempotencyKey !== input.invocationId)
          throw Error("Exact invocation idempotency is required.");
        if (
          name === "create_repository" &&
          z
            .object({ idempotencyKey: z.string().uuid() })
            .passthrough()
            .parse(input.arguments).idempotencyKey !== input.invocationId
        )
          throw Error("Creation key must match the governed invocation.");
        const credentialReferenceId = z
          .object({ credentialReferenceId: z.string().uuid() })
          .passthrough()
          .parse(input.arguments).credentialReferenceId;
        if (
          !credentialForScope ||
          (await credentialForScope(input.ownerId, input.companyId)) !==
            credentialReferenceId
        )
          throw Error(
            "The invocation credential must match the reviewed provider credential.",
          );
        if (name === "prepare_workspace") {
          if (!prepareWorkspace)
            throw Error("Reviewed workspace provider unavailable.");
          const request = z
            .object({
              credentialReferenceId: z.string().uuid(),
              registrationId: z.string().uuid(),
            })
            .strict()
            .parse(input.arguments);
          const result = await prepareWorkspace(
            input.ownerId,
            input.companyId,
            request.registrationId,
          );
          return {
            structuredOutput: {
              workspaceId: result.id,
              repositoryId: result.repositoryId,
              state: result.state,
            },
            externalOperationId: result.id,
          };
        }
        if (read) {
          const values = await service.listAuthorized(
            input.ownerId,
            input.companyId,
            input.arguments,
          );
          return {
            structuredOutput: {
              repositories: values.map(({ repository, registration }) => ({
                providerRepositoryId: repository.providerRepositoryId,
                fullName: repository.fullName,
                defaultBranch: repository.defaultBranch,
                private: repository.private,
                registrationId: registration?.id ?? "",
              })),
            },
          };
        }

        const registration =
          name === "create_repository"
            ? await service.create(input.ownerId, input.companyId, input.arguments)
            : await service.register(input.ownerId, input.companyId, input.arguments);
        return {
          structuredOutput: {
            registrationId: registration.id,
            providerRepositoryId: registration.repository.providerRepositoryId,
          },
          externalOperationId: registration.id,
        };
      },
    };
  });
  const manifests: ReviewedToolManifest[] = handlers.map((handler) => ({
    providerId: handler.providerId,
    toolName: handler.descriptor.name,
    sourceType: "API",
    schemaDigest: schemaDigest({
      type: "object",
      properties: {
        input: normalizeSchema(handler.descriptor.inputSchema),
        output: normalizeSchema(handler.descriptor.outputSchema),
      },
      required: ["input", "output"],
      additionalProperties: false,
    }),
    providerVersion: "1",
    governanceToolName:
      handler.descriptor.operationClass === "READ"
        ? "universal.external_read"
        : "universal.external_publish",
    operationClass: handler.descriptor.operationClass,
    riskLevel: handler.descriptor.riskLevel,
    approvalRequirement: handler.descriptor.approvalRequirement,
    credentialRequired: true,
  }));
  return { handlers, manifests };
}
