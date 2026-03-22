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
      <div className="flex h-full items-center justify-center p-4 text-xs text-gray-600">
        Select a node to edit its properties
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
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <h3 className="text-xs font-semibold text-gray-300">Properties</h3>
        <button
          type="button"
          onClick={() => setSelectedNodeId(null)}
          className="text-gray-500 hover:text-gray-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Label
          </label>
          <input
            type="text"
            value={selectedNode.label}
            onChange={(event) =>
              updateEditorNode(selectedNode.id, { label: event.target.value })
            }
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 focus:border-lattice-600 focus:outline-none focus:ring-1 focus:ring-lattice-600"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Type
          </label>
          <span className="inline-block rounded bg-gray-800 px-2 py-1 text-[10px] text-gray-400">
            {selectedNode.type}
          </span>
        </div>

        {selectedNode.type === "agent-task" && (
          <>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
                Agent
              </label>
              <select
                value={(selectedNode.config.agent as string) ?? "auto"}
                onChange={(event) => handleConfigChange("agent", event.target.value)}
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-300 focus:border-lattice-600 focus:outline-none"
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
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
                Task Template
              </label>
              <textarea
                value={(selectedNode.config.taskTemplate as string) ?? ""}
                onChange={(event) =>
                  handleConfigChange("taskTemplate", event.target.value)
                }
                rows={3}
                placeholder="Use {{variable}} for placeholders..."
                className="w-full resize-none rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 focus:border-lattice-600 focus:outline-none focus:ring-1 focus:ring-lattice-600"
              />
            </div>
          </>
        )}

        {selectedNode.type === "condition" && (
          <>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
                Field (dot notation)
              </label>
              <input
                type="text"
                value={(selectedNode.config.field as string) ?? ""}
                onChange={(event) => handleConfigChange("field", event.target.value)}
                placeholder="e.g. nodeId.status"
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 focus:border-lattice-600 focus:outline-none focus:ring-1 focus:ring-lattice-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
                Operator
              </label>
              <select
                value={(selectedNode.config.operator as string) ?? "equals"}
                onChange={(event) =>
                  handleConfigChange("operator", event.target.value)
                }
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-300 focus:border-lattice-600 focus:outline-none"
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
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
                Value
              </label>
              <input
                type="text"
                value={(selectedNode.config.value as string) ?? ""}
                onChange={(event) => handleConfigChange("value", event.target.value)}
                placeholder="Compare value"
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 focus:border-lattice-600 focus:outline-none focus:ring-1 focus:ring-lattice-600"
              />
            </div>
          </>
        )}
      </div>

      <div className="border-t border-gray-800 p-3">
        <button
          type="button"
          onClick={() => removeEditorNode(selectedNode.id)}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-950/60"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete Node
        </button>
      </div>
    </div>
  );
}
