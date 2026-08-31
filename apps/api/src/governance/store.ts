import type {
  AllowedApplication,
  AllowedWorkspace,
  ApprovalStatus,
  ToolDefinition,
} from "@alexa-control/shared";

import type {
  GovernanceSecurityState,
  StoredApprovalRequest,
  StoredPolicyEvaluation,
} from "./types.js";
import type { Awaitable } from "../identity/store.js";
import { companyScope } from "../companies/scope.js";

export interface GovernanceStore {
  createApplication(application: AllowedApplication): Awaitable<void>;
  findApplicationById(id: string): Awaitable<AllowedApplication | undefined>;
  listApplications(ownerId: string): Awaitable<AllowedApplication[]>;
  updateApplication(application: AllowedApplication): Awaitable<void>;
  createWorkspace(workspace: AllowedWorkspace): Awaitable<void>;
  findWorkspaceById(id: string): Awaitable<AllowedWorkspace | undefined>;
  listWorkspaces(ownerId: string): Awaitable<AllowedWorkspace[]>;
  updateWorkspace(workspace: AllowedWorkspace): Awaitable<void>;
  listTools(): Awaitable<ToolDefinition[]>;
  findToolByName(name: string): Awaitable<ToolDefinition | undefined>;
  createApproval(approval: StoredApprovalRequest): Awaitable<StoredApprovalRequest>;
  findApprovalById(id: string): Awaitable<StoredApprovalRequest | undefined>;
  findApprovalByDigest(
    ownerId: string,
    actionDigest: string,
    statuses: ApprovalStatus[],
  ): Awaitable<StoredApprovalRequest | undefined>;
  listApprovals(
    ownerId: string,
    status?: ApprovalStatus,
  ): Awaitable<StoredApprovalRequest[]>;
  updateApproval(approval: StoredApprovalRequest): Awaitable<void>;
  cancelApprovalsForDevice(deviceId: string, at: string): Awaitable<number>;
  appendPolicyEvaluation(evaluation: StoredPolicyEvaluation): Awaitable<void>;
  listPolicyEvaluations(
    ownerId: string,
    limit: number,
  ): Awaitable<StoredPolicyEvaluation[]>;
  getSecurityState(): Awaitable<GovernanceSecurityState>;
  activateEmergencyStop(at: string): Awaitable<GovernanceSecurityState>;
  releaseEmergencyStop(at: string): Awaitable<GovernanceSecurityState>;
}

export class InMemoryGovernanceStore implements GovernanceStore {
  readonly #applications = new Map<string, AllowedApplication>();
  readonly #workspaces = new Map<string, AllowedWorkspace>();
  readonly #tools = new Map<string, ToolDefinition>();
  readonly #approvals = new Map<string, StoredApprovalRequest>();
  readonly #evaluations: StoredPolicyEvaluation[] = [];
  readonly #evaluationCompanies = new Map<string, string | null>();
  #securityState: GovernanceSecurityState;

  constructor(tools: ToolDefinition[] = [], emergencyStopActive = true) {
    for (const tool of tools) {
      if (this.#tools.has(tool.name)) {
        throw new Error(`Duplicate built-in tool: ${tool.name}`);
      }
      this.#tools.set(tool.name, structuredClone(tool));
    }
    this.#securityState = {
      emergencyStopActive,
      privilegedExecutionAvailable: false,
      updatedAt: new Date().toISOString(),
    };
  }

  createApplication(application: AllowedApplication) {
    const key = `${application.ownerId}:${companyScope.companyId(application.ownerId) ?? "owner-default"}:${application.id}`;
    if (this.#applications.has(key)) {
      throw new Error("Application ID already exists.");
    }
    this.#applications.set(key, structuredClone(application));
  }

  findApplicationById(id: string) {
    const suffix = `:${companyScope.companyId() ?? "owner-default"}:${id}`;
    return this.clone([...this.#applications.entries()].find(([key]) => key.endsWith(suffix))?.[1]);
  }

  listApplications(ownerId: string) {
    const prefix = `${ownerId}:${companyScope.companyId(ownerId) ?? "owner-default"}:`;
    return [...this.#applications.entries()]
      .filter(([key,application]) => key.startsWith(prefix) && application.ownerId === ownerId)
      .map(([,application])=>application)
      .map((application) => structuredClone(application));
  }

  updateApplication(application: AllowedApplication) {
    const key = `${application.ownerId}:${companyScope.companyId(application.ownerId) ?? "owner-default"}:${application.id}`;
    if (!this.#applications.has(key)) {
      throw new Error("Application does not exist.");
    }
    this.#applications.set(key, structuredClone(application));
  }

  createWorkspace(workspace: AllowedWorkspace) {
    const key = `${workspace.ownerId}:${companyScope.companyId(workspace.ownerId) ?? "owner-default"}:${workspace.id}`;
    if (this.#workspaces.has(key)) {
      throw new Error("Workspace ID already exists.");
    }
    this.#workspaces.set(key, structuredClone(workspace));
  }

  findWorkspaceById(id: string) {
    const suffix = `:${companyScope.companyId() ?? "owner-default"}:${id}`;
    return this.clone([...this.#workspaces.entries()].find(([key]) => key.endsWith(suffix))?.[1]);
  }

  listWorkspaces(ownerId: string) {
    const prefix = `${ownerId}:${companyScope.companyId(ownerId) ?? "owner-default"}:`;
    return [...this.#workspaces.entries()]
      .filter(([key,workspace]) => key.startsWith(prefix) && workspace.ownerId === ownerId)
      .map(([,workspace])=>workspace)
      .map((workspace) => structuredClone(workspace));
  }

  updateWorkspace(workspace: AllowedWorkspace) {
    const key = `${workspace.ownerId}:${companyScope.companyId(workspace.ownerId) ?? "owner-default"}:${workspace.id}`;
    if (!this.#workspaces.has(key)) {
      throw new Error("Workspace does not exist.");
    }
    this.#workspaces.set(key, structuredClone(workspace));
  }

  listTools() {
    return [...this.#tools.values()].map((tool) => structuredClone(tool));
  }

  findToolByName(name: string) {
    return this.clone(this.#tools.get(name));
  }

  createApproval(approval: StoredApprovalRequest) {
    const duplicate = this.findApprovalByDigest(
      approval.ownerId,
      approval.actionDigest,
      ["PENDING"],
    );
    if (duplicate) {
      return duplicate;
    }
    this.#approvals.set(approval.id, structuredClone(approval));
    return structuredClone(approval);
  }

  findApprovalById(id: string) {
    const approval = this.#approvals.get(id);
    const activeCompanyId = approval ? companyScope.companyId(approval.ownerId) : undefined;
    return this.clone(approval && (!activeCompanyId || approval.companyId === activeCompanyId) ? approval : undefined);
  }

  findApprovalByDigest(
    ownerId: string,
    actionDigest: string,
    statuses: ApprovalStatus[],
  ) {
    const approval = [...this.#approvals.values()].find(
      (entry) =>
        entry.ownerId === ownerId &&
        (!companyScope.companyId(ownerId) || entry.companyId === companyScope.companyId(ownerId)) &&
        entry.actionDigest === actionDigest &&
        statuses.includes(entry.status),
    );
    return this.clone(approval);
  }

  listApprovals(ownerId: string, status?: ApprovalStatus) {
    return [...this.#approvals.values()]
      .filter(
        (approval) =>
          approval.ownerId === ownerId &&
          (!companyScope.companyId(ownerId) ||
            approval.companyId === companyScope.companyId(ownerId)) &&
          (!status || approval.status === status),
      )
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
      .map((approval) => structuredClone(approval));
  }

  updateApproval(approval: StoredApprovalRequest) {
    const current = this.#approvals.get(approval.id);
    const activeCompanyId = companyScope.companyId(approval.ownerId);
    if (!current || (activeCompanyId && current.companyId !== activeCompanyId)) {
      throw new Error("Approval does not exist.");
    }
    const allowedTransition =
      current.status === "PENDING"
        ? ["APPROVED", "REJECTED", "EXPIRED", "CANCELLED"].includes(approval.status)
        : current.status === "APPROVED"
          ? ["EXPIRED", "CONSUMED"].includes(approval.status)
          : false;
    if (current.status !== approval.status && !allowedTransition) {
      throw new Error("Approval transition is not allowed.");
    }
    if (
      current.status === approval.status &&
      JSON.stringify(current) !== JSON.stringify(approval)
    ) {
      throw new Error("Approval records are immutable without a state transition.");
    }
    this.#approvals.set(approval.id, structuredClone(approval));
  }

  cancelApprovalsForDevice(deviceId: string, at: string) {
    let count = 0;
    for (const [id, approval] of this.#approvals) {
      if (approval.requestedByDeviceId === deviceId && approval.status === "PENDING") {
        this.#approvals.set(id, {
          ...approval,
          status: "CANCELLED",
          decidedAt: at,
        });
        count += 1;
      }
    }
    return count;
  }

  appendPolicyEvaluation(evaluation: StoredPolicyEvaluation) {
    this.#evaluations.push(structuredClone(evaluation));
    this.#evaluationCompanies.set(evaluation.id, companyScope.companyId(evaluation.ownerId) ?? null);
  }

  listPolicyEvaluations(ownerId: string, limit: number) {
    return this.#evaluations
      .filter((evaluation) => evaluation.ownerId === ownerId && (!companyScope.companyId(ownerId) || this.#evaluationCompanies.get(evaluation.id) === companyScope.companyId(ownerId)))
      .slice(-limit)
      .reverse()
      .map((evaluation) => structuredClone(evaluation));
  }

  getSecurityState() {
    return structuredClone(this.#securityState);
  }

  activateEmergencyStop(at: string) {
    if (!this.#securityState.emergencyStopActive) {
      this.#securityState = {
        emergencyStopActive: true,
        privilegedExecutionAvailable: false,
        updatedAt: at,
      };
    }
    return this.getSecurityState();
  }

  releaseEmergencyStop(at: string) {
    this.#securityState = {
      emergencyStopActive: false,
      privilegedExecutionAvailable: false,
      updatedAt: at,
    };
    return this.getSecurityState();
  }

  private clone<T>(value: T | undefined): T | undefined {
    return value === undefined ? undefined : structuredClone(value);
  }
}
