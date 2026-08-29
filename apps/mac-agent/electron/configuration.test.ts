import { describe, expect, it, vi } from "vitest";

import { loadMacAgentConfiguration } from "./configuration.js";

vi.mock("node:fs", () => ({
  readFileSync: () => JSON.stringify({
    ALEXA_AGENT_ENVIRONMENT: "production",
    ALEXA_API_BASE_URL: "https://api.alexa.example",
    ALEXA_WEB_BASE_URL: "https://alexa.example",
    ALEXA_READ_ONLY_EXECUTION_ENABLED: true,
  }),
}));

describe("Mac Agent packaged configuration", () => {
  it("loads strict non-secret production configuration", () => {
    const result = loadMacAgentConfiguration({
      isPackaged: true,
      packagedConfigPath: "/Resources/mac-agent.config.json",
      environment: {},
    });
    expect(result.ALEXA_AGENT_ENVIRONMENT).toBe("production");
    expect(result.ALEXA_API_BASE_URL).toBe("https://api.alexa.example");
  });

  it("loads development env only outside packaged mode", () => {
    const loadDevelopmentEnv = vi.fn();
    loadMacAgentConfiguration({
      isPackaged: false,
      packagedConfigPath: "/ignored",
      environment: {},
      loadDevelopmentEnv,
    });
    expect(loadDevelopmentEnv).toHaveBeenCalledOnce();
  });
});
