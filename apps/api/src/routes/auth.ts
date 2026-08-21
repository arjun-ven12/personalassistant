import {
  AuthStateResponseSchema,
  AuthSuccessResponseSchema,
  GoogleOAuthStatusSchema,
  LoginRequestSchema,
  LogoutResponseSchema,
  RegisterRequestSchema,
  RevokeOtherSessionsResponseSchema,
  SessionListResponseSchema,
  SessionRevocationResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { ApiSecurityError } from "../identity/errors.js";
import { clearSessionCookie } from "../identity/security.js";
import { toAuthSession } from "../identity/service.js";
import type { ApiRouteContext } from "./context.js";

const SessionIdParametersSchema = z.object({ sessionId: z.string().uuid() }).strict();

const requestMetadata = (request: FastifyRequest) => ({
  ipAddress: request.ip,
  userAgent: request.headers["user-agent"]?.slice(0, 500) ?? "unknown",
});

const setSessionCookie = (
  reply: FastifyReply,
  context: ApiRouteContext,
  token: string,
) => {
  reply.setCookie(context.cookieName, token, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: context.secureCookies,
    maxAge: context.sessionTtlSeconds,
  });
};

export const registerAuthRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  app.post(
    "/api/auth/register",
    {
      preHandler: [context.security.requireTrustedOrigin],
      config: { rateLimit: { max: 3, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const input = RegisterRequestSchema.parse(request.body);
      try {
        const result = await context.identity.registerOwner(
          input,
          requestMetadata(request),
        );
        setSessionCookie(reply, context, result.token);
        await context.identity.store.appendAudit({
          eventType: "OWNER_REGISTERED",
          userId: result.user.id,
          ipAddress: request.ip,
          outcome: "SUCCESS",
          reason: "Initial owner account registered.",
          requestId: request.id,
        });
        return AuthSuccessResponseSchema.parse({
          success: true,
          user: result.user,
          session: result.session,
        });
      } catch (error) {
        await context.identity.store.appendAudit({
          eventType: "LOGIN_FAILURE",
          ipAddress: request.ip,
          outcome: "FAILURE",
          reason: "Owner registration failed.",
          requestId: request.id,
        });
        throw error;
      }
    },
  );

  app.post(
    "/api/auth/login",
    {
      preHandler: [context.security.requireTrustedOrigin],
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const input = LoginRequestSchema.parse(request.body);
      try {
        const result = await context.identity.login(input, requestMetadata(request));
        setSessionCookie(reply, context, result.token);
        await context.identity.store.appendAudit({
          eventType: "LOGIN_SUCCESS",
          userId: result.user.id,
          ipAddress: request.ip,
          outcome: "SUCCESS",
          reason: "Password authentication succeeded.",
          requestId: request.id,
        });
        return AuthSuccessResponseSchema.parse({
          success: true,
          user: result.user,
          session: result.session,
        });
      } catch (error) {
        await context.identity.store.appendAudit({
          eventType: "LOGIN_FAILURE",
          ipAddress: request.ip,
          outcome: "FAILURE",
          reason: "Password authentication failed.",
          requestId: request.id,
        });
        throw error;
      }
    },
  );

  app.get(
    "/api/auth/session",
    { preHandler: [context.security.requireAuthentication] },
    (request) => {
      const identity = context.security.getIdentity(request);
      return AuthStateResponseSchema.parse({
        authenticated: true,
        user: {
          id: identity.user.id,
          email: identity.user.email,
          displayName: identity.user.displayName,
          createdAt: identity.user.createdAt,
          updatedAt: identity.user.updatedAt,
          lastLoginAt: identity.user.lastLoginAt,
          accountStatus: identity.user.accountStatus,
        },
        session: toAuthSession(identity.session, true),
      });
    },
  );

  app.post(
    "/api/auth/logout",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request, reply) => {
      const identity = context.security.getIdentity(request);
      await context.identity.revokeSession(
        identity.session.id,
        identity.user.id,
        "LOGOUT",
      );
      await context.securityState.store.revokeSessionSecurity(
        identity.session.id,
        new Date().toISOString(),
      );
      clearSessionCookie(reply, context.cookieName, context.secureCookies);
      await context.identity.store.appendAudit({
        eventType: "LOGOUT",
        userId: identity.user.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "Session logged out.",
        requestId: request.id,
      });
      return LogoutResponseSchema.parse({ success: true });
    },
  );

  app.get(
    "/api/auth/sessions",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SessionListResponseSchema.parse(
        (await context.identity.store.listSessions(identity.user.id))
          .filter((session) => session.revokedAt === null)
          .map((session) => toAuthSession(session, session.id === identity.session.id)),
      );
    },
  );

  app.post(
    "/api/auth/sessions/:sessionId/revoke",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request, reply) => {
      const { sessionId } = SessionIdParametersSchema.parse(request.params);
      const identity = context.security.getIdentity(request);
      await context.identity.revokeSession(sessionId, identity.user.id);
      await context.securityState.store.revokeSessionSecurity(
        sessionId,
        new Date().toISOString(),
      );
      if (sessionId === identity.session.id) {
        clearSessionCookie(reply, context.cookieName, context.secureCookies);
      }
      await context.identity.store.appendAudit({
        eventType: "SESSION_REVOKED",
        userId: identity.user.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: `Session ${sessionId} revoked.`,
        requestId: request.id,
      });
      return SessionRevocationResponseSchema.parse({
        success: true,
        sessionId,
      });
    },
  );

  app.get(
    "/api/security/sessions",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SessionListResponseSchema.parse(
        (await context.identity.store.listSessions(identity.user.id))
          .filter((session) => session.revokedAt === null)
          .map((session) => toAuthSession(session, session.id === identity.session.id)),
      );
    },
  );

  app.post(
    "/api/security/sessions/:sessionId/revoke",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request, reply) => {
      const { sessionId } = SessionIdParametersSchema.parse(request.params);
      const identity = context.security.getIdentity(request);
      await context.identity.revokeSession(sessionId, identity.user.id);
      await context.securityState.store.revokeSessionSecurity(
        sessionId,
        new Date().toISOString(),
      );
      if (sessionId === identity.session.id) {
        clearSessionCookie(reply, context.cookieName, context.secureCookies);
      }
      await context.identity.store.appendAudit({
        eventType: "SESSION_REVOKED",
        userId: identity.user.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "Owner revoked a session.",
        requestId: request.id,
        metadata: { sessionId },
      });
      return SessionRevocationResponseSchema.parse({ success: true, sessionId });
    },
  );

  app.post(
    "/api/security/sessions/revoke-others",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      z.union([z.undefined(), z.object({}).strict()]).parse(request.body);
      const identity = context.security.getIdentity(request);
      const sessions = (
        await context.identity.store.listSessions(identity.user.id)
      ).filter(
        (session) => session.id !== identity.session.id && session.revokedAt === null,
      );
      const at = new Date().toISOString();
      for (const session of sessions) {
        await context.identity.revokeSession(
          session.id,
          identity.user.id,
          "REVOKE_ALL_OTHERS",
        );
        await context.securityState.store.revokeSessionSecurity(session.id, at);
      }
      await context.identity.store.appendAudit({
        eventType: "ALL_OTHER_SESSIONS_REVOKED",
        userId: identity.user.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "All other active sessions revoked.",
        requestId: request.id,
        metadata: { revokedCount: sessions.length },
      });
      return RevokeOtherSessionsResponseSchema.parse({
        success: true,
        revokedCount: sessions.length,
      });
    },
  );

  app.get("/api/auth/google/status", () =>
    GoogleOAuthStatusSchema.parse({
      available: false,
      mode: "structure_only",
      message: "Google OAuth is not configured. No external OAuth request is made.",
    }),
  );

  app.get("/api/auth/google/start", () => {
    throw new ApiSecurityError(
      501,
      "GOOGLE_OAUTH_NOT_CONFIGURED",
      "Google OAuth is not configured.",
    );
  });
};
