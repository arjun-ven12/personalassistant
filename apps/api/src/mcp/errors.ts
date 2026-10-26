import { ExecutionError } from "../execution/errors.js";

export class McpLocalError extends ExecutionError {
  constructor(code: string, statusCode = 403) {
    super(
      statusCode,
      code,
      code === "MCP_PROTOCOL_REJECTED"
        ? "The local MCP exchange was rejected."
        : "The governed local MCP operation did not complete.",
    );
  }
}
