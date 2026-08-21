import { describe, expect, it } from "vitest";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { IntegrationRegistryService } from "./service.js";
import { InMemoryIntegrationStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const audits: unknown[] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const service = new IntegrationRegistryService(new InMemoryIntegrationStore(), audit);
  return { ownerId, audits, service };
};

describe("IntegrationRegistryService", () => {
  it("installs built-in connectors as governed descriptors", async () => {
    const { ownerId, service } = setup();
    const dashboard = await service.dashboard(ownerId);
    expect(dashboard.integrations.map((integration) => integration.id)).toContain(
      "github",
    );
    expect(
      dashboard.capabilities.some(
        (capability) => capability.id === "github.repository.read",
      ),
    ).toBe(true);
    expect(dashboard.permissions).toHaveLength(0);
  });

  it("denies operations until a capability permission is explicitly granted", async () => {
    const { ownerId, service } = setup();
    const denied = await service.requestOperation({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        integrationId: "github",
        capabilityId: "github.repository.read",
        operation: "repositories.list",
        target: "owner/repo",
        reason: "Need repository context.",
        dryRun: true,
      },
    });
    expect(denied.operation.status).toBe("DENIED");
    expect(denied.operation.policyDecision).toBe("deny");

    await service.setPermission({
      ownerId,
      integrationId: "github",
      capabilityId: "github.repository.read",
      grant: true,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    const allowed = await service.requestOperation({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        integrationId: "github",
        capabilityId: "github.repository.read",
        operation: "repositories.list",
        target: "owner/repo",
        reason: "Need repository context.",
        dryRun: true,
      },
    });
    expect(allowed.operation.status).toBe("COMPLETED");
    expect(allowed.operation.resultSummary).toContain(
      "Live third-party execution is not enabled",
    );
  });

  it("approval-gates non-dry-run or medium-risk integration operations", async () => {
    const { ownerId, service } = setup();
    await service.setPermission({
      ownerId,
      integrationId: "slack",
      capabilityId: "slack.notification.send",
      grant: true,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    const requested = await service.requestOperation({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        integrationId: "slack",
        capabilityId: "slack.notification.send",
        operation: "messages.send",
        target: "#engineering",
        reason: "Send validation summary.",
        dryRun: true,
      },
    });
    expect(requested.operation.status).toBe("WAITING_APPROVAL");
    expect(requested.operation.policyDecision).toBe("approval_required");
  });
});
