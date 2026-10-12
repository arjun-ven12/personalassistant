import {
  EngineeringTransportRequestSchema,
  type ReadOnlyExecutionRequest,
} from "@alexa-control/shared";
import path from "node:path";
import { ReadOnlyExecutionClient } from "../../../mac-agent/electron/execution/execution-client.js";
import type { LocalDeviceIdentity } from "../../../mac-agent/electron/services.js";
import type { NativeEngineeringRuntime } from "../../../mac-agent/electron/engineering-runtime/runtime.js";

/**
 * Worker-side adapter for the existing signed execution lifecycle. The process
 * must run inside a separately provisioned company container. This guard is
 * applied after server-signature/replay verification and before claiming work.
 */
export class CloudEngineeringWorker {
  readonly client: ReadOnlyExecutionClient;
  constructor(input: {
    apiBaseUrl: string;
    deviceId: string;
    companyId: string;
    serverPublicKeyX: string;
    identity: LocalDeviceIdentity;
    repositoryRoot: string;
    workspaceLocatorId: string;
    repositoryId: string;
    runtime: NativeEngineeringRuntime;
    fetcher?: typeof fetch;
    onAuthorizedWork?: () => void;
  }) {
    const expectedRoot = path.resolve(input.repositoryRoot);
    if (
      !path.isAbsolute(input.repositoryRoot) ||
      expectedRoot === "/" ||
      !expectedRoot.startsWith("/workspace/")
    )
      throw new Error(
        "Cloud worker repository root must be a dedicated container workspace.",
      );
    const guard = (request: ReadOnlyExecutionRequest) => {
      if (request.toolName !== "engineering.repository_capability")
        throw Error("Cloud workers accept finite engineering capabilities only.");
      const operation = EngineeringTransportRequestSchema.parse(request.arguments);
      if (
        operation.companyId !== input.companyId ||
        operation.repositoryId !== input.repositoryId ||
        operation.workspaceLocatorId !== input.workspaceLocatorId ||
        request.workspaceId !== input.workspaceLocatorId ||
        path.resolve(request.workspaceRootPath) !== expectedRoot ||
        request.workspaceRootPath !== expectedRoot ||
        operation.operationId !== request.actionId
      )
        throw Error(
          "Signed cloud engineering scope does not match the provisioned worker.",
        );
      input.onAuthorizedWork?.();
    };
    this.client = new ReadOnlyExecutionClient(
      input.apiBaseUrl,
      input.deviceId,
      input.identity,
      input.serverPublicKeyX,
      2_000,
      { maxFileReadBytes: 131_072, maxGitOutputBytes: 1_048_576, maxGitEntries: 2_000 },
      undefined,
      input.fetcher,
      undefined,
      input.runtime,
      undefined,
      guard,
    );
  }
  start() {
    this.client.start();
  }
  stop() {
    this.client.stop();
  }
}
