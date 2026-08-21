import { parseApiEnvironment } from "@alexa-control/config";
import { LocalIntentInterpretationSchema } from "@alexa-control/shared";
import { OllamaLocalRuntime } from "../local-ai/runtime.js";
import { createAIRuntime, createCanonicalAIServices } from "../ai/bootstrap.js";

try {
  process.loadEnvFile?.(".env");
} catch {
  /* defaults are safe for local diagnostics */
}
const environment = parseApiEnvironment(process.env);
const runtime = createAIRuntime({
  ollamaRuntime: new OllamaLocalRuntime(environment.OLLAMA_BASE_URL),
  ollamaEnabled: environment.LOCAL_AI_ENABLED,
  ollamaModel: environment.LOCAL_AI_DEFAULT_MODEL,
  ollamaMaxConcurrentRequests: environment.LOCAL_AI_MAX_CONCURRENT_REQUESTS,
  openAIEnabled: false,
  openAIModel: environment.OPENAI_DEFAULT_MODEL,
  openAIBaseUrl: environment.OPENAI_BASE_URL,
});
const canonical = createCanonicalAIServices(runtime);
const localRequest = {
  model: {
    type: "MODEL" as const,
    providerId: "ollama",
    modelId: environment.LOCAL_AI_DEFAULT_MODEL,
  },
  privacy: "LOCAL_ONLY" as const,
  locality: "LOCAL_ONLY" as const,
  allowCloud: false,
  allowFallback: false,
};
const [command, ...args] = process.argv.slice(2);
if (command === "health") console.log(JSON.stringify((await runtime.providerHealth()).find((item) => item.providerId === "ollama"), null, 2));
else if (command === "models")
  console.log(JSON.stringify(runtime.listModels().filter((item) => item.locality === "LOCAL"), null, 2));
else if (command === "stats") console.log(JSON.stringify({ metrics: canonical.aiRouter.metrics(), activity: canonical.aiRouter.activity() }, null, 2));
else if (command === "test-intent")
  console.log(
    JSON.stringify(
      await canonical.aiRouter.executeStructured({
        ...localRequest,
        purpose: "INTERPRETATION",
        requestedRole: "FAST_INTERPRETER",
        input: [{ role: "user", content: [{ type: "text", text: args.join(" ") }] }],
        outputMode: "STRUCTURED",
        schemaName: "LocalIntentInterpretation",
        schema: LocalIntentInterpretationSchema,
      }),
      null,
      2,
    ),
  );
else if (command === "test")
  console.log(JSON.stringify(await canonical.aiRouter.execute({
    ...localRequest,
    purpose: "CONVERSATION",
    requestedRole: "GENERAL_REASONER",
    input: [{ role: "user", content: [{ type: "text", text: args.join(" ") }] }],
  }), null, 2));
else
  throw new Error("Usage: local-ai.ts <health|models|stats|test-intent|test> [prompt]");
