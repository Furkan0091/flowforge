import { useEffect, useState } from "react";
import { Trash2, X, Plus } from "lucide-react";
import type { NodeTypeSchema } from "../../lib/types";
import { nodeIcon } from "../../lib/nodeIcons";
import type { BuilderNodeData } from "./builderTypes";

interface Props {
  node: BuilderNodeData & { id: string };
  schema: NodeTypeSchema | undefined;
  onUpdate: (patch: Partial<BuilderNodeData>) => void;
  onDelete: () => void;
  onClose: () => void;
  webhookUrl?: string | null;
}

function KeyValueEditor({
  value,
  onChange,
}: {
  value: { key: string; value: string }[];
  onChange: (v: { key: string; value: string }[]) => void;
}) {
  const update = (i: number, patch: Partial<{ key: string; value: string }>) => {
    onChange(value.map((pair, idx) => (idx === i ? { ...pair, ...patch } : pair)));
  };
  return (
    <div className="space-y-1.5">
      {value.map((pair, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            className="input flex-1 font-mono text-xs"
            placeholder="Key"
            value={pair.key}
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <input
            className="input flex-1 font-mono text-xs"
            placeholder="Value"
            value={pair.value}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <button
            type="button"
            className="text-zinc-600 hover:text-red-400"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { key: "", value: "" }])}
        className="flex items-center gap-1 text-xs text-accent hover:underline"
      >
        <Plus className="h-3 w-3" /> Add pair
      </button>
    </div>
  );
}

interface SwitchCase {
  id?: string;
  label?: string;
  value?: string;
}

function caseId(): string {
  return `case_${Math.random().toString(36).slice(2, 8)}`;
}

function CasesEditor({ value, onChange }: { value: SwitchCase[]; onChange: (v: SwitchCase[]) => void }) {
  const update = (i: number, patch: Partial<SwitchCase>) => {
    onChange(value.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };
  return (
    <div className="space-y-2">
      {value.map((c, i) => (
        <div key={c.id ?? i} className="rounded-md border border-zinc-800 bg-zinc-900/40 p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">Case {i + 1}</span>
            <button
              type="button"
              className="text-zinc-600 hover:text-red-400"
              title="Remove case"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            <input
              className="input font-mono text-xs"
              placeholder="Branch label (e.g. Google)"
              value={c.label ?? ""}
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <input
              className="input font-mono text-xs"
              placeholder="Match value (e.g. Google)"
              value={c.value ?? ""}
              onChange={(e) => update(i, { value: e.target.value })}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { id: caseId(), label: "", value: "" }])}
        className="flex items-center gap-1 text-xs text-accent hover:underline"
      >
        <Plus className="h-3 w-3" /> Add case
      </button>
    </div>
  );
}

function ObjectEditor({ value, onChange }: { value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const [text, setText] = useState(JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(value ?? {}, null, 2));
  }, [value]);

  const commit = () => {
    try {
      const parsed = JSON.parse(text || "{}");
      if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Must be an object");
      setError(null);
      onChange(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  return (
    <div>
      <textarea
        className="input font-mono text-xs"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        spellCheck={false}
      />
      {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

export function NodeConfigPanel({ node, schema, onUpdate, onDelete, onClose, webhookUrl }: Props) {
  const [label, setLabel] = useState(node.label);
  useEffect(() => setLabel(node.label), [node.label]);

  if (!schema) {
    return (
      <div className="flex h-full w-72 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
          <span className="text-xs font-medium text-zinc-400">Unknown node type</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const Icon = nodeIcon(schema.icon);
  const config = { ...schema.defaultConfig, ...node.config };

  const setConfig = (name: string, value: unknown) => {
    onUpdate({ config: { ...config, [name]: value } });
  };

  const visibleFields = schema.configFields.filter(
    (f) => !f.dependsOn || config[f.dependsOn.field] === f.dependsOn.equals
  );

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <span className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
          <span className="flex h-5 w-5 items-center justify-center rounded" style={{ backgroundColor: `${schema.color}1f`, color: schema.color }}>
            <Icon className="h-3 w-3" />
          </span>
          Node configuration
        </span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <p className="text-[11px] leading-relaxed text-zinc-500">{schema.description}</p>

        <div>
          <label className="label">Label</label>
          <input
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => {
              if (label.trim()) onUpdate({ label: label.trim() });
            }}
          />
        </div>

        {visibleFields.map((field) => (
          <div key={field.name}>
            <label className="label">{field.label}</label>

            {field.type === "select" && (
              <select
                className="input"
                value={String(config[field.name] ?? field.default ?? "")}
                onChange={(e) => setConfig(field.name, e.target.value)}
              >
                {(field.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}

            {field.type === "text" && (
              <input
                className="input font-mono text-xs"
                placeholder={field.placeholder}
                value={String(config[field.name] ?? field.default ?? "")}
                onChange={(e) => setConfig(field.name, e.target.value)}
              />
            )}

            {field.type === "secret" && (
              <input
                type="password"
                className="input font-mono text-xs"
                placeholder={field.placeholder}
                value={String(config[field.name] ?? field.default ?? "")}
                onChange={(e) => setConfig(field.name, e.target.value)}
              />
            )}

            {field.type === "number" && (
              <input
                type="number"
                className="input"
                value={String(config[field.name] ?? field.default ?? "")}
                onChange={(e) => setConfig(field.name, e.target.value === "" ? "" : Number(e.target.value))}
              />
            )}

            {(field.type === "textarea" || field.type === "code") && (
              <textarea
                className={`input ${field.type === "code" ? "font-mono text-xs" : ""}`}
                rows={field.rows ?? 3}
                placeholder={field.placeholder}
                value={String(config[field.name] ?? field.default ?? "")}
                onChange={(e) => setConfig(field.name, e.target.value)}
              />
            )}

            {field.type === "keyvalue" && (
              <KeyValueEditor
                value={(config[field.name] as { key: string; value: string }[]) ?? []}
                onChange={(v) => setConfig(field.name, v)}
              />
            )}

            {field.type === "cases" && (
              <CasesEditor
                value={(config[field.name] as SwitchCase[]) ?? []}
                onChange={(v) => setConfig(field.name, v)}
              />
            )}

            {field.type === "object" && (
              <ObjectEditor
                value={(config[field.name] as Record<string, unknown>) ?? {}}
                onChange={(v) => setConfig(field.name, v)}
              />
            )}

            {field.type === "toggle" && (
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={Boolean(config[field.name] ?? field.default)}
                  onChange={(e) => setConfig(field.name, e.target.checked)}
                  className="h-3.5 w-3.5 accent-accent"
                />
                Enabled
              </label>
            )}

            {field.type === "readonly" && (
              <div className="flex items-center gap-2">
                <input className="input flex-1 font-mono text-xs text-zinc-400" readOnly value={webhookUrl ?? "Save to generate URL"} />
                {webhookUrl && (
                  <button
                    className="btn-secondary shrink-0 text-xs"
                    onClick={() => void navigator.clipboard.writeText(webhookUrl)}
                  >
                    Copy
                  </button>
                )}
              </div>
            )}

            {field.help && <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">{field.help}</p>}
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-800 p-3">
        <button onClick={onDelete} className="btn-danger w-full text-xs">
          <Trash2 className="h-3.5 w-3.5" />
          Delete node
        </button>
      </div>
    </div>
  );
}
