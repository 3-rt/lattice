import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AgentNode } from "./agent-node.tsx";
import { RelayNode } from "./relay-node.tsx";
import { FlowEmptyState } from "./empty-state.tsx";
import { useFlowStore } from "../../store/flow-store.ts";

describe("live flow focal surfaces", () => {
  beforeEach(() => {
    useFlowStore.setState({
      activeEdges: [],
      nodeGlows: new Map(),
      taskLog: [],
    });
  });

  it("renders live flow nodes with mission-control semantic classes", () => {
    const agentHtml = renderToStaticMarkup(
      <ReactFlowProvider>
        <AgentNode
          id="agent-1"
          data={{
            agentName: "Claude Code",
            description: "General coding work",
            status: "online",
            skills: ["Code", "Review"],
          }}
          selected={false}
          draggable={false}
          dragging={false}
          zIndex={0}
          selectable={false}
          deletable={false}
          isConnectable={false}
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          type="agent"
        />
      </ReactFlowProvider>
    );

    const relayHtml = renderToStaticMarkup(
      <ReactFlowProvider>
        <RelayNode
          id="relay"
          data={{ label: "Relay", taskCount: 2 }}
          selected={false}
          draggable={false}
          dragging={false}
          zIndex={0}
          selectable={false}
          deletable={false}
          isConnectable={false}
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          type="relay"
        />
      </ReactFlowProvider>
    );

    expect(agentHtml).toContain("mission-node");
    expect(agentHtml).toContain("mission-node-status");
    expect(relayHtml).toContain("relay-core");
    expect(relayHtml).toContain("task pulse");
  });

  it("renders the empty state with the new mission-control guidance copy", () => {
    const html = renderToStaticMarkup(<FlowEmptyState />);

    expect(html).toContain("surface-panel-strong");
    expect(html).toContain("Mission control is waiting for agents");
    expect(html).toContain("lattice.config.json");
  });
});
