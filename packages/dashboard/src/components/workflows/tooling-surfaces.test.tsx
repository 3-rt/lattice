import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import { beforeEach, describe, expect, it } from "vitest";
import { NodePalette } from "./node-palette.tsx";
import { PropertiesPanel } from "./properties-panel.tsx";
import { AgentTaskNode } from "./agent-task-node.tsx";
import { ConditionNode } from "./condition-node.tsx";
import { useLatticeStore } from "../../store/lattice-store.ts";
import { useWorkflowStore } from "../../store/workflow-store.ts";

describe("workflow tooling surfaces", () => {
  beforeEach(() => {
    useLatticeStore.setState({
      agents: [],
      tasks: [],
      connectionStatus: "connected",
    });
    useWorkflowStore.setState({
      workflows: [],
      activeTab: "editor",
      editorNodes: [],
      editorEdges: [],
      selectedNodeId: null,
      editingWorkflowId: null,
      workflowName: "",
      selectedWorkflowId: null,
      activeRunId: null,
      activeRunStatus: "idle",
      stepStatuses: new Map(),
      runs: [],
    });
  });

  it("renders workflow palette and node primitives with precise tooling classes", () => {
    const paletteHtml = renderToStaticMarkup(<NodePalette />);
    const agentNodeHtml = renderToStaticMarkup(
      <ReactFlowProvider>
        <AgentTaskNode
          id="node-1"
          data={{
            label: "Write fix",
            agent: "auto",
            taskTemplate: "Patch the issue",
            selected: true,
          }}
          selected
          draggable={false}
          dragging={false}
          zIndex={0}
          selectable={false}
          deletable={false}
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          type="agent-task"
        />
      </ReactFlowProvider>
    );
    const conditionNodeHtml = renderToStaticMarkup(
      <ReactFlowProvider>
        <ConditionNode
          id="node-2"
          data={{
            label: "Check status",
            field: "result.status",
            operator: "equals",
            value: "completed",
            selected: false,
          }}
          selected={false}
          draggable={false}
          dragging={false}
          zIndex={0}
          selectable={false}
          deletable={false}
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          type="condition"
        />
      </ReactFlowProvider>
    );

    expect(paletteHtml).toContain("workflow-palette-card");
    expect(agentNodeHtml).toContain("workflow-node-shell");
    expect(conditionNodeHtml).toContain("workflow-condition-node");
  });

  it("renders the properties panel empty state with clearer inspector guidance", () => {
    const html = renderToStaticMarkup(<PropertiesPanel />);

    expect(html).toContain("Inspector idle");
    expect(html).toContain("Select a node to edit its logic");
  });
});
