import { createHash, randomBytes } from "node:crypto";
import {
  EngineeringPreviewResultSchema,
  type EngineeringPreviewResult,
} from "@alexa-control/shared";
import type { WorkspaceProvisioningService } from "./provisioning.js";
import { CloudPreviewGrantSchema } from "./preview-gate.js";
export interface PreviewProvider {
  expose(
    ownerId: string,
    companyId: string,
    repositoryId: string,
    preview: EngineeringPreviewResult,
  ): Promise<EngineeringPreviewResult>;
  healthCheck(url: string): Promise<boolean>;
  revoke(ownerId: string, companyId: string, repositoryId: string): Promise<void>;
}
export interface CloudPreviewGrantWriter {
  write(resourceId: string, grant: unknown): Promise<void>;
}
/** Access is granted only from a verified signed Engineering preview result. */
export class CloudHttpsPreviewProvider implements PreviewProvider {
  constructor(
    readonly workspace: WorkspaceProvisioningService,
    readonly writer: CloudPreviewGrantWriter,
    readonly fetcher: typeof fetch = fetch,
    // Trusted bootstrap configuration only; clients/models cannot extend ingress domains.
    readonly ingressDomain: string = "up.railway.app",
  ) {
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(ingressDomain))
      throw Error("Invalid reviewed ingress domain.");
  }
  readonly issuedOrigins = new Set<string>();
  async expose(
    ownerId: string,
    companyId: string,
    repositoryId: string,
    raw: EngineeringPreviewResult,
  ) {
    await this.workspace.authorizeProvider();
    const preview = EngineeringPreviewResultSchema.parse(raw);
    const value = await this.workspace.store.findByRepository(
      ownerId,
      companyId,
      repositoryId,
    );
    if (
      !value ||
      value.state !== "READY" ||
      !value.providerResourceId ||
      value.expiresAt <= this.workspace.now().toISOString() ||
      preview.state !== "RUNNING" ||
      preview.healthStatus !== "PASS" ||
      preview.port !== 4173 ||
      !preview.url ||
      !/^http:\/\/(localhost|127\.0\.0\.1):4173\/?$/.test(preview.url) ||
      !preview.expiresAt ||
      preview.expiresAt <= this.workspace.now().toISOString()
    )
      throw Error("Cloud preview scope or local health denied.");
    const info = await this.workspace.provider.getConnectionInfo(
      value.providerResourceId,
    );
    if (
      !info.privateHost.endsWith(`.${this.ingressDomain}`) ||
      !/^[a-z0-9.-]+$/.test(info.privateHost) ||
      info.previewPort !== 8080
    )
      throw Error("Registered HTTPS ingress unavailable.");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(
      Math.min(
        Date.parse(preview.expiresAt),
        Date.parse(value.expiresAt),
        this.workspace.now().getTime() + 900_000,
      ),
    ).toISOString();
    const grant = CloudPreviewGrantSchema.parse({
      workspaceId: value.id,
      companyId,
      previewId: preview.previewId,
      generation: value.generation,
      port: 4173,
      healthPath: "/",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt,
    });
    await this.writer.write(value.providerResourceId, grant);
    const url = `https://${info.privateHost}/p/${token}`;
    this.issuedOrigins.add(new URL(url).origin);
    if (!(await this.healthCheck(url))) {
      await this.revoke(ownerId, companyId, repositoryId);
      return EngineeringPreviewResultSchema.parse({
        ...preview,
        state: "FAILED",
        healthStatus: "FAIL",
        url: null,
        failureSummary: "External HTTPS preview health check failed.",
      });
    }
    try {
      await this.workspace.identities.appendAudit({
        eventType: "CLOUD_PREVIEW_LIFECYCLE",
        userId: ownerId,
        companyId,
        deviceId: value.workerId,
        ipAddress: "cloud-preview",
        outcome: "SUCCESS",
        reason: "External HTTPS preview verified for the authenticated workspace.",
        requestId: value.id,
        metadata: {
          workspaceId: value.id,
          previewId: preview.previewId,
          generation: value.generation,
        },
      });
      await this.workspace.recordMilestone(value, "FIRST_PREVIEW");
    } catch {
      await this.revoke(ownerId, companyId, repositoryId);
      throw Error("Preview publication audit unavailable.");
    }
    return EngineeringPreviewResultSchema.parse({
      ...preview,
      url,
      expiresAt,
      checkedAt: this.workspace.now().toISOString(),
    });
  }
  async healthCheck(url: string) {
    try {
      const u = new URL(url);
      if (
        u.protocol !== "https:" ||
        !this.issuedOrigins.has(u.origin) ||
        !u.hostname.endsWith(`.${this.ingressDomain}`) ||
        !/^\/p\/[A-Za-z0-9_-]{43}$/.test(u.pathname) ||
        u.search ||
        u.hash ||
        u.username ||
        u.password
      )
        return false;
      const first = await this.fetcher(u, {
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });
      if (first.status !== 303 || first.headers.get("location") !== "/") return false;
      const cookie = first.headers.get("set-cookie")?.split(";")[0];
      if (!cookie) return false;
      const root = await this.fetcher(new URL("/", u), {
        headers: { cookie },
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      await root.body?.cancel();
      return root.status >= 200 && root.status < 300;
    } catch {
      return false;
    }
  }
  async revoke(ownerId: string, companyId: string, repositoryId: string) {
    const value = await this.workspace.store.findByRepository(
      ownerId,
      companyId,
      repositoryId,
    );
    if (!value?.providerResourceId) throw Error("Preview scope unavailable.");
    await this.writer.write(value.providerResourceId, {
      workspaceId: value.id,
      companyId,
      previewId: crypto.randomUUID(),
      generation: value.generation,
      port: 4173,
      healthPath: "/",
      tokenHash: "0".repeat(64),
      expiresAt: "2000-01-01T00:00:00.000Z",
    });
  }
}
