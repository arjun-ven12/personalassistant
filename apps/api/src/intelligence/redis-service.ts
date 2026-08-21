import net from "node:net";
import tls from "node:tls";

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

export class RedisService {
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
      await this.upstash(["PING"]);
      return;
    }
    if (this.mode === "standard") {
      await this.standard(["PING"]);
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
      if (this.mode === "upstash") await this.upstash(["DEL", key]);
      else await this.standard(["DEL", key]);
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
    });
    if (!response.ok) throw new Error("REDIS_UPSTASH_REQUEST_FAILED");
    const body = (await response.json()) as { result?: unknown; error?: string };
    if (body.error) throw new Error("REDIS_UPSTASH_ERROR");
    return body.result;
  }

  async standard(command: string[]) {
    if (!this.options.host || !this.options.password) {
      throw new Error("REDIS_NOT_CONFIGURED");
    }
    const authCommand = this.options.username
      ? ["AUTH", this.options.username, this.options.password]
      : ["AUTH", this.options.password];
    const commands = [authCommand, command];
    const payload = commands.map(encodeRespArray).join("");
    const port = this.options.port ?? 6379;
    const socket = this.options.tls
      ? tls.connect({ host: this.options.host, port })
      : net.connect({ host: this.options.host, port });
    socket.setTimeout(5_000);
    const response = await new Promise<string>((resolve, reject) => {
      let data = "";
      socket.on("connect", () => socket.write(payload));
      socket.on("data", (chunk: Buffer | string) => {
        data += typeof chunk === "string" ? chunk : chunk.toString("utf8");
        if (data.includes("\r\n")) socket.end();
      });
      socket.on("end", () => resolve(data));
      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error("REDIS_TIMEOUT"));
      });
      socket.on("error", reject);
    });
    const parsed = parseRespResponses(response);
    const last = parsed.at(-1);
    if (last instanceof Error) throw last;
    return last ?? null;
  }
}

const encodeRespArray = (items: string[]) =>
  `*${items.length}\r\n${items
    .map((item) => `$${Buffer.byteLength(item)}\r\n${item}\r\n`)
    .join("")}`;

const parseRespResponses = (input: string): unknown[] => {
  const responses: unknown[] = [];
  let offset = 0;
  while (offset < input.length) {
    const parsed = parseResp(input, offset);
    responses.push(parsed.value);
    offset = parsed.next;
  }
  return responses;
};

const parseResp = (input: string, offset: number): { value: unknown; next: number } => {
  const type = input[offset];
  const end = input.indexOf("\r\n", offset);
  const line = input.slice(offset + 1, end);
  if (type === "+") return { value: line, next: end + 2 };
  if (type === "-") return { value: new Error(line), next: end + 2 };
  if (type === ":") return { value: Number(line), next: end + 2 };
  if (type === "$") {
    const length = Number(line);
    if (length < 0) return { value: null, next: end + 2 };
    const start = end + 2;
    return { value: input.slice(start, start + length), next: start + length + 2 };
  }
  return { value: null, next: input.length };
};
