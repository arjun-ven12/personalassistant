import { ApiSecurityError } from "../identity/errors.js";
import {
  EngineeringDatasetStatsSchema,
  AthenaCoderControlMutationSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { installCompanyRouteGuard } from "./company-guard.js";
import {
  athenaCoderEngineeringCases,
  pendingAthenaCoderComparison,
} from "../engineering-dataset/benchmark.js";
import type { ApiRouteContext } from "./context.js";

export const registerEngineeringDatasetRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  installCompanyRouteGuard(app, "/api/engineering-dataset", context);
  const read = [
    context.security.requireAuthentication,
    context.companyContext.requireCompany,
  ];
  const mutate = [
    ...read,
    context.security.requireTrustedOrigin,
    context.security.requireCsrf,
    context.security.verifyTransportNetwork,
  ];
  const scope = (request: Parameters<typeof context.companyContext.get>[0]) => {
    const company = context.companyContext.get(request);
    if (context.security.getIdentity(request).user.id !== company.ownerId)
      throw new ApiSecurityError(403, "OWNER_REQUIRED", "Dataset owner required.");
    return company;
  };
  const audit = async (
    request: Parameters<typeof context.companyContext.get>[0],
    action: string,
    key: string,
  ) => {
    const company = scope(request);
    await context.governanceAudit({
      ownerId: company.ownerId,
      companyId: company.companyId,
      eventType: "ENGINEERING_DATASET_UPDATED",
      outcome: "SUCCESS",
      reason: `Engineering dataset ${action}.`,
      metadata: { recordKey: key },
      requestId: request.id,
      ipAddress: request.ip,
    });
  };
  app.get("/api/engineering-dataset", { preHandler: read }, async (request) => {
    const company = scope(request);
    return EngineeringDatasetStatsSchema.parse(
      await context.engineeringDataset.stats(company.ownerId, company.companyId),
    );
  });
  app.get("/api/engineering-dataset/model-control", { preHandler: read }, (request) => {
    const company = scope(request);
    return context.athenaCoderControl.get(company.ownerId);
  });
  app.post(
    "/api/engineering-dataset/model-control",
    { preHandler: mutate },
    async (request) => {
      const company = scope(request);
      const body = AthenaCoderControlMutationSchema.parse(request.body);
      if (body.action !== "DISABLE")
        await context.securityState.consumeGrant(
          context.security.getIdentity(request),
          "athena_coder_control",
        );
      const result = await context.athenaCoderControl.mutate(company.ownerId, body);
      await audit(request, "model control updated", body.action);
      return result;
    },
  );
  app.get(
    "/api/engineering-dataset/benchmarks",
    { preHandler: read },
    async (request) => {
      const company = scope(request);
      return {
        cases: athenaCoderEngineeringCases,
        comparison: pendingAthenaCoderComparison(),
        codex: await context.engineeringDataset.store.list(
          company.ownerId,
          company.companyId,
          "OWNER_BENCHMARK",
        ),
      };
    },
  );
  app.post(
    "/api/engineering-dataset/benchmarks/codex",
    { preHandler: mutate },
    async (request) => {
      const company = scope(request);
      const result = await context.engineeringDataset.recordOwnerBenchmark(
        company.ownerId,
        company.companyId,
        request.body,
      );
      await audit(request, "owner benchmark recorded", result.key);
      return result;
    },
  );
  app.post(
    "/api/engineering-dataset/benchmarks/start",
    { preHandler: mutate },
    async (request) => {
      const company = scope(request);
      return context.engineeringCoderBenchmark.start(
        {
          ...company,
          requestId: request.id,
          ipAddress: request.ip,
          sessionId: context.security.getIdentity(request).session.id,
          networkState: context.security.getNetworkState(request),
        },
        request.body,
      );
    },
  );
  app.get(
    "/api/engineering-dataset/benchmarks/:deliveryId",
    { preHandler: read },
    async (request) => {
      const company = scope(request);
      const params = z
        .object({ deliveryId: z.string().uuid() })
        .strict()
        .parse(request.params);
      return context.engineeringCoderBenchmark.observe(
        company.ownerId,
        company.companyId,
        params.deliveryId,
      );
    },
  );
  app.post(
    "/api/engineering-dataset/policy",
    { preHandler: mutate },
    async (request) => {
      const company = scope(request);
      const body = z
        .object({
          repositoryId: z.string().uuid(),
          scope: z.enum(["EXCLUDED", "COMPANY_PRIVATE", "ATHENA_INTERNAL"]),
        })
        .strict()
        .parse(request.body);
      await context.securityState.consumeGrant(
        context.security.getIdentity(request),
        "engineering_dataset_policy",
      );
      const result = await context.engineeringDataset.setPolicy(
        company.ownerId,
        company.companyId,
        body.repositoryId,
        body.scope,
      );
      await audit(request, "policy changed", body.repositoryId);
      return result;
    },
  );
  app.post(
    "/api/engineering-dataset/snapshots",
    { preHandler: mutate },
    async (request) => {
      const company = scope(request);
      const body = z
        .object({ version: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/) })
        .strict()
        .parse(request.body);
      const result = await context.engineeringDataset.freeze(
        company.ownerId,
        company.companyId,
        body.version,
      );
      await audit(request, "snapshot frozen", body.version);
      return result;
    },
  );
  app.post(
    "/api/engineering-dataset/export",
    { preHandler: mutate },
    async (request, reply) => {
      const company = scope(request);
      const body = z
        .object({ version: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/) })
        .strict()
        .parse(request.body);
      await context.securityState.consumeGrant(
        context.security.getIdentity(request),
        "engineering_dataset_export",
      );
      const result = await context.engineeringDataset.exportJsonl(
        company.ownerId,
        company.companyId,
        body.version,
      );
      await audit(request, "snapshot exported", body.version);
      reply.header("Cache-Control", "no-store");
      return result;
    },
  );
  app.post(
    "/api/engineering-dataset/exclude",
    { preHandler: mutate },
    async (request) => {
      const company = scope(request);
      const body = z
        .object({ exampleKey: z.string().regex(/^[a-f0-9]{64}$/) })
        .strict()
        .parse(request.body);
      const result = await context.engineeringDataset.exclude(
        company.ownerId,
        company.companyId,
        body.exampleKey,
      );
      await audit(request, "example excluded", body.exampleKey);
      return result;
    },
  );
};
