import { z } from "zod";

export const NetworkVerificationStateSchema = z.enum([
  "UNKNOWN",
  "PRIVATE_NETWORK",
  "PUBLIC_NETWORK",
  "UNAVAILABLE",
]);

export const NetworkVerificationSourceSchema = z.enum([
  "tailscale_localapi",
  "trusted_proxy",
  "direct_socket",
  "test",
]);

export const NetworkVerificationResultSchema = z
  .object({
    state: NetworkVerificationStateSchema,
    source: NetworkVerificationSourceSchema,
    remoteAddress: z.string().min(1).max(100).optional(),
    tailscaleIp: z.string().min(1).max(100).optional(),
    nodeId: z.string().min(1).max(200).optional(),
    nodeName: z.string().min(1).max(255).optional(),
    userLogin: z.string().min(1).max(320).optional(),
    tags: z.array(z.string().min(1).max(100)).max(50).optional(),
    verifiedAt: z.iso.datetime(),
    reasonCode: z.string().trim().min(1).max(100),
  })
  .strict();

export interface NetworkVerificationInput {
  remoteAddress: string;
  tailscaleUserLogin?: string;
  tailscaleUserName?: string;
}

export interface NetworkVerifier {
  verify(input: NetworkVerificationInput): Promise<NetworkVerificationResult>;
}

export type NetworkVerificationState = z.infer<typeof NetworkVerificationStateSchema>;
export type NetworkVerificationResult = z.infer<typeof NetworkVerificationResultSchema>;
