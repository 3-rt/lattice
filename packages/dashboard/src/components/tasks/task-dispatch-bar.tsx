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
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Describe a task for your agents..."
        className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-lattice-600 focus:outline-none focus:ring-1 focus:ring-lattice-600"
      />
      <select
        value={selectedAgent}
        onChange={(e) => setSelectedAgent(e.target.value)}
        className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300 focus:border-lattice-600 focus:outline-none"
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
        className="flex items-center gap-2 rounded-md bg-lattice-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-lattice-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Send className="h-4 w-4" />
        Send
      </button>
    </form>
  );
}
