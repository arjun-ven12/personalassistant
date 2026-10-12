import type { ToolInvocationReceipt } from "./store.js";

/** Bounded read model over durable receipts; never includes provider output or action arguments. */
export function summarizeToolReceipts(receipts: readonly ToolInvocationReceipt[]) {
  const groups = new Map<string, { toolId: string; providerId: string; callCount: number; successCount: number; failureCount: number; indeterminateCount: number; totalLatencyMs: number; measuredCount: number; retryCount: number; acceptedCount: number; rejectedCount: number; knownCostMinorByCurrency: Record<string, number> }>();
  for (const receipt of receipts) {
    const result = receipt.result;
    const providerId = result?.providerId ?? receipt.toolId.slice(0, receipt.toolId.lastIndexOf(":"));
    const item = groups.get(receipt.toolId) ?? { toolId: receipt.toolId, providerId, callCount: 0, successCount: 0, failureCount: 0, indeterminateCount: 0, totalLatencyMs: 0, measuredCount: 0, retryCount: 0, acceptedCount: 0, rejectedCount: 0, knownCostMinorByCurrency: {} };
    item.callCount += 1;
    if (result?.status === "SUCCEEDED") item.successCount += 1;
    else if (receipt.status === "INDETERMINATE" || receipt.status === "RESERVED" || result?.status === "INDETERMINATE") item.indeterminateCount += 1;
    else item.failureCount += 1;
    if (result) {
      item.totalLatencyMs += result.latencyMs;
      item.measuredCount += 1;
      item.retryCount += result.retryCount ?? 0;
      if (result.ownerAcceptance === "ACCEPTED") item.acceptedCount += 1;
      if (result.ownerAcceptance === "REJECTED") item.rejectedCount += 1;
      if (result.costCurrency && result.costMinor !== null && result.costMinor !== undefined) item.knownCostMinorByCurrency[result.costCurrency] = (item.knownCostMinorByCurrency[result.costCurrency] ?? 0) + result.costMinor;
    }
    groups.set(receipt.toolId, item);
  }
  return [...groups.values()].sort((a, b) => a.toolId.localeCompare(b.toolId)).map(({ totalLatencyMs, measuredCount, ...item }) => ({ ...item, averageLatencyMs: measuredCount ? totalLatencyMs / measuredCount : null }));
}
