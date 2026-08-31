import { describe, expect, it, vi } from "vitest";

import { RedisService } from "./redis-service.js";

describe("RedisService distributed locks", () => {
  it("releases only the lease token acquired by this worker", async () => {
    const redis = new RedisService({
      namespace: "test",
      url: "https://redis.invalid",
      token: "test-token",
    });
    const commands: string[][] = [];
    vi.spyOn(redis, "upstash").mockImplementation((command) => {
      commands.push(command);
      return Promise.resolve(command[0] === "SET" ? "OK" : 1);
    });

    await expect(redis.withLock("voice", 3, () => Promise.resolve("done"))).resolves.toBe("done");

    expect(commands).toHaveLength(2);
    expect(commands[0]?.slice(0, 2)).toEqual(["SET", "test:lock:voice"]);
    expect(commands[1]?.slice(0, 4)).toEqual([
      "EVAL",
      expect.stringContaining('redis.call("GET", KEYS[1])'),
      "1",
      "test:lock:voice",
    ]);
    expect(commands[1]?.[4]).toBe(commands[0]?.[2]);
  });

  it("does not mask completed work when Redis is unavailable during release", async () => {
    const redis = new RedisService({
      namespace: "test",
      url: "https://redis.invalid",
      token: "test-token",
    });
    vi.spyOn(redis, "upstash").mockImplementation((command) => {
      if (command[0] === "SET") return Promise.resolve("OK");
      return Promise.reject(new Error("REDIS_UNAVAILABLE"));
    });

    await expect(redis.withLock("voice", 3, () => Promise.resolve("done"))).resolves.toBe("done");
  });
});
