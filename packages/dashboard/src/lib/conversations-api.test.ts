import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createConversation,
  fetchConversationMessages,
  fetchConversations,
  sendConversationMessage,
} from "./api.ts";

describe("conversation API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches conversations", async () => {
    const payload = [{ id: "conv-1", title: "Debugging", summary: "", openclawSessionKey: "lattice-conv-conv-1", createdAt: "", updatedAt: "" }];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchConversations()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/conversations");
  });

  it("creates a conversation", async () => {
    const payload = { id: "conv-1", title: "Debugging", summary: "", openclawSessionKey: "lattice-conv-conv-1", createdAt: "", updatedAt: "" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);

    await expect(createConversation("Debugging")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Debugging" }),
    });
  });

  it("fetches conversation messages", async () => {
    const payload = [{ id: "msg-1", conversationId: "conv-1", role: "user", content: "hello", createdAt: "" }];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchConversationMessages("conv-1")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/conversations/conv-1/messages");
  });

  it("sends a conversation message", async () => {
    const payload = {
      userMessage: { id: "msg-1", conversationId: "conv-1", role: "user", content: "hello", createdAt: "" },
      task: { id: "task-1" },
      agentMessage: { id: "msg-2", conversationId: "conv-1", role: "agent", agentName: "openclaw", content: "done", createdAt: "" },
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendConversationMessage("conv-1", "hello", "openclaw")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/conversations/conv-1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello", agent: "openclaw", execute: true }),
    });
  });
});
