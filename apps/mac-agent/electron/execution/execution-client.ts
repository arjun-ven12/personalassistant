import {
  AgentPollResponseSchema,
  ReadOnlyExecutionResultSchema,
  NativeProviderHostStatusSchema,
  ServerExecutionEnvelopeSchema,
  canonicalizeExecutionPayload,
  canonicalizeSignedCommand,
  type ReadOnlyExecutionRequest,
  type SignedCommandEnvelope,
  type JsonValue,
  type NativeProviderHostStatus,
  type NativeProviderExecutionTransportResult,
} from "@alexa-control/shared";
import { createHash, webcrypto } from "node:crypto";

import type { LocalDeviceIdentity } from "../services.js";
import { apiErrorDetails } from "../services.js";
import { dispatchReadOnlyCapability, type DispatcherLimits } from "./dispatcher.js";
import { CapabilityError } from "./errors.js";
import { reconnectDelayMs } from "../product-runtime.js";

export interface ExecutionClientStatus {
  polling: boolean;
  suspended: boolean;
  lastPollAt: string | null;
  lastSuccessfulConnectionAt: string | null;
  currentExecutionRequestId: string | null;
  lastFailureCode: string | null;
  lastHeartbeatAt: string | null;
}

export class ReadOnlyExecutionClient {
  readonly status: ExecutionClientStatus = {
    polling: false,
    suspended: false,
    lastPollAt: null,
    lastSuccessfulConnectionAt: null,
    currentExecutionRequestId: null,
    lastFailureCode: null,
    lastHeartbeatAt: null,
  };
  #timer: ReturnType<typeof setTimeout> | undefined;
  #stopped = true;
  #consecutiveFailures = 0;
  #lastCancellationCursor: string | undefined;

  constructor(
    readonly apiBaseUrl: string,
    readonly deviceId: string,
    readonly identity: LocalDeviceIdentity,
    readonly serverPublicKeyX: string,
    readonly intervalMs: number,
    readonly limits: DispatcherLimits,
    readonly nativeProviderHost:
      | {
          status: () => NativeProviderHostStatus;
          execute: (input: unknown) => Promise<NativeProviderExecutionTransportResult>;
        }
      | undefined = undefined,
    readonly fetchImplementation: typeof fetch = fetch,
    readonly onStatusChanged: (status: Readonly<ExecutionClientStatus>) => void =
      () => undefined,
  ) {}

  start() {
    if (!this.#stopped) return;
    this.#stopped = false;
    this.status.suspended = false;
    this.status.polling = true;
    this.notifyStatusChanged();
    void this.pollLoop();
  }

  stop() {
    this.#stopped = true;
    this.status.polling = false;
    if (this.#timer) clearTimeout(this.#timer);
    this.notifyStatusChanged();
  }

  suspend() {
    this.status.suspended = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.notifyStatusChanged();
  }

  resume() {
    if (this.#stopped) return;
    this.status.suspended = false;
    this.#consecutiveFailures = 0;
    if (this.#timer) clearTimeout(this.#timer);
    this.notifyStatusChanged();
    void this.pollLoop();
  }

  reconnectNow() {
    this.resume();
  }

  private async signCommand(
    payload: Record<string, JsonValue>,
  ): Promise<SignedCommandEnvelope> {
    const issuedAt = new Date();
    const unsigned = {
      commandId: crypto.randomUUID(),
      deviceId: this.deviceId,
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + 60_000).toISOString(),
      nonce: crypto.randomUUID(),
      payload,
      signatureAlgorithm: "Ed25519" as const,
      protocolVersion: "1" as const,
    };
    const signature = await webcrypto.subtle.sign(
      "Ed25519",
      this.identity.privateKey,
      new TextEncoder().encode(canonicalizeSignedCommand(unsigned)),
    );
    return { ...unsigned, signature: Buffer.from(signature).toString("base64url") };
  }

  private async post(payload: Record<string, JsonValue>) {
    const response = await this.fetchImplementation(
      `${this.apiBaseUrl}/api/agent/execution`,
      {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(await this.signCommand(payload)),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      const details = await apiErrorDetails(response, "Agent API request failed.");
      throw new CapabilityError(details.code, details.message);
    }
    return response.json() as Promise<unknown>;
  }

  private async verifyServerRequest(envelopeInput: unknown) {
    const envelope = ServerExecutionEnvelopeSchema.parse(envelopeInput);
    if (
      envelope.request.deviceId !== this.deviceId ||
      new Date(envelope.expiresAt) <= new Date()
    )
      throw new CapabilityError(
        "AGENT_SERVER_SIGNATURE_FAILED",
        "Server request binding is invalid.",
      );
    const { signature } = envelope;
    const unsigned = {
      request: envelope.request,
      issuedAt: envelope.issuedAt,
      expiresAt: envelope.expiresAt,
      nonce: envelope.nonce,
      securityStateVersion: envelope.securityStateVersion,
    };
    const key = await webcrypto.subtle.importKey(
      "jwk",
      { kty: "OKP", crv: "Ed25519", x: this.serverPublicKeyX, ext: true },
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const valid = await webcrypto.subtle.verify(
      "Ed25519",
      key,
      Buffer.from(signature, "base64url"),
      new TextEncoder().encode(canonicalizeExecutionPayload(unsigned)),
    );
    if (!valid)
      throw new CapabilityError(
        "AGENT_SERVER_SIGNATURE_FAILED",
        "Server signature is invalid.",
      );
    return envelope.request;
  }

  private async execute(request: ReadOnlyExecutionRequest) {
    this.status.currentExecutionRequestId = request.id;
    await this.post({ operation: "claim", requestId: request.id });
    await this.post({ operation: "start", requestId: request.id });
    const startedAt = new Date();
    const abortController = new AbortController();
    const heartbeat = setInterval(
      () => {
        void this.post({ operation: "heartbeat", requestId: request.id })
          .then(() => {
            this.status.lastHeartbeatAt = new Date().toISOString();
          })
          .catch(() => {
            abortController.abort();
          });
      },
      Math.max(1_000, Math.min(this.intervalMs, 5_000)),
    );
    let status: "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED" = "SUCCEEDED";
    let result;
    let failureCode: string | undefined;
    let safeMessage: string | undefined;
    try {
      result =
        request.toolName === "native.provider_capability"
          ? await this.dispatchNativeProviderCapability(request)
          : await dispatchReadOnlyCapability(
              request,
              this.limits,
              abortController.signal,
            );
    } catch (error) {
      status =
        error instanceof CapabilityError && error.code === "CAPABILITY_TIMEOUT"
          ? "TIMED_OUT"
          : error instanceof CapabilityError && error.code === "CAPABILITY_CANCELLED"
            ? "CANCELLED"
            : "FAILED";
      failureCode =
        error instanceof CapabilityError ? error.code : "CAPABILITY_RESULT_INVALID";
      safeMessage =
        error instanceof Error ? error.message.slice(0, 500) : "Capability failed.";
    } finally {
      clearInterval(heartbeat);
    }
    const completedAt = new Date();
    const resultDigest = createHash("sha256")
      .update(canonicalizeExecutionPayload(result ?? null))
      .digest("hex");
    const nonce = crypto.randomUUID();
    const unsignedResult = {
      commandId: crypto.randomUUID(),
      executionRequestId: request.id,
      deviceId: this.deviceId,
      toolName: request.toolName,
      status,
      ...(result ? { result } : {}),
      ...(failureCode ? { failureCode } : {}),
      ...(safeMessage ? { safeMessage } : {}),
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      truncated: Boolean(result && "truncated" in result && result.truncated),
      resultDigest,
      nonce,
    };
    const resultCommandUnsigned = {
      commandId: unsignedResult.commandId,
      deviceId: this.deviceId,
      issuedAt: unsignedResult.startedAt,
      expiresAt: new Date(completedAt.getTime() + 120_000).toISOString(),
      nonce,
      payload: JSON.parse(JSON.stringify(unsignedResult)) as Record<string, JsonValue>,
      signatureAlgorithm: "Ed25519" as const,
      protocolVersion: "1" as const,
    };
    const resultSignature = await webcrypto.subtle.sign(
      "Ed25519",
      this.identity.privateKey,
      new TextEncoder().encode(canonicalizeSignedCommand(resultCommandUnsigned)),
    );
    const signedResult = ReadOnlyExecutionResultSchema.parse({
      ...unsignedResult,
      deviceSignature: Buffer.from(resultSignature).toString("base64url"),
    });
    await this.post(
      JSON.parse(
        JSON.stringify({
          operation: "result",
          requestId: request.id,
          result: signedResult,
        }),
      ) as Record<string, JsonValue>,
    );
    this.status.currentExecutionRequestId = null;
  }

  private async pollLoop() {
    if (this.#stopped || this.status.suspended) return;
    try {
      this.status.lastPollAt = new Date().toISOString();
      const response = AgentPollResponseSchema.parse(
        await this.post({
          operation: "poll",
          ...(this.nativeProviderHost
            ? {
                nativeProviderHostStatus: NativeProviderHostStatusSchema.parse(
                  this.nativeProviderHost.status(),
                ),
              }
            : {}),
          ...(this.#lastCancellationCursor
            ? { lastCancellationCursor: this.#lastCancellationCursor }
            : {}),
        }),
      );
      this.#consecutiveFailures = 0;
      this.status.lastSuccessfulConnectionAt = new Date().toISOString();
      this.status.lastFailureCode = null;
      if (response.cancellations.length > 0) {
        this.#lastCancellationCursor = response.cancellations[0]!.cancelledAt;
        if (
          this.status.currentExecutionRequestId &&
          response.cancellations.some(
            (item) => item.executionRequestId === this.status.currentExecutionRequestId,
          )
        ) {
          this.status.lastFailureCode = "CAPABILITY_CANCELLED";
        }
      }
      if (response.emergencyStopActive) {
        this.status.lastFailureCode = "EMERGENCY_STOP_ACTIVE";
      } else if (response.envelope) {
        await this.execute(await this.verifyServerRequest(response.envelope));
        this.status.lastFailureCode = null;
      }
    } catch (error) {
      this.#consecutiveFailures += 1;
      this.status.lastFailureCode =
        error instanceof CapabilityError ? error.code : "AGENT_EXECUTION_POLL_FAILED";
      this.status.currentExecutionRequestId = null;
    } finally {
      this.notifyStatusChanged();
      if (!this.#stopped && !this.status.suspended) {
        const delay = this.status.lastFailureCode
          ? reconnectDelayMs(this.#consecutiveFailures - 1, this.intervalMs)
          : this.intervalMs;
        this.#timer = setTimeout(() => void this.pollLoop(), delay);
      }
    }
  }

  private notifyStatusChanged() {
    this.onStatusChanged({ ...this.status });
  }

  private async dispatchNativeProviderCapability(request: ReadOnlyExecutionRequest) {
    if (!this.nativeProviderHost) {
      throw new CapabilityError(
        "NATIVE_PROVIDER_HOST_UNAVAILABLE",
        "Native provider host is unavailable.",
      );
    }
    const result = await this.nativeProviderHost.execute(request.arguments);
    if (!result.verified) {
      throw new CapabilityError(
        result.errorCode ?? "NATIVE_PROVIDER_VERIFICATION_FAILED",
        result.resultSummary,
      );
    }
    return result;
  }
}
