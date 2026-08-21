/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-base-to-string */
import { describe, expect, it } from "vitest";
import { OllamaLocalRuntime } from "./runtime.js";

describe("OllamaLocalRuntime", () => {
  it("maps tags and structured generation through the local API", async () => {
    const calls: Request[] = [];
    const runtime = new OllamaLocalRuntime(
      "http://127.0.0.1:11434",
      async (input, init) => {
        calls.push(new Request(input, init));
        if (String(input).endsWith("/api/tags"))
          return new Response(
            JSON.stringify({ models: [{ name: "gemma3:4b", size: 123 }] }),
            { status: 200 },
          );
        return new Response(
          JSON.stringify({
            response:
              '{"intent":null,"entities":{},"confidence":0.2,"requiresClarification":true,"clarificationCandidates":[]}',
          }),
          { status: 200 },
        );
      },
    );
    expect(await runtime.isModelAvailable("gemma3:4b")).toBe(true);
    const result = await runtime.generateStructured({
      model: "gemma3:4b",
      system: "interpret",
      prompt: "hello",
      schemaName: "x",
      schemaDescription: "y",
      jsonSchema: { type: "object" },
      temperature: 0.1,
      maxOutputTokens: 20,
      priority: "INTERACTIVE_TEXT",
      timeoutMs: 1_000,
    });
    expect(result.text).toContain("requiresClarification");
    const generation = calls.find((call) => call.url.endsWith("/api/generate"));
    expect(generation).toBeDefined();
    expect(await generation?.clone().json()).toMatchObject({
      format: { type: "object" },
    });
  });
});
