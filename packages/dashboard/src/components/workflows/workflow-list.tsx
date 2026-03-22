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
        <p className="text-sm text-gray-500">No workflows saved yet.</p>
        <p className="mt-1 text-xs text-gray-600">Create one in the Editor tab.</p>
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
            "cursor-pointer rounded-lg border bg-gray-900/80 p-3 transition-colors",
            selectedWorkflowId === workflow.id
              ? "border-lattice-600 bg-gray-900"
              : "border-gray-800 hover:border-gray-700"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-gray-100">{workflow.name}</h4>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleEdit(workflow.id);
                }}
                title="Edit workflow"
                className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
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
                className="rounded p-1 text-emerald-500 transition-colors hover:bg-gray-800 hover:text-emerald-400 disabled:opacity-40"
              >
                <Play className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-500">
            <span>{workflow.definition.nodes.length} nodes</span>
            <span className="text-gray-700">|</span>
            <span>{workflow.definition.edges.length} edges</span>
          </div>
        </div>
      ))}
    </div>
  );
}
