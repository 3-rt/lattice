# Lattice Conversations Shared Context Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Lattice conversations so one thread can dispatch turns to Auto, Claude Code, Codex, or OpenClaw while preserving shared context and OpenClaw session continuity.

**Architecture:** Add conversation persistence beside the existing task model, not instead of it. Conversation dispatch builds a context-wrapped task prompt from rolling summary plus recent messages, links the task to the conversation, executes through the existing task manager/router, then appends the agent result back to the conversation. OpenClaw reads conversation metadata from `Task.metadata` to reuse a stable gateway session key.

**Tech Stack:** TypeScript, Node/Express, better-sqlite3, React, Vite, Zustand, Vitest, React Testing Library patterns already present in the repo.

---

## File Structure

Relay and shared types:

- Modify: `packages/adapters/base/src/types.ts` — add optional conversation metadata to `Task.metadata`.
- Modify: `packages/relay/src/db.ts` — add conversation tables, row types, DB methods, `tasks.conversation_id`, and task filtering support.
- Create: `packages/relay/src/conversation-context.ts` — pure context builder and deterministic summary helpers.
- Create: `packages/relay/src/conversation-manager.ts` — orchestration for conversations, messages, context-wrapped task creation, task execution, and agent message persistence.
- Modify: `packages/relay/src/task-manager.ts` — accept optional conversation execution metadata when creating tasks and expose linked task metadata.
- Modify: `packages/relay/src/server.ts` — add conversation REST routes.
- Modify: `packages/relay/src/main.ts` — instantiate conversation manager and pass it into `createApp`.

OpenClaw adapter:

- Modify: `packages/adapters/openclaw/src/openclaw-adapter.ts` — choose `task.metadata.openclawSessionKey` when present, fallback to `lattice-<taskId>`.

Dashboard:

- Modify: `packages/dashboard/src/lib/api.ts` — add conversation types and API methods.
- Create: `packages/dashboard/src/store/conversation-store.ts` — store conversations, messages, selected conversation, loading/error state.
- Create: `packages/dashboard/src/pages/conversations.tsx` — conversation page.
- Create: `packages/dashboard/src/components/conversations/conversation-list.tsx` — list and create/select UI.
- Create: `packages/dashboard/src/components/conversations/conversation-thread.tsx` — message display.
- Create: `packages/dashboard/src/components/conversations/conversation-composer.tsx` — text input and agent picker.
- Modify: `packages/dashboard/src/App.tsx` — route `/conversations`.
- Modify: `packages/dashboard/src/components/layout/sidebar.tsx` — add Conversations nav item.
- Modify: `packages/dashboard/src/components/tasks/task-row.tsx` — show conversation ID when present.
- Modify: `packages/dashboard/src/components/tasks/task-utils.ts` — no required logic change unless needed for display helpers.

Tests:

- Modify: `packages/relay/tests/db.test.ts`
- Create: `packages/relay/tests/conversation-context.test.ts`
- Create: `packages/relay/tests/conversation-manager.test.ts`
- Modify: `packages/relay/tests/server.test.ts`
- Modify: `packages/adapters/openclaw/tests/openclaw-adapter.test.ts`
- Create: `packages/dashboard/src/lib/conversations-api.test.ts`
- Create: `packages/dashboard/src/store/conversation-store.test.ts`
- Create: `packages/dashboard/src/components/conversations/conversations.test.tsx`

---

## Chunk 1: Relay Persistence And Types

### Task 1: Add Conversation Metadata To Shared Types

**Files:**
- Modify: `packages/adapters/base/src/types.ts`

- [ ] **Step 1: Update `Task.metadata` type**

Add optional fields:

```ts
conversationId?: string;
openclawSessionKey?: string;
```

- [ ] **Step 2: Run typecheck through relay build target**

Run: `npm run build --workspace=packages/adapters/base`

Expected: build passes or reports unrelated existing issue. If it fails because no build script behavior is present, continue after checking the type file compiles through downstream tests.

### Task 2: Add Conversation Tables And DB Methods

**Files:**
- Modify: `packages/relay/src/db.ts`
- Test: `packages/relay/tests/db.test.ts`

- [ ] **Step 1: Write failing DB tests**

Add tests for:

- `insertConversation` then `getConversation`
- `listConversations` returns newest updated first
- `insertConversationMessage` then `listConversationMessages`
- `insertTask` can store `conversation_id`

Use the existing `createDatabase(":memory:")` pattern in `db.test.ts`.

- [ ] **Step 2: Run DB tests to verify failure**

Run: `npm run test --workspace=packages/relay -- db.test.ts`

Expected: FAIL because DB methods/tables do not exist yet.

- [ ] **Step 3: Implement DB schema and methods**

Add row/update types:

```ts
export interface ConversationRow {
  id: string;
  title: string;
  summary: string;
  openclaw_session_key: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessageRow {
  id: string;
  conversation_id: string;
  role: string;
  agent_name: string | null;
  task_id: string | null;
  content: string;
  created_at: string;
}
```

Add methods to `LatticeDB`:

```ts
insertConversation(id: string, title: string, openclawSessionKey: string): void;
getConversation(id: string): ConversationRow | undefined;
listConversations(): ConversationRow[];
updateConversation(id: string, update: { title?: string; summary?: string }): void;
insertConversationMessage(input: {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  agentName?: string;
  taskId?: string;
}): void;
listConversationMessages(conversationId: string): ConversationMessageRow[];
```

Add `conversation_id TEXT` to `tasks`. Because SQLite `CREATE TABLE IF NOT EXISTS` will not mutate existing DBs, add a guarded migration after `sqlite.exec(...)`:

```ts
const taskColumns = sqlite.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>;
if (!taskColumns.some((col) => col.name === "conversation_id")) {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN conversation_id TEXT`);
}
```

- [ ] **Step 4: Update `insertTask` and task update plumbing**

Change `insertTask(id, history)` to accept optional `conversationId`.

Update `TaskRow`, `TaskUpdate`, `TaskFilter`, prepared statements, and dynamic task update handling so `conversation_id` can be stored and read.

- [ ] **Step 5: Run DB tests**

Run: `npm run test --workspace=packages/relay -- db.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/base/src/types.ts packages/relay/src/db.ts packages/relay/tests/db.test.ts
git commit -m "feat(relay): persist conversations"
```

---

## Chunk 2: Context Builder And Conversation Manager

### Task 3: Build Shared Conversation Context

**Files:**
- Create: `packages/relay/src/conversation-context.ts`
- Test: `packages/relay/tests/conversation-context.test.ts`

- [ ] **Step 1: Write failing context builder tests**

Cover:

- includes summary and current request
- labels recent user and agent messages
- bounds recent messages
- deterministic summary omits empty content and includes notable errors

- [ ] **Step 2: Run context tests to verify failure**

Run: `npm run test --workspace=packages/relay -- conversation-context.test.ts`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement context builder**

Export:

```ts
export interface ContextMessage {
  role: string;
  content: string;
  agentName?: string | null;
}

export function buildConversationPrompt(input: {
  summary: string;
  recentMessages: ContextMessage[];
  currentRequest: string;
  maxRecentMessages?: number;
}): string;

export function summarizeConversation(input: {
  existingSummary: string;
  olderMessages: ContextMessage[];
  maxBullets?: number;
}): string;
```

Use plain deterministic text formatting. Do not call agents or external services.

- [ ] **Step 4: Run context tests**

Run: `npm run test --workspace=packages/relay -- conversation-context.test.ts`

Expected: PASS.

### Task 4: Add Conversation Manager

**Files:**
- Create: `packages/relay/src/conversation-manager.ts`
- Modify: `packages/relay/src/task-manager.ts`
- Test: `packages/relay/tests/conversation-manager.test.ts`

- [ ] **Step 1: Write failing conversation manager tests**

Use mock adapters/registry patterns from existing relay tests. Cover:

- `createConversation` creates title and OpenClaw session key
- `dispatchMessage` stores user message
- `dispatchMessage` creates a conversation-linked task
- `dispatchMessage` stores agent output with `agent_name` and `task_id`
- failed task output becomes an agent message

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test --workspace=packages/relay -- conversation-manager.test.ts`

Expected: FAIL because manager does not exist.

- [ ] **Step 3: Update task manager create path**

Add an options object without breaking existing callers:

```ts
interface CreateTaskOptions {
  explicitAgent?: string;
  conversationId?: string;
  openclawSessionKey?: string;
}

createTask(text: string, explicitAgentOrOptions?: string | CreateTaskOptions): Promise<Task>;
```

Preserve existing `createTask(text, agent)` behavior.

In `rowToTask`, include:

```ts
conversationId: row.conversation_id ?? undefined,
openclawSessionKey: row.openclaw_session_key ?? undefined
```

If `openclawSessionKey` is not a task column, derive it in conversation manager by putting it into `Task.metadata` before execution, or add a task metadata path that does not persist it separately. Prefer deriving through `conversation_id` and DB lookup in the manager before calling execution.

- [ ] **Step 4: Implement conversation manager**

Expose:

```ts
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
  }): Promise<{ userMessage: ConversationMessage; task: Task; agentMessage?: ConversationMessage }>;
}
```

Use context builder before task creation. Store user message first. Store agent message after execution.

- [ ] **Step 5: Run manager tests**

Run: `npm run test --workspace=packages/relay -- conversation-manager.test.ts`

Expected: PASS.

- [ ] **Step 6: Run task manager tests**

Run: `npm run test --workspace=packages/relay -- task-manager.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/relay/src/conversation-context.ts packages/relay/src/conversation-manager.ts packages/relay/src/task-manager.ts packages/relay/tests/conversation-context.test.ts packages/relay/tests/conversation-manager.test.ts
git commit -m "feat(relay): dispatch conversation messages"
```

---

## Chunk 3: Relay API And OpenClaw Session Binding

### Task 5: Add Conversation Routes

**Files:**
- Modify: `packages/relay/src/server.ts`
- Modify: `packages/relay/src/main.ts`
- Test: `packages/relay/tests/server.test.ts`

- [ ] **Step 1: Write failing API tests**

Cover:

- `POST /api/conversations`
- `GET /api/conversations`
- `GET /api/conversations/:id/messages`
- `POST /api/conversations/:id/messages`
- empty message returns `400`
- missing conversation returns `404`

- [ ] **Step 2: Run server tests to verify failure**

Run: `npm run test --workspace=packages/relay -- server.test.ts`

Expected: FAIL for missing routes.

- [ ] **Step 3: Add optional conversation manager to `createApp` deps**

Extend `ServerDeps`:

```ts
conversationManager?: LatticeConversationManager;
```

Register routes only when present.

- [ ] **Step 4: Instantiate manager in `main.ts`**

Create conversation manager after task manager and pass it to `createApp`.

- [ ] **Step 5: Run server tests**

Run: `npm run test --workspace=packages/relay -- server.test.ts`

Expected: PASS.

### Task 6: Reuse OpenClaw Session Key For Conversation Tasks

**Files:**
- Modify: `packages/adapters/openclaw/src/openclaw-adapter.ts`
- Test: `packages/adapters/openclaw/tests/openclaw-adapter.test.ts`

- [ ] **Step 1: Write failing adapter test**

In the mock gateway test, create a task with:

```ts
metadata: {
  ...existingMetadata,
  conversationId: "conv-1",
  openclawSessionKey: "lattice-conv-conv-1",
}
```

Assert `chat.send` receives `sessionKey: "lattice-conv-conv-1"`.

- [ ] **Step 2: Run OpenClaw tests to verify failure**

Run: `npm run test --workspace=packages/adapters/openclaw`

Expected: FAIL because adapter still uses `lattice-<taskId>`.

- [ ] **Step 3: Implement session key selection**

Change:

```ts
const sessionKey = `lattice-${task.id}`;
```

to:

```ts
const sessionKey = task.metadata.openclawSessionKey ?? `lattice-${task.id}`;
```

- [ ] **Step 4: Run OpenClaw tests**

Run: `npm run test --workspace=packages/adapters/openclaw`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/relay/src/server.ts packages/relay/src/main.ts packages/relay/tests/server.test.ts packages/adapters/openclaw/src/openclaw-adapter.ts packages/adapters/openclaw/tests/openclaw-adapter.test.ts
git commit -m "feat: expose conversation API and OpenClaw sessions"
```

---

## Chunk 4: Dashboard Conversations

### Task 7: Add Dashboard API And Store

**Files:**
- Modify: `packages/dashboard/src/lib/api.ts`
- Create: `packages/dashboard/src/store/conversation-store.ts`
- Test: `packages/dashboard/src/lib/conversations-api.test.ts`
- Test: `packages/dashboard/src/store/conversation-store.test.ts`

- [ ] **Step 1: Write failing API client tests**

Mock `fetch` and verify:

- `fetchConversations`
- `createConversation`
- `fetchConversationMessages`
- `sendConversationMessage`

- [ ] **Step 2: Write failing store tests**

Cover setting conversations, selecting current conversation, adding messages, and storing dispatch results.

- [ ] **Step 3: Run dashboard targeted tests**

Run: `npm run test --workspace=packages/dashboard -- conversations-api.test.ts conversation-store.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement API methods**

Add interfaces:

```ts
export interface ConversationInfo { ... }
export interface ConversationMessageInfo { ... }
export interface ConversationDispatchResult { ... }
```

Add methods matching relay routes.

- [ ] **Step 5: Implement store**

Use Zustand and existing store style. Keep the store focused on conversations/messages, not agents/tasks.

- [ ] **Step 6: Run dashboard targeted tests**

Run: `npm run test --workspace=packages/dashboard -- conversations-api.test.ts conversation-store.test.ts`

Expected: PASS.

### Task 8: Add Conversations Page

**Files:**
- Create: `packages/dashboard/src/pages/conversations.tsx`
- Create: `packages/dashboard/src/components/conversations/conversation-list.tsx`
- Create: `packages/dashboard/src/components/conversations/conversation-thread.tsx`
- Create: `packages/dashboard/src/components/conversations/conversation-composer.tsx`
- Modify: `packages/dashboard/src/App.tsx`
- Modify: `packages/dashboard/src/components/layout/sidebar.tsx`
- Modify: `packages/dashboard/src/components/tasks/task-row.tsx`
- Test: `packages/dashboard/src/components/conversations/conversations.test.tsx`

- [ ] **Step 1: Write failing component tests**

Render the conversation page/components with mock store/API where practical. Cover:

- conversation list renders titles
- thread renders user and agent messages
- composer exposes agent picker and submit button

- [ ] **Step 2: Run component tests to verify failure**

Run: `npm run test --workspace=packages/dashboard -- conversations.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement page and components**

Use existing Orbital Console styling:

- `surface-panel`
- `surface-muted`
- `section-label`
- `ui-input`
- `ui-select`
- `ui-button-primary`

Keep copy plainspoken. The page should load or create a conversation if none exists.

- [ ] **Step 4: Add route and sidebar item**

Route:

```tsx
<Route path="/conversations" element={<ConversationsPage />} />
```

Sidebar item label: `Conversations`; description: `Shared agent context`.

- [ ] **Step 5: Show conversation linkage in task rows**

If `task.metadata.conversationId` exists, show a small `Conversation: <id prefix>` detail in the expanded task row.

- [ ] **Step 6: Run dashboard targeted tests**

Run: `npm run test --workspace=packages/dashboard -- conversations.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/src/lib/api.ts packages/dashboard/src/store/conversation-store.ts packages/dashboard/src/pages/conversations.tsx packages/dashboard/src/components/conversations packages/dashboard/src/App.tsx packages/dashboard/src/components/layout/sidebar.tsx packages/dashboard/src/components/tasks/task-row.tsx packages/dashboard/src/lib/conversations-api.test.ts packages/dashboard/src/store/conversation-store.test.ts packages/dashboard/src/components/conversations/conversations.test.tsx
git commit -m "feat(dashboard): add shared conversations"
```

---

## Chunk 5: Verification And Integration

### Task 9: Full Verification

**Files:**
- Potentially modify any files from earlier chunks if verification finds issues.

- [ ] **Step 1: Run relay tests**

Run: `npm run test --workspace=packages/relay`

Expected: PASS.

- [ ] **Step 2: Run OpenClaw adapter tests**

Run: `npm run test --workspace=packages/adapters/openclaw`

Expected: PASS.

- [ ] **Step 3: Run dashboard tests**

Run: `npm run test --workspace=packages/dashboard`

Expected: PASS.

- [ ] **Step 4: Run dashboard build**

Run: `npm run build --workspace=packages/dashboard`

Expected: PASS.

- [ ] **Step 5: Run root smoke or targeted full test if time allows**

Run: `npm run test:smoke`

Expected: PASS, or document if the smoke test is unrelated/unavailable.

- [ ] **Step 6: Manual API smoke**

With relay running:

```bash
curl -sS -X POST http://localhost:3100/api/conversations \
  -H 'Content-Type: application/json' \
  -d '{"title":"OpenClaw debugging"}'
```

Then dispatch a message to the returned conversation:

```bash
curl -sS -X POST http://localhost:3100/api/conversations/<id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"text":"say hello","agent":"openclaw","execute":true}'
```

Expected: response includes user message, linked task, and agent message or a translated agent error.

- [ ] **Step 7: Final commit if verification fixes were needed**

```bash
git status --short
git add <changed-files>
git commit -m "fix: stabilize conversation integration"
```

