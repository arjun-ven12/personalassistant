import { readFileSync } from "node:fs";
import { z } from "zod";

import {
  parseMacAgentEnvironment,
  type MacAgentEnvironment,
} from "@alexa-control/config";

const PackagedConfigurationSchema = z
  .object({
    ALEXA_AGENT_ENVIRONMENT: z.enum(["development", "production"]),
    ALEXA_API_BASE_URL: z.string().url(),
    ALEXA_WEB_BASE_URL: z.string().url(),
    ALEXA_AGENT_LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).optional(),
    ALEXA_REQUIRE_PRIVATE_NETWORK: z.boolean().optional(),
    ALEXA_READ_ONLY_EXECUTION_ENABLED: z.boolean().optional(),
    ALEXA_EXECUTION_POLL_INTERVAL_MS: z
      .number()
      .int()
      .min(1_000)
      .max(60_000)
      .optional(),
    ALEXA_UPDATE_PROVIDER: z.enum(["disabled", "generic"]).optional(),
    ALEXA_UPDATE_FEED_URL: z.string().url().optional(),
    ALEXA_UPDATE_CHANNEL: z.enum(["stable", "development"]).optional(),
    ALEXA_UPDATE_AUTO_CHECK: z.boolean().optional(),
    ALEXA_UPDATE_CHECK_INTERVAL_HOURS: z.number().int().min(1).max(168).optional(),
  })
  .strict();

export const loadMacAgentConfiguration = (input: {
  isPackaged: boolean;
  packagedConfigPath: string;
  environment: NodeJS.ProcessEnv;
  loadDevelopmentEnv?: () => void;
}): MacAgentEnvironment => {
  if (!input.isPackaged) input.loadDevelopmentEnv?.();
  let packaged: Record<string, unknown> = {};
  if (input.isPackaged) {
    packaged = PackagedConfigurationSchema.parse(
      JSON.parse(readFileSync(input.packagedConfigPath, "utf8")),
    );
  }
  return parseMacAgentEnvironment({ ...packaged, ...input.environment });
};
