export interface ContextMessage {
  role: string;
  content: string;
  agentName?: string | null;
}

const DEFAULT_RECENT_MESSAGES = 10;
const DEFAULT_SUMMARY_BULLETS = 12;
const MAX_BULLET_CHARS = 180;

function cleanContent(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

function labelFor(message: ContextMessage): string {
  if (message.role === "user") return "User";
  if (message.role === "system") return "System";
  if (message.agentName) return titleCase(message.agentName);
  return message.role === "agent" ? "Agent" : titleCase(message.role);
}

function titleCase(value: string): string {
  if (value.toLowerCase() === "openclaw") return "OpenClaw";
  if (value.toLowerCase() === "codex") return "Codex";
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1).trimEnd()}…`;
}

export function buildConversationPrompt(input: {
  summary: string;
  recentMessages: ContextMessage[];
  currentRequest: string;
  maxRecentMessages?: number;
}): string {
  const maxRecentMessages = input.maxRecentMessages ?? DEFAULT_RECENT_MESSAGES;
  const recentMessages = input.recentMessages
    .map((message) => ({ ...message, content: cleanContent(message.content) }))
    .filter((message) => message.content)
    .slice(-maxRecentMessages);

  const summary = input.summary.trim() || "No prior summary.";
  const recent = recentMessages.length > 0
    ? recentMessages.map((message) => `${labelFor(message)}: ${message.content}`).join("\n")
    : "No recent conversation.";

  return [
    "Conversation context:",
    summary,
    "",
    "Recent conversation:",
    recent,
    "",
    "Current request:",
    input.currentRequest.trim(),
  ].join("\n");
}

export function summarizeConversation(input: {
  existingSummary: string;
  olderMessages: ContextMessage[];
  maxBullets?: number;
}): string {
  const existingBullets = input.existingSummary
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const remaining = input.maxBullets ?? DEFAULT_SUMMARY_BULLETS;
  const newBullets = input.olderMessages
    .map((message) => ({ ...message, content: cleanContent(message.content) }))
    .filter((message) => message.content)
    .slice(0, remaining)
    .map((message) => `- ${labelFor(message)}: ${truncate(message.content, MAX_BULLET_CHARS)}`);

  return [...existingBullets, ...newBullets].join("\n");
}
