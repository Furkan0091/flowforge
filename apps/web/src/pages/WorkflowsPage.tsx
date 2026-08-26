import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Copy,
  Power,
  Trash2,
  Play,
  Workflow,
  ExternalLink,
  MoreHorizontal,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { WorkflowListItem } from "../lib/types";
import { Spinner } from "../components/ui/Spinner";
import { EmptyState, ErrorState } from "../components/ui/EmptyState";
import { Badge } from "../components/ui/Badge";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/Toaster";
import { nodeIcon } from "../lib/nodeIcons";
import { timeAgo } from "../lib/format";
import { onEvent } from "../lib/socket";
import { useAuth } from "../store/auth";

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkflowListItem | null>(null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const userId = useAuth((s) => s.user?.id);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { workflows } = await api.workflows.list();
      setWorkflows(workflows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workflows");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reload]);

  useEffect(() => {
    if (!userId) return;
    const off = onEvent("execution", () => setReload((r) => r + 1));
    return off;
  }, [userId]);

  const create = async () => {
    setCreating(true);
    try {
      const { workflow } = await api.workflows.create({ name: "Untitled workflow" });
      toast.success("Workflow created");
      navigate(`/workflows/${workflow.id}`);
    } catch (err) {
      toast.error("Failed to create workflow", err instanceof Error ? err.message : undefined);
    } finally {
      setCreating(false);
    }
  };

  const run = async (w: WorkflowListItem) => {
    setBusyId(w.id);
    try {
      const res = await api.workflows.execute(w.id, {});
      toast.info("Execution queued", `${res.executionId} added to the queue`);
      setReload((r) => r + 1);
    } catch (err) {
      toast.error("Failed to start execution", err instanceof Error ? err.message : undefined);
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (w: WorkflowListItem) => {
    setBusyId(w.id);
    try {
      if (w.status === "enabled") {
        await api.workflows.disable(w.id);
        toast.info("Workflow disabled");
      } else {
        await api.workflows.enable(w.id);
        toast.success("Workflow enabled");
      }
      setReload((r) => r + 1);
    } catch (err) {
      toast.error("Failed to change status", err instanceof Error ? err.message : undefined);
    } finally {
      setBusyId(null);
    }
  };

  const duplicate = async (w: WorkflowListItem) => {
    setBusyId(w.id);
    try {
      await api.workflows.duplicate(w.id);
      toast.success("Workflow duplicated");
      setReload((r) => r + 1);
    } catch (err) {
      toast.error("Failed to duplicate", err instanceof Error ? err.message : undefined);
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.workflows.remove(deleteTarget.id);
      toast.success("Workflow deleted");
      setDeleteTarget(null);
      setReload((r) => r + 1);
    } catch (err) {
      toast.error("Failed to delete", err instanceof Error ? err.message : undefined);
    }
  };

  if (error) return <div className="p-8"><ErrorState message={error} onRetry={() => setReload((r) => r + 1)} /></div>;
  if (!workflows) return <div className="p-8"><Spinner label="Loading workflows…" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Workflows</h1>
          <p className="text-xs text-zinc-500">{workflows.length} automation(s)</p>
        </div>
        <button onClick={create} disabled={creating} className="btn-primary">
          <Plus className="h-4 w-4" />
          New workflow
        </button>
      </div>

      {workflows.length === 0 ? (
        <EmptyState
          icon={<Workflow className="h-8 w-8" />}
          title="No workflows yet"
          description="Create a workflow or start from a template to build your first automation."
          action={
            <div className="flex gap-2">
              <button onClick={create} className="btn-primary text-xs">
                Create workflow
              </button>
              <Link to="/templates" className="btn-secondary text-xs">
                Browse templates
              </Link>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {workflows.map((w) => (
            <div key={w.id} className="panel group p-4 transition-colors hover:border-zinc-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-zinc-100">{w.name}</h3>
                    <Badge value={w.status} />
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{w.description || "No description"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button className="btn-ghost p-1.5" title="Run now" onClick={() => run(w)} disabled={busyId === w.id}>
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <button className="btn-ghost p-1.5" title="Duplicate" onClick={() => duplicate(w)} disabled={busyId === w.id}>
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button className="btn-ghost p-1.5" title={w.status === "enabled" ? "Disable" : "Enable"} onClick={() => toggleStatus(w)} disabled={busyId === w.id}>
                    <Power className={`h-3.5 w-3.5 ${w.status === "enabled" ? "text-emerald-400" : ""}`} />
                  </button>
                  <button className="btn-ghost p-1.5 text-red-400/80 hover:text-red-300" title="Delete" onClick={() => setDeleteTarget(w)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <Link to={`/workflows/${w.id}`} className="btn-ghost p-1.5" title="Open builder">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {w.nodeChain.slice(0, 6).map((type, i) => {
                  const Icon = nodeIcon(type);
                  return (
                    <span key={`${w.id}-${i}`} className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900/80 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      <Icon className="h-3 w-3" />
                      {type.replace("_", " ")}
                    </span>
                  );
                })}
                {w.nodeChain.length > 6 && <span className="text-[10px] text-zinc-600">+{w.nodeChain.length - 6} more</span>}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-zinc-800/70 pt-2.5 text-[11px] text-zinc-600">
                <span>
                  v{w.version ?? "—"} · {w.nodeCount} nodes · {w.executionCount} runs
                </span>
                <span>
                  {w.lastExecution ? (
                    <span className="flex items-center gap-1.5">
                      Last run {timeAgo(w.lastExecution.createdAt)}
                      <Badge value={w.lastExecution.status} className="scale-90" />
                    </span>
                  ) : (
                    "Never run"
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete workflow?"
        description={`"${deleteTarget?.name}" and all of its versions and execution history will be permanently deleted.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
