import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { nodeIcon, NODE_STATUS_ICONS, NODE_STATUS_COLORS } from "../../lib/nodeIcons";
import { formatDuration } from "../../lib/format";
import type { BuilderNodeData } from "./builderTypes";

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  queued: "Queued",
  running: "Running…",
  success: "Completed",
  failed: "Failed",
  skipped: "Skipped",
};

function FlowNodeInner({ data, selected }: NodeProps) {
  const { label, type, category, color, icon, status = "idle", durationMs, error, branchHandles, config } =
    data as unknown as BuilderNodeData;
  const Icon = nodeIcon(icon);
  const StatusIcon = NODE_STATUS_ICONS[status];
  const statusColor = NODE_STATUS_COLORS[status];
  const isCondition = Boolean(branchHandles?.length);
  const isSwitch = type === "switch";
  const switchCases = isSwitch ? (((config?.cases ?? []) as { id?: string; label?: string; value?: string }[]) ?? []) : [];
  const n = switchCases.length;
  const caseLeft = (i: number) => (n > 1 ? 15 + (i * 55) / (n - 1) : 25);
  const defaultLeft = n > 1 ? 85 : 75;

  return (
    <div
      className={`w-52 rounded-lg border bg-zinc-900/95 shadow-lg transition-colors ${
        selected ? "border-accent ring-1 ring-accent/50" : "border-zinc-700"
      } ${status === "running" ? "running-glow border-sky-600/70" : ""} ${
        status === "failed" ? "border-red-700/70" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-zinc-700 !bg-zinc-600" />

      <div className="flex items-center gap-2 px-3 py-2.5">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${color}1f`, color }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-zinc-100">{label}</div>
          <div className="flex items-center gap-1 text-[10px] capitalize text-zinc-500">
            <span>{category}</span>
            {status !== "idle" && (
              <span className={`flex items-center gap-1 ${statusColor}`}>
                <StatusIcon className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} />
                {STATUS_LABELS[status]}
                {durationMs !== undefined && status !== "running" && ` · ${formatDuration(durationMs)}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {status === "failed" && Boolean(error) && (
        <div className="border-t border-red-900/50 bg-red-950/20 px-3 py-1.5">
          <div className="truncate text-[10px] text-red-300">
            {String((error as { message?: string })?.message ?? "Node failed")}
          </div>
        </div>
      )}

      <div className="relative border-t border-zinc-800/70 px-3 py-1.5">
        {isCondition ? (
          <div className="flex items-center justify-between text-[10px] font-medium">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500/70" />
              TRUE
            </span>
            <span className="flex items-center gap-1 text-red-400">
              FALSE
              <span className="flex h-2 w-2 rounded-full bg-red-500/70" />
            </span>
          </div>
        ) : isSwitch ? (
          <div className="flex flex-wrap items-center justify-center gap-1 text-[10px] font-medium">
            {switchCases.map((c, i) => (
              <span
                key={c.id ?? i}
                className="rounded-full border border-amber-800/60 bg-amber-950/30 px-1.5 py-px text-amber-300"
              >
                {c.label || c.value || `Case ${i + 1}`}
              </span>
            ))}
            <span className="rounded-full border border-zinc-700 bg-zinc-800/40 px-1.5 py-px text-zinc-400">default</span>
          </div>
        ) : (
          <div className="text-center text-[10px] text-zinc-600">{type.replace(/_/g, " ")}</div>
        )}
        {isCondition ? (
          <>
            <Handle
              id="true"
              type="source"
              position={Position.Bottom}
              style={{ left: "25%" }}
              className="!h-2 !w-2 !border-emerald-700 !bg-emerald-500"
            />
            <Handle
              id="false"
              type="source"
              position={Position.Bottom}
              style={{ left: "75%" }}
              className="!h-2 !w-2 !border-red-700 !bg-red-500"
            />
          </>
        ) : isSwitch ? (
          <>
            {switchCases.map((c, i) => (
              <Handle
                key={c.id ?? i}
                id={c.id ?? `c${i + 1}`}
                type="source"
                position={Position.Bottom}
                style={{ left: `${caseLeft(i)}%` }}
                className="!h-2 !w-2 !border-amber-700 !bg-amber-500"
              />
            ))}
            <Handle
              id="default"
              type="source"
              position={Position.Bottom}
              style={{ left: `${defaultLeft}%` }}
              className="!h-2 !w-2 !border-zinc-700 !bg-zinc-500"
            />
          </>
        ) : (
          <Handle
            type="source"
            position={Position.Bottom}
            className="!h-2 !w-2 !border-zinc-700 !bg-zinc-500"
          />
        )}
      </div>
    </div>
  );
}

export const FlowNode = memo(FlowNodeInner);
