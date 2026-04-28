import { Plus } from "lucide-react";
import { clsx } from "clsx";
import type { ConversationInfo } from "../../lib/api.ts";

interface ConversationListProps {
  conversations: ConversationInfo[];
  selectedConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onCreate: () => void;
}

export function ConversationList({
  conversations,
  selectedConversationId,
  onSelect,
  onCreate,
}: ConversationListProps) {
  return (
    <aside className="surface-panel flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/6 px-4 py-4">
        <div>
          <p className="section-label">Threads</p>
          <p className="mt-1 text-xs text-[var(--text-soft)]">Shared context for every agent.</p>
        </div>
        <button type="button" onClick={onCreate} className="ui-button-secondary px-3 py-2 text-xs">
          <Plus className="h-3.5 w-3.5" />
          New thread
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <div className="surface-muted p-4 text-sm text-[var(--text-muted)]">
            Start a thread when the work needs memory across agents.
          </div>
        ) : (
          conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelect(conversation.id)}
              className={clsx(
                "mb-2 w-full rounded-2xl px-3 py-3 text-left transition-colors",
                selectedConversationId === conversation.id
                  ? "bg-white/10 text-[var(--text-strong)]"
                  : "text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-main)]"
              )}
            >
              <div className="truncate text-sm font-medium">{conversation.title}</div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-soft)]">
                {conversation.summary || "No summary yet"}
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
