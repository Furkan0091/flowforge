import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PlaySquare, Filter } from "lucide-react";
import { api } from "../lib/api";
import type { ExecutionListItem } from "../lib/types";
import { Spinner } from "../components/ui/Spinner";
import { EmptyState, ErrorState } from "../components/ui/EmptyState";
import { Badge } from "../components/ui/Badge";
import { formatDuration, timeAgo } from "../lib/format";
import { onEvent } from "../lib/socket";
import { useAuth } from "../store/auth";

const STATUSES = ["all", "queued", "running", "retrying", "completed", "failed", "cancelled"];

export default function ExecutionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") ?? "all";
  const [data, setData] = useState<{ total: number; executions: ExecutionListItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const userId = useAuth((s) => s.user?.id);

  const load = useCallback(async () => {
    try {
      setError(null);
      const d = await api.executions.list({ status, limit: 50 });
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load executions");
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load, reload]);

  useEffect(() => {
    if (!userId) return;
    const off = onEvent("execution", () => setReload((r) => r + 1));
    return off;
  }, [userId]);

  if (error) return <div className="p-8"><ErrorState message={error} onRetry={() => setReload((r) => r + 1)} /></div>;
  if (!data) return <div className="p-8"><Spinner label="Loading executions…" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Executions</h1>
          <p className="text-xs text-zinc-500">{data.total} total</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-zinc-600" />
          <select
            className="input w-40"
            value={status}
            onChange={(e) => setSearchParams(e.target.value === "all" ? {} : { status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {data.executions.length === 0 ? (
        <EmptyState
          icon={<PlaySquare className="h-8 w-8" />}
          title={status === "all" ? "No executions yet" : `No ${status} executions`}
          description="Executions are created when workflows run — manually, via webhooks, or on a schedule."
          action={<Link to="/workflows" className="btn-secondary text-xs">Open workflows</Link>}
        />
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2.5 font-medium">Workflow</th>
                <th className="px-4 py-2.5 font-medium">Execution</th>
                <th className="px-4 py-2.5 font-medium">Trigger</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Duration</th>
                <th className="px-4 py-2.5 text-right font-medium">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {data.executions.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-zinc-900/60">
                  <td className="px-4 py-2.5">
                    <Link to={`/workflows/${e.workflowId}`} className="font-medium text-zinc-200 hover:text-accent">
                      {e.workflow.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link to={`/executions/${e.id}`} className="code text-xs text-zinc-400 hover:text-accent">
                      {e.id}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 capitalize text-zinc-500">{e.triggerType}</td>
                  <td className="px-4 py-2.5"><Badge value={e.status} /></td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-400">{formatDuration(e.durationMs)}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-500">{timeAgo(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
