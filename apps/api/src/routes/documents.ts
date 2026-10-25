import { sensitiveDocument } from "../documents/privacy.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  DocumentCreateSchema,
  DocumentEditSchema,
  DocumentSettingsSchema,
  DocumentUploadSchema,
} from "@alexa-control/shared";
import type { ApiRouteContext } from "./context.js";
import type { DocumentService } from "../documents/service.js";
import { installCompanyRouteGuard } from "./company-guard.js";
import type { TrustedToolContext } from "../universal-tools/gateway.js";
const Params = z.object({ id: z.string().uuid() }).strict();
const PageParams = Params.extend({ page: z.coerce.number().int().min(1).max(5) });
export function registerDocumentRoutes(
  app: FastifyInstance,
  context: ApiRouteContext,
  service: DocumentService | undefined,
) {
  installCompanyRouteGuard(app, "/api/documents", context);
  const read = [
    context.security.requireAuthentication,
    context.companyContext.requireCompany,
  ];
  const mutate = [
    ...read,
    context.security.requireTrustedOrigin,
    context.security.requireCsrf,
    context.security.inspectNetwork,
  ];
  const scope = (r: FastifyRequest) => {
    const s = context.companyContext.get(r);
    if (context.security.getIdentity(r).user.id !== s.ownerId)
      throw Object.assign(Error("Owner required"), { statusCode: 403 });
    return { ownerId: s.ownerId, companyId: s.companyId };
  };
  const runtime = () => {
    if (!service)
      throw Object.assign(
        Error("Document vault requires durable PostgreSQL and private asset storage"),
        { statusCode: 503, code: "DOCUMENTS_UNAVAILABLE" },
      );
    return service;
  };
  const trusted = async (r: FastifyRequest): Promise<TrustedToolContext> => ({
    ...scope(r),
    agentId: null,
    sessionId: context.security.getIdentity(r).session.id,
    requestId: r.id,
    ipAddress: r.ip,
    networkVerification: context.security.getNetworkState(r),
    emergencyStopActive: await context.emergencyStopActive(),
  });
  app.get("/api/documents", { preHandler: read }, async (r) => {
    const q = z
      .object({
        q: z.string().max(200).default(""),
        collection: z
          .enum(["Scans", "Study", "Projects", "Receipts", "Notes", "Other"])
          .optional(),
      })
      .strict()
      .parse(r.query);
    const records = await runtime().store.list(scope(r), q.q, q.collection);
    let semanticStatus = "NOT_REQUESTED";
    if (q.q && runtime().semanticSearch && !sensitiveDocument(q.q)) {
      try {
        const refs = await runtime().semanticSearch!(scope(r), q.q);
        semanticStatus = refs.some((ref) => ref.mode === "vector")
          ? "VECTOR"
          : "LEXICAL_FALLBACK";
        for (const ref of refs) {
          const d = await runtime().store.get(scope(r), ref.id);
          if (
            d &&
            d.stage !== "ARCHIVED" &&
            (!q.collection || d.collection === q.collection) &&
            !records.some((r) => r.id === d.id)
          )
            records.push(d);
        }
      } catch {
        semanticStatus = "UNAVAILABLE";
      }
    }
    return { documents: records.slice(0, 100), semanticStatus };
  });
  app.post("/api/documents/provider-review", { preHandler: mutate }, async (r) => {
    z.object({ confirm: z.literal("REVIEW_LOCAL_DOCUMENT_CAPABILITIES") })
      .strict()
      .parse(r.body);
    const t = await trusted(r),
      providerId = `athena.documents.${scope(r).companyId}`,
      tools = context.universalTools;
    if (!tools) throw Object.assign(Error("Gateway unavailable"), { statusCode: 503 });
    const existing = await tools.store.findProvider(t.ownerId, providerId);
    if (existing && ["REVOKED", "DISABLED"].includes(existing.status))
      throw Object.assign(
        Error("Provider is revoked or disabled; review it in Tools"),
        { statusCode: 409 },
      );
    if (!existing)
      await tools.lifecycle.registerFinite(t, {
        providerId,
        credentialReferenceId: null,
      });
    const registered = (await tools.store.listTools(t.ownerId)).filter(
      (v) => v.providerId === providerId,
    );
    if (registered.length !== 3)
      throw Object.assign(
        Error("Finite provider unavailable until API configuration refresh"),
        { statusCode: 503 },
      );
    for (const tool of registered) {
      if (tool.enabled) continue;
      await tools.lifecycle.review(t, tool.id, tool.schemaDigest);
      await tools.lifecycle.activate(t, tool.id);
    }
    return { status: "ENABLED", providerId };
  });
  app.get("/api/documents/settings", { preHandler: read }, (r) =>
    runtime().store.settings(scope(r)),
  );
  app.patch("/api/documents/settings", { preHandler: mutate }, async (r) => {
    const settings = DocumentSettingsSchema.parse(r.body);
    await runtime().store.saveSettings(scope(r), settings);
    await runtime().event(scope(r), "settings", "SETTINGS_UPDATED");
    return settings;
  });
  app.post("/api/documents", { preHandler: mutate }, (r) =>
    runtime().create(scope(r), DocumentCreateSchema.parse(r.body)),
  );
  app.get("/api/documents/:id", { preHandler: read }, (r) =>
    runtime().require(scope(r), Params.parse(r.params).id),
  );
  app.get("/api/documents/:id/memories", { preHandler: read }, (r) =>
    runtime().linkedMemories(scope(r), Params.parse(r.params).id),
  );
  app.patch("/api/documents/:id", { preHandler: mutate }, async (r) => {
    const { id } = Params.parse(r.params),
      edit = DocumentEditSchema.parse(r.body);
    await runtime().store.atomic(scope(r), id, async (d) => {
      if (d.stage === "ARCHIVED")
        throw Object.assign(Error("Archived document"), { statusCode: 409 });
      Object.assign(d, edit);
      await runtime().event(scope(r), id, "METADATA_UPDATED");
    });
    return runtime().require(scope(r), id);
  });
  app.post("/api/documents/:id/upload-grants", { preHandler: mutate }, (r) =>
    runtime().grants(scope(r), Params.parse(r.params).id),
  );
  app.put(
    "/api/documents/:id/pages/:page",
    { preHandler: mutate, bodyLimit: 8_400_000 },
    (r) => {
      const p = PageParams.parse(r.params),
        body = DocumentUploadSchema.parse(r.body);
      const bytes = Buffer.from(body.base64, "base64");
      if (bytes.toString("base64") !== body.base64)
        throw Object.assign(Error("Invalid image encoding"), { statusCode: 400 });
      return runtime().upload(scope(r), p.id, p.page, body.token, body.mimeType, bytes);
    },
  );
  app.get(
    "/api/documents/:id/pages/:page/:kind",
    { preHandler: read },
    async (r, reply) => {
      const p = PageParams.extend({
        kind: z.enum(["original", "cleaned", "thumbnail"]),
      }).parse(r.params);
      const bytes = await runtime().asset(scope(r), p.id, p.page, p.kind);
      return reply
        .header("Cache-Control", "private, no-store")
        .header("X-Content-Type-Options", "nosniff")
        .type(p.kind === "original" && bytes[0] === 137 ? "image/png" : "image/jpeg")
        .send(bytes);
    },
  );
  app.post("/api/documents/:id/process", { preHandler: mutate }, async (r) =>
    runtime().start(scope(r), Params.parse(r.params).id, await trusted(r)),
  );
  app.post("/api/documents/:id/reprocess", { preHandler: mutate }, async (r) => {
    const { id } = Params.parse(r.params);
    return runtime().start(scope(r), id, await trusted(r), true);
  });
  app.post("/api/documents/:id/memory", { preHandler: mutate }, async (r) => {
    const { id } = Params.parse(r.params);
    await runtime().ingest(scope(r), id);
    return runtime().require(scope(r), id);
  });
  app.post("/api/documents/:id/exclude-memory", { preHandler: mutate }, (r) =>
    runtime().exclude(
      scope(r),
      Params.parse(r.params).id,
      z.object({ never: z.boolean() }).strict().parse(r.body).never,
    ),
  );
  app.delete("/api/documents/:id", { preHandler: mutate }, (r) =>
    runtime().exclude(scope(r), Params.parse(r.params).id, true, true),
  );
  app.get("/api/documents/:id/export", { preHandler: read }, async (r, reply) => {
    const { id } = Params.parse(r.params);
    const d = await runtime().require(scope(r), id);
    if (
      d.sensitive ||
      sensitiveDocument(d.pages.map((p) => p.ocr?.text ?? "").join("\n"))
    )
      throw Object.assign(Error("Sensitive document export denied"), {
        statusCode: 403,
      });
    await runtime().event(scope(r), id, "EXPORTED");
    return reply
      .header("Cache-Control", "no-store")
      .header("Content-Disposition", `attachment; filename="document-${id}.json"`)
      .send({
        document: d,
        assets: d.pages.map((p) => ({
          page: p.number,
          original: `/api/documents/${id}/pages/${p.number}/original`,
          cleaned: `/api/documents/${id}/pages/${p.number}/cleaned`,
        })),
      });
  });
  // Canonical document context for chat: no duplicated image ingestion or model-bound secret text.
  app.get("/api/documents/:id/chat-context", { preHandler: read }, async (r) => {
    const { id } = Params.parse(r.params),
      d = await runtime().require(scope(r), id);
    if (d.sensitive || d.stage !== "COMPLETE")
      throw Object.assign(Error("Document context unavailable"), { statusCode: 409 });
    return {
      documentId: id,
      untrustedSource: true,
      pages: d.pages
        .filter((p) => p.ocrStatus === "COMPLETE")
        .map((p) => ({ page: p.number, text: p.ocr?.text.slice(0, 4000) })),
    };
  });
}
