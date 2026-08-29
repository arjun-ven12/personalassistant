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
    expect(api.DEPLOYMENT_MODE).toBe("private");
    expect(api.CACHE_ENABLED).toBe(true);
    expect(api.EMBEDDING_PROVIDER).toBe("disabled");
    expect(api.MEMORY_ENABLED).toBe(true);
    expect(api.FEATURE_AUTONOMOUS_SUGGESTIONS).toBe(false);
    expect(api.NETWORK_VERIFIER_MODE).toBe("unknown");
    expect(api.PRIVILEGED_EXECUTION_ENABLED).toBe(false);
    expect(api.READ_ONLY_EXECUTION_ENABLED).toBe(false);
    expect(api.OPENAI_ACCOUNTING_INPUT_PER_MILLION_TOKENS).toBe("1");
    expect(api.OPENAI_ACCOUNTING_OUTPUT_PER_MILLION_TOKENS).toBe("10");
    const macAgent = parseMacAgentEnvironment({});
    expect(macAgent.ALEXA_REQUIRE_PRIVATE_NETWORK).toBe(true);
    expect(macAgent.ALEXA_AGENT_ENVIRONMENT).toBe("development");
    expect(macAgent.DESKTOP_STT_PROVIDER).toBe("whisper_cpp");
    expect(macAgent.DESKTOP_STT_FALLBACK_PROVIDER).toBe("apple_speech");
    expect(macAgent.DESKTOP_STT_WHISPER_MODEL_VERSION).toBe("ggml-base.en");
    expect(macAgent.DESKTOP_STT_WHISPER_NO_SPEECH_THRESHOLD).toBe(0.25);
    expect(macAgent.ALEXA_UPDATE_PROVIDER).toBe("disabled");
    expect(macAgent.ALEXA_UPDATE_AUTO_CHECK).toBe(false);
    expect(parseWebEnvironment({}).VITE_API_BASE_URL).toBe("http://localhost:3001");
  });

  it("requires an HTTPS feed for Mac Agent production updating", () => {
    expect(() =>
      parseMacAgentEnvironment({
        ALEXA_UPDATE_PROVIDER: "generic",
        ALEXA_UPDATE_FEED_URL: "http://updates.example.test/mac",
      }),
    ).toThrow();
    expect(() =>
      parseMacAgentEnvironment({
        ALEXA_UPDATE_PROVIDER: "generic",
        ALEXA_UPDATE_FEED_URL: "https://updates.example.test/mac",
        ALEXA_UPDATE_AUTO_CHECK: "true",
      }),
    ).not.toThrow();
  });

  it("prevents production Mac Agent configuration from targeting localhost", () => {
    expect(() =>
      parseMacAgentEnvironment({ ALEXA_AGENT_ENVIRONMENT: "production" }),
    ).toThrow();
  });

  it("rejects malformed ports and origins", () => {
    expect(() => parseApiEnvironment({ API_PORT: "70000" })).toThrow();
    expect(() => parseApiEnvironment({ SESSION_TTL_SECONDS: "10" })).toThrow();
    expect(() => parseApiEnvironment({ WEB_ORIGIN: "not-a-url" })).toThrow();
    expect(() =>
      parseApiEnvironment({ OPENAI_ACCOUNTING_INPUT_PER_MILLION_TOKENS: "free" }),
    ).toThrow();
    expect(() =>
      parseMacAgentEnvironment({
        ALEXA_API_BASE_URL: "http://api.alexa.example",
        ALEXA_WEB_BASE_URL: "https://alexa.example",
      }),
    ).toThrow();
    expect(() =>
      parseMacAgentEnvironment({
        ALEXA_API_BASE_URL: "https://api.alexa.example",
        ALEXA_WEB_BASE_URL: "https://alexa.example",
        ALEXA_REQUIRE_PRIVATE_NETWORK: "false",
      }),
    ).not.toThrow();
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

  it("accepts a fail-closed public cloud container profile", () => {
    expect(() =>
      parseApiEnvironment({
        NODE_ENV: "production",
        DEPLOYMENT_MODE: "cloud",
        API_HOST: "0.0.0.0",
        PORT: "8080",
        PUBLIC_BASE_URL: "https://api.alexa.example",
        WEB_ORIGIN: "https://alexa.example",
        ALLOWED_HOSTS: "api.alexa.example",
        TRUSTED_PROXY_MODE: "one-hop",
        PRIVATE_NETWORK_REQUIRED: "false",
        TAILSCALE_REQUIRED: "false",
        NETWORK_VERIFIER_MODE: "unknown",
        STORE_MODE: "postgres",
        DATABASE_URL: "postgresql://placeholder.invalid/assistant?sslmode=require",
        REDIS_URL: "https://placeholder.upstash.io",
        REDIS_TOKEN: "placeholder-token",
        SESSION_COOKIE_NAME: "__Host-alexa_session",
        AUTH_ALLOW_OWNER_BOOTSTRAP: "false",
        LOCAL_AI_ENABLED: "false",
        EMBEDDING_PROVIDER: "disabled",
        OPENAI_ENABLED: "false",
      }),
    ).not.toThrow();
  });

  it("rejects cloud profiles without HTTPS, exact hosts, or bounded proxy trust", () => {
    const base = {
      NODE_ENV: "production",
      DEPLOYMENT_MODE: "cloud",
      API_HOST: "0.0.0.0",
      PUBLIC_BASE_URL: "https://api.alexa.example",
      WEB_ORIGIN: "https://alexa.example",
      ALLOWED_HOSTS: "api.alexa.example",
      TRUSTED_PROXY_MODE: "one-hop",
      PRIVATE_NETWORK_REQUIRED: "false",
      STORE_MODE: "postgres",
      DATABASE_URL: "postgresql://placeholder.invalid/assistant?sslmode=require",
      REDIS_URL: "https://placeholder.upstash.io",
      REDIS_TOKEN: "placeholder-token",
      SESSION_COOKIE_NAME: "__Host-alexa_session",
      AUTH_ALLOW_OWNER_BOOTSTRAP: "false",
      LOCAL_AI_ENABLED: "false",
      EMBEDDING_PROVIDER: "disabled",
      OPENAI_ENABLED: "false",
    };
    expect(() =>
      parseApiEnvironment({ ...base, PUBLIC_BASE_URL: "http://api.alexa.example" }),
    ).toThrow();
    expect(() =>
      parseApiEnvironment({ ...base, ALLOWED_HOSTS: "other.example" }),
    ).toThrow();
    expect(() =>
      parseApiEnvironment({ ...base, TRUSTED_PROXY_MODE: "none" }),
    ).toThrow();
    expect(() =>
      parseApiEnvironment({ ...base, PRIVATE_NETWORK_REQUIRED: "true" }),
    ).toThrow();
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
