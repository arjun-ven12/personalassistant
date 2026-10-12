import { describe, expect, it, vi } from "vitest";
import {
  CompanyCredentialReferenceSchema,
  CompanyIntegrationBindingSchema,
} from "@alexa-control/shared";
import { InMemoryCompanyDataStore } from "../company-data/store.js";
import { EngineeringGitHubService } from "./github.js";
import { InMemoryEngineeringGitHubStore } from "./github-store.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const companyA = "22222222-2222-4222-8222-222222222222";
const companyB = "33333333-3333-4333-8333-333333333333";
const credentialId = "44444444-4444-4444-8444-444444444444";
const at = "2026-10-03T00:00:00.000Z";
const repo = {
  id: 42,
  name: "site",
  full_name: "acme/site",
  default_branch: "main",
  private: true,
  archived: false,
  disabled: false,
  permissions: { pull: true, push: true, admin: true },
};

const fixture = () => {
  const companyData = new InMemoryCompanyDataStore();
  companyData.saveCredentialReference(
    CompanyCredentialReferenceSchema.parse({
      id: credentialId,
      ownerId,
      companyId: companyA,
      provider: "github",
      secretLocator: "github-acme",
      status: "READY",
      lastVerifiedAt: at,
      createdAt: at,
      updatedAt: at,
    }),
  );
  companyData.saveIntegrationBinding(
    CompanyIntegrationBindingSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      companyId: companyA,
      provider: "github",
      integrationType: "github",
      integrationId: "github",
      credentialRef: credentialId,
      status: "READY",
      capabilitiesExposed: [
        "github.repository.list",
        "github.repository.register",
        "github.repository.create",
      ],
      metadata: {},
      lastSyncAt: null,
      createdAt: at,
      updatedAt: at,
    }),
  );
  const store = new InMemoryEngineeringGitHubStore();
  const fetcher = vi.fn((_url: string, init?: RequestInit) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          init?.method === "POST" ? repo : _url.includes("/user/repos") ? [repo] : repo,
        ),
        { status: init?.method === "POST" ? 201 : 200 },
      ),
    ),
  );
  const service = new EngineeringGitHubService(
    companyData,
    store,
    {
      resolve: () =>
        Promise.resolve({ accessToken: "synthetic-token-not-for-network" }),
    },
    fetcher as typeof fetch,
    () => new Date(at),
    () => Promise.resolve(true),
  );
  return { companyData, store, fetcher, service };
};

describe("company-scoped engineering GitHub registration", () => {
  it("lists authorized repos and registers only explicit IDs", async () => {
    const { service, fetcher } = fixture();
    const listed = await service.listAuthorized(ownerId, companyA, {
      credentialReferenceId: credentialId,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.registration).toBeNull();
    const registration = await service.register(ownerId, companyA, {
      credentialReferenceId: credentialId,
      providerRepositoryId: 42,
    });
    expect(registration.repository.fullName).toBe("acme/site");
    expect(
      (
        await service.register(ownerId, companyA, {
          credentialReferenceId: credentialId,
          providerRepositoryId: 42,
        })
      ).id,
    ).toBe(registration.id);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(registration)).not.toContain("synthetic-token");
  });
  it("denies cross-company and revoked credentials before outbound calls", async () => {
    const { service, companyData, fetcher } = fixture();
    await expect(
      service.listAuthorized(ownerId, companyB, {
        credentialReferenceId: credentialId,
      }),
    ).rejects.toMatchObject({ code: "CREDENTIAL_UNAVAILABLE" });
    companyData.saveCredentialReference(
      CompanyCredentialReferenceSchema.parse({
        id: credentialId,
        ownerId,
        companyId: companyA,
        provider: "github",
        secretLocator: "github-acme",
        status: "REVOKED",
        lastVerifiedAt: at,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await expect(
      service.register(ownerId, companyA, {
        credentialReferenceId: credentialId,
        providerRepositoryId: 42,
      }),
    ).rejects.toMatchObject({ code: "CREDENTIAL_UNAVAILABLE" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("creates once per idempotency key and denies changed retries", async () => {
    const { service, fetcher } = fixture();
    const input = {
      credentialReferenceId: credentialId,
      name: "site",
      private: true,
      idempotencyKey: "create-site-001",
    };
    const first = await service.create(ownerId, companyA, input);
    const replay = await service.create(ownerId, companyA, input);
    expect(replay.id).toBe(first.id);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(
      service.create(ownerId, companyA, { ...input, private: false }),
    ).rejects.toMatchObject({ code: "REPOSITORY_CONFLICT" });
  });
  it("does not replay an uncertain remote creation", async () => {
    const { service, fetcher } = fixture();
    fetcher.mockRejectedValueOnce(Error("connection lost"));
    const input = {
      credentialReferenceId: credentialId,
      name: "site",
      idempotencyKey: "uncertain-001",
    };
    await expect(service.create(ownerId, companyA, input)).rejects.toMatchObject({
      code: "GITHUB_UNAVAILABLE",
    });
    await expect(service.create(ownerId, companyA, input)).rejects.toMatchObject({
      code: "REPOSITORY_CONFLICT",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
