import { describe, expect, it } from "vitest";
import { buildConversationPrompt, summarizeConversation } from "../src/conversation-context.js";

describe("conversation context", () => {
  describe("buildConversationPrompt", () => {
    it("includes summary, recent messages, and current request", () => {
      const prompt = buildConversationPrompt({
        summary: "- User is debugging OpenClaw auth.",
        recentMessages: [
          { role: "user", content: "Why did Drive fail?" },
          { role: "agent", agentName: "openclaw", content: "No auth for drive basil@example.com." },
        ],
        currentRequest: "Try checking auth status.",
      });

      expect(prompt).toContain("Conversation context:");
      expect(prompt).toContain("- User is debugging OpenClaw auth.");
      expect(prompt).toContain("User: Why did Drive fail?");
      expect(prompt).toContain("OpenClaw: No auth for drive basil@example.com.");
      expect(prompt).toContain("Current request:\nTry checking auth status.");
    });

    it("uses a plain fallback when there is no summary or recent context", () => {
      const prompt = buildConversationPrompt({
        summary: "",
        recentMessages: [],
        currentRequest: "Say hello.",
      });

      expect(prompt).toContain("No prior summary.");
      expect(prompt).toContain("No recent conversation.");
    });

    it("bounds recent messages and omits empty content", () => {
      const prompt = buildConversationPrompt({
        summary: "",
        maxRecentMessages: 2,
        recentMessages: [
          { role: "user", content: "first" },
          { role: "agent", agentName: "codex", content: "   " },
          { role: "user", content: "second" },
          { role: "agent", agentName: "openclaw", content: "third" },
        ],
        currentRequest: "fourth",
      });

      expect(prompt).not.toContain("first");
      expect(prompt).not.toContain("Codex:");
      expect(prompt).toContain("User: second");
      expect(prompt).toContain("OpenClaw: third");
    });
  });

  describe("summarizeConversation", () => {
    it("creates deterministic bullets from older messages", () => {
      const summary = summarizeConversation({
        existingSummary: "",
        olderMessages: [
          { role: "user", content: "I am trying to make Lattice remember OpenClaw debugging context." },
          { role: "agent", agentName: "openclaw", content: "No auth for drive basil@example.com." },
        ],
      });

      expect(summary).toContain("- User: I am trying to make Lattice remember OpenClaw debugging context.");
      expect(summary).toContain("- OpenClaw: No auth for drive basil@example.com.");
    });

    it("preserves an existing summary and limits new bullets", () => {
      const summary = summarizeConversation({
        existingSummary: "- Existing context.",
        maxBullets: 1,
        olderMessages: [
          { role: "user", content: "first" },
          { role: "agent", agentName: "codex", content: "second" },
        ],
      });

      expect(summary).toContain("- Existing context.");
      expect(summary).toContain("- User: first");
      expect(summary).not.toContain("second");
    });
  });
});
