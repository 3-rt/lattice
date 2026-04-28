import { Bot, UserRound } from "lucide-react";
import { clsx } from "clsx";
import type { ConversationMessageInfo } from "../../lib/api.ts";

interface ConversationThreadProps {
  messages: ConversationMessageInfo[];
}

function agentLabel(message: ConversationMessageInfo): string {
  if (message.role === "user") return "You";
  if (!message.agentName) return "Agent";
  if (message.agentName === "openclaw") return "OpenClaw";
  if (message.agentName === "claude-code") return "Claude Code";
  if (message.agentName === "codex") return "Codex";
  return message.agentName;
}

export function ConversationThread({ messages }: ConversationThreadProps) {
  if (messages.length === 0) {
    return (
      <div className="surface-panel flex min-h-[24rem] items-center justify-center p-8 text-center">
        <div className="max-w-sm">
          <p className="section-label">Ready for context</p>
          <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[var(--text-strong)]">
            Start with the thing you want the agents to remember.
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
            Follow-ups in this thread will include the recent exchange and a compact summary.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="surface-panel min-h-0 flex-1 overflow-y-auto p-5">
      <div className="space-y-4">
        {messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <article
              key={message.id}
              className={clsx(
                "flex gap-3",
                isUser ? "justify-end" : "justify-start"
              )}
            >
              {!isUser && (
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-200/15 bg-cyan-200/10 text-cyan-100">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div
                className={clsx(
                  "max-w-[min(42rem,80%)] rounded-3xl px-4 py-3",
                  isUser
                    ? "bg-slate-100 text-slate-950"
                    : "surface-muted text-[var(--text-main)]"
                )}
              >
                <div className={clsx("mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em]", isUser ? "text-slate-500" : "text-[var(--text-soft)]")}>
                  {agentLabel(message)}
                </div>
                <div className="whitespace-pre-wrap text-sm leading-6">{message.content}</div>
              </div>
              {isUser && (
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-100/20 bg-slate-100/10 text-slate-100">
                  <UserRound className="h-4 w-4" />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
