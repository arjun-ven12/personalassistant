# Alexa shared OpenTelemetry Collector

This is a single bounded Collector topology for all Alexa companies and runtimes. Use an OpenTelemetry Collector Contrib distribution because the configuration uses `attributes` and `tail_sampling` processors.

The API exports OTLP to the configured `OTEL_EXPORTER_OTLP_ENDPOINT`. The Collector applies memory limits, deletes known sensitive attributes, retains errors, samples ordinary successful traces, batches, and exports only to explicitly configured backends. The checked-in debug exporter is local and contains basic summaries only; production must replace it with an approved backend and transport credentials supplied outside source control.

Collector availability is not an execution dependency. SDK export and native observability persistence failures are swallowed within bounded telemetry paths, while the original business operation retains its own result.

Audit events are not sent through this sampling pipeline and must not be configured as ordinary telemetry.
