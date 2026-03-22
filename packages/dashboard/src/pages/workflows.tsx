import { useEffect } from "react";
import { clsx } from "clsx";
import { Pencil, Play } from "lucide-react";
import { fetchWorkflows } from "../lib/api.ts";
import { WorkflowEditor } from "../components/workflows/workflow-editor.tsx";
import { WorkflowRunner } from "../components/workflows/workflow-runner.tsx";
import { useWorkflowStore } from "../store/workflow-store.ts";

const tabs = [
  { id: "editor" as const, label: "Editor", icon: Pencil },
  { id: "runner" as const, label: "Runner", icon: Play },
];

export function Workflows() {
  const activeTab = useWorkflowStore((state) => state.activeTab);
  const setActiveTab = useWorkflowStore((state) => state.setActiveTab);
  const setWorkflows = useWorkflowStore((state) => state.setWorkflows);

  useEffect(() => {
    fetchWorkflows()
      .then((workflows) => setWorkflows(workflows))
      .catch((error) => console.error("Failed to fetch workflows:", error));
  }, [setWorkflows]);

  return (
    <div className="-m-6 flex h-full flex-col">
      <div className="shrink-0 border-b border-gray-800 px-4">
        <div className="flex items-center gap-4">
          <h1 className="py-3 text-sm font-semibold text-gray-100">Workflows</h1>
          <div className="ml-4 flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-b-2 border-lattice-500 bg-gray-800 text-gray-100"
                    : "text-gray-500 hover:text-gray-300"
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {activeTab === "editor" ? <WorkflowEditor /> : <WorkflowRunner />}
      </div>
    </div>
  );
}
