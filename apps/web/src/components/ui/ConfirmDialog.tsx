import { AlertTriangle, X } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}

export function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", danger, onConfirm, onClose, busy }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={busy ? undefined : onClose}>
      <div
        className="fade-in w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {danger && <AlertTriangle className="h-5 w-5 text-red-400" />}
            <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          </div>
          <button onClick={onClose} disabled={busy} className="text-zinc-500 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>
        {description && <p className="mt-2 text-sm text-zinc-400">{description}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="btn-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={busy} className={danger ? "btn-danger" : "btn-primary"}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
