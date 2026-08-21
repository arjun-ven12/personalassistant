import {
  ApplicationDiscoveryResponseSchema,
  canonicalizeSignedCommand,
  Ed25519PublicKeySchema,
  ApplicationDiscoveryIngestRequestSchema,
  PairingRequestResponseSchema,
  PairingStatusResponseSchema,
  type JsonValue,
  type SignedCommandEnvelope,
  type Ed25519PublicKey,
  type ApplicationDiscoveryIngestRequest,
  type ApplicationDiscoveryResponse,
  DeviceVoiceRuntimePayloadSchema,
  VoiceDashboardResponseSchema,
  VoiceTranscriptResponseSchema,
  VoiceTurnCancellationResponseSchema,
  VoiceCaptureLeaseResponseSchema,
  ActiveContextObservationSchema,
  ActiveContextResponseSchema,
  type ActiveContextObservation,
  type ActiveContextResponse,
} from "@alexa-control/shared";
import { createHash, webcrypto } from "node:crypto";
import { HealthResponseSchema } from "@alexa-control/shared";

import {
  AgentConnectionResultSchema,
  AgentPairingStatusSchema,
  type AgentConnectionResult,
  type AgentPairingStatus,
} from "./contracts.js";

export type FixedEndpointFetch = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>;

export interface LocalDeviceIdentity {
  privateKey: CryptoKey;
  publicKey: Ed25519PublicKey;
  fingerprint: string;
}

export interface PendingPairing {
  identity: LocalDeviceIdentity;
  deviceId: string;
  pairingRequestToken: string;
  trustStatus: "PENDING" | "TRUSTED" | "REVOKED" | "EXPIRED";
  serverExecutionPublicKey?: string;
  serverExecutionKeyFingerprint?: string;
}

export const apiErrorDetails = async (
  response: Response,
  fallback: string,
): Promise<{ code: string; message: string }> => {
  const body = await response.text().catch(() => "");
  if (!body) {
    return {
      code: `HTTP_${response.status}`,
      message: `${fallback} HTTP ${response.status}.`,
    };
  }
  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: unknown; message?: unknown };
      code?: unknown;
      message?: unknown;
    };
    const code =
      typeof parsed.error?.code === "string"
        ? parsed.error.code
        : typeof parsed.code === "string"
          ? parsed.code
          : `HTTP_${response.status}`;
    const message =
      typeof parsed.error?.message === "string"
        ? parsed.error.message
        : typeof parsed.message === "string"
          ? parsed.message
          : fallback;
    return { code, message: `${message} (${response.status})` };
  } catch {
    return {
      code: `HTTP_${response.status}`,
      message: `${fallback} HTTP ${response.status}.`,
    };
  }
};

export const apiErrorMessage = async (response: Response, fallback: string) => {
  const details = await apiErrorDetails(response, fallback);
  return `${details.code}: ${details.message}`;
};

export const signDeviceCommand = async (
  deviceId: string,
  identity: LocalDeviceIdentity,
  payload: Record<string, JsonValue>,
  ttlMs = 60_000,
): Promise<SignedCommandEnvelope> => {
  const issuedAt = new Date();
  const unsigned = {
    commandId: crypto.randomUUID(),
    deviceId,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + ttlMs).toISOString(),
    nonce: crypto.randomUUID(),
    payload,
    signatureAlgorithm: "Ed25519" as const,
    protocolVersion: "1" as const,
  };
  const signature = await webcrypto.subtle.sign(
    "Ed25519",
    identity.privateKey,
    new TextEncoder().encode(canonicalizeSignedCommand(unsigned)),
  );
  return { ...unsigned, signature: Buffer.from(signature).toString("base64url") };
};

const postJson = async (
  url: string,
  body: unknown,
  fetchImplementation: FixedEndpointFetch,
  timeoutMs = 5_000,
) =>
  fetchImplementation(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

export const generateLocalDeviceIdentity = async (): Promise<LocalDeviceIdentity> => {
  const pair = (await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as unknown as CryptoKeyPair;
  const exported = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const publicKey = Ed25519PublicKeySchema.parse({
    kty: exported.kty,
    crv: exported.crv,
    x: exported.x,
    ext: true,
    key_ops: ["verify"],
  });
  const fingerprint = `SHA256:${createHash("sha256")
    .update(
      JSON.stringify({
        crv: publicKey.crv,
        kty: publicKey.kty,
        x: publicKey.x,
      }),
    )
    .digest("base64url")}`;
  return { privateKey: pair.privateKey, publicKey, fingerprint };
};

export const beginFixedPairing = async (
  apiBaseUrl: string,
  pairingCode: string,
  deviceName: string,
  fetchImplementation: FixedEndpointFetch = fetch,
): Promise<PendingPairing> => {
  const identity = await generateLocalDeviceIdentity();
  const response = await postJson(
    `${apiBaseUrl}/api/devices/pairing-requests`,
    {
      pairingCode,
      deviceName,
      deviceType: "MAC_AGENT",
      publicKey: identity.publicKey,
    },
    fetchImplementation,
  );
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "Pairing request failed."));
  }
  const result = PairingRequestResponseSchema.parse(await response.json());
  return {
    identity,
    deviceId: result.deviceId,
    pairingRequestToken: result.pairingRequestToken,
    trustStatus: result.trustStatus,
    ...(result.serverExecutionPublicKey
      ? { serverExecutionPublicKey: result.serverExecutionPublicKey }
      : {}),
    ...(result.serverExecutionKeyFingerprint
      ? { serverExecutionKeyFingerprint: result.serverExecutionKeyFingerprint }
      : {}),
  };
};

export const checkFixedPairingStatus = async (
  apiBaseUrl: string,
  pairing: PendingPairing,
  fetchImplementation: FixedEndpointFetch = fetch,
): Promise<AgentPairingStatus> => {
  const response = await postJson(
    `${apiBaseUrl}/api/devices/pairing-status`,
    {
      deviceId: pairing.deviceId,
      pairingRequestToken: pairing.pairingRequestToken,
    },
    fetchImplementation,
  );
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "Pairing status failed."));
  }
  const result = PairingStatusResponseSchema.parse(await response.json());
  if (result.trustStatus === "UNREGISTERED") {
    throw new Error("Server returned an invalid pairing trust state.");
  }
  pairing.trustStatus = result.trustStatus;
  if (result.serverExecutionPublicKey)
    pairing.serverExecutionPublicKey = result.serverExecutionPublicKey;
  if (result.serverExecutionKeyFingerprint)
    pairing.serverExecutionKeyFingerprint = result.serverExecutionKeyFingerprint;
  return AgentPairingStatusSchema.parse({
    configured: true,
    deviceId: pairing.deviceId,
    trustStatus: result.trustStatus,
    fingerprint: result.fingerprint,
    ...(result.serverExecutionKeyFingerprint
      ? { serverExecutionKeyFingerprint: result.serverExecutionKeyFingerprint }
      : {}),
    message:
      result.trustStatus === "TRUSTED"
        ? "Device is trusted. Signed execution transport can start."
        : `Device trust status is ${result.trustStatus}.`,
  });
};

export const testFixedApiConnection = async (
  apiBaseUrl: string,
  fetchImplementation: FixedEndpointFetch = fetch,
): Promise<AgentConnectionResult> => {
  try {
    const response = await fetchImplementation(`${apiBaseUrl}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return AgentConnectionResultSchema.parse({
        ok: false,
        status: "offline",
        checkedAt: new Date().toISOString(),
        message: `API returned HTTP ${response.status}.`,
        https: apiBaseUrl.startsWith("https://"),
      });
    }

    const parsed = HealthResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return AgentConnectionResultSchema.parse({
        ok: false,
        status: "invalid_response",
        checkedAt: new Date().toISOString(),
        message: "API response did not match the trusted health schema.",
        https: apiBaseUrl.startsWith("https://"),
      });
    }

    return AgentConnectionResultSchema.parse({
      ok: true,
      status: "online",
      checkedAt: new Date().toISOString(),
      message: `${parsed.data.service} v${parsed.data.version} is online.`,
      https: apiBaseUrl.startsWith("https://"),
    });
  } catch {
    return AgentConnectionResultSchema.parse({
      ok: false,
      status: "offline",
      checkedAt: new Date().toISOString(),
      message: "API connection failed.",
      https: apiBaseUrl.startsWith("https://"),
    });
  }
};

export const submitDeviceVoiceRuntime = async (
  apiBaseUrl: string,
  deviceId: string,
  identity: LocalDeviceIdentity,
  payload: unknown,
  fetchImplementation: FixedEndpointFetch = fetch,
) => {
  const parsed = DeviceVoiceRuntimePayloadSchema.parse(payload);
  const response = await postJson(
    `${apiBaseUrl}/api/voice/device-runtime`,
    await signDeviceCommand(
      deviceId,
      identity,
      JSON.parse(JSON.stringify(parsed)) as Record<string, JsonValue>,
    ),
    fetchImplementation,
    parsed.operation === "submit_transcript" ? 60_000 : 5_000,
  );
  if (!response.ok)
    throw new Error(await apiErrorMessage(response, "Voice runtime request failed."));
  const body: unknown = await response.json();
  if (parsed.operation === "start_session")
    return VoiceDashboardResponseSchema.parse(body);
  if (parsed.operation === "submit_transcript")
    return VoiceTranscriptResponseSchema.parse(body);
  if (parsed.operation === "capture_lease")
    return VoiceCaptureLeaseResponseSchema.parse(body);
  return VoiceTurnCancellationResponseSchema.parse(body);
};

export const submitApplicationDiscovery = async (
  apiBaseUrl: string,
  deviceId: string,
  identity: LocalDeviceIdentity,
  input: ApplicationDiscoveryIngestRequest,
  fetchImplementation: FixedEndpointFetch = fetch,
): Promise<ApplicationDiscoveryResponse> => {
  const payload = ApplicationDiscoveryIngestRequestSchema.parse(input);
  const response = await postJson(
    `${apiBaseUrl}/api/applications/discovery-ingest`,
    await signDeviceCommand(
      deviceId,
      identity,
      JSON.parse(JSON.stringify(payload)) as Record<string, JsonValue>,
    ),
    fetchImplementation,
  );
  if (!response.ok) {
    throw new Error(
      await apiErrorMessage(response, "Application discovery ingest failed."),
    );
  }
  return ApplicationDiscoveryResponseSchema.parse(await response.json());
};

export const submitDeviceActiveContext = async (
  apiBaseUrl: string,
  deviceId: string,
  identity: LocalDeviceIdentity,
  input: ActiveContextObservation,
  fetchImplementation: FixedEndpointFetch = fetch,
): Promise<ActiveContextResponse> => {
  const observation = ActiveContextObservationSchema.parse(input);
  const response = await postJson(
    `${apiBaseUrl}/api/active-context/device`,
    await signDeviceCommand(
      deviceId,
      identity,
      JSON.parse(JSON.stringify(observation)) as Record<string, JsonValue>,
    ),
    fetchImplementation,
  );
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "Active context update failed."));
  }
  return ActiveContextResponseSchema.parse(await response.json());
};
