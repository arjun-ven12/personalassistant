import type {
  IntegrationCapability,
  IntegrationCategory,
  IntegrationProvider,
} from "@alexa-control/shared";

interface BuiltInIntegration {
  id: string;
  provider: IntegrationProvider;
  category: IntegrationCategory;
  displayName: string;
  version: string;
  supportedAuth: Array<
    "oauth" | "pat" | "service_account" | "oidc" | "device_flow" | "local_app"
  >;
  healthSummary: string;
  capabilities: Omit<IntegrationCapability, "integrationId">[];
}

const capability = (
  input: Omit<IntegrationCapability, "integrationId" | "enabled">,
): Omit<IntegrationCapability, "integrationId"> => ({
  ...input,
  enabled: true,
});

export const BUILT_IN_INTEGRATIONS: BuiltInIntegration[] = [
  {
    id: "gmail",
    provider: "gmail",
    category: "communication",
    displayName: "Gmail",
    version: "1.0.0",
    supportedAuth: ["oauth"],
    healthSummary: "Gmail business operations require an owner-connected OAuth account.",
    capabilities: [
      capability({ id: "gmail.email.read", name: "Email retrieval", description: "Search bounded email metadata and read a selected thread.", category: "communication", risk: "low", approvalRequired: false, destructive: false, operations: ["email.search", "email.read_thread"] }),
      capability({ id: "gmail.email.draft", name: "Email drafts", description: "Create a bounded draft without sending it.", category: "communication", risk: "medium", approvalRequired: false, destructive: false, operations: ["email.create_draft"] }),
      capability({ id: "gmail.email.send", name: "Approved email send", description: "Send one reviewed draft with idempotent verification.", category: "communication", risk: "high", approvalRequired: true, destructive: false, operations: ["email.send_draft"] }),
    ],
  },
  {
    id: "crm",
    provider: "crm",
    category: "crm",
    displayName: "CRM",
    version: "1.0.0",
    supportedAuth: ["oauth", "service_account"],
    healthSummary: "CRM operations use finite lead read and mutation capabilities.",
    capabilities: [
      capability({ id: "crm.lead.read", name: "Lead retrieval", description: "Search and read bounded lead records.", category: "crm", risk: "low", approvalRequired: false, destructive: false, operations: ["crm.search_leads", "crm.read_lead"] }),
      capability({ id: "crm.lead.write", name: "Lead updates", description: "Create leads, update stages, or append notes after review.", category: "crm", risk: "medium", approvalRequired: true, destructive: false, operations: ["crm.create_lead", "crm.update_stage", "crm.add_note"] }),
    ],
  },
  {
    id: "analytics",
    provider: "analytics",
    category: "analytics",
    displayName: "Business Analytics",
    version: "1.0.0",
    supportedAuth: ["oauth", "service_account"],
    healthSummary: "Analytics exposes validated metric windows only, never arbitrary queries.",
    capabilities: [
      capability({ id: "analytics.metric.read", name: "Metric observations", description: "Read a registered metric for a bounded time window.", category: "analytics", risk: "low", approvalRequired: false, destructive: false, operations: ["analytics.read_metric"] }),
    ],
  },
  {
    id: "github",
    provider: "github",
    category: "git_provider",
    displayName: "GitHub",
    version: "1.0.0",
    supportedAuth: ["oauth", "pat"],
    healthSummary:
      "GitHub connector installed; live calls require configured credentials.",
    capabilities: [
      capability({
        id: "github.repository.read",
        name: "Repository discovery",
        description:
          "Discover repositories, branches, pull requests, status checks, and releases.",
        category: "git_provider",
        risk: "low",
        approvalRequired: false,
        destructive: false,
        operations: ["repositories.list", "pull_requests.list", "checks.read", "github.read_issue", "github.read_pull_request"],
      }),
      capability({
        id: "github.issue.write",
        name: "Issue creation",
        description: "Create a bounded issue after explicit approval.",
        category: "git_provider",
        risk: "medium",
        approvalRequired: true,
        destructive: false,
        operations: ["github.create_issue"],
      }),
      capability({
        id: "github.pull_request.write",
        name: "Pull request updates",
        description: "Create comments or update pull requests after explicit approval.",
        category: "git_provider",
        risk: "medium",
        approvalRequired: true,
        destructive: false,
        operations: ["pull_requests.comment", "pull_requests.review"],
      }),
    ],
  },
  {
    id: "jira",
    provider: "jira",
    category: "issue_tracker",
    displayName: "Jira",
    version: "1.0.0",
    supportedAuth: ["oauth", "pat"],
    healthSummary: "Jira connector installed; issue mutations remain approval-gated.",
    capabilities: [
      capability({
        id: "jira.issue.read",
        name: "Issue search",
        description: "Read issues, project metadata, and workflow status.",
        category: "issue_tracker",
        risk: "low",
        approvalRequired: false,
        destructive: false,
        operations: ["issues.search", "issues.read"],
      }),
      capability({
        id: "jira.issue.write",
        name: "Issue updates",
        description: "Create or update issues only after approval.",
        category: "issue_tracker",
        risk: "medium",
        approvalRequired: true,
        destructive: false,
        operations: ["issues.create", "issues.update", "issues.transition"],
      }),
    ],
  },
  {
    id: "slack",
    provider: "slack",
    category: "communication",
    displayName: "Slack",
    version: "1.0.0",
    supportedAuth: ["oauth"],
    healthSummary: "Slack connector installed; message sending remains approval-gated.",
    capabilities: [
      capability({
        id: "slack.notification.send",
        name: "Workflow notifications",
        description:
          "Send workflow notifications, validation summaries, and approval prompts.",
        category: "communication",
        risk: "medium",
        approvalRequired: true,
        destructive: false,
        operations: ["messages.send", "approvals.notify"],
      }),
    ],
  },
  {
    id: "notion",
    provider: "notion",
    category: "documentation",
    displayName: "Notion",
    version: "1.0.0",
    supportedAuth: ["oauth"],
    healthSummary: "Notion connector installed; document writes remain approval-gated.",
    capabilities: [
      capability({
        id: "notion.page.read",
        name: "Documentation search",
        description:
          "Read approved Notion pages and databases for engineering context.",
        category: "documentation",
        risk: "low",
        approvalRequired: false,
        destructive: false,
        operations: ["pages.search", "pages.read"],
      }),
      capability({
        id: "notion.page.write",
        name: "Documentation drafts",
        description: "Create or update documentation drafts after approval.",
        category: "documentation",
        risk: "medium",
        approvalRequired: true,
        destructive: false,
        operations: ["pages.create", "pages.update"],
      }),
    ],
  },
  {
    id: "vscode",
    provider: "vscode",
    category: "ide",
    displayName: "VS Code",
    version: "1.0.0",
    supportedAuth: ["local_app"],
    healthSummary:
      "VS Code connector is local-status only; editing remains Phase 5 gated.",
    capabilities: [
      capability({
        id: "vscode.navigation.open",
        name: "IDE navigation",
        description: "Navigate to files or symbols without editing code.",
        category: "ide",
        risk: "low",
        approvalRequired: false,
        destructive: false,
        operations: ["files.open", "symbols.navigate", "diagnostics.show"],
      }),
    ],
  },
  {
    id: "github_actions",
    provider: "github_actions",
    category: "ci_cd",
    displayName: "GitHub Actions",
    version: "1.0.0",
    supportedAuth: ["oauth", "pat"],
    healthSummary:
      "GitHub Actions connector installed; workflow dispatch is approval-gated.",
    capabilities: [
      capability({
        id: "github_actions.workflow.read",
        name: "CI status",
        description: "Read workflow runs, checks, logs, and artifacts.",
        category: "ci_cd",
        risk: "low",
        approvalRequired: false,
        destructive: false,
        operations: ["runs.list", "runs.logs", "artifacts.read"],
      }),
      capability({
        id: "github_actions.workflow.dispatch",
        name: "Approved CI dispatch",
        description: "Trigger administrator-approved CI workflows.",
        category: "ci_cd",
        risk: "high",
        approvalRequired: true,
        destructive: false,
        operations: ["workflows.dispatch"],
      }),
    ],
  },
  {
    id: "vercel",
    provider: "vercel",
    category: "deployment",
    displayName: "Vercel",
    version: "1.0.0",
    supportedAuth: ["oauth", "pat"],
    healthSummary:
      "Vercel connector installed; deployments and rollbacks require approval.",
    capabilities: [
      capability({
        id: "vercel.deployment.read",
        name: "Deployment status",
        description: "Read deployment history, project status, and environment health.",
        category: "deployment",
        risk: "low",
        approvalRequired: false,
        destructive: false,
        operations: ["deployments.list", "deployments.read"],
      }),
      capability({
        id: "vercel.deployment.control",
        name: "Approved deployment control",
        description: "Promote or roll back deployments only after explicit approval.",
        category: "deployment",
        risk: "high",
        approvalRequired: true,
        destructive: false,
        operations: ["deployments.promote", "deployments.rollback"],
      }),
    ],
  },
];

export const builtInCapabilities = () =>
  BUILT_IN_INTEGRATIONS.flatMap((integration) =>
    integration.capabilities.map((capability) => ({
      ...capability,
      integrationId: integration.id,
    })),
  );
