export const workflowWorkspaceTabs = ["overview", "active", "library", "builder", "history"] as const;

export type WorkflowWorkspaceTab = (typeof workflowWorkspaceTabs)[number];

const terminalStates = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "ROLLED_BACK",
  "completed",
  "failed",
  "cancelled",
]);

export const isWorkflowTerminal = (status: string) => terminalStates.has(status);

export const workflowReadableLabel = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const workflowProgress = (steps: readonly { status: string }[]) => ({
  completed: steps.filter((step) => step.status === "completed" || step.status === "COMPLETED").length,
  total: steps.length,
});
