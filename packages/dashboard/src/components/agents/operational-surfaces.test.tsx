import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { AgentCard } from "./agent-card.tsx";
import { TaskDispatchBar } from "../tasks/task-dispatch-bar.tsx";
import { useLatticeStore } from "../../store/lattice-store.ts";
import type { AgentInfo } from "../../lib/api.ts";

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    name: "claude-code",
    status: "online",
    card: {
      name: "Claude Code",
      description: "General coding and repo work",
      url: "https://example.com",
      version: "0.1.0",
      capabilities: { streaming: true, pushNotifications: false },
      skills: [
        {
          id: "code",
          name: "Code",
          description: "Writes and edits code",
          tags: [],
        },
      ],
      authentication: { schemes: ["oauth"] },
    },
    ...overrides,
  };
}

describe("operational dashboard surfaces", () => {
  beforeEach(() => {
    useLatticeStore.setState({
      agents: [makeAgent()],
      tasks: [],
      connectionStatus: "connected",
    });
  });

  it("renders the dispatch bar with shared semantic control classes", () => {
    const html = renderToStaticMarkup(<TaskDispatchBar />);

    expect(html).toContain("surface-panel");
    expect(html).toContain("ui-input");
    expect(html).toContain("ui-select");
    expect(html).toContain("ui-button-primary");
    expect(html).toContain("Dispatch task");
  });

  it("renders offline agents with structured status and guidance treatment", () => {
    const html = renderToStaticMarkup(
      <AgentCard
        agent={makeAgent({
          status: "offline",
          statusReason: "Gateway token not configured.",
        })}
      />
    );

    expect(html).toContain("surface-panel");
    expect(html).toContain("status-pill");
    expect(html).toContain("Needs attention");
    expect(html).toContain("Gateway token not configured.");
  });
});
