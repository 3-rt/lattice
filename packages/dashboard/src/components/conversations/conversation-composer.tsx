import { useState } from "react";
import { Send } from "lucide-react";

interface ConversationComposerProps {
  agents: Array<{ name: string; status: string }>;
  disabled: boolean;
  sending: boolean;
  onSend: (text: string, agent?: string) => void | Promise<void>;
}

export function ConversationComposer({
  agents,
  disabled,
  sending,
  onSend,
}: ConversationComposerProps) {
  const [text, setText] = useState("");
  const [agent, setAgent] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || disabled || sending) return;
    await onSend(clean, agent || undefined);
    setText("");
  }

  return (
    <form onSubmit={handleSubmit} className="surface-panel space-y-3 p-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ask a follow-up or hand the next step to an agent..."
          className="ui-input flex-1"
          disabled={disabled || sending}
        />
        <select
          value={agent}
          onChange={(event) => setAgent(event.target.value)}
          className="ui-select lg:w-48"
          disabled={disabled || sending}
        >
          <option value="">Auto</option>
          {agents
            .filter((item) => item.status === "online")
            .map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
        </select>
        <button
          type="submit"
          disabled={disabled || sending || !text.trim()}
          className="ui-button-primary"
        >
          <Send className="h-4 w-4" />
          {sending ? "Sending..." : "Send message"}
        </button>
      </div>
      <p className="text-xs text-[var(--text-soft)]">
        Each turn includes the thread summary and recent messages, then routes through the selected agent.
      </p>
    </form>
  );
}
