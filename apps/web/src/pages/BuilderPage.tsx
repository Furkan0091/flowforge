import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Play, Save, Power, Copy, Check, ChevronDown, Zap, History, Download, Upload, PanelLeft } from "lucide-react";
import { api } from "../lib/api";
import type { ExecutionDetail, NodeTypeSchema, WorkflowDefinition, WorkflowDetail } from "../lib/types";
import { Spinner } from "../components/ui/Spinner";
import { ErrorState } from "../components/ui/EmptyState";
import { Badge } from "../components/ui/Badge";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/Toaster";
import { formatDateTime, slugify } from "../lib/format";
import { NodePalette } from "../components/builder/NodePalette";
import { NodeConfigPanel } from "../components/builder/NodeConfigPanel";
import { ExecutionPanel } from "../components/builder/ExecutionPanel";
import { FlowNode } from "../components/builder/FlowNode";
import type { BuilderNodeData, NodeStatusInfo, NodeTypeMap } from "../components/builder/builderTypes";
import { onEvent, joinWorkflowRoom, leaveWorkflowRoom } from "../lib/socket";

type BuilderFlowNode = Node<BuilderNodeData>;

const nodeTypes = { workflowNode: FlowNode };

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function toFlowNodes(def: WorkflowDefinition, schemas: NodeTypeMap): BuilderFlowNode[] {
  return def.nodes.map((n) => {
    const schema = schemas.get(n.type);
    return {
      id: n.id,
      type: "workflowNode",
      position: n.position ?? { x: 80 + Math.random() * 200, y: 80 + Math.random() * 120 },
      data: {
        label: n.label,
        type: n.type,
        category: schema?.category ?? "action",
        color: schema?.color ?? "#94a3b8",
        icon: schema?.icon ?? "circle",
        config: n.config,
        branchHandles: schema?.branchHandles,
      },
    };
  });
}

function toFlowEdges(def: WorkflowDefinition): Edge[] {
  return def.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
  }));
}

function toDefinition(nodes: BuilderFlowNode[], edges: Edge[]): WorkflowDefinition {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.type,
      label: n.data.label,
      config: n.data.config,
      position: n.position,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
    })),
  };
}

function BuilderInner() {
  const { id: workflowId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [nodeSchemas, setNodeSchemas] = useState<NodeTypeMap>(new Map());
  const [palette, setPalette] = useState<{ id: NodeTypeSchema["category"]; label: string; nodes: NodeTypeSchema[] }[]>([]);
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState<BuilderFlowNode>([]);
  const [edges, setEdges, onEdgesChangeRaw] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [execution, setExecution] = useState<ExecutionDetail | null>(null);
  const [panelView, setPanelView] = useState<"timeline" | "logs" | "history">("timeline");
  const [runOpen, setRunOpen] = useState(false);
  const [payloadText, setPayloadText] = useState("{}");
  const [running, setRunning] = useState(false);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [activateTarget, setActivateTarget] = useState<WorkflowDetail["versions"][number] | null>(null);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { screenToFlowPosition } = useReactFlow();
  const statusesRef = useRef<Record<string, NodeStatusInfo>>({});

  // ---------------------------------------------------------------- load
  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const [wfRes, ntRes] = await Promise.all([api.workflows.get(workflowId!), api.nodeTypes.get()]);
      setWorkflow(wfRes.workflow);
      const map = new Map<string, NodeTypeSchema>();
      for (const cat of ntRes.categories) for (const n of cat.nodes) map.set(n.type, n);
      setNodeSchemas(map);
      setPalette(ntRes.categories);
      const def = wfRes.workflow.activeVersion?.definition ?? { nodes: [], edges: [] };
      setNodes(toFlowNodes(def, map));
      setEdges(toFlowEdges(def));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load workflow");
    } finally {
      setLoading(false);
    }
  }, [workflowId, setNodes, setEdges]);

  useEffect(() => {
    if (workflowId) void load();
  }, [workflowId, load]);

  // ---------------------------------------------------------- realtime
  useEffect(() => {
    if (!workflowId) return;
    joinWorkflowRoom(workflowId);

    const offNode = onEvent<{ executionId: string; data: NodeStatusInfo & { nodeId: string } }>("node", (p) => {
      const { nodeId, status, durationMs, error } = p.data;
      if (!nodeId) return;
      statusesRef.current[nodeId] = { status, durationMs, error };
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, status, durationMs, error } } : n
        )
      );
      setExecution((prev) =>
        prev
          ? {
              ...prev,
              nodes: prev.nodes.map((n) =>
                n.nodeId === nodeId
                  ? { ...n, status: status ?? n.status, durationMs: durationMs ?? n.durationMs, error: error ?? n.error }
                  : n
              ),
            }
          : prev
      );
    });

    const offExec = onEvent<{ executionId: string; data: Record<string, unknown> }>("execution", (p) => {
      const { executionId, ...data } = p.data;
      setExecution((prev) => {
        if (!prev || prev.id !== executionId) return prev;
        return {
          ...prev,
          status: (data.status as ExecutionDetail["status"]) ?? prev.status,
          startedAt: (data.startedAt as string) ?? prev.startedAt,
          finishedAt: (data.finishedAt as string) ?? prev.finishedAt,
          durationMs: (data.durationMs as number) ?? prev.durationMs,
        };
      });
    });

    const offLog = onEvent<{ executionId: string; data: { log: ExecutionDetail["logs"][number] } }>("log", (p) => {
      const { log } = p.data;
      setExecution((prev) => (prev && prev.id === p.executionId ? { ...prev, logs: [...prev.logs, log] } : prev));
    });

    return () => {
      offNode();
      offExec();
      offLog();
      leaveWorkflowRoom(workflowId);
    };
  }, [workflowId, setNodes]);

  // ------------------------------------------------------------ canvas
  const onNodesChange = useCallback(
    (changes: NodeChange<BuilderFlowNode>[]) => {
      onNodesChangeRaw(changes);
      if (changes.some((c) => c.type === "add" || c.type === "remove" || (c.type === "position" && !c.dragging))) {
        setDirty(true);
      }
    },
    [onNodesChangeRaw]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChangeRaw(changes);
      if (changes.some((c) => c.type === "add" || c.type === "remove")) setDirty(true);
    },
    [onEdgesChangeRaw]
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      const exists = edges.some(
        (e) => e.source === conn.source && e.target === conn.target && (e.sourceHandle ?? null) === (conn.sourceHandle ?? null)
      );
      if (exists) return;
      const edge: Edge = {
        id: `${conn.source}-${conn.target}-${conn.sourceHandle ?? "out"}`,
        source: conn.source,
        target: conn.target,
        sourceHandle: conn.sourceHandle ?? undefined,
        targetHandle: conn.targetHandle ?? undefined,
      };
      setEdges((eds) => addEdge(edge, eds));
      setDirty(true);
    },
    [edges, setEdges]
  );

  const addNode = useCallback(
    (type: string, position?: { x: number; y: number }) => {
      const schema = nodeSchemas.get(type);
      if (!schema) return;
      const node: BuilderFlowNode = {
        id: newId("node"),
        type: "workflowNode",
        position: position ?? { x: 120 + Math.random() * 240, y: 120 + Math.random() * 160 },
        data: {
          label: schema.label,
          type: schema.type,
          category: schema.category,
          color: schema.color,
          icon: schema.icon,
          config: { ...schema.defaultConfig },
          branchHandles: schema.branchHandles,
        },
      };
      setNodes((nds) => [...nds, node]);
      setSelectedId(node.id);
      setDirty(true);
    },
    [nodeSchemas, setNodes]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/flowforge-node");
      if (!type) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode(type, position);
    },
    [addNode, screenToFlowPosition]
  );

  const updateNode = useCallback(
    (id: string, patch: Partial<BuilderNodeData>) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
      setDirty(true);
    },
    [setNodes]
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId(null);
      setDirty(true);
    },
    [setNodes, setEdges]
  );

  // ------------------------------------------------------------- save
  const save = useCallback(async () => {
    if (!workflowId || saving) return;
    setSaving(true);
    try {
      const definition = toDefinition(nodes, edges);
      const res = await api.workflows.update(workflowId, { definition });
      setWorkflow(res.workflow);
      setDirty(false);
      toast.success("Workflow saved", `Version ${res.workflow.activeVersion?.version} created`);
    } catch (err) {
      toast.error("Failed to save", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }, [workflowId, nodes, edges, saving, toast]);

  // -------------------------------------------------------------- run
  const run = useCallback(
    async (payload?: Record<string, unknown>) => {
      if (!workflowId || running) return;
      setRunning(true);
      try {
        statusesRef.current = {};
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            data: { ...n.data, status: undefined, durationMs: undefined, error: undefined },
          }))
        );
        const res = await api.workflows.execute(workflowId, payload);
        toast.info("Execution queued", res.executionId);
        const detail = await api.executions.get(res.executionId);
        setExecution(detail.execution);
        setPanelView("timeline");
        setRunOpen(false);
      } catch (err) {
        toast.error("Failed to start execution", err instanceof Error ? err.message : undefined);
      } finally {
        setRunning(false);
      }
    },
    [workflowId, running, setNodes, toast]
  );

  const toggleStatus = useCallback(async () => {
    if (!workflow) return;
    try {
      const res =
        workflow.status === "enabled" ? await api.workflows.disable(workflow.id) : await api.workflows.enable(workflow.id);
      setWorkflow(res.workflow);
      toast.success(workflow.status === "enabled" ? "Workflow disabled" : "Workflow enabled");
    } catch (err) {
      toast.error("Failed to change status", err instanceof Error ? err.message : undefined);
    }
  }, [workflow, toast]);

  const confirmActivate = useCallback(async () => {
    if (!workflow || !activateTarget || versionsBusy) return;
    setVersionsBusy(true);
    try {
      const res = await api.workflows.activateVersion(workflow.id, activateTarget.version);
      setWorkflow(res.workflow);
      setDirty(false);
      setVersionsOpen(false);
      setActivateTarget(null);
      toast.success("Version activated", `v${activateTarget.version} is now the active version`);
      await load();
    } catch (err) {
      toast.error("Failed to activate version", err instanceof Error ? err.message : undefined);
    } finally {
      setVersionsBusy(false);
    }
  }, [workflow, activateTarget, versionsBusy, toast, load]);

  const webhookUrl = useMemo(() => {
    if (!workflowId) return null;
    return `${window.location.origin}/api/webhooks/${workflowId}`;
  }, [workflowId]);

  const copyWebhook = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setWebhookCopied(true);
    setTimeout(() => setWebhookCopied(false), 1500);
  };

  // ----------------------------------------------------- import / export
  const exportJson = () => {
    const payload = {
      name: workflow?.name ?? "workflow",
      description: workflow?.description ?? null,
      definition: toDefinition(nodes, edges),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(workflow?.name ?? "workflow") || "workflow"}.flowforge.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const def = parsed.definition ?? parsed;
        if (!def || !Array.isArray(def.nodes) || !Array.isArray(def.edges)) {
          throw new Error("Invalid workflow file — expected { name, definition: { nodes, edges } }");
        }
        setNodes(toFlowNodes(def, nodeSchemas));
        setEdges(toFlowEdges(def));
        setSelectedId(null);
        setDirty(true);
        if (typeof parsed.name === "string" && parsed.name.trim()) {
          setWorkflow((w) => (w ? { ...w, name: parsed.name.trim() } : w));
        }
        toast.success("Workflow imported", "Review the canvas, then save to create a new version");
      } catch (err) {
        toast.error("Import failed", err instanceof Error ? err.message : undefined);
      }
    };
    reader.readAsText(file);
  };

  // ------------------------------------------------------------ render
  if (loading) return <div className="p-8"><Spinner label="Loading workflow…" /></div>;
  if (loadError) return <div className="p-8"><ErrorState message={loadError} onRetry={load} /></div>;
  if (!workflow) return null;

  const selectedNode = nodes.find((n) => n.id === selectedId);
  const selectedSchema = selectedNode ? nodeSchemas.get(selectedNode.data.type) : undefined;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-2.5">
        <Link to="/workflows" className="btn-ghost p-1.5" title="Back to workflows">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <button className="btn-ghost p-1.5 lg:hidden" title="Toggle node palette" onClick={() => setPaletteOpen((v) => !v)}>
          <PanelLeft className="h-4 w-4" />
        </button>
        <input
          className="w-40 bg-transparent text-sm font-semibold text-zinc-100 outline-none focus:border-b focus:border-accent sm:w-56"
          value={workflow.name}
          onChange={(e) => setWorkflow((w) => (w ? { ...w, name: e.target.value } : w))}
          onBlur={async () => {
            if (workflow.name.trim() && workflow.name !== (await api.workflows.get(workflow.id)).workflow.name) {
              const res = await api.workflows.update(workflow.id, { name: workflow.name.trim() });
              setWorkflow(res.workflow);
            }
          }}
        />
        <Badge value={workflow.status} />
        <div className="relative">
          <button
            onClick={() => setVersionsOpen((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
            title="Workflow versions"
          >
            <History className="h-3 w-3" />
            v{workflow.activeVersion?.version ?? 1}
            <ChevronDown className="h-2.5 w-2.5 opacity-60" />
          </button>
          {versionsOpen && (
            <div className="fade-in absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-zinc-800 bg-zinc-900 p-2 shadow-2xl">
              <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-600">Versions</p>
              {workflow.versions.length === 0 ? (
                <p className="px-2 py-1 text-xs text-zinc-600">No saved versions yet</p>
              ) : (
                <div className="max-h-56 space-y-0.5 overflow-y-auto">
                  {workflow.versions.map((v) => (
                    <div key={v.version} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-800/60">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs text-zinc-300">
                          <span className="font-medium">v{v.version}</span>
                          {v.isActive && (
                            <span className="rounded-full border border-emerald-800 bg-emerald-950/50 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-emerald-300">
                              active
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-600">
                          {formatDateTime(v.createdAt)} · {v.nodeCount} nodes
                        </div>
                      </div>
                      {!v.isActive && (
                        <button className="btn-secondary shrink-0 text-[10px]" onClick={() => setActivateTarget(v)}>
                          Activate
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {dirty && <span className="flex items-center gap-1 text-[11px] text-amber-400"><Zap className="h-3 w-3" /> unsaved changes</span>}

        {workflow.webhook && workflow.status === "enabled" && (
          <div className="ml-1 hidden items-center gap-1.5 lg:flex">
            <span className="code max-w-56 truncate rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400">
              {webhookUrl}
            </span>
            <button onClick={copyWebhook} className="btn-ghost p-1.5" title="Copy webhook URL">
              {webhookCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = "";
            }}
          />
          <button onClick={() => fileInputRef.current?.click()} className="btn-ghost p-2" title="Import workflow JSON">
            <Upload className="h-4 w-4" />
          </button>
          <button onClick={exportJson} className="btn-ghost p-2" title="Export workflow JSON">
            <Download className="h-4 w-4" />
          </button>
          <div className="relative">
            <button onClick={() => setRunOpen((v) => !v)} disabled={running} className="btn-primary">
              <Play className="h-4 w-4" />
              {running ? "Starting…" : "Run"}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
            {runOpen && (
              <div className="fade-in absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-zinc-800 bg-zinc-900 p-3 shadow-2xl">
                <label className="label">Manual trigger payload (JSON)</label>
                <textarea
                  className="input font-mono text-xs"
                  rows={4}
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                  spellCheck={false}
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button className="btn-secondary text-xs" onClick={() => setRunOpen(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn-primary text-xs"
                    onClick={() => {
                      try {
                        run(JSON.parse(payloadText || "{}"));
                      } catch {
                        toast.error("Payload is not valid JSON");
                      }
                    }}
                  >
                    Execute
                  </button>
                </div>
              </div>
            )}
          </div>
          <button onClick={toggleStatus} className="btn-secondary">
            <Power className="h-3.5 w-3.5" />
            {workflow.status === "enabled" ? "Disable" : "Enable"}
          </button>
          <button onClick={save} disabled={!dirty || saving} className="btn-primary">
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="relative flex min-h-0 flex-1">
        {paletteOpen && <div className="absolute inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setPaletteOpen(false)} />}
        <div className={`${paletteOpen ? "absolute inset-y-0 left-0 z-30 shadow-2xl" : "hidden"} lg:static lg:z-auto lg:block`}>
          <NodePalette data={palette.length ? { categories: palette } : null} onAdd={addNode} />
        </div>

        <div className="relative min-w-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: "default" }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1c1f26" />
            <Controls />
            <MiniMap
              nodeColor={(n) => (n.data as BuilderNodeData).color ?? "#6366f1"}
              maskColor="rgba(11, 13, 18, 0.7)"
              className="!bg-zinc-900"
            />
          </ReactFlow>
        </div>

        {selectedNode && (
          <div className="absolute inset-y-0 right-0 z-40 lg:static lg:z-auto">
            <NodeConfigPanel
              node={{ ...selectedNode.data, id: selectedNode.id }}
              schema={selectedSchema}
              onUpdate={(patch) => updateNode(selectedNode.id, patch)}
              onDelete={() => deleteNode(selectedNode.id)}
              onClose={() => setSelectedId(null)}
              webhookUrl={webhookUrl}
            />
          </div>
        )}
      </div>

      {execution && (
        <ExecutionPanel
          execution={execution}
          view={panelView}
          setView={setPanelView}
          onClose={() => setExecution(null)}
          onRerun={() => void run(JSON.parse(payloadText || "{}"))}
          workflowId={workflowId}
          onSelectExecution={(id) => navigate(`/executions/${id}`)}
        />
      )}

      <ConfirmDialog
        open={activateTarget !== null}
        title={`Activate version ${activateTarget?.version}?`}
        description="The canvas will be replaced with this version's definition. Unsaved changes will be discarded."
        confirmLabel="Activate"
        busy={versionsBusy}
        onConfirm={confirmActivate}
        onClose={() => setActivateTarget(null)}
      />
    </div>
  );
}

export default function BuilderPage() {
  return (
    <ReactFlowProvider>
      <BuilderInner />
    </ReactFlowProvider>
  );
}
