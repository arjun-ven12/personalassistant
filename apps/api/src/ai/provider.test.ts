/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-base-to-string */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SkillDraftProposalSchema } from "@alexa-control/shared";
import { AIProviderError } from "./errors.js";
import { AIModelRegistry, AIProviderRegistry } from "./registry.js";
import { AIRuntimeService } from "./runtime-service.js";
import { OllamaProvider } from "./providers/ollama.js";
import { OpenAIProvider } from "./providers/openai.js";
import type { LocalModelRuntime } from "../local-ai/runtime.js";

const localRuntime = (
  structured = '{"category":"context","confidence":0.8}',
): LocalModelRuntime => ({
  id: "ollama",
  healthCheck: async () => true,
  listModels: async () => [{ name: "gemma3:4b" }],
  isModelAvailable: async () => true,
  loadModel: async () => undefined,
  unloadModel: async () => undefined,
  generate: async () => ({ model: "gemma3:4b", text: "local" }),
  generateStructured: async () => ({ model: "gemma3:4b", text: structured }),
});

describe("AI provider contract", () => {
  it("resolves role mappings without exposing provider implementation details", async () => {
    const provider = new OllamaProvider(localRuntime());
    const providers = new AIProviderRegistry();
    providers.register(provider);
    const models = new AIModelRegistry();
    models.upsert(provider.modelDescriptor());
    const runtime = new AIRuntimeService(providers, models);
    runtime.setRole({
      role: "FAST_INTERPRETER",
      providerId: "ollama",
      modelId: "gemma3:4b",
      enabled: true,
    });
    const response = await runtime.generate({
      purpose: "INTERPRETATION",
      model: { type: "ROLE", role: "FAST_INTERPRETER" },
      input: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
      timeoutMs: 1_000,
    });
    expect(response.providerId).toBe("ollama");
    expect(response.modelId).toBe("gemma3:4b");
    expect(response.outputText).toBe("local");
  });

  it("validates structured output locally", async () => {
    const provider = new OllamaProvider(localRuntime());
    const result = await provider.generateStructured({
      purpose: "CLASSIFICATION",
      model: { type: "MODEL", providerId: "ollama", modelId: "gemma3:4b" },
      input: [{ role: "user", content: [{ type: "text", text: "classify" }] }],
      outputMode: "STRUCTURED",
      timeoutMs: 1_000,
      schemaName: "Classification",
      schema: z.object({ category: z.string(), confidence: z.number() }),
    });
    expect(result.structuredOutput.category).toBe("context");
    const invalid = new OllamaProvider(localRuntime("bad"));
    await expect(
      invalid.generateStructured({
        purpose: "CLASSIFICATION",
        model: { type: "MODEL", providerId: "ollama", modelId: "gemma3:4b" },
        input: [{ role: "user", content: [{ type: "text", text: "classify" }] }],
        outputMode: "STRUCTURED",
        timeoutMs: 1_000,
        schemaName: "Classification",
        schema: z.object({ category: z.string(), confidence: z.number() }),
      }),
    ).rejects.toMatchObject({ code: "OUTPUT_VALIDATION_FAILED" });
  });

  it("forwards the SkillDraftProposal JSON schema to Ollama structured generation", async () => {
    let forwardedSchema: Record<string, unknown> | undefined;
    const provider = new OllamaProvider({
      ...localRuntime(
        '{"name":"Project Summary","purpose":"Summarize project state","inputs":[],"outputs":[{"name":"summary","description":"Project summary"}],"steps":[{"order":1,"description":"Read project state","capabilityHint":"state_inspection"}],"assumptions":[],"errorHandling":[]}',
      ),
      generateStructured: async (request) => {
        forwardedSchema = request.jsonSchema;
        return {
          model: "gemma3:4b",
          text: '{"name":"Project Summary","purpose":"Summarize project state","inputs":[],"outputs":[{"name":"summary","description":"Project summary"}],"steps":[{"order":1,"description":"Read project state","capabilityHint":"state_inspection"}],"assumptions":[],"errorHandling":[]}',
        };
      },
    });
    await provider.generateStructured({
      purpose: "OTHER",
      model: { type: "MODEL", providerId: "ollama", modelId: "gemma3:4b" },
      input: [{ role: "user", content: [{ type: "text", text: "draft" }] }],
      outputMode: "STRUCTURED",
      timeoutMs: 1_000,
      schemaName: "SkillDraftProposal",
      schema: SkillDraftProposalSchema,
      jsonSchema: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } },
      },
    });
    expect(forwardedSchema).toMatchObject({ type: "object", required: ["name"] });
  });

  it("keeps OpenAI unconfigured without crashing startup or exposing a key", async () => {
    const provider = new OpenAIProvider(undefined, "gpt-5.6-luna");
    const health = await provider.healthCheck();
    expect(health.status).toBe("UNCONFIGURED");
    expect(provider.describe().credentialState).toBe("MISSING");
    expect(JSON.stringify(provider.describe())).not.toContain("sk-");
  });

  it("normalizes a mocked OpenAI response", async () => {
    const provider = new OpenAIProvider(
      "test-key",
      "gpt-5.6-luna",
      "https://example.test/v1",
      async (input) =>
        new Response(
          JSON.stringify(
            input.toString().endsWith("/models")
              ? { data: [] }
              : {
                  id: "resp_1",
                  output_text: "cloud",
                  usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
                },
          ),
          { status: 200 },
        ),
    );
    const response = await provider.generate({
      purpose: "CONVERSATION",
      input: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
      timeoutMs: 1_000,
    });
    expect(response.outputText).toBe("cloud");
    expect(response.usage?.totalTokens).toBe(5);
  });

  it("serializes bounded JSON task input instead of sending an empty OpenAI message", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const provider = new OpenAIProvider(
      "test-key",
      "gpt-5.6-luna",
      "https://example.test/v1",
      async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ id: "resp_json", output_text: "ok" }), {
          status: 200,
        });
      },
    );
    await provider.generate({
      purpose: "CODING",
      input: [
        {
          role: "user",
          content: [{ type: "json", value: { task: "inspect repository" } }],
        },
      ],
      timeoutMs: 1_000,
    });
    expect(requestBody).toMatchObject({
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: '{"task":"inspect repository"}' }],
        },
      ],
    });
  });

  it("surfaces a bounded OpenAI validation message without provider secrets", async () => {
    const provider = new OpenAIProvider(
      "test-key",
      "gpt-5.6-luna",
      "https://example.test/v1",
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "Invalid input content. Bearer sk_should_not_be_exposed",
            },
          }),
          { status: 400 },
        ),
    );
    await expect(
      provider.generate({
        purpose: "CODING",
        input: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "OpenAI returned HTTP 400: Invalid input content. Bearer [redacted]",
    });
  });

  it("omits unsupported temperature settings for GPT-5 models", async () => {
    const requestBodies: Record<string, unknown>[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ id: "resp_1", output_text: "cloud" }), {
        status: 200,
      });
    };
    const luna = new OpenAIProvider(
      "test-key",
      "gpt-5.6-luna",
      "https://example.test/v1",
      fetchImpl,
    );
    const legacy = new OpenAIProvider(
      "test-key",
      "gpt-4.1",
      "https://example.test/v1",
      fetchImpl,
    );
    const request = {
      purpose: "CONVERSATION" as const,
      input: [
        { role: "user" as const, content: [{ type: "text" as const, text: "hello" }] },
      ],
      temperature: 0.35,
      timeoutMs: 1_000,
    };

    await luna.generate(request);
    await legacy.generate(request);

    expect(requestBodies[0]).not.toHaveProperty("temperature");
    expect(requestBodies[1]).toHaveProperty("temperature", 0.35);
  });

  it("uses non-strict provider generation for locally validated record schemas", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const provider = new OpenAIProvider(
      "test-key",
      "gpt-5.6-luna",
      "https://example.test/v1",
      async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            id: "resp_record",
            output_text: '{"summary":"ok","input":{"path":"src/app.ts"}}',
          }),
          { status: 200 },
        );
      },
    );
    const schema = z.object({
      summary: z.string(),
      input: z.record(z.string(), z.unknown()),
    });
    const result = await provider.generateStructured({
      purpose: "CODING",
      input: [{ role: "user", content: [{ type: "text", text: "plan" }] }],
      outputMode: "STRUCTURED",
      timeoutMs: 1_000,
      schemaName: "engineering_proposal",
      schema,
      jsonSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          input: { type: "object", additionalProperties: {} },
        },
        required: ["summary", "input"],
        additionalProperties: false,
      },
    });
    expect(result.structuredOutput.input).toEqual({ path: "src/app.ts" });
    expect(requestBody).toMatchObject({
      text: { format: { type: "json_schema", strict: false } },
    });
  });

  it("enables provider-native web search only for an explicitly classified research task", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const provider = new OpenAIProvider(
      "test-key",
      "gpt-5.6-luna",
      "https://example.test/v1",
      async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            id: "resp_research",
            output_text:
              '{"summary":"Sourced","confidence":0.9,"evidence":["https://example.test/source"]}',
          }),
          { status: 200 },
        );
      },
    );
    await provider.generateStructured({
      purpose: "REASONING",
      input: [{ role: "user", content: [{ type: "text", text: "research" }] }],
      outputMode: "STRUCTURED",
      timeoutMs: 1_000,
      schemaName: "research_result",
      schema: z.object({
        summary: z.string(),
        confidence: z.number(),
        evidence: z.array(z.string()),
      }),
      metadata: { externalResearch: true },
    });
    expect(requestBody).toMatchObject({ tools: [{ type: "web_search" }] });
  });

  it("normalizes provider failures", async () => {
    const provider = new OpenAIProvider(
      "test-key",
      "gpt-5.6-luna",
      "https://example.test/v1",
      async () => new Response("", { status: 429 }),
    );
    await expect(
      provider.generate({
        purpose: "CONVERSATION",
        input: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
        timeoutMs: 1_000,
      }),
    ).rejects.toBeInstanceOf(AIProviderError);
    await expect(
      provider.generate({
        purpose: "CONVERSATION",
        input: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("owns bounded local concurrency in OllamaProvider", async () => {
    let active = 0;
    let maximum = 0;
    const fake = localRuntime();
    fake.generate = async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { model: "gemma3:4b", text: "local" };
    };
    const provider = new OllamaProvider(fake, "gemma3:4b", true, 1);
    await Promise.all(
      Array.from({ length: 4 }, () =>
        provider.generate({
          purpose: "CONVERSATION",
          input: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
          timeoutMs: 1_000,
        }),
      ),
    );
    expect(maximum).toBe(1);
  });
});
