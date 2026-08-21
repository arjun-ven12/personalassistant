import { z } from "zod";

import { CapabilitySchema } from "./capabilities.js";

export const DeviceTypeSchema = z.enum([
  "WEB_BROWSER",
  "MAC_AGENT",
  "ANDROID",
  "SERVER",
]);

export const DeviceTrustStatusSchema = z.enum([
  "UNREGISTERED",
  "PENDING",
  "TRUSTED",
  "REVOKED",
  "EXPIRED",
]);

export const Ed25519PublicKeySchema = z
  .object({
    kty: z.literal("OKP"),
    crv: z.literal("Ed25519"),
    x: z.string().min(40).max(200),
    ext: z.boolean().optional(),
    key_ops: z.array(z.literal("verify")).optional(),
  })
  .strict();

export const RegisteredDeviceSchema = z
  .object({
    id: z.string().uuid(),
    deviceName: z.string().trim().min(1).max(100),
    deviceType: DeviceTypeSchema,
    trustStatus: DeviceTrustStatusSchema,
    publicKey: Ed25519PublicKeySchema,
    fingerprint: z.string().trim().min(1),
    pairedAt: z.iso.datetime().nullable(),
    lastSeen: z.iso.datetime().nullable(),
    revokedAt: z.iso.datetime().nullable(),
    ownerId: z.string().uuid(),
    createdAt: z.iso.datetime(),
    capabilities: z.array(CapabilitySchema),
    metadata: z.record(z.string(), z.unknown()),
  })
  .strict();

export const DeviceViewSchema = RegisteredDeviceSchema.omit({
  publicKey: true,
});

export const CreatePairingIntentResponseSchema = z
  .object({
    pairingCode: z.string().regex(/^[A-Z0-9]{8}$/),
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const PairingRequestSchema = z
  .object({
    pairingCode: z.string().regex(/^[A-Z0-9]{8}$/),
    deviceName: z.string().trim().min(1).max(100),
    deviceType: DeviceTypeSchema,
    publicKey: Ed25519PublicKeySchema,
  })
  .strict();

export const PairingRequestResponseSchema = z
  .object({
    deviceId: z.string().uuid(),
    pairingRequestToken: z.string().min(32).max(128),
    trustStatus: z.literal("PENDING"),
    serverExecutionPublicKey: z.string().min(32).max(256).optional(),
    serverExecutionKeyFingerprint: z.string().min(16).max(200).optional(),
  })
  .strict();

export const PairingStatusRequestSchema = z
  .object({
    deviceId: z.string().uuid(),
    pairingRequestToken: z.string().min(32).max(128),
  })
  .strict();

export const PairingStatusResponseSchema = z
  .object({
    deviceId: z.string().uuid(),
    trustStatus: DeviceTrustStatusSchema,
    fingerprint: z.string().min(1),
    serverExecutionPublicKey: z.string().min(32).max(256).optional(),
    serverExecutionKeyFingerprint: z.string().min(16).max(200).optional(),
  })
  .strict();

export const DeviceListResponseSchema = z.array(DeviceViewSchema);

export const DeviceMutationResponseSchema = z
  .object({
    success: z.literal(true),
    device: DeviceViewSchema,
  })
  .strict();

export const SignedRequestVerificationResponseSchema = z
  .object({
    verified: z.literal(true),
    deviceId: z.string().uuid(),
    networkState: z.enum([
      "UNKNOWN",
      "PRIVATE_NETWORK",
      "PUBLIC_NETWORK",
      "UNAVAILABLE",
    ]),
    executionAllowed: z.literal(false),
  })
  .strict();

export const SignedCommandEnvelopeSchema = z
  .object({
    commandId: z.string().uuid(),
    deviceId: z.string().uuid(),
    issuedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    nonce: z.string().trim().min(16).max(128),
    payload: z.record(z.string(), z.json()),
    signature: z.string().trim().min(32).max(256),
    signatureAlgorithm: z.literal("Ed25519"),
    protocolVersion: z.literal("1"),
  })
  .strict()
  .refine(
    ({ expiresAt, issuedAt }) =>
      new Date(expiresAt).getTime() > new Date(issuedAt).getTime(),
    {
      message: "expiresAt must be after issuedAt",
      path: ["expiresAt"],
    },
  );

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  throw new TypeError("Signed payload must contain only JSON values.");
};

export const canonicalizeSignedCommand = (
  envelope: Omit<SignedCommandEnvelope, "signature">,
): string => canonicalJson(envelope);

export type DeviceType = z.infer<typeof DeviceTypeSchema>;
export type DeviceTrustStatus = z.infer<typeof DeviceTrustStatusSchema>;
export type RegisteredDevice = z.infer<typeof RegisteredDeviceSchema>;
export type DeviceView = z.infer<typeof DeviceViewSchema>;
export type Ed25519PublicKey = z.infer<typeof Ed25519PublicKeySchema>;
export type SignedCommandEnvelope = z.infer<typeof SignedCommandEnvelopeSchema>;
