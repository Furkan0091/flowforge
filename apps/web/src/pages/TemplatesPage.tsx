import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutTemplate, Plus } from "lucide-react";
import { api } from "../lib/api";
import { Spinner } from "../components/ui/Spinner";
import { EmptyState, ErrorState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toaster";
import { nodeIcon } from "../lib/nodeIcons";

interface Template {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
  nodeTypes: string[];
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { templates } = await api.templates.list();
      setTemplates(templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const useTemplate = async (t: Template) => {
    setBusy(t.id);
    try {
      const { workflowId } = await api.templates.use(t.id);
      toast.success("Workflow created from template");
      navigate(`/workflows/${workflowId}`);
    } catch (err) {
      toast.error("Failed to create workflow", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div className="p-8"><ErrorState message={error} onRetry={load} /></div>;
  if (!templates) return <div className="p-8"><Spinner label="Loading templates…" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Templates</h1>
        <p className="text-xs text-zinc-500">Real, executable workflow definitions to start from</p>
      </div>

      {templates.length === 0 ? (
        <EmptyState icon={<LayoutTemplate className="h-8 w-8" />} title="No templates available" />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="panel flex flex-col p-5">
              <div className="mb-2 flex items-center gap-2">
                <LayoutTemplate className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold text-zinc-100">{t.name}</h3>
              </div>
              <p className="flex-1 text-xs leading-relaxed text-zinc-500">{t.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.nodeTypes.map((type) => {
                  const Icon = nodeIcon(type);
                  return (
                    <span key={type} className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900/80 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      <Icon className="h-3 w-3" />
                      {type.replace("_", " ")}
                    </span>
                  );
                })}
              </div>
              <button onClick={() => useTemplate(t)} disabled={busy === t.id} className="btn-secondary mt-4 w-full text-xs">
                <Plus className="h-3.5 w-3.5" />
                {busy === t.id ? "Creating…" : "Use template"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
