import { NavLink } from "react-router-dom";
import { Activity, Layout, ListTodo, GitBranch } from "lucide-react";
import { useLatticeStore } from "../../store/lattice-store.ts";
import { clsx } from "clsx";

const navItems: Array<{
  to: string;
  icon: typeof Activity;
  label: string;
  disabled?: boolean;
}> = [
  { to: "/", icon: Layout, label: "Agents" },
  { to: "/flow", icon: Activity, label: "Live Flow" },
  { to: "/tasks", icon: ListTodo, label: "Tasks" },
  { to: "/workflows", icon: GitBranch, label: "Workflows" },
];

export function Sidebar() {
  const connectionStatus = useLatticeStore((s) => s.connectionStatus);
  const connectionCopy =
    connectionStatus === "connected"
      ? "System link live"
      : connectionStatus === "connecting"
        ? "System link stabilizing"
        : "System link offline";

  return (
    <aside className="control-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">
          L
        </div>
        <div className="sidebar-brand-copy">
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
            Lattice
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-100">
            Agent operations
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Coordinate agents, dispatch work, and monitor system activity.
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                "group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm transition-all duration-200",
                isActive
                  ? "nav-link-active bg-slate-200/10 text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "text-slate-400 hover:bg-slate-200/5 hover:text-slate-100",
                item.disabled && "pointer-events-none opacity-40"
              )
            }
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-400/10 bg-slate-200/5 text-slate-300 transition group-hover:border-slate-300/15 group-hover:bg-slate-200/10 group-hover:text-slate-100">
              <item.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{item.label}</span>
              <span className="block text-[11px] text-slate-500">
                {item.to === "/"
                  ? "Roster and dispatch"
                  : item.to === "/flow"
                    ? "Real-time activity"
                    : item.to === "/tasks"
                      ? "History and routing"
                      : "Build and run flows"}
              </span>
            </span>
            {item.disabled && (
              <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-600">
                Soon
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-400/10 px-4 py-4">
        <div className="surface-muted px-3 py-3">
          <div className="mb-2 text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-slate-500">
            Relay link
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <div
              className={clsx(
                "status-dot shadow-[0_0_12px_rgba(96,165,250,0.25)]",
                connectionStatus === "connected" && "bg-emerald-400",
                connectionStatus === "connecting" && "animate-pulse bg-amber-400",
                connectionStatus === "disconnected" && "bg-rose-400"
              )}
            />
            <span className="font-medium">{connectionCopy}</span>
          </div>
          <div
            className={clsx(
              "mt-1 text-xs",
              connectionStatus === "connected" && "text-slate-400",
              connectionStatus === "connecting" && "text-amber-200/80",
              connectionStatus === "disconnected" && "text-rose-200/75"
            )}
          >
            {connectionStatus === "connected"
              ? "Receiving live registry and task events."
              : connectionStatus === "connecting"
                ? "Re-establishing the event stream."
                : "Dashboard updates are paused until relay connectivity returns."}
          </div>
        </div>
      </div>
    </aside>
  );
}
