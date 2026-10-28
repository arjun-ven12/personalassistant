import { z } from "zod";
export const Id = z.uuid();
export const Email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const Code = z.string().regex(/^[a-f0-9]{64}$/);
export const Sector = z.enum([
  "institutional",
  "engineering",
  "brand",
  "quantum",
  "intelligence",
  "clients",
  "founder",
]);
export const LoginStart = z.object({ email: Email }).strict();
export const LoginFinish = z
  .object({
    email: Email,
    code: Code,
    deviceLabel: z.string().trim().min(1).max(64),
  })
  .strict();
export const Invite = z
  .object({ email: Email, delivery: z.enum(["email", "manual"]).default("email") })
  .strict();
export const Grant = z
  .object({ userId: Id, documentId: Id, expiresAt: z.iso.datetime() })
  .strict();
export const PageRequest = z
  .object({ documentId: Id, page: z.number().int().min(1).max(100) })
  .strict();
export const Redeem = z.object({ ticket: Code }).strict();
export const Watermark = z
  .object({
    opacity: z.number().min(0.12).max(0.35),
    placement: z.enum(["diagonal", "horizontal"]),
    fontSize: z.number().int().min(16).max(28),
  })
  .strict();
export const UploadMeta = z
  .object({
    title: z.string().trim().min(1).max(120),
    sector: Sector,
    replaceId: Id.optional(),
    expectedSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export const SessionView = z.object({
  id: Id,
  email: Email,
  role: z.enum(["ADMIN", "READER"]),
  expiresAt: z.string(),
});
export const DocumentView = z.object({
  id: Id,
  title: z.string(),
  sector: Sector,
  classification: z.string(),
  pageCount: z.number().int(),
  version: z.number().int(),
});
export const Library = z.array(DocumentView);
export const IpcRequest = z.discriminatedUnion("op", [
  z.object({ op: z.literal("loginStart"), email: Email }).strict(),
  z
    .object({
      op: z.literal("loginFinish"),
      email: Email,
      code: Code,
      deviceLabel: z.string().min(1).max(64),
    })
    .strict(),
  z.object({ op: z.literal("library") }).strict(),
  z.object({ op: z.literal("status") }).strict(),
  z.object({ op: z.literal("sessions") }).strict(),
  z
    .object({
      op: z.literal("page"),
      documentId: Id,
      page: z.number().int().min(1).max(100),
    })
    .strict(),
  z.object({ op: z.literal("revokeSession"), id: Id }).strict(),
  z.object({ op: z.literal("logout") }).strict(),
]);
export type ReaderRequest = z.infer<typeof IpcRequest>;
export interface ReaderBridge {
  request(input: ReaderRequest): Promise<unknown>;
}
export const IPC_CHANNEL = "athena-reader:request";
export const PAGE_DISPLAY_LEASE_MS = 40_000;
