import {
  CrossDeviceClientInstanceSchema,
  CrossDeviceClientListResponseSchema,
  CrossDeviceCommandReceiptRequestSchema,
  CrossDeviceCommandSchema,
  CrossDeviceHeartbeatRequestSchema,
  CrossDevicePollRequestSchema,
  CrossDevicePollResponseSchema,
  CrossDeviceUtteranceRequestSchema,
  CrossDeviceUtteranceResponseSchema,
  RegisterCrossDeviceClientRequestSchema,
  SignedCommandEnvelopeSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";
import { authenticateTrustedDeviceEnvelope } from "./voice.js";
import { ExecutionError } from "../execution/errors.js";

const CommandParametersSchema = z.object({ commandId: z.string().uuid() }).strict();
const ANDROID_DEVICE_TYPES = new Set<string>(["ANDROID"]);
const AndroidCrossDevicePayloadSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("register"), request: RegisterCrossDeviceClientRequestSchema }).strict(),
  z.object({ operation: z.literal("heartbeat"), request: CrossDeviceHeartbeatRequestSchema }).strict(),
  z.object({ operation: z.literal("poll"), request: CrossDevicePollRequestSchema }).strict(),
  z.object({ operation: z.literal("receipt"), request: CrossDeviceCommandReceiptRequestSchema }).strict(),
  z.object({ operation: z.literal("utterance"), request: CrossDeviceUtteranceRequestSchema }).strict(),
  z.object({ operation: z.literal("status"), commandId: z.string().uuid() }).strict(),
]);

const webMutationGuards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
  context.security.inspectNetwork,
];

export const registerCrossDeviceRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  app.post(
    "/api/cross-device/clients",
    { preHandler: webMutationGuards(context), config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const body = RegisterCrossDeviceClientRequestSchema.parse(request.body);
      if (body.clientType !== "WEB")
        throw new ExecutionError(403, "CLIENT_TYPE_FORBIDDEN", "Web sessions may register WEB client instances only.");
      return CrossDeviceClientInstanceSchema.parse(await context.crossDevice.registerClient({
        ownerId: identity.user.id,
        sessionId: identity.session.id,
        body,
        requestId: request.id,
        ipAddress: request.ip,
      }));
    },
  );

  app.post(
    "/api/cross-device/heartbeat",
    { preHandler: webMutationGuards(context), config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CrossDeviceClientInstanceSchema.parse(await context.crossDevice.heartbeat({
        ownerId: identity.user.id,
        sessionId: identity.session.id,
        body: CrossDeviceHeartbeatRequestSchema.parse(request.body),
        requestId: request.id,
        ipAddress: request.ip,
      }));
    },
  );

  app.post(
    "/api/cross-device/commands",
    { preHandler: webMutationGuards(context), config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CrossDeviceUtteranceResponseSchema.parse(await context.crossDevice.routeUtterance({
        ownerId: identity.user.id,
        sessionId: identity.session.id,
        body: CrossDeviceUtteranceRequestSchema.parse(request.body),
        requestId: request.id,
        ipAddress: request.ip,
        networkState: context.security.getNetworkState(request),
      }));
    },
  );

  app.post(
    "/api/cross-device/poll",
    { preHandler: webMutationGuards(context), config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CrossDevicePollResponseSchema.parse(await context.crossDevice.poll({
        ownerId: identity.user.id,
        sessionId: identity.session.id,
        body: CrossDevicePollRequestSchema.parse(request.body),
        requestId: request.id,
        ipAddress: request.ip,
      }));
    },
  );

  app.post(
    "/api/cross-device/receipts",
    { preHandler: webMutationGuards(context), config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CrossDeviceCommandSchema.parse(await context.crossDevice.receipt({
        ownerId: identity.user.id,
        sessionId: identity.session.id,
        body: CrossDeviceCommandReceiptRequestSchema.parse(request.body),
        requestId: request.id,
        ipAddress: request.ip,
      }));
    },
  );

  app.get(
    "/api/cross-device/commands/:commandId",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { commandId } = CommandParametersSchema.parse(request.params);
      return CrossDeviceCommandSchema.parse(await context.crossDevice.status(identity.user.id, commandId, {
        requestId: request.id,
        ipAddress: request.ip,
      }));
    },
  );

  app.get(
    "/api/cross-device/clients",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return CrossDeviceClientListResponseSchema.parse({
        clients: await context.crossDevice.listClients(identity.user.id),
        serverTime: new Date().toISOString(),
      });
    },
  );

  app.post(
    "/api/v1/device/cross-device",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request) => {
      const { device, envelope, network } = await authenticateTrustedDeviceEnvelope(request, context, ANDROID_DEVICE_TYPES);
      const payload = AndroidCrossDevicePayloadSchema.parse(SignedCommandEnvelopeSchema.parse(envelope).payload);
      const common = {
        ownerId: device.ownerId,
        sessionId: device.id,
        trustedDeviceId: device.id,
        requestId: envelope.commandId,
        ipAddress: request.ip,
      };
      if (payload.operation === "register") {
        if (payload.request.clientType !== "ANDROID")
          throw new ExecutionError(403, "CLIENT_TYPE_FORBIDDEN", "Trusted Android devices may register ANDROID clients only.");
        return CrossDeviceClientInstanceSchema.parse(await context.crossDevice.registerClient({ ...common, body: payload.request }));
      }
      if (payload.operation === "heartbeat")
        return CrossDeviceClientInstanceSchema.parse(await context.crossDevice.heartbeat({ ...common, body: payload.request }));
      if (payload.operation === "poll")
        return CrossDevicePollResponseSchema.parse(await context.crossDevice.poll({ ...common, body: payload.request }));
      if (payload.operation === "receipt")
        return CrossDeviceCommandSchema.parse(await context.crossDevice.receipt({ ...common, body: payload.request }));
      if (payload.operation === "status")
        return CrossDeviceCommandSchema.parse(await context.crossDevice.status(device.ownerId, payload.commandId, {
          requestId: envelope.commandId,
          ipAddress: request.ip,
        }));
      return CrossDeviceUtteranceResponseSchema.parse(await context.crossDevice.routeUtterance({
        ...common,
        sourceDeviceId: device.id,
        body: payload.request,
        networkState: network.state,
      }));
    },
  );
};
