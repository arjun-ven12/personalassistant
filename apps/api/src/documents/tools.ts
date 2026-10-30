import { z } from "zod";
import { DocumentRecordSchema } from "@alexa-control/shared";
import type { ReviewedToolHandler } from "../universal-tools/reviewed-adapter.js";
import type { ReviewedToolManifest } from "../universal-tools/lifecycle.js";
import { normalizeSchema, schemaDigest } from "../universal-tools/schema.js";
import type { DocumentService } from "./service.js";
import { cleanDocumentImage, type OcrProvider } from "./providers.js";
import { classifyDocument } from "./privacy.js";
export const DocumentWorkOutputSchema = z
  .object({ resultId: z.string().uuid() })
  .strict();
const args = z
  .object({ documentId: z.string().uuid(), page: z.number().int().min(1).max(5) })
  .strict();
export function documentTools(
  service: DocumentService,
  ocr: OcrProvider,
  companyIds: string[],
) {
  const handlers: ReviewedToolHandler[] = [],
    manifests: ReviewedToolManifest[] = [];
  for (const companyId of companyIds)
    for (const name of [
      "document.scan.process",
      "document.ocr",
      "document.classify",
    ] as const) {
      const providerId = `athena.documents.${companyId}`;
      const inputSchema = {
        type: "object",
        properties: {
          documentId: { type: "string", minLength: 36, maxLength: 36 },
          page: { type: "integer", minimum: 1, maximum: 5 },
        },
        required: ["documentId", "page"],
        additionalProperties: false,
      };
      const outputSchema = {
        type: "object",
        properties: { resultId: { type: "string", minLength: 36, maxLength: 36 } },
        required: ["resultId"],
        additionalProperties: false,
      };
      const digest = schemaDigest({
        type: "object",
        properties: {
          input: normalizeSchema(inputSchema),
          output: normalizeSchema(outputSchema),
        },
        required: ["input", "output"],
        additionalProperties: false,
      });
      handlers.push({
        providerId,
        descriptor: {
          name,
          description:
            "Finite private document derivation; receipt contains an opaque temporary result ID only.",
          inputSchema,
          outputSchema,
          capabilityCategory: name,
          department: "knowledge",
          operationClass: "READ",
          riskLevel: "read_only",
          approvalRequirement: "session",
          costModel: "FREE",
        },
        async invoke(input) {
          if (
            input.companyId !== companyId ||
            input.context.companyId !== companyId ||
            input.context.ownerId !== input.ownerId ||
            input.context.emergencyStopActive
          )
            throw Error("DOCUMENT_SCOPE_DENIED");
          const parsed = args.parse(input.arguments),
            scope = { ownerId: input.ownerId, companyId };
          const d = DocumentRecordSchema.parse(
            await service.require(scope, parsed.documentId),
          );
          const p = d.pages[parsed.page - 1];
          if (!p?.original) throw Error("DOCUMENT_PAGE_MISSING");
          const result =
            name === "document.scan.process"
              ? {
                  cleaned: await cleanDocumentImage(
                    await service.assets.read(scope, p.original),
                    (await service.store.settings(scope)).autoClean,
                    p.edit,
                  ),
                }
              : name === "document.ocr"
                ? {
                    ocr: await ocr.extract(
                      await service.assets.read(scope, p.cleaned ?? p.original),
                    ),
                  }
                : {
                    classification: classifyDocument(
                      d.pages.map((p) => p.ocr?.text ?? "").join("\n"),
                    ),
                  };
          return { structuredOutput: { resultId: service.stash(scope, result) } };
        },
      });
      manifests.push({
        providerId,
        toolName: name,
        sourceType: "API",
        schemaDigest: digest,
        providerVersion: "1.0.0",
        governanceToolName: "universal.external_read",
        operationClass: "READ",
        riskLevel: "read_only",
        approvalRequirement: "session",
        credentialRequired: false,
      });
    }
  return { handlers, manifests };
}
