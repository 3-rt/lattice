import { create } from "zustand";
import type { ConversationInfo, ConversationMessageInfo } from "../lib/api.ts";

interface ConversationState {
  conversations: ConversationInfo[];
  messagesByConversation: Record<string, ConversationMessageInfo[]>;
  selectedConversationId: string | null;
  loading: boolean;
  error: string | null;
  setConversations: (conversations: ConversationInfo[]) => void;
  selectConversation: (conversationId: string | null) => void;
  setMessages: (conversationId: string, messages: ConversationMessageInfo[]) => void;
  addMessage: (conversationId: string, message: ConversationMessageInfo) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversations: [],
  messagesByConversation: {},
  selectedConversationId: null,
  loading: false,
  error: null,

  setConversations: (conversations) => set({ conversations }),
  selectConversation: (selectedConversationId) => set({ selectedConversationId }),
  setMessages: (conversationId, messages) =>
    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: messages,
      },
    })),
  addMessage: (conversationId, message) =>
    set((state) => {
      const existing = state.messagesByConversation[conversationId] ?? [];
      if (existing.some((item) => item.id === message.id)) return state;
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [...existing, message],
        },
      };
    }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
