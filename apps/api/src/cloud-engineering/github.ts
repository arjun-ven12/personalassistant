import {
  CreateEngineeringGitHubRepositoryRequestSchema,
  EngineeringGitHubRepositoryListQuerySchema,
  EngineeringGitHubRegistrationSchema,
  GitHubRepositoryIdentitySchema,
  RegisterEngineeringGitHubRepositoryRequestSchema,
  type GitHubRepositoryIdentity,
} from "@alexa-control/shared";
import { createHash } from "node:crypto";
import { z } from "zod";

import type { CompanyDataStore } from "../company-data/store.js";
import type { EngineeringGitHubStore } from "./github-store.js";
import type { EngineeringRuntimeStore } from "../engineering-runtime/store.js";

const GitHubResponseSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string(),
    full_name: z.string(),
    default_branch: z.string(),
    private: z.boolean(),
    archived: z.boolean(),
    disabled: z.boolean().optional(),
    permissions: z
      .object({ pull: z.boolean(), push: z.boolean(), admin: z.boolean() })
      .passthrough(),
  })
  .passthrough();

export interface GitHubCredentialResolver {
  resolve(secretLocator: string): Promise<{ accessToken: string }>;
}

export type GitHubMutationAuthority = (input: {
  ownerId: string;
  companyId: string;
  capability:
    | "github.repository.register"
    | "github.repository.create"
    | "github.repository.revoke";
  actionDigest: string;
}) => Promise<boolean>;

/** A bootstrap-owned locator map; request bodies never contain or select raw tokens. */
export class AllowlistedGitHubCredentialResolver implements GitHubCredentialResolver {
  readonly #values: ReadonlyMap<string, string>;
  constructor(values: Record<string, string | undefined>) {
    this.#values = new Map(
      Object.entries(values).filter(
        (item): item is [string, string] =>
          typeof item[1] === "string" && item[1].length > 0,
      ),
    );
  }
  resolve(secretLocator: string) {
    const value = this.#values.get(secretLocator);
    if (!value || value.length < 20)
      throw new EngineeringGitHubError(
        "CREDENTIAL_UNAVAILABLE",
        "The reviewed GitHub credential is unavailable.",
      );
    return Promise.resolve({ accessToken: value });
  }
}

export class EngineeringGitHubError extends Error {
  constructor(
    readonly code:
      | "CREDENTIAL_UNAVAILABLE"
      | "GITHUB_UNAVAILABLE"
      | "REPOSITORY_NOT_AUTHORIZED"
      | "REPOSITORY_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "EngineeringGitHubError";
  }
}

const identity = (raw: unknown): GitHubRepositoryIdentity => {
  const repo = GitHubResponseSchema.parse(raw);
  const [owner, name, extra] = repo.full_name.split("/");
  if (!owner || !name || extra || name !== repo.name)
    throw new EngineeringGitHubError(
      "GITHUB_UNAVAILABLE",
      "GitHub returned inconsistent repository identity.",
    );
  return GitHubRepositoryIdentitySchema.parse({
    provider: "github",
    providerRepositoryId: repo.id,
    owner,
    name,
    fullName: repo.full_name,
    defaultBranch: repo.default_branch,
    private: repo.private,
    archived: repo.archived,
    disabled: repo.disabled ?? false,
    permissions: repo.permissions,
  });
};

export class EngineeringGitHubService {
  constructor(
    readonly companyData: Pick<
      CompanyDataStore,
      "findCredentialReference" | "listIntegrationBindings"
    >,
    readonly store: EngineeringGitHubStore,
    readonly credentials: GitHubCredentialResolver,
    readonly fetcher: typeof fetch = fetch,
    readonly now: () => Date = () => new Date(),
    readonly authorizeMutation?: GitHubMutationAuthority,
  ) {}

  private async authorize(
    ownerId: string,
    companyId: string,
    capability:
      | "github.repository.register"
      | "github.repository.create"
      | "github.repository.revoke",
    action: unknown,
  ) {
    const actionDigest = createHash("sha256")
      .update(JSON.stringify({ ownerId, companyId, capability, action }))
      .digest("hex");
    if (
      !this.authorizeMutation ||
      !(await this.authorizeMutation({ ownerId, companyId, capability, actionDigest }))
    )
      throw new EngineeringGitHubError(
        "REPOSITORY_NOT_AUTHORIZED",
        "Exact governed approval for this GitHub mutation is unavailable.",
      );
  }

  private async token(
    ownerId: string,
    companyId: string,
    credentialReferenceId: string,
    capability: string,
  ) {
    const reference = await this.companyData.findCredentialReference(
      ownerId,
      companyId,
      credentialReferenceId,
    );
    if (!reference || reference.provider !== "github" || reference.status !== "READY")
      throw new EngineeringGitHubError(
        "CREDENTIAL_UNAVAILABLE",
        "The company GitHub credential is unavailable.",
      );
    const bindings = await this.companyData.listIntegrationBindings(ownerId, companyId);
    if (
      !bindings.some(
        (binding) =>
          binding.provider === "github" &&
          binding.credentialRef === reference.id &&
          binding.status === "READY" &&
          binding.capabilitiesExposed.includes(capability),
      )
    )
      throw new EngineeringGitHubError(
        "REPOSITORY_NOT_AUTHORIZED",
        "The GitHub capability is not bound to this company.",
      );
    return (await this.credentials.resolve(reference.secretLocator)).accessToken;
  }

  private async github(
    path: string,
    token: string,
    init?: { method: "POST"; body: Record<string, unknown> },
  ) {
    let response: Response;
    try {
      response = await this.fetcher(`https://api.github.com${path}`, {
        method: init?.method ?? "GET",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "x-github-api-version": "2022-11-28",
          ...(init ? { "content-type": "application/json" } : {}),
        },
        ...(init ? { body: JSON.stringify(init.body) } : {}),
        signal: AbortSignal.timeout(12_000),
        redirect: "error",
      });
    } catch {
      throw new EngineeringGitHubError(
        "GITHUB_UNAVAILABLE",
        "GitHub could not be reached. The operation outcome is unknown.",
      );
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 404)
        throw new EngineeringGitHubError(
          "REPOSITORY_NOT_AUTHORIZED",
          "GitHub denied repository access.",
        );
      throw new EngineeringGitHubError(
        "GITHUB_UNAVAILABLE",
        "GitHub did not confirm the operation.",
      );
    }
    try {
      if (Number(response.headers.get("content-length") ?? 0) > 262_144)
        throw new Error("Oversized GitHub response.");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Missing GitHub response body.");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 262_144) {
          await reader.cancel();
          throw new Error("Oversized GitHub response.");
        }
        chunks.push(next.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch {
      throw new EngineeringGitHubError(
        "GITHUB_UNAVAILABLE",
        "GitHub returned an invalid response.",
      );
    }
  }

  async listAuthorized(ownerId: string, companyId: string, raw: unknown) {
    const query = EngineeringGitHubRepositoryListQuerySchema.parse(raw);
    const token = await this.token(
      ownerId,
      companyId,
      query.credentialReferenceId,
      "github.repository.list",
    );
    const response = await this.github(
      `/user/repos?per_page=100&page=${query.page}&affiliation=owner,collaborator,organization_member&sort=updated`,
      token,
    );
    const repositories = z
      .array(z.unknown())
      .max(100)
      .parse(response)
      .map(identity)
      .filter((repo) => repo.permissions.pull && !repo.archived && !repo.disabled)
      .filter(
        (repo) =>
          !query.search ||
          repo.fullName.toLowerCase().includes(query.search.toLowerCase()),
      );
    const registered = await this.store.list(ownerId, companyId);
    return repositories.map((repository) => ({
      repository,
      registration:
        registered.find(
          (item) =>
            item.repository.providerRepositoryId === repository.providerRepositoryId &&
            item.status === "ACTIVE",
        ) ?? null,
    }));
  }

  async register(ownerId: string, companyId: string, raw: unknown) {
    const request = RegisterEngineeringGitHubRepositoryRequestSchema.parse(raw);
    await this.authorize(ownerId, companyId, "github.repository.register", request);
    const token = await this.token(
      ownerId,
      companyId,
      request.credentialReferenceId,
      "github.repository.register",
    );
    const existing = await this.store.findByProviderId(
      ownerId,
      companyId,
      request.providerRepositoryId,
    );
    if (existing) {
      if (
        existing.status === "ACTIVE" &&
        existing.credentialReferenceId === request.credentialReferenceId
      )
        return existing;
      throw new EngineeringGitHubError(
        "REPOSITORY_CONFLICT",
        "The repository has an existing company registration that requires explicit review.",
      );
    }
    const repo = identity(
      await this.github(`/repositories/${request.providerRepositoryId}`, token),
    );
    if (
      repo.providerRepositoryId !== request.providerRepositoryId ||
      !repo.permissions.pull ||
      repo.archived ||
      repo.disabled
    )
      throw new EngineeringGitHubError(
        "REPOSITORY_NOT_AUTHORIZED",
        "The repository is unavailable for engineering.",
      );
    const at = this.now().toISOString();
    return this.store.create(
      EngineeringGitHubRegistrationSchema.parse({
        schemaVersion: "1",
        id: crypto.randomUUID(),
        ownerId,
        companyId,
        credentialReferenceId: request.credentialReferenceId,
        repository: repo,
        engineeringRepositoryId: null,
        status: "ACTIVE",
        createdAt: at,
        updatedAt: at,
      }),
    );
  }

  async create(ownerId: string, companyId: string, raw: unknown) {
    const request = CreateEngineeringGitHubRepositoryRequestSchema.parse(raw);
    await this.authorize(ownerId, companyId, "github.repository.create", request);
    const token = await this.token(
      ownerId,
      companyId,
      request.credentialReferenceId,
      "github.repository.create",
    );
    const requestDigest = createHash("sha256")
      .update(
        JSON.stringify({
          credentialReferenceId: request.credentialReferenceId,
          name: request.name,
          description: request.description,
          private: request.private,
        }),
      )
      .digest("hex");
    const claim = await this.store.claimCreation({
      ownerId,
      companyId,
      idempotencyKey: request.idempotencyKey,
      requestDigest,
      createdAt: this.now().toISOString(),
    });
    if (claim.requestDigest !== requestDigest)
      throw new EngineeringGitHubError(
        "REPOSITORY_CONFLICT",
        "The idempotency key is bound to a different repository request.",
      );
    if (claim.status === "COMPLETE") {
      const registration = (await this.store.list(ownerId, companyId)).find(
        (item) => item.id === claim.registrationId,
      );
      if (registration?.status === "ACTIVE") return registration;
      throw new EngineeringGitHubError(
        "REPOSITORY_CONFLICT",
        "The completed repository registration is unavailable.",
      );
    }
    if (claim.status === "UNCERTAIN")
      throw new EngineeringGitHubError(
        "REPOSITORY_CONFLICT",
        "The prior GitHub creation outcome is uncertain and needs owner review.",
      );
    // Creation is an owner action. A name collision is never silently adopted.
    const created = identity(
      await this.github("/user/repos", token, {
        method: "POST",
        body: {
          name: request.name,
          description: request.description,
          private: request.private,
          auto_init: true,
        },
      }),
    );
    if (
      !created.permissions.admin ||
      created.name !== request.name ||
      created.private !== request.private
    )
      throw new EngineeringGitHubError(
        "GITHUB_UNAVAILABLE",
        "GitHub did not confirm the requested repository properties.",
      );
    const at = this.now().toISOString();
    const registration = await this.store.create(
      EngineeringGitHubRegistrationSchema.parse({
        schemaVersion: "1",
        id: crypto.randomUUID(),
        ownerId,
        companyId,
        credentialReferenceId: request.credentialReferenceId,
        repository: created,
        engineeringRepositoryId: null,
        status: "ACTIVE",
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.completeCreation({
      ownerId,
      companyId,
      idempotencyKey: request.idempotencyKey,
      registrationId: registration.id,
    });
    return registration;
  }

  async requireRegistration(
    ownerId: string,
    companyId: string,
    providerRepositoryId: number,
  ) {
    const registration = await this.store.findByProviderId(
      ownerId,
      companyId,
      providerRepositoryId,
    );
    if (!registration || registration.status !== "ACTIVE")
      throw new EngineeringGitHubError(
        "REPOSITORY_NOT_AUTHORIZED",
        "The GitHub repository is not registered for this company.",
      );
    const token = await this.token(
      ownerId,
      companyId,
      registration.credentialReferenceId,
      "github.repository.register",
    );
    const current = identity(
      await this.github(`/repositories/${providerRepositoryId}`, token),
    );
    if (
      current.providerRepositoryId !== providerRepositoryId ||
      !current.permissions.pull ||
      current.archived ||
      current.disabled ||
      current.fullName !== registration.repository.fullName
    )
      throw new EngineeringGitHubError(
        "REPOSITORY_NOT_AUTHORIZED",
        "GitHub repository access has changed.",
      );
    return { registration, repository: current };
  }

  async expectedCommit(
    ownerId: string,
    companyId: string,
    providerRepositoryId: number,
  ) {
    const { registration, repository } = await this.requireRegistration(
      ownerId,
      companyId,
      providerRepositoryId,
    );
    const token = await this.token(
      ownerId,
      companyId,
      registration.credentialReferenceId,
      "github.repository.register",
    );
    const result = await this.github(
      `/repos/${repository.fullName}/commits/${encodeURIComponent(repository.defaultBranch)}`,
      token,
    );
    return z
      .object({ sha: z.string().regex(/^[a-f0-9]{40}$/) })
      .passthrough()
      .parse(result).sha;
  }

  /** Finite read-only Git smart-HTTP broker. Raw credentials never leave the backend. */
  async readGit(
    ownerId: string,
    companyId: string,
    providerRepositoryId: number,
    operation: "refs" | "upload-pack",
    body?: Uint8Array,
  ) {
    const { registration, repository } = await this.requireRegistration(
      ownerId,
      companyId,
      providerRepositoryId,
    );
    const token = await this.token(
      ownerId,
      companyId,
      registration.credentialReferenceId,
      "github.repository.register",
    );
    const target = `https://github.com/${repository.fullName}.git/${operation === "refs" ? "info/refs?service=git-upload-pack" : "git-upload-pack"}`;
    try {
      const response = await this.fetcher(target, {
        method: operation === "refs" ? "GET" : "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
          accept:
            operation === "refs"
              ? "application/x-git-upload-pack-advertisement"
              : "application/x-git-upload-pack-result",
          ...(body ? { "content-type": "application/x-git-upload-pack-request" } : {}),
        },
        ...(body ? { body: Buffer.from(body) } : {}),
        redirect: "error",
        signal: AbortSignal.timeout(60_000),
      });
      if (
        !response.ok ||
        response.headers.get("content-type") !==
          (operation === "refs"
            ? "application/x-git-upload-pack-advertisement"
            : "application/x-git-upload-pack-result")
      )
        throw Error();
      return response;
    } catch {
      throw new EngineeringGitHubError(
        "GITHUB_UNAVAILABLE",
        "Governed repository fetch failed.",
      );
    }
  }

  async linkCanonicalRepository(
    ownerId: string,
    companyId: string,
    providerRepositoryId: number,
    engineeringRepositoryId: string,
    runtimeStore: EngineeringRuntimeStore,
  ) {
    const registration = await this.store.findByProviderId(
      ownerId,
      companyId,
      providerRepositoryId,
    );
    const repository = await runtimeStore.findRepository(
      ownerId,
      companyId,
      engineeringRepositoryId,
    );
    if (
      !registration ||
      registration.status !== "ACTIVE" ||
      !repository ||
      repository.status !== "ACTIVE"
    )
      throw new EngineeringGitHubError(
        "REPOSITORY_NOT_AUTHORIZED",
        "Canonical engineering repository registration is unavailable.",
      );
    if (
      registration.engineeringRepositoryId &&
      registration.engineeringRepositoryId !== engineeringRepositoryId
    )
      throw new EngineeringGitHubError(
        "REPOSITORY_CONFLICT",
        "GitHub repository is already linked to another engineering repository.",
      );
    const linked = EngineeringGitHubRegistrationSchema.parse({
      ...registration,
      engineeringRepositoryId,
      updatedAt: this.now().toISOString(),
    });
    await this.store.save(linked);
    return linked;
  }

  async revoke(ownerId: string, companyId: string, providerRepositoryId: number) {
    await this.authorize(ownerId, companyId, "github.repository.revoke", {
      providerRepositoryId,
    });
    const registration = await this.store.findByProviderId(
      ownerId,
      companyId,
      providerRepositoryId,
    );
    if (!registration)
      throw new EngineeringGitHubError(
        "REPOSITORY_NOT_AUTHORIZED",
        "The GitHub repository is not registered for this company.",
      );
    const revoked = EngineeringGitHubRegistrationSchema.parse({
      ...registration,
      status: "REVOKED",
      updatedAt: this.now().toISOString(),
    });
    await this.store.save(revoked);
    return revoked;
  }

  /** Exact receipt lookup; never replays a remote creation after uncertainty. */
  async reconcileCreation(ownerId: string, companyId: string, idempotencyKey: string) {
    const claim = await this.store.findCreation(ownerId, companyId, idempotencyKey);
    if (!claim || claim.status !== "COMPLETE" || !claim.registrationId) return null;
    const registration = (await this.store.list(ownerId, companyId)).find(
      (item) => item.id === claim.registrationId,
    );
    if (!registration || registration.status !== "ACTIVE") return null;
    await this.requireRegistration(
      ownerId,
      companyId,
      registration.repository.providerRepositoryId,
    );
    return registration;
  }
}
