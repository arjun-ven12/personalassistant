import { describe, expect, it } from "vitest";

import {
  isWorkflowTerminal,
  workflowProgress,
  workflowReadableLabel,
  workflowWorkspaceTabs,
} from "./workflowOperations.js";

describe("workflow operations view model", () => {
  it("keeps the user-facing workspace tabs focused on workflow operations", () => {
    expect(workflowWorkspaceTabs).toEqual(["overview", "active", "library", "builder", "history"]);
  });

  it("maps engine states into readable labels while preserving their meaning", () => {
    expect(workflowReadableLabel("WAITING_APPROVAL")).toBe("Waiting Approval");
    expect(workflowReadableLabel("in_progress")).toBe("In Progress");
  });

  it("separates terminal history from active work", () => {
    expect(isWorkflowTerminal("COMPLETED")).toBe(true);
    expect(isWorkflowTerminal("failed")).toBe(true);
    expect(isWorkflowTerminal("WAITING_APPROVAL")).toBe(false);
    expect(isWorkflowTerminal("running")).toBe(false);
  });

  it("reports live step progress without inventing a completion state", () => {
    expect(workflowProgress([{ status: "completed" }, { status: "running" }, { status: "pending" }])).toEqual({ completed: 1, total: 3 });
  });
});
