import { createHash } from "node:crypto";

import { ProposedActionSchema, type ProposedAction } from "@alexa-control/shared";

const canonicalJson = (value: unknown): string => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  throw new TypeError("Proposed action must contain only JSON values.");
};

export const canonicalizeProposedAction = (action: ProposedAction) =>
  canonicalJson(ProposedActionSchema.parse(action));

export const digestProposedAction = (action: ProposedAction) =>
  createHash("sha256").update(canonicalizeProposedAction(action)).digest("hex");
