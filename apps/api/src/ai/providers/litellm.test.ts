import { describe, expect, it, vi } from "vitest";

import { LiteLLMGatewayProvider } from "./litellm.js";

describe("controlled LiteLLM AIRouter adapter", () => {
  it("rejects unapproved and insecure gateway hosts", () => {
    expect(
      () =>
        new LiteLLMGatewayProvider(
          "https://gateway.example",
          "key",
          ["approved"],
          ["internal.example"],
        ),
    ).toThrow(/allowlist/);
    expect(
      () =>
        new LiteLLMGatewayProvider(
          "http://gateway.example",
          "key",
          ["approved"],
          ["gateway.example"],
        ),
    ).toThrow(/HTTPS/);
  });

  it("accepts only the exact AIRouter-selected model and applies rate-limit cooldown", async () => {
    const fetchImpl: typeof fetch = vi.fn(() =>
      Promise.resolve(new Response("{}", { status: 429 })),
    );
    const provider = new LiteLLMGatewayProvider(
      "https://gateway.example",
      "server-owned-key",
      ["approved"],
      ["gateway.example"],
      fetchImpl,
    );
    const base = {
      purpose: "CONVERSATION" as const,
      input: [
        { role: "user" as const, content: [{ type: "text" as const, text: "hello" }] },
      ],
      maxOutputTokens: 50,
    };
    await expect(
      provider.generate({
        ...base,
        model: { type: "MODEL", providerId: "other", modelId: "approved" },
      }),
    ).rejects.toMatchObject({ code: "MODEL_NOT_FOUND" });
    await expect(
      provider.generate({
        ...base,
        model: { type: "MODEL", providerId: "litellm_gateway", modelId: "approved" },
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(
      provider.generate({
        ...base,
        model: { type: "MODEL", providerId: "litellm_gateway", modelId: "approved" },
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
