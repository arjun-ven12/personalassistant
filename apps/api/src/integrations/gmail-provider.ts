import { createHash } from "node:crypto";
import { z } from "zod";

import type { BusinessActionRequest } from "@alexa-control/shared";
import type {
  BusinessProviderExecutionContext,
  BusinessProviderResult,
  EmailProvider,
} from "./business-providers.js";

const IdentifierSchema=z.object({id:z.string().min(1).max(500)}).passthrough();
const SearchSchema=z.object({messages:z.array(IdentifierSchema).max(100).optional(),resultSizeEstimate:z.number().int().nonnegative().optional()}).passthrough();
const TokenSchema=z.object({access_token:z.string().min(20).max(8_192),expires_in:z.number().int().positive().max(86_400).default(3_600)}).passthrough();
const DraftSchema=z.object({id:z.string().min(1).max(500),message:z.object({raw:z.string().max(20_000_000).optional()}).passthrough().optional()}).passthrough();
type Fetcher=typeof fetch;

const base64url=(value:string)=>Buffer.from(value,"utf8").toString("base64url");
const cleanHeader=(value:string)=>value.replace(/[\r\n]/g," ").trim();
const messageId=(key:string)=>`<${createHash("sha256").update(key).digest("hex")}@alexa.invalid>`;

export class GmailBusinessProvider implements EmailProvider {
  readonly providerId="gmail" as const;
  readonly requiresCredential=true;
  readonly supportsIdempotentWrites=true;
  readonly capabilities=new Set<BusinessActionRequest["capability"]>([
    "email.search","email.read_thread","email.list_attachments","email.create_draft","email.send_draft",
  ]);
  readonly #tokens=new Map<string,{value:string;expiresAt:number}>();
  readonly #results=new Map<string,BusinessProviderResult>();
  readonly #reauthAttempted=new Set<string>();
  constructor(readonly fetcher:Fetcher=fetch,readonly now:()=>Date=()=>new Date()){}

  health(context?:BusinessProviderExecutionContext){
    const credential=context?.credential;
    const refreshable=Boolean(credential?.refreshToken&&credential.clientId&&credential.clientSecret);
    const accessValid=Boolean(credential?.accessToken&&(!credential.expiresAt||Date.parse(credential.expiresAt)>this.now().getTime()+30_000));
    return Promise.resolve(accessValid||refreshable
      ? {state:"HEALTHY" as const,reasonCode:"GMAIL_OAUTH_READY",rateLimitRemaining:null}
      : {state:"REAUTH_REQUIRED" as const,reasonCode:"GMAIL_OAUTH_EXPIRED",rateLimitRemaining:null});
  }

  async execute(action:BusinessActionRequest,context?:BusinessProviderExecutionContext):Promise<BusinessProviderResult>{
    if(!this.capabilities.has(action.capability))return {outcome:"FAILED",externalReferenceId:null,summary:"The reviewed Gmail adapter does not expose this capability.",failureKind:"PERMISSION_DENIED",retryable:false};
    const existing=this.#results.get(action.idempotencyKey);if(existing)return structuredClone(existing);
    let uncertainReference:string|null=null;
    try{
      const token=await this.token(context);
      let result:BusinessProviderResult;
      switch(action.capability){
        case "email.search": {
          const response=SearchSchema.parse(await this.request(`/messages?q=${encodeURIComponent(action.query)}&maxResults=${action.limit}`,token));
          result={outcome:"VERIFIED",externalReferenceId:null,summary:`Gmail verified a bounded search with ${response.messages?.length??0} result reference(s).`};break;
        }
        case "email.read_thread": {
          const response=IdentifierSchema.parse(await this.request(`/threads/${encodeURIComponent(action.threadId)}?format=metadata`,token));
          result={outcome:"VERIFIED",externalReferenceId:`gmail:thread:${response.id}`,summary:"Gmail verified the requested thread."};break;
        }
        case "email.list_attachments": {
          const response=IdentifierSchema.parse(await this.request(`/threads/${encodeURIComponent(action.threadId)}?format=full`,token));
          result={outcome:"VERIFIED",externalReferenceId:`gmail:thread:${response.id}`,summary:"Gmail verified the bounded thread attachment metadata."};break;
        }
        case "email.create_draft": {
          const boundaryId=messageId(action.idempotencyKey);
          const headers=[`To: ${action.to.map(cleanHeader).join(", ")}`,action.cc.length?`Cc: ${action.cc.map(cleanHeader).join(", ")}`:null,`Subject: ${cleanHeader(action.subject)}`,`Message-ID: ${boundaryId}`,"MIME-Version: 1.0","Content-Type: text/plain; charset=UTF-8",action.threadId?`In-Reply-To: ${cleanHeader(action.threadId)}`:null].filter(Boolean).join("\r\n");
          const response=IdentifierSchema.parse(await this.request("/drafts",token,{method:"POST",body:JSON.stringify({message:{raw:base64url(`${headers}\r\n\r\n${action.body}`),...(action.threadId?{threadId:action.threadId}:{})}})}));
          result={outcome:"VERIFIED",externalReferenceId:`gmail:draft:${response.id}`,summary:"Gmail acknowledged the reviewed draft."};break;
        }
        case "email.send_draft": {
          const draft=DraftSchema.parse(await this.request(`/drafts/${encodeURIComponent(action.draftId)}?format=raw`,token));
          const raw=draft.message?.raw?Buffer.from(draft.message.raw,"base64url").toString("utf8"):"";
          const stableMessageId=/^Message-ID:\s*(\S+)/im.exec(raw)?.[1];
          uncertainReference=stableMessageId?`gmail:message-id:${encodeURIComponent(stableMessageId)}`:`gmail:draft-send:${action.draftId}`;
          const response=IdentifierSchema.parse(await this.request("/drafts/send",token,{method:"POST",body:JSON.stringify({id:action.draftId})}));
          result={outcome:"VERIFIED",externalReferenceId:`gmail:message:${response.id}`,summary:"Gmail acknowledged the approved send."};break;
        }
        default:return {outcome:"FAILED",externalReferenceId:null,summary:"The Gmail capability is not implemented.",failureKind:"PERMISSION_DENIED",retryable:false};
      }
      this.#results.set(action.idempotencyKey,result);return structuredClone(result);
    }catch(error){
      const credential=context?.credential;
      if(error instanceof GmailProviderError&&error.kind==="EXPIRED_CREDENTIAL"&&context&&credential?.refreshToken&&credential.clientId&&credential.clientSecret&&!this.#reauthAttempted.has(action.idempotencyKey)){
        this.#reauthAttempted.add(action.idempotencyKey);if(context.credentialBindingId)this.#tokens.delete(context.credentialBindingId);
        return this.execute(action,{...context,credential:{refreshToken:credential.refreshToken,clientId:credential.clientId,clientSecret:credential.clientSecret}});
      }
      return this.failure(error,action,uncertainReference);
    }
  }

  async reconcile(externalReferenceId:string,context?:BusinessProviderExecutionContext):Promise<BusinessProviderResult>{
    const parts=externalReferenceId.split(":");
    if(parts.length<3||parts[0]!=="gmail")return {outcome:"FAILED",externalReferenceId,summary:"The Gmail external reference is invalid.",failureKind:"INVALID_RECORD",retryable:false};
    try{
      const token=await this.token(context);
      if(parts[1]==="message")await this.request(`/messages/${encodeURIComponent(parts.slice(2).join(":"))}?format=minimal`,token);
      else if(parts[1]==="message-id"){
        const id=decodeURIComponent(parts.slice(2).join(":"));const found=SearchSchema.parse(await this.request(`/messages?q=${encodeURIComponent(`rfc822msgid:${id}`)}&maxResults=1`,token));
        if(!found.messages?.length)return {outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId,summary:"Gmail has not confirmed the message yet."};
      } else return {outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId,summary:"The draft is absent or still pending; owner review is required."};
      return {outcome:"VERIFIED",externalReferenceId,summary:"Gmail independently confirmed the external message."};
    }catch{return {outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId,summary:"Gmail reconciliation could not confirm the external message."};}
  }

  private async token(context?:BusinessProviderExecutionContext){
    const credential=context?.credential;if(!credential)throw new GmailProviderError("EXPIRED_CREDENTIAL",false);
    const cacheKey=context?.credentialBindingId??"unbound",cached=this.#tokens.get(cacheKey);
    if(cached&&cached.expiresAt>this.now().getTime()+30_000)return cached.value;
    if(credential.accessToken&&(!credential.expiresAt||Date.parse(credential.expiresAt)>this.now().getTime()+30_000))return credential.accessToken;
    if(!credential.refreshToken||!credential.clientId||!credential.clientSecret)throw new GmailProviderError("EXPIRED_CREDENTIAL",false);
    const response=await this.fetcher("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:credential.refreshToken,client_id:credential.clientId,client_secret:credential.clientSecret}),signal:AbortSignal.timeout(10_000)});
    if(!response.ok)throw new GmailProviderError(response.status===429?"RATE_LIMIT":response.status>=500?"OUTAGE":"EXPIRED_CREDENTIAL",response.status===429||response.status>=500);
    const parsed=TokenSchema.parse(await response.json());this.#tokens.set(cacheKey,{value:parsed.access_token,expiresAt:this.now().getTime()+parsed.expires_in*1_000});return parsed.access_token;
  }

  private async request(path:string,token:string,init:RequestInit={}):Promise<unknown>{
    let response:Response;
    try{response=await this.fetcher(`https://gmail.googleapis.com/gmail/v1/users/me${path}`,{...init,headers:{authorization:`Bearer ${token}`,"content-type":"application/json",...init.headers},signal:AbortSignal.timeout(10_000)});}
    catch(error){if(error instanceof Error&&error.name==="TimeoutError")throw new GmailProviderError("TIMEOUT",true);throw new GmailProviderError("OUTAGE",true);}
    if(!response.ok){if(response.status===401)throw new GmailProviderError("EXPIRED_CREDENTIAL",false);if(response.status===403)throw new GmailProviderError("PERMISSION_DENIED",false);if(response.status===429)throw new GmailProviderError("RATE_LIMIT",true);if(response.status>=500)throw new GmailProviderError("OUTAGE",true);throw new GmailProviderError("INVALID_RECORD",false);}
    const body:unknown=await response.json();return body;
  }

  private failure(error:unknown,action:BusinessActionRequest,uncertainReference:string|null):BusinessProviderResult{
    const kind=error instanceof GmailProviderError?error.kind:"INVALID_RECORD",retryable=error instanceof GmailProviderError&&error.retryable;
    const uncertain=kind==="TIMEOUT"&&["email.send_draft"].includes(action.capability);
    return {outcome:uncertain?"EXTERNAL_RESULT_UNCERTAIN":"FAILED",externalReferenceId:uncertain?uncertainReference:null,summary:uncertain?"Gmail send acknowledgement was not received; the action must be reconciled and must not be replayed.":`Gmail rejected the bounded request (${kind}).`,failureKind:kind,retryable:uncertain?false:retryable};
  }
}

class GmailProviderError extends Error {
  constructor(readonly kind:NonNullable<BusinessProviderResult["failureKind"]>,readonly retryable:boolean){super(kind);}
}
