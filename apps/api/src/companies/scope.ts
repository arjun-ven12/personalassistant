import { AsyncLocalStorage } from "node:async_hooks";

import type { CompanyContext } from "@alexa-control/shared";

const storage = new AsyncLocalStorage<CompanyContext>();

export const companyScope = {
  enter(context: CompanyContext) {
    storage.enterWith(context);
  },
  run<T>(context: CompanyContext, callback: () => T): T {
    return storage.run(context, callback);
  },
  current(ownerId?: string) {
    const context = storage.getStore();
    if (context && ownerId && context.ownerId !== ownerId)
      throw Object.assign(new Error("Authenticated company context belongs to a different owner."), { code: "COMPANY_OWNER_SCOPE_MISMATCH", statusCode: 403 });
    return context;
  },
  companyId(ownerId?: string) {
    return this.current(ownerId)?.companyId;
  },
};
