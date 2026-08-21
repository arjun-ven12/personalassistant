import {
  EmergencyStopResponseSchema,
  ExecutionEnableResponseSchema,
  HealthResponseSchema,
  ReadinessResponseSchema,
  SecurityReadinessResponseSchema,
  SecurityStatusResponseSchema,
  SystemStatusResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const EmptyInputSchema = z.object({}).strict();
const NoBodySchema = z.union([z.undefined(), EmptyInputSchema]);
const MAC_AGENT_ONLINE_WINDOW_MS = 45_000;

export const registerSystemRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get("/health", (request) => {
    EmptyInputSchema.parse(request.query);
    return HealthResponseSchema.parse({
      status: "ok",
      service: "alexa-api",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
    });
  });

  app.get("/ready", async (request, reply) => {
    EmptyInputSchema.parse(request.query);
    const [databaseReady, migrations, securityState] = await Promise.all([
      context.databaseReady(),
      context.migrationState(),
      Promise.resolve(context.governanceStore.getSecurityState())
        .then(() => true)
        .catch(() => false),
    ]);
    const privateNetwork = context.productionNetworkVerifierConfigured
      ? "verified"
      : "unavailable";
    const ready =
      databaseReady &&
      migrations === "current" &&
      securityState &&
      context.productionNetworkVerifierConfigured &&
      !context.executionEnabled();
    const response = ReadinessResponseSchema.parse({
      ready,
      timestamp: new Date().toISOString(),
      checks: {
        database: databaseReady ? "ready" : "unavailable",
        migrations,
        securityState: securityState ? "ready" : "unavailable",
        privateNetwork,
        privilegedExecutionAvailable: false,
      },
    });
    return reply.status(ready ? 200 : 503).send(response);
  });

  app.get(
    "/api/security/readiness",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const network = await context.networkVerifier.verify({
        remoteAddress: request.socket.remoteAddress ?? request.ip,
      });
      const [databaseReady, migrations, emergencyStopActive] = await Promise.all([
        context.databaseReady(),
        context.migrationState(),
        context.emergencyStopActive(),
      ]);
      return SecurityReadinessResponseSchema.parse({
        database: databaseReady ? "ready" : "unavailable",
        migrations,
        privateNetwork:
          network.state === "PRIVATE_NETWORK"
            ? "verified"
            : network.state === "UNAVAILABLE"
              ? "unavailable"
              : "not_verified",
        secureCookies: context.secureCookies,
        csrfProtection: true,
        trustedProxyConfigured: context.trustedProxyConfigured,
        persistentIdentityStore: context.persistenceMode === "postgresql",
        persistentGovernanceStore: context.persistenceMode === "postgresql",
        recentAuthenticationAvailable: true,
        emergencyStopActive,
        privilegedExecutionAvailable: false,
        readOnlyCapabilityExecution: context.readOnlyExecutionEnabled
          ? "available"
          : "unavailable",
        writeExecutionAvailable: false,
      });
    },
  );

  app.get(
    "/api/system/status",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      EmptyInputSchema.parse(request.query);
      const identity = context.security.getIdentity(request);
      const devices = await context.identity.store.listDevices(identity.user.id);
      const trustedMacAgents = devices.filter(
        (device) =>
          device.deviceType === "MAC_AGENT" && device.trustStatus === "TRUSTED",
      );
      const macAgentOnline = trustedMacAgents.some(
        (device) =>
          device.lastSeen !== null &&
          Date.now() - new Date(device.lastSeen).getTime() <=
            MAC_AGENT_ONLINE_WINDOW_MS,
      );
      return SystemStatusResponseSchema.parse({
        api: { status: "online" },
        database: { status: "not_configured" },
        redis: { status: "not_configured" },
        aiProvider: { status: "not_configured" },
        macAgent: {
          status:
            trustedMacAgents.length === 0
              ? "not_connected"
              : macAgentOnline
                ? "online"
                : "offline",
        },
        privateNetwork: { status: "not_configured" },
        gestureEngine: { status: "not_started" },
        execution: { enabled: context.executionEnabled() },
      });
    },
  );

  app.get(
    "/api/security/status",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      EmptyInputSchema.parse(request.query);
      const networkVerification = await context.networkVerifier.verify({
        remoteAddress: request.socket.remoteAddress ?? request.ip,
      });
      return SecurityStatusResponseSchema.parse({
        denyByDefault: true,
        privateNetworkRequired: context.privateNetworkRequired,
        registeredDeviceRequired: true,
        signedRequestsRequired: true,
        highRiskGestureApprovalAllowed: false,
        arbitraryShellAllowed: false,
        arbitraryFileAccessAllowed: false,
        permanentDeletionAllowed: false,
        executionEnabled: context.executionEnabled(),
        emergencyStopActive: await context.emergencyStopActive(),
        authenticationRequired: true,
        networkVerification: networkVerification.state,
        persistence: context.persistenceMode,
      });
    },
  );

  app.post(
    "/api/security/emergency-stop",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      NoBodySchema.parse(request.body);
      const identity = context.security.getIdentity(request);
      await context.activateEmergencyStop();
      await context.executionStore.cancelAll(new Date().toISOString());
      await context.governanceAudit({
        eventType: "EMERGENCY_STOP_ACTIVATED",
        ownerId: identity.user.id,
        outcome: "SUCCESS",
        reason: "Global emergency stop asserted.",
        ipAddress: request.ip,
        requestId: request.id,
      });
      request.log.warn({ requestId: request.id }, "Phase 2.3 emergency stop asserted");
      return EmergencyStopResponseSchema.parse({
        success: true,
        executionEnabled: false,
      });
    },
  );

  app.post(
    "/api/security/execution/enable",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    (request, reply) => {
      NoBodySchema.parse(request.body);
      return reply.status(409).send(
        ExecutionEnableResponseSchema.parse({
          success: false,
          error: {
            code: "EXECUTION_NOT_AVAILABLE",
            message: "Execution cannot be enabled during Phase 2.3.",
          },
        }),
      );
    },
  );

  app.post(
    "/api/security/emergency-stop/release",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
        context.security.verifyPrivateNetwork,
      ],
    },
    async (request) => {
      NoBodySchema.parse(request.body);
      const identity = context.security.getIdentity(request);
      await context.securityState.consumeGrant(identity, "modify_security_settings");
      await context.releaseEmergencyStop();
      await context.governanceAudit({
        eventType: "GOVERNANCE_STATE_CHANGED",
        ownerId: identity.user.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "Owner released emergency stop after recent authentication.",
        requestId: request.id,
        metadata: { readOnlyCapabilityExecution: context.readOnlyExecutionEnabled },
      });
      return EmergencyStopResponseSchema.parse({
        success: true,
        executionEnabled: false,
      });
    },
  );
};
