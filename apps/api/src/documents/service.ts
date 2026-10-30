import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  DocumentCreateSchema,
  DocumentRecordSchema,
  DocumentMemoriesSchema,
  type DocumentRecord,
  type DocumentScope,
} from "@alexa-control/shared";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { MemoryIndexerService } from "../memory/service.js";
import type {
  TrustedToolContext,
  UniversalToolGateway,
} from "../universal-tools/gateway.js";
import { companyScope } from "../companies/scope.js";
import type { DocumentStore } from "./store.js";
import type { PrivateDocumentAssets } from "./assets.js";
import { validateDocumentImage } from "./providers.js";
import { searchableDocumentPdf } from "./pdf.js";
import { sensitiveDocument } from "./privacy.js";
export const sha = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const deny = (code: string, statusCode = 409) =>
  Object.assign(Error(code), { code, statusCode });
export type DocumentWork = {
  cleaned?: { bytes: Buffer; thumbnail: Buffer; warnings: string[] };
  ocr?: DocumentRecord["pages"][number]["ocr"];
  classification?: Pick<
    DocumentRecord,
    "sensitive" | "documentType" | "title" | "summary" | "tags" | "understanding"
  >;
};
export class DocumentService {
  private readonly active = new Set<string>();
  semanticIndex?: (scope: DocumentScope, doc: DocumentRecord) => Promise<string[]>;
  semanticExclude?: (scope: DocumentScope, ids: string[]) => Promise<void>;
  semanticSearch?: (
    scope: DocumentScope,
    query: string,
  ) => Promise<Array<{ id: string; mode: string }>>;
  explainText?: (scope: DocumentScope, text: string) => Promise<string>;
  gateway: Pick<UniversalToolGateway, "select" | "invoke"> | undefined;
  // Scratch is bounded, private and never persisted in Gateway receipts/model context.
  private readonly scratch = new Map<
    string,
    { scope: DocumentScope; until: number; result: DocumentWork }
  >();
  constructor(
    readonly store: DocumentStore,
    readonly assets: PrivateDocumentAssets,
    readonly memory: MemoryIndexerService,
    readonly audit: GovernanceAuditWriter,
  ) {}
  async chat(ownerId: string, text: string) {
    const match = /^explain document ([a-f0-9-]{36})[.!?]?$/i.exec(text.trim());
    if (!match) return null;
    const companyId = companyScope.companyId(ownerId);
    if (!companyId) throw deny("DOCUMENT_SCOPE_DENIED", 403);
    const d = await this.require({ ownerId, companyId }, match[1]!);
    const raw = d.pages.map((p) => `Page ${p.number}: ${p.ocr?.text ?? ""}`).join("\n");
    if (d.sensitive || sensitiveDocument(raw))
      return "This document is private or sensitive. Open Documents to review it; it was not sent to a model.";
    if (d.stage !== "COMPLETE" || d.pages.some((p) => p.ocrStatus !== "COMPLETE"))
      return "The document has not completed text extraction. Retry OCR in Documents before asking for an explanation.";
    if (d.pages.some((p) => (p.ocr?.confidence ?? 0) < 0.65))
      return "OCR confidence is too low for model context. Review the source and retry extraction.";
    if (!this.explainText)
      return "A reviewed explanation model is unavailable. The scan and OCR remain saved in Documents.";
    const answer = await this.explainText(
      { ownerId, companyId },
      d.pages.map((p) => `Page ${p.number}: ${p.ocr!.text.slice(0, 2000)}`).join("\n"),
    );
    await this.event({ ownerId, companyId }, d.id, "CHAT_REFERENCED");
    return `${answer}\nSource: document ${d.id}, pages ${d.pages.map((p) => p.number).join(", ")}. OCR may contain errors; review the scan.`;
  }
  async event(s: DocumentScope, id: string, action: string) {
    await this.audit({
      ...s,
      eventType: "DOCUMENT_UPDATED",
      outcome: "SUCCESS",
      reason: `Document ${action}.`,
      metadata: { documentId: id },
      requestId: "document-vault",
      ipAddress: "internal",
    });
  }
  async require(s: DocumentScope, id: string, archived = false) {
    const d = await this.store.get(s, id);
    if (!d || (!archived && d.stage === "ARCHIVED"))
      throw deny("DOCUMENT_NOT_FOUND", 404);
    return d;
  }
  async create(s: DocumentScope, raw: unknown) {
    return this.store.database.transaction(
      `document-create:${s.ownerId}:${s.companyId}`,
      async () => {
        const input = DocumentCreateSchema.parse(raw),
          at = new Date().toISOString();
        const existing = await this.store.database.pool.query<{ record: unknown }>(
          "SELECT record FROM athena_documents WHERE owner_id=$1 AND company_id=$2 AND idempotency_key=$3",
          [s.ownerId, s.companyId, input.idempotencyKey],
        );
        if (existing.rows[0]) {
          const d = DocumentRecordSchema.parse(existing.rows[0].record);
          if (
            d.pages.length !== input.pageCount ||
            d.sourceType !== input.sourceType ||
            (input.pageEdits &&
              JSON.stringify(d.pages.map((p) => p.edit ?? { rotation: 0, crop: null })) !==
                JSON.stringify(input.pageEdits)) ||
            d.stage === "ARCHIVED"
          )
            throw deny("DOCUMENT_IDEMPOTENCY_CONFLICT");
          return d;
        }
        const quota = await this.store.database.pool.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM athena_documents WHERE owner_id=$1 AND company_id=$2",
          [s.ownerId, s.companyId],
        );
        if (Number(quota.rows[0]?.count) >= 100)
          throw deny("DOCUMENT_COMPANY_QUOTA", 429);
        if (input.pageEdits && input.pageEdits.length !== input.pageCount)
          throw deny("DOCUMENT_PAGE_EDITS_INVALID", 400);
        const d = DocumentRecordSchema.parse({
          ...s,
          id: crypto.randomUUID(),
          idempotencyKey: input.idempotencyKey,
          sourceType: input.sourceType,
          title: "Untitled scan",
          documentType: "UNKNOWN",
          collection: "Scans",
          tags: [],
          summary: "",
          stage: "UPLOADING",
          pages: Array.from({ length: input.pageCount }, (_, i) => ({
            number: i + 1,
            edit: input.pageEdits?.[i],
            original: null,
            originalDigest: null,
            cleaned: null,
            thumbnail: null,
            ocr: null,
            ocrStatus: "PENDING",
            warnings: [],
            memoryIds: [],
          })),
          memoryStatus: "OFF",
          neverMemory: false,
          sensitive: false,
          version: 1,
          attempt: 0,
          leaseUntil: null,
          errorCode: null,
          createdAt: at,
          updatedAt: at,
        });
        // pageCount is input-only; omit before strict record validation.
        return this.store.create(d);
      },
    );
  }
  async grants(s: DocumentScope, id: string) {
    return this.store.atomic(s, id, async (d) => {
      if (d.stage !== "UPLOADING") throw deny("UPLOAD_CLOSED");
      const grants = [];
      for (const p of d.pages) {
        const token = randomBytes(32).toString("hex"),
          expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
        await this.store.database.pool.query(
          "INSERT INTO athena_document_upload_grants(owner_id,company_id,document_id,page,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_id,company_id,document_id,page) DO UPDATE SET token_hash=$5,expires_at=$6",
          [s.ownerId, s.companyId, id, p.number, sha(token), expiresAt],
        );
        grants.push({ documentId: id, page: p.number, token, expiresAt });
      }
      return grants;
    });
  }
  async upload(
    s: DocumentScope,
    id: string,
    page: number,
    token: string,
    mime: string,
    bytes: Buffer,
  ) {
    await validateDocumentImage(bytes, mime);
    await this.store.atomic(s, id, async (d) => {
      const p = d.pages[page - 1];
      if (!p || d.stage !== "UPLOADING") throw deny("UPLOAD_CLOSED");
      const r = await this.store.database.pool.query<{
        token_hash: string;
        valid: boolean;
      }>(
        "SELECT token_hash,expires_at>now() AS valid FROM athena_document_upload_grants WHERE owner_id=$1 AND company_id=$2 AND document_id=$3 AND page=$4",
        [s.ownerId, s.companyId, id, page],
      );
      const grant = r.rows[0];
      if (
        !grant?.valid ||
        !timingSafeEqual(Buffer.from(grant.token_hash), Buffer.from(sha(token)))
      )
        throw deny("UPLOAD_GRANT_DENIED", 403);
      const hash = sha(bytes);
      if (p.original) {
        if (p.originalDigest !== hash) throw deny("UPLOAD_PAGE_CONFLICT");
        return;
      }
      p.original = await this.assets.put(s, bytes);
      p.originalDigest = hash;
      await this.event(s, id, "PAGE_SAVED");
    });
    return this.require(s, id);
  }
  async asset(
    s: DocumentScope,
    id: string,
    page: number,
    kind: "original" | "cleaned" | "thumbnail",
  ) {
    const d = await this.require(s, id);
    const ref = d.pages[page - 1]?.[kind];
    if (!ref) throw deny("DOCUMENT_ASSET_NOT_FOUND", 404);
    return this.assets.read(s, ref);
  }
  async pdf(s: DocumentScope, id: string) {
    const d = await this.require(s, id);
    if (d.stage !== "COMPLETE" || !d.pdf) throw deny("PDF_NOT_READY");
    // Preserve the existing conservative sensitive-export policy.
    if (
      d.sensitive ||
      sensitiveDocument(d.pages.map((p) => p.ocr?.text ?? "").join("\n"))
    )
      throw deny("DOCUMENT_EXPORT_DENIED", 403);
    const bytes = await this.assets.read(s, d.pdf, "pdf");
    // Recheck archival and generation changes after the asset read.
    const current = await this.require(s, id);
    if (current.pdf !== d.pdf || current.stage !== "COMPLETE")
      throw deny("PDF_NOT_READY");
    await this.event(s, id, "PDF_EXPORTED");
    return bytes;
  }
  async linkedMemories(s: DocumentScope, id: string) {
    if (companyScope.companyId(s.ownerId) !== s.companyId)
      throw deny("DOCUMENT_MEMORY_SCOPE_DENIED", 403);
    const document = await this.require(s, id);
    const memories = [];
    for (const page of document.pages)
      for (const memoryId of page.memoryIds) {
        const memory = await this.memory.store.findMemory(s.ownerId, memoryId);
        if (
          memory &&
          !memory.tags.includes("document-excluded") &&
          memory.tags.includes(`document:${id}`)
        )
          memories.push({
            id: memory.id,
            title: memory.title,
            summary: memory.summary,
            page: page.number,
          });
      }
    return DocumentMemoriesSchema.parse({ documentId: id, memories });
  }
  stash(s: DocumentScope, result: DocumentWork) {
    for (const [k, v] of this.scratch) if (v.until < Date.now()) this.scratch.delete(k);
    if (this.scratch.size >= 8) throw deny("DOCUMENT_WORK_BUSY", 429);
    const id = crypto.randomUUID();
    this.scratch.set(id, { scope: s, result, until: Date.now() + 60_000 });
    const expiry = setTimeout(() => this.scratch.delete(id), 60_000);
    expiry.unref();
    return id;
  }
  private take(s: DocumentScope, id: string) {
    const entry = this.scratch.get(id);
    this.scratch.delete(id);
    if (
      !entry ||
      entry.scope.ownerId !== s.ownerId ||
      entry.scope.companyId !== s.companyId ||
      entry.until < Date.now()
    )
      throw deny("DOCUMENT_WORK_EXPIRED");
    return entry.result;
  }
  private async tool(
    context: TrustedToolContext,
    category: string,
    args: { documentId: string; page: number },
  ) {
    if (!this.gateway || !context.companyId)
      throw deny("DOCUMENT_PROVIDER_UNAVAILABLE", 503);
    const candidates = await this.gateway.select(context, category, 10);
    const tool = candidates.find(
      (t) => t.providerId === `athena.documents.${context.companyId}`,
    );
    if (!tool) throw deny("DOCUMENT_PROVIDER_REVIEW_REQUIRED", 503);
    const result = await this.gateway.invoke(context, {
      invocationId: crypto.randomUUID(),
      toolId: tool.id,
      arguments: args,
      idempotencyKey: null,
      approvalId: null,
      requestedAt: new Date().toISOString(),
    });
    if (result.status !== "SUCCEEDED")
      throw deny("DOCUMENT_PROVIDER_" + (result.failureCode ?? result.status), 503);
    const { DocumentWorkOutputSchema } = await import("./tools.js");
    return this.take(
      { ownerId: context.ownerId, companyId: context.companyId },
      DocumentWorkOutputSchema.parse(result.structuredOutput).resultId,
    );
  }
  async start(
    s: DocumentScope,
    id: string,
    context: TrustedToolContext,
    reprocess = false,
  ) {
    await this.require(s, id);
    const key = s.ownerId + ":" + s.companyId + ":" + id;
    if (this.active.has(key)) return this.require(s, id);
    if (this.active.size >= 4) throw deny("DOCUMENT_QUEUE_BUSY", 429);
    if (reprocess) await this.reprocess(s, id);
    this.active.add(key);
    void this.process(s, id, context)
      .catch(() => undefined)
      .finally(() => this.active.delete(key));
    return this.require(s, id);
  }
  async process(s: DocumentScope, id: string, context: TrustedToolContext) {
    const settings = await this.store.settings(s);
    let attempt = 0;
    const started = await this.store.atomic(s, id, async (d) => {
      if (d.stage === "ARCHIVED") throw deny("DOCUMENT_ARCHIVED");
      if (d.leaseUntil && Date.parse(d.leaseUntil) > Date.now())
        throw deny("DOCUMENT_PROCESSING_BUSY");
      if (d.stage === "COMPLETE") return false;
      if (d.pages.some((p) => !p.original)) throw deny("DOCUMENT_UPLOAD_INCOMPLETE");
      if (d.attempt >= 10) throw deny("DOCUMENT_REPROCESS_LIMIT");
      d.attempt++;
      attempt = d.attempt;
      d.leaseUntil = new Date(Date.now() + 300_000).toISOString();
      d.stage = "PROCESSING_IMAGE";
      d.errorCode = null;
      await this.event(s, id, "PROCESSING_STARTED");
      return true;
    });
    if (!started) return this.require(s, id);
    const update = async (fn: (d: DocumentRecord) => void | Promise<void>) =>
      this.store.atomic(s, id, async (d) => {
        if (d.stage === "ARCHIVED" || d.attempt !== attempt)
          throw deny("DOCUMENT_PROCESSING_FENCED");
        await fn(d);
      });
    try {
      const doc = await this.require(s, id);
      for (const page of doc.pages) {
        await update((d) => {
          d.stage = "PROCESSING_IMAGE";
        });
        const cleaned = await this.tool(context, "document.scan.process", {
          documentId: id,
          page: page.number,
        });
        if (!cleaned.cleaned) throw deny("DOCUMENT_CLEAN_FAILED");
        const cleanRef = await this.assets.put(s, cleaned.cleaned.bytes),
          thumb = await this.assets.put(s, cleaned.cleaned.thumbnail);
        await update((d) => {
          const p = d.pages[page.number - 1]!;
          p.cleaned = cleanRef;
          p.thumbnail = thumb;
          p.warnings = cleaned.cleaned!.warnings;
          p.ocrStatus = settings.autoOcr ? "PENDING" : "DISABLED";
          d.stage = "EXTRACTING_TEXT";
        });
        if (settings.autoOcr)
          try {
            const result = await this.tool(context, "document.ocr", {
              documentId: id,
              page: page.number,
            });
            if (!result.ocr) throw Error("OCR_EMPTY");
            await update(async (d) => {
              const p = d.pages[page.number - 1]!;
              await this.store.database.pool.query(
                "INSERT INTO athena_document_ocr_runs(owner_id,company_id,document_id,page,attempt,record) VALUES($1,$2,$3,$4,$5,$6)",
                [
                  s.ownerId,
                  s.companyId,
                  id,
                  page.number,
                  attempt,
                  {
                    sourceAsset: p.cleaned ?? p.original,
                    originalAsset: p.original,
                    sourceDigest: p.originalDigest,
                    result: result.ocr,
                  },
                ],
              );
              p.ocr = result.ocr!;
              p.ocrStatus = "COMPLETE";
              if ((result.ocr!.confidence ?? 0) < 0.65 || !result.ocr!.text.trim())
                p.warnings.push(
                  "OCR confidence is low; check the source page before using text.",
                );
            });
          } catch {
            await update((d) => {
              d.pages[page.number - 1]!.ocrStatus = "OCR_FAILED";
            });
          }
      }
      await update((d) => {
        d.stage = "CLASSIFYING";
      });
      const result = await this.tool(context, "document.classify", {
        documentId: id,
        page: 1,
      });
      if (!result.classification) throw deny("CLASSIFY_FAILED");
      await update((d) => {
        Object.assign(d, result.classification);
        d.collection = d.sensitive
          ? "Other"
          : d.documentType === "STUDY"
            ? "Study"
            : d.documentType === "RECEIPT"
              ? "Receipts"
              : "Notes";
        d.stage = "SAVING";
        d.memoryStatus = d.sensitive
          ? "BLOCKED"
          : settings.autoMemory === "OFF"
            ? "OFF"
            : "SUGGESTED";
      });
      const pdfSource = await this.require(s, id);
      try {
        const images = await Promise.all(
          pdfSource.pages.map((p) => this.assets.read(s, p.cleaned!)),
        );
        const bytes = await searchableDocumentPdf(pdfSource, images);
        const ref = await this.assets.put(s, bytes, "pdf");
        await update((d) => {
          d.pdf = ref;
          d.pdfError = null;
        });
      } catch {
        await update((d) => {
          d.pdf = null;
          d.pdfError = "PDF_OCR_LAYOUT_OR_GENERATION_FAILED";
        });
      }
      const saved = await this.require(s, id);
      if (
        settings.autoMemory === "AUTO_FOR_APPROVED_CATEGORIES" &&
        settings.approvedCategories.includes(
          saved.collection as "Study" | "Projects",
        ) &&
        saved.documentType === "STUDY"
      )
        // A failed memory write must not discard a successfully saved scan.
        await this.ingest(s, id).catch(() => undefined);
      await update((d) => {
        d.stage = "COMPLETE";
        d.leaseUntil = null;
      });
      await this.event(s, id, "PROCESSING_COMPLETE");
    } catch (error) {
      await this.store.atomic(s, id, (d) => {
        if (d.stage !== "ARCHIVED" && d.attempt === attempt) {
          d.stage = "FAILED";
          d.errorCode =
            error instanceof Error && /^[A-Z_]{3,80}$/.test(error.message)
              ? error.message
              : "DOCUMENT_PROCESSING_FAILED";
          d.leaseUntil = null;
        }
      });
    }
    return this.require(s, id, true);
  }
  async reprocess(s: DocumentScope, id: string) {
    await this.store.atomic(s, id, (d) => {
      if (
        d.stage === "ARCHIVED" ||
        (d.leaseUntil && Date.parse(d.leaseUntil) > Date.now())
      )
        throw deny("DOCUMENT_BUSY");
      if (d.pages.some((p) => p.memoryIds.length))
        throw deny("REMOVE_MEMORIES_BEFORE_REPROCESS");
      d.stage = "FAILED";
      d.pdf = null;
    });
  }
  async ingest(s: DocumentScope, id: string) {
    if (companyScope.companyId(s.ownerId) !== s.companyId)
      throw deny("DOCUMENT_MEMORY_SCOPE_DENIED", 403);
    let ingestionStarted = false;
    try {
      await this.store.atomic(s, id, async (d) => {
        const full = d.pages.map((p) => p.ocr?.text ?? "").join("\n");
        if (
          d.neverMemory ||
          d.sensitive ||
          sensitiveDocument(full) ||
          !["STUDY", "NOTE"].includes(d.documentType) ||
          d.pages.some(
            (p) => p.ocrStatus !== "COMPLETE" || (p.ocr?.confidence ?? 0) < 0.65,
          )
        )
          throw deny("DOCUMENT_MEMORY_DENIED", 403);
        if ((await this.store.settings(s)).autoMemory === "OFF")
          throw deny("DOCUMENT_MEMORY_DISABLED", 403);
        if (d.memoryStatus === "INDEXED") return;
        if (d.stage !== "COMPLETE" && d.stage !== "SAVING")
          throw deny("DOCUMENT_NOT_READY");
        d.stage = "MEMORY_INDEXING";
        ingestionStarted = true;
        for (const p of d.pages) {
          if (p.memoryIds.length) continue;
          const text = p
            .ocr!.text.trim()
            .split(/(?<=[.!?])\s+/)
            .slice(0, 2)
            .join(" ")
            .slice(0, 600);
          if (!text) continue;
          const memory = await this.memory.recordMemory({
            ownerId: s.ownerId,
            body: {
              memoryType: "semantic",
              source: "integration",
              title: d.title,
              summary: text.slice(0, 1200),
              content: text.slice(0, 1800),
              tags: [
                "document-derived",
                "untrusted-source",
                `document:${id}`,
                `page:${p.number}`,
              ],
              importance: 50,
              confidence: p.ocr!.confidence ?? 0.65,
              evidence: [
                {
                  sourceType: "file",
                  reference: `document:${id}/page/${p.number}/asset/${p.original}/ocr/${p.ocr!.version}`,
                  excerpt: null,
                  observedAt: p.ocr!.timestamp,
                },
              ],
            },
            requestId: "document-memory",
            ipAddress: "internal",
          });
          p.memoryIds.push(memory.memory.id);
        }
        if (this.semanticIndex && !d.semanticRefs.length)
          d.semanticRefs = await this.semanticIndex(s, d);
        d.memoryStatus = "INDEXED";
        d.stage = "COMPLETE";
        await this.event(s, id, "MEMORY_ADDED");
      });
    } catch (error) {
      if (ingestionStarted)
        await this.store.atomic(s, id, (d) => {
          if (d.stage !== "ARCHIVED" && d.memoryStatus !== "EXCLUDED")
            d.memoryStatus = "FAILED";
        });
      throw error;
    }
  }
  async exclude(s: DocumentScope, id: string, never: boolean, archive = false) {
    if (companyScope.companyId(s.ownerId) !== s.companyId)
      throw deny("DOCUMENT_MEMORY_SCOPE_DENIED", 403);
    await this.store.atomic(s, id, async (d) => {
      // Read linked nodes before exclusion hides them from ordinary graph reads.
      const linked = new Set(d.pages.flatMap((p) => p.memoryIds));
      const nodes = linked.size
        ? await this.memory.store.listKnowledgeNodes(s.ownerId, 5000)
        : [];
      for (const p of d.pages)
        for (const memoryId of p.memoryIds) {
          const memory = await this.memory.store.findMemory(s.ownerId, memoryId);
          if (memory) {
            await this.memory.store.saveMemory({
              ...memory,
              expiresAt: new Date(0).toISOString(),
              tags: [
                ...memory.tags.filter((t) => t !== "document-excluded"),
                "document-excluded",
              ],
              version: memory.version + 1,
            });
          }
        }
      for (const node of nodes)
        if (node.refId && linked.has(node.refId))
          await this.memory.store.saveKnowledgeNode({
            ...node,
            label: "Excluded document memory",
            summary: "",
            evidence: [],
            confidence: 0,
            refId: null,
            updatedAt: new Date().toISOString(),
          });
      if (this.semanticExclude && d.semanticRefs.length)
        await this.semanticExclude(s, d.semanticRefs);
      d.semanticRefs = [];
      for (const p of d.pages) p.memoryIds = [];
      d.neverMemory = never || archive;
      d.memoryStatus = "EXCLUDED";
      if (archive) {
        d.stage = "ARCHIVED";
        d.attempt++;
        d.leaseUntil = null;
      }
      await this.event(s, id, archive ? "ARCHIVED" : "MEMORY_EXCLUDED");
    });
    return this.require(s, id, true);
  }
}
