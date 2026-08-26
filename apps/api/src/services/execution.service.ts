import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";
import { generateExecutionId } from "../utils/ids";
import { enqueueExecution } from "../queues/execution.queue";
import { emitExecutionEvent } from "../sockets/events";
import { buildContext } from "../utils/template";
import { serializeExecution, serializeExecutionLog, serializeExecutionNode } from "../utils/serialize";
import { logger } from "../lib/logger";

export interface StartExecutionInput {
  workflowId: string;
  userId: string;
  triggerType: "manual" | "webhook" | "schedule";
  inputs: Record<string, unknown>;
  versionId?: string;
}

/**
 * Create an execution record and enqueue it for background processing.
 * Long-running work never happens inside the HTTP request.
 */
export async function startExecution(input: StartExecutionInput) {
  const workflow = await prisma.workflow.findFirst({
    where: { id: input.workflowId, userId: input.userId },
    include: { versions: { where: { isActive: true }, take: 1 } },
  });
  if (!workflow) throw ApiError.notFound("WORKFLOW_NOT_FOUND", "Workflow not found");

  const activeVersion = workflow.versions[0];
  let version: (typeof activeVersion) | undefined = activeVersion;
  if (input.versionId) {
    version =
      (await prisma.workflowVersion.findFirst({
        where: { id: input.versionId, workflowId: workflow.id },
      })) ?? undefined;
    if (!version) throw ApiError.notFound("VERSION_NOT_FOUND", "Workflow version not found");
  }
  if (!version) throw ApiError.badRequest("NO_VERSION", "Workflow has no saved version");

  const executionId = generateExecutionId();
  const metadata = {
    executionId,
    workflowId: workflow.id,
    triggerType: input.triggerType,
  };

  const execution = await prisma.workflowExecution.create({
    data: {
      executionId,
      workflowId: workflow.id,
      versionId: version.id,
      userId: workflow.userId,
      triggerType: input.triggerType,
      triggerData: input.inputs as unknown as Prisma.InputJsonValue,
      context: buildContext({
        inputs: input.inputs,
        metadata,
      }) as unknown as Prisma.InputJsonValue,
    },
  });

  emitExecutionEvent({
    executionId,
    userId: workflow.userId,
    workflowId: workflow.id,
    event: "execution",
    data: { ...serializeExecution(execution), status: "queued" },
  });

  try {
    await enqueueExecution(executionId);
  } catch (err) {
    logger.error("execution: failed to enqueue", { executionId, message: err instanceof Error ? err.message : err });
    await prisma.workflowExecution.update({
      where: { id: execution.id },
      data: { status: "failed", error: { code: "QUEUE_UNAVAILABLE", message: "Could not enqueue execution (is Redis running?)" } },
    });
    throw ApiError.badRequest("QUEUE_UNAVAILABLE", "Could not enqueue execution. Is Redis running?");
  }

  return prisma.workflowExecution.findUniqueOrThrow({ where: { id: execution.id } });
}

export async function listExecutions(input: {
  userId: string;
  workflowId?: string;
  status?: string;
  limit: number;
  offset: number;
}) {
  const where: Record<string, unknown> = { userId: input.userId };
  if (input.workflowId) where.workflowId = input.workflowId;
  if (input.status && input.status !== "all") where.status = input.status;

  const [rows, total] = await Promise.all([
    prisma.workflowExecution.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: input.limit,
      skip: input.offset,
      include: {
        workflow: { select: { id: true, name: true, status: true } },
        _count: { select: { nodes: true } },
      },
    }),
    prisma.workflowExecution.count({ where }),
  ]);

  return {
    total,
    executions: rows.map((r) => ({
      ...serializeExecution(r),
      workflow: r.workflow,
      nodeCount: r._count.nodes,
    })),
  };
}

export async function getExecution(userId: string, executionId: string) {
  const row = await prisma.workflowExecution.findUnique({
    where: { executionId },
    include: {
      workflow: { select: { id: true, name: true, status: true } },
      version: { select: { version: true, definition: true } },
      nodes: { orderBy: { createdAt: "asc" } },
      logs: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!row || row.userId !== userId) throw ApiError.notFound("EXECUTION_NOT_FOUND", "Execution not found");
  return {
    ...serializeExecution(row),
    workflow: row.workflow,
    version: row.version ? { version: row.version.version, definition: row.version.definition } : null,
    nodes: row.nodes.map(serializeExecutionNode),
    logs: row.logs.map(serializeExecutionLog),
  };
}

export async function getExecutionLogs(userId: string, executionId: string) {
  const row = await prisma.workflowExecution.findUnique({
    where: { executionId },
    select: { userId: true },
  });
  if (!row || row.userId !== userId) throw ApiError.notFound("EXECUTION_NOT_FOUND", "Execution not found");
  const logs = await prisma.executionLog.findMany({
    where: { executionId },
    orderBy: { createdAt: "asc" },
  });
  return logs.map(serializeExecutionLog);
}

export async function cancelExecution(userId: string, executionId: string) {
  const row = await prisma.workflowExecution.findUnique({ where: { executionId } });
  if (!row || row.userId !== userId) throw ApiError.notFound("EXECUTION_NOT_FOUND", "Execution not found");
  if (!["queued", "running", "retrying"].includes(row.status)) {
    throw ApiError.conflict("EXECUTION_NOT_CANCELLABLE", `Execution cannot be cancelled in status "${row.status}"`);
  }
  const updated = await prisma.workflowExecution.update({
    where: { id: row.id },
    data: { status: "cancelled" },
  });
  emitExecutionEvent({
    executionId,
    userId,
    workflowId: row.workflowId,
    event: "execution",
    data: { ...serializeExecution(updated), status: "cancelled" },
  });
  return serializeExecution(updated);
}

/** Re-run a previous execution: creates a brand new execution with the same trigger data. */
export async function rerunExecution(userId: string, executionId: string) {
  const row = await prisma.workflowExecution.findUnique({ where: { executionId } });
  if (!row || row.userId !== userId) throw ApiError.notFound("EXECUTION_NOT_FOUND", "Execution not found");
  return startExecution({
    workflowId: row.workflowId,
    userId,
    triggerType: row.triggerType as "manual" | "webhook" | "schedule",
    inputs: (row.triggerData as Record<string, unknown>) ?? {},
    versionId: row.versionId ?? undefined,
  });
}
