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
    return !context || (ownerId && context.ownerId !== ownerId) ? undefined : context;
  },
  companyId(ownerId?: string) {
    return this.current(ownerId)?.companyId;
  },
};
