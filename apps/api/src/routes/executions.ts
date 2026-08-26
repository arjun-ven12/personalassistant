import {
  AgentPollResponseSchema,
  CreateExecutionRequestSchema,
  ExecutionCancelResponseSchema,
  ExecutionCleanupResponseSchema,
  ExecutionDetailResponseSchema,
  ExecutionExportResponseSchema,
  ExecutionListResponseSchema,
  ExecutionRequestViewSchema,
  ReadOnlyExecutionResultSchema,
  SignedCommandEnvelopeSchema,
  NativeProviderHostStatusSchema,
  NativeCapabilityDispatchRequestSchema,
} from "@alexa-control/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { verifyEnvelopeSignature } from "../identity/crypto.js";
import { ExecutionError } from "../execution/errors.js";
import type { ApiRouteContext } from "./context.js";

const ExecutionParametersSchema = z
  .object({ executionRequestId: z.string().uuid() })
  .strict();
const AgentOperationSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("poll"),
      lastCancellationCursor: z.iso.datetime().optional(),
      nativeProviderHostStatus: NativeProviderHostStatusSchema.optional(),
    })
    .strict(),
  z.object({ operation: z.literal("claim"), requestId: z.string().uuid() }).strict(),
  z.object({ operation: z.literal("start"), requestId: z.string().uuid() }).strict(),
  z
    .object({ operation: z.literal("heartbeat"), requestId: z.string().uuid() })
    .strict(),
  z
    .object({
      operation: z.literal("result"),
      requestId: z.string().uuid(),
      result: ReadOnlyExecutionResultSchema,
    })
    .strict(),
]);

const authenticateAgent = async (request: FastifyRequest, context: ApiRouteContext) => {
  const envelope = SignedCommandEnvelopeSchema.parse(request.body);
  const device = await context.identity.store.findDeviceById(envelope.deviceId);
  if (!device || device.trustStatus !== "TRUSTED" || device.deviceType !== "MAC_AGENT")
    throw new ExecutionError(
      403,
      "TRUSTED_DEVICE_REQUIRED",
      "A trusted device is required.",
    );
  const network = await context.networkVerifier.verify({
    remoteAddress: request.socket.remoteAddress ?? request.ip,
    ...(typeof request.headers["tailscale-user-login"] === "string"
      ? { tailscaleUserLogin: request.headers["tailscale-user-login"] }
      : {}),
    ...(typeof request.headers["tailscale-user-name"] === "string"
      ? { tailscaleUserName: request.headers["tailscale-user-name"] }
      : {}),
  });
  if (context.privateNetworkRequired && network.state !== "PRIVATE_NETWORK")
    throw new ExecutionError(
      403,
      "PRIVATE_NETWORK_REQUIRED",
      "Private-network verification is required.",
    );
  if (!(await verifyEnvelopeSignature(device.publicKey, envelope)))
    throw new ExecutionError(
      401,
      "INVALID_SIGNATURE",
      "The device signature is invalid.",
    );
  const now = new Date();
  const issuedAt = new Date(envelope.issuedAt);
  const expiresAt = new Date(envelope.expiresAt);
  const toleranceMs = context.signedRequestToleranceSeconds * 1_000;
  if (
    expiresAt <= now ||
    Math.abs(now.getTime() - issuedAt.getTime()) > toleranceMs ||
    expiresAt.getTime() - issuedAt.getTime() > toleranceMs
  )
    throw new ExecutionError(
      401,
      "SIGNED_REQUEST_EXPIRED",
      "The signed request expired.",
    );
  if (
    !(await context.identity.store.consumeNonce(
      device.id,
      envelope.nonce,
      new Date(envelope.expiresAt),
      now,
    ))
  )
    throw new ExecutionError(
      409,
      "DUPLICATE_NONCE",
      "The signed request was replayed.",
    );
  const touched = { ...device, lastSeen: now.toISOString() };
  await context.identity.store.updateDevice(touched);
  return { device: touched, operation: AgentOperationSchema.parse(envelope.payload) };
};

const nativeProviderRequestFor = (target: { toolName: string; arguments: unknown }) =>
  target.toolName === "native.provider_capability"
    ? NativeCapabilityDispatchRequestSchema.parse(target.arguments)
    : null;

export const registerExecutionRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.post(
    "/api/executions",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
        context.security.verifyTransportNetwork,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ExecutionRequestViewSchema.parse(
        await context.executions.create({
          ownerId: identity.user.id,
          sessionId: identity.session.id,
          request: CreateExecutionRequestSchema.parse(request.body),
          networkState: context.security.getNetworkState(request),
          ipAddress: request.ip,
          requestId: request.id,
        }),
      );
    },
  );

  app.get(
    "/api/executions",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ExecutionListResponseSchema.parse(
        await context.executionStore.list(identity.user.id, 100),
      );
    },
  );

  app.get(
    "/api/executions/:executionRequestId",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { executionRequestId } = ExecutionParametersSchema.parse(request.params);
      const execution = await context.executionStore.find(executionRequestId);
      if (!execution || execution.ownerId !== identity.user.id)
        throw new ExecutionError(
          404,
          "EXECUTION_REQUEST_NOT_FOUND",
          "Execution request was not found.",
        );
      const provenance = await context.executions.provenance(execution.id);
      return ExecutionDetailResponseSchema.parse({
        request: execution,
        result: (await context.executionStore.getResult(execution.id)) ?? null,
        provenance,
        readOnlyCapabilityExecution: context.readOnlyExecutionEnabled
          ? "available"
          : "unavailable",
        privilegedExecutionAvailable: false,
        writeExecutionAvailable: false,
      });
    },
  );

  app.get(
    "/api/executions/:executionRequestId/export",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { executionRequestId } = ExecutionParametersSchema.parse(request.params);
      const execution = await context.executionStore.find(executionRequestId);
      if (!execution || execution.ownerId !== identity.user.id)
        throw new ExecutionError(
          404,
          "EXECUTION_REQUEST_NOT_FOUND",
          "Execution request was not found.",
        );
      const provenance = await context.executions.provenance(execution.id);
      if (!provenance)
        throw new ExecutionError(
          404,
          "EXECUTION_REQUEST_NOT_FOUND",
          "Execution request was not found.",
        );
      await context.governanceAudit({
        eventType: "EXECUTION_RESULT_EXPORTED",
        ownerId: identity.user.id,
        deviceId: execution.deviceId,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "Owner exported bounded read-only execution provenance.",
        requestId: request.id,
        metadata: { executionRequestId: execution.id, toolName: execution.toolName },
      });
      return ExecutionExportResponseSchema.parse({
        request: execution,
        result: (await context.executionStore.getResult(execution.id)) ?? null,
        provenance,
        exportedAt: new Date().toISOString(),
        privilegedExecutionAvailable: false,
        writeExecutionAvailable: false,
      });
    },
  );

  app.post(
    "/api/executions/cleanup",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const cleaned = await context.executions.cleanupExpired();
      await context.governanceAudit({
        eventType: "EXECUTION_RETENTION_CLEANED",
        ownerId: identity.user.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "Expired read-only requests and results were cleaned.",
        requestId: request.id,
        metadata: cleaned,
      });
      return ExecutionCleanupResponseSchema.parse(cleaned);
    },
  );

  app.post(
    "/api/executions/:executionRequestId/cancel",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { executionRequestId } = ExecutionParametersSchema.parse(request.params);
      const execution = await context.executionStore.cancel(
        executionRequestId,
        identity.user.id,
        new Date().toISOString(),
      );
      if (!execution)
        throw new ExecutionError(
          409,
          "EXECUTION_REQUEST_ALREADY_COMPLETED",
          "The request cannot be cancelled.",
        );
      await context.governanceAudit({
        eventType: "EXECUTION_CANCEL_REQUESTED",
        ownerId: identity.user.id,
        deviceId: execution.deviceId,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "Owner cancelled a bounded read-only request.",
        requestId: request.id,
        metadata: { executionRequestId },
      });
      return ExecutionCancelResponseSchema.parse({ request: execution });
    },
  );

  app.post(
    "/api/agent/execution",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request) => {
      const { device, operation } = await authenticateAgent(request, context);
      const emergencyStopActive = await context.emergencyStopActive();
      if (operation.operation === "poll") {
        if (operation.nativeProviderHostStatus) {
          await context.nativeProviders.reportHostStatus({
            ownerId: device.ownerId,
            deviceId: device.id,
            status: operation.nativeProviderHostStatus,
          });
        }
        const cursor =
          operation.lastCancellationCursor ??
          new Date(Date.now() - 60_000).toISOString();
        return AgentPollResponseSchema.parse({
          envelope: emergencyStopActive
            ? null
            : await (async () => {
                const envelope = await context.executions.poll(device.id);
                const request = envelope
                  ? nativeProviderRequestFor(envelope.request)
                  : null;
                if (envelope && request) {
                  await context.nativeProviders.recordTransportStage({
                    ownerId: envelope.request.ownerId,
                    executionRequestId: envelope.request.id,
                    request,
                    stage: "transport_sent",
                    message: `Execution ${envelope.request.id} sent to trusted Mac Agent ${device.id}.`,
                    auditEventType: "EXECUTION_REQUEST_CREATED",
                  });
                }
                return envelope;
              })(),
          emergencyStopActive,
          cancellations: await context.executionStore.cancellationsForDevice(
            device.id,
            cursor,
            100,
          ),
        });
      }
      if (emergencyStopActive)
        throw new ExecutionError(
          409,
          "EMERGENCY_STOP_ACTIVE",
          "Emergency stop is active.",
        );
      if (operation.operation === "claim") {
        const claimed = await context.executionStore.transition(
          operation.requestId,
          device.id,
          ["PENDING"],
          "CLAIMED",
          new Date().toISOString(),
        );
        if (!claimed)
          throw new ExecutionError(
            409,
            "EXECUTION_REQUEST_ALREADY_CLAIMED",
            "The request cannot be claimed.",
          );
        await context.governanceAudit({
          eventType: "EXECUTION_REQUEST_CLAIMED",
          ownerId: claimed.ownerId,
          deviceId: device.id,
          ipAddress: request.ip,
          outcome: "SUCCESS",
          reason: "Trusted Mac agent atomically claimed read-only work.",
          requestId: request.id,
          metadata: { executionRequestId: claimed.id, toolName: claimed.toolName },
        });
        const nativeRequest = nativeProviderRequestFor(claimed);
        if (nativeRequest) {
          await context.nativeProviders.recordTransportStage({
            ownerId: claimed.ownerId,
            executionRequestId: claimed.id,
            request: nativeRequest,
            stage: "mac_agent_received",
            message: `Trusted Mac Agent claimed and verified signed native request ${claimed.id}.`,
            auditEventType: "EXECUTION_REQUEST_CLAIMED",
          });
        }
        return claimed;
      }
      if (operation.operation === "start") {
        const started = await context.executionStore.transition(
          operation.requestId,
          device.id,
          ["CLAIMED"],
          "RUNNING",
          new Date().toISOString(),
        );
        if (!started)
          throw new ExecutionError(
            409,
            "EXECUTION_REQUEST_ALREADY_COMPLETED",
            "The request cannot be started.",
          );
        await context.governanceAudit({
          eventType: "EXECUTION_STARTED",
          ownerId: started.ownerId,
          deviceId: device.id,
          ipAddress: request.ip,
          outcome: "SUCCESS",
          reason: "Trusted Mac agent started a fixed read-only capability.",
          requestId: request.id,
          metadata: { executionRequestId: started.id, toolName: started.toolName },
        });
        const nativeRequest = nativeProviderRequestFor(started);
        if (nativeRequest) {
          await context.nativeProviders.recordTransportStage({
            ownerId: started.ownerId,
            executionRequestId: started.id,
            request: nativeRequest,
            stage: "mac_agent_executing",
            message: `Trusted Mac Agent started provider execution for ${nativeRequest.providerId}.${nativeRequest.capability}.`,
            auditEventType: "EXECUTION_STARTED",
          });
          await context.nativeProviders.recordTransportStage({
            ownerId: started.ownerId,
            executionRequestId: started.id,
            request: nativeRequest,
            stage: "provider_verifying",
            message: `Provider ${nativeRequest.providerId} will verify ${nativeRequest.capability} before success.`,
            auditEventType: null,
          });
        }
        return started;
      }
      if (operation.operation === "heartbeat") {
        const at = new Date().toISOString();
        const accepted = await context.executionStore.heartbeat(
          operation.requestId,
          device.id,
          at,
        );
        if (!accepted)
          throw new ExecutionError(
            409,
            "EXECUTION_REQUEST_ALREADY_COMPLETED",
            "The request cannot accept a heartbeat.",
          );
        await context.governanceAudit({
          eventType: "EXECUTION_AGENT_HEARTBEAT",
          ownerId: device.ownerId,
          deviceId: device.id,
          ipAddress: request.ip,
          outcome: "SUCCESS",
          reason: "Trusted Mac agent reported active read-only work.",
          requestId: request.id,
          metadata: { executionRequestId: operation.requestId },
        });
        return { accepted: true, heartbeatAt: at };
      }
      const target = await context.executionStore.find(operation.requestId);
      if (!target || target.deviceId !== device.id)
        throw new ExecutionError(
          404,
          "EXECUTION_REQUEST_NOT_FOUND",
          "Execution request was not found.",
        );
      const completed = await context.executions.acceptResult(
        target.ownerId,
        operation.result,
      );
      const nativeRequest = nativeProviderRequestFor(target);
      if (nativeRequest) {
        await context.nativeProviders.recordTransportStage({
          ownerId: target.ownerId,
          executionRequestId: target.id,
          request: nativeRequest,
          stage: "signed_result_received",
          message: `Signed Mac Agent result received for execution ${target.id}.`,
          auditEventType:
            completed.status === "SUCCEEDED"
              ? "EXECUTION_SUCCEEDED"
              : "EXECUTION_FAILED",
          verificationResult: completed.status === "SUCCEEDED" ? "succeeded" : "failed",
          severity: completed.status === "SUCCEEDED" ? "info" : "error",
        });
      }
      const eventType =
        completed.status === "SUCCEEDED"
          ? "EXECUTION_SUCCEEDED"
          : completed.status === "TIMED_OUT"
            ? "EXECUTION_TIMED_OUT"
            : completed.status === "CANCELLED"
              ? "EXECUTION_CANCELLED"
              : "EXECUTION_FAILED";
      await context.governanceAudit({
        eventType,
        ownerId: target.ownerId,
        deviceId: device.id,
        ipAddress: request.ip,
        outcome: completed.status === "SUCCEEDED" ? "SUCCESS" : "FAILURE",
        reason: completed.failureCode ?? "Bounded read-only execution result accepted.",
        requestId: request.id,
        metadata: {
          executionRequestId: completed.id,
          toolName: completed.toolName,
          truncated: operation.result.truncated,
          durationMs: operation.result.durationMs,
        },
      });
      if (operation.result.toolName === "repository.scan_metadata") {
        if (operation.result.status === "SUCCEEDED" && operation.result.result) {
          await context.repositories.publishExecutionResult({
            ownerId: target.ownerId,
            executionRequestId: target.id,
            result: operation.result.result,
            requestId: request.id,
            ipAddress: request.ip,
          });
        } else {
          await context.repositories.failExecutionResult({
            ownerId: target.ownerId,
            executionRequestId: target.id,
            failureCode: operation.result.failureCode ?? "REPOSITORY_SCAN_FAILED",
            requestId: request.id,
            ipAddress: request.ip,
          });
        }
      }
      if (operation.result.toolName === "workspace.validate_profile") {
        await context.validations.publishExecutionResult({
          ownerId: target.ownerId,
          executionRequestId: target.id,
          result: operation.result,
          requestId: request.id,
          ipAddress: request.ip,
        });
      }
      if (nativeRequest) {
        await context.nativeProviders.recordTransportResult({
          ownerId: target.ownerId,
          executionRequestId: target.id,
          request: nativeRequest,
          result: operation.result.result,
          status: operation.result.status,
          ...(operation.result.failureCode
            ? { failureCode: operation.result.failureCode }
            : {}),
        });
      }
      return completed;
    },
  );
};
