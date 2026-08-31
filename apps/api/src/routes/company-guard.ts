import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";

export const installCompanyRouteGuard = (
  app: FastifyInstance,
  prefix: string,
  context: ApiRouteContext,
  excludedPrefixes: string[] = [],
) => {
  app.addHook("preHandler", (request, reply, done) => {
    const path = request.url.split("?", 1)[0] ?? request.url;
    if (path !== prefix && !path.startsWith(`${prefix}/`)) return done();
    if (excludedPrefixes.some((excluded) => path.startsWith(excluded))) return done();
    void Promise.resolve(context.security.requireAuthentication.call(app, request, reply, () => undefined)).then(
      () => {
        if (reply.sent) done();
        else context.companyContext.requireCompany.call(app, request, reply, done);
      },
      (error: unknown) => done(error as Error),
    );
  });
};
