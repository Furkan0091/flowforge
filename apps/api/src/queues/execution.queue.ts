import { Queue } from "bullmq";
import { getRedisConnection } from "../lib/redis";

export const EXECUTION_QUEUE = "workflow-execution";

let queue: Queue | null = null;

export function getExecutionQueue(): Queue {
  if (!queue) {
    queue = new Queue(EXECUTION_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 2000,
      },
    });
  }
  return queue;
}

/** Enqueue a workflow execution for processing by the execution worker. */
export async function enqueueExecution(executionId: string): Promise<void> {
  await getExecutionQueue().add(
    "execute",
    { executionId },
    { jobId: `execute-${executionId}` }
  );
}
