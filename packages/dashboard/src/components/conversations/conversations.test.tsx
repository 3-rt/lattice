import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationComposer } from "./conversation-composer.tsx";
import { ConversationList } from "./conversation-list.tsx";
import { ConversationThread } from "./conversation-thread.tsx";

describe("conversation components", () => {
  it("renders conversation titles and selected state", () => {
    const html = renderToStaticMarkup(
      <ConversationList
        conversations={[
          {
            id: "conv-1",
            title: "OpenClaw debugging",
            summary: "Investigating Drive auth",
            openclawSessionKey: "lattice-conv-conv-1",
            createdAt: "",
            updatedAt: "",
          },
        ]}
        selectedConversationId="conv-1"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
      />
    );

    expect(html).toContain("OpenClaw debugging");
    expect(html).toContain("Investigating Drive auth");
    expect(html).toContain("New thread");
  });

  it("renders user and agent messages", () => {
    const html = renderToStaticMarkup(
      <ConversationThread
        messages={[
          { id: "msg-1", conversationId: "conv-1", role: "user", content: "why did it fail?", createdAt: "" },
          { id: "msg-2", conversationId: "conv-1", role: "agent", agentName: "openclaw", content: "Drive auth is missing.", createdAt: "" },
        ]}
      />
    );

    expect(html).toContain("why did it fail?");
    expect(html).toContain("OpenClaw");
    expect(html).toContain("Drive auth is missing.");
  });

  it("renders composer agent picker and submit action", () => {
    const html = renderToStaticMarkup(
      <ConversationComposer
        agents={[
          { name: "openclaw", status: "online" },
          { name: "codex", status: "online" },
        ]}
        disabled={false}
        sending={false}
        onSend={vi.fn()}
      />
    );

    expect(html).toContain("Auto");
    expect(html).toContain("openclaw");
    expect(html).toContain("codex");
    expect(html).toContain("Send message");
  });
});
