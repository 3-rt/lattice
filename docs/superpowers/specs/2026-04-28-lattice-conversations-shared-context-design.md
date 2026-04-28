# Lattice Conversations With Shared Agent Context Design

## Goal

Add a conversation layer to Lattice so a user can work iteratively in one thread while still dispatching each turn to Auto, Claude Code, Codex, or OpenClaw. Each agent should receive the relevant prior context from the thread, and OpenClaw should also get a stable session key so dashboard work has continuity closer to channel-originated Discord or Telegram work.

This solves the current task-isolation problem where dashboard dispatches create one-off tasks with no memory of previous requests, previous failures, selected tools, or identity hints.

## Non-Goals

- Replace the existing task system.
- Add authentication or true multi-user identity.
- Build full integration credential management for Google, Discord, Slack, or Telegram.
- Use an LLM to summarize conversations in the first implementation.
- Change workflow execution semantics.

## Current State

Lattice is task-centric:

- `tasks` stores one prompt history and one execution result.
- `POST /api/tasks` creates and optionally executes a single task.
- Claude Code and Codex build prompts from task history text.
- OpenClaw builds a prompt from task history text and uses `lattice-<taskId>` as its session key.
- The dashboard dispatch bar sends only `{ text, agent, execute: true }`.

This means each dashboard dispatch is isolated. OpenClaw channel sessions can carry origin/session context, but Lattice dashboard tasks do not.

## Recommended Approach

Add conversations beside tasks. Conversations group related user turns and agent outputs, while tasks remain the execution unit used for routing, status, metrics, audit history, and workflows.

For each conversation turn, Lattice will build a shared context prompt from:

- a rolling conversation summary
- recent conversation messages
- the current user request

Claude Code, Codex, and OpenClaw all receive this context in their task prompt. OpenClaw additionally receives a stable conversation session key so its gateway session can retain continuity across turns.

## Data Model

### `conversations`

Fields:

- `id TEXT PRIMARY KEY`
- `title TEXT NOT NULL`
- `summary TEXT NOT NULL DEFAULT ''`
- `openclaw_session_key TEXT NOT NULL`
- `created_at TEXT NOT NULL DEFAULT (datetime('now'))`
- `updated_at TEXT NOT NULL DEFAULT (datetime('now'))`

### `conversation_messages`

Fields:

- `id TEXT PRIMARY KEY`
- `conversation_id TEXT NOT NULL REFERENCES conversations(id)`
- `role TEXT NOT NULL`
- `agent_name TEXT`
- `task_id TEXT`
- `content TEXT NOT NULL`
- `created_at TEXT NOT NULL DEFAULT (datetime('now'))`

Roles:

- `user`
- `agent`
- `system`

### `tasks`

Add:

- `conversation_id TEXT`

This keeps existing task APIs compatible while allowing task rows to be grouped by conversation.

## API

### List Conversations

`GET /api/conversations`

Returns conversation summaries ordered by most recently updated.

### Create Conversation

`POST /api/conversations`

Body:

```json
{
  "title": "OpenClaw debugging"
}
```

If no title is provided, the relay creates a plain title such as `New conversation`.

### Get Conversation

`GET /api/conversations/:id`

Returns the conversation row plus recent metadata.

### List Messages

`GET /api/conversations/:id/messages`

Returns messages in chronological order.

### Dispatch Conversation Message

`POST /api/conversations/:id/messages`

Body:

```json
{
  "text": "Check why Google Drive auth failed",
  "agent": "openclaw",
  "execute": true
}
```

Behavior:

1. Validate conversation exists.
2. Store the user message.
3. Build shared context.
4. Create a task linked to the conversation.
5. Execute the task when `execute !== false`.
6. Store the agent result or error as a conversation message.
7. Return the created message, task, and optional agent response message.

## Context Builder

The relay owns prompt assembly so all adapters receive consistent context.

Prompt shape:

```text
Conversation context:
<summary, or "No prior summary.">

Recent conversation:
User: ...
OpenClaw: ...
Codex: ...

Current request:
<new user text>
```

Rules:

- Include the rolling summary when present.
- Include a bounded number of recent messages, initially 8-10.
- Exclude empty content.
- Label agent messages with the agent name when known.
- Keep the current request separate so routers and agents can distinguish immediate intent from context.

## Rolling Summary

The first implementation uses deterministic summarization instead of an LLM.

When a conversation grows beyond the recent-message window:

- Older messages are condensed into short bullets.
- Bullets preserve user goals, agent names, task outcomes, and notable errors.
- The summary is updated in `conversations.summary`.

Example:

```text
- User is debugging why OpenClaw works from Discord but not from Lattice.
- OpenClaw reported "No auth for drive basil.liu18@gmail.com".
- User wants Lattice dashboard turns to preserve context across Claude Code, Codex, and OpenClaw.
```

This avoids introducing a summarizer dependency on any one agent. A later version can replace this with agent-generated summaries.

## Task Execution Flow

1. Dashboard posts a message to a conversation.
2. Relay inserts a `conversation_messages` row for the user turn.
3. Relay calls the context builder.
4. Relay creates a task with:
   - linked `conversation_id`
   - task history containing the context-wrapped prompt
   - explicit agent preference when provided
5. Existing routing and task execution run normally.
6. Relay extracts output or translated error text from the result task.
7. Relay inserts an `agent` conversation message with `agent_name` and `task_id`.
8. Dashboard displays the conversation thread and task linkage.

## OpenClaw Session Binding

For conversation-linked OpenClaw tasks, use the conversation's stable `openclaw_session_key` instead of `lattice-<taskId>`.

Example:

```text
lattice-conv-<conversationId>
```

This gives OpenClaw a stable gateway chat session for follow-ups such as:

- "why did that fail?"
- "try again with the same account"
- "send it to the same target"

Claude Code and Codex remain one-shot CLI executions, but they receive the same shared conversation prompt.

## Dashboard UX

Add a `Conversations` page.

Layout:

- Left column: conversation list.
- Main panel: chronological thread.
- Composer: text input plus agent picker.
- Agent picker options: `Auto`, `Claude Code`, `Codex`, `OpenClaw`.

The existing `TaskDispatchBar` remains for one-off work. The Conversations page becomes the recommended place for debugging, iterative setup, and cross-agent collaboration.

Tasks UI:

- Show conversation linkage when `metadata.conversationId` exists.
- Preserve current task expansion and routing details.

Navigation:

- Add `Conversations` to the sidebar with plainspoken copy.

## Events And Realtime Updates

Initial implementation can use request/response refresh for conversation messages.

Optional SSE additions:

- `conversation:created`
- `conversation:message`
- `conversation:updated`

These are useful but not required for the first working version because task SSE already covers execution state.

## Error Handling

- Failed agent executions become agent conversation messages with the friendly translated error text.
- Raw task details remain visible in Tasks for debugging.
- Missing conversations return `404`.
- Empty user messages return `400`.
- If context building fails, the relay returns `500` and does not execute the task.
- If OpenClaw session reuse fails, the failure is stored in the conversation like any other agent error.

## Backward Compatibility

- Existing `POST /api/tasks` behavior remains unchanged.
- Existing dashboard dispatch remains unchanged.
- Existing workflow engine behavior remains unchanged.
- Existing tasks without `conversation_id` continue to render normally.

## Testing Plan

Relay:

- DB tests for creating/listing conversations.
- DB tests for inserting/listing messages.
- DB tests for linking tasks to conversations.
- Context builder tests for summary plus recent messages.
- API tests for conversation CRUD and message dispatch.
- Task manager tests for conversation-linked execution.

OpenClaw adapter:

- Test conversation metadata selects stable session key.
- Test tasks without conversation metadata keep `lattice-<taskId>`.

Dashboard:

- API client tests for conversation endpoints.
- Store tests for conversation/message state if a store is added.
- Component tests for conversation list, thread rendering, and composer dispatch.

Regression:

- Existing task tests still pass.
- Existing workflow tests still pass.
- Existing dashboard build passes.

## Implementation Notes

- Prefer additive changes to avoid destabilizing workflow and task history.
- Keep conversation management in a focused relay module instead of expanding `task-manager.ts` too far.
- Add conversation metadata to the shared `Task` type so adapters can read it without parsing prompt text.
- Keep deterministic summary logic small and easily replaceable.
- Avoid putting secrets or OAuth credentials into conversation summaries.

