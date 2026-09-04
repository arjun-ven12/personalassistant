import { createHmac } from "node:crypto";
import {
  BusinessExternalEventInputSchema,
  CompanyCredentialReferenceSchema,
  CompanyIntegrationBindingSchema,
} from "@alexa-control/shared";
import { describe, expect, it } from "vitest";

import { InMemoryCompanyDataStore } from "../company-data/store.js";
import { companyScope } from "../companies/scope.js";
import { ApprovalService, type GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { GmailBusinessProvider } from "./gmail-provider.js";
import { AllowlistedEnvironmentSecretResolver } from "./secret-resolver.js";
import { IntegrationRegistryService } from "./service.js";
import { InMemoryIntegrationStore } from "./store.js";

const enabled=process.env.GMAIL_LIVE_ACCEPTANCE==="1"&&Boolean(process.env.GMAIL_OAUTH_CREDENTIAL_JSON)&&Boolean(process.env.GMAIL_LIVE_RECIPIENT);

describe.skipIf(!enabled)("Gmail live provider acceptance",()=>{
  it("reads, drafts, obtains exact approval, sends once, and accepts a signed webhook",async()=>{
    const ownerId=crypto.randomUUID(),companyId=crypto.randomUUID(),sessionId=crypto.randomUUID(),at=new Date().toISOString();
    const auditEvents:Parameters<GovernanceAuditWriter>[0][]=[];const audit:GovernanceAuditWriter=(event)=>{auditEvents.push(event);};
    const companyData=new InMemoryCompanyDataStore(),credentialId=crypto.randomUUID(),bindingId=crypto.randomUUID();
    companyData.saveCredentialReference(CompanyCredentialReferenceSchema.parse({id:credentialId,ownerId,companyId,provider:"gmail",secretLocator:"gmail-primary",status:"READY",lastVerifiedAt:at,createdAt:at,updatedAt:at}));
    companyData.saveIntegrationBinding(CompanyIntegrationBindingSchema.parse({id:bindingId,ownerId,companyId,provider:"gmail",integrationType:"email",integrationId:"gmail",credentialRef:credentialId,status:"READY",capabilitiesExposed:["email.search","email.create_draft","email.send_draft"],metadata:{},lastSyncAt:null,createdAt:at,updatedAt:at}));
    const resolver=new AllowlistedEnvironmentSecretResolver({"gmail:gmail-primary":process.env.GMAIL_OAUTH_CREDENTIAL_JSON});
    const approvals=new ApprovalService(new InMemoryGovernanceStore([],false),audit);const service=new IntegrationRegistryService(new InMemoryIntegrationStore(),audit,()=>new Date(),companyData,resolver);service.enableBusinessOperations(approvals);service.setBusinessProvider(new GmailBusinessProvider());
    const scope={ownerId,companyId,role:"OWNER" as const,requestId:crypto.randomUUID()};
    const request=(body:unknown)=>companyScope.run(scope,()=>service.requestBusinessAction({ownerId,body,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"}));
    await companyScope.run(scope,async()=>{await service.ensureBuiltIns(ownerId);for(const capabilityId of ["gmail.email.read","gmail.email.draft","gmail.email.send"])await service.setPermission({ownerId,integrationId:"gmail",capabilityId,grant:true,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"});});
    expect((await request({capability:"email.search",idempotencyKey:`gmail-live-read-${Date.now()}`,reason:"Live acceptance bounded inbox read.",references:{},query:"newer_than:1d",limit:1})).status).toBe("VERIFIED");
    const draft=await request({capability:"email.create_draft",idempotencyKey:`gmail-live-draft-${Date.now()}`,reason:"Live acceptance draft.",references:{},to:[process.env.GMAIL_LIVE_RECIPIENT],cc:[],subject:"Alexa Gmail provider acceptance",body:"Reviewed Phase 26.1A acceptance message.",threadId:null});
    expect(draft.status).toBe("VERIFIED");const draftId=draft.externalReferenceId?.replace("gmail:draft:","");expect(draftId).toBeTruthy();
    const send={capability:"email.send_draft",idempotencyKey:`gmail-live-send-${Date.now()}`,reason:"Approved live provider acceptance send.",references:{},draftId,recipientCount:1};
    const waiting=await request(send);expect(waiting.status).toBe("WAITING_APPROVAL");await companyScope.run(scope,()=>approvals.approve(ownerId,waiting.approvalId!,sessionId,{ipAddress:"127.0.0.1",requestId:crypto.randomUUID()}));
    const sent=await request(send),duplicate=await request(send);expect(sent.status).toBe("VERIFIED");expect(duplicate.id).toBe(sent.id);
    const event=BusinessExternalEventInputSchema.parse({integrationId:"gmail",companyId,externalEventId:`gmail-live-webhook-${Date.now()}`,type:"EMAIL_DELIVERED",occurredAt:new Date().toISOString(),entityRef:sent.externalReferenceId});const webhookSecret=crypto.randomUUID(),timestamp=String(Date.now()),signature=createHmac("sha256",webhookSecret).update(`${timestamp}.${ownerId}.${JSON.stringify(event)}`).digest("hex");
    expect((await companyScope.run(scope,()=>service.ingestBusinessWebhook({ownerId,body:event,signature,timestamp,secret:webhookSecret,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"}))).duplicate).toBe(false);
    const serialized=JSON.stringify({auditEvents,dashboard:await companyScope.run(scope,()=>service.businessDashboard(ownerId))});expect(serialized).not.toMatch(/accessToken|refreshToken|clientSecret|authorization/i);
  },60_000);
});
