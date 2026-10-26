import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  JSONRPCMessageSchema,
  type JSONRPCMessage,
} from "@modelcontextprotocol/sdk/types.js";
import { McpLocalError } from "./errors.js";

/** Bound raw bytes before JSON decoding and SDK schema handling. */
export class FixtureFrameDecoder {
  private buffer = Buffer.alloc(0);
  private bytes = 0;
  private frames = 0;
  push(chunk: Buffer): unknown[] {
    this.bytes += chunk.length;
    if (this.bytes > 65_536) throw new McpLocalError("MCP_PROTOCOL_REJECTED");
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: unknown[] = [];
    for (;;) {
      const newline = this.buffer.indexOf(10);
      if (newline < 0) break;
      if (newline > 16_384 || ++this.frames > 16)
        throw new McpLocalError("MCP_PROTOCOL_REJECTED");
      const line = new TextDecoder("utf-8", { fatal: true }).decode(
        this.buffer.subarray(0, newline),
      );
      this.buffer = this.buffer.subarray(newline + 1);
      messages.push(JSON.parse(line));
    }
    if (this.buffer.length > 16_384) throw new McpLocalError("MCP_PROTOCOL_REJECTED");
    return messages;
  }
}

class LocalFixtureTransport implements Transport {
  onmessage?: Transport["onmessage"];
  onerror?: Transport["onerror"];
  onclose?: Transport["onclose"];
  private child?: ChildProcessWithoutNullStreams;
  private closing?: Promise<void>;
  private used = false;
  private exited?: Promise<void>;
  get running() {
    return Boolean(
      this.child && this.child.exitCode === null && this.child.signalCode === null,
    );
  }

  async start() {
    if (this.used || this.closing) throw new McpLocalError("MCP_PROTOCOL_REJECTED");
    this.used = true;
    const source = import.meta.url.endsWith(".ts");
    const args = source
      ? [
          "--import",
          createRequire(import.meta.url).resolve("tsx"),
          fileURLToPath(new URL("./fixture-server.ts", import.meta.url)),
        ]
      : [fileURLToPath(new URL("./mcp-fixture.js", import.meta.url))];
    const child = spawn(process.execPath, args, {
      shell: false,
      env: { NODE_ENV: "test" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    const decoder = new FixtureFrameDecoder();
    let stderrBytes = 0;
    this.exited = new Promise((resolve) =>
      child.once("close", () => {
        this.onclose?.();
        resolve();
      }),
    );
    child.on("error", () => {
      this.onerror?.(new McpLocalError("MCP_PROTOCOL_REJECTED"));
    });
    child.stdout.on("data", (chunk: Buffer) => {
      try {
        for (const frame of decoder.push(chunk))
          this.onmessage?.(JSONRPCMessageSchema.parse(frame));
      } catch {
        this.onerror?.(new McpLocalError("MCP_PROTOCOL_REJECTED"));
        void this.close();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      // Drain without retaining/logging potentially sensitive diagnostic payloads.
      stderrBytes += chunk.length;
      if (stderrBytes > 16_384) {
        this.onerror?.(new McpLocalError("MCP_PROTOCOL_REJECTED"));
        void this.close();
      }
    });
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", () => reject(new McpLocalError("MCP_PROTOCOL_REJECTED")));
    });
  }

  async send(message: JSONRPCMessage) {
    const bytes = Buffer.from(`${JSON.stringify(message)}\n`);
    if (!this.running || this.closing || bytes.length > 16_384)
      throw new McpLocalError("MCP_PROTOCOL_REJECTED");
    const child = this.child!;
    await new Promise<void>((resolve, reject) =>
      child.stdin.write(bytes, (error) =>
        error ? reject(new McpLocalError("MCP_PROTOCOL_REJECTED")) : resolve(),
      ),
    );
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = (async () => {
      const child = this.child;
      if (!child) return;
      child.stdin.end();
      child.kill("SIGTERM");
      const kill = setTimeout(() => child.kill("SIGKILL"), 250);
      try {
        await this.exited;
      } finally {
        clearTimeout(kill);
      }
    })();
    return this.closing;
  }
}

// No command/path/env/URL argument is accepted, even from internal callers.
export const createLocalFixtureTransport = () => new LocalFixtureTransport();
