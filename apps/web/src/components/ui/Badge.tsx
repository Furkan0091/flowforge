const STYLES: Record<string, string> = {
  // execution statuses
  queued: "bg-zinc-800/80 text-zinc-300 border-zinc-700",
  running: "bg-sky-950/60 text-sky-300 border-sky-800",
  retrying: "bg-amber-950/50 text-amber-300 border-amber-800",
  completed: "bg-emerald-950/50 text-emerald-300 border-emerald-800",
  success: "bg-emerald-950/50 text-emerald-300 border-emerald-800",
  failed: "bg-red-950/50 text-red-300 border-red-800",
  cancelled: "bg-zinc-800/80 text-zinc-400 border-zinc-700",
  skipped: "bg-zinc-800/50 text-zinc-500 border-zinc-700",
  // workflow statuses
  enabled: "bg-emerald-950/50 text-emerald-300 border-emerald-800",
  disabled: "bg-zinc-800/80 text-zinc-400 border-zinc-700",
  // node states
  idle: "bg-zinc-800/50 text-zinc-500 border-zinc-700",
  // log levels
  info: "bg-sky-950/40 text-sky-300 border-sky-900",
  warn: "bg-amber-950/40 text-amber-300 border-amber-900",
  error: "bg-red-950/40 text-red-300 border-red-900",
  debug: "bg-zinc-800/50 text-zinc-400 border-zinc-700",
};

export function Badge({ value, className = "" }: { value: string; className?: string }) {
  const style = STYLES[value] ?? "bg-zinc-800/80 text-zinc-300 border-zinc-700";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${style} ${className}`}
    >
      {value}
    </span>
  );
}
