import {
  ConversationCenterResponseSchema,
  SubmitConversationTurnFeedbackRequestSchema,
  ReplayConversationTurnRequestSchema,
  ReplayConversationTurnResponseSchema,
  ConversationHistoryRecordSchema,
  VoiceSessionRecordSchema,
  VoiceDashboardResponseSchema,
  VoiceTranscriptResponseSchema,
  DeviceVoiceRuntimePayloadSchema,
  SignedCommandEnvelopeSchema,
  VoiceTurnCancellationResponseSchema,
  VoiceCaptureLeaseRequestSchema,
  VoiceCaptureLeaseResponseSchema,
  RecordVoiceTranscriptRequestSchema,
} from "@alexa-control/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";
import { verifyEnvelopeSignature } from "../identity/crypto.js";
import { ExecutionError } from "../execution/errors.js";
import { companyScope } from "../companies/scope.js";
import { installCompanyRouteGuard } from "./company-guard.js";

const VoiceTranscriptHistoryResponseSchema = z
  .object({
    conversationHistory: z.array(ConversationHistoryRecordSchema).max(200),
  })
  .strict();
const VoiceSessionHistoryResponseSchema = z
  .object({
    sessions: z.array(VoiceSessionRecordSchema).max(100),
  })
  .strict();
const MAC_VOICE_DEVICE_TYPES = new Set<string>(["MAC_AGENT"]);
const TRUSTED_VOICE_DEVICE_TYPES = new Set<string>(["MAC_AGENT", "ANDROID"]);

export const authenticateTrustedDeviceEnvelope = async (
  request: FastifyRequest,
  context: ApiRouteContext,
  allowedDeviceTypes: ReadonlySet<string> = MAC_VOICE_DEVICE_TYPES,
) => {
  const envelope = SignedCommandEnvelopeSchema.parse(request.body);
  const device = await context.identity.store.findDeviceById(envelope.deviceId);
  if (
    !device ||
    device.trustStatus !== "TRUSTED" ||
    !allowedDeviceTypes.has(device.deviceType)
  )
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
  return { device: touched, envelope, network };
};

export const registerVoiceRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  installCompanyRouteGuard(app, "/api/voice", context, ["/api/voice/device-runtime"]);
  const conversationReadPreHandlers = [
    context.security.requireAuthentication,
    context.companyContext.requireCompany,
  ];
  const conversationMutationPreHandlers = [
    context.security.requireAuthentication,
    context.companyContext.requireCompany,
    context.security.requireTrustedOrigin,
    context.security.requireCsrf,
  ];
  app.post(
    "/api/voice/device-runtime",
    { config: { rateLimit: { max: 240, timeWindow: "1 minute" } } },
    async (request) => {
      const { device, envelope, network } = await authenticateTrustedDeviceEnvelope(
        request,
        context,
        TRUSTED_VOICE_DEVICE_TYPES,
      );
      const payload = DeviceVoiceRuntimePayloadSchema.parse(envelope.payload);
      const company = await context.companyContext.companies.resolveOwner(
        device.ownerId,
        payload.companyId,
        envelope.commandId,
        "OPERATE",
      );
      return companyScope.run(company, async () => {
      const clientType = device.deviceType === "ANDROID" ? "ANDROID" : "OVERLAY";
      if (payload.operation === "start_session")
        return VoiceDashboardResponseSchema.parse(
          await context.voice.createSession({
            ownerId: device.ownerId,
            body: payload.session,
            requestId: envelope.commandId,
            ipAddress: request.ip,
          }),
        );
      if (payload.operation === "submit_transcript") {
        const voiceSessionId = payload.transcript.sessionId;
        if (
          !voiceSessionId ||
          !(await context.voiceCaptureLease.isOwner({
            ownerId: device.ownerId,
            deviceId: device.id,
            voiceSessionId,
            clientType,
          }))
        )
          throw new ExecutionError(
            409,
            "VOICE_CAPTURE_NOT_OWNED",
            "Voice capture is no longer owned by this trusted device.",
          );
        return VoiceTranscriptResponseSchema.parse(
          await context.voice.recordTranscript({
            ownerId: device.ownerId,
            deviceId: device.id,
            body: {
              ...payload.transcript,
              source: device.deviceType === "ANDROID" ? "android" : "electron",
            },
            requestId: envelope.commandId,
            ipAddress: request.ip,
            governanceSessionId: device.id,
            networkState: network.state,
          }),
        );
      }
      if (payload.operation === "capture_lease")
        return VoiceCaptureLeaseResponseSchema.parse(
          await context.voiceCaptureLease.act({
            ownerId: device.ownerId,
            deviceId: device.id,
            voiceSessionId: payload.voiceSessionId,
            clientType,
            action: payload.action,
          }),
        );
      return VoiceTurnCancellationResponseSchema.parse(
        await context.voice.cancelTurn(
          device.ownerId,
          payload.turnId,
          request.ip,
          envelope.commandId,
        ),
      );
      });
    },
  );
  app.get(
    "/api/voice",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return VoiceDashboardResponseSchema.parse(
        await context.voice.dashboard(identity.user.id),
      );
    },
  );

  app.post(
    "/api/voice/capture-lease",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = VoiceCaptureLeaseRequestSchema.parse(request.body);
      return VoiceCaptureLeaseResponseSchema.parse(
        await context.voiceCaptureLease.act({
          ownerId: identity.user.id,
          deviceId: identity.session.id,
          voiceSessionId: body.voiceSessionId,
          clientType: "WEB",
          action: body.action,
        }),
      );
    },
  );

  app.post(
    "/api/voice/sessions",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return VoiceDashboardResponseSchema.parse(
        await context.voice.createSession({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/voice/sessions",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return VoiceSessionHistoryResponseSchema.parse({
        sessions: await context.voiceStore.listSessions(identity.user.id, 100),
      });
    },
  );

  app.post(
    "/api/voice/transcripts",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
        context.security.inspectNetwork,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = RecordVoiceTranscriptRequestSchema.parse(request.body);
      const voiceSessionId = body.sessionId;
      if (
        !voiceSessionId ||
        !(await context.voiceCaptureLease.isOwner({
          ownerId: identity.user.id,
          deviceId: identity.session.id,
          voiceSessionId,
          clientType: "WEB",
        }))
      )
        throw new ExecutionError(
          409,
          "VOICE_CAPTURE_NOT_OWNED",
          "Voice capture is no longer owned by this web session.",
        );
      return VoiceTranscriptResponseSchema.parse(
        await context.voice.recordTranscript({
          ownerId: identity.user.id,
          deviceId: identity.session.id,
          body,
          requestId: request.id,
          ipAddress: request.ip,
          governanceSessionId: identity.session.id,
          networkState: context.security.getNetworkState(request),
          responseOverride: body.isFinal && body.confidence >= 0.55
            ? await context.companies.handleConversation(identity, body.transcript, { requestId: request.id, ipAddress: request.ip })
            : null,
        }),
      );
    },
  );

  app.get(
    "/api/voice/transcripts",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return VoiceTranscriptHistoryResponseSchema.parse({
        conversationHistory: await context.voiceStore.listConversation(
          identity.user.id,
          200,
        ),
      });
    },
  );

  app.post(
    "/api/voice/metrics",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return VoiceDashboardResponseSchema.parse(
        await context.voice.recordMetric({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/voice/profiles",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return VoiceDashboardResponseSchema.parse(
        await context.voice.upsertProfile({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/voice/shortcuts",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return VoiceDashboardResponseSchema.parse(
        await context.voice.upsertShortcut({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/conversations",
    { preHandler: conversationReadPreHandlers },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ConversationCenterResponseSchema.parse(
        await context.voice.conversationCenter(identity.user.id),
      );
    },
  );

  app.post(
    "/api/conversations/personas",
    { preHandler: conversationMutationPreHandlers },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ConversationCenterResponseSchema.parse(
        await context.voice.upsertPersona({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/conversations/bookmarks",
    { preHandler: conversationMutationPreHandlers },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return ConversationCenterResponseSchema.parse(
        await context.voice.createBookmark({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/conversations/turns/:turnId/feedback",
    { preHandler: conversationMutationPreHandlers },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { turnId } = z
        .object({ turnId: z.string().uuid() })
        .strict()
        .parse(request.params);
      return ConversationCenterResponseSchema.parse(
        await context.voice.recordTurnFeedback({
          ownerId: identity.user.id,
          turnId,
          body: SubmitConversationTurnFeedbackRequestSchema.parse(request.body),
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/conversations/turns/:turnId/replay",
    { preHandler: conversationMutationPreHandlers },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { turnId } = z
        .object({ turnId: z.string().uuid() })
        .strict()
        .parse(request.params);
      return ReplayConversationTurnResponseSchema.parse(
        await context.voice.replayTurn({
          ownerId: identity.user.id,
          turnId,
          body: ReplayConversationTurnRequestSchema.parse(request.body),
        }),
      );
    },
  );
};
