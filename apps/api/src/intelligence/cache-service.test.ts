import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { CacheService } from "./cache-service.js";
import { RedisService } from "./redis-service.js";
import { companyScope } from "../companies/scope.js";

const createCache = () => {
  const redis = new RedisService({
    namespace: "test",
    url: "https://redis.invalid",
    token: "test-token",
  });
  return {
    redis,
    cache: new CacheService(redis, {
      enabled: true,
      namespace: "test",
      defaultTtlSeconds: 60,
    }),
  };
};

describe("CacheService degradation", () => {
  it("treats Redis read failures and corrupt cache values as misses", async () => {
    const unavailable = createCache();
    vi.spyOn(unavailable.redis, "get").mockRejectedValue(new Error("REDIS_UNAVAILABLE"));
    await expect(unavailable.cache.getJson("item", z.object({ id: z.string() }))).resolves.toBeNull();

    const corrupt = createCache();
    vi.spyOn(corrupt.redis, "get").mockResolvedValue("not-json");
    await expect(corrupt.cache.getJson("item", z.object({ id: z.string() }))).resolves.toBeNull();
  });

  it("does not fail canonical work when cache writes or invalidations fail", async () => {
    const { redis, cache } = createCache();
    vi.spyOn(redis, "set").mockRejectedValue(new Error("REDIS_UNAVAILABLE"));
    vi.spyOn(redis, "del").mockRejectedValue(new Error("REDIS_UNAVAILABLE"));
    vi.spyOn(redis, "publish").mockRejectedValue(new Error("REDIS_UNAVAILABLE"));

    await expect(cache.setJson("item", { id: "one" })).resolves.toBeUndefined();
    await expect(cache.invalidate("item")).resolves.toBeUndefined();
    await expect(cache.publishInvalidation("items", { id: "one" })).resolves.toBeUndefined();
  });

  it("namespaces identical keys by company before calling Redis", async () => {
    const { redis, cache } = createCache();
    const set = vi.spyOn(redis, "set").mockResolvedValue(undefined);
    const ownerId = "10000000-0000-4000-8000-000000000001";
    const companyA = "20000000-0000-4000-8000-000000000001";
    const companyB = "20000000-0000-4000-8000-000000000002";
    await companyScope.run({ ownerId, companyId: companyA, role: "OWNER", requestId: "a" }, () => cache.setJson("dashboard", { value: "A" }));
    await companyScope.run({ ownerId, companyId: companyB, role: "OWNER", requestId: "b" }, () => cache.setJson("dashboard", { value: "B" }));
    expect(set.mock.calls[0]?.[0]).toContain(`company:${companyA}`);
    expect(set.mock.calls[1]?.[0]).toContain(`company:${companyB}`);
    expect(set.mock.calls[0]?.[0]).not.toBe(set.mock.calls[1]?.[0]);
  });
});
