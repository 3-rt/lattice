import { execFile } from "child_process";
import type {
  LatticeAdapter,
  AgentCard,
  Task,
  TaskStatusUpdate,
  Artifact,
  HealthCheckResult,
} from "@lattice/adapter-base";

export interface CodexConfig {
  codexPath: string;
}

const AGENT_CARD: AgentCard = {
  name: "codex",
  description: "Codex — OpenAI's coding agent via CLI",
  url: "http://localhost:3100/a2a/agents/codex",
  version: "1.0.0",
  capabilities: { streaming: false, pushNotifications: false },
  skills: [
    {
      id: "code-generation",
      name: "Code Generation",
      description: "Generate code from descriptions",
      tags: ["code", "generate", "write", "create"],
    },
    {
      id: "code-review",
      name: "Code Review",
      description: "Review code for issues",
      tags: ["review", "audit", "check"],
    },
    {
      id: "terminal-commands",
      name: "Terminal Commands",
      description: "Run terminal commands",
      tags: ["terminal", "command", "shell", "run"],
    },
  ],
  authentication: { schemes: [] },
};

function buildPrompt(task: Task): string {
  return task.history
    .filter((m) => m.role === "user")
    .flatMap((m) => m.parts)
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text!)
    .join("\n\n");
}

function runCodex(
  codexPath: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      codexPath,
      args,
      { timeout: 5 * 60 * 1000 },
      (err, stdout, stderr) => {
        if (err) {
          reject({ error: err, stdout: stdout ?? "", stderr: stderr ?? "" });
        } else {
          resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
        }
      }
    );
  });
}

export function createCodexAdapter(config: CodexConfig): LatticeAdapter {
  const { codexPath } = config;

  return {
    getAgentCard(): AgentCard {
      return AGENT_CARD;
    },

    async executeTask(task: Task): Promise<Task> {
      const prompt = buildPrompt(task);

      try {
        const { stdout } = await runCodex(codexPath, ["exec", prompt]);
        const artifact: Artifact = {
          name: "result",
          parts: [{ type: "text", text: stdout.trim() }],
        };
        return { ...task, status: "completed", artifacts: [artifact] };
      } catch (rejection) {
        const { stderr } = rejection as {
          error: Error;
          stdout: string;
          stderr: string;
        };
        return {
          ...task,
          status: "failed",
          artifacts: [
            {
              name: "error",
              parts: [
                {
                  type: "text",
                  text: stderr || "Codex execution failed",
                },
              ],
            },
          ],
        };
      }
    },

    async *streamTask(task: Task): AsyncGenerator<TaskStatusUpdate> {
      const result = await this.executeTask(task);
      yield {
        taskId: task.id,
        status: result.status,
        message: result.artifacts[0]?.parts[0]?.text,
        artifacts: result.artifacts,
      };
    },

    async healthCheck(): Promise<HealthCheckResult> {
      try {
        await runCodex(codexPath, ["--version"]);
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const reason = /ENOENT/.test(msg)
          ? "Codex CLI not found. Install it from: https://github.com/openai/codex"
          : `Codex CLI error: ${msg}`;
        return { ok: false, reason };
      }
    },
  };
}
