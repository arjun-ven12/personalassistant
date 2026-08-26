import {
  EmergencyStopResponseSchema,
  CanonicalAlexaSummarySchema,
  CanonicalRuntimeHealthSchema,
  SignedCommandEnvelopeSchema,
  ExecutionEnableResponseSchema,
  HealthResponseSchema,
  ReadinessResponseSchema,
  SecurityReadinessResponseSchema,
  SecurityStatusResponseSchema,
  SystemStatusResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";
import { verifyEnvelopeSignature } from "../identity/crypto.js";
import { ExecutionError } from "../execution/errors.js";

const EmptyInputSchema = z.object({}).strict();
const NoBodySchema = z.union([z.undefined(), EmptyInputSchema]);
const MAC_AGENT_ONLINE_WINDOW_MS = 45_000;
const DeviceSummaryPayloadSchema = z
  .object({ operation: z.literal("system_summary") })
  .strict();

const authenticateDeviceSummary = async (
  request: FastifyRequest,
  context: ApiRouteContext,
) => {
  const envelope = SignedCommandEnvelopeSchema.parse(request.body);
  const device = await context.identity.store.findDeviceById(envelope.deviceId);
  if (!device || device.trustStatus !== "TRUSTED")
    throw new ExecutionError(
      403,
      "TRUSTED_DEVICE_REQUIRED",
      "A trusted device is required.",
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
  if (!(await verifyEnvelopeSignature(device.publicKey, envelope)))
    throw new ExecutionError(
      401,
      "INVALID_SIGNATURE",
      "The device signature is invalid.",
    );
  if (
    !(await context.identity.store.consumeNonce(
      device.id,
      envelope.nonce,
      expiresAt,
      now,
    ))
  )
    throw new ExecutionError(
      409,
      "DUPLICATE_NONCE",
      "The signed request was replayed.",
    );
  DeviceSummaryPayloadSchema.parse(envelope.payload);
  const touched = { ...device, lastSeen: now.toISOString() };
  await context.identity.store.updateDevice(touched);
  return touched;
};

const canonicalSummary = async (context: ApiRouteContext, ownerId: string) => {
  const now = Date.now();
  const devices = (await context.identity.store.listDevices(ownerId))
    .slice(0, 100)
    .map((device) => ({
      id: device.id,
      name: device.deviceName,
      type: device.deviceType,
      trustState: device.trustStatus,
      presence:
        device.trustStatus === "REVOKED"
          ? ("REVOKED" as const)
          : device.lastSeen &&
              now - new Date(device.lastSeen).getTime() <= MAC_AGENT_ONLINE_WINDOW_MS
            ? ("ONLINE" as const)
            : ("OFFLINE" as const),
      lastSeenAt: device.lastSeen,
      capabilityCount: device.capabilities.length,
    }));
  const macAvailable = devices.some(
    (device) =>
      device.type === "MAC_AGENT" &&
      device.trustState === "TRUSTED" &&
      device.presence === "ONLINE",
  );
  return CanonicalAlexaSummarySchema.parse({
    apiVersion: "v1",
    generatedAt: new Date().toISOString(),
    deploymentMode: context.deploymentMode,
    devices,
    capabilities: {
      cloudExecutable: [
        "conversation",
        "memory",
        "agents",
        "objectives",
        "workflows",
        "tasks",
        "economy",
        "experiments",
        "approvals",
      ],
      deviceExecutable: {
        targetDeviceRequired: true,
        macAgent: macAvailable ? "AVAILABLE" : "UNAVAILABLE",
      },
    },
    invariants: {
      oneBackendManyClients: true,
      postgresDurableTruth: true,
      redisEphemeralOnly: true,
      nativeExecutionRemainsOnDevice: true,
      blindReplayProhibited: true,
    },
  });
};

const runtimeHealth = async (context: ApiRouteContext) => {
  const started = performance.now();
  const [databaseReady, migrations, redis] = await Promise.all([
    context.databaseReady(),
    context.migrationState(),
    context.redis.health(),
  ]);
  const providers = context.aiRuntime.listProviders();
  const aiConfigured = providers.some(
    (provider) => provider.enabled && provider.configured,
  );
  const postgresState =
    databaseReady && migrations === "current" ? "HEALTHY" : "UNAVAILABLE";
  const redisState = redis.available ? "HEALTHY" : "DEGRADED";
  const aiState = aiConfigured ? "HEALTHY" : "DEGRADED";
  return CanonicalRuntimeHealthSchema.parse({
    apiVersion: "v1",
    status:
      postgresState === "UNAVAILABLE"
        ? "UNAVAILABLE"
        : redisState === "DEGRADED" || aiState === "DEGRADED"
          ? "DEGRADED"
          : "HEALTHY",
    deploymentMode: context.deploymentMode,
    timestamp: new Date().toISOString(),
    uptimeSeconds: process.uptime(),
    components: {
      api: {
        state: "HEALTHY",
        reasonCode: "API_ACCEPTING_REQUESTS",
        latencyMs: Math.round((performance.now() - started) * 100) / 100,
      },
      postgres: {
        state: postgresState,
        reasonCode: !databaseReady
          ? "POSTGRES_UNAVAILABLE"
          : migrations !== "current"
            ? "MIGRATIONS_NOT_CURRENT"
            : "POSTGRES_READY",
        latencyMs: null,
      },
      redis: {
        state: redisState,
        reasonCode: redis.available
          ? "REDIS_READY"
          : redis.mode === "disabled"
            ? "REDIS_NOT_CONFIGURED"
            : "REDIS_DEGRADED",
        latencyMs: redis.latencyMs,
      },
      aiRouter: {
        state: aiState,
        reasonCode: aiConfigured
          ? "AI_PROVIDER_CONFIGURED"
          : "AI_PROVIDER_NOT_CONFIGURED",
        latencyMs: null,
      },
      scheduler: {
        state: "HEALTHY",
        reasonCode: "EVENT_DRIVEN_SCHEDULER_READY",
        latencyMs: null,
      },
    },
  });
};

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

  app.get("/api/v1/health", async (request) => {
    EmptyInputSchema.parse(request.query);
    return runtimeHealth(context);
  });

  app.get(
    "/api/v1/system/summary",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      EmptyInputSchema.parse(request.query);
      const identity = context.security.getIdentity(request);
      return canonicalSummary(context, identity.user.id);
    },
  );

  app.post(
    "/api/v1/device/system-summary",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request) => {
      const device = await authenticateDeviceSummary(request, context);
      return canonicalSummary(context, device.ownerId);
    },
  );

  app.get("/ready", async (request, reply) => {
    EmptyInputSchema.parse(request.query);
    const [databaseReady, migrations, securityState] = await Promise.all([
      context.databaseReady(),
      context.migrationState(),
      Promise.resolve(context.governanceStore.getSecurityState())
        .then(() => true)
        .catch(() => false),
    ]);
    const privateNetwork =
      context.privateNetworkRequired && context.productionNetworkVerifierConfigured
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
      const [databaseReady, redisHealth] = await Promise.all([
        context.databaseReady(),
        context.redis.health(),
      ]);
      const aiConfigured = context.aiRuntime
        .listProviders()
        .some((provider) => provider.enabled && provider.configured);
      return SystemStatusResponseSchema.parse({
        api: { status: "online" },
        database: { status: databaseReady ? "online" : "offline" },
        redis: {
          status: redisHealth.available
            ? "online"
            : redisHealth.mode === "disabled"
              ? "not_configured"
              : "degraded",
        },
        aiProvider: { status: aiConfigured ? "online" : "not_configured" },
        macAgent: {
          status:
            trustedMacAgents.length === 0
              ? "not_connected"
              : macAgentOnline
                ? "online"
                : "offline",
        },
        privateNetwork: {
          status: context.privateNetworkRequired ? "online" : "disabled",
        },
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
        context.security.verifyTransportNetwork,
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
