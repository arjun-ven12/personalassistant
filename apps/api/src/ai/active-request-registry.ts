export type ActiveAIRequestState =
  | "ROUTING"
  | "CONTEXT"
  | "RESERVING"
  | "INFERENCE"
  | "FINALIZING";

export type ActiveAIRequest = {
  requestId: string;
  ownerId?: string;
  routeId: string;
  state: ActiveAIRequestState;
  providerId?: string;
  modelId?: string;
  reservationId?: string;
  startedAt: string;
  controller: AbortController;
};

/** Bounded operational state only; durable economic truth remains in PostgreSQL. */
export class ActiveAIRequestRegistry {
  private readonly active = new Map<string, ActiveAIRequest>();
  private draining = false;

  begin(input: Omit<ActiveAIRequest, "controller" | "startedAt">) {
    if (this.draining) throw new Error("RUNTIME_DRAINING");
    const record: ActiveAIRequest = {
      ...input,
      controller: new AbortController(),
      startedAt: new Date().toISOString(),
    };
    this.active.set(record.requestId, record);
    return record;
  }
  update(requestId: string, update: Partial<Omit<ActiveAIRequest, "requestId" | "ownerId" | "routeId" | "controller" | "startedAt">>) {
    const current = this.active.get(requestId);
    if (current) Object.assign(current, update);
  }
  finish(requestId: string) { this.active.delete(requestId); }
  cancel(ownerId: string, requestId: string) {
    const record = this.active.get(requestId);
    if (!record || record.ownerId !== ownerId) return false;
    record.controller.abort();
    return true;
  }
  beginDrain() { this.draining = true; }
  cancelAll() { for (const record of this.active.values()) record.controller.abort(); }
  isDraining() { return this.draining; }
  list(ownerId?: string) {
    return [...this.active.values()]
      .filter((item) => !ownerId || item.ownerId === ownerId)
      .map((item) => ({
        requestId: item.requestId,
        ownerId: item.ownerId,
        routeId: item.routeId,
        state: item.state,
        providerId: item.providerId,
        modelId: item.modelId,
        reservationId: item.reservationId,
        startedAt: item.startedAt,
      }));
  }
}
