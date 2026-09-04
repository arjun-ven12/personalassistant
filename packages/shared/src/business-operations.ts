import { z } from "zod";

export const BusinessProviderSchema = z.enum([
  "gmail", "crm", "support", "documents", "projects", "analytics", "github",
  "accounting", "payments", "ads", "commerce",
]);
export const CommercialCapabilitySchema = z.enum([
  "accounting.list_accounts", "accounting.read_account", "accounting.search_transactions", "accounting.read_transaction", "accounting.list_invoices", "accounting.read_invoice", "accounting.list_bills", "accounting.read_bill", "accounting.read_pnl", "accounting.read_balance_sheet", "accounting.read_cashflow", "accounting.read_ar_aging", "accounting.read_ap_aging", "accounting.create_draft_invoice", "accounting.update_draft_invoice", "accounting.add_transaction_note", "accounting.create_draft_expense", "accounting.mark_for_review",
  "payments.search", "payments.read", "payments.list_payouts", "payments.read_subscription", "payments.read_dispute", "payments.prepare_charge", "payments.prepare_refund", "payments.prepare_subscription_change", "payments.execute_charge", "payments.execute_refund", "payments.cancel_subscription",
  "ads.list_campaigns", "ads.read_campaign", "ads.read_performance", "ads.read_spend", "ads.read_conversions", "ads.read_creative", "ads.read_audience_summary", "ads.create_draft_campaign", "ads.update_draft_campaign", "ads.pause_campaign", "ads.resume_campaign", "ads.adjust_budget", "ads.create_draft_creative",
  "analytics.query_metric", "analytics.query_timeseries", "analytics.query_funnel", "analytics.query_conversions", "analytics.query_channel_performance", "analytics.query_cohort", "analytics.query_event",
  "commerce.list_products", "commerce.read_product", "commerce.read_inventory", "commerce.search_customers", "commerce.list_orders", "commerce.read_order", "commerce.read_fulfillment", "commerce.read_returns", "commerce.update_product", "commerce.update_inventory", "commerce.create_draft_discount", "commerce.update_order_note", "commerce.prepare_refund", "commerce.cancel_order",
]);
export const BusinessCapabilitySchema = z.enum([
  "email.search", "email.read_thread", "email.list_attachments", "email.create_draft", "email.send_draft", "email.reply", "email.forward",
  "crm.search_leads", "crm.search_contacts", "crm.search_companies", "crm.read_lead", "crm.read_pipeline", "crm.read_activity", "crm.create_lead", "crm.update_stage", "crm.add_note", "crm.create_follow_up",
  "support.list_tickets", "support.search_tickets", "support.read_ticket", "support.create_draft", "support.reply", "support.change_status", "support.assign", "support.add_note", "support.escalate",
  "documents.find", "documents.read", "documents.create", "documents.update", "documents.attach_reference",
  "projects.list", "projects.search", "projects.read_task", "projects.create_task", "projects.update_task", "projects.assign_task", "projects.change_status", "projects.comment", "projects.set_due_date", "projects.set_priority",
  "analytics.read_metric", "github.read_issue", "github.create_issue", "github.read_pull_request",
  ...CommercialCapabilitySchema.options,
]);
export const BusinessExecutionStatusSchema = z.enum([
  "WAITING_APPROVAL", "QUEUED", "EXECUTING", "VERIFIED", "DENIED", "FAILED",
  "EXTERNAL_RESULT_UNCERTAIN", "REVIEW_REQUIRED", "CANCELLED",
]);
export const BusinessAttributionTypeSchema = z.enum([
  "DIRECT", "WORKFLOW_DERIVED", "EXPERIMENT_ASSIGNED", "ASSISTED", "CORRELATED", "UNKNOWN",
]);
export const AttributionConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

const ReferencesSchema = z.object({
  organizationId: z.string().uuid().nullable().default(null),
  objectiveId: z.string().uuid().nullable().default(null),
  projectId: z.string().uuid().nullable().default(null),
  workflowRunId: z.string().uuid().nullable().default(null),
  taskId: z.string().min(1).max(160).nullable().default(null),
  experimentId: z.string().uuid().nullable().default(null),
  variantId: z.string().uuid().nullable().default(null),
  agentId: z.string().min(1).max(160).nullable().default(null),
}).strict();

const actionBase = {
  idempotencyKey: z.string().min(8).max(200),
  reason: z.string().trim().min(1).max(500),
  references: ReferencesSchema.default({ organizationId:null, objectiveId:null, projectId:null, workflowRunId:null, taskId:null, experimentId:null, variantId:null, agentId:null }),
};
const emailAddress = z.string().email().max(320);
const safeId = z.string().trim().min(1).max(200);
const safeText = z.string().trim().min(1).max(10_000);

const CustomerOperationsActionSchema = z.discriminatedUnion("capability", [
  z.object({ ...actionBase, capability: z.literal("email.search"), query: z.string().trim().min(1).max(500), limit: z.number().int().min(1).max(50).default(20) }).strict(),
  z.object({ ...actionBase, capability: z.literal("email.read_thread"), threadId: safeId }).strict(),
  z.object({ ...actionBase, capability: z.literal("email.list_attachments"), threadId: safeId }).strict(),
  z.object({ ...actionBase, capability: z.literal("email.create_draft"), to: z.array(emailAddress).min(1).max(20), cc: z.array(emailAddress).max(20).default([]), subject: z.string().trim().min(1).max(300), body: safeText, threadId: safeId.nullable().default(null) }).strict(),
  z.object({ ...actionBase, capability: z.literal("email.send_draft"), draftId: safeId, recipientCount: z.number().int().min(1).max(50) }).strict(),
  z.object({ ...actionBase, capability: z.literal("email.reply"), threadId: safeId, body: safeText, recipientCount: z.number().int().min(1).max(50) }).strict(),
  z.object({ ...actionBase, capability: z.literal("email.forward"), threadId: safeId, to: z.array(emailAddress).min(1).max(20), body: z.string().trim().max(10_000).default("") }).strict(),
  z.object({ ...actionBase, capability: z.literal("crm.search_leads"), query: z.string().trim().min(1).max(500), limit: z.number().int().min(1).max(100).default(25) }).strict(),
  z.object({ ...actionBase, capability: z.literal("crm.search_contacts"), query: z.string().trim().min(1).max(500), limit: z.number().int().min(1).max(100).default(25) }).strict(),
  z.object({ ...actionBase, capability: z.literal("crm.search_companies"), query: z.string().trim().min(1).max(500), limit: z.number().int().min(1).max(100).default(25) }).strict(),
  z.object({ ...actionBase, capability: z.literal("crm.read_lead"), externalLeadId: safeId }).strict(),
  z.object({ ...actionBase, capability: z.literal("crm.read_pipeline"), pipelineId: safeId }).strict(),
  z.object({ ...actionBase, capability: z.literal("crm.read_activity"), externalRecordId: safeId, limit: z.number().int().min(1).max(100).default(25) }).strict(),
  z.object({ ...actionBase, capability: z.literal("crm.create_lead"), internalEntityId: safeId, displayName: z.string().trim().min(1).max(200), email: emailAddress.nullable().default(null), company: z.string().trim().max(200).nullable().default(null) }).strict(),
  z.object({ ...actionBase, capability: z.literal("crm.update_stage"), externalLeadId: safeId, expectedVersion: z.string().max(100).nullable().default(null), stage: z.enum(["NEW", "CONTACTED", "QUALIFIED", "CUSTOMER", "CLOSED_LOST"]) }).strict(),
  z.object({ ...actionBase, capability: z.literal("crm.add_note"), externalLeadId: safeId, note: safeText }).strict(),
  z.object({ ...actionBase, capability: z.literal("crm.create_follow_up"), externalLeadId: safeId, internalTaskId: safeId, dueAt: z.iso.datetime(), description: safeText }).strict(),
  z.object({ ...actionBase, capability: z.literal("support.list_tickets"), status: z.enum(["OPEN", "PENDING", "SOLVED", "CLOSED"]).nullable().default(null), limit: z.number().int().min(1).max(100).default(25) }).strict(),
  z.object({ ...actionBase, capability: z.literal("support.search_tickets"), query: z.string().trim().min(1).max(500), limit: z.number().int().min(1).max(100).default(25) }).strict(),
  z.object({ ...actionBase, capability: z.literal("support.read_ticket"), ticketId: safeId }).strict(),
  z.object({ ...actionBase, capability: z.literal("support.create_draft"), ticketId: safeId, body: safeText }).strict(),
  z.object({ ...actionBase, capability: z.literal("support.reply"), ticketId: safeId, body: safeText }).strict(),
  z.object({ ...actionBase, capability: z.literal("support.change_status"), ticketId: safeId, status: z.enum(["OPEN", "PENDING", "SOLVED", "CLOSED"]) }).strict(),
  z.object({ ...actionBase, capability: z.literal("support.assign"), ticketId: safeId, assigneeId: safeId }).strict(),
  z.object({ ...actionBase, capability: z.literal("support.add_note"), ticketId: safeId, note: safeText }).strict(),
  z.object({ ...actionBase, capability: z.literal("support.escalate"), ticketId: safeId, queueId: safeId, reasonText: safeText }).strict(),
  z.object({ ...actionBase, capability: z.literal("documents.find"), query: z.string().trim().min(1).max(500), limit: z.number().int().min(1).max(100).default(25) }).strict(),
  z.object({ ...actionBase, capability: z.literal("documents.read"), documentId: safeId }).strict(),
  z.object({ ...actionBase, capability: z.literal("documents.create"), internalEntityId: safeId, title: z.string().trim().min(1).max(300), content: safeText, parentId: safeId.nullable().default(null) }).strict(),
  z.object({ ...actionBase, capability: z.literal("documents.update"), documentId: safeId, expectedVersion: z.string().max(100).nullable().default(null), content: safeText }).strict(),
  z.object({ ...actionBase, capability: z.literal("documents.attach_reference"), documentId: safeId, targetType: z.enum(["TASK", "WORKFLOW", "OBJECTIVE", "TICKET"]), targetId: safeId }).strict(),
  z.object({ ...actionBase, capability: z.literal("projects.list"), limit: z.number().int().min(1).max(100).default(25) }).strict(),
  z.object({ ...actionBase, capability: z.literal("projects.search"), query: z.string().trim().min(1).max(500), limit: z.number().int().min(1).max(100).default(25) }).strict(),
  z.object({ ...actionBase, capability: z.literal("projects.read_task"), externalTaskId: safeId }).strict(),
  z.object({ ...actionBase, capability: z.literal("projects.create_task"), internalTaskId: safeId, projectId: safeId, title: z.string().trim().min(1).max(300), description: z.string().trim().max(10_000).default(""), assigneeId: safeId.nullable().default(null), dueAt: z.iso.datetime().nullable().default(null), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL") }).strict(),
  z.object({ ...actionBase, capability: z.literal("projects.update_task"), externalTaskId: safeId, expectedVersion: z.string().max(100).nullable().default(null), title: z.string().trim().min(1).max(300).optional(), description: z.string().trim().max(10_000).optional() }).strict().refine((value) => value.title !== undefined || value.description !== undefined, "A task update requires title or description."),
  z.object({ ...actionBase, capability: z.literal("projects.assign_task"), externalTaskId: safeId, assigneeId: safeId }).strict(),
  z.object({ ...actionBase, capability: z.literal("projects.change_status"), externalTaskId: safeId, status: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"]) }).strict(),
  z.object({ ...actionBase, capability: z.literal("projects.comment"), externalTaskId: safeId, comment: safeText }).strict(),
  z.object({ ...actionBase, capability: z.literal("projects.set_due_date"), externalTaskId: safeId, dueAt: z.iso.datetime().nullable() }).strict(),
  z.object({ ...actionBase, capability: z.literal("projects.set_priority"), externalTaskId: safeId, priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]) }).strict(),
  z.object({ ...actionBase, capability: z.literal("analytics.read_metric"), metricId: z.string().regex(/^[a-zA-Z0-9_.-]{2,120}$/), windowStart: z.iso.datetime(), windowEnd: z.iso.datetime(), filters: z.record(z.string().max(80), z.string().max(200)).default({}) }).strict(),
  z.object({ ...actionBase, capability: z.literal("github.read_issue"), repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/), issueNumber: z.number().int().positive() }).strict(),
  z.object({ ...actionBase, capability: z.literal("github.create_issue"), repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/), title: z.string().trim().min(1).max(256), body: safeText }).strict(),
  z.object({ ...actionBase, capability: z.literal("github.read_pull_request"), repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/), pullRequestNumber: z.number().int().positive() }).strict(),
]);

const moneyMinor = z.number().int().safe().min(1).max(9_000_000_000_000_000);
const currency = z.string().regex(/^[A-Z]{3}$/);
const CommercialActionSchema = z.object({
  ...actionBase,
  capability: CommercialCapabilitySchema,
  externalResourceId: safeId.nullable().default(null),
  query: z.string().trim().min(1).max(500).nullable().default(null),
  metricId: z.string().regex(/^[a-zA-Z0-9_.-]{2,120}$/).nullable().default(null), dimensions:z.array(z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/)).max(20).default([]),
  limit: z.number().int().min(1).max(100).default(25),
  periodStart: z.iso.datetime().nullable().default(null),
  periodEnd: z.iso.datetime().nullable().default(null),
  timezone: z.string().trim().min(1).max(80).default("UTC"),
  amountMinor: moneyMinor.nullable().default(null),
  currency: currency.nullable().default(null),
  expectedVersion: z.string().trim().min(1).max(100).nullable().default(null),
  currentAmountMinor: z.number().int().safe().min(0).max(9_000_000_000_000_000).nullable().default(null),
  proposedAmountMinor: z.number().int().safe().min(0).max(9_000_000_000_000_000).nullable().default(null),
  quantityDelta: z.number().int().min(-100_000).max(100_000).nullable().default(null),
  currentQuantity: z.number().int().min(0).max(100_000_000).nullable().default(null),
  percentage: z.number().min(0).max(100).nullable().default(null),
  cooldownOverride: z.boolean().default(false),
  note: z.string().trim().min(1).max(10_000).nullable().default(null),
  filters: z.record(z.string().max(80), z.string().max(200)).default({}),
}).strict().superRefine((value, context) => {
  const moneyActions = new Set(["accounting.create_draft_invoice", "accounting.update_draft_invoice", "accounting.create_draft_expense", "payments.prepare_charge", "payments.prepare_refund", "payments.execute_charge", "payments.execute_refund", "commerce.prepare_refund"]);
  if (moneyActions.has(value.capability) && (value.amountMinor === null || value.currency === null)) context.addIssue({ code:"custom", path:["amountMinor"], message:"A positive minor-unit amount and ISO currency are required." });
  const sensitiveWrites = value.capability.startsWith("payments.execute_") || value.capability === "payments.cancel_subscription" || value.capability === "accounting.update_draft_invoice" || value.capability === "accounting.add_transaction_note" || value.capability === "accounting.mark_for_review" || value.capability === "ads.update_draft_campaign" || value.capability === "ads.adjust_budget" || value.capability === "ads.pause_campaign" || value.capability === "ads.resume_campaign" || value.capability === "commerce.update_product" || value.capability === "commerce.update_inventory" || value.capability === "commerce.update_order_note" || value.capability === "commerce.cancel_order";
  if (sensitiveWrites && (!value.externalResourceId || !value.expectedVersion)) context.addIssue({ code:"custom", path:["expectedVersion"], message:"Sensitive external mutations require a target and provider version." });
  if (value.capability === "ads.adjust_budget" && (value.currentAmountMinor === null || value.proposedAmountMinor === null || value.currency === null)) context.addIssue({ code:"custom", path:["proposedAmountMinor"], message:"Budget adjustment requires current/proposed minor units and currency." });
  if (value.capability === "commerce.update_inventory" && (value.quantityDelta === null || value.currentQuantity === null || value.currentQuantity + value.quantityDelta < 0)) context.addIssue({ code:"custom", path:["quantityDelta"], message:"Inventory update requires current quantity and cannot produce negative inventory." });
  if ((value.capability === "commerce.create_draft_discount" || value.capability === "commerce.update_inventory") && (value.amountMinor === null || value.currency === null)) context.addIssue({code:"custom",path:["amountMinor"],message:"Aggregate commercial impact requires positive minor units and currency."});
  const periodActions=value.capability.startsWith("analytics.query_")||["accounting.read_pnl","accounting.read_balance_sheet","accounting.read_cashflow","accounting.read_ar_aging","accounting.read_ap_aging","ads.read_performance","ads.read_spend","ads.read_conversions"].includes(value.capability);
  if(periodActions&&(value.periodStart===null||value.periodEnd===null||Date.parse(value.periodStart)>=Date.parse(value.periodEnd)))context.addIssue({code:"custom",path:["periodEnd"],message:"Analytical and financial reads require an explicit increasing period."});
  if((value.capability==="analytics.query_metric"||value.capability==="analytics.query_timeseries")&&!value.metricId)context.addIssue({code:"custom",path:["metricId"],message:"Metric queries require a registered metric ID."});
});

export const BusinessActionRequestSchema = z.union([CustomerOperationsActionSchema, CommercialActionSchema]);

export const BusinessExecutionRecordSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), provider: BusinessProviderSchema,
  companyId: z.string().uuid().nullable().default(null), credentialBindingId: z.string().uuid().nullable().default(null),
  integrationId: z.string().min(3).max(120), capability: BusinessCapabilitySchema,
  idempotencyKey: z.string().min(8).max(200), actionDigest: z.string().regex(/^[a-f0-9]{64}$/), status: BusinessExecutionStatusSchema,
  approvalId: z.string().uuid().nullable(), externalReferenceId: z.string().max(300).nullable(),
  actionSummary: z.string().min(1).max(500), resultSummary: z.string().min(1).max(1_000),
  references: ReferencesSchema, verification: z.enum(["NOT_REQUIRED", "PENDING", "VERIFIED", "FAILED", "UNCERTAIN"]),
  attemptCount: z.number().int().min(0).max(10), requestedAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  commercialControl:z.object({resourceType:z.string().min(1).max(80),resourceId:safeId,leaseFence:z.number().int().positive(),reservationId:z.string().uuid().nullable(),actionClass:z.enum(["PAYMENT_EXECUTION","REFUND","AD_SPEND_INCREASE","DISCOUNT_IMPACT","INVENTORY_VALUE_ADJUSTMENT"]).nullable(),amountMinor:z.number().int().safe().positive().nullable(),currency:currency.nullable()}).strict().nullable().default(null),
}).strict();

export const BusinessExternalEventInputSchema = z.object({
  integrationId: z.string().min(3).max(120), companyId: z.string().uuid().nullable().default(null), externalEventId: safeId,
  type: z.enum(["EMAIL_REPLIED", "EMAIL_DELIVERED", "CRM_LEAD_STAGE_CHANGED", "SUPPORT_TICKET_UPDATED", "DOCUMENT_UPDATED", "PROJECT_TASK_STATUS_CHANGED", "ANALYTICS_METRIC_OBSERVED", "GITHUB_ISSUE_CHANGED", "LEAD_CREATED", "ORDER_CREATED", "PAYMENT_SUCCEEDED", "PAYMENT_FAILED", "REFUND_REQUESTED", "REFUND_CREATED", "INVOICE_CREATED", "INVOICE_OVERDUE", "INVENTORY_LOW", "CAMPAIGN_SPEND_UPDATED", "CAMPAIGN_THRESHOLD_BREACHED", "CONVERSION_RECORDED", "SUBSCRIPTION_CANCELLED"]),
  occurredAt: z.iso.datetime(), entityRef: safeId.nullable().default(null), payloadRef: safeId.nullable().default(null),
  entityType: z.enum(["CUSTOMER","ORDER","PAYMENT","INVOICE","CAMPAIGN","PRODUCT","REFUND"]).nullable().default(null), internalEntityId:safeId.nullable().default(null),
  objectiveId: z.string().uuid().nullable().default(null), experimentId: z.string().uuid().nullable().default(null),
  variantId: z.string().uuid().nullable().default(null), metricId: z.string().max(120).nullable().default(null),
  metricValue: z.number().finite().nullable().default(null), metricUnit: z.string().max(40).nullable().default(null),
  sourceVersion: z.string().max(100).nullable().default(null),
  canonicalEventId: safeId.nullable().default(null),
  sourceRole: z.enum(["ORDER", "PAYMENT_STATUS", "BOOK_REVENUE", "MARKETING_ATTRIBUTION"]).nullable().default(null),
  factType: z.enum(["RAW_PROVIDER_FACT", "DERIVED_METRIC", "MODEL_PREDICTION", "HUMAN_DECISION", "AGENT_RECOMMENDATION", "EXECUTED_ACTION", "ACTUAL_OUTCOME"]).default("RAW_PROVIDER_FACT"),
  amountMinor: moneyMinor.nullable().default(null), currency: currency.nullable().default(null),
  providerTimezone: z.string().trim().min(1).max(80).default("UTC"),
}).strict().superRefine((value,context)=>{
  if((value.amountMinor===null)!==(value.currency===null))context.addIssue({code:"custom",path:["currency"],message:"Commercial money requires both minor units and currency."});
  if(value.sourceRole&&!value.canonicalEventId)context.addIssue({code:"custom",path:["canonicalEventId"],message:"A source role requires a canonical commercial event ID."});
  if(value.sourceRole&&!value.companyId)context.addIssue({code:"custom",path:["companyId"],message:"Commercial source roles require explicit company scope."});
  if((value.entityType===null)!==(value.internalEntityId===null))context.addIssue({code:"custom",path:["internalEntityId"],message:"Commercial mappings require both a canonical entity type and explicit internal ID."});
  if(value.sourceRole==="BOOK_REVENUE"){
    if(value.amountMinor===null||!value.currency)context.addIssue({code:"custom",path:["amountMinor"],message:"Book revenue requires integer minor units and currency."});
    if(value.metricValue!==value.amountMinor||value.metricUnit!==`${value.currency}_minor`)context.addIssue({code:"custom",path:["metricValue"],message:"Book revenue metrics must exactly mirror minor units and currency."});
  }
});

export const CommercialFactSchema = z.object({
  id:z.string().uuid(), ownerId:z.string().uuid(), companyId:z.string().uuid(), canonicalEventId:safeId,
  provider:BusinessProviderSchema, sourceRole:z.enum(["ORDER", "PAYMENT_STATUS", "BOOK_REVENUE", "MARKETING_ATTRIBUTION"]),
  factType:z.enum(["RAW_PROVIDER_FACT", "DERIVED_METRIC", "MODEL_PREDICTION", "HUMAN_DECISION", "AGENT_RECOMMENDATION", "EXECUTED_ACTION", "ACTUAL_OUTCOME"]),
  eventType:z.string().min(1).max(120), externalEventId:safeId, entityRef:safeId.nullable(),
  amountMinor:moneyMinor.nullable(), currency:currency.nullable(), occurredAt:z.iso.datetime(), providerTimezone:z.string().min(1).max(80), createdAt:z.iso.datetime(),
}).strict().superRefine((value,context)=>{if((value.amountMinor===null)!==(value.currency===null))context.addIssue({code:"custom",path:["currency"],message:"Money facts require both amount and currency."});});

export const BusinessExternalEventSchema = BusinessExternalEventInputSchema.extend({
  id: z.string().uuid(), ownerId: z.string().uuid(), provider: BusinessProviderSchema,
  signatureVerified: z.literal(true), receivedAt: z.iso.datetime(), processedAt: z.iso.datetime().nullable(),
  processingStatus: z.enum(["RECEIVED", "PROCESSED", "DUPLICATE", "FAILED"]),
}).strict();

export const ExternalMetricObservationSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), companyId:z.string().uuid().nullable().default(null), objectiveId: z.string().uuid().nullable(),
  experimentId: z.string().uuid().nullable(), variantId: z.string().uuid().nullable(), metricId: z.string().min(1).max(120),
  sourceProvider: BusinessProviderSchema, externalMetricId: z.string().max(200).nullable(), value: z.number().finite(),
  unit: z.string().min(1).max(40), observedAt: z.iso.datetime(), fetchedAt: z.iso.datetime(),
  queryPeriodStart:z.iso.datetime().nullable().default(null),queryPeriodEnd:z.iso.datetime().nullable().default(null),providerTimezone:z.string().min(1).max(80).default("UTC"),definitionRef:z.string().min(1).max(200).nullable().default(null),
  sourceHealth: z.enum(["HEALTHY", "DEGRADED", "UNAVAILABLE", "REAUTH_REQUIRED"]), evidenceRef: z.string().max(300).nullable(),
}).strict();

export const OutcomeAttributionSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), externalOutcomeId: z.string().max(200).nullable(),
  objectiveId: z.string().uuid().nullable(), projectId: z.string().uuid().nullable(), workflowRunId: z.string().uuid().nullable(),
  taskId: z.string().max(160).nullable(), experimentId: z.string().uuid().nullable(), variantId: z.string().uuid().nullable(),
  agentContributions: z.array(z.object({ agentId: z.string().min(1).max(160), weight: z.number().min(0).max(1) }).strict()).max(25),
  attributionType: BusinessAttributionTypeSchema, confidence: AttributionConfidenceSchema,
  evidenceRefs: z.array(z.string().min(1).max(300)).max(50), outcomeType: z.string().min(1).max(120),
  numericValue: z.number().finite().nullable(), unit: z.string().max(40).nullable(), createdAt: z.iso.datetime(),
}).strict().superRefine((value, context) => {
  const total = value.agentContributions.reduce((sum, item) => sum + item.weight, 0);
  if (total > 1.000001) context.addIssue({ code: "custom", path: ["agentContributions"], message: "Contribution weights must not exceed one." });
});

export const BusinessEntityMappingSchema = z.object({
  id: z.string().uuid(), ownerId: z.string().uuid(), integrationId: z.string().min(3).max(120),
  companyId: z.string().uuid().nullable().default(null),
  entityType: z.enum(["LEAD", "CONTACT", "EMAIL_THREAD", "ISSUE", "SUPPORT_TICKET", "DOCUMENT", "PROJECT_TASK", "CRM_FOLLOW_UP", "CUSTOMER", "ORDER", "PAYMENT", "INVOICE", "CAMPAIGN", "PRODUCT", "REFUND"]), externalId: safeId,
  internalEntityId: safeId, externalVersion: z.string().max(100).nullable(), lastSyncedAt: z.iso.datetime(),
  conflictPolicy: z.enum(["REMOTE_WINS", "LOCAL_WINS", "MERGE", "REVIEW_REQUIRED"]),
}).strict();

export const IntegrationSyncCheckpointSchema = z.object({
  ownerId: z.string().uuid(), integrationId: z.string().min(3).max(120), stream: z.string().min(1).max(120),
  cursor: z.string().max(500), sourceTimestamp: z.iso.datetime().nullable(), updatedAt: z.iso.datetime(),
}).strict();

export const BusinessOperationsDashboardSchema = z.object({
  executions: z.array(BusinessExecutionRecordSchema).max(500), events: z.array(BusinessExternalEventSchema).max(500),
  metrics: z.array(ExternalMetricObservationSchema).max(500), attributions: z.array(OutcomeAttributionSchema).max(500),
  mappings: z.array(BusinessEntityMappingSchema).max(500), checkpoints: z.array(IntegrationSyncCheckpointSchema).max(100),
  commercialFacts: z.array(CommercialFactSchema).max(500),
  summary: z.object({ verifiedActions: z.number().int().nonnegative(), waitingApproval: z.number().int().nonnegative(), uncertainActions: z.number().int().nonnegative(), verifiedOutcomes: z.number().int().nonnegative(), bookRevenueByCurrency:z.array(z.object({currency:currency,amountMinor:z.number().int().safe(),sourceCount:z.number().int().nonnegative()}).strict()).max(50) }).strict(),
}).strict();

export type BusinessProvider = z.infer<typeof BusinessProviderSchema>;
export type BusinessCapability = z.infer<typeof BusinessCapabilitySchema>;
export type BusinessActionRequest = z.infer<typeof BusinessActionRequestSchema>;
export type BusinessExecutionRecord = z.infer<typeof BusinessExecutionRecordSchema>;
export type BusinessExternalEvent = z.infer<typeof BusinessExternalEventSchema>;
export type BusinessExternalEventInput = z.infer<typeof BusinessExternalEventInputSchema>;
export type ExternalMetricObservation = z.infer<typeof ExternalMetricObservationSchema>;
export type OutcomeAttribution = z.infer<typeof OutcomeAttributionSchema>;
export type BusinessEntityMapping = z.infer<typeof BusinessEntityMappingSchema>;
export type IntegrationSyncCheckpoint = z.infer<typeof IntegrationSyncCheckpointSchema>;
export type CommercialFact = z.infer<typeof CommercialFactSchema>;
