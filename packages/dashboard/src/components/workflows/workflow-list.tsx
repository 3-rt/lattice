import { Pencil, Play } from "lucide-react";
import { clsx } from "clsx";
import { fetchWorkflowRuns, runWorkflow } from "../../lib/api.ts";
import { useWorkflowStore } from "../../store/workflow-store.ts";

export function WorkflowList() {
  const workflows = useWorkflowStore((state) => state.workflows);
  const selectedWorkflowId = useWorkflowStore(
    (state) => state.selectedWorkflowId
  );
  const setSelectedWorkflowId = useWorkflowStore(
    (state) => state.setSelectedWorkflowId
  );
  const activeRunStatus = useWorkflowStore((state) => state.activeRunStatus);
  const startRun = useWorkflowStore((state) => state.startRun);
  const setRuns = useWorkflowStore((state) => state.setRuns);
  const setActiveTab = useWorkflowStore((state) => state.setActiveTab);
  const loadWorkflowIntoEditor = useWorkflowStore(
    (state) => state.loadWorkflowIntoEditor
  );

  async function handleSelect(workflowId: string) {
    setSelectedWorkflowId(workflowId);
    try {
      const runs = await fetchWorkflowRuns(workflowId);
      setRuns(runs);
    } catch (error) {
      console.error("Failed to fetch workflow runs:", error);
    }
  }

  async function handleRun(workflowId: string) {
    setSelectedWorkflowId(workflowId);
    try {
      const run = await runWorkflow(workflowId);
      startRun(run.id, workflowId);
    } catch (error) {
      console.error("Failed to run workflow:", error);
    }
  }

  function handleEdit(workflowId: string) {
    const workflow = workflows.find((item) => item.id === workflowId);
    if (!workflow) return;
    loadWorkflowIntoEditor(workflow);
    setActiveTab("editor");
  }

  if (workflows.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center text-center">
        <p className="text-sm text-[var(--text-muted)]">No workflows saved yet.</p>
        <p className="mt-1 text-xs text-[var(--text-soft)]">Create one in the Editor tab.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {workflows.map((workflow) => (
        <div
          key={workflow.id}
          onClick={() => void handleSelect(workflow.id)}
          className={clsx(
            "cursor-pointer rounded-2xl border bg-white/[0.03] p-3.5 transition-colors",
            selectedWorkflowId === workflow.id
              ? "border-sky-300/25 bg-white/[0.06]"
              : "border-white/6 hover:border-white/12"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-[var(--text-strong)]">{workflow.name}</h4>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleEdit(workflow.id);
                }}
                title="Edit workflow"
                className="rounded p-1 text-[var(--text-soft)] transition-colors hover:bg-white/8 hover:text-[var(--text-main)]"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleRun(workflow.id);
                }}
                disabled={activeRunStatus === "working"}
                title="Run workflow"
                className="rounded p-1 text-emerald-300 transition-colors hover:bg-white/8 hover:text-emerald-200 disabled:opacity-40"
              >
                <Play className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--text-soft)]">
            <span>{workflow.definition.nodes.length} nodes</span>
            <span className="text-white/12">|</span>
            <span>{workflow.definition.edges.length} edges</span>
          </div>
        </div>
      ))}
    </div>
  );
}
