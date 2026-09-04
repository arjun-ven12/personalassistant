import { z } from "zod";

const booleanValue = z.preprocess(
  (value) => (typeof value === "boolean" ? String(value) : value),
  z.enum(["true", "false"]).transform((value) => value === "true"),
);

const csv = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : value,
  z.array(z.string().trim().min(1)),
);

const durationSeconds = (minimum: number, maximum: number, fallback: number) =>
  z.coerce.number().int().min(minimum).max(maximum).default(fallback);

const optionalSecret = z.string().trim().min(1).optional();
const decimalValue = z.string().regex(/^\d+(\.\d{1,8})?$/);

export const ApiEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DEPLOYMENT_MODE: z.enum(["private", "cloud"]).default("private"),
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    PORT: z.coerce.number().int().min(1).max(65_535).optional(),
    PUBLIC_BASE_URL: z.string().url().optional(),
    WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    LOG_REDACTION_ENABLED: booleanValue.default(true),
    PRIVATE_NETWORK_REQUIRED: booleanValue.default(true),
    TAILSCALE_REQUIRED: booleanValue.default(false),
    TAILSCALE_FUNNEL_ENABLED: booleanValue.default(false),
    NETWORK_VERIFIER_MODE: z.enum(["unknown", "tailscale", "test"]).default("unknown"),
    TAILSCALE_EXPECTED_DNS_NAME: z.string().trim().min(1).max(255).optional(),
    TAILSCALE_EXPECTED_TAGS: csv.default([]),
    TAILSCALE_LOCALAPI_SOCKET: z
      .string()
      .trim()
      .min(1)
      .default("/var/run/tailscale/tailscaled.sock"),
    TAILSCALE_TRUST_SERVE_PROXY: booleanValue.default(false),
    TRUSTED_PROXY_MODE: z.enum(["none", "loopback", "one-hop"]).default("none"),
    ALLOWED_HOSTS: csv.default(["localhost", "127.0.0.1"]),
    STORE_MODE: z.enum(["memory", "postgres"]).default("memory"),
    DATABASE_URL: z.string().trim().min(1).optional(),
    DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(20),
    DATABASE_SSL_MODE: z.enum(["disable", "require", "verify-full"]).default("require"),
    REDIS_URL: z.string().url().optional(),
    REDIS_TOKEN: optionalSecret,
    REDIS_HOST: z.string().trim().min(1).max(255).optional(),
    REDIS_PORT: z.coerce.number().int().min(1).max(65_535).default(6379),
    REDIS_USERNAME: z.string().trim().min(1).max(255).optional(),
    REDIS_PASSWORD: optionalSecret,
    REDIS_TLS: booleanValue.default(true),
    REDIS_NAMESPACE: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z0-9:_-]+$/)
      .default("personalassistant"),
    CACHE_ENABLED: booleanValue.default(true),
    CACHE_DEFAULT_TTL: durationSeconds(1, 86_400, 900),
    CACHE_CONTEXT_TTL: durationSeconds(1, 86_400, 300),
    CACHE_MEMORY_TTL: durationSeconds(1, 604_800, 3_600),
    CACHE_REPOSITORY_TTL: durationSeconds(1, 604_800, 1_800),
    EMBEDDING_PROVIDER: z.enum(["openai", "disabled"]).default("disabled"),
    EMBEDDING_MODEL: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .default("text-embedding-3-small"),
    EMBEDDING_BATCH_SIZE: z.coerce.number().int().min(1).max(256).default(32),
    EMBEDDING_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
    OPENAI_API_KEY: optionalSecret,
    MEMORY_ENABLED: booleanValue.default(true),
    MEMORY_RETRIEVAL_LIMIT: z.coerce.number().int().min(1).max(100).default(12),
    MEMORY_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
    MEMORY_BACKGROUND_CONSOLIDATION: booleanValue.default(true),
    MEMORY_MAX_CONTEXT: z.coerce.number().int().min(1).max(200).default(40),
    KNOWLEDGE_GRAPH_ENABLED: booleanValue.default(true),
    KNOWLEDGE_GRAPH_AUTO_LINK: booleanValue.default(true),
    KNOWLEDGE_GRAPH_MAX_DEPTH: z.coerce.number().int().min(1).max(10).default(4),
    BACKGROUND_WORKERS: z.coerce.number().int().min(0).max(64).default(4),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(256).default(8),
    MEMORY_CONSOLIDATION_INTERVAL: durationSeconds(30, 86_400, 300),
    SUMMARY_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    SEMANTIC_SEARCH_ENABLED: booleanValue.default(true),
    HYBRID_SEARCH_ENABLED: booleanValue.default(true),
    KEYWORD_WEIGHT: z.coerce.number().min(0).max(1).default(0.35),
    VECTOR_WEIGHT: z.coerce.number().min(0).max(1).default(0.65),
    MEMORY_METRICS: booleanValue.default(true),
    CACHE_METRICS: booleanValue.default(true),
    VECTOR_METRICS: booleanValue.default(true),
    REDIS_METRICS: booleanValue.default(true),
    FEATURE_MEMORY: booleanValue.default(true),
    FEATURE_VECTOR_SEARCH: booleanValue.default(true),
    FEATURE_AGENT_MEMORY: booleanValue.default(true),
    FEATURE_MEMORY_TIMELINE: booleanValue.default(true),
    FEATURE_KNOWLEDGE_GRAPH: booleanValue.default(true),
    FEATURE_AUTONOMOUS_SUGGESTIONS: booleanValue.default(false),
    AUTH_ALLOW_OWNER_BOOTSTRAP: booleanValue.default(true),
    SESSION_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default("alexa_session"),
    SESSION_TTL_SECONDS: durationSeconds(300, 2_592_000, 28_800),
    SESSION_IDLE_TTL_SECONDS: durationSeconds(300, 86_400, 1_800),
    SESSION_ABSOLUTE_TTL_SECONDS: durationSeconds(900, 604_800, 28_800),
    CSRF_TOKEN_TTL_SECONDS: durationSeconds(60, 3_600, 900),
    RECENT_AUTH_TTL_SECONDS: durationSeconds(60, 600, 300),
    RECOVERY_CODE_COUNT: z.coerce.number().int().min(6).max(20).default(10),
    PAIRING_TTL_SECONDS: durationSeconds(60, 900, 300),
    SIGNED_REQUEST_TOLERANCE_SECONDS: durationSeconds(30, 600, 120),
    PRIVILEGED_EXECUTION_ENABLED: booleanValue.default(false),
    READ_ONLY_EXECUTION_ENABLED: booleanValue.default(false),
    EXECUTION_REQUEST_TTL_SECONDS: durationSeconds(30, 600, 120),
    EXECUTION_RESULT_RETENTION_SECONDS: durationSeconds(300, 604_800, 86_400),
    MAX_FILE_READ_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(131_072)
      .default(131_072),
    MAX_GIT_OUTPUT_BYTES: z.coerce
      .number()
      .int()
      .min(4_096)
      .max(262_144)
      .default(262_144),
    MAX_GIT_ENTRIES: z.coerce.number().int().min(1).max(1_000).default(1_000),
    MAX_EXECUTION_RESULT_BYTES: z.coerce
      .number()
      .int()
      .min(16_384)
      .max(524_288)
      .default(524_288),
    MAX_REPOSITORY_SCAN_RESULT_BYTES: z.coerce
      .number()
      .int()
      .min(524_288)
      .max(16_777_216)
      .default(4_194_304),
    SERVER_EXECUTION_SIGNING_KEY_PATH: z.string().trim().min(1).max(1_024).optional(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    GOOGLE_REDIRECT_URI: z.string().url().optional(),
    GMAIL_OAUTH_CREDENTIAL_JSON: optionalSecret,
    STRIPE_TEST_CREDENTIAL_JSON: optionalSecret,
    XERO_SANDBOX_CREDENTIAL_JSON: optionalSecret,
    GOOGLE_ADS_TEST_CREDENTIAL_JSON: optionalSecret,
    GOOGLE_ANALYTICS_CREDENTIAL_JSON: optionalSecret,
    SHOPIFY_DEVELOPMENT_CREDENTIAL_JSON: optionalSecret,
    FCM_PROJECT_ID: z.string().trim().min(1).max(160).optional(),
    LOCAL_AI_ENABLED: booleanValue.default(true),
    LOCAL_AI_RUNTIME: z.literal("ollama").default("ollama"),
    OLLAMA_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
    LOCAL_AI_DEFAULT_MODEL: z.string().trim().min(1).max(160).default("gemma3:4b"),
    LOCAL_AI_MAX_CONCURRENT_REQUESTS: z.coerce.number().int().min(1).max(4).default(1),
    LOCAL_AI_INTERPRETATION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(120_000)
      .default(15_000),
    LOCAL_AI_CONVERSATION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(120_000)
      .default(45_000),
    LOCAL_AI_BACKGROUND_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(120_000)
      .default(120_000),
    LOCAL_AI_STRUCTURED_RETRIES: z.coerce.number().int().min(0).max(1).default(1),
    LOCAL_AI_IDLE_UNLOAD_MINUTES: z.coerce.number().int().min(0).max(120).default(10),
    LOCAL_AI_MIN_FREE_STORAGE_GB: z.coerce.number().int().min(1).max(100).default(10),
    LOCAL_AI_CONTEXT_MAX_CHARACTERS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(32_000)
      .default(16_000),
    OPENAI_ENABLED: booleanValue.default(true),
    OPENAI_DEFAULT_MODEL: z.string().trim().min(1).max(160).default("gpt-5.6-luna"),
    OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
    OPENAI_ACCOUNTING_INPUT_PER_MILLION_TOKENS: decimalValue.default("1"),
    OPENAI_ACCOUNTING_OUTPUT_PER_MILLION_TOKENS: decimalValue.default("10"),
    AI_ROLE_FAST_INTERPRETER_PROVIDER: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .default("openai"),
    AI_ROLE_FAST_INTERPRETER_MODEL: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .default("gpt-5.6-luna"),
    AI_ROLE_GENERAL_REASONER_PROVIDER: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .default("openai"),
    AI_ROLE_GENERAL_REASONER_MODEL: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .default("gpt-5.6-luna"),
    AI_ROLE_WRITER_PROVIDER: z.string().trim().min(1).max(80).default("openai"),
    AI_ROLE_WRITER_MODEL: z.string().trim().min(1).max(160).default("gpt-5.6-luna"),
    AI_ROLE_CODER_PROVIDER: z.string().trim().min(1).max(80).default("openai"),
    AI_ROLE_CODER_MODEL: z.string().trim().min(1).max(160).default("gpt-5.6-luna"),
    AI_ROLE_DEEP_REASONER_PROVIDER: z.string().trim().min(1).max(80).default("openai"),
    AI_ROLE_DEEP_REASONER_MODEL: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .default("gpt-5.6-luna"),
  })
  .passthrough()
  .superRefine((environment, context) => {
    if (
      environment.SESSION_IDLE_TTL_SECONDS > environment.SESSION_ABSOLUTE_TTL_SECONDS
    ) {
      context.addIssue({
        code: "custom",
        path: ["SESSION_IDLE_TTL_SECONDS"],
        message: "The idle session lifetime cannot exceed the absolute lifetime.",
      });
    }
    if (environment.CACHE_ENABLED) {
      const upstashConfigured = Boolean(
        environment.REDIS_URL && environment.REDIS_TOKEN,
      );
      const standardConfigured = Boolean(
        environment.REDIS_HOST && environment.REDIS_PASSWORD,
      );
      if (
        environment.NODE_ENV === "production" &&
        !upstashConfigured &&
        !standardConfigured
      ) {
        context.addIssue({
          code: "custom",
          path: ["REDIS_URL"],
          message:
            "Production cache requires either Upstash REDIS_URL/REDIS_TOKEN or standard Redis host/password.",
        });
      }
    }
    const weightTotal = environment.KEYWORD_WEIGHT + environment.VECTOR_WEIGHT;
    if (environment.HYBRID_SEARCH_ENABLED && Math.abs(weightTotal - 1) > 0.001) {
      context.addIssue({
        code: "custom",
        path: ["KEYWORD_WEIGHT"],
        message: "Hybrid search weights must sum to 1.",
      });
    }
    if (environment.FEATURE_AUTONOMOUS_SUGGESTIONS) {
      context.addIssue({
        code: "custom",
        path: ["FEATURE_AUTONOMOUS_SUGGESTIONS"],
        message: "Autonomous suggestions remain disabled by policy.",
      });
    }
    if (environment.PRIVILEGED_EXECUTION_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["PRIVILEGED_EXECUTION_ENABLED"],
        message: "Privileged execution is unavailable in Phase 2.3.",
      });
    }
    if (
      environment.READ_ONLY_EXECUTION_ENABLED &&
      environment.STORE_MODE !== "postgres" &&
      environment.NODE_ENV === "production"
    ) {
      context.addIssue({
        code: "custom",
        path: ["READ_ONLY_EXECUTION_ENABLED"],
        message: "Production read-only execution requires PostgreSQL.",
      });
    }
    if (environment.NODE_ENV !== "production") return;

    const productionRequirements: Array<[boolean, keyof typeof environment, string]> = [
      [
        environment.STORE_MODE === "postgres" && Boolean(environment.DATABASE_URL),
        "DATABASE_URL",
        "Production requires PostgreSQL persistence and DATABASE_URL.",
      ],
      [
        environment.MEMORY_ENABLED && environment.FEATURE_MEMORY,
        "MEMORY_ENABLED",
        "Production intelligence infrastructure requires memory features.",
      ],
      [
        environment.SEMANTIC_SEARCH_ENABLED && environment.FEATURE_VECTOR_SEARCH,
        "SEMANTIC_SEARCH_ENABLED",
        "Production intelligence infrastructure requires semantic search.",
      ],
      [
        environment.WEB_ORIGIN.startsWith("https://"),
        "WEB_ORIGIN",
        "Production requires an exact HTTPS web origin.",
      ],
      [
        environment.ALLOWED_HOSTS.length > 0 &&
          environment.ALLOWED_HOSTS.every(
            (host) => host !== "*" && !host.includes("/") && !host.includes("://"),
          ),
        "ALLOWED_HOSTS",
        "Production requires exact host names.",
      ],
      [
        environment.SESSION_COOKIE_NAME.startsWith("__Host-"),
        "SESSION_COOKIE_NAME",
        "Production requires a __Host- session cookie.",
      ],
      [
        environment.LOG_REDACTION_ENABLED,
        "LOG_REDACTION_ENABLED",
        "Production requires structured log redaction.",
      ],
      [
        !environment.AUTH_ALLOW_OWNER_BOOTSTRAP,
        "AUTH_ALLOW_OWNER_BOOTSTRAP",
        "Production owner bootstrap must be disabled.",
      ],
      [
        !environment.TAILSCALE_FUNNEL_ENABLED,
        "TAILSCALE_FUNNEL_ENABLED",
        "Public Funnel exposure is unsupported.",
      ],
      [
        !environment.READ_ONLY_EXECUTION_ENABLED ||
          Boolean(environment.SERVER_EXECUTION_SIGNING_KEY_PATH),
        "SERVER_EXECUTION_SIGNING_KEY_PATH",
        "Read-only execution requires a persistent server signing key.",
      ],
    ];
    if (environment.DEPLOYMENT_MODE === "private") {
      productionRequirements.push(
        [
          environment.TAILSCALE_REQUIRED,
          "TAILSCALE_REQUIRED",
          "Private production requires Tailscale.",
        ],
        [
          environment.PRIVATE_NETWORK_REQUIRED,
          "PRIVATE_NETWORK_REQUIRED",
          "Private production requires private-network enforcement.",
        ],
        [
          environment.NETWORK_VERIFIER_MODE === "tailscale",
          "NETWORK_VERIFIER_MODE",
          "Private production requires the Tailscale network verifier.",
        ],
        [
          Boolean(environment.TAILSCALE_EXPECTED_DNS_NAME) &&
            environment.ALLOWED_HOSTS.includes(
              environment.TAILSCALE_EXPECTED_DNS_NAME ?? "",
            ) &&
            new URL(environment.WEB_ORIGIN).hostname ===
              environment.TAILSCALE_EXPECTED_DNS_NAME,
          "TAILSCALE_EXPECTED_DNS_NAME",
          "The expected tailnet DNS name must match the origin and host allowlist.",
        ],
        [
          environment.TRUSTED_PROXY_MODE === "loopback" &&
            environment.TAILSCALE_TRUST_SERVE_PROXY,
          "TRUSTED_PROXY_MODE",
          "The hardened loopback topology requires the trusted local Serve proxy.",
        ],
        [
          environment.API_HOST === "127.0.0.1" ||
            environment.API_HOST === "::1" ||
            environment.API_HOST === "localhost",
          "API_HOST",
          "The hardened Serve topology requires a loopback API bind address.",
        ],
      );
    } else {
      const publicBaseUrl = environment.PUBLIC_BASE_URL
        ? new URL(environment.PUBLIC_BASE_URL)
        : null;
      productionRequirements.push(
        [
          Boolean(publicBaseUrl) && publicBaseUrl?.protocol === "https:",
          "PUBLIC_BASE_URL",
          "Cloud production requires one canonical HTTPS public base URL.",
        ],
        [
          Boolean(publicBaseUrl) &&
            environment.ALLOWED_HOSTS.includes(publicBaseUrl?.hostname ?? ""),
          "ALLOWED_HOSTS",
          "Cloud production must allow exactly the configured public API host.",
        ],
        [
          !environment.PRIVATE_NETWORK_REQUIRED,
          "PRIVATE_NETWORK_REQUIRED",
          "Cloud production uses trusted-device signatures instead of requiring every client to be on a private network.",
        ],
        [
          !environment.TAILSCALE_REQUIRED &&
            environment.NETWORK_VERIFIER_MODE === "unknown",
          "NETWORK_VERIFIER_MODE",
          "Cloud production must not trust Tailscale identity headers or a test verifier.",
        ],
        [
          environment.TRUSTED_PROXY_MODE === "one-hop",
          "TRUSTED_PROXY_MODE",
          "Cloud production requires one explicitly trusted TLS-terminating proxy hop.",
        ],
        [
          environment.API_HOST === "0.0.0.0" || environment.API_HOST === "::",
          "API_HOST",
          "Cloud containers must bind on all container interfaces.",
        ],
        [
          !environment.LOCAL_AI_ENABLED,
          "LOCAL_AI_ENABLED",
          "Cloud production must not depend on a Mac-local Ollama runtime.",
        ],
      );
    }
    for (const [valid, path, message] of productionRequirements) {
      if (!valid) context.addIssue({ code: "custom", path: [path], message });
    }
  });

export const WebEnvironmentSchema = z
  .object({
    VITE_API_BASE_URL: z.string().url().default("http://localhost:3001"),
  })
  .passthrough();

export const MacAgentEnvironmentSchema = z
  .object({
    ALEXA_AGENT_ENVIRONMENT: z
      .enum(["development", "production"])
      .default("development"),
    ALEXA_API_BASE_URL: z.string().url().default("http://localhost:3001"),
    ALEXA_WEB_BASE_URL: z.string().url().default("http://localhost:5173"),
    ALEXA_AGENT_LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
    DESKTOP_STT_PROVIDER: z
      .enum(["whisper_cpp", "apple_speech"])
      .default("whisper_cpp"),
    DESKTOP_STT_FALLBACK_PROVIDER: z
      .enum(["apple_speech", "disabled"])
      .default("apple_speech"),
    DESKTOP_STT_WHISPER_BINARY_PATH: z.string().trim().min(1).max(1_024).optional(),
    DESKTOP_STT_WHISPER_MODEL_PATH: z.string().trim().min(1).max(1_024).optional(),
    DESKTOP_STT_WHISPER_MODEL_VERSION: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._-]{3,120}$/)
      .default("ggml-base.en"),
    DESKTOP_STT_WHISPER_THREADS: z.coerce.number().int().min(1).max(4).default(4),
    DESKTOP_STT_WHISPER_NO_SPEECH_THRESHOLD: z.coerce
      .number()
      .min(0)
      .max(0.6)
      .default(0.25),
    ALEXA_REQUIRE_PRIVATE_NETWORK: booleanValue.default(true),
    ALEXA_READ_ONLY_EXECUTION_ENABLED: booleanValue.default(false),
    ALEXA_SERVER_EXECUTION_PUBLIC_KEY: z.string().trim().min(32).optional(),
    ALEXA_EXECUTION_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(60_000)
      .default(5_000),
    ALEXA_UPDATE_PROVIDER: z.enum(["disabled", "generic"]).default("disabled"),
    ALEXA_UPDATE_FEED_URL: z.string().url().optional(),
    ALEXA_UPDATE_CHANNEL: z.enum(["stable", "development"]).default("development"),
    ALEXA_UPDATE_AUTO_CHECK: booleanValue.default(false),
    ALEXA_UPDATE_CHECK_INTERVAL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(168)
      .default(6),
    ALEXA_MAX_FILE_READ_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(131_072)
      .default(131_072),
    ALEXA_MAX_GIT_OUTPUT_BYTES: z.coerce
      .number()
      .int()
      .min(4_096)
      .max(262_144)
      .default(262_144),
  })
  .passthrough()
  .superRefine((environment, context) => {
    const api = new URL(environment.ALEXA_API_BASE_URL);
    const web = new URL(environment.ALEXA_WEB_BASE_URL);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    if (!localHosts.has(api.hostname) && api.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        path: ["ALEXA_API_BASE_URL"],
        message: "Remote Mac Agent API connections require HTTPS.",
      });
    }
    if (!localHosts.has(web.hostname) && web.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        path: ["ALEXA_WEB_BASE_URL"],
        message: "Remote owner approval URLs require HTTPS.",
      });
    }
    if (
      environment.ALEXA_AGENT_ENVIRONMENT === "production" &&
      (localHosts.has(api.hostname) || localHosts.has(web.hostname))
    ) {
      context.addIssue({
        code: "custom",
        path: ["ALEXA_AGENT_ENVIRONMENT"],
        message: "Production Mac Agent builds cannot target localhost.",
      });
    }
    if (environment.ALEXA_UPDATE_PROVIDER === "generic") {
      if (!environment.ALEXA_UPDATE_FEED_URL) {
        context.addIssue({
          code: "custom",
          path: ["ALEXA_UPDATE_FEED_URL"],
          message: "The generic update provider requires a feed URL.",
        });
      } else if (new URL(environment.ALEXA_UPDATE_FEED_URL).protocol !== "https:") {
        context.addIssue({
          code: "custom",
          path: ["ALEXA_UPDATE_FEED_URL"],
          message: "Mac Agent update feeds require HTTPS.",
        });
      }
    }
    if (
      environment.ALEXA_UPDATE_AUTO_CHECK &&
      environment.ALEXA_UPDATE_PROVIDER === "disabled"
    ) {
      context.addIssue({
        code: "custom",
        path: ["ALEXA_UPDATE_AUTO_CHECK"],
        message: "Automatic update checks require a configured update provider.",
      });
    }
  });

export const parseApiEnvironment = (environment: Record<string, unknown>) =>
  ApiEnvironmentSchema.parse(environment);

export const parseWebEnvironment = (environment: Record<string, unknown>) =>
  WebEnvironmentSchema.parse(environment);

export const parseMacAgentEnvironment = (environment: Record<string, unknown>) =>
  MacAgentEnvironmentSchema.parse(environment);

export type ApiEnvironment = z.infer<typeof ApiEnvironmentSchema>;
export type WebEnvironment = z.infer<typeof WebEnvironmentSchema>;
export type MacAgentEnvironment = z.infer<typeof MacAgentEnvironmentSchema>;
