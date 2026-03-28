# Telegram Bridge: Inbound Bug Triage Demo

## Summary

Extend the OpenClaw adapter to intercept inbound Telegram messages prefixed with `BUG:`, abort OpenClaw's auto-response, and trigger a multi-agent Bug Triage workflow. The workflow result is sent back to the customer via Telegram. This enables a recorded demo showing Lattice orchestrating a real customer bug report across Claude Code, Codex, and OpenClaw.

## Demo Flow

1. Customer sends Telegram message: "BUG: dashboard freezes when uploading CSV"
2. Lattice intercepts via OpenClaw gateway WebSocket subscription
3. Lattice aborts OpenClaw's auto-response (`chat.abort`)
4. Lattice sends ack to Telegram: "Bug received. Investigating across agents..."
5. Bug Triage workflow runs: Claude Code investigates → Codex reviews → OpenClaw composes reply
6. Final customer-facing reply sent back to Telegram
7. Dashboard shows the full workflow executing in real-time

## Architecture

```
Telegram User
    │
    ▼ (message)
OpenClaw Gateway (WebSocket)
    │
    ├── session.message event (role: "user", prefix: "BUG:")
    │
    ▼
OpenClaw Adapter (Lattice)
    │
    ├── 1. chat.abort(sessionKey)         ← kill auto-response
    ├── 2. chat.send(ack, deliver: true)  ← "Bug received..."
    ├── 3. callback(message) → relay
    │
    ▼
Relay (main.ts callback)
    │
    ├── workflowEngine.runWorkflow("bug-triage", { bugReport })
    │
    ▼
Workflow Engine (DAG executor)
    │
    ├── Step 1: Claude Code — investigate bug
    ├── Step 2: Codex — review investigation
    ├── Step 3: OpenClaw — compose customer reply
    │
    ▼
Relay (workflow:completed listener)
    │
    ├── Extract final artifact from step 3
    ├── adapter.sendMessage(sessionKey, reply, deliver: true)
    │
    ▼
Telegram User ← receives reply
```

## Component Design

### 1. OpenClaw Adapter Changes

File: `packages/adapters/openclaw/src/openclaw-adapter.ts`

#### New gateway client methods

- **`subscribeToSessions()`** — Sends `{ method: "sessions.subscribe", params: {} }` after successful connect. Called automatically on connection.

- **`abortSession(sessionKey: string)`** — Sends `{ method: "chat.abort", params: { sessionKey } }`. Returns the response payload.

- **`sendMessage(sessionKey, text, deliver)`** — Extends existing `chat.send` to support `deliver: true`, which pushes the message back through the originating channel (Telegram).

#### New adapter methods

- **`onInboundMessage(handler: InboundHandler)`** — Registers a callback for intercepted messages. Multiple handlers supported.

```typescript
type InboundHandler = (message: {
  text: string;           // bug description with "BUG:" prefix stripped
  sessionKey: string;     // for sending reply back
  sender: string;         // display name from Telegram metadata
  channel: string;        // "telegram", "discord", etc.
}) => void;
```

#### Inbound message processing

When a `session.message` event arrives:
1. Check `message.role === "user"`
2. Extract raw text from `message.content[0].text` (strip metadata preamble)
3. Check for `BUG:` prefix (case-insensitive)
4. If matched:
   - Call `chat.abort(sessionKey)` immediately
   - Send ack via `chat.send(sessionKey, "Bug received. Investigating across agents...", deliver: true)`
   - Strip prefix, call all registered `InboundHandler` callbacks

#### Text extraction from Telegram messages

Telegram messages arrive wrapped with metadata:
```
Conversation info (untrusted metadata):
```json
{"message_id": "328", "sender_id": "7098330193", ...}
```

Sender (untrusted metadata):
```json
{"label": "Basil Liu (7098330193)", ...}
```

<actual message text here>
```

The adapter must strip the metadata preamble and extract only the user's actual message text. Strategy: split on the last closing triple-backtick + newline sequence, take everything after it, and trim. If no metadata blocks are found, use the full text as-is.

### 2. Bug Triage Workflow Definition

File: `workflows/bug-triage.json`

Three-step workflow:

**Step 1: Investigate** (Claude Code)
- Agent: `claude-code`
- Template: `"Investigate this bug report and suggest a fix. Be concise — respond in 2-3 paragraphs max.\n\nBug report: {{bugReport}}"`
- Output: investigation text

**Step 2: Review** (Codex)
- Agent: `codex`
- Template: `"Review this bug investigation and proposed fix for correctness. Note any issues. Be concise — respond in 1-2 paragraphs.\n\nInvestigation:\n{{investigation}}"`
- Data mapping: Step 1 `artifacts[0].parts[0].text` → `investigation`
- Output: review text

**Step 3: Compose Reply** (OpenClaw)
- Agent: `openclaw`
- Template: `"Write a brief, friendly customer-facing message (3-4 sentences) summarizing what we found and the fix. Do not include technical details — keep it approachable.\n\nInvestigation: {{investigation}}\n\nReview: {{review}}"`
- Data mapping: Step 1 → `investigation`, Step 2 → `review`
- Output: customer-facing reply text

### 3. Relay Wiring

File: `packages/relay/src/main.ts`

After OpenClaw adapter registration and health check:

1. **Register inbound handler:**
   ```
   adapter.onInboundMessage((message) => {
     - Find the "bug-triage" workflow by name
     - Start a workflow run with context: { bugReport: message.text }
     - Stash { runId → sessionKey, sender } in a Map
     - Emit message:received event for dashboard
   })
   ```

2. **Listen for workflow completion:**
   ```
   eventBus.on("workflow:completed", (event) => {
     - Look up sessionKey from the runId → metadata map
     - Get the workflow run result, extract step 3's output artifact
     - Call adapter.sendMessage(sessionKey, replyText, true)
     - Emit message:sent event for dashboard
     - Clean up the map entry
   })
   ```

3. **Error handling:**
   ```
   eventBus.on("workflow:failed" or check run status, (event) => {
     - Send fallback message: "We hit an issue investigating your bug. Our team has been notified."
     - Clean up the map entry
   })
   ```

4. **In-memory map:** `Map<string, { sessionKey: string; sender: string }>` keyed by workflow run ID. Cleaned up on completion, failure, or 10-minute timeout.

### 4. Dashboard Integration

No dashboard code changes required. Existing functionality covers:

- Workflow runs visualized on Live Flow page
- Agent cards show activity as tasks route through them
- Task log shows progression

Two new events emitted for the activity log:
- `message:received` — when Telegram bug report is intercepted
- `message:sent` — when reply is sent back to Telegram

Both are existing SSE event types already handled by the dashboard.

## Configuration

New optional fields in `lattice.config.json` under `adapters.openclaw`:

```json
"openclaw": {
  "enabled": true,
  "gatewayUrl": "http://100.98.106.46:18789",
  "gatewayToken": "${OPENCLAW_GATEWAY_TOKEN}",
  "deviceToken": "${OPENCLAW_DEVICE_TOKEN}",
  "deviceIdentityPath": ".openclaw-device.json",
  "promptPrefix": "...",
  "bridge": {
    "enabled": true,
    "triggerPrefix": "BUG:",
    "ackMessage": "Bug received. Investigating across agents...",
    "workflowName": "Bug Triage Pipeline"
  }
}
```

All bridge fields are optional with sensible defaults. Setting `bridge.enabled: false` disables the listener entirely.

## Event Shapes (Verified from Live Capture)

### Inbound Telegram message

```json
{
  "type": "event",
  "event": "session.message",
  "payload": {
    "sessionKey": "agent:main:main",
    "message": {
      "role": "user",
      "content": [{ "type": "text", "text": "<metadata>\n\n<actual message>" }],
      "timestamp": 1774642280465
    },
    "session": {
      "origin": {
        "provider": "telegram",
        "surface": "telegram",
        "chatType": "direct",
        "label": "Basil Liu (@t3rt3rt) id:7098330193",
        "from": "telegram:7098330193"
      }
    }
  }
}
```

### chat.abort request

```json
{
  "type": "req",
  "id": "<uuid>",
  "method": "chat.abort",
  "params": { "sessionKey": "agent:main:main" }
}
```

### chat.send with delivery

```json
{
  "type": "req",
  "id": "<uuid>",
  "method": "chat.send",
  "params": {
    "sessionKey": "agent:main:main",
    "message": "<reply text>",
    "deliver": true
  }
}
```

## Files Changed

| File | Change |
|------|--------|
| `packages/adapters/openclaw/src/openclaw-adapter.ts` | Add session subscription, abort, deliver, inbound handler |
| `packages/relay/src/main.ts` | Register inbound handler, workflow trigger, reply sender |
| `workflows/bug-triage.json` | New workflow definition |

## Out of Scope

- Handling multiple concurrent bug reports (demo assumes one at a time)
- Discord message interception (same pattern, different channel filter)
- Persistent storage of Telegram conversation ↔ workflow mapping
- Retry logic for failed aborts or sends
- Dashboard changes
