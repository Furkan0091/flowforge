import { useState } from "react";
import { nodeIcon } from "../../lib/nodeIcons";
import type { NodeTypesResponse } from "../../lib/types";

interface Props {
  data: NodeTypesResponse | null;
  onAdd: (type: string, position?: { x: number; y: number }) => void;
}

export function NodePalette({ data, onAdd }: Props) {
  const [open, setOpen] = useState<string>("trigger");

  if (!data) return null;

  return (
    <div className="flex h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-950">
      <div className="px-3 pb-2 pt-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Node palette</p>
        <p className="mt-0.5 text-[11px] text-zinc-600">Drag onto the canvas or click to add</p>
      </div>
      {data.categories.map((cat) => {
        const isOpen = open === cat.id;
        return (
          <div key={cat.id}>
            <button
              onClick={() => setOpen(isOpen ? "" : cat.id)}
              className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-900"
            >
              {cat.label}
              <span className="text-zinc-600">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div className="space-y-1 px-2 pb-2">
                {cat.nodes.map((n) => {
                  const Icon = nodeIcon(n.icon);
                  return (
                    <div
                      key={n.type}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/flowforge-node", n.type);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => onAdd(n.type)}
                      title={n.description}
                      className="group flex cursor-grab items-center gap-2.5 rounded-md border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-2 transition-colors hover:border-zinc-700 hover:bg-zinc-900 active:cursor-grabbing"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded" style={{ backgroundColor: `${n.color}1f`, color: n.color }}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-zinc-200">{n.label}</div>
                        <div className="truncate text-[10px] text-zinc-600">{n.description}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
