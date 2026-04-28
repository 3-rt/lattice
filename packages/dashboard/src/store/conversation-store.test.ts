import { beforeEach, describe, expect, it } from "vitest";
import { useConversationStore } from "./conversation-store.ts";
import type { ConversationInfo, ConversationMessageInfo } from "../lib/api.ts";

const conversation: ConversationInfo = {
  id: "conv-1",
  title: "OpenClaw debugging",
  summary: "",
  openclawSessionKey: "lattice-conv-conv-1",
  createdAt: "",
  updatedAt: "",
};

const message: ConversationMessageInfo = {
  id: "msg-1",
  conversationId: "conv-1",
  role: "user",
  content: "why did that fail?",
  createdAt: "",
};

describe("ConversationStore", () => {
  beforeEach(() => {
    useConversationStore.setState({
      conversations: [],
      messagesByConversation: {},
      selectedConversationId: null,
      loading: false,
      error: null,
    });
  });

  it("sets conversations and selects one", () => {
    const store = useConversationStore.getState();

    store.setConversations([conversation]);
    store.selectConversation("conv-1");

    expect(useConversationStore.getState().conversations).toEqual([conversation]);
    expect(useConversationStore.getState().selectedConversationId).toBe("conv-1");
  });

  it("stores and appends messages per conversation", () => {
    const store = useConversationStore.getState();

    store.setMessages("conv-1", [message]);
    store.addMessage("conv-1", {
      ...message,
      id: "msg-2",
      role: "agent",
      agentName: "openclaw",
      content: "Drive auth is missing.",
    });

    expect(useConversationStore.getState().messagesByConversation["conv-1"].map((m) => m.id)).toEqual(["msg-1", "msg-2"]);
  });

  it("deduplicates appended messages", () => {
    const store = useConversationStore.getState();

    store.setMessages("conv-1", [message]);
    store.addMessage("conv-1", message);

    expect(useConversationStore.getState().messagesByConversation["conv-1"]).toHaveLength(1);
  });
});
