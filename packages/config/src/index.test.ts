import { describe, expect, it } from "vitest";

import {
  parseApiEnvironment,
  parseMacAgentEnvironment,
  parseWebEnvironment,
} from "./index.js";

describe("environment validation", () => {
  it("applies secure development defaults", () => {
    const api = parseApiEnvironment({});
    expect(api.PRIVATE_NETWORK_REQUIRED).toBe(true);
    expect(api.AUTH_ALLOW_OWNER_BOOTSTRAP).toBe(true);
    expect(api.SESSION_COOKIE_NAME).toBe("alexa_session");
    expect(api.SESSION_TTL_SECONDS).toBe(28_800);
    expect(api.STORE_MODE).toBe("memory");
    expect(api.CACHE_ENABLED).toBe(true);
    expect(api.EMBEDDING_PROVIDER).toBe("disabled");
    expect(api.MEMORY_ENABLED).toBe(true);
    expect(api.FEATURE_AUTONOMOUS_SUGGESTIONS).toBe(false);
    expect(api.NETWORK_VERIFIER_MODE).toBe("unknown");
    expect(api.PRIVILEGED_EXECUTION_ENABLED).toBe(false);
    expect(api.READ_ONLY_EXECUTION_ENABLED).toBe(false);
    expect(api.OPENAI_ACCOUNTING_INPUT_PER_MILLION_TOKENS).toBe("1");
    expect(api.OPENAI_ACCOUNTING_OUTPUT_PER_MILLION_TOKENS).toBe("10");
    expect(parseMacAgentEnvironment({}).ALEXA_REQUIRE_PRIVATE_NETWORK).toBe(true);
    expect(parseWebEnvironment({}).VITE_API_BASE_URL).toBe("http://localhost:3001");
  });

  it("rejects malformed ports and origins", () => {
    expect(() => parseApiEnvironment({ API_PORT: "70000" })).toThrow();
    expect(() => parseApiEnvironment({ SESSION_TTL_SECONDS: "10" })).toThrow();
    expect(() => parseApiEnvironment({ WEB_ORIGIN: "not-a-url" })).toThrow();
    expect(() =>
      parseApiEnvironment({ OPENAI_ACCOUNTING_INPUT_PER_MILLION_TOKENS: "free" }),
    ).toThrow();
  });

  it("fails closed for incomplete production security configuration", () => {
    expect(() => parseApiEnvironment({ NODE_ENV: "production" })).toThrow();
    expect(() =>
      parseApiEnvironment({
        NODE_ENV: "production",
        STORE_MODE: "postgres",
        DATABASE_URL: "postgresql://placeholder.invalid/assistant",
        REDIS_URL: "https://placeholder.upstash.io",
        REDIS_TOKEN: "placeholder-token",
        EMBEDDING_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-placeholder",
        TAILSCALE_REQUIRED: "true",
        NETWORK_VERIFIER_MODE: "tailscale",
        TAILSCALE_EXPECTED_DNS_NAME: "assistant.example.ts.net",
        TAILSCALE_TRUST_SERVE_PROXY: "true",
        TRUSTED_PROXY_MODE: "loopback",
        WEB_ORIGIN: "https://assistant.example.ts.net",
        ALLOWED_HOSTS: "assistant.example.ts.net",
        SESSION_COOKIE_NAME: "__Host-assistant_session",
        AUTH_ALLOW_OWNER_BOOTSTRAP: "false",
      }),
    ).not.toThrow();
  });

  it("keeps OpenAI and embeddings optional for a secure production startup", () => {
    expect(() =>
      parseApiEnvironment({
        NODE_ENV: "production",
        STORE_MODE: "postgres",
        DATABASE_URL: "postgresql://placeholder.invalid/assistant",
        REDIS_URL: "https://placeholder.upstash.io",
        REDIS_TOKEN: "placeholder-token",
        EMBEDDING_PROVIDER: "disabled",
        OPENAI_ENABLED: "false",
        TAILSCALE_REQUIRED: "true",
        NETWORK_VERIFIER_MODE: "tailscale",
        TAILSCALE_EXPECTED_DNS_NAME: "assistant.example.ts.net",
        TAILSCALE_TRUST_SERVE_PROXY: "true",
        TRUSTED_PROXY_MODE: "loopback",
        WEB_ORIGIN: "https://assistant.example.ts.net",
        ALLOWED_HOSTS: "assistant.example.ts.net",
        SESSION_COOKIE_NAME: "__Host-assistant_session",
        AUTH_ALLOW_OWNER_BOOTSTRAP: "false",
      }),
    ).not.toThrow();
  });

  it("rejects execution and unsafe production network modes", () => {
    expect(() =>
      parseApiEnvironment({ PRIVILEGED_EXECUTION_ENABLED: "true" }),
    ).toThrow();
    expect(() =>
      parseApiEnvironment({
        NODE_ENV: "production",
        STORE_MODE: "postgres",
        DATABASE_URL: "postgresql://placeholder.invalid/assistant",
        REDIS_URL: "https://placeholder.upstash.io",
        REDIS_TOKEN: "placeholder-token",
        EMBEDDING_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-placeholder",
        TAILSCALE_REQUIRED: "true",
        NETWORK_VERIFIER_MODE: "test",
        TAILSCALE_EXPECTED_DNS_NAME: "assistant.example.ts.net",
        TAILSCALE_TRUST_SERVE_PROXY: "true",
        TRUSTED_PROXY_MODE: "loopback",
        WEB_ORIGIN: "https://assistant.example.ts.net",
        ALLOWED_HOSTS: "*",
        SESSION_COOKIE_NAME: "__Host-assistant_session",
        AUTH_ALLOW_OWNER_BOOTSTRAP: "false",
      }),
    ).toThrow();
  });

  it("requires persistent signing and PostgreSQL for production read-only execution", () => {
    const base = {
      NODE_ENV: "production",
      STORE_MODE: "postgres",
      DATABASE_URL: "postgresql://placeholder.invalid/assistant",
      REDIS_URL: "https://placeholder.upstash.io",
      REDIS_TOKEN: "placeholder-token",
      EMBEDDING_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-placeholder",
      TAILSCALE_REQUIRED: "true",
      NETWORK_VERIFIER_MODE: "tailscale",
      TAILSCALE_EXPECTED_DNS_NAME: "assistant.example.ts.net",
      TAILSCALE_TRUST_SERVE_PROXY: "true",
      TRUSTED_PROXY_MODE: "loopback",
      WEB_ORIGIN: "https://assistant.example.ts.net",
      ALLOWED_HOSTS: "assistant.example.ts.net",
      SESSION_COOKIE_NAME: "__Host-assistant_session",
      AUTH_ALLOW_OWNER_BOOTSTRAP: "false",
      READ_ONLY_EXECUTION_ENABLED: "true",
    };
    expect(() => parseApiEnvironment(base)).toThrow();
    expect(() =>
      parseApiEnvironment({
        ...base,
        SERVER_EXECUTION_SIGNING_KEY_PATH: "/secure/server-key.json",
      }),
    ).not.toThrow();
  });
});
