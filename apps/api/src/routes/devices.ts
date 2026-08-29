import {
  CreatePairingIntentResponseSchema,
  DeviceListResponseSchema,
  DeviceMutationResponseSchema,
  PairingRequestResponseSchema,
  PairingRequestSchema,
  PairingStatusRequestSchema,
  PairingStatusResponseSchema,
  SignedRequestVerificationResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { toDeviceView } from "../identity/service.js";
import type { ApiRouteContext } from "./context.js";

const DeviceParametersSchema = z.object({ deviceId: z.string().uuid() }).strict();

export const registerDeviceRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.post(
    "/api/devices/pairing-intents",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const intent = await context.identity.createPairingIntent(identity.user.id);
      await context.identity.store.appendAudit({
        eventType: "DEVICE_PAIR_INTENT_CREATED",
        userId: identity.user.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "Short-lived device pairing intent created.",
        requestId: request.id,
      });
      return CreatePairingIntentResponseSchema.parse(intent);
    },
  );

  app.post(
    "/api/devices/pairing-requests",
    {
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    },
    async (request) => {
      const input = PairingRequestSchema.parse(request.body);
      const result = await context.identity.requestPairing(input);
      await context.identity.store.appendAudit({
        eventType: "DEVICE_PAIR_REQUEST",
        userId: result.device.ownerId,
        deviceId: result.device.id,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "Device supplied a public key and requested approval.",
        requestId: request.id,
      });
      return PairingRequestResponseSchema.parse({
        deviceId: result.device.id,
        pairingRequestToken: result.pairingRequestToken,
        trustStatus: "PENDING",
        ...(context.serverExecutionSigner
          ? {
              serverExecutionPublicKey: context.serverExecutionSigner.publicKeyX,
              serverExecutionKeyFingerprint: context.serverExecutionSigner.fingerprint,
            }
          : {}),
      });
    },
  );

  app.post(
    "/api/devices/pairing-status",
    {
      config: { rateLimit: { max: 30, timeWindow: "5 minutes" } },
    },
    async (request) => {
      const input = PairingStatusRequestSchema.parse(request.body);
      const device = await context.identity.getPairingStatus(
        input.deviceId,
        input.pairingRequestToken,
      );
      return PairingStatusResponseSchema.parse({
        deviceId: device.id,
        trustStatus: device.trustStatus,
        fingerprint: device.fingerprint,
        ...(context.serverExecutionSigner
          ? {
              serverExecutionPublicKey: context.serverExecutionSigner.publicKeyX,
              serverExecutionKeyFingerprint: context.serverExecutionSigner.fingerprint,
            }
          : {}),
      });
    },
  );

  app.get(
    "/api/devices",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return DeviceListResponseSchema.parse(
        (await context.identity.store.listDevices(identity.user.id)).map((device) =>
          toDeviceView(device),
        ),
      );
    },
  );

  app.post(
    "/api/devices/:deviceId/approve",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const { deviceId } = DeviceParametersSchema.parse(request.params);
      const identity = context.security.getIdentity(request);
      const device = await context.identity.mutateDevice(
        deviceId,
        identity.user.id,
        "approve",
      );
      await context.identity.store.appendAudit({
        eventType: "DEVICE_APPROVED",
        userId: identity.user.id,
        deviceId,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "Owner approved the pending device.",
        requestId: request.id,
      });
      return DeviceMutationResponseSchema.parse({
        success: true,
        device: toDeviceView(device),
      });
    },
  );

  app.post(
    "/api/devices/:deviceId/revoke",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const { deviceId } = DeviceParametersSchema.parse(request.params);
      const identity = context.security.getIdentity(request);
      const device = await context.identity.mutateDevice(
        deviceId,
        identity.user.id,
        "revoke",
      );
      await context.governanceStore.cancelApprovalsForDevice(
        deviceId,
        new Date().toISOString(),
      );
      await context.executionStore.cancelForDevice(deviceId, new Date().toISOString());
      await context.identity.store.appendAudit({
        eventType: "DEVICE_REVOKED",
        userId: identity.user.id,
        deviceId,
        ipAddress: request.ip,
        outcome: "SUCCESS",
        reason: "Owner revoked device trust.",
        requestId: request.id,
      });
      await context.notifications.dispatch({
        ownerId: identity.user.id,
        eventId: `device:${deviceId}:revoked:${device.revokedAt ?? "current"}`,
        category: "DEVICE_EVENT",
        severity: "HIGH",
        objectKind: "DEVICE",
        objectId: deviceId,
        stateVersion: `REVOKED:${device.revokedAt ?? "current"}`,
        title: "Device trust changed",
      }).catch(() => undefined);
      return DeviceMutationResponseSchema.parse({
        success: true,
        device: toDeviceView(device),
      });
    },
  );

  app.post(
    "/api/security/signed-request/verify",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedDevice,
        context.security.verifySignedRequest,
        context.security.inspectNetwork,
      ],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    (request) => {
      const device = context.security.getDevice(request);
      context.security.getEnvelope(request);
      return SignedRequestVerificationResponseSchema.parse({
        verified: true,
        deviceId: device.id,
        networkState: context.security.getNetworkState(request),
        executionAllowed: false,
      });
    },
  );
};
