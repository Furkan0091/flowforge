import { env } from "./config/env";
import { logger } from "./lib/logger";
import { registerBuiltinNodes } from "./nodes/registry";
import { registerExecutionWorker } from "./workers/execution.worker";
import { registerContinuationWorker } from "./workers/continuation.worker";
import { resyncAllSchedules } from "./services/schedule.service";

registerBuiltinNodes();

registerExecutionWorker();
registerContinuationWorker();

resyncAllSchedules()
  .then(() => logger.info("worker: schedule resync complete"))
  .catch((err) => logger.error("worker: schedule resync failed", { message: err instanceof Error ? err.message : err }));

logger.info(`FlowForge worker running (env=${env.nodeEnv})`);
