import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { ScrollText } from "lucide-react";
import { useFlowStore, type TaskLogEntry } from "../../store/flow-store.ts";

export function TaskLogPanel() {
  const taskLog = useFlowStore((s) => s.taskLog);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new entries arrive (newest-first list)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [taskLog.length]);

  return (
    <div className="surface-panel-strong flex h-full w-80 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/6 px-4 py-4">
        <ScrollText className="h-4 w-4 text-[var(--accent-secondary)]" />
        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-main)]">
          Live Task Log
        </span>
        <span className="ml-auto text-[10px] text-[var(--text-soft)]">
          {taskLog.length} events
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {taskLog.length === 0 && (
          <p className="mt-10 px-4 text-center text-xs leading-6 text-[var(--text-soft)]">
            No events yet. Dispatch a task to see live activity.
          </p>
        )}

        <AnimatePresence initial={false}>
          {taskLog.map((entry) => (
            <LogEntry key={entry.id} entry={entry} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function LogEntry({ entry }: { entry: TaskLogEntry }) {
  const typeColor = {
    "task:created": "text-lattice-400",
    "task:routed": "text-blue-400",
    "task:completed": "text-emerald-400",
    "task:failed": "text-red-400",
    "task:canceled": "text-yellow-400",
  }[entry.type] ?? "text-gray-400";

  const dotColor = {
    "task:created": "bg-lattice-400",
    "task:routed": "bg-blue-400",
    "task:completed": "bg-emerald-400",
    "task:failed": "bg-red-400",
    "task:canceled": "bg-yellow-400",
  }[entry.type] ?? "bg-gray-600";

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2 hover:bg-white/[0.05]"
    >
      <div className={clsx("mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", dotColor)} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className={clsx("text-[10px] font-medium uppercase tracking-[0.18em]", typeColor)}>
            {entry.type.split(":")[1]}
          </span>
          <span className="text-[9px] text-[var(--text-soft)]">
            {formatTime(entry.timestamp)}
          </span>
        </div>
        <p className="text-[11px] leading-tight text-[var(--text-muted)]">
          {entry.message}
        </p>
        <span className="font-mono text-[9px] text-[var(--text-soft)]">
          {entry.taskId.slice(0, 8)}
        </span>
      </div>
    </motion.div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
