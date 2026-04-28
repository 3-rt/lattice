import { useEffect, useMemo, useState } from "react";
import { ConversationComposer } from "../components/conversations/conversation-composer.tsx";
import { ConversationList } from "../components/conversations/conversation-list.tsx";
import { ConversationThread } from "../components/conversations/conversation-thread.tsx";
import {
  createConversation,
  fetchAgents,
  fetchConversationMessages,
  fetchConversations,
  sendConversationMessage,
} from "../lib/api.ts";
import { useConversationStore } from "../store/conversation-store.ts";
import { useLatticeStore } from "../store/lattice-store.ts";

export function ConversationsPage() {
  const {
    conversations,
    messagesByConversation,
    selectedConversationId,
    loading,
    error,
    setConversations,
    selectConversation,
    setMessages,
    addMessage,
    setLoading,
    setError,
  } = useConversationStore();
  const agents = useLatticeStore((state) => state.agents);
  const setAgents = useLatticeStore((state) => state.setAgents);
  const [sending, setSending] = useState(false);

  const selectedMessages = useMemo(
    () => selectedConversationId ? messagesByConversation[selectedConversationId] ?? [] : [],
    [messagesByConversation, selectedConversationId]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [conversationRows, agentRows] = await Promise.all([
          fetchConversations(),
          fetchAgents(),
        ]);
        if (cancelled) return;
        setConversations(conversationRows);
        setAgents(agentRows);
        const selected = selectedConversationId ?? conversationRows[0]?.id ?? null;
        selectConversation(selected);
        if (selected) {
          setMessages(selected, await fetchConversationMessages(selected));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown conversation error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectConversation, selectedConversationId, setAgents, setConversations, setError, setLoading, setMessages]);

  async function handleCreate() {
    const conversation = await createConversation("New conversation");
    setConversations([conversation, ...conversations]);
    selectConversation(conversation.id);
    setMessages(conversation.id, []);
  }

  async function handleSelect(conversationId: string) {
    selectConversation(conversationId);
    if (!messagesByConversation[conversationId]) {
      setMessages(conversationId, await fetchConversationMessages(conversationId));
    }
  }

  async function handleSend(text: string, agent?: string) {
    let conversationId = selectedConversationId;
    if (!conversationId) {
      const conversation = await createConversation("New conversation");
      setConversations([conversation, ...conversations]);
      selectConversation(conversation.id);
      setMessages(conversation.id, []);
      conversationId = conversation.id;
    }

    setSending(true);
    setError(null);
    try {
      const result = await sendConversationMessage(conversationId, text, agent);
      addMessage(conversationId, result.userMessage);
      if (result.agentMessage) addMessage(conversationId, result.agentMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-5">
      <div className="page-header">
        <p className="page-header-eyebrow">Shared context</p>
        <h1 className="page-title">Work in one thread across all agents.</h1>
        <p className="page-description">
          Use conversations for debugging and follow-ups. Lattice sends each agent the thread summary,
          recent turns, and your current request.
        </p>
      </div>

      {error && (
        <div className="surface-panel border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <ConversationList
          conversations={conversations}
          selectedConversationId={selectedConversationId}
          onSelect={handleSelect}
          onCreate={handleCreate}
        />
        <div className="flex min-h-0 flex-col gap-4">
          <ConversationThread messages={selectedMessages} />
          <ConversationComposer
            agents={agents}
            disabled={loading}
            sending={sending}
            onSend={handleSend}
          />
        </div>
      </div>
    </div>
  );
}
