import {
  ApplicationDiscoveryIngestRequestSchema,
  ApplicationDiscoveryResponseSchema,
  ApplicationInstallationListResponseSchema,
  SignedCommandEnvelopeSchema,
} from "@alexa-control/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { ExecutionError } from "../execution/errors.js";
import { verifyEnvelopeSignature } from "../identity/crypto.js";
import type { ApiRouteContext } from "./context.js";

const DeviceQuerySchema = z
  .object({ deviceId: z.string().uuid().optional() })
  .strict();

const authenticateDiscoveryDevice = async (
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
  const network = await context.networkVerifier.verify({
    remoteAddress: request.socket.remoteAddress ?? request.ip,
    ...(typeof request.headers["tailscale-user-login"] === "string"
      ? { tailscaleUserLogin: request.headers["tailscale-user-login"] }
      : {}),
    ...(typeof request.headers["tailscale-user-name"] === "string"
      ? { tailscaleUserName: request.headers["tailscale-user-name"] }
      : {}),
  });
  if (network.state !== "PRIVATE_NETWORK")
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
  if (
    new Date(envelope.expiresAt) <= now ||
    new Date(envelope.issuedAt).getTime() > now.getTime() + 30_000
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
  return { device, envelope };
};

export const registerApplicationDiscoveryRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/applications/installations",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = DeviceQuerySchema.parse(request.query);
      return ApplicationInstallationListResponseSchema.parse(
        await context.applicationDiscovery.listInstallations(
          identity.user.id,
          query.deviceId,
        ),
      );
    },
  );

  app.post(
    "/api/applications/discovery-ingest",
    {
      config: { rateLimit: { max: 20, timeWindow: "5 minutes" } },
    },
    async (request) => {
      const { device, envelope } = await authenticateDiscoveryDevice(request, context);
      return ApplicationDiscoveryResponseSchema.parse(
        await context.applicationDiscovery.ingest(
          device.ownerId,
          device.id,
          request.id,
          request.ip,
          ApplicationDiscoveryIngestRequestSchema.parse(envelope.payload),
        ),
      );
    },
  );

  app.post(
    "/api/applications/discovery-refresh",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
      config: { rateLimit: { max: 10, timeWindow: "5 minutes" } },
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      await context.governanceAudit({
        eventType: "APPLICATION_DISCOVERY_REFRESH_REQUESTED",
        ownerId: identity.user.id,
        outcome: "SUCCESS",
        reason:
          "Owner requested application discovery refresh; Mac Agent performs fixed-root scan locally.",
        requestId: request.id,
        ipAddress: request.ip,
        metadata: { serverFilesystemScan: false },
      });
      return { success: true, serverFilesystemScan: false };
    },
  );
};
