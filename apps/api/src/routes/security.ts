import {
  CsrfTokenResponseSchema,
  NetworkStatusResponseSchema,
  RecentAuthChallengeRequestSchema,
  RecentAuthChallengeResponseSchema,
  RecentAuthPurposeSchema,
  RecentAuthStatusSchema,
  RecentAuthVerifyPasswordRequestSchema,
  RecoveryCodeGenerationResponseSchema,
  RecoveryCodeInvalidationResponseSchema,
  RecoveryCodeStatusSchema,
  RecoveryCodeVerifyRequestSchema,
  RecoveryCodeVerifyResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const StatusQuerySchema = z
  .object({ purpose: RecentAuthPurposeSchema.default("approve_high_risk_action") })
  .strict();
const EmptyBodySchema = z.union([z.undefined(), z.object({}).strict()]);

export const registerSecurityRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/security/csrf",
    {
      preHandler: [context.security.requireAuthentication],
    },
    async (request) =>
      CsrfTokenResponseSchema.parse(
        await context.securityState.issueCsrf(context.security.getIdentity(request)),
      ),
  );

  app.get(
    "/api/security/network",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      NetworkStatusResponseSchema.parse(
        await context.networkVerifier.verify({
          remoteAddress: request.socket.remoteAddress ?? request.ip,
        }),
      ),
  );

  app.post(
    "/api/security/recent-auth/challenge",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
      config: { rateLimit: { max: 5, timeWindow: "5 minutes" } },
    },
    async (request) => {
      const input = RecentAuthChallengeRequestSchema.parse(request.body);
      const identity = context.security.getIdentity(request);
      const challenge = await context.securityState.createRecentAuthChallenge(
        identity,
        input.purpose,
      );
      await context.identity.store.appendAudit({
        eventType: "RECENT_AUTH_CHALLENGE_CREATED",
        userId: identity.user.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "Recent-authentication challenge created.",
        requestId: request.id,
        metadata: { purpose: input.purpose },
      });
      return RecentAuthChallengeResponseSchema.parse(challenge);
    },
  );

  app.post(
    "/api/security/recent-auth/verify-password",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    },
    async (request) => {
      const input = RecentAuthVerifyPasswordRequestSchema.parse(request.body);
      const identity = context.security.getIdentity(request);
      try {
        const grant = await context.securityState.verifyRecentPassword(identity, input);
        await context.identity.store.appendAudit({
          eventType: "RECENT_AUTH_SUCCEEDED",
          userId: identity.user.id,
          ipAddress: request.ip,
          outcome: "SUCCESS",
          reason: "Password recent authentication succeeded.",
          requestId: request.id,
          metadata: { purpose: grant.purpose },
        });
        return RecentAuthStatusSchema.parse({
          active: true,
          purpose: grant.purpose,
          expiresAt: grant.expiresAt,
        });
      } catch (error) {
        await context.identity.store.appendAudit({
          eventType: "RECENT_AUTH_FAILED",
          userId: identity.user.id,
          ipAddress: request.ip,
          outcome: "DENIED",
          reason: "Password recent authentication failed.",
          requestId: request.id,
        });
        throw error;
      }
    },
  );

  app.get(
    "/api/security/recent-auth/status",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const { purpose } = StatusQuerySchema.parse(request.query);
      return RecentAuthStatusSchema.parse(
        await context.securityState.status(
          context.security.getIdentity(request),
          purpose,
        ),
      );
    },
  );

  app.get(
    "/api/security/recovery-codes/status",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      RecoveryCodeStatusSchema.parse(
        await context.securityState.recoveryStatus(
          context.security.getIdentity(request).user.id,
        ),
      ),
  );

  app.post(
    "/api/security/recovery-codes/generate",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
        context.security.verifyPrivateNetwork,
      ],
    },
    async (request) => {
      EmptyBodySchema.parse(request.body);
      const identity = context.security.getIdentity(request);
      await context.securityState.consumeGrant(identity, "generate_recovery_codes");
      const result = await context.securityState.generateRecoveryCodes(
        identity.user.id,
      );
      await context.identity.store.appendAudit({
        eventType: "RECOVERY_CODES_GENERATED",
        userId: identity.user.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "Recovery codes regenerated; previous codes invalidated.",
        requestId: request.id,
        metadata: { count: result.codes.length },
      });
      return RecoveryCodeGenerationResponseSchema.parse(result);
    },
  );

  app.post(
    "/api/security/recovery-codes/invalidate",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      EmptyBodySchema.parse(request.body);
      const identity = context.security.getIdentity(request);
      await context.securityState.invalidateRecoveryCodes(identity.user.id);
      await context.identity.store.appendAudit({
        eventType: "RECOVERY_CODES_INVALIDATED",
        userId: identity.user.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "All unused recovery codes invalidated.",
        requestId: request.id,
      });
      return RecoveryCodeInvalidationResponseSchema.parse({ success: true });
    },
  );

  app.post(
    "/api/security/recovery-codes/verify",
    {
      preHandler: [context.security.verifyPrivateNetwork],
      config: { rateLimit: { max: 5, timeWindow: "30 minutes" } },
    },
    async (request) => {
      const input = RecoveryCodeVerifyRequestSchema.parse(request.body);
      const owner = await context.securityState.useRecoveryCode(
        input.email,
        input.code,
      );
      const sessions = await context.identity.store.listSessions(owner.id);
      const at = new Date().toISOString();
      for (const session of sessions) {
        if (session.revokedAt !== null) continue;
        await context.identity.revokeSession(
          session.id,
          owner.id,
          "RECOVERY_CODE_USED",
        );
        await context.securityState.store.revokeSessionSecurity(session.id, at);
      }
      await context.identity.store.appendAudit({
        eventType: "RECOVERY_CODE_USED",
        userId: owner.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "One-time recovery code consumed; active sessions revoked.",
        requestId: request.id,
      });
      return RecoveryCodeVerifyResponseSchema.parse({
        verified: true,
        nextStep: "LOCAL_PASSWORD_RESET_REQUIRED",
      });
    },
  );
};
