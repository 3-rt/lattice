// packages/adapters/claude-code/src/claude-code-adapter.ts
import { spawn } from "node:child_process";
import type {
  LatticeAdapter,
  AgentCard,
  Task,
  TaskStatusUpdate,
  Artifact,
  HealthCheckResult,
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

/** Resolve the claude CLI binary path. Prefers npx-resolved local install. */
function claudeBin(): string {
  return process.env.CLAUDE_BIN ?? "claude";
}

interface ClaudeJsonResult {
  result?: string;
  is_error?: boolean;
  error?: string;
  cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
}

/**
 * Run `claude --print --output-format json` and return the parsed result.
 */
function runClaude(prompt: string): Promise<ClaudeJsonResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      claudeBin(),
      [
        "--print",
        "--output-format",
        "json",
        "--no-session-persistence",
        "--max-turns",
        "10",
        "--bare",
        prompt,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => errChunks.push(d));

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      const stdout = Buffer.concat(chunks).toString("utf-8").trim();
      const stderr = Buffer.concat(errChunks).toString("utf-8").trim();

      if (code !== 0 && !stdout) {
        reject(new Error(stderr || `claude exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as ClaudeJsonResult);
      } catch {
        // Non-JSON output — treat the raw text as the result
        resolve({ result: stdout });
      }
    });
  });
}

/**
 * Run `claude --print --output-format stream-json` and yield lines.
 */
function spawnClaudeStream(prompt: string): {
  lines: AsyncGenerator<Record<string, unknown>>;
  kill: () => void;
} {
  const child = spawn(
    claudeBin(),
    [
      "--print",
      "--output-format",
      "stream-json",
      "--no-session-persistence",
      "--max-turns",
      "10",
      "--bare",
      prompt,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  async function* lines(): AsyncGenerator<Record<string, unknown>> {
    let buf = "";
    for await (const chunk of child.stdout) {
      buf += chunk.toString("utf-8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line) as Record<string, unknown>;
        } catch {
          // skip non-JSON lines
        }
      }
    }
    // Flush remainder
    if (buf.trim()) {
      try {
        yield JSON.parse(buf.trim()) as Record<string, unknown>;
      } catch {
        // ignore
      }
    }
  }

  return { lines: lines(), kill: () => child.kill() };
}

export function createClaudeCodeAdapter(): LatticeAdapter {
  return {
    getAgentCard(): AgentCard {
      return { ...AGENT_CARD, skills: [...AGENT_CARD.skills] };
    },

    async executeTask(task: Task): Promise<Task> {
      const prompt = buildPrompt(task);

      let resultText: string;
      try {
        const res = await runClaude(prompt);
        if (res.is_error || res.error) {
          throw new Error(
            res.error ?? res.result ?? "Claude returned an error",
          );
        }
        resultText = res.result ?? "";
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
        const { lines } = spawnClaudeStream(prompt);

        for await (const event of lines) {
          // stream-json emits objects with a "type" field
          if (event.type === "assistant" && typeof event.message === "object") {
            const msg = event.message as Record<string, unknown>;
            const content = msg.content as
              | Array<Record<string, unknown>>
              | undefined;
            const text = content?.find((c) => c.type === "text")?.text as
              | string
              | undefined;
            if (text) {
              yield { taskId: task.id, status: "working", message: text };
            }
          } else if (event.type === "result") {
            const resultText =
              typeof event.result === "string" ? event.result : "";
            yield {
              taskId: task.id,
              status: "completed",
              artifacts: [
                {
                  name: "result",
                  parts: [{ type: "text", text: resultText }],
                },
              ],
            };
            return;
          }
        }

        // If we got here without a result event, yield completed with empty result
        yield {
          taskId: task.id,
          status: "completed",
          artifacts: [
            { name: "result", parts: [{ type: "text", text: "" }] },
          ],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        yield { taskId: task.id, status: "failed", message: errorMsg };
      }
    },

    async healthCheck(): Promise<HealthCheckResult> {
      // First check the binary exists
      const binExists = await new Promise<boolean>((resolve) => {
        const child = spawn(claudeBin(), ["--version"], {
          stdio: ["ignore", "pipe", "ignore"],
        });
        child.on("error", () => resolve(false));
        child.on("close", (code) => resolve(code === 0));
      });

      if (!binExists) {
        return { ok: false, reason: "Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code" };
      }

      // Verify auth by running a minimal prompt
      try {
        const res = await runClaude("say ok");
        if (res.is_error) {
          const msg = res.result ?? res.error ?? "unknown error";
          if (/not logged in|login|authenticate/i.test(msg)) {
            return { ok: false, reason: "Claude CLI is not logged in. Run 'claude' and complete the login flow." };
          }
          return { ok: false, reason: `Claude CLI error: ${msg}` };
        }
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, reason: `Claude CLI error: ${msg}` };
      }
    },
  };
}
