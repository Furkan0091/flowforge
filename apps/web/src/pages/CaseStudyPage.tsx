import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Workflow,
  ArrowRight,
  Boxes,
  GitBranch,
  Layers,
  RefreshCw,
  ShieldAlert,
  TerminalSquare,
  Database,
  Zap,
  CheckCircle2,
  XCircle,
  Timer,
} from "lucide-react";
import { FlowNode } from "../components/builder/FlowNode";

const nodeTypes = { workflowNode: FlowNode };

// ---------------------------------------------------------------------------
// Static preview of the seeded "Lead Processing" workflow, rendered exactly
// like the real builder (same FlowNode component), showing a completed run.
// ---------------------------------------------------------------------------

const PREVIEW_META: Record<string, { icon: string; color: string; category: string }> = {
  webhook: { icon: "webhook", color: "#38bdf8", category: "trigger" },
  transform: { icon: "wand", color: "#fb923c", category: "data" },
  condition: { icon: "git-branch", color: "#fbbf24", category: "logic" },
  database: { icon: "database", color: "#2dd4bf", category: "action" },
  email: { icon: "mail", color: "#f472b6", category: "action" },
  log: { icon: "terminal", color: "#a3e635", category: "action" },
};

const PREVIEW_DEFINITION = {
  nodes: [
    { id: "webhook_trigger", type: "webhook", label: "Webhook", position: { x: 60, y: 160 } },
    { id: "validate_request", type: "transform", label: "Validate Request", position: { x: 340, y: 160 } },
    { id: "check_email", type: "condition", label: "Check Email", position: { x: 620, y: 160 } },
    { id: "store_lead", type: "database", label: "Store Lead", position: { x: 900, y: 40 } },
    { id: "send_email", type: "email", label: "Send Email", position: { x: 1180, y: 40 } },
    { id: "log_failure", type: "log", label: "Log Failure", position: { x: 900, y: 300 } },
  ],
  edges: [
    { id: "e1", source: "webhook_trigger", target: "validate_request" },
    { id: "e2", source: "validate_request", target: "check_email" },
    { id: "e3", source: "check_email", target: "store_lead", sourceHandle: "true" },
    { id: "e4", source: "store_lead", target: "send_email" },
    { id: "e5", source: "check_email", target: "log_failure", sourceHandle: "false" },
  ],
};

function PreviewInner() {
  const { nodes, edges } = useMemo(() => {
    const skipped = new Set(["log_failure"]);
    const nodes: Node[] = PREVIEW_DEFINITION.nodes.map((n) => {
      const meta = PREVIEW_META[n.type] ?? { icon: "circle", color: "#6366f1", category: "action" };
      return {
        id: n.id,
        type: "workflowNode",
        position: n.position,
        data: {
          label: n.label,
          type: n.type,
          category: meta.category,
          color: meta.color,
          icon: meta.icon,
          config: {},
          branchHandles: n.type === "condition" ? ["true", "false"] : undefined,
          status: skipped.has(n.id) ? "skipped" : "success",
          durationMs: { webhook_trigger: 120, validate_request: 182, check_email: 20, store_lead: 340, send_email: 800, log_failure: 0 }[n.id],
        },
      };
    });
    const edges: Edge[] = PREVIEW_DEFINITION.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
    }));
    return { nodes, edges };
  }, []);

  return (
    <div className="relative h-[440px] overflow-hidden rounded-lg border border-zinc-800">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1c1f26" />
      </ReactFlow>
      <div className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-zinc-600">
        Live React Flow canvas — same component the builder uses
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Case study body
// ---------------------------------------------------------------------------

const TAGS = ["Node.js", "Express", "React", "TypeScript", "PostgreSQL", "Prisma", "Redis", "BullMQ", "Webhooks"];

const TECH = [
  {
    icon: Boxes,
    title: "Workflow Model",
    body: (
      <>
        A workflow is a JSON graph of <span className="code text-zinc-300">nodes</span> and{" "}
        <span className="code text-zinc-300">edges</span>. Each node carries a type, a label, and a config object; edges
        connect outputs to inputs. Conditional nodes expose named branch handles (<span className="code text-zinc-300">true</span>/
        <span className="code text-zinc-300">false</span>), so the graph encodes routing, not just sequencing. Definitions
        are stored in PostgreSQL as JSON on a <span className="code text-zinc-300">WorkflowVersion</span>, and every
        execution pins the exact version it started from — editing a workflow never rewrites history.
      </>
    ),
  },
  {
    icon: GitBranch,
    title: "Execution Engine",
    body: (
      <>
        The engine loads the pinned definition, builds an execution context (trigger inputs, variables, and node outputs),
        and walks the graph with an incoming-edge counter. A node runs once all of its incoming edges have resolved;
        skipped branches are resolved through the same counter so joins after a condition count correctly. Each node
        handler is a registered, schema-driven implementation — conditions evaluate against the context, HTTP nodes issue
        real requests, database nodes run allow-listed Prisma operations. Node outputs land in the context and are
        addressable downstream as <span className="code text-zinc-300">{"{{webhook.email}}"}</span> or{" "}
        <span className="code text-zinc-300">{"{{nodes.<id>.data}}"}</span>.
      </>
    ),
  },
  {
    icon: Layers,
    title: "Queue Architecture",
    body: (
      <>
        Triggering a workflow only creates an execution record and enqueues a job — it never executes the workflow inside
        the HTTP request. A <span className="code text-zinc-300">workflow-execution</span> queue feeds the execution
        worker, which runs the engine; a second <span className="code text-zinc-300">node-continuation</span> queue
        carries delayed jobs that resume an execution at a specific node after a retry backoff or a delay node. Because
        the engine is stateless between jobs (state lives in PostgreSQL), any number of workers can process executions
        concurrently, and a worker restart is safe.
      </>
    ),
  },
  {
    icon: RefreshCw,
    title: "Retry Strategy",
    body: (
      <>
        Failures are classified retryable (network errors, timeouts, 5xx, 429) or not (validation errors). Retryable
        failures schedule a delayed continuation with exponential backoff — <span className="code text-zinc-300">delay ×
        2^(attempt−1)</span> — up to a per-node limit. The execution enters a <span className="code text-zinc-300">retrying</span>{" "}
        status, attempt counts are persisted per node, and the frontend streams the state over WebSockets. When retries
        are exhausted, the node fails and downstream nodes are skipped.
      </>
    ),
  },
  {
    icon: ShieldAlert,
    title: "Failure Handling",
    body: (
      <>
        Every node failure is captured with a code, message, retryability flag, and details, then persisted on the node
        record and mirrored in the execution log. The first failed node (by start time) becomes the execution-level error.
        A failed execution keeps its full node states, inputs, and outputs, so the failure is fully inspectable — no
        guessing about what ran and what didn't.
      </>
    ),
  },
  {
    icon: TerminalSquare,
    title: "Execution Logs",
    body: (
      <>
        The engine writes a structured log line for every meaningful event: execution start and completion, payload
        receipt, node start/finish with duration, condition outcomes, retry scheduling, and errors. Logs are persisted as
        <span className="code text-zinc-300"> ExecutionLog</span> rows keyed by execution, surfaced on the execution
        detail page and streamed live into the builder's execution panel — turning a failed run into a readable timeline
        instead of a stack trace.
      </>
    ),
  },
  {
    icon: Database,
    title: "Database Model",
    body: (
      <>
        <span className="code text-zinc-300">User → Workflow → WorkflowVersion → WorkflowExecution → ExecutionNode /
        ExecutionLog</span>, plus a <span className="code text-zinc-300">Webhook</span> record per workflow. Execution
        data is indexed by user, workflow, and status for the history screens; node states carry input/output/error JSON,
        attempt counts, and timings so the detail views need no extra queries.
      </>
    ),
  },
];

const LESSONS = [
  {
    title: "Async processing",
    body: "Keep request handlers thin. Enqueue and return a 202; everything slow happens in workers.",
  },
  {
    title: "State management",
    body: "Persist execution state between jobs. The engine resumes from PostgreSQL, so workers are disposable.",
  },
  {
    title: "Idempotency",
    body: "Stable job IDs and version-pinned executions prevent duplicate schedule fires from corrupting history.",
  },
  {
    title: "Failure recovery",
    body: "Classify failures, back off exponentially, and always leave the failed state inspectable.",
  },
  {
    title: "Queue-based architecture",
    body: "Separate queues for work and continuations make retries and delays first-class citizens of the system.",
  },
  {
    title: "Observability",
    body: "Persisted logs plus WebSocket events give real-time visibility without polling.",
  },
];

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <Icon className="h-4 w-4 text-accent" />
        {title}
      </h2>
      <div className="mt-2 text-[13px] leading-relaxed text-zinc-400">{children}</div>
    </section>
  );
}

function SummaryStat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "green" }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${tone === "green" ? "text-emerald-400" : "text-zinc-200"}`}>
        {value}
      </div>
    </div>
  );
}

function CaseStudyPageInner() {
  return (
    <div className="min-h-screen bg-canvas text-zinc-200">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent">
              <Workflow className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-zinc-100">FlowForge</span>
            <span className="text-xs text-zinc-600">Case study</span>
          </div>
          <Link to="/login" className="btn-secondary text-xs">
            Open the app
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        {/* Hero */}
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-accent">Case study</p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
            Designing a Reliable Workflow Execution Engine
          </h1>
          <p className="text-sm leading-relaxed text-zinc-400">
            How FlowForge turns a visual graph of nodes into asynchronous, queue-driven automation — with retries,
            failure handling, and full execution observability. This is the engineering story behind the product, not a
            feature list.
          </p>
        </div>

        {/* Portfolio card */}
        <div className="panel overflow-hidden">
          <div className="border-b border-zinc-800 p-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">Project card</p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-100">FlowForge</h2>
            <p className="text-sm text-zinc-500">Visual Workflow Automation Platform</p>
            <blockquote className="mt-3 border-l-2 border-accent pl-3 text-sm italic leading-relaxed text-zinc-400">
              “Visual automation platform for building and executing event-driven workflows with queues, integrations,
              retries, and execution monitoring.”
            </blockquote>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {TAGS.map((t) => (
                <span key={t} className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-zinc-300">
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Link to="/login" className="btn-primary text-xs">
                View Project
              </Link>
            </div>
          </div>

          {/* Visual preview */}
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-zinc-200">The workflow builder in action</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <SummaryStat label="Workflow" value="Lead Processing" />
                <SummaryStat label="Status" value="Completed" tone="green" />
                <SummaryStat label="Duration" value="1.8s" />
                <SummaryStat label="Nodes" value="6" />
                <SummaryStat label="Retries" value="0" />
              </div>
            </div>
            <ReactFlowProvider>
              <PreviewInner />
            </ReactFlowProvider>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-600">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> completed node
              </span>
              <span className="flex items-center gap-1">
                <XCircle className="h-3 w-3 text-red-500" /> condition branch not taken
              </span>
              <span className="flex items-center gap-1">
                <Timer className="h-3 w-3 text-zinc-500" /> real per-node durations from a live run
              </span>
            </p>
          </div>
        </div>

        {/* Case study body */}
        <div className="space-y-4">
          <Section icon={GitBranch} title="Problem">
            Teams repeatedly perform the same multi-step operations across APIs, databases, notifications, and internal
            systems. Doing them by hand is slow and error-prone; ad-hoc scripts are hard to monitor, hard to retry, and
            invisible when they fail. FlowForge lets teams describe those operations once as a workflow graph and then
            execute, monitor, and debug them from one place.
          </Section>

          {TECH.map((t) => (
            <Section key={t.title} icon={t.icon} title={t.title}>
              {t.body}
            </Section>
          ))}

          {/* Lessons learned */}
          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-zinc-100">Lessons Learned</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {LESSONS.map((l) => (
                <div key={l.title} className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
                  <h3 className="text-xs font-semibold text-zinc-300">{l.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">{l.body}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* CTA */}
        <div className="panel flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm font-medium text-zinc-200">See it running</p>
          <p className="max-w-md text-xs leading-relaxed text-zinc-500">
            Sign in with the demo account to open the builder, run the Lead Processing workflow, and watch node states
            stream in real time over WebSockets.
          </p>
          <div className="flex gap-2">
            <Link to="/login" className="btn-primary text-xs">
              Open the app
            </Link>
          </div>
          <p className="code text-[11px] text-zinc-600">demo@flowforge.app / flowforge123</p>
        </div>
      </main>

      <footer className="border-t border-zinc-800/70 py-6 text-center text-[11px] text-zinc-600">
        FlowForge — Visual Workflow Automation Platform · Built with Node.js, Express, React, PostgreSQL, Redis & BullMQ
      </footer>
    </div>
  );
}

export default function CaseStudyPage() {
  return (
    <ReactFlowProvider>
      <CaseStudyPageInner />
    </ReactFlowProvider>
  );
}
