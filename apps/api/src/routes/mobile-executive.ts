import {
  ApprovalIdParametersSchema,
  ApprovalResponseSchema,
  DevicePushRegistrationOperationSchema,
  DevicePushUnregistrationOperationSchema,
  ExecutiveAttentionResponseSchema,
  MobileApprovalDecisionOperationSchema,
  MobileObjectiveActionOperationSchema,
  MobileObjectiveCreateOperationSchema,
  MobileObjectiveModifyOperationSchema,
  MobileRecentAuthChallengeOperationSchema,
  MobileRecentAuthVerifyOperationSchema,
  MobileBiometricKeyRegistrationOperationSchema,
  MobileBiometricKeyRegistrationResponseSchema,
  Ed25519PublicKeySchema,
  mobileRecentAuthSigningPayload,
  NotificationPreferencesResponseSchema,
  PushRegistrationResponseSchema,
  RecentAuthChallengeResponseSchema,
  RecentAuthStatusSchema,
  UpdateNotificationPreferencesOperationSchema,
  ObjectiveDashboardSchema,
  ObjectiveModificationResultSchema,
  ObjectiveDraftResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";
import { verifyEd25519Signature } from "../identity/crypto.js";

const signedMobileHandlers = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedDevice,
  context.security.verifySignedRequest,
] as const;

export const registerMobileExecutiveRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.post(
    "/api/v1/devices/push-token",
    {
      preHandler: [...signedMobileHandlers(context)],
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const device = context.security.getDevice(request);
      const input = DevicePushRegistrationOperationSchema.parse(
        context.security.getEnvelope(request).payload,
      );
      return PushRegistrationResponseSchema.parse(
        await context.notifications.register({
          ownerId: identity.user.id,
          deviceId: device.id,
          token: input.pushToken,
          appVersion: input.appVersion,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.delete(
    "/api/v1/devices/push-token",
    { preHandler: [...signedMobileHandlers(context)] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const device = context.security.getDevice(request);
      DevicePushUnregistrationOperationSchema.parse(
        context.security.getEnvelope(request).payload,
      );
      return PushRegistrationResponseSchema.parse(
        await context.notifications.unregister({
          ownerId: identity.user.id,
          deviceId: device.id,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/v1/notifications/preferences",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      NotificationPreferencesResponseSchema.parse(
        await context.notifications.preferences(
          context.security.getIdentity(request).user.id,
        ),
      ),
  );

  app.patch(
    "/api/v1/notifications/preferences",
    { preHandler: [...signedMobileHandlers(context)] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const device = context.security.getDevice(request);
      const input = UpdateNotificationPreferencesOperationSchema.parse(
        context.security.getEnvelope(request).payload,
      );
      return NotificationPreferencesResponseSchema.parse(
        await context.notifications.updatePreferences({
          ownerId: identity.user.id,
          deviceId: device.id,
          patch: input.preferences,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/v1/attention",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const summary = await context.businessOS.summary(
        context.security.getIdentity(request).user.id,
      );
      return ExecutiveAttentionResponseSchema.parse({
        total: summary.summary.attentionCount,
        pendingApprovals: summary.summary.pendingApprovals,
        blockedObjectives: summary.summary.blockedObjectives,
        atRiskObjectives: summary.summary.atRiskObjectives,
        criticalSecurityEvents: summary.attention.filter(
          (item) => item.severity === "CRITICAL" && item.entity.kind === "PROVIDER",
        ).length,
      });
    },
  );

  app.post(
    "/api/v1/device/recent-auth/challenge",
    {
      preHandler: [...signedMobileHandlers(context)],
      config: { rateLimit: { max: 5, timeWindow: "5 minutes" } },
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const device = context.security.getDevice(request);
      const input = MobileRecentAuthChallengeOperationSchema.parse(
        context.security.getEnvelope(request).payload,
      );
      const challenge = await context.securityState.createRecentAuthChallenge(
        identity,
        input.purpose,
      );
      await context.identity.store.appendAudit({
        eventType: "RECENT_AUTH_CHALLENGE_CREATED",
        userId: identity.user.id,
        deviceId: device.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "Trusted Android biometric recent-auth challenge created.",
        requestId: request.id,
        metadata: { purpose: input.purpose },
      });
      return RecentAuthChallengeResponseSchema.parse(challenge);
    },
  );

  app.post(
    "/api/v1/device/biometric-key",
    { preHandler: [...signedMobileHandlers(context)] },
    async (request) => {
      const device = context.security.getDevice(request);
      const input = MobileBiometricKeyRegistrationOperationSchema.parse(
        context.security.getEnvelope(request).payload,
      );
      await context.identity.store.updateDevice({
        ...device,
        metadata: { ...device.metadata, mobileBiometricPublicKey: input.publicKey },
      });
      const identity = context.security.getIdentity(request);
      await context.identity.store.appendAudit({
        eventType: "DEVICE_KEYSTORE_INITIALISED",
        userId: identity.user.id,
        deviceId: device.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "Android biometric step-up public key registered.",
        requestId: request.id,
      });
      return MobileBiometricKeyRegistrationResponseSchema.parse({
        registered: true,
        deviceId: device.id,
      });
    },
  );

  app.post(
    "/api/v1/device/recent-auth/verify",
    {
      preHandler: [...signedMobileHandlers(context)],
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const device = context.security.getDevice(request);
      const input = MobileRecentAuthVerifyOperationSchema.parse(
        context.security.getEnvelope(request).payload,
      );
      const biometricPublicKey = Ed25519PublicKeySchema.safeParse(
        device.metadata.mobileBiometricPublicKey,
      );
      const biometricVerified = biometricPublicKey.success &&
        await verifyEd25519Signature(
          biometricPublicKey.data,
          mobileRecentAuthSigningPayload(input.challengeId, input.challengeToken, device.id),
          input.biometricSignature,
        ).catch(() => false);
      if (!biometricVerified) {
        const error = new Error("Biometric recent authentication failed.");
        Object.assign(error, { statusCode: 401, code: "RECENT_AUTHENTICATION_FAILED" });
        throw error;
      }
      const grant = await context.securityState.verifyTrustedDeviceBiometric(
        identity,
        input,
      );
      await context.identity.store.appendAudit({
        eventType: "RECENT_AUTH_SUCCEEDED",
        userId: identity.user.id,
        deviceId: device.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "Trusted Android biometric step-up succeeded.",
        requestId: request.id,
        metadata: { purpose: grant.purpose },
      });
      return RecentAuthStatusSchema.parse({
        active: true,
        purpose: grant.purpose,
        expiresAt: grant.expiresAt,
      });
    },
  );

  app.post(
    "/api/v1/device/approvals/:approvalId/decision",
    {
      preHandler: [...signedMobileHandlers(context)],
      config: { rateLimit: { max: 20, timeWindow: "5 minutes" } },
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const device = context.security.getDevice(request);
      const { approvalId } = ApprovalIdParametersSchema.parse(request.params);
      const input = MobileApprovalDecisionOperationSchema.parse(
        context.security.getEnvelope(request).payload,
      );
      if (input.approvalId !== approvalId) {
        const error = new Error("The signed approval id does not match the route.");
        Object.assign(error, { statusCode: 400, code: "APPROVAL_ID_MISMATCH" });
        throw error;
      }
      const approval = await context.approvals.get(identity.user.id, approvalId);
      const recentAuthenticationRequired =
        input.decision === "APPROVE" &&
        approval.status === "PENDING" &&
        approval.approvalRequirement === "recent_authentication";
      if (recentAuthenticationRequired) {
        await context.securityState.consumeGrant(
          identity,
          "approve_high_risk_action",
        );
      }
      const result =
        input.decision === "APPROVE"
          ? await context.approvals.approve(
              identity.user.id,
              approvalId,
              identity.session.id,
              { ipAddress: request.ip, requestId: request.id },
              recentAuthenticationRequired,
            )
          : await context.approvals.reject(
              identity.user.id,
              approvalId,
              identity.session.id,
              { ipAddress: request.ip, requestId: request.id },
              input.reason,
            );
      await context.identity.store.appendAudit({
        eventType: input.decision === "APPROVE" ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED",
        userId: identity.user.id,
        deviceId: device.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "Owner submitted a signed Android approval decision.",
        requestId: request.id,
        metadata: { approvalId, recentAuthenticationRequired },
      });
      return ApprovalResponseSchema.parse(result);
    },
  );

  app.post(
    "/api/v1/device/objectives/:objectiveId/action",
    { preHandler: [...signedMobileHandlers(context)] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { approvalId: objectiveId } = ApprovalIdParametersSchema.parse({
        approvalId: (request.params as { objectiveId?: unknown }).objectiveId,
      });
      const input = MobileObjectiveActionOperationSchema.parse(
        context.security.getEnvelope(request).payload,
      );
      if (input.objectiveId !== objectiveId) {
        const error = new Error("The signed objective id does not match the route.");
        Object.assign(error, { statusCode: 400, code: "OBJECTIVE_ID_MISMATCH" });
        throw error;
      }
      return ObjectiveDashboardSchema.parse(
        input.action === "resume"
          ? await context.objectives.activate({ ownerId: identity.user.id, objectiveId, idempotencyKey: input.idempotencyKey, requestId: request.id, ipAddress: request.ip })
          : await context.objectives.transition({ ownerId: identity.user.id, objectiveId, action: input.action, idempotencyKey: input.idempotencyKey, requestId: request.id, ipAddress: request.ip }),
      );
    },
  );

  app.post(
    "/api/v1/device/objectives",
    { preHandler: [...signedMobileHandlers(context)] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const input = MobileObjectiveCreateOperationSchema.parse(
        context.security.getEnvelope(request).payload,
      );
      return ObjectiveDraftResponseSchema.parse(
        await context.objectives.create({
          ownerId: identity.user.id,
          body: input.request,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/v1/device/objectives/:objectiveId/modify",
    { preHandler: [...signedMobileHandlers(context)] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { approvalId: objectiveId } = ApprovalIdParametersSchema.parse({
        approvalId: (request.params as { objectiveId?: unknown }).objectiveId,
      });
      const input = MobileObjectiveModifyOperationSchema.parse(
        context.security.getEnvelope(request).payload,
      );
      if (input.objectiveId !== objectiveId) {
        const error = new Error("The signed objective id does not match the route.");
        Object.assign(error, { statusCode: 400, code: "OBJECTIVE_ID_MISMATCH" });
        throw error;
      }
      return ObjectiveModificationResultSchema.parse(
        await context.objectives.modify({
          ownerId: identity.user.id,
          objectiveId,
          body: {
            idempotencyKey: input.idempotencyKey,
            ...(input.budgetCredits !== undefined ? { budgetCredits: input.budgetCredits } : {}),
            ...(input.priority !== undefined ? { priority: input.priority } : {}),
          },
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );
};
