import path from "node:path";
import { z } from "zod";

export const MacAgentConnectionStateSchema = z.enum([
  "ONLINE",
  "CONNECTING",
  "RECONNECTING",
  "OFFLINE",
  "AUTH_REQUIRED",
  "DEVICE_REVOKED",
  "ERROR",
]);
export type MacAgentConnectionState = z.infer<
  typeof MacAgentConnectionStateSchema
>;

const authFailureCodes = new Set([
  "INVALID_SIGNATURE",
  "SIGNED_REQUEST_EXPIRED",
  "AUTHENTICATION_REQUIRED",
]);

export const connectionStateFor = (input: {
  polling: boolean;
  lastFailureCode: string | null;
  lastSuccessfulConnectionAt: string | null;
  suspended: boolean;
}): MacAgentConnectionState => {
  if (input.suspended) return "OFFLINE";
  if (input.lastFailureCode === "TRUSTED_DEVICE_REQUIRED") return "DEVICE_REVOKED";
  if (input.lastFailureCode && authFailureCodes.has(input.lastFailureCode))
    return "AUTH_REQUIRED";
  if (input.lastFailureCode)
    return input.lastSuccessfulConnectionAt ? "RECONNECTING" : "OFFLINE";
  if (input.lastSuccessfulConnectionAt) return "ONLINE";
  return input.polling ? "CONNECTING" : "OFFLINE";
};

export const reconnectDelayMs = (
  consecutiveFailures: number,
  baseIntervalMs: number,
  maximumMs = 60_000,
) => {
  const boundedFailures = Math.max(0, Math.min(consecutiveFailures, 8));
  return Math.min(maximumMs, baseIntervalMs * 2 ** boundedFailures);
};

export const resolveAgentResource = (input: {
  isPackaged: boolean;
  resourcesPath: string;
  moduleDirectory: string;
  relativePath: string;
}) =>
  input.isPackaged
    ? path.join(input.resourcesPath, input.relativePath)
    : path.join(input.moduleDirectory, "..", input.relativePath);

export const maskDeviceId = (deviceId: string | null | undefined) => {
  if (!deviceId) return "Not configured";
  if (deviceId.length <= 12) return "••••";
  return `${deviceId.slice(0, 8)}…${deviceId.slice(-4)}`;
};

