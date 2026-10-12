import { useState } from "react";
import { z } from "zod";
import type { CompanyIntegrationBinding } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";

const providers = {
  github: {
    label: "GitHub Engineering",
    locator: "github-primary",
    integrationId: "engineering.github",
    capabilities: ["github.repository.list", "github.repository.register"],
  },
  railway: {
    label: "Railway Engineering",
    locator: "railway-engineering-primary",
    integrationId: "engineering.railway",
    capabilities: ["railway.workspace.provision"],
  },
} as const;
type Provider = keyof typeof providers;
/** Stable company-bound claims make retry/reload reuse the same finite records. */
export async function engineeringSetupRecordId(
  companyId: string,
  provider: Provider,
  kind: "credential" | "binding",
) {
  z.string().uuid().parse(companyId);
  z.enum(["github", "railway"]).parse(provider);
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `athena-engineering-setup:1:${companyId}:${provider}:${kind}`,
    ),
  );
  const h = Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function EngineeringCredentialSetup({
  apiClient,
  companyId,
  companyName,
  bindings,
  onSaved,
}: {
  apiClient: ApiClient;
  companyId: string;
  companyName: string;
  bindings: CompanyIntegrationBinding[];
  onSaved: () => Promise<void>;
}) {
  const [verified, setVerified] = useState(false);
  const [pending, setPending] = useState<Provider | null>(null);
  const [message, setMessage] = useState("");
  async function save(provider: Provider) {
    if (!verified || pending) return;
    const config = providers[provider];
    const existing = bindings.filter(
      (x) =>
        x.companyId === companyId &&
        x.provider === provider &&
        x.integrationId === config.integrationId,
    );
    if (existing.length > 1) {
      setMessage("Multiple bindings require owner review.");
      return;
    }
    setPending(provider);
    setMessage("");
    try {
      const at = new Date().toISOString();
      const ref = await apiClient.upsertCompanyCredentialReference(companyId, {
        id:
          existing[0]?.credentialRef ??
          (await engineeringSetupRecordId(companyId, provider, "credential")),
        provider,
        secretLocator: config.locator,
        status: "READY",
        lastVerifiedAt: at,
      });
      await apiClient.upsertCompanyIntegrationBinding(companyId, {
        id:
          existing[0]?.id ??
          (await engineeringSetupRecordId(companyId, provider, "binding")),
        provider,
        integrationType: "API",
        integrationId: config.integrationId,
        credentialRef: ref.id,
        status: "READY",
        capabilitiesExposed: [...config.capabilities],
        metadata: { setup: "OWNER_VERIFIED_ENGINEERING" },
        lastSyncAt: at,
      });
      setMessage(`${config.label} reference: ${ref.id}`);
      await onSaved();
    } catch {
      setMessage(
        "Setup did not complete. Retry reuses the same company records. Authentication, company permission and CSRF must be valid.",
      );
    } finally {
      setPending(null);
    }
  }
  return (
    <article aria-label="Engineering credential setup">
      <h3>Engineering provider credentials</h3>
      <p>
        Register references for {companyName}. Provider secrets stay in the API secret
        manager. Tool review and approval are separate.
      </p>
      <label>
        <input
          type="checkbox"
          checked={verified}
          disabled={pending !== null}
          onChange={(e) => setVerified(e.target.checked)}
        />{" "}
        I have configured and verified the server provider secrets for this company.
      </label>
      <p>
        GitHub: list and register an existing repository. Railway: provision a governed
        workspace.
      </p>
      {(["github", "railway"] as const).map((provider) => (
        <button
          key={provider}
          disabled={!verified || pending !== null}
          onClick={() => void save(provider)}
        >
          {pending === provider ? "Saving…" : `Register ${providers[provider].label}`}
        </button>
      ))}
      {message ? <p role="status">{message}</p> : null}
    </article>
  );
}
