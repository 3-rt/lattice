// packages/adapters/claude-code/src/claude-code-adapter.ts
import { query } from "@anthropic-ai/claude-code";
import type {
  LatticeAdapter,
  AgentCard,
  Task,
  TaskStatusUpdate,
  Artifact,
} from "@lattice/adapter-base";

const AGENT_CARD: AgentCard = {
  name: "claude-code",
  description: "Claude Code — AI coding assistant by Anthropic",
  url: "http://localhost:3100/a2a/agents/claude-code",
  version: "1.0.0",
  capabilities: { streaming: true, pushNotifications: false },
  skills: [
    {
      id: "code-generation",
      name: "Code Generation",
      description: "Generate code from descriptions",
      tags: ["code", "generate", "write", "create", "implement"],
    },
    {
      id: "code-review",
      name: "Code Review",
      description: "Review code for issues",
      tags: ["review", "audit", "check"],
    },
    {
      id: "debugging",
      name: "Debugging",
      description: "Find and fix bugs",
      tags: ["debug", "fix", "bug", "error"],
    },
    {
      id: "refactoring",
      name: "Refactoring",
      description: "Refactor and improve code",
      tags: ["refactor", "improve", "clean", "optimize"],
    },
    {
      id: "git-operations",
      name: "Git Operations",
      description: "Git commands and workflows",
      tags: ["git", "commit", "branch", "merge"],
    },
  ],
  authentication: { schemes: [] },
};

function buildPrompt(task: Task): string {
  const parts = task.history
    .filter((m) => m.role === "user")
    .flatMap((m) => m.parts)
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text!);
  return parts.join("\n\n");
}

function extractResultText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>;
    if (msg.type === "result" && typeof msg.result === "string") {
      return msg.result;
    }
  }
  return "";
}

export function createClaudeCodeAdapter(): LatticeAdapter {
  return {
    getAgentCard(): AgentCard {
      return AGENT_CARD;
    },

    async executeTask(task: Task): Promise<Task> {
      const prompt = buildPrompt(task);

      let resultText: string;
      try {
        const messages = await query({
          prompt,
          options: { maxTurns: 10 },
        });
        resultText = extractResultText(messages);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          ...task,
          status: "failed",
          artifacts: [
            { name: "error", parts: [{ type: "text", text: errorMsg }] },
          ],
        };
      }

      const artifact: Artifact = {
        name: "result",
        parts: [{ type: "text", text: resultText }],
      };

      return {
        ...task,
        status: "completed",
        artifacts: [artifact],
      };
    },

    async *streamTask(task: Task): AsyncGenerator<TaskStatusUpdate> {
      const prompt = buildPrompt(task);

      try {
        const messages = await query({
          prompt,
          options: { maxTurns: 10 },
        });

        // Yield progress for assistant messages
        for (const msg of messages) {
          const m = msg as Record<string, unknown>;
          if (m.type === "assistant") {
            const content = (m.message as Record<string, unknown>)
              ?.content as Array<Record<string, unknown>> | undefined;
            const text = content?.find((c) => c.type === "text")?.text as
              | string
              | undefined;
            if (text) {
              yield { taskId: task.id, status: "working", message: text };
            }
          }
        }

        // Yield final completion
        const resultText = extractResultText(messages);
        yield {
          taskId: task.id,
          status: "completed",
          artifacts: [
            { name: "result", parts: [{ type: "text", text: resultText }] },
          ],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        yield { taskId: task.id, status: "failed", message: errorMsg };
      }
    },

    async healthCheck(): Promise<boolean> {
      return true;
    },
  };
}
