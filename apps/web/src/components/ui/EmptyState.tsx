import { AlertTriangle, Inbox } from "lucide-react";

interface Props {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 px-6 py-14 text-center">
      <div className="mb-3 text-zinc-600">{icon ?? <Inbox className="h-8 w-8" />}</div>
      <h3 className="text-sm font-medium text-zinc-300">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs text-zinc-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-red-900/40 bg-red-950/20 px-6 py-12 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-red-400" />
      <h3 className="text-sm font-medium text-red-300">Something went wrong</h3>
      <p className="mt-1 max-w-sm text-xs text-red-400/80 break-words">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary mt-4">
          Try again
        </button>
      )}
    </div>
  );
}
