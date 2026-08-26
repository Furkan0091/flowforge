import { Worker } from "bullmq";
import { EXECUTION_QUEUE } from "../queues/execution.queue";
import { getRedisConnection } from "../lib/redis";
import { getEngine } from "../engine/instance";
import { triggerSchedule } from "../services/schedule.service";
import { logger } from "../lib/logger";

let worker: Worker | null = null;

/**
 * Consumes workflow-execution jobs. Multiple worker processes/instances can
 * run concurrently — each execution is processed independently.
 */
export function registerExecutionWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(
    EXECUTION_QUEUE,
    async (job) => {
      if (job.name === "schedule") {
        const workflowId = job.data.workflowId as string;
        await triggerSchedule(workflowId);
        return;
      }
      const executionId = job.data.executionId as string;
      logger.info("worker: processing execution", { executionId, jobId: job.id });
      await getEngine().run(executionId);
    },
    {
      connection: getRedisConnection(),
      concurrency: 5,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error("worker: job failed", { jobId: job?.id, name: job?.name, message: err.message });
  });
  worker.on("error", (err) => {
    logger.error("worker: error", { message: err.message });
  });

  return worker;
}
