import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, CheckCircle2, PlaySquare, Power, XCircle, TrendingUp, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import type { DashboardData } from "../lib/types";
import { Spinner } from "../components/ui/Spinner";
import { EmptyState, ErrorState } from "../components/ui/EmptyState";
import { Badge } from "../components/ui/Badge";
import { formatDuration, timeAgo } from "../lib/format";
import { onEvent } from "../lib/socket";
import { useAuth } from "../store/auth";

function MetricCard({
  label,
  value,
  icon,
  tone = "default",
  sub,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone?: "default" | "green" | "red" | "blue";
  sub?: string;
}) {
  const tones = {
    default: "text-zinc-100",
    green: "text-emerald-400",
    red: "text-red-400",
    blue: "text-sky-400",
  };
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
        <span className="text-zinc-600">{icon}</span>
      </div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const userId = useAuth((s) => s.user?.id);

  const load = useCallback(async () => {
    try {
      setError(null);
      const d = await api.dashboard.get();
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reload]);

  // Refresh live when executions change.
  useEffect(() => {
    if (!userId) return;
    const off = onEvent<{ executionId: string }>("execution", () => setReload((r) => r + 1));
    return off;
  }, [userId]);

  if (error) return <div className="p-8"><ErrorState message={error} onRetry={() => setReload((r) => r + 1)} /></div>;
  if (!data) return <div className="p-8"><Spinner label="Loading dashboard…" /></div>;

  const maxActivity = Math.max(1, ...data.activity.map((a) => a.total));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Automation Overview</h1>
          <p className="text-xs text-zinc-500">Execution activity across your workflows</p>
        </div>
        <Link to="/workflows" className="btn-primary">
          <PlaySquare className="h-4 w-4" />
          New workflow
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Active Workflows" value={data.metrics.activeWorkflows} icon={<Power className="h-4 w-4" />} sub={`${data.metrics.totalWorkflows} total`} />
        <MetricCard label="Executions Today" value={data.metrics.executionsToday} icon={<Activity className="h-4 w-4" />} tone="blue" />
        <MetricCard label="Successful" value={data.metrics.successfulToday} icon={<CheckCircle2 className="h-4 w-4" />} tone="green" sub={`${data.metrics.successRateToday}% success rate`} />
        <MetricCard label="Failed" value={data.metrics.failedToday} icon={<XCircle className="h-4 w-4" />} tone="red" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="panel p-4 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">Execution activity — last 24h</h2>
            <TrendingUp className="h-4 w-4 text-zinc-600" />
          </div>
          {data.activity.every((a) => a.total === 0) ? (
            <EmptyState
              icon={<Activity className="h-7 w-7" />}
              title="No executions in the last 24 hours"
              description="Run a workflow manually or trigger a webhook to see activity here."
              action={<Link to="/workflows" className="btn-secondary text-xs">Open workflows</Link>}
            />
          ) : (
            <div className="flex h-36 items-end gap-1">
              {data.activity.map((a) => (
                <div key={a.hour} className="group relative flex-1" title={`${a.label}: ${a.total} executions`}>
                  <div className="flex h-32 w-full items-end gap-0.5">
                    <div
                      className="w-1/2 rounded-t-sm bg-emerald-600/70"
                      style={{ height: `${(a.completed / maxActivity) * 100}%` }}
                    />
                    <div className="w-1/2 rounded-t-sm bg-red-600/70" style={{ height: `${(a.failed / maxActivity) * 100}%` }} />
                  </div>
                  <div className="mt-1 hidden text-center text-[9px] text-zinc-600 group-hover:block">{a.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">Top workflows</h2>
          {data.topWorkflows.length === 0 ? (
            <p className="text-xs text-zinc-600">No executions yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.topWorkflows.map((w) => (
                <li key={w.workflowId} className="flex items-center justify-between">
                  <Link to={`/workflows/${w.workflowId}`} className="truncate text-xs text-zinc-300 hover:text-accent">
                    {w.name}
                  </Link>
                  <span className="text-xs tabular-nums text-zinc-500">{w.executions} runs</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-200">Recent executions</h2>
            <Link to="/executions" className="flex items-center gap-1 text-xs text-accent hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {data.recentExecutions.length === 0 ? (
            <div className="p-4"><EmptyState title="No executions yet" description="Executions appear here when workflows run." /></div>
          ) : (
            <ul className="divide-y divide-zinc-800/70">
              {data.recentExecutions.map((e) => (
                <li key={e.id}>
                  <Link to={`/executions/${e.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-900/60">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-zinc-200">{e.workflow.name}</div>
                      <div className="text-[11px] text-zinc-600">
                        {e.triggerType} · {timeAgo(e.createdAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs tabular-nums text-zinc-500">{formatDuration(e.durationMs)}</span>
                      <Badge value={e.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-200">Recent failures</h2>
            <XCircle className="h-4 w-4 text-red-500/70" />
          </div>
          {data.failedExecutions.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />}
                title="No failed executions"
                description="Everything is running smoothly."
              />
            </div>
          ) : (
            <ul className="divide-y divide-zinc-800/70">
              {data.failedExecutions.map((e) => (
                <li key={e.id}>
                  <Link to={`/executions/${e.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-900/60">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-zinc-200">{e.workflow.name}</div>
                      <div className="truncate text-[11px] text-red-400/80">
                        {(e.error as { message?: string } | null)?.message ?? "Execution failed"}
                      </div>
                    </div>
                    <span className="text-xs tabular-nums text-zinc-500">{timeAgo(e.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
