import type {
  LatticeAdapter,
  AgentCard,
  Task,
  TaskStatusUpdate,
  Artifact,
} from "@lattice/adapter-base";

export interface OpenClawConfig {
  gatewayUrl: string;
  gatewayToken: string;
}

const AGENT_CARD: AgentCard = {
  name: "openclaw",
  description:
    "OpenClaw — multi-tool AI agent for messaging, scheduling, and web tasks",
  url: "http://localhost:3100/a2a/agents/openclaw",
  version: "1.0.0",
  capabilities: { streaming: false, pushNotifications: false },
  skills: [
    {
      id: "messaging",
      name: "Messaging",
      description: "Send messages via Telegram, Slack, etc.",
      tags: ["message", "send", "notify", "telegram", "slack"],
    },
    {
      id: "scheduling",
      name: "Scheduling",
      description: "Schedule tasks and reminders",
      tags: ["schedule", "reminder", "calendar", "timer"],
    },
    {
      id: "web-browsing",
      name: "Web Browsing",
      description: "Browse and extract web content",
      tags: ["browse", "web", "search", "scrape", "fetch"],
    },
    {
      id: "file-management",
      name: "File Management",
      description: "Manage files and documents",
      tags: ["file", "document", "upload", "download"],
    },
  ],
  authentication: { schemes: ["bearer"] },
};

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

function taskHistoryToChatMessages(task: Task): ChatMessage[] {
  return task.history.map((msg) => ({
    role: msg.role === "agent" ? ("assistant" as const) : ("user" as const),
    content: msg.parts
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text!)
      .join("\n"),
  }));
}

export function createOpenClawAdapter(config: OpenClawConfig): LatticeAdapter {
  const { gatewayUrl, gatewayToken } = config;

  const adapter: LatticeAdapter = {
    getAgentCard(): AgentCard {
      return AGENT_CARD;
    },

    async executeTask(task: Task): Promise<Task> {
      const messages = taskHistoryToChatMessages(task);

      let responseText: string;
      try {
        const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${gatewayToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messages }),
        });

        if (!response.ok) {
          return {
            ...task,
            status: "failed",
            artifacts: [
              {
                name: "error",
                parts: [
                  {
                    type: "text",
                    text: `OpenClaw gateway error: ${response.status} ${response.statusText}`,
                  },
                ],
              },
            ],
          };
        }

        const data = (await response.json()) as {
          choices: Array<{ message: { content: string } }>;
        };
        responseText = data.choices?.[0]?.message?.content ?? "";
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
        parts: [{ type: "text", text: responseText }],
      };

      return { ...task, status: "completed", artifacts: [artifact] };
    },

    async *streamTask(task: Task): AsyncGenerator<TaskStatusUpdate> {
      const result = await adapter.executeTask(task);
      yield {
        taskId: task.id,
        status: result.status,
        message: result.artifacts[0]?.parts[0]?.text,
        artifacts: result.artifacts,
      };
    },

    async healthCheck(): Promise<boolean> {
      try {
        const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${gatewayToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] }),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };

  return adapter;
}
