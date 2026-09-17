import { createClient } from "redis";
import { z } from "zod";

export type RedisMode = "upstash" | "standard" | "disabled";

export interface RedisServiceOptions {
  namespace: string;
  url?: string;
  token?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  tls?: boolean;
}

export interface RedisHealth {
  mode: RedisMode;
  available: boolean;
  latencyMs: number | null;
}

interface RedisConnection {
  readonly isOpen: boolean;
  readonly isReady: boolean;
  connect(): Promise<unknown>;
  sendCommand(
    command: string[],
    options: { abortSignal: AbortSignal },
  ): Promise<unknown>;
  destroy(): void;
}

export class RedisService {
  #client: RedisConnection | undefined;
  #connecting: Promise<unknown> | undefined;
  #closed = false;
  readonly namespace: string;
  readonly mode: RedisMode;

  constructor(readonly options: RedisServiceOptions) {
    this.namespace = options.namespace;
    this.mode =
      options.url && options.token
        ? "upstash"
        : options.host && options.password
          ? "standard"
          : "disabled";
  }

  key(key: string) {
    return `${this.namespace}:${key}`;
  }

  async health(): Promise<RedisHealth> {
    if (this.mode === "disabled")
      return { mode: this.mode, available: false, latencyMs: null };
    const start = performance.now();
    try {
      await this.ping();
      return {
        mode: this.mode,
        available: true,
        latencyMs: Math.round((performance.now() - start) * 100) / 100,
      };
    } catch {
      return {
        mode: this.mode,
        available: false,
        latencyMs: Math.round((performance.now() - start) * 100) / 100,
      };
    }
  }

  async ping() {
    if (this.mode === "upstash") {
      if ((await this.upstash(["PING"])) !== "PONG")
        throw new Error("REDIS_INVALID_PING");
      return;
    }
    if (this.mode === "standard") {
      if ((await this.standard(["PING"])) !== "PONG")
        throw new Error("REDIS_INVALID_PING");
    }
  }

  async get(key: string) {
    if (this.mode === "disabled") return null;
    const namespaced = this.key(key);
    const result =
      this.mode === "upstash"
        ? await this.upstash(["GET", namespaced])
        : await this.standard(["GET", namespaced]);
    return typeof result === "string" ? result : null;
  }

  async set(key: string, value: string, ttlSeconds: number) {
    if (this.mode === "disabled") return;
    const namespaced = this.key(key);
    if (this.mode === "upstash") {
      await this.upstash(["SET", namespaced, value, "EX", String(ttlSeconds)]);
      return;
    }
    await this.standard(["SET", namespaced, value, "EX", String(ttlSeconds)]);
  }

  async del(key: string) {
    if (this.mode === "disabled") return;
    const namespaced = this.key(key);
    if (this.mode === "upstash") {
      await this.upstash(["DEL", namespaced]);
      return;
    }
    await this.standard(["DEL", namespaced]);
  }

  async publish(channel: string, value: string) {
    if (this.mode === "disabled") return;
    const namespaced = this.key(channel);
    if (this.mode === "upstash") {
      await this.upstash(["PUBLISH", namespaced, value]);
      return;
    }
    await this.standard(["PUBLISH", namespaced, value]);
  }

  async withLock<T>(resource: string, ttlSeconds: number, work: () => Promise<T>) {
    const token = crypto.randomUUID();
    const key = this.key(`lock:${resource}`);
    if (this.mode === "disabled") return work();
    const result =
      this.mode === "upstash"
        ? await this.upstash(["SET", key, token, "NX", "EX", String(ttlSeconds)])
        : await this.standard(["SET", key, token, "NX", "EX", String(ttlSeconds)]);
    if (result !== "OK") throw new Error("DISTRIBUTED_LOCK_NOT_ACQUIRED");
    try {
      return await work();
    } finally {
      const release = [
        "EVAL",
        'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
        "1",
        key,
        token,
      ];
      try {
        if (this.mode === "upstash") await this.upstash(release);
        else await this.standard(release);
      } catch {
        // The lease TTL remains the fail-safe if Redis is unavailable during release.
      }
    }
  }

  async upstash(command: string[]) {
    if (!this.options.url || !this.options.token)
      throw new Error("REDIS_NOT_CONFIGURED");
    const response = await fetch(this.options.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error("REDIS_UPSTASH_REQUEST_FAILED");
    const body = z
      .object({ result: z.unknown().optional(), error: z.string().optional() })
      .parse(await response.json());
    if (body.error) throw new Error("REDIS_UPSTASH_ERROR");
    return body.result;
  }

  async standard(command: string[]): Promise<unknown> {
    if (this.#closed || !this.options.host || !this.options.password) {
      throw new Error("REDIS_NOT_CONFIGURED");
    }
    const client = (this.#client ??= createClient({
      RESP: 2,
      maintNotifications: "disabled",
      socket: {
        host: this.options.host,
        port: this.options.port ?? 6379,
        ...(this.options.tls ? { tls: true as const, rejectUnauthorized: true } : {}),
        connectTimeout: 5_000,
        reconnectStrategy: false,
      },
      ...(this.options.username ? { username: this.options.username } : {}),
      password: this.options.password,
      disableOfflineQueue: true,
      commandsQueueMaxLength: 100,
      disableClientInfo: true,
    }).on("error", () => {
      /* Commands fail closed; never log credential-bearing transport errors. */
    }));
    try {
      if (!client.isReady) {
        this.#connecting ??= (async () => {
          let timer: NodeJS.Timeout | undefined;
          try {
            await Promise.race([
              client.connect(),
              new Promise<never>((_resolve, reject) => {
                timer = setTimeout(
                  () => reject(new Error("REDIS_CONNECT_TIMEOUT")),
                  5_000,
                );
              }),
            ]);
          } finally {
            clearTimeout(timer);
            this.#connecting = undefined;
          }
        })();
        await this.#connecting;
      }
      return await client.sendCommand(command, {
        abortSignal: AbortSignal.timeout(5_000),
      });
    } catch {
      if (client.isOpen) client.destroy();
      if (this.#client === client) this.#client = undefined;
      throw new Error("REDIS_COMMAND_FAILED");
    }
  }

  close() {
    this.#closed = true;
    if (this.#client?.isOpen) this.#client.destroy();
    this.#client = undefined;
  }
}
