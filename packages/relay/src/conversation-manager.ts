import { v4 as uuidv4 } from "uuid";
import type { Artifact, Task } from "@lattice/adapter-base";
import type { ConversationMessageRow, ConversationRow, LatticeDB } from "./db.js";
import type { LatticeTaskManager } from "./task-manager.js";
import { buildConversationPrompt, summarizeConversation, type ContextMessage } from "./conversation-context.js";

const RECENT_MESSAGE_LIMIT = 10;

export interface Conversation {
  id: string;
  title: string;
  summary: string;
  openclawSessionKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  agentName?: string;
  taskId?: string;
  createdAt: string;
}

export interface ConversationDispatchResult {
  userMessage: ConversationMessage;
  task: Task;
  agentMessage?: ConversationMessage;
}

export interface LatticeConversationManager {
  createConversation(title?: string): Conversation;
  listConversations(): Conversation[];
  getConversation(id: string): Conversation | undefined;
  listMessages(conversationId: string): ConversationMessage[];
  dispatchMessage(input: {
    conversationId: string;
    text: string;
    agent?: string;
    execute?: boolean;
  }): Promise<ConversationDispatchResult>;
}

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    openclawSessionKey: row.openclaw_session_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: ConversationMessageRow): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    agentName: row.agent_name ?? undefined,
    taskId: row.task_id ?? undefined,
    createdAt: row.created_at,
  };
}

function toContextMessage(message: ConversationMessage): ContextMessage {
  return {
    role: message.role,
    content: message.content,
    agentName: message.agentName,
  };
}

function artifactText(artifacts: Artifact[]): string {
  return artifacts
    .flatMap((artifact) => artifact.parts)
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text!.trim())
    .filter(Boolean)
    .join("\n");
}

function defaultTitle(title?: string): string {
  const clean = title?.trim();
  return clean || "New conversation";
}

export function createConversationManager(
  db: LatticeDB,
  taskManager: LatticeTaskManager
): LatticeConversationManager {
  return {
    createConversation(title?: string): Conversation {
      const id = uuidv4();
      const openclawSessionKey = `lattice-conv-${id}`;
      db.insertConversation(id, defaultTitle(title), openclawSessionKey);
      return rowToConversation(db.getConversation(id)!);
    },

    listConversations(): Conversation[] {
      return db.listConversations().map(rowToConversation);
    },

    getConversation(id: string): Conversation | undefined {
      const row = db.getConversation(id);
      return row ? rowToConversation(row) : undefined;
    },

    listMessages(conversationId: string): ConversationMessage[] {
      return db.listConversationMessages(conversationId).map(rowToMessage);
    },

    async dispatchMessage(input): Promise<ConversationDispatchResult> {
      const conversation = this.getConversation(input.conversationId);
      if (!conversation) throw new Error(`Conversation "${input.conversationId}" not found`);

      const text = input.text.trim();
      if (!text) throw new Error("text is required");

      const userMessageId = uuidv4();
      db.insertConversationMessage({
        id: userMessageId,
        conversationId: conversation.id,
        role: "user",
        content: text,
      });
      const userMessage = rowToMessage(
        db.listConversationMessages(conversation.id).find((message) => message.id === userMessageId)!
      );

      const allMessages = this.listMessages(conversation.id);
      const previousMessages = allMessages.filter((message) => message.id !== userMessage.id);
      const olderMessages = previousMessages.slice(0, Math.max(previousMessages.length - RECENT_MESSAGE_LIMIT, 0));
      const recentMessages = previousMessages.slice(-RECENT_MESSAGE_LIMIT);
      const summary = olderMessages.length > 0
        ? summarizeConversation({
          existingSummary: conversation.summary,
          olderMessages: olderMessages.map(toContextMessage),
        })
        : conversation.summary;

      if (summary !== conversation.summary) {
        db.updateConversation(conversation.id, { summary });
      }

      const prompt = buildConversationPrompt({
        summary,
        recentMessages: recentMessages.map(toContextMessage),
        currentRequest: text,
      });

      const task = await taskManager.createTask(prompt, {
        explicitAgent: input.agent,
        conversationId: conversation.id,
        openclawSessionKey: conversation.openclawSessionKey,
      });

      if (input.execute === false) {
        return { userMessage, task };
      }

      const resultTask = await taskManager.executeTask(task.id);
      const output = artifactText(resultTask.artifacts) || (resultTask.status === "failed" ? "Task failed." : "");
      const agentName = resultTask.metadata.assignedAgent || input.agent || "agent";
      const agentMessageId = uuidv4();
      db.insertConversationMessage({
        id: agentMessageId,
        conversationId: conversation.id,
        role: "agent",
        content: output,
        agentName,
        taskId: resultTask.id,
      });
      const agentMessage = rowToMessage(
        db.listConversationMessages(conversation.id).find((message) => message.id === agentMessageId)!
      );

      return { userMessage, task: resultTask, agentMessage };
    },
  };
}
