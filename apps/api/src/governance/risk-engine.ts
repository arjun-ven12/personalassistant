import type {
  AllowedApplication,
  AllowedWorkspace,
  ApplicationCapability,
  ApprovalRequirement,
  Capability,
  ProposedAction,
  RiskLevel,
  ToolDefinition,
} from "@alexa-control/shared";

export interface RiskEvaluation {
  riskLevel: RiskLevel;
  approvalRequirement: ApprovalRequirement;
  matchedRules: string[];
  denial?: {
    code:
      | "INVALID_POLICY_REQUEST"
      | "APPLICATION_PERMISSION_DENIED"
      | "WORKSPACE_PERMISSION_DENIED"
      | "GIT_PERMISSION_DENIED"
      | "PROHIBITED_ACTION";
    reason: string;
    prohibited: boolean;
  };
}

interface PermissionDenial {
  rule: string;
  denial: NonNullable<RiskEvaluation["denial"]>;
}

const riskOrder: RiskLevel[] = ["read_only", "low", "medium", "high", "prohibited"];
const approvalOrder: ApprovalRequirement[] = [
  "none",
  "session",
  "explicit",
  "recent_authentication",
  "prohibited",
];

const prohibitedCapabilities = new Set<Capability>([
  "workspace.delete_file",
  "shell.execute_arbitrary",
  "filesystem.read_arbitrary",
  "filesystem.delete_permanently",
  "system.run_sudo",
  "credentials.read",
  "keychain.read",
  "banking.perform_action",
  "authentication_code.read",
  "security.disable_controls",
]);

const applicationPermission: Partial<
  Record<ApplicationCapability, keyof AllowedApplication["permissions"]>
> = {
  "app.open": "open",
  "app.focus": "focus",
  "app.inspect_window": "inspectWindow",
  "app.capture_window": "captureWindow",
  "app.automate": "automate",
};

const workspacePermission: Partial<
  Record<Capability, keyof AllowedWorkspace["permissions"]>
> = {
  "workspace.read": "read",
  "workspace.write": "write",
  "workspace.create_file": "createFile",
  "workspace.modify_file": "modifyFile",
  "workspace.move_file": "moveFile",
  "workspace.delete_file": "deleteFile",
  "terminal.run_registered_script": "runScripts",
  "terminal.run_registered_command": "runScripts",
  "codex.start_readonly": "read",
  "codex.start_write": "write",
};

const gitPermission: Partial<
  Record<Capability, keyof AllowedWorkspace["gitPermissions"]>
> = {
  "git.status": "status",
  "git.diff": "diff",
  "git.create_branch": "createBranch",
  "git.commit": "commit",
  "git.push": "push",
};

const maxRisk = (left: RiskLevel, right: RiskLevel) =>
  riskOrder.indexOf(left) >= riskOrder.indexOf(right) ? left : right;

const maxApproval = (left: ApprovalRequirement, right: ApprovalRequirement) =>
  approvalOrder.indexOf(left) >= approvalOrder.indexOf(right) ? left : right;

const minimumApprovalForRisk = (risk: RiskLevel): ApprovalRequirement => {
  if (risk === "prohibited") return "prohibited";
  if (risk === "high") return "recent_authentication";
  if (risk === "medium") return "explicit";
  if (risk === "low") return "session";
  return "none";
};

export class RiskEngine {
  evaluate(input: {
    tool: ToolDefinition;
    action: ProposedAction;
    application?: AllowedApplication;
    workspace?: AllowedWorkspace;
  }): RiskEvaluation {
    const capabilities = input.tool.requiredCapabilities;
    const requested = input.action.requestedCapabilities;
    const matchedRules = [
      `tool.baseline.${input.tool.riskLevel}`,
      `tool.approval.${input.tool.approvalRequirement}`,
    ];

    if (
      requested &&
      requested.some((capability) => !capabilities.includes(capability))
    ) {
      return {
        riskLevel: input.tool.riskLevel,
        approvalRequirement: input.tool.approvalRequirement,
        matchedRules: [...matchedRules, "capability.requested_subset.invalid"],
        denial: {
          code: "INVALID_POLICY_REQUEST",
          reason:
            "Requested capabilities must be a subset of registered tool capabilities.",
          prohibited: false,
        },
      };
    }

    if (
      input.tool.riskLevel === "prohibited" ||
      input.tool.approvalRequirement === "prohibited" ||
      capabilities.some((capability) => prohibitedCapabilities.has(capability))
    ) {
      return {
        riskLevel: "prohibited",
        approvalRequirement: "prohibited",
        matchedRules: [...matchedRules, "security.capability.prohibited"],
        denial: {
          code: "PROHIBITED_ACTION",
          reason: "The tool or one of its registered capabilities is prohibited.",
          prohibited: true,
        },
      };
    }

    const permissionDenial = this.checkPermissions(
      capabilities,
      input.action,
      input.application,
      input.workspace,
    );
    if (permissionDenial) {
      return {
        riskLevel: input.tool.riskLevel,
        approvalRequirement: input.tool.approvalRequirement,
        matchedRules: [...matchedRules, permissionDenial.rule],
        denial: permissionDenial.denial,
      };
    }

    let riskLevel = input.tool.riskLevel as RiskLevel;
    if (input.application) {
      for (const capability of capabilities) {
        const override =
          input.application.riskOverrides[capability as ApplicationCapability];
        if (override) {
          const elevated = maxRisk(riskLevel, override);
          if (elevated !== riskLevel) {
            matchedRules.push(`application.risk_override.${capability}`);
          }
          riskLevel = elevated;
        }
      }
    }
    if (riskLevel === "prohibited") {
      return {
        riskLevel,
        approvalRequirement: "prohibited",
        matchedRules: [...matchedRules, "application.risk_override.prohibited"],
        denial: {
          code: "PROHIBITED_ACTION",
          reason: "The effective application risk is prohibited.",
          prohibited: true,
        },
      };
    }

    const approvalRequirement = maxApproval(
      input.tool.approvalRequirement,
      minimumApprovalForRisk(riskLevel),
    );
    if (riskLevel === "high") {
      matchedRules.push("risk.high.requires_recent_authentication");
    } else if (riskLevel === "medium") {
      matchedRules.push("risk.medium.requires_explicit_approval");
    } else if (riskLevel === "low") {
      matchedRules.push("risk.low.requires_session");
    }

    return { riskLevel, approvalRequirement, matchedRules };
  }

  private checkPermissions(
    capabilities: Capability[],
    action: ProposedAction,
    application?: AllowedApplication,
    workspace?: AllowedWorkspace,
  ): PermissionDenial | undefined {
    for (const capability of capabilities) {
      const applicationKey = applicationPermission[capability as ApplicationCapability];
      if (
        applicationKey &&
        (!application || !application.permissions[applicationKey])
      ) {
        return {
          rule: `application.permission.${applicationKey}.denied`,
          denial: {
            code: "APPLICATION_PERMISSION_DENIED",
            reason: `Application permission ${applicationKey} is not enabled.`,
            prohibited: false,
          },
        };
      }
      const workspaceKey = workspacePermission[capability];
      if (workspaceKey && (!workspace || !workspace.permissions[workspaceKey])) {
        return {
          rule: `workspace.permission.${workspaceKey}.denied`,
          denial: {
            code: "WORKSPACE_PERMISSION_DENIED",
            reason: `Workspace permission ${workspaceKey} is not enabled.`,
            prohibited: false,
          },
        };
      }
      const gitKey = gitPermission[capability];
      if (gitKey && (!workspace || !workspace.gitPermissions[gitKey])) {
        return {
          rule: `workspace.git_permission.${gitKey}.denied`,
          denial: {
            code: "GIT_PERMISSION_DENIED",
            reason: `Git permission ${gitKey} is not enabled.`,
            prohibited: false,
          },
        };
      }
    }

    if (
      capabilities.includes("terminal.run_registered_script") &&
      workspace &&
      (typeof action.arguments !== "object" ||
        action.arguments === null ||
        Array.isArray(action.arguments) ||
        typeof action.arguments.scriptName !== "string" ||
        !workspace.allowedScripts.includes(action.arguments.scriptName))
    ) {
      return {
        rule: "workspace.script.not_registered",
        denial: {
          code: "WORKSPACE_PERMISSION_DENIED",
          reason: "The proposed script name is not registered for the workspace.",
          prohibited: false,
        },
      };
    }
    return undefined;
  }
}

export const RISK_PRECEDENCE = riskOrder;
export const APPROVAL_PRECEDENCE = approvalOrder;
