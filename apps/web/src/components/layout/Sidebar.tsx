import { NavLink, useNavigate } from "react-router-dom";
import {
  Workflow,
  PlaySquare,
  LayoutTemplate,
  Plug,
  Settings,
  Gauge,
  LogOut,
  FileText,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { useAuth } from "../../store/auth";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: Gauge },
  { to: "/workflows", label: "Workflows", icon: Workflow },
  { to: "/executions", label: "Executions", icon: PlaySquare },
  { to: "/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
          <WorkflowIcon className="h-4.5 w-4.5" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight text-zinc-100">FlowForge</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-600">Automation</div>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-0.5 px-2">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                isActive ? "bg-accent/10 text-accent" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
        <NavLink
          to="/case-study"
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
              isActive ? "bg-accent/10 text-accent" : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
            }`
          }
        >
          <FileText className="h-4 w-4" />
          Case study
        </NavLink>
      </nav>

      <div className="border-t border-zinc-800/70 p-3">
        <div className="mb-2 flex items-center gap-2.5 px-1">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300">
            {(user?.name ?? user?.email ?? "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-zinc-300">{user?.name ?? user?.email}</div>
            <div className="truncate text-[10px] text-zinc-600">{user?.email}</div>
          </div>
        </div>
        <button onClick={handleLogout} className="btn-ghost w-full justify-start text-xs">
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
