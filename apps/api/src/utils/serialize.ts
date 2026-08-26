import { User, Workflow, WorkflowExecution, ExecutionLog, ExecutionNode } from "@prisma/client";
import { ApiError } from "./ApiError";

export function serializeUser(user: Pick<User, "id" | "email" | "name" | "createdAt">) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}

export function durationMs(startedAt: Date | null, finishedAt: Date | null): number | null {
  if (!startedAt) return null;
  return (finishedAt ?? new Date()).getTime() - startedAt.getTime();
}

export function serializeExecutionNode(node: ExecutionNode) {
  return {
    nodeId: node.nodeId,
    nodeType: node.nodeType,
    label: node.label,
    status: node.status,
    attempts: node.attempts,
    input: node.input,
    output: node.output,
    error: node.error,
    startedAt: node.startedAt,
    finishedAt: node.finishedAt,
    durationMs: durationMs(node.startedAt, node.finishedAt),
  };
}

export function serializeExecutionLog(log: ExecutionLog) {
  return {
    id: log.id,
    level: log.level,
    message: log.message,
    nodeId: log.nodeId,
    nodeType: log.nodeType,
    metadata: log.metadata,
    createdAt: log.createdAt,
  };
}

export function serializeExecution(execution: WorkflowExecution) {
  return {
    id: execution.executionId,
    workflowId: execution.workflowId,
    versionId: execution.versionId,
    triggerType: execution.triggerType,
    status: execution.status,
    triggerData: execution.triggerData,
    error: execution.error,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    createdAt: execution.createdAt,
    durationMs: durationMs(execution.startedAt, execution.finishedAt),
  };
}

export function assertOwned<T extends { userId: string }>(resource: T | null, id: string, code: string): T {
  if (!resource || resource.userId !== id) {
    throw ApiError.notFound(code, "Resource not found");
  }
  return resource;
}
