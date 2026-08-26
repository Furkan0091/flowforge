import { useEffect, useState } from "react";
import { X, TerminalSquare, ListTree, RotateCcw, History } from "lucide-react";
import type { ExecutionDetail, ExecutionListItem } from "../../lib/types";
import { api } from "../../lib/api";
import { Badge } from "../ui/Badge";
import { formatDateTime, formatDuration, formatTime } from "../../lib/format";
import { NODE_STATUS_ICONS, NODE_STATUS_COLORS } from "../../lib/nodeIcons";
import { EmptyState } from "../ui/EmptyState";

type PanelView = "timeline" | "logs" | "history";

interface Props {
  execution: ExecutionDetail | null;
  onClose: () => void;
  onRerun: () => void;
  view: PanelView;
  setView: (v: PanelView) => void;
  workflowId?: string;
  onSelectExecution?: (id: string) => void;
}

const LOG_COLORS: Record<string, string> = {
  info: "text-zinc-400",
  warn: "text-amber-300",
  error: "text-red-300",
  debug: "text-zinc-600",
};

export function ExecutionPanel({ execution, onClose, onRerun, view, setView, workflowId, onSelectExecution }: Props) {
  const [history, setHistory] = useState<ExecutionListItem[] | null>(null);

  useEffect(() => {
    if (view !== "history" || !workflowId) return;
    let active = true;
    setHistory(null);
    api.executions
      .list({ workflowId, limit: 25 })
      .then((res) => {
        if (active) setHistory(res.executions);
      })
      .catch(() => {
        if (active) setHistory([]);
      });
    return () => {
      active = false;
    };
  }, [view, workflowId]);

  if (!execution) return null;

  return (
    <div className="flex h-64 shrink-0 flex-col border-t border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-zinc-200">Execution {execution.id}</span>
          <Badge value={execution.status} />
          {execution.status === "running" && (
            <span className="flex items-center gap-1.5 text-[11px] text-sky-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
              processing
            </span>
          )}
          <span className="text-[11px] text-zinc-600">{formatDuration(execution.durationMs)}</span>
          <span className="text-[11px] capitalize text-zinc-600">{execution.triggerType} trigger</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-zinc-800">
            <button
              onClick={() => setView("timeline")}
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] ${view === "timeline" ? "bg-zinc-800 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              <ListTree className="h-3 w-3" /> Timeline
            </button>
            <button
              onClick={() => setView("logs")}
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] ${view === "logs" ? "bg-zinc-800 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              <TerminalSquare className="h-3 w-3" /> Logs
            </button>
            <button
              onClick={() => setView("history")}
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] ${view === "history" ? "bg-zinc-800 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              <History className="h-3 w-3" /> History
            </button>
          </div>
          <button onClick={onRerun} className="btn-ghost p-1.5" title="Run again">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} className="btn-ghost p-1.5" title="Close panel">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {view === "timeline" ? (
        execution.nodes.length === 0 ? (
          <div className="flex-1 overflow-y-auto p-4">
            <EmptyState title="No node states yet" description="Run the workflow to see node-level execution." />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <ol className="relative space-y-1">
              {execution.nodes.map((n, i) => {
                const Icon = NODE_STATUS_ICONS[n.status];
                const color = NODE_STATUS_COLORS[n.status];
                return (
                  <li key={n.nodeId} className="relative flex items-center gap-3 pb-1">
                    {i < execution.nodes.length - 1 && (
                      <span className="absolute left-[7px] top-4 h-full w-px bg-zinc-800" />
                    )}
                    <Icon className={`relative z-10 h-3.5 w-3.5 shrink-0 ${color} ${n.status === "running" ? "animate-spin" : ""}`} />
                    <span className="flex-1 truncate text-xs text-zinc-300">{n.label}</span>
                    {n.attempts > 1 && <span className="text-[10px] text-amber-400">{n.attempts} attempts</span>}
                    <span className="text-[11px] tabular-nums text-zinc-600">{formatDuration(n.durationMs)}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        )
      ) : view === "history" ? (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {history === null ? (
            <p className="text-xs text-zinc-600">Loading history…</p>
          ) : history.length === 0 ? (
            <EmptyState title="No runs yet" description="Run this workflow to see its execution history." />
          ) : (
            <div className="space-y-0.5">
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => onSelectExecution?.(h.id)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-zinc-900"
                >
                  <Badge value={h.status} />
                  <span className="flex-1 truncate text-xs text-zinc-400">{h.id}</span>
                  <span className="text-[11px] capitalize text-zinc-600">{h.triggerType}</span>
                  <span className="w-16 text-right text-[11px] tabular-nums text-zinc-600">{formatDuration(h.durationMs)}</span>
                  <span className="w-24 text-right text-[11px] text-zinc-600">{formatDateTime(h.createdAt)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {execution.logs.length === 0 ? (
            <EmptyState title="No logs yet" />
          ) : (
            <div className="space-y-1">
              {execution.logs.map((l) => (
                <div key={l.id} className="flex items-start gap-3">
                  <span className="code shrink-0 text-[11px] text-zinc-700">{formatTime(l.createdAt)}</span>
                  <span className={`code text-xs ${LOG_COLORS[l.level]}`}>{l.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
