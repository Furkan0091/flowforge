import {
  Webhook,
  Clock,
  Play,
  GitBranch,
  Timer,
  Globe,
  Mail,
  Database,
  Wand2,
  Variable,
  Terminal,
  Bug,
  Shuffle,
  Send,
  Circle,
  Loader2,
  CheckCircle2,
  XCircle,
  SkipForward,
  type LucideIcon,
} from "lucide-react";

export const NODE_ICONS: Record<string, LucideIcon> = {
  webhook: Webhook,
  clock: Clock,
  play: Play,
  "git-branch": GitBranch,
  timer: Timer,
  globe: Globe,
  mail: Mail,
  database: Database,
  wand: Wand2,
  variable: Variable,
  terminal: Terminal,
  bug: Bug,
  shuffle: Shuffle,
  send: Send,
};

export function nodeIcon(name: string): LucideIcon {
  return NODE_ICONS[name] ?? Circle;
}

export const NODE_STATUS_ICONS: Record<string, LucideIcon> = {
  idle: Circle,
  queued: Loader2,
  running: Loader2,
  success: CheckCircle2,
  completed: CheckCircle2,
  failed: XCircle,
  skipped: SkipForward,
};

export const NODE_STATUS_COLORS: Record<string, string> = {
  idle: "text-zinc-600",
  queued: "text-zinc-400",
  running: "text-sky-400",
  success: "text-emerald-400",
  completed: "text-emerald-400",
  failed: "text-red-400",
  skipped: "text-zinc-500",
};
