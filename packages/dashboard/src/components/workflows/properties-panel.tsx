import { Trash2, X } from "lucide-react";
import { useLatticeStore } from "../../store/lattice-store.ts";
import { useWorkflowStore } from "../../store/workflow-store.ts";

export function PropertiesPanel() {
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId);
  const editorNodes = useWorkflowStore((state) => state.editorNodes);
  const updateEditorNode = useWorkflowStore((state) => state.updateEditorNode);
  const removeEditorNode = useWorkflowStore((state) => state.removeEditorNode);
  const setSelectedNodeId = useWorkflowStore((state) => state.setSelectedNodeId);
  const agents = useLatticeStore((state) => state.agents);

  const node = editorNodes.find((item) => item.id === selectedNodeId);

  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-5 text-center">
        <p className="section-label">Inspector idle</p>
        <p className="mt-3 max-w-[15rem] text-sm leading-6 text-[var(--text-muted)]">
          Select a node to edit its logic, labels, and execution details.
        </p>
      </div>
    );
  }

  const selectedNode = node;

  function handleConfigChange(key: string, value: string) {
    updateEditorNode(selectedNode.id, {
      config: {
        ...selectedNode.config,
        [key]: value,
      },
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/6 px-4 py-3">
        <div>
          <p className="section-label">Inspector</p>
          <h3 className="mt-1 text-sm font-semibold text-[var(--text-strong)]">Properties</h3>
        </div>
        <button
          type="button"
          onClick={() => setSelectedNodeId(null)}
          className="text-[var(--text-soft)] hover:text-[var(--text-main)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <label className="section-label mb-2 block">
            Label
          </label>
          <input
            type="text"
            value={selectedNode.label}
            onChange={(event) =>
              updateEditorNode(selectedNode.id, { label: event.target.value })
            }
            className="ui-input"
          />
        </div>

        <div>
          <label className="section-label mb-2 block">
            Type
          </label>
          <span className="inline-block rounded-full border border-white/8 bg-white/5 px-2.5 py-1 text-[10px] text-[var(--text-muted)]">
            {selectedNode.type}
          </span>
        </div>

        {selectedNode.type === "agent-task" && (
          <>
            <div>
              <label className="section-label mb-2 block">
                Agent
              </label>
              <select
                value={(selectedNode.config.agent as string) ?? "auto"}
                onChange={(event) => handleConfigChange("agent", event.target.value)}
                className="ui-select"
              >
                <option value="auto">Auto (learned routing)</option>
                {agents
                  .filter((agent) => agent.status === "online")
                  .map((agent) => (
                    <option key={agent.name} value={agent.name}>
                      {agent.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="section-label mb-2 block">
                Task Template
              </label>
              <textarea
                value={(selectedNode.config.taskTemplate as string) ?? ""}
                onChange={(event) =>
                  handleConfigChange("taskTemplate", event.target.value)
                }
                rows={3}
                placeholder="Use {{variable}} for placeholders..."
                className="ui-input min-h-28 resize-none"
              />
            </div>
          </>
        )}

        {selectedNode.type === "condition" && (
          <>
            <div>
              <label className="section-label mb-2 block">
                Field (dot notation)
              </label>
              <input
                type="text"
                value={(selectedNode.config.field as string) ?? ""}
                onChange={(event) => handleConfigChange("field", event.target.value)}
                placeholder="e.g. nodeId.status"
                className="ui-input"
              />
            </div>
            <div>
              <label className="section-label mb-2 block">
                Operator
              </label>
              <select
                value={(selectedNode.config.operator as string) ?? "equals"}
                onChange={(event) =>
                  handleConfigChange("operator", event.target.value)
                }
                className="ui-select"
              >
                <option value="equals">equals</option>
                <option value="not_equals">not equals</option>
                <option value="contains">contains</option>
                <option value="not_contains">not contains</option>
                <option value="is_empty">is empty</option>
                <option value="not_empty">not empty</option>
              </select>
            </div>
            <div>
              <label className="section-label mb-2 block">
                Value
              </label>
              <input
                type="text"
                value={(selectedNode.config.value as string) ?? ""}
                onChange={(event) => handleConfigChange("value", event.target.value)}
                placeholder="Compare value"
                className="ui-input"
              />
            </div>
          </>
        )}
      </div>

      <div className="border-t border-white/6 p-4">
        <button
          type="button"
          onClick={() => removeEditorNode(selectedNode.id)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-300/15 bg-rose-300/10 px-3 py-2 text-xs text-rose-200/90 transition-colors hover:bg-rose-300/15"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete Node
        </button>
      </div>
    </div>
  );
}
