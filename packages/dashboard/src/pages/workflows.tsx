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
    <div className="flex h-full flex-col gap-4">
      <div className="surface-panel shrink-0 px-5 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="page-header-eyebrow">Workflow tooling</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-strong)]">
              Build precise multi-agent workflows.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
              Use the editor for structure and logic, then switch to the runner
              to inspect saved workflows and execute them with live status.
            </p>
          </div>
          <div className="surface-muted inline-flex gap-1 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "flex items-center gap-1.5 rounded-2xl px-3.5 py-2.5 text-xs font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-white/10 text-[var(--text-strong)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-strong)]"
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
