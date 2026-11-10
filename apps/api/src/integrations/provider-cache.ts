import { createHash } from "node:crypto";
import type { BusinessActionRequest } from "@alexa-control/shared";
import type { BusinessProviderExecutionContext } from "./business-providers.js";

/** A provider instance serves many companies. Local deduplication must never cross a credential binding. */
export const providerActionIdentity = (
  provider: string,
  action: BusinessActionRequest,
  context: BusinessProviderExecutionContext | undefined,
) => {
  if (!context?.companyId || !context.credentialBindingId) return null;
  const scope = `${context.companyId}:${context.credentialBindingId}:${provider}:${action.capability}:${action.idempotencyKey}`;
  return {
    scope,
    digest: createHash("sha256").update(JSON.stringify(action)).digest("hex"),
    externalIdempotencyKey: createHash("sha256").update(scope).digest("hex"),
  };
};
