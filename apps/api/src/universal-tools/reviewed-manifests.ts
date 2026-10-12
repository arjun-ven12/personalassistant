import type { ReviewedToolManifest } from "./lifecycle.js";

/** Exact, server-owned read contract. Endpoint registration still requires the operator host allowlist and owner review. */
export const REVIEWED_REMOTE_MCP_MANIFESTS: readonly ReviewedToolManifest[] = [{
  providerId: "deepwiki.mcp",
  toolName: "read_wiki_structure",
  endpoint: "https://mcp.deepwiki.com/mcp",
  schemaDigest: "40f6c8d1d176b83270083b3eb1fb498138da9f683710434abc58d6e168054481",
  providerVersion: "2025-06-18",
  governanceToolName: "universal.external_read",
  operationClass: "READ",
  riskLevel: "read_only",
  approvalRequirement: "none",
  credentialRequired: false,
}];
