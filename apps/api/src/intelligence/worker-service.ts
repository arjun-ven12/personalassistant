import { WorkerQueueStatusSchema, type WorkerQueueStatus } from "@alexa-control/shared";

export interface WorkerServiceOptions {
  enabled: boolean;
  workerCount: number;
  concurrency: number;
}

export class WorkerService {
  #queued = 0;
  #running = 0;
  #failed = 0;
  #succeeded = 0;

  constructor(readonly options: WorkerServiceOptions) {}

  enqueue() {
    if (!this.options.enabled) return;
    this.#queued += 1;
  }

  start() {
    if (this.#queued > 0) this.#queued -= 1;
    this.#running += 1;
  }

  succeed() {
    if (this.#running > 0) this.#running -= 1;
    this.#succeeded += 1;
  }

  fail() {
    if (this.#running > 0) this.#running -= 1;
    this.#failed += 1;
  }

  status(): WorkerQueueStatus {
    return WorkerQueueStatusSchema.parse({
      enabled: this.options.enabled,
      workerCount: this.options.workerCount,
      concurrency: this.options.concurrency,
      queued: this.#queued,
      running: this.#running,
      failed: this.#failed,
      succeeded: this.#succeeded,
    });
  }
}
