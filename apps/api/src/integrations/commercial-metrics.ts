import type { CommercialFact } from "@alexa-control/shared";
import { ExecutionError } from "../execution/errors.js";

export interface CommercialMoneyTotal {
  currency:string;
  amountMinor:number;
  sourceRole:"BOOK_REVENUE";
  sourceEventIds:string[];
  periodStart:string;
  periodEnd:string;
  retrievedAt:string;
}

/** Deterministic, currency-separated arithmetic over accepted book-revenue facts. */
export const summarizeBookRevenue=(facts:readonly CommercialFact[],input:{companyId:string;periodStart:string;periodEnd:string;timezone:string;retrievedAt:string}):CommercialMoneyTotal[]=>{
  const start=Date.parse(input.periodStart),end=Date.parse(input.periodEnd);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)throw new ExecutionError(400,"INVALID_REPORTING_PERIOD","Commercial reporting requires an explicit increasing period.");
  try{new Intl.DateTimeFormat("en",{timeZone:input.timezone}).format(new Date(start));}catch{throw new ExecutionError(400,"INVALID_TIMEZONE","The company reporting timezone is invalid.");}
  const totals=new Map<string,{amount:bigint;ids:string[]}>();
  for(const fact of facts){
    const occurred=Date.parse(fact.occurredAt);
    if(fact.companyId!==input.companyId||fact.sourceRole!=="BOOK_REVENUE"||fact.amountMinor===null||!fact.currency||occurred<start||occurred>=end)continue;
    const current=totals.get(fact.currency)??{amount:0n,ids:[]};current.amount+=BigInt(fact.amountMinor);current.ids.push(fact.externalEventId);totals.set(fact.currency,current);
  }
  return [...totals.entries()].sort(([left],[right])=>left.localeCompare(right)).map(([currency,value])=>{
    const amountMinor=Number(value.amount);if(!Number.isSafeInteger(amountMinor))throw new ExecutionError(409,"MONETARY_TOTAL_OVERFLOW","The minor-unit total exceeds safe application bounds.");
    return {currency,amountMinor,sourceRole:"BOOK_REVENUE",sourceEventIds:value.ids.sort(),periodStart:input.periodStart,periodEnd:input.periodEnd,retrievedAt:input.retrievedAt};
  });
};
