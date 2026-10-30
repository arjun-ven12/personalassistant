import { z } from "zod";
import { MemoryRecordSchema } from "./memory.js";
export const DocumentMemoriesSchema = z
  .object({
    documentId: z.string().uuid(),
    memories: z
      .array(
        MemoryRecordSchema.pick({ id: true, title: true, summary: true }).extend({
          page: z.number().int().min(1).max(5),
        }),
      )
      .max(15),
  })
  .strict();
export const DocumentSettingsSchema = z
  .object({
    autoClean: z.boolean().default(true),
    autoOcr: z.boolean().default(true),
    autoMemory: z
      .enum(["OFF", "SUGGEST", "AUTO_FOR_APPROVED_CATEGORIES"])
      .default("SUGGEST"),
    approvedCategories: z
      .array(z.enum(["Study", "Projects"]))
      .max(2)
      .default([]),
  })
  .strict();
export const DocumentPageEditSchema = z
  .object({
    rotation: z
      .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
      .default(0),
    crop: z
      .object({
        left: z.number().min(0).max(1),
        top: z.number().min(0).max(1),
        right: z.number().min(0).max(1),
        bottom: z.number().min(0).max(1),
      })
      .strict()
      .refine(
        (b) => b.right - b.left >= 0.05 && b.bottom - b.top >= 0.05,
        "Crop too small",
      )
      .nullable()
      .default(null),
  })
  .strict();
export const DocumentCreateSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    sourceType: z.enum(["CAMERA", "IMPORT"]),
    pageCount: z.number().int().min(1).max(5),
    pageEdits: z.array(DocumentPageEditSchema).min(1).max(5).optional(),
  })
  .strict();
export const DocumentUploadSchema = z
  .object({
    token: z.string().min(32).max(128),
    mimeType: z.enum(["image/jpeg", "image/png"]),
    base64: z
      .string()
      .min(4)
      .max(8_388_608)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export const DocumentEditSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    tags: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
    collection: z
      .enum(["Scans", "Study", "Projects", "Receipts", "Notes", "Other"])
      .optional(),
  })
  .strict();
export const DocumentStageSchema = z.enum([
  "UPLOADING",
  "PROCESSING_IMAGE",
  "EXTRACTING_TEXT",
  "CLASSIFYING",
  "SAVING",
  "MEMORY_INDEXING",
  "COMPLETE",
  "FAILED",
  "ARCHIVED",
]);
/** Normalized top-left bounds on the exact cleaned image used for OCR. */
export const DocumentTextBoxSchema = z
  .object({
    text: z.string().min(1).max(1000),
    left: z.number().finite().min(0).max(1),
    top: z.number().finite().min(0).max(1),
    right: z.number().finite().min(0).max(1),
    bottom: z.number().finite().min(0).max(1),
  })
  .strict()
  .refine((b) => b.right > b.left && b.bottom > b.top, "Invalid OCR bounds");
export const DocumentLayoutSchema = z
  .object({
    width: z.number().int().positive().max(16000),
    height: z.number().int().positive().max(16000),
    words: z.array(DocumentTextBoxSchema).max(10000),
  })
  .strict();
export const DocumentOcrSchema = z
  .object({
    text: z.string().max(50_000),
    layout: DocumentLayoutSchema.nullable().optional(),
    confidence: z.number().min(0).max(1).nullable(),
    language: z.string().max(24).nullable(),
    provider: z.string().max(100),
    version: z.string().max(80),
    timestamp: z.iso.datetime(),
    latencyMs: z.number().nonnegative(),
    costMinor: z.number().nonnegative().nullable(),
    costCurrency: z.string().length(3).nullable(),
  })
  .strict();
export const DocumentPageSchema = z
  .object({
    number: z.number().int().min(1).max(5),
    original: z.string().uuid().nullable(),
    originalDigest: z.string().length(64).nullable(),
    edit: DocumentPageEditSchema.optional(),
    cleaned: z.string().uuid().nullable(),
    thumbnail: z.string().uuid().nullable(),
    ocr: DocumentOcrSchema.nullable(),
    ocrStatus: z.enum(["PENDING", "COMPLETE", "OCR_FAILED", "DISABLED"]),
    warnings: z.array(z.string().max(160)).max(10),
    memoryIds: z.array(z.string().uuid()).max(3),
  })
  .strict();
export const DocumentUnderstandingSchema = z
  .object({
    version: z.literal("extractive-1"),
    dates: z.array(z.string().max(40)).max(12),
    entities: z.array(z.string().max(80)).max(12),
    actionItems: z.array(z.string().max(240)).max(12),
    memoryCandidate: z.boolean(),
    ownerReviewRequired: z.literal(true),
  })
  .strict();
export const DocumentRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    sourceType: z.enum(["CAMERA", "IMPORT"]),
    title: z.string().max(160),
    documentType: z.enum(["UNKNOWN", "STUDY", "NOTE", "RECEIPT", "SENSITIVE"]),
    collection: z.enum(["Scans", "Study", "Projects", "Receipts", "Notes", "Other"]),
    tags: z.array(z.string().max(60)).max(12),
    summary: z.string().max(1200),
    understanding: DocumentUnderstandingSchema.nullable().default(null),
    stage: DocumentStageSchema,
    pdf: z.string().uuid().nullable().optional(),
    pdfError: z.string().max(80).nullable().optional(),
    pages: z.array(DocumentPageSchema).min(1).max(5),
    memoryStatus: z.enum([
      "OFF",
      "SUGGESTED",
      "INDEXED",
      "EXCLUDED",
      "BLOCKED",
      "FAILED",
    ]),
    semanticRefs: z.array(z.string().uuid()).max(5).default([]),
    neverMemory: z.boolean(),
    sensitive: z.boolean(),
    version: z.number().int().positive(),
    attempt: z.number().int().nonnegative(),
    leaseUntil: z.iso.datetime().nullable(),
    errorCode: z.string().max(80).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const DocumentGrantSchema = z
  .object({
    documentId: z.string().uuid(),
    page: z.number().int().min(1).max(5),
    token: z.string(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type DocumentRecord = z.infer<typeof DocumentRecordSchema>;
export type DocumentSettings = z.infer<typeof DocumentSettingsSchema>;
export type DocumentScope = { ownerId: string; companyId: string };
