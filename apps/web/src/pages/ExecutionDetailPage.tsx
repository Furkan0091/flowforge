import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, RotateCcw, Ban, TerminalSquare, ListTree } from "lucide-react";
import { api } from "../lib/api";
import type { ExecutionDetail, NodeRunStatus } from "../lib/types";
import { Spinner } from "../components/ui/Spinner";
import { EmptyState, ErrorState } from "../components/ui/EmptyState";
import { Badge } from "../components/ui/Badge";
import { useToast } from "../components/ui/Toaster";
import { FlowNode } from "../components/builder/FlowNode";
import { formatDuration, formatDateTime } from "../lib/format";
import { onEvent, joinExecutionRoom, leaveExecutionRoom } from "../lib/socket";
import { useAuth } from "../store/auth";

const nodeTypes = { workflowNode: FlowNode };

function toGraphNodes(execution: ExecutionDetail): Node[] {
  const def = execution.version?.definition;
  if (!def) return [];
  return def.nodes.map((n) => {
    const state = execution.nodes.find((s) => s.nodeId === n.id);
    return {
      id: n.id,
      type: "workflowNode",
      position: n.position ?? { x: 0, y: 0 },
      data: {
        label: n.label,
        type: n.type,
        category: "action",
        color: "#6366f1",
        icon: "circle",
        config: n.config,
        status: (state?.status ?? "idle") as NodeRunStatus,
        durationMs: state?.durationMs ?? undefined,
        error: state?.error ?? undefined,
      },
    };
  });
}

function toGraphEdges(execution: ExecutionDetail): Edge[] {
  const def = execution.version?.definition;
  if (!def) return [];
  return def.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
    animated: execution.status === "running",
  }));
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[11px] uppercase tracking-wide text-zinc-600">{label}</span>
      <span className="text-xs text-zinc-200">{value}</span>
    </div>
  );
}

function DetailInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const userId = useAuth((s) => s.user?.id);

  const [execution, setExecution] = useState<ExecutionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspected, setInspected] = useState<string | null>(null);
  const [view, setView] = useState<"graph" | "logs">("graph");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.executions.get(id!);
      setExecution(res.execution);
      const firstFailed = res.execution.nodes.find((n) => n.status === "failed");
      setInspected(firstFailed?.nodeId ?? res.execution.nodes[0]?.nodeId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load execution");
    }
  }, [id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  useEffect(() => {
    if (!id || !userId) return;
    joinExecutionRoom(id);
    const offExec = onEvent<{ executionId: string; data: Record<string, unknown> }>("execution", (p) => {
      if (p.executionId !== id) return;
      setExecution((prev) =>
        prev
          ? {
              ...prev,
              status: (p.data.status as ExecutionDetail["status"]) ?? prev.status,
              startedAt: (p.data.startedAt as string) ?? prev.startedAt,
              finishedAt: (p.data.finishedAt as string) ?? prev.finishedAt,
              durationMs: (p.data.durationMs as number) ?? prev.durationMs,
            }
          : prev
      );
    });
    const offNode = onEvent<{ executionId: string; data: { nodeId: string; status: string; duration?: number } }>(
      "node",
      (p) => {
        if (p.executionId !== id) return;
        const { nodeId, status, duration } = p.data;
        setExecution((prev) =>
          prev
            ? {
                ...prev,
                nodes: prev.nodes.map((n) =>
                  n.nodeId === nodeId
                    ? { ...n, status: (status as NodeRunStatus) ?? n.status, durationMs: duration ?? n.durationMs }
                    : n
                ),
              }
            : prev
        );
      }
    );
    const offLog = onEvent<{ executionId: string; data: { log: ExecutionDetail["logs"][number] } }>("log", (p) => {
      if (p.executionId !== id) return;
      setExecution((prev) => (prev ? { ...prev, logs: [...prev.logs, p.data.log] } : prev));
    });
    return () => {
      offExec();
      offNode();
      offLog();
      leaveExecutionRoom(id);
    };
  }, [id, userId]);

  const rerun = async () => {
    if (!execution || busy) return;
    setBusy(true);
    try {
      const res = await api.executions.rerun(execution.id);
      toast.info("Execution queued", res.executionId);
      navigate(`/executions/${res.executionId}`);
    } catch (err) {
      toast.error("Failed to rerun", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!execution || busy) return;
    setBusy(true);
    try {
      await api.executions.cancel(execution.id);
      toast.info("Cancellation requested");
    } catch (err) {
      toast.error("Failed to cancel", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const graphNodes = useMemo(() => (execution ? toGraphNodes(execution) : []), [execution]);
  const graphEdges = useMemo(() => (execution ? toGraphEdges(execution) : []), [execution]);

  if (error) return <div className="p-8"><ErrorState message={error} onRetry={load} /></div>;
  if (!execution) return <div className="p-8"><Spinner label="Loading execution…" /></div>;

  const retries = execution.nodes.reduce((acc, n) => acc + Math.max(0, n.attempts - 1), 0);
  const inspectedNode = execution.nodes.find((n) => n.nodeId === inspected);

  const LOG_COLORS: Record<string, string> = {
    info: "text-zinc-400",
    warn: "text-amber-300",
    error: "text-red-300",
    debug: "text-zinc-600",
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/executions" className="btn-ghost p-1.5" title="Back to executions">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-zinc-100">{execution.workflow.name}</h1>
              <Badge value={execution.status} />
            </div>
            <p className="code text-[11px] text-zinc-600">{execution.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {["queued", "running", "retrying"].includes(execution.status) && (
            <button onClick={cancel} disabled={busy} className="btn-secondary text-xs">
              <Ban className="h-3.5 w-3.5" />
              Cancel
            </button>
          )}
          <button onClick={rerun} disabled={busy} className="btn-primary text-xs">
            <RotateCcw className="h-3.5 w-3.5" />
            Run again
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="panel p-4 lg:col-span-1">
          <h2 className="mb-2 text-sm font-semibold text-zinc-200">Summary</h2>
          <SummaryRow label="Status" value={<Badge value={execution.status} />} />
          <SummaryRow label="Duration" value={formatDuration(execution.durationMs)} />
          <SummaryRow label="Nodes" value={execution.nodes.length || "—"} />
          <SummaryRow label="Retries" value={retries} />
          <SummaryRow label="Trigger" value={<span className="capitalize">{execution.triggerType}</span>} />
          <SummaryRow label="Version" value={`v${execution.version?.version ?? "—"}`} />
          <SummaryRow label="Started" value={formatDateTime(execution.startedAt)} />
          <SummaryRow label="Finished" value={formatDateTime(execution.finishedAt)} />
          {Boolean(execution.error) && (
            <div className="mt-3 rounded-md border border-red-900/50 bg-red-950/20 p-2.5">
              <p className="text-[11px] font-medium text-red-300">Error</p>
              <p className="code mt-1 text-[11px] break-words text-red-300/90">
                {(execution.error as { message?: string }).message ?? JSON.stringify(execution.error)}
              </p>
            </div>
          )}
        </div>

        <div className="panel overflow-hidden lg:col-span-3">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
            <div className="flex overflow-hidden rounded-md border border-zinc-800">
              <button
                onClick={() => setView("graph")}
                className={`flex items-center gap-1 px-3 py-1 text-xs ${view === "graph" ? "bg-zinc-800 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                <ListTree className="h-3.5 w-3.5" /> Execution graph
              </button>
              <button
                onClick={() => setView("logs")}
                className={`flex items-center gap-1 px-3 py-1 text-xs ${view === "logs" ? "bg-zinc-800 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                <TerminalSquare className="h-3.5 w-3.5" /> Logs ({execution.logs.length})
              </button>
            </div>
            {execution.status === "running" && (
              <span className="flex items-center gap-1.5 text-[11px] text-sky-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" /> live
              </span>
            )}
          </div>

          {view === "graph" ? (
            execution.version?.definition?.nodes.length ? (
              <div className="relative h-[420px]">
                <ReactFlow
                  nodes={graphNodes}
                  edges={graphEdges}
                  nodeTypes={nodeTypes}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable
                  fitView
                  fitViewOptions={{ padding: 0.25 }}
                  minZoom={0.2}
                  proOptions={{ hideAttribution: true }}
                  onNodeClick={(_, node) => setInspected(node.id)}
                >
                  <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1c1f26" />
                </ReactFlow>
                <p className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-zinc-600">
                  Click a node to inspect its input, output and error
                </p>
              </div>
            ) : (
              <div className="p-6">
                <EmptyState title="No workflow definition for this execution" />
              </div>
            )
          ) : (
            <div className="max-h-[420px] overflow-y-auto p-4">
              {execution.logs.length === 0 ? (
                <EmptyState title="No logs for this execution" />
              ) : (
                <div className="space-y-1.5">
                  {execution.logs.map((l) => (
                    <div key={l.id} className="flex items-start gap-3">
                      <span className="code shrink-0 text-[11px] text-zinc-700">
                        {new Date(l.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <span className={`code text-xs ${LOG_COLORS[l.level]}`}>{l.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {inspectedNode && (
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">
              {inspectedNode.label} <span className="ml-1 text-xs font-normal text-zinc-600">{inspectedNode.nodeType}</span>
            </h2>
            <div className="flex items-center gap-3">
              <Badge value={inspectedNode.status} />
              <span className="text-[11px] tabular-nums text-zinc-600">{formatDuration(inspectedNode.durationMs)}</span>
              {inspectedNode.attempts > 1 && (
                <span className="text-[11px] text-amber-400">{inspectedNode.attempts} attempts</span>
              )}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="label">Input</p>
              <pre className="code max-h-56 overflow-auto rounded-md border border-zinc-800 bg-zinc-900 p-3 text-[11px] text-zinc-400">
                {JSON.stringify(inspectedNode.input ?? {}, null, 2)}
              </pre>
            </div>
            <div>
              <p className="label">Output</p>
              <pre className="code max-h-56 overflow-auto rounded-md border border-zinc-800 bg-zinc-900 p-3 text-[11px] text-emerald-300/80">
                {JSON.stringify(inspectedNode.output ?? {}, null, 2)}
              </pre>
            </div>
            {Boolean(inspectedNode.error) && (
              <div className="md:col-span-2">
                <p className="label">Error</p>
                <pre className="code max-h-40 overflow-auto rounded-md border border-red-900/50 bg-red-950/20 p-3 text-[11px] text-red-300">
                  {JSON.stringify(inspectedNode.error, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExecutionDetailPage() {
  return (
    <ReactFlowProvider>
      <DetailInner />
    </ReactFlowProvider>
  );
}
