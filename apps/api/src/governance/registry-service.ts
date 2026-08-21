import {
  AllowedApplicationSchema,
  AllowedWorkspaceSchema,
  BLOCKED_WORKSPACE_PATTERNS,
  type ApplicationCapability,
  type CreateApplicationRequest,
  type CreateWorkspaceRequest,
  type RiskLevel,
  type UpdateApplicationRequest,
  type UpdateWorkspaceRequest,
} from "@alexa-control/shared";

import { GovernanceError } from "./errors.js";
import type { GovernanceStore } from "./store.js";

const riskRank: Record<RiskLevel, number> = {
  read_only: 0,
  low: 1,
  medium: 2,
  high: 3,
  prohibited: 4,
};

const applicationBaselines: Record<ApplicationCapability, RiskLevel> = {
  "app.open": "low",
  "app.focus": "low",
  "app.inspect_window": "medium",
  "app.capture_window": "medium",
  "app.automate": "high",
};

const mergeMandatoryPatterns = (extra: string[]) => [
  ...new Set([...BLOCKED_WORKSPACE_PATTERNS, ...extra]),
];

export class RegistryService {
  constructor(readonly store: GovernanceStore) {}

  listApplications(ownerId: string) {
    return this.store.listApplications(ownerId);
  }

  async getApplication(ownerId: string, id: string) {
    const application = await this.store.findApplicationById(id);
    if (!application || application.ownerId !== ownerId) {
      throw new GovernanceError(
        404,
        "APPLICATION_NOT_FOUND",
        "Application was not found.",
      );
    }
    return application;
  }

  async createApplication(ownerId: string, input: CreateApplicationRequest) {
    if (await this.store.findApplicationById(input.id)) {
      throw new GovernanceError(
        409,
        "APPLICATION_ALREADY_EXISTS",
        "Application ID is already registered.",
      );
    }
    this.validateRiskOverrides(input.riskOverrides);
    const now = new Date().toISOString();
    const application = AllowedApplicationSchema.parse({
      ...input,
      ownerId,
      createdAt: now,
      updatedAt: now,
    });
    await this.store.createApplication(application);
    return application;
  }

  async updateApplication(
    ownerId: string,
    id: string,
    input: UpdateApplicationRequest,
  ) {
    const current = await this.getApplication(ownerId, id);
    this.validateRiskOverrides(input.riskOverrides ?? {});
    const updated = AllowedApplicationSchema.parse({
      ...current,
      ...input,
      ownerId: current.ownerId,
      id: current.id,
      macBundleId: current.macBundleId,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    });
    await this.store.updateApplication(updated);
    return updated;
  }

  async disableApplication(ownerId: string, id: string) {
    const current = await this.getApplication(ownerId, id);
    if (!current.enabled) {
      return current;
    }
    const updated = AllowedApplicationSchema.parse({
      ...current,
      enabled: false,
      updatedAt: new Date().toISOString(),
    });
    await this.store.updateApplication(updated);
    return updated;
  }

  listWorkspaces(ownerId: string) {
    return this.store.listWorkspaces(ownerId);
  }

  async getWorkspace(ownerId: string, id: string) {
    const workspace = await this.store.findWorkspaceById(id);
    if (!workspace || workspace.ownerId !== ownerId) {
      throw new GovernanceError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found.");
    }
    return workspace;
  }

  async createWorkspace(ownerId: string, input: CreateWorkspaceRequest) {
    if (await this.store.findWorkspaceById(input.id)) {
      throw new GovernanceError(
        409,
        "WORKSPACE_ALREADY_EXISTS",
        "Workspace ID is already registered.",
      );
    }
    const now = new Date().toISOString();
    const workspace = AllowedWorkspaceSchema.parse({
      ...input,
      ownerId,
      blockedPatterns: mergeMandatoryPatterns(input.blockedPatterns),
      createdAt: now,
      updatedAt: now,
    });
    await this.store.createWorkspace(workspace);
    return workspace;
  }

  async updateWorkspace(ownerId: string, id: string, input: UpdateWorkspaceRequest) {
    const current = await this.getWorkspace(ownerId, id);
    const updated = AllowedWorkspaceSchema.parse({
      ...current,
      ...input,
      blockedPatterns: mergeMandatoryPatterns(
        input.blockedPatterns ?? current.blockedPatterns,
      ),
      ownerId: current.ownerId,
      id: current.id,
      rootPath: current.rootPath,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    });
    await this.store.updateWorkspace(updated);
    return updated;
  }

  async disableWorkspace(ownerId: string, id: string) {
    const current = await this.getWorkspace(ownerId, id);
    if (!current.enabled) {
      return current;
    }
    const updated = AllowedWorkspaceSchema.parse({
      ...current,
      enabled: false,
      updatedAt: new Date().toISOString(),
    });
    await this.store.updateWorkspace(updated);
    return updated;
  }

  listTools() {
    return this.store.listTools();
  }

  async getTool(name: string) {
    const tool = await this.store.findToolByName(name);
    if (!tool) {
      throw new GovernanceError(404, "UNKNOWN_TOOL", "Tool was not found.");
    }
    return tool;
  }

  private validateRiskOverrides(
    overrides: Partial<Record<ApplicationCapability, RiskLevel>>,
  ) {
    for (const [capability, risk] of Object.entries(overrides) as [
      ApplicationCapability,
      RiskLevel,
    ][]) {
      if (riskRank[risk] < riskRank[applicationBaselines[capability]]) {
        throw new GovernanceError(
          400,
          "RISK_DOWNGRADE_NOT_ALLOWED",
          "Application risk overrides may only increase risk.",
        );
      }
    }
  }
}
