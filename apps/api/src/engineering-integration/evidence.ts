import type {
  EngineeringChangeMapEntry,
  EngineeringValidationReport,
} from "@alexa-control/shared";

type Regression = {
  commandId: string;
  file: string | null;
  testName: string | null;
  classification: "PRE_EXISTING" | "NEW_REGRESSION" | "RESOLVED" | "UNKNOWN";
};

/** Only stable command/file/test identities are comparable; prose is not. */
export function classifyValidationRegressions(
  baseline: EngineeringValidationReport | undefined,
  integrated: EngineeringValidationReport,
): Regression[] {
  const failures = (report: EngineeringValidationReport) => report.steps.flatMap((step) =>
    step.failures.map((failure) => ({
      commandId: step.commandId,
      file: failure.file,
      testName: failure.testName,
    })),
  );
  const key = (failure: Omit<Regression, "classification">) =>
    failure.testName
      ? JSON.stringify([failure.commandId, failure.file, failure.testName])
      : null;
  const before = baseline ? failures(baseline) : [];
  const after = failures(integrated);
  const beforeKeys = new Set(before.map(key).filter((value): value is string => value !== null));
  const afterKeys = new Set(after.map(key).filter((value): value is string => value !== null));
  const comparableCommands = new Set(
    (baseline?.steps ?? [])
      .filter((step) =>
        step.status !== "ERROR" &&
        step.failures.length < 50 &&
        integrated.steps.some((other) =>
          other.commandId === step.commandId && other.status !== "ERROR" && other.failures.length < 50,
        ),
      )
      .map((step) => step.commandId),
  );
  return [
    ...after.map((failure): Regression => {
      const identity = key(failure);
      return {
        ...failure,
        classification: !identity || !comparableCommands.has(failure.commandId)
          ? "UNKNOWN"
          : beforeKeys.has(identity) ? "PRE_EXISTING" : "NEW_REGRESSION",
      };
    }),
    ...before
      .filter((failure) => {
        const identity = key(failure);
        return !identity || !comparableCommands.has(failure.commandId) || !afterKeys.has(identity);
      })
      .map((failure): Regression => ({
        ...failure,
        classification: key(failure) && comparableCommands.has(failure.commandId)
          ? "RESOLVED" : "UNKNOWN",
      })),
  ].slice(0, 500);
}

/** Only explicit generated-path metadata and recognizable source formats are checked. */
export function checkGeneratedContracts(
  changeMap: EngineeringChangeMapEntry[],
  bindings: Array<{ sourcePath: string; generatedPathPrefix: string }>,
) {
  return bindings.flatMap((binding) => {
    const source = changeMap.find((entry) => entry.path === binding.sourcePath);
    if (!source || changeMap.some((entry) =>
      entry.path === binding.generatedPathPrefix ||
      entry.path.startsWith(`${binding.generatedPathPrefix}/`),
    )) return [];
    return [{
      kind: "GENERATED_CLIENT_MISMATCH" as const,
      paths: [source.path],
      taskIds: source.taskIds,
      summary: "A registered schema source changed without its explicitly bound generated-client path changing.",
    }];
  }).slice(0, 100);
}
