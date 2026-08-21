import type { AgentRecord, AgentRole } from "@alexa-control/shared";

interface BuiltInAgent {
  id: string;
  role: AgentRole;
  displayName: string;
  version: string;
  capabilities: string[];
  supportedTasks: string[];
  healthSummary: string;
}

export const BUILT_IN_AGENTS: BuiltInAgent[] = [
  {
    id: "engineering_manager",
    role: "engineering_manager",
    displayName: "Engineering Manager",
    version: "1.0.0",
    capabilities: ["goal.analysis", "delegation", "progress.reporting"],
    supportedTasks: ["intake", "project.breakdown", "executive.report"],
    healthSummary: "Coordinates specialist agents through the workflow engine.",
  },
  {
    id: "planning_agent",
    role: "planning",
    displayName: "Planning Agent",
    version: "1.0.0",
    capabilities: ["repository.analysis", "architecture.analysis", "risk.assessment"],
    supportedTasks: ["implementation.plan", "dependency.analysis", "timeline.estimate"],
    healthSummary: "Plans work using repository and semantic intelligence.",
  },
  {
    id: "coding_agent",
    role: "coding",
    displayName: "Coding Agent",
    version: "1.0.0",
    capabilities: ["patch.proposal", "refactor.suggestion", "test.draft"],
    supportedTasks: ["patch.generate", "implementation.draft", "documentation.patch"],
    healthSummary: "Generates patch proposals but never bypasses Phase 5 approval.",
  },
  {
    id: "review_agent",
    role: "review",
    displayName: "Review Agent",
    version: "1.0.0",
    capabilities: ["architecture.review", "maintainability.review", "style.review"],
    supportedTasks: ["code.review", "complexity.review", "consistency.review"],
    healthSummary: "Reviews outputs for architecture and maintainability.",
  },
  {
    id: "security_agent",
    role: "security",
    displayName: "Security Agent",
    version: "1.0.0",
    capabilities: ["threat.model", "secrets.review", "permission.review"],
    supportedTasks: ["security.review", "dependency.review", "auth.analysis"],
    healthSummary: "Reviews security-sensitive work and permission boundaries.",
  },
  {
    id: "testing_agent",
    role: "testing",
    displayName: "Testing Agent",
    version: "1.0.0",
    capabilities: ["test.plan", "validation.profile.selection", "failure.analysis"],
    supportedTasks: ["test.generate", "coverage.review", "validation.summary"],
    healthSummary: "Plans validation using immutable Phase 5.2 profiles.",
  },
  {
    id: "documentation_agent",
    role: "documentation",
    displayName: "Documentation Agent",
    version: "1.0.0",
    capabilities: ["readme.draft", "api.docs", "migration.guide"],
    supportedTasks: ["docs.update", "release.notes", "developer.guide"],
    healthSummary: "Drafts documentation as ordinary approval-gated patches.",
  },
  {
    id: "release_agent",
    role: "release",
    displayName: "Release Agent",
    version: "1.0.0",
    capabilities: ["release.plan", "changelog.summary", "rollback.plan"],
    supportedTasks: ["release.prepare", "deployment.readiness", "version.recommend"],
    healthSummary:
      "Prepares release summaries and rollback plans without deployment authority.",
  },
];

export const builtInAgentRecord = (
  builtin: BuiltInAgent,
  ownerId: string,
  at: string,
): AgentRecord => ({
  schemaVersion: "1",
  id: builtin.id,
  ownerId,
  role: builtin.role,
  displayName: builtin.displayName,
  version: builtin.version,
  status: "available",
  capabilities: builtin.capabilities,
  supportedTasks: builtin.supportedTasks,
  configuration: {},
  createdAt: at,
  updatedAt: at,
  healthSummary: builtin.healthSummary,
});
