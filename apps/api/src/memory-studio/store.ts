import { z } from "zod";

import type { Awaitable } from "../identity/store.js";

export const CognitiveItemControlRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    itemId: z.string().min(1).max(300),
    archived: z.boolean(),
    pinned: z.boolean(),
    tags: z.array(z.string().min(1).max(80)).max(50),
    retentionClass: z
      .enum([
        "TRANSIENT",
        "SHORT_TERM",
        "WORKING",
        "DURABLE",
        "PINNED",
        "HISTORICAL",
        "SYSTEM",
      ])
      .nullable(),
    note: z.string().max(1_000).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    version: z.number().int().positive(),
  })
  .strict();

export const CognitiveItemUsageRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    itemId: z.string().min(1).max(300),
    useType: z.string().min(1).max(120),
    source: z.string().min(1).max(120),
    usedAt: z.iso.datetime(),
    metadata: z.record(z.string(), z.unknown()),
  })
  .strict();

export const CognitiveItemVersionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    itemId: z.string().min(1).max(300),
    version: z.number().int().positive(),
    changeType: z.string().min(1).max(120),
    reason: z.string().max(1_000).nullable(),
    before: z.record(z.string(), z.unknown()),
    after: z.record(z.string(), z.unknown()),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const CognitiveAuditLinkRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    itemId: z.string().min(1).max(300),
    eventType: z.string().min(1).max(120),
    summary: z.string().min(1).max(1_000),
    createdAt: z.iso.datetime(),
  })
  .strict();

export type CognitiveItemControlRecord = z.infer<
  typeof CognitiveItemControlRecordSchema
>;
export type CognitiveItemUsageRecord = z.infer<typeof CognitiveItemUsageRecordSchema>;
export type CognitiveItemVersionRecord = z.infer<
  typeof CognitiveItemVersionRecordSchema
>;
export type CognitiveAuditLinkRecord = z.infer<typeof CognitiveAuditLinkRecordSchema>;

export interface MemoryStudioStore {
  saveControl(record: CognitiveItemControlRecord): Awaitable<void>;
  getControl(
    ownerId: string,
    itemId: string,
  ): Awaitable<CognitiveItemControlRecord | null>;
  listControls(ownerId: string, limit: number): Awaitable<CognitiveItemControlRecord[]>;
  saveUsage(record: CognitiveItemUsageRecord): Awaitable<void>;
  listUsage(
    ownerId: string,
    itemId: string,
    limit: number,
  ): Awaitable<CognitiveItemUsageRecord[]>;
  saveVersion(record: CognitiveItemVersionRecord): Awaitable<void>;
  listVersions(
    ownerId: string,
    itemId: string,
    limit: number,
  ): Awaitable<CognitiveItemVersionRecord[]>;
  saveAuditLink(record: CognitiveAuditLinkRecord): Awaitable<void>;
  listAuditLinks(
    ownerId: string,
    itemId: string,
    limit: number,
  ): Awaitable<CognitiveAuditLinkRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryMemoryStudioStore implements MemoryStudioStore {
  readonly #controls = new Map<string, CognitiveItemControlRecord>();
  readonly #usage = new Map<string, CognitiveItemUsageRecord>();
  readonly #versions = new Map<string, CognitiveItemVersionRecord>();
  readonly #auditLinks = new Map<string, CognitiveAuditLinkRecord>();

  saveControl(record: CognitiveItemControlRecord) {
    const parsed = CognitiveItemControlRecordSchema.parse(record);
    this.#controls.set(`${parsed.ownerId}:${parsed.itemId}`, clone(parsed));
  }

  getControl(ownerId: string, itemId: string) {
    const record = this.#controls.get(`${ownerId}:${itemId}`);
    return record ? clone(record) : null;
  }

  listControls(ownerId: string, limit: number) {
    return [...this.#controls.values()]
      .filter((record) => record.ownerId === ownerId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit)
      .map(clone);
  }

  saveUsage(record: CognitiveItemUsageRecord) {
    const parsed = CognitiveItemUsageRecordSchema.parse(record);
    this.#usage.set(parsed.id, clone(parsed));
  }

  listUsage(ownerId: string, itemId: string, limit: number) {
    return [...this.#usage.values()]
      .filter((record) => record.ownerId === ownerId && record.itemId === itemId)
      .sort((left, right) => right.usedAt.localeCompare(left.usedAt))
      .slice(0, limit)
      .map(clone);
  }

  saveVersion(record: CognitiveItemVersionRecord) {
    const parsed = CognitiveItemVersionRecordSchema.parse(record);
    this.#versions.set(parsed.id, clone(parsed));
  }

  listVersions(ownerId: string, itemId: string, limit: number) {
    return [...this.#versions.values()]
      .filter((record) => record.ownerId === ownerId && record.itemId === itemId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map(clone);
  }

  saveAuditLink(record: CognitiveAuditLinkRecord) {
    const parsed = CognitiveAuditLinkRecordSchema.parse(record);
    this.#auditLinks.set(parsed.id, clone(parsed));
  }

  listAuditLinks(ownerId: string, itemId: string, limit: number) {
    return [...this.#auditLinks.values()]
      .filter((record) => record.ownerId === ownerId && record.itemId === itemId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map(clone);
  }
}
