import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import type { TaskInfo } from "../../lib/api.ts";
import { getTaskInputText, getTaskOutputText, getTaskErrorDetail } from "./task-utils.ts";

interface TaskRowProps {
  task: TaskInfo;
}

const statusColors: Record<string, string> = {
  submitted: "bg-slate-400",
  working: "animate-pulse bg-amber-400",
  completed: "bg-emerald-400",
  failed: "bg-rose-400",
  canceled: "bg-slate-500",
  "input-required": "bg-yellow-300",
};

export function TaskRow({ task }: TaskRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const inputText = getTaskInputText(task);
  const outputText = getTaskOutputText(task);
  const errorDetail = getTaskErrorDetail(task);
  const latency = task.metadata?.latencyMs;
  const createdAt = task.metadata?.createdAt
    ? new Date(task.metadata.createdAt).toLocaleTimeString()
    : "—";
  const taskPreview = inputText.slice(0, 80) || task.id.slice(0, 12);

  return (
    <div className="border-b border-white/6 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors hover:bg-white/5"
      >
        <ChevronRight
          className={clsx(
            "h-3.5 w-3.5 text-[var(--text-soft)] transition-transform",
            expanded && "rotate-90"
          )}
        />

        <div className="w-28 shrink-0">
          <div className="status-pill justify-start">
          <div
            className={clsx(
              "status-dot",
              statusColors[task.status] ?? "bg-gray-500"
            )}
          />
            <span>{task.status}</span>
          </div>
        </div>

        <span className="w-36 shrink-0 truncate text-[var(--text-muted)]">
          {task.metadata?.assignedAgent || "—"}
        </span>

        <span className="flex-1 truncate text-[var(--text-main)]">{taskPreview}</span>

        <span className="w-20 shrink-0 text-right text-[var(--text-muted)]">
          {latency != null ? `${latency}ms` : "—"}
        </span>

        <span className="w-20 shrink-0 text-right text-xs text-[var(--text-soft)]">
          {createdAt}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="ml-8 space-y-4 px-4 pb-4 pt-1">
              {task.metadata?.routingReason && (
                <div>
                  <span className="section-label">
                    Routing signal
                  </span>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                    {task.metadata.routingReason}
                  </p>
                </div>
              )}

              {inputText && (
                <div>
                  <span className="section-label">
                    Input
                  </span>
                  <pre className="surface-muted mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap p-3 text-xs text-[var(--text-main)]">
                    {inputText}
                  </pre>
                </div>
              )}

              {outputText && (
                <div>
                  <span className="section-label">
                    Output
                  </span>
                  <pre className="surface-muted mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap p-3 text-xs text-[var(--text-main)]">
                    {outputText}
                  </pre>
                </div>
              )}

              {errorDetail && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowDetail((v) => !v)}
                    className="text-xs text-[var(--text-soft)] transition-colors hover:text-[var(--text-main)]"
                  >
                    {showDetail ? "Hide details" : "Show details"}
                  </button>
                  {showDetail && (
                    <pre className="surface-muted mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap p-2 text-[10px] text-[var(--text-soft)]">
                      {errorDetail}
                    </pre>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-xs text-[var(--text-soft)]">
                <span>ID: {task.id}</span>
                {task.metadata?.conversationId && (
                  <span>Conversation: {task.metadata.conversationId.slice(0, 8)}</span>
                )}
                {task.metadata?.cost != null && (
                  <span>Cost: ${task.metadata.cost.toFixed(4)}</span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
