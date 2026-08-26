import { WorkflowEngine } from "../../src/engine/engine";
import {
  EngineRepository,
  ExecutionRecord,
  NodeState,
} from "../../src/engine/repository";
import { WorkflowDefinition } from "../../src/nodes/types";

export class InMemoryRepository implements EngineRepository {
  execution: ExecutionRecord;
  definition: WorkflowDefinition;
  nodeStates = new Map<string, NodeState>();
  logs: { level: string; message: string; nodeId?: string | null; nodeType?: string | null; metadata?: unknown }[] = [];

  constructor(definition: WorkflowDefinition, inputs?: Record<string, unknown>, triggerType = "manual") {
    this.definition = definition;
    this.execution = {
      id: "rec_1",
      executionId: "exec_test1",
      workflowId: "wf_1",
      versionId: "v_1",
      userId: "u_1",
      triggerType,
      status: "queued",
      triggerData: inputs ?? null,
      context: { inputs: inputs ?? {}, variables: {}, nodes: {}, metadata: {} },
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date(),
    };
  }

  async getExecution(): Promise<ExecutionRecord> {
    return this.execution;
  }

  async getDefinition(): Promise<WorkflowDefinition> {
    return this.definition;
  }

  async getNodeStates(): Promise<Map<string, NodeState>> {
    return this.nodeStates;
  }

  async getExecutionStatus(): Promise<string> {
    return this.execution.status;
  }

  async setExecutionRunning(_executionId: string, startedAt: Date): Promise<void> {
    this.execution.status = "running";
    this.execution.startedAt = startedAt;
  }

  async setExecutionStatus(
    _executionId: string,
    status: string,
    extra?: { error?: unknown; context?: unknown; finishedAt?: Date }
  ): Promise<void> {
    this.execution.status = status;
    if (extra?.error !== undefined) this.execution.error = extra.error as Record<string, unknown>;
    if (extra?.context !== undefined) this.execution.context = extra.context as Record<string, unknown>;
    if (extra?.finishedAt) this.execution.finishedAt = extra.finishedAt;
  }

  async upsertNodeState(_executionId: string, nodeId: string, state: Omit<NodeState, "nodeId">): Promise<void> {
    this.nodeStates.set(nodeId, { nodeId, ...state });
  }

  async addLog(
    _executionId: string,
    entry: { level: string; message: string; nodeId?: string | null; nodeType?: string | null; metadata?: unknown }
  ): Promise<void> {
    this.logs.push(entry);
  }
}

export interface Harness {
  repo: InMemoryRepository;
  continuations: { kind: string; nodeId: string; delay: number }[];
  run: (resumeNodeId?: string) => Promise<void>;
  resumeAll: () => Promise<void>;
}

export function createHarness(definition: WorkflowDefinition, inputs?: Record<string, unknown>): Harness {
  const repo = new InMemoryRepository(definition, inputs);
  const continuations: { kind: string; nodeId: string; delay: number }[] = [];
  const engine = new WorkflowEngine({
    repository: repo,
    scheduleContinuation: async (job, delay) => {
      continuations.push({ kind: job.kind, nodeId: job.nodeId, delay });
    },
  });

  const run = async (resumeNodeId?: string) => {
    await engine.run("exec_test1", resumeNodeId);
  };

  const resumeAll = async () => {
    // Simulate the continuation worker: process queued continuations in order.
    while (continuations.length > 0) {
      const next = continuations.shift()!;
      await engine.run("exec_test1", next.nodeId);
    }
  };

  return { repo, continuations, run, resumeAll };
}

export function node(
  id: string,
  type: string,
  label: string,
  config: Record<string, unknown> = {}
): { id: string; type: string; label: string; config: Record<string, unknown> } {
  return { id, type, label, config };
}

export function edge(source: string, target: string, sourceHandle?: string): { id: string; source: string; target: string; sourceHandle?: string } {
  return { id: `${source}-${target}`, source, target, ...(sourceHandle ? { sourceHandle } : {}) };
}
