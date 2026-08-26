import { WorkflowEngine } from "./engine";
import { PrismaEngineRepository } from "./repository";
import { enqueueContinuation } from "../queues/continuation.queue";

let engine: WorkflowEngine | null = null;

export function getEngine(): WorkflowEngine {
  if (!engine) {
    engine = new WorkflowEngine({
      repository: new PrismaEngineRepository(),
      scheduleContinuation: (job, delayMs) => enqueueContinuation(job, delayMs),
    });
  }
  return engine;
}
