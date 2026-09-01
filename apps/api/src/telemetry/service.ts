import { AsyncLocalStorage } from "node:async_hooks";

import { SpanStatusCode, trace, type Attributes } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

export const AlexaTelemetryAttributes = {
  companyId: "alexa.company.id",
  ownerId: "alexa.owner.id",
  agentId: "alexa.agent.id",
  departmentId: "alexa.department.id",
  objectiveId: "alexa.objective.id",
  workflowId: "alexa.workflow.id",
  taskId: "alexa.task.id",
  executionId: "alexa.execution.id",
  deviceId: "alexa.device.id",
  capabilityName: "alexa.capability.name",
  approvalId: "alexa.approval.id",
  requestId: "alexa.request.id",
  assignmentId: "alexa.assignment.id",
  agentDefinitionId: "alexa.agent_definition.id",
  provider: "gen_ai.provider.name",
  model: "gen_ai.request.model",
} as const;

const forbiddenTelemetryAttribute =
  /(authorization|cookie|credential|password|secret|token|api.?key|prompt|input|output|memory|payload|content|email|phone)/i;
const secretTelemetryValue =
  /(bearer\s+[A-Za-z0-9._~+/-]+=*|sk-[A-Za-z0-9]{12,}|oauth|refresh_token|access_token)/i;
const safeTelemetryAttributeKey = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;

/** Sanitizes attributes before they reach either OTLP export or local storage. */
export const sanitizeTelemetryAttributes = (input: Attributes): Attributes => {
  const output: Attributes = {};
  for (const [key, value] of Object.entries(input)) {
    if (!safeTelemetryAttributeKey.test(key) || forbiddenTelemetryAttribute.test(key))
      continue;
    if (typeof value === "string") {
      if (secretTelemetryValue.test(value)) continue;
      output[key] = value.slice(0, 240);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      output[key] = value;
    } else if (typeof value === "boolean") {
      output[key] = value;
    }
  }
  return output;
};

export interface RecordedSystemSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  ownerId: string;
  companyId: string | null;
  service: string;
  operation: string;
  status: "OK" | "ERROR";
  errorSource:
    | "PLANNING"
    | "SCHEDULER"
    | "AGENT"
    | "MODEL"
    | "CAPABILITY"
    | "INTEGRATION"
    | "DATABASE"
    | "POLICY"
    | "APPROVAL"
    | "BUDGET"
    | "DEVICE"
    | "UNKNOWN"
    | null;
  durationMs: number;
  objectiveId: string | null;
  workflowId: string | null;
  taskId: string | null;
  assignmentId: string | null;
  agentDefinitionId: string | null;
  capabilityId: string | null;
  provider: string | null;
  model: string | null;
  attributes: Record<string, unknown>;
  startedAt: string;
  endedAt: string;
}
export type TelemetryRecorder = (span: RecordedSystemSpan) => unknown;

export interface TelemetrySink {
  withSpan<T>(
    name: string,
    attributes: Attributes,
    operation: () => Promise<T>,
  ): Promise<T>;
  setRecorder?(recorder: TelemetryRecorder): void;
  shutdown(): Promise<void>;
}

export class NoopTelemetrySink implements TelemetrySink {
  #recorder?: TelemetryRecorder;
  readonly #context = new AsyncLocalStorage<{ traceId: string; spanId: string }>();
  setRecorder(recorder: TelemetryRecorder) {
    this.#recorder = recorder;
  }
  async withSpan<T>(name: string, attributes: Attributes, operation: () => Promise<T>) {
    const sanitized = sanitizeTelemetryAttributes(attributes);
    const parent = this.#context.getStore();
    const traceId = parent?.traceId ?? crypto.randomUUID().replaceAll("-", "");
    const spanId = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    const started = new Date();
    const startedNs = performance.now();
    try {
      const result = await this.#context.run({ traceId, spanId }, operation);
      await this.record(
        name,
        sanitized,
        "OK",
        started,
        startedNs,
        traceId,
        spanId,
        parent?.spanId ?? null,
      );
      return result;
    } catch (error) {
      await this.record(
        name,
        sanitized,
        "ERROR",
        started,
        startedNs,
        traceId,
        spanId,
        parent?.spanId ?? null,
      );
      throw error;
    }
  }
  private async record(
    name: string,
    attributes: Attributes,
    status: "OK" | "ERROR",
    started: Date,
    startedNs: number,
    traceId: string,
    spanId: string,
    parentSpanId: string | null,
  ) {
    if (!this.#recorder) return;
    await Promise.resolve()
      .then(() =>
        this.#recorder!(
          toRecordedSpan(
            name,
            attributes,
            status,
            started,
            startedNs,
            traceId,
            spanId,
            parentSpanId,
          ),
        ),
      )
      .catch(() => undefined);
  }
  async shutdown() {}
}

export class OpenTelemetryTelemetrySink implements TelemetrySink {
  readonly #tracer = trace.getTracer("alexa-api");
  #recorder?: TelemetryRecorder;
  constructor(readonly sdk: NodeSDK) {}
  setRecorder(recorder: TelemetryRecorder) {
    this.#recorder = recorder;
  }
  withSpan<T>(name: string, attributes: Attributes, operation: () => Promise<T>) {
    const sanitized = sanitizeTelemetryAttributes(attributes);
    const parentSpanId = trace.getActiveSpan()?.spanContext().spanId ?? null;
    const started = new Date();
    const startedNs = performance.now();
    return this.#tracer.startActiveSpan(
      name,
      { attributes: sanitized },
      async (span) => {
        let status: "OK" | "ERROR" = "OK";
        try {
          const result = await operation();
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          status = "ERROR";
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          const context = span.spanContext();
          span.end();
          if (this.#recorder)
            await Promise.resolve()
              .then(() =>
                this.#recorder!(
                  toRecordedSpan(
                    name,
                    sanitized,
                    status,
                    started,
                    startedNs,
                    context.traceId,
                    context.spanId,
                    parentSpanId,
                  ),
                ),
              )
              .catch(() => undefined);
        }
      },
    );
  }
  async shutdown() {
    await this.sdk.shutdown().catch(() => undefined);
  }
}

export const createTelemetrySink = (endpoint: string | undefined): TelemetrySink => {
  if (!endpoint) return new NoopTelemetrySink();
  try {
    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({
        url: `${endpoint.replace(/\/$/, "")}/v1/traces`,
        timeoutMillis: 3_000,
      }),
    });
    sdk.start();
    return new OpenTelemetryTelemetrySink(sdk);
  } catch {
    return new NoopTelemetrySink();
  }
};

const stringAttribute = (attributes: Attributes, key: string) =>
  typeof attributes[key] === "string" ? attributes[key] : null;
const classifyError = (name: string): RecordedSystemSpan["errorSource"] =>
  /plan|objective/i.test(name)
    ? "PLANNING"
    : /schedul/i.test(name)
      ? "SCHEDULER"
      : /agent/i.test(name)
        ? "AGENT"
        : /model|ai|router|provider/i.test(name)
          ? "MODEL"
          : /capability/i.test(name)
            ? "CAPABILITY"
            : /integration/i.test(name)
              ? "INTEGRATION"
              : /database|postgres|redis/i.test(name)
                ? "DATABASE"
                : /policy/i.test(name)
                  ? "POLICY"
                  : /approval/i.test(name)
                    ? "APPROVAL"
                    : /budget|econom/i.test(name)
                      ? "BUDGET"
                      : /device|mobile|mac/i.test(name)
                        ? "DEVICE"
                        : "UNKNOWN";
const toRecordedSpan = (
  name: string,
  attributes: Attributes,
  status: "OK" | "ERROR",
  started: Date,
  startedNs: number,
  traceId: string,
  spanId: string,
  parentSpanId: string | null,
): RecordedSystemSpan => ({
  traceId,
  spanId,
  parentSpanId,
  ownerId: stringAttribute(attributes, AlexaTelemetryAttributes.ownerId) ?? "",
  companyId: stringAttribute(attributes, AlexaTelemetryAttributes.companyId),
  service: stringAttribute(attributes, "service.name") ?? "alexa-api",
  operation: name,
  status,
  errorSource: status === "ERROR" ? classifyError(name) : null,
  durationMs: Math.max(0, performance.now() - startedNs),
  objectiveId: stringAttribute(attributes, AlexaTelemetryAttributes.objectiveId),
  workflowId: stringAttribute(attributes, AlexaTelemetryAttributes.workflowId),
  taskId: stringAttribute(attributes, AlexaTelemetryAttributes.taskId),
  assignmentId: stringAttribute(attributes, AlexaTelemetryAttributes.assignmentId),
  agentDefinitionId: stringAttribute(
    attributes,
    AlexaTelemetryAttributes.agentDefinitionId,
  ),
  capabilityId: stringAttribute(attributes, AlexaTelemetryAttributes.capabilityName),
  provider: stringAttribute(attributes, AlexaTelemetryAttributes.provider),
  model: stringAttribute(attributes, AlexaTelemetryAttributes.model),
  attributes: { ...attributes },
  startedAt: started.toISOString(),
  endedAt: new Date().toISOString(),
});
