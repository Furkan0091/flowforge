import { Worker } from "bullmq";
import { CONTINUATION_QUEUE } from "../queues/continuation.queue";
import { getRedisConnection } from "../lib/redis";
import { getEngine } from "../engine/instance";
import type { ContinuationJob } from "../engine/engine";
import { logger } from "../lib/logger";

let worker: Worker | null = null;

/**
 * Consumes retry and delay continuation jobs and resumes the referenced
 * execution at the referenced node.
 */
export function registerContinuationWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(
    CONTINUATION_QUEUE,
    async (job) => {
      const data = job.data as ContinuationJob;
      logger.info("worker: continuation", { executionId: data.executionId, nodeId: data.nodeId, kind: data.kind, jobId: job.id });
      await getEngine().run(data.executionId, data.nodeId);
    },
    {
      connection: getRedisConnection(),
      concurrency: 5,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error("worker: continuation failed", { jobId: job?.id, message: err.message });
  });
  worker.on("error", (err) => {
    logger.error("worker: error", { message: err.message });
  });

  return worker;
}
