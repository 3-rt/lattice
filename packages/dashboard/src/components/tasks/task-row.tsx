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
  submitted: "bg-gray-500",
  working: "bg-yellow-400 animate-pulse",
  completed: "bg-emerald-400",
  failed: "bg-red-400",
  canceled: "bg-gray-600",
  "input-required": "bg-amber-400",
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
    <div className="border-b border-gray-800 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-gray-900/50"
      >
        <ChevronRight
          className={clsx(
            "h-3.5 w-3.5 text-gray-500 transition-transform",
            expanded && "rotate-90"
          )}
        />

        <div className="flex w-28 shrink-0 items-center gap-1.5">
          <div
            className={clsx(
              "h-2 w-2 rounded-full",
              statusColors[task.status] ?? "bg-gray-500"
            )}
          />
          <span className="text-gray-300">{task.status}</span>
        </div>

        <span className="w-36 shrink-0 truncate text-gray-400">
          {task.metadata?.assignedAgent || "—"}
        </span>

        <span className="flex-1 truncate text-gray-400">{taskPreview}</span>

        <span className="w-20 shrink-0 text-right text-gray-500">
          {latency != null ? `${latency}ms` : "—"}
        </span>

        <span className="w-20 shrink-0 text-right text-xs text-gray-600">
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
            <div className="ml-8 space-y-3 px-4 pb-4 pt-1">
              {task.metadata?.routingReason && (
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                    Routing Reason
                  </span>
                  <p className="mt-0.5 text-sm text-gray-400">
                    {task.metadata.routingReason}
                  </p>
                </div>
              )}

              {inputText && (
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                    Input
                  </span>
                  <pre className="mt-0.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded border border-gray-800 bg-gray-950 p-3 text-xs text-gray-300">
                    {inputText}
                  </pre>
                </div>
              )}

              {outputText && (
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                    Output
                  </span>
                  <pre className="mt-0.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded border border-gray-800 bg-gray-950 p-3 text-xs text-gray-300">
                    {outputText}
                  </pre>
                </div>
              )}

              {errorDetail && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowDetail((v) => !v)}
                    className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    {showDetail ? "Hide details" : "Show details"}
                  </button>
                  {showDetail && (
                    <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded border border-gray-800 bg-gray-950 p-2 text-[10px] text-gray-600">
                      {errorDetail}
                    </pre>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                <span>ID: {task.id}</span>
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
