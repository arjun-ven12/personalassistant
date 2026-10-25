import {
  DocumentRecordSchema,
  DocumentSettingsSchema,
  type DocumentRecord,
  type DocumentScope,
  type DocumentSettings,
} from "@alexa-control/shared";
import type { PostgresDatabase } from "../persistence/database.js";
export class DocumentStore {
  constructor(readonly database: PostgresDatabase) {}
  async get(s: DocumentScope, id: string) {
    const r = await this.database.pool.query<{ record: unknown }>(
      "SELECT record FROM athena_documents WHERE owner_id=$1 AND company_id=$2 AND id=$3",
      [s.ownerId, s.companyId, id],
    );
    return r.rows[0] ? DocumentRecordSchema.parse(r.rows[0].record) : null;
  }
  async create(d: DocumentRecord) {
    const r = await this.database.pool.query<{ record: unknown }>(
      "INSERT INTO athena_documents(owner_id,company_id,id,idempotency_key,version,record) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_id,company_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING record",
      [d.ownerId, d.companyId, d.id, d.idempotencyKey, d.version, d],
    );
    return DocumentRecordSchema.parse(r.rows[0]?.record);
  }
  async atomic<T>(
    s: DocumentScope,
    id: string,
    work: (d: DocumentRecord) => Promise<T> | T,
  ) {
    return this.database.transaction(
      `document:${s.ownerId}:${s.companyId}:${id}`,
      async () => {
        const r = await this.database.pool.query<{ record: unknown }>(
          "SELECT record FROM athena_documents WHERE owner_id=$1 AND company_id=$2 AND id=$3 FOR UPDATE",
          [s.ownerId, s.companyId, id],
        );
        if (!r.rows[0])
          throw Object.assign(Error("Document not found"), {
            statusCode: 404,
            code: "DOCUMENT_NOT_FOUND",
          });
        const d = DocumentRecordSchema.parse(r.rows[0].record);
        const result = await work(d);
        d.version++;
        d.updatedAt = new Date().toISOString();
        DocumentRecordSchema.parse(d);
        await this.database.pool.query(
          "UPDATE athena_documents SET version=$4,record=$5 WHERE owner_id=$1 AND company_id=$2 AND id=$3",
          [s.ownerId, s.companyId, id, d.version, d],
        );
        return result;
      },
    );
  }
  async list(s: DocumentScope, q: string, collection?: string) {
    const r = await this.database.pool.query<{ record: unknown }>(
      `SELECT record FROM athena_documents WHERE owner_id=$1 AND company_id=$2 AND record->>'stage'<>'ARCHIVED' AND ($4::text IS NULL OR record->>'collection'=$4) AND ($3='' OR concat_ws(' ',record->>'title',record->>'summary',(record->'tags')::text,(record->'pages')::text) ILIKE '%'||$3||'%') ORDER BY record->>'updatedAt' DESC LIMIT 100`,
      [s.ownerId, s.companyId, q.replace(/[%_\\]/g, "\\$&"), collection ?? null],
    );
    return r.rows.map((r) => DocumentRecordSchema.parse(r.record));
  }
  async settings(s: DocumentScope) {
    const r = await this.database.pool.query<{ record: unknown }>(
      "SELECT record FROM athena_document_settings WHERE owner_id=$1 AND company_id=$2",
      [s.ownerId, s.companyId],
    );
    return DocumentSettingsSchema.parse(r.rows[0]?.record ?? {});
  }
  async saveSettings(s: DocumentScope, settings: DocumentSettings) {
    await this.database.pool.query(
      "INSERT INTO athena_document_settings(owner_id,company_id,record) VALUES($1,$2,$3) ON CONFLICT(owner_id,company_id) DO UPDATE SET record=$3",
      [s.ownerId, s.companyId, DocumentSettingsSchema.parse(settings)],
    );
  }
}
