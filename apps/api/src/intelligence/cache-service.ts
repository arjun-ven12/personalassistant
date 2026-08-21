import { CacheMetricsSchema, type CacheMetrics } from "@alexa-control/shared";

import type { RedisService } from "./redis-service.js";

export interface CacheServiceOptions {
  enabled: boolean;
  namespace: string;
  defaultTtlSeconds: number;
}

export class CacheService {
  #hits = 0;
  #misses = 0;
  #writes = 0;
  #invalidations = 0;
  #latencySamples: number[] = [];

  constructor(
    readonly redis: RedisService,
    readonly options: CacheServiceOptions,
  ) {}

  async getJson<T>(key: string, schema: { parse(value: unknown): T }) {
    if (!this.options.enabled) return null;
    const start = performance.now();
    const raw = await this.redis.get(`cache:${key}`);
    this.recordLatency(start);
    if (!raw) {
      this.#misses += 1;
      return null;
    }
    this.#hits += 1;
    return schema.parse(JSON.parse(raw));
  }

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds = this.options.defaultTtlSeconds,
  ) {
    if (!this.options.enabled) return;
    const start = performance.now();
    await this.redis.set(`cache:${key}`, JSON.stringify(value), ttlSeconds);
    this.recordLatency(start);
    this.#writes += 1;
  }

  async invalidate(key: string) {
    if (!this.options.enabled) return;
    const start = performance.now();
    await this.redis.del(`cache:${key}`);
    this.recordLatency(start);
    this.#invalidations += 1;
  }

  async publishInvalidation(topic: string, payload: unknown) {
    if (!this.options.enabled) return;
    await this.redis.publish(
      `cache-events:${topic}`,
      JSON.stringify({ topic, payload, publishedAt: new Date().toISOString() }),
    );
  }

  metrics(): CacheMetrics {
    const total = this.#hits + this.#misses;
    const averageLatencyMs =
      this.#latencySamples.length > 0
        ? this.#latencySamples.reduce((sum, sample) => sum + sample, 0) /
          this.#latencySamples.length
        : 0;
    return CacheMetricsSchema.parse({
      enabled: this.options.enabled,
      namespace: this.options.namespace,
      hits: this.#hits,
      misses: this.#misses,
      writes: this.#writes,
      invalidations: this.#invalidations,
      hitRate: total > 0 ? this.#hits / total : 0,
      averageLatencyMs,
    });
  }

  recordLatency(start: number) {
    this.#latencySamples.push(Math.round((performance.now() - start) * 100) / 100);
    if (this.#latencySamples.length > 100) this.#latencySamples.shift();
  }
}
