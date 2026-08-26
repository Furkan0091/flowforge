import cronParser from "cron-parser";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { getExecutionQueue } from "../queues/execution.queue";
import { WorkflowDefinition } from "../nodes/types";
import { startExecution } from "./execution.service";

interface ScheduleConfig {
  pattern: string;
  tz: string;
}

/** Remember the exact repeat options we registered so we can remove them later. */
const repeatByWorkflow = new Map<string, ScheduleConfig>();

function scheduleConfigFor(def: WorkflowDefinition): ScheduleConfig | null {
  const node = (def.nodes ?? []).find((n) => n.type === "schedule");
  if (!node) return null;
  const cron = node.config.cron === "custom" ? node.config.cronCustom : node.config.cron;
  const tz = typeof node.config.timezone === "string" && node.config.timezone ? node.config.timezone : "UTC";
  const pattern = typeof cron === "string" && cron.trim() ? cron.trim() : "";
  if (!pattern) return null;
  try {
    cronParser.parseExpression(pattern, { tz });
  } catch {
    logger.warn("schedule: invalid cron expression ignored", { workflowId: "", pattern });
    return null;
  }
  return { pattern, tz };
}

/** Register (or refresh) the repeatable job for a workflow's schedule trigger. */
export async function syncWorkflowSchedule(workflowId: string, definition: WorkflowDefinition): Promise<void> {
  const queue = getExecutionQueue();
  await removeWorkflowSchedule(workflowId);

  const config = scheduleConfigFor(definition);
  if (!config) return;

  await queue.add(
    "schedule",
    { workflowId },
    {
      jobId: `schedule-${workflowId}`,
      repeat: { pattern: config.pattern, tz: config.tz },
      removeOnComplete: true,
      removeOnFail: true,
    }
  );
  repeatByWorkflow.set(workflowId, config);
  logger.info("schedule: registered", { workflowId, pattern: config.pattern, tz: config.tz });
}

/** Remove the repeatable job for a workflow (disable, delete, or schedule change). */
export async function removeWorkflowSchedule(workflowId: string): Promise<void> {
  const stored = repeatByWorkflow.get(workflowId);
  if (!stored) return;
  try {
    await getExecutionQueue().removeRepeatable("schedule", stored);
  } catch (err) {
    logger.warn("schedule: failed to remove repeatable job", { workflowId, message: err instanceof Error ? err.message : err });
  }
  repeatByWorkflow.delete(workflowId);
}

/**
 * On worker boot, clear all repeatable schedule jobs from the queue and
 * re-register them from the database, so restarts never lose or duplicate
 * schedules.
 */
export async function resyncAllSchedules(): Promise<void> {
  try {
    const queue = getExecutionQueue();
    const repeatables = await queue.getRepeatableJobs();
    for (const r of repeatables) {
      if (r.name === "schedule" && r.id?.startsWith("schedule-")) {
        await queue.removeRepeatableByKey(r.key).catch(() => undefined);
      }
    }
    const workflows = await prisma.workflow.findMany({
      where: { status: "enabled" },
      include: { versions: { where: { isActive: true }, take: 1 } },
    });
    for (const wf of workflows) {
      const active = wf.versions[0];
      if (!active) continue;
      await syncWorkflowSchedule(wf.id, active.definition as unknown as WorkflowDefinition);
    }
    logger.info(`schedule: resynced ${workflows.length} enabled workflows`);
  } catch (err) {
    logger.error("schedule: resync failed", { message: err instanceof Error ? err.message : err });
  }
}

/** Called by the execution worker when a repeatable schedule job fires. */
export async function triggerSchedule(workflowId: string): Promise<void> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: { versions: { where: { isActive: true }, take: 1 } },
  });
  if (!workflow || workflow.status !== "enabled") return;
  const version = workflow.versions[0];
  if (!version) return;

  const scheduleNode = ((version.definition as unknown as WorkflowDefinition).nodes ?? []).find((n) => n.type === "schedule");
  const pattern = scheduleNode?.config.cron === "custom" ? scheduleNode?.config.cronCustom : scheduleNode?.config.cron;

  await startExecution({
    workflowId: workflow.id,
    userId: workflow.userId,
    triggerType: "schedule",
    inputs: {
      schedule: {
        scheduledAt: new Date().toISOString(),
        cron: typeof pattern === "string" ? pattern : "",
        timezone: typeof scheduleNode?.config.timezone === "string" ? scheduleNode.config.timezone : "UTC",
      },
    },
  });
}
