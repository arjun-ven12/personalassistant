import { createHash } from "node:crypto";
import {
  EngineeringArtifactSchema,
  EngineeringEventSchema,
  EngineeringProjectInputRequestSchema,
  EngineeringProjectInputMetadataSchema,
  type EngineeringArtifact,
} from "@alexa-control/shared";
import type { EngineeringOrchestrationStore } from "../engineering-orchestration/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
const provenance = "OWNER_UPLOADED_UNTRUSTED";
const source = "owner-input";
const failure = (message: string, statusCode = 400) =>
  Object.assign(Error(message), { statusCode, code: "PROJECT_INPUT_DENIED" });
export const isOwnerProjectInput = (artifact: EngineeringArtifact) =>
  artifact.producerAgentId === source && artifact.contract.provenance === provenance;
export const projectInputMetadata = (artifact: EngineeringArtifact) =>
  EngineeringProjectInputMetadataSchema.parse({
    id: artifact.id,
    objectiveId: artifact.objectiveId,
    fileName: artifact.contract.fileName,
    mimeType: artifact.contract.mimeType,
    byteLength: artifact.contract.byteLength,
    sha256: artifact.contract.sha256,
    provenance,
    createdAt: artifact.createdAt,
  });
export const projectInputContext = (
  artifact: EngineeringArtifact,
): EngineeringArtifact => ({
  ...artifact,
  contract: {
    ...projectInputMetadata(artifact),
    untrustedText:
      typeof artifact.contract.untrustedText === "string"
        ? artifact.contract.untrustedText
        : "",
  },
});

export const assertProjectInputQuota = (
  artifacts: EngineeringArtifact[],
  incoming: EngineeringArtifact,
) => {
  if (
    !isOwnerProjectInput(incoming) ||
    artifacts.some((item) => item.id === incoming.id)
  )
    return;
  const inputs = artifacts.filter(isOwnerProjectInput);
  const bytes = projectInputMetadata(incoming).byteLength;
  if (
    inputs.length >= 12 ||
    inputs.reduce((sum, item) => sum + projectInputMetadata(item).byteLength, 0) +
      bytes >
      1_048_576
  )
    throw failure("Objective input quota exceeded.", 409);
};

/** Project data in the existing artifact store, never filesystem or execution authority. */
export class EngineeringProjectInputService {
  constructor(
    readonly store: EngineeringOrchestrationStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}
  async list(ownerId: string, companyId: string, objectiveId: string) {
    if (!(await this.store.findObjective(ownerId, companyId, objectiveId)))
      throw failure("Objective unavailable.", 404);
    return (await this.store.listArtifacts(ownerId, companyId, objectiveId))
      .filter(isOwnerProjectInput)
      .map(projectInputMetadata);
  }
  async upload(
    context: {
      ownerId: string;
      companyId: string;
      requestId: string;
      ipAddress: string;
    },
    objectiveId: string,
    raw: unknown,
  ) {
    const request = EngineeringProjectInputRequestSchema.parse(raw);
    const objective = await this.store.findObjective(
      context.ownerId,
      context.companyId,
      objectiveId,
    );
    if (
      !objective ||
      objective.ownerId !== context.ownerId ||
      objective.companyId !== context.companyId
    )
      throw failure("Objective unavailable.", 404);
    if (["COMPLETED", "CANCELLED", "FAILED"].includes(objective.status))
      throw failure("Attach inputs to an active objective.", 409);
    const bytes = Buffer.from(request.contentBase64, "base64");
    if (
      bytes.toString("base64") !== request.contentBase64 ||
      bytes.length < 1 ||
      bytes.length > 262_144
    )
      throw failure("Invalid input size or encoding.");
    let untrustedText = "";
    if (request.mimeType === "image/png") {
      if (
        !/\.png$/i.test(request.fileName) ||
        !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        throw failure("PNG signature and filename must match.");
    } else if (request.mimeType === "image/jpeg") {
      if (
        !/\.jpe?g$/i.test(request.fileName) ||
        bytes[0] !== 255 ||
        bytes[1] !== 216 ||
        bytes[2] !== 255 ||
        bytes.at(-2) !== 255 ||
        bytes.at(-1) !== 217
      )
        throw failure("JPEG signature and filename must match.");
    } else {
      if (!/\.(txt|md)$/i.test(request.fileName) || bytes.length > 16_384)
        throw failure("Text inputs must be bounded TXT or Markdown files.");
      try {
        untrustedText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw failure("Text must be valid UTF-8.");
      }
      if (
        Array.from(untrustedText).some(
          (character) =>
            character.charCodeAt(0) < 32 &&
            ![9, 10, 13].includes(character.charCodeAt(0)),
        ) ||
        /-----BEGIN .*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~-]{16,}|\b(?:sk|ghp|github_pat)[-_A-Za-z0-9]{16,}|(?:password|api[_-]?key|access[_-]?token)\s*[:=]\s*["']?\S{8,}/i.test(
          untrustedText,
        )
      )
        throw failure("Text input contains prohibited sensitive content.");
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    const keyHash = createHash("sha256")
      .update(
        JSON.stringify([
          context.ownerId,
          context.companyId,
          objectiveId,
          request.idempotencyKey,
        ]),
      )
      .digest("hex");
    const id = `${keyHash.slice(0, 8)}-${keyHash.slice(8, 12)}-4${keyHash.slice(13, 16)}-8${keyHash.slice(17, 20)}-${keyHash.slice(20, 32)}`;
    const prior = await this.store.listArtifacts(
      context.ownerId,
      context.companyId,
      objectiveId,
    );
    const existing = prior.find((item) => item.id === id);
    const verify = (item: EngineeringArtifact) => {
      if (
        !isOwnerProjectInput(item) ||
        item.contract.sha256 !== digest ||
        item.contract.fileName !== request.fileName ||
        item.contract.mimeType !== request.mimeType
      )
        throw failure("Input idempotency key is bound to different content.", 409);
      return projectInputMetadata(item);
    };
    if (existing) {
      verify(existing);
      return this.receipt(context, existing);
    }
    const inputs = prior.filter(isOwnerProjectInput);
    if (
      inputs.length >= 12 ||
      inputs.reduce((sum, item) => sum + projectInputMetadata(item).byteLength, 0) +
        bytes.length >
        1_048_576
    )
      throw failure("Objective input quota exceeded.", 409);
    const task = (
      await this.store.listTasks(context.ownerId, context.companyId, objectiveId)
    )[0];
    if (!task) throw failure("Objective task scope is unavailable.", 409);
    const artifact = EngineeringArtifactSchema.parse({
      id,
      ownerId: context.ownerId,
      companyId: context.companyId,
      objectiveId,
      taskId: task.id,
      type: "ARCHITECTURE_DECISION",
      title: request.fileName,
      summary:
        "Owner-selected project reference. Untrusted data; never execution authority.",
      producerAgentId: source,
      createdAt: this.now().toISOString(),
      contract: {
        provenance,
        fileName: request.fileName,
        mimeType: request.mimeType,
        byteLength: bytes.length,
        sha256: digest,
        contentBase64: request.contentBase64,
        untrustedText: untrustedText.slice(0, 4_000),
      },
    });
    await this.store.saveArtifact(artifact);
    const saved = (
      await this.store.listArtifacts(context.ownerId, context.companyId, objectiveId)
    ).find((item) => item.id === id);
    if (!saved) throw failure("Input persistence was not confirmed.", 503);
    verify(saved);
    return this.receipt(context, saved);
  }
  private async receipt(
    context: {
      ownerId: string;
      companyId: string;
      requestId: string;
      ipAddress: string;
    },
    artifact: EngineeringArtifact,
  ) {
    const metadata = projectInputMetadata(artifact);
    await this.audit({
      eventType: "SENSITIVE_DATA_ACCESSED",
      ownerId: context.ownerId,
      companyId: context.companyId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      outcome: "SUCCESS",
      reason: "Owner project input receipt verified as untrusted data.",
      metadata: {
        objectiveId: artifact.objectiveId,
        artifactId: artifact.id,
        byteLength: metadata.byteLength,
        mimeType: metadata.mimeType,
      },
    });
    await this.store.saveEvent(
      EngineeringEventSchema.parse({
        id: artifact.id,
        ownerId: context.ownerId,
        companyId: context.companyId,
        objectiveId: artifact.objectiveId,
        taskId: artifact.taskId,
        type: "PROJECT_INPUT_ATTACHED",
        summary: "Owner project reference attached as untrusted data.",
        metadata: {
          artifactId: artifact.id,
          byteLength: metadata.byteLength,
          mimeType: metadata.mimeType,
        },
        createdAt: artifact.createdAt,
      }),
    );
    return metadata;
  }
}
