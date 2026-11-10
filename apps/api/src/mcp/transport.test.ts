import { describe, expect, it } from "vitest";
import { McpProtocolClient } from "./protocol.js";
import { createLocalFixtureTransport, FixtureFrameDecoder } from "./transport.js";

describe("bounded local stdio transport", () => {
  it("runs an actual SDK server child through initialization, discovery and read", async () => {
    const transport = createLocalFixtureTransport();
    const result = await new McpProtocolClient(transport).execute(
      "read_status",
      { probe: "health" },
      AbortSignal.timeout(8_000),
    );
    expect(result).toMatchObject({ status: "ok", readOnly: true });
    expect(transport.running).toBe(false);
  });

  it("discovers real tools without invoking a tool", async () => {
    const transport = createLocalFixtureTransport();
    const result = await new McpProtocolClient(transport).execute(
      "discover",
      { probe: "health" },
      AbortSignal.timeout(8_000),
    );
    expect(result).toMatchObject({
      serverId: "athena.local.fixture",
      tools: [{ name: "athena_local_status" }],
    });
    expect(transport.running).toBe(false);
  });

  it("closes a real child on cancellation", async () => {
    const transport = createLocalFixtureTransport();
    await transport.start();
    expect(transport.running).toBe(true);
    await transport.close();
    await transport.close();
    expect(transport.running).toBe(false);
  });

  it("rejects oversized unterminated lines, aggregate flooding and invalid UTF-8 before SDK parsing", () => {
    expect(() => new FixtureFrameDecoder().push(Buffer.alloc(16_385, 97))).toThrow();
    const d = new FixtureFrameDecoder();
    for (let i = 0; i < 15; i++) d.push(Buffer.from("{}\n"));
    expect(() => d.push(Buffer.from("{}\n{}\n"))).toThrow();
    expect(() => new FixtureFrameDecoder().push(Buffer.from([255, 10]))).toThrow();
    expect(() => new FixtureFrameDecoder().push(Buffer.alloc(65_537, 10))).toThrow();
  });

  it("handles split UTF-8 and rejects malformed complete JSON", () => {
    const d = new FixtureFrameDecoder();
    const bytes = Buffer.from('{"label":"é"}\n');
    expect(d.push(bytes.subarray(0, 11))).toEqual([]);
    expect(d.push(bytes.subarray(11))).toEqual([{ label: "é" }]);
    expect(() => d.push(Buffer.from("not-json\n"))).toThrow();
  });
});
