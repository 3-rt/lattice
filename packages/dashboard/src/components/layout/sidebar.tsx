import { NavLink } from "react-router-dom";
import { Activity, Layout, ListTodo, GitBranch } from "lucide-react";
import { useLatticeStore } from "../../store/lattice-store.ts";
import { clsx } from "clsx";

const navItems = [
  { to: "/", icon: Layout, label: "Agents" },
  { to: "/flow", icon: Activity, label: "Live Flow" },
  { to: "/tasks", icon: ListTodo, label: "Tasks", disabled: true },
  { to: "/workflows", icon: GitBranch, label: "Workflows", disabled: true },
];

export function Sidebar() {
  const connectionStatus = useLatticeStore((s) => s.connectionStatus);

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-gray-800 bg-gray-950">
      <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-4">
        <div className="h-6 w-6 rounded bg-lattice-600 flex items-center justify-center text-xs font-bold">
          L
        </div>
        <span className="text-sm font-semibold tracking-wide">LATTICE</span>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:bg-gray-900 hover:text-gray-200",
                item.disabled && "pointer-events-none opacity-40"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
            {item.disabled && (
              <span className="ml-auto text-[10px] uppercase tracking-wider text-gray-600">
                Soon
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-gray-800 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div
            className={clsx(
              "h-2 w-2 rounded-full",
              connectionStatus === "connected" && "bg-emerald-400",
              connectionStatus === "connecting" && "bg-yellow-400 animate-pulse",
              connectionStatus === "disconnected" && "bg-red-400"
            )}
          />
          {connectionStatus === "connected" ? "Connected" : connectionStatus === "connecting" ? "Connecting..." : "Disconnected"}
        </div>
      </div>
    </aside>
  );
}
