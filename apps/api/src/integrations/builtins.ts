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
      capability({ id: "gmail.email.read", name: "Email retrieval", description: "Search bounded email metadata, threads, and attachment references.", category: "communication", risk: "low", approvalRequired: false, destructive: false, operations: ["email.search", "email.read_thread", "email.list_attachments"] }),
      capability({ id: "gmail.email.draft", name: "Email drafts", description: "Create a bounded draft without sending it.", category: "communication", risk: "medium", approvalRequired: false, destructive: false, operations: ["email.create_draft"] }),
      capability({ id: "gmail.email.send", name: "Approved email send", description: "Send, reply, or forward one reviewed message with idempotent verification.", category: "communication", risk: "high", approvalRequired: true, destructive: false, operations: ["email.send_draft", "email.reply", "email.forward"] }),
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
      capability({ id: "crm.lead.read", name: "CRM retrieval", description: "Search contacts, companies, leads, pipeline, and activity through bounded reads.", category: "crm", risk: "low", approvalRequired: false, destructive: false, operations: ["crm.search_leads", "crm.search_contacts", "crm.search_companies", "crm.read_lead", "crm.read_pipeline", "crm.read_activity"] }),
      capability({ id: "crm.lead.write", name: "Lead updates", description: "Create leads, update stages, append notes, or create a mapped follow-up after review.", category: "crm", risk: "medium", approvalRequired: true, destructive: false, operations: ["crm.create_lead", "crm.update_stage", "crm.add_note", "crm.create_follow_up"] }),
    ],
  },
  {
    id: "support", provider: "support", category: "support", displayName: "Customer Support", version: "1.0.0",
    supportedAuth: ["oauth", "service_account"], healthSummary: "Support tickets use reviewed reads, drafts, replies, assignment, status, notes, and escalation.",
    capabilities: [
      capability({ id: "support.ticket.read", name: "Ticket retrieval", description: "List, search, and read bounded support tickets.", category: "support", risk: "low", approvalRequired: false, destructive: false, operations: ["support.list_tickets", "support.search_tickets", "support.read_ticket"] }),
      capability({ id: "support.ticket.draft", name: "Response drafts", description: "Create a response draft without contacting the customer.", category: "support", risk: "low", approvalRequired: false, destructive: false, operations: ["support.create_draft"] }),
      capability({ id: "support.ticket.reply", name: "Approved support reply", description: "Send a reviewed customer response.", category: "support", risk: "high", approvalRequired: true, destructive: false, operations: ["support.reply"] }),
      capability({ id: "support.ticket.write", name: "Ticket workflow updates", description: "Change status, assignment, notes, or escalation after review.", category: "support", risk: "medium", approvalRequired: true, destructive: false, operations: ["support.change_status", "support.assign", "support.add_note", "support.escalate"] }),
    ],
  },
  {
    id: "documents", provider: "documents", category: "documentation", displayName: "Business Documents", version: "1.0.0",
    supportedAuth: ["oauth", "service_account"], healthSummary: "Documents remain external source-of-truth records and are never copied wholesale into memory.",
    capabilities: [
      capability({ id: "documents.read", name: "Document retrieval", description: "Find and read explicitly authorized documents.", category: "documentation", risk: "low", approvalRequired: false, destructive: false, operations: ["documents.find", "documents.read"] }),
      capability({ id: "documents.write", name: "Document changes", description: "Create, update, or attach a document reference after review.", category: "documentation", risk: "medium", approvalRequired: true, destructive: false, operations: ["documents.create", "documents.update", "documents.attach_reference"] }),
    ],
  },
  {
    id: "projects", provider: "projects", category: "project_management", displayName: "Project Management", version: "1.0.0",
    supportedAuth: ["oauth", "service_account"], healthSummary: "Project tasks map to stable Athena task references without duplicating external truth.",
    capabilities: [
      capability({ id: "projects.task.read", name: "Project and task retrieval", description: "List projects, search, and read bounded tasks.", category: "project_management", risk: "low", approvalRequired: false, destructive: false, operations: ["projects.list", "projects.search", "projects.read_task"] }),
      capability({ id: "projects.task.write", name: "Project task updates", description: "Create or update a mapped external task after review.", category: "project_management", risk: "medium", approvalRequired: true, destructive: false, operations: ["projects.create_task", "projects.update_task", "projects.assign_task", "projects.change_status", "projects.comment", "projects.set_due_date", "projects.set_priority"] }),
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
      capability({ id: "analytics.metric.read", name: "Metric observations", description: "Read registered metrics, dimensions, funnels, cohorts, events, and explicit periods without arbitrary provider queries.", category: "analytics", risk: "low", approvalRequired: false, destructive: false, operations: ["analytics.read_metric", "analytics.query_metric", "analytics.query_timeseries", "analytics.query_funnel", "analytics.query_conversions", "analytics.query_channel_performance", "analytics.query_cohort", "analytics.query_event"] }),
    ],
  },
  {
    id:"accounting",provider:"accounting",category:"accounting",displayName:"Accounting",version:"1.0.0",supportedAuth:["oauth","service_account"],healthSummary:"Provider-neutral accounting reads and draft-only changes; finalized books are not mutable.",
    capabilities:[
      capability({id:"accounting.read",name:"Accounting retrieval",description:"Read bounded accounts, transactions, reports, invoices, bills, aging, and periods.",category:"accounting",risk:"low",approvalRequired:false,destructive:false,operations:["accounting.list_accounts","accounting.read_account","accounting.search_transactions","accounting.read_transaction","accounting.list_invoices","accounting.read_invoice","accounting.list_bills","accounting.read_bill","accounting.read_pnl","accounting.read_balance_sheet","accounting.read_cashflow","accounting.read_ar_aging","accounting.read_ap_aging"]}),
      capability({id:"accounting.prepare",name:"Accounting drafts",description:"Create or update reviewable drafts and notes; no finalized-ledger mutation.",category:"accounting",risk:"medium",approvalRequired:true,destructive:false,operations:["accounting.create_draft_invoice","accounting.update_draft_invoice","accounting.create_draft_expense"]}),
      capability({id:"accounting.write",name:"Accounting review notes",description:"Add bounded notes or mark records for human review.",category:"accounting",risk:"medium",approvalRequired:true,destructive:false,operations:["accounting.add_transaction_note","accounting.mark_for_review"]}),
    ],
  },
  {
    id:"payments",provider:"payments",category:"payments",displayName:"Payments",version:"1.0.0",supportedAuth:["oauth","service_account"],healthSummary:"Money movement is separate from Athena credits and always requires recent-authenticated exact-action approval.",
    capabilities:[
      capability({id:"payments.read",name:"Payment retrieval",description:"Read bounded payment, payout, subscription, and dispute state.",category:"payments",risk:"low",approvalRequired:false,destructive:false,operations:["payments.search","payments.read","payments.list_payouts","payments.read_subscription","payments.read_dispute"]}),
      capability({id:"payments.prepare",name:"Payment preparation",description:"Prepare a bounded charge, refund, or subscription change without moving money.",category:"payments",risk:"medium",approvalRequired:true,destructive:false,operations:["payments.prepare_charge","payments.prepare_refund","payments.prepare_subscription_change"]}),
      capability({id:"payments.execute",name:"Payment execution",description:"Execute one version-bound charge/refund or cancellation after step-up approval.",category:"payments",risk:"high",approvalRequired:true,destructive:false,operations:["payments.execute_charge","payments.execute_refund","payments.cancel_subscription"]}),
    ],
  },
  {
    id:"ads",provider:"ads",category:"ads",displayName:"Advertising",version:"1.0.0",supportedAuth:["oauth","service_account"],healthSummary:"Ad reads, drafts, and spend-affecting mutations are finite and separately governed.",
    capabilities:[
      capability({id:"ads.read",name:"Campaign analytics",description:"Read campaigns, bounded performance, spend, conversion, creative, and audience summaries.",category:"ads",risk:"low",approvalRequired:false,destructive:false,operations:["ads.list_campaigns","ads.read_campaign","ads.read_performance","ads.read_spend","ads.read_conversions","ads.read_creative","ads.read_audience_summary"]}),
      capability({id:"ads.prepare",name:"Campaign drafts",description:"Create or update campaign and creative drafts without activating spend.",category:"ads",risk:"medium",approvalRequired:true,destructive:false,operations:["ads.create_draft_campaign","ads.update_draft_campaign","ads.create_draft_creative"]}),
      capability({id:"ads.write",name:"Governed campaign changes",description:"Version-bound pause/resume and budget changes with financial-impact preview.",category:"ads",risk:"high",approvalRequired:true,destructive:false,operations:["ads.pause_campaign","ads.resume_campaign","ads.adjust_budget"]}),
    ],
  },
  {
    id:"commerce",provider:"commerce",category:"commerce",displayName:"Commerce",version:"1.0.0",supportedAuth:["oauth","service_account"],healthSummary:"Commerce data remains provider truth; inventory, price, discount, refund, and cancellation paths are bounded.",
    capabilities:[
      capability({id:"commerce.read",name:"Commerce retrieval",description:"Read bounded products, inventory, customers, orders, fulfillment, and returns.",category:"commerce",risk:"low",approvalRequired:false,destructive:false,operations:["commerce.list_products","commerce.read_product","commerce.read_inventory","commerce.search_customers","commerce.list_orders","commerce.read_order","commerce.read_fulfillment","commerce.read_returns"]}),
      capability({id:"commerce.prepare",name:"Commerce preparation",description:"Prepare bounded discounts and refunds without moving money.",category:"commerce",risk:"medium",approvalRequired:true,destructive:false,operations:["commerce.create_draft_discount","commerce.prepare_refund"]}),
      capability({id:"commerce.write",name:"Governed commerce changes",description:"Version-bound product, inventory, note, and cancellation actions.",category:"commerce",risk:"high",approvalRequired:true,destructive:false,operations:["commerce.update_product","commerce.update_inventory","commerce.update_order_note","commerce.cancel_order"]}),
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
