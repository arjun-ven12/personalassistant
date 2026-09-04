import type { AgentRole } from "@alexa-control/shared";

export type WorkforceSeed = {
  id: string;
  displayName: string;
  description: string;
  department: string;
  role: AgentRole;
  specialization: string;
  source: "ALEXA_NATIVE" | "EVERYTHING_CLAUDE_CODE";
  sourcePath: string | null;
  skills: string[];
};

export const ECC_COMMIT = "d8409a4b0813771235555e32e3d8046a73988bfa";
export const ECC_LICENSE = "MIT";

const eccSlugs = [
  "a11y-architect", "architect", "build-error-resolver", "chief-of-staff", "code-architect",
  "code-explorer", "code-reviewer", "code-simplifier", "comment-analyzer", "cpp-build-resolver",
  "cpp-reviewer", "csharp-reviewer", "dart-build-resolver", "database-reviewer", "django-build-resolver",
  "django-reviewer", "doc-updater", "docs-lookup", "e2e-runner", "fastapi-reviewer", "flutter-reviewer",
  "fsharp-reviewer", "gan-generator", "gan-planner", "go-build-resolver", "go-reviewer",
  "harmonyos-app-resolver", "harness-optimizer", "healthcare-reviewer", "homelab-architect",
  "java-build-resolver", "java-reviewer", "kotlin-build-resolver", "kotlin-reviewer", "marketing-agent",
  "mle-reviewer", "network-architect", "network-config-reviewer", "network-troubleshooter",
  "opensource-forker", "opensource-packager", "opensource-sanitizer", "performance-optimizer", "php-reviewer",
  "planner", "pr-test-analyzer", "python-reviewer", "pytorch-build-resolver", "rag-pipeline-reviewer",
  "react-build-resolver", "react-reviewer", "refactor-cleaner", "rust-build-resolver", "rust-reviewer",
  "security-reviewer", "seo-specialist", "silent-failure-hunter", "spec-miner", "swift-build-resolver",
  "swift-reviewer", "tdd-guide", "type-design-analyzer", "typescript-reviewer", "vue-reviewer",
] as const;

const title = (slug: string) => slug.split("-").map((part) => part.toUpperCase() === "A11Y" ? "Accessibility" : part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

const roleFor = (slug: string): AgentRole => {
  if (/security/.test(slug)) return "security";
  if (/test|e2e|tdd|failure/.test(slug)) return "testing";
  if (/doc|comment/.test(slug)) return "documentation";
  if (/review|analy|evaluator|optimizer|sanitizer/.test(slug)) return "review";
  if (/chief/.test(slug)) return "engineering_manager";
  if (/architect|planner|spec-miner/.test(slug)) return "planning";
  return "coding";
};

const departmentFor = (slug: string) => {
  if (/marketing|seo/.test(slug)) return "Marketing";
  if (/chief/.test(slug)) return "Executive";
  if (/security|sanitizer/.test(slug)) return "Security";
  if (/test|review|analy|evaluator|failure|tdd/.test(slug)) return "Quality & Review";
  if (/network|homelab|opensource-packager/.test(slug)) return "Operations";
  if (/healthcare|docs-lookup|rag|mle|pytorch|gan/.test(slug)) return "Research";
  return "Development";
};

export const ECC_AGENT_SEEDS: WorkforceSeed[] = eccSlugs.map((slug) => ({
  id: `ecc_${slug.replaceAll("-", "_")}`,
  displayName: title(slug),
  description: `Bounded ${title(slug).toLowerCase()} specialist normalized into Athena's governed Agent OS.`,
  department: departmentFor(slug),
  role: roleFor(slug),
  specialization: title(slug),
  source: "EVERYTHING_CLAUDE_CODE",
  sourcePath: `agents/${slug}.md`,
  skills: slug.split("-").filter((part) => part.length > 2).slice(0, 6),
}));

const native = (
  id: string,
  displayName: string,
  department: string,
  role: AgentRole,
  specialization: string,
): WorkforceSeed => ({
  id: `native_${id}`,
  displayName,
  description: `${specialization} specialist designed for Athena's bounded organizational workforce.`,
  department,
  role,
  specialization,
  source: "ALEXA_NATIVE",
  sourcePath: null,
  skills: specialization.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 2).slice(0, 6),
});

export const ALEXA_NATIVE_WORKFORCE: WorkforceSeed[] = [
  native("executive_lead", "Executive Operations Lead", "Executive", "engineering_manager", "Executive coordination"),
  native("strategy_analyst", "Strategy Analyst", "Executive", "planning", "Business strategy analysis"),
  native("risk_coordinator", "Enterprise Risk Coordinator", "Executive", "security", "Enterprise risk coordination"),
  native("development_lead", "Development Department Lead", "Development", "engineering_manager", "Engineering leadership"),
  native("backend_engineer", "Backend Systems Engineer", "Development", "coding", "Backend systems engineering"),
  native("frontend_engineer", "Frontend Systems Engineer", "Development", "coding", "Frontend systems engineering"),
  native("api_designer", "API Design Specialist", "Development", "planning", "API contract design"),
  native("data_engineer", "Data Platform Engineer", "Development", "coding", "Data platform engineering"),
  native("product_lead", "Product Department Lead", "Product", "engineering_manager", "Product leadership"),
  native("product_manager", "Product Manager", "Product", "planning", "Product planning"),
  native("ux_researcher", "UX Research Specialist", "Product", "review", "User experience research"),
  native("product_analyst", "Product Analytics Specialist", "Product", "planning", "Product analytics"),
  native("research_lead", "Research Department Lead", "Research", "engineering_manager", "Research leadership"),
  native("market_researcher", "Market Research Specialist", "Research", "planning", "Market research"),
  native("competitive_intelligence", "Competitive Intelligence Analyst", "Research", "review", "Competitive intelligence"),
  native("evidence_synthesizer", "Evidence Synthesis Specialist", "Research", "documentation", "Evidence synthesis"),
  native("sales_lead", "Sales Department Lead", "Sales", "engineering_manager", "Sales leadership"),
  native("account_researcher", "Account Research Specialist", "Sales", "planning", "Account research"),
  native("sales_operations", "Sales Operations Analyst", "Sales", "planning", "Sales operations"),
  native("proposal_specialist", "Proposal Specialist", "Sales", "documentation", "Sales proposal development"),
  native("marketing_lead", "Marketing Department Lead", "Marketing", "engineering_manager", "Marketing leadership"),
  native("content_strategist", "Content Strategy Specialist", "Marketing", "planning", "Content strategy"),
  native("growth_analyst", "Growth Analytics Specialist", "Marketing", "review", "Growth analytics"),
  native("brand_reviewer", "Brand Quality Reviewer", "Marketing", "review", "Brand quality review"),
  native("operations_lead", "Operations Department Lead", "Operations", "engineering_manager", "Operations leadership"),
  native("process_analyst", "Process Improvement Analyst", "Operations", "planning", "Process improvement"),
  native("vendor_analyst", "Vendor Operations Analyst", "Operations", "review", "Vendor operations"),
  native("incident_coordinator", "Incident Coordination Specialist", "Operations", "release", "Incident coordination"),
  native("finance_lead", "Finance Department Lead", "Finance", "engineering_manager", "Finance leadership"),
  native("financial_analyst", "Financial Planning Analyst", "Finance", "planning", "Financial planning analysis"),
  native("unit_economics", "Unit Economics Analyst", "Finance", "review", "Unit economics analysis"),
  native("forecast_reviewer", "Forecast Quality Reviewer", "Finance", "review", "Forecast quality review"),
  native("customer_success_lead", "Customer Success Department Lead", "Customer Success", "engineering_manager", "Customer success leadership"),
  native("onboarding_specialist", "Customer Onboarding Specialist", "Customer Success", "documentation", "Customer onboarding"),
  native("support_analyst", "Support Intelligence Analyst", "Customer Success", "review", "Support intelligence"),
  native("retention_analyst", "Customer Retention Analyst", "Customer Success", "planning", "Customer retention analysis"),
  native("quality_lead", "Quality Department Lead", "Quality & Review", "engineering_manager", "Quality leadership"),
  native("acceptance_reviewer", "Acceptance Criteria Reviewer", "Quality & Review", "review", "Acceptance criteria review"),
  native("security_lead", "Security Department Lead", "Security", "engineering_manager", "Security leadership"),
  native("privacy_reviewer", "Privacy Boundary Reviewer", "Security", "security", "Privacy boundary review"),
];

export const EXTERNAL_CLASSIFICATION = {
  scanned: 68,
  importedAgents: ECC_AGENT_SEEDS.length,
  convertedToReviewers: 2,
  convertedToSkills: 0,
  convertedToWorkflows: 0,
  duplicatesRejected: 2,
} as const;
