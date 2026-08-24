export class ExecutionError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: { approvalRequestId?: string },
  ) {
    super(message);
    this.name = "ExecutionError";
  }
}
