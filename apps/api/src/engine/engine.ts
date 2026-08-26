import { getNode, isTriggerType } from "../nodes/registry";
import { EdgeDefinition, NodeDefinition, NodeExecutionContext, NodeFailure, WorkflowDefinition } from "../nodes/types";
import { buildContext, indexNodes, ExecutionContext } from "../utils/template";
import { EngineRepository, NodeState, NodeStateMap } from "./repository";
import { emitExecutionEvent } from "../sockets/events";
import { logger } from "../lib/logger";

export interface ContinuationJob {
  executionId: string;
  nodeId: string;
  kind: "retry" | "delay";
}

export interface EngineDefaults {
  maxRetries: number;
  retryDelayMs: number;
}

export interface EngineOptions {
  repository: EngineRepository;
  /** Schedules a delayed job that will resume the execution at the given node. */
  scheduleContinuation: (job: ContinuationJob, delayMs: number) => Promise<void>;
  defaults?: EngineDefaults;
}

interface RunNode {
  def: NodeDefinition;
  state?: NodeState;
}

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;

/** Nodes that route their outgoing edges based on their output (branch nodes). */
function isBranchNode(type: string): boolean {
  return type === "condition" || type === "switch";
}

/** The source handle a successful branch node should follow. */
function selectedBranch(type: string, output: unknown): string {
  if (type === "condition") {
    return (output as { result?: boolean } | undefined)?.result === true ? "true" : "false";
  }
  if (type === "switch") {
    return String((output as { matched?: unknown } | undefined)?.matched ?? "default");
  }
  return "default";
}

export class WorkflowEngine {
  private repo: EngineRepository;
  private scheduleContinuation: (job: ContinuationJob, delayMs: number) => Promise<void>;
  private defaults: EngineDefaults;

  constructor(options: EngineOptions) {
    this.repo = options.repository;
    this.scheduleContinuation = options.scheduleContinuation;
    this.defaults = options.defaults ?? { maxRetries: DEFAULT_MAX_RETRIES, retryDelayMs: DEFAULT_RETRY_DELAY_MS };
  }

  /**
   * Run (or resume) a workflow execution.
   * @param executionId public execution id
   * @param resumeNodeId when set, execution resumes at this node (retry or delay continuation)
   */
  async run(executionId: string, resumeNodeId?: string): Promise<void> {
    const execution = await this.repo.getExecution(executionId);
    if (!execution) {
      logger.error("engine: execution not found", { executionId });
      return;
    }
    if (execution.status === "cancelled" || execution.status === "completed" || execution.status === "failed") return;

    const definition = await this.repo.getDefinition(executionId);
    if (!definition || definition.nodes.length === 0) {
      await this.repo.addLog(executionId, {
        level: "error",
        message: "Workflow has no nodes — nothing to execute",
      });
      await this.repo.setExecutionStatus(executionId, "failed", {
        error: { code: "WORKFLOW_EMPTY", message: "Workflow has no nodes" },
        finishedAt: new Date(),
      });
      this.emitExecution(executionId, execution.userId, execution.workflowId, "execution", {
        status: "failed",
        error: { code: "WORKFLOW_EMPTY", message: "Workflow has no nodes" },
      });
      return;
    }

    // Validate every node type is registered before executing anything.
    for (const node of definition.nodes) {
      if (!getNode(node.type)) {
        await this.repo.addLog(executionId, {
          level: "error",
          message: `Unknown node type "${node.type}"`,
          nodeId: node.id,
          nodeType: node.type,
        });
        await this.repo.setExecutionStatus(executionId, "failed", {
          error: { code: "UNKNOWN_NODE_TYPE", message: `Unknown node type "${node.type}"` },
          finishedAt: new Date(),
        });
        this.emitExecution(executionId, execution.userId, execution.workflowId, "execution", {
          status: "failed",
          error: { code: "UNKNOWN_NODE_TYPE", message: `Unknown node type "${node.type}"` },
        });
        return;
      }
    }

    const context = this.restoreContext(execution.context, definition);
    const states = await this.repo.getNodeStates(executionId);

    const startTime = new Date();
    if (resumeNodeId) {
      await this.repo.setExecutionStatus(executionId, "running", { context: context as unknown as Record<string, unknown> });
      await this.log(execution, "info", "Execution resumed");
      this.emitExecution(executionId, execution.userId, execution.workflowId, "execution", { status: "running" });
    } else {
      await this.repo.setExecutionRunning(executionId, startTime);
      await this.log(execution, "info", "Workflow execution started", {
        triggerType: execution.triggerType,
      });
      this.emitExecution(executionId, execution.userId, execution.workflowId, "execution", { status: "running" });
    }

    try {
      await this.executeGraph(execution, definition, context, states, resumeNodeId);
    } catch (err) {
      logger.error("engine: unexpected failure", { executionId, message: err instanceof Error ? err.message : err });
      await this.repo.addLog(executionId, {
        level: "error",
        message: `Engine failure: ${err instanceof Error ? err.message : String(err)}`,
      });
      await this.repo.setExecutionStatus(executionId, "failed", {
        error: { code: "ENGINE_ERROR", message: err instanceof Error ? err.message : String(err) },
        context: context as unknown as Record<string, unknown>,
        finishedAt: new Date(),
      });
      this.emitExecution(executionId, execution.userId, execution.workflowId, "execution", {
        status: "failed",
        error: { code: "ENGINE_ERROR", message: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  // ------------------------------------------------------------------
  // Graph execution
  // ------------------------------------------------------------------

  private async executeGraph(
    execution: { executionId: string; userId: string; workflowId: string; triggerType: string },
    definition: WorkflowDefinition,
    context: ExecutionContext,
    states: NodeStateMap,
    resumeNodeId?: string
  ): Promise<void> {
    const nodeById = new Map<string, NodeDefinition>();
    for (const node of definition.nodes) nodeById.set(node.id, node);

    const incoming = new Map<string, EdgeDefinition[]>();
    const outgoing = new Map<string, EdgeDefinition[]>();
    for (const node of definition.nodes) {
      incoming.set(node.id, []);
      outgoing.set(node.id, []);
    }
    for (const edge of definition.edges) {
      if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
      incoming.get(edge.target)!.push(edge);
      outgoing.get(edge.source)!.push(edge);
    }

    // remaining[target] = incoming edges still unresolved
    const remaining = new Map<string, number>();
    const hasDead = new Set<string>();
    for (const node of definition.nodes) remaining.set(node.id, incoming.get(node.id)!.length);

    const worklist: string[] = [];
    const enqueued = new Set<string>();

    const enqueue = (nodeId: string): void => {
      if (enqueued.has(nodeId)) return;
      enqueued.add(nodeId);
      worklist.push(nodeId);
    };

    const resolveOutgoing = (node: RunNode): void => {
      for (const edge of outgoing.get(node.def.id) ?? []) {
        let active = false;
        if (node.state?.status === "success") {
          if (isBranchNode(node.def.type)) {
            active = edge.sourceHandle === selectedBranch(node.def.type, node.state.output);
          } else {
            active = true;
          }
        }
        const target = edge.target;
        remaining.set(target, (remaining.get(target) ?? 0) - 1);
        if (!active) hasDead.add(target);
        if ((remaining.get(target) ?? 0) <= 0) {
          if (hasDead.has(target)) {
            void this.skipNode(execution, nodeById.get(target)!, context);
            resolveOutgoing({ def: nodeById.get(target)!, state: { status: "skipped" } as NodeState });
          } else {
            enqueue(target);
          }
        }
      }
    };

    // Seed the worklist.
    if (resumeNodeId) {
      if (!nodeById.has(resumeNodeId)) {
        logger.warn("engine: resume node not found", { executionId: execution.executionId, resumeNodeId });
        return;
      }
      // When a parallel wave fails on several branches at once, multiple
      // continuation jobs end up in flight. Re-run every node that still has a
      // retry pending, so whichever continuation fires first resumes the whole
      // graph; later continuations become no-ops via the terminal-status guard
      // and the skip-completed guard in executeNode.
      const pendingRetries = new Set<string>();
      for (const node of definition.nodes) {
        const st = states.get(node.id);
        if (!st || st.status !== "failed") continue;
        const error = st.error as { retryable?: boolean } | undefined;
        if (error?.retryable === true && st.attempts <= this.retryLimit(node)) {
          pendingRetries.add(node.id);
        }
      }
      // Resolve edges of already-terminal nodes so joins after resume count
      // correctly — except nodes that are about to be retried.
      for (const node of definition.nodes) {
        if (pendingRetries.has(node.id)) continue;
        const state = states.get(node.id);
        if (state && ["success", "failed", "skipped"].includes(state.status)) {
          resolveOutgoing({ def: node, state });
        }
      }
      if (pendingRetries.size > 0) {
        for (const id of pendingRetries) enqueue(id);
      } else {
        enqueue(resumeNodeId);
      }
    } else {
      let roots = definition.nodes.filter((n) => (incoming.get(n.id)?.length ?? 0) === 0);
      if (roots.length === 0) {
        // Fall back to trigger nodes so a workflow always has an entry point.
        roots = definition.nodes.filter((n) => isTriggerType(n.type));
      }
      if (roots.length === 0) {
        await this.repo.setExecutionStatus(execution.executionId, "failed", {
          error: { code: "WORKFLOW_NO_ENTRY", message: "Workflow has no entry point (no trigger node and no unconnected nodes)" },
          context: context as unknown as Record<string, unknown>,
          finishedAt: new Date(),
        });
        await this.log(execution, "error", "Workflow has no entry point");
        this.emitExecution(execution.executionId, execution.userId, execution.workflowId, "execution", {
          status: "failed",
          error: { code: "WORKFLOW_NO_ENTRY", message: "Workflow has no entry point" },
        });
        return;
      }
      for (const root of roots) enqueue(root.id);
    }

    let failed = false;

    // Wave-based execution: every node currently runnable (all incoming edges
    // resolved) is executed concurrently, so independent branches run in
    // parallel. Joins still gate on every incoming edge, so shared downstream
    // nodes are never run twice.
    while (worklist.length > 0) {
      const wave = worklist.splice(0);

      // Honor cancellation between waves.
      const status = await this.repo.getExecutionStatus(execution.executionId);
      if (status === "cancelled") {
        await this.log(execution, "warn", "Execution cancelled");
        for (const node of definition.nodes) {
          const st = states.get(node.id);
          if (!st || ["idle", "queued", "running"].includes(st.status)) {
            await this.skipNode(execution, node, context);
          }
        }
        return;
      }

      const results = await Promise.all(
        wave.map(async (nodeId) => {
          const def = nodeById.get(nodeId)!;
          const outcome = await this.executeNode(execution, def, context, states.get(nodeId));
          states.set(nodeId, outcome.state);
          return { nodeId, outcome };
        })
      );

      // A retry/delay continuation pauses the whole run — the continuation
      // worker resumes it later. Persist the context first so outputs produced
      // by other nodes in this wave survive the pause.
      const retrying = results.find((r) => r.outcome.type === "retrying");
      if (retrying) {
        const currentStatus = await this.repo.getExecutionStatus(execution.executionId);
        await this.repo.setExecutionStatus(execution.executionId, currentStatus, {
          context: context as unknown as Record<string, unknown>,
        });
        return;
      }

      for (const { nodeId, outcome } of results) {
        if (outcome.state.status === "failed") failed = true;
        resolveOutgoing({ def: nodeById.get(nodeId)!, state: outcome.state });
      }
    }

    // Sweep: nodes never reached (e.g. disconnected components) are skipped.
    for (const node of definition.nodes) {
      const st = states.get(node.id);
      if (!st || st.status === "idle") {
        await this.skipNode(execution, node, context);
        resolveOutgoing({ def: node, state: { status: "skipped" } as NodeState });
      }
    }

    // Finalize.
    const finishedAt = new Date();
    await this.repo.setExecutionStatus(execution.executionId, failed ? "failed" : "completed", {
      context: context as unknown as Record<string, unknown>,
      finishedAt,
      ...(failed
        ? { error: await this.currentFailure(execution.executionId) }
        : {}),
    });
    if (failed) {
      await this.log(execution, "error", "Workflow execution failed");
      this.emitExecution(execution.executionId, execution.userId, execution.workflowId, "execution", {
        status: "failed",
      });
    } else {
      await this.log(execution, "info", "Workflow execution completed");
      this.emitExecution(execution.executionId, execution.userId, execution.workflowId, "execution", {
        status: "completed",
      });
    }
  }

  private async currentFailure(executionId: string): Promise<unknown> {
    // Report the first failed node state (by start time) as the execution error.
    const states = await this.repo.getNodeStates(executionId);
    const failedStates = [...states.values()]
      .filter((s) => s.status === "failed" && s.error)
      .sort((a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0));
    if (failedStates.length > 0) {
      const s = failedStates[0];
      return {
        message: (s.error as { message?: string }).message ?? "Node failed",
        nodeId: s.nodeId,
        nodeType: s.nodeType,
        attempts: s.attempts,
      };
    }
    return { message: "Execution failed" };
  }

  // ------------------------------------------------------------------
  // Node execution
  // ------------------------------------------------------------------

  private async executeNode(
    execution: { executionId: string; userId: string; workflowId: string },
    def: NodeDefinition,
    context: ExecutionContext,
    prev?: NodeState
  ): Promise<{ type: "ran" | "retrying"; state: NodeState }> {
    const registration = getNode(def.type)!;
    const attempts = prev && prev.status === "failed" ? prev.attempts : (prev?.attempts ?? 0);

    // A stale or concurrent continuation can re-enter an already-completed
    // node. Treat success as terminal: never execute a node twice.
    if (prev && prev.status === "success") {
      return { type: "ran", state: prev };
    }

    // Delay nodes pause via a delayed continuation job so workers never block.
    // The pause is only scheduled on the first encounter; when the continuation
    // resumes this node its state is already "queued", so we fall through and
    // let the handler complete it.
    if (def.type === "delay") {
      const durationMs = Math.max(0, Number(def.config.durationMs ?? 0));
      if (durationMs > 0 && (!prev || prev.status !== "queued")) {
        const state: NodeState = {
          nodeId: def.id,
          nodeType: def.type,
          label: def.label,
          status: "queued",
          attempts,
          input: { config: def.config },
          startedAt: prev?.startedAt ?? new Date(),
        };
        await this.repo.upsertNodeState(execution.executionId, def.id, state);
        await this.log(execution, "info", `Delaying ${durationMs}ms before "${def.label}"`);
        this.emitNode(execution, { nodeId: def.id, status: "queued" });
        await this.repo.setExecutionStatus(execution.executionId, "running", {
          context: context as unknown as Record<string, unknown>,
        });
        await this.scheduleContinuation({ executionId: execution.executionId, nodeId: def.id, kind: "delay" }, durationMs);
        return { type: "retrying", state };
      }
    }

    const startedAt = new Date();
    const runningState: NodeState = {
      nodeId: def.id,
      nodeType: def.type,
      label: def.label,
      status: "running",
      attempts,
      input: { config: def.config },
      startedAt,
    };
    await this.repo.upsertNodeState(execution.executionId, def.id, runningState);
    this.emitNode(execution, { nodeId: def.id, status: "running", label: def.label });

    const nodeCtx: NodeExecutionContext = {
      executionId: execution.executionId,
      workflowId: execution.workflowId,
      node: def,
      context,
      log: (level, message, meta) => this.log(execution, level, message, meta, def),
    };

    try {
      const output = await registration.handler(nodeCtx);
      const finishedAt = new Date();
      const duration = finishedAt.getTime() - startedAt.getTime();
      const state: NodeState = {
        nodeId: def.id,
        nodeType: def.type,
        label: def.label,
        status: "success",
        attempts,
        input: { config: def.config },
        output,
        startedAt,
        finishedAt,
      };
      await this.repo.upsertNodeState(execution.executionId, def.id, state);
      context.nodes[def.id] = output;
      await this.log(execution, "info", `"${def.label}" completed (${duration}ms)`, undefined, def);
      this.emitNode(execution, {
        nodeId: def.id,
        status: "success",
        output,
        duration,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
      });
      return { type: "ran", state };
    } catch (err) {
      const failure = err as NodeFailure;
      const newAttempts = attempts + 1;
      const retryable = failure.retryable === true;
      const maxRetries = this.retryLimit(def);
      const errorObj = {
        code: failure.code ?? "NODE_ERROR",
        message: failure.message ?? String(err),
        retryable,
        details: failure.details ?? undefined,
      };
      const finishedAt = new Date();
      const state: NodeState = {
        nodeId: def.id,
        nodeType: def.type,
        label: def.label,
        status: "failed",
        attempts: newAttempts,
        input: { config: def.config },
        error: errorObj,
        startedAt,
        finishedAt,
      };
      await this.repo.upsertNodeState(execution.executionId, def.id, state);
      await this.log(execution, "error", `"${def.label}" failed: ${errorObj.message}`, { attempts: newAttempts }, def);
      this.emitNode(execution, { nodeId: def.id, status: "failed", error: errorObj });

      if (retryable && newAttempts <= maxRetries) {
        const delayMs = this.retryDelay(def) * Math.pow(2, newAttempts - 1);
        await this.log(execution, "warn", `Retrying "${def.label}" in ${delayMs}ms (attempt ${newAttempts}/${maxRetries})`, undefined, def);
        await this.repo.setExecutionStatus(execution.executionId, "retrying", {
          context: context as unknown as Record<string, unknown>,
          error: { message: `Retrying "${def.label}": ${errorObj.message}`, attempts: newAttempts },
        });
        this.emitExecution(execution.executionId, execution.userId, execution.workflowId, "execution", {
          status: "retrying",
        });
        await this.scheduleContinuation({ executionId: execution.executionId, nodeId: def.id, kind: "retry" }, delayMs);
        return { type: "retrying", state };
      }

      // Give up on this node — downstream nodes become skipped.
      return { type: "ran", state };
    }
  }

  private retryLimit(def: NodeDefinition): number {
    const v = Number(def.config.retries);
    return Number.isFinite(v) && v >= 0 ? v : this.defaults.maxRetries;
  }

  private retryDelay(def: NodeDefinition): number {
    const v = Number(def.config.retryDelayMs);
    return Number.isFinite(v) && v > 0 ? v : this.defaults.retryDelayMs;
  }

  private async skipNode(
    execution: { executionId: string; userId: string; workflowId: string },
    def: NodeDefinition,
    context: ExecutionContext
  ): Promise<void> {
    const state: NodeState = {
      nodeId: def.id,
      nodeType: def.type,
      label: def.label,
      status: "skipped",
      attempts: 0,
      output: { reason: "Skipped: upstream node did not complete" },
    };
    await this.repo.upsertNodeState(execution.executionId, def.id, state);
    context.nodes[def.id] = { skipped: true };
    await this.log(execution, "debug", `"${def.label}" skipped`, undefined, def);
    this.emitNode(execution, { nodeId: def.id, status: "skipped" });
  }

  // ------------------------------------------------------------------
  // Context, logs, events
  // ------------------------------------------------------------------

  private restoreContext(stored: Record<string, unknown> | null, definition: WorkflowDefinition): ExecutionContext {
    const ctx = buildContext({
      inputs: (stored?.inputs as Record<string, unknown>) ?? {},
      variables: (stored?.variables as Record<string, unknown>) ?? {},
      nodes: (stored?.nodes as Record<string, unknown>) ?? {},
      metadata: (stored?.metadata as Record<string, unknown>) ?? {},
      nodeOrder: (stored?.nodeOrder as string[]) ?? [],
    });
    indexNodes(ctx, definition.nodes);
    return ctx;
  }

  private async log(
    execution: { executionId: string; userId: string; workflowId: string },
    level: "info" | "warn" | "error" | "debug",
    message: string,
    metadata?: Record<string, unknown>,
    node?: NodeDefinition
  ): Promise<void> {
    const entry = {
      level,
      message,
      nodeId: node?.id ?? null,
      nodeType: node?.type ?? null,
      metadata: metadata ?? undefined,
    };
    await this.repo.addLog(execution.executionId, entry);
    this.emitExecutionEvent(execution.executionId, execution.userId, execution.workflowId, "log", { log: { ...entry, createdAt: new Date().toISOString() } });
  }

  private emitExecution(
    executionId: string,
    userId: string,
    workflowId: string,
    event: "execution" | "node" | "log",
    data: Record<string, unknown>
  ): void {
    this.emitExecutionEvent(executionId, userId, workflowId, event, data);
  }

  private emitNode(
    execution: { executionId: string; userId: string; workflowId: string },
    data: Record<string, unknown>
  ): void {
    this.emitExecutionEvent(execution.executionId, execution.userId, execution.workflowId, "node", data);
  }

  private emitExecutionEvent(
    executionId: string,
    userId: string,
    workflowId: string,
    event: "execution" | "node" | "log",
    data: Record<string, unknown>
  ): void {
    emitExecutionEvent({ executionId, userId, workflowId, event, data });
  }
}
