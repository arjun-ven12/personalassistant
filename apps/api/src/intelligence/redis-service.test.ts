import { describe, expect, it, vi } from "vitest";

import { RedisService } from "./redis-service.js";
import net from "node:net";

describe("RedisService distributed locks", () => {
  it("separates AUTH from fragmented command replies, preserves Unicode and reuses the connection", async () => {
    let connections = 0;
    const server = net.createServer((socket) => {
      connections += 1;
      socket.on("data", (data) => {
        const command = data.toString("utf8");
        if (command.includes("AUTH")) socket.write("+OK\r\n");
        else if (command.includes("SET")) {
          socket.write("$");
          setImmediate(() => socket.write("-1\r\n"));
        } else if (command.includes("GET")) {
          const reply = Buffer.from("$7\r\nAthéna\r\n");
          socket.write(reply.subarray(0, 8));
          setImmediate(() => socket.write(reply.subarray(8)));
        } else socket.write("+OK\r\n");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as net.AddressInfo;
    const redis = new RedisService({
      namespace: "test",
      host: "127.0.0.1",
      port: address.port,
      password: "synthetic-fixture",
    });
    try {
      const work = vi.fn();
      await expect(redis.withLock("voice", 3, work)).rejects.toThrow(
        "DISTRIBUTED_LOCK_NOT_ACQUIRED",
      );
      expect(work).not.toHaveBeenCalled();
      expect(await redis.get("unicode")).toBe("Athéna");
      expect(connections).toBe(1);
    } finally {
      redis.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
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

    await expect(
      redis.withLock("voice", 3, () => Promise.resolve("done")),
    ).resolves.toBe("done");

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

    await expect(
      redis.withLock("voice", 3, () => Promise.resolve("done")),
    ).resolves.toBe("done");
  });
});
