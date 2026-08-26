import {
  NativeSpatialGesturePayloadSchema,
  NativeSpatialRuntimeResponseSchema,
  SpatialCommandSpaceResponseSchema,
  SpatialUiDashboardResponseSchema,
  SignedCommandEnvelopeSchema,
  SpatialDashboardResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { ApiRouteContext } from "./context.js";
import { verifyEnvelopeSignature } from "../identity/crypto.js";
import { ExecutionError } from "../execution/errors.js";

const authenticateNativeSpatialDevice = async (
  request: FastifyRequest,
  context: ApiRouteContext,
) => {
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
  return {
    device,
    networkState: network.state,
    payload: NativeSpatialGesturePayloadSchema.parse(envelope.payload),
  };
};

export const registerSpatialRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/spatial",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SpatialDashboardResponseSchema.parse(
        await context.spatial.dashboard(identity.user.id),
      );
    },
  );

  app.get(
    "/api/spatial/native",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return NativeSpatialRuntimeResponseSchema.parse(
        await context.spatial.nativeRuntime(identity.user.id),
      );
    },
  );

  app.get(
    "/api/spatial/ui",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SpatialUiDashboardResponseSchema.parse(
        await context.spatial.spatialUi(identity.user.id),
      );
    },
  );

  app.get(
    "/api/spatial/command-space",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SpatialCommandSpaceResponseSchema.parse(
        await context.spatial.commandSpace(identity.user.id),
      );
    },
  );

  app.post(
    "/api/spatial/cameras/refresh",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SpatialDashboardResponseSchema.parse(
        await context.spatial.refreshCameras({
          ownerId: identity.user.id,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/spatial/profiles",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SpatialDashboardResponseSchema.parse(
        await context.spatial.createProfile({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/spatial/mappings",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SpatialDashboardResponseSchema.parse(
        await context.spatial.upsertMapping({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/spatial/gestures",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SpatialDashboardResponseSchema.parse(
        await context.spatial.recordGesture({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/spatial/ui/metrics",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SpatialUiDashboardResponseSchema.parse(
        await context.spatial.recordInteractionMetric({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/spatial/ui/engine-metrics",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SpatialUiDashboardResponseSchema.parse(
        await context.spatial.recordEngineMetric({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/spatial/command-space/mode",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SpatialCommandSpaceResponseSchema.parse(
        await context.spatial.updateSpatialMode({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post("/api/agent/spatial/gestures", async (request) => {
    const { device, networkState, payload } = await authenticateNativeSpatialDevice(
      request,
      context,
    );
    const dashboard = await context.spatial.recordGesture({
      ownerId: device.ownerId,
      body: {
        ...(payload.profileId ? { profileId: payload.profileId } : {}),
        gesture: payload.gesture,
        confidence: payload.confidence,
        handedness: payload.handedness,
        state: payload.state,
      },
      requestId: request.id,
      ipAddress: request.ip,
    });
    const latestGesture = dashboard.history[0];
    const routed =
      latestGesture?.gesture === payload.gesture &&
      latestGesture.intentCreated &&
      latestGesture.state === "completed";
    if (
      routed &&
      payload.applicationTarget &&
      payload.gesture === "pinch" &&
      payload.state === "confirmed" &&
      payload.confidence >= 0.75
    ) {
      await context.nativeProviders.dispatch({
        ownerId: device.ownerId,
        sessionId: device.id,
        networkState,
        body: payload.applicationTarget,
        requestId: request.id,
        ipAddress: request.ip,
      });
    }
    return SpatialDashboardResponseSchema.parse(dashboard);
  });
};
