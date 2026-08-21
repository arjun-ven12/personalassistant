import {
  LocalModelDefinitionSchema,
  type LocalModelDefinition,
  type LocalModelRole,
} from "@alexa-control/shared";

const definitions: LocalModelDefinition[] = [
  LocalModelDefinitionSchema.parse({
    id: "gemma3-4b",
    runtime: "ollama",
    modelName: "gemma3:4b",
    displayName: "Gemma 3 4B",
    roles: [
      "NATURAL_LANGUAGE_INTERPRETER",
      "GENERAL_LOCAL_REASONER",
      "CONVERSATION",
      "STRUCTURED_EXTRACTION",
    ],
    contextWindow: 8_192,
    multimodal: true,
    structuredOutput: true,
    toolCalling: false,
    estimatedMemoryClass: "small",
    enabled: true,
    priority: 100,
  }),
];

export class LocalModelRegistry {
  list() {
    return definitions.map((model) => ({ ...model, roles: [...model.roles] }));
  }
  getById(id: string) {
    return this.list().find((model) => model.id === id);
  }
  getByName(modelName: string) {
    return this.list().find((model) => model.modelName === modelName);
  }
  resolveRole(role: LocalModelRole) {
    return this.list()
      .filter((model) => model.enabled && model.roles.includes(role))
      .sort((a, b) => b.priority - a.priority)[0];
  }
}
