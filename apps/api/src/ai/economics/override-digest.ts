import { createHash } from "node:crypto";
import {
  AIEconomicOverrideDescriptorSchema,
  type AIEconomicOverrideDescriptor,
} from "@alexa-control/shared";

const canonical = (value: unknown): string => {
  if (value === null || typeof value === "boolean" || typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  throw new TypeError("Override descriptor must contain JSON values only.");
};

export const canonicalizeEconomicOverride = (value: AIEconomicOverrideDescriptor) =>
  canonical(AIEconomicOverrideDescriptorSchema.parse(value));
export const digestEconomicOverride = (value: AIEconomicOverrideDescriptor) =>
  createHash("sha256").update(canonicalizeEconomicOverride(value)).digest("hex");
