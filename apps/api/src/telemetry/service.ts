import { SpanStatusCode, trace, type Attributes } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

export const AlexaTelemetryAttributes = {
  companyId: "alexa.company.id", ownerId: "alexa.owner.id", agentId: "alexa.agent.id",
  departmentId: "alexa.department.id", objectiveId: "alexa.objective.id", workflowId: "alexa.workflow.id",
  taskId: "alexa.task.id", executionId: "alexa.execution.id", deviceId: "alexa.device.id",
  capabilityName: "alexa.capability.name", approvalId: "alexa.approval.id", requestId: "alexa.request.id",
} as const;

export interface TelemetrySink {
  withSpan<T>(name: string, attributes: Attributes, operation: () => Promise<T>): Promise<T>;
  shutdown(): Promise<void>;
}

export class NoopTelemetrySink implements TelemetrySink {
  withSpan<T>(_name: string, _attributes: Attributes, operation: () => Promise<T>) { return operation(); }
  async shutdown() {}
}

export class OpenTelemetryTelemetrySink implements TelemetrySink {
  readonly #tracer = trace.getTracer("alexa-api");
  constructor(readonly sdk: NodeSDK) {}
  withSpan<T>(name: string, attributes: Attributes, operation: () => Promise<T>) {
    return this.#tracer.startActiveSpan(name, { attributes }, async (span) => {
      try { const result = await operation(); span.setStatus({ code: SpanStatusCode.OK }); return result; }
      catch (error) { span.setStatus({ code: SpanStatusCode.ERROR }); throw error; }
      finally { span.end(); }
    });
  }
  async shutdown() { await this.sdk.shutdown().catch(() => undefined); }
}

export const createTelemetrySink = (endpoint: string | undefined): TelemetrySink => {
  if (!endpoint) return new NoopTelemetrySink();
  try {
    const sdk = new NodeSDK({ traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, "")}/v1/traces`, timeoutMillis: 3_000 }) });
    sdk.start();
    return new OpenTelemetryTelemetrySink(sdk);
  } catch { return new NoopTelemetrySink(); }
};
