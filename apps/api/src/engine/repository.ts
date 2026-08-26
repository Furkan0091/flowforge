import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { WorkflowDefinition, NodeDefinition, EdgeDefinition } from "../nodes/types";

export interface ExecutionRecord {
  id: string;
  executionId: string;
  workflowId: string;
  versionId: string | null;
  userId: string;
  triggerType: string;
  status: string;
  triggerData: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface NodeState {
  nodeId: string;
  nodeType: string;
  label: string;
  status: string;
  attempts: number;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

export type NodeStateMap = Map<string, NodeState>;

export interface EngineRepository {
  getExecution(executionId: string): Promise<ExecutionRecord | null>;
  getDefinition(executionId: string): Promise<WorkflowDefinition | null>;
  getNodeStates(executionId: string): Promise<NodeStateMap>;
  getExecutionStatus(executionId: string): Promise<string>;
  setExecutionRunning(executionId: string, startedAt: Date): Promise<void>;
  setExecutionStatus(
    executionId: string,
    status: string,
    extra?: { error?: unknown; context?: unknown; finishedAt?: Date }
  ): Promise<void>;
  upsertNodeState(executionId: string, nodeId: string, state: Omit<NodeState, "nodeId">): Promise<void>;
  addLog(
    executionId: string,
    entry: { level: string; message: string; nodeId?: string | null; nodeType?: string | null; metadata?: unknown }
  ): Promise<void>;
}

export class PrismaEngineRepository implements EngineRepository {
  async getExecution(executionId: string): Promise<ExecutionRecord | null> {
    const row = await prisma.workflowExecution.findUnique({ where: { executionId } });
    if (!row) return null;
    return {
      id: row.id,
      executionId: row.executionId,
      workflowId: row.workflowId,
      versionId: row.versionId,
      userId: row.userId,
      triggerType: row.triggerType,
      status: row.status,
      triggerData: (row.triggerData as Record<string, unknown> | null) ?? null,
      context: (row.context as Record<string, unknown> | null) ?? null,
      error: (row.error as Record<string, unknown> | null) ?? null,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      createdAt: row.createdAt,
    };
  }

  async getDefinition(executionId: string): Promise<WorkflowDefinition | null> {
    const row = await prisma.workflowExecution.findUnique({
      where: { executionId },
      select: {
        version: { select: { definition: true } },
      },
    });
    if (!row?.version) return null;
    const def = row.version.definition as unknown as WorkflowDefinition;
    return {
      nodes: (def?.nodes ?? []) as NodeDefinition[],
      edges: (def?.edges ?? []) as EdgeDefinition[],
    };
  }

  async getNodeStates(executionId: string): Promise<NodeStateMap> {
    const rows = await prisma.executionNode.findMany({ where: { executionId } });
    const map = new Map<string, NodeState>();
    for (const row of rows) {
      map.set(row.nodeId, {
        nodeId: row.nodeId,
        nodeType: row.nodeType,
        label: row.label,
        status: row.status,
        attempts: row.attempts,
        input: row.input ?? undefined,
        output: row.output ?? undefined,
        error: row.error ?? undefined,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
      });
    }
    return map;
  }

  async getExecutionStatus(executionId: string): Promise<string> {
    const row = await prisma.workflowExecution.findUnique({
      where: { executionId },
      select: { status: true },
    });
    return row?.status ?? "unknown";
  }

  async setExecutionRunning(executionId: string, startedAt: Date): Promise<void> {
    await prisma.workflowExecution.update({
      where: { executionId },
      data: { status: "running", startedAt },
    });
  }

  async setExecutionStatus(
    executionId: string,
    status: string,
    extra?: { error?: unknown; context?: unknown; finishedAt?: Date }
  ): Promise<void> {
    await prisma.workflowExecution.update({
      where: { executionId },
      data: {
        status,
        ...(extra?.error !== undefined ? { error: extra.error as Prisma.InputJsonValue } : {}),
        ...(extra?.context !== undefined ? { context: extra.context as Prisma.InputJsonValue } : {}),
        ...(extra?.finishedAt !== undefined ? { finishedAt: extra.finishedAt } : {}),
      },
    });
  }

  async upsertNodeState(executionId: string, nodeId: string, state: Omit<NodeState, "nodeId">): Promise<void> {
    await prisma.executionNode.upsert({
      where: { executionId_nodeId: { executionId, nodeId } },
      create: {
        executionId,
        nodeId,
        nodeType: state.nodeType,
        label: state.label,
        status: state.status,
        attempts: state.attempts,
        input: state.input as Prisma.InputJsonValue | undefined,
        output: state.output as Prisma.InputJsonValue | undefined,
        error: state.error as Prisma.InputJsonValue | undefined,
        startedAt: state.startedAt,
        finishedAt: state.finishedAt,
      },
      update: {
        nodeType: state.nodeType,
        label: state.label,
        status: state.status,
        attempts: state.attempts,
        ...(state.input !== undefined ? { input: state.input as Prisma.InputJsonValue } : {}),
        ...(state.output !== undefined ? { output: state.output as Prisma.InputJsonValue } : {}),
        ...(state.error !== undefined ? { error: state.error as Prisma.InputJsonValue } : {}),
        ...(state.startedAt !== undefined ? { startedAt: state.startedAt } : {}),
        ...(state.finishedAt !== undefined ? { finishedAt: state.finishedAt } : {}),
      },
    });
  }

  async addLog(
    executionId: string,
    entry: { level: string; message: string; nodeId?: string | null; nodeType?: string | null; metadata?: unknown }
  ): Promise<void> {
    await prisma.executionLog.create({
      data: {
        executionId,
        level: entry.level,
        message: entry.message,
        nodeId: entry.nodeId ?? null,
        nodeType: entry.nodeType ?? null,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
