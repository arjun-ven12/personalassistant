import type { CompanyContext } from "@alexa-control/shared";
import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import type { SecurityMiddleware } from "../identity/security.js";
import type { CompanyService } from "./service.js";
import { companyScope } from "./scope.js";
import { AlexaTelemetryAttributes, type TelemetrySink } from "../telemetry/service.js";

const CompanyHeaderSchema = z.string().uuid().optional();

export class CompanyContextResolver {
  readonly #contexts = new WeakMap<FastifyRequest, CompanyContext>();

  constructor(readonly companies: CompanyService, readonly security: SecurityMiddleware, readonly telemetry: TelemetrySink) {}

  readonly requireCompany: preHandlerHookHandler = (request, _reply, done) => {
    void this.resolveRequest(request).then(
      (context) => companyScope.run(context, done),
      (error: unknown) => done(error as Error),
    );
  };

  private async resolveRequest(request: FastifyRequest) {
    const requested = CompanyHeaderSchema.parse(request.headers["x-company-id"]);
    const identity = this.security.getIdentity(request);
    const context = await this.telemetry.withSpan("alexa.company.resolve", {
      [AlexaTelemetryAttributes.ownerId]: identity.user.id,
      [AlexaTelemetryAttributes.requestId]: request.id,
      ...(requested ? { [AlexaTelemetryAttributes.companyId]: requested } : {}),
    }, () => this.companies.resolve(identity, requested, request.id));
    this.#contexts.set(request, context);
    return context;
  }

  get(request: FastifyRequest) {
    const context = this.#contexts.get(request);
    if (!context) throw new Error("Company context was not resolved for this request.");
    return context;
  }
}
