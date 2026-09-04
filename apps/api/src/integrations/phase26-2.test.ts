import { BusinessExternalEventInputSchema, CommercialCapabilitySchema, CompanyCredentialReferenceSchema, CompanyIntegrationBindingSchema } from "@alexa-control/shared";
import { createHmac } from "node:crypto";
import { describe,expect,it } from "vitest";
import { InMemoryCompanyDataStore } from "../company-data/store.js";
import { companyScope } from "../companies/scope.js";
import { ApprovalService,type GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { DeterministicBusinessProvider,type ReviewedBusinessProvider } from "./business-providers.js";
import { summarizeBookRevenue } from "./commercial-metrics.js";
import { IntegrationRegistryService } from "./service.js";
import { InMemoryIntegrationStore } from "./store.js";

const now="2026-09-04T10:00:00.000Z";
const scope=(ownerId:string,companyId:string)=>({ownerId,companyId,role:"OWNER" as const,requestId:crypto.randomUUID()});

class BlockingAdsProvider implements ReviewedBusinessProvider {
  readonly providerId="ads" as const;readonly capabilities=new Set(["ads.adjust_budget" as const]);readonly supportsIdempotentWrites=true;executionCount=0;
  readonly started:Promise<void>;#markStarted!:()=>void;#release!:()=>void;readonly released:Promise<void>;
  constructor(){this.started=new Promise((resolve)=>{this.#markStarted=resolve;});this.released=new Promise((resolve)=>{this.#release=resolve;});}
  release(){this.#release();}
  health(){return Promise.resolve({state:"HEALTHY" as const,reasonCode:"OK",rateLimitRemaining:100});}
  async execute(){this.executionCount+=1;this.#markStarted();await this.released;return {outcome:"VERIFIED" as const,externalReferenceId:"ads:campaign-locked",summary:"The version-bound campaign budget was verified."};}
  reconcile(externalReferenceId:string){return Promise.resolve({outcome:"VERIFIED" as const,externalReferenceId,summary:"The campaign state was reconciled."});}
}

const setup=async(options:{adsMetadata?:Record<string,unknown>;clock?:{value:string}}={})=>{
  const clock=options.clock??{value:now};
  const ownerId=crypto.randomUUID(),companyA=crypto.randomUUID(),companyB=crypto.randomUUID(),sessionId=crypto.randomUUID();
  const store=new InMemoryIntegrationStore(),companyData=new InMemoryCompanyDataStore(),audits:Parameters<GovernanceAuditWriter>[0][]=[];
  const audit:GovernanceAuditWriter=(event)=>{audits.push(event);};const approvals=new ApprovalService(new InMemoryGovernanceStore([],false),audit);
  const service=new IntegrationRegistryService(store,audit,()=>new Date(clock.value),companyData);service.enableBusinessOperations(approvals);service.setAgentBusinessAuthorityVerifier(()=>Promise.resolve(true));
  const actions={accounting:CommercialCapabilitySchema.options.filter((item)=>item.startsWith("accounting.")),payments:CommercialCapabilitySchema.options.filter((item)=>item.startsWith("payments.")),ads:CommercialCapabilitySchema.options.filter((item)=>item.startsWith("ads.")),analytics:["analytics.read_metric" as const,...CommercialCapabilitySchema.options.filter((item)=>item.startsWith("analytics."))],commerce:CommercialCapabilitySchema.options.filter((item)=>item.startsWith("commerce."))} as const;
  const providers={accounting:new DeterministicBusinessProvider("accounting",new Set(actions.accounting)),payments:new DeterministicBusinessProvider("payments",new Set(actions.payments)),ads:new DeterministicBusinessProvider("ads",new Set(actions.ads)),analytics:new DeterministicBusinessProvider("analytics",new Set(actions.analytics)),commerce:new DeterministicBusinessProvider("commerce",new Set(actions.commerce))};
  Object.values(providers).forEach((provider)=>service.setBusinessProvider(provider));
  const bind=async(companyId:string,provider:keyof typeof providers,exposed:readonly string[]=actions[provider],metadata:Record<string,unknown>={})=>{
    const credentialId=crypto.randomUUID(),bindingId=crypto.randomUUID();companyData.saveCredentialReference(CompanyCredentialReferenceSchema.parse({id:credentialId,ownerId,companyId,provider,secretLocator:`vault.${provider}.${companyId}`,status:"READY",lastVerifiedAt:now,createdAt:now,updatedAt:now}));
    companyData.saveIntegrationBinding(CompanyIntegrationBindingSchema.parse({id:bindingId,ownerId,companyId,provider,integrationType:provider,integrationId:provider,credentialRef:credentialId,status:"READY",capabilitiesExposed:[...exposed],metadata,lastSyncAt:null,createdAt:now,updatedAt:now}));
    await companyScope.run(scope(ownerId,companyId),async()=>{await service.ensureBuiltIns(ownerId);for(const item of service.capabilities().filter((item)=>item.integrationId===provider))await service.setPermission({ownerId,integrationId:provider,capabilityId:item.id,grant:true,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"});});
    return {credentialId,bindingId};
  };
  await bind(companyA,"accounting");await bind(companyA,"payments",actions.payments,{maxPaymentActionMinor:50_000,paymentCurrency:"SGD",dailyPaymentExecutionMinor:100_000,dailyRefundMinor:100_000,cooldownSecondsByCapability:{"payments.execute_refund":0}});await bind(companyA,"ads",actions.ads,{maxAdBudgetMinor:200_000,maxAdBudgetIncreasePercent:25,dailyAdSpendIncreaseMinor:100_000,cooldownSecondsByCapability:{"ads.adjust_budget":0},...options.adsMetadata});await bind(companyA,"analytics");await bind(companyA,"commerce",actions.commerce,{maxDiscountPercentage:20,maxInventoryDelta:50,dailyDiscountImpactMinor:100_000,dailyInventoryValueAdjustmentMinor:100_000,cooldownSecondsByCapability:{"commerce.create_draft_discount":0,"commerce.update_inventory":0}});
  const request=(companyId:string,body:unknown)=>companyScope.run(scope(ownerId,companyId),()=>service.requestBusinessAction({ownerId,body,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"}));
  const approve=async(companyId:string,id:string,recent=true)=>companyScope.run(scope(ownerId,companyId),()=>approvals.approve(ownerId,id,sessionId,{ipAddress:"127.0.0.1",requestId:crypto.randomUUID()},recent));
  const webhook=async(companyId:string,body:unknown)=>{const event=BusinessExternalEventInputSchema.parse(body),secret="commercial-webhook-secret",timestamp=String(new Date(now).getTime()),signature=createHmac("sha256",secret).update(`${timestamp}.${ownerId}.${JSON.stringify(event)}`).digest("hex");return companyScope.run(scope(ownerId,companyId),()=>service.ingestBusinessWebhook({ownerId,body:event,signature,timestamp,secret,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"}));};
  return {ownerId,companyA,companyB,service,store,companyData,approvals,providers,audits,bind,request,approve,webhook,clock};
};

describe("Phase 26.2 revenue, finance, and growth systems",()=>{
  it("registers finite provider-neutral read/prepare/execute capabilities",async()=>{
    const {service,ownerId,companyA}=await setup();const dashboard=await companyScope.run(scope(ownerId,companyA),()=>service.dashboard(ownerId));
    expect(dashboard.integrations.map((item)=>item.id)).toEqual(expect.arrayContaining(["accounting","payments","ads","analytics","commerce"]));
    expect(service.capabilities().find((item)=>item.id==="payments.execute")).toMatchObject({risk:"high",approvalRequired:true});
    expect(CommercialCapabilitySchema.options.some((item)=>item.includes("anything"))).toBe(false);
  });

  it("runs grounded accounting, ads, analytics, and commerce contracts through the shared runtime",async()=>{
    const {ownerId,companyA,request,approve,providers,service}=await setup();
    expect((await request(companyA,{capability:"accounting.read_pnl",idempotencyKey:"pnl-read-202609",reason:"Read the provider P&L.",references:{},periodStart:"2026-09-01T00:00:00.000Z",periodEnd:"2026-10-01T00:00:00.000Z",timezone:"Asia/Singapore"})).status).toBe("VERIFIED");
    const invoice=await request(companyA,{capability:"accounting.create_draft_invoice",idempotencyKey:"invoice-draft-1",reason:"Create a reviewable invoice draft.",references:{},externalResourceId:null,amountMinor:12_500,currency:"SGD"});await approve(companyA,invoice.approvalId!);expect((await request(companyA,{capability:"accounting.create_draft_invoice",idempotencyKey:"invoice-draft-1",reason:"Create a reviewable invoice draft.",references:{},externalResourceId:null,amountMinor:12_500,currency:"SGD"})).status).toBe("VERIFIED");
    expect((await request(companyA,{capability:"ads.read_performance",idempotencyKey:"campaign-read-1",reason:"Read bounded campaign performance.",references:{},externalResourceId:"campaign-1",periodStart:"2026-09-01T00:00:00.000Z",periodEnd:"2026-09-04T00:00:00.000Z",timezone:"Asia/Singapore"})).status).toBe("VERIFIED");
    const budget={capability:"ads.adjust_budget",idempotencyKey:"campaign-budget-1",reason:"Apply the approved bounded campaign test.",references:{objectiveId:crypto.randomUUID(),experimentId:crypto.randomUUID()},externalResourceId:"campaign-1",currency:"SGD",currentAmountMinor:100_000,proposedAmountMinor:120_000,expectedVersion:"etag-4"};const budgetWaiting=await request(companyA,budget);await approve(companyA,budgetWaiting.approvalId!);expect((await request(companyA,budget)).status).toBe("VERIFIED");
    providers.analytics.setMetric("conversion_rate",430,"basis_points");const metric=await request(companyA,{capability:"analytics.query_metric",idempotencyKey:"conversion-query",reason:"Read the registered conversion metric.",references:{objectiveId:crypto.randomUUID()},metricId:"conversion_rate",periodStart:"2026-09-01T00:00:00.000Z",periodEnd:"2026-09-04T00:00:00.000Z",timezone:"Asia/Singapore"});expect(metric.status).toBe("VERIFIED");
    expect((await request(companyA,{capability:"commerce.read_order",idempotencyKey:"commerce-order-read",reason:"Read the mapped order.",references:{},externalResourceId:"order-42"})).status).toBe("VERIFIED");
    const discount={capability:"commerce.create_draft_discount",idempotencyKey:"discount-draft-1",reason:"Prepare a bounded discount.",references:{},externalResourceId:"product-9",percentage:15,amountMinor:1_500,currency:"SGD"};const discountWaiting=await request(companyA,discount);await approve(companyA,discountWaiting.approvalId!);expect((await request(companyA,discount)).status).toBe("VERIFIED");
    const dashboard=await companyScope.run(scope(ownerId,companyA),()=>service.businessDashboard(ownerId));expect(dashboard.metrics).toEqual(expect.arrayContaining([expect.objectContaining({metricId:"conversion_rate",companyId:companyA,providerTimezone:"Asia/Singapore",queryPeriodStart:"2026-09-01T00:00:00.000Z",definitionRef:"analytics:conversion_rate"})]));
  });

  it("separates payment preparation from recent-authenticated execution and executes a duplicate once",async()=>{
    const {companyA,request,approve,providers}=await setup();
    const prepared=await request(companyA,{capability:"payments.prepare_refund",idempotencyKey:"prepare-refund-1",reason:"Prepare a bounded customer refund.",references:{},externalResourceId:"payment-42",amountMinor:43_800,currency:"SGD"});expect(prepared.status).toBe("WAITING_APPROVAL");
    await approve(companyA,prepared.approvalId!,false); // preparation needs explicit approval only
    expect((await request(companyA,{capability:"payments.prepare_refund",idempotencyKey:"prepare-refund-1",reason:"Prepare a bounded customer refund.",references:{},externalResourceId:"payment-42",amountMinor:43_800,currency:"SGD"})).status).toBe("VERIFIED");
    const action={capability:"payments.execute_refund",idempotencyKey:"execute-refund-1",reason:"Execute the approved refund.",references:{agentId:"finance"},externalResourceId:"payment-42",amountMinor:43_800,currency:"SGD",expectedVersion:"v3"};
    const waiting=await request(companyA,action);expect(waiting).toMatchObject({status:"WAITING_APPROVAL"});await expect(approve(companyA,waiting.approvalId!,false)).rejects.toMatchObject({code:"RECENT_AUTHENTICATION_REQUIRED"});await approve(companyA,waiting.approvalId!,true);
    const done=await request(companyA,action),duplicate=await request(companyA,action);expect(done.status).toBe("VERIFIED");expect(duplicate.id).toBe(done.id);expect(providers.payments.executionCount).toBe(2);
  });

  it("fails closed on financial, spend, discount, and inventory policy boundaries",async()=>{
    const {companyA,request}=await setup();
    await expect(request(companyA,{capability:"payments.execute_refund",idempotencyKey:"refund-over-cap",reason:"Oversized refund.",references:{},externalResourceId:"payment-1",amountMinor:50_001,currency:"SGD",expectedVersion:"v1"})).rejects.toMatchObject({code:"FINANCIAL_POLICY_DENIED"});
    await expect(request(companyA,{capability:"ads.adjust_budget",idempotencyKey:"budget-over-pct",reason:"Unsafe budget increase.",references:{},externalResourceId:"campaign-1",currency:"SGD",currentAmountMinor:100_000,proposedAmountMinor:130_000,expectedVersion:"v1"})).rejects.toMatchObject({code:"AD_SPEND_POLICY_DENIED"});
    await expect(request(companyA,{capability:"commerce.create_draft_discount",idempotencyKey:"discount-over-cap",reason:"Unsafe discount.",references:{},externalResourceId:"product-1",percentage:21,amountMinor:2_100,currency:"SGD"})).rejects.toMatchObject({code:"PRICING_POLICY_DENIED"});
    await expect(request(companyA,{capability:"commerce.update_inventory",idempotencyKey:"negative-stock",reason:"Invalid inventory change.",references:{},externalResourceId:"variant-1",expectedVersion:"v1",currentQuantity:4,quantityDelta:-5})).rejects.toBeTruthy();
  });

  it("deduplicates canonical revenue across systems and keeps currencies distinct",async()=>{
    const {ownerId,companyA,service,webhook}=await setup();const objectiveId=crypto.randomUUID(),observations:unknown[]=[];service.setBusinessOutcomeSinks({objectiveMetric:(value)=>{observations.push(value);return Promise.resolve();}});
    const base={companyId:companyA,canonicalEventId:"commercial-order-42",occurredAt:now,entityRef:"order-42",objectiveId};
    await webhook(companyA,{...base,integrationId:"commerce",externalEventId:"commerce-order-42",type:"ORDER_CREATED",sourceRole:"ORDER",entityType:"ORDER",internalEntityId:"order-internal-42",amountMinor:10_000,currency:"SGD",metricId:"revenue",metricValue:10_000,metricUnit:"SGD_minor"});
    await webhook(companyA,{...base,integrationId:"payments",externalEventId:"payment-order-42",type:"PAYMENT_SUCCEEDED",sourceRole:"PAYMENT_STATUS",amountMinor:10_000,currency:"SGD",metricId:"revenue",metricValue:10_000,metricUnit:"SGD_minor"});
    await webhook(companyA,{...base,integrationId:"accounting",externalEventId:"invoice-order-42",type:"INVOICE_CREATED",sourceRole:"BOOK_REVENUE",amountMinor:10_000,currency:"SGD",metricId:"revenue",metricValue:10_000,metricUnit:"SGD_minor"});
    await webhook(companyA,{...base,integrationId:"accounting",externalEventId:"invoice-order-42-replay",type:"INVOICE_CREATED",sourceRole:"BOOK_REVENUE",amountMinor:10_000,currency:"SGD",metricId:"revenue",metricValue:10_000,metricUnit:"SGD_minor"});
    await webhook(companyA,{...base,canonicalEventId:"commercial-order-usd",integrationId:"accounting",externalEventId:"invoice-usd",type:"INVOICE_CREATED",sourceRole:"BOOK_REVENUE",amountMinor:2_500,currency:"USD",metricId:"revenue",metricValue:2_500,metricUnit:"USD_minor"});
    const dashboard=await companyScope.run(scope(ownerId,companyA),()=>service.businessDashboard(ownerId));expect(dashboard.metrics.filter((item)=>item.metricId==="revenue")).toHaveLength(2);expect(observations).toHaveLength(2);expect(dashboard.mappings).toEqual(expect.arrayContaining([expect.objectContaining({entityType:"ORDER",internalEntityId:"order-internal-42",externalId:"order-42"})]));
    expect(summarizeBookRevenue(dashboard.commercialFacts,{companyId:companyA,periodStart:"2026-09-01T00:00:00.000Z",periodEnd:"2026-10-01T00:00:00.000Z",timezone:"Asia/Singapore",retrievedAt:now})).toEqual([{currency:"SGD",amountMinor:10_000,sourceRole:"BOOK_REVENUE",sourceEventIds:["invoice-order-42"],periodStart:"2026-09-01T00:00:00.000Z",periodEnd:"2026-10-01T00:00:00.000Z",retrievedAt:now},{currency:"USD",amountMinor:2_500,sourceRole:"BOOK_REVENUE",sourceEventIds:["invoice-usd"],periodStart:"2026-09-01T00:00:00.000Z",periodEnd:"2026-10-01T00:00:00.000Z",retrievedAt:now}]);
  });

  it("denies cross-company/provider/scope laundering and authenticates webhook replay",async()=>{
    const {ownerId,companyA,companyB,service,bind,request,webhook}=await setup();const workflowEvents:unknown[]=[];service.setBusinessOutcomeSinks({commercialEvent:(event)=>{workflowEvents.push(event);return Promise.resolve();}});await companyScope.run(scope(ownerId,companyB),async()=>{await service.ensureBuiltIns(ownerId);for(const item of service.capabilities().filter((item)=>item.integrationId==="payments"))await service.setPermission({ownerId,integrationId:"payments",capabilityId:item.id,grant:true,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"});});
    await expect(request(companyB,{capability:"payments.read",idempotencyKey:"cross-company-payment",reason:"Attempt other-company payment access.",references:{},externalResourceId:"payment-private"})).rejects.toMatchObject({code:"INTEGRATION_BINDING_DENIED"});
    await bind(companyB,"payments",["payments.read"],{maxPaymentActionMinor:10_000,paymentCurrency:"SGD",dailyRefundMinor:10_000});await expect(request(companyB,{capability:"payments.execute_refund",idempotencyKey:"read-scope-refund",reason:"Attempt refund with read scope.",references:{},externalResourceId:"payment-2",amountMinor:100,currency:"SGD",expectedVersion:"v1"})).rejects.toMatchObject({code:"INTEGRATION_BINDING_DENIED"});
    const event={integrationId:"payments",companyId:companyA,externalEventId:"failed-payment-1",type:"PAYMENT_FAILED",occurredAt:now,canonicalEventId:"payment-1",sourceRole:"PAYMENT_STATUS",entityRef:"payment-1"};const first=await webhook(companyA,event),duplicate=await webhook(companyA,event);expect(first.duplicate).toBe(false);expect(duplicate.duplicate).toBe(true);expect(workflowEvents).toEqual([expect.objectContaining({companyId:companyA,eventType:"PAYMENT_FAILED",canonicalEventId:"payment-1"})]);
    await expect(webhook(companyA,{...event,integrationId:"commerce",externalEventId:"role-forgery",type:"ORDER_CREATED",sourceRole:"BOOK_REVENUE",amountMinor:100,currency:"SGD",metricId:"revenue",metricValue:100,metricUnit:"SGD_minor"})).rejects.toMatchObject({code:"COMMERCIAL_SOURCE_ROLE_INVALID"});
  });

  it("does not blind-retry uncertain money movement and reconciles once",async()=>{
    const {companyA,request,approve,providers,service,ownerId}=await setup();providers.payments.makeNextExecutionUncertain();const action={capability:"payments.execute_refund",idempotencyKey:"uncertain-refund",reason:"Execute one approved refund.",references:{},externalResourceId:"payment-uncertain",amountMinor:1_000,currency:"SGD",expectedVersion:"v2"};const waiting=await request(companyA,action);await approve(companyA,waiting.approvalId!);const uncertain=await request(companyA,action);expect(uncertain.status).toBe("EXTERNAL_RESULT_UNCERTAIN");expect(providers.payments.executionCount).toBe(1);const reconciled=await companyScope.run(scope(ownerId,companyA),()=>service.reconcileBusinessAction({ownerId,executionId:uncertain.id,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"}));expect(reconciled.status).toBe("VERIFIED");expect(providers.payments.executionCount).toBe(1);
  });

  it("serializes concurrent mutations of the same external campaign",async()=>{
    const {companyA,request,approve,service}=await setup();const provider=new BlockingAdsProvider();service.setBusinessProvider(provider);
    const make=(idempotencyKey:string)=>({capability:"ads.adjust_budget",idempotencyKey,reason:"Apply one version-bound campaign mutation.",references:{agentId:idempotencyKey},externalResourceId:"campaign-shared",currency:"SGD",currentAmountMinor:100_000,proposedAmountMinor:110_000,expectedVersion:"etag-7"});
    const firstAction=make("campaign-lock-a"),secondAction=make("campaign-lock-b");const firstWaiting=await request(companyA,firstAction),secondWaiting=await request(companyA,secondAction);await approve(companyA,firstWaiting.approvalId!);await approve(companyA,secondWaiting.approvalId!);
    const first=request(companyA,firstAction);await provider.started;await expect(request(companyA,secondAction)).rejects.toMatchObject({code:"EXTERNAL_RESOURCE_LEASE_HELD"});provider.release();expect((await first).status).toBe("VERIFIED");expect(provider.executionCount).toBe(1);
  });

  it("uses fenced leases with expiry recovery without globally serializing unrelated resources",()=>{
    const store=new InMemoryIntegrationStore(),ownerId=crypto.randomUUID(),companyId=crypto.randomUUID();
    const base={ownerId,companyId,provider:"ads",resourceType:"budget",now:"2026-09-04T10:00:00.000Z",expiresAt:"2026-09-04T10:00:30.000Z"};
    const first=store.acquireCommercialMutationLease({...base,resourceId:"campaign-a",token:crypto.randomUUID()});expect(first?.fence).toBe(1);
    expect(store.acquireCommercialMutationLease({...base,resourceId:"campaign-a",token:crypto.randomUUID()})).toBeNull();
    expect(store.acquireCommercialMutationLease({...base,resourceId:"campaign-b",token:crypto.randomUUID()})).toMatchObject({fence:1});
    const recovered=store.acquireCommercialMutationLease({...base,resourceId:"campaign-a",token:crypto.randomUUID(),now:"2026-09-04T10:00:31.000Z",expiresAt:"2026-09-04T10:01:01.000Z"});expect(recovered?.fence).toBe(2);
    expect(store.validateCommercialMutationLease({...base,resourceId:"campaign-a",token:first!.token,fence:first!.fence,now:"2026-09-04T10:00:31.000Z"})).toBe(false);expect(store.validateCommercialMutationLease({...base,resourceId:"campaign-a",token:recovered!.token,fence:recovered!.fence,now:"2026-09-04T10:00:31.000Z"})).toBe(true);
    expect(store.releaseCommercialMutationLease({...base,resourceId:"campaign-a",token:first!.token,fence:first!.fence})).toBe(false);
  });

  it("atomically reserves per-company, action-class, currency, and day aggregate ceilings",()=>{
    const store=new InMemoryIntegrationStore(),ownerId=crypto.randomUUID(),companyId=crypto.randomUUID(),at="2026-09-04T10:00:00.000Z";
    const reservation=(id:string,amountMinor:number,currency="SGD")=>({id,ownerId,companyId,provider:"ads",actionClass:"AD_SPEND_INCREASE" as const,currency,dayKey:"2026-09-04",amountMinor,idempotencyKey:`budget-${id}`,status:"RESERVED" as const,createdAt:at,updatedAt:at});
    expect(store.reserveCommercialAggregate({reservation:reservation(crypto.randomUUID(),9_000),limitMinor:10_000}).accepted).toBe(true);
    const left=store.reserveCommercialAggregate({reservation:reservation(crypto.randomUUID(),1_000),limitMinor:10_000}),right=store.reserveCommercialAggregate({reservation:reservation(crypto.randomUUID(),1_000),limitMinor:10_000});
    expect([left.accepted,right.accepted].filter(Boolean)).toHaveLength(1);
    expect(store.reserveCommercialAggregate({reservation:reservation(crypto.randomUUID(),10_000,"USD"),limitMinor:10_000}).accepted).toBe(true);
  });

  it("enforces cooldown and requires exact recent-authenticated approval for an override",async()=>{
    const clock={value:now};const {companyA,request,approve}=await setup({clock,adsMetadata:{cooldownSecondsByCapability:{"ads.adjust_budget":1_800}}});
    const action=(idempotencyKey:string,externalResourceId:string,cooldownOverride=false)=>({capability:"ads.adjust_budget",idempotencyKey,reason:"Apply a bounded versioned campaign change.",references:{agentId:"growth"},externalResourceId,currency:"SGD",currentAmountMinor:100_000,proposedAmountMinor:110_000,expectedVersion:`etag-${idempotencyKey}`,cooldownOverride});
    const first=await request(companyA,action("cooldown-first","campaign-cooldown"));await approve(companyA,first.approvalId!);expect((await request(companyA,action("cooldown-first","campaign-cooldown"))).status).toBe("VERIFIED");
    clock.value="2026-09-04T10:05:00.000Z";const blocked=await request(companyA,action("cooldown-blocked","campaign-cooldown"));await approve(companyA,blocked.approvalId!);await expect(request(companyA,action("cooldown-blocked","campaign-cooldown"))).rejects.toMatchObject({code:"COMMERCIAL_COOLDOWN_ACTIVE"});
    const override=await request(companyA,action("cooldown-override","campaign-cooldown",true));await expect(approve(companyA,override.approvalId!,false)).rejects.toMatchObject({code:"RECENT_AUTHENTICATION_REQUIRED"});await approve(companyA,override.approvalId!,true);expect((await request(companyA,action("cooldown-override","campaign-cooldown",true))).status).toBe("VERIFIED");
  });

  it("converts retryable provider timeouts after commercial dispatch into reconciliation-required state",async()=>{
    const {companyA,request,approve,providers}=await setup();providers.payments.failNextExecutions(1,"TIMEOUT");const action={capability:"payments.execute_refund",idempotencyKey:"refund-timeout",reason:"Execute one bounded refund.",references:{},externalResourceId:"payment-timeout",amountMinor:1_000,currency:"SGD",expectedVersion:"v1"};
    const waiting=await request(companyA,action);await approve(companyA,waiting.approvalId!);const uncertain=await request(companyA,action);expect(uncertain).toMatchObject({status:"EXTERNAL_RESULT_UNCERTAIN",verification:"UNCERTAIN",attemptCount:1});expect(providers.payments.executionCount).toBe(1);
  });

  it("does not let a delayed payment status regress the first canonical provider fact",async()=>{
    const {ownerId,companyA,webhook,service}=await setup();const base={integrationId:"payments",companyId:companyA,canonicalEventId:"payment-state-42",sourceRole:"PAYMENT_STATUS" as const,entityRef:"payment-42"};
    await webhook(companyA,{...base,externalEventId:"payment-succeeded-42",type:"PAYMENT_SUCCEEDED",occurredAt:"2026-09-04T09:59:00.000Z"});
    await webhook(companyA,{...base,externalEventId:"payment-pending-delayed-42",type:"PAYMENT_FAILED",occurredAt:"2026-09-04T09:58:00.000Z"});
    const dashboard=await companyScope.run(scope(ownerId,companyA),()=>service.businessDashboard(ownerId));expect(dashboard.commercialFacts.filter((fact)=>fact.canonicalEventId==="payment-state-42")).toEqual([expect.objectContaining({eventType:"PAYMENT_SUCCEEDED",externalEventId:"payment-succeeded-42"})]);
  });

  it("allows a newer provider status to replace an older-arriving mutable status fact",async()=>{
    const {ownerId,companyA,webhook,service}=await setup();const base={integrationId:"payments",companyId:companyA,canonicalEventId:"payment-state-reverse",sourceRole:"PAYMENT_STATUS" as const,entityRef:"payment-reverse"};
    await webhook(companyA,{...base,externalEventId:"payment-failed-old",type:"PAYMENT_FAILED",occurredAt:"2026-09-04T09:58:00.000Z"});await webhook(companyA,{...base,externalEventId:"payment-succeeded-new",type:"PAYMENT_SUCCEEDED",occurredAt:"2026-09-04T09:59:00.000Z"});
    const dashboard=await companyScope.run(scope(ownerId,companyA),()=>service.businessDashboard(ownerId));expect(dashboard.commercialFacts.filter((fact)=>fact.canonicalEventId==="payment-state-reverse")).toEqual([expect.objectContaining({eventType:"PAYMENT_SUCCEEDED",externalEventId:"payment-succeeded-new"})]);
  });
});
