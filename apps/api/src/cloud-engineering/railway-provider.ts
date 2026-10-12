import { createHash } from "node:crypto";
import { Sandbox } from "railway";
import { z } from "zod";
import { CloudPreviewGrantSchema } from "./preview-gate.js";
import { CloudResourceLimitsSchema, type CloudUsage } from "@alexa-control/shared";
import {
  CloudProviderError,
  type CloudWorkspaceProvider,
  type ProviderWorkspace,
  type WorkspaceProvisionRequest,
} from "./provider.js";
const Config = z
  .object({
    projectId: z.string().uuid(),
    environmentId: z.string().uuid(),
    companyId: z.string().uuid(),
    checkpoint: z.string().regex(/^athena-worker-[a-f0-9]{64}$/),
    accessToken: z.string().min(20),
  })
  .strict();
const Info = z
  .object({
    id: z.string().min(1).max(100),
    environmentId: z.string().uuid(),
    status: z.enum(["CREATING", "RUNNING", "FAILED", "DESTROYING", "DESTROYED"]),
    createdAt: z.iso.datetime(),
    networkIsolation: z.literal("PRIVATE"),
    idleTimeoutMinutes: z.number().nullable(),
    domains: z
      .array(
        z
          .object({
            domain: z.string().regex(/^[a-z0-9.-]+\.up\.railway\.app$/),
            prefix: z.string(),
            port: z.literal(8080),
          })
          .passthrough(),
      )
      .length(1),
  })
  .passthrough();
type Info = z.infer<typeof Info>;
const fields =
  "id environmentId status createdAt networkIsolation idleTimeoutMinutes domains {domain prefix port}";
/** Railway Sandbox VMs in the existing environment; no frontend/API service mutations. */
export class RailwayCloudWorkspaceProvider implements CloudWorkspaceProvider {
  readonly id = "railway-sandbox";
  readonly #config: z.infer<typeof Config>;
  constructor(
    config: z.infer<typeof Config>,
    readonly fetcher: typeof fetch = fetch,
    readonly now: () => Date = () => new Date(),
  ) {
    this.#config = Config.parse(config);
  }
  private prefix(workspaceId: string, generation: number) {
    return `athena-${createHash("sha256").update(this.#config.companyId).digest("hex").slice(0, 8)}-${createHash("sha256").update(`${workspaceId}:${generation}`).digest("hex").slice(0, 28)}`;
  }
  private async api(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await this.fetcher("https://backboard.railway.com/graphql/v2", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#config.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw Error();
      const reader = response.body?.getReader();
      if (!reader) throw Error();
      let total = 0;
      const chunks: Uint8Array[] = [];
      for (;;) {
        const n = await reader.read();
        if (n.done) break;
        total += n.value.length;
        if (total > 524_288) {
          await reader.cancel();
          throw Error();
        }
        chunks.push(n.value);
      }
      const body = z
        .object({
          data: z.record(z.string(), z.unknown()).nullable().optional(),
          errors: z.array(z.unknown()).optional(),
        })
        .passthrough()
        .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if (body.errors?.length || !body.data) throw Error();
      return body.data;
    } catch {
      throw new CloudProviderError(
        query.startsWith("mutation") ? "UNCERTAIN" : "UNAVAILABLE",
      );
    }
  }
  private scoped(info: Info) {
    if (
      info.environmentId !== this.#config.environmentId ||
      info.domains[0]?.port !== 8080 ||
      !info.domains[0].prefix.startsWith(
        `athena-${createHash("sha256").update(this.#config.companyId).digest("hex").slice(0, 8)}-`,
      )
    )
      throw new CloudProviderError("SCOPE_MISMATCH");
    return info;
  }
  private view(info: Info): ProviderWorkspace {
    this.scoped(info);
    return {
      resourceId: info.id,
      state:
        info.status === "RUNNING"
          ? "RUNNING"
          : info.status === "FAILED"
            ? "FAILED"
            : info.status === "DESTROYED"
              ? "DESTROYED"
              : "BOOTING",
    };
  }
  async reconcile(
    input: Pick<WorkspaceProvisionRequest, "workspaceId" | "companyId" | "generation">,
  ) {
    if (input.companyId !== this.#config.companyId)
      throw new CloudProviderError("SCOPE_MISMATCH");
    const result = await this.api(
      `query($environmentId:String!){sandboxes(environmentId:$environmentId){edges{node{${fields}}}}}`,
      { environmentId: this.#config.environmentId },
    );
    const list = z
      .object({ edges: z.array(z.object({ node: z.unknown() })).max(500) })
      .parse(result.sandboxes);
    const prefix = this.prefix(input.workspaceId, input.generation);
    const found = list.edges
      .map((e) => e.node)
      .filter((raw) => {
        const v = z
          .object({ domains: z.array(z.object({ prefix: z.string() })).optional() })
          .passthrough()
          .safeParse(raw);
        return v.success && v.data.domains?.some((d) => d.prefix === prefix);
      })
      .map((raw) => Info.parse(raw))
      .filter((v) => v.status !== "DESTROYED");
    if (found.length > 1) throw new CloudProviderError("UNCERTAIN");
    return found[0] ? this.view(found[0]) : null;
  }
  async provision(
    input: WorkspaceProvisionRequest,
    onBooting?: (workspace: ProviderWorkspace) => Promise<void>,
  ) {
    CloudResourceLimitsSchema.parse(input.limits);
    if (input.companyId !== this.#config.companyId)
      throw new CloudProviderError("SCOPE_MISMATCH");
    const prior = await this.reconcile(input);
    if (prior) return prior;
    const result = await this.api(
      `mutation($input:SandboxCreateInput!){sandboxCreate(input:$input){${fields}}}`,
      {
        input: {
          environmentId: this.#config.environmentId,
          networkIsolation: "PRIVATE",
          idleTimeoutMinutes: 5,
          // Railway rounds VM memory above the requested decimal GB. The live
          // 4 GB profile remains below the canonical 4096 MiB ceiling; the
          // worker still verifies actual memory before authenticating.
          resources: { cpu: 2, memoryGB: 4 },
          template: { name: this.#config.checkpoint },
          publicDomains: [
            { port: 8080, prefix: this.prefix(input.workspaceId, input.generation) },
          ],
        },
      },
    );
    const info = this.scoped(Info.parse(result.sandboxCreate));
    if (info.domains[0]!.prefix !== this.prefix(input.workspaceId, input.generation))
      throw new CloudProviderError("SCOPE_MISMATCH");
    // Persist resource identity before the worker can present its bootstrap proof.
    await onBooting?.(this.view(info));
    // SDK file/exec operations are internal and fixed. No model-generated command, path or env.
    const sandbox = await Sandbox.connect(info.id, {
      environmentId: this.#config.environmentId,
      token: this.#config.accessToken,
    });
    await sandbox.files.write(
      "/run/athena/bootstrap.json",
      JSON.stringify({
        schemaVersion: "2",
        ...input.bootstrap,
        workspaceId: input.workspaceId,
        companyId: input.companyId,
        repositoryId: input.repositoryId,
        workerId: input.workerId,
        generation: input.generation,
        limits: input.limits,
      }),
      { mode: 0o600 },
    );
    const handle = sandbox.exec("/opt/athena/start-engineering-worker", {
      timeoutSec: 3600,
    });
    await handle.sessionName;
    await handle.detach();
    return this.view(info);
  }
  private async read(id: string) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id))
      throw new CloudProviderError("SCOPE_MISMATCH");
    const result = await this.api(
      `query($environmentId:String!,$id:String!){sandbox(environmentId:$environmentId,id:$id){${fields}}}`,
      { environmentId: this.#config.environmentId, id },
    );
    return this.scoped(Info.parse(result.sandbox));
  }
  async write(id: string, raw: unknown) {
    const grant = CloudPreviewGrantSchema.parse(raw);
    const info = await this.read(id);
    if (
      grant.companyId !== this.#config.companyId ||
      info.domains[0]!.prefix !== this.prefix(grant.workspaceId, grant.generation)
    )
      throw new CloudProviderError("SCOPE_MISMATCH");
    const sandbox = await Sandbox.connect(id, {
      environmentId: this.#config.environmentId,
      token: this.#config.accessToken,
    });
    await sandbox.files.write("/run/athena/preview.json", JSON.stringify(grant), {
      mode: 0o600,
    });
  }
  async getStatus(id: string) {
    return this.view(await this.read(id));
  }
  // Railway sandboxes have destroy rather than suspend. Stop releases ephemeral compute.
  async stop(id: string) {
    await this.destroy(id);
  }
  async destroy(id: string) {
    const info = await this.read(id);
    if (info.status !== "DESTROYED")
      await this.api(
        `mutation($environmentId:String!,$id:String!){sandboxDestroy(environmentId:$environmentId,id:$id){id status}}`,
        { environmentId: this.#config.environmentId, id },
      );
  }
  async getUsage(id: string): Promise<CloudUsage> {
    await this.read(id);
    return {
      runtimeSeconds: null,
      cpuSeconds: null,
      peakMemoryBytes: null,
      storageBytes: null,
      networkBytes: null,
      costUsd: null,
      costStatus: "UNKNOWN",
      observedAt: this.now().toISOString(),
    };
  }
  async getConnectionInfo(id: string) {
    const info = await this.read(id);
    return { privateHost: info.domains[0]!.domain, previewPort: 8080 as const };
  }
}
