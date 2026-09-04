import { describe, expect, it, vi } from "vitest";

import { GmailBusinessProvider } from "./gmail-provider.js";
import { AllowlistedEnvironmentSecretResolver } from "./secret-resolver.js";

const context={companyId:"20000000-0000-4000-8000-000000000001",credentialBindingId:"30000000-0000-4000-8000-000000000001",credential:{accessToken:"test-access-token-that-is-long-enough"}};
const refs={organizationId:null,objectiveId:null,projectId:null,workflowRunId:null,taskId:null,experimentId:null,variantId:null,agentId:null};
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
const requestUrl=(input:RequestInfo|URL)=>input instanceof URL?input.href:typeof input==="string"?input:input.url;

describe("reviewed Gmail provider",()=>{
  it("resolves only allowlisted validated secrets without returning them in provider results",async()=>{
    const resolver=new AllowlistedEnvironmentSecretResolver({"gmail:gmail-primary":JSON.stringify(context.credential)});
    expect(await resolver.resolve({provider:"gmail",secretLocator:"gmail-primary"})).toEqual(context.credential);
    await expect(resolver.resolve({provider:"gmail",secretLocator:"caller-selected"})).rejects.toMatchObject({code:"CREDENTIAL_SECRET_UNAVAILABLE"});
    const malformed=new AllowlistedEnvironmentSecretResolver({"gmail:gmail-primary":"{bad"});
    await expect(malformed.resolve({provider:"gmail",secretLocator:"gmail-primary"})).rejects.toMatchObject({code:"CREDENTIAL_SECRET_INVALID"});
  });

  it("performs bounded read, draft, and send calls and suppresses a duplicate resend",async()=>{
    const calls:Array<{url:string;authorization:string|null;body:string|null}>=[];
    const fetcher=vi.fn((input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
      const url=requestUrl(input);calls.push({url,authorization:new Headers(init?.headers).get("authorization"),body:typeof init?.body==="string"?init.body:null});
      if(url.includes("/messages?"))return Promise.resolve(response({messages:[{id:"message-1"}]}));
      if(url.endsWith("/drafts"))return Promise.resolve(response({id:"draft-1"}));
      if(url.includes("/drafts/draft-1"))return Promise.resolve(response({id:"draft-1",message:{raw:Buffer.from("Message-ID: <stable@alexa.invalid>\r\n\r\nBody").toString("base64url")}}));
      if(url.endsWith("/drafts/send"))return Promise.resolve(response({id:"sent-1"}));
      return Promise.resolve(response({},404));
    });
    const provider=new GmailBusinessProvider(fetcher);
    const search=await provider.execute({capability:"email.search",idempotencyKey:"gmail-search-001",reason:"Acceptance read.",references:refs,query:"newer_than:1d",limit:5},context);
    const draft=await provider.execute({capability:"email.create_draft",idempotencyKey:"gmail-draft-001",reason:"Acceptance draft.",references:refs,to:["owner@example.com"],cc:[],subject:"Acceptance",body:"Reviewed body",threadId:null},context);
    const sendAction={capability:"email.send_draft" as const,idempotencyKey:"gmail-send-0001",reason:"Approved acceptance send.",references:refs,draftId:"draft-1",recipientCount:1};
    const sent=await provider.execute(sendAction,context);const duplicate=await provider.execute(sendAction,context);
    expect([search.outcome,draft.outcome,sent.outcome,duplicate.outcome]).toEqual(["VERIFIED","VERIFIED","VERIFIED","VERIFIED"]);
    expect(calls.filter((call)=>call.url.endsWith("/drafts/send"))).toHaveLength(1);
    expect(calls.every((call)=>call.authorization===`Bearer ${context.credential.accessToken}`)).toBe(true);
    expect(JSON.stringify([search,draft,sent])).not.toContain(context.credential.accessToken);
  });

  it("refreshes expired OAuth and reconciles a lost send response without resending",async()=>{
    let sendCalls=0;
    const fetcher=vi.fn((input:RequestInfo|URL):Promise<Response>=>{
      const url=requestUrl(input);
      if(url==="https://oauth2.googleapis.com/token")return Promise.resolve(response({access_token:"refreshed-access-token-that-is-long-enough",expires_in:3600}));
      if(url.includes("/drafts/draft-2"))return Promise.resolve(response({id:"draft-2",message:{raw:Buffer.from("Message-ID: <recoverable@alexa.invalid>\r\n\r\nBody").toString("base64url")} }));
      if(url.endsWith("/drafts/send")){sendCalls+=1;return Promise.reject(new DOMException("timeout","TimeoutError"));}
      if(url.includes("rfc822msgid"))return Promise.resolve(response({messages:[{id:"sent-recovered"}]}));
      return Promise.resolve(response({messages:[]}));
    });
    const provider=new GmailBusinessProvider(fetcher,()=>new Date("2026-09-04T00:00:00.000Z"));
    const refreshedContext={...context,credential:{accessToken:"expired-access-token-that-is-long-enough",expiresAt:"2026-09-03T00:00:00.000Z",refreshToken:"refresh-token-that-is-long-enough",clientId:"client-id",clientSecret:"client-secret"}};
    const uncertain=await provider.execute({capability:"email.send_draft",idempotencyKey:"gmail-send-lost1",reason:"Approved send.",references:refs,draftId:"draft-2",recipientCount:1},refreshedContext);
    expect(uncertain.outcome).toBe("EXTERNAL_RESULT_UNCERTAIN");expect(uncertain.externalReferenceId).toContain("gmail:message-id:");
    if(!uncertain.externalReferenceId)throw new Error("Expected a reconciliation reference.");
    expect(await provider.reconcile(uncertain.externalReferenceId,refreshedContext)).toMatchObject({outcome:"VERIFIED"});
    expect(sendCalls).toBe(1);
  });

  it("reconnects once after a provider 401 using the reviewed refresh bundle",async()=>{
    let gmailCalls=0,refreshCalls=0;
    const fetcher=vi.fn((input:RequestInfo|URL):Promise<Response>=>{
      const url=requestUrl(input);
      if(url==="https://oauth2.googleapis.com/token"){refreshCalls+=1;return Promise.resolve(response({access_token:"reauthorized-access-token-long-enough",expires_in:3600}));}
      gmailCalls+=1;return Promise.resolve(gmailCalls===1?response({},401):response({messages:[{id:"message-after-reconnect"}]}));
    });
    const provider=new GmailBusinessProvider(fetcher);
    const reconnectContext={...context,credential:{accessToken:"stale-access-token-that-is-long-enough",refreshToken:"refresh-token-that-is-long-enough",clientId:"client-id",clientSecret:"client-secret"}};
    const result=await provider.execute({capability:"email.search",idempotencyKey:"gmail-reconnect1",reason:"Verify reconnect.",references:refs,query:"newer_than:1d",limit:1},reconnectContext);
    expect(result.outcome).toBe("VERIFIED");expect(refreshCalls).toBe(1);expect(gmailCalls).toBe(2);
  });
});
