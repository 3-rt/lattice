import { useState } from "react";
import { Send } from "lucide-react";
import { useLatticeStore } from "../../store/lattice-store.ts";
import { createTask } from "../../lib/api.ts";

export function TaskDispatchBar() {
  const agents = useLatticeStore((s) => s.agents);
  const [text, setText] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;

    setSending(true);
    try {
      await createTask(text.trim(), selectedAgent || undefined);
      setText("");
    } catch (err) {
      console.error("Failed to dispatch task:", err);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="surface-panel space-y-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-label">Dispatch task</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Describe the outcome you need. Route automatically or target a ready
            agent directly.
          </p>
        </div>
        <div className="status-pill whitespace-nowrap">
          <span className="status-dot bg-[var(--accent-primary)]" />
          <span>{agents.filter((a) => a.status === "online").length} online</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe a task for your agents..."
          className="ui-input flex-1"
        />
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="ui-select xl:w-56"
        >
          <option value="">Auto-route</option>
          {agents
            .filter((a) => a.status === "online")
            .map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
        </select>
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="ui-button-primary xl:self-stretch"
        >
          <Send className="h-4 w-4" />
          {sending ? "Dispatching..." : "Dispatch task"}
        </button>
      </div>
    </form>
  );
}
