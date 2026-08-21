import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AIBenchmarkRunModeSchema } from "@alexa-control/shared";
import type { ApiRouteContext } from "./context.js";

const runSchema = z
  .object({
    suiteId: z.string().min(1).max(160),
    mode: AIBenchmarkRunModeSchema.default("DRY_RUN"),
    maxCases: z.number().int().positive().max(1000).optional(),
    paidOptIn: z.boolean().optional(),
    baseline: z.boolean().optional(),
  })
  .strict();

export const registerAIBenchmarkRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/ai/benchmarks/suites",
    { preHandler: [context.security.requireAuthentication] },
    () => context.benchmarkRunner.suites(),
  );
  app.get(
    "/api/ai/benchmarks/runs",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      context.benchmarkRunner.listRuns(context.security.getIdentity(request).user.id),
  );
  app.get(
    "/api/ai/benchmarks/runs/:id",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const id = z.object({ id: z.string().uuid() }).parse(request.params).id;
      const run = await context.benchmarkRunner.getRun(
        context.security.getIdentity(request).user.id,
        id,
      );
      if (!run) throw new Error("BENCHMARK_RUN_NOT_FOUND");
      return run;
    },
  );
  app.get(
    "/api/ai/benchmarks/profiles",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      context.benchmarkRunner.listProfiles(
        context.security.getIdentity(request).user.id,
      ),
  );
  app.get(
    "/api/ai/benchmarks/regressions",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const query = z
        .object({
          baselineId: z.string().uuid().optional(),
          currentId: z.string().uuid().optional(),
        })
        .parse(request.query);
      return context.benchmarkRunner.regressions(
        context.security.getIdentity(request).user.id,
        query.baselineId,
        query.currentId,
      );
    },
  );
  app.post(
    "/api/ai/benchmarks/runs",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const body = runSchema.parse(request.body);
      return context.benchmarkRunner.runSuite(
        context.security.getIdentity(request).user.id,
        body.suiteId,
        body.mode,
        {
          ...(body.maxCases === undefined ? {} : { maxCases: body.maxCases }),
          ...(body.paidOptIn === undefined ? {} : { paidOptIn: body.paidOptIn }),
          ...(body.baseline === undefined ? {} : { baseline: body.baseline }),
        },
      );
    },
  );
};
