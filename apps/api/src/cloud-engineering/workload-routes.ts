import { readCloudEngineeringTelemetry } from "./telemetry.js";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { Readable, Transform } from "node:stream";
import { z } from "zod";
import { SignedCommandEnvelopeSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { verifyEnvelopeSignature } from "../identity/crypto.js";
import type { ApiRouteContext } from "../routes/context.js";
import type { WorkspaceProvisioningService } from "./provisioning.js";
const boundedGitStream = (body: ReadableStream<Uint8Array> | null) => {
  if (!body) throw Error("Governed Git response unavailable.");
  let bytes = 0;
  return Readable.fromWeb(body as NodeReadableStream).pipe(
    new Transform({
      transform(chunk: Buffer, _encoding, done) {
        bytes += chunk.length;
        done(
          bytes > 67_108_864
            ? Error("Governed Git response exceeded its limit.")
            : null,
          bytes > 67_108_864 ? undefined : chunk,
        );
      },
    }),
  );
};
const Params = z.object({ workspaceId: z.string().uuid() }).strict();
const Operation = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("repository_ready"),
      head: z.string().regex(/^[a-f0-9]{40}$/),
    })
    .strict(),
  z.object({ operation: z.literal("heartbeat") }).strict(),
  z
    .object({
      operation: z.literal("failure"),
      code: z.enum(["REPO_FAILED", "DEPENDENCY_FAILED", "PREVIEW_FAILED"]),
    })
    .strict(),
]);
/** Workload bootstrap + finite repo fetch, not a second Engineering executor. */
export function registerCloudWorkloadRoutes(
  app: FastifyInstance,
  context: ApiRouteContext,
  services: WorkspaceProvisioningService[],
) {
  const serviceFor = async (workspaceId: string) => {
    for (const service of services) {
      const v = await service.store.find(
        service.config.ownerId,
        service.config.companyId,
        workspaceId,
      );
      if (v) return { service, value: v };
    }
    throw Error("Scoped workload unavailable.");
  };
  app.post(
    "/api/cloud-workloads/:workspaceId/authenticate",
    {
      bodyLimit: 8192,
      preHandler: [context.security.verifyTransportNetwork],
      config: { rateLimit: { max: 6, timeWindow: "1 minute" } },
    },
    async (request) => {
      const { workspaceId } = Params.parse(request.params);
      const { service } = await serviceFor(workspaceId);
      const token = z
        .string()
        .regex(/^Bearer [A-Za-z0-9_-]{43}$/)
        .parse(request.headers.authorization)
        .slice(7);
      const body = z
        .object({ workspaceId: z.literal(workspaceId) })
        .passthrough()
        .parse(request.body);
      const result = await service.authenticate(body, token);
      return {
        workerId: result.workerId,
        state: result.state,
        expiresAt: result.expiresAt,
      };
    },
  );
  app.post(
    "/api/cloud-workloads/:workspaceId/lifecycle",
    { bodyLimit: 8192, preHandler: [context.security.verifyTransportNetwork] },
    async (request) => {
      const { workspaceId } = Params.parse(request.params);
      const { service, value } = await serviceFor(workspaceId);
      const e = SignedCommandEnvelopeSchema.parse(request.body);
      const device = await context.identity.store.findDeviceById(e.deviceId);
      const now = service.now();
      if (
        !device ||
        e.deviceId !== value.workerId ||
        device.ownerId !== value.ownerId ||
        device.deviceType !== "CLOUD_WORKER" ||
        !["PENDING", "TRUSTED"].includes(device.trustStatus) ||
        device.metadata.companyId !== value.companyId ||
        device.metadata.repositoryId !== value.repositoryId ||
        device.metadata.workspaceLocatorId !== value.workspaceLocatorId ||
        device.metadata.generation !== value.generation ||
        device.metadata.cloudWorkspaceId !== value.id ||
        Date.parse(value.expiresAt) <= now.getTime() ||
        Date.parse(e.expiresAt) <= now.getTime() ||
        Date.parse(e.expiresAt) - Date.parse(e.issuedAt) > 30_000 ||
        Math.abs(now.getTime() - Date.parse(e.issuedAt)) > 30_000 ||
        !(await verifyEnvelopeSignature(device.publicKey, e))
      )
        throw Error("Workload lifecycle signature or scope denied.");
      if (
        !(await context.identity.store.consumeNonce(
          device.id,
          e.nonce,
          new Date(e.expiresAt),
          now,
        ))
      )
        throw Error("Workload lifecycle replay denied.");
      if (await context.emergencyStopActive()) throw Error("Emergency stop is active.");
      const op = Operation.parse(e.payload);
      const result =
        op.operation === "repository_ready"
          ? await service.repositoryReady(value, op.head)
          : op.operation === "heartbeat"
            ? await service.heartbeat(value)
            : await service.update(value, {
                state: "FAILED",
                failure: op.code,
                bootstrapHash: null,
              });
      if (op.operation === "failure") await service.revokeWorker(value);
      return { state: result.state, expiresAt: result.expiresAt };
    },
  );
  app.register((git, _options, done) => {
    git.addContentTypeParser(
      "application/x-git-upload-pack-request",
      { parseAs: "buffer", bodyLimit: 1_048_576 },
      (_request, body, done) => done(null, body),
    );
    const authorize = async (raw: unknown, header: unknown) => {
      const { workspaceId } = Params.parse(raw);
      const { service } = await serviceFor(workspaceId);
      const auth = z
        .string()
        .max(300)
        .regex(/^Basic [A-Za-z0-9+/=]+$/)
        .parse(header);
      const [worker, token, extra] = Buffer.from(auth.slice(6), "base64")
        .toString("utf8")
        .split(":");
      if (extra || !worker || !token) throw Error("Workload Git credential denied.");
      const value = await service.bootstrapCredential(workspaceId, token);
      if (!value.authenticatedAt || value.workerId !== worker)
        throw Error("Workload Git identity denied.");
      const registration = (
        await service.github.store.list(value.ownerId, value.companyId)
      ).find((v) => v.id === value.registrationId);
      if (!registration || registration.engineeringRepositoryId !== value.repositoryId)
        throw Error("Workload Git repository denied.");
      return { service, value, registration };
    };
    git.get(
      "/api/cloud-workloads/:workspaceId/git/info/refs",
      { preHandler: [context.security.verifyTransportNetwork] },
      async (request, reply) => {
        z.object({ service: z.literal("git-upload-pack") })
          .strict()
          .parse(request.query);
        const { service, value, registration } = await authorize(
          request.params,
          request.headers.authorization,
        );
        const remote = await service.github.readGit(
          value.ownerId,
          value.companyId,
          registration.repository.providerRepositoryId,
          "refs",
        );
        reply.header("content-type", "application/x-git-upload-pack-advertisement");
        reply.header("cache-control", "no-store");
        return reply.send(boundedGitStream(remote.body));
      },
    );
    git.post(
      "/api/cloud-workloads/:workspaceId/git/git-upload-pack",
      { bodyLimit: 1_048_576, preHandler: [context.security.verifyTransportNetwork] },
      async (request, reply) => {
        const { service, value, registration } = await authorize(
          request.params,
          request.headers.authorization,
        );
        if (!Buffer.isBuffer(request.body)) throw Error("Git protocol body denied.");
        const remote = await service.github.readGit(
          value.ownerId,
          value.companyId,
          registration.repository.providerRepositoryId,
          "upload-pack",
          request.body,
        );
        reply.header("content-type", "application/x-git-upload-pack-result");
        reply.header("cache-control", "no-store");
        return reply.send(boundedGitStream(remote.body));
      },
    );
    done();
  });
  app.get(
    "/api/cloud-workspaces/:workspaceId/telemetry/:deliveryId",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.companyContext.requireCompany,
      ],
    },
    async (request) => {
      const params = z
        .object({ workspaceId: z.string().uuid(), deliveryId: z.string().uuid() })
        .strict()
        .parse(request.params);
      const { service, value } = await serviceFor(params.workspaceId);
      const company = context.companyContext.get(request);
      if (
        company.ownerId !== service.config.ownerId ||
        company.companyId !== service.config.companyId
      )
        throw Error("Workspace telemetry access denied.");
      return readCloudEngineeringTelemetry(context, value, params.deliveryId);
    },
  );
  app.get(
    "/api/cloud-workspaces/:workspaceId",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.companyContext.requireCompany,
      ],
    },
    async (request) => {
      const { workspaceId } = Params.parse(request.params);
      const { service } = await serviceFor(workspaceId);
      const company = context.companyContext.get(request);
      if (
        company.ownerId !== service.config.ownerId ||
        company.companyId !== service.config.companyId
      )
        throw Error("Workspace access denied.");
      const v = await service.store.find(
        company.ownerId,
        company.companyId,
        workspaceId,
      );
      if (!v) throw Error("Workspace unavailable.");
      const { bootstrapHash: _hash, ...view } = v;
      void _hash;
      return view;
    },
  );
}
