import { useCallback, useEffect, useState } from "react";
import { Mail, Server, Database, Webhook, Globe, Plug, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../lib/api";
import type { IntegrationStatus } from "../lib/types";
import { Spinner } from "../components/ui/Spinner";
import { ErrorState } from "../components/ui/EmptyState";

function IntegrationCard({
  title,
  icon,
  status,
  detail,
  description,
}: {
  title: string;
  icon: React.ReactNode;
  status: "ok" | "warn" | "error";
  detail: string;
  description: string;
}) {
  const colors = {
    ok: "text-emerald-400 border-emerald-900/60",
    warn: "text-amber-400 border-amber-900/60",
    error: "text-red-400 border-red-900/60",
  };
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-zinc-500">{icon}</span>
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        </div>
        <span className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${colors[status]}`}>
          {status === "ok" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {status === "ok" ? "Connected" : status === "warn" ? "Degraded" : "Disconnected"}
        </span>
      </div>
      <p className="mt-2 text-xs text-zinc-500">{description}</p>
      <p className="code mt-2 text-[11px] text-zinc-600">{detail}</p>
    </div>
  );
}

export default function IntegrationsPage() {
  const [data, setData] = useState<IntegrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    try {
      setError(null);
      const d = await api.integrations.get();
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load integrations");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reload]);

  if (error) return <div className="p-8"><ErrorState message={error} onRetry={() => setReload((r) => r + 1)} /></div>;
  if (!data) return <div className="p-8"><Spinner label="Checking integrations…" /></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Integrations</h1>
          <p className="text-xs text-zinc-500">Live connectivity status from the backend</p>
        </div>
        <button onClick={() => setReload((r) => r + 1)} className="btn-secondary text-xs">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <IntegrationCard
          title="Email"
          icon={<Mail className="h-4 w-4" />}
          status={data.email.configured ? "ok" : "warn"}
          detail={data.email.configured ? `SMTP (${data.email.mode})` : `Mode: ${data.email.mode}`}
          description={data.email.description}
        />
        <IntegrationCard
          title="Redis / BullMQ"
          icon={<Server className="h-4 w-4" />}
          status={data.redis.connected ? "ok" : "error"}
          detail={data.redis.error ?? "Queue broker"}
          description={data.redis.description}
        />
        <IntegrationCard
          title="PostgreSQL"
          icon={<Database className="h-4 w-4" />}
          status={data.postgres.connected ? "ok" : "error"}
          detail="Prisma ORM"
          description={data.postgres.description}
        />
        <IntegrationCard
          title="Webhooks"
          icon={<Webhook className="h-4 w-4" />}
          status="ok"
          detail={data.webhooks.baseUrl}
          description={data.webhooks.description}
        />
        <IntegrationCard
          title="HTTP Requests"
          icon={<Globe className="h-4 w-4" />}
          status="ok"
          detail="fetch (Node)"
          description={data.http.description}
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-zinc-600">
        <Plug className="h-3.5 w-3.5" />
        Integration nodes are registered server-side in the node registry — new integrations can be added without touching the engine.
      </div>
    </div>
  );
}
