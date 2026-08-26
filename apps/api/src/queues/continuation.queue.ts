import { Queue } from "bullmq";
import { getRedisConnection } from "../lib/redis";
import type { ContinuationJob } from "../engine/engine";

export const CONTINUATION_QUEUE = "node-continuation";

let queue: Queue | null = null;

export function getContinuationQueue(): Queue {
  if (!queue) {
    queue = new Queue(CONTINUATION_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 2000,
      },
    });
  }
  return queue;
}

/**
 * Schedule a delayed job that resumes an execution at a specific node.
 * Used for both retry (exponential backoff) and delay nodes.
 */
export async function enqueueContinuation(job: ContinuationJob, delayMs: number): Promise<void> {
  const jobId = `${job.kind}-${job.executionId}-${job.nodeId}-${Date.now()}`;
  await getContinuationQueue().add(job.kind, job, {
    jobId,
    delay: Math.max(0, delayMs),
  });
}
